/**
 * Gravity-assist (flyby) geometry in the patched-conic model.
 * All velocities are relative to the flyby body (v-infinity vectors), km/s.
 */
import { type State, type Vec3, angle, cross, dot, norm, unit, lincomb, scale, sub, rotateAbout } from './vec';

export interface FlybyResult {
  /** Speed at infinity before and after the flyby, km/s. */
  vinfIn: number;
  vinfOut: number;
  /** Angle between the two asymptotes, rad. */
  turn: number;
  /** Periapsis radius, km, that gives the turn angle (after the limit is applied). */
  rp: number;
  /** Periapsis radius that an unpowered flyby needs, km (can be below the limit or below the surface). */
  rpNeeded: number;
  /** Velocity change of the engine at the flyby, km/s. 0 for a feasible unpowered flyby with equal speeds. */
  dv: number;
  /** True if the periapsis limit made a correction necessary. */
  limited: boolean;
  /** Maximum turn angle at the periapsis limit, rad. */
  maxTurn: number;
}

/** Turn angle (rad) of an unpowered flyby with speed vinf (km/s) and periapsis radius rp (km). */
export function turnAngle(mu: number, vinf: number, rp: number): number {
  return 2 * Math.asin(1 / (1 + (rp * vinf * vinf) / mu));
}

/** Periapsis radius (km) of an unpowered flyby that turns the asymptote by `turn` (rad). */
export function periapsisForTurn(mu: number, vinf: number, turn: number): number {
  return (mu / (vinf * vinf)) * (1 / Math.sin(turn / 2) - 1);
}

/**
 * Flyby that connects an incoming and an outgoing v-infinity vector.
 * Model: one impulse at the periapsis that is common to the two hyperbola branches (powered flyby).
 * If the necessary periapsis is below rpMin, the periapsis is set to rpMin and the remaining direction error is
 * corrected by an impulse after the flyby (upper limit of the cost).
 */
export function flyby(mu: number, vIn: Vec3, vOut: Vec3, rpMin: number): FlybyResult {
  const a = norm(vIn), b = norm(vOut);
  const turn = angle(vIn, vOut);
  const half = (v: number, rp: number) => Math.asin(1 / (1 + (rp * v * v) / mu));
  const total = (rp: number) => half(a, rp) + half(b, rp);
  const maxTurn = total(rpMin);
  const vmean = Math.sqrt(a * b);
  const rpNeededUnpowered = turn > 1e-12 ? periapsisForTurn(mu, vmean, turn) : Infinity;
  if (turn <= 1e-12) {
    return { vinfIn: a, vinfOut: b, turn, rp: Infinity, rpNeeded: Infinity, dv: Math.abs(b - a), limited: false, maxTurn };
  }
  if (turn > maxTurn) {
    // Limit reached. Turn by maxTurn at rpMin, then correct the direction with one impulse.
    const dvPeri = Math.abs(Math.sqrt(b * b + (2 * mu) / rpMin) - Math.sqrt(a * a + (2 * mu) / rpMin));
    const rest = turn - maxTurn;
    const dvDir = 2 * b * Math.sin(rest / 2);
    return { vinfIn: a, vinfOut: b, turn, rp: rpMin, rpNeeded: rpNeededUnpowered, dv: dvPeri + dvDir, limited: true, maxTurn };
  }
  // Solve total(rp) = turn for rp >= rpMin (total decreases when rp increases).
  let lo = rpMin, hi = Math.max(rpMin * 2, 1);
  while (total(hi) > turn) hi *= 2;
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi);
    if (total(mid) > turn) lo = mid; else hi = mid;
    if (hi - lo < 1e-9 * hi) break;
  }
  const rp = 0.5 * (lo + hi);
  const dv = Math.abs(Math.sqrt(b * b + (2 * mu) / rp) - Math.sqrt(a * a + (2 * mu) / rp));
  return { vinfIn: a, vinfOut: b, turn, rp, rpNeeded: rpNeededUnpowered, dv, limited: false, maxTurn };
}

export interface BPlane {
  /** Unit vector of the incoming asymptote. */
  S: Vec3;
  T: Vec3;
  R: Vec3;
  /** B vector, km. */
  B: Vec3;
  BdotT: number;
  BdotR: number;
  /** Speed at infinity, km/s. */
  vinf: number;
  /** Periapsis radius, km. */
  rp: number;
  /** Eccentricity. */
  e: number;
  /** Incoming and outgoing v-infinity vectors, km/s. */
  vinfIn: Vec3;
  vinfOut: Vec3;
  /** Time from the state to the periapsis, s (negative: the periapsis is in the past). */
  timeToPeriapsis: number;
}

/**
 * B-plane parameters of a hyperbolic state relative to a body.
 * T = S x pole / |S x pole|, R = S x T, where `pole` is the reference direction (default: +z of the frame).
 * Returns null if the orbit is not hyperbolic.
 */
