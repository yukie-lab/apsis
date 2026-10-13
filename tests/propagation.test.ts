import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, truth, Recorder, CRAFT } from './util';
import { jdTdbToEt } from '../src/engine/time';
import { dist, add, sub, norm, type Vec3 } from '../src/engine/vec';
import { Propagator, FULL_MODEL, PLANET_GRAVITY_BODIES, type ForceModel } from '../src/engine/propagate';
import { stateFromElements, keplerPropagate } from '../src/engine/kepler';
import { GM_SUN, AU } from '../src/engine/bodies';

const rec = new Recorder('propagation');
afterAll(() => rec.save());
const sys = solarSystem();
const S = (row: number[]) => ({ r: row.slice(0, 3) as Vec3, v: row.slice(3, 6) as Vec3 });

describe('propagator against the analytic two-body solution', () => {
  it('Sun-only model follows a Kepler orbit about the moving Sun', () => {
    // A test particle with only the gravity of the Sun, in the frame of the Sun: compare with universal-variable propagation.
    // The Sun moves about the barycentre, so the comparison is done over a short arc with a fixed-Sun approximation limit.
    const model: ForceModel = { bodies: ['SUN'], moons: false, j2: false, relativity: false, srp: null };
    const rel = stateFromElements({ p: 1.2 * AU * (1 - 0.2 ** 2), e: 0.2, i: 0.1, raan: 1, argp: 2, nu: 0.5 }, GM_SUN);
    const et0 = 0, T = 30 * 86400;
    const sun0 = sys.state('SUN', et0);
    const traj = new Propagator(sys, model).propagate({ et0, state0: { r: add(sun0.r, rel.r), v: add(sun0.v, rel.v) }, etEnd: et0 + T, model, noEvents: true });
    const expd = keplerPropagate(rel, T, GM_SUN);
    const sun1 = sys.state('SUN', et0 + T);
    // The Sun accelerates (about 2e-10 km/s^2 from Jupiter), which the fixed-Sun analytic solution does not have:
    // the limit is 0.5 * a * T^2 * 3 = 2000 km. The value is recorded only as a sanity check.
    expect(dist(sub(traj.stateAt(et0 + T).r, sun1.r), expd.r)).toBeLessThan(2000);
  });
});

describe('N-body propagation of asteroids against JPL Horizons (gravity only: no thrust, negligible radiation force)', () => {
  const sc = truth('small_check').bodies;
  for (const id of ['EROS', 'CERES', 'VESTA', 'PSYCHE', 'ARROKOTH', 'DIDYMOS', 'RYUGU']) {
    it(id, () => {
      const b = sc[id];
      const et: number[] = b.jd.map(jdTdbToEt);
      // The body itself cannot be a gravity source of its own motion.
      const full: ForceModel = { ...FULL_MODEL, bodies: FULL_MODEL.bodies.filter((x) => x !== id) };
      const planetsOnly: ForceModel = { ...FULL_MODEL, bodies: PLANET_GRAVITY_BODIES };
      let e1 = 0, e6 = 0, e1NoGr = 0, e1NoAst = 0, e6NoAst = 0;
      for (const k0 of [10, 40, 70, 100, 130]) {
        const run = (model: ForceModel) => new Propagator(sys, model).propagate({ et0: et[k0], state0: S(b.state[k0]), etEnd: et[k0 + 6], model, stops: et.slice(k0 + 1, k0 + 6), noEvents: true });
        const err = (t: ReturnType<typeof run>, k: number) => dist(t.stateAt(et[k]).r, S(b.state[k]).r);
        const traj = run(full);
        e1 = Math.max(e1, err(traj, k0 + 1));
        e6 = Math.max(e6, err(traj, k0 + 6));
        e1NoGr = Math.max(e1NoGr, err(run({ ...full, relativity: false }), k0 + 1));
        const t3 = run(planetsOnly);
        e1NoAst = Math.max(e1NoAst, err(t3, k0 + 1));
        e6NoAst = Math.max(e6NoAst, err(t3, k0 + 6));
      }
      const days = (et[11] - et[10]) / 86400;
      // Limits: 1 km after 168 days and 100 km after 1010 days. JPL Horizons includes the gravity of 16 large
      // asteroids. This product has three of them (Ceres, Vesta, Psyche): the other 13 are the main part of the
      // difference. The detail values show the result with no asteroid mass and with no relativity term.
      rec.add({
        id: 'propagation.asteroid.' + id, group: 'propagation', value: e1, unit: 'km', limit: 1,
        truth: `JPL Horizons vectors of the asteroid, 5 arcs of ${days.toFixed(0)} days`,
        detail: { maxErrorKmAfter1010Days: e6, maxErrorKmNoAsteroidMass168Days: e1NoAst, maxErrorKmNoAsteroidMass1010Days: e6NoAst, maxErrorKmNoRelativity168Days: e1NoGr },
      });
      expect(e1).toBeLessThan(1);
      expect(e6).toBeLessThan(100);
    });
  }
});

