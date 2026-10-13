/**
 * Mission model that the two modes of the application share.
 * A mission has a plan (patched conics) and, after the conversion, a flight (numerical trajectory with maneuvers).
 *
 * Real missions: data/famous.json has only facts from the JPL Horizons trajectories (sequence of bodies, times,
 * aim point at the last body, maneuver times). The path of a real mission is solved by this engine at run time.
 */
import famousData from './data/famous.json';
import { type Plan, newPlan, evaluatePlan, type PlanResult } from './plan';
import { optimizePlan, computePorkchop, synodicPeriod, hohmannTof, type PorkchopData } from './planopt';
import { type Flight, refinePlan, type RefineReport, type RefineOptions } from './flight';
import { FULL_MODEL, type ForceModel, type Trajectory, soiRadius, ASTEROID_GRAVITY_BODIES } from './propagate';
import type { SolarSystem, CustomBody } from './system';
import { BODIES, MOON_MODELS, G0 } from './bodies';
import { jdTdbToEt, tdb, DAY, YEAR } from './time';

export interface SpacecraftSpec {
  /** Identifier of the 3D model. */
  kind: string;
  name: string;
  /** Mass with no propellant, kg. */
  dryMassKg: number;
  propellantKg: number;
  /** Specific impulse of the main engine, s. */
  ispS: number;
  /** Area for solar radiation pressure, m^2, and reflectivity coefficient. Used only if the force model has it on. */
  srpAreaM2: number;
  cr: number;
}

export interface Mission {
  format: 'apsis-mission';
  version: 1;
  id: string;
  name: string;
  /** Identifier of the real mission that this mission makes again, or null. */
  famousId: string | null;
  spacecraft: SpacecraftSpec;
  /** null: the mission has only a flight (read from a file, or made from a state vector). */
  plan: Plan | null;
  /** Options of the conversion from the plan to the flight. */
  refine: { moons: boolean; optimizeDsm: boolean };
  flight: Flight | null;
  /** plan: converted from the plan. manual: edited by the user. import: read from a file. */
  flightOrigin: 'plan' | 'manual' | 'import' | null;
  /** Report of the conversion that made the flight. null or missing: no conversion, or the flight was edited. */
  report?: RefineReport | null;
  /** Bodies of the user that the mission uses. A mission file thus has all the data that the mission needs. */
  custom?: { body: CustomBody; radiusKm: number }[];
}
/** A mission with a plan. */
export type PlannedMission = Mission & { plan: Plan };

/** Example values. The name is empty: the user interface gives the default name in the language of the user. */
export const DEFAULT_SPACECRAFT: SpacecraftSpec = { kind: 'apsis', name: '', dryMassKg: 1200, propellantKg: 800, ispS: 320, srpAreaM2: 12, cr: 1.3 };

let counter = 0;
export function newMissionId(): string {
  counter += 1;
  return 'm' + Date.now().toString(36) + counter.toString(36);
}

export function newMission(name: string, plan: Plan, spacecraft: SpacecraftSpec = DEFAULT_SPACECRAFT): PlannedMission {
  return { format: 'apsis-mission', version: 1, id: newMissionId(), name, famousId: null, spacecraft: { ...spacecraft }, plan, refine: { moons: false, optimizeDsm: false }, flight: null, flightOrigin: null };
}

/** A mission that has only a flight (no plan). */
export function newFlightMission(name: string, flight: Flight, origin: 'manual' | 'import', spacecraft: SpacecraftSpec = DEFAULT_SPACECRAFT): Mission {
  return { format: 'apsis-mission', version: 1, id: newMissionId(), name, famousId: null, spacecraft: { ...spacecraft }, plan: null, refine: { moons: false, optimizeDsm: false }, flight, flightOrigin: origin };
}

/** Force model of the conversion for a mission. Pluto and Charon are always separate masses. */
export function refineModel(m: Mission): ForceModel {
  const pluto = !!m.plan?.nodes.some((n) => n.body === 'PLUTO' || n.body === 'CHARON');
  return { ...FULL_MODEL, moons: m.refine.moons || pluto };
}

export interface SolvedMission { mission: Mission; result: PlanResult; report: RefineReport; trajectory: Trajectory }

/** Convert the plan of a mission to a flight. Returns a new mission object. */
export function solveMission(sys: SolarSystem, m: Mission, onProgress?: RefineOptions['onProgress']): SolvedMission {
  if (!m.plan) throw new Error('plan');
  const result = evaluatePlan(sys, m.plan);
  if (!result.ok) throw new Error('plan');
  const out = refinePlan(sys, m.plan, result, { model: refineModel(m), optimizeDsm: m.refine.optimizeDsm, onProgress });
  return { mission: { ...m, flight: out.flight, flightOrigin: 'plan', report: out.report }, result, report: out.report, trajectory: out.trajectory };
}

