/**
 * Mission model that the two modes of the application share.
 * A mission has a plan (patched conics) and, after the conversion, a flight (numerical trajectory with maneuvers).
 *
 * Real missions: data/famous.json has only facts from the JPL Horizons trajectories (sequence of bodies, times,
 * aim point at the last body, maneuver times). The path of a real mission is solved by this engine at run time.
 */
import famousData from './data/famous.json';
import { type Plan, newPlan, evaluatePlan, type PlanResult } from './plan';
import { optimizePlan } from './planopt';
import { type Flight, refinePlan, type RefineReport, type RefineOptions } from './flight';
import { FULL_MODEL, type ForceModel, type Trajectory } from './propagate';
import type { SolarSystem } from './system';
import { BODIES, G0 } from './bodies';
import { jdTdbToEt, tdb } from './time';

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
  plan: Plan;
  /** Options of the conversion from the plan to the flight. */
  refine: { moons: boolean; optimizeDsm: boolean };
  flight: Flight | null;
  /** plan: converted from the plan. manual: edited by the user. import: read from a file. */
  flightOrigin: 'plan' | 'manual' | 'import' | null;
}

export const DEFAULT_SPACECRAFT: SpacecraftSpec = { kind: 'apsis', name: 'Explorer 1', dryMassKg: 1200, propellantKg: 800, ispS: 320, srpAreaM2: 12, cr: 1.3 };

let counter = 0;
export function newMissionId(): string {
  counter += 1;
  return 'm' + Date.now().toString(36) + counter.toString(36);
}

export function newMission(name: string, plan: Plan, spacecraft: SpacecraftSpec = DEFAULT_SPACECRAFT): Mission {
  return { format: 'apsis-mission', version: 1, id: newMissionId(), name, famousId: null, spacecraft: { ...spacecraft }, plan, refine: { moons: false, optimizeDsm: false }, flight: null, flightOrigin: null };
}

/** Force model of the conversion for a mission. Pluto and Charon are always separate masses. */
export function refineModel(m: Mission): ForceModel {
  const pluto = m.plan.nodes.some((n) => n.body === 'PLUTO' || n.body === 'CHARON');
  return { ...FULL_MODEL, moons: m.refine.moons || pluto };
}

export interface SolvedMission { mission: Mission; result: PlanResult; report: RefineReport; trajectory: Trajectory }

/** Convert the plan of a mission to a flight. Returns a new mission object. */
export function solveMission(sys: SolarSystem, m: Mission, onProgress?: RefineOptions['onProgress']): SolvedMission {
  const result = evaluatePlan(sys, m.plan);
  if (!result.ok) throw new Error('plan');
  const out = refinePlan(sys, m.plan, result, { model: refineModel(m), optimizeDsm: m.refine.optimizeDsm, onProgress });
  return { mission: { ...m, flight: out.flight, flightOrigin: 'plan' }, result, report: out.report, trajectory: out.trajectory };
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
  const p = m.plan;
  if (!p || !Array.isArray(p.nodes) || p.nodes.length < 2 || !Array.isArray(p.legs) || p.legs.length !== p.nodes.length - 1) throw new Error('plan');
  for (const n of p.nodes) if (typeof n.body !== 'string' || typeof n.et !== 'number' || !isFinite(n.et)) throw new Error('plan');
  if (!m.spacecraft || typeof m.spacecraft.kind !== 'string') throw new Error('spacecraft');
  const f = m.flight;
  if (f) {
    const okVec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && isFinite(x));
    if (typeof f.et0 !== 'number' || typeof f.etEnd !== 'number' || !f.state0 || !okVec(f.state0.r) || !okVec(f.state0.v) || !Array.isArray(f.maneuvers) || !f.model) throw new Error('flight');
    for (const mv of f.maneuvers) if (typeof mv.et !== 'number' || !okVec(mv.dv)) throw new Error('flight');
  }
  return {
    format: 'apsis-mission', version: 1, id: typeof m.id === 'string' ? m.id : newMissionId(), name: typeof m.name === 'string' ? m.name : 'Mission',
    famousId: typeof m.famousId === 'string' ? m.famousId : null,
    spacecraft: { ...DEFAULT_SPACECRAFT, ...m.spacecraft }, plan: p as Plan,
    refine: { moons: !!m.refine?.moons, optimizeDsm: !!m.refine?.optimizeDsm },
    flight: f ?? null, flightOrigin: f ? m.flightOrigin ?? 'import' : null,
  };
}

// ------------------------------------------------------------------------------------------------ real missions

interface FamousEncounter { body: string; jdTdb: number; radiusKm: number; vinfKmS: number; aim?: { BdotT: number; BdotR: number }; note?: string }
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
export function famousMission(sys: SolarSystem, id: string): Mission {
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
