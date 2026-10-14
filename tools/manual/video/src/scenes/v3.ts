// Third video: transfers and launch windows. Data: mars.json (Lambert arcs from one launch date, the C3 map of the
// launch dates and arrival dates, the line of the transfer angle of 180 degrees, the lowest C3 of each launch date
// from 2026 to 2035) and planets.json.
import type { Kit } from '../main';
import { Tex } from '../tex';
import { Curve, Dot, Arrow, Picture } from '../shapes';
import {
  C, fadeIn, fadeOut, fadeAll, write, ramp, titleCard, addSun, planetAt, Axes, loadValues, card, utcMs, Segments,
  scale3, add3, type PlanetData,
} from '../lib';
import { Text } from '../text';
import { ease, type Mob, type Vec3 } from '../core';
import { shot } from '../shots';

interface Arc { tofDays: number; arrUtc: string; c3: number; points: number[][]; earthVelocity: number[]; departureVelocity: number[]; marsAtArrival: number[] }
interface MarsData {
  grid: { nx: number; ny: number; depStartUtc: string; depEndUtc: string; arrStartUtc: string; arrEndUtc: string; depDays: number; arrDays: number; c3: (number | null)[] };
  line180: [number, number][];
  best: { depUtc: string; arrUtc: string; c3: number; tofDays: number; ix: number; iy: number };
  earthAtDeparture: number[]; departureUtc: string; arcs: Arc[];
  series: { depUtc: string; dayFromEpoch: number; minC3: number }[];
  windows: { depUtc: string; dayFromEpoch: number; minC3: number }[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Colors of the C3 map: bright for a low energy. Stops in C3 (km^2/s^2), interpolation in log(C3).
const STOPS: [number, string][] = [[9, '#fff6d8'], [12, '#ffd166'], [16, '#ffb454'], [22, '#ff7a6b'], [35, '#c75a8a'], [60, '#6b4a9e'], [120, '#2a3a6e'], [400, '#0e1426']];
function rgb(h: string): number[] { return [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); }
function colorOf(c3: number): number[] {
  const x = Math.log(Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], c3)));
  for (let k = 0; k + 1 < STOPS.length; k++) {
    const a = Math.log(STOPS[k][0]), b = Math.log(STOPS[k + 1][0]);
    if (x <= b) { const u = (x - a) / (b - a); const A = rgb(STOPS[k][1]), B = rgb(STOPS[k + 1][1]); return A.map((v, i) => v + (B[i] - v) * u); }
  }
  return rgb(STOPS[STOPS.length - 1][1]);
}

/** Contour segments of a grid (marching squares) in grid coordinates (i, j). */
function contours(f: (i: number, j: number) => number, nx: number, ny: number, level: number): [number[], number[]][] {
  const out: [number[], number[]][] = [];
  const cross = (i0: number, j0: number, i1: number, j1: number): number[] => {
    const a = f(i0, j0), b = f(i1, j1);
    const u = (level - a) / (b - a);
    return [i0 + (i1 - i0) * u, j0 + (j1 - j0) * u];
  };
  for (let i = 0; i + 1 < nx; i++) {
    for (let j = 0; j + 1 < ny; j++) {
      const v = [f(i, j), f(i + 1, j), f(i + 1, j + 1), f(i, j + 1)];
      const code = (v[0] > level ? 1 : 0) | (v[1] > level ? 2 : 0) | (v[2] > level ? 4 : 0) | (v[3] > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      // Edges: 0 bottom (i..i+1, j), 1 right (i+1, j..j+1), 2 top (i..i+1, j+1), 3 left (i, j..j+1).
      const e = [() => cross(i, j, i + 1, j), () => cross(i + 1, j, i + 1, j + 1), () => cross(i, j + 1, i + 1, j + 1), () => cross(i, j, i, j + 1)];
      const pairs: Record<number, number[][]> = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]],
        8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [1, 2]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]],
      };
      for (const [a, b] of pairs[code]) out.push([e[a](), e[b]()]);
    }
  }
  return out;
}

