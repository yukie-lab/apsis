/**
 * Numerical propagation of a spacecraft in the solar system (Cowell method).
 * Integration frame: ICRF, origin at the solar system barycentre. Units: km, km/s, s. Time: TDB (et).
 *
 * Force model (each part can be set on or off):
 *   - point-mass gravity of the Sun, the planets, the Moon and Pluto (positions from the DE440 fit)
 *   - point-mass gravity of Ceres, Vesta and Psyche (only in the time range of the small-body data, 1980 to 2060)
 *   - optional: large moons of Jupiter, Saturn, Uranus, Neptune and Pluto as separate point masses (analytic model)
 *   - J2 oblateness of the planets (applied inside 300 planet radii)
 *   - relativistic correction of the Sun (Schwarzschild term)
 *   - solar radiation pressure (cannonball model)
 * Not modelled: thrust arcs of finite duration, attitude-dependent forces, atmospheric drag, higher gravity harmonics.
 */
import { Rkf78, IntegrationError } from './integrator';
import { type State, type Vec3, dot, norm } from './vec';
import { BODIES, MOON_MODELS, C_LIGHT, AU, SOLAR_IRRADIANCE, type Body } from './bodies';
import { type SolarSystem, moonState } from './system';
import { poleVector, type LocalFrame, localToIcrf } from './frames';
import { DAY } from './time';

export interface ForceModel {
  /** Bodies with point-mass gravity. */
  bodies: string[];
  /** Large moons as separate masses. */
  moons: boolean;
  j2: boolean;
  relativity: boolean;
  /** Solar radiation pressure: area-to-mass ratio (m^2/kg) and reflectivity coefficient. null = off. */
  srp: { areaToMass: number; cr: number } | null;
}

