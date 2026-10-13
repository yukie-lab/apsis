/**
 * Mission plan in the patched-conic model.
 *
 * A plan is a sequence of encounters (body and time). Consecutive encounters are connected by a two-body arc about
 * the central body (Lambert solution), with an optional deep-space maneuver (DSM). Each intermediate encounter is
 * a gravity assist. The sphere of influence of each body has zero radius in this model.
 *
 * Accuracy: this model ignores the gravity of the planets along the arcs and the time inside each sphere of
 * influence. Typical errors: speed at infinity 1 % to 3 %, flyby periapsis several percent. Use the flight
 * (numerical) model to refine a plan.
 */
import { type State, type Vec3, add, sub, norm, scale, unit, cross } from './vec';
import { lambert, type LambertSolution } from './lambert';
import { keplerPropagate, elementsFromState, type Elements } from './kepler';
import { flyby, flybyOut, bPlaneTarget, type FlybyResult } from './flyby';
import { BODIES } from './bodies';
import type { SolarSystem } from './system';
import { soiRadius } from './propagate';
import { ECLIPTIC_POLE, ICRF_TO_ECLIP, ECLIP_TO_ICRF, poleVector, raDec } from './frames';
import { mulMV } from './vec';

export interface PlanNode { body: string; et: number }

export interface DsmParams {
  /** Fraction of the leg duration at which the maneuver occurs (0..1). */
  eta: number;
  /** First leg: speed at infinity at departure (km/s) and direction of the asymptote in ECLIPJ2000 (rad). */
  vinf?: number; lon?: number; lat?: number;
  /** Other legs: periapsis radius of the preceding flyby in body radii, and the angle of the flyby plane (rad). */
  rpRadii?: number; beta?: number;
}

export interface PlanLeg {
  /** Complete revolutions about the central body. */
  revs: number;
  branch: LambertSolution['branch'];
  retrograde: boolean;
  dsm: DsmParams | null;
}

/**
 * flyby: pass the last body and continue. orbit: burn at the periapsis to stay in an orbit. rendezvous: burn to
 * get the velocity of the body (small bodies). entry: the periapsis is in the atmosphere or below the surface;
 * the flight ends there with no burn.
 */
export type ArrivalType = 'flyby' | 'orbit' | 'rendezvous' | 'entry';

export interface Plan {
  /** Central body of the arcs (usually SUN). */
  central: string;
  nodes: PlanNode[];
  legs: PlanLeg[];
  /** Circular parking orbit altitude at the first body, km. */
  parkingAltitude: number;
  /**
   * Arrival at the last body. periapsisAltitude: km above the equatorial radius. apoapsisRadius: km from the centre
   * (orbit arrival; null = circular orbit). bAngle: direction of the aim point in the B-plane, rad from the T axis
   * toward the R axis (default 0). coastDays: flight time after a flyby of the last body (default: from the size
   * of the sphere of influence).
   */
  arrival: { type: ArrivalType; periapsisAltitude: number; apoapsisRadius: number | null; bAngle?: number; coastDays?: number };
  /** Minimum flyby altitude for each node (km). Missing entry: default of the body. */
  minFlybyAltitude: Record<number, number>;
  /**
   * Sphere-of-influence time correction. false or missing: classical patched conics (the spacecraft is at the centre
   * of each body at the node time, the body has no size). true: the node time is the periapsis time. Each arc then
   * starts and ends at the time at which the straight motion on the asymptote comes to the body (see
   * asymptoteTimeShift). The difference is some minutes at the Earth and many days at Jupiter.
   */
  soiTime?: boolean;
}

export interface Arc {
  et0: number;
  duration: number;
  /** State at et0 relative to the central body, ICRF. */
  state0: State;
}

export interface LegResult {
  ok: boolean;
  arcs: Arc[];
  /** Velocity at the start and end of the leg relative to the central body, km/s. */
  vDep: Vec3;
  vArr: Vec3;
  dsm: { et: number; dv: Vec3; dvMag: number; r: Vec3 } | null;
  elements: Elements | null;
}

export interface NodeResult {
  body: string;
  et: number;
  /** State of the body relative to the central body. */
  bodyState: State;
  vinfIn: Vec3 | null;
  vinfOut: Vec3 | null;
  flyby: (FlybyResult & { altitude: number; minAltitude: number; BdotT: number; BdotR: number }) | null;
}

