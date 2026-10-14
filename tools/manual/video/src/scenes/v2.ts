// Second video: orbits. Data: orbits.json (two-body orbits of the engine of the application).
import type { Kit } from '../main';
import { Text } from '../text';
import { Tex } from '../tex';
import { Curve, Dot, Arrow, Poly } from '../shapes';
import { C, fadeIn, fadeOut, fadeAll, write, LiveText, ramp, arcPoints, titleCard, addSun, add3, scale3, unit3, cross3, fx } from '../lib';
import { ease, type Mob, type Vec3 } from '../core';
import { shot } from '../shots';

interface Conic { factor: number; speedKmS: number; e: number; aAu: number | null; points: number[][] }

export default async function build({ scene, N, data }: Kit): Promise<void> {
  const O = await data<any>('orbits');
  const cam = scene.camera;
  const conic = (f: number): Conic => O.conics.find((c: Conic) => Math.abs(c.factor - f) < 1e-3);
  const at = (pts: number[][], f: number): Vec3 => {
    const x = Math.max(0, Math.min(1, f)) * (pts.length - 1);
    const k = Math.min(pts.length - 2, Math.floor(x)), u = x - k;
    return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, (pts[k][2] ?? 0) + ((pts[k + 1][2] ?? 0) - (pts[k][2] ?? 0)) * u];
  };
  // Length of a velocity arrow: au for 1 km/s.
  const VS = 0.012;

  titleCard(scene, 'Orbits', 'Apsis  ·  video 2 of 4', N.at('gravity') - 0.7);

  // ---- Gravity, falling, the first orbit ------------------------------------------------------------------------
  cam.scale.initial = 380;
  const sun = addSun(scene, N.at('gravity'), 24);
  const start: Vec3 = [1, 0, 0];
  const part1: Mob[] = [];
  const craft0 = fadeIn(scene.add(new Dot(scene.defs, start, { style: 'craft', color: C.craft, radius: 11 }), 'front'), N.at('gravity', 0.4));
  const craftLabel = fadeIn(scene.add(new Text('spacecraft', 0, 52, { size: 30, color: C.craft, anchor: 'middle', at: start }), 'front'), N.at('gravity', 0.5));
  const pull = scene.add(new Arrow(start, [0.68, 0, 0], { color: C.red, width: 6 }), 'front');
  pull.hide(); pull.growIn(N.at('pull', 0.2), 0.8);
  const pullLabel = fadeIn(scene.add(new Text('gravity', 0, -26, { size: 30, color: C.red, anchor: 'middle', at: [0.84, 0, 0] }), 'front'), N.at('pull', 0.4));
  part1.push(pullLabel);

  // Fall: a small speed to the side. The spacecraft moves on the orbit of the engine (equal time steps).
  const c025 = conic(0.25);
  const tf0 = N.at('fall', 0.3), tf1 = N.end('fall') + 0.6;
  const v025 = scene.add(new Arrow(start, [1, c025.speedKmS * VS, 0], { color: C.blue, width: 6 }), 'front');
  v025.hide(); v025.growIn(N.at('fall', 0.05), 0.6);
  const fallF = ramp(tf0 + 0.6, tf1, 0, 1);
  const trail025 = scene.add(new Curve(c025.points, { color: C.blue, width: 3 }));
  trail025.hide(); trail025.opacity.set(1, tf0 + 0.6);
  trail025.end.set(0, 0).to(1, tf0 + 0.6, tf1 - tf0 - 0.6, ease.linear);
  const fall = fadeIn(scene.add(new Dot(scene.defs, (t) => at(c025.points, fallF(t)), { style: 'craft', color: C.craft, radius: 11 }), 'front'), tf0 + 0.6, 0.01);
  craft0.opacity.to(0, tf0 + 0.6, 0.01);
  fadeOut(pull, tf0 + 0.3, 0.4); fadeOut(pullLabel, tf0 + 0.3, 0.4); fadeOut(v025, tf0 + 0.5, 0.3); fadeOut(craftLabel, tf0, 0.4);
  fadeOut(fall, N.at('orbit'), 0.4);
  trail025.opacity.to(0.25, N.at('orbit'), 0.6);
  trail025.opacity.to(0, N.at('circle'), 0.6);
  part1.push(trail025);

  // Orbit: the circular speed.
  const c1 = conic(1);
  const to0 = N.at('orbit', 0.25);
  const craft1 = fadeIn(scene.add(new Dot(scene.defs, (t) => at(c1.points, ramp(to0 + 0.8, to0 + 4.8)(t)), { style: 'craft', color: C.craft, radius: 11 }), 'front'), N.at('orbit'), 0.4);
  const v1 = scene.add(new Arrow(start, [1, c1.speedKmS * VS, 0], { color: C.blue, width: 6 }), 'front');
  v1.hide(); v1.growIn(N.at('orbit', 0.05), 0.6);
  const circle = scene.add(new Curve(c1.points, { color: C.blue, width: 3 }));
  circle.hide(); circle.create(to0 + 0.8, 4.0, ease.linear);
  fadeOut(v1, to0 + 0.7, 0.3);
  const circleSpeed = write(scene, `${fx(O.circularSpeedAt1AuKmS, 1)} km/s`, 1490, 300, N.at('circle', 0.5), { size: 40, color: C.blue });
  const circleName = write(scene, 'circle', 1490, 350, N.at('circle', 0.7), { size: 32, color: C.dim });
  part1.push(craft1, circle, circleSpeed, circleName);

  // Ellipse: 1.2 times the circular speed.
  const c12 = conic(1.2);
  const te0 = N.at('ellipse');
  cam.scale.to(200, te0, 1.4);
  const craft12 = fadeIn(scene.add(new Dot(scene.defs, (t) => at(c12.points, ramp(te0 + 1.4, te0 + 5.4)(t)), { style: 'craft', color: C.craft, radius: 11 }), 'front'), te0 + 0.9, 0.3);
  craft1.opacity.to(0, te0 + 0.9, 0.3);
  const v12 = scene.add(new Arrow(start, [1, c12.speedKmS * VS, 0], { color: C.green, width: 6 }), 'front');
  v12.hide(); v12.growIn(te0 + 0.9, 0.5); fadeOut(v12, te0 + 1.6, 0.3);
  const ellipse = scene.add(new Curve(c12.points, { color: C.green, width: 3 }));
  ellipse.hide(); ellipse.create(te0 + 1.4, 4.0, ease.linear);
  circleSpeed.opacity.to(0.5, te0, 0.5); circleName.opacity.to(0.5, te0, 0.5);
  const ellSpeed = write(scene, `${fx(c12.speedKmS, 1)} km/s`, 1490, 420, te0 + 1.2, { size: 40, color: C.green });
  const ellName = write(scene, 'ellipse', 1490, 470, te0 + 1.4, { size: 32, color: C.dim });
  part1.push(craft12, ellipse, ellSpeed, ellName);

  // Escape: parabola (escape speed), then hyperbola. The parts of the curves after the start point.
  const startIndex = (c: Conic) => c.points.reduce((best, p, k) => (Math.hypot(p[0] - 1, p[1]) < Math.hypot(c.points[best][0] - 1, c.points[best][1]) ? k : best), 0);
  const cp = conic(Math.SQRT2), ch = conic(1.6);
  const fp = startIndex(cp) / (cp.points.length - 1), fh = startIndex(ch) / (ch.points.length - 1);
  const tx0 = N.at('escape');
  cam.scale.to(118, tx0, 1.4);
  const vp = scene.add(new Arrow(start, [1, cp.speedKmS * VS, 0], { color: C.yellow, width: 6 }), 'front');
  vp.hide(); vp.growIn(tx0 + 0.9, 0.5); fadeOut(vp, tx0 + 1.8, 0.3);
  craft12.opacity.to(0, tx0 + 0.9, 0.3);
  const parabola = scene.add(new Curve(cp.points, { color: C.yellow, width: 3 }));
  parabola.hide(); parabola.opacity.set(1, tx0 + 1.4);
  parabola.start.initial = fp; parabola.end.initial = fp; parabola.end.to(1, tx0 + 1.4, 3.0, ease.out);
  const craftP = fadeIn(scene.add(new Dot(scene.defs, (t) => at(cp.points, fp + (1 - fp) * ease.out(Math.max(0, Math.min(1, (t - tx0 - 1.4) / 3.0)))), { style: 'craft', color: C.craft, radius: 11 }), 'front'), tx0 + 0.9, 0.3);
  const parSpeed = write(scene, `${fx(O.escapeSpeedAt1AuKmS, 1)} km/s`, 1490, 540, tx0 + 1.2, { size: 40, color: C.yellow });
  const parName = write(scene, 'parabola', 1490, 590, tx0 + 1.4, { size: 32, color: C.dim });
  ellSpeed.opacity.to(0.5, tx0, 0.5); ellName.opacity.to(0.5, tx0, 0.5);
  part1.push(parabola, craftP, parSpeed, parName);

  // Conic sections: the hyperbola and the names.
  const tk0 = N.at('conics');
  const hyper = scene.add(new Curve(ch.points, { color: C.purple, width: 3 }));
  hyper.hide(); hyper.opacity.set(1, tk0);
  hyper.start.initial = fh; hyper.end.initial = fh; hyper.end.to(1, tk0, 2.4, ease.out);
  craftP.opacity.to(0, tk0, 0.4);
  const hypSpeed = write(scene, `${fx(ch.speedKmS, 1)} km/s`, 1490, 660, tk0 + 0.3, { size: 40, color: C.purple });
  const hypName = write(scene, 'hyperbola', 1490, 710, tk0 + 0.5, { size: 32, color: C.dim });
  for (const m of [circleSpeed, circleName, ellSpeed, ellName, parSpeed, parName]) m.opacity.to(1, tk0 + 1.5, 0.5);
  const eLabels = [['e = 0', 350, C.blue], [`e = ${fx(c12.e, 2)}`, 470, C.green], ['e = 1', 590, C.yellow], [`e = ${fx(ch.e, 2)}`, 710, C.purple]] as const;
  for (const [s, y, c] of eLabels) part1.push(write(scene, s, 1700, y, tk0 + 1.8, { size: 32, color: c }));
  part1.push(hyper, hypSpeed, hypName);
  const tEnd1 = N.at('focus') - 0.2;
  fadeAll(part1, tEnd1, 0.7);

  // ---- One ellipse: focus, apsides, axes ------------------------------------------------------------------------
  const K = O.kepler2;
  const a = K.aAu, e = K.e, ce = -a * e;
  // The ellipse is at the left of the screen: the right part is for the formulas.
  const t2 = N.at('focus');
  cam.scale.to(300, t2, 1.2);
  cam.center.to([ce + (960 - 640) / 300, 0, 0], t2, 1.2);
  const part2: Mob[] = [];
  const ell = scene.add(new Curve(K.orbit, { color: C.text, width: 3, closed: true }));
  ell.hide(); ell.create(t2 + 0.8, 2.0);
  const centerMark = fadeIn(scene.add(new Curve([[ce - 0.05, 0, 0], [ce + 0.05, 0, 0]], { color: C.dim, width: 3 })), N.at('focus', 0.45));
  const centerMark2 = fadeIn(scene.add(new Curve([[ce, -0.05, 0], [ce, 0.05, 0]], { color: C.dim, width: 3 })), N.at('focus', 0.45));
  const centerLabel = fadeIn(scene.add(new Text('center', 0, 46, { size: 30, color: C.dim, anchor: 'middle', at: [ce, 0, 0] }), 'front'), N.at('focus', 0.45));
  const focusLabel = fadeIn(scene.add(new Text('focus', 0, 62, { size: 30, color: C.sun, anchor: 'middle', at: [0, 0, 0] }), 'front'), N.at('focus', 0.8));
  part2.push(ell, centerMark, centerMark2, centerLabel);
  const peri: Vec3 = [a * (1 - e), 0, 0], apo: Vec3 = [-a * (1 + e), 0, 0];
  const periDot = fadeIn(scene.add(new Dot(scene.defs, peri, { style: 'plain', color: C.green, radius: 10 }), 'front'), N.at('apsides', 0.1));
  const periLabel = fadeIn(scene.add(new Text('periapsis', 0, -28, { size: 32, color: C.green, anchor: 'middle', at: peri }), 'front'), N.at('apsides', 0.15));
  const apoDot = fadeIn(scene.add(new Dot(scene.defs, apo, { style: 'plain', color: C.purple, radius: 10 }), 'front'), N.at('apsides', 0.55));
  const apoLabel = fadeIn(scene.add(new Text('apoapsis', 0, -28, { size: 32, color: C.purple, anchor: 'middle', at: apo }), 'front'), N.at('apsides', 0.6));
  for (const d of [periDot, apoDot]) d.radius.to(15, N.at('name', 0.1), 0.6, ease.pulse);
  const word = write(scene, 'apsis', 1500, 500, N.at('name', 0.15), { size: 96, weight: 600, anchor: 'middle', color: C.yellow });
  const word2 = write(scene, 'one point: apsis   two points: apsides', 1500, 580, N.at('name', 0.4), { size: 28, color: C.dim, anchor: 'middle' });
  fadeOut(word, N.at('axis') - 0.1, 0.5); fadeOut(word2, N.at('axis') - 0.1, 0.5);
  fadeOut(focusLabel, N.at('axis') - 0.1, 0.5); fadeOut(centerLabel, N.at('axis') - 0.1, 0.5);
  // Major axis and semi-major axis.
  const tA = N.at('axis');
  const major = scene.add(new Curve([apo, peri], { color: C.dim, width: 2.5, dash: '10 10' }));
  major.hide(); major.create(tA + 0.1, 1.0);
  const semi = scene.add(new Curve([[ce, 0.16, 0], [peri[0], 0.16, 0]], { color: C.teal, width: 5 }), 'front');
  semi.hide(); semi.create(tA + 0.8, 0.9);
  const semiLabel = fadeIn(scene.add(new Text('a', 0, -16, { size: 40, color: C.teal, anchor: 'middle', at: [(ce + peri[0]) / 2, 0.16, 0] }), 'front'), tA + 1.2);
  const aTex = scene.add(await Tex.make(`a = ${fx(a, 1)}\\ \\mathrm{au}`, 1500, 470, { size: 56, color: C.teal }), 'ui');
  aTex.hide(); aTex.show(tA + 1.3, 1.0);
  const eTex = scene.add(await Tex.make(`e = ${fx(e, 2)}`, 1500, 570, { size: 56, color: C.text }), 'ui');
  eTex.hide(); eTex.show(N.at('axis', 0.6), 1.0);
  part2.push(major);
  const tS = N.at('speed');
  fadeAll([major, semi, semiLabel, aTex, eTex], tS - 0.1, 0.6);

  // Equal times: sixteen positions, then the sectors.
  const samples: Dot[] = [];
  for (let k = 0; k < 16; k++) {
    const d = scene.add(new Dot(scene.defs, K.samples[k].position as Vec3, { style: 'plain', color: C.craft, radius: 7 }), 'front');
    fadeIn(d, N.at('samples', 0.1) + k * 0.16, 0.25);
    samples.push(d);
  }
  const sectors: Poly[] = [];
  const per = (K.orbit.length - 1) / 16;
  for (let k = 0; k < 16; k++) {
    const pts = [[0, 0, 0], ...K.orbit.slice(Math.round(k * per), Math.round((k + 1) * per) + 1)];
    const p = scene.add(new Poly(pts, { color: k % 2 ? C.teal : C.blue, fillOpacity: 0.33 }), 'back');
    fadeIn(p, N.at('kepler', 0.05) + k * 0.12, 0.3);
    sectors.push(p);
  }
  const tK = N.at('kepler');
  for (let k = 0; k < 16; k++) if (k !== 0 && k !== 8) sectors[k].opacity.to(0.25, tK + 3.2, 0.6);
  const areaL = write(scene, 'equal areas', 1500, 430, tK + 3.4, { size: 40, color: C.text, anchor: 'middle' });
  const area0 = write(scene, `${fx(K.sectorAreasAu2[0], 3)} au²`, 1500, 500, tK + 3.8, { size: 36, color: C.blue, anchor: 'middle' });
  const area8 = write(scene, `${fx(K.sectorAreasAu2[8], 3)} au²`, 1500, 560, tK + 4.1, { size: 36, color: C.blue, anchor: 'middle' });
  const kepName = write(scene, 'second law of Kepler', 1500, 640, N.at('kepler', 0.6), { size: 30, color: C.dim, anchor: 'middle' });
  const tF = N.at('fastslow');
  fadeAll([areaL, area0, area8, kepName], tF - 0.1, 0.5);
  for (const s of sectors) s.opacity.to(0, tF, 0.6);
  for (const d of samples) d.opacity.to(0.35, tF, 0.6);
  // One period: the spacecraft moves with the time of the samples (fast near the periapsis).
  const tRun0 = tF + 0.4, tRun1 = N.at('visviva') - 0.2;
  const runF = ramp(tRun0, tRun1, 0, 1);
  const craftK = fadeIn(scene.add(new Dot(scene.defs, (t) => at(K.orbit, runF(t)), { style: 'craft', color: C.craft, radius: 12 }), 'front'), tF, 0.4);
  const speedAt = (f: number) => { const x = Math.max(0, Math.min(1, f)) * (K.orbitSpeedsKmS.length - 1); const k = Math.min(K.orbitSpeedsKmS.length - 2, Math.floor(x)); return K.orbitSpeedsKmS[k] + (K.orbitSpeedsKmS[k + 1] - K.orbitSpeedsKmS[k]) * (x - k); };
  const speedText = fadeIn(scene.add(new LiveText((t) => `${fx(speedAt(runF(t)), 1)} km/s`, 0, -30, { size: 34, color: C.craft, anchor: 'middle', at: (t) => at(K.orbit, runF(t)) }), 'front'), tF + 0.2, 0.4);
  fadeOut(speedText, N.at('visviva'), 0.4);

  // ---- The vis-viva equation ------------------------------------------------------------------------------------
  const tV = N.at('visviva');
  const eq = scene.add(await Tex.make('v = \\sqrt{\\class{mu}{\\mu}\\left(\\frac{2}{\\class{r}{r}} - \\frac{1}{\\class{a}{a}}\\right)}', 1500, 300, { size: 64 }), 'ui');
  eq.hide(); eq.show(tV + 0.2, 1.6);
  const tT = N.at('terms');
  eq.partColor('mu', C.text).to(C.sun, tT, 0.5);
  eq.partColor('r', C.text).to(C.blue, N.at('terms', 0.35), 0.5);
  eq.partColor('a', C.text).to(C.teal, N.at('terms', 0.75), 0.5);
  const tMu = write(scene, 'μ  gravitational parameter of the Sun', 1240, 470, tT + 0.2, { size: 28, color: C.sun });
  const tR = write(scene, 'r  distance from the Sun', 1240, 520, N.at('terms', 0.4), { size: 28, color: C.blue });
  const tAx = write(scene, 'a  semi-major axis', 1240, 570, N.at('terms', 0.8), { size: 28, color: C.teal });
  // The distance r: a line from the Sun to the spacecraft.
  const rLine = scene.add(new Curve([[0, 0, 0], [0, 0, 0]], { color: C.blue, width: 4 }));
  rLine.setPoints((t) => [[0, 0, 0], at(K.orbit, runF2(t))]);
  const tC = N.at('check'), tCa = N.at('checkapo');
  const runF2 = (t: number) => (t < tCa + 0.3 ? 0 : ramp(tCa + 0.3, tCa + 2.6, 0, 0.5, ease.smooth)(t));
  craftK.opacity.to(0, tV, 0.01);
  const craftK2 = fadeIn(scene.add(new Dot(scene.defs, (t) => at(K.orbit, runF2(t)), { style: 'craft', color: C.craft, radius: 12 }), 'front'), tV, 0.01);
  fadeIn(rLine, N.at('terms', 0.4), 0.5);
  const rows1 = [
    write(scene, `r = ${fx(K.samples[0].distanceAu, 2)} au`, 1240, 690, tC + 0.6, { size: 36, color: C.blue }),
    write(scene, `v = ${fx(K.samples[0].speedKmS, 1)} km/s`, 1240, 750, tC + 1.2, { size: 36, color: C.craft }),
  ];
  fadeAll(rows1, tCa + 0.2, 0.4);
  const apoSample = K.samples[8];
  const rows2 = [
    write(scene, `r = ${fx(apoSample.distanceAu, 2)} au`, 1240, 690, tCa + 1.6, { size: 36, color: C.blue }),
    write(scene, `v = ${fx(apoSample.speedKmS, 1)} km/s`, 1240, 750, tCa + 2.2, { size: 36, color: C.craft }),
  ];
  const tTilt = N.at('tilt');
  fadeAll([eq, tMu, tR, tAx, rLine, craftK2, ...rows2, ...samples, ell, periDot, periLabel, apoDot, apoLabel, centerMark, centerMark2], tTilt - 0.2, 0.6);

  // ---- Orientation in three dimensions --------------------------------------------------------------------------
  const E3 = O.elements;
  cam.center.to([0, 0, 0], tTilt + 0.2, 2.0);
  cam.scale.to(250, tTilt + 0.2, 2.0);
  cam.pitch.to(64, tTilt + 0.2, 2.4);
  cam.yaw.to(-28, tTilt + 0.2, 2.4);
  cam.yaw.to(-8, N.at('incl'), N.end('six') - N.at('incl'), ease.smooth);
  // Reference plane: a grid in the plane z = 0, and the reference direction (+x).
  const grid: Curve[] = [];
  for (let k = -5; k <= 5; k++) {
    const g1 = scene.add(new Curve([[k * 0.5, -2.5, 0], [k * 0.5, 2.5, 0]], { color: C.grid, width: 1.5 }), 'back');
    const g2 = scene.add(new Curve([[-2.5, k * 0.5, 0], [2.5, k * 0.5, 0]], { color: C.grid, width: 1.5 }), 'back');
    fadeIn(g1, tTilt + 0.6 + Math.abs(k) * 0.05, 0.6); fadeIn(g2, tTilt + 0.6 + Math.abs(k) * 0.05, 0.6);
    grid.push(g1, g2);
  }
  const xAxis = scene.add(new Arrow([0, 0, 0], [2.7, 0, 0], { color: C.dim, width: 4 }), 'front');
  xAxis.hide(); xAxis.growIn(tTilt + 1.4, 0.8);
  const xLabel = fadeIn(scene.add(new Text('reference direction', 0, 40, { size: 26, color: C.dim, anchor: 'middle', at: [2.4, 0, 0] }), 'front'), tTilt + 1.8);
  const planeLabel = fadeIn(scene.add(new Text('reference plane', 0, 0, { size: 26, color: C.dim, anchor: 'middle', at: [-1.6, 2.1, 0] }), 'front'), tTilt + 2.0);
  const orbit3 = scene.add(new Curve(E3.orbit, { color: C.purple, width: 3.5, closed: true }));
  orbit3.hide(); orbit3.create(N.at('tilt', 0.55), 2.0);
  // Unit vectors: node direction n, orbit normal h, in-plane perpendicular m = h x n.
  const n = unit3(E3.ascendingNode);
  const h = unit3(cross3(E3.periapsis, E3.position));
  const m = cross3(h, n);
  const zn = cross3([0, 0, 1], n);
  // Inclination: the orbit plane and the angle between the planes at the ascending node.
  const tI = N.at('incl');
  const plane = scene.add(new Poly(E3.orbit, { color: C.purple, fillOpacity: 0.13 }), 'back');
  fadeIn(plane, tI, 0.8);
  const node = E3.ascendingNode as Vec3;
  const iArc = scene.add(new Curve(arcPoints(node, zn, m, 0.55, 0, E3.iDeg), { color: C.yellow, width: 4 }), 'front');
  iArc.hide(); iArc.create(N.at('incl', 0.45), 0.8);
  const iRef = scene.add(new Curve([node, add3(node, scale3(zn, 0.75))], { color: C.dim, width: 2.5, dash: '8 8' }), 'front');
  const iOrb = scene.add(new Curve([node, add3(node, scale3(m, 0.75))], { color: C.purple, width: 2.5, dash: '8 8' }), 'front');
  fadeIn(iRef, N.at('incl', 0.4)); fadeIn(iOrb, N.at('incl', 0.4));
  const iLabel = fadeIn(scene.add(new Text(`i = ${E3.iDeg}°`, 0, 0, { size: 34, color: C.yellow, anchor: 'start', at: add3(node, add3(scale3(zn, 0.62), scale3(m, 0.3))) }), 'front'), N.at('incl', 0.6));
  // Ascending node and the angle Omega from the reference direction.
  const tN = N.at('node');
  const nodeDot = fadeIn(scene.add(new Dot(scene.defs, node, { style: 'plain', color: C.green, radius: 9 }), 'front'), tN + 0.2);
  const nodeLabel = fadeIn(scene.add(new Text('ascending node', 18, -16, { size: 28, color: C.green, anchor: 'start', at: node }), 'front'), tN + 0.4);
  const nodes = scene.add(new Curve([E3.descendingNode, node], { color: C.green, width: 2.5, dash: '10 8' }));
  nodes.hide(); nodes.create(tN + 0.8, 1.0);
  const omArc = scene.add(new Curve(arcPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], 0.9, 0, E3.raanDeg), { color: C.green, width: 4 }), 'front');
  omArc.hide(); omArc.create(N.at('node', 0.6), 0.8);
  const omText = fadeIn(scene.add(new Text(`Ω = ${E3.raanDeg}°`, 0, 0, { size: 34, color: C.green, anchor: 'start', at: arcPoints([0, 0, 0], [1, 0, 0], [0, 1, 0], 1.05, 0, E3.raanDeg / 2, 1)[1] }), 'front'), N.at('node', 0.7));
  // Argument of periapsis: in the orbit plane from the node to the periapsis.
  const tW = N.at('argp');
  const periDot3 = fadeIn(scene.add(new Dot(scene.defs, E3.periapsis as Vec3, { style: 'plain', color: C.yellow, radius: 9 }), 'front'), tW);
  for (const m of [iLabel, iRef, iOrb]) m.opacity.to(0, tW - 0.1, 0.5);
  iArc.opacity.to(0.4, tW - 0.1, 0.5);
  const periLabel3 = fadeIn(scene.add(new Text('periapsis', -16, -14, { size: 28, color: C.yellow, anchor: 'end', at: E3.periapsis as Vec3 }), 'front'), tW + 0.2);
  const wArc = scene.add(new Curve(arcPoints([0, 0, 0], n, m, 0.6, 0, E3.argpDeg), { color: C.teal, width: 4 }), 'front');
  wArc.hide(); wArc.create(tW + 0.5, 0.8);
  const periLine = scene.add(new Curve([[0, 0, 0], E3.periapsis], { color: C.yellow, width: 2.5, dash: '8 8' }));
  fadeIn(periLine, tW + 0.3);
  const wText = fadeIn(scene.add(new Text(`ω = ${E3.argpDeg}°`, 0, 0, { size: 34, color: C.teal, anchor: 'start', at: arcPoints([0, 0, 0], n, m, 0.72, 0, E3.argpDeg / 2, 1)[1] }), 'front'), tW + 0.9);
  // True anomaly: from the periapsis to the position.
  const tNu = N.at('anomaly');
  const pDir = unit3(E3.periapsis), qDir = cross3(h, pDir);
  const nuArc = scene.add(new Curve(arcPoints([0, 0, 0], pDir, qDir, 0.42, 0, E3.nuDeg), { color: C.craft, width: 4 }), 'front');
  nuArc.hide(); nuArc.create(tNu + 0.6, 0.9);
  const posLine = scene.add(new Curve([[0, 0, 0], E3.position], { color: C.craft, width: 2.5, dash: '8 8' }));
  fadeIn(posLine, tNu + 0.3);
  const craft3 = fadeIn(scene.add(new Dot(scene.defs, E3.position as Vec3, { style: 'craft', color: C.craft, radius: 12 }), 'front'), tNu + 0.1);
  const nuText = fadeIn(scene.add(new Text(`ν = ${E3.nuDeg}°`, -12, 10, { size: 34, color: C.craft, anchor: 'end', at: arcPoints([0, 0, 0], pDir, qDir, 0.48, 0, E3.nuDeg / 2, 1)[1] }), 'front'), tNu + 1.0);
  // The six elements.
  const tSix = N.at('six');
  cam.screen.to([780, 560, 0], tSix - 0.3, 1.0);
  const list = [
    [`a = ${fx(E3.aAu, 1)}\\ \\mathrm{au}`, C.text], [`e = ${fx(E3.e, 2)}`, C.text], [`i = ${E3.iDeg}^\\circ`, C.yellow],
    [`\\Omega = ${E3.raanDeg}^\\circ`, C.green], [`\\omega = ${E3.argpDeg}^\\circ`, C.teal], [`\\nu = ${E3.nuDeg}^\\circ`, C.craft],
  ] as const;
  const six: Mob[] = [];
  for (const [k, [src, col]] of list.entries()) {
    const tx = scene.add(await Tex.make(src, 1560, 250 + k * 92, { size: 52, color: col, anchor: 'start' }), 'ui');
    tx.hide(); tx.show(tSix + 0.2 + k * 0.25, 0.8);
    six.push(tx);
  }
  const sixTitle = write(scene, 'orbit elements', 1560, 180, tSix, { size: 32, color: C.dim });
  six.push(sixTitle);
  const tP = N.at('perturb');
  fadeAll([...grid, xAxis, xLabel, planeLabel, orbit3, plane, iArc, iRef, iOrb, iLabel, nodeDot, nodeLabel, nodes, omArc, omText, periDot3, periLabel3, wArc, periLine, wText, nuArc, posLine, craft3, nuText, ...six], tP - 0.2, 0.6);
  sun.opacity.to(0, tP - 0.2, 0.6);

  // ---- Other forces and the Propagation screen ------------------------------------------------------------------
  const forces = [
    ['gravity of the Sun', C.sun], ['gravity of the 8 planets', C.blue], ['gravity of the Moon and Pluto', C.text],
    ['gravity of Ceres, Vesta and Psyche', C.text], ['flattening of the planets (J2)', C.teal], ['general relativity', C.purple],
  ] as const;
  write(scene, 'forces in the full model of Apsis', 120, 230, tP + 0.3, { size: 36, weight: 600 });
  forces.forEach(([s, c], k) => {
    const dot = scene.add(new Dot(scene.defs, [140, 314 + k * 70, 0], { space: 'screen', style: 'plain', color: c, radius: 9 }), 'ui');
    fadeIn(dot, tP + 0.6 + k * 0.3, 0.3);
    write(scene, s, 170, 325 + k * 70, tP + 0.6 + k * 0.3, { size: 32, color: C.text });
  });
  // The Propagation screen is a long page: the window shows the comparison of the force models.
  const pic = await shot(scene, 'expert-propagation-earth', 840, 170, 980);
  const box = pic.info.boxes.compare;
  pic.picture.h.initial = 680;
  pic.picture.winW.initial = 2700;
  pic.picture.win.initial = [180, box[1] - 330, 0];
  fadeIn(pic.picture, N.at('apsis'), 0.8);
  pic.picture.x.set(900, 0).to(840, N.at('apsis'), 0.8);
  pic.picture.win.to([180, box[1] + 120, 0], N.at('apsis', 0.5), N.end('apsis') + 2 - N.at('apsis', 0.5));
}