// ------------------------------------------------------------------------------------------------ mass budget

/** Propellant (kg) for a velocity change dv (km/s) with start mass m0 (kg): rocket equation. */
export function propellantFor(m0: number, dv: number, ispS: number): number {
  return m0 * (1 - Math.exp((-dv * 1000) / (ispS * G0)));
}
/** Velocity change (km/s) that the propellant gives. */
export function dvCapacity(s: SpacecraftSpec): number {
  return (s.ispS * G0 * Math.log((s.dryMassKg + s.propellantKg) / s.dryMassKg)) / 1000;
}

// ------------------------------------------------------------------------------------------------ file format

export function missionToJson(m: Mission): string {
  return JSON.stringify(m, null, 1);
}

/** Read a mission file. Throws an Error with a short code if the text is not a mission. */
export function missionFromJson(text: string): Mission {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new Error('json'); }
  const m = o as Partial<Mission>;
  if (!m || m.format !== 'apsis-mission') throw new Error('format');
  if (m.version !== 1) throw new Error('version');
  const p = m.plan ?? null;
  // A mission with no plan must have a flight.
  if (p === null) { if (!m.flight) throw new Error('plan'); }
  else {
    if (!Array.isArray(p.nodes) || p.nodes.length < 2 || !Array.isArray(p.legs) || p.legs.length !== p.nodes.length - 1) throw new Error('plan');
    for (const n of p.nodes) if (typeof n.body !== 'string' || typeof n.et !== 'number' || !isFinite(n.et)) throw new Error('plan');
  }
  if (!m.spacecraft || typeof m.spacecraft.kind !== 'string') throw new Error('spacecraft');
  const f = m.flight;
  if (f) {
    const okVec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && isFinite(x));
    if (typeof f.et0 !== 'number' || typeof f.etEnd !== 'number' || !f.state0 || !okVec(f.state0.r) || !okVec(f.state0.v) || !Array.isArray(f.maneuvers) || !f.model) throw new Error('flight');
    for (const mv of f.maneuvers) if (typeof mv.et !== 'number' || !okVec(mv.dv)) throw new Error('flight');
  }
  const num = (x: unknown) => typeof x === 'number' && isFinite(x);
  const custom = (Array.isArray(m.custom) ? m.custom : []).filter((c) => c && c.body && typeof c.body.id === 'string' && /^X_[A-Z0-9_]+$/.test(c.body.id) && typeof c.body.name === 'string'
    && [c.body.a, c.body.e, c.body.i, c.body.raan, c.body.argp, c.body.M0, c.body.epochEt, c.radiusKm].every(num) && c.body.a > 0 && c.body.e >= 0 && c.body.e < 1 && c.radiusKm > 0);
  return {
    format: 'apsis-mission', version: 1, id: typeof m.id === 'string' ? m.id : newMissionId(), name: typeof m.name === 'string' ? m.name : '',
    famousId: typeof m.famousId === 'string' ? m.famousId : null,
    spacecraft: { ...DEFAULT_SPACECRAFT, ...m.spacecraft }, plan: p,
    refine: { moons: !!m.refine?.moons, optimizeDsm: !!m.refine?.optimizeDsm },
    flight: f ?? null, flightOrigin: f ? m.flightOrigin ?? 'import' : null,
    report: f && m.report && Array.isArray(m.report.encounters) && Array.isArray(m.report.stages) ? m.report : null,
    ...(custom.length ? { custom } : {}),
  };
}

// ------------------------------------------------------------------------------------------------ real missions

interface FamousEncounter {
  body: string;
  /** Time of the closest approach (or of the periapsis of the approach hyperbola), Julian date TDB. */
  jdTdb: number;
  radiusKm: number;
  vinfKmS: number;
  aim?: { BdotT: number; BdotR: number };
  /** If the values come from an approach hyperbola: time from the data sample to the periapsis, s. */
  approachLeadS?: number;
  note?: string;
}
export interface FamousFacts {
  startTdb: string;
  encounters: FamousEncounter[];
  arrival: 'flyby' | 'orbit' | 'entry';
  source: string;
  dsm?: { jdTdb: number; dvKmS: number }[];
  orbitAfterArrival?: { periapsisRadiusKm: number; apoapsisRadiusKm: number };
}
const FACTS = (famousData as unknown as { missions: Record<string, FamousFacts> }).missions;

