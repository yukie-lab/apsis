/**
 * Launch windows: the launch energy and the launch dates that the engine computes, against real missions.
 * Truth: the JPL Horizons trajectory of each spacecraft (launch energy) and the JPL press kit of Mars 2020 (dates).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { solarSystem, truth, Recorder } from './util';
import { jdTdbToEt, tdb, utc, formatEt, DAY, parseCalendar, julianDayNumber } from '../src/engine/time';
import { norm, type Vec3 } from '../src/engine/vec';
import { BODIES } from '../src/engine/bodies';
import { newPlan, evaluatePlan } from '../src/engine/plan';
import { computePorkchop } from '../src/engine/planopt';

const rec = new Recorder('window');
afterAll(() => rec.save());
const sys = solarSystem();
const published = JSON.parse(readFileSync('truth/published/published.json', 'utf8'));
const P: Record<string, string> = { '299': 'VENUS', '499': 'MARS', '599': 'JUPITER' };
// Start of each JPL Horizons trajectory, TDB (truth/horizons/raw/info_<mission>.txt): some minutes after injection.
const START: Record<string, string> = {
  voyager2: '1977-08-20 15:32:32', voyager1: '1977-09-05 13:59:24', cassini: '1997-10-15 09:27:11', newhorizons: '2006-01-19 19:51:18',
  galileo: '1989-10-19 01:29:33', ulysses: '1990-10-06 19:05:00', pioneer10: '1972-03-03 02:04:42', pioneer11: '1973-04-06 02:25:44',
  mars2020: '2020-07-30 12:52:43',
};

describe('launch energy of real missions: Lambert arc with the real dates against the JPL Horizons trajectory', () => {
  const ms = truth('encounters').missions;
  for (const [name, start] of Object.entries(START)) {
    it(name, () => {
      const m = ms[name];
      const e0 = m.encounters[0];
      const res = evaluatePlan(sys, newPlan(['EARTH', P[e0.planet]], [tdb(start), jdTdbToEt(e0.jdClosest)]));
      // Truth: osculating two-body energy of the real trajectory relative to the Earth, at the first sample
      // (4 to 23 hours after the start, 200,000 km to 750,000 km from the Earth).
      const s = m.startGeocentric.state[0] as number[];
      const c3Truth = norm(s.slice(3, 6) as Vec3) ** 2 - (2 * BODIES.EARTH.gm) / norm(s.slice(0, 3) as Vec3);
      const err = (100 * Math.abs(res.departure.c3 - c3Truth)) / c3Truth;
      // Limit 4 %: the patched-conic model has an error of 1 % to 3 % in the speed at infinity; C3 is its square.
      rec.add({ id: 'window.c3.' + name, group: 'window', value: err, unit: '%', limit: 4, truth: `JPL Horizons trajectory of ${name}: geocentric energy after launch`, detail: { c3: res.departure.c3, truthC3: c3Truth, arrivalBody: P[e0.planet], declinationOfLaunchAsymptoteDeg: (res.departure.dla * 180) / Math.PI } });
      expect(err).toBeLessThan(4);
    });
  }
});

describe('Mars 2020 launch period (JPL press kit)', () => {
  const pub = published.mars2020;
  const day = (text: string) => { const c = parseCalendar(text)!; return julianDayNumber(c.year, c.month, c.day); };
  const first = day(pub.launchPeriod[0]), last = day(pub.launchPeriod[1]);
  // The press kit gives the landing date. The time of day comes from the NSSDCA page (Earth received time 20:55 UT,
  // signal delay about 11 minutes).
  const arrival = utc('2021-02-18 20:44');

  it('the cruise from the first launch day to the landing day is 213 days, as published', () => {
    expect(day(pub.landing) - first).toBe(pub.cruiseDaysFromFirstDay);
  });

  it('the launch day with the minimum launch energy for the published arrival date is in the published launch period', () => {
    let best = { c3: Infinity, jdn: 0 };
    let c3Min = Infinity, c3Max = 0;
    for (let d = -60; d <= 60; d++) {
      const t = utc('2020-07-30 12:00') + d * DAY;
      const c3 = evaluatePlan(sys, newPlan(['EARTH', 'MARS'], [t, arrival])).departure.c3;
      const c = parseCalendar(formatEt(t, 'UTC', 'day'))!;
      const jdn = julianDayNumber(c.year, c.month, c.day);
      if (c3 < best.c3) best = { c3, jdn };
      if (jdn >= first && jdn <= last) { c3Min = Math.min(c3Min, c3); c3Max = Math.max(c3Max, c3); }
    }
    // Value: distance (days) of the optimum from the published period. 0 = the optimum is in the period.
    const outside = Math.max(0, first - best.jdn, best.jdn - last);
    rec.add({ id: 'window.mars2020.period', group: 'window', value: outside, unit: 'd', limit: 0.5, truth: `JPL Mars 2020 launch press kit: launch period ${pub.launchPeriod[0]} to ${pub.launchPeriod[1]}, landing ${pub.landing}`, detail: { optimumLaunchDayAfterFirstDay: best.jdn - first, minimumC3: best.c3, c3MinInPeriod: c3Min, c3MaxInPeriod: c3Max } });
    expect(outside).toBe(0);
    // The launch energy changes slowly in the published period and increases quickly out of it.
    expect(c3Max).toBeLessThan(1.5 * best.c3);
  });

  it('the launch-window map (porkchop) has the same values as a direct solution, and its minimum is near the real dates', () => {
    const q = { central: 'SUN', from: 'EARTH', to: 'MARS', dep: [utc('2020-05-01'), utc('2020-10-01')] as [number, number], arr: [utc('2020-11-01'), utc('2021-11-01')] as [number, number], nx: 154, ny: 366, parkingAltitude: 200, arrival: { type: 'flyby' as const, periapsisAltitude: 0, apoapsisRadius: null } };
    const pc = computePorkchop(sys, q);
    const ix = 77, iy = 100;
    const tDep = q.dep[0] + ((q.dep[1] - q.dep[0]) * ix) / (q.nx - 1), tArr = q.arr[0] + ((q.arr[1] - q.arr[0]) * iy) / (q.ny - 1);
    const direct = evaluatePlan(sys, newPlan(['EARTH', 'MARS'], [tDep, tArr]));
    expect(Math.abs(pc.c3[iy * q.nx + ix] - direct.departure.c3)).toBeLessThan(1e-4);
    expect(Math.abs(pc.vinfArr[iy * q.nx + ix] - direct.arrival.vinf)).toBeLessThan(1e-5);
    // The real launch (2020-07-30) and arrival (2021-02-18) are near the minimum of the map: C3 within 15 %.
    const real = evaluatePlan(sys, newPlan(['EARTH', 'MARS'], [tdb(START.mars2020), arrival]));
    expect(pc.bestC3).not.toBeNull();
    const ratio = real.departure.c3 / pc.bestC3!.c3;
    rec.add({ id: 'window.mars2020.porkchop', group: 'window', value: ratio, unit: 'ratio', limit: 1.15, truth: 'Real launch and arrival dates of Mars 2020 (NSSDCA Master Catalog)', detail: { c3AtRealDates: real.departure.c3, minimumC3OfTheMap: pc.bestC3!.c3, minimumDeparture: formatEt(pc.bestC3!.dep, 'UTC', 'day'), minimumArrival: formatEt(pc.bestC3!.arr, 'UTC', 'day') } });
    expect(ratio).toBeLessThan(1.15);
    expect(ratio).toBeGreaterThanOrEqual(1);
  });
});
