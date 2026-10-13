/**
 * Maneuver search in a trajectory that is given as a table of states (an ephemeris file, JPL Horizons vectors).
 *
 * Method: each interval between two table states is propagated in the force model, forward from its first state
 * and backward from its last state. With no maneuver, the two paths are the same path. With one impulse in the
 * interval, the two paths cross at the time of the impulse: the search finds the time where the distance between
 * them is a minimum, and the velocity difference there is the impulse.
 *
 * Limits of the method:
 *  - Forces that the model does not have (radiation pressure of the real spacecraft, thermal recoil, gas leaks,
 *    many small attitude maneuvers) give a small difference in each interval. This is the noise floor.
 *  - An interval with a close flyby is very sensitive to small errors of the table states: such intervals are
 *    marked (`flyby`), and their result is not reliable.
 *  - Two maneuvers in one interval are reported as one, with a position gap that does not go to zero.
 */
import { type State, type Vec3, sub, norm } from './vec';
import { Propagator, type ForceModel, FULL_MODEL, soiRadius } from './propagate';
import type { SolarSystem } from './system';

export interface TableSamples {
  /** Times, et (TDB seconds after J2000), increasing. */
  et: ArrayLike<number>;
  /** States relative to the solar system barycentre, ICRF, km and km/s. */
  states: State[];
}

export interface ManeuverCandidate {
  /** Index of the interval (between sample k and k + 1). */
  interval: number;
  et0: number;
  et1: number;
  /** Estimated time of the impulse, et. */
  et: number;
  /** Estimated impulse, ICRF, km/s. */
  dv: Vec3;
  dvMag: number;
  /** Distance between the forward path and the backward path at the estimated time, km. Near zero for one impulse. */
  gapKm: number;
  /** Velocity difference at the end of the interval if no impulse is applied, km/s (the detection quantity). */
  endMismatch: number;
  /** Body with a close approach in the interval (inside 3 radii of its sphere of influence), or null. */
  flyby: string | null;
}

export interface ManeuverSearchOptions {
  model?: ForceModel;
  /** Report intervals with an end mismatch above this value, km/s (default 0.003 = 3 m/s). */
  threshold?: number;
  onProgress?: (fraction: number) => boolean | void;
}

export interface ManeuverSearchResult {
  candidates: ManeuverCandidate[];
  /** End mismatch of each interval, km/s (NaN where the propagation failed). */
  mismatch: Float64Array;
  /** Median of the end mismatch of all intervals, km/s: the noise floor of this table in this force model. */
  noiseFloor: number;
}

export function findManeuvers(sys: SolarSystem, table: TableSamples, opt: ManeuverSearchOptions = {}): ManeuverSearchResult {
  const model = opt.model ?? FULL_MODEL;
  const threshold = opt.threshold ?? 0.003;
  const prop = new Propagator(sys, model);
  const n = table.states.length;
  const mismatch = new Float64Array(Math.max(n - 1, 0)).fill(NaN);
  const candidates: ManeuverCandidate[] = [];
  for (let k = 0; k + 1 < n; k++) {
    if (opt.onProgress?.(k / (n - 1)) === true) break;
    const t0 = table.et[k], t1 = table.et[k + 1];
    if (!(t1 > t0) || t0 < sys.etStart || t1 > sys.etEnd) continue;
    const fwd = prop.propagate({ et0: t0, state0: table.states[k], etEnd: t1, model });
    if (fwd.failure) continue;
    const end = fwd.stateAt(t1);
    const miss = norm(sub(table.states[k + 1].v, end.v));
    mismatch[k] = miss;
    if (!(miss > threshold)) continue;
    let flyby: string | null = null;
    for (const ev of fwd.events) {
      if (ev.type !== 'periapsis' || !ev.body || ev.radius === undefined) continue;
      if (ev.radius < 3 * soiRadius(sys, ev.body, ev.et)) flyby = ev.body;
    }
    const bwd = prop.propagate({ et0: t1, state0: table.states[k + 1], etEnd: t0, model, noEvents: true });
    let et = 0.5 * (t0 + t1);
    let gapKm = NaN;
    let dv: Vec3 = sub(table.states[k + 1].v, end.v);
    if (!bwd.failure) {
      const gap = (t: number): number => norm(sub(fwd.stateAt(t).r, bwd.stateAt(t).r));
      // Coarse scan, then golden-section search around the best point.
      const N = 48;
      let best = 0, bestGap = Infinity;
      for (let j = 0; j <= N; j++) { const g = gap(t0 + ((t1 - t0) * j) / N); if (g < bestGap) { bestGap = g; best = j; } }
      let lo = t0 + ((t1 - t0) * Math.max(best - 1, 0)) / N, hi = t0 + ((t1 - t0) * Math.min(best + 1, N)) / N;
      const g = 0.381966;
      for (let it = 0; it < 80 && hi - lo > 0.01; it++) {
        const m1 = lo + g * (hi - lo), m2 = hi - g * (hi - lo);
        if (gap(m1) < gap(m2)) hi = m2; else lo = m1;
      }
      et = 0.5 * (lo + hi);
      // The search used the interpolation between the integration steps. The result is from two propagations
      // that end exactly at the estimated time.
      const f = prop.propagate({ et0: t0, state0: table.states[k], etEnd: et, model, noEvents: true });
      const b = prop.propagate({ et0: t1, state0: table.states[k + 1], etEnd: et, model, noEvents: true });
      const sf = f.failure ? fwd.stateAt(et) : f.stateAt(et), sb = b.failure ? bwd.stateAt(et) : b.stateAt(et);
      gapKm = norm(sub(sf.r, sb.r));
      dv = sub(sb.v, sf.v);
    }
    candidates.push({ interval: k, et0: t0, et1: t1, et, dv, dvMag: norm(dv), gapKm, endMismatch: miss, flyby });
  }
  const finite = Array.from(mismatch).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const noiseFloor = finite.length ? finite[Math.floor(finite.length / 2)] : NaN;
  return { candidates, mismatch, noiseFloor };
}
