/**
 * Maneuver search in a table of states.
 *
 * Truth: the JPL Horizons trajectory of Cassini. The large deep-space maneuver of 1998-12-03 is visible in the
 * 6-hour samples as a velocity jump (truth/horizons/cassini_dsm.json: the jump between two samples minus the
 * change that gravity makes, computed by tools/truth/build_famous.py and stored in src/engine/data/famous.json).
 * The search here uses other data (10-day samples) and another method (forward and backward propagation in the
 * full force model). The two values must agree.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, truth, Recorder } from './util';
import { findManeuvers, type TableSamples } from '../src/engine/forensics';
import { famousFacts } from '../src/engine/mission';
import { jdTdbToEt, DAY } from '../src/engine/time';
import { add, type Vec3 } from '../src/engine/vec';
import { Propagator, FULL_MODEL } from '../src/engine/propagate';

const rec = new Recorder('forensics');
afterAll(() => rec.save());
const sys = solarSystem();

function table(id: string): TableSamples {
  const h = truth('encounters').missions[id].heliocentric10d as { jd: number[]; state: number[][] };
  const et = h.jd.map(jdTdbToEt);
  const states = h.state.map((s, k) => {
    const sun = sys.state('SUN', et[k]);
    return { r: add(sun.r, s.slice(0, 3) as Vec3), v: add(sun.v, s.slice(3, 6) as Vec3) };
  });
  return { et, states };
}

describe('maneuver search in a trajectory table', () => {
  it('Cassini: the deep-space maneuver of 1998-12-03 is found with the correct size and date', () => {
    const facts = famousFacts('cassini');
    const dsm = facts.dsm![0];
    const res = findManeuvers(sys, table('cassini'), { threshold: 0.003 });
    const tDsm = jdTdbToEt(dsm.jdTdb);
    const found = res.candidates.filter((c) => !c.flyby && c.et0 <= tDsm && c.et1 >= tDsm);
    expect(found.length).toBe(1);
    const c = found[0];
    const eDv = (100 * Math.abs(c.dvMag - dsm.dvKmS)) / dsm.dvKmS;
    const eT = Math.abs(c.et - tDsm) / DAY;
    rec.add({ id: 'forensics.cassini.dsm.size', group: 'propagation', value: eDv, unit: '%', limit: 1, truth: 'Velocity jump in the JPL Horizons trajectory of Cassini (6 h samples) on 1998-12-03', detail: { foundMS: c.dvMag * 1000, truthMS: dsm.dvKmS * 1000, gapKm: c.gapKm, noiseFloorMS: res.noiseFloor * 1000 } });
    rec.add({ id: 'forensics.cassini.dsm.time', group: 'propagation', value: eT, unit: 'd', limit: 0.25, truth: 'Time of the velocity jump in the JPL Horizons trajectory of Cassini (6 h samples)', detail: { intervalDays: (c.et1 - c.et0) / DAY } });
    // Limit 1 %: the real burn had a duration of more than one hour; the search models it as one impulse.
    expect(eDv).toBeLessThan(1);
    // Limit 0.25 d: the truth time is the middle of a 6 h sample interval.
    expect(eT).toBeLessThan(0.25);
    // The largest candidate that is not in a flyby interval is this maneuver.
    const largest = res.candidates.filter((x) => !x.flyby).sort((a, b) => b.dvMag - a.dvMag)[0];
    expect(largest.interval).toBe(c.interval);
  });

  it('a trajectory of the engine with one known impulse: the impulse is found (method check, exact truth)', () => {
    // Truth: the impulse is an input. Coast from a state of the Cassini table, 25 m/s impulse after 23.4 days.
    const tab = table('cassini');
    const k0 = 60;
    const et0 = tab.et[k0];
    const tMan = et0 + 23.4 * DAY;
    const dv: Vec3 = [0.012, -0.019, 0.011];
    const prop = new Propagator(sys, FULL_MODEL);
    const et = Array.from({ length: 7 }, (_, j) => et0 + j * 10 * DAY);
    // The integration steps end at the sample times: the samples are then integration results, not interpolations.
    const tr = prop.propagate({ et0, state0: tab.states[k0], etEnd: et0 + 60 * DAY, model: FULL_MODEL, noEvents: true, stops: et, maneuvers: [{ id: 'm', et: tMan, dv, frame: 'ICRF', refBody: 'SUN' }] });
    const res = findManeuvers(sys, { et, states: et.map((t) => tr.stateAt(t)) }, { threshold: 0.001 });
    expect(res.candidates.length).toBe(1);
    const c = res.candidates[0];
    const eDv = Math.hypot(c.dv[0] - dv[0], c.dv[1] - dv[1], c.dv[2] - dv[2]) * 1e6;
    const eT = Math.abs(c.et - tMan);
    rec.add({ id: 'forensics.synthetic.size', group: 'propagation', value: eDv, unit: 'mm/s', limit: 1, truth: 'Exact: the impulse is an input of the test trajectory (25 m/s)', detail: { timeErrorS: eT, gapKm: c.gapKm } });
    expect(eDv).toBeLessThan(1);
    expect(eT).toBeLessThan(120);
    expect(c.gapKm).toBeLessThan(0.01);
  });
});
