/**
 * Optimization of plans and launch-window maps (porkchop data).
 */
import { type Plan, type PlanResult, evaluatePlan, centralMu, refNormal } from './plan';
import { nelderMead, differentialEvolution } from './optimize';
import type { SolarSystem } from './system';
import { BODIES } from './bodies';
import { lambert } from './lambert';
import { sub, norm, type Vec3 } from './vec';
import { DAY } from './time';
import { raDec } from './frames';

export type Objective = 'total' | 'afterLaunch' | 'c3' | 'arrival';

export interface PlanOptOptions {
  /** Which node times can change. Default: none. */
  freeTimes?: boolean[];
  /** If true, the parameters of each deep-space maneuver can change. Default: true. */
  freeDsm?: boolean;
  /** If false, the time of each deep-space maneuver stays as given. Default: true. */
  freeDsmTime?: boolean;
  objective?: Objective;
  /** Limits for each free node time (et). Used by the global search. */
  timeBounds?: [number, number][];
  /** Global search (differential evolution) before the local search. */
  global?: boolean;
  generations?: number;
  seed?: number;
  /** Maximum launch C3 (km^2/s^2); a higher value adds a penalty. */
  maxC3?: number;
  onProgress?: (fraction: number, best: number) => boolean | void;
}

export function planCost(r: PlanResult, objective: Objective, maxC3?: number): number {
  if (!r.ok) return 1e6;
  let c = objective === 'total' ? r.dvTotal : objective === 'afterLaunch' ? r.dvAfterLaunch : objective === 'c3' ? r.departure.vinf + r.dvFlybys + r.dvDsm : r.arrival.vinf + r.dvFlybys + r.dvDsm + r.departure.dv;
  if (maxC3 !== undefined && r.departure.c3 > maxC3) c += (Math.sqrt(r.departure.c3) - Math.sqrt(maxC3)) * 10;
  return isFinite(c) ? c : 1e6;
}

interface VarMap { get: (p: Plan) => number; set: (p: Plan, v: number) => void; step: number; lo: number; hi: number; periodic?: boolean }

function variables(plan: Plan, opt: PlanOptOptions): VarMap[] {
  const vars: VarMap[] = [];
  let bi = 0;
  plan.nodes.forEach((_, i) => {
    if (opt.freeTimes?.[i]) {
      const b = opt.timeBounds?.[bi++] ?? [plan.nodes[i].et - 400 * DAY, plan.nodes[i].et + 400 * DAY];
      vars.push({ get: (p) => p.nodes[i].et, set: (p, v) => { p.nodes[i].et = v; }, step: 5 * DAY, lo: b[0], hi: b[1] });
    }
  });
  if (opt.freeDsm !== false) {
    plan.legs.forEach((leg, i) => {
      if (!leg.dsm) return;
      if (opt.freeDsmTime !== false) vars.push({ get: (p) => p.legs[i].dsm!.eta, set: (p, v) => { p.legs[i].dsm!.eta = Math.min(0.98, Math.max(0.02, v)); }, step: 0.1, lo: 0.05, hi: 0.95 });
      if (i === 0) {
        vars.push({ get: (p) => p.legs[i].dsm!.vinf ?? 3, set: (p, v) => { p.legs[i].dsm!.vinf = Math.max(0.01, v); }, step: 0.5, lo: 0.5, hi: 12 });
        vars.push({ get: (p) => p.legs[i].dsm!.lon ?? 0, set: (p, v) => { p.legs[i].dsm!.lon = v; }, step: 0.3, lo: 0, hi: 2 * Math.PI, periodic: true });
        vars.push({ get: (p) => p.legs[i].dsm!.lat ?? 0, set: (p, v) => { p.legs[i].dsm!.lat = Math.max(-1.5, Math.min(1.5, v)); }, step: 0.1, lo: -0.6, hi: 0.6 });
      } else {
        const body = BODIES[plan.nodes[i].body];
        const minR = 1 + (plan.minFlybyAltitude[i] ?? body.minFlybyAltitude) / body.radius;
        vars.push({ get: (p) => p.legs[i].dsm!.rpRadii ?? 2, set: (p, v) => { p.legs[i].dsm!.rpRadii = Math.max(minR, v); }, step: 0.5, lo: minR, hi: minR + 30 });
        vars.push({ get: (p) => p.legs[i].dsm!.beta ?? 0, set: (p, v) => { p.legs[i].dsm!.beta = v; }, step: 0.4, lo: -Math.PI, hi: Math.PI, periodic: true });
      }
    });
  }
  return vars;
}