export default async function build({ scene, N, data }: Kit): Promise<void> {
  const M = await data<MarsData>('mars');
  const P = await data<PlanetData>('planets');
  const v = await loadValues(data);
  const cam = scene.camera;
  const best = M.arcs.reduce((a, b) => (Math.abs(b.tofDays - M.best.tofDays) < Math.abs(a.tofDays - M.best.tofDays) ? b : a));
  // Day of the launch from the epoch of planets.json (the daily positions of the planets).
  const depDay = (utcMs(M.departureUtc) - utcMs(P.epochUtc)) / 86400000;

  titleCard(scene, 'Transfers and launch windows', 'Apsis  ·  video 3 of 4', N.at('dates') - 0.6);

  // ---- Two dates, two positions --------------------------------------------------------------------------------
  const tD = N.at('dates');
  cam.scale.initial = 300;
  cam.center.initial = [0.75, 0, 0];
  const sun = addSun(scene, tD, 22);
  const earthOrbit = scene.add(new Curve(P.planets.find((p) => p.id === 'EARTH')!.orbit, { color: '#5b8fd6', width: 2.5, closed: true }), 'back');
  const marsOrbit = scene.add(new Curve(P.planets.find((p) => p.id === 'MARS')!.orbit, { color: '#c46a4a', width: 2.5, closed: true }), 'back');
  earthOrbit.hide(); earthOrbit.create(tD + 0.2, 1.4);
  marsOrbit.hide(); marsOrbit.create(tD + 0.5, 1.4);
  const dLaunch = write(scene, `launch date: ${v('depDate')}`, 1180, 200, N.at('dates', 0.5), { size: 36 });
  const dArrive = write(scene, `arrival date: ${v('arrDate')}`, 1180, 256, N.at('dates', 0.75), { size: 36 });
  // The planets move from the launch date to the arrival date during the line "end".
  const tMove0 = N.at('end', 0.05), tMove1 = N.end('end') + 0.3;
  const pDay = ramp(tMove0, tMove1, depDay, depDay + M.best.tofDays, ease.smooth);
  const earth = fadeIn(scene.add(new Dot(scene.defs, (t) => planetAt(P, 'EARTH', pDay(t)), { color: '#5b8fd6', radius: 12 })), N.at('start'), 0.4);
  const mars = fadeIn(scene.add(new Dot(scene.defs, (t) => planetAt(P, 'MARS', pDay(t)), { color: '#c46a4a', radius: 11 })), N.at('start'), 0.4);
  const eLab = fadeIn(scene.add(new Text0('Earth', (t) => planetAt(P, 'EARTH', pDay(t)), C.blue)), N.at('start'), 0.4);
  // The name of Mars at the left of the planet: at the arrival, the ring of the end is around the planet.
  const mLab = fadeIn(scene.add(new Text0('Mars', (t) => planetAt(P, 'MARS', pDay(t)), C.red, [-30, 10], 'end')), N.at('start'), 0.4);
  const r1 = M.earthAtDeparture as Vec3, r2 = best.marsAtArrival as Vec3;
  const startRing = fadeIn(scene.add(new Dot(scene.defs, r1, { style: 'ring', color: C.craft, radius: 20 }), 'front'), N.at('start', 0.3), 0.4);
  const craft0 = fadeIn(scene.add(new Dot(scene.defs, r1, { style: 'craft', color: C.craft, radius: 11 }), 'front'), N.at('start', 0.35), 0.3);
  const startText = write(scene, 'start', 0, 56, N.at('start', 0.4), { size: 30, color: C.craft, anchor: 'middle', layer: 'front', at: r1 });
  const endRing = fadeIn(scene.add(new Dot(scene.defs, r2, { style: 'ring', color: C.craft, radius: 20 }), 'front'), tMove1 - 0.3, 0.4);
  const endText = write(scene, 'end', 0, 56, tMove1 - 0.2, { size: 30, color: C.craft, anchor: 'middle', layer: 'front', at: r2 });

  // ---- The transfer orbit (Lambert) ------------------------------------------------------------------------------
  const tL = N.at('lambert');
  const arcPt = (pts: number[][], f: number): Vec3 => { const x = Math.max(0, Math.min(1, f)) * (pts.length - 1); const k = Math.min(pts.length - 2, Math.floor(x)), u = x - k; return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u, pts[k][2] + (pts[k + 1][2] - pts[k][2]) * u]; };
  const fL = ramp(tL + 0.4, tL + 4.4, 0, 1, ease.smooth);
  const bestArc = scene.add(new Curve(best.points, { color: C.green, width: 4 }));
  bestArc.hide(); bestArc.opacity.set(1, tL + 0.4); bestArc.end.set(0, 0).to(1, tL + 0.4, 4.0, ease.smooth);
  craft0.opacity.to(0, tL + 0.4, 0.01);
  const craft = fadeIn(scene.add(new Dot(scene.defs, (t) => arcPt(best.points, fL(t)), { style: 'craft', color: C.craft, radius: 11 }), 'front'), tL + 0.4, 0.01);
  const one = write(scene, 'less than one revolution:', 1180, 400, N.at('lambert', 0.4), { size: 32, color: C.dim });
  const one2 = write(scene, 'one orbit only', 1180, 450, N.at('lambert', 0.55), { size: 36, color: C.green });
  // The problem of Lambert: the two positions and the time give the velocities.
  const tPr = N.at('problem');
  fadeAll([one, one2], tPr - 0.3, 0.4);
  const ar1 = scene.add(new Arrow([0, 0, 0], r1, { color: C.blue, width: 4 }), 'front');
  ar1.hide(); ar1.growIn(tPr + 0.1, 0.6);
  const ar2 = scene.add(new Arrow([0, 0, 0], r2, { color: C.red, width: 4 }), 'front');
  ar2.hide(); ar2.growIn(tPr + 0.4, 0.6);
  const lr1 = scene.add(await Tex.make('\\mathbf{r}_1', 0, 0, { size: 44, color: C.blue }), 'front');
  lr1.hide(); lr1.show(tPr + 0.5, 0.6);
  const lr2 = scene.add(await Tex.make('\\mathbf{r}_2', 0, 0, { size: 44, color: C.red }), 'front');
  lr2.hide(); lr2.show(tPr + 0.8, 0.6);
  // Tex has no world position: put the labels at the screen points of the middle of the arrows (the camera does
  // not move in this part).
  cam.update(tPr);
  const mid1 = cam.project(scale3(r1, 0.5)), mid2 = cam.project(scale3(r2, 0.5));
  lr1.x.initial = mid1[0] - 30; lr1.y.initial = mid1[1] - 34;
  lr2.x.initial = mid2[0] - 30; lr2.y.initial = mid2[1] - 14;
  const lam = write(scene, 'problem of Lambert', 1180, 400, tPr + 0.2, { size: 44, weight: 600 });
  const io = scene.add(await Tex.make('\\mathbf{r}_1,\\ \\mathbf{r}_2,\\ \\Delta t\\ \\longrightarrow\\ \\mathbf{v}_1,\\ \\mathbf{v}_2', 1180, 500, { size: 46, anchor: 'start' }), 'ui');
  io.hide(); io.show(N.at('problem', 0.2), 1.4);
  const izzo = write(scene, 'method of Izzo (2015)', 1180, 580, N.at('problem', 0.6), { size: 32, color: C.dim });

  // ---- Other arrival dates --------------------------------------------------------------------------------------------
  const tFa = N.at('family');
  fadeAll([ar1, ar2, lr1, lr2, lam, io, izzo, startText, endText, endRing, craft], tFa - 0.3, 0.4);
  fadeAll([earth, mars, eLab, mLab], tFa - 0.3, 0.4);
  const level = (c3: number) => (c3 < 12 ? C.green : c3 < 25 ? C.yellow : C.red);
  const others = M.arcs.filter((a) => a !== best);
  const arcs: Mob[] = [];
  const rows: Mob[] = [];
  const order = [...M.arcs].sort((a, b) => a.tofDays - b.tofDays);
  others.forEach((a, k) => {
    const c = scene.add(new Curve(a.points, { color: level(a.c3), width: 3 }));
    c.hide(); c.create(tFa + 0.1 + k * 0.4, 1.2);
    const end = fadeIn(scene.add(new Dot(scene.defs, a.marsAtArrival as Vec3, { style: 'plain', color: level(a.c3), radius: 7 }), 'front'), tFa + 0.9 + k * 0.4, 0.3);
    arcs.push(c, end);
  });
  bestArc.stroke.to(level(best.c3), tFa, 0.4);
  const head = write(scene, 'flight time        C3', 1180, 330, tFa + 0.2, { size: 30, color: C.dim });
  order.forEach((a, k) => {
    const y = 390 + k * 56;
    rows.push(write(scene, `${a.tofDays} days`, 1180, y, N.at('energy', 0.05) + k * 0.25, { size: 34, color: level(a.c3) }));
    rows.push(write(scene, `${a.c3.toFixed(1)} km²/s²`, 1420, y, N.at('energy', 0.05) + k * 0.25, { size: 34, color: level(a.c3) }));
  });
  rows.push(head);

  // ---- The velocity at the departure --------------------------------------------------------------------------------
  const tDe = N.at('depart');
  fadeAll([...arcs, ...rows, startRing], tDe - 0.3, 0.4);
  bestArc.stroke.to(C.green, tDe - 0.3, 0.4);
  // Arrows on the map: 0.025 au for 1 km/s (projection on the plane of the ecliptic).
  const K = 0.025;
  const vE = best.earthVelocity as Vec3, vD = best.departureVelocity as Vec3;
  const tipE = add3(r1, scale3(vE, K)), tipD = add3(r1, scale3(vD, K));
  const earthAt = fadeIn(scene.add(new Dot(scene.defs, r1, { color: '#5b8fd6', radius: 12 })), tDe, 0.4);
  const aE = scene.add(new Arrow(r1, tipE, { color: C.blue, width: 6 }), 'front');
  aE.hide(); aE.growIn(N.at('depart', 0.35), 0.8);
  const lE = write(scene, `Earth: ${v('earthSpeed')} km/s`, 1180, 330, N.at('depart', 0.45), { size: 38, color: C.blue });
  const tTr = N.at('transfer');
  const aD = scene.add(new Arrow(r1, tipD, { color: C.craft, width: 6 }), 'front');
  aD.hide(); aD.growIn(tTr + 0.3, 0.8);
  const lD = write(scene, `transfer orbit: ${v('departureSpeed')} km/s`, 1180, 400, N.at('transfer', 0.5), { size: 38, color: C.craft });
  // v-infinity: a close view of the two arrow heads.
  const tV = N.at('vinf');
  const midTips = scale3(add3(tipE, tipD), 0.5);
  cam.center.to(midTips, tV, 1.6);
  cam.scale.to(2600, tV, 1.6);
  cam.screen.to([700, 560, 0], tV, 1.6);
  const aV = scene.add(new Arrow(tipE, tipD, { color: C.green, width: 7, tip: 26 }), 'front');
  aV.hide(); aV.growIn(tV + 1.7, 0.8);
  const lV = scene.add(await Tex.make(`v_\\infty = ${v('bestVinf')}\\ \\mathrm{km/s}`, 1180, 490, { size: 50, anchor: 'start', color: C.green }), 'ui');
  lV.hide(); lV.show(N.at('vinf', 0.45), 1.0);
  const lV2 = write(scene, 'the launch vehicle gives this', 1180, 545, N.at('vinf', 0.75), { size: 30, color: C.dim });
  const tC3 = N.at('c3');
  const c3 = scene.add(await Tex.make(`C_3 = v_\\infty^2 = ${v('bestC3')}\\ \\mathrm{km^2/s^2}`, 1180, 680, { size: 48, anchor: 'start', color: C.text }), 'ui');
  c3.hide(); c3.show(tC3 + 0.1, 1.2);

  // ---- The C3 map (porkchop plot) ------------------------------------------------------------------------------------
  const tMa = N.at('many');
  fadeAll([sun, earthOrbit, marsOrbit, bestArc, earthAt, aE, aD, aV, lE, lD, lV, lV2, c3, dLaunch, dArrive], tMa - 0.2, 0.5);
  const G = M.grid;
  const c3At = (i: number, j: number) => G.c3[j * G.nx + i] ?? 1e4;
  if (Math.abs(c3At(M.best.ix, M.best.iy) - M.best.c3) > 0.01) throw new Error('mars.json: the order of the cells is not the expected order.');
  const dep0 = G.depStartUtc, arr0 = G.arrStartUtc;
  const X = { x: 380, y: 120, w: 860, h: 760 };
  const monthTicks = (start: string, span: number, step: number) => {
    const out: { v: number; label: string }[] = [];
    const y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7));
    for (let k = 1; k < 40; k += step) {
      const y = y0 + Math.floor((m0 - 1 + k) / 12), m = (m0 - 1 + k) % 12;
      const d = (Date.UTC(y, m, 1) - Date.parse(start.slice(0, 10) + 'T00:00:00Z')) / 86400000;
      if (d > span) break;
      out.push({ v: d, label: MONTHS[m] });
    }
    return out;
  };
  const ax = new Axes(scene, {
    ...X, xRange: [0, G.depDays], yRange: [0, G.arrDays],
    xTicks: monthTicks(dep0, G.depDays, 1), yTicks: monthTicks(arr0, G.arrDays, 2),
    xTitle: `launch date (${dep0.slice(0, 4)} to ${G.depEndUtc.slice(0, 4)})`, yTitle: `arrival date (${arr0.slice(0, 4)} to ${G.arrEndUtc.slice(0, 4)})`,
  }).build(N.at('many', 0.4));
  // Grid point (i, j) -> screen.
  const gx = (i: number) => ax.sx((i / (G.nx - 1)) * G.depDays), gy = (j: number) => ax.sy((j / (G.ny - 1)) * G.arrDays);
  // The map: the C3 of the cells, interpolated (bilinear in log C3) to a picture of 4 pixels for each cell.
  // The picture has the size of the plot (one pixel for each pixel of the frame): the window of a Picture keeps the
  // ratio of the plot, thus a picture with a different ratio shows only a part of the map.
  const W = X.w, H = X.h;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const lg = (i: number, j: number) => Math.log(c3At(i, j));
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = ((px + 0.5) / W) * (G.nx - 1), w = (1 - (py + 0.5) / H) * (G.ny - 1);
      const i = Math.min(G.nx - 2, Math.floor(u)), j = Math.min(G.ny - 2, Math.floor(w)), a = u - i, b = w - j;
      const l = (1 - a) * (1 - b) * lg(i, j) + a * (1 - b) * lg(i + 1, j) + (1 - a) * b * lg(i, j + 1) + a * b * lg(i + 1, j + 1);
      const c = colorOf(Math.exp(l));
      const o = 4 * (py * W + px);
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = scene.add(new Picture(scene.defs, cv.toDataURL('image/png'), [W, H], X.x, X.y, X.w, { radius: 2 }), 'back');
  map.h.initial = X.h;
  map.winW.initial = W;
  // Reveal from the left: the width and the window grow together (the scale stays the same).
  const tAx = N.at('axes');
  const tR0 = tAx + 0.6, tR1 = N.at('axes', 0.85);
  map.opacity.initial = 0; map.opacity.set(1, tR0);
  map.w.set(1, 0).to(X.w, tR0, tR1 - tR0, ease.linear);
  map.winW.set(W / X.w, 0).to(W, tR0, tR1 - tR0, ease.linear);
  const scan = scene.add(new Curve([[0, 0], [0, 0]], { space: 'screen', color: C.text, width: 2 }), 'front');
  scan.setPoints((t) => { const x = X.x + map.w.at(t); return [[x, X.y], [x, X.y + X.h]]; });
  fadeIn(scan, tR0, 0.2); fadeOut(scan, tR1, 0.3);
  const each = write(scene, 'each point: one transfer', 1430, 200, N.at('axes', 0.1), { size: 34 });
  // A sample point: its C3 from the map.
  const si = 30, sj = 120;
  const sDot = fadeIn(scene.add(new Dot(scene.defs, [gx(si), gy(sj), 0], { space: 'screen', style: 'ring', color: C.text, radius: 12 }), 'front'), N.at('axes', 0.3), 0.3);
  const sLab = write(scene, `C3 = ${c3At(si, sj).toFixed(0)} km²/s²`, gx(si) + 24, gy(sj) - 16, N.at('axes', 0.35), { size: 28, layer: 'front' });
  fadeAll([sDot, sLab], N.at('porkchop'), 0.4);
  // Contour lines and the scale of the colors.
  const tPo = N.at('porkchop');
  const levels = [10, 12, 15, 20, 30, 50, 100];
  const lines: Mob[] = [];
  levels.forEach((L, k) => {
    const segs = contours(c3At, G.nx, G.ny, L).map(([a, b]) => [[gx(a[0]), gy(a[1])], [gx(b[0]), gy(b[1])]] as [number[], number[]]);
    const m = scene.add(new Segments(segs, { space: 'screen', color: '#0b1020', width: 1.6 }), 'world');
    fadeIn(m, tPo + 0.4 + k * 0.15, 0.5);
    lines.push(m);
  });
  const barX = 1300, barY = X.y, barH = X.h;
  const barC3 = (y: number) => Math.exp(Math.log(9) + ((barY + barH - y) / barH) * (Math.log(200) - Math.log(9)));
  const strips: Mob[] = [];
  for (let k = 0; k < 76; k++) {
    const y = barY + (k * barH) / 76;
    const c = colorOf(barC3(y + barH / 152));
    const hexc = '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
    const s = scene.add(new Curve([[barX, y], [barX + 34, y]], { space: 'screen', color: hexc, width: barH / 76 + 1, cap: 'butt' }), 'ui');
    fadeIn(s, tPo + 0.2, 0.6);
    strips.push(s);
  }
  const barTicks = [10, 20, 50, 100, 200].map((c) => {
    const y = barY + barH - ((Math.log(c) - Math.log(9)) / (Math.log(200) - Math.log(9))) * barH;
    return write(scene, String(c), barX + 50, y + 9, tPo + 0.6, { size: 24, color: C.dim });
  });
  const barTitle = write(scene, 'C3 (km²/s²)', barX, barY - 30, tPo + 0.6, { size: 28 });
  const bright = write(scene, 'bright: low energy', 1430, 330, N.at('porkchop', 0.15), { size: 34, color: C.yellow });
  const pork = write(scene, 'porkchop plot', 1430, 400, N.at('porkchop', 0.6), { size: 44, weight: 600 });
  fadeAll([each, bright], N.at('best') - 0.3, 0.4);
  pork.y.to(200, N.at('best') - 0.3, 0.6);

  // ---- The lowest C3 -----------------------------------------------------------------------------------------------
  const tBe = N.at('best');
  const bx = gx(M.best.ix), by = gy(M.best.iy);
  const bDot = fadeIn(scene.add(new Dot(scene.defs, [bx, by, 0], { space: 'screen', style: 'plain', color: C.green, radius: 10 }), 'front'), tBe + 0.2, 0.3);
  const bRing = fadeIn(scene.add(new Dot(scene.defs, [bx, by, 0], { space: 'screen', style: 'ring', color: C.green, radius: 24 }), 'front'), tBe + 0.3, 0.3);
  bRing.radius.to(34, tBe + 0.4, 1.0, ease.pulse);
  const b1 = write(scene, `C3 = ${v('bestC3')} km²/s²`, 1430, 330, N.at('best', 0.1), { size: 38, color: C.green });
  const b2 = write(scene, `launch: ${v('depDate')}`, 1430, 390, N.at('best', 0.45), { size: 32 });
  const b3 = write(scene, `flight: ${v('bestTof')} days`, 1430, 440, N.at('best', 0.75), { size: 32 });
  // The line of the transfer angle of 180 degrees.
  const tRi = N.at('ridge');
  fadeAll([b1, b2, b3], tRi - 0.3, 0.4);
  const ridge = scene.add(new Curve(M.line180.map(([i, j]) => [gx(i), gy(j)]), { space: 'screen', color: C.text, width: 4, dash: '14 10' }), 'front');
  ridge.hide(); ridge.create(tRi + 0.2, 1.6);
  const rLab = write(scene, 'transfer angle 180°', 1430, 330, N.at('ridge', 0.1), { size: 38 });
  const rLab2 = write(scene, 'large turn of the plane', 1430, 390, N.at('ridge', 0.45), { size: 32, color: C.dim });
  const rLab3 = write(scene, 'high energy', 1430, 440, N.at('ridge', 0.7), { size: 32, color: C.red });
  // Two parts: below the line (earlier arrival), the transfer angle is less than 180 degrees.
  const tTy = N.at('types');
  fadeAll([rLab, rLab2, rLab3], tTy - 0.3, 0.4);
  const typeA = card(scene, gx(100) - 210, gy(18) - 52, 420, 96, tTy + 0.2, { color: C.text });
  const typeAt = write(scene, 'less than half a revolution', gx(100), gy(18) + 10, tTy + 0.4, { size: 28, anchor: 'middle' });
  const typeB = card(scene, gx(45) - 210, gy(140) - 52, 420, 96, N.at('types', 0.45), { color: C.text });
  const typeBt = write(scene, 'more than half a revolution', gx(45), gy(140) + 10, N.at('types', 0.5), { size: 28, anchor: 'middle' });

  // ---- The launch windows repeat -----------------------------------------------------------------------------------
  const tRe = N.at('repeat');
  ax.fadeOut(tRe - 0.4, 0.5);
  fadeAll([map, ...lines, ...strips, ...barTicks, barTitle, pork, bDot, bRing, ridge, typeA, typeAt, typeB, typeBt], tRe - 0.4, 0.5);
  const S = M.series;
  const yearTicks = [];
  const y0 = Number(S[0].depUtc.slice(0, 4)), y1 = Number(S[S.length - 1].depUtc.slice(0, 4)) + 1;
  for (let y = y0; y <= y1; y += 2) yearTicks.push({ v: y, label: String(y) });
  const yr = (utc: string) => { const t = Date.parse(utc.slice(0, 10) + 'T00:00:00Z'); const y = new Date(t).getUTCFullYear(); return y + (t - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)); };
  // The range of the axis contains all the values of the series (no value is cut).
  const cMax = 1000;
  if (Math.max(...S.map((p) => p.minC3)) > cMax || Math.min(...S.map((p) => p.minC3)) < 5) throw new Error('mars.json: a value of the series is out of the axis.');
  const lgC = (c: number) => Math.log10(c);
  const ax2 = new Axes(scene, {
    x: 240, y: 230, w: 1440, h: 600, xRange: [y0, y1], yRange: [Math.log10(5), Math.log10(cMax)],
    xTicks: yearTicks, yTicks: [5, 10, 20, 50, 100, 200, 500, 1000].map((c) => ({ v: Math.log10(c), label: String(c) })),
    xTitle: 'launch date',
  }).build(tRe, { grid: true });
  // The title of the chart is above the row of the times between the windows (the lines of the windows go up to that row).
  const sTitle = write(scene, 'lowest C3 of each launch date (km²/s², logarithmic scale)', 240, 84, tRe + 0.6, { size: 30 });
  const series = scene.add(new Curve(S.map((p) => ax2.p(yr(p.depUtc), lgC(p.minC3))), { space: 'screen', color: C.craft, width: 3 }), 'front');
  series.hide(); series.create(tRe + 0.6, 3.0, ease.linear);
  const wins: Mob[] = [];
  // Each window: a line up to the row of the times between the windows (above the plot).
  const rowY = 165;
  M.windows.forEach((w, k) => {
    const p = ax2.p(yr(w.depUtc), lgC(w.minC3));
    wins.push(fadeIn(scene.add(new Dot(scene.defs, p, { space: 'screen', style: 'plain', color: C.green, radius: 10 }), 'front'), tRe + 0.9 + k * 0.55, 0.3));
    wins.push(write(scene, w.depUtc.slice(0, 7), p[0], p[1] + 46, N.at('series', 0.1) + k * 0.3, { size: 24, color: C.green, anchor: 'middle', layer: 'front' }));
    const up = scene.add(new Curve([[p[0], p[1] - 14], [p[0], rowY]], { space: 'screen', color: C.green, width: 2, dash: '6 8' }), 'back');
    up.hide(); up.create(N.at('repeat', 0.3) + k * 0.3, 0.6);
    wins.push(up);
    const next = M.windows[k + 1];
    if (next) {
      const q = ax2.p(yr(next.depUtc), lgC(next.minC3));
      const br = scene.add(new Arrow([p[0] + 4, rowY, 0], [q[0] - 4, rowY, 0], { space: 'screen', color: C.text, width: 2.5, tip: 14 }), 'front');
      br.hide(); br.growIn(N.at('repeat', 0.4) + k * 0.4, 0.6);
      const months = Math.round((utcMs(next.depUtc) - utcMs(w.depUtc)) / 86400000 / 30.4375);
      wins.push(br, write(scene, `${months} months`, (p[0] + q[0]) / 2, rowY - 16, N.at('repeat', 0.45) + k * 0.4, { size: 26, color: C.text, anchor: 'middle', layer: 'front' }));
    }
  });

  // ---- The two screens -----------------------------------------------------------------------------------------------
  const tSc = N.at('screens');
  ax2.fadeOut(tSc - 0.4, 0.5);
  fadeAll([series, sTitle, ...wins], tSc - 0.4, 0.5);
  const tr = await shot(scene, 'expert-transfer', 90, 230, 860);
  tr.picture.h.initial = 620; tr.picture.winW.initial = 2880;
  fadeIn(tr.picture, tSc, 0.6);
  const wn = await shot(scene, 'expert-windows', 970, 230, 860);
  wn.picture.h.initial = 620; wn.picture.winW.initial = 2880;
  fadeIn(wn.picture, N.at('screens', 0.45), 0.6);
  const tl1 = write(scene, 'Transfer: one pair of dates', 520, 180, tSc + 0.2, { size: 34, anchor: 'middle' });
  const tl2 = write(scene, 'Launch windows: the full map', 1400, 180, N.at('screens', 0.5), { size: 34, anchor: 'middle' });
  fadeAll([tr.picture, wn.picture, tl1, tl2], N.total - 1.4, 0.8);
}

/** A label that follows a moving world point (the name of a planet). */
class Text0 extends Text {
  constructor(s: string, at: (t: number) => Vec3, c: string, d: [number, number] = [0, -22], anchor: 'start' | 'middle' | 'end' = 'middle') {
    super(s, d[0], d[1], { size: 28, color: c, anchor, at });
  }
}
