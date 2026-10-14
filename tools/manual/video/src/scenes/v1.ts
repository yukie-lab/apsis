// First video: Apsis in three minutes. Data: planets.json, quick-mars.json (the quick mission of the Explorer mode:
// the search of the launch date and the flight), missions.json, accuracy.json (measured values of the application),
// and the pictures of the screens.
import type { Kit } from '../main';
import { Curve, Dot, Arrow, Box } from '../shapes';
import {
  C, fadeIn, fadeOut, fadeAll, write, LiveText, ramp, titleCard, addPlanets, addSun, planetAt, Axes, loadValues, card,
  crossMark, checkMark, placePicture, markBox, dayDate, daysTo, wrap, sub3, unit3, scale3, add3, type PlanetData,
} from '../lib';
import { ease, type Mob, type Vec3 } from '../core';
import { shot } from '../shots';

interface QuickMars {
  afterUtc: string; launchDay: number; daysToArrival: number; flightDays: number; points: number[][]; dayFromEpoch: number[];
  search: { spanDays: number; curve: { day: number; dvKmS: number | null }[] };
}
interface Mission { id: string; name: string; startUtc: string; route: string[] }
interface Row { id: string; value: number; limit?: number }

const NAME: Record<string, string> = {
  EARTH: 'Earth', VENUS: 'Venus', MARS: 'Mars', JUPITER: 'Jupiter', SATURN: 'Saturn', URANUS: 'Uranus', NEPTUNE: 'Neptune', PLUTO: 'Pluto',
};

