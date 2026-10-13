/**
 * Real multi-flyby missions, made again from the real dates only.
 *
 * Input: the sequence of bodies and the real times (launch = start of the JPL Horizons trajectory, encounters = times
 * of closest approach in the JPL Horizons trajectory). The engine then solves the path:
 *   1. patched conics (Lambert arcs, flybys with zero sphere of influence);
 *   2. the same plan refined in the numerical force model, with ballistic (unpowered) flybys.
 * Truth: the JPL Horizons trajectory of the spacecraft, and the values that NASA published (truth/published).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { solarSystem, truth, Recorder } from './util';
import { jdTdbToEt, tdb, etToCalendar, calendarToSeconds, parseCalendar } from '../src/engine/time';
import { type Vec3, type State, norm, sub, add } from '../src/engine/vec';
import { BODIES } from '../src/engine/bodies';
import { bPlane } from '../src/engine/flyby';
import { ECLIPTIC_POLE } from '../src/engine/frames';
import { newPlan, evaluatePlan } from '../src/engine/plan';
import { optimizePlan } from '../src/engine/planopt';
import { refinePlan } from '../src/engine/flight';
import { Propagator, FULL_MODEL } from '../src/engine/propagate';

const rec = new Recorder('missions');
afterAll(() => rec.save());
const sys = solarSystem();
const published = JSON.parse(readFileSync('truth/published/published.json', 'utf8'));
const P: Record<string, string> = { '299': 'VENUS', '399': 'EARTH', '499': 'MARS', '599': 'JUPITER', '699': 'SATURN', '799': 'URANUS', '899': 'NEPTUNE' };
const S = (row: number[]): State => ({ r: row.slice(0, 3) as Vec3, v: row.slice(3, 6) as Vec3 });

interface Enc { planet: string; jdClosest: number; rangeKm: number; stateAtClosest: number[]; fine: { jd: number[]; state: number[][] } }
/** Periapsis radius of the truth trajectory: parabola through the 1-minute samples nearest to the minimum range. */
function truthPeriapsis(e: Enc): { radius: number; et: number } {
  const fr = e.fine.state.map((s) => norm(s.slice(0, 3) as Vec3));
  const m = fr.indexOf(Math.min(...fr));
  const a = fr[m - 1] ** 2, b = fr[m] ** 2, c = fr[m + 1] ** 2;
  const x = (0.5 * (a - c)) / (a - 2 * b + c);
  return { radius: Math.sqrt(b - 0.25 * (a - c) * x), et: jdTdbToEt(e.fine.jd[m]) + x * 60 };
}
/** Speed at infinity of the truth trajectory at its closest approach (two-body orbit about the planet system). */
function truthVinf(e: Enc): number {
  const body = BODIES[P[e.planet]];
  return bPlane(S(e.stateAtClosest), body.gmSystem, ECLIPTIC_POLE)!.vinf;
}
const pct = (a: number, b: number) => (100 * Math.abs(a - b)) / Math.abs(b);
/** UTC seconds of an et (for the comparison with a published UTC time). */
const utcSeconds = (et: number) => { const c = etToCalendar(et, 'UTC'); return calendarToSeconds(c); };

