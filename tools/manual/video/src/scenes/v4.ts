// Fourth video: flybys. Data: voyager2.json (the flight of Voyager 2 that the engine calculates: samples every 5 days,
// the flybys, the Jupiter flyby in the plane of the flyby, two-body hyperbolas and turn angles at Jupiter, the
// correction maneuvers), accuracy.json (the measured differences to JPL Horizons) and planets.json (colors).
import type { Kit } from '../main';
import { Tex } from '../tex';
import { Curve, Dot, Arrow, Poly } from '../shapes';
import {
  C, fadeIn, fadeAll, write, ramp, titleCard, addSun, Axes, loadValues, LiveText, dayDate, yearOf, card, markBox,
  NAMES, type PlanetData,
} from '../lib';
import { Text } from '../text';
import { ease, type Mob, type Vec3 } from '../core';
import { shot } from '../shots';

interface Flyby { body: string; utc: string; dayFromStart: number; vinfKmS: number; turnDeg: number; speedBeforeKmS: number; speedAfterKmS: number; position: number[] }
interface V2Data {
  startUtc: string; endUtc: string; stepDays: number;
  samples: { t: number; p: number[]; speedKmS: number; rAu: number; escapeKmS: number }[];
  planets: Record<string, number[][]>; orbits: Record<string, number[][]>;
  flybys: Flyby[];
  jupiterClose: {
    periapsisRj: number; points: number[][]; vinfIn: number[]; vinfOut: number[]; vinfKmS: number;
    jupiterVelocity: number[]; jupiterVelocityOutOfPlaneKmS: number; helioIn: number[]; helioOut: number[];
  };
  hyperbolas: { rpRj: number; turnDeg: number; points: number[][] }[];
  turnCurve: [number, number][];
  corrections: { utc: string; dvMS: number; kind: string }[];
}
interface Row { id: string; value: number; limit?: number }

