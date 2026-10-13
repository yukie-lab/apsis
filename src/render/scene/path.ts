/**
 * Display data of the 3D scene from the results of the engine: the path of a flight and the orbits of the bodies.
 * This module makes no physics: each point is a state of the trajectory of the engine or of its ephemeris.
 * The points are in the world axes of the scene (ECLIPJ2000, +Z = ecliptic north), km.
 */
import type { SolarSystem } from '../../engine/system';
import type { Trajectory } from '../../engine/propagate';
import { soiRadius } from '../../engine/propagate';
import { BODIES, PLANET_IDS, AU } from '../../engine/bodies';
import { OBLIQUITY_J2000 } from '../../engine/frames';
import { elementsFromState, keplerPropagate, period } from '../../engine/kepler';
import type { State, Vec3 } from '../../engine/vec';

const CE = Math.cos(OBLIQUITY_J2000), SE = Math.sin(OBLIQUITY_J2000);
/** ICRF vector to the world axes of the scene. */
export function toWorld(v: ArrayLike<number>, out: Vec3 = [0, 0, 0]): Vec3 {
  const y = v[1], z = v[2];
  out[0] = v[0]; out[1] = CE * y + SE * z; out[2] = -SE * y + CE * z;
  return out;
}

/** Largest angle between the directions of two points of a line that follow each other, rad. */
const BEND = (1.5 * Math.PI) / 180;
const MAX_SUB = 64;
/** A span has at least this radius, km (a small body with no mass has no sphere of influence). */
const MIN_SPAN_KM = 5000;
/** The path is relative to a body inside this number of its sphere-of-influence radii. */
export const SPAN_FACTOR = 2;
/** The change between the two frames of the path starts at this part of the radius of a span. */
const SPAN_INNER = 0.75;

/**
 * Weight of the path relative to the body of a span at a distance from the body: 1 near the body, 0 at the radius
 * of the span and farther. The path relative to the barycenter has the weight 1 minus this value: the two lines
 * have soft ends, and one changes into the other with no step.
 */
export function spanWeight(distanceKm: number, radiusKm: number): number {
  const u = Math.max(0, Math.min(1, (distanceKm - SPAN_INNER * radiusKm) / ((1 - SPAN_INNER) * radiusKm)));
  return 1 - u * u * (3 - 2 * u);
}

export interface PathSpan {
  body: string;
  /** Radius of the span, km. */
  radiusKm: number;
  et0: number;
  et1: number;
  /** Points relative to the body (the position of the spacecraft minus the position of the body at the same time). */
  points: Float64Array;
  times: Float64Array;
  /** For each segment: the weight of the span at its start and at its end (see spanWeight). */
  edges: Float32Array;
  count: number;
}

export interface PathData {
  /** Points relative to the solar system barycenter. */
  points: Float64Array;
  times: Float64Array;
  /** For each point: index of the span of the segment that starts at the point, or -1. */
  spanOf: Int16Array;
  /** For each segment: the weight of its span at its start and at its end (1 for a segment of no span). */
  edges: Float32Array;
  count: number;
  spans: PathSpan[];
}

function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const d = ax * bx + ay * by + az * bz;
  const n = Math.sqrt((ax * ax + ay * ay + az * az) * (bx * bx + by * by + bz * bz));
  return n > 0 ? Math.acos(Math.max(-1, Math.min(1, d / n))) : 0;
}

/** Radius of the region around a body in which the scene shows the path relative to the body, km. */
export function spanRadius(sys: SolarSystem, id: string, et: number): number {
  return Math.max(SPAN_FACTOR * soiRadius(sys, id, et), MIN_SPAN_KM);
}

/**
 * Display data of a trajectory.
 * bodies: the bodies near which the path is also given relative to the body (bodies that move around the Sun).
 */
