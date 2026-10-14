/**
 * Data for the figures and the videos of the user manual. All values come from the engine of the application
 * (src/engine) and from its data files: the manual draws no orbit and no value that the engine did not calculate.
 *
 * Use: npm run manual:data (vitest runs this file). Output: tools/manual/.out/data/*.json.
 * Units of the output: au and days for positions and times, km/s for speeds, degrees for angles. Positions are in
 * the frame ECLIPJ2000 (x and y in the plane of the ecliptic), relative to the center of the Sun unless the name
 * of the value gives a different center.
 */
import { it, expect } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { solarSystem } from '../../../tests/util';
import { BODIES, GM_SUN, AU, PLANET_IDS } from '../../../src/engine/bodies';
import { utc, parseToEt, etToCalendar, formatCalendar, DAY, YEAR } from '../../../src/engine/time';
import { fromIcrf } from '../../../src/engine/frames';
import { keplerPropagate, elementsFromState, stateFromElements, period, visViva } from '../../../src/engine/kepler';
import { lambert } from '../../../src/engine/lambert';
import { computePorkchop, synodicPeriod, hohmannTof } from '../../../src/engine/planopt';
import { refNormal } from '../../../src/engine/plan';
import { turnAngle } from '../../../src/engine/flyby';
import { famousMission, solveMission, quickMission, FAMOUS, famousFacts } from '../../../src/engine/mission';
import { type Vec3, type State, norm, sub, scale, dot, cross, DEG } from '../../../src/engine/vec';

const OUT = 'tools/manual/.out/data';
mkdirSync(OUT, { recursive: true });
const sys = solarSystem();

// ---- Helpers -------------------------------------------------------------------------------------------------

/** Number with a fixed count of decimals, for small files. */
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const r3 = (x: number) => Math.round(x * 1e3) / 1e3;
/** Position (km, ICRF) -> [x, y, z] in au, ECLIPJ2000. */
const au = (p: Vec3): number[] => fromIcrf(p, 'ECLIPJ2000').map((c) => r6(c / AU));
/** Calendar text (UTC) of a time. */
const utcText = (et: number, precision: 'day' | 'minute' = 'minute') => formatCalendar(etToCalendar(et, 'UTC'), precision);
const helio = (id: string, et: number): State => sys.stateRel(id, 'SUN', et);
const write = (name: string, data: unknown) => writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data) + '\n');

/** Points of a two-body orbit about the Sun: `count` samples over `duration` seconds from the state s (ICRF). */
function arc(s: State, duration: number, count: number, mu = GM_SUN): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k <= count; k++) pts.push(au(keplerPropagate(s, (duration * k) / count, mu).r));
  return pts;
}
/**
 * The examples of the second video are orbits in a plane of their own: their coordinates are the coordinates of
 * the drawing (no change of frame), in au.
 */
const plain = (p: Vec3): number[] => p.map((c) => r6(c / AU));
function plainArc(s: State, duration: number, count: number): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k <= count; k++) pts.push(plain(keplerPropagate(s, (duration * k) / count, GM_SUN).r));
  return pts;
}

/** The epoch of the solar system in the first video and on the start screen of the manual. */
const EPOCH_TEXT = '2026-10-14 00:00:00';
const EPOCH = utc(EPOCH_TEXT);

// ---- Planets ---------------------------------------------------------------------------------------------------