export const PLANET_GRAVITY_BODIES = ['SUN', 'MERCURY', 'VENUS', 'EARTH', 'MOON', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'];
/** Asteroids with a mass that changes a trajectory by a measurable quantity (GM from the JPL Small-Body Database). */
export const ASTEROID_GRAVITY_BODIES = ['CERES', 'VESTA', 'PSYCHE'];
export const ALL_GRAVITY_BODIES = [...PLANET_GRAVITY_BODIES, ...ASTEROID_GRAVITY_BODIES];
export const FULL_MODEL: ForceModel = { bodies: ALL_GRAVITY_BODIES, moons: false, j2: true, relativity: true, srp: null };
export const SUN_ONLY_MODEL: ForceModel = { bodies: ['SUN'], moons: false, j2: false, relativity: false, srp: null };

export interface Maneuver {
  id: string;
  /** Time of the impulse, et. */
  et: number;
  /** Components of the velocity change in `frame`, km/s. */
  dv: Vec3;
  frame: LocalFrame;
  /** Reference body of the local frame (VNB and RTN use the state relative to this body). */
  refBody: string;
  label?: string;
  /**
   * State immediately after the impulse (relative to the SSB, ICRF) from the solver that computed the maneuver.
   * A path through some flybys is very sensitive: a difference in the last bit of a number before the first flyby
   * can become thousands of kilometres after the third one, and different JavaScript engines do not round all
   * functions equally. With an anchor, the propagation continues from the stored state if the state that it
   * computed is nearer than ANCHOR_LIMIT (the difference is in the maneuver event). The result is then the same on
   * all computers. A change to the flight before this maneuver makes the anchor incorrect: remove it.
   */
  anchor?: State;
}

/** Largest difference between a computed state and an anchor for which the anchor is used: 1 km and 1 mm/s. */
export const ANCHOR_LIMIT = { r: 1, v: 1e-6 };

export interface TrajectoryEvent {
  type: 'periapsis' | 'impact' | 'maneuver' | 'start' | 'end';
  et: number;
  body?: string;
  /** Distance from the body centre, km. */
  radius?: number;
  /** Altitude above the equatorial radius, km. */
  altitude?: number;
  /** Speed relative to the body, km/s. */
  speed?: number;
  /** State relative to the SSB at the event. */
  state: State;
  maneuverId?: string;
  /** Velocity change in ICRF (maneuver events), km/s. */
  dvIcrf?: Vec3;
  /**
   * Maneuver with an anchor: distance (km) and velocity difference (km/s) between the computed state and the anchor.
   * `used` is false if the difference was above ANCHOR_LIMIT: the propagation then continued from the computed state.
   */
  anchorMiss?: { r: number; v: number; used: boolean };
}

export interface PropagationRequest {
  et0: number;
  /** Start state relative to the SSB, ICRF. */
  state0: State;
  etEnd: number;
  maneuvers?: Maneuver[];
  model: ForceModel;
  /**
   * Relative tolerance (default 1e-13). Measured for a flight of 8 years from a parking orbit of the Earth: the end
   * position is 5 km from the converged result with 1e-11, 0.15 km with 1e-13. The number of steps is almost the
   * same (the maximum step is the limit in the cruise), thus the small tolerance costs less than 10 % of the time.
   */
  rtol?: number;
  /** Maximum step, s (default 4 days). */
  hMax?: number;
  /** Times where a step must end exactly. */
  stops?: number[];
  /** If true, closest approaches are not searched (faster). */
  noEvents?: boolean;
  /** Bodies that are not in the force model for which closest approaches are also searched. */
  watch?: string[];
  /** If false, the propagation continues after the path goes below the surface of a body (default true: stop). */
  stopAtImpact?: boolean;
  /** Maximum number of steps between two break points (default 5 million). More: failure 'step-limit'. */
  maxSteps?: number;
  /**
   * If true, the propagation always continues from the anchor of a maneuver, also when the computed state is far
   * from it. A comparison flight (a different force model or tolerance) then starts each arc from the state of the
   * flight that the anchors come from: the `anchorMiss` of each maneuver event is its difference at the end of the arc.
   */
  restartAtAnchors?: boolean;
}

/** Sphere of influence radius (km) of a body at its current distance from its parent. */
export function soiRadius(sys: SolarSystem, id: string, et: number): number {
  const b = BODIES[id];
  if (!b.parent) return Infinity;
  if (b.gmSystem <= 0) return 0;
  const d = norm(sys.stateRel(id, b.parent, et).r);
  return d * Math.pow(b.gmSystem / BODIES[b.parent].gmSystem, 0.4);
}

/** Plain data of a trajectory (for a message between a worker and the page, or for a file). */
export interface TrajectoryData {
  t: Float64Array;
  y: Float64Array;
  d: Float64Array;
  segStarts: number[];
  events: TrajectoryEvent[];
  failure: Trajectory['failure'];
  evals: number;
}

export class Trajectory {
  /** Segment start indices (a new segment starts after each maneuver). */
  readonly segStarts: number[] = [0];
  events: TrajectoryEvent[] = [];
  private tt: number[] = [];
  private yy: number[] = [];
  private dd: number[] = [];
  t!: Float64Array;
  y!: Float64Array;
  d!: Float64Array;
  /** Derivative evaluations used. */
  evals = 0;
  /**
   * Not null if the propagation stopped before the requested end time for a numerical reason:
   * 'inside-body' = the path went to less than 0.1 radius from the centre of a body (the point-mass model has no
   * physical meaning there), 'not-finite' = the state became not finite, 'step-limit' = too many steps.
   * An impact that the event search finds is not a failure (see the 'impact' event).
   */
  failure: { reason: 'inside-body' | 'not-finite' | 'step-limit'; et: number; body?: string } | null = null;

  push(t: number, y: Float64Array, d: Float64Array): void {
    this.tt.push(t);
    for (let i = 0; i < 6; i++) { this.yy.push(y[i]); this.dd.push(d[i]); }
  }
  /** Replace the newest sample (used when the trajectory ends before the end of a step). */
  replaceLast(t: number, y: Float64Array, d: Float64Array): void {
    this.tt.pop();
    this.yy.length -= 6; this.dd.length -= 6;
    this.push(t, y, d);
  }
  get count(): number { return this.tt.length; }
  /** Newest sample while the trajectory is not finished. */
  lastState(): number[] { return this.yy.slice(this.yy.length - 6); }
  markSegment(): void { this.segStarts.push(this.tt.length); }
  finish(): void {
    this.t = Float64Array.from(this.tt);
    this.y = Float64Array.from(this.yy);
    this.d = Float64Array.from(this.dd);
    this.tt = []; this.yy = []; this.dd = [];
  }
  toData(): TrajectoryData {
    return { t: this.t, y: this.y, d: this.d, segStarts: this.segStarts.slice(), events: this.events, failure: this.failure, evals: this.evals };
  }
  static fromData(data: TrajectoryData): Trajectory {
    const tr = new Trajectory();
    tr.t = data.t; tr.y = data.y; tr.d = data.d;
    tr.segStarts.length = 0;
    tr.segStarts.push(...data.segStarts);
    tr.events = data.events;
    tr.failure = data.failure;
    tr.evals = data.evals;
    return tr;
  }
  get et0(): number { return this.t[0]; }
  get et1(): number { return this.t[this.t.length - 1]; }
  get forward(): boolean { return this.et1 >= this.et0; }

  /** Index i such that et is between sample i and i+1 (same segment). */
  private locate(et: number): number {
    const t = this.t;
    const n = t.length;
    const fwd = this.forward;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fwd ? t[mid] <= et : t[mid] >= et) lo = mid; else hi = mid;
    }
    // At a maneuver two samples have the same time: use the sample after the maneuver.
    while (lo < n - 2 && t[lo + 1] === t[lo]) lo++;
    return Math.min(lo, n - 2);
  }

  /** State relative to the SSB at et (quintic Hermite interpolation between steps). */
  stateAt(et: number): State {
    const n = this.t.length;
    if (n === 1) return { r: [this.y[0], this.y[1], this.y[2]], v: [this.y[3], this.y[4], this.y[5]] };
    const i = this.locate(et);
    const t0 = this.t[i], t1 = this.t[i + 1];
    const h = t1 - t0;
    const a = 6 * i, b = 6 * (i + 1);
    const y = this.y, d = this.d;
    if (h === 0) return { r: [y[b], y[b + 1], y[b + 2]], v: [y[b + 3], y[b + 4], y[b + 5]] };
    const s = Math.max(0, Math.min(1, (et - t0) / h));
    const s2 = s * s, s3 = s2 * s, s4 = s3 * s, s5 = s4 * s;
    // quintic Hermite basis (position, velocity, acceleration at both ends)
    const h00 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
    const h10 = s - 6 * s3 + 8 * s4 - 3 * s5;
    const h20 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
    const h01 = 10 * s3 - 15 * s4 + 6 * s5;
    const h11 = -4 * s3 + 7 * s4 - 3 * s5;
    const h21 = 0.5 * s3 - s4 + 0.5 * s5;
    const g00 = -30 * s2 + 60 * s3 - 30 * s4;
    const g10 = 1 - 18 * s2 + 32 * s3 - 15 * s4;
    const g20 = s - 4.5 * s2 + 6 * s3 - 2.5 * s4;
    const g01 = -g00;
    const g11 = -12 * s2 + 28 * s3 - 15 * s4;
    const g21 = 1.5 * s2 - 4 * s3 + 2.5 * s4;
    const r: Vec3 = [0, 0, 0], v: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const p0 = y[a + k], v0 = y[a + 3 + k], a0 = d[a + 3 + k];
      const p1 = y[b + k], v1 = y[b + 3 + k], a1 = d[b + 3 + k];
      r[k] = h00 * p0 + h10 * h * v0 + h20 * h * h * a0 + h01 * p1 + h11 * h * v1 + h21 * h * h * a1;
      v[k] = (g00 * p0 + g01 * p1) / h + g10 * v0 + g11 * v1 + h * (g20 * a0 + g21 * a1);
    }
    return { r, v };
  }
}

