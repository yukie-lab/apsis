/**
 * Aim of a flight at an encounter (B-plane values), and a targeter that changes one maneuver to get a given aim.
 *
 * B-plane axes: S = direction of the incoming asymptote, T = S x pole / |S x pole|, R = S x T. The pole is the
 * north pole of the ecliptic of J2000 (the same axes as the encounter report of a mission).
 * The aim is measured on the approach hyperbola: the two-body orbit that has the state of the spacecraft at the
 * time `lead` before the closest approach, where the spacecraft is 30 body radii from the body (not more than 0.3
 * of the radius of the sphere of influence, not less than 2 periapsis radii). At this distance the oblateness of
 * the body has almost no effect, thus the values are the values of the approach asymptote.
 * If the spacecraft does a burn near the closest approach (an orbit insertion), the state at the closest approach
 * is not on a hyperbola: the approach hyperbola is then found from the trajectory before the burn.
 */
import type { Flight } from './flight';
import { newtonSolve } from './flight';
import { Propagator, soiRadius, type Maneuver, type Trajectory, type TrajectoryEvent } from './propagate';
import { bPlane } from './flyby';
import { ECLIPTIC_POLE, icrfToLocal, localToIcrf } from './frames';
import { BODIES } from './bodies';
import type { SolarSystem } from './system';
import { type State, type Vec3, add, cross, dot, norm, sub, unit } from './vec';

export interface Aim {
  body: string;
  /** Time of the closest approach, et. */
  et: number;
  /** Distance from the centre of the body at the closest approach, km, and altitude above the equatorial radius. */
  radius: number;
  altitude: number;
  /** Speed relative to the body at the closest approach, km/s. */
  speed: number;
  /** Speed at infinity and aim point of the approach hyperbola. NaN if the approach orbit is not a hyperbola. */
  vinf: number;
  BdotT: number;
  BdotR: number;
  /** Time before the closest approach at which the approach hyperbola is measured, s. */
  lead: number;
}

function relTo(sys: SolarSystem, body: string, et: number, s: State): State {
  const b = sys.state(body, et);
  return { r: sub(s.r, b.r), v: sub(s.v, b.v) };
}

/** Closest approach to a body that is nearest to the time et. null: the trajectory has no closest approach to the body. */
export function nearestApproach(events: TrajectoryEvent[], body: string, et: number): TrajectoryEvent | null {
  let best: TrajectoryEvent | null = null;
  for (const e of events) {
    if ((e.type === 'periapsis' || e.type === 'impact') && e.body === body && (!best || Math.abs(e.et - et) < Math.abs(best.et - et))) best = e;
  }
  return best;
}

/**
 * Lead time for the measurement of the approach hyperbola: the time of flight from the distance D to the periapsis
 * on a hyperbola with the periapsis radius rp and the speed at infinity vinf.
 */
export function approachLead(sys: SolarSystem, body: string, et: number, rp: number, vinf: number): number {
  const b = BODIES[body];
  const mu = b.gmSystem;
  if (mu <= 0 || !(vinf > 0)) return 0;
  const a = mu / (vinf * vinf);
  const e = 1 + rp / a;
  const D = Math.max(Math.min(30 * b.radius, 0.3 * soiRadius(sys, body, et)), 2 * rp);
  const F = Math.acosh(Math.max(1, (1 + D / a) / e));
  return (e * Math.sinh(F) - F) / Math.sqrt(mu / (a * a * a));
}

/** B-plane values of a state relative to a body. Small body with no gravity: the miss vector in the plane normal to the relative velocity. */
function aimValues(rel: State, mu: number): { vinf: number; bt: number; br: number; ttp: number } | null {
  if (mu <= 0) {
    const S = unit(rel.v);
    const T = unit(cross(S, ECLIPTIC_POLE));
    const R = cross(S, T);
    return { vinf: norm(rel.v), bt: dot(rel.r, T), br: dot(rel.r, R), ttp: -dot(rel.r, S) / norm(rel.v) };
  }
  const bp = bPlane(rel, mu, ECLIPTIC_POLE);
  return bp ? { vinf: bp.vinf, bt: bp.BdotT, br: bp.BdotR, ttp: bp.timeToPeriapsis } : null;
}

/**
 * Aim of a trajectory at the closest approach `ev` to a body.
 * @param maneuverTimes  times of the maneuvers of the flight: the approach hyperbola is measured after the last
 *                       maneuver before the closest approach.
 */
