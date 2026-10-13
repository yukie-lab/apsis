/**
 * Solar system model: positions and velocities of all bodies at any time in the range of the data.
 * Output states are relative to the solar system barycentre (SSB) in ICRF, km and km/s, unless a centre is given.
 *
 *  Sun, planets, Moon, Pluto : Chebyshev fit of JPL DE440 (ephem.bin).
 *  Planet centres of Jupiter, Saturn, Uranus, Neptune and Pluto : system barycentre minus the mass-weighted
 *    positions of the modelled moons.
 *  Moons of other planets : analytic model (data/moons.json).
 *  Small bodies : Chebyshev fit of JPL Horizons vectors (small.bin), 1980 to 2060.
 *  Custom bodies : two-body orbit around the Sun from user elements.
 */
import { ChebyshevEphemeris } from './ephemeris';
import { type State, type Vec3, add, sub, lincomb } from './vec';
import { BODIES, MOON_MODELS, type MoonModel, GM_SUN, registerCustomBody, removeCustomBody } from './bodies';
import { keplerPropagate, stateFromElements } from './kepler';

const DIRECT: Record<string, string> = {
  SUN: 'SUN', MERCURY: 'MERCURY', VENUS: 'VENUS', EMB: 'EMB', MARS: 'MARS',
  JUPITER_BARYCENTER: 'JUPITER', SATURN_BARYCENTER: 'SATURN', URANUS_BARYCENTER: 'URANUS',
  NEPTUNE_BARYCENTER: 'NEPTUNE', PLUTO_BARYCENTER: 'PLUTO', MARS_BARYCENTER: 'MARS',
};
const SYSTEM_OF: Record<string, string> = { JUPITER: 'JUPITER', SATURN: 'SATURN', URANUS: 'URANUS', NEPTUNE: 'NEPTUNE', PLUTO: 'PLUTO' };

export interface CustomBody {
  id: string;
  name: string;
  /** Heliocentric elements in ECLIPJ2000 at the epoch (km, rad). */
  a: number; e: number; i: number; raan: number; argp: number; M0: number;
  epochEt: number;
}

function moonBasis(m: MoonModel): { X: Vec3; Y: Vec3; Z: Vec3 } {
  const cd = Math.cos(m.poleDec);
  const Z: Vec3 = [cd * Math.cos(m.poleRa), cd * Math.sin(m.poleRa), Math.sin(m.poleDec)];
  const n = Math.hypot(Z[0], Z[1]);
  const X: Vec3 = [-Z[1] / n, Z[0] / n, 0];
  const Y: Vec3 = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  return { X, Y, Z };
}
const MOON_BASIS: Record<string, { X: Vec3; Y: Vec3; Z: Vec3 }> = Object.fromEntries(
  Object.entries(MOON_MODELS).map(([k, m]) => [k, moonBasis(m)]),
);

