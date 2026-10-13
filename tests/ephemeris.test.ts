import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, truth, Recorder } from './util';
import { jdTdbToEt } from '../src/engine/time';
import { dist, norm, sub } from '../src/engine/vec';
import type { Vec3 } from '../src/engine/vec';

const rec = new Recorder('ephemeris');
afterAll(() => rec.save());
const sys = solarSystem();

type Set = { bodies: Record<string, { jd: number[]; state: number[][]; center?: string }> };

function compare(id: string, t: { jd: number[]; state: number[][] }, center = 'SSB', etMin = -Infinity, etMax = Infinity) {
  let maxPos = 0, maxVel = 0, sum2 = 0, n = 0;
  for (let k = 0; k < t.jd.length; k++) {
    const et = jdTdbToEt(t.jd[k]);
    if (et < etMin || et > etMax) continue;
    const s = sys.stateRel(id, center, et);
    const r = t.state[k].slice(0, 3) as Vec3, v = t.state[k].slice(3, 6) as Vec3;
    const dp = dist(s.r, r);
    maxPos = Math.max(maxPos, dp);
    maxVel = Math.max(maxVel, norm(sub(s.v, v)));
    sum2 += dp * dp; n++;
  }
  return { maxPos, maxVel, rms: Math.sqrt(sum2 / n), n };
}

describe('planet ephemeris against JPL Horizons (DE441), 1950 to 2099', () => {
  const t = truth<Set>('planets').bodies;
  // limit in km for the position; the measured value is published in the product
  const cases: [string, string, number][] = [
    ['SUN', 'SUN', 0.05], ['MERCURY', 'MERCURY', 0.05], ['VENUS', 'VENUS', 0.05], ['EARTH', 'EARTH', 0.05], ['MOON', 'MOON', 0.05],
    ['EMB', 'EMB', 0.05], ['MARS', 'MARS', 0.05], ['MARS_BARYCENTER', 'MARS_BARYCENTER', 0.05],
    ['JUPITER_BARYCENTER', 'JUPITER_BARYCENTER', 0.05], ['SATURN_BARYCENTER', 'SATURN_BARYCENTER', 0.05],
    ['URANUS_BARYCENTER', 'URANUS_BARYCENTER', 0.05], ['NEPTUNE_BARYCENTER', 'NEPTUNE_BARYCENTER', 0.05],
    ['PLUTO_BARYCENTER', 'PLUTO_BARYCENTER', 0.05],
    // Planet centres use the analytic moon model: larger limits.
    // Uranus and Neptune: the Horizons planet centres (satellite solutions ura184, nep098) are not consistent with the
    // DE441 barycentres. Their difference (up to 4800 km and 2200 km) is larger than the offset that the moons can
    // cause (less than 100 km). The limit here only detects a regression; the measured value is published as it is.
    ['JUPITER', 'JUPITER', 10], ['SATURN', 'SATURN', 20], ['URANUS', 'URANUS', 6000], ['NEPTUNE', 'NEPTUNE', 3000], ['PLUTO', 'PLUTO', 150],
  ];
  for (const [id, key, limit] of cases) {
    it(`${id} position error < ${limit} km`, () => {
      const m = compare(id, t[key]);
      rec.add({ id: 'ephemeris.' + id, group: 'ephemeris', value: m.maxPos, unit: 'km', limit, truth: `JPL Horizons vectors (ICRF, SSB centre), ${m.n} epochs 1950 to 2099`, detail: { rmsKm: m.rms, maxVelocityErrorKmS: m.maxVel, epochs: m.n } });
      expect(m.n).toBeGreaterThan(300);
      expect(m.maxPos).toBeLessThan(limit);
    });
  }
});

describe('moon model against JPL Horizons (independent epochs)', () => {
  const t = truth<Set>('moons_check').bodies;
  const inFit: [number, number] = [0, 50 * 365.25 * 86400];
  for (const id of Object.keys(t)) {
    it(`${id}`, () => {
      const parent = { '499': 'MARS', '599': 'JUPITER', '699': 'SATURN', '799': 'URANUS', '899': 'NEPTUNE', '999': 'PLUTO' }[t[id].center!]!;
      const a = compare(id, t[id], parent, inFit[0], inFit[1]);
      const b = compare(id, t[id], parent);
      const orbit = norm(t[id].state[0].slice(0, 3) as Vec3);
      // Limit: 4 % of the orbit radius in the fit interval 2000 to 2050, 10 % for 1975 to 2075.
      // Mimas: 20 % and 70 %. Its mean longitude has a resonant libration (Mimas-Tethys) that one sine term fits poorly.
      const [fa, fb] = id === 'MIMAS' ? [0.2, 0.7] : [0.04, 0.1];
      rec.add({ id: 'moon.' + id, group: 'ephemeris', value: a.maxPos, unit: 'km', limit: fa * orbit, truth: `JPL Horizons vectors relative to the planet centre, ${a.n} epochs 2000 to 2050`, detail: { rmsKm: a.rms, maxKm1975to2075: b.maxPos, orbitRadiusKm: orbit, epochs: a.n } });
      expect(a.maxPos).toBeLessThan(fa * orbit);
      expect(b.maxPos).toBeLessThan(fb * orbit);
    });
  }
});

describe('small-body ephemeris against JPL Horizons (independent epochs 1980 to 2059)', () => {
  const t = truth<Set>('small_check').bodies;
  for (const id of Object.keys(t)) {
    it(`${id}`, () => {
      const m = compare(id, t[id]);
      const limit = 50;
      rec.add({ id: 'small.' + id, group: 'ephemeris', value: m.maxPos, unit: 'km', limit, truth: `JPL Horizons vectors (ICRF, SSB centre), ${m.n} epochs 1980 to 2059`, detail: { rmsKm: m.rms, epochs: m.n } });
      expect(m.maxPos).toBeLessThan(limit);
    });
  }
});