interface Perturber {
  id: string; gm: number; j2: number; radius: number; body: Body; pos: Vec3; moonOf?: string;
  /** Small body: position from the small-body file, used only inside the time range of that file. */
  small?: boolean; active: boolean;
  /** GM in use at this moment (planet alone when its moons are separate masses, else the planet system). */
  gmNow: number;
  /** Square of 0.1 radius: a path nearer to the centre than this stops the propagation. */
  deep2: number;
}
/**
 * Planet with moons as separate masses. Far from the planet (more than `range`) the system is one point mass at
 * its barycentre: the difference is below 1e-14 km/s^2 and the computation is much faster.
 */
interface MoonGroup { planet: Perturber; moons: Perturber[]; ratios: number[]; gmSystem: number; range2: number; near: boolean; rel: Vec3[] }
interface EventBody { id: string; radius: number; moonOf?: string; watch: boolean; pert?: Perturber }

export class Propagator {
  private readonly pert: Perturber[] = [];
  private readonly groups: MoonGroup[] = [];
  private readonly emb: Vec3 = [0, 0, 0];
  private readonly mgeo: Vec3 = [0, 0, 0];
  private readonly earthFactor = BODIES.MOON.gm / (BODIES.EARTH.gm + BODIES.MOON.gm);
  private readonly sunIndex: number;
  private readonly srpAccel: number;
  /** Body whose centre is nearer than 0.1 radius at the last derivative evaluation, or null. */
  private deep: Perturber | null = null;