describe('propagation from the state of a real spacecraft against its JPL Horizons trajectory', () => {
  // The Horizons tables are relative to the Sun. A Horizons table of a spacecraft relative to the solar system
  // barycentre is not used as the reference: it is offset from the table relative to the Sun of the same
  // spacecraft (the test at the end of this block measures the offset; docs/VALIDATION.md has the cause).
  const arcs = truth('arcs_sun').arcs;
  const ssbArcs = truth('arcs').arcs;
  const fromSun = (row: number[], et: number) => { const sun = sys.state('SUN', et), s = S(row); return { r: add(sun.r, s.r), v: add(sun.v, s.v) }; };
  // Regression limits (km). The spacecraft trajectories include forces that this product cannot know: thruster
  // firings, thermal recoil of the radioisotope generators, radiation pressure on the real shape. The measured
  // difference is published; it is not an error of the gravity model (see the asteroid tests above).
  const cases: [string, number, string][] = [
    ['newhorizons_2008_2009', 1500, 'New Horizons, cruise in hibernation, 364 days'],
    ['newhorizons_2012_2014', 16000, 'New Horizons, cruise, 730 days'],
    ['voyager2_1990_1992', 15000, 'Voyager 2, after Neptune, 730 days'],
    ['voyager1_1995_2000', 90000, 'Voyager 1, 1820 days'],
    ['pioneer10_1980_1985', 300000, 'Pioneer 10, 1820 days'],
    ['cassini_2001_2002', 18000, 'Cassini, cruise after Jupiter, 364 days'],
    ['juno_2014_2015', 17000, 'Juno, cruise after the Earth flyby, 364 days'],
    ['ulysses_1993_1994', 25000, 'Ulysses, 364 days'],
    ['mars2020_cruise', 12000, 'Mars 2020, cruise with correction maneuvers, 174 days'],
  ];
  for (const [name, limit, label] of cases) {
    it(label, () => {
      const a = arcs[name];
      const et: number[] = a.jd.map(jdTdbToEt);
      const traj = new Propagator(sys, FULL_MODEL).propagate({ et0: et[0], state0: fromSun(a.state[0], et[0]), etEnd: et[et.length - 1], model: FULL_MODEL, stops: et.slice(1, -1), noEvents: true });
      let max = 0, at30 = 0;
      for (let k = 1; k < et.length; k++) {
        const e = dist(traj.stateAt(et[k]).r, fromSun(a.state[k], et[k]).r);
        max = Math.max(max, e);
        if (et[k] - et[0] <= 30.5 * 86400) at30 = e;
      }
      const days = (et[et.length - 1] - et[0]) / 86400;
      // constant acceleration that explains the final difference
      const accel = (2 * max * 1000) / (days * 86400) ** 2;
      // Offset of the Horizons table of the same spacecraft relative to the barycentre (same times, same request).
      const b = ssbArcs[name];
      let offset = 0;
      for (let k = 0; k < et.length; k++) if (b.jd[k] === a.jd[k]) offset = Math.max(offset, dist(S(b.state[k]).r, fromSun(a.state[k], et[k]).r));
      rec.add({ id: 'propagation.spacecraft.' + name, group: 'propagation', value: max, unit: 'km', limit, truth: `JPL Horizons trajectory of the spacecraft relative to the Sun (${label})`, detail: { days, errorKmAfter30Days: at30, equivalentAccelerationMS2: accel, offsetOfTheHorizonsBarycentreTableKm: offset } });
      expect(max).toBeLessThan(limit);
    });
  }

  it('JPL Horizons tables of one spacecraft relative to the barycentre, to the Sun and to the Earth do not agree', () => {
    // Three Horizons tables of Cassini at the Earth flyby of 1999, at equal times: relative to the solar system
    // barycentre (arcs), relative to the Sun and relative to the Earth (encounters). With the positions of the Sun
    // and of the Earth from the ephemeris (which agree with Horizons to 0.004 km, see the ephemeris tests), the
    // table relative to the Sun and the table relative to the Earth give the same point to some kilometres. The
    // table relative to the barycentre is more than 100 km away. This is a property of the reference data, not a
    // result of Apsis: the value is recorded so that the user can see it.
    const enc = truth('encounters').missions;
    const out: Record<string, number> = {};
    for (const [mission, arc, k] of [['cassini', 'cassini_earth_flyby', 2], ['juno', 'juno_earth_flyby', 0]] as const) {
      const e = enc[mission].encounters[k];
      expect(e.planet).toBe('399');
      const ssb = ssbArcs[arc];
      let worst = 0, n = 0;
      for (let j = 0; j < e.hourly.jd.length; j++) {
        const i = ssb.jd.indexOf(e.hourly.jd[j]);
        if (i < 0) continue;
        const et = jdTdbToEt(e.hourly.jd[j]);
        const earth = sys.state('EARTH', et);
        worst = Math.max(worst, dist(S(ssb.state[i]).r, add(earth.r, S(e.hourly.state[j]).r)));
        n++;
      }
      expect(n).toBeGreaterThan(20);
      out[mission] = worst;
    }
    // The texts of the product (validation.limits.horizonsCenter, page.files.ssbNote) give these two values as
    // 118 km and 117 km. If new reference data change them, this test fails and the texts must change.
    expect(out.cassini).toBeGreaterThan(117.5);
    expect(out.cassini).toBeLessThan(118.5);
    expect(out.juno).toBeGreaterThan(116.5);
    expect(out.juno).toBeLessThan(117.5);
  });
});

