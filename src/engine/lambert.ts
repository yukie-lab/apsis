/**
 * Lambert problem: find the two-body orbit that connects two positions in a given time.
 * Algorithm: D. Izzo, "Revisiting Lambert's problem", Celestial Mechanics and Dynamical Astronomy 121 (2015).
 * Multi-revolution solutions are included.
 */
import { type Vec3, cross, dot, norm, scale, unit, lincomb } from './vec';

export interface LambertSolution {
  v1: Vec3;
  v2: Vec3;
  /** Number of complete revolutions. */
  revs: number;
  /** For revs > 0: 'low' and 'high' are the two solutions (low-energy path first in x). */
  branch: 'single' | 'left' | 'right';
}

export interface LambertOptions {
  /** Maximum number of complete revolutions (default 0). */
  maxRevs?: number;
  /** If true, the transfer goes opposite to the reference direction. */
  retrograde?: boolean;
  /** Normal vector that defines the prograde direction (default: +z of the frame). */
  refNormal?: Vec3;
}

function hypergeometricF(z: number, tol: number): number {
  let Sj = 1, Cj = 1, err = 1, j = 0;
  while (err > tol && j < 500) {
    const Cj1 = (Cj * (3 + j) * (1 + j)) / (2.5 + j) * z / (j + 1);
    Sj += Cj1;
    err = Math.abs(Cj1);
    Cj = Cj1;
    j++;
  }
  return Sj;
}

function x2tof(x: number, N: number, lambda: number): number {
  const battin = 0.01, lagrange = 0.2;
  const dist = Math.abs(x - 1);
  const l2 = lambda * lambda;
  if (dist < lagrange && dist > battin) {
    const a = 1 / (1 - x * x);
    if (a > 0) {
      const alfa = 2 * Math.acos(x);
      let beta = 2 * Math.asin(Math.sqrt(l2 / a));
      if (lambda < 0) beta = -beta;
      return (a * Math.sqrt(a) * (alfa - Math.sin(alfa) - (beta - Math.sin(beta)) + 2 * Math.PI * N)) / 2;
    }
    const alfa = 2 * Math.acosh(x);
    let beta = 2 * Math.asinh(Math.sqrt(-l2 / a));
    if (lambda < 0) beta = -beta;
    return (-a * Math.sqrt(-a) * (beta - Math.sinh(beta) - (alfa - Math.sinh(alfa)))) / 2;
  }
  const E = x * x - 1;
  const rho = Math.abs(E);
  const z = Math.sqrt(1 + l2 * E);
  if (dist < battin) {
    const eta = z - lambda * x;
    const S1 = 0.5 * (1 - lambda - x * eta);
    const Q = (hypergeometricF(S1, 1e-13) * 4) / 3;
    return (eta * eta * eta * Q + 4 * lambda * eta) / 2 + (N * Math.PI) / Math.pow(rho, 1.5);
  }
  const y = Math.sqrt(rho);
  const g = x * z - lambda * E;
  let d: number;
  if (E < 0) {
    d = N * Math.PI + Math.acos(Math.max(-1, Math.min(1, g)));
  } else {
    const f = y * (z - lambda * x);
    d = Math.log(f + g);
  }
  return (x - lambda * z - d / y) / E;
}

function dTdx(x: number, T: number, lambda: number): [number, number, number] {
  const l2 = lambda * lambda, l3 = l2 * lambda;
  const umx2 = 1 - x * x;
  const y = Math.sqrt(1 - l2 * umx2);
  const y2 = y * y, y3 = y2 * y;
  const DT = (1 / umx2) * (3 * T * x - 2 + (2 * l3 * x) / y);
  const DDT = (1 / umx2) * (3 * T + 5 * x * DT + (2 * (1 - l2) * l3) / y3);
  const DDDT = (1 / umx2) * (7 * x * DDT + 8 * DT - (6 * (1 - l2) * l2 * l3 * x) / (y3 * y2));
  return [DT, DDT, DDDT];
}

function householder(T: number, x0: number, N: number, lambda: number, eps: number, itMax: number): number {
  let x = x0;
  for (let it = 0; it < itMax; it++) {
    const tof = x2tof(x, N, lambda);
    const [DT, DDT, DDDT] = dTdx(x, tof, lambda);
    const delta = tof - T;
    const DT2 = DT * DT;
    const xn = x - (delta * (DT2 - (delta * DDT) / 2)) / (DT * (DT2 - delta * DDT) + (DDDT * delta * delta) / 6);
    const err = Math.abs(x - xn);
    x = xn;
    if (err < eps) break;
  }
  return x;
}

/**
 * Solve the Lambert problem.
 * @param mu  gravitational parameter, km^3/s^2
 * @param r1  start position, km
 * @param r2  end position, km
 * @param tof time of flight, s (> 0)
 * @returns   all solutions up to maxRevs. The first entry is the zero-revolution solution.
 */
