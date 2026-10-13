/**
 * Analysis of a table that comes from a file: the format of a text, the closest approaches to bodies, the maneuvers
 * that the file shows as two samples with the same time, and the distance between a table and a trajectory.
 */
import type { SolarSystem } from '../system';
import { type ForceModel, type Trajectory, FULL_MODEL, Propagator, soiRadius } from '../propagate';
import { type State, type Vec3, sub, norm, dot } from '../vec';
import { BODIES } from '../bodies';
import { type EphemerisTable, segmentRanges } from './types';
import { tableToCenterFrame } from './sample';

export type FileFormat = 'oem' | 'opm' | 'stk' | 'horizons' | 'csv' | 'mission';

/**
 * Format of the text of a file, from its first lines. null: the text is not one of the formats.
 * A CSV table has no mark of its own: a text is a CSV table if its first line that is not a comment has a name
 * of a time column or of a position column, and a separator.
 */
export function detectFormat(text: string): FileFormat | null {
  const head = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).slice(0, 20000);
  if (/^\s*\{/.test(head)) return 'mission';
  if (/^\s*CCSDS_OEM_VERS\s*=/m.test(head)) return 'oem';
  if (/^\s*CCSDS_OPM_VERS\s*=/m.test(head)) return 'opm';
  if (/^\s*stk\.v\.\d+/im.test(head)) return 'stk';
  if (text.includes('$$SOE')) return 'horizons';
  const first = head.split(/\r\n|\n|\r/).find((line) => line.trim() !== '' && !line.trim().startsWith('#'));
  if (!first || !/[,;\t]/.test(first)) return null;
  // Column names with small letters and '_' between the words, as the CSV reader makes them.
  const names = first.split(/[,;\t]/).map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  return names.some((n) => /^(time|epoch|date|jd|julian_date|utc|tdb|tt|tai|x)(_|$)/.test(n)) ? 'csv' : null;
}

export interface TableApproach {
  body: string;
  et: number;
  /** Distance from the centre of the body, km. */
  radius: number;
  /** Altitude above the equatorial radius, km. */
  altitude: number;
  /** Speed relative to the body, km/s. */
  speed: number;
  /**
   * true: the values come from a propagation between the samples before and after the closest approach.
   * false: the values are those of the nearest sample of the table (the propagation found no closest approach).
   */
  refined: boolean;
  /**
   * Distance between the end of that propagation and the sample of the table at the same time, km. A large value
   * shows that the path of the file has a maneuver between the two samples, or a force that the model does not
   * have: then the values of this closest approach are not accurate. NaN if `refined` is false.
   */
  missKm: number;
}

/**
 * Closest approaches of a table to the bodies of a force model (not the Sun).
 * The samples of a file are frequently far apart at a flyby, thus an interpolation in the table is not accurate
 * there. The function finds each interval in which the distance to a body stops to decrease and starts to increase
 * (the range rate goes from negative to positive). It propagates the state of the sample at the start of the
 * interval to the sample at its end in the force model: the closest approach of this short propagation (inside
 * 3 radii of the sphere of influence) is the result. If the path of the file has a maneuver in the interval, the
 * result does not include it: `missKm` then is large.
 * Not more than `limit` closest approaches (the first ones in time).
 */