it('planets: positions and orbits', () => {
  const planets = PLANET_IDS.map((id) => {
    const s = helio(id, EPOCH);
    // Elements relative to the plane of the ecliptic (the frame of the drawings).
    const el = elementsFromState({ r: fromIcrf(s.r, 'ECLIPJ2000'), v: fromIcrf(s.v, 'ECLIPJ2000') }, GM_SUN + BODIES[id].gm);
    const P = period(el.a, GM_SUN + BODIES[id].gm);
    // The orbit line is the two-body orbit of the state at the epoch (osculating orbit), as in the 3D view.
    const orbit = arc(s, P, 360, GM_SUN + BODIES[id].gm);
    return {
      id, color: BODIES[id].color, radiusKm: BODIES[id].radius,
      position: au(s.r), speedKmS: r3(norm(s.v)),
      a: r6(el.a / AU), e: r6(el.e), iDeg: r3(el.i / DEG), periodDays: r3(P / DAY), orbit,
    };
  });
  // Daily positions from one year before the epoch to three years after it, for the motion in the videos.
  const days = 4 * 366;
  const t0 = EPOCH - 366 * DAY;
  const daily: Record<string, number[][]> = {};
  for (const id of PLANET_IDS) {
    daily[id] = [];
    for (let k = 0; k <= days; k++) daily[id].push(au(helio(id, t0 + k * DAY).r));
  }
  // Range of the planet data of the engine (the Explorer and the Expert mode accept times in this range).
  const coverage = { startUtc: utcText(sys.etStart, 'day'), endUtc: utcText(sys.etEnd, 'day') };
  write('planets', { epochUtc: EPOCH_TEXT, coverage, dailyStartUtc: utcText(t0, 'day'), dailyStepDays: 1, planets, daily });
  expect(planets).toHaveLength(8);
});

// ---- Orbits (second video) --------------------------------------------------------------------------------------

it('orbits: shapes, equal areas, elements', () => {
  // Start point at 1 au on the x axis, velocity on the y axis: a different speed gives a different conic.
  const r0: Vec3 = [AU, 0, 0];
  const vc = Math.sqrt(GM_SUN / AU);
  const factors = [0.25, 0.8, 1, 1.2, Math.SQRT2, 1.6];
  const conics = factors.map((f) => {
    const s: State = { r: r0, v: [0, f * vc, 0] };
    const el = elementsFromState(s, GM_SUN);
    // Ellipse: one period (2000 equal time steps: a narrow ellipse is fast near the Sun). Parabola and hyperbola:
    // until the distance is 7 au, before and after the start point.
    let pts: number[][];
    if (el.e < 1 - 1e-9) pts = plainArc(s, period(el.a, GM_SUN), 2000);
    else {
      const out: number[][] = [];
      const step = 2 * DAY;
      for (let dt = -3000 * DAY; dt <= 3000 * DAY; dt += step) {
        const p = keplerPropagate(s, dt, GM_SUN).r;
        if (norm(p) < 7 * AU) out.push(plain(p));
      }
      pts = out;
    }
    return { factor: r6(f), speedKmS: r3(f * vc), e: r6(el.e), aAu: el.e < 1 ? r6(el.a / AU) : null, points: pts };
  });

  // Equal areas: an ellipse with a = 1.6 au and e = 0.55. Sixteen positions at equal times over one period.
  const a = 1.6 * AU, e = 0.55;
  const p = a * (1 - e * e);
  const start = stateFromElements({ p, e, i: 0, raan: 0, argp: 0, nu: 0 }, GM_SUN);
  const P = period(a, GM_SUN);
  const n = 16;
  const steps = Array.from({ length: n + 1 }, (_, k) => keplerPropagate(start, (P * k) / n, GM_SUN));
  // Area of each sector (triangle fan with 200 sub-steps), to show that the areas are equal.
  const areas = [];
  for (let k = 0; k < n; k++) {
    let A = 0;
    let prev = steps[k].r;
    for (let j = 1; j <= 200; j++) {
      const cur = keplerPropagate(steps[k], (P / n) * (j / 200), GM_SUN).r;
      A += 0.5 * norm(cross(prev, cur));
      prev = cur;
    }
    areas.push(A / (AU * AU));
  }
  const kepler2 = {
    aAu: 1.6, e, periodDays: r3(P / DAY),
    orbit: plainArc(start, P, 400),
    orbitSpeedsKmS: Array.from({ length: 401 }, (_, k) => r3(norm(keplerPropagate(start, (P * k) / 400, GM_SUN).v))),
    samples: steps.map((s) => ({ position: plain(s.r), speedKmS: r3(norm(s.v)), distanceAu: r6(norm(s.r) / AU), visVivaKmS: r3(visViva(GM_SUN, norm(s.r), a)) })),
    sectorAreasAu2: areas.map(r6),
  };

  // Orientation: an orbit with i = 25 deg, raan = 40 deg, argp = 70 deg (the plane of the reference is the ecliptic).
  const el3 = { a: 1.5 * AU, e: 0.35, i: 25 * DEG, raan: 40 * DEG, argp: 70 * DEG };
  const p3 = el3.a * (1 - el3.e ** 2);
  const at = (nu: number) => stateFromElements({ p: p3, e: el3.e, i: el3.i, raan: el3.raan, argp: el3.argp, nu }, GM_SUN);
  const orbit3: number[][] = [];
  for (let k = 0; k <= 360; k++) orbit3.push(plain(at(k * DEG).r));
  const elements = {
    aAu: 1.5, e: el3.e, iDeg: 25, raanDeg: 40, argpDeg: 70, nuDeg: 120,
    orbit: orbit3,
    periapsis: plain(at(0).r),
    apoapsis: plain(at(Math.PI).r),
    ascendingNode: plain(at(-el3.argp).r),
    descendingNode: plain(at(Math.PI - el3.argp).r),
    position: plain(at(120 * DEG).r),
  };
  write('orbits', { circularSpeedAt1AuKmS: r3(vc), escapeSpeedAt1AuKmS: r3(Math.SQRT2 * vc), conics, kepler2, elements });
  // The sector areas agree to 1e-6 (second law of Kepler, in the two-body model of the engine).
  const mean = areas.reduce((s, x) => s + x, 0) / n;
  for (const A of areas) expect(Math.abs(A / mean - 1)).toBeLessThan(1e-4);
});