export default async function build({ scene, N, data }: Kit): Promise<void> {
  const P = await data<PlanetData>('planets');
  const Q = await data<QuickMars>('quick-mars');
  const missions = await data<Mission[]>('missions');
  const accuracy = await data<Row[]>('accuracy');
  const v = await loadValues(data);
  const cam = scene.camera;

  titleCard(scene, 'Apsis in three minutes', 'Apsis  ·  video 1 of 4', N.at('intro') - 0.6);

  // ---- The application in the browser --------------------------------------------------------------------------
  const tI = N.at('intro');
  const home = await shot(scene, 'explorer-home', 320, 200, 1280);
  fadeIn(home.picture, tI, 0.8);
  placePicture(home.picture, tI, 0.01, 340, 210, 1240);
  placePicture(home.picture, tI + 0.01, 4.0, 320, 200, 1280, ease.out);
  const name = write(scene, 'Apsis', 960, 130, tI + 0.2, { size: 72, weight: 600, anchor: 'middle' });
  const tB = N.at('browser');
  fadeOut(name, tB, 0.5);
  placePicture(home.picture, tB, 1.0, 100, 270, 1040);
  const bar = scene.add(new Box(100, 222, 1040, 44, { color: '#2a3654', width: 2, radius: 10, fill: '#121a2c', fillOpacity: 1 }), 'ui');
  fadeIn(bar, tB + 0.9, 0.4);
  const barDots = [0, 1, 2].map((k) => fadeIn(scene.add(new Dot(scene.defs, [128 + k * 24, 244, 0], { space: 'screen', style: 'plain', color: ['#ff7a6b', '#ffd166', '#7bd88f'][k], radius: 6 }), 'ui'), tB + 1.0, 0.4));
  const ok1 = checkMark(scene, 1270, 450, 22, C.green, N.at('browser', 0.1));
  const l1 = write(scene, 'in your web browser', 1320, 462, N.at('browser', 0.12), { size: 40 });
  const no1 = crossMark(scene, 1270, 560, 18, C.red, N.at('browser', 0.6));
  const l2 = write(scene, 'no server', 1320, 572, N.at('browser', 0.62), { size: 40 });
  const no2 = crossMark(scene, 1270, 670, 18, C.red, N.at('browser', 0.8));
  const l3 = write(scene, 'no account', 1320, 682, N.at('browser', 0.82), { size: 40 });
  const tT = N.at('today');
  fadeAll([home.picture, bar, ...barDots, ok1, l1, ...no1, l2, ...no2, l3], tT - 0.4, 0.5);

  // ---- The solar system on the epoch, then one year of motion --------------------------------------------------
  cam.scale.initial = 250;
  const tRun0 = N.at('de440', 0.05), tRun1 = N.end('de440') + 0.6;
  const day1 = ramp(tRun0, tRun1, 0, 365, ease.smooth);
  const sun1 = addSun(scene, tT - 0.1, 22);
  const inner = addPlanets(scene, P, ['MERCURY', 'VENUS', 'EARTH', 'MARS'], day1, { t0: tT, labels: true });
  const dateTitle = write(scene, 'the solar system on', 110, 110, tT + 0.2, { size: 30, color: C.dim });
  const dateText = fadeIn(scene.add(new LiveText((t) => dayDate(P.epochUtc, Math.floor(day1(t))), 110, 170, { size: 52, weight: 600 }), 'ui'), tT + 0.4);
  const tD = N.at('de440');
  cam.scale.to(78, tD + 0.3, 3.0);
  for (const l of inner.labels) l.opacity.to(0, tD + 0.3, 0.8);
  const outer = addPlanets(scene, P, ['JUPITER', 'SATURN'], day1, { t0: tD + 1.4, labels: true });
  // Range of the data: the years of the ephemeris.
  const y0 = Number(v('coverStartYear')), y1 = Number(v('coverEndYear')) + 1;
  const bx = (year: number) => 560 + ((year - y0) / (y1 - y0)) * 800;
  const covTitle = write(scene, 'DE440 (JPL): data of the positions', 960, 880, N.at('de440', 0.35), { size: 30, anchor: 'middle' });
  const cov = scene.add(new Box(bx(y0), 914, bx(y1) - bx(y0), 22, { color: C.blue, width: 2, radius: 11, fill: C.blue, fillOpacity: 0.35 }), 'ui');
  cov.hide(); cov.create(N.at('de440', 0.4), 1.0);
  const covA = write(scene, v('coverStartYear'), bx(y0), 980, N.at('de440', 0.5), { size: 28, color: C.dim, anchor: 'middle' });
  const covB = write(scene, v('coverEndYear'), bx(y1), 980, N.at('de440', 0.55), { size: 28, color: C.dim, anchor: 'middle' });
  const nowYear = 2026 + 286 / 365;
  const nowMark = scene.add(new Curve([[bx(nowYear), 902], [bx(nowYear), 948]], { space: 'screen', color: C.craft, width: 5 }), 'ui');
  fadeIn(nowMark, N.at('de440', 0.6));
  const nowLabel = write(scene, 'now', bx(nowYear), 980, N.at('de440', 0.62), { size: 28, color: C.craft, anchor: 'middle' });
  const tM = N.at('modes');
  fadeAll([sun1, ...inner.orbits, ...inner.bodies, ...outer.orbits, ...outer.bodies, ...outer.labels, dateTitle, dateText, covTitle, cov, covA, covB, nowMark, nowLabel], tM - 0.5, 0.5);

  // ---- Two modes -------------------------------------------------------------------------------------------------
  const cardA = card(scene, 330, 360, 560, 300, tM);
  const cardB = card(scene, 1030, 360, 560, 300, tM + 0.3);
  const nameA = write(scene, 'Explorer', 610, 535, tM + 0.4, { size: 64, weight: 600, anchor: 'middle', color: C.craft });
  const nameB = write(scene, 'Expert', 1310, 535, tM + 0.7, { size: 64, weight: 600, anchor: 'middle', color: C.blue });
  const tE = N.at('explorer');
  fadeAll([cardA, cardB], tE, 0.5);
  nameA.y.to(170, tE, 0.8); nameA.x.to(510, tE, 0.8);
  nameB.y.to(170, tE, 0.8); nameB.x.to(1410, tE, 0.8);
  const homeB = await shot(scene, 'explorer-home', 80, 250, 860);
  fadeIn(homeB.picture, tE + 0.4, 0.6);
  const capA1 = write(scene, 'select a destination', 510, 860, N.at('explorer', 0.2), { size: 34, anchor: 'middle' });
  const capA2 = write(scene, 'Apsis finds the launch date', 510, 912, N.at('explorer', 0.5), { size: 34, anchor: 'middle', color: C.dim });
  const tX = N.at('expert');
  const mission = await shot(scene, 'expert-mission', 980, 250, 860);
  fadeIn(mission.picture, tX, 0.6);
  const capB1 = write(scene, 'set all the values', 1410, 860, N.at('expert', 0.2), { size: 34, anchor: 'middle' });
  const capB2 = write(scene, 'see all the numbers', 1410, 912, N.at('expert', 0.5), { size: 34, anchor: 'middle', color: C.dim });

  // ---- Mars: the destination and the launch button ----------------------------------------------------------------
  const tMa = N.at('mars');
  fadeAll([mission.picture, capA1, capA2, capB1, capB2, nameA, nameB], tMa - 0.4, 0.5);
  placePicture(homeB.picture, tMa - 0.4, 1.0, 240, 110, 1440);
  const markMars = markBox(scene, homeB.picture, homeB.info, 'mars', tMa + 0.7);
  const markLaunch = markBox(scene, homeB.picture, homeB.info, 'launch', N.at('mars', 0.55));
  const tS = N.at('search');
  fadeAll([homeB.picture, markMars, markLaunch], tS - 0.4, 0.5);

  // ---- The search of the launch date ---------------------------------------------------------------------------------
  const span = Q.search.spanDays;
  const years = [2027, 2028, 2029].filter((y) => daysTo(Q.afterUtc, y) > 0 && daysTo(Q.afterUtc, y) < span);
  const ax = new Axes(scene, {
    x: 300, y: 250, w: 1420, h: 560, xRange: [0, span], yRange: [0, 20],
    xTicks: years.map((y) => ({ v: daysTo(Q.afterUtc, y), label: String(y) })),
    yTicks: [0, 5, 10, 15, 20].map((k) => ({ v: k, label: String(k) })),
    xTitle: 'launch date', yTitle: 'change of velocity (km/s)',
  }).build(tS, { grid: true });
  const pts = Q.search.curve.filter((p) => p.dvKmS !== null) as { day: number; dvKmS: number }[];
  const tS0 = N.at('search', 0.35), tS1 = N.end('each') + 0.3;
  const scanDay = ramp(tS0, tS1, 0, span, ease.linear);
  const curve = scene.add(new Curve(pts.map((p) => ax.p(p.day, Math.min(20, p.dvKmS))), { space: 'screen', color: C.craft, width: 4 }), 'front');
  curve.hide(); curve.opacity.set(1, tS0); curve.end.set(0, 0).to(1, tS0, tS1 - tS0, ease.linear);
  const scan = scene.add(new Curve([[0, 0], [0, 0]], { space: 'screen', color: C.text, width: 2, dash: '8 8' }), 'front');
  scan.setPoints((t) => { const x = ax.sx(scanDay(t)); return [[x, 250], [x, 810]]; });
  fadeIn(scan, tS0, 0.3); fadeOut(scan, tS1, 0.4);
  const scanDate = fadeIn(scene.add(new LiveText((t) => dayDate(Q.afterUtc, Math.floor(scanDay(t))), 0, 0, { size: 28, color: C.text, anchor: 'start', screenAt: (t) => [ax.sx(scanDay(t)) + 14, 792] }), 'front'), tS0, 0.3);
  fadeOut(scanDate, tS1, 0.4);
  // The two launch windows: the lowest value of each half of the search (the same values as the narration).
  const half = span / 2;
  const low = (list: typeof pts) => list.reduce((a, b) => (b.dvKmS < a.dvKmS ? b : a));
  const A = low(pts.filter((p) => p.day < half)), B = low(pts.filter((p) => p.day >= half));
  const tW = N.at('two');
  const dotA = fadeIn(scene.add(new Dot(scene.defs, ax.p(A.day, A.dvKmS), { space: 'screen', style: 'plain', color: C.yellow, radius: 11 }), 'front'), tW + 0.3);
  const dotB = fadeIn(scene.add(new Dot(scene.defs, ax.p(B.day, B.dvKmS), { space: 'screen', style: 'plain', color: C.yellow, radius: 11 }), 'front'), tW + 0.6);
  const labA = write(scene, `${v('windowADv')} km/s`, ax.sx(A.day) + 10, ax.sy(A.dvKmS) - 76, N.at('two', 0.45), { size: 34, color: C.yellow, anchor: 'start', layer: 'front' });
  const labA2 = write(scene, v('windowADate'), ax.sx(A.day) + 10, ax.sy(A.dvKmS) - 36, N.at('two', 0.5), { size: 26, color: C.dim, anchor: 'start', layer: 'front' });
  const bx2 = Math.min(ax.sx(B.day), 1720 - 110);
  const labB = write(scene, `${v('windowBDv')} km/s`, bx2, ax.sy(B.dvKmS) - 170, N.at('two', 0.75), { size: 34, color: C.yellow, anchor: 'middle', layer: 'front' });
  const labB2 = write(scene, v('windowBDate'), bx2, ax.sy(B.dvKmS) - 130, N.at('two', 0.8), { size: 26, color: C.dim, anchor: 'middle', layer: 'front' });
  const lead = scene.add(new Curve([[ax.sx(B.day), ax.sy(B.dvKmS) - 16], [bx2, ax.sy(B.dvKmS) - 118]], { space: 'screen', color: C.dim, width: 2 }), 'front');
  fadeIn(lead, N.at('two', 0.75));
  const tP = N.at('pick');
  for (const m of [dotA, labA, labA2]) m.opacity.to(0.35, tP, 0.5);
  dotB.radius.to(18, tP + 0.2, 0.8, ease.pulse);
  const ring = scene.add(new Dot(scene.defs, ax.p(B.day, B.dvKmS), { space: 'screen', style: 'ring', color: C.yellow, radius: 26 }), 'front');
  fadeIn(ring, tP + 0.3, 0.4);
  const pick = write(scene, `launch: ${v('quickLaunchDate')}`, bx2 + 110, ax.sy(B.dvKmS) - 230, N.at('pick', 0.5), { size: 36, weight: 600, anchor: 'end', layer: 'front' });
  const tF = N.at('fly');
  ax.fadeOut(tF - 0.4, 0.5);
  fadeAll([curve, dotA, dotB, labA, labA2, labB, labB2, lead, ring, pick], tF - 0.4, 0.5);

  // ---- The flight to Mars ------------------------------------------------------------------------------------------
  cam.scale.set(270, tF - 0.2);
  const n = Q.points.length - 1;
  // The animation stops at the closest approach to Mars (the data continues to the end of the flight).
  const fEnd = Q.daysToArrival / n;
  const tF0 = N.at('fly', 0.15), tF1 = N.end('fly') + 1.2;
  const frac = ramp(tF0, tF1, 0, fEnd, ease.linear);
  const flightDay = (t: number) => Q.launchDay + n * frac(t);
  const sun2 = addSun(scene, tF - 0.2, 22);
  const pl = addPlanets(scene, P, ['EARTH', 'MARS'], flightDay, { t0: tF - 0.2, labels: true });
  const path = scene.add(new Curve(Q.points, { color: C.craft, width: 4 }));
  path.hide(); path.opacity.set(1, tF0); path.end.set(0, 0).to(fEnd, tF0, tF1 - tF0, ease.linear);
  const at = (f: number): Vec3 => { const x = Math.max(0, Math.min(1, f)) * n; const k = Math.min(n - 1, Math.floor(x)), u = x - k; const a = Q.points[k], b = Q.points[k + 1]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]; };
  const craft = fadeIn(scene.add(new Dot(scene.defs, (t) => at(frac(t)), { style: 'craft', color: C.craft, radius: 12 }), 'front'), tF0, 0.3);
  const flyDate = fadeIn(scene.add(new LiveText((t) => dayDate(P.epochUtc, Math.floor(flightDay(t))), 110, 140, { size: 44, weight: 600 }), 'ui'), tF0);
  const flyDay = fadeIn(scene.add(new LiveText((t) => `day ${Math.round(n * frac(t))}`, 110, 196, { size: 34, color: C.dim }), 'ui'), tF0);
  const arrive = write(scene, `Mars after ${v('quickDays')} days`, 0, -40, tF1 - 0.4, { size: 34, color: C.craft, anchor: 'middle', layer: 'front', at: Q.points[Math.round(Q.daysToArrival)] as Vec3 });

  // Each point is a position from the calculation.
  const tN = N.at('nodrawing');
  fadeOut(arrive, tN, 0.5);
  path.opacity.to(0.35, tN, 0.6);
  const dots: Dot[] = [];
  for (let k = 0; k <= n; k++) {
    const d = scene.add(new Dot(scene.defs, Q.points[k] as Vec3, { style: 'plain', color: C.text, radius: 3.2 }), 'front');
    fadeIn(d, N.at('nodrawing', 0.1) + (1.6 * k) / n, 0.2);
    d.radius.to(5, N.at('nodrawing', 0.3), 0.8);
    dots.push(d);
  }
  // A close view: the points of the days are separate.
  const kZ = 40;
  cam.center.to(Q.points[kZ] as Vec3, N.at('nodrawing', 0.3), 1.4);
  cam.scale.to(1700, N.at('nodrawing', 0.3), 1.4);
  const each = write(scene, 'one calculated position for each day', 110, 260, N.at('nodrawing', 0.45), { size: 30, color: C.text });

  // ---- The two models of the forces ------------------------------------------------------------------------------
  const tSi = N.at('simple');
  fadeAll([flyDate, flyDay, each, craft], tSi - 0.3, 0.4);
  for (const d of dots) { d.opacity.to(0.5, tSi - 0.3, 0.4); d.radius.to(3.2, tSi - 0.6, 0.8); }
  cam.center.to([0, 0, 0], tSi - 0.6, 1.0);
  cam.scale.to(270, tSi - 0.6, 1.0);
  const kMid = Math.round(0.45 * n);
  const mid = Q.points[kMid] as Vec3;
  const midDay = Q.dayFromEpoch[kMid];
  const craftMid = fadeIn(scene.add(new Dot(scene.defs, mid, { style: 'craft', color: C.craft, radius: 13 }), 'front'), tSi);
  const toSun = scene.add(new Arrow(mid, add3(mid, scale3(unit3(sub3([0, 0, 0], mid)), 0.42)), { color: C.sun, width: 6 }), 'front');
  toSun.hide(); toSun.growIn(N.at('simple', 0.2), 0.7);
  const m1 = write(scene, 'model 1', 110, 140, tSi + 0.1, { size: 44, weight: 600 });
  const m1a = write(scene, 'gravity of the Sun', 110, 196, N.at('simple', 0.3), { size: 32, color: C.sun });
  const tFu = N.at('full');
  fadeOut(m1, tFu, 0.4);
  m1a.opacity.to(0, tFu, 0.4);
  const m2 = write(scene, 'model 2: numerical integration', 110, 140, tFu + 0.1, { size: 44, weight: 600 });
  const forces = [
    ['gravity of the Sun', C.sun], ['gravity of the 8 planets', C.blue], ['gravity of the Moon and Pluto', C.text],
    ['gravity of Ceres, Vesta and Psyche', C.text], ['flattening of the planets (J2)', C.teal], ['general relativity', C.purple],
  ] as const;
  const list: Mob[] = [m2];
  forces.forEach(([s, c], k) => {
    const d = fadeIn(scene.add(new Dot(scene.defs, [124, 190 + k * 50, 0], { space: 'screen', style: 'plain', color: c, radius: 8 }), 'ui'), N.at('full', 0.1) + k * 0.35, 0.3);
    list.push(d, write(scene, s, 150, 200 + k * 50, N.at('full', 0.1) + k * 0.35, { size: 30 }));
  });
  // The direction to each planet on the day of the point (the pull of each planet). The lines show directions only.
  const pulls: Curve[] = [];
  ['MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'].forEach((id, k) => {
    const p = planetAt(P, id, midDay);
    const pp = P.planets.find((x) => x.id === id)!;
    const c = scene.add(new Curve([mid, p], { color: pp.color, width: 2.5, dash: '10 8' }));
    c.hide(); c.create(N.at('full', 0.25) + k * 0.15, 0.8);
    pulls.push(c);
  });

  // ---- The start of the flight in the full model ------------------------------------------------------------------
  const tC = N.at('corrections');
  fadeAll([...list, ...pulls, toSun, craftMid], tC - 0.3, 0.4);
  for (const d of dots) d.opacity.to(0, tC - 0.3, 0.4);
  path.opacity.to(1, tC - 0.3, 0.4);
  const p0 = Q.points[0] as Vec3;
  const dir = unit3(sub3(Q.points[1], Q.points[0]));
  const vStart = scene.add(new Arrow(p0, add3(p0, scale3(dir, 0.55)), { color: C.green, width: 7 }), 'front');
  vStart.hide(); vStart.growIn(tC + 0.2, 0.7);
  vStart.grow.to(0.8, tC + 1.2, 0.5).to(1, tC + 1.7, 0.5).to(0.9, tC + 2.2, 0.4).to(1, tC + 2.6, 0.4);
  const vLabel = write(scene, 'velocity at the start', 30, 10, tC + 0.6, { size: 32, color: C.green, layer: 'front', at: add3(p0, scale3(dir, 0.55)) });
  const launchRing = fadeIn(scene.add(new Dot(scene.defs, p0, { style: 'ring', color: C.blue, radius: 16 }), 'front'), tC);
  const launchText = write(scene, 'Earth at launch', 0, 52, tC + 0.2, { size: 28, color: C.blue, anchor: 'middle', layer: 'front', at: p0 });
  const tC2 = N.at('corrections', 0.45);
  cam.scale.to(210, tC2, 1.2); cam.screen.to([560, 560, 0], tC2, 1.2);
  const flight = await shot(scene, 'explorer-flight', 1060, 300, 780);
  fadeIn(flight.picture, tC2 + 0.6, 0.6);
  const markCap = markBox(scene, flight.picture, flight.info, 'caption', tC2 + 1.4);
  const alt = write(scene, `closest approach: ${v('quickAltitude')} km above Mars`, 1450, 860, tC2 + 1.6, { size: 32, color: C.craft, anchor: 'middle' });

  // ---- Actual missions ----------------------------------------------------------------------------------------------
  const tA = N.at('actual');
  fadeAll([sun2, ...pl.orbits, ...pl.bodies, ...pl.labels, path, vStart, vLabel, launchRing, launchText, flight.picture, markCap, alt], tA - 0.4, 0.5);
  const sorted = [...missions].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  const head = write(scene, `${v('missionCount')} actual missions in Apsis`, 140, 220, tA, { size: 44, weight: 600 });
  const cards: Mob[] = [head];
  sorted.forEach((m, k) => {
    const x = 140 + (k % 4) * 420, y = 290 + Math.floor(k / 4) * 260;
    const t0 = tA + 0.3 + k * 0.25;
    cards.push(card(scene, x, y, 390, 230, t0));
    cards.push(write(scene, m.name, x + 28, y + 66, t0 + 0.2, { size: 38, weight: 600 }));
    cards.push(write(scene, m.startUtc.slice(0, 4), x + 28, y + 112, t0 + 0.3, { size: 28, color: C.dim }));
    const route = wrap(m.route.map((b) => NAME[b] ?? b).join(' · '), 340, 24);
    cards.push(write(scene, route, x + 28, y + 160, t0 + 0.4, { size: 24, color: C.blue, lineHeight: 1.35 }));
  });

  // ---- Comparison with JPL Horizons -------------------------------------------------------------------------------
  const tCo = N.at('compare');
  fadeAll(cards, tCo - 0.3, 0.4);
  const cmp = await shot(scene, 'expert-mission-compare', 210, 330, 1500);
  fadeIn(cmp.picture, tCo + 0.1, 0.6);
  const tAc = N.at('accuracy');
  placePicture(cmp.picture, tAc - 0.2, 0.9, 360, 70, 1200);
  // The differences of the radius of the closest approach of Voyager 2 (measured values of the application).
  const bodies = ['JUPITER', 'SATURN', 'URANUS'];
  const rows = bodies.map((b, k) => accuracy.find((r) => r.id === `famous.periapsis.voyager2.${k}.${b}`)!);
  const limit = rows[0].limit ?? 3;
  const bars = new Axes(scene, {
    x: 610, y: 470, w: 700, h: 400, xRange: [0, 3], yRange: [0, 3.5],
    yTicks: [0, 1, 2, 3].map((k) => ({ v: k, label: `${k} %` })),
    yTitle: 'Voyager 2: difference of the distance of closest approach',
  }).build(tAc + 0.6);
  const barParts: Mob[] = [];
  rows.forEach((r, k) => {
    const cx = bars.sx(0.5 + k), w = 130;
    const b = scene.add(new Box(cx - w / 2, bars.sy(0), w, 0, { color: C.green, width: 2, radius: 6, fill: C.green, fillOpacity: 0.55 }), 'front');
    b.hide(); b.opacity.set(1, tAc + 1.4 + k * 0.4);
    b.y.set(bars.sy(0), 0).to(bars.sy(r.value), tAc + 1.4 + k * 0.4, 0.8); b.h.set(0, 0).to(bars.sy(0) - bars.sy(r.value), tAc + 1.4 + k * 0.4, 0.8);
    barParts.push(b);
    barParts.push(write(scene, `${r.value.toFixed(2)} %`, cx, bars.sy(r.value) - 16, tAc + 2.0 + k * 0.4, { size: 30, anchor: 'middle', layer: 'front' }));
    barParts.push(write(scene, NAME[bodies[k]], cx, bars.sy(0) + 42, tAc + 1.0, { size: 28, color: C.dim, anchor: 'middle', layer: 'front' }));
  });
  const limLine = scene.add(new Curve([bars.p(0, limit), bars.p(3, limit)], { space: 'screen', color: C.red, width: 3, dash: '12 10' }), 'front');
  limLine.hide(); limLine.create(N.at('accuracy', 0.6), 0.8);
  const limText = write(scene, `limit of the test: ${limit} %`, bars.sx(3) + 20, bars.sy(limit) + 10, N.at('accuracy', 0.65), { size: 28, color: C.red, layer: 'front' });

  // ---- The next videos ---------------------------------------------------------------------------------------------------
  const tNx = N.at('next');
  bars.fadeOut(tNx - 0.4, 0.5);
  fadeAll([cmp.picture, ...barParts, limLine, limText], tNx - 0.4, 0.5);
  const titles: string[] = [];
  for (const id of ['v2', 'v3', 'v4']) titles.push(((await (await fetch(`/scripts/${id}.json`)).json()) as { title: { en: string } }).title.en);
  const ends: Mob[] = [];
  titles.forEach((s, k) => {
    const x = 200 + k * 540, t0 = tNx + 0.2 + k * 0.5;
    ends.push(card(scene, x, 380, 480, 300, t0));
    ends.push(write(scene, `video ${k + 2}`, x + 36, 450, t0 + 0.2, { size: 28, color: C.dim }));
    ends.push(write(scene, wrap(s, 410, 46, 600), x + 36, 530, t0 + 0.3, { size: 46, weight: 600, lineHeight: 1.25 }));
  });
  fadeAll(ends, N.total - 1.4, 0.8);
}
