/**
 * Two-body (Kepler) orbit functions.
 * Units: km, km/s, s, rad. mu is the gravitational parameter GM (km^3/s^2).
 */
import { type State, type Vec3, cross, dot, norm, scale, sub, lincomb, wrap2pi, TWO_PI } from './vec';

export interface Elements {
  /** Semi-major axis, km. Negative for a hyperbola. Infinity for a parabola. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination, rad. */
  i: number;
  /** Right ascension (or longitude) of the ascending node, rad. */
  raan: number;
  /** Argument of periapsis, rad. */
  argp: number;
  /** True anomaly, rad. */
  nu: number;
  /** Semi-latus rectum, km. */
  p: number;
}

/** Classical elements from a state vector. The reference plane is the x-y plane of the frame of the state. */
export function elementsFromState(s: State, mu: number): Elements {
  const { r, v } = s;
  const R = norm(r);
  const V2 = dot(v, v);
  const h = cross(r, v);
  const H = norm(h);
  const n: Vec3 = [-h[1], h[0], 0];
  const N = norm(n);
  const rv = dot(r, v);
  const ev: Vec3 = lincomb(r, (V2 - mu / R) / mu, v, -rv / mu);
  const e = norm(ev);
  const energy = V2 / 2 - mu / R;
  const p = (H * H) / mu;
  const a = Math.abs(energy) < 1e-14 * (mu / R) ? Infinity : -mu / (2 * energy);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / H)));
  const eps = 1e-11;
  let raan = 0, argp = 0, nu = 0;
  if (N > eps * H) {
    raan = wrap2pi(Math.atan2(n[1], n[0]));
    if (e > eps) {
      argp = Math.acos(Math.max(-1, Math.min(1, dot(n, ev) / (N * e))));
      if (ev[2] < 0) argp = TWO_PI - argp;
    }
  } else if (e > eps) {
    // equatorial: argument of periapsis becomes the longitude of periapsis
    argp = wrap2pi(Math.atan2(ev[1], ev[0]) * (h[2] < 0 ? -1 : 1));
  }
  if (e > eps) {
    nu = Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * R))));
    if (rv < 0) nu = TWO_PI - nu;
  } else if (N > eps * H) {
    // circular inclined: argument of latitude
    nu = Math.acos(Math.max(-1, Math.min(1, dot(n, r) / (N * R))));
    if (r[2] < 0) nu = TWO_PI - nu;
  } else {
    nu = wrap2pi(Math.atan2(r[1], r[0]) * (h[2] < 0 ? -1 : 1));
  }
  return { a, e, i, raan, argp, nu, p };
}

/** State vector from classical elements (uses p, e, i, raan, argp, nu). */
export function stateFromElements(el: Pick<Elements, 'p' | 'e' | 'i' | 'raan' | 'argp' | 'nu'>, mu: number): State {
  const { p, e, i, raan, argp, nu } = el;
  const cnu = Math.cos(nu), snu = Math.sin(nu);
  const rmag = p / (1 + e * cnu);
  const k = Math.sqrt(mu / p);
  const rp: Vec3 = [rmag * cnu, rmag * snu, 0];
  const vp: Vec3 = [-k * snu, k * (e + cnu), 0];
  const cO = Math.cos(raan), sO = Math.sin(raan), cw = Math.cos(argp), sw = Math.sin(argp), ci = Math.cos(i), si = Math.sin(i);
  const m00 = cO * cw - sO * sw * ci, m01 = -cO * sw - sO * cw * ci;
  const m10 = sO * cw + cO * sw * ci, m11 = -sO * sw + cO * cw * ci;
  const m20 = sw * si, m21 = cw * si;
  return {
    r: [m00 * rp[0] + m01 * rp[1], m10 * rp[0] + m11 * rp[1], m20 * rp[0] + m21 * rp[1]],
    v: [m00 * vp[0] + m01 * vp[1], m10 * vp[0] + m11 * vp[1], m20 * vp[0] + m21 * vp[1]],
  };
}

/** Semi-latus rectum from a and e. */
export const semiLatus = (a: number, e: number): number => a * (1 - e * e);

/** Stumpff functions C(z) and S(z). */
export function stumpff(z: number): [number, number] {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return [(1 - Math.cos(s)) / z, (s - Math.sin(s)) / (s * z)];
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return [(1 - Math.cosh(s)) / z, (Math.sinh(s) - s) / (s * -z)];
  }
  // series near zero
  return [1 / 2 - z / 24 + (z * z) / 720, 1 / 6 - z / 120 + (z * z) / 5040];
}

/**
 * Propagate a state by dt seconds on a two-body orbit (universal variable formulation).
 * Valid for ellipses, parabolas and hyperbolas.
 */