  constructor(readonly sys: SolarSystem, readonly model: ForceModel) {
    for (const id of model.bodies) {
      const b = BODIES[id];
      const small = sys.small?.has(id) ?? false;
      if (!b || (!small && !PLANET_GRAVITY_BODIES.includes(id))) continue;
      const moonIds = model.moons ? Object.keys(MOON_MODELS).filter((mid) => BODIES[mid].parent === id && BODIES[mid].gm > 1) : [];
      const hasMoons = moonIds.length > 0;
      const gm = hasMoons || id === 'EARTH' ? b.gm : b.gmSystem;
      const planet: Perturber = { id, gm, gmNow: gm, j2: model.j2 ? b.j2 : 0, radius: b.radius, body: b, pos: [0, 0, 0], small, active: true, deep2: (0.1 * b.radius) ** 2 };
      this.pert.push(planet);
      if (hasMoons) {
        const moons = moonIds.map((mid): Perturber => ({ id: mid, gm: BODIES[mid].gm, gmNow: BODIES[mid].gm, j2: 0, radius: BODIES[mid].radius, body: BODIES[mid], pos: [0, 0, 0], moonOf: id, active: true, deep2: (0.1 * BODIES[mid].radius) ** 2 }));
        this.pert.push(...moons);
        const range = 20 * Math.max(...moonIds.map((mid) => MOON_MODELS[mid].a));
        this.groups.push({ planet, moons, ratios: moons.map((m) => m.gm / b.gmSystem), gmSystem: b.gmSystem, range2: range * range, near: true, rel: moons.map(() => [0, 0, 0] as Vec3) });
      }
    }
    this.sunIndex = this.pert.findIndex((p) => p.id === 'SUN');
    // SRP acceleration at 1 au, km/s^2
    this.srpAccel = model.srp ? ((SOLAR_IRRADIANCE / (C_LIGHT * 1000)) * model.srp.cr * model.srp.areaToMass) / 1000 : 0;
  }

  /** Ids of the bodies of the force model (moons included when the option is on). */
  get bodyIds(): string[] { return this.pert.map((p) => p.id); }
  /** GM of a body in the force model, km^3/s^2 (planet system if its moons are not separate masses). 0: not in the model. */
  gmOf(id: string): number { return this.pert.find((p) => p.id === id)?.gm ?? 0; }

