/**
 * Tisserand graph: the heliocentric orbits that a spacecraft can have after a flyby of a planet, for a given speed
 * at infinity. Model: circular, coplanar planet orbits (the standard assumption of this graph).
 *
 * For a planet at radius R with circular speed V = sqrt(mu / R), and a spacecraft with speed at infinity vinf and
 * pump angle alpha (angle between the planet velocity and the v-infinity vector):
 *   v^2 = V^2 + vinf^2 + 2 V vinf cos(alpha)        heliocentric speed
 *   h   = R (V + vinf cos(alpha))                   angular momentum (v-infinity in the orbit plane of the planet)
 *   a   = 1 / (2 / R - v^2 / mu),  e = sqrt(1 - h^2 / (mu a))
 * A flyby changes alpha and keeps vinf: the spacecraft moves along a curve of constant vinf.
 */
import { GM_SUN } from './bodies';

export interface TisserandPoint {
  /** Pump angle, rad. */
  alpha: number;
  /** Periapsis and apoapsis radius of the heliocentric orbit, km. Apoapsis = Infinity for an escape orbit. */
  rp: number;
  ra: number;
  /** Period, s (Infinity for an escape orbit). */
  period: number;
  a: number;
  e: number;
}

/** Orbit after a flyby with pump angle alpha. */
export function tisserandPoint(planetRadius: number, vinf: number, alpha: number, mu = GM_SUN): TisserandPoint {
  const V = Math.sqrt(mu / planetRadius);
  const c = Math.cos(alpha);
  const v2 = V * V + vinf * vinf + 2 * V * vinf * c;
  const h = planetRadius * (V + vinf * c);
  const energy = v2 / 2 - mu / planetRadius;
  const p = (h * h) / mu;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
  const rp = p / (1 + e);
  if (energy >= 0) return { alpha, rp, ra: Infinity, period: Infinity, a: Infinity, e };
  const a = -mu / (2 * energy);
  return { alpha, rp, ra: a * (1 + e), period: 2 * Math.PI * Math.sqrt((a * a * a) / mu), a, e };
}

/** Curve of constant vinf: pump angle from 0 (maximum energy) to pi (minimum energy). */
export function tisserandCurve(planetRadius: number, vinf: number, count = 91, mu = GM_SUN): TisserandPoint[] {
  return Array.from({ length: count }, (_, k) => tisserandPoint(planetRadius, vinf, (Math.PI * k) / (count - 1), mu));
}

/** Tisserand parameter of a heliocentric orbit (semi-major axis a, eccentricity e, inclination i) for a planet at radius R. */
export function tisserandParameter(planetRadius: number, a: number, e: number, inc = 0): number {
  return planetRadius / a + 2 * Math.sqrt((a / planetRadius) * (1 - e * e)) * Math.cos(inc);
}

/** Speed at infinity (km/s) at a planet at radius R for a heliocentric orbit with the Tisserand parameter T. */
export function vinfFromTisserand(planetRadius: number, T: number, mu = GM_SUN): number {
  return Math.sqrt(mu / planetRadius) * Math.sqrt(Math.max(0, 3 - T));
}

/**
 * Change of the pump angle for one flyby at the periapsis radius rp of a planet with the gravity parameter gm:
 * the maximum turn of the v-infinity vector, rad.
 */
export function maxPumpStep(gm: number, vinf: number, rp: number): number {
  return 2 * Math.asin(1 / (1 + (rp * vinf * vinf) / gm));
}
