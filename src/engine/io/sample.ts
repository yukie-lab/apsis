/**
 * Ephemeris tables from a trajectory, change of centre and frame, and interpolation in a table.
 */
import type { SolarSystem } from '../system';
import { type Trajectory, type ForceModel, Propagator } from '../propagate';
import { type FrameId, stateFromIcrf, stateToIcrf, toIcrf } from '../frames';
import { type TimeScale, etToTt, etToTai, ttToEt, taiToEt } from '../time';
import type { State, Vec3 } from '../vec';
import { type EphemerisTable, IoError, segmentRanges } from './types';

export interface SampleOptions {
  /** Apsis body id or 'SSB'. */
  center: string;
  frame: FrameId;
  /** Time scale of the file that the table is for. The step is a step of this scale (UTC: SI seconds, as TAI). */
  timeScale: TimeScale;
  /** Step, s. */
  stepS: number;
  objectName: string;
  objectId: string;
  comments?: string[];
}

/** A grid time nearer than this to the start or the end of a segment is not used, s. */
export const MIN_SAMPLE_GAP = 1e-3;
/** Largest number of grid times of one table. */
export const MAX_SAMPLES = 5e6;

/** Uniform time (s) of the scale in which the step is constant. UTC has leap seconds: its uniform time is TAI. */
function toUniform(et: number, scale: TimeScale): number {
  return scale === 'TDB' ? et : scale === 'TT' ? etToTt(et) : etToTai(et);
}
function fromUniform(s: number, scale: TimeScale): number {
  return scale === 'TDB' ? s : scale === 'TT' ? ttToEt(s) : taiToEt(s);
}

/** True if the body has data at all the times. */
function covers(sys: SolarSystem, id: string, et: readonly number[]): boolean {
  if (id === 'SSB' || et.length === 0) return true;
  const [a, b] = sys.coverage(id);
  let lo = Infinity, hi = -Infinity;
  for (const t of et) { if (t < lo) lo = t; if (t > hi) hi = t; }
  return lo >= a && hi <= b;
}

/**
 * Sample a trajectory at a fixed step. The first and the last time are always in the table. Each maneuver starts
 * a new segment: the state immediately before the maneuver is the last sample of a segment, and the state
 * immediately after it is the first sample of the next segment (the two samples have the same time).
 * The grid starts at the first time. A grid time nearer than MIN_SAMPLE_GAP to a segment end is not used.
 * The times of the table increase, also for a trajectory that was propagated backward.
 */
export function tableFromTrajectory(sys: SolarSystem, traj: Trajectory, opts: SampleOptions): EphemerisTable {
  const n = traj.t.length;
  if (n === 0) throw new IoError('sample.empty');
  if (!(opts.stepS > 0) || !Number.isFinite(opts.stepS)) throw new IoError('sample.step');
  if (!sys.hasBody(opts.center)) throw new IoError('sample.center', undefined, opts.center);
  const dir = traj.forward ? 1 : -1;
  const s0 = toUniform(traj.t[0], opts.timeScale);
  if (Math.abs(toUniform(traj.t[n - 1], opts.timeScale) - s0) / opts.stepS > MAX_SAMPLES) throw new IoError('sample.size');

  const et: number[] = [];
  const abs: State[] = [];
  const segmentStarts: number[] = [];
  const y = traj.y;
  const raw = (i: number): State => ({ r: [y[6 * i], y[6 * i + 1], y[6 * i + 2]], v: [y[6 * i + 3], y[6 * i + 4], y[6 * i + 5]] });
  const starts = traj.segStarts;
  let j = 1; // index of the next grid time
  for (let k = 0; k < starts.length; k++) {
    const i0 = starts[k], i1 = (k + 1 < starts.length ? starts[k + 1] : n) - 1;
    if (i1 < i0) continue;
    const ta = traj.t[i0], tb = traj.t[i1];
    segmentStarts.push(et.length);
    et.push(ta); abs.push(raw(i0));
    for (;; j++) {
      const tg = fromUniform(s0 + dir * j * opts.stepS, opts.timeScale);
      if ((tb - tg) * dir < MIN_SAMPLE_GAP) break; // at or after the end of this segment: the next segment uses it
      if ((tg - ta) * dir < MIN_SAMPLE_GAP) continue; // at the start of this segment
      et.push(tg); abs.push(traj.stateAt(tg));
    }
    if ((tb - ta) * dir > 0) { et.push(tb); abs.push(raw(i1)); }
  }
  return finishTable(sys, opts, dir, et, abs, segmentStarts);
}

