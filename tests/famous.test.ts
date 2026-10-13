/**
 * Real missions, made again by the path that the application uses: famousMission() + solveMission().
 *
 * Input of each mission (src/engine/data/famous.json): the sequence of bodies, the start time of the JPL Horizons
 * trajectory, the times of the closest approaches, the aim point at the last body and (Cassini, Juno) the time of
 * the deep-space maneuver. The engine solves the path from these facts. There is no stored trajectory.
 *
 * Truth: the JPL Horizons trajectory of each spacecraft (truth/horizons/encounters.json) and values from primary
 * documents (truth/published/published.json).
 *
 * Limits and their reasons:
 *  - Periapsis radius of a flyby that is not the last encounter: 3 %. The reproduction knows only the dates. The
 *    real flights used correction maneuvers that the reproduction does not know (the test "maneuvers of the real
 *    Cassini flight" measures 97 m/s between two flybys). A direction error of 0.01 rad of the speed at infinity
 *    changes the periapsis radius of a deep flyby by 1 % to 3 %.
 *  - Speed at infinity: 1 %, the same limit as tests/missions.test.ts.
 *  - Sum of the correction maneuvers: 200 m/s, the same limit as tests/missions.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { solarSystem, truth, Recorder } from './util';
import { FAMOUS, famousMission, famousFacts, solveMission, type SolvedMission } from '../src/engine/mission';
import { jdTdbToEt, etToCalendar, calendarToSeconds, parseCalendar } from '../src/engine/time';
import { type Vec3, type State, norm, sub, add } from '../src/engine/vec';
import { BODIES } from '../src/engine/bodies';
import { bPlane } from '../src/engine/flyby';
import { ECLIPTIC_POLE } from '../src/engine/frames';
import { Propagator, FULL_MODEL } from '../src/engine/propagate';

const rec = new Recorder('famous');
afterAll(() => rec.save());
const sys = solarSystem();
const published = JSON.parse(readFileSync('truth/published/published.json', 'utf8'));
const DAY = 86400;
const pct = (a: number, b: number) => (100 * Math.abs(a - b)) / Math.abs(b);
const utcSeconds = (et: number) => calendarToSeconds(etToCalendar(et, 'UTC'));

const solved = new Map<string, { out: SolvedMission; seconds: number }>();
function solve(id: string): { out: SolvedMission; seconds: number } {
  let s = solved.get(id);
  if (!s) {
    const t0 = performance.now();
    const out = solveMission(sys, famousMission(sys, id));
    s = { out, seconds: (performance.now() - t0) / 1000 };
    solved.set(id, s);
  }
  return s;
}

describe('real missions from their dates', () => {
  for (const info of FAMOUS) {
    const id = info.id;
    const facts = famousFacts(id);
    it(`${info.name}: the path is solved, the flybys are unpowered, the flyby conditions agree with JPL Horizons`, () => {
      const { out, seconds } = solve(id);
      const rep = out.report;
      const n = facts.encounters.length;
      expect(rep.failure).toBeNull();
      expect(rep.converged).toBe(true);
      for (const st of rep.stages) expect(st.converged, `stage ${st.stage}${st.node}`).toBe(true);

      // Unpowered flybys: no maneuver nearer than 2 days to a flyby (the arrival burn of an orbit insertion is at
      // the last encounter and is not a flyby).
      const flight = out.mission.flight!;
      for (const m of flight.maneuvers) {
        if (m.id === 'arrival') continue;
        for (let k = 0; k < n; k++) expect(Math.abs(m.et - jdTdbToEt(facts.encounters[k].jdTdb)), `${m.id} near encounter ${k}`).toBeGreaterThan(2 * DAY - 1);
      }

      for (let k = 0; k < n; k++) {
        const e = rep.encounters[k];
        const f = facts.encounters[k];
        const key = `${id}.${k}.${f.body}`;
        // Speed at infinity with the definition of the truth value: the two-body orbit of the state at the closest
        // approach or, where the truth is an approach hyperbola, of the state at the same time before the periapsis.
        let vinf = e.vinfClosest;
        let definition = 'two-body orbit of the state at the closest approach';
        if (f.approachLeadS !== undefined) {
          const t = jdTdbToEt(f.jdTdb) - f.approachLeadS;
          const body = sys.state(f.body, t);
          const s = out.trajectory.stateAt(t);
          vinf = bPlane({ r: sub(s.r, body.r), v: sub(s.v, body.v) }, BODIES[f.body].gmSystem, ECLIPTIC_POLE)!.vinf;
          definition = `two-body orbit of the state ${(f.approachLeadS / 3600).toFixed(1)} h before the periapsis (approach hyperbola)`;
        }
        const eV = pct(vinf, f.vinfKmS);
        rec.add({ id: `famous.vinf.${key}`, group: 'flyby', value: eV, unit: '%', limit: 1, truth: `${facts.source}: speed at infinity, ${definition}`, detail: { vinfKmS: vinf, truthVinfKmS: f.vinfKmS, approachVinfKmS: e.vinf } });
        expect(eV, `speed at infinity ${key}`).toBeLessThan(1);

        if (k < n - 1) {
          const eR = pct(e.radius, f.radiusKm);
          rec.add({ id: `famous.periapsis.${key}`, group: 'flyby', value: eR, unit: '%', limit: 3, truth: `${facts.source}: radius of the closest approach`, detail: { periapsisRadiusKm: e.radius, truthPeriapsisRadiusKm: f.radiusKm, timeDifferenceS: e.et - e.etPlanned } });
          expect(eR, `periapsis radius ${key}`).toBeLessThan(3);
          expect(e.radius).toBeGreaterThan(BODIES[f.body].radius);
        } else if (facts.arrival !== 'entry') {
          // The aim point at the last body is an input: this is a check of the solver, not of the physics.
          expect(Math.abs(e.radius - f.radiusKm)).toBeLessThan(1);
          expect(Math.abs(e.et - e.etPlanned)).toBeLessThan(1);
        }
      }
      const tcm = rep.totalCorrection * 1000;
      rec.add({ id: `famous.corrections.${id}`, group: 'flyby', value: tcm, unit: 'm/s', limit: 200, truth: 'A ballistic tour needs only small correction maneuvers between the flybys.', detail: { maneuvers: rep.corrections.filter((c) => c.kind === 'tcm').length, launchChangeMS: rep.launchChange * 1000, deepSpaceManeuverMS: rep.totalDsm * 1000, arrivalBurnMS: rep.arrivalBurn * 1000, solveSeconds: Number(seconds.toFixed(2)) } });
      expect(tcm).toBeLessThan(200);
    });
  }

  it('Cassini: the deep-space maneuver agrees with the velocity jump in the JPL Horizons trajectory', () => {
    const { out } = solve('cassini');
    const real = famousFacts('cassini').dsm![0].dvKmS;
    const e = pct(out.report.totalDsm, real);
    rec.add({ id: 'famous.dsm.cassini', group: 'flyby', value: e, unit: '%', limit: 3, truth: 'Velocity jump in the JPL Horizons trajectory of Cassini on 1998-12-03 (6 h samples)', detail: { dsmMS: out.report.totalDsm * 1000, truthDsmMS: real * 1000 } });
    expect(e).toBeLessThan(3);
  });

  it('Juno: one deep-space maneuver in the model, two burns in the real flight', () => {
    const { out } = solve('juno');
    const f = famousFacts('juno');
    const real = f.dsm!.reduce((a, d) => a + d.dvKmS, 0);
    const e = pct(out.report.totalDsm, real);
    // Limit 10 %: the model has one impulse at the mean time of the two real burns (15 days apart), and the launch
    // energy of the model is the minimum for the dates (the real launch energy is not an input).
    rec.add({ id: 'famous.dsm.juno', group: 'flyby', value: e, unit: '%', limit: 10, truth: 'Sum of the two velocity jumps in the JPL Horizons trajectory of Juno (2012-08-30 and 2012-09-14, 6 h samples)', detail: { dsmMS: out.report.totalDsm * 1000, truthDsmMS: real * 1000 } });
    expect(e).toBeLessThan(10);
  });

  it('Cassini and Juno: the orbit after the insertion burn has the apoapsis of the real orbit', () => {
    for (const id of ['cassini', 'juno']) {
      const { out } = solve(id);
      const f = famousFacts(id);
      const body = f.encounters[f.encounters.length - 1].body;
      const tArr = jdTdbToEt(f.encounters[f.encounters.length - 1].jdTdb);
      // Largest distance from the planet in the first orbit after the burn.
      const tr = out.trajectory;
      const next = tr.events.find((ev) => ev.type === 'periapsis' && ev.body === body && ev.et > tArr + DAY);
      expect(next, 'second periapsis').toBeDefined();
      let far = 0;
      for (let t = tArr; t < next!.et; t += 600) far = Math.max(far, norm(sub(tr.stateAt(t).r, sys.state(body, t).r)));
      const e = pct(far, f.orbitAfterArrival!.apoapsisRadiusKm);
      // The target is the osculating apoapsis of the JPL Horizons trajectory 2 days after the burn. The real orbit
      // then changes (gravity of the Sun, oblateness): limit 1 %.
      rec.add({ id: `famous.capture.${id}`, group: 'flyby', value: e, unit: '%', limit: 1, truth: `${f.source}: apoapsis radius of the osculating orbit 2 days after the insertion burn`, detail: { apoapsisRadiusKm: far, truthApoapsisRadiusKm: f.orbitAfterArrival!.apoapsisRadiusKm, periodDays: (next!.et - tArr) / DAY, impulsiveBurnMS: out.report.arrivalBurn * 1000 } });
      expect(e).toBeLessThan(1);
    }
  });

  it('Mars 2020: the path comes to the surface of Mars a short time before the published landing time', () => {
    const { out } = solve('mars2020');
    const hit = out.trajectory.events.find((ev) => ev.type === 'impact' && ev.body === 'MARS');
    expect(hit, 'impact event').toBeDefined();
    // The published time is the time when the signal came to the Earth: subtract the light time.
    const pub = published.mars2020;
    const tPub = calendarToSeconds(parseCalendar(pub.landingEarthReceivedUtc)!);
    const lightTime = norm(sub(sys.state('MARS', hit!.et).r, sys.state('EARTH', hit!.et).r)) / 299792.458;
    const early = tPub - lightTime - utcSeconds(hit!.et);
    // The model has no atmosphere: the path comes to the surface at entry speed. The real entry, descent and landing
    // took about 7 minutes, and the published time has a resolution of 1 minute. Limit: 0 to 8 minutes before the landing.
    rec.add({ id: 'famous.mars2020.arrival', group: 'flyby', value: early, unit: 's', limit: 480, truth: `JPL Mars 2020 launch press kit and NASA NSSDCA: landing signal on the Earth at ${pub.landingEarthReceivedUtc} UTC`, detail: { lightTimeS: lightTime, entrySpeedKmS: hit!.speed ?? 0 } });
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(480);
  });

  it('New Horizons: the JPL Horizons trajectory agrees with the published time and distances', () => {
    const pub = published.newhorizons;
    const f = famousFacts('newhorizons');
    const { out } = solve('newhorizons');
    const dT = Math.abs(utcSeconds(jdTdbToEt(f.encounters[1].jdTdb)) - calendarToSeconds(parseCalendar(pub.pluto.utc)!));
    rec.add({ id: 'famous.newhorizons.time.PLUTO', group: 'flyby', value: dT, unit: 's', limit: 60, truth: `NASA NSSDCA: closest approach to Pluto ${pub.pluto.utc} UTC`, detail: { horizonsClosestApproachJdTdb: f.encounters[1].jdTdb } });
    expect(dT).toBeLessThan(60);
    // "within 12500 km of Pluto": distance from the surface. Two significant digits: limit 2 %.
    const alt = out.report.encounters[1].altitude;
    const eA = pct(alt, pub.pluto.rangeKm);
    rec.add({ id: 'famous.newhorizons.published.PLUTO', group: 'flyby', value: eA, unit: '%', limit: 2, truth: `NASA NSSDCA: "within ${pub.pluto.rangeKm} km of Pluto"`, detail: { altitudeKm: alt } });
    expect(eA).toBeLessThan(2);
    // "within about 32 Jovian radii of Jupiter": two significant digits: limit 3 %.
    const radii = out.report.encounters[0].radius / BODIES.JUPITER.radius;
    const eJ = pct(radii, pub.jupiter.rangeJupiterRadii);
    rec.add({ id: 'famous.newhorizons.published.JUPITER', group: 'flyby', value: eJ, unit: '%', limit: 3, truth: `NASA NSSDCA: "within about ${pub.jupiter.rangeJupiterRadii} Jovian radii of Jupiter"`, detail: { rangeJupiterRadii: radii } });
    expect(eJ).toBeLessThan(3);
  });
});

describe('maneuvers of the real Cassini flight', () => {
  it('the JPL Horizons trajectory has correction maneuvers between the second Venus flyby and the Earth flyby', () => {
    // Velocity jump in each interval of 10 days: propagate the first sample to the time of the second sample.
    const h = truth('encounters').missions.cassini.heliocentric10d as { jd: number[]; state: number[][] };
    const S = (row: number[]): State => ({ r: row.slice(0, 3) as Vec3, v: row.slice(3, 6) as Vec3 });
    const f = famousFacts('cassini');
    const tV2 = jdTdbToEt(f.encounters[1].jdTdb), tE = jdTdbToEt(f.encounters[2].jdTdb);
    const prop = new Propagator(sys, FULL_MODEL);
    let sum = 0, count = 0;
    for (let k = 0; k + 1 < h.jd.length; k++) {
      const t0 = jdTdbToEt(h.jd[k]), t1 = jdTdbToEt(h.jd[k + 1]);
      if (t0 < tV2 + DAY || t1 > tE - DAY) continue; // intervals with no flyby
      const sun0 = sys.state('SUN', t0), sun1 = sys.state('SUN', t1);
      const s0 = S(h.state[k]), s1 = S(h.state[k + 1]);
      const end = prop.propagate({ et0: t0, state0: { r: add(sun0.r, s0.r), v: add(sun0.v, s0.v) }, etEnd: t1, model: FULL_MODEL, noEvents: true }).stateAt(t1);
      const dv = norm(sub(add(sun1.v, s1.v), end.v));
      // Below 1 m/s: no maneuver (the propagation error of this model in 10 days is much smaller: tests/propagation.test.ts).
      if (dv > 1e-3) { sum += dv; count += 1; }
    }
    const model = solve('cassini').out.report.totalCorrection;
    rec.add({ id: 'famous.cassini.realCorrections', group: 'flyby', value: sum * 1000, unit: 'm/s', limit: 200, truth: 'Velocity jumps in the JPL Horizons trajectory of Cassini between 1999-06-27 and 1999-08-16 (10-day samples, propagated with this engine)', detail: { intervalsWithManeuver: count, correctionsOfTheReproductionMS: model * 1000 } });
    // The real flight has maneuvers there (more than 50 m/s): the reproduction cannot know them.
    expect(sum * 1000).toBeGreaterThan(50);
    expect(sum * 1000).toBeLessThan(200);
  });
});