  /** Update the positions of all perturbers at time t + dt. (x, y, z): position of the spacecraft. */
  private updateBodies(t: number, dt: number, x: number, y: number, z: number): void {
    const sys = this.sys;
    let haveEm = false;
    for (const p of this.pert) {
      if (p.id === 'EARTH' || p.id === 'MOON') {
        if (!haveEm) {
          sys.planets.position('EMB', t, this.emb, dt);
          sys.planets.position('MOON_GEO', t, this.mgeo, dt);
          haveEm = true;
        }
        const k = p.id === 'EARTH' ? -this.earthFactor : 1 - this.earthFactor;
        p.pos[0] = this.emb[0] + k * this.mgeo[0];
        p.pos[1] = this.emb[1] + k * this.mgeo[1];
        p.pos[2] = this.emb[2] + k * this.mgeo[2];
      } else if (p.moonOf) {
        // set with its planet below
      } else if (p.small) {
        p.active = sys.small!.covers(t + dt);
        if (p.active) sys.small!.position(p.id, t, p.pos, dt);
      } else {
        // barycentre of the planet system for the outer planets
        sys.planets.position(p.id, t, p.pos, dt);
      }
    }
    for (const g of this.groups) {
      const c = g.planet.pos; // barycentre at this point
      const dx = x - c[0], dy = y - c[1], dz = z - c[2];
      g.near = dx * dx + dy * dy + dz * dz < g.range2;
      if (!g.near) {
        g.planet.gmNow = g.gmSystem;
        for (const m of g.moons) m.active = false;
        continue;
      }
      g.planet.gmNow = g.planet.gm;
      let ox = 0, oy = 0, oz = 0;
      for (let k = 0; k < g.moons.length; k++) {
        const r = moonState(g.moons[k].id, t + dt).r;
        g.rel[k] = r;
        ox += g.ratios[k] * r[0]; oy += g.ratios[k] * r[1]; oz += g.ratios[k] * r[2];
      }
      c[0] -= ox; c[1] -= oy; c[2] -= oz; // planet centre
      for (let k = 0; k < g.moons.length; k++) {
        const m = g.moons[k];
        m.active = true;
        m.pos[0] = c[0] + g.rel[k][0]; m.pos[1] = c[1] + g.rel[k][1]; m.pos[2] = c[2] + g.rel[k][2];
      }
    }
  }

  /** Derivative function for the integrator at the time t + dt. y = [r, v]. */
  readonly deriv = (t: number, y: Float64Array, d: Float64Array, dt = 0): void => {
    const x = y[0], yy = y[1], z = y[2];
    this.updateBodies(t, dt, x, yy, z);
    let ax = 0, ay = 0, az = 0;
    for (const p of this.pert) {
      if (!p.active) continue;
      const dx = x - p.pos[0], dy = yy - p.pos[1], dz = z - p.pos[2];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < p.deep2) this.deep = p;
      const r = Math.sqrt(r2);
      const k = -p.gmNow / (r2 * r);
      ax += k * dx; ay += k * dy; az += k * dz;
      if (p.j2 !== 0 && r < 300 * p.radius) {
        const pole = poleVector(p.body, t + dt);
        const zz = dx * pole[0] + dy * pole[1] + dz * pole[2];
        const f = (-1.5 * p.j2 * p.gmNow * p.radius * p.radius) / (r2 * r2 * r);
        const c = 1 - (5 * zz * zz) / r2;
        ax += f * (c * dx + 2 * zz * pole[0]);
        ay += f * (c * dy + 2 * zz * pole[1]);
        az += f * (c * dz + 2 * zz * pole[2]);
      }
    }
    if (this.sunIndex >= 0 && (this.model.relativity || this.srpAccel !== 0)) {
      const s = this.pert[this.sunIndex];
      const dx = x - s.pos[0], dy = yy - s.pos[1], dz = z - s.pos[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (this.model.relativity) {
        // Velocity relative to the Sun is approximated by the barycentric velocity (difference below 16 m/s).
        const vx = y[3], vy = y[4], vz = y[5];
        const v2 = vx * vx + vy * vy + vz * vz;
        const rv = dx * vx + dy * vy + dz * vz;
        const k = s.gm / (C_LIGHT * C_LIGHT * r * r * r);
        const c1 = (4 * s.gm) / r - v2;
        ax += k * (c1 * dx + 4 * rv * vx);
        ay += k * (c1 * dy + 4 * rv * vy);
        az += k * (c1 * dz + 4 * rv * vz);
      }
      if (this.srpAccel !== 0) {
        const k = (this.srpAccel * AU * AU) / (r * r * r);
        ax += k * dx; ay += k * dy; az += k * dz;
      }
    }
    d[0] = y[3]; d[1] = y[4]; d[2] = y[5];
    d[3] = ax; d[4] = ay; d[5] = az;
  };