export function keplerPropagate(s: State, dt: number, mu: number): State {
  if (dt === 0) return { r: [...s.r] as Vec3, v: [...s.v] as Vec3 };
  const { r, v } = s;
  const r0 = norm(r);
  const v2 = dot(v, v);
  const rv = dot(r, v);
  const sqmu = Math.sqrt(mu);
  const alpha = 2 / r0 - v2 / mu; // 1/a
  // initial value of the universal anomaly
  let x: number;
  if (alpha > 1e-12 / r0) {
    x = sqmu * dt * alpha;
  } else if (Math.abs(alpha) <= 1e-12 / r0) {
    const h = norm(cross(r, v));
    const p = (h * h) / mu;
    const sgm = Math.atan(1 / (3 * Math.sqrt(mu / (p * p * p)) * dt)) / 2;
    const w = Math.atan(Math.cbrt(Math.tan(sgm)));
    x = (Math.sqrt(p) * 2) / Math.tan(2 * w);
  } else {
    const a = 1 / alpha;
    x = Math.sign(dt) * Math.sqrt(-a) * Math.log((-2 * mu * alpha * dt) / (rv + Math.sign(dt) * Math.sqrt(-mu * a) * (1 - r0 * alpha)));
  }
  const f = (xx: number): [number, number, number, number] => {
    const z = xx * xx * alpha;
    const [C, S] = stumpff(z);
    const F = (rv / sqmu) * xx * xx * C + (1 - alpha * r0) * xx * xx * xx * S + r0 * xx - sqmu * dt;
    const dF = (rv / sqmu) * xx * (1 - z * S) + (1 - alpha * r0) * xx * xx * C + r0;
    return [F, dF, C, S];
  };
  // Newton iteration with a bisection safeguard
  let lo = -Infinity, hi = Infinity;
  let C = 0, S = 0;
  for (let it = 0; it < 80; it++) {
    const [F, dF, c, ss] = f(x);
    C = c; S = ss;
    if (F > 0) hi = Math.min(hi, x); else lo = Math.max(lo, x);
    let xn = x - F / dF;
    if (!(xn > lo && xn < hi) || !isFinite(xn)) {
      xn = isFinite(lo) && isFinite(hi) ? 0.5 * (lo + hi) : x - Math.sign(F) * Math.max(1, Math.abs(x)) ;
    }
    if (Math.abs(xn - x) <= 1e-14 * Math.max(1, Math.abs(xn))) { x = xn; [, , C, S] = f(x); break; }
    x = xn;
  }
  const x2 = x * x;
  const fg = 1 - (x2 / r0) * C;
  const g = dt - (x2 * x * S) / sqmu;
  const rn = lincomb(r, fg, v, g);
  const R = norm(rn);
  const z = x2 * alpha;
  const gd = 1 - (x2 / R) * C;
  const fd = (sqmu / (R * r0)) * x * (z * S - 1);
  return { r: rn, v: lincomb(r, fd, v, gd) };
}

/** Orbit period (s) of an ellipse. */
export const period = (a: number, mu: number): number => TWO_PI * Math.sqrt((a * a * a) / mu);

/** Eccentric (or hyperbolic) anomaly and mean anomaly from the true anomaly. */
export function meanFromTrue(nu: number, e: number): number {
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return E - e * Math.sin(E);
  }
  const F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
  return e * Math.sinh(F) - F;
}

/** True anomaly from the mean anomaly (solves the Kepler equation). */
export function trueFromMean(M: number, e: number): number {
  if (e < 1) {
    let m = M % TWO_PI;
    if (m > Math.PI) m -= TWO_PI; else if (m < -Math.PI) m += TWO_PI;
    let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
    for (let k = 0; k < 60; k++) {
      const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-15) break;
    }
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  }
  let F = Math.asinh(M / e);
  for (let k = 0; k < 80; k++) {
    const d = (e * Math.sinh(F) - F - M) / (e * Math.cosh(F) - 1);
    F -= d;
    if (Math.abs(d) < 1e-15 * Math.max(1, Math.abs(F))) break;
  }
  return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(F / 2));
}

/** Time after periapsis passage (s) for a state. Negative before periapsis on an open orbit. */
export function timeSincePeriapsis(el: Elements, mu: number): number {
  if (el.e < 1) {
    const n = Math.sqrt(mu / (el.a * el.a * el.a));
    let M = meanFromTrue(el.nu, el.e);
    if (M < 0) M += TWO_PI;
    return M / n;
  }
  const nu = el.nu > Math.PI ? el.nu - TWO_PI : el.nu;
  const n = Math.sqrt(mu / (-el.a * el.a * el.a));
  return meanFromTrue(nu, el.e) / n;
}

/** Sample points of the conic arc from state s forward by duration (s). Returns positions (km). */
export function sampleArc(s: State, duration: number, mu: number, count: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= count; k++) pts.push(keplerPropagate(s, (duration * k) / count, mu).r);
  return pts;
}

export const visViva = (mu: number, r: number, a: number): number => Math.sqrt(mu * (2 / r - 1 / a));
export const circularSpeed = (mu: number, r: number): number => Math.sqrt(mu / r);
export const escapeSpeed = (mu: number, r: number): number => Math.sqrt((2 * mu) / r);

/** Periapsis and apoapsis radius (km). Apoapsis is Infinity for an open orbit. */
export function apsides(el: Elements): { rp: number; ra: number } {
  const rp = el.p / (1 + el.e);
  return { rp, ra: el.e < 1 ? el.p / (1 - el.e) : Infinity };
}

/** Relative state helper. */
export const relState = (a: State, b: State): State => ({ r: sub(a.r, b.r), v: sub(a.v, b.v) });
export const scaleState = (s: State, k: number): State => ({ r: scale(s.r, k), v: scale(s.v, k) });