export function buildPath(sys: SolarSystem, tr: Trajectory, bodies: string[]): PathData {
  const n = tr.t.length;
  const t = tr.t, y = tr.y;
  const segSpan = new Int16Array(n).fill(-1);
  const spans: PathSpan[] = [];
  const pb: Vec3 = [0, 0, 0];
  const w: Vec3 = [0, 0, 0];

  for (const id of bodies) {
    const b = BODIES[id];
    if (!b || b.parent !== 'SUN' || !sys.hasBody(id)) continue;
    const [lo, hi] = sys.coverage(id);
    const tm = Math.max(lo, Math.min(hi, 0.5 * (tr.et0 + tr.et1)));
    const radius = spanRadius(sys, id, tm);
    let start = -1;
    const close = (end: number): void => {
      // One sample more on each side: the span starts and ends outside of its radius.
      const a = Math.max(0, start - 1), z = Math.min(n - 1, end + 1);
      const k = spans.length;
      for (let i = a; i < z; i++) if (segSpan[i] < 0) segSpan[i] = k;
      spans.push(spanPoints(sys, tr, id, radius, a, z));
      start = -1;
    };
    for (let i = 0; i < n; i++) {
      let inside = false;
      if (t[i] >= lo && t[i] <= hi) {
        sys.position(id, t[i], pb);
        const dx = y[6 * i] - pb[0], dy = y[6 * i + 1] - pb[1], dz = y[6 * i + 2] - pb[2];
        inside = dx * dx + dy * dy + dz * dz < radius * radius;
      }
      if (inside && start < 0) start = i;
      else if (!inside && start >= 0) close(i - 1);
    }
    if (start >= 0) close(n - 1);
  }

  // Path relative to the barycenter, with more points where the direction changes fast.
  const pts: number[] = [], tms: number[] = [], sp: number[] = [], edges: number[] = [];
  const push = (r: ArrayLike<number>, et: number, span: number): void => { toWorld(r, w); pts.push(w[0], w[1], w[2]); tms.push(et); sp.push(span); };
  const weight = (k: number, r: ArrayLike<number>, et: number): number => {
    if (k < 0) return 1;
    sys.position(spans[k].body, et, pb);
    return spanWeight(Math.hypot(r[0] - pb[0], r[1] - pb[1], r[2] - pb[2]), spans[k].radiusKm);
  };
  push([y[0], y[1], y[2]], t[0], segSpan[0]);
  for (let i = 0; i < n - 1; i++) {
    const h = t[i + 1] - t[i];
    if (h === 0) continue;
    const a = 6 * i, b = 6 * (i + 1);
    const bend = angleBetween(y[a + 3], y[a + 4], y[a + 5], y[b + 3], y[b + 4], y[b + 5]);
    const m = Math.max(1, Math.min(MAX_SUB, Math.ceil(bend / BEND)));
    const k = segSpan[i];
    // The span index belongs to the segment that starts at a point: set it for the last point that was added.
    sp[sp.length - 1] = k;
    let w0 = weight(k, [y[a], y[a + 1], y[a + 2]], t[i]);
    for (let j = 1; j <= m; j++) {
      const et = j < m ? t[i] + (h * j) / m : t[i + 1];
      const r = j < m ? tr.stateAt(et).r : [y[b], y[b + 1], y[b + 2]];
      push(r, et, j < m ? k : segSpan[i + 1]);
      const w1 = weight(k, r, et);
      edges.push(w0, w1);
      w0 = w1;
    }
  }
  return { points: Float64Array.from(pts), times: Float64Array.from(tms), spanOf: Int16Array.from(sp), edges: Float32Array.from(edges), count: tms.length, spans };
}

function spanPoints(sys: SolarSystem, tr: Trajectory, id: string, radiusKm: number, i0: number, i1: number): PathSpan {
  const t = tr.t, y = tr.y;
  const pts: number[] = [], tms: number[] = [];
  const w: Vec3 = [0, 0, 0];
  const rel = (s: State, et: number): State => {
    const b = sys.state(id, et);
    return { r: [s.r[0] - b.r[0], s.r[1] - b.r[1], s.r[2] - b.r[2]], v: [s.v[0] - b.v[0], s.v[1] - b.v[1], s.v[2] - b.v[2]] };
  };
  const at = (i: number): State => rel({ r: [y[6 * i], y[6 * i + 1], y[6 * i + 2]], v: [y[6 * i + 3], y[6 * i + 4], y[6 * i + 5]] }, t[i]);
  const push = (r: Vec3, et: number): void => { toWorld(r, w); pts.push(w[0], w[1], w[2]); tms.push(et); };
  let s0 = at(i0);
  push(s0.r, t[i0]);
  for (let i = i0; i < i1; i++) {
    const h = t[i + 1] - t[i];
    const s1 = at(i + 1);
    if (h !== 0) {
      const bend = angleBetween(s0.v[0], s0.v[1], s0.v[2], s1.v[0], s1.v[1], s1.v[2]);
      const m = Math.max(1, Math.min(2 * MAX_SUB, Math.ceil(bend / BEND)));
      for (let j = 1; j < m; j++) { const et = t[i] + (h * j) / m; push(rel(tr.stateAt(et), et).r, et); }
      push(s1.r, t[i + 1]);
    }
    s0 = s1;
  }
  // The points are in the world axes: a rotation of the ICRF vector, with the same length.
  const edges = new Float32Array(2 * Math.max(0, tms.length - 1));
  const wt = (k: number): number => spanWeight(Math.hypot(pts[3 * k], pts[3 * k + 1], pts[3 * k + 2]), radiusKm);
  for (let k = 0; k + 1 < tms.length; k++) { edges[2 * k] = wt(k); edges[2 * k + 1] = wt(k + 1); }
  return { body: id, radiusKm, et0: t[i0], et1: t[i1], points: Float64Array.from(pts), times: Float64Array.from(tms), edges, count: tms.length };
}

