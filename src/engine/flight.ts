/**
 * Flight model: a numerical trajectory with impulsive maneuvers, and the tools that make one from a plan.
 *
 *  departureState : start state on the escape hyperbola at the periapsis (parking orbit radius).
 *  newtonSolve    : differential corrector (finite-difference Jacobian, damped Newton steps).
 *  refinePlan     : converts a patched-conic plan to a continuous trajectory in the full force model.
 *                   Stage A targets the B-plane of each encounter from the plan.
 *                   Stage B makes each flyby ballistic: the correction after flyby i-1 is solved again so that the
 *                   path goes through flyby i to the aim point of encounter i+1. The remaining corrections are small.
 */
import { type State, type Vec3, add, sub, norm, unit, cross, dot, lincomb, scale } from './vec';
import { BODIES } from './bodies';
import type { SolarSystem } from './system';
import { Propagator, type ForceModel, type Maneuver, type Trajectory, type TrajectoryEvent, FULL_MODEL } from './propagate';
import { bPlane } from './flyby';
import { type Plan, type PlanResult } from './plan';
import { ECLIPTIC_POLE, poleVector } from './frames';
import { DAY } from './time';
import { nelderMead } from './optimize';

export interface Flight {
  et0: number;
  /** Start state relative to the SSB, ICRF. */
  state0: State;
  etEnd: number;
  maneuvers: Maneuver[];
  model: ForceModel;
}

/**
 * State at the periapsis of the escape hyperbola that has the outgoing v-infinity vector `vinf` (ICRF, km/s).
 * The orbit plane is the plane with the minimum inclination to the equator of the body that contains the asymptote.
 * Returns the state relative to the body.
 */
export function departureState(bodyId: string, et: number, vinf: Vec3, periapsisRadius: number): State {
  const b = BODIES[bodyId];
  const mu = b.gm;
  const v2 = dot(vinf, vinf);
  const S = unit(vinf);
  const pole = poleVector(b, et);
  let h = lincomb(pole, 1, S, -dot(pole, S));
  if (norm(h) < 1e-9) h = cross(S, [1, 0, 0]);
  h = unit(h);
  const e = 1 + (periapsisRadius * v2) / mu;
  const cosNu = -1 / e, sinNu = Math.sqrt(1 - cosNu * cosNu);
  const hxS = cross(h, S);
  const P = lincomb(S, cosNu, hxS, -sinNu);
  const Q = cross(h, P);
  const vp = Math.sqrt(v2 + (2 * mu) / periapsisRadius);
  return { r: scale(P, periapsisRadius), v: scale(Q, vp) };
}

export interface SolveResult { x: number[]; residual: number[]; norm: number; iterations: number; converged: boolean }

/**
 * Damped Newton method for a square (or over-determined) system f(x) = 0.
 * @param f      residual function; the values must be scaled to order 1 at the tolerance
 * @param x0     start values
 * @param dx     finite-difference steps
 * @param tol    convergence limit for the maximum absolute residual
 */
export function newtonSolve(f: (x: number[]) => number[] | null, x0: number[], dx: number[], tol = 1, maxIter = 25): SolveResult {
  let x = x0.slice();
  let r = f(x);
  if (!r) return { x, residual: [], norm: Infinity, iterations: 0, converged: false };
  const mx = (v: number[]) => v.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  let it = 0;
  for (; it < maxIter; it++) {
    if (mx(r) <= tol) break;
    const n = x.length, m = r.length;
    const J: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0));
    let fail = false;
    for (let j = 0; j < n; j++) {
      const xp = x.slice(); xp[j] += dx[j];
      const rp = f(xp);
      if (!rp) { fail = true; break; }
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - r[i]) / dx[j];
    }
    if (fail) break;
    // least-squares step: (J^T J + lambda I) s = -J^T r
    const step = solveNormal(J, r, 0);
    if (!step) break;
    let alpha = 1;
    let improved = false;
    const base = mx(r);
    for (let ls = 0; ls < 12; ls++) {
      const xn = x.map((v, j) => v + alpha * step[j]);
      const rn = f(xn);
      if (rn && mx(rn) < base) { x = xn; r = rn; improved = true; break; }
      alpha *= 0.4;
    }
    if (!improved) break;
  }
  return { x, residual: r, norm: mx(r), iterations: it, converged: mx(r) <= tol };
}