export interface FamousInfo {
  id: string;
  /** 3D model. */
  kind: string;
  /** Name of the spacecraft (a proper name: not translated). */
  name: string;
  /** Flight time after the last flyby, days (only for missions where the path after the flyby is the point). */
  coastDays?: number;
}

/** Real missions that the application can make again. Order: order of the list in the user interface. */
export const FAMOUS: FamousInfo[] = [
  { id: 'voyager2', kind: 'voyager', name: 'Voyager 2' },
  { id: 'cassini', kind: 'cassini', name: 'Cassini' },
  { id: 'newhorizons', kind: 'newhorizons', name: 'New Horizons' },
  { id: 'voyager1', kind: 'voyager', name: 'Voyager 1' },
  { id: 'mars2020', kind: 'marscruise', name: 'Mars 2020' },
  { id: 'juno', kind: 'juno', name: 'Juno' },
  { id: 'ulysses', kind: 'ulysses', name: 'Ulysses', coastDays: 2200 },
  { id: 'pioneer11', kind: 'pioneer', name: 'Pioneer 11' },
];

export function famousFacts(id: string): FamousFacts {
  const f = FACTS[id];
  if (!f) throw new Error('Unknown mission: ' + id);
  return f;
}

/**
 * Plan of a real mission from its facts. For a mission with a deep-space maneuver the parameters of the maneuver
 * leg are solved here (plan optimizer); the times stay at the real values.
 */
export function famousMission(sys: SolarSystem, id: string): PlannedMission {
  const info = FAMOUS.find((f) => f.id === id);
  if (!info) throw new Error('Unknown mission: ' + id);
  const f = famousFacts(id);
  const bodies = ['EARTH', ...f.encounters.map((e) => e.body)];
  let plan = newPlan(bodies, [tdb(f.startTdb), ...f.encounters.map((e) => jdTdbToEt(e.jdTdb))]);
  // The dates are periapsis dates.
  plan.soiTime = true;
  const last = f.encounters[f.encounters.length - 1];
  const bodyLast = BODIES[last.body];
  plan.arrival = {
    type: f.arrival,
    periapsisAltitude: last.radiusKm - bodyLast.radius,
    apoapsisRadius: f.orbitAfterArrival?.apoapsisRadiusKm ?? null,
    bAngle: last.aim ? Math.atan2(last.aim.BdotR, last.aim.BdotT) : 0,
    coastDays: info.coastDays,
  };
  // The real spacecraft did some flybys below the default altitude limit of the planner: the limit must permit them.
  f.encounters.forEach((e, k) => {
    const body = BODIES[e.body];
    if (k < f.encounters.length - 1 && body.gm > 0) {
      plan.minFlybyAltitude[k + 1] = Math.min(body.minFlybyAltitude, 0.5 * (e.radiusKm - body.radius));
    }
  });
  let optimizeDsm = false;
  if (id === 'cassini') {
    // One maneuver between the two Venus flybys, at the real time.
    const t1 = plan.nodes[1].et, t2 = plan.nodes[2].et;
    plan.legs[1].dsm = { eta: (jdTdbToEt(f.dsm![0].jdTdb) - t1) / (t2 - t1), rpRadii: 1.05, beta: 0 };
    plan = optimizePlan(sys, plan, { objective: 'afterLaunch', freeDsmTime: false }).plan;
    optimizeDsm = true;
  } else if (id === 'juno') {
    // Two burns 15 days apart in the real flight: one maneuver at the mean time in this model.
    const t0 = plan.nodes[0].et, t1 = plan.nodes[1].et;
    const tm = 0.5 * (jdTdbToEt(f.dsm![0].jdTdb) + jdTdbToEt(f.dsm![1].jdTdb));
    plan.legs[0].dsm = { eta: (tm - t0) / (t1 - t0), vinf: 5.5, lon: 0, lat: 0 };
    plan = optimizePlan(sys, plan, { objective: 'c3', freeDsmTime: false, global: true, generations: 200, seed: 11 }).plan;
  }
  // Mass and engine data are example values (the path does not depend on them).
  const m = newMission(info.name, plan, { ...DEFAULT_SPACECRAFT, kind: info.kind, name: info.name });
  m.famousId = id;
  m.refine = { moons: false, optimizeDsm };
  return m;
}

// ------------------------------------------------------------------------------------------------ quick missions

/** What the spacecraft does at the target of a quick mission. */
export type QuickGoal = 'flyby' | 'orbit' | 'rendezvous' | 'entry';
/** efficient: minimum velocity change. fast: shortest flight that needs not more than a given margin above the minimum. */
export type QuickStyle = 'efficient' | 'fast';