/** Table from samples relative to the SSB in the order of the trajectory: time order, centre and frame. */
function finishTable(sys: SolarSystem, opts: Omit<SampleOptions, 'stepS'>, dir: number, et: number[], abs: State[], segmentStarts: number[]): EphemerisTable {
  if (dir < 0) {
    // Time must increase in a table: reverse the samples. The segments keep their limits.
    const last = et.length - 1;
    const ends = segmentStarts.map((_, k) => (k + 1 < segmentStarts.length ? segmentStarts[k + 1] : et.length) - 1);
    et.reverse(); abs.reverse();
    segmentStarts.splice(0, segmentStarts.length, ...ends.map((e) => last - e).reverse());
  }
  if (!covers(sys, opts.center, et)) throw new IoError('sample.coverage', undefined, opts.center);
  const states = abs.map((s, i) => {
    if (opts.center === 'SSB') return stateFromIcrf(s, opts.frame);
    const c = sys.state(opts.center, et[i]);
    return stateFromIcrf({ r: [s.r[0] - c.r[0], s.r[1] - c.r[1], s.r[2] - c.r[2]], v: [s.v[0] - c.v[0], s.v[1] - c.v[1], s.v[2] - c.v[2]] }, opts.frame);
  });
  const table: EphemerisTable = { objectName: opts.objectName, objectId: opts.objectId, center: opts.center, frame: opts.frame, timeScale: opts.timeScale, et, states, segmentStarts };
  if (opts.comments) table.comments = [...opts.comments];
  return table;
}

export interface StepSampleOptions extends Omit<SampleOptions, 'stepS'> {
  /** Number of samples between two steps of the integrator, at equal parts of the step (default 0). */
  between?: number;
}

/**
 * Table with one sample at each step of the integrator. The integrator makes its steps short where the path bends
 * (near a body) and long in the cruise: the samples of this table are thus near to each other at a flyby.
 * A sample at a step is a state that the integrator calculated: it has no interpolation error. A sample between
 * two steps (`between`) comes from the interpolation of the trajectory. Segments and time order: see
 * tableFromTrajectory. A step shorter than MIN_SAMPLE_GAP has no sample of its own.
 */
export function tableFromTrajectorySteps(sys: SolarSystem, traj: Trajectory, opts: StepSampleOptions): EphemerisTable {
  const n = traj.t.length;
  if (n === 0) throw new IoError('sample.empty');
  const between = opts.between ?? 0;
  if (!Number.isInteger(between) || between < 0 || between > 64) throw new IoError('sample.step');
  if (!sys.hasBody(opts.center)) throw new IoError('sample.center', undefined, opts.center);
  if (n * (between + 1) > MAX_SAMPLES) throw new IoError('sample.size');
  const dir = traj.forward ? 1 : -1;
  const et: number[] = [];
  const abs: State[] = [];
  const segmentStarts: number[] = [];
  const y = traj.y;
  const raw = (i: number): State => ({ r: [y[6 * i], y[6 * i + 1], y[6 * i + 2]], v: [y[6 * i + 3], y[6 * i + 4], y[6 * i + 5]] });
  const starts = traj.segStarts;
  for (let k = 0; k < starts.length; k++) {
    const i0 = starts[k], i1 = (k + 1 < starts.length ? starts[k + 1] : n) - 1;
    if (i1 < i0) continue;
    const tb = traj.t[i1];
    segmentStarts.push(et.length);
    et.push(traj.t[i0]); abs.push(raw(i0));
    let last = i0; // index of the newest step that has a sample
    for (let i = i0 + 1; i <= i1; i++) {
      const ti = traj.t[i];
      const atEnd = i === i1;
      if (!atEnd && ((ti - traj.t[last]) * dir < MIN_SAMPLE_GAP || (tb - ti) * dir < MIN_SAMPLE_GAP)) continue;
      const ta = traj.t[last];
      if (!((ti - ta) * dir > 0)) continue;
      if ((ti - ta) * dir >= (between + 1) * MIN_SAMPLE_GAP) {
        for (let j = 1; j <= between; j++) { const tm = ta + ((ti - ta) * j) / (between + 1); et.push(tm); abs.push(traj.stateAt(tm)); }
      }
      et.push(ti); abs.push(raw(i));
      last = i;
    }
  }
  return finishTable(sys, opts, dir, et, abs, segmentStarts);
}