describe('Voyager 2: Earth - Jupiter - Saturn - Uranus - Neptune with the real dates', () => {
  const enc: Enc[] = truth('encounters').missions.voyager2.encounters;
  const names = enc.map((e) => P[e.planet]);
  // Start of the JPL Horizons trajectory (truth/horizons/raw/info_voyager2.txt), about one hour after lift-off.
  const etStart = tdb('1977-08-20 15:32:32');
  const plan = newPlan(['EARTH', ...names], [etStart, ...enc.map((e) => jdTdbToEt(e.jdClosest))]);
  const res = evaluatePlan(sys, plan);
  const tp = enc.map(truthPeriapsis);
  const tv = enc.map(truthVinf);

  it('closest-approach times of the JPL Horizons trajectory agree with the times that NASA published', () => {
    const pub = published.voyager2;
    for (const [k, key] of [[0, 'jupiter'], [2, 'uranus'], [3, 'neptune']] as const) {
      const c = parseCalendar(pub[key].utc)!;
      const diff = Math.abs(utcSeconds(tp[k].et) - calendarToSeconds(c));
      // The published time has a resolution of one minute.
      rec.add({ id: `missions.voyager2.time.${names[k]}`, group: 'flyby', value: diff, unit: 's', limit: 90, truth: `NASA Science, page of the Voyager 2 mission: closest approach ${pub[key].utc} UT`, detail: { horizonsClosestApproachJdTdb: enc[k].jdClosest } });
      expect(diff).toBeLessThan(90);
    }
  });

  it('patched conics: each flyby is possible with no engine burn', () => {
    expect(res.ok).toBe(true);
    for (let k = 0; k < 3; k++) {
      const f = res.nodes[k + 1].flyby!;
      const body = BODIES[names[k]];
      // An unpowered flyby has equal speeds at infinity before and after. The zero-sphere-of-influence model has
      // an error of 1 % to 3 % in the speed at infinity (see src/engine/plan.ts), so the two speeds of the plan
      // differ by that quantity. Limit: 3 % of the speed at infinity.
      const mis = (100 * Math.abs(f.vinfOut - f.vinfIn)) / f.vinfIn;
      rec.add({ id: `missions.voyager2.conic.mismatch.${names[k]}`, group: 'flyby', value: mis, unit: '%', limit: 3, truth: 'A flyby with no engine burn has equal speeds at infinity before and after the flyby (the energy relative to the planet is constant).', detail: { vinfInKmS: f.vinfIn, vinfOutKmS: f.vinfOut, periapsisBurnOfThePlanMS: f.dv * 1000, turnDeg: (f.turn * 180) / Math.PI } });
      expect(mis).toBeLessThan(3);
      expect(f.limited).toBe(false);
      expect(f.rp).toBeGreaterThan(body.radius);
      const eV = pct(0.5 * (f.vinfIn + f.vinfOut), tv[k]);
      rec.add({ id: `missions.voyager2.conic.vinf.${names[k]}`, group: 'flyby', value: eV, unit: '%', limit: 5, truth: 'Speed at infinity of the JPL Horizons trajectory of Voyager 2 at the flyby', detail: { vinfKmS: 0.5 * (f.vinfIn + f.vinfOut), truthVinfKmS: tv[k] } });
      expect(eV).toBeLessThan(5);
      const eR = pct(f.rp, tp[k].radius);
      rec.add({ id: `missions.voyager2.conic.periapsis.${names[k]}`, group: 'flyby', value: eR, unit: '%', limit: 5, truth: 'Periapsis radius of the JPL Horizons trajectory of Voyager 2', detail: { periapsisRadiusKm: f.rp, truthPeriapsisRadiusKm: tp[k].radius } });
      expect(eR).toBeLessThan(5);
    }
    const eN = pct(res.arrival.vinf, tv[3]);
    rec.add({ id: 'missions.voyager2.conic.vinf.NEPTUNE', group: 'flyby', value: eN, unit: '%', limit: 5, truth: 'Speed at infinity of the JPL Horizons trajectory of Voyager 2 at Neptune', detail: { vinfKmS: res.arrival.vinf, truthVinfKmS: tv[3] } });
    expect(eN).toBeLessThan(5);
  });

  it('numerical model: ballistic flybys at the real dates, flyby conditions agree with JPL Horizons and with NASA', () => {
    // The aim point at Neptune (last encounter) is an input: it comes from the truth trajectory.
    const bpN = bPlane(S(enc[3].stateAtClosest), BODIES.NEPTUNE.gmSystem, ECLIPTIC_POLE)!;
    const t0 = performance.now();
    const out = refinePlan(sys, plan, res, { finalAim: { BdotT: bpN.BdotT, BdotR: bpN.BdotR } });
    const seconds = (performance.now() - t0) / 1000;
    expect(out.report.converged).toBe(true);
    for (const st of out.report.stages) expect(st.converged).toBe(true);
    // No maneuver is nearer than 2 days to a flyby: each flyby is unpowered.
    for (const m of out.flight.maneuvers) for (const nd of plan.nodes.slice(1)) expect(Math.abs(m.et - nd.et)).toBeGreaterThan(2 * 86400 - 1);
    const pub = published.voyager2;
    const pubRange = [pub.jupiter.rangeKm, pub.saturn.rangeKm, pub.uranus.rangeKm];
    for (let k = 0; k < 4; k++) {
      const e = out.report.encounters[k];
      const eT = Math.abs(e.et - tp[k].et);
      const eV = pct(e.vinf, tv[k]);
      rec.add({ id: `missions.voyager2.nbody.vinf.${names[k]}`, group: 'flyby', value: eV, unit: '%', limit: 1, truth: 'Speed at infinity of the JPL Horizons trajectory of Voyager 2', detail: { vinfKmS: e.vinf, truthVinfKmS: tv[k], closestApproachTimeDifferenceS: eT } });
      expect(eV).toBeLessThan(1);
      expect(eT).toBeLessThan(120); // the encounter time is an input (1-minute samples)
      if (k < 3) {
        const eR = pct(e.radius, tp[k].radius);
        // Limit 2 %: the reproduction knows only the dates. The real path also depends on the real launch state
        // and on the real correction maneuvers.
        rec.add({ id: `missions.voyager2.nbody.periapsis.${names[k]}`, group: 'flyby', value: eR, unit: '%', limit: 2, truth: 'Periapsis radius of the JPL Horizons trajectory of Voyager 2', detail: { periapsisRadiusKm: e.radius, truthPeriapsisRadiusKm: tp[k].radius } });
        expect(eR).toBeLessThan(2);
        // NASA gives the distance from the cloud tops: add the equatorial radius of the planet.
        const pubRadius = pubRange[k] + BODIES[names[k]].radius;
        const eP = pct(e.radius, pubRadius);
        rec.add({ id: `missions.voyager2.nbody.published.${names[k]}`, group: 'flyby', value: eP, unit: '%', limit: 2, truth: `NASA Science, page of the Voyager 2 mission: closest approach at approximately ${pubRange[k]} km from the planet`, detail: { distanceFromCloudTopsKm: e.radius - BODIES[names[k]].radius, publishedKm: pubRange[k] } });
        expect(eP).toBeLessThan(2);
      }
    }
    const tcm = out.report.totalCorrection * 1000;
    // Sum of the three correction maneuvers that follow the flybys. Limit 200 m/s (1.5 % of the speed at infinity).
    rec.add({ id: 'missions.voyager2.nbody.corrections', group: 'flyby', value: tcm, unit: 'm/s', limit: 200, truth: 'A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys.', detail: { maneuvers: out.report.corrections.length, launchVinfChangeMS: out.report.launchChange * 1000, solveTimeS: seconds } });
    expect(tcm).toBeLessThan(200);
  });
});