  propagate(req: PropagationRequest): Trajectory {
    const traj = new Trajectory();
    const dir = req.etEnd >= req.et0 ? 1 : -1;
    const y = new Float64Array([...req.state0.r, ...req.state0.v]);
    const dTmp = new Float64Array(6);
    const rk = new Rkf78(this.deriv, 6);
    const atol = new Float64Array([1e-6, 1e-6, 1e-6, 1e-12, 1e-12, 1e-12]);
    const ctl = { rtol: req.rtol ?? 1e-13, atol, h0: 60, hMax: req.hMax ?? 4 * DAY, hMin: 1e-3, maxSteps: req.maxSteps };
    const mans = (req.maneuvers ?? []).filter((m) => (m.et - req.et0) * dir >= 0 && (req.etEnd - m.et) * dir >= 0).sort((a, b) => (a.et - b.et) * dir);
    // break points: maneuvers and requested stops
    const breaks: { t: number; man?: Maneuver }[] = [
      ...mans.map((m) => ({ t: m.et, man: m })),
      ...(req.stops ?? []).filter((s) => (s - req.et0) * dir > 0 && (req.etEnd - s) * dir > 0).map((t) => ({ t })),
      { t: req.etEnd },
    ];
    breaks.sort((a, b) => (a.t - b.t) * dir || (a.man ? 1 : -1));

    const eventBodies: EventBody[] = req.noEvents ? [] : [
      ...this.pert.filter((p) => p.id !== 'SUN').map((p) => ({ id: p.id, radius: p.radius, moonOf: p.moonOf, watch: false, pert: p })),
      ...(req.watch ?? []).filter((id) => id !== 'SUN' && this.sys.hasBody(id) && !this.pert.some((p) => p.id === id))
        .map((id) => ({ id, radius: BODIES[id]?.radius ?? 0, moonOf: BODIES[id]?.kind === 'moon' ? BODIES[id].parent! : undefined, watch: true })),
    ];
    const rdot = (p: EventBody, t: number, yy: Float64Array | number[]): number => {
      // A moon far from the spacecraft is not active in the force model: no event search for it.
      if (p.pert && !p.pert.active) return NaN;
      const cov = this.sys.coverage(p.id);
      if (t < cov[0] || t > cov[1]) return NaN;
      const s = this.sys.state(p.id, t);
      return (yy[0] - s.r[0]) * (yy[3] - s.v[0]) + (yy[1] - s.r[1]) * (yy[4] - s.v[1]) + (yy[2] - s.r[2]) * (yy[5] - s.v[2]);
    };
    const prevRdot = new Float64Array(eventBodies.length);
    const initRdot = (t: number) => { for (let i = 0; i < eventBodies.length; i++) prevRdot[i] = rdot(eventBodies[i], t, y); };
    // Height above the equatorial radius (km); NaN out of the time range of the body data.
    const height = (p: EventBody, t: number, yy: Float64Array): number => {
      if (p.pert && !p.pert.active) return NaN;
      const cov = this.sys.coverage(p.id);
      if (t < cov[0] || t > cov[1]) return NaN;
      const s = this.sys.state(p.id, t).r;
      return Math.hypot(yy[0] - s[0], yy[1] - s[1], yy[2] - s[2]) - p.radius;
    };
    const stopAtImpact = req.stopAtImpact !== false && !req.noEvents;
    // A start point below a surface (departure from a small body) does not count as an impact.
    const armed = eventBodies.map((p) => !(height(p, req.et0, y) <= 0));
    let impact = false;

    let t = req.et0;
    let tEndReal = req.etEnd;
    this.deriv(t, y, dTmp);
    traj.push(t, y, dTmp);
    traj.events.push({ type: 'start', et: t, state: toState(y) });
    initRdot(t);
    // A start at a periapsis (departure from a parking orbit) is not a periapsis event.
    for (let i = 0; i < eventBodies.length; i++) {
      if (!(prevRdot[i] * dir < 0)) continue;
      const s = this.sys.state(eventBodies[i].id, t);
      const d = Math.hypot(y[0] - s.r[0], y[1] - s.r[1], y[2] - s.r[2]), sp = Math.hypot(y[3] - s.v[0], y[4] - s.v[1], y[5] - s.v[2]);
      if (Math.abs(prevRdot[i]) < 1e-6 * d * sp) prevRdot[i] = 0;
    }
    let h = ctl.h0;
    let tNow = t;
    let anchored = true;
    for (const br of breaks) {
      if ((br.t - t) * dir > 0) {
        let res: { t: number; h: number; steps: number };
        try {
          res = rk.integrate(t, y, br.t, { ...ctl, h0: h }, (tn, yn, tp, yp) => {
            this.deep = null;
            this.deriv(tn, yn, dTmp);
            const deep = this.deep as Perturber | null;
            traj.push(tn, yn, dTmp);
            tNow = tn;
            for (let i = 0; i < eventBodies.length; i++) {
              const p = eventBodies[i];
              if (stopAtImpact) {
                const hgt = height(p, tn, yn);
                if (!armed[i]) { if (hgt > 0) armed[i] = true; } else if (hgt <= 0) {
                  // The path is below the surface: find the crossing, end the trajectory there.
                  const hit = this.findCrossing(p, tp, yp, tn, ctl, height);
                  traj.replaceLast(hit.t, hit.y, this.derivOf(hit.t, hit.y, dTmp));
                  const s = this.sys.state(p.id, hit.t);
                  traj.events.push({ type: 'impact', et: hit.t, body: p.id, radius: p.radius, altitude: 0, speed: Math.hypot(hit.y[3] - s.v[0], hit.y[4] - s.v[1], hit.y[5] - s.v[2]), state: toState(hit.y) });
                  yn.set(hit.y);
                  tEndReal = hit.t;
                  impact = true;
                  return true;
                }
              }
              const rd = rdot(p, tn, yn);
              if (prevRdot[i] * dir < 0 && rd * dir >= 0) this.refinePeriapsis(traj, p, tp, yp, tn, dir, ctl);
              prevRdot[i] = rd;
            }
            if (deep) {
              traj.failure = { reason: 'inside-body', et: tn, body: deep.id };
              return true;
            }
            return false;
          });
        } catch (e) {
          if (!(e instanceof IntegrationError)) throw e;
          // The samples up to the last accepted step are kept.
          traj.failure = { reason: e.reason, et: tNow };
          y.set(traj.lastState());
          t = tNow;
          break;
        }
        if (traj.failure) { t = tNow; break; }
        if (impact) { t = tEndReal; break; }
        h = Math.max(res.h, 1);
        t = br.t;
        tNow = t;
      }
      if (br.man) {
        const m = br.man;
        const ref = this.sys.state(m.refBody, t);
        const rel: State = { r: [y[0] - ref.r[0], y[1] - ref.r[1], y[2] - ref.r[2]], v: [y[3] - ref.v[0], y[4] - ref.v[1], y[5] - ref.v[2]] };
        const dv = localToIcrf(m.frame, rel, m.dv);
        // A backward propagation removes the impulse.
        y[3] += dir * dv[0]; y[4] += dir * dv[1]; y[5] += dir * dv[2];
        let anchorMiss: TrajectoryEvent['anchorMiss'];
        if (m.anchor && dir > 0 && anchored) {
          const a = m.anchor;
          const dr = Math.sqrt((y[0] - a.r[0]) ** 2 + (y[1] - a.r[1]) ** 2 + (y[2] - a.r[2]) ** 2);
          const dvel = Math.sqrt((y[3] - a.v[0]) ** 2 + (y[4] - a.v[1]) ** 2 + (y[5] - a.v[2]) ** 2);
          const used = !!req.restartAtAnchors || (dr <= ANCHOR_LIMIT.r && dvel <= ANCHOR_LIMIT.v);
          anchorMiss = { r: dr, v: dvel, used };
          if (used) {
            y[0] = a.r[0]; y[1] = a.r[1]; y[2] = a.r[2]; y[3] = a.v[0]; y[4] = a.v[1]; y[5] = a.v[2];
            rk.resetCompensation();
          } else {
            // The flight is not the flight of the anchors: the anchors after this one are not used.
            anchored = false;
          }
        }
        traj.markSegment();
        this.deriv(t, y, dTmp);
        traj.push(t, y, dTmp);
        traj.events.push({ type: 'maneuver', et: t, state: toState(y), maneuverId: m.id, dvIcrf: dv, anchorMiss });
        initRdot(t);
        h = 60;
      }
    }
    traj.events.push({ type: 'end', et: t, state: toState(y) });
    traj.events.sort((a, b) => (a.et - b.et) * dir);
    traj.evals = rk.evals;
    traj.finish();
    return traj;
  }