export default async function build({ scene, N, data }: Kit): Promise<void> {
  const D = await data<V2Data>('voyager2');
  const P = await data<PlanetData>('planets');
  const acc = await data<Row[]>('accuracy');
  const v = await loadValues(data);
  const cam = scene.camera;
  const colorOf = (id: string) => P.planets.find((p) => p.id === id)!.color;
  const S = D.samples;
  const lastDay = S[S.length - 1].t;
  const flyby = (body: string) => D.flybys.find((f) => f.body === body)!;

  titleCard(scene, 'Flybys', 'Apsis  ·  video 4 of 4', N.at('voyager') - 0.6);

  // ---- The flight of Voyager 2 (top view, au) ---------------------------------------------------------------------------------
  const tV = N.at('voyager');
  cam.center.initial = [0, 0, 0]; cam.scale.initial = 80; cam.screen.initial = [800, 540, 0];
  cam.scale.to(26, tV + 0.8, 5.0); cam.center.to([-1.75, -13, 0], tV + 0.8, 5.0);
  // The flight from the start to the end during the line "voyager" (the day of the flight at time t of the video).
  const tF0 = tV + 0.6, tF1 = N.end('voyager') + 0.6;
  const day = ramp(tF0, tF1, 0, lastDay, ease.smooth);
  const timeOfDay = (d: number) => { let a = tF0, b = tF1; for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (day(m) < d) a = m; else b = m; } return (a + b) / 2; };
  // Position on a list of samples every stepDays days (linear between two samples).
  const at = (list: number[][], d: number): Vec3 => {
    const x = Math.max(0, Math.min(list.length - 1.001, d / D.stepDays));
    const i = Math.floor(x), u = x - i, p = list[i], q = list[i + 1];
    return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
  };
  const sys: Mob[] = [addSun(scene, tV, 14)];
  ['EARTH', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'].forEach((id, k) => {
    const o = scene.add(new Curve(D.orbits[id], { color: colorOf(id), width: 2, closed: true }), 'back');
    o.hide(); o.create(tV + 0.1 * k, 1.4); o.opacity.to(0.5, tV + 0.1 * k + 1.4, 0.6);
    const pos = (t: number) => at(D.planets[id], day(t));
    const b = fadeIn(scene.add(new Dot(scene.defs, pos, { color: colorOf(id), radius: id === 'EARTH' ? 7 : 9 })), tV + 0.1 * k + 0.5, 0.5);
    // The name at the right of the planet (outside the rings of the flybys).
    const l = fadeIn(scene.add(new Text(NAMES[id], 26, 8, { size: 24, color: colorOf(id), anchor: 'start', at: pos }), 'front'), tV + 0.1 * k + 0.7, 0.5);
    // The name of the Earth goes when the view is far (the orbit of the Earth is then small).
    if (id === 'EARTH') l.opacity.to(0, tV + 2.2, 0.5);
    sys.push(o, b, l);
  });
  const sp = S.map((s) => s.p);
  const path = scene.add(new Curve(sp, { color: C.craft, width: 3 }));
  path.hide(); path.opacity.set(1, tF0); path.end.set(0, 0).to(1, tF0, tF1 - tF0, ease.smooth);
  const craft = fadeIn(scene.add(new Dot(scene.defs, (t) => at(sp, day(t)), { style: 'craft', color: C.craft, radius: 9 }), 'front'), tF0, 0.3);
  sys.push(path, craft);
  sys.push(write(scene, 'Voyager 2', 1400, 130, tV + 0.2, { size: 48, weight: 600 }));
  sys.push(fadeIn(scene.add(new LiveText((t) => dayDate(D.startUtc, Math.floor(day(t))), 1400, 185, { size: 32, color: C.dim }), 'ui'), tV + 0.4, 0.4));
  // A ring at each flyby when the spacecraft comes to it; the rings pulse during the line "how".
  D.flybys.forEach((f, k) => {
    const tf = timeOfDay(f.dayFromStart);
    const ring = fadeIn(scene.add(new Dot(scene.defs, f.position as Vec3, { style: 'ring', color: C.text, radius: 18 }), 'front'), tf - 0.1, 0.3);
    ring.radius.to(30, N.at('how', 0.05) + k * 0.45, 0.8, ease.pulse);
    sys.push(ring, write(scene, f.utc.slice(0, 4), -28, 8, tf, { size: 24, color: C.dim, anchor: 'end', layer: 'front', at: f.position as Vec3 }));
  });

  // ---- The Jupiter flyby relative to Jupiter (plane of the flyby; units: radius of Jupiter) -----------------------
  const tJ = N.at('jupiter');
  const jf = flyby('JUPITER');
  cam.center.to(jf.position as Vec3, tJ - 0.9, 0.8); cam.scale.to(150, tJ - 0.9, 0.8);
  fadeAll(sys, tJ - 0.9, 0.6);
  // x: toward the point of closest approach; y: the direction of the velocity at that point. 6 px for 1 radius.
  cam.center.set([0, 0, 0], tJ); cam.scale.set(6, tJ); cam.screen.set([560, 540, 0], tJ);
  const J = D.jupiterClose;
  const jupiter = fadeIn(scene.add(new Dot(scene.defs, [0, 0, 0], { color: colorOf('JUPITER'), radius: 6 })), tJ + 0.1, 0.5);
  const jLab = fadeIn(scene.add(new Text('Jupiter', -14, 8, { size: 26, color: colorOf('JUPITER'), anchor: 'end', at: [0, 0, 0] }), 'front'), tJ + 0.3, 0.5);
  const relJ = write(scene, 'relative to Jupiter', 1060, 200, tJ + 0.3, { size: 44, weight: 600 });
  const month = write(scene, v('jupiterMonth'), 1060, 255, tJ + 0.8, { size: 32, color: C.dim });
  // The part of the path in the view (|y| up to 96 radii; the view shows 90).
  const jp = J.points.filter((p) => Math.abs(p[1]) <= 96).map((p) => [p[0], p[1], 0]);
  const tP0 = tJ + 0.6, tP1 = N.at('hyperbola', 0.9);
  const jPath = scene.add(new Curve(jp, { color: C.craft, width: 3.5 }));
  jPath.hide(); jPath.opacity.set(1, tP0); jPath.end.set(0, 0).to(1, tP0, tP1 - tP0, ease.linear);
  // The samples have equal steps of time: the spacecraft is fast near Jupiter.
  const fP = ramp(tP0, tP1, 0, 1);
  const jCraft = fadeIn(scene.add(new Dot(scene.defs, (t) => jPath.pointAt(fP(t)), { style: 'craft', color: C.craft, radius: 9 }), 'front'), tP0, 0.3);
  const firstAt = (y: number) => jp.find((p) => p[1] >= y)!;
  const hp = firstAt(-45);
  const hyp = write(scene, 'hyperbola', 0, 0, N.at('hyperbola', 0.2), { size: 32, color: C.craft, layer: 'front', at: [hp[0] + 9, hp[1], 0] });
  // The speed at infinity before and after the flyby (the same length): arrows on the path, 3.6 radii for 1 km/s.
  const K1 = 3.6;
  const vin = J.vinfIn, vout = J.vinfOut;
  // The two arrows are symmetric: the tail of the first at y = -78, the head of the second at y = +78.
  const pIn = firstAt(-78), pOut = jp.find((p, k) => k > jp.length / 2 && p[1] >= 78 - K1 * vout[1])!;
  const aIn = scene.add(new Arrow([pIn[0], pIn[1], 0], [pIn[0] + K1 * vin[0], pIn[1] + K1 * vin[1], 0], { color: C.green, width: 6, tip: 22 }), 'front');
  aIn.hide(); aIn.growIn(N.at('same', 0.05), 0.7);
  const aOut = scene.add(new Arrow([pOut[0], pOut[1], 0], [pOut[0] + K1 * vout[0], pOut[1] + K1 * vout[1], 0], { color: C.green, width: 6, tip: 22 }), 'front');
  aOut.hide(); aOut.growIn(N.at('same', 0.55), 0.7);
  const speedText = `${v('jupiterVinf')} km/s`;
  const lIn = write(scene, speedText, 0, 0, N.at('same', 0.15), { size: 28, color: C.green, layer: 'front', at: [pIn[0] + K1 * vin[0] * 0.5 + 5, pIn[1] + K1 * vin[1] * 0.5 - 4, 0] });
  const lOut = write(scene, speedText, 0, 0, N.at('same', 0.65), { size: 28, color: C.green, layer: 'front', at: [pOut[0] + K1 * vout[0] * 0.5 + 5, pOut[1] + K1 * vout[1] * 0.5 + 4, 0] });
  const sRel = write(scene, 'speed relative to Jupiter', 1060, 350, N.at('same', 0.05), { size: 30, color: C.dim });
  const vTex = scene.add(await Tex.make(`v_\\infty = ${v('jupiterVinf')}\\ \\mathrm{km/s}`, 1060, 425, { size: 50, anchor: 'start', color: C.green }), 'ui');
  vTex.hide(); vTex.show(N.at('same', 0.12), 1.0);
  // Only the direction changes: the two velocities from one point, and the angle between them.
  const tTu = N.at('turn');
  const O2: [number, number] = [1420, 790], K2 = 22;
  const scr = (o: [number, number], k: number, w: number[]): Vec3 => [o[0] + k * w[0], o[1] - k * w[1], 0];
  const dIn = scene.add(new Arrow([O2[0], O2[1], 0], scr(O2, K2, vin), { space: 'screen', color: C.green, width: 6, tip: 22 }), 'front');
  dIn.hide(); dIn.growIn(tTu + 0.2, 0.6);
  const dOut = scene.add(new Arrow([O2[0], O2[1], 0], scr(O2, K2, vout), { space: 'screen', color: C.green, width: 6, tip: 22 }), 'front');
  dOut.hide(); dOut.growIn(tTu + 0.6, 0.6);
  const a0 = Math.atan2(vin[1], vin[0]), a1 = Math.atan2(vout[1], vout[0]);
  const arcPts = Array.from({ length: 49 }, (_, k) => { const a = a0 + ((a1 - a0) * k) / 48; return [O2[0] + 64 * Math.cos(a), O2[1] - 64 * Math.sin(a)]; });
  const turnArc = scene.add(new Curve(arcPts, { space: 'screen', color: C.yellow, width: 4 }), 'front');
  turnArc.hide(); turnArc.create(N.at('turn', 0.45), 0.8);
  const turnLab = write(scene, `${v('jupiterTurn')}°`, O2[0], O2[1] - 88, N.at('turn', 0.55), { size: 36, color: C.yellow, anchor: 'middle' });
  const tipA = scr(O2, K2, vin), tipB = scr(O2, K2, vout);
  const inLab = write(scene, 'before', tipA[0] + 14, tipA[1] - 8, tTu + 0.5, { size: 26, color: C.green });
  const outLab = write(scene, 'after', tipB[0] - 14, tipB[1] - 8, tTu + 0.9, { size: 26, color: C.green, anchor: 'end' });

  // ---- A nearer flyby gives a larger turn ---------------------------------------------------------------------------------------
  const tCl = N.at('closer');
  fadeAll([jPath, jCraft, hyp, aIn, aOut, lIn, lOut, relJ, month, sRel, vTex, dIn, dOut, turnArc, turnLab, inLab, outLab], tCl - 0.4, 0.5);
  const hColors = [C.red, C.craft, C.green, C.blue, C.purple];
  const hyps: Mob[] = [];
  D.hyperbolas.forEach((h, k) => {
    const c = scene.add(new Curve(h.points.map((p) => [p[0], p[1], 0]), { color: hColors[k], width: 3 }));
    c.hide(); c.create(tCl + 0.1 + k * 0.4, 1.0);
    hyps.push(c);
  });
  const nearer = write(scene, 'nearer to the planet: larger turn', 1060, 170, tCl + 0.2, { size: 36 });
  // The turn angle for each distance of closest approach (two-body formula of the engine, speed of Voyager 2).
  const tCu = N.at('curve');
  const lg = Math.log10;
  const ax = new Axes(scene, {
    x: 1120, y: 280, w: 660, h: 460, xRange: [0, lg(40)], yRange: [0, 160],
    xTicks: [1, 2, 5, 10, 20, 40].map((r) => ({ v: lg(r), label: String(r) })),
    yTicks: [0, 40, 80, 120, 160].map((d) => ({ v: d, label: `${d}°` })),
    xTitle: 'distance of closest approach (radii of Jupiter)', yTitle: 'turn angle',
  }).build(tCu);
  const tc = scene.add(new Curve(D.turnCurve.map(([r, d]) => ax.p(lg(r), d)), { space: 'screen', color: C.text, width: 3 }), 'front');
  tc.hide(); tc.create(tCu + 0.5, 1.6);
  const marks: Mob[] = [];
  D.hyperbolas.forEach((h, k) => {
    marks.push(fadeIn(scene.add(new Dot(scene.defs, ax.p(lg(h.rpRj), h.turnDeg), { space: 'screen', style: 'plain', color: hColors[k], radius: 9 }), 'front'), N.at('curve', 0.3) + k * 0.15, 0.3));
  });
  const vp = ax.p(lg(J.periapsisRj), flyby('JUPITER').turnDeg);
  const vRing = fadeIn(scene.add(new Dot(scene.defs, vp, { space: 'screen', style: 'ring', color: C.green, radius: 20 }), 'front'), N.at('curve', 0.65), 0.3);
  vRing.radius.to(28, N.at('curve', 0.7), 0.8, ease.pulse);
  const vLab = write(scene, `Voyager 2: ${v('jupiterRpRj')} radii`, vp[0] + 26, vp[1] - 26, N.at('curve', 0.7), { size: 28, color: C.green, layer: 'front' });

  // ---- The same flyby relative to the Sun: velocity of Jupiter plus the two velocities relative to Jupiter ------------
  const tSu = N.at('sun');
  ax.fadeOut(tSu - 0.4, 0.5);
  fadeAll([jupiter, jLab, ...hyps, nearer, tc, ...marks, vRing, vLab], tSu - 0.4, 0.5);
  const relS = write(scene, 'relative to the Sun', 120, 150, tSu + 0.1, { size: 44, weight: 600 });
  // Arrows in the plane of the flyby, 32 px for 1 km/s, from the point O (zero velocity).
  const O: [number, number] = [1250, 740], K = 32;
  const vJ = J.jupiterVelocity;
  const tipJ = scr(O, K, vJ);
  const tipIn = scr(O, K, J.helioIn), tipOut = scr(O, K, J.helioOut);
  const origin = fadeIn(scene.add(new Dot(scene.defs, [O[0], O[1], 0], { space: 'screen', style: 'plain', color: C.text, radius: 6 }), 'front'), tSu + 0.3, 0.3);
  const tAd = N.at('add');
  const aJ = scene.add(new Arrow([O[0], O[1], 0], tipJ, { space: 'screen', color: C.purple, width: 7, tip: 26 }), 'front');
  aJ.hide(); aJ.growIn(tAd + 0.1, 0.8);
  const leg1 = write(scene, `Jupiter: ${v('jupiterSpeed')} km/s`, 1330, 330, tAd + 0.3, { size: 34, color: C.purple });
  const ivIn = scene.add(new Arrow(tipJ, scr([tipJ[0], tipJ[1]], K, vin), { space: 'screen', color: C.green, width: 6, tip: 24 }), 'front');
  ivIn.hide(); ivIn.growIn(N.at('add', 0.55), 0.7);
  const ivOut = scene.add(new Arrow(tipJ, scr([tipJ[0], tipJ[1]], K, vout), { space: 'screen', color: C.green, width: 6, tip: 24 }), 'front');
  ivOut.hide(); ivOut.growIn(N.at('add', 0.62), 0.7);
  const leg2 = write(scene, `relative to Jupiter: ${v('jupiterVinf')} km/s`, 1330, 390, N.at('add', 0.6), { size: 34, color: C.green });
  // All the velocities with this speed relative to Jupiter end on this circle.
  const rC = K * Math.hypot(vin[0], vin[1]);
  const circ = scene.add(new Curve(Array.from({ length: 97 }, (_, k) => [tipJ[0] + rC * Math.cos((k / 96) * 2 * Math.PI), tipJ[1] + rC * Math.sin((k / 96) * 2 * Math.PI)]), { space: 'screen', color: C.green, width: 2, dash: '8 10' }), 'back');
  circ.hide(); circ.create(N.at('add', 0.8), 1.2);
  const tRe = N.at('result');
  const hIn = scene.add(new Arrow([O[0], O[1], 0], tipIn, { space: 'screen', color: C.blue, width: 7, tip: 26 }), 'front');
  hIn.hide(); hIn.growIn(tRe + 0.2, 0.8);
  const leg3 = write(scene, `before: ${v('helioIn')} km/s`, 1330, 470, tRe + 0.4, { size: 34, color: C.blue });
  const hOut = scene.add(new Arrow([O[0], O[1], 0], tipOut, { space: 'screen', color: C.craft, width: 7, tip: 26 }), 'front');
  hOut.hide(); hOut.growIn(N.at('result', 0.5), 0.8);
  const leg4 = write(scene, `after: ${v('helioOut')} km/s`, 1330, 530, N.at('result', 0.55), { size: 34, color: C.craft });
  const outOfPlane = Math.abs(J.jupiterVelocityOutOfPlaneKmS).toFixed(2);
  const note = write(scene, `The arrows show the velocities in the plane of the flyby. The speeds also include the motion\nof Jupiter perpendicular to this plane (${outOfPlane} km/s).`, 120, 1000, N.at('result', 0.8), { size: 24, color: C.dim, lineHeight: 1.4 });
  const tGa = N.at('gain');
  const leg5 = write(scene, 'The spacecraft gets speed.', 1330, 640, tGa + 0.2, { size: 30, color: C.craft });
  const leg6 = write(scene, 'Jupiter: a very small decrease', 1330, 690, N.at('gain', 0.55), { size: 30, color: C.purple });
  const tAs = N.at('assist');
  relS.opacity.to(0, tAs - 0.2, 0.4);
  const ga = write(scene, 'gravity assist', 120, 160, tAs + 0.1, { size: 64, weight: 600 });
  const np = write(scene, 'no propellant', 120, 230, N.at('assist', 0.55), { size: 38, color: C.green });

  // ---- Speed relative to the Sun during the full flight -----------------------------------------------------------------------
  const tFu = N.at('full');
  fadeAll([relS, origin, aJ, ivIn, ivOut, circ, hIn, hOut, leg1, leg2, leg3, leg4, leg5, leg6, note, ga, np], tFu - 0.4, 0.5);
  const yr = (d: number) => yearOf(D.startUtc, d);
  const ch = new Axes(scene, {
    x: 200, y: 200, w: 1480, h: 600, xRange: [1977.5, 1990], yRange: [0, 45],
    xTicks: [1978, 1980, 1982, 1984, 1986, 1988, 1990].map((y) => ({ v: y, label: String(y) })),
    yTicks: [0, 10, 20, 30, 40].map((s) => ({ v: s, label: String(s) })),
    yTitle: 'speed relative to the Sun (km/s)',
  }).build(tFu);
  const chart: Mob[] = [];
  const speed = scene.add(new Curve(S.map((s) => ch.p(yr(s.t), s.speedKmS)), { space: 'screen', color: C.craft, width: 3 }), 'front');
  speed.hide(); speed.create(tFu + 0.5, 2.6, ease.linear);
  chart.push(speed);
  // The flybys: a dashed line at each date and the name of the planet.
  D.flybys.forEach((f, k) => {
    const x = ch.sx(yearOf(f.utc));
    const l = scene.add(new Curve([[x, ch.sy(0)], [x, ch.sy(45)]], { space: 'screen', color: C.faint, width: 2, dash: '6 8' }), 'back');
    fadeIn(l, tFu + 0.8 + k * 0.5, 0.4);
    chart.push(l, write(scene, NAMES[f.body], x + 10, ch.sy(45) + 30, tFu + 0.8 + k * 0.5, { size: 24, color: colorOf(f.body) }));
  });
  // Legend.
  const legLine = scene.add(new Curve([[1240, 262], [1290, 262]], { space: 'screen', color: C.craft, width: 4 }), 'ui');
  fadeIn(legLine, tFu + 0.6, 0.4);
  chart.push(legLine, write(scene, 'Voyager 2', 1306, 271, tFu + 0.6, { size: 26 }));
  const tEs = N.at('escape');
  const esc = scene.add(new Curve(S.map((s) => ch.p(yr(s.t), s.escapeKmS)), { space: 'screen', color: C.red, width: 3, dash: '12 10' }), 'front');
  esc.hide(); esc.create(tEs + 0.2, 2.0, ease.linear);
  const legEsc = scene.add(new Curve([[1240, 307], [1290, 307]], { space: 'screen', color: C.red, width: 3, dash: '12 10' }), 'ui');
  fadeIn(legEsc, tEs + 0.2, 0.4);
  chart.push(esc, legEsc, write(scene, 'escape speed from the solar system', 1306, 316, tEs + 0.3, { size: 26 }));
  // After Jupiter: faster than the escape speed (the area between the two curves).
  const tAf = N.at('after');
  const kJ = S.findIndex((s) => s.t > jf.dayFromStart && s.speedKmS > s.escapeKmS);
  if (S.slice(kJ).some((s) => s.speedKmS <= s.escapeKmS)) throw new Error('voyager2.json: the speed is not above the escape speed after Jupiter.');
  const after = S.slice(kJ);
  const area = scene.add(new Poly([...after.map((s) => ch.p(yr(s.t), s.speedKmS)), ...after.slice().reverse().map((s) => ch.p(yr(s.t), s.escapeKmS))], { space: 'screen', color: C.green, fillOpacity: 0.16 }), 'back');
  fadeIn(area, tAf + 0.2, 0.8);
  const faster = write(scene, 'faster than the escape speed', ch.sx(1983), ch.sy(29), tAf + 0.4, { size: 30, color: C.green });
  chart.push(area, faster);
  // Neptune: the speed before and after the flyby (20 days before and after the closest approach).
  const tNe = N.at('neptune');
  const nf = flyby('NEPTUNE');
  const pB = ch.p(yearOf(nf.utc) - 20 / 365.25, nf.speedBeforeKmS), pA = ch.p(yearOf(nf.utc) + 20 / 365.25, nf.speedAfterKmS);
  const dB = fadeIn(scene.add(new Dot(scene.defs, pB, { space: 'screen', style: 'plain', color: C.text, radius: 7 }), 'front'), tNe + 0.6, 0.3);
  const dA = fadeIn(scene.add(new Dot(scene.defs, pA, { space: 'screen', style: 'plain', color: C.text, radius: 7 }), 'front'), N.at('neptune', 0.25), 0.3);
  const lB = write(scene, `${v('neptuneBefore')} km/s`, pB[0] - 16, pB[1] - 20, tNe + 0.7, { size: 28, anchor: 'end', layer: 'front' });
  const lA = write(scene, `${v('neptuneAfter')} km/s`, ch.sx(1990) + 16, pA[1] + 10, N.at('neptune', 0.3), { size: 28, layer: 'front' });
  area.opacity.to(0.4, N.at('neptune', 0.6), 0.9, ease.pulse);
  chart.push(dB, dA, lB, lA);
  // The correction maneuvers of the flight of the engine.
  const tCo = N.at('corr');
  D.corrections.forEach((c, k) => {
    const x = ch.sx(yearOf(c.utc)), t0 = tCo + 0.3 + k * 0.4;
    chart.push(fadeIn(scene.add(new Dot(scene.defs, [x, ch.sy(0) - 22, 0], { space: 'screen', style: 'craft', color: C.yellow, radius: 9 }), 'front'), t0, 0.3));
    chart.push(write(scene, `${Math.round(c.dvMS)} m/s`, x + 16, ch.sy(0) - 14, t0 + 0.1, { size: 24, color: C.yellow, layer: 'front' }));
  });
  const legC = fadeIn(scene.add(new Dot(scene.defs, [1265, 352, 0], { space: 'screen', style: 'craft', color: C.yellow, radius: 9 }), 'ui'), N.at('corr', 0.45), 0.3);
  chart.push(legC, write(scene, `${v('correctionCount')} corrections: ${v('v2CorrectionsMs')} m/s in total`, 1306, 361, N.at('corr', 0.5), { size: 26, color: C.yellow }));

  // ---- Comparison with JPL Horizons -----------------------------------------------------------------------------------------
  const tAc = N.at('accuracy');
  ch.fadeOut(tAc - 0.4, 0.5);
  fadeAll(chart, tAc - 0.4, 0.5);
  const table: Mob[] = [];
  table.push(write(scene, 'Voyager 2: Apsis and JPL Horizons', 160, 160, tAc + 0.1, { size: 48, weight: 600 }));
  table.push(write(scene, 'difference of the values', 160, 215, tAc + 0.4, { size: 30, color: C.dim }));
  table.push(card(scene, 120, 270, 1680, 420, tAc + 0.3));
  const cols = [180, 640, 1260];
  ['flyby', 'distance of closest approach', 'speed at infinity'].forEach((h, k) => table.push(write(scene, h, cols[k], 340, tAc + 0.6 + k * 0.1, { size: 30, color: C.dim })));
  const bodies = ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'];
  const val = (id: string) => acc.find((r) => r.id === id);
  bodies.forEach((b, k) => {
    const y = 420 + k * 72, t0 = N.at('accuracy', 0.08) + k * 0.35;
    const peri = val(`famous.periapsis.voyager2.${k}.${b}`), vinf = val(`famous.vinf.voyager2.${k}.${b}`)!;
    table.push(write(scene, NAMES[b], cols[0], y, t0, { size: 36, color: colorOf(b) }));
    // The plan sets the distance of the last flyby (an input of the plan): no comparison.
    table.push(peri ? write(scene, `${peri.value.toFixed(3)} %`, cols[1], y, t0 + 0.1, { size: 36 }) : write(scene, 'input of the plan', cols[1], y, t0 + 0.1, { size: 30, color: C.dim }));
    table.push(write(scene, `${vinf.value.toFixed(3)} %`, cols[2], y, N.at('accuracy', 0.5) + k * 0.25, { size: 36 }));
  });
  const limP = val('famous.periapsis.voyager2.0.JUPITER')!.limit, limV = val('famous.vinf.voyager2.0.JUPITER')!.limit;
  table.push(write(scene, `Limits of the tests: ${limP} % for the distance, ${limV} % for the speed.`, 160, 770, N.at('accuracy', 0.8), { size: 28, color: C.dim }));

  // ---- The screens of the application ------------------------------------------------------------------------------------------
  const tSc = N.at('screens');
  fadeAll(table, tSc - 0.4, 0.5);
  const tour = await shot(scene, 'expert-tour', 160, 130, 1600);
  tour.picture.h.initial = 860;
  fadeIn(tour.picture, tSc, 0.6);
  const t1 = write(scene, 'Expert mode: Flyby tour', 160, 95, tSc + 0.2, { size: 34 });
  const m1 = markBox(scene, tour.picture, tour.info, 'sequence', N.at('screens', 0.4));
  const tFl = N.at('fly');
  fadeAll([tour.picture, t1, m1], tFl - 0.3, 0.4);
  const v2 = await shot(scene, 'explorer-voyager2', 240, 130, 1440);
  fadeIn(v2.picture, tFl, 0.6);
  const t2 = write(scene, 'Explorer mode: Voyager 2', 240, 95, tFl + 0.2, { size: 34 });
  const m2 = markBox(scene, v2.picture, v2.info, 'caption', N.at('fly', 0.4));
  fadeAll([v2.picture, t2, m2], N.total - 1.4, 0.8);
}