export function tableApproaches(sys: SolarSystem, table: EphemerisTable, model: ForceModel = FULL_MODEL, limit = 200): TableApproach[] {
  const abs = tableToCenterFrame(sys, table, 'SSB', 'ICRF');
  const t = abs.et;
  const prop = new Propagator(sys, model);
  const found: TableApproach[] = [];
  for (const id of model.bodies) {
    if (id === 'SUN' || !sys.hasBody(id) || !BODIES[id]) continue;
    const [lo, hi] = sys.coverage(id);
    const rel = (i: number): State | null => {
      if (t[i] < lo || t[i] > hi) return null;
      const b = sys.state(id, t[i]);
      return { r: sub(abs.states[i].r, b.r), v: sub(abs.states[i].v, b.v) };
    };
    for (const [a, b] of segmentRanges(abs)) {
      let s0 = rel(a);
      for (let i = a; i < b; i++) {
        const s1 = rel(i + 1);
        const before = s0;
        s0 = s1;
        if (!before || !s1 || !(dot(before.r, before.v) < 0) || !(dot(s1.r, s1.v) >= 0)) continue;
        const near = 3 * soiRadius(sys, id, t[i]);
        const d0 = norm(before.r), d1 = norm(s1.r);
        // The spacecraft cannot go nearer than this in the interval (2: margin for the speed that the body adds).
        if (Math.min(d0, d1) - 2 * Math.max(norm(before.v), norm(s1.v)) * (t[i + 1] - t[i]) > near) continue;
        const arc = prop.propagate({ et0: t[i], state0: abs.states[i], etEnd: t[i + 1], model, stopAtImpact: false });
        const missKm = arc.et1 === t[i + 1] ? norm(sub(arc.stateAt(t[i + 1]).r, abs.states[i + 1].r)) : NaN;
        let out: TableApproach | null = null;
        for (const e of arc.events) {
          if (e.type !== 'periapsis' || e.body !== id || e.radius === undefined || !(e.radius < near) || (out && !(e.radius < out.radius))) continue;
          out = { body: id, et: e.et, radius: e.radius, altitude: e.altitude ?? e.radius - BODIES[id].radius, speed: e.speed ?? NaN, refined: true, missKm };
        }
        if (!out && Math.min(d0, d1) < near) {
          const k = d0 <= d1 ? i : i + 1, s = d0 <= d1 ? before : s1;
          out = { body: id, et: t[k], radius: norm(s.r), altitude: norm(s.r) - BODIES[id].radius, speed: norm(s.v), refined: false, missKm: NaN };
        }
        if (out) found.push(out);
      }
    }
  }
  found.sort((p, q) => p.et - q.et);
  return found.slice(0, limit);
}

export interface TableBoundary {
  /** Index of the first sample after the maneuver. */
  index: number;
  et: number;
  /** Velocity step between the two samples, ICRF, km/s. */
  dv: Vec3;
  dvMag: number;
  /** Distance between the two samples, km (zero for an impulse). */
  gapKm: number;
}

/**
 * Maneuvers that a table shows: the last sample of a segment and the first sample of the next segment have the
 * same time (not more than 1 ms apart), and the velocity changes between them.
 */
export function tableBoundaries(sys: SolarSystem, table: EphemerisTable): TableBoundary[] {
  const abs = tableToCenterFrame(sys, table, 'SSB', 'ICRF');
  const out: TableBoundary[] = [];
  for (const [s] of segmentRanges(abs)) {
    if (s === 0 || Math.abs(abs.et[s] - abs.et[s - 1]) > 1e-3) continue;
    const dv = sub(abs.states[s].v, abs.states[s - 1].v);
    out.push({ index: s, et: abs.et[s], dv, dvMag: norm(dv), gapKm: norm(sub(abs.states[s].r, abs.states[s - 1].r)) });
  }
  return out;
}

export interface TableDifference {
  /** Times of the samples that were compared, et. */
  et: Float64Array;
  /** Distance between the trajectory and the sample of the table at each time, km. */
  km: Float64Array;
  maxKm: number;
  maxEt: number;
}

/**
 * Distance between a trajectory and a table at the sample times of the table that are in the time of the
 * trajectory. The comparison uses no interpolation in the table. Not more than `limit` samples, at equal steps of
 * the index. null: no sample of the table is in the time of the trajectory.
 */
export function tableDifference(sys: SolarSystem, traj: Trajectory, table: EphemerisTable, limit = 2000): TableDifference | null {
  const abs = tableToCenterFrame(sys, table, 'SSB', 'ICRF');
  const lo = Math.min(traj.et0, traj.et1), hi = Math.max(traj.et0, traj.et1);
  const inside: number[] = [];
  for (let i = 0; i < abs.et.length; i++) if (abs.et[i] >= lo && abs.et[i] <= hi) inside.push(i);
  if (inside.length === 0) return null;
  const stride = Math.max(1, Math.ceil(inside.length / limit));
  const pick = inside.filter((_, k) => k % stride === 0 || k === inside.length - 1);
  const et = new Float64Array(pick.length), km = new Float64Array(pick.length);
  let maxKm = 0, maxEt = abs.et[pick[0]];
  pick.forEach((i, k) => {
    et[k] = abs.et[i];
    km[k] = norm(sub(traj.stateAt(abs.et[i]).r, abs.states[i].r));
    if (km[k] > maxKm) { maxKm = km[k]; maxEt = et[k]; }
  });
  return { et, km, maxKm, maxEt };
}
