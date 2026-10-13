/**
 * Checks that the product does in the browser of the user. Each check compares a result of the engine on this
 * computer with a reference value from JPL Horizons (selfcheck.json), with an exact solution, or with a definition.
 * The limits are the limits of the automatic tests.
 */
import data from './selfcheck.json';
import type { SolarSystem } from '../engine/system';
import { jdTdbToEt, utcToEt } from '../engine/time';
import { stateFromIcrf } from '../engine/frames';
import { Propagator, FULL_MODEL } from '../engine/propagate';
import { lambert } from '../engine/lambert';
import { keplerPropagate, stateFromElements, period } from '../engine/kepler';
import { Rkf78 } from '../engine/integrator';
import { GM_SUN, AU, BODIES } from '../engine/bodies';
import { bPlane } from '../engine/flyby';
import { ECLIPTIC_POLE } from '../engine/frames';
import { dist, norm, sub, type State, type Vec3 } from '../engine/vec';
import { famousFacts, type SolvedMission } from '../engine/mission';

export interface CheckResult {
  /** Key of the description text (validation.self.<id>). */
  id: string;
  /** Body or spacecraft of the check (for the text), if applicable. */
  body?: string;
  value: number;
  unit: string;
  limit: number;
  ok: boolean;
  /** Key of the reference text (validation.selfRef.<reference>). */
  reference: 'horizons' | 'analytic' | 'definition';
}

type Table = Record<string, { jd: number[]; state: number[][] }>;
const toState = (a: number[]): State => ({ r: [a[0], a[1], a[2]], v: [a[3], a[4], a[5]] });
const make = (id: string, value: number, unit: string, limit: number, reference: CheckResult['reference'], body?: string): CheckResult =>
  ({ id, body, value, unit, limit, ok: value <= limit, reference });