export function measureAim(sys: SolarSystem, tr: Trajectory, ev: TrajectoryEvent, maneuverTimes: number[] = []): Aim {
  const body = ev.body!;
  const b = BODIES[body];
  const mu = b.gmSystem;
  const rel = relTo(sys, body, ev.et, ev.state);
  const radius = norm(rel.r), speed = norm(rel.v);
  const out: Aim = { body, et: ev.et, radius, altitude: radius - b.radius, speed, vinf: NaN, BdotT: NaN, BdotR: NaN, lead: 0 };
  const ap = approachOrbit(sys, tr, ev);
  if (!ap) return out;
  let lead = Math.max(approachLead(sys, body, ap.tp, ap.rp, ap.vinf), ap.minLead);
  // A maneuver before the closest approach aims at the encounter: the hyperbola is measured after it. A burn near
  // the closest approach (in the last hour, or an orbit insertion) is not such a maneuver.
  const window = Math.max(2 * ap.minLead, 3600);
  const before = Math.max(tr.et0, ...maneuverTimes.filter((t) => t < ap.tp - window));
  lead = Math.max(Math.min(lead, 0.5 * (ap.tp - before)), ap.minLead);
  lead = Math.min(lead, ap.tp - tr.et0);
  const v = aimValues(relTo(sys, body, ap.tp - lead, tr.stateAt(ap.tp - lead)), mu);
  if (!v) return out;
  return { ...out, vinf: v.vinf, BdotT: v.bt, BdotR: v.br, lead };
}

/**
 * Approach hyperbola of a closest approach: periapsis radius, speed at infinity and periapsis time.
 * minLead is 0 if the state at the closest approach is on the hyperbola. If that state is on a closed orbit (the
 * spacecraft did a burn before it), the hyperbola comes from the trajectory at the time minLead before the closest
 * approach, and a measurement of the approach must not be later than that time.
 * null: the approach is not a hyperbola.
 */
export function approachOrbit(sys: SolarSystem, tr: Trajectory, ev: TrajectoryEvent): { rp: number; vinf: number; tp: number; minLead: number } | null {
  const body = ev.body!;
  const mu = BODIES[body].gmSystem;
  const rel = relTo(sys, body, ev.et, ev.state);
  const radius = norm(rel.r), speed = norm(rel.v);
  const c3 = speed * speed - (mu > 0 ? (2 * mu) / radius : 0);
  if (c3 > 0) return { rp: radius, vinf: Math.sqrt(c3), tp: ev.et, minLead: 0 };
  if (mu <= 0) return null;
  for (let tau = 60; tau < 40 * 86400; tau *= 4) {
    const tA = ev.et - tau;
    if (tA <= tr.et0) break;
    const bp = bPlane(relTo(sys, body, tA, tr.stateAt(tA)), mu, ECLIPTIC_POLE);
    // The hyperbola must be the approach to this closest approach: its periapsis is in the future, near the event.
    if (bp && bp.timeToPeriapsis > 0 && bp.timeToPeriapsis < 3 * tau + 600) return { rp: bp.rp, vinf: bp.vinf, tp: tA + bp.timeToPeriapsis, minLead: tau };
  }
  return null;
}

/** Periapsis radius (km) of a hyperbola with the B-plane distance b (km) and the speed at infinity vinf (km/s). */
export function periapsisFromB(mu: number, b: number, vinf: number): number {
  if (mu <= 0) return b;
  const a = mu / (vinf * vinf);
  return Math.sqrt(a * a + b * b) - a;
}
/** B-plane distance (km) of a hyperbola with the periapsis radius rp (km) and the speed at infinity vinf (km/s). */
export function bFromPeriapsis(mu: number, rp: number, vinf: number): number {
  return mu <= 0 ? rp : rp * Math.sqrt(1 + (2 * mu) / (rp * vinf * vinf));
}

export interface TargetRequest {
  flight: Flight;
  /** Identifier of the maneuver that the targeter changes. */
  maneuverId: string;
  /** Body of the encounter, and a time near its closest approach in the flight. */
  body: string;
  et: number;
  /** Aim point to get, km. */
  BdotT: number;
  BdotR: number;
  /** Time of the closest approach to get, et. null: the time is free (the change of the maneuver is then the smallest one). */
  tca: number | null;
}
export interface TargetResult {
  converged: boolean;
  iterations: number;
  /** New components of the maneuver in its frame, km/s. */
  dv: Vec3;
  /** Magnitude of the maneuver before and after the calculation, km/s. */
  dvBefore: number;
  dvAfter: number;
  /** Differences from the aim that stay after the calculation: km, km, s (0 for a free time). */
  miss: { BdotT: number; BdotR: number; time: number };
}

/** Error codes of the targeter (the message of the Error). */
export type TargetError = 'target:maneuver' | 'target:encounter' | 'target:path' | 'target:order';

const noAnchor = (m: Maneuver): Maneuver => { const { anchor: _a, ...rest } = m; return rest; };

/**
 * Change one maneuver of a flight (its three components) so that the approach to a body has a given aim point and,
 * if `tca` is set, a given time of the closest approach. Damped Newton method with a finite-difference Jacobian.
 * Maneuvers after the changed maneuver and before the encounter stay as they are.
 */