function solveNormal(J: number[][], r: number[], lambda: number): number[] | null {
  const m = J.length, n = J[0].length;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < m; k++) s += J[k][i] * J[k][j]; A[i][j] = s + (i === j ? lambda : 0); }
    let s = 0; for (let k = 0; k < m; k++) s += J[k][i] * r[k];
    A[i][n] = -s;
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let i = c + 1; i < n; i++) {
      const f = A[i][c] / A[c][c];
      for (let j = c; j <= n; j++) A[i][j] -= f * A[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

export interface EncounterReport {
  body: string;
  /** Planned time and actual periapsis time, et. */
  etPlanned: number;
  et: number;
  radius: number;
  altitude: number;
  vinf: number;
  BdotT: number;
  BdotR: number;
}

export interface RefineReport {
  converged: boolean;
  /** Magnitude of each maneuver of the flight, km/s. */
  corrections: { et: number; dv: number; kind: 'tcm' | 'dsm' | 'arrival' }[];
  /** Sum of the correction maneuvers (TCM), km/s. */
  totalCorrection: number;
  /** Sum of the deep-space maneuvers, km/s. */
  totalDsm: number;
  /** Arrival burn (orbit insertion or rendezvous), km/s. 0 for a flyby. */
  arrivalBurn: number;
  /** Change of the launch v-infinity vector relative to the plan, km/s. */
  launchChange: number;
  encounters: EncounterReport[];
  stages: { node: number; stage: 'A' | 'B' | 'C'; converged: boolean; iterations: number; residual: number }[];
}

export interface RefineOptions {
  model?: ForceModel;
  /**
   * Aim point (B.T, B.R in km) at the last encounter. Default: the periapsis altitude and the B-plane angle of the
   * plan arrival (the periapsis radius is then met exactly).
   */
  finalAim?: { BdotT: number; BdotR: number };
  /** Number of orbits to fly after an orbit insertion (default 2). */
  orbitsAfterArrival?: number;
  /** If false, only stage A is done. */
  ballistic?: boolean;
  /**
   * If true, the aim point of the flyby before each deep-space maneuver is optimized to make that maneuver small
   * (stage C, slower).
   */
  optimizeDsm?: boolean;
  onProgress?: (text: string) => void;
}

/** Pole that defines the B-plane axes T and R for encounters of a plan. */
function bPole(plan: Plan, et: number): Vec3 {
  return plan.central === 'SUN' ? ECLIPTIC_POLE : poleVector(BODIES[plan.central], et);
}

function relTo(sys: SolarSystem, body: string, et: number, s: State): State {
  const b = sys.state(body, et);
  return { r: sub(s.r, b.r), v: sub(s.v, b.v) };
}

interface Control {
  kind: 'launch' | 'tcm' | 'dsm';
  /** Time of the control maneuver. */
  et: number;
  /** Solved values: launch v-infinity vector, or the velocity change (ICRF, km/s). */
  x: number[];
  /** State immediately before the maneuver (not used for the launch). */
  base: { et: number; state: State } | null;
}

/**
 * Convert a plan to a flight in the numerical force model.
 * Control for each encounter: the launch v-infinity vector (first encounter), the deep-space maneuver of the leg
 * if the plan has one, or a correction maneuver a short time after the preceding flyby.
 */
export function refinePlan(sys: SolarSystem, plan: Plan, result: PlanResult, opt: RefineOptions = {}): { flight: Flight; report: RefineReport; trajectory: Trajectory } {
  const model = opt.model ?? FULL_MODEL;
  const prop = new Propagator(sys, model);
  const n = plan.nodes.length;
  const b0 = BODIES[plan.nodes[0].body];
  const rpark = b0.radius + plan.parkingAltitude;
  const et0 = plan.nodes[0].et;
  const stages: RefineReport['stages'] = [];

  // Aim points from the plan
  const aims: { BdotT: number; BdotR: number }[] = result.nodes.map((nd, i) => {
    if (i === 0) return { BdotT: 0, BdotR: 0 };
    if (i === n - 1) {
      if (opt.finalAim) return opt.finalAim;
      const body = BODIES[nd.body];
      const rp = body.radius + plan.arrival.periapsisAltitude;
      const vinf = result.arrival.vinf;
      // A body with no mass does not bend the path: the miss distance is the periapsis radius (0 for a rendezvous).
      const b = body.gm > 0 ? rp * Math.sqrt(1 + (2 * body.gm) / (rp * vinf * vinf)) : plan.arrival.type === 'flyby' ? rp : 0;
      const th = plan.arrival.bAngle ?? 0;
      return { BdotT: b * Math.cos(th), BdotR: b * Math.sin(th) };
    }
    if (BODIES[nd.body].gm <= 0) return { BdotT: BODIES[nd.body].radius + Math.max(plan.minFlybyAltitude[i] ?? 0, 100), BdotR: 0 };
    return { BdotT: nd.flyby?.BdotT ?? 0, BdotR: nd.flyby?.BdotR ?? 0 };
  });

  /** Residuals at encounter i from a state propagated to the planned time. */
  const encounterResidual = (s: State, i: number): { bt: number; br: number; ttp: number } | null => {
    const nd = plan.nodes[i];
    const body = BODIES[nd.body];
    const rel = relTo(sys, nd.body, nd.et, s);
    if (body.gm <= 0) {
      // small body: aim at the centre; use the position miss in the plane normal to the relative velocity
      const S = unit(rel.v);
      const T = unit(cross(S, bPole(plan, nd.et)));
      const R = cross(S, T);
      return { bt: dot(rel.r, T), br: dot(rel.r, R), ttp: -dot(rel.r, S) / norm(rel.v) };
    }
    const bp = bPlane(rel, body.gm, bPole(plan, nd.et));
    if (!bp) return null;
    return { bt: bp.BdotT, br: bp.BdotR, ttp: bp.timeToPeriapsis };
  };

  const startState = (v: number[]): State => {
    const e = sys.state(plan.nodes[0].body, et0);
    if (b0.gm <= 0) return { r: e.r, v: add(e.v, v as Vec3) };
    const d = departureState(plan.nodes[0].body, et0, v as Vec3, rpark);
    return { r: add(e.r, d.r), v: add(e.v, d.v) };
  };
  const coast = (from: { et: number; state: State }, to: number, stops?: number[]): Trajectory =>
    prop.propagate({ et0: from.et, state0: from.state, etEnd: to, model, noEvents: true, stops });

  // ---- controls: index i is the control that targets encounter i (i = 1 .. n-1). Index 0 is the launch.
  const launchVinf = result.departure.vinfVec.slice() as number[];
  const ctl: Control[] = [];
  for (let i = 1; i < n; i++) {
    const leg = result.legs[i - 1];
    const tPrev = plan.nodes[i - 1].et, tEnc = plan.nodes[i].et;
    if (leg.dsm) ctl[i] = { kind: 'dsm', et: leg.dsm.et, x: leg.dsm.dv.slice(), base: null };
    else if (i === 1) ctl[i] = { kind: 'launch', et: et0, x: launchVinf.slice(), base: null };
    else ctl[i] = { kind: 'tcm', et: tPrev + Math.min(30 * DAY, Math.max(2 * DAY, 0.04 * (tEnc - tPrev))), x: [0, 0, 0], base: null };
  }
  /** State immediately after control i with the values x. */
  const after = (i: number, x: number[]): { et: number; state: State } => {
    const c = ctl[i];
    if (c.kind === 'launch') return { et: et0, state: startState(x) };
    const b = c.base!;
    return { et: b.et, state: { r: b.state.r, v: add(b.state.v, x as Vec3) } };
  };
  /** Compute the state before control i from the solved control i-1 (or from the launch). */
  const setBase = (i: number): void => {
    const c = ctl[i];
    if (c.kind === 'launch') return;
    const from = i === 1 ? { et: et0, state: startState(launchVinf) } : after(i - 1, ctl[i - 1].x);
    c.base = { et: c.et, state: coast(from, c.et).stateAt(c.et) };
  };
  const scaleOf = (i: number) => Math.max(BODIES[plan.nodes[i].body].radius, 100) * 1e-6; // residual unit: 1e-6 body radius
  const dx = [1e-7, 1e-7, 1e-7];
  /** Stage A: solve control i for the aim point and the periapsis time of encounter i. */
  const solveA = (i: number, aim: { BdotT: number; BdotR: number }, x0: number[]): SolveResult => {
    const tEnc = plan.nodes[i].et;
    const sc = scaleOf(i);
    return newtonSolve((x) => {
      const e1 = encounterResidual(coast(after(i, x), tEnc).stateAt(tEnc), i);
      return e1 ? [(e1.bt - aim.BdotT) / sc, (e1.br - aim.BdotR) / sc, e1.ttp / 0.01] : null;
    }, x0, dx, 1, 30);
  };
  /** Miss at encounter i+1 (km) after a ballistic pass of encounter i with control values x. */
  const missNext = (i: number, x: number[]): number[] | null => {
    const tNext = plan.nodes[i + 1].et;
    const e2 = encounterResidual(coast(after(i, x), tNext, [plan.nodes[i].et]).stateAt(tNext), i + 1);
    return e2 ? [e2.bt - aims[i + 1].BdotT, e2.br - aims[i + 1].BdotR] : null;
  };

  /**
   * Stage B at encounter i: move the aim point of encounter i until the path after the flyby reaches the aim point
   * of encounter i+1 with no maneuver. Each trial solves stage A again. Updates aims[i] and ctl[i].x.
   */
  const stageB = (i: number): SolveResult | null => {
    const nextHasDsm = i + 1 < n && !!result.legs[i].dsm;
    if (!(i + 1 < n) || nextHasDsm || opt.ballistic === false || BODIES[plan.nodes[i].body].gm <= 0) return null;
    const sc2 = Math.max(BODIES[plan.nodes[i + 1].body].radius, 100) * 1e-3;
    let innerX = ctl[i].x;
    const outer = (a: number[]): number[] | null => {
      const s1 = solveA(i, { BdotT: a[0], BdotR: a[1] }, innerX);
      if (!s1.converged) return null;
      innerX = s1.x;
      const m = missNext(i, s1.x);
      return m ? [m[0] / sc2, m[1] / sc2] : null;
    };
    const bmag = Math.hypot(aims[i].BdotT, aims[i].BdotR);
    const solB = newtonSolve(outer, [aims[i].BdotT, aims[i].BdotR], [bmag * 1e-4 + 1, bmag * 1e-4 + 1], 1, 40);
    if (solB.converged) {
      aims[i] = { BdotT: solB.x[0], BdotR: solB.x[1] };
      const s1 = solveA(i, aims[i], innerX);
      if (s1.converged) ctl[i].x = s1.x;
    }
    return solB;
  };

  /**
   * Last encounter with a periapsis altitude from the plan: the B magnitude of the aim point is corrected with the
   * speed at infinity of the numerical trajectory, so that the periapsis radius is the planned value.
   */
  const solveFinal = (x0: number[]): SolveResult => {
    const i = n - 1;
    const body = BODIES[plan.nodes[i].body];
    const rpT = body.radius + plan.arrival.periapsisAltitude;
    const th = plan.arrival.bAngle ?? 0;
    const tEnc = plan.nodes[i].et;
    const sc = scaleOf(i);
    return newtonSolve((x) => {
      const rel = relTo(sys, plan.nodes[i].body, tEnc, coast(after(i, x), tEnc).stateAt(tEnc));
      const bp = bPlane(rel, body.gm, bPole(plan, tEnc));
      if (!bp) return null;
      return [(bp.rp - rpT) / sc, (bp.BdotR * Math.cos(th) - bp.BdotT * Math.sin(th)) / sc, bp.timeToPeriapsis / 0.01];
    }, x0, dx, 1, 30);
  };

  for (let i = 1; i < n; i++) {
    const name = plan.nodes[i].body;
    setBase(i);
    opt.onProgress?.(`${name}: A`);
    let sol = solveA(i, aims[i], ctl[i].x);
    if (sol.converged && i === n - 1 && !opt.finalAim && BODIES[name].gm > 0) {
      const fin = solveFinal(sol.x);
      if (fin.converged) sol = { ...fin, iterations: sol.iterations + fin.iterations };
    }
    stages.push({ node: i, stage: 'A', converged: sol.converged, iterations: sol.iterations, residual: sol.norm });
    if (sol.converged) ctl[i].x = sol.x;

    // Stage C: for a leg with a deep-space maneuver, move the aim point of the preceding flyby. The cost is the
    // maneuver plus the correction that the next leg needs (the flyby i is made ballistic for each trial).
    if (opt.optimizeDsm && ctl[i].kind === 'dsm' && i >= 2 && sol.converged && BODIES[plan.nodes[i - 1].body].gm > 0) {
      opt.onProgress?.(`${name}: C`);
      const save = { prevX: ctl[i - 1].x.slice(), x: ctl[i].x.slice(), prevAim: { ...aims[i - 1] }, aim: { ...aims[i] }, nextX: ctl[i + 1]?.x.slice() };
      const body = BODIES[plan.nodes[i - 1].body];
      const bMin = bMagnitude(body.gm, body.radius + (plan.minFlybyAltitude[i - 1] ?? body.minFlybyAltitude), result.nodes[i - 1].flyby?.vinfIn ?? 5);
      const lookAhead = i + 1 < n && ctl[i + 1].kind === 'tcm';
      const chain = (a: number[]): number => {
        const s1 = solveA(i - 1, { BdotT: a[0], BdotR: a[1] }, ctl[i - 1].x);
        if (!s1.converged) return 1e3;
        ctl[i - 1].x = s1.x;
        setBase(i);
        const s2 = solveA(i, aims[i], ctl[i].x);
        if (!s2.converged) return 1e3;
        ctl[i].x = s2.x;
        let c = Math.hypot(ctl[i].x[0], ctl[i].x[1], ctl[i].x[2]);
        if (lookAhead) {
          const sb = stageB(i);
          if (sb && !sb.converged) return 1e3;
          c = Math.hypot(ctl[i].x[0], ctl[i].x[1], ctl[i].x[2]);
          setBase(i + 1);
          const s3 = solveA(i + 1, aims[i + 1], ctl[i + 1].x);
          if (!s3.converged) return 1e3;
          ctl[i + 1].x = s3.x;
          c += Math.hypot(s3.x[0], s3.x[1], s3.x[2]);
        }
        const b = Math.hypot(a[0], a[1]);
        return c + (b < bMin ? ((bMin - b) / bMin) * 10 : 0);
      };
      const restore = () => {
        ctl[i - 1].x = save.prevX.slice(); ctl[i].x = save.x.slice(); aims[i - 1] = { ...save.prevAim }; aims[i] = { ...save.aim };
        if (save.nextX) ctl[i + 1].x = save.nextX.slice();
      };
      const cost = (a: number[]): number => {
        const c = chain(a);
        if (c >= 1e3) { restore(); }
        return c;
      };
      const start = cost([save.prevAim.BdotT, save.prevAim.BdotR]);
      const bm = Math.hypot(save.prevAim.BdotT, save.prevAim.BdotR);
      const best = nelderMead(cost, [save.prevAim.BdotT, save.prevAim.BdotR], [0.02 * bm, 0.02 * bm], 150, 1e-6);
      const fin = cost(best.x);
      const ok = fin < 1e3 && fin <= start;
      if (ok) aims[i - 1] = { BdotT: best.x[0], BdotR: best.x[1] };
      else { restore(); cost([save.prevAim.BdotT, save.prevAim.BdotR]); }
      setBase(i);
      stages.push({ node: i, stage: 'C', converged: ok, iterations: best.iterations, residual: fin });
    }

    if (ctl[i].kind !== 'launch' || sol.converged) {
      opt.onProgress?.(`${name}: B`);
      const solB = sol.converged ? stageB(i) : null;
      if (solB) stages.push({ node: i, stage: 'B', converged: solB.converged, iterations: solB.iterations, residual: solB.norm });
    }
    if (ctl[1].kind === 'launch') { launchVinf[0] = ctl[1].x[0]; launchVinf[1] = ctl[1].x[1]; launchVinf[2] = ctl[1].x[2]; }
  }

  // ---- final trajectory with events
  const maneuvers: Maneuver[] = [];
  for (let i = 1; i < n; i++) {
    const c = ctl[i];
    if (c.kind === 'launch') continue;
    maneuvers.push({ id: (c.kind === 'dsm' ? 'dsm' : 'tcm') + i, et: c.et, dv: [c.x[0], c.x[1], c.x[2]], frame: 'ICRF', refBody: 'SUN', label: c.kind === 'dsm' ? 'DSM' : 'TCM' });
  }
  const watch = plan.nodes.map((nd) => nd.body);
  const last = plan.nodes[n - 1];
  const lastBody = BODIES[last.body];
  let etEnd = last.et + 5 * DAY;
  const flight: Flight = { et0, state0: startState(launchVinf), etEnd, maneuvers, model };
  let arrivalRel: State | null = null;
  if (plan.arrival.type !== 'flyby') {
    // Arrival burn at the planned arrival time (periapsis of the approach hyperbola, or the position of the small body).
    const arr = prop.propagate({ et0, state0: flight.state0, etEnd: last.et, maneuvers, model, noEvents: true }).stateAt(last.et);
    const rel = relTo(sys, last.body, last.et, arr);
    arrivalRel = rel;
    if (plan.arrival.type === 'orbit' && lastBody.gm > 0) {
      const rp = norm(rel.r);
      const ra = Math.max(plan.arrival.apoapsisRadius ?? rp, rp);
      const a = (rp + ra) / 2;
      const vTarget = Math.sqrt(lastBody.gm * (2 / rp - 1 / a));
      maneuvers.push({ id: 'arrival', et: last.et, dv: [vTarget - norm(rel.v), 0, 0], frame: 'VNB', refBody: last.body, label: 'ARRIVAL' });
      const period = 2 * Math.PI * Math.sqrt((a * a * a) / lastBody.gm);
      etEnd = last.et + Math.min((opt.orbitsAfterArrival ?? 2) * period, 120 * DAY);
    } else {
      maneuvers.push({ id: 'arrival', et: last.et, dv: [-rel.v[0], -rel.v[1], -rel.v[2]], frame: 'ICRF', refBody: last.body, label: 'ARRIVAL' });
      etEnd = last.et + 30 * DAY;
    }
    flight.etEnd = etEnd;
  }
  const trajectory = prop.propagate({ et0, state0: flight.state0, etEnd, maneuvers: flight.maneuvers, model, watch });
  const encounters: EncounterReport[] = [];
  for (let i = 1; i < n; i++) {
    const nd = plan.nodes[i];
    const body = BODIES[nd.body];
    // With an arrival burn, the report of the last encounter uses the state immediately before the burn.
    const ev = i === n - 1 && arrivalRel ? null : nearestPeriapsis(trajectory.events, nd.body, nd.et);
    const et = ev ? ev.et : nd.et;
    const rel = i === n - 1 && arrivalRel ? arrivalRel : relTo(sys, nd.body, et, ev ? ev.state : trajectory.stateAt(et));
    const bp = body.gm > 0 ? bPlane(rel, body.gm, bPole(plan, et)) : null;
    encounters.push({ body: nd.body, etPlanned: nd.et, et, radius: norm(rel.r), altitude: norm(rel.r) - body.radius, vinf: bp?.vinf ?? norm(rel.v), BdotT: bp?.BdotT ?? 0, BdotR: bp?.BdotR ?? 0 });
  }
  const corrections = maneuvers.map((m) => ({ et: m.et, dv: norm(m.dv), kind: m.label === 'DSM' ? ('dsm' as const) : m.label === 'ARRIVAL' ? ('arrival' as const) : ('tcm' as const) }));
  const report: RefineReport = {
    converged: stages.filter((s) => s.stage === 'A').every((s) => s.converged),
    corrections,
    totalCorrection: corrections.filter((c) => c.kind === 'tcm').reduce((a, c) => a + c.dv, 0),
    totalDsm: corrections.filter((c) => c.kind === 'dsm').reduce((a, c) => a + c.dv, 0),
    arrivalBurn: corrections.filter((c) => c.kind === 'arrival').reduce((a, c) => a + c.dv, 0),
    launchChange: norm(sub(launchVinf as Vec3, result.departure.vinfVec)),
    encounters,
    stages,
  };
  return { flight, report, trajectory };
}

function bMagnitude(mu: number, rp: number, vinf: number): number {
  return rp * Math.sqrt(1 + (2 * mu) / (rp * vinf * vinf));
}

function nearestPeriapsis(events: TrajectoryEvent[], body: string, et: number): TrajectoryEvent | null {
  let best: TrajectoryEvent | null = null;
  for (const e of events) {
    if ((e.type === 'periapsis' || e.type === 'impact') && e.body === body && (!best || Math.abs(e.et - et) < Math.abs(best.et - et))) best = e;
  }
  return best && Math.abs(best.et - et) < 20 * DAY ? best : null;
}

/** Propagate a flight and return the trajectory. */
export function flyFlight(sys: SolarSystem, f: Flight, stops?: number[], watch?: string[]): Trajectory {
  return new Propagator(sys, f.model).propagate({ et0: f.et0, state0: f.state0, etEnd: f.etEnd, maneuvers: f.maneuvers, model: f.model, stops, watch });
}