// ---- Transfer to Mars (third video) -----------------------------------------------------------------------------

it('mars: Lambert arcs, porkchop, windows', () => {
  const muS = GM_SUN;
  const dep: [number, number] = [utc('2026-08-15 00:00:00'), utc('2027-02-15 00:00:00')];
  const arr: [number, number] = [utc('2027-04-01 00:00:00'), utc('2028-02-01 00:00:00')];
  const nx = 160, ny = 160;
  const pc = computePorkchop(sys, {
    central: 'SUN', from: 'EARTH', to: 'MARS', dep, arr, nx, ny, parkingAltitude: 200,
    arrival: { type: 'flyby', periapsisAltitude: 500, apoapsisRadius: null },
  });
  const grid = { nx, ny, depStartUtc: utcText(dep[0], 'day'), depEndUtc: utcText(dep[1], 'day'), arrStartUtc: utcText(arr[0], 'day'), arrEndUtc: utcText(arr[1], 'day'),
    depDays: r3((dep[1] - dep[0]) / DAY), arrDays: r3((arr[1] - arr[0]) / DAY),
    c3: Array.from(pc.c3, (x) => (Number.isFinite(x) ? r3(x) : null)),
    vinfArr: Array.from(pc.vinfArr, (x) => (Number.isFinite(x) ? r3(x) : null)),
    tofDays: Array.from(pc.tof, (x) => (Number.isFinite(x) ? r3(x / DAY) : null)) };
  // Transfer angle of each cell (angle from the Earth at departure to Mars at arrival, in the direction of the motion
  // of the planets), and the line of the cells with an angle of 180 degrees.
  const ref = refNormal('SUN', dep[0]);
  const eDep = Array.from({ length: nx }, (_, i) => helio('EARTH', dep[0] + ((dep[1] - dep[0]) * i) / (nx - 1)).r);
  const mArr = Array.from({ length: ny }, (_, j) => helio('MARS', arr[0] + ((arr[1] - arr[0]) * j) / (ny - 1)).r);
  const angleAt = (i: number, j: number) => {
    const a = (Math.atan2(dot(cross(eDep[i], mArr[j]), ref), dot(eDep[i], mArr[j])) / DEG + 360) % 360;
    return a;
  };
  const line180: number[][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j + 1 < ny; j++) {
      const a0 = angleAt(i, j), a1 = angleAt(i, j + 1);
      if (a0 < 180 && a1 >= 180 && a1 - a0 < 90) { line180.push([i, r3(j + (180 - a0) / (a1 - a0))]); break; }
    }
  }
  const bestC3 = pc.bestC3!;
  const best = { depUtc: utcText(bestC3.dep), arrUtc: utcText(bestC3.arr), c3: r3(bestC3.c3), tofDays: r3((bestC3.arr - bestC3.dep) / DAY), ix: bestC3.ix, iy: bestC3.iy };

  // Lambert arcs from the departure date of the minimum C3, with different arrival dates.
  const t1 = bestC3.dep;
  const e1 = helio('EARTH', t1);
  const arcs = [150, 200, 250, Math.round((bestC3.arr - bestC3.dep) / DAY), 360, 420].map((tofDays) => {
    const t2 = t1 + tofDays * DAY;
    const m2 = helio('MARS', t2);
    const sol = lambert(muS, e1.r, m2.r, tofDays * DAY, { refNormal: refNormal('SUN', t1) })[0];
    const vinfDep = sub(sol.v1, e1.v);
    const vinfArr = sub(sol.v2, m2.v);
    const el = elementsFromState({ r: e1.r, v: sol.v1 }, muS);
    return {
      tofDays, arrUtc: utcText(t2, 'day'), c3: r3(norm(vinfDep) ** 2), vinfArrKmS: r3(norm(vinfArr)),
      aAu: r6(el.a / AU), e: r6(el.e), points: arc({ r: e1.r, v: sol.v1 }, tofDays * DAY, 200),
      earthVelocity: fromIcrf(e1.v, 'ECLIPJ2000').map(r3), departureVelocity: fromIcrf(sol.v1, 'ECLIPJ2000').map(r3),
      marsAtArrival: au(m2.r),
    };
  });

  // Hohmann reference and synodic period at the epoch (two-body values of the engine).
  const hohmann = { tofDays: r3(hohmannTof(sys, 'SUN', 'EARTH', 'MARS', EPOCH) / DAY), synodicDays: r3(synodicPeriod(sys, 'SUN', 'EARTH', 'MARS', EPOCH) / DAY) };

  // Windows: for each departure date (step 2 days), the minimum C3 over the times of flight 100 to 500 days.
  const series: { depUtc: string; dayFromEpoch: number; minC3: number; tofDays: number }[] = [];
  const s0 = utc('2026-01-01 00:00:00'), s1 = utc('2036-01-01 00:00:00');
  for (let t = s0; t <= s1; t += 2 * DAY) {
    const e = helio('EARTH', t);
    let bestc = Infinity, bestTof = 0;
    for (let tof = 100; tof <= 500; tof += 4) {
      const m = helio('MARS', t + tof * DAY);
      for (const sol of lambert(muS, e.r, m.r, tof * DAY, { refNormal: refNormal('SUN', t) })) {
        const c3 = norm(sub(sol.v1, e.v)) ** 2;
        if (c3 < bestc) { bestc = c3; bestTof = tof; }
      }
    }
    series.push({ depUtc: utcText(t, 'day'), dayFromEpoch: r3((t - EPOCH) / DAY), minC3: r3(bestc), tofDays: bestTof });
  }
  // Launch windows: the lowest point of each group of local minima below 30 km^2/s^2. Minima less than 300 days
  // apart are one window (one window can have a type I and a type II minimum).
  const minima = series.filter((p, k) => k > 0 && k < series.length - 1 && p.minC3 < series[k - 1].minC3 && p.minC3 <= series[k + 1].minC3 && p.minC3 < 30);
  const windows: typeof series = [];
  for (const m of minima) {
    const last = windows[windows.length - 1];
    if (last && m.dayFromEpoch - last.dayFromEpoch < 300) { if (m.minC3 < last.minC3) windows[windows.length - 1] = m; }
    else windows.push(m);
  }
  write('mars', { grid, line180, best, bestDvTotal: pc.best ? { depUtc: utcText(pc.best.dep), arrUtc: utcText(pc.best.arr), dvTotalKmS: r3(pc.best.dvTotal), c3: r3(pc.best.c3) } : null,
    earthAtDeparture: au(e1.r), departureUtc: utcText(t1), arcs, hohmann, series, windows });
  expect(windows.length).toBeGreaterThan(3);
});