describe('Cassini: Earth - Venus - Venus - Earth - Jupiter - Saturn with the real dates', () => {
  const enc: Enc[] = truth('encounters').missions.cassini.encounters;
  const names = enc.map((e) => P[e.planet]);
  const etStart = tdb('1997-10-15 09:27:11'); // start of the JPL Horizons trajectory
  const tp = enc.slice(0, 4).map(truthPeriapsis);
  const tv = enc.slice(0, 4).map(truthVinf);

  // Truth of the deep-space maneuver: velocity jump in the JPL Horizons trajectory (6 h samples).
  const d = truth('cassini_dsm');
  const prop = new Propagator(sys, FULL_MODEL);
  let dsmTruth = 0, dsmEt = 0;
  for (let k = 0; k + 1 < d.jd.length; k++) {
    const t0 = jdTdbToEt(d.jd[k]), t1 = jdTdbToEt(d.jd[k + 1]);
    const sun0 = sys.state('SUN', t0), sun1 = sys.state('SUN', t1);
    const s0 = S(d.state[k]);
    const end = prop.propagate({ et0: t0, state0: { r: add(sun0.r, s0.r), v: add(sun0.v, s0.v) }, etEnd: t1, model: FULL_MODEL, noEvents: true }).stateAt(t1);
    const dv = norm(sub(add(sun1.v, S(d.state[k + 1]).v), end.v));
    if (dv > dsmTruth) { dsmTruth = dv; dsmEt = 0.5 * (t0 + t1); }
  }

  const plan = newPlan(['EARTH', ...names], [etStart, ...enc.map((e) => jdTdbToEt(e.jdClosest))]);
  const tV1 = plan.nodes[1].et, tV2 = plan.nodes[2].et;
  plan.legs[1].dsm = { eta: (dsmEt - tV1) / (tV2 - tV1), rpRadii: 1.05, beta: 0 };
  plan.arrival = { type: 'flyby', periapsisAltitude: 20000, apoapsisRadius: null };
  const o = optimizePlan(sys, plan, { objective: 'afterLaunch', freeDsmTime: false });

  it('the JPL Horizons trajectory has one large maneuver, on 1998-12-03', () => {
    expect(dsmTruth * 1000).toBeGreaterThan(400);
    expect(Math.abs(dsmEt - tdb('1998-12-03 06:00'))).toBeLessThan(86400);
  });

  it('patched conics: four flybys with no engine burn and one deep-space maneuver', () => {
    expect(o.result.ok).toBe(true);
    for (let k = 0; k < 4; k++) {
      const f = o.result.nodes[k + 1].flyby!;
      const mis = (100 * Math.abs(f.vinfOut - f.vinfIn)) / f.vinfIn;
      rec.add({ id: `missions.cassini.conic.mismatch.${k}.${names[k]}`, group: 'flyby', value: mis, unit: '%', limit: 3, truth: 'A flyby with no engine burn has equal speeds at infinity before and after the flyby.', detail: { vinfInKmS: f.vinfIn, vinfOutKmS: f.vinfOut, periapsisBurnOfThePlanMS: f.dv * 1000, periapsisRadiusKm: f.rp, truthPeriapsisRadiusKm: tp[k].radius, truthVinfKmS: tv[k] } });
      expect(mis).toBeLessThan(3);
      expect(f.limited).toBe(false);
      expect(f.rp).toBeGreaterThan(BODIES[names[k]].radius);
      expect(pct(0.5 * (f.vinfIn + f.vinfOut), tv[k])).toBeLessThan(5);
    }
    const e = pct(o.result.dvDsm, dsmTruth);
    // The zero-sphere-of-influence model has an error of some percent in each flyby; the maneuver that closes the
    // Venus-to-Venus leg collects these errors. Limit 30 %. The numerical model below removes most of this error.
    rec.add({ id: 'missions.cassini.conic.dsm', group: 'flyby', value: e, unit: '%', limit: 30, truth: 'Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03', detail: { dsmMS: o.result.dvDsm * 1000, truthDsmMS: dsmTruth * 1000 } });
    expect(e).toBeLessThan(30);
  });

  it('numerical model: ballistic flybys at the real dates, flyby conditions agree with JPL Horizons and with NASA', () => {
    const t0 = performance.now();
    const out = refinePlan(sys, o.plan, o.result, { optimizeDsm: true });
    const seconds = (performance.now() - t0) / 1000;
    expect(out.report.converged).toBe(true);
    for (const m of out.flight.maneuvers) for (const nd of plan.nodes.slice(1)) expect(Math.abs(m.et - nd.et)).toBeGreaterThan(2 * 86400 - 1);
    const pub = published.cassini;
    const pubRadius = [pub.venus1.altitudeKm + BODIES.VENUS.radius, pub.venus2.altitudeKm + BODIES.VENUS.radius, pub.earth.altitudeKm + BODIES.EARTH.radius, pub.jupiter.rangeKm];
    // Published values have the word "about". Limit 2 %; 5 % for the Jupiter distance (one significant digit).
    const pubLimit = [2, 2, 2, 5];
    for (let k = 0; k < 4; k++) {
      const e = out.report.encounters[k];
      const eV = pct(e.vinf, tv[k]);
      rec.add({ id: `missions.cassini.nbody.vinf.${k}.${names[k]}`, group: 'flyby', value: eV, unit: '%', limit: 1, truth: 'Speed at infinity of the JPL Horizons trajectory of Cassini', detail: { vinfKmS: e.vinf, truthVinfKmS: tv[k] } });
      expect(eV).toBeLessThan(1);
      const eR = pct(e.radius, tp[k].radius);
      rec.add({ id: `missions.cassini.nbody.periapsis.${k}.${names[k]}`, group: 'flyby', value: eR, unit: '%', limit: 2, truth: 'Periapsis radius of the JPL Horizons trajectory of Cassini', detail: { periapsisRadiusKm: e.radius, truthPeriapsisRadiusKm: tp[k].radius } });
      expect(eR).toBeLessThan(2);
      const eP = pct(e.radius, pubRadius[k]);
      rec.add({ id: `missions.cassini.nbody.published.${k}.${names[k]}`, group: 'flyby', value: eP, unit: '%', limit: pubLimit[k], truth: 'NASA Science, page "Timeline" of the Cassini mission: distance of closest approach (approximate values)', detail: { radiusKm: e.radius, publishedRadiusKm: pubRadius[k] } });
      expect(eP).toBeLessThan(pubLimit[k]);
    }
    const eD = pct(out.report.totalDsm, dsmTruth);
    rec.add({ id: 'missions.cassini.nbody.dsm', group: 'flyby', value: eD, unit: '%', limit: 3, truth: 'Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03', detail: { dsmMS: out.report.totalDsm * 1000, truthDsmMS: dsmTruth * 1000 } });
    expect(eD).toBeLessThan(3);
    const tcm = out.report.totalCorrection * 1000;
    rec.add({ id: 'missions.cassini.nbody.corrections', group: 'flyby', value: tcm, unit: 'm/s', limit: 200, truth: 'A tour of flybys with no engine burn at the flybys has only small correction maneuvers between the flybys.', detail: { maneuvers: out.report.corrections.length, launchVinfChangeMS: out.report.launchChange * 1000, solveTimeS: seconds } });
    expect(tcm).toBeLessThan(200);
  });
});