export interface PlanResult {
  ok: boolean;
  nodes: NodeResult[];
  legs: LegResult[];
  departure: { vinf: number; c3: number; dv: number; dla: number; rla: number; vinfVec: Vec3 };
  arrival: { vinf: number; dv: number; vinfVec: Vec3; type: ArrivalType };
  dvFlybys: number;
  dvDsm: number;
  /** Total velocity change after launch (flybys, DSM, arrival), km/s. */
  dvAfterLaunch: number;
  /** Total with the departure burn from the parking orbit, km/s. */
  dvTotal: number;
  tof: number;
}

export const defaultLeg = (): PlanLeg => ({ revs: 0, branch: 'single', retrograde: false, dsm: null });

export function newPlan(bodies: string[], times: number[]): Plan {
  return {
    central: 'SUN',
    nodes: bodies.map((b, i) => ({ body: b, et: times[i] })),
    legs: bodies.slice(1).map(defaultLeg),
    parkingAltitude: 200,
    arrival: { type: 'flyby', periapsisAltitude: 500, apoapsisRadius: null },
    minFlybyAltitude: {},
  };
}

export function centralMu(central: string): number {
  return BODIES[central].gmSystem;
}
export function refNormal(central: string, et: number): Vec3 {
  return central === 'SUN' ? ECLIPTIC_POLE : poleVector(BODIES[central], et);
}

function pickLambert(sols: LambertSolution[], leg: PlanLeg): LambertSolution | null {
  if (leg.revs === 0) return sols[0] ?? null;
  return sols.find((s) => s.revs === leg.revs && s.branch === (leg.branch === 'single' ? 'left' : leg.branch)) ?? null;
}

const eclToIcrf = (v: Vec3) => mulMV(ECLIP_TO_ICRF, v);

/**
 * Time (s) between the periapsis of a hyperbola and the time at which a straight motion on its asymptote (speed
 * vinf) comes to the point nearest to the body. The gravity of the body makes the real approach faster than the
 * straight motion, thus the value is positive. The two motions are compared at the distance rSoi (the value
 * increases with the logarithm of that distance).
 */
export function asymptoteTimeShift(mu: number, vinf: number, rp: number, rSoi: number): number {
  if (!(mu > 0) || !(vinf > 0) || !(rSoi > rp)) return 0;
  const a = mu / (vinf * vinf);
  const e = 1 + rp / a;
  const b2 = a * a * (e * e - 1);
  if (rSoi * rSoi <= b2) return 0;
  const F = Math.acosh((1 + rSoi / a) / e);
  const tHyperbola = (Math.sqrt(rSoi * rSoi + 2 * a * rSoi - b2) - a * F) / vinf;
  const tLine = Math.sqrt(rSoi * rSoi - b2) / vinf;
  return Math.max(0, tLine - tHyperbola);
}

