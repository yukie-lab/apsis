/**
 * Maneuver targeter (Maneuvers screen: change one maneuver to get an aim point at an encounter).
 *
 * This is a test of the solver, not of the physics: the aim is an input. The flight that the targeter gives is
 * propagated again from its start, and the aim of that trajectory is measured with the event search of the
 * propagator (a different code path from the residual of the targeter). The physics of the propagator and of the
 * B-plane functions is tested against JPL Horizons and exact solutions in the other test files.
 *
 * The B-plane functions are also compared here with an exact two-body hyperbola (analytic reference).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, Recorder } from './util';
import { quickMission, solveMission, famousMission } from '../src/engine/mission';
import { flyFlight, type Flight } from '../src/engine/flight';
import { targetManeuver, measureAim, nearestApproach, periapsisFromB, bFromPeriapsis, type Aim } from '../src/engine/target';
import { bPlane } from '../src/engine/flyby';
import { stateFromElements } from '../src/engine/kepler';
import { BODIES } from '../src/engine/bodies';
import { tdb, DAY } from '../src/engine/time';
import { norm } from '../src/engine/vec';

const rec = new Recorder('target');
const sys = solarSystem();
afterAll(() => rec.save());

describe('B-plane distance and periapsis radius', () => {
  it('agrees with an exact hyperbola', () => {
    // Hyperbola about Jupiter from its elements: rp and e are inputs, thus b = a sqrt(e^2 - 1) is exact.
    const mu = BODIES.JUPITER.gmSystem;
    let worst = 0;
    for (const [rp, vinf] of [[2.0e5, 6], [7.5e5, 10.5], [9.8e6, 10.4], [8.0e4, 3]] as const) {
      const a = mu / (vinf * vinf);
      const e = 1 + rp / a;
      const b = a * Math.sqrt(e * e - 1);
      worst = Math.max(worst, Math.abs(bFromPeriapsis(mu, rp, vinf) / b - 1), Math.abs(periapsisFromB(mu, b, vinf) / rp - 1));
      // A state on the hyperbola before the periapsis gives the same b and the same v-infinity.
      const s = stateFromElements({ p: a * (e * e - 1), e, i: 0.4, raan: 1.1, argp: 2.2, nu: -1.2 }, mu);
      const bp = bPlane(s, mu)!;
      worst = Math.max(worst, Math.abs(Math.hypot(bp.BdotT, bp.BdotR) / b - 1), Math.abs(bp.vinf / vinf - 1), Math.abs(bp.rp / rp - 1));
    }
    rec.add({ id: 'target.bplane', group: 'analytic', value: worst, unit: 'relative', limit: 1e-11, truth: 'Exact two-body hyperbola from its elements: b = a sqrt(e^2 - 1).' });
    expect(worst).toBeLessThan(1e-11);
  });
});

describe('targeter: one maneuver, aim point at Mars', () => {
  const { mission } = quickMission(sys, { target: 'MARS', goal: 'flyby', after: tdb('2026-11-01'), style: 'efficient' }, 'test');
  const solved = solveMission(sys, mission);
  const base = solved.mission.flight!;
  // A maneuver with no velocity change 40 days after the start: the flight is the same flight.
  const flight: Flight = { ...base, maneuvers: [...base.maneuvers.map(({ anchor: _a, ...m }) => m), { id: 'user1', et: base.et0 + 40 * DAY, dv: [0, 0, 0], frame: 'VNB', refBody: 'SUN' }] };
  const aimOf = (f: Flight): Aim => {
    const tr = flyFlight(sys, f, undefined, ['MARS']);
    expect(tr.failure).toBeNull();
    const ev = nearestApproach(tr.events, 'MARS', solved.report.encounters[0].et)!;
    return measureAim(sys, tr, ev, f.maneuvers.map((m) => m.et));
  };
  const before = aimOf(flight);
  const worst = { aimKm: 0, timeS: 0, iterations: 0 };

  it('the start flight has the aim of the plan', () => {
    const e = solved.report.encounters[0];
    expect(Math.abs(before.et - e.et)).toBeLessThan(1);
    expect(Math.abs(before.BdotT - e.BdotT)).toBeLessThan(1);
    expect(Math.abs(before.BdotR - e.BdotR)).toBeLessThan(1);
    expect(Math.abs(before.vinf - e.vinf)).toBeLessThan(1e-6);
  });

  it('free time: the aim point moves to the requested point', () => {
    const want = { BdotT: before.BdotT + 3000, BdotR: before.BdotR - 2000 };
    const out = targetManeuver(sys, { flight, maneuverId: 'user1', body: 'MARS', et: before.et, ...want, tca: null });
    expect(out.converged).toBe(true);
    expect(out.dvAfter).toBeGreaterThan(1e-6);
    expect(out.dvAfter).toBeLessThan(0.05);
    const after = aimOf({ ...flight, maneuvers: flight.maneuvers.map((m) => (m.id === 'user1' ? { ...m, dv: out.dv } : m)) });
    const miss = Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR);
    worst.aimKm = Math.max(worst.aimKm, miss);
    worst.iterations = Math.max(worst.iterations, out.iterations);
    expect(miss).toBeLessThan(0.5);
  });

  it('set time: the aim point and the time of the closest approach are the requested values', () => {
    const want = { BdotT: -before.BdotT, BdotR: before.BdotR + 1500, tca: before.et + 1800 };
    const out = targetManeuver(sys, { flight, maneuverId: 'user1', body: 'MARS', et: before.et, ...want });
    expect(out.converged).toBe(true);
    const after = aimOf({ ...flight, maneuvers: flight.maneuvers.map((m) => (m.id === 'user1' ? { ...m, dv: out.dv } : m)) });
    const miss = Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR);
    worst.aimKm = Math.max(worst.aimKm, miss);
    worst.timeS = Math.max(worst.timeS, Math.abs(after.et - want.tca));
    worst.iterations = Math.max(worst.iterations, out.iterations);
    expect(miss).toBeLessThan(0.5);
    // The time of the closest approach comes from the event search; the targeter uses the approach hyperbola.
    expect(Math.abs(after.et - want.tca)).toBeLessThan(2);
  });

  it('the components are in the frame of the maneuver', () => {
    // The same request for a maneuver in the RTN frame and in the ICRF gives the same velocity change.
    const want = { BdotT: before.BdotT + 500, BdotR: before.BdotR + 500, tca: null };
    const size: number[] = [];
    for (const frame of ['VNB', 'RTN', 'ICRF', 'ECLIPJ2000'] as const) {
      const f = { ...flight, maneuvers: flight.maneuvers.map((m) => (m.id === 'user1' ? { ...m, frame } : m)) };
      const out = targetManeuver(sys, { flight: f, maneuverId: 'user1', body: 'MARS', et: before.et, ...want });
      expect(out.converged).toBe(true);
      expect(Math.abs(norm(out.dv) - out.dvAfter)).toBeLessThan(1e-12);
      size.push(out.dvAfter);
      const after = aimOf({ ...f, maneuvers: f.maneuvers.map((m) => (m.id === 'user1' ? { ...m, dv: out.dv } : m)) });
      worst.aimKm = Math.max(worst.aimKm, Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR));
      expect(Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR)).toBeLessThan(0.5);
    }
    for (const s of size) expect(Math.abs(s / size[0] - 1)).toBeLessThan(1e-4);
  });

  it('gives an error code for a request that has no solution path', () => {
    expect(() => targetManeuver(sys, { flight, maneuverId: 'none', body: 'MARS', et: before.et, BdotT: 0, BdotR: 0, tca: null })).toThrow('target:maneuver');
    expect(() => targetManeuver(sys, { flight, maneuverId: 'user1', body: 'NEPTUNE', et: before.et, BdotT: 0, BdotR: 0, tca: null })).toThrow('target:encounter');
    const late = { ...flight, maneuvers: flight.maneuvers.map((m) => (m.id === 'user1' ? { ...m, et: before.et + 5 * DAY } : m)), etEnd: before.et + 20 * DAY };
    expect(() => targetManeuver(sys, { flight: late, maneuverId: 'user1', body: 'MARS', et: before.et, BdotT: 0, BdotR: 0, tca: null })).toThrow(/target:(order|encounter)/);
  });

  afterAll(() => {
    rec.add({
      id: 'target.closure', group: 'solver', value: worst.aimKm, unit: 'km', limit: 0.5,
      truth: 'The aim point is an input: the flight that the targeter gives is propagated again and its aim is measured.',
      detail: { cases: 6, worstTimeS: worst.timeS, worstIterations: worst.iterations },
    });
  });
});

describe('targeter: distant flyby after three flybys (Cassini at Jupiter)', () => {
  // The flyby of Jupiter is at 137 radii: the approach is measured far from the body, where the Sun changes the
  // osculating hyperbola. The targeter and the measurement of the new flight must use the same measurement time.
  it('the aim point moves by 100 000 km', () => {
    const solved = solveMission(sys, famousMission(sys, 'cassini'));
    const f = solved.mission.flight!;
    const jupiter = solved.report.encounters.find((e) => e.body === 'JUPITER')!;
    const tcm = f.maneuvers.filter((m) => m.et < jupiter.et).pop()!;
    const aimOf = (flight: Flight): Aim => {
      const tr = flyFlight(sys, flight, undefined, ['JUPITER']);
      return measureAim(sys, tr, nearestApproach(tr.events, 'JUPITER', jupiter.et)!, flight.maneuvers.map((m) => m.et));
    };
    const before = aimOf(f);
    const want = { BdotT: before.BdotT + 100000, BdotR: before.BdotR };
    const out = targetManeuver(sys, { flight: f, maneuverId: tcm.id, body: 'JUPITER', et: before.et, ...want, tca: null });
    expect(out.converged).toBe(true);
    // A change of 100 000 km in 480 days is a change of some m/s.
    expect(Math.abs(out.dvAfter - out.dvBefore)).toBeLessThan(0.02);
    const changed = f.maneuvers.map((m) => { const { anchor: _a, ...rest } = m; return m.id === tcm.id ? { ...rest, dv: out.dv } : m.et > tcm.et ? rest : m; });
    const after = aimOf({ ...f, maneuvers: changed });
    const miss = Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR);
    rec.add({
      id: 'target.closureDistant', group: 'solver', value: miss, unit: 'km', limit: 2,
      truth: 'The aim point is an input: the flight that the targeter gives is propagated again and its aim is measured.',
      detail: { iterations: out.iterations, flybyRadiusKm: before.radius, dvBeforeMS: out.dvBefore * 1000, dvAfterMS: out.dvAfter * 1000 },
    });
    expect(miss).toBeLessThan(2);
  }, 120000);
});

describe('targeter: encounter with an orbit insertion burn', () => {
  // The spacecraft does a burn at the periapsis: the state at the closest approach is on a closed orbit.
  const { mission } = quickMission(sys, { target: 'MARS', goal: 'orbit', after: tdb('2026-11-01'), style: 'efficient' }, 'test');
  const solved = solveMission(sys, mission);
  const base = solved.mission.flight!;
  const flight: Flight = { ...base, maneuvers: [...base.maneuvers.map(({ anchor: _a, ...m }) => m), { id: 'user1', et: base.et0 + 40 * DAY, dv: [0, 0, 0], frame: 'RTN', refBody: 'SUN' }] };
  const enc = solved.report.encounters[0];
  const aimOf = (f: Flight): Aim => {
    const tr = flyFlight(sys, f, undefined, ['MARS']);
    const ev = nearestApproach(tr.events, 'MARS', enc.etPlanned)!;
    return measureAim(sys, tr, ev, f.maneuvers.map((m) => m.et));
  };

  it('the approach hyperbola is measured before the burn', () => {
    expect(base.maneuvers.some((m) => m.label === 'ARRIVAL')).toBe(true);
    const a = aimOf(flight);
    expect(Number.isFinite(a.vinf)).toBe(true);
    expect(Math.abs(a.vinf - enc.vinf)).toBeLessThan(1e-5);
    expect(Math.abs(a.BdotT - enc.BdotT)).toBeLessThan(1);
    expect(Math.abs(a.BdotR - enc.BdotR)).toBeLessThan(1);
  });

  it('the aim point moves to the requested point', () => {
    const before = aimOf(flight);
    const want = { BdotT: before.BdotT + 400, BdotR: before.BdotR - 300 };
    const out = targetManeuver(sys, { flight, maneuverId: 'user1', body: 'MARS', et: before.et, ...want, tca: null });
    expect(out.converged).toBe(true);
    const after = aimOf({ ...flight, maneuvers: flight.maneuvers.map((m) => (m.id === 'user1' ? { ...m, dv: out.dv } : m)) });
    const miss = Math.hypot(after.BdotT - want.BdotT, after.BdotR - want.BdotR);
    rec.add({
      id: 'target.closureInsertion', group: 'solver', value: miss, unit: 'km', limit: 0.5,
      truth: 'The aim point is an input: the flight that the targeter gives is propagated again and its aim is measured.',
      detail: { iterations: out.iterations },
    });
    expect(miss).toBeLessThan(0.5);
  });
});
