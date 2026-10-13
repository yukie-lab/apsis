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
import { Propagator, type ForceModel, type Maneuver, type Trajectory, type TrajectoryEvent, FULL_MODEL, soiRadius } from './propagate';
import { bPlane, stateFromBPlane } from './flyby';
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

/** Diagnostic output of the solvers (null = off). Used by the engine tests and for the analysis of a problem. */
export const solverTrace: { log: ((text: string) => void) | null } = { log: null };

export interface SolveResult { x: number[]; residual: number[]; norm: number; iterations: number; converged: boolean }

/**
 * Damped Newton method for a square (or over-determined) system f(x) = 0.
 * @param f      residual function; the values must be scaled to order 1 at the tolerance
 * @param x0     start values
 * @param dx     finite-difference steps
 * @param tol    convergence limit for the maximum absolute residual
 * @param stallFactor  if the iteration cannot decrease the residual more (numerical noise of the function), the
 *                     result is also accepted when the residual is below stallFactor * tol
 */
export function newtonSolve(f0: (x: number[]) => number[] | null, x0: number[], dx: number[], tol = 1, maxIter = 25, stallFactor = 1): SolveResult {
  // A residual that is not finite is a failed evaluation.
  const f = (v: number[]): number[] | null => {
    const r = f0(v);
    return r && r.every(Number.isFinite) ? r : null;
  };
  let x = x0.slice();
  let r = f(x);
  if (!r) return { x, residual: [], norm: Infinity, iterations: 0, converged: false };
  const mx = (v: number[]) => v.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
  let it = 0;
  for (; it < maxIter; it++) {
    if (mx(r) <= tol) break;
    solverTrace.log?.(`newton ${it}: |r| ${mx(r).toExponential(3)} r [${r.map((v) => v.toExponential(2)).join(' ')}]`);
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
    // least-squares step: (J^T J) s = -J^T r. More unknowns than equations: the step with the minimum norm.
    const step = n > m ? solveMinNorm(J, r) : solveNormal(J, r, 0);
    if (!step) break;
    // Line search on the sum of squares (the Newton step is a descent direction for this function).
    let alpha = 1;
    let improved = false;
    const ss = (v: number[]) => v.reduce((a, b) => a + b * b, 0);
    const base = ss(r);
    for (let ls = 0; ls < 12; ls++) {
      const xn = x.map((v, j) => v + alpha * step[j]);
      const rn = f(xn);
      if (rn && ss(rn) < base) { x = xn; r = rn; improved = true; break; }
      alpha *= 0.4;
    }
    solverTrace.log?.(`   step [${step.map((v) => v.toExponential(2)).join(' ')}] alpha ${alpha.toExponential(2)}`);
    if (!improved) { solverTrace.log?.(`newton ${it}: no better point on the step [${step.map((v) => v.toExponential(2)).join(' ')}]`); break; }
  }
  return { x, residual: r, norm: mx(r), iterations: it, converged: mx(r) <= tol * (it < maxIter ? stallFactor : 1) };
}

/** Step s with the minimum norm that satisfies J s = -r (J has more columns than rows). */
function solveMinNorm(J: number[][], r: number[]): number[] | null {
  const m = J.length, n = J[0].length;
  // (J J^T) y = -r, s = J^T y. solveNormal solves (K^T K) y = -K^T q: use K = J^T and K^T q = r.
  const A: number[][] = Array.from({ length: m }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) { let acc = 0; for (let k = 0; k < n; k++) acc += J[i][k] * J[j][k]; A[i][j] = acc; }
    A[i][m] = -r[i];
  }
  const y = gauss(A);
  if (!y) return null;
  const sOut = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) for (let i = 0; i < m; i++) sOut[k] += J[i][k] * y[i];
  return sOut;
}

/** Gauss elimination with partial pivoting of the augmented matrix A (n rows, n + 1 columns). */
function gauss(A: number[][]): number[] | null {
  const n = A.length;
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
    let acc = A[i][n];
    for (let j = i + 1; j < n; j++) acc -= A[i][j] * x[j];
    x[i] = acc / A[i][i];
  }
  return x;
}

function solveNormal(J: number[][], r: number[], lambda: number): number[] | null {
  const m = J.length, n = J[0].length;
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < m; k++) s += J[k][i] * J[k][j]; A[i][j] = s + (i === j ? lambda : 0); }
    let s = 0; for (let k = 0; k < m; k++) s += J[k][i] * r[k];
    A[i][n] = -s;
  }
  return gauss(A);
}