export interface TableCheck {
  /** Largest distance between the interpolation in the table and the flight, km. */
  maxKm: number;
  /** Time of the largest distance, et. */
  et: number;
  /** Number of intervals of the table that were examined, and number of all intervals. */
  examined: number;
  intervals: number;
}

/**
 * How well a program that reads a table can get the flight back between the samples.
 * In the middle of an interval between two samples, the position from an interpolation in the table (Hermite, as
 * interpolateTable) is compared with the position of the flight. The position of the flight at that time does not
 * come from an interpolation: the integrator calculates it again from the nearest step of the trajectory before
 * that time, with the force model of the flight.
 * Not more than `limit` intervals are examined: half of them are the intervals where the velocity changes most
 * (there the error of an interpolation is largest), the others are at equal distances in the table.
 * The table must come from this trajectory (tableFromTrajectory or tableFromTrajectorySteps).
 */
export function checkTableInterpolation(sys: SolarSystem, traj: Trajectory, model: ForceModel, table: EphemerisTable, opts: { points?: number; limit?: number } = {}): TableCheck {
  const points = opts.points ?? 4;
  const limit = Math.max(2, opts.limit ?? 400);
  const t = table.et;
  // intervals inside a segment, with a measure of how much the path bends in them
  const list: { i: number; bend: number }[] = [];
  for (const [a, b] of segmentRanges(table)) {
    for (let i = a; i < b; i++) {
      const h = t[i + 1] - t[i];
      if (!(h > 2 * MIN_SAMPLE_GAP)) continue;
      const p = table.states[i].v, q = table.states[i + 1].v;
      list.push({ i, bend: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) * h });
    }
  }
  const chosen = new Set<number>();
  if (list.length <= limit) for (const x of list) chosen.add(x.i);
  else {
    const half = limit >> 1;
    for (const x of [...list].sort((p, q) => q.bend - p.bend).slice(0, half)) chosen.add(x.i);
    for (let k = 0; k < limit - half; k++) chosen.add(list[Math.round((k * (list.length - 1)) / (limit - half - 1))].i);
  }
  const prop = new Propagator(sys, model);
  const tt = traj.t, y = traj.y;
  const fwd = traj.forward;
  const starts = [...traj.segStarts, tt.length];
  let maxKm = 0, at = t.length ? t[0] : NaN, examined = 0;
  for (const i of chosen) {
    const tm = 0.5 * (t[i] + t[i + 1]);
    // step of the trajectory before tm (in the direction of the propagation), in the segment that has tm
    let node = -1;
    for (let s = 0; s + 1 < starts.length && node < 0; s++) {
      let lo = starts[s], hi = starts[s + 1] - 1;
      if (hi <= lo || (fwd ? tm < tt[lo] || tm > tt[hi] : tm > tt[lo] || tm < tt[hi])) continue;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fwd ? tt[mid] <= tm : tt[mid] >= tm) lo = mid; else hi = mid; }
      node = lo;
    }
    if (node < 0) continue;
    const state0: State = { r: [y[6 * node], y[6 * node + 1], y[6 * node + 2]], v: [y[6 * node + 3], y[6 * node + 4], y[6 * node + 5]] };
    let exact = state0;
    if (tt[node] !== tm) {
      const arc = prop.propagate({ et0: tt[node], state0, etEnd: tm, model, noEvents: true, stopAtImpact: false });
      if (arc.failure) continue;
      exact = arc.stateAt(tm);
    }
    const rel = toIcrf(interpolateTable(table, tm, points).r, table.frame);
    const c = table.center === 'SSB' ? [0, 0, 0] : sys.state(table.center, tm).r;
    const d = Math.hypot(rel[0] + c[0] - exact.r[0], rel[1] + c[1] - exact.r[1], rel[2] + c[2] - exact.r[2]);
    examined++;
    if (d > maxKm) { maxKm = d; at = tm; }
  }
  return { maxKm, et: at, examined, intervals: list.length };
}