/** Evaluate a plan: arcs, flybys and the velocity budget. */
export function evaluatePlan(sys: SolarSystem, plan: Plan): PlanResult {
  const mu = centralMu(plan.central);
  const n = plan.nodes.length;
  const bodyStates = plan.nodes.map((nd) => sys.stateRel(nd.body, plan.central, nd.et));
  let legs: LegResult[] = [];
  const vinfIn: (Vec3 | null)[] = new Array(n).fill(null);
  const vinfOut: (Vec3 | null)[] = new Array(n).fill(null);
  let ok = true;
  // Sphere-of-influence time correction: the arc from node i starts shiftOut[i] before the node time, and the arc
  // to node i ends shiftIn[i] after the node time. The values come from the speeds of the pass before.
  const shiftOut = new Array<number>(n).fill(0), shiftIn = new Array<number>(n).fill(0);
  const passes = plan.soiTime ? 3 : 1;
  for (let pass = 0; pass < passes; pass++) {
    if (pass > 0) {
      for (let i = 0; i < n; i++) {
        const body = BODIES[plan.nodes[i].body];
        if (!(body.gm > 0) || !body.parent) continue;
        const rSoi = soiRadius(sys, plan.nodes[i].body, plan.nodes[i].et);
        let rp = body.radius + (i === 0 ? plan.parkingAltitude : i === n - 1 ? Math.max(plan.arrival.periapsisAltitude, 0) : plan.minFlybyAltitude[i] ?? body.minFlybyAltitude);
        if (i > 0 && i < n - 1 && vinfIn[i] && vinfOut[i]) {
          const f = flyby(body.gm, vinfIn[i]!, vinfOut[i]!, rp);
          if (isFinite(f.rp)) rp = f.rp;
        }
        if (vinfOut[i]) shiftOut[i] = asymptoteTimeShift(body.gm, norm(vinfOut[i]!), rp, rSoi);
        if (vinfIn[i]) shiftIn[i] = asymptoteTimeShift(body.gm, norm(vinfIn[i]!), rp, rSoi);
      }
    }
    legs = [];
    ok = true;
    for (let i = 0; i < n - 1; i++) {
      const leg = plan.legs[i];
      const ta = plan.nodes[i].et - shiftOut[i], tb = plan.nodes[i + 1].et + shiftIn[i + 1];
      const a = shiftOut[i] === 0 ? bodyStates[i] : sys.stateRel(plan.nodes[i].body, plan.central, ta);
      const b = shiftIn[i + 1] === 0 ? bodyStates[i + 1] : sys.stateRel(plan.nodes[i + 1].body, plan.central, tb);
      const tofNodes = plan.nodes[i + 1].et - plan.nodes[i].et;
      const tof = tb - ta;
      const ref = refNormal(plan.central, plan.nodes[i].et);
      const bad: LegResult = { ok: false, arcs: [], vDep: [0, 0, 0], vArr: [0, 0, 0], dsm: null, elements: null };
      if (!(tofNodes > 0)) { legs.push(bad); ok = false; continue; }
      if (!leg.dsm) {
        const sol = pickLambert(lambert(mu, a.r, b.r, tof, { maxRevs: leg.revs, retrograde: leg.retrograde, refNormal: ref }), leg);
        if (!sol) { legs.push(bad); ok = false; continue; }
        vinfOut[i] = sub(sol.v1, a.v);
        vinfIn[i + 1] = sub(sol.v2, b.v);
        legs.push({ ok: true, arcs: [{ et0: ta, duration: tof, state0: { r: a.r, v: sol.v1 } }], vDep: sol.v1, vArr: sol.v2, dsm: null, elements: elementsFromState({ r: a.r, v: sol.v1 }, mu) });
      } else {
        const d = leg.dsm;
        let vout: Vec3;
        if (i === 0 || !vinfIn[i]) {
          const v = d.vinf ?? 3, lon = d.lon ?? 0, lat = d.lat ?? 0;
          vout = scale(eclToIcrf([Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]), v);
        } else {
          const body = BODIES[plan.nodes[i].body];
          vout = flybyOut(body.gm, vinfIn[i]!, (d.rpRadii ?? 2) * body.radius, d.beta ?? 0, unit(cross(a.r, a.v)));
        }
        const v1 = add(a.v, vout);
        // The time of the maneuver is a fraction of the time between the nodes.
        const t1 = plan.nodes[i].et + Math.min(0.999, Math.max(0.001, d.eta)) * tofNodes - ta;
        const mid = keplerPropagate({ r: a.r, v: v1 }, t1, mu);
        const sol = pickLambert(lambert(mu, mid.r, b.r, tof - t1, { maxRevs: leg.revs, retrograde: leg.retrograde, refNormal: ref }), leg);
        if (!sol) { legs.push(bad); ok = false; continue; }
        const dv = sub(sol.v1, mid.v);
        vinfOut[i] = vout;
        vinfIn[i + 1] = sub(sol.v2, b.v);
        legs.push({
          ok: true,
          arcs: [
            { et0: ta, duration: t1, state0: { r: a.r, v: v1 } },
            { et0: ta + t1, duration: tof - t1, state0: { r: mid.r, v: sol.v1 } },
          ],
          vDep: v1, vArr: sol.v2,
          dsm: { et: ta + t1, dv, dvMag: norm(dv), r: mid.r },
          elements: elementsFromState({ r: a.r, v: v1 }, mu),
        });
      }
    }
  }

  const nodes: NodeResult[] = plan.nodes.map((nd, i) => {
    let fb: NodeResult['flyby'] = null;
    if (i > 0 && i < n - 1 && vinfIn[i] && vinfOut[i]) {
      const body = BODIES[nd.body];
      const minAlt = plan.minFlybyAltitude[i] ?? body.minFlybyAltitude;
      if (body.gm > 0) {
        const f = flyby(body.gm, vinfIn[i]!, vinfOut[i]!, body.radius + minAlt);
        const pole = plan.central === 'SUN' ? ECLIPTIC_POLE : poleVector(BODIES[plan.central], nd.et);
        const bt = isFinite(f.rp) ? bPlaneTarget(body.gm, vinfIn[i]!, vinfOut[i]!, f.rp, pole) : { BdotT: 0, BdotR: 0 };
        fb = { ...f, altitude: f.rp - body.radius, minAltitude: minAlt, BdotT: bt.BdotT, BdotR: bt.BdotR };
      } else {
        // A body with no mass cannot turn the path: the full velocity difference is an engine burn.
        const dv = norm(sub(vinfOut[i]!, vinfIn[i]!));
        fb = { vinfIn: norm(vinfIn[i]!), vinfOut: norm(vinfOut[i]!), turn: 0, rp: Infinity, rpNeeded: Infinity, dv, limited: true, maxTurn: 0, altitude: Infinity, minAltitude: minAlt, BdotT: 0, BdotR: 0 };
      }
    }
    return { body: nd.body, et: nd.et, bodyState: bodyStates[i], vinfIn: vinfIn[i], vinfOut: vinfOut[i], flyby: fb };
  });

  // departure
  const b0 = BODIES[plan.nodes[0].body];
  const v0 = vinfOut[0] ?? [0, 0, 0];
  const vinf0 = norm(v0);
  const rpark = b0.radius + plan.parkingAltitude;
  const dvDep = b0.gm > 0 ? Math.sqrt(vinf0 * vinf0 + (2 * b0.gm) / rpark) - Math.sqrt(b0.gm / rpark) : vinf0;
  const eq = raDec(v0); // equatorial (ICRF) right ascension and declination of the launch asymptote
  // arrival
  const bN = BODIES[plan.nodes[n - 1].body];
  const vN = vinfIn[n - 1] ?? [0, 0, 0];
  const vinfN = norm(vN);
  let dvArr = 0;
  if (plan.arrival.type === 'rendezvous' || (plan.arrival.type === 'orbit' && bN.gm <= 0)) dvArr = vinfN;
  else if (plan.arrival.type === 'orbit') {
    const rp = bN.radius + plan.arrival.periapsisAltitude;
    const ra = plan.arrival.apoapsisRadius ?? rp;
    const a = (rp + Math.max(ra, rp)) / 2;
    dvArr = Math.sqrt(vinfN * vinfN + (2 * bN.gm) / rp) - Math.sqrt(bN.gm * (2 / rp - 1 / a));
  }
  let dvFly = 0, dvDsm = 0;
  for (const nd of nodes) if (nd.flyby) dvFly += nd.flyby.dv;
  for (const l of legs) if (l.dsm) dvDsm += l.dsm.dvMag;
  const after = dvFly + dvDsm + dvArr;
  return {
    ok, nodes, legs,
    departure: { vinf: vinf0, c3: vinf0 * vinf0, dv: dvDep, dla: eq.dec, rla: eq.ra, vinfVec: v0 },
    arrival: { vinf: vinfN, dv: dvArr, vinfVec: vN, type: plan.arrival.type },
    dvFlybys: dvFly, dvDsm, dvAfterLaunch: after, dvTotal: after + dvDep,
    tof: plan.nodes[n - 1].et - plan.nodes[0].et,
  };
}

/** Position on a plan at time et, relative to the central body. Returns null outside the plan. */
export function planStateAt(result: PlanResult, central: string, et: number): State | null {
  const mu = centralMu(central);
  for (const leg of result.legs) {
    for (const arc of leg.arcs) {
      if (et >= arc.et0 && et <= arc.et0 + arc.duration) return keplerPropagate(arc.state0, et - arc.et0, mu);
    }
  }
  return null;
}

/** Ecliptic longitude and latitude (rad) of an ICRF direction. */
export function eclipticLonLat(v: Vec3): { lon: number; lat: number } {
  const e = mulMV(ICRF_TO_ECLIP, v);
  const r = raDec(e);
  return { lon: r.ra, lat: r.dec };
}
