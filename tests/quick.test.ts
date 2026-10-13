/**
 * Quick missions (Explorer mode: the user selects a target, a goal and a style, and the engine does the rest).
 *
 * This is a test of the solvers, not of the physics: the target of each solution is an input. The physics of the
 * same functions is tested against JPL Horizons and published values in the other test files.
 *
 * For each target, each possible goal, the two styles and four earliest launch dates (2026 to 2038):
 *  - a launch window is found and the plan is converted to a flight in the full force model,
 *  - flyby and orbit: the closest approach is at the planned altitude (1 km, or 1e-4 of the altitude if larger),
 *  - rendezvous: the spacecraft stops at the planned distance (same limit),
 *  - entry: the trajectory ends at the surface of the target (an 'impact' event).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, Recorder } from './util';
import { quickTargets, quickMission, quickWindow, solveMission, QuickError, type QuickStyle } from '../src/engine/mission';
import { tdb, YEAR } from '../src/engine/time';
import { BODIES } from '../src/engine/bodies';

const rec = new Recorder('quick');
const sys = solarSystem();
const STARTS = ['2026-11-01', '2029-03-15', '2033-07-01', '2038-01-10'];
const STYLES: QuickStyle[] = ['efficient', 'fast'];
const total = { cases: 0, solved: 0, worstKm: 0, worstCase: '', seconds: 0, slowest: 0, slowestCase: '' };
afterAll(() => {
  rec.add({
    id: 'quick.solved', group: 'solver', value: total.cases - total.solved, unit: 'missions', limit: 0,
    truth: 'The target of each solution is an input: this is a test of the solvers.',
    detail: { cases: total.cases, solved: total.solved, worstAimErrorKm: total.worstKm, worstAimCase: total.worstCase, meanSeconds: total.seconds / Math.max(total.cases, 1), slowestSeconds: total.slowest, slowestCase: total.slowestCase },
  });
  rec.save();
});

describe('quick missions: all targets, goals and styles', () => {
  for (const t of quickTargets()) {
    it(`${t.id}: ${t.goals.join(', ')}`, () => {
      for (const goal of t.goals) for (const style of STYLES) for (const start of STARTS) {
        const tag = `${t.id} ${goal} ${style} ${start}`;
        total.cases++;
        const t0 = performance.now();
        const { mission, window } = quickMission(sys, { target: t.id, goal, after: tdb(start), style }, 'test');
        const out = solveMission(sys, mission);
        const seconds = (performance.now() - t0) / 1000;
        total.seconds += seconds;
        if (seconds > total.slowest) { total.slowest = seconds; total.slowestCase = tag; }

        // The window is in the search range and has a real cost.
        expect(window.dep, tag).toBeGreaterThanOrEqual(tdb(start));
        expect(window.dep - tdb(start), tag).toBeLessThanOrEqual(3 * YEAR + 1);
        expect(window.arr, tag).toBeGreaterThan(window.dep);
        expect(Number.isFinite(window.dvTotal) && window.dvTotal > 0, tag).toBe(true);

        expect(out.report.failure, tag).toBeNull();
        expect(out.report.converged, tag).toBe(true);
        const e = out.report.encounters[out.report.encounters.length - 1];
        if (goal === 'entry') {
          const hit = out.trajectory.events.find((ev) => ev.type === 'impact');
          expect(hit?.body, tag).toBe(t.id);
          // The entry is at the planned time (the plan time is the periapsis of a path below the surface).
          expect(Math.abs(hit!.et - e.etPlanned), tag).toBeLessThan(0.02 * (BODIES[t.id].radius / Math.max(e.vinf, 1)) + 3600);
        } else {
          const planned = mission.plan.arrival.periapsisAltitude;
          const miss = Math.abs(e.altitude - planned);
          if (miss > total.worstKm) { total.worstKm = miss; total.worstCase = tag; }
          expect(miss, tag).toBeLessThan(Math.max(1, 1e-4 * Math.abs(planned)));
          expect(Math.abs(e.et - e.etPlanned), tag).toBeLessThan(1);
        }
        if (goal === 'orbit' || goal === 'rendezvous') expect(out.report.arrivalBurn, tag).toBeGreaterThan(0);
        total.solved++;
      }
    }, 600000);
  }
});

describe('quick missions: errors have a code', () => {
  const code = (f: () => unknown): string => {
    try { f(); } catch (err) { return err instanceof QuickError ? err.code : 'other: ' + String(err); }
    return 'no error';
  };
  it('a body that is not a possible target', () => {
    expect(code(() => quickWindow(sys, { target: 'EARTH', goal: 'flyby', after: tdb('2030-01-01'), style: 'efficient' }))).toBe('target');
    expect(code(() => quickWindow(sys, { target: 'MOON', goal: 'flyby', after: tdb('2030-01-01'), style: 'efficient' }))).toBe('target');
    expect(code(() => quickWindow(sys, { target: 'NOT_A_BODY', goal: 'flyby', after: tdb('2030-01-01'), style: 'efficient' }))).toBe('target');
  });
  it('a goal that is not possible at the target', () => {
    expect(code(() => quickWindow(sys, { target: 'MERCURY', goal: 'entry', after: tdb('2030-01-01'), style: 'efficient' }))).toBe('target');
    expect(code(() => quickWindow(sys, { target: 'MARS', goal: 'rendezvous', after: tdb('2030-01-01'), style: 'efficient' }))).toBe('target');
  });
  it('dates out of the range of the ephemeris data', () => {
    expect(code(() => quickWindow(sys, { target: 'MARS', goal: 'flyby', after: tdb('2099-12-01'), style: 'efficient' }))).toBe('coverage');
    expect(code(() => quickWindow(sys, { target: 'MARS', goal: 'flyby', after: tdb('1940-01-01'), style: 'efficient' }))).toBe('coverage');
    // Small bodies have data from 1980 to 2060.
    expect(code(() => quickWindow(sys, { target: 'BENNU', goal: 'flyby', after: tdb('2059-06-01'), style: 'efficient' }))).toBe('coverage');
    expect(code(() => quickWindow(sys, { target: 'NEPTUNE', goal: 'flyby', after: tdb('2095-01-01'), style: 'efficient' }))).toBe('coverage');
  });
});