// ---- A new mission to Mars with the defaults of the Explorer mode (first video) --------------------------------

it('quick mission: Earth to Mars from the epoch', () => {
  const { mission, window } = quickMission(sys, { target: 'MARS', goal: 'flyby', after: EPOCH, style: 'efficient' }, 'Flight to Mars');
  const out = solveMission(sys, mission);
  expect(out.report.converged).toBe(true);
  const traj = out.trajectory;
  const pts: number[][] = [];
  const days: number[] = [];
  for (let t = traj.et0; t <= traj.et1; t += DAY) {
    const s = traj.stateAt(t);
    pts.push(au(sub(s.r, sys.state('SUN', t).r)));
    days.push(r3((t - EPOCH) / DAY));
  }
  // The search of the launch date (first video): for each launch date of the coarse grid of the search, the
  // smallest velocity change of the flight times that the search uses. The limits of the flight time are the
  // limits of quickWindow (src/engine/mission.ts): 0.35 to 1.7 times the Hohmann time, at least 400 days.
  const pc = window.porkchop;
  const { nx, ny } = pc.request;
  const hoh = hohmannTof(sys, 'SUN', 'EARTH', 'MARS', EPOCH);
  const tofCap = Math.min(Math.max(1.7 * hoh, 400 * DAY), 16 * YEAR);
  const tofMin = Math.max(Math.min(0.35 * hoh, 0.5 * tofCap), 40 * DAY);
  const curve: { day: number; dvKmS: number | null }[] = [];
  for (let ix = 0; ix < nx; ix++) {
    let best = Infinity;
    for (let iy = 0; iy < ny; iy++) {
      const k = iy * nx + ix;
      if (Number.isFinite(pc.dvTotal[k]) && pc.tof[k] >= tofMin && pc.tof[k] <= tofCap) best = Math.min(best, pc.dvTotal[k]);
    }
    const dep = pc.request.dep[0] + ((pc.request.dep[1] - pc.request.dep[0]) * ix) / (nx - 1);
    curve.push({ day: r3((dep - EPOCH) / DAY), dvKmS: Number.isFinite(best) ? r3(best) : null });
  }
  write('quick-mars', {
    afterUtc: EPOCH_TEXT, launchUtc: utcText(window.dep), arrivalUtc: utcText(window.arr), c3: r3(window.c3), vinfArrKmS: r3(window.vinfArr),
    dvKmS: r3(window.dvTotal), launchDay: r3((window.dep - EPOCH) / DAY), daysToArrival: r3((window.arr - window.dep) / DAY),
    search: { spanDays: r3((pc.request.dep[1] - pc.request.dep[0]) / DAY), synodicDays: r3(synodicPeriod(sys, 'SUN', 'EARTH', 'MARS', EPOCH) / DAY),
      tofMinDays: r3(tofMin / DAY), tofMaxDays: r3(tofCap / DAY), grid: [nx, ny], curve },
    flightDays: r3((traj.et1 - traj.et0) / DAY), points: pts, dayFromEpoch: days,
    closest: out.report.encounters.map((e) => ({ body: e.body, utc: utcText(e.et), altitudeKm: Math.round(e.altitude) })),
    corrections: out.report.corrections.map((c) => ({ utc: utcText(c.et), day: r3((c.et - EPOCH) / DAY), dvMS: r3(c.dv * 1000), kind: c.kind })),
  });
});