export function bPlane(rel: State, mu: number, pole: Vec3 = [0, 0, 1]): BPlane | null {
  const { r, v } = rel;
  const R0 = norm(r);
  const v2 = dot(v, v);
  const energy = v2 / 2 - mu / R0;
  if (energy <= 0) return null;
  const h = cross(r, v);
  const ev = lincomb(r, (v2 - mu / R0) / mu, v, -dot(r, v) / mu);
  const e = norm(ev);
  const a = -mu / (2 * energy);
  const vinf = Math.sqrt(2 * energy);
  const P = unit(ev);
  const Q = unit(cross(h, ev));
  const k = Math.sqrt(e * e - 1);
  const S = lincomb(P, 1 / e, Q, k / e);
  const Sout = lincomb(P, -1 / e, Q, k / e);
  const b = -a * k;
  const Bhat = lincomb(P, k / e, Q, -1 / e);
  const B = scale(Bhat, b);
  const T = unit(cross(S, pole));
  const Rv = cross(S, T);
  // time to periapsis from the hyperbolic anomaly
  const rp = -a * (e - 1);
  // r.v = sqrt(mu |a|) e sinh F. This form has no singular point (the true anomaly form fails near the asymptote).
  const eSinhF = dot(r, v) / Math.sqrt(mu * -a);
  const F = Math.asinh(eSinhF / e);
  const n = Math.sqrt(mu / (-a * a * a));
  const tSince = (eSinhF - F) / n;
  return {
    S, T, R: Rv, B, BdotT: dot(B, T), BdotR: dot(B, Rv), vinf, rp, e,
    vinfIn: scale(S, vinf), vinfOut: scale(Sout, vinf), timeToPeriapsis: -tSince,
  };
}

/**
 * State relative to a body on the hyperbola with the incoming v-infinity vector `vinfIn` and the aim point
 * (B.T, B.R), at the time `timeToPeriapsis` before the periapsis (negative: after the periapsis).
 * This is the inverse of bPlane(). T = S x pole / |S x pole|, R = S x T.
 */
export function stateFromBPlane(mu: number, vinfIn: Vec3, BdotT: number, BdotR: number, timeToPeriapsis: number, pole: Vec3 = [0, 0, 1]): State {
  const vinf = norm(vinfIn);
  const S = unit(vinfIn);
  const T = unit(cross(S, pole));
  const R = cross(S, T);
  const B = lincomb(T, BdotT, R, BdotR);
  const b = norm(B);
  const a = mu / (vinf * vinf);
  const k = b / a;
  const e = Math.sqrt(1 + k * k);
  const Bh = b > 0 ? scale(B, 1 / b) : T;
  // S = P / e + Q k / e and B/b = P k / e - Q / e (see bPlane)
  const P = lincomb(S, 1 / e, Bh, k / e);
  const Q = lincomb(S, k / e, Bh, -1 / e);
  // hyperbolic Kepler equation: e sinh F - F = M, where M = -n * timeToPeriapsis
  const M = -Math.sqrt(mu / (a * a * a)) * timeToPeriapsis;
  let F = Math.asinh(M / e);
  for (let it = 0; it < 80; it++) {
    const d = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1);
    F -= d;
    if (Math.abs(d) < 1e-15 * Math.max(1, Math.abs(F))) break;
  }
  const ch = Math.cosh(F), sh = Math.sinh(F);
  const f = Math.sqrt(mu / a) / (e * ch - 1);
  return { r: lincomb(P, a * (e - ch), Q, a * k * sh), v: lincomb(P, -f * sh, Q, f * k * ch) };
}

/**
 * B vector target of an unpowered flyby that turns vIn toward vOut with periapsis radius rp.
 * Returns B.T and B.R in the plane defined by the incoming asymptote and `pole`.
 */
export function bPlaneTarget(mu: number, vIn: Vec3, vOut: Vec3, rp: number, pole: Vec3 = [0, 0, 1]): { BdotT: number; BdotR: number; b: number } {
  const vinf = norm(vIn);
  const S = unit(vIn);
  const b = rp * Math.sqrt(1 + (2 * mu) / (rp * vinf * vinf));
  // The velocity change points to the body side: the periapsis direction is opposite to (Sout - Sin).
  const d = sub(unit(vOut), S);
  let p = scale(d, -1);
  p = lincomb(p, 1, S, -dot(p, S));
  const Bhat = unit(p);
  const T = unit(cross(S, pole));
  const R = cross(S, T);
  return { BdotT: b * dot(Bhat, T), BdotR: b * dot(Bhat, R), b };
}

/**
 * Outgoing v-infinity vector of an unpowered flyby.
 * @param vIn   incoming v-infinity vector
 * @param rp    periapsis radius, km
 * @param beta  angle of the flyby plane about the incoming asymptote, rad. beta = 0 turns the velocity toward `ref`.
 */
export function flybyOut(mu: number, vIn: Vec3, rp: number, beta: number, ref: Vec3): Vec3 {
  const vinf = norm(vIn);
  const S = unit(vIn);
  const delta = turnAngle(mu, vinf, rp);
  let i = lincomb(ref, 1, S, -dot(ref, S));
  if (norm(i) < 1e-9) i = lincomb([1, 0, 0], 1, S, -S[0]);
  i = unit(i);
  const dir = rotateAbout(i, S, beta);
  return lincomb(S, vinf * Math.cos(delta), dir, vinf * Math.sin(delta));
}