export interface OrbitData {
  points: Float64Array;
  times: Float64Array;
  count: number;
  /** Orbit period at the centre time, s. */
  period: number;
  /** Centre of the sample times, et. */
  et: number;
}

/**
 * Orbit period of a body at a time, from its osculating elements, s. NaN: the state is not an ellipse.
 * A body far from the Sun moves around the barycenter of the Sun and the planets that are nearer to the Sun: the
 * elements relative to the Sun change by about 1 percent in some years, the elements relative to the barycenter
 * do not. Thus the period of a body at more than 4 au comes from its state relative to the barycenter.
 */
function orbitPeriod(sys: SolarSystem, id: string, about: string, et: number): number {
  const b = BODIES[id];
  let mu = BODIES[about].gmSystem + (about === 'SUN' ? b.gmSystem : 0);
  let from = about;
  if (about === 'SUN') {
    const r = sys.stateRel(id, 'SUN', et).r;
    const dist = Math.hypot(r[0], r[1], r[2]);
    if (dist > 4 * AU) {
      from = 'SSB';
      for (const p of PLANET_IDS) {
        if (p === id) continue;
        const q = sys.stateRel(p, 'SUN', et).r;
        if (Math.hypot(q[0], q[1], q[2]) < dist) mu += BODIES[p].gmSystem;
      }
    }
  }
  try {
    const el = elementsFromState(from === 'SSB' ? sys.state(id, et) : sys.stateRel(id, about, et), mu);
    return el.e < 1 && el.a > 0 ? period(el.a, mu) : NaN;
  } catch { return NaN; }
}

/**
 * One revolution of a body around the time et: positions relative to its center (`center` = 'SSB' for a body that
 * moves around the Sun, or the id of its planet for a moon). The positions come from the ephemeris. Outside of the
 * time range of the ephemeris they come from the two-body orbit of the state at the limit of the range.
 * The point in the middle is the position at et. The last point is the first point again: an orbit is not exactly
 * closed, and the line has no gap. null: the state at et is not an ellipse.
 * into: data of an earlier call for the same number of points (the function writes into its arrays).
 */
export function sampleOrbit(sys: SolarSystem, id: string, center: string, et: number, n = 256, into: OrbitData | null = null): OrbitData | null {
  const b = BODIES[id];
  if (!b || !sys.hasBody(id)) return null;
  const about = center === 'SSB' ? 'SUN' : center;
  const mu = center === 'SSB' ? BODIES.SUN.gm + b.gmSystem : BODIES[about].gmSystem;
  const [lo0, hi0] = sys.coverage(id);
  const lo = Math.max(lo0, sys.etStart), hi = Math.min(hi0, sys.etEnd);
  const etIn = Math.max(lo, Math.min(hi, et));
  const P = orbitPeriod(sys, id, about, etIn);
  if (!(P > 0)) return null;
  const reuse = into !== null && into.count === n + 2;
  const points = reuse ? into.points : new Float64Array(3 * (n + 2)), times = reuse ? into.times : new Float64Array(n + 2);
  const w: Vec3 = [0, 0, 0];
  let edge: { et: number; rel: State; base: Vec3 } | null = null;
  for (let k = 0; k <= n; k++) {
    const tk = et + P * (k / n - 0.5);
    let r: Vec3;
    if (tk >= lo && tk <= hi) {
      r = center === 'SSB' ? sys.state(id, tk).r : sys.stateRel(id, center, tk).r;
    } else {
      const tb = tk < lo ? lo : hi;
      if (!edge || edge.et !== tb) edge = { et: tb, rel: sys.stateRel(id, about, tb), base: center === 'SSB' ? sys.state('SUN', tb).r : [0, 0, 0] };
      const s = keplerPropagate(edge.rel, tk - tb, mu);
      r = [s.r[0] + edge.base[0], s.r[1] + edge.base[1], s.r[2] + edge.base[2]];
    }
    toWorld(r, w);
    points[3 * k] = w[0]; points[3 * k + 1] = w[1]; points[3 * k + 2] = w[2];
    times[k] = tk;
  }
  points[3 * n + 3] = points[0]; points[3 * n + 4] = points[1]; points[3 * n + 5] = points[2];
  times[n + 1] = times[n];
  if (reuse) { into.period = P; into.et = et; return into; }
  return { points, times, count: n + 2, period: P, et };
}

/** Index i of the segment of a line that contains a time: times[i] <= et <= times[i + 1] (the times go up or down). */
export function segmentAt(times: ArrayLike<number>, count: number, et: number): number {
  if (count < 2) return -1;
  const up = times[count - 1] >= times[0];
  let a = 0, b = count - 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if ((times[m] <= et) === up) a = m; else b = m;
  }
  return a;
}