export function lambert(mu: number, r1: Vec3, r2: Vec3, tof: number, opt: LambertOptions = {}): LambertSolution[] {
  if (!(tof > 0)) return [];
  const R1 = norm(r1), R2 = norm(r2);
  const cv: Vec3 = [r2[0] - r1[0], r2[1] - r1[1], r2[2] - r1[2]];
  const c = norm(cv);
  const s = (c + R1 + R2) / 2;
  const ir1 = unit(r1), ir2 = unit(r2);
  let ih = cross(ir1, ir2);
  const ihn = norm(ih);
  const ref = opt.refNormal ?? [0, 0, 1];
  if (ihn < 1e-12) {
    // 180 degree (or 0 degree) transfer: the plane is not defined. Use the reference normal.
    ih = unit(lincomb(ref, 1, ir1, -dot(ref, ir1)));
  } else {
    ih = scale(ih, 1 / ihn);
  }
  const l2 = 1 - c / s;
  let lambda = Math.sqrt(Math.max(0, l2));
  let it1: Vec3, it2: Vec3;
  if (dot(ih, ref) < 0) {
    lambda = -lambda;
    it1 = cross(ir1, ih);
    it2 = cross(ir2, ih);
  } else {
    it1 = cross(ih, ir1);
    it2 = cross(ih, ir2);
  }
  it1 = unit(it1); it2 = unit(it2);
  if (opt.retrograde) {
    lambda = -lambda;
    it1 = scale(it1, -1);
    it2 = scale(it2, -1);
  }
  const l3 = lambda * l2;
  const T = Math.sqrt((2 * mu) / (s * s * s)) * tof;

  // --- find all x
  const xs: { x: number; revs: number; branch: LambertSolution['branch'] }[] = [];
  let Mmax = Math.min(opt.maxRevs ?? 0, Math.floor(T / Math.PI));
  const T00 = Math.acos(lambda) + lambda * Math.sqrt(1 - l2);
  const T0 = T00 + Mmax * Math.PI;
  const T1 = (2 / 3) * (1 - l3);
  if (Mmax > 0 && T < T0) {
    // Halley iterations to find the minimum time of flight for Mmax revolutions
    let xOld = 0, Tmin = T0, xNew = 0;
    for (let it = 0; it < 14; it++) {
      const [DT, DDT, DDDT] = dTdx(xOld, Tmin, lambda);
      if (DT !== 0) xNew = xOld - (DT * DDT) / (DDT * DDT - (DT * DDDT) / 2);
      const err = Math.abs(xOld - xNew);
      Tmin = x2tof(xNew, Mmax, lambda);
      xOld = xNew;
      if (err < 1e-13) break;
    }
    if (Tmin > T) Mmax -= 1;
  }
  let x0: number;
  if (T >= T00) x0 = -(T - T00) / (T - T00 + 4);
  else if (T <= T1) x0 = (T1 * (T1 - T)) / ((2 / 5) * (1 - l2 * l3) * T) + 1;
  else x0 = Math.pow(T / T00, 0.69314718055994529 / Math.log(T1 / T00)) - 1;
  xs.push({ x: householder(T, x0, 0, lambda, 1e-14, 30), revs: 0, branch: 'single' });
  for (let i = 1; i <= Mmax; i++) {
    let tmp = Math.pow((i * Math.PI + Math.PI) / (8 * T), 2 / 3);
    xs.push({ x: householder(T, (tmp - 1) / (tmp + 1), i, lambda, 1e-13, 30), revs: i, branch: 'left' });
    tmp = Math.pow((8 * T) / (i * Math.PI), 2 / 3);
    xs.push({ x: householder(T, (tmp - 1) / (tmp + 1), i, lambda, 1e-13, 30), revs: i, branch: 'right' });
  }

  // --- velocities
  const gamma = Math.sqrt((mu * s) / 2);
  const rho = (R1 - R2) / c;
  const sigma = Math.sqrt(Math.max(0, 1 - rho * rho));
  const out: LambertSolution[] = [];
  for (const { x, revs, branch } of xs) {
    if (!isFinite(x)) continue;
    const y = Math.sqrt(1 - l2 + l2 * x * x);
    const vr1 = (gamma * (lambda * y - x - rho * (lambda * y + x))) / R1;
    const vr2 = (-gamma * (lambda * y - x + rho * (lambda * y + x))) / R2;
    const vt = gamma * sigma * (y + lambda * x);
    out.push({
      v1: lincomb(ir1, vr1, it1, vt / R1),
      v2: lincomb(ir2, vr2, it2, vt / R2),
      revs,
      branch,
    });
  }
  return out;
}