  private derivOf(t: number, y: Float64Array, d: Float64Array): Float64Array {
    this.deriv(t, y, d);
    return d;
  }

  /** Time and state where the height above a body becomes zero between two steps (bisection, re-integration). */
  private findCrossing(p: EventBody, t0: number, y0: Float64Array, t1: number, ctl: { rtol: number; atol: Float64Array; hMax: number; hMin: number }, height: (p: EventBody, t: number, y: Float64Array) => number): { t: number; y: Float64Array } {
    const yA = new Float64Array(y0);
    const yB = new Float64Array(6);
    const rk = new Rkf78(this.deriv, 6);
    let ta = t0, tb = t1;
    for (let it = 0; it < 60 && Math.abs(tb - ta) > 1e-3; it++) {
      const tm = 0.5 * (ta + tb);
      yB.set(yA);
      rk.integrate(ta, yB, tm, { ...ctl, h0: Math.abs(tm - ta) });
      if (height(p, tm, yB) > 0) { ta = tm; yA.set(yB); } else { tb = tm; }
    }
    return { t: ta, y: yA };
  }

  /** Find the exact time of closest approach to a body between two steps and record the event. */
  private refinePeriapsis(traj: Trajectory, p: EventBody, t0: number, y0: Float64Array, t1: number, dir: number, ctl: { rtol: number; atol: Float64Array; hMax: number; hMin: number }): void {
    // Only close passes are events: inside 3 radii of the sphere of influence (moons: 50 radii of the moon).
    // A body with almost no mass has almost no sphere of influence: the limit is then 2 million km.
    const limit = p.moonOf ? 50 * p.radius : Math.max(3 * soiRadius(this.sys, p.id, t1), p.watch || p.radius < 600 ? 2e6 : 0);
    const yA = new Float64Array(y0);
    let ta = t0;
    const yB = new Float64Array(6);
    const rk = new Rkf78(this.deriv, 6);
    let tb = t1;
    const f = (tt: number, yy: Float64Array): number => {
      const s = this.sys.state(p.id, tt);
      return ((yy[0] - s.r[0]) * (yy[3] - s.v[0]) + (yy[1] - s.r[1]) * (yy[4] - s.v[1]) + (yy[2] - s.r[2]) * (yy[5] - s.v[2])) * dir;
    };
    // bisection with exact re-integration from the left point (the interval is one step: cheap)
    for (let it = 0; it < 60 && Math.abs(tb - ta) > 1e-3; it++) {
      const tm = 0.5 * (ta + tb);
      yB.set(yA);
      rk.integrate(ta, yB, tm, { ...ctl, h0: Math.abs(tm - ta) });
      if (f(tm, yB) < 0) { ta = tm; yA.set(yB); } else { tb = tm; }
    }
    const s = this.sys.state(p.id, ta);
    const rel: State = { r: [yA[0] - s.r[0], yA[1] - s.r[1], yA[2] - s.r[2]], v: [yA[3] - s.v[0], yA[4] - s.v[1], yA[5] - s.v[2]] };
    const radius = norm(rel.r);
    if (radius > limit) return;
    traj.events.push({
      type: radius < p.radius ? 'impact' : 'periapsis', et: ta, body: p.id, radius, altitude: radius - p.radius,
      speed: norm(rel.v), state: toState(yA),
    });
  }
}

function toState(y: Float64Array): State { return { r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]] }; }

/** Energy-like check value: two-body specific energy relative to a body (km^2/s^2). */
export function specificEnergy(rel: State, mu: number): number {
  return dot(rel.v, rel.v) / 2 - mu / norm(rel.r);
}