/** State of a moon relative to the centre of its planet (analytic model). */
export function moonState(id: string, et: number): State {
  const m = MOON_MODELS[id];
  const { X, Y, Z } = MOON_BASIS[id];
  const node = m.node0 + m.nodeRate * et;
  const peri = m.peri0 + m.periRate * et;
  const lib = m.libAmp * Math.sin(m.libRate * et + m.libPhase);
  const M = m.L0 + m.n * et + lib - peri;
  const nEff = m.n + m.libAmp * m.libRate * Math.cos(m.libRate * et + m.libPhase) - m.periRate;
  let E = M;
  for (let k = 0; k < 15; k++) {
    const d = (E - m.e * Math.sin(E) - M) / (1 - m.e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = Math.sqrt(1 - m.e * m.e);
  const w = peri - node;
  // perifocal position and velocity
  const xp = m.a * (cE - m.e), yp = m.a * b * sE;
  const Edot = nEff / (1 - m.e * cE);
  const vxp = -m.a * sE * Edot, vyp = m.a * b * cE * Edot;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), ci = Math.cos(m.inc), si = Math.sin(m.inc);
  const rot = (x: number, y: number): Vec3 => {
    const x1 = cw * x - sw * y, y1 = sw * x + cw * y; // in-plane rotation by the argument of periapsis
    const px = cO * x1 - sO * ci * y1;
    const py = sO * x1 + cO * ci * y1;
    const pz = si * y1;
    return [px * X[0] + py * Y[0] + pz * Z[0], px * X[1] + py * Y[1] + pz * Z[1], px * X[2] + py * Y[2] + pz * Z[2]];
  };
  // The slow rotation of the orbit (node and periapsis rates) adds a small velocity term.
  const r = rot(xp, yp);
  const v = rot(vxp, vyp);
  const wz = m.periRate; // approximate: rotation about the reference pole
  v[0] += wz * (Z[1] * r[2] - Z[2] * r[1]);
  v[1] += wz * (Z[2] * r[0] - Z[0] * r[2]);
  v[2] += wz * (Z[0] * r[1] - Z[1] * r[0]);
  return { r, v };
}

export class SolarSystem {
  readonly custom = new Map<string, CustomBody>();
  private readonly earthFactor: number;
  private readonly moonsOf: Record<string, { id: string; ratio: number }[]> = {};

  constructor(readonly planets: ChebyshevEphemeris, readonly small?: ChebyshevEphemeris) {
    const gmE = BODIES.EARTH.gm, gmM = BODIES.MOON.gm;
    this.earthFactor = gmM / (gmE + gmM);
    for (const id of Object.keys(MOON_MODELS)) {
      const planet = BODIES[id].parent!;
      if (!SYSTEM_OF[planet]) continue;
      (this.moonsOf[planet] ??= []).push({ id, ratio: BODIES[id].gm / BODIES[planet].gmSystem });
    }
  }

  /** Add a body that the user defines by heliocentric orbit elements. */
  addCustom(c: CustomBody, radiusKm = 1): void {
    registerCustomBody(c.id, radiusKm);
    this.custom.set(c.id, c);
  }
  removeCustom(id: string): void {
    if (this.custom.delete(id)) removeCustomBody(id);
  }

  get etStart(): number { return this.planets.etStart; }
  get etEnd(): number { return this.planets.etEnd; }

  /** True if the body exists and has data at et. */
  hasBody(id: string): boolean {
    return id === 'SSB' || id in DIRECT || id in BODIES || this.custom.has(id);
  }
  /** Time limits (et) of the data of a body. */
  coverage(id: string): [number, number] {
    if (this.small?.has(id)) return [this.small.etStart, this.small.etEnd];
    if (this.custom.has(id)) return [-Infinity, Infinity];
    return [this.planets.etStart, this.planets.etEnd];
  }

  /** State relative to the SSB, ICRF. */
  state(id: string, et: number): State {
    if (id === 'SSB') return { r: [0, 0, 0], v: [0, 0, 0] };
    const direct = DIRECT[id];
    if (direct) return this.planets.state(direct, et);
    if (id === 'EARTH' || id === 'MOON') {
      const emb = this.planets.state('EMB', et);
      const mg = this.planets.state('MOON_GEO', et);
      const k = id === 'EARTH' ? -this.earthFactor : 1 - this.earthFactor;
      return { r: lincomb(emb.r, 1, mg.r, k), v: lincomb(emb.v, 1, mg.v, k) };
    }
    if (SYSTEM_OF[id]) {
      const s = this.planets.state(SYSTEM_OF[id], et);
      for (const m of this.moonsOf[id] ?? []) {
        const ms = moonState(m.id, et);
        s.r = lincomb(s.r, 1, ms.r, -m.ratio);
        s.v = lincomb(s.v, 1, ms.v, -m.ratio);
      }
      return s;
    }
    if (MOON_MODELS[id]) {
      const p = this.state(BODIES[id].parent!, et);
      const m = moonState(id, et);
      return { r: add(p.r, m.r), v: add(p.v, m.v) };
    }
    if (this.small?.has(id)) return this.small.state(id, et);
    const c = this.custom.get(id);
    if (c) {
      const sun = this.planets.state('SUN', et);
      const h = customHelio(c, et);
      return { r: add(sun.r, h.r), v: add(sun.v, h.v) };
    }
    throw new Error('Unknown body: ' + id);
  }

  /** State of a target relative to a centre, ICRF. */
  stateRel(target: string, center: string, et: number): State {
    const a = this.state(target, et);
    if (center === 'SSB') return a;
    const b = this.state(center, et);
    return { r: sub(a.r, b.r), v: sub(a.v, b.v) };
  }

  /** Position relative to the SSB (km). Fast path for the bodies of the force model. */
  position(id: string, et: number, out: Vec3): Vec3 {
    const direct = DIRECT[id];
    if (direct) return this.planets.position(direct, et, out);
    const s = this.state(id, et);
    out[0] = s.r[0]; out[1] = s.r[1]; out[2] = s.r[2];
    return out;
  }
}

const OBL = (84381.448 / 3600) * (Math.PI / 180);
function customHelio(c: CustomBody, et: number): State {
  const p = c.a * (1 - c.e * c.e);
  // state at the epoch from the mean anomaly: use true anomaly of M0, then propagate
  let E = c.M0;
  for (let k = 0; k < 50; k++) E -= (E - c.e * Math.sin(E) - c.M0) / (1 - c.e * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + c.e) * Math.sin(E / 2), Math.sqrt(1 - c.e) * Math.cos(E / 2));
  const s0 = stateFromElements({ p, e: c.e, i: c.i, raan: c.raan, argp: c.argp, nu }, GM_SUN);
  const s = keplerPropagate(s0, et - c.epochEt, GM_SUN);
  const ce = Math.cos(OBL), se = Math.sin(OBL);
  const rot = (v: Vec3): Vec3 => [v[0], ce * v[1] - se * v[2], se * v[1] + ce * v[2]];
  return { r: rot(s.r), v: rot(s.v) };
}