/** Checks that take less than one second in total. */
export function runFastChecks(sys: SolarSystem): CheckResult[] {
  const out: CheckResult[] = [];
  for (const [name, b] of Object.entries(data.positions as Table)) {
    let max = 0;
    b.jd.forEach((jd, k) => { max = Math.max(max, dist(sys.state(name, jdTdbToEt(jd)).r, toState(b.state[k]).r)); });
    out.push(make('position', max, 'km', 0.05, 'horizons', name));
  }
  for (const [name, b] of Object.entries(data.small as Table)) {
    let max = 0;
    b.jd.forEach((jd, k) => { max = Math.max(max, dist(sys.state(name, jdTdbToEt(jd)).r, toState(b.state[k]).r)); });
    out.push(make('position', max, 'km', 50, 'horizons', name));
  }
  {
    const f = data.frame;
    const s = stateFromIcrf(sys.stateRel(f.body, f.center, jdTdbToEt(f.jd)), 'ECLIPJ2000');
    out.push(make('frame', dist(s.r, toState(f.ecliptic).r), 'km', 0.02, 'horizons', f.body));
  }
  {
    const a = data.arc;
    const tr = new Propagator(sys, FULL_MODEL).propagate({ et0: jdTdbToEt(a.jd0), state0: toState(a.state0), etEnd: jdTdbToEt(a.jd1), model: FULL_MODEL, noEvents: true });
    const end = tr.stateAt(tr.et1);
    out.push(make('propagation', dist(end.r, toState(a.state1).r), 'km', 1, 'horizons', a.body));
  }
  {
    // J2000 is 2000-01-01 12:00:00 TT. With TAI - UTC = 32 s this is 11:58:55.816 UTC. TDB - TT is then -73 microseconds.
    const et = utcToEt({ year: 2000, month: 1, day: 1, hour: 11, minute: 58, second: 55.816 });
    out.push(make('time', Math.abs(et) * 1000, 'ms', 1, 'definition'));
  }
  {
    // Hohmann transfer between circular coplanar orbits: exact velocity changes.
    const r1 = AU, r2 = 1.523679 * AU, a = (r1 + r2) / 2;
    const tof = Math.PI * Math.sqrt((a * a * a) / GM_SUN);
    // 179.99 degrees: the Lambert problem has no defined plane at exactly 180 degrees.
    const ang = Math.PI - 1e-9;
    const p1: Vec3 = [r1, 0, 0], p2: Vec3 = [r2 * Math.cos(ang), r2 * Math.sin(ang), 0];
    const sol = lambert(GM_SUN, p1, p2, tof)[0];
    const v1c: Vec3 = [0, Math.sqrt(GM_SUN / r1), 0];
    const dv1 = norm(sub(sol.v1, v1c));
    const exact = Math.sqrt(GM_SUN / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
    out.push(make('hohmann', Math.abs(dv1 - exact) * 1000, 'm/s', 0.05, 'analytic'));
  }
  {
    // 10 revolutions of an eccentric two-body orbit: the integrator against the exact solution.
    const a = 1.3 * AU, e = 0.5;
    const s0 = stateFromElements({ p: a * (1 - e * e), e, i: 0.3, raan: 1, argp: 2, nu: 0.5 }, GM_SUN);
    const y = new Float64Array([...s0.r, ...s0.v]);
    const f = (_t: number, yy: Float64Array, d: Float64Array): void => {
      const r3 = Math.hypot(yy[0], yy[1], yy[2]) ** 3;
      d[0] = yy[3]; d[1] = yy[4]; d[2] = yy[5];
      d[3] = (-GM_SUN * yy[0]) / r3; d[4] = (-GM_SUN * yy[1]) / r3; d[5] = (-GM_SUN * yy[2]) / r3;
    };
    const T = 10 * period(a, GM_SUN);
    new Rkf78(f, 6).integrate(0, y, T, { rtol: 1e-13, atol: 1e-9, h0: 3600 });
    const exact = keplerPropagate(s0, T, GM_SUN);
    out.push(make('integrator', dist([y[0], y[1], y[2]], exact.r), 'km', 1, 'analytic'));
  }
  return out;
}

export interface FactComparison {
  body: string; index: number;
  /** Speed at infinity of the calculated flight and of the JPL Horizons trajectory (same definition), km/s. */
  vinf: number; vinfTruth: number;
  /** Radius of the closest approach, km. */
  radius: number; radiusTruth: number;
  /** Time of the closest approach, et. */
  et: number; etTruth: number;
  /** True if the values are those of the approach hyperbola some time before the periapsis (see famous.json). */
  approach: boolean;
  /** True for the last body: its aim point is an input of the solver, thus the radius is not a result. */
  aim: boolean;
}

/**
 * Comparison of a calculated flight of an actual mission with the JPL Horizons values of that mission.
 * The speed at infinity uses the definition of the reference value: the two-body orbit of the state at the closest
 * approach or, where the reference is an approach hyperbola, of the state at the same time before the periapsis.
 */
export function compareWithFacts(sys: SolarSystem, famousId: string, solved: Pick<SolvedMission, 'report' | 'trajectory'>): FactComparison[] {
  const facts = famousFacts(famousId);
  return facts.encounters.map((e, k) => {
    const r = solved.report.encounters[k];
    let vinf = r?.vinfClosest ?? NaN;
    if (r && e.approachLeadS !== undefined) {
      const t = jdTdbToEt(e.jdTdb) - e.approachLeadS;
      const body = sys.state(e.body, t);
      const s = solved.trajectory.stateAt(t);
      vinf = bPlane({ r: sub(s.r, body.r), v: sub(s.v, body.v) }, BODIES[e.body].gmSystem, ECLIPTIC_POLE)?.vinf ?? NaN;
    }
    return {
      body: e.body, index: k, vinf, vinfTruth: e.vinfKmS, radius: r?.radius ?? NaN, radiusTruth: e.radiusKm, et: r?.et ?? NaN, etTruth: jdTdbToEt(e.jdTdb),
      approach: e.approachLeadS !== undefined, aim: k === facts.encounters.length - 1,
    };
  });
}

/** Checks of a calculated flight of an actual mission (limits: those of the automatic tests). */
export function flightChecks(sys: SolarSystem, famousId: string, solved: Pick<SolvedMission, 'report' | 'trajectory'>): CheckResult[] {
  const out: CheckResult[] = [];
  for (const c of compareWithFacts(sys, famousId, solved)) {
    out.push(make('flightVinf', (Math.abs(c.vinf - c.vinfTruth) / c.vinfTruth) * 100, '%', 1, 'horizons', c.body));
    if (!c.aim) out.push(make('flightPeriapsis', (Math.abs(c.radius - c.radiusTruth) / c.radiusTruth) * 100, '%', 3, 'horizons', c.body));
  }
  return out;
}