export function targetManeuver(sys: SolarSystem, req: TargetRequest, onProgress?: (text: string) => void): TargetResult {
  const f = req.flight;
  const prop = new Propagator(sys, f.model);
  const target = f.maneuvers.find((m) => m.id === req.maneuverId);
  if (!target) throw new Error('target:maneuver');
  const tm = target.et;
  if (!(tm >= f.et0) || !(tm < f.etEnd)) throw new Error('target:maneuver');
  const earlier = f.maneuvers.filter((m) => m.id !== target.id && m.et <= tm);
  const later = f.maneuvers.filter((m) => m.id !== target.id && m.et > tm).map(noAnchor);

  // State immediately before the maneuver.
  let before: State;
  if (tm === f.et0 && earlier.length === 0) before = f.state0;
  else {
    const tr = prop.propagate({ et0: f.et0, state0: f.state0, etEnd: tm, maneuvers: earlier, model: f.model, noEvents: true });
    if (tr.failure || tr.et1 !== tm) throw new Error('target:path');
    before = tr.stateAt(tm);
  }
  const refRel = relTo(sys, target.refBody, tm, before);
  const x0 = localToIcrf(target.frame, refRel, target.dv);
  const afterBurn = (x: number[]): State => ({ r: before.r, v: add(before.v, x as Vec3) });

  // The aim is measured at a time before the closest approach that comes from the approach orbit (see measureAim).
  // The solution changes the approach orbit, thus the calculation is done again with the new measurement time
  // until that time does not change: the aim of the flight, measured again, is then the requested aim.
  const mu = BODIES[req.body].gmSystem;
  const sc = Math.max(BODIES[req.body].radius * 1e-6, 0.02);
  const T_UNIT = 0.05;
  const approach = (x: number[], near: number) => {
    const tr = prop.propagate({ et0: tm, state0: afterBurn(x), etEnd: Math.min(f.etEnd, near + 90 * 86400), maneuvers: later, model: f.model, watch: [req.body] });
    const ev = nearestApproach(tr.events, req.body, near);
    if (!ev || !(ev.et > tm)) return null;
    return approachOrbit(sys, tr, ev);
  };
  let ap = approach(x0 as number[], req.et);
  if (!ap) throw new Error('target:encounter');
  let x = x0 as number[];
  let iterations = 0, converged = false;
  let lead = 0, tAim = 0;
  let end: { bt: number; br: number; ttp: number } | null = null;
  let count = 0;
  for (let pass = 0; pass < 6; pass++) {
    const tca = req.tca ?? ap.tp;
    if (!(tca > tm)) throw new Error('target:order');
    // The approach is measured after the changed maneuver and the maneuvers that follow it, and before a burn near
    // the closest approach (a burn in the last hour, or an orbit insertion).
    const window = Math.max(2 * ap.minLead, 3600);
    const lastBurn = Math.max(tm, ...later.filter((m) => m.et < tca - window).map((m) => m.et));
    lead = Math.min(Math.max(approachLead(sys, req.body, ap.tp, ap.rp, ap.vinf), ap.minLead), 0.5 * (tca - lastBurn));
    if (lead < ap.minLead || !(lead > 0)) throw new Error('target:order');
    const moved = Math.abs(tca - lead - tAim);
    tAim = tca - lead;
    // The measurement time is the same as in the last pass (5 s): the solution of the last pass is the result.
    if (pass > 0 && moved < 5) break;
    const at = tAim, ld = lead;
    const between = later.filter((m) => m.et < at);
    const values = (xx: number[]): { bt: number; br: number; ttp: number } | null => {
      const tr = prop.propagate({ et0: tm, state0: afterBurn(xx), etEnd: at, maneuvers: between, model: f.model, noEvents: true });
      if (tr.failure) return null;
      return aimValues(relTo(sys, req.body, at, tr.stateAt(at)), mu);
    };
    // Residual units: 1e-6 body radius but not less than 20 m (aim point), and 0.05 s (time).
    const residual = (xx: number[]): number[] | null => {
      const v = values(xx);
      if (!v) return null;
      count += 1;
      if (count % 4 === 1) onProgress?.(`${Math.hypot(v.bt - req.BdotT, v.br - req.BdotR).toPrecision(3)}`);
      const r = [(v.bt - req.BdotT) / sc, (v.br - req.BdotR) / sc];
      if (req.tca !== null) r.push((v.ttp - ld) / T_UNIT);
      return r;
    };
    const sol = newtonSolve(residual, x, [1e-7, 1e-7, 1e-7], 1, 40, 20);
    iterations += sol.iterations;
    converged = sol.converged;
    x = sol.x;
    end = values(x);
    if (!converged || !end) break;
    const next = approach(x, tca);
    if (!next) break;
    ap = next;
  }
  const dvIcrf = x as Vec3;
  return {
    converged: converged && !!end,
    iterations,
    dv: icrfToLocal(target.frame, refRel, dvIcrf),
    dvBefore: norm(x0),
    dvAfter: norm(dvIcrf),
    miss: end ? { BdotT: end.bt - req.BdotT, BdotR: end.br - req.BdotR, time: req.tca !== null ? end.ttp - lead : 0 } : { BdotT: NaN, BdotR: NaN, time: NaN },
  };
}