export function clonePlan(p: Plan): Plan {
  return JSON.parse(JSON.stringify(p)) as Plan;
}

/** Optimize the free parameters of a plan. Returns a new plan. */
export function optimizePlan(sys: SolarSystem, plan: Plan, opt: PlanOptOptions = {}): { plan: Plan; result: PlanResult; cost: number } {
  const work = clonePlan(plan);
  const vars = variables(work, opt);
  const objective = opt.objective ?? 'total';
  if (vars.length === 0) {
    const result = evaluatePlan(sys, work);
    return { plan: work, result, cost: planCost(result, objective, opt.maxC3) };
  }
  const f = (x: number[]): number => {
    vars.forEach((v, i) => v.set(work, x[i]));
    // times must increase
    for (let i = 1; i < work.nodes.length; i++) if (work.nodes[i].et <= work.nodes[i - 1].et + DAY) return 1e6 + (work.nodes[i - 1].et - work.nodes[i].et) / DAY;
    return planCost(evaluatePlan(sys, work), objective, opt.maxC3);
  };
  let x = vars.map((v) => v.get(work));
  let best = f(x);
  if (opt.global) {
    const gens = opt.generations ?? 300;
    const pop = Math.max(24, 12 * vars.length);
    const res = differentialEvolution(f, vars.map((v) => v.lo), vars.map((v) => v.hi), {
      population: pop, generations: gens, seed: opt.seed ?? 7,
      initial: [x],
      onProgress: (g, b) => opt.onProgress?.((g + 1) / (gens + 1), b),
    });
    if (res.f < best) { x = res.x; best = res.f; }
  } else if (vars.some((v) => v.periodic)) {
    // Multi-start for the angle variables of deep-space maneuvers.
    const starts: number[][] = [x];
    const idx = vars.map((v, i) => (v.periodic ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < 8; k++) for (const eta of [0.25, 0.5, 0.75]) {
      const s = x.slice();
      for (const i of idx) s[i] = vars[i].lo + ((vars[i].hi - vars[i].lo) * k) / 8;
      vars.forEach((v, i) => { if (v.step === 0.1 && v.lo === 0.05) s[i] = eta; });
      starts.push(s);
    }
    for (const s of starts) {
      const r = nelderMead(f, s, vars.map((v) => v.step), 600, 1e-12);
      if (r.f < best) { best = r.f; x = r.x; }
    }
  }
  for (let round = 0; round < 3; round++) {
    const r = nelderMead(f, x, vars.map((v) => v.step / (round + 1)), 1500, 1e-13);
    if (r.f < best) { best = r.f; x = r.x; }
  }
  f(x);
  const result = evaluatePlan(sys, work);
  return { plan: work, result, cost: best };
}

// ----------------------------------------------------------------------------------------------- porkchop

export interface PorkchopRequest {
  central: string;
  from: string;
  to: string;
  /** Departure time range and arrival time range, et. */
  dep: [number, number];
  arr: [number, number];
  nx: number;
  ny: number;
  parkingAltitude: number;
  arrival: Plan['arrival'];
  /** If true, each cell uses the transfer direction (short or long way) with the lower total velocity change. */
  bothDirections?: boolean;
}

export interface PorkchopData {
  request: PorkchopRequest;
  /** Row-major arrays, index = iy * nx + ix. NaN where no transfer exists (arrival before departure). */
  c3: Float32Array;
  vinfArr: Float32Array;
  dvDep: Float32Array;
  dvArr: Float32Array;
  dvTotal: Float32Array;
  tof: Float32Array;
  dla: Float32Array;
  /** Cell with the minimum total velocity change. */
  best: { ix: number; iy: number; dep: number; arr: number; dvTotal: number; c3: number; vinfArr: number } | null;
  bestC3: { ix: number; iy: number; dep: number; arr: number; c3: number } | null;
}

export function computePorkchop(sys: SolarSystem, q: PorkchopRequest): PorkchopData {
  const { nx, ny } = q;
  const N = nx * ny;
  const mu = centralMu(q.central);
  const out: PorkchopData = {
    request: q, c3: new Float32Array(N).fill(NaN), vinfArr: new Float32Array(N).fill(NaN), dvDep: new Float32Array(N).fill(NaN),
    dvArr: new Float32Array(N).fill(NaN), dvTotal: new Float32Array(N).fill(NaN), tof: new Float32Array(N).fill(NaN), dla: new Float32Array(N).fill(NaN),
    best: null, bestC3: null,
  };
  const bA = BODIES[q.from], bB = BODIES[q.to];
  const depStates = Array.from({ length: nx }, (_, i) => sys.stateRel(q.from, q.central, q.dep[0] + ((q.dep[1] - q.dep[0]) * i) / Math.max(1, nx - 1)));
  const arrStates = Array.from({ length: ny }, (_, j) => sys.stateRel(q.to, q.central, q.arr[0] + ((q.arr[1] - q.arr[0]) * j) / Math.max(1, ny - 1)));
  const rpark = bA.radius + q.parkingAltitude;
  const rpArr = bB.radius + q.arrival.periapsisAltitude;
  const aArr = (rpArr + Math.max(q.arrival.apoapsisRadius ?? rpArr, rpArr)) / 2;
  const ref = refNormal(q.central, q.dep[0]);
  for (let j = 0; j < ny; j++) {
    const tArr = q.arr[0] + ((q.arr[1] - q.arr[0]) * j) / Math.max(1, ny - 1);
    for (let i = 0; i < nx; i++) {
      const tDep = q.dep[0] + ((q.dep[1] - q.dep[0]) * i) / Math.max(1, nx - 1);
      const tof = tArr - tDep;
      if (tof < DAY) continue;
      let bestCell: { dv: number; c3: number; va: number; d1: number; d2: number; v0: Vec3 } | null = null;
      for (const retro of q.bothDirections ? [false, true] : [false]) {
        const s = lambert(mu, depStates[i].r, arrStates[j].r, tof, { retrograde: retro, refNormal: ref })[0];
        if (!s) continue;
        const v0 = sub(s.v1, depStates[i].v);
        const vi = norm(v0), va = norm(sub(s.v2, arrStates[j].v));
        const d1 = bA.gm > 0 ? Math.sqrt(vi * vi + (2 * bA.gm) / rpark) - Math.sqrt(bA.gm / rpark) : vi;
        let d2 = 0;
        if (q.arrival.type === 'rendezvous' || (q.arrival.type === 'orbit' && bB.gm <= 0)) d2 = va;
        else if (q.arrival.type === 'orbit') d2 = Math.sqrt(va * va + (2 * bB.gm) / rpArr) - Math.sqrt(bB.gm * (2 / rpArr - 1 / aArr));
        if (!isFinite(d1 + d2)) continue;
        if (!bestCell || d1 + d2 < bestCell.dv) bestCell = { dv: d1 + d2, c3: vi * vi, va, d1, d2, v0 };
      }
      if (!bestCell) continue;
      const k = j * nx + i;
      out.c3[k] = bestCell.c3; out.vinfArr[k] = bestCell.va; out.dvDep[k] = bestCell.d1; out.dvArr[k] = bestCell.d2;
      out.dvTotal[k] = bestCell.dv; out.tof[k] = tof; out.dla[k] = raDec(bestCell.v0).dec;
      if (!out.best || bestCell.dv < out.best.dvTotal) out.best = { ix: i, iy: j, dep: tDep, arr: tArr, dvTotal: bestCell.dv, c3: bestCell.c3, vinfArr: bestCell.va };
      if (!out.bestC3 || bestCell.c3 < out.bestC3.c3) out.bestC3 = { ix: i, iy: j, dep: tDep, arr: tArr, c3: bestCell.c3 };
    }
  }
  return out;
}

/** Approximate synodic period (s) of two bodies about the central body, from their current orbit periods. */
export function synodicPeriod(sys: SolarSystem, central: string, a: string, b: string, et: number): number {
  const mu = centralMu(central);
  const P = (id: string) => {
    const s = sys.stateRel(id, central, et);
    const r = norm(s.r), v2 = s.v[0] ** 2 + s.v[1] ** 2 + s.v[2] ** 2;
    const sma = 1 / (2 / r - v2 / mu);
    return 2 * Math.PI * Math.sqrt((sma * sma * sma) / mu);
  };
  const pa = P(a), pb = P(b);
  return Math.abs(1 / (1 / pa - 1 / pb));
}

/** Hohmann-like time of flight (s) between the current orbit radii of two bodies. */
export function hohmannTof(sys: SolarSystem, central: string, a: string, b: string, et: number): number {
  const mu = centralMu(central);
  const ra = norm(sys.stateRel(a, central, et).r), rb = norm(sys.stateRel(b, central, et).r);
  return Math.PI * Math.sqrt(((ra + rb) / 2) ** 3 / mu);
}