/**
 * Step s that makes |rho + Jr s| a minimum with the linear constraints c + Jc s = 0 (one step of a Gauss-Newton
 * method with equality constraints). The columns are scaled, then the system
 *   [ Jr^T Jr  Jc^T ] [ s      ]   [ -Jr^T rho ]
 *   [ Jc       0    ] [ lambda ] = [ -c        ]
 * is solved.
 */
function constrainedStep(Jr: number[][], rho: number[], Jc: number[][], c: number[]): number[] | null {
  const n = Jr[0].length, m = Jc.length, p = Jr.length;
  const d = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j++) {
    let big = 0;
    for (let k = 0; k < p; k++) big = Math.max(big, Math.abs(Jr[k][j]));
    for (let k = 0; k < m; k++) big = Math.max(big, Math.abs(Jc[k][j]));
    if (!(big > 0) || !Number.isFinite(big)) return null;
    d[j] = 1 / big;
  }
  const N = n + m;
  const K: number[][] = Array.from({ length: N }, () => new Array<number>(N + 1).fill(0));
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) { let acc = 0; for (let k = 0; k < p; k++) acc += Jr[k][a] * Jr[k][b]; K[a][b] = acc * d[a] * d[b]; }
    for (let k = 0; k < m; k++) { K[a][n + k] = Jc[k][a] * d[a]; K[n + k][a] = Jc[k][a] * d[a]; }
    let acc = 0; for (let k = 0; k < p; k++) acc += Jr[k][a] * rho[k];
    K[a][N] = -acc * d[a];
  }
  for (let k = 0; k < m; k++) K[n + k][N] = -c[k];
  const sol = gauss(K);
  if (!sol || !sol.every(Number.isFinite)) return null;
  return sol.slice(0, n).map((v, j) => v * d[j]);
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
  /** Not null if the final trajectory stopped for a numerical reason (see Trajectory.failure). */
  failure: Trajectory['failure'];
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
  // GM of the body of node i in the force model. 0 for a body that is not a gravity body of the model (most small
  // bodies), or that has no data at the node time: the path near such a body is a straight line.
  const modelIds = new Set(prop.bodyIds);
  const gms = plan.nodes.map((nd) => {
    const cov = sys.coverage(nd.body);
    return modelIds.has(nd.body) && nd.et >= cov[0] && nd.et <= cov[1] ? BODIES[nd.body].gm : 0;
  });

  // Aim points from the plan
  const aims: { BdotT: number; BdotR: number }[] = result.nodes.map((nd, i) => {
    if (i === 0) return { BdotT: 0, BdotR: 0 };
    if (i === n - 1) {
      if (opt.finalAim) return opt.finalAim;
      const body = BODIES[nd.body];
      const rp = body.radius + plan.arrival.periapsisAltitude;
      const vinf = result.arrival.vinf;
      // A body with no mass does not bend the path: the miss distance is the periapsis radius.
      // The stop point of a rendezvous is at the same distance (not at the centre: that is below the surface).
      const b = gms[i] > 0 ? rp * Math.sqrt(1 + (2 * gms[i]) / (rp * vinf * vinf)) : Math.max(rp, 1.1 * body.radius, body.radius + 1);
      const th = plan.arrival.bAngle ?? 0;
      return { BdotT: b * Math.cos(th), BdotR: b * Math.sin(th) };
    }
    if (gms[i] <= 0) return { BdotT: BODIES[nd.body].radius + Math.max(plan.minFlybyAltitude[i] ?? 0, 100), BdotR: 0 };
    return { BdotT: nd.flyby?.BdotT ?? 0, BdotR: nd.flyby?.BdotR ?? 0 };
  });

  /** B-plane values at encounter i from a state at time et (default: the planned encounter time). */
  const encounterResidual = (s: State, i: number, et = plan.nodes[i].et): { bt: number; br: number; ttp: number } | null => {
    const nd = plan.nodes[i];
    const rel = relTo(sys, nd.body, et, s);
    if (gms[i] <= 0) {
      // small body: aim at the centre; use the position miss in the plane normal to the relative velocity
      const S = unit(rel.v);
      const T = unit(cross(S, bPole(plan, et)));
      const R = cross(S, T);
      return { bt: dot(rel.r, T), br: dot(rel.r, R), ttp: -dot(rel.r, S) / norm(rel.v) };
    }
    const bp = bPlane(rel, gms[i], bPole(plan, et));
    if (!bp) return null;
    return { bt: bp.BdotT, br: bp.BdotR, ttp: bp.timeToPeriapsis };
  };

  const startState = (v: number[]): State => {
    const e = sys.state(plan.nodes[0].body, et0);
    if (gms[0] <= 0) return { r: e.r, v: add(e.v, v as Vec3) };
    const d = departureState(plan.nodes[0].body, et0, v as Vec3, rpark);
    return { r: add(e.r, d.r), v: add(e.v, d.v) };
  };
  const coast = (from: { et: number; state: State }, to: number, stops?: number[]): Trajectory =>
    prop.propagate({ et0: from.et, state0: from.state, etEnd: to, model, noEvents: true, stops });
  /** State at the end of a coast. null if the propagation stopped (the path went through the centre of a body). */
  const coastState = (from: { et: number; state: State }, to: number, stops?: number[]): State | null => {
    const tr = coast(from, to, stops);
    return tr.failure ? null : tr.stateAt(to);
  };

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
  // Residual units: 1e-6 body radius but not less than 20 m (B-plane), and 0.05 s (periapsis time). The numerical
  // noise of a propagation of some years is of this order, so a solution inside 20 units is accepted when the
  // iteration cannot improve it (aim point inside 0.4 km or 2e-5 radius, time inside 1 s).
  const scaleOf = (i: number) => Math.max(BODIES[plan.nodes[i].body].radius * 1e-6, 0.02);
  const T_UNIT = 0.05, STALL = 20;
  const dx = [1e-7, 1e-7, 1e-7];
  /** Speed at infinity of the plan at encounter i, km/s. */
  const vinfOf = (i: number): number => Math.max(i === n - 1 ? result.arrival.vinf : result.nodes[i].flyby?.vinfIn ?? result.arrival.vinf, 0.5);
  /**
   * Time before encounter i at which the approach is examined first: the spacecraft is then near the limit of the
   * sphere of influence. The first estimate of a leg aims at the centre of the body and comes there early, and a
   * path through the centre cannot be propagated. At this time the spacecraft is before the body for all paths.
   */
  const leadOf = (i: number): number => {
    const nd = plan.nodes[i];
    if (gms[i] <= 0) return 0;
    return Math.min(soiRadius(sys, nd.body, nd.et) / vinfOf(i), 0.5 * (nd.et - ctl[i].et));
  };
  /**
   * Time before encounter i at which the aim point is measured: the time of flight from the distance D to the
   * periapsis on the two-body hyperbola of the aim point. D = 30 body radii (not more than 0.3 of the sphere of
   * influence, not less than 2 periapsis radii). The osculating hyperbola at this distance is the approach
   * asymptote: the oblateness of the body has no effect there, and the residual is an almost linear function.
   */
  const aimLead = (i: number, aim: { BdotT: number; BdotR: number }): number => {
    const nd = plan.nodes[i];
    const body = BODIES[nd.body];
    if (gms[i] <= 0) return 0;
    const v = vinfOf(i);
    const a = gms[i] / (v * v);
    const e = Math.sqrt(1 + (aim.BdotT * aim.BdotT + aim.BdotR * aim.BdotR) / (a * a));
    const rp = a * (e - 1);
    const D = Math.max(Math.min(30 * body.radius, 0.3 * soiRadius(sys, nd.body, nd.et)), 2 * rp);
    const F = Math.acosh(Math.max(1, (1 + D / a) / e));
    const tau = (e * Math.sinh(F) - F) / Math.sqrt(gms[i] / (a * a * a));
    return Math.min(tau, 0.5 * (nd.et - ctl[i].et));
  };
  /**
   * Stage A: solve control i for the aim point and the periapsis time of encounter i.
   * @param first  true for the first solution of a leg: the control is first solved with the state at the limit of
   *               the sphere of influence (accuracy 0.01 body radius, 60 s).
   */
  const solveA = (i: number, aim: { BdotT: number; BdotR: number }, x0: number[], first = false): SolveResult => {
    const tEnc = plan.nodes[i].et;
    const sc = scaleOf(i);
    let x = x0;
    const lead = first ? leadOf(i) : 0;
    if (lead > 0) {
      const scA = BODIES[plan.nodes[i].body].radius * 1e-2;
      const s0 = newtonSolve((xx) => {
        const s = coastState(after(i, xx), tEnc - lead);
        const e1 = s && encounterResidual(s, i, tEnc - lead);
        return e1 ? [(e1.bt - aim.BdotT) / scA, (e1.br - aim.BdotR) / scA, (e1.ttp - lead) / 60] : null;
      }, x0, dx, 1, 30, STALL);
      if (s0.residual.length > 0) x = s0.x;
    }
    const tau = aimLead(i, aim);
    return newtonSolve((xx) => {
      const s = coastState(after(i, xx), tEnc - tau);
      const e1 = s && encounterResidual(s, i, tEnc - tau);
      return e1 ? [(e1.bt - aim.BdotT) / sc, (e1.br - aim.BdotR) / sc, (e1.ttp - tau) / T_UNIT] : null;
    }, x, dx, 1, 30, STALL);
  };
  /**
   * State (relative to the SSB) on the approach hyperbola of body j, at the time tau before the periapsis.
   * The hyperbola has the aim point `aim`, the incoming v-infinity vector w (ICRF) and the periapsis time tPeri.
   */
  const approachState = (j: number, aim: { BdotT: number; BdotR: number }, w: number[], tPeri: number, tau: number): { et: number; state: State } => {
    const nd = plan.nodes[j];
    const mu = gms[j];
    const et = tPeri - tau;
    const vinf = Math.hypot(w[0], w[1], w[2]);
    const S = unit(w as Vec3);
    const T = unit(cross(S, bPole(plan, et)));
    const R = cross(S, T);
    const B = lincomb(T, aim.BdotT, R, aim.BdotR);
    const bs = sys.state(nd.body, et);
    if (mu <= 0) return { et, state: { r: add(bs.r, lincomb(B, 1, S, -vinf * tau)), v: add(bs.v, w as Vec3) } };
    const rel = stateFromBPlane(mu, w as Vec3, aim.BdotT, aim.BdotR, tau, bPole(plan, et));
    return { et, state: { r: add(bs.r, rel.r), v: add(bs.v, rel.v) } };
  };

  /**
   * Stage B at encounter i: solve control i again so that the correction maneuver after flyby i is as small as
   * possible (zero, if an unpowered flyby at the planned times exists). The aim point of encounter i is free:
   * aims[i] gets the value of the solution. The times of encounter i and of encounter i+1 stay at the planned values.
   *
   * A flyby multiplies an aim-point change by a large factor (some 1e5 for a low Earth flyby before a flight to
   * Jupiter), thus a propagation through the flyby to the next body is not a usable function for a solver.
   * The leg is solved from the two ends: forward from control i through flyby i, and backward from the approach
   * hyperbola of body i+1. The two paths meet at the time of the next correction maneuver.
   *   Unknowns    : control i (3), incoming v-infinity vector w at body i+1 (3).
   *   Constraints : equal positions at the maneuver time (3), periapsis time of flyby i (1).
   *   Minimum     : the velocity difference at the maneuver time (this is the correction maneuver).
   * A change of the arrival time is not used to make the two speeds equal: the dates of a good plan are near a
   * minimum of the energy, where the speed almost does not change with the date.
   */
  const stageB = (i: number): SolveResult | null => {
    const nextHasDsm = i + 1 < n && !!result.legs[i].dsm;
    if (!(i + 1 < n) || nextHasDsm || opt.ballistic === false || gms[i] <= 0) return null;
    const wPlan = result.nodes[i + 1].vinfIn;
    if (!wPlan) return null;
    const tEnc = plan.nodes[i].et, tN = plan.nodes[i + 1].et, tC = ctl[i + 1].et;
    const tau = aimLead(i, aims[i]);
    const tA = tEnc - tau;
    const tauN = aimLead(i + 1, aims[i + 1]);
    const vi = vinfOf(i);
    // Residual units. The numerical noise of the aim point of flyby i (scaleOf) gives a noise of the velocity after
    // the flyby: turn angle sensitivity 2a / (a^2 + b^2) per km, where a = mu / vinf^2 and b = miss distance.
    const aH = gms[i] / (vi * vi);
    const b2 = aims[i].BdotT ** 2 + aims[i].BdotR ** 2;
    const turnPerKm = (2 * aH) / (aH * aH + b2);
    const sc2 = Math.max(BODIES[plan.nodes[i + 1].body].radius, 100) * 1e-3;
    const scV = Math.max((0.5 * sc2) / (tN - tC), turnPerKm * vi * scaleOf(i));
    // Position unit: the position error that a velocity change of scV removes in the remaining time of the leg.
    const scP = Math.max(1, turnPerKm * scaleOf(i) * vi * (tC - tEnc), scV * (tN - tC));
    interface Fwd { s: State; ttp: number; aim: { BdotT: number; BdotR: number } }
    const forward = (x: number[]): Fwd | null => {
      const tr = coast(after(i, x), tC, [tA, tEnc]);
      if (tr.failure) return null;
      const e1 = encounterResidual(tr.stateAt(tA), i, tA);
      if (!e1) return null;
      return { s: tr.stateAt(tC), ttp: (e1.ttp - tau) / T_UNIT, aim: { BdotT: e1.bt, BdotR: e1.br } };
    };
    const backward = (w: number[]): State | null => coastState(approachState(i + 1, aims[i + 1], w, tN, tauN), tC);
    interface Res { c: number[]; rho: number[] }
    const resid = (f: Fwd, g: State): Res | null => {
      const c = [(f.s.r[0] - g.r[0]) / scP, (f.s.r[1] - g.r[1]) / scP, (f.s.r[2] - g.r[2]) / scP, f.ttp];
      const rho = [(g.v[0] - f.s.v[0]) / scV, (g.v[1] - f.s.v[1]) / scV, (g.v[2] - f.s.v[2]) / scV];
      return c.every(Number.isFinite) && rho.every(Number.isFinite) ? { c, rho } : null;
    };
    const mx = (v: number[]) => v.reduce((a, q) => Math.max(a, Math.abs(q)), 0);
    const ss = (v: number[]) => v.reduce((a, q) => a + q * q, 0);
    const fail = (x: number[]): SolveResult => ({ x, residual: [], norm: Infinity, iterations: 0, converged: false });

    let x = ctl[i].x.slice();
    let f = forward(x);
    if (!f) return fail(x);
    // Start value of w. The value of the plan can have an error of some percent (patched conics), which is a position
    // error of some 1e6 km after a long leg. Thus w is first solved alone: the backward path must come to the
    // position of the forward path (limit: 1000 km).
    // The backward path has no flyby: its finite-difference step can be much larger than the step of the control,
    // and the numerical noise of the long propagation is then small in the derivatives.
    const DW = 1e-5;
    const f0 = f.s;
    const pre = newtonSolve((w) => {
      const g = backward(w);
      return g && [(f0.r[0] - g.r[0]) / 1000, (f0.r[1] - g.r[1]) / 1000, (f0.r[2] - g.r[2]) / 1000];
    }, [...wPlan], [DW, DW, DW], 1, 15);
    let w = Number.isFinite(pre.norm) ? pre.x : [...wPlan];
    let g = backward(w);
    let R = g && resid(f, g);
    if (!g || !R) return fail(x);

    const merit = (q: Res) => 100 * ss(q.c) + ss(q.rho);
    let it = 0, converged = false;
    for (; it < 30; it++) {
      solverTrace.log?.(`B ${it}: |c| ${mx(R.c).toExponential(2)} |rho| ${Math.sqrt(ss(R.rho)).toExponential(3)} (${(Math.sqrt(ss(R.rho)) * scV * 1000).toFixed(2)} m/s)`);
      const Jc: number[][] = Array.from({ length: 4 }, () => new Array<number>(6).fill(0));
      const Jr: number[][] = Array.from({ length: 3 }, () => new Array<number>(6).fill(0));
      let ok = true;
      for (let j = 0; j < 6 && ok; j++) {
        let q: Res | null;
        const h = j < 3 ? dx[j] : DW;
        if (j < 3) {
          const xp = x.slice(); xp[j] += h;
          const fp = forward(xp);
          q = fp && resid(fp, g);
        } else {
          const wp = w.slice(); wp[j - 3] += h;
          const gp = backward(wp);
          q = gp && resid(f, gp);
        }
        if (!q) { ok = false; break; }
        for (let k = 0; k < 4; k++) Jc[k][j] = (q.c[k] - R.c[k]) / h;
        for (let k = 0; k < 3; k++) Jr[k][j] = (q.rho[k] - R.rho[k]) / h;
      }
      if (!ok) break;
      const step = constrainedStep(Jr, R.rho, Jc, R.c);
      if (!step) break;
      // The iteration stops when the constraints are satisfied and the linear model cannot decrease the velocity
      // difference by more than one unit.
      const rhoNew = R.rho.map((v, k) => v + Jr[k].reduce((a, q, j) => a + q * step[j], 0));
      const gain = Math.sqrt(ss(R.rho)) - Math.sqrt(ss(rhoNew));
      if (mx(R.c) <= 1 && (mx(R.rho) <= 1 || gain <= 1)) { converged = true; break; }
      let alpha = 1, improved = false;
      const base = merit(R);
      for (let ls = 0; ls < 12; ls++) {
        const xn = x.map((v, j) => v + alpha * step[j]);
        const wn = w.map((v, j) => v + alpha * step[3 + j]);
        const fn = forward(xn);
        const gn = fn && backward(wn);
        const Rn = fn && gn && resid(fn, gn);
        if (fn && gn && Rn && merit(Rn) < base) { x = xn; w = wn; f = fn; g = gn; R = Rn; improved = true; break; }
        alpha *= 0.4;
      }
      if (!improved) { converged = mx(R.c) <= STALL; break; }
    }
    solverTrace.log?.(`B end: ${it} iterations, converged ${converged}, |c| ${mx(R.c).toExponential(2)}, correction ${(Math.sqrt(ss(R.rho)) * scV * 1000).toFixed(2)} m/s`);
    if (converged) {
      ctl[i].x = x;
      aims[i] = f.aim;
      // Start value of the correction maneuver of the next leg.
      ctl[i + 1].x = [g.v[0] - f.s.v[0], g.v[1] - f.s.v[1], g.v[2] - f.s.v[2]];
    }
    return { x: [...x, ...w], residual: [...R.c, ...R.rho], norm: mx(R.c), iterations: it, converged };
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
      const s = coastState(after(i, x), tEnc);
      const bp = s && bPlane(relTo(sys, plan.nodes[i].body, tEnc, s), gms[i], bPole(plan, tEnc));
      if (!bp) return null;
      return [(bp.rp - rpT) / sc, (bp.BdotR * Math.cos(th) - bp.BdotT * Math.sin(th)) / sc, bp.timeToPeriapsis / T_UNIT];
    }, x0, dx, 1, 30, STALL);
  };

  for (let i = 1; i < n; i++) {
    const name = plan.nodes[i].body;
    setBase(i);
    opt.onProgress?.(`${name}: A`);
    let sol = solveA(i, aims[i], ctl[i].x, true);
    if (sol.converged && i === n - 1 && !opt.finalAim && gms[i] > 0) {
      const fin = solveFinal(sol.x);
      if (fin.converged) sol = { ...fin, iterations: sol.iterations + fin.iterations };
    }
    stages.push({ node: i, stage: 'A', converged: sol.converged, iterations: sol.iterations, residual: sol.norm });
    // The solver returns the best values that it found: use them also when the limit was not reached.
    if (sol.residual.length > 0) ctl[i].x = sol.x;

    // Stage C: for a leg with a deep-space maneuver, move the aim point of the preceding flyby. The cost is the
    // maneuver plus the correction that the next leg needs (the flyby i is made ballistic for each trial).
    if (opt.optimizeDsm && ctl[i].kind === 'dsm' && i >= 2 && sol.converged && gms[i - 1] > 0) {
      opt.onProgress?.(`${name}: C`);
      const save = { prevX: ctl[i - 1].x.slice(), x: ctl[i].x.slice(), prevAim: { ...aims[i - 1] }, aim: { ...aims[i] }, nextX: ctl[i + 1]?.x.slice() };
      const body = BODIES[plan.nodes[i - 1].body];
      const bMin = bMagnitude(gms[i - 1], body.radius + (plan.minFlybyAltitude[i - 1] ?? body.minFlybyAltitude), result.nodes[i - 1].flyby?.vinfIn ?? 5);
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
      // Stop when the cost changes by less than 0.02 % (about 0.1 m/s).
      const best = nelderMead(cost, [save.prevAim.BdotT, save.prevAim.BdotR], [0.02 * bm, 0.02 * bm], 150, 2e-4);
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
  // After a flyby of the last body the flight continues until the spacecraft is out of the sphere of influence.
  const gmLast = gms[n - 1];
  const soi = gmLast > 0 ? soiRadius(sys, last.body, last.et) : 0;
  const coastDefault = Math.min(120, Math.max(3, (2 * soi) / Math.max(result.arrival.vinf, 0.5) / DAY));
  let etEnd = last.et + (plan.arrival.coastDays ?? coastDefault) * DAY;
  const flight: Flight = { et0, state0: startState(launchVinf), etEnd, maneuvers, model };
  let arrivalRel: State | null = null;
  if (plan.arrival.type === 'orbit' || plan.arrival.type === 'rendezvous') {
    // Arrival burn at the planned arrival time (periapsis of the approach hyperbola, or the position of the small body).
    const arr = prop.propagate({ et0, state0: flight.state0, etEnd: last.et, maneuvers, model, noEvents: true }).stateAt(last.et);
    const rel = relTo(sys, last.body, last.et, arr);
    arrivalRel = rel;
    if (plan.arrival.type === 'orbit' && gmLast > 0) {
      const rp = norm(rel.r);
      const ra = Math.max(plan.arrival.apoapsisRadius ?? rp, rp);
      const a = (rp + ra) / 2;
      const period = 2 * Math.PI * Math.sqrt((a * a * a) / gmLast);
      // Two-body value of the burn along the velocity.
      let dvArr = Math.sqrt(gmLast * (2 / rp - 1 / a)) - norm(rel.v);
      if (ra > 1.05 * rp) {
        // The oblateness of the body and the gravity of the Sun change the orbit after the burn. The burn is solved
        // (secant method) so that the first apoapsis of the propagated orbit has the planned radius.
        const vhat = unit(rel.v);
        const apoapsis = (dv: number): number | null => {
          const tr = prop.propagate({ et0: last.et, state0: { r: arr.r, v: add(arr.v, scale(vhat, dv)) }, etEnd: last.et + Math.min(0.75 * period, 400 * DAY), model, noEvents: true });
          if (tr.failure) return null;
          const dist = (t: number): number => norm(relTo(sys, last.body, t, tr.stateAt(t)).r);
          let k = 0, best = -1;
          for (let j = 0; j < tr.t.length; j++) { const d = dist(tr.t[j]); if (d > best) { best = d; k = j; } }
          if (k === 0 || k === tr.t.length - 1) return best;
          // maximum between the samples: golden-section search
          let lo = tr.t[k - 1], hi = tr.t[k + 1];
          const g = 0.381966;
          for (let it = 0; it < 40 && hi - lo > 1; it++) {
            const m1 = lo + g * (hi - lo), m2 = hi - g * (hi - lo);
            if (dist(m1) > dist(m2)) hi = m2; else lo = m1;
          }
          return dist(0.5 * (lo + hi));
        };
        let x0 = dvArr, f0 = apoapsis(x0);
        let x1 = dvArr - 1e-3, f1 = apoapsis(x1);
        for (let it = 0; it < 12 && f0 !== null && f1 !== null && Math.abs(f1 - ra) > 1e-6 * ra && f1 !== f0; it++) {
          const x2 = x1 - ((f1 - ra) * (x1 - x0)) / (f1 - f0);
          x0 = x1; f0 = f1;
          x1 = x2; f1 = apoapsis(x1);
        }
        if (f1 !== null && Math.abs(f1 - ra) < 1e-3 * ra) dvArr = x1;
      }
      maneuvers.push({ id: 'arrival', et: last.et, dv: [dvArr, 0, 0], frame: 'VNB', refBody: last.body, label: 'ARRIVAL' });
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
    // Speed at infinity and aim point: from the approach hyperbola before the encounter (see aimLead). The
    // osculating hyperbola at the periapsis of an oblate body is not the approach hyperbola.
    const tau = aimLead(i, aims[i]);
    const bp = gms[i] > 0 ? bPlane(relTo(sys, nd.body, et - tau, trajectory.stateAt(et - tau)), gms[i], bPole(plan, et - tau)) : null;
    encounters.push({ body: nd.body, etPlanned: nd.et, et, radius: norm(rel.r), altitude: norm(rel.r) - body.radius, vinf: bp?.vinf ?? norm(rel.v), BdotT: bp?.BdotT ?? 0, BdotR: bp?.BdotR ?? 0 });
  }
  const corrections = maneuvers.map((m) => ({ et: m.et, dv: norm(m.dv), kind: m.label === 'DSM' ? ('dsm' as const) : m.label === 'ARRIVAL' ? ('arrival' as const) : ('tcm' as const) }));
  const report: RefineReport = {
    converged: stages.filter((s) => s.stage === 'A').every((s) => s.converged) && !trajectory.failure,
    failure: trajectory.failure,
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
