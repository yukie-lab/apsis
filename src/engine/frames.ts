/**
 * Reference frames.
 *  ICRF        : International Celestial Reference Frame (aligned with the J2000 mean equator within 0.02 arcsec).
 *  ECLIPJ2000  : mean ecliptic and equinox of J2000. Rotation about +X by the obliquity 84381.448 arcsec (IAU 1976),
 *                the same definition as the SPICE frame ECLIPJ2000 and the JPL Horizons "ecliptic" plane.
 *  Body-fixed  : IAU rotation model (pole right ascension, declination, prime meridian), secular terms only.
 *  VNB, RTN    : local orbit frames for maneuvers.
 */
import { type Mat3, type State, type Vec3, cross, unit, DEG, mulMV, transpose } from './vec';
import { type Body } from './bodies';
import { DAY } from './time';

export type FrameId = 'ICRF' | 'ECLIPJ2000';
export const FRAMES: FrameId[] = ['ECLIPJ2000', 'ICRF'];

export const OBLIQUITY_J2000 = (84381.448 / 3600) * DEG;
const ce = Math.cos(OBLIQUITY_J2000), se = Math.sin(OBLIQUITY_J2000);
/** Rotation matrix: ICRF vector -> ECLIPJ2000 vector. */
export const ICRF_TO_ECLIP: Mat3 = [[1, 0, 0], [0, ce, se], [0, -se, ce]];
export const ECLIP_TO_ICRF: Mat3 = transpose(ICRF_TO_ECLIP);
/** Unit vector of the ecliptic north pole in ICRF. */
export const ECLIPTIC_POLE: Vec3 = [0, -se, ce];

export function fromIcrf(v: Vec3, frame: FrameId): Vec3 {
  return frame === 'ICRF' ? v : mulMV(ICRF_TO_ECLIP, v);
}
export function toIcrf(v: Vec3, frame: FrameId): Vec3 {
  return frame === 'ICRF' ? v : mulMV(ECLIP_TO_ICRF, v);
}
export function stateFromIcrf(s: State, frame: FrameId): State {
  return { r: fromIcrf(s.r, frame), v: fromIcrf(s.v, frame) };
}
export function stateToIcrf(s: State, frame: FrameId): State {
  return { r: toIcrf(s.r, frame), v: toIcrf(s.v, frame) };
}

/** North pole unit vector of a body in ICRF at et. */
export function poleVector(b: Body, et: number): Vec3 {
  const T = et / (36525 * DAY);
  const ra = (b.poleRa[0] + b.poleRa[1] * T) * DEG;
  const dec = (b.poleDec[0] + b.poleDec[1] * T) * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * Body-fixed axes in ICRF at et: columns x (prime meridian on the equator), y, z (north pole).
 * Returned as three unit vectors.
 */
export function bodyAxes(b: Body, et: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = poleVector(b, et);
  const d = et / DAY;
  const W = ((b.pm[0] + b.pm[1] * d) % 360) * DEG;
  // node: intersection of the body equator with the ICRF equator (ascending)
  let node = cross([0, 0, 1], z);
  node = Math.hypot(node[0], node[1], node[2]) < 1e-12 ? [1, 0, 0] : unit(node);
  const m = cross(z, node);
  const cw = Math.cos(W), sw = Math.sin(W);
  const x: Vec3 = [node[0] * cw + m[0] * sw, node[1] * cw + m[1] * sw, node[2] * cw + m[2] * sw];
  return { x, y: cross(z, x), z };
}

export type LocalFrame = 'VNB' | 'RTN' | 'ICRF' | 'ECLIPJ2000';
export const LOCAL_FRAMES: LocalFrame[] = ['VNB', 'RTN', 'ECLIPJ2000', 'ICRF'];

/**
 * Axes of a local orbit frame, as unit vectors in ICRF.
 *  VNB: V along the velocity, N along the orbit normal (r x v), B = V x N.
 *  RTN: R along the position, N along the orbit normal, T = N x R.
 * The state must be relative to the reference body of the frame.
 */
export function localAxes(frame: LocalFrame, rel: State): [Vec3, Vec3, Vec3] {
  if (frame === 'ICRF') return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (frame === 'ECLIPJ2000') return [ECLIP_TO_ICRF.map((r) => r[0]) as Vec3, ECLIP_TO_ICRF.map((r) => r[1]) as Vec3, ECLIP_TO_ICRF.map((r) => r[2]) as Vec3];
  const n = unit(cross(rel.r, rel.v));
  if (frame === 'VNB') {
    const v = unit(rel.v);
    return [v, n, cross(v, n)];
  }
  const r = unit(rel.r);
  return [r, cross(n, r), n];
}

/** Convert maneuver components in a local frame to an ICRF vector. */
export function localToIcrf(frame: LocalFrame, rel: State, c: Vec3): Vec3 {
  const [a, b, d] = localAxes(frame, rel);
  return [a[0] * c[0] + b[0] * c[1] + d[0] * c[2], a[1] * c[0] + b[1] * c[1] + d[1] * c[2], a[2] * c[0] + b[2] * c[1] + d[2] * c[2]];
}
/** Convert an ICRF vector to components in a local frame. */
export function icrfToLocal(frame: LocalFrame, rel: State, v: Vec3): Vec3 {
  const [a, b, d] = localAxes(frame, rel);
  return [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], b[0] * v[0] + b[1] * v[1] + b[2] * v[2], d[0] * v[0] + d[1] * v[1] + d[2] * v[2]];
}

/** Right ascension and declination (rad) of a direction, in the axes of the given vector. */
export function raDec(v: Vec3): { ra: number; dec: number } {
  const n = Math.hypot(v[0], v[1], v[2]);
  let ra = Math.atan2(v[1], v[0]);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec: Math.asin(v[2] / n) };
}