describe('propagation through real flybys (start 2 days before, end 2 days after) against JPL Horizons', () => {
  const P: Record<string, string> = { '199': 'MERCURY', '299': 'VENUS', '399': 'EARTH', '499': 'MARS', '599': 'JUPITER', '699': 'SATURN', '799': 'URANUS', '899': 'NEPTUNE', '999': 'PLUTO' };
  const ms = truth('encounters').missions;
  // [mission, index of the encounter, limit for the periapsis radius difference (km), model with moons]
  const cases: [string, number, number, boolean][] = [
    ['voyager2', 0, 2000, true], ['voyager2', 1, 500, true], ['voyager2', 2, 100, true], ['voyager2', 3, 100, true],
    ['cassini', 0, 10, false], ['cassini', 1, 10, false], ['cassini', 2, 10, false], ['cassini', 3, 50, true],
    ['galileo', 0, 10, false], ['galileo', 1, 10, false], ['galileo', 2, 10, false],
    ['newhorizons', 0, 50, true], ['newhorizons', 1, 50, true], ['juno', 0, 10, false], ['ulysses', 0, 50, true],
    ['messenger', 0, 10, false], ['rosetta', 0, 10, false],
  ];
  for (const [mission, k, limit, moons] of cases) {
    const e = ms[mission].encounters[k];
    const pid = P[e.planet];
    it(`${mission} at ${pid} (${k})`, () => {
      const model = { ...FULL_MODEL, moons };
      const et: number[] = e.hourly.jd.map(jdTdbToEt);
      const p0 = sys.state(pid, et[0]);
      const h0 = S(e.hourly.state[0]);
      const traj = new Propagator(sys, model).propagate({ et0: et[0], state0: { r: add(p0.r, h0.r), v: add(p0.v, h0.v) }, etEnd: et[et.length - 1], model, stops: et.slice(1, -1) });
      // truth periapsis: parabola through the three 1-minute samples nearest to the minimum range
      const fr: number[] = e.fine.state.map((s: number[]) => norm(s.slice(0, 3) as Vec3));
      const m = fr.indexOf(Math.min(...fr));
      let rpTruth = fr[m];
      if (m > 0 && m < fr.length - 1) {
        const a = fr[m - 1] ** 2, b = fr[m] ** 2, c = fr[m + 1] ** 2;
        const den = a - 2 * b + c;
        const x = den !== 0 ? (0.5 * (a - c)) / den : 0;
        rpTruth = Math.sqrt(b - 0.25 * (a - c) * x);
      }
      const ca = traj.events.find((x) => x.type === 'periapsis' && x.body === pid)!;
      expect(ca).toBeDefined();
      const diff = Math.abs(ca.radius! - rpTruth);
      const errEnd = dist(sub(traj.stateAt(et[et.length - 1]).r, sys.state(pid, et[et.length - 1]).r), S(e.hourly.state[et.length - 1]).r);
      rec.add({ id: `propagation.flyby.${mission}.${k}.${pid}`, group: 'flyby', value: diff, unit: 'km', limit, truth: `JPL Horizons trajectory of ${CRAFT[mission]} relative to the center of the planet, 1-minute samples`, detail: { periapsisRadiusKm: ca.radius!, truthPeriapsisRadiusKm: rpTruth, positionErrorKmAfter4Days: errEnd, moonsInModel: moons ? 'yes' : 'no' } });
      expect(diff).toBeLessThan(limit);
    });
  }
});