/** The same table with states relative to another centre, in another frame. The input table does not change. */
export function tableToCenterFrame(sys: SolarSystem, table: EphemerisTable, center: string, frame: FrameId): EphemerisTable {
  for (const id of [table.center, center]) {
    if (!sys.hasBody(id)) throw new IoError('table.center', undefined, id);
    if (center !== table.center && !covers(sys, id, table.et)) throw new IoError('table.coverage', undefined, id);
  }
  const states = table.states.map((s, i): State => {
    let a = stateToIcrf(s, table.frame);
    if (center !== table.center) {
      const from = sys.state(table.center, table.et[i]);
      const to = sys.state(center, table.et[i]);
      a = { r: [a.r[0] + from.r[0] - to.r[0], a.r[1] + from.r[1] - to.r[1], a.r[2] + from.r[2] - to.r[2]], v: [a.v[0] + from.v[0] - to.v[0], a.v[1] + from.v[1] - to.v[1], a.v[2] + from.v[2] - to.v[2]] };
    }
    const out = stateFromIcrf(a, frame);
    return { r: [out.r[0], out.r[1], out.r[2]], v: [out.v[0], out.v[1], out.v[2]] };
  });
  const out: EphemerisTable = { ...table, center, frame, et: [...table.et], states };
  if (table.comments) out.comments = [...table.comments];
  if (table.segmentStarts) out.segmentStarts = [...table.segmentStarts];
  return out;
}

/**
 * Value and derivative at x of the polynomial that has the values f and the derivatives df at the points xs
 * (Hermite interpolation, Newton form with divided differences and each point two times).
 */
function hermite(xs: readonly number[], f: readonly number[], df: readonly number[], x: number): [number, number] {
  const m = 2 * xs.length;
  const z = new Array<number>(m);
  let col = new Array<number>(m);
  for (let i = 0; i < xs.length; i++) { z[2 * i] = z[2 * i + 1] = xs[i]; col[2 * i] = col[2 * i + 1] = f[i]; }
  const c = new Array<number>(m);
  c[0] = col[0];
  for (let j = 1; j < m; j++) {
    const next = new Array<number>(m - j);
    for (let i = 0; i < m - j; i++) {
      next[i] = j === 1 && i % 2 === 0 ? df[i / 2] : (col[i + 1] - col[i]) / (z[i + j] - z[i]);
    }
    c[j] = next[0];
    col = next;
  }
  let p = c[m - 1], dp = 0;
  for (let k = m - 2; k >= 0; k--) {
    dp = dp * (x - z[k]) + p;
    p = p * (x - z[k]) + c[k];
  }
  return [p, dp];
}

/**
 * State at a time from the samples of a table: Hermite interpolation with positions and velocities.
 * The interpolation uses `points` samples (default 4: polynomial of degree 7) of one segment only. A segment with
 * less samples uses all its samples. At a time where two segments touch (a maneuver), the result is the state of the
 * later segment. Throws IoError('table.range') if the time is not in a segment.
 */
export function interpolateTable(table: EphemerisTable, et: number, points = 4): State {
  if (!Number.isInteger(points) || points < 2) throw new IoError('table.points');
  const t = table.et;
  let seg: [number, number] | null = null;
  for (const r of segmentRanges(table)) if (et >= t[r[0]] && et <= t[r[1]]) seg = r;
  if (!seg) throw new IoError('table.range');
  const [a, b] = seg;
  const copy = (i: number): State => ({ r: [...table.states[i].r] as Vec3, v: [...table.states[i].v] as Vec3 });
  if (a === b || et === t[a]) return copy(a);
  // index i with t[i] <= et <= t[i + 1]
  let lo = a, hi = b;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= et) lo = mid; else hi = mid;
  }
  if (et === t[lo]) return copy(lo);
  if (et === t[hi]) return copy(hi);
  const m = Math.min(points, b - a + 1);
  const first = Math.max(a, Math.min(lo - ((m - 1) >> 1), b - m + 1));
  // Time in units of the length of the window: the numbers of the divided differences stay near 1.
  const t0 = t[first], span = t[first + m - 1] - t0;
  const xs: number[] = [];
  for (let i = 0; i < m; i++) xs.push((t[first + i] - t0) / span);
  const x = (et - t0) / span;
  const r: Vec3 = [0, 0, 0], v: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const f: number[] = [], df: number[] = [];
    for (let i = 0; i < m; i++) { f.push(table.states[first + i].r[k]); df.push(table.states[first + i].v[k] * span); }
    const [p, dp] = hermite(xs, f, df, x);
    r[k] = p;
    v[k] = dp / span;
  }
  return { r, v };
}