// ---- Flybys and Voyager 2 (fourth video) ------------------------------------------------------------------------

it('voyager 2: trajectory, flybys, speeds', () => {
  const out = solveMission(sys, famousMission(sys, 'voyager2'));
  expect(out.report.converged).toBe(true);
  const traj = out.trajectory;
  const tStart = traj.et0, tEnd = traj.et1;
  const step = 5 * DAY;
  const samples: { t: number; p: number[]; speedKmS: number; rAu: number; escapeKmS: number }[] = [];
  for (let t = tStart; t <= tEnd; t += step) {
    const s = traj.stateAt(t);
    const sun = sys.state('SUN', t);
    const rel = { r: sub(s.r, sun.r), v: sub(s.v, sun.v) };
    const r = norm(rel.r);
    samples.push({ t: r3((t - tStart) / DAY), p: au(rel.r), speedKmS: r3(norm(rel.v)), rAu: r6(r / AU), escapeKmS: r3(Math.sqrt((2 * GM_SUN) / r)) });
  }
  // Planet positions on the same days, for the motion of the planets in the video.
  const planetIds = ['EARTH', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'];
  const planets: Record<string, number[][]> = {};
  for (const id of planetIds) {
    planets[id] = [];
    for (let t = tStart; t <= tEnd; t += step) planets[id].push(au(helio(id, t).r));
  }
  const orbits = Object.fromEntries(planetIds.map((id) => {
    const s = helio(id, tStart);
    const mu = GM_SUN + BODIES[id].gm;
    const el = elementsFromState(s, mu);
    return [id, arc(s, period(el.a, mu), 360, mu)];
  }));

  // Each flyby: the values of the engine report, the speed relative to the Sun before and after, the turn angle.
  const flybys = out.report.encounters.map((enc) => {
    const body = BODIES[enc.body];
    const before = traj.stateAt(enc.et - 20 * DAY), after = traj.stateAt(Math.min(enc.et + 20 * DAY, tEnd));
    const sunB = sys.state('SUN', enc.et - 20 * DAY), sunA = sys.state('SUN', Math.min(enc.et + 20 * DAY, tEnd));
    const planetHelio = helio(enc.body, enc.et);
    return {
      body: enc.body, utc: utcText(enc.et), dayFromStart: r3((enc.et - tStart) / DAY),
      radiusKm: Math.round(enc.radius), altitudeKm: Math.round(enc.altitude), bodyRadiusKm: body.radius,
      vinfKmS: r3(enc.vinf), turnDeg: r3(turnAngle(body.gm, enc.vinf, enc.radius) / DEG),
      speedBeforeKmS: r3(norm(sub(before.v, sunB.v))), speedAfterKmS: r3(norm(sub(after.v, sunA.v))),
      planetSpeedKmS: r3(norm(planetHelio.v)), position: au(planetHelio.r),
    };
  });

  // Close view of the Jupiter flyby: positions relative to Jupiter, +-12 days, every 30 min. Plane of the flyby.
  const jup = out.report.encounters.find((x) => x.body === 'JUPITER')!;
  const rel = (t: number): State => { const s = traj.stateAt(t); const j = sys.state('JUPITER', t); return { r: sub(s.r, j.r), v: sub(s.v, j.v) }; };
  const ca = rel(jup.et);
  const h = cross(ca.r, ca.v);
  // In-plane axes: x toward the closest approach point, y along the velocity at the closest approach.
  const ex = scale(ca.r, 1 / norm(ca.r));
  const ez = scale(h, 1 / norm(h));
  const ey = cross(ez, ex);
  const RJ = BODIES.JUPITER.radius;
  const close: number[][] = [];
  for (let dt = -12 * DAY; dt <= 12 * DAY; dt += 1800) {
    const p = rel(jup.et + dt).r;
    close.push([r6(dot(p, ex) / RJ), r6(dot(p, ey) / RJ)]);
  }
  // Speed at infinity before and after the flyby: the two-body hyperbola of the state at the closest approach
  // (GM of the Jupiter system), propagated 3000 days back and forward. The difference to the asymptote is small.
  const muJ = BODIES.JUPITER.gm;
  const vIn = keplerPropagate(ca, -3000 * DAY, muJ).v, vOut = keplerPropagate(ca, 3000 * DAY, muJ).v;
  const jv = sys.stateRel('JUPITER', 'SUN', jup.et).v;
  const inPlane = (v: Vec3) => [r3(dot(v, ex)), r3(dot(v, ey))];
  // Velocity relative to the Sun before and after the flyby in the patched-conic model: velocity of Jupiter plus
  // the speed at infinity (the out-of-plane part of the velocity of Jupiter is the same before and after).
  const helioIn: Vec3 = [jv[0] + vIn[0], jv[1] + vIn[1], jv[2] + vIn[2]];
  const helioOut: Vec3 = [jv[0] + vOut[0], jv[1] + vOut[1], jv[2] + vOut[2]];
  const jupiterClose = {
    radiusJupiter: RJ, periapsisRj: r6(jup.radius / RJ), points: close, stepMinutes: 30,
    vinfIn: inPlane(vIn), vinfOut: inPlane(vOut), vinfKmS: r3(norm(vIn)), jupiterVelocity: inPlane(jv),
    jupiterVelocityOutOfPlaneKmS: r3(dot(jv, ez)), jupiterSpeedKmS: r3(norm(jv)),
    helioIn: inPlane(helioIn), helioOut: inPlane(helioOut), helioInKmS: r3(norm(helioIn)), helioOutKmS: r3(norm(helioOut)),
  };
  // Two-body hyperbolas at Jupiter with the speed at infinity of Voyager 2 and different periapsis radii (in units of
  // the radius of Jupiter; x toward the periapsis, y along the velocity at the periapsis).
  const hyperbolas = [2, 4, 9.988, 20, 40].map((rpRj) => {
    const rp = rpRj * RJ;
    const vp = Math.sqrt(jup.vinf ** 2 + (2 * muJ) / rp);
    const pe: State = { r: [rp, 0, 0], v: [0, vp, 0] };
    const pts: number[][] = [];
    for (let k = -200; k <= 200; k++) { const p = keplerPropagate(pe, (k / 200) * 12 * DAY, muJ).r; pts.push([r6(p[0] / RJ), r6(p[1] / RJ)]); }
    return { rpRj, turnDeg: r3(turnAngle(muJ, jup.vinf, rp) / DEG), points: pts };
  });
  // Turn angle against the periapsis radius at the speed of Voyager 2 (two-body formula of the engine).
  const turnCurve = [];
  for (let k = 1.1; k <= 40; k *= 1.05) turnCurve.push([r3(k), r3(turnAngle(BODIES.JUPITER.gm, jup.vinf, k * RJ) / DEG)]);

  write('voyager2', {
    startUtc: utcText(tStart), endUtc: utcText(tEnd), stepDays: 5, samples, planets, orbits, flybys, jupiterClose, hyperbolas, turnCurve,
    corrections: out.report.corrections.map((c) => ({ utc: utcText(c.et), dvMS: r3(c.dv * 1000), kind: c.kind })),
  });
  expect(flybys.map((f) => f.body)).toEqual(['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE']);
});

// ---- The actual missions of the application (first video and the manual) --------------------------------------

it('actual missions: names, start dates and routes', () => {
  const list = FAMOUS.map((m) => {
    const f = famousFacts(m.id);
    return { id: m.id, name: m.name, startUtc: utcText(parseToEt(f.startTdb, 'TDB')!, 'day'), route: ['EARTH', ...f.encounters.map((e) => e.body)] };
  });
  write('missions', list);
  // The measured values of the actual missions (the Accuracy screen shows them): a copy for the videos.
  write('accuracy', JSON.parse(readFileSync('src/validation/measured/famous.json', 'utf8')));
  expect(list.length).toBe(8);
});