export interface QuickRequest {
  target: string;
  goal: QuickGoal;
  /** Earliest launch time, et. */
  after: number;
  style: QuickStyle;
}

/** Bodies with an atmosphere that an entry mission can go into. */
const ATMOSPHERE = ['VENUS', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'];
/**
 * Default altitudes of a quick mission, km above the equatorial radius (product decision: values near those of
 * real missions, outside the main rings for a flyby of Saturn and Uranus).
 */
const QUICK_ALTITUDE: Record<string, { flyby: number; orbit: number }> = {
  MERCURY: { flyby: 500, orbit: 400 }, VENUS: { flyby: 1000, orbit: 400 }, MARS: { flyby: 500, orbit: 400 },
  JUPITER: { flyby: 200000, orbit: 5000 }, SATURN: { flyby: 120000, orbit: 20000 }, URANUS: { flyby: 80000, orbit: 30000 },
  NEPTUNE: { flyby: 5000, orbit: 5000 }, PLUTO: { flyby: 12500, orbit: 1000 },
  CERES: { flyby: 400, orbit: 1000 }, VESTA: { flyby: 400, orbit: 500 }, PSYCHE: { flyby: 300, orbit: 300 },
};

/** Targets of a quick mission and the goals that are possible for each target. */
export function quickTargets(): { id: string; goals: QuickGoal[] }[] {
  const out: { id: string; goals: QuickGoal[] }[] = [];
  for (const b of Object.values(BODIES)) {
    if (b.parent !== 'SUN' || b.id === 'EARTH' || b.naif === 0) continue;
    const massive = b.kind === 'planet' || b.id === 'PLUTO' || ASTEROID_GRAVITY_BODIES.includes(b.id);
    const goals: QuickGoal[] = ['flyby'];
    goals.push(massive ? 'orbit' : 'rendezvous');
    if (ATMOSPHERE.includes(b.id)) goals.push('entry');
    out.push({ id: b.id, goals });
  }
  return out;
}

/** Arrival conditions of a quick mission at a target. */
export function quickArrival(sys: SolarSystem, target: string, goal: QuickGoal, et: number): Plan['arrival'] {
  const b = BODIES[target];
  const alt = QUICK_ALTITUDE[target];
  if (goal === 'entry') return { type: 'entry', periapsisAltitude: -0.02 * b.radius, apoapsisRadius: null };
  if (goal === 'rendezvous') return { type: 'rendezvous', periapsisAltitude: Math.max(2 * b.radius, 5), apoapsisRadius: null };
  if (goal === 'orbit') {
    const rp = b.radius + (alt?.orbit ?? b.radius);
    // Elliptical orbit: the apoapsis is at 15 % of the sphere of influence (a low insertion burn). A moon with more
    // than 1 % of the mass of the body (Charon) makes a large orbit unstable: the apoapsis is then not more than
    // one third of the orbit radius of that moon.
    let limit = 0.15 * soiRadius(sys, target, et);
    for (const [id, m] of Object.entries(MOON_MODELS)) {
      if (BODIES[id].parent === target && BODIES[id].gm > 0.01 * b.gm) limit = Math.min(limit, m.a / 3);
    }
    const ra = Math.max(3 * rp, limit);
    return { type: 'orbit', periapsisAltitude: rp - b.radius, apoapsisRadius: ra };
  }
  return { type: 'flyby', periapsisAltitude: alt?.flyby ?? (b.radius < 5 ? 50 : 200), apoapsisRadius: null };
}

export interface QuickWindow {
  dep: number;
  arr: number;
  c3: number;
  vinfArr: number;
  /** Velocity change from the parking orbit plus the arrival burn, km/s. */
  dvTotal: number;
  /** Grid of the search (launch date and arrival date). */
  porkchop: PorkchopData;
}

/** Cosine of 15 degrees: transfer angles nearer than this to 180 or 360 degrees are not used by the quick search. */
/** Error codes: 'target' (not a possible target or goal), 'coverage' (the dates are outside the ephemeris data). */
export class QuickError extends Error {
  constructor(readonly code: 'target' | 'coverage' | 'window') { super(code); }
}

/**
 * Launch window search for a direct flight from the Earth to a target.
 * The search grid is launch date x arrival date (Lambert solutions). Launch dates: one synodic period after the
 * earliest date (1.1 to 3 years). Flight times: 0.35 to 1.7 times the Hohmann time, not more than 16 years.
 */
export function quickWindow(sys: SolarSystem, q: QuickRequest): QuickWindow {
  const t = quickTargets().find((x) => x.id === q.target);
  if (!t || !t.goals.includes(q.goal)) throw new QuickError('target');
  const cov = sys.coverage(q.target);
  const lo = Math.max(cov[0], sys.etStart) + DAY, hi = Math.min(cov[1], sys.etEnd) - 40 * DAY;
  if (!(q.after >= lo) || !(q.after < hi - 200 * DAY)) throw new QuickError('coverage');
  const syn = synodicPeriod(sys, 'SUN', 'EARTH', q.target, q.after);
  const span = Math.min(Math.max(1.05 * syn, 1.1 * YEAR), 3 * YEAR, hi - q.after - 100 * DAY);
  const hoh = hohmannTof(sys, 'SUN', 'EARTH', q.target, q.after);
  // The range of the flight time is from the orbits. If the end of the data makes the range shorter than its lower
  // limit, the dates are out of the range of the data (a search of very fast, very expensive flights has no use).
  const tofCap = Math.min(Math.max(1.7 * hoh, 400 * DAY), 16 * YEAR);
  const tofMin = Math.max(Math.min(0.35 * hoh, 0.5 * tofCap), 40 * DAY);
  const tofMax = Math.min(tofCap, hi - q.after - span);
  if (!(tofMax > tofMin + 10 * DAY)) throw new QuickError('coverage');
  const arrival = quickArrival(sys, q.target, q.goal, q.after + span);
  const margin = q.goal === 'flyby' || q.goal === 'entry' ? 1.0 : 1.5;
  const pick = (dep: [number, number], arr: [number, number], nx: number, ny: number): QuickWindow | null => {
    const pc = computePorkchop(sys, { central: 'SUN', from: 'EARTH', to: q.target, dep, arr, nx, ny, parkingAltitude: 200, arrival });
    // Cost: velocity change plus a small price for the flight time (0.1 km/s for 10 years).
    let best = -1, bestCost = Infinity;
    const cost = (k: number) => pc.dvTotal[k] + (0.1 * pc.tof[k]) / (10 * YEAR);
    const ok = (k: number) => Number.isFinite(pc.dvTotal[k]) && pc.tof[k] >= tofMin && pc.tof[k] <= tofMax;
    for (let k = 0; k < nx * ny; k++) if (ok(k) && cost(k) < bestCost) { bestCost = cost(k); best = k; }
    if (best < 0) return null;
    if (q.style === 'fast') {
      let fast = best;
      for (let k = 0; k < nx * ny; k++) if (ok(k) && pc.dvTotal[k] <= pc.dvTotal[best] + margin && pc.tof[k] < pc.tof[fast]) fast = k;
      best = fast;
    }
    const ix = best % nx, iy = Math.floor(best / nx);
    return {
      dep: dep[0] + ((dep[1] - dep[0]) * ix) / (nx - 1), arr: arr[0] + ((arr[1] - arr[0]) * iy) / (ny - 1),
      c3: pc.c3[best], vinfArr: pc.vinfArr[best], dvTotal: pc.dvTotal[best], porkchop: pc,
    };
  };
  const dep: [number, number] = [q.after, q.after + span];
  const arr: [number, number] = [q.after + tofMin, q.after + span + tofMax];
  const nx = 96, ny = 120;
  const coarse = pick(dep, arr, nx, ny);
  if (!coarse) throw new QuickError('window');
  // Second search with a fine grid around the best cell (2 cells of the first grid to each side).
  const hx = (2 * (dep[1] - dep[0])) / (nx - 1), hy = (2 * (arr[1] - arr[0])) / (ny - 1);
  const fine = pick(
    [Math.max(dep[0], coarse.dep - hx), Math.min(dep[1], coarse.dep + hx)],
    [Math.max(arr[0], coarse.arr - hy), Math.min(arr[1], coarse.arr + hy)], 33, 33);
  const win = fine && (q.style === 'fast' ? fine.arr - fine.dep <= coarse.arr - coarse.dep : fine.dvTotal <= coarse.dvTotal) ? fine : coarse;
  return { ...win, porkchop: coarse.porkchop };
}

/** Plan of a quick mission: a direct flight from the Earth to the target in the best launch window. */
export function quickMission(sys: SolarSystem, q: QuickRequest, name: string, spacecraft: SpacecraftSpec = DEFAULT_SPACECRAFT): { mission: PlannedMission; window: QuickWindow } {
  const window = quickWindow(sys, q);
  const plan = newPlan(['EARTH', q.target], [window.dep, window.arr]);
  plan.soiTime = true;
  plan.arrival = quickArrival(sys, q.target, q.goal, window.arr);
  return { mission: newMission(name, plan, spacecraft), window };
}
