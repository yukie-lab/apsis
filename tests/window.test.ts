/**
 * Launch windows: the launch energy and the launch dates that the engine computes, against real missions.
 * Truth: the JPL Horizons trajectory of each spacecraft (launch energy), the JPL press kit of Mars 2020 (dates) and
 * the launch press kits of four Mars missions (length of the flight path).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { solarSystem, truth, Recorder, CRAFT } from './util';
import { jdTdbToEt, tdb, utc, formatEt, DAY, parseCalendar, julianDayNumber } from '../src/engine/time';
import { norm, type Vec3 } from '../src/engine/vec';
import { BODIES } from '../src/engine/bodies';
import { newPlan, evaluatePlan, planStateAt } from '../src/engine/plan';
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
      rec.add({ id: 'window.c3.' + name, group: 'window', value: err, unit: '%', limit: 4, truth: `JPL Horizons trajectory of ${CRAFT[name]}: launch energy from the first state relative to the Earth`, detail: { c3: res.departure.c3, truthC3: c3Truth, arrivalBody: P[e0.planet], declinationOfLaunchAsymptoteDeg: (res.departure.dla * 180) / Math.PI } });
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
    rec.add({ id: 'window.mars2020.period', group: 'window', value: outside, unit: 'd', limit: 0.5, truth: `JPL document "Mars 2020 Perseverance Launch Press Kit": launch period from ${pub.launchPeriod[0]} to ${pub.launchPeriod[1]}, landing on ${pub.landing}`, detail: { optimumLaunchDayAfterFirstDay: best.jdn - first, minimumC3: best.c3, c3MinInPeriod: c3Min, c3MaxInPeriod: c3Max } });
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
    rec.add({ id: 'window.mars2020.porkchop', group: 'window', value: ratio, unit: 'ratio', limit: 1.15, truth: 'Actual launch date and arrival date of Mars 2020 (NSSDCA Master Catalog)', detail: { c3AtRealDates: real.departure.c3, minimumC3OfTheMap: pc.bestC3!.c3, minimumDeparture: formatEt(pc.bestC3!.dep, 'UTC', 'day'), minimumArrival: formatEt(pc.bestC3!.arr, 'UTC', 'day') } });
    expect(ratio).toBeLessThan(1.15);
    expect(ratio).toBeGreaterThanOrEqual(1);
  });
});

describe('length of the flight path from the Earth to Mars (launch press kits)', () => {
  // Each press kit gives the distance that the spacecraft travels from the Earth to Mars. The value of the engine is
  // the length of the heliocentric transfer arc between the centers of the two planets, for a launch on the first
  // day of the published launch period and an arrival at the published landing time.
  // Limit 2 %: each document gives the distance with the word "about" and with three digits. The real path starts
  // and ends in the gravity of a planet, and the spacecraft does corrections.
  // The limit was set before the first run of this test.
  const KITS: Record<string, string> = {
    mars2020: 'Mars 2020 Perseverance Launch Press Kit', insight: 'InSight Launch Press Kit',
    msl: 'Mars Science Laboratory Launch Press Kit', phoenix: 'Phoenix Launch Press Kit',
  };
  const c3At = (t0: number, t1: number): number => evaluatePlan(sys, newPlan(['EARTH', 'MARS'], [t0, t1])).departure.c3;
  /** Angle about the Sun from the Earth at the launch to Mars at the arrival, in the direction of the motion of the planets (deg). */
  const transferAngle = (t0: number, t1: number): number => {
    const a = sys.state('EARTH', t0).r, b = sys.state('MARS', t1).r, s0 = sys.state('SUN', t0).r, s1 = sys.state('SUN', t1).r;
    const r1 = [a[0] - s0[0], a[1] - s0[1], a[2] - s0[2]], r2 = [b[0] - s1[0], b[1] - s1[1], b[2] - s1[2]];
    const cross = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
    // North pole of the ecliptic in the ICRF (obliquity 23.4392911 deg): its component along the cross product gives the direction.
    const north = cross[1] * -0.3977771559 + cross[2] * 0.9174820621;
    const angle = (Math.atan2(Math.hypot(cross[0], cross[1], cross[2]), r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]) * 180) / Math.PI;
    return north >= 0 ? angle : 360 - angle;
  };
  for (const [id, title] of Object.entries(KITS)) {
    it(id, () => {
      const pub = published[id];
      const t0 = utc(pub.travel.launchUtc), t1 = utc(pub.travel.landingUtc);
      const res = evaluatePlan(sys, newPlan(['EARTH', 'MARS'], [t0, t1]));
      expect(res.ok).toBe(true);
      // Integral of the heliocentric speed along the arc (Simpson rule).
      const n = 2000, h = (t1 - t0) / n;
      let sum = 0;
      for (let k = 0; k <= n; k++) {
        const s = planStateAt(res, 'SUN', k === n ? t1 - 1e-6 : t0 + k * h)!;
        sum += norm(s.v) * (k === 0 || k === n ? 1 : k % 2 ? 4 : 2);
      }
      const length = (sum * h) / 3;
      const err = (100 * Math.abs(length - pub.travel.distanceKm)) / pub.travel.distanceKm;
      // Information for the report: the launch energy on the first day and on the last day of the published launch
      // period, and the launch day with the minimum launch energy for the published arrival time. The test has no
      // limit for these values: a project selects its launch period with more conditions than the launch energy.
      const dayStart = utc(pub.launchPeriod[0] + ' 12:00'), dayEnd = utc(pub.launchPeriod[1] + ' 12:00');
      const lastArrival = pub.landingForTheLast7Days ? utc(pub.landingForTheLast7Days + ' 12:00') : t1;
      let best = { c3: Infinity, t: 0 };
      for (let t = dayStart - 60 * DAY; t <= dayEnd + 60 * DAY; t += DAY) { const c3 = c3At(t, t1); if (c3 < best.c3) best = { c3, t }; }
      const detail = {
        pathLengthKm: length, publishedKm: pub.travel.distanceKm, launch: pub.travel.launchUtc + ' UTC', arrival: pub.travel.landingUtc + ' UTC',
        launchPeriod: pub.launchPeriod[0] + ' to ' + pub.launchPeriod[1], c3FirstDay: c3At(dayStart, t1), c3LastDay: c3At(dayEnd, lastArrival),
        dayOfMinimumC3: formatEt(best.t, 'UTC', 'day'), minimumC3: best.c3, minimumFromFirstDayDays: Math.round((best.t - dayStart) / DAY),
        transferAngleFirstDayDeg: transferAngle(dayStart, t1), transferAngleMinimumDeg: transferAngle(best.t, t1),
        arrivalForTheLastDay: pub.landingForTheLast7Days ?? pub.landing,
      };
      const day = pub.travel.launchDayStated ? 'for a launch on the first day of the launch period' : 'the document gives no launch day, and the test uses the first day of the launch period';
      rec.add({ id: `window.${id}.distance`, group: 'window', value: err, unit: '%', limit: 2, truth: `JPL document "${title}": distance of the flight from the Earth to Mars, approximately ${pub.travel.distanceKm / 1e6} million km (${day})`, detail });
      expect(err).toBeLessThan(2);
    });
  }
});
