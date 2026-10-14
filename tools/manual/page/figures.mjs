// Figures of the manual (SVG). Each figure uses only the data that tools/manual/data/manual-data.spec.ts writes:
// results of the engine of the application and the measured values of its automatic tests. No figure has a drawn path:
// each orbit, flight path and value comes from the data.
import { deflateSync } from 'node:zlib';
import {
  text, tag, path, parts, circle, line, arrow, rect, diamond, axes, svg, n1, esc,
  dateLabel, monthTicks, monthLabel, dayMs, parseDay, BODY, C,
} from './svg.mjs';

const L = (en, ja) => ({ en, ja });
const fx = (x, n) => x.toFixed(n);
const norm = (v) => Math.hypot(...v);
const unit = (v) => { const r = norm(v); return v.map((x) => x / r); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
const add = (a, b) => a.map((x, k) => x + b[k]);
const mul = (a, s) => a.map((x) => x * s);
const planetColor = (P, id) => P.planets.find((p) => p.id === id)?.color ?? '#cccccc';

/** Arc of radius r about the center c from the unit vector u to the unit vector v (angle less than 180 degrees). */
function arc3(c, u, v, r, n = 40) {
  const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = Math.sin((1 - t) * th) / Math.sin(th), b = Math.sin(t * th) / Math.sin(th);
    out.push(add(c, mul(add(mul(u, a), mul(v, b)), r)));
  }
  return out;
}

// ---- 1. The solar system on the date of the pictures -------------------------------------------------------------
export function solarSystem(P) {
  const W = 960, H = 510;
  const date = dateLabel(parseDay(P.epochUtc));
  const panel = (cx, ids, maxAu, title) => {
    const R = 200, s = R / maxAu;
    const X = (p) => cx + p[0] * s, Y = (p) => 250 - p[1] * s;
    let g = text(cx, 26, title, { size: 16, anchor: 'middle', weight: 600 });
    g += line(cx - R - 8, 250, cx + R + 8, 250, { stroke: 'var(--grid)', width: 1 }) + line(cx, 250 - R - 8, cx, 250 + R + 8, { stroke: 'var(--grid)', width: 1 });
    g += arrow(cx + R + 2, 250, cx + R + 22, 250, { stroke: 'var(--dim)', width: 1.5, head: 8 }) + text(cx + R + 18, 238, 'X', { size: 12, fill: 'var(--dim)', anchor: 'middle' });
    for (const id of ids) {
      const p = P.planets.find((q) => q.id === id);
      g += path(p.orbit.map((q) => [X(q), Y(q)]), { stroke: p.color, width: 1.4, opacity: 0.55, close: true });
    }
    g += circle(cx, 250, 6, { fill: C.sun });
    for (const id of ids) {
      const p = P.planets.find((q) => q.id === id);
      const x = X(p.position), y = Y(p.position);
      g += circle(x, y, 5.5, { fill: p.color, stroke: 'var(--bg)', width: 1.5 });
      // Label outside of the orbit, in the direction from the Sun.
      const a = Math.atan2(-(y - 250), x - cx), c = Math.cos(a);
      let lx = x + Math.cos(a) * 14, ly = y - Math.sin(a) * 14 + 4.5, anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
      const wEst = BODY[id].en.length * 7.6;
      if (anchor === 'start' && lx + wEst > cx + R + 30) { anchor = 'end'; lx = x - 4; ly = y - 14; }
      g += tag(lx, ly, BODY[id], { size: 13, anchor, fill: p.color });
    }
    g += text(cx + R / 2, 250 + R + 38, `${maxAu} au`, { size: 12, anchor: 'middle', fill: 'var(--dim)' }) +
      line(cx, 250 + R + 16, cx + R, 250 + R + 16, { stroke: 'var(--dim)', width: 1 }) + line(cx, 250 + R + 12, cx, 250 + R + 20, { stroke: 'var(--dim)', width: 1 }) + line(cx + R, 250 + R + 12, cx + R, 250 + R + 20, { stroke: 'var(--dim)', width: 1 });
    return g;
  };
  let b = panel(240, ['MERCURY', 'VENUS', 'EARTH', 'MARS'], 1.75, L('Mercury to Mars', '水星から火星まで'));
  b += panel(720, ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'], 32, L('Jupiter to Neptune', '木星から海王星まで'));
  return svg('fig-solar', W, H, b, L(`Positions of the planets on ${date.en}`, `${date.ja}の惑星の位置`));
}

// ---- 2. The search of the launch date (Explorer mode) ------------------------------------------------------------------
export function search(Q, V) {
  const W = 960, H = 430;
  const t0 = parseDay(Q.afterUtc);
  const curve = Q.search.curve.filter((p) => p.dvKmS !== null);
  const span = Q.search.spanDays;
  const ax = axes({
    id: 'search', x: 90, y: 30, w: 830, h: 300, xr: [0, span], yr: [3, 20], ylog: true,
    xticks: monthTicks(t0, t0 + span * dayMs, 3), yticks: [3, 4, 5, 6, 8, 10, 15, 20].map((v) => ({ v, label: String(v) })),
    xTitle: L('launch date', '打ち上げ日'), yTitle: L('velocity change (km/s)', '速度の変化 (km/s)'), yTitleGap: 50,
  });
  let b = ax.svg;
  b += path(curve.map((p) => [ax.sx(p.day), ax.sy(p.dvKmS)]), { stroke: C.craft, width: 2.5 });
  const half = span / 2;
  const lowA = curve.filter((p) => p.day < half).reduce((a, c) => (c.dvKmS < a.dvKmS ? c : a));
  const lowB = curve.filter((p) => p.day >= half).reduce((a, c) => (c.dvKmS < a.dvKmS ? c : a));
  if (fx(lowA.dvKmS, 3) !== V.windowADv || fx(lowB.dvKmS, 3) !== V.windowBDv) throw new Error('search: the minimums are not the values of the narration.');
  const best = lowA.dvKmS <= lowB.dvKmS ? lowA : lowB;
  for (const [p, k] of [[lowA, 1], [lowB, 2]]) {
    const x = ax.sx(p.day), y = ax.sy(p.dvKmS), sel = p === best;
    b += circle(x, y, sel ? 8 : 6, { fill: sel ? C.green : 'var(--bg)', stroke: sel ? C.green : C.craft, width: 2.5 });
    const m = monthLabel(t0 + p.day * dayMs, true);
    const right = x < 500;
    b += tag(x + (right ? 14 : -14), y - 40, L(`window ${k}: ${m.en}`, `打ち上げ時期 ${k}: ${m.ja}`), { size: 14, anchor: right ? 'start' : 'end', fill: 'var(--fg)' });
    b += tag(x + (right ? 14 : -14), y - 20, `${fx(p.dvKmS, 3)} km/s`, { size: 14, anchor: right ? 'start' : 'end', fill: sel ? C.green : C.craft, weight: 600 });
  }
  const launch = dateLabel(parseDay(Q.launchUtc));
  b += text(920, 418, L(`Selected: the lower value. Launch on ${launch.en}.`, `選ばれるのは小さいほう: ${launch.ja}の打ち上げ`), { size: 14, anchor: 'end', fill: C.green });
  return svg('fig-search', W, H + 10 + 20, b, L('Velocity change for each launch date of the search', '探索した打ち上げ日ごとの速度の変化'));
}

// ---- 3. The flight to Mars that the Explorer mode calculates --------------------------------------------------------------
export function quickFlight(Q, P) {
  const W = 960, H = 520;
  const s = 150, cx = 330, cy = 265;
  const X = (p) => cx + p[0] * s, Y = (p) => cy - p[1] * s;
  let b = '';
  for (const id of ['EARTH', 'MARS']) {
    const p = P.planets.find((q) => q.id === id);
    b += path(p.orbit.map((q) => [X(q), Y(q)]), { stroke: p.color, width: 1.3, opacity: 0.6, close: true });
  }
  b += circle(cx, cy, 7, { fill: C.sun }) + tag(cx + 12, cy + 20, BODY.SUN, { size: 13, fill: C.sun });
  b += path(Q.points.map((q) => [X(q), Y(q)]), { stroke: C.craft, width: 3 });
  // Marks every 30 days (the points of the data are 1 day apart).
  for (let k = 30; k < Q.points.length - 5; k += 30) b += circle(X(Q.points[k]), Y(Q.points[k]), 3, { fill: C.craft });
  const dailyAt = (id, utc) => {
    const d = (parseDay(utc) - parseDay(P.dailyStartUtc)) / dayMs / P.dailyStepDays;
    const list = P.daily[id], k = Math.floor(d), u = d - k;
    if (k < 0 || k + 1 >= list.length) throw new Error('quickFlight: the date is not in the daily positions.');
    return list[k].map((x, i) => x + (list[k + 1][i] - x) * u);
  };
  const e = dailyAt('EARTH', Q.launchUtc), m = dailyAt('MARS', Q.arrivalUtc);
  if (norm([Q.points[0][0] - e[0], Q.points[0][1] - e[1]]) > 0.01) throw new Error('quickFlight: the start of the path is not at the Earth.');
  b += circle(X(e), Y(e), 7, { fill: planetColor(P, 'EARTH'), stroke: 'var(--bg)', width: 2 });
  b += circle(X(m), Y(m), 7, { fill: planetColor(P, 'MARS'), stroke: 'var(--bg)', width: 2 });
  const dl = dateLabel(parseDay(Q.launchUtc)), da = dateLabel(parseDay(Q.arrivalUtc));
  b += tag(X(e) + 12, Y(e) - 10, L(`Earth at the launch: ${dl.en}`, `打ち上げ時の地球: ${dl.ja}`), { size: 13, fill: planetColor(P, 'EARTH') });
  b += tag(X(m) + 12, Y(m) + 18, L(`Mars at the arrival: ${da.en}`, `到着時の火星: ${da.ja}`), { size: 13, fill: planetColor(P, 'MARS') });
  // Legend.
  const lx = 640;
  b += line(lx, 70, lx + 34, 70, { stroke: C.craft, width: 3 }) + text(lx + 44, 75, L('flight path (result of the engine)', '飛行経路(計算エンジンの結果)'), { size: 14 });
  b += circle(lx + 17, 100, 3, { fill: C.craft }) + text(lx + 44, 105, L('a point each 30 days', '30 日ごとの点'), { size: 14 });
  b += text(lx, 150, L(`Flight time: ${Math.round(Q.daysToArrival)} days`, `飛行時間: ${Math.round(Q.daysToArrival)} 日`), { size: 14, fill: 'var(--dim)' });
  b += text(lx, 175, L(`Altitude at Mars: ${Q.closest[0].altitudeKm} km`, `火星での高度: ${Q.closest[0].altitudeKm} km`), { size: 14, fill: 'var(--dim)' });
  b += text(lx, 200, L(`Launch energy C3: ${fx(Q.c3, 2)} km²/s²`, `打ち上げエネルギー C3: ${fx(Q.c3, 2)} km²/s²`), { size: 14, fill: 'var(--dim)' });
  b += text(lx, 225, L('Top view of the ecliptic plane', '黄道面を上から見た図'), { size: 14, fill: 'var(--dim)' });
  return svg('fig-flight', W, H, b, L('Flight to Mars that the Explorer mode calculated', 'Explorer モードが計算した火星への飛行'));
}

// ---- 4. Speed at the start and the shape of the orbit ---------------------------------------------------------------------
export function conics(O) {
  const W = 960, H = 500;
  const s = 120, cx = 640, cy = 250;
  const X = (p) => cx + p[0] * s, Y = (p) => cy - p[1] * s;
  const box = { x: 20, y: 10, w: 920, h: 480 };
  const inside = ([x, y]) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  const colors = [C.red, C.pink, C.blue, C.green, C.yellow, C.purple];
  const kind = (c) => (c.e === 0 ? L('circle', '円') : c.e < 1 ? L('ellipse', '楕円') : c.e === 1 ? L('parabola', '放物線') : L('hyperbola', '双曲線'));
  let b = '';
  O.conics.forEach((c, k) => {
    const pts = c.points.map((p) => [X(p), Y(p)]);
    for (const seg of parts(pts, inside)) b += path(seg, { stroke: colors[k], width: 2.2, close: c.e < 1 && seg.length === pts.length });
  });
  b += circle(cx, cy, 8, { fill: C.sun }) + tag(cx - 14, cy + 22, BODY.SUN, { size: 13, anchor: 'end', fill: C.sun });
  b += arrow(X([1, 0]), Y([1, 0]), X([1, 0]), Y([1, 0]) - 60, { stroke: 'var(--fg)', width: 2.5 });
  b += circle(X([1, 0]), Y([1, 0]), 5, { fill: C.craft });
  b += tag(X([1, 0]) + 12, Y([1, 0]) + 18, L('start: 1 au from the Sun', '出発点: 太陽から 1 au'), { size: 13 });
  b += tag(X([1, 0]) + 12, Y([1, 0]) - 44, L('speed at the start', '出発時の速さ'), { size: 13 });
  // Legend: speed and type.
  O.conics.forEach((c, k) => {
    const y = 40 + k * 30;
    b += line(40, y, 72, y, { stroke: colors[k], width: 3 });
    b += text(82, y + 5, L(`${fx(c.speedKmS, 1)} km/s: ${kind(c).en}`, `秒速 ${fx(c.speedKmS, 1)} km: ${kind(c).ja}`), { size: 14, fill: colors[k] });
  });
  b += text(40, 240, L('Each orbit is a result of the', '各軌道は、アプリと同じ'), { size: 13, fill: 'var(--dim)' }) +
    text(40, 258, L('two-body model of the application.', '二体モデルの計算結果です。'), { size: 13, fill: 'var(--dim)' });
  return svg('fig-conics', W, H, b, L('Speed at the start and the shape of the orbit', '出発時の速さと軌道の形'));
}

// ---- 5. Parts of an ellipse and the second law of Kepler -----------------------------------------------------------------
export function ellipse(O, V) {
  const K = O.kepler2;
  const W = 960, H = 560;
  const s = 150, cx = 600, cy = 235;
  const X = (p) => cx + p[0] * s, Y = (p) => cy - p[1] * s;
  let b = '';
  const S = K.samples;
  for (let k = 0; k + 1 < S.length; k++) {
    // Sector from the Sun: the orbit points between two samples.
    const a0 = Math.atan2(S[k].position[1], S[k].position[0]), a1 = Math.atan2(S[k + 1].position[1], S[k + 1].position[0]);
    const inSector = (p) => {
      const a = Math.atan2(p[1], p[0]);
      const d = (x) => ((x - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      return d(a) <= d(a1) + 1e-9;
    };
    const arcPts = K.orbit.filter(inSector);
    const pts = [[0, 0], S[k].position, ...arcPts, S[k + 1].position].map((p) => [X(p), Y(p)]);
    b += path(pts, { stroke: 'none', fill: k % 2 ? '#2b4a75' : '#3a5f94', fillOpacity: 0.55, close: true });
  }
  b += path(K.orbit.map((p) => [X(p), Y(p)]), { stroke: 'var(--fg)', width: 2, close: true });
  const peri = S[0].position, apo = S.reduce((a, c) => (c.distanceAu > a.distanceAu ? c : a)).position;
  const center = [(peri[0] + apo[0]) / 2, 0];
  b += line(X(apo), Y(apo), X(peri), Y(peri), { stroke: 'var(--dim)', width: 1.2, dash: '5 5' });
  b += line(X(center), Y(center) - 8, X(center), Y(center) + 8, { stroke: 'var(--dim)', width: 1.2 }) + line(X(center) - 8, Y(center), X(center) + 8, Y(center), { stroke: 'var(--dim)', width: 1.2 });
  b += tag(X(center), Y(center) + 26, L('center', '中心'), { size: 13, anchor: 'middle', fill: 'var(--dim)' });
  // Semi-major axis a: from the center to the periapsis, above the axis.
  const ya = Y(center) - 22;
  b += line(X(center), ya, X(peri), ya, { stroke: C.teal, width: 2 }) + line(X(center), ya - 6, X(center), ya + 6, { stroke: C.teal, width: 2 }) + line(X(peri), ya - 6, X(peri), ya + 6, { stroke: C.teal, width: 2 });
  b += tag((X(center) + X(peri)) / 2, ya - 10, L(`a = ${fx(K.aAu, 1)} au`, `a = ${fx(K.aAu, 1)} au`), { size: 14, anchor: 'middle', fill: C.teal });
  b += circle(cx, cy, 9, { fill: C.sun }) + tag(cx + 6, cy + 28, L('Sun at a focus', '焦点に太陽'), { size: 13, anchor: 'middle', fill: C.sun });
  for (const p of S.slice(0, -1)) b += circle(X(p.position), Y(p.position), 4, { fill: C.craft });
  b += circle(X(peri), Y(peri), 6, { fill: C.green }) + circle(X(apo), Y(apo), 6, { fill: C.purple });
  b += tag(X(peri) + 12, Y(peri) - 26, L('periapsis', '近点'), { size: 14, fill: C.green, weight: 600 });
  b += tag(X(peri) + 12, Y(peri) - 8, `${V.periAu} au, ${V.periSpeed} km/s`, { size: 13, fill: C.green });
  b += tag(X(apo) - 12, Y(apo) - 26, L('apoapsis', '遠点'), { size: 14, anchor: 'end', fill: C.purple, weight: 600 });
  b += tag(X(apo) - 12, Y(apo) - 8, `${V.apoAu} au, ${V.apoSpeed} km/s`, { size: 13, anchor: 'end', fill: C.purple });
  // Legend.
  b += circle(32, 476, 4, { fill: C.craft }) + text(46, 481, L(`positions at ${S.length - 1} equal intervals of time`, `等しい時間ごとの ${S.length - 1} 個の位置`), { size: 14 });
  b += rect(26, 500, 14, 14, { fill: '#3a5f94', fillOpacity: 0.8 }) + text(46, 512, L('each sector has the same area (second law of Kepler)', '各扇形の面積は等しい(ケプラーの第 2 法則)'), { size: 14 });
  b += text(46, 542, L(`e = ${fx(K.e, 2)}. Period: ${fx(K.periodDays, 0)} days.`, `e = ${fx(K.e, 2)}、周期 ${fx(K.periodDays, 0)} 日`), { size: 14, fill: 'var(--dim)' });
  return svg('fig-ellipse', W, H, b, L('Parts of an elliptic orbit', '楕円軌道の各部'));
}

// ---- 6. Orbital elements (oblique view) ------------------------------------------------------------------------------------
export function elements(O) {
  const E = O.elements;
  const W = 960, H = 520;
  const az = -38 * Math.PI / 180, el = 24 * Math.PI / 180, s = 128, cx = 420, cy = 280;
  const pr = (p) => {
    const xr = p[0] * Math.cos(az) - p[1] * Math.sin(az), yr = p[0] * Math.sin(az) + p[1] * Math.cos(az);
    return [cx + xr * s, cy - (yr * Math.sin(el) + p[2] * Math.cos(el)) * s];
  };
  let b = '';
  // Reference plane: a disc of radius 2.6 au.
  const disc = Array.from({ length: 121 }, (_, k) => { const a = (k / 120) * 2 * Math.PI; return pr([2.6 * Math.cos(a), 2.6 * Math.sin(a), 0]); });
  b += path(disc, { stroke: 'var(--grid)', fill: '#16233d', fillOpacity: 0.7, width: 1.5, close: true });
  b += tag(pr([-2.3, 1.4, 0])[0], pr([-2.3, 1.4, 0])[1], L('reference plane', '基準面'), { size: 13, fill: 'var(--dim)' });
  // Orbit: the part below the reference plane is dashed.
  const orb = E.orbit.map((p) => ({ p, s: pr(p) }));
  let seg = [], below = orb[0].p[2] < 0;
  const flush = () => { if (seg.length > 1) b += path(seg, { stroke: C.purple, width: 2.4, dash: below ? '6 6' : undefined, opacity: below ? 0.7 : 1 }); };
  for (const q of orb) {
    const bl = q.p[2] < 0;
    if (bl !== below) { seg.push(q.s); flush(); seg = [q.s]; below = bl; } else seg.push(q.s);
  }
  flush();
  // Reference direction (+X).
  b += arrow(cx, cy, ...pr([3.0, 0, 0]), { stroke: 'var(--fg)', width: 2 });
  b += tag(pr([3.0, 0, 0])[0] + 8, pr([3.0, 0, 0])[1] + 16, L('reference direction (X)', '基準方向(X 軸)'), { size: 13 });
  // Line of the nodes.
  b += line(...pr(E.descendingNode), ...pr(E.ascendingNode), { stroke: C.green, width: 1.5, dash: '4 5' });
  const nHat = unit(E.ascendingNode), pHat = unit(E.periapsis), rHat = unit(E.position), xHat = [1, 0, 0];
  const hHat = unit(cross(E.periapsis, E.position));
  b += circle(...pr(E.ascendingNode), 5, { fill: C.green }) + tag(pr(E.ascendingNode)[0] + 10, pr(E.ascendingNode)[1] + 18, L('ascending node', '昇交点'), { size: 13, fill: C.green });
  // Angles.
  const O3 = [0, 0, 0];
  const arcPath = (pts, color) => path(pts.map(pr), { stroke: color, width: 2.2 });
  const OmegaArc = arc3(O3, xHat, nHat, 0.75);
  b += arcPath(OmegaArc, C.green) + tag(pr(OmegaArc[20])[0] + 6, pr(OmegaArc[20])[1] + 16, `Ω = ${E.raanDeg}°`, { size: 14, fill: C.green, weight: 600 });
  const omegaArc = arc3(O3, nHat, pHat, 0.95);
  b += arcPath(omegaArc, C.teal) + tag(pr(omegaArc[22])[0] + 6, pr(omegaArc[22])[1] - 8, `ω = ${E.argpDeg}°`, { size: 14, fill: C.teal, weight: 600 });
  const nuArc = arc3(O3, pHat, rHat, 0.55);
  b += arcPath(nuArc, C.craft) + tag(pr(nuArc[20])[0] - 10, pr(nuArc[20])[1] - 6, `ν = ${E.nuDeg}°`, { size: 14, anchor: 'end', fill: C.craft, weight: 600 });
  // Inclination at the ascending node: from the reference plane to the orbit plane.
  const inPlane = unit(cross([0, 0, 1], nHat)), inOrbit = unit(cross(hHat, nHat));
  const iArc = arc3(E.ascendingNode, inPlane, inOrbit, 0.6);
  b += line(...pr(E.ascendingNode), ...pr(add(E.ascendingNode, mul(inPlane, 0.75))), { stroke: 'var(--dim)', width: 1.4 });
  b += line(...pr(E.ascendingNode), ...pr(add(E.ascendingNode, mul(inOrbit, 0.75))), { stroke: 'var(--dim)', width: 1.4 });
  b += arcPath(iArc, C.yellow) + tag(pr(iArc[20])[0] + 10, pr(iArc[20])[1] - 4, `i = ${E.iDeg}°`, { size: 14, fill: C.yellow, weight: 600 });
  // Periapsis, position, the Sun.
  b += line(cx, cy, ...pr(E.periapsis), { stroke: C.teal, width: 1.2, dash: '4 4' });
  b += line(cx, cy, ...pr(E.position), { stroke: C.craft, width: 1.2, dash: '4 4' });
  b += circle(...pr(E.periapsis), 5, { fill: C.teal }) + tag(pr(E.periapsis)[0] - 10, pr(E.periapsis)[1] - 10, L('periapsis', '近点'), { size: 13, anchor: 'end', fill: C.teal });
  b += circle(...pr(E.position), 6, { fill: C.craft }) + tag(pr(E.position)[0] - 12, pr(E.position)[1] + 20, L('spacecraft', '探査機'), { size: 13, anchor: 'end', fill: C.craft });
  b += circle(cx, cy, 8, { fill: C.sun });
  // Values.
  const lx = 770;
  const rows = [['a', `${fx(E.aAu, 1)} au`, L('size', '大きさ')], ['e', fx(E.e, 2), L('shape', '形')], ['i', `${E.iDeg}°`, L('tilt of the plane', '面の傾き')],
    ['Ω', `${E.raanDeg}°`, L('direction of the node', '昇交点の方向')], ['ω', `${E.argpDeg}°`, L('direction of the periapsis', '近点の方向')], ['ν', `${E.nuDeg}°`, L('position on the orbit', '軌道上の位置')]];
  rows.forEach(([k, v, d], j) => {
    const y = 60 + j * 46;
    b += text(lx, y, `${k} = ${v}`, { size: 16, weight: 600, italic: k === 'a' || k === 'e' || k === 'i' });
    b += text(lx, y + 19, d, { size: 13, fill: 'var(--dim)' });
  });
  return svg('fig-elements', W, H, b, L('The six orbital elements', '6 つの軌道要素'));
}

// ---- 7. Porkchop plot (C3 map) -----------------------------------------------------------------------------------------
const STOPS = [[9, '#fff6d8'], [12, '#ffd166'], [16, '#ffb454'], [22, '#ff7a6b'], [35, '#c75a8a'], [60, '#6b4a9e'], [120, '#2a3a6e'], [400, '#0e1426']];
const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
function colorOf(c3) {
  const x = Math.log(Math.max(STOPS[0][0], Math.min(STOPS[STOPS.length - 1][0], c3)));
  for (let k = 0; k + 1 < STOPS.length; k++) {
    const a = Math.log(STOPS[k][0]), b = Math.log(STOPS[k + 1][0]);
    if (x <= b) { const u = (x - a) / (b - a); const A = rgb(STOPS[k][1]), B = rgb(STOPS[k + 1][1]); return A.map((v, i) => v + (B[i] - v) * u); }
  }
  return rgb(STOPS[STOPS.length - 1][1]);
}
function contours(f, nx, ny, level) {
  const out = [];
  const crossAt = (i0, j0, i1, j1) => { const a = f(i0, j0), b = f(i1, j1); const u = (level - a) / (b - a); return [i0 + (i1 - i0) * u, j0 + (j1 - j0) * u]; };
  const pairs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [1, 2]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
  for (let i = 0; i + 1 < nx; i++) {
    for (let j = 0; j + 1 < ny; j++) {
      const v = [f(i, j), f(i + 1, j), f(i + 1, j + 1), f(i, j + 1)];
      const code = (v[0] > level ? 1 : 0) | (v[1] > level ? 2 : 0) | (v[2] > level ? 4 : 0) | (v[3] > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const e = [() => crossAt(i, j, i + 1, j), () => crossAt(i + 1, j, i + 1, j + 1), () => crossAt(i, j + 1, i + 1, j + 1), () => crossAt(i, j, i, j + 1)];
      for (const [a, c] of pairs[code]) out.push([e[a](), e[c]()]);
    }
  }
  return out;
}

/** PNG file (8-bit RGB) from pixels. */
export function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const c = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Returns { svg, png } (the picture of the map is a separate file: img/porkchop-mars.png). */
export function porkchop(M, V) {
  const G = M.grid;
  const W = 1000, H = 600;
  const c3At = (i, j) => G.c3[j * G.nx + i] ?? 1e4;
  if (Math.abs(c3At(M.best.ix, M.best.iy) - M.best.c3) > 0.01) throw new Error('porkchop: the order of the cells is not the expected order.');
  const t0 = parseDay(G.depStartUtc), a0 = parseDay(G.arrStartUtc);
  const ax = axes({
    id: 'pork', x: 110, y: 30, w: 600, h: 480, xr: [0, G.depDays], yr: [0, G.arrDays],
    xticks: monthTicks(t0, t0 + G.depDays * dayMs, 1, true), yticks: monthTicks(a0, a0 + G.arrDays * dayMs, 2, true), grid: false,
    xTitle: L('launch date', '打ち上げ日'), yTitle: L('arrival date', '到着日'), yTitleGap: 78,
  });
  const gx = (i) => ax.sx((i / (G.nx - 1)) * G.depDays), gy = (j) => ax.sy((j / (G.ny - 1)) * G.arrDays);
  // Picture: 2 pixels for each pixel of the frame, bilinear interpolation in log(C3).
  const PW = 1200, PH = 960;
  const lg = (i, j) => Math.log(c3At(i, j));
  const picture = png(PW, PH, (px, py) => {
    const u = ((px + 0.5) / PW) * (G.nx - 1), w = (1 - (py + 0.5) / PH) * (G.ny - 1);
    const i = Math.min(G.nx - 2, Math.floor(u)), j = Math.min(G.ny - 2, Math.floor(w)), a = u - i, c = w - j;
    const l = (1 - a) * (1 - c) * lg(i, j) + a * (1 - c) * lg(i + 1, j) + (1 - a) * c * lg(i, j + 1) + a * c * lg(i + 1, j + 1);
    return colorOf(Math.exp(l)).map(Math.round);
  });
  let b = `<image href="img/porkchop-mars.png" x="110" y="30" width="600" height="480" preserveAspectRatio="none"/>`;
  b += ax.svg.replace(/<rect[^>]*fill="var\(--plot\)"[^>]*\/>/, rect(110, 30, 600, 480, { stroke: 'var(--grid)', width: 1 }));
  const levels = [10, 12, 15, 20, 30, 50, 100];
  for (const lev of levels) {
    const segs = contours(c3At, G.nx, G.ny, lev);
    const d = segs.map(([p, q]) => `M${n1(gx(p[0]))} ${n1(gy(p[1]))}L${n1(gx(q[0]))} ${n1(gy(q[1]))}`).join('');
    b += `<path d="${d}" stroke="#0b1020" stroke-width="1.1" fill="none" opacity="0.8"/>`;
  }
  // Lines of constant flight time (dates are linear in the frame).
  const offset = (a0 - t0) / dayMs;
  b += `<g ${ax.clipRef}>`;
  for (const tof of [150, 200, 250, 300, 350, 400]) {
    const pts = [[0, -offset + tof], [G.depDays, G.depDays - offset + tof]];
    b += line(ax.sx(pts[0][0]), ax.sy(pts[0][1]), ax.sx(pts[1][0]), ax.sy(pts[1][1]), { stroke: '#e2e9f6', width: 1, dash: '3 6', opacity: 0.55 });
    // Label near the point where the line goes out of the frame (top edge or right edge).
    const depTop = G.arrDays + offset - tof;
    if (depTop <= G.depDays) b += tag(ax.sx(depTop) - 8, ax.sy(G.arrDays) + 16, L(`${tof} d`, `${tof} 日`), { size: 12, anchor: 'end', fill: '#e2e9f6' });
    else b += tag(ax.sx(G.depDays) - 4, ax.sy(G.depDays - offset + tof) - 6, L(`${tof} d`, `${tof} 日`), { size: 12, anchor: 'end', fill: '#e2e9f6' });
  }
  b += '</g>';
  b += ax.clip;
  // Transfer angle of 180 degrees.
  b += path(M.line180.map(([i, j]) => [gx(i), gy(j)]), { stroke: '#e2e9f6', width: 2.4, dash: '9 6' });
  // Minimum C3.
  const bx = gx(M.best.ix), by = gy(M.best.iy);
  b += circle(bx, by, 8, { fill: C.green, stroke: '#0b1020', width: 2 });
  // Color scale.
  const cbx = 740, cby = 30, cbh = 480;
  const cmin = 9, cmax = 400, ly = (c) => cby + cbh - ((Math.log(c) - Math.log(cmin)) / (Math.log(cmax) - Math.log(cmin))) * cbh;
  let grad = '';
  for (let k = 0; k <= 40; k++) { const c = Math.exp(Math.log(cmin) + (k / 40) * (Math.log(cmax) - Math.log(cmin))); const [r, g, bb] = colorOf(c).map(Math.round); grad += `<stop offset="${(k / 40).toFixed(3)}" stop-color="rgb(${r},${g},${bb})"/>`; }
  b += `<defs><linearGradient id="pork-scale" x1="0" y1="1" x2="0" y2="0">${grad}</linearGradient></defs>`;
  b += rect(cbx, cby, 18, cbh, { fill: 'url(#pork-scale)', stroke: 'var(--grid)', width: 1 });
  for (const c of [10, 15, 20, 30, 50, 100, 200, 400]) b += line(cbx + 18, ly(c), cbx + 23, ly(c), { stroke: 'var(--dim)', width: 1 }) + text(cbx + 27, ly(c) + 4, String(c), { size: 12, fill: 'var(--dim)' });
  b += text(cbx, cby + cbh + 24, 'C3 (km²/s²)', { size: 13, fill: 'var(--dim)' });
  // Legend.
  const lx = 790;
  const dep = dateLabel(parseDay(M.best.depUtc)), arr = dateLabel(parseDay(M.best.arrUtc));
  b += circle(lx + 8, 60, 7, { fill: C.green }) + text(lx + 22, 65, L('lowest C3', 'C3 の最小値'), { size: 14, weight: 600 });
  b += text(lx + 22, 87, `${V.bestC3} km²/s²`, { size: 13, fill: C.green });
  b += text(lx + 22, 107, L(`launch ${dep.en}`, `打ち上げ ${dep.ja}`), { size: 13, fill: 'var(--dim)' });
  b += text(lx + 22, 127, L(`arrival ${arr.en}`, `到着 ${arr.ja}`), { size: 13, fill: 'var(--dim)' });
  b += line(lx, 168, lx + 16, 168, { stroke: '#e2e9f6', width: 2.4, dash: '6 4' }) + text(lx + 22, 173, L('transfer angle 180°', '遷移角 180°'), { size: 14 });
  b += line(lx, 198, lx + 16, 198, { stroke: '#e2e9f6', width: 1, dash: '3 5' }) + text(lx + 22, 203, L('same flight time', '飛行時間が同じ線'), { size: 14 });
  b += line(lx, 228, lx + 16, 228, { stroke: '#7d8597', width: 1.4 }) + text(lx + 22, 233, L('same C3', 'C3 が同じ線'), { size: 14 });
  b += text(lx, 275, L('Bright: low energy', '明るい色: エネルギーが小さい'), { size: 13, fill: 'var(--dim)' });
  b += text(lx, 295, L('Dark: high energy', '暗い色: エネルギーが大きい'), { size: 13, fill: 'var(--dim)' });
  return { svg: svg('fig-porkchop', W, H, b, L('Porkchop plot: launch energy C3 from the Earth to Mars', 'ポークチョップ図: 地球から火星への打ち上げエネルギー C3')), png: picture };
}

// ---- 8. Lowest C3 for each launch date (2026 to 2035) -------------------------------------------------------------------
export function series(M, V) {
  const W = 960, H = 430;
  const S = M.series.filter((p) => p.minC3 !== null);
  const t0 = parseDay(S[0].depUtc), t1 = parseDay(S[S.length - 1].depUtc);
  const span = (t1 - t0) / dayMs;
  const yearTicks = [];
  for (let y = new Date(t0).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= t1; y++) yearTicks.push({ v: (Date.UTC(y, 0, 1) - t0) / dayMs, label: String(y) });
  const ax = axes({
    id: 'series', x: 90, y: 50, w: 830, h: 290, xr: [0, span], yr: [5, 1000], ylog: true,
    xticks: yearTicks, yticks: [5, 10, 20, 50, 100, 200, 500, 1000].map((v) => ({ v, label: String(v) })),
    xTitle: L('launch date', '打ち上げ日'), yTitle: 'C3 (km²/s²)', yTitleGap: 54,
  });
  if (Math.max(...S.map((p) => p.minC3)) > 1000 || Math.min(...S.map((p) => p.minC3)) < 5) throw new Error('series: a value is out of the axis.');
  let b = ax.svg;
  b += path(S.map((p) => [ax.sx((parseDay(p.depUtc) - t0) / dayMs), ax.sy(p.minC3)]), { stroke: C.craft, width: 2 });
  const wx = M.windows.map((w) => ax.sx((parseDay(w.depUtc) - t0) / dayMs));
  M.windows.forEach((w, k) => {
    const x = wx[k], y = ax.sy(w.minC3);
    b += circle(x, y, 5.5, { fill: C.green });
    const m = monthLabel(parseDay(w.depUtc), true);
    b += tag(x, y + 22, m, { size: 12, anchor: 'middle', fill: C.green });
  });
  // Time between two windows.
  for (let k = 0; k + 1 < M.windows.length; k++) {
    const months = Math.round((parseDay(M.windows[k + 1].depUtc) - parseDay(M.windows[k].depUtc)) / dayMs / 30.4375);
    const y = 34;
    b += line(wx[k], y + 6, wx[k], ax.sy(M.windows[k].minC3) - 8, { stroke: 'var(--dim)', width: 1, dash: '2 4' });
    b += arrow(wx[k] + 4, y, wx[k + 1] - 4, y, { stroke: 'var(--dim)', width: 1.2, head: 7 });
    b += text((wx[k] + wx[k + 1]) / 2, y - 6, L(`${months} months`, `${months} か月`), { size: 12, anchor: 'middle', fill: 'var(--dim)' });
  }
  b += line(wx.at(-1), 40, wx.at(-1), ax.sy(M.windows.at(-1).minC3) - 8, { stroke: 'var(--dim)', width: 1, dash: '2 4' });
  b += text(90, 428, L(`Mean time between two launch windows (synodic period of Mars): ${V.synodicDays} days, approximately ${V.synodicMonths} months.`,
    `打ち上げ時期の平均の間隔(火星の会合周期): ${V.synodicDays} 日、約 ${V.synodicMonths} か月`), { size: 13, fill: 'var(--dim)' });
  return svg('fig-series', W, H + 20, b, L('Lowest C3 for each launch date from the Earth to Mars', '地球から火星へ: 打ち上げ日ごとの C3 の最小値'));
}

// ---- 9. The flight of Voyager 2 (top view) -------------------------------------------------------------------------------
export function voyagerPath(V2, P) {
  const W = 960, H = 700;
  const s = 18, cx = 330, cy = 112;
  const X = (p) => cx + p[0] * s, Y = (p) => cy - p[1] * s;
  let b = '';
  for (const id of ['EARTH', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE']) b += path(V2.orbits[id].map((q) => [X(q), Y(q)]), { stroke: planetColor(P, id), width: 1.2, opacity: 0.45, close: false });
  b += circle(cx, cy, 5, { fill: C.sun });
  b += path(V2.samples.map((q) => [X(q.p), Y(q.p)]), { stroke: C.craft, width: 2.6 });
  const start = V2.samples[0].p;
  b += circle(X(start), Y(start), 4, { fill: planetColor(P, 'EARTH') });
  const sd = dateLabel(parseDay(V2.startUtc));
  b += tag(X(start) + 10, Y(start) + 4, L(`launch ${sd.en}`, `打ち上げ ${sd.ja}`), { size: 12, fill: planetColor(P, 'EARTH') });
  for (const f of V2.flybys) {
    const x = X(f.position), y = Y(f.position);
    b += circle(x, y, 7, { fill: 'none', stroke: planetColor(P, f.body), width: 2 }) + circle(x, y, 3, { fill: planetColor(P, f.body) });
    const d = dateLabel(parseDay(f.utc));
    const left = f.body === 'SATURN';
    b += tag(x + (left ? -14 : 14), y - 6, BODY[f.body], { size: 14, anchor: left ? 'end' : 'start', fill: planetColor(P, f.body), weight: 600 });
    b += tag(x + (left ? -14 : 14), y + 12, d, { size: 12, anchor: left ? 'end' : 'start', fill: 'var(--dim)' });
  }
  // Scale bar: 10 au.
  b += line(700, 660, 700 + 10 * s, 660, { stroke: 'var(--dim)', width: 1.2 }) + text(700 + 5 * s, 650, '10 au', { size: 12, anchor: 'middle', fill: 'var(--dim)' });
  b += line(600, 60, 634, 60, { stroke: C.craft, width: 3 }) + text(644, 65, L('Voyager 2 (result of the engine)', 'ボイジャー 2 号(計算エンジンの結果)'), { size: 14 });
  b += circle(617, 90, 7, { fill: 'none', stroke: 'var(--fg)', width: 2 }) + text(644, 95, L('flyby: closest approach', 'フライバイ: 最接近'), { size: 14 });
  b += text(600, 125, L('Thin lines: orbits of the planets', '細い線: 惑星の軌道'), { size: 13, fill: 'var(--dim)' });
  b += text(600, 147, L('Top view of the ecliptic plane', '黄道面を上から見た図'), { size: 13, fill: 'var(--dim)' });
  return svg('fig-voyager', W, H, b, L('The flight of Voyager 2 from 1977 to 1989', 'ボイジャー 2 号の飛行(1977 年から 1989 年)'));
}

// ---- 10. Turn angle of a flyby of Jupiter ---------------------------------------------------------------------------------
export function turn(V2, V) {
  const W = 960, H = 420;
  const ax = axes({
    id: 'turn', x: 90, y: 30, w: 560, h: 300, xr: [1, 40], yr: [0, 160], xlog: true,
    xticks: [1, 2, 5, 10, 20, 40].map((v) => ({ v, label: String(v) })), yticks: [0, 40, 80, 120, 160].map((v) => ({ v, label: `${v}°` })),
    xTitle: L('distance of closest approach (radii of Jupiter)', '最接近距離(木星半径の倍数)'), yTitle: L('turn angle', '曲がる角度'), yTitleGap: 54,
  });
  let b = ax.svg;
  b += path(V2.turnCurve.map(([r, d]) => [ax.sx(r), ax.sy(d)]), { stroke: C.blue, width: 2.5 });
  const J = V2.flybys.find((f) => f.body === 'JUPITER');
  const rp = V2.jupiterClose.periapsisRj;
  const x = ax.sx(rp), y = ax.sy(J.turnDeg);
  b += circle(x, y, 8, { fill: 'none', stroke: C.green, width: 2.5 }) + circle(x, y, 3.5, { fill: C.green });
  b += tag(x + 14, y - 30, L('Voyager 2', 'ボイジャー 2 号'), { size: 14, fill: C.green, weight: 600 });
  b += tag(x + 14, y - 12, L(`${V.jupiterRpRj} radii, ${V.jupiterTurn}°`, `木星半径の ${V.jupiterRpRj} 倍、${V.jupiterTurn}°`), { size: 14, fill: C.green, weight: 600 });
  b += text(690, 70, L('Speed relative to Jupiter', '木星に対する速さ'), { size: 14, fill: 'var(--dim)' });
  b += text(690, 92, L(`at infinity: ${V.jupiterVinf} km/s`, `(無限遠): 秒速 ${V.jupiterVinf} km`), { size: 14, fill: 'var(--dim)' });
  b += text(690, 140, L('Nearer to the planet:', '惑星に近いほど'), { size: 14 });
  b += text(690, 162, L('larger turn.', '大きく曲がる'), { size: 14 });
  b += text(690, 210, L('The curve is for the', 'この曲線は、ボイジャー 2 号と'), { size: 13, fill: 'var(--dim)' });
  b += text(690, 230, L('speed of Voyager 2.', '同じ速さの場合です。'), { size: 13, fill: 'var(--dim)' });
  return svg('fig-turn', W, H, b, L('Turn angle of a flyby of Jupiter', '木星フライバイで曲がる角度'));
}

// ---- 11. Speed of Voyager 2 and the escape speed ---------------------------------------------------------------------------
export function speed(V2, V) {
  const W = 960, H = 460;
  const t0 = parseDay(V2.startUtc);
  const yr = (ms) => new Date(ms).getUTCFullYear() + (ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 1)) / (365.25 * dayMs);
  const S = V2.samples.map((s) => ({ y: yr(t0 + s.t * dayMs), v: s.speedKmS, e: s.escapeKmS }));
  const ax = axes({
    id: 'speed', x: 80, y: 30, w: 840, h: 320, xr: [1977.5, 1990], yr: [0, 45],
    xticks: [1978, 1980, 1982, 1984, 1986, 1988, 1990].map((v) => ({ v, label: String(v) })), yticks: [0, 10, 20, 30, 40].map((v) => ({ v, label: String(v) })),
    xTitle: L('year', '年'), yTitle: L('speed relative to the Sun (km/s)', '太陽に対する速さ (km/s)'), yTitleGap: 46,
  });
  let b = ax.svg;
  // Area where the speed is more than the escape speed (after Jupiter).
  const J = V2.flybys.find((f) => f.body === 'JUPITER');
  const yJ = yr(parseDay(J.utc));
  const after = S.filter((p) => p.y > yJ + 0.02);
  if (after.some((p) => p.v <= p.e)) throw new Error('speed: the speed is not always more than the escape speed after Jupiter.');
  b += path([...after.map((p) => [ax.sx(p.y), ax.sy(p.v)]), ...after.slice().reverse().map((p) => [ax.sx(p.y), ax.sy(p.e)])], { stroke: 'none', fill: C.green, fillOpacity: 0.16, close: true });
  for (const f of V2.flybys) {
    const x = ax.sx(yr(parseDay(f.utc)));
    b += line(x, 30, x, 350, { stroke: 'var(--dim)', width: 1, dash: '3 5' });
    b += text(x + 4, 46, BODY[f.body], { size: 12, fill: 'var(--dim)' });
  }
  b += path(S.map((p) => [ax.sx(p.y), ax.sy(p.e)]), { stroke: C.red, width: 2, dash: '7 5' });
  b += path(S.map((p) => [ax.sx(p.y), ax.sy(p.v)]), { stroke: C.craft, width: 2.6 });
  b += tag(ax.sx(1983.6), ax.sy(23.4), L('faster than the escape speed', '脱出速度より速い'), { size: 14, anchor: 'middle', fill: C.green, weight: 600 });
  const N = V2.flybys.find((f) => f.body === 'NEPTUNE');
  const xN = ax.sx(yr(parseDay(N.utc)));
  b += circle(xN, ax.sy(N.speedBeforeKmS), 4, { fill: 'var(--fg)' }) + circle(xN, ax.sy(N.speedAfterKmS), 4, { fill: 'var(--fg)' });
  b += tag(xN - 8, ax.sy(N.speedBeforeKmS) - 10, `${V.neptuneBefore} km/s`, { size: 12, anchor: 'end' });
  b += tag(xN - 8, ax.sy(N.speedAfterKmS) + 18, `${V.neptuneAfter} km/s`, { size: 12, anchor: 'end' });
  // Legend.
  b += line(560, 92, 594, 92, { stroke: C.craft, width: 3 }) + text(604, 97, L('speed of Voyager 2', 'ボイジャー 2 号の速さ'), { size: 14 });
  b += line(560, 118, 594, 118, { stroke: C.red, width: 2, dash: '7 5' }) + text(604, 123, L('escape speed from the solar system', '太陽系からの脱出速度'), { size: 14 });
  b += text(80, 440, L(`Jupiter flyby: from ${V.helioIn} to ${V.helioOut} km/s (relative to the Sun).`, `木星フライバイ: 太陽に対して秒速 ${V.helioIn} km から ${V.helioOut} km へ`), { size: 13, fill: 'var(--dim)' });
  return svg('fig-speed', W, H, b, L('Speed of Voyager 2 relative to the Sun', 'ボイジャー 2 号の太陽に対する速さ'));
}

// ---- 12. Measured differences from JPL Horizons (actual missions) ----------------------------------------------------------
export function accuracy(A, missions) {
  const rows = [];
  for (const m of missions) {
    const flybys = new Map();
    for (const r of A) {
      const k = r.id.split('.');
      if (k[0] !== 'famous' || (k[1] !== 'periapsis' && k[1] !== 'vinf') || k[2] !== m.id) continue;
      const key = `${k[3]}.${k[4]}`;
      if (!flybys.has(key)) flybys.set(key, { n: Number(k[3]), body: k[4] });
      flybys.get(key)[k[1]] = r;
    }
    for (const f of [...flybys.values()].sort((a, b) => a.n - b.n)) rows.push({ mission: m.name, ...f });
  }
  const W = 960, rowH = 22, top = 60, H = top + rows.length * rowH + 90;
  const ax = axes({
    id: 'acc', x: 250, y: top, w: 560, h: rows.length * rowH, xr: [0.0001, 10], yr: [0, rows.length], xlog: true,
    xticks: [0.0001, 0.001, 0.01, 0.1, 1, 10].map((v) => ({ v, label: `${v} %` })), yticks: [],
    xTitle: L('difference from JPL Horizons (logarithmic scale)', 'JPL Horizons との差(対数目盛)'),
  });
  let b = ax.svg;
  const lim = { periapsis: 3, vinf: 1 };
  b += line(ax.sx(1), top - 8, ax.sx(1), top + rows.length * rowH, { stroke: C.blue, width: 1.5, dash: '5 4' });
  b += line(ax.sx(3), top - 8, ax.sx(3), top + rows.length * rowH, { stroke: C.craft, width: 1.5, dash: '5 4' });
  b += text(ax.sx(1) - 4, top - 14, L('limit: speed 1 %', '限界: 速さ 1 %'), { size: 12, anchor: 'end', fill: C.blue });
  b += text(ax.sx(3) + 4, top - 14, L('limit: distance 3 %', '限界: 距離 3 %'), { size: 12, fill: C.craft });
  let last = '';
  rows.forEach((r, k) => {
    const y = top + k * rowH + rowH / 2;
    if (k % 2 === 0) b += rect(250, y - rowH / 2, 560, rowH, { fill: 'var(--fg)', fillOpacity: 0.03 });
    const name = r.mission !== last ? r.mission : '';
    last = r.mission;
    if (name) b += text(20, y + 4.5, name, { size: 13, weight: 600 });
    b += text(240, y + 4.5, BODY[r.body] ?? r.body, { size: 13, anchor: 'end', fill: 'var(--dim)' });
    for (const kind of ['periapsis', 'vinf']) {
      const m = r[kind];
      if (!m) continue;
      if (m.limit !== lim[kind]) throw new Error('accuracy: unexpected limit ' + m.id);
      if (m.value > m.limit) throw new Error('accuracy: a value is larger than its limit: ' + m.id);
      const v = Math.max(0.0001, m.value), x = ax.sx(v);
      b += kind === 'periapsis' ? circle(x, y, 5.5, { fill: C.craft }) : diamond(x, y, 6, { fill: C.blue });
    }
  });
  const ly = top + rows.length * rowH + 70;
  b += circle(260, ly - 4, 5.5, { fill: C.craft }) + text(272, ly, L('distance of closest approach', '最接近距離'), { size: 13 });
  b += diamond(480, ly - 4, 6, { fill: C.blue }) + text(492, ly, L('speed at infinity (v∞)', '無限遠での速さ (v∞)'), { size: 13 });
  b += text(840, top + 14, L('All points are', 'すべての点が'), { size: 13, fill: C.green });
  b += text(840, top + 32, L('in the limits.', '限界の内側'), { size: 13, fill: C.green });
  return svg('fig-accuracy', W, H, b, L('Differences between the flights of Apsis and the actual flights', 'Apsis の飛行と実際の飛行の差'));
}

// ---- 13. Your browser does the work ------------------------------------------------------------------------------------------
export function browser() {
  const W = 960, H = 300;
  let b = '';
  const box = (x, y, w, h, title, items, color) => {
    let g = rect(x, y, w, h, { rx: 14, fill: 'var(--plot)', stroke: color, width: 2 });
    g += text(x + 20, y + 32, title, { size: 17, weight: 600, fill: color });
    items.forEach((it, k) => { g += circle(x + 26, y + 60 + k * 26, 3.5, { fill: color }) + text(x + 38, y + 65 + k * 26, it, { size: 14 }); });
    return g;
  };
  b += box(30, 60, 270, 170, L('Web server', 'ウェブサーバー'), [L('files of the application', 'アプリのファイル'), L('data files (DE440 and others)', 'データファイル(DE440 など)'), L('maps of the bodies', '天体の地図')], 'var(--dim)');
  b += box(440, 30, 490, 240, L('Your web browser', 'あなたのウェブブラウザ'), [L('engine: all calculations', '計算エンジン: すべての計算'), L('3D view and tables', '3D 表示と表'), L('your missions and settings (storage of the browser)', 'ミッションと設定(ブラウザの保存領域)'), L('files that you read and write', '読み書きするファイル'), L('no account, no cookies', 'アカウントなし、Cookie なし'), L('no record of your operations', '操作の記録なし')], C.green);
  b += arrow(305, 120, 432, 120, { stroke: 'var(--fg)', width: 2.5 }) + text(368, 108, L('files', 'ファイル'), { size: 13, anchor: 'middle', fill: 'var(--dim)' });
  b += line(432, 180, 310, 180, { stroke: C.red, width: 2.5, dash: '6 5' }) + `<path d="M310 180L322 173L322 187Z" fill="${C.red}"/>`;
  b += line(361, 170, 381, 190, { stroke: C.red, width: 3 }) + line(381, 170, 361, 190, { stroke: C.red, width: 3 });
  b += text(371, 214, L('no data to a server', 'サーバーへ'), { size: 13, anchor: 'middle', fill: C.red });
  b += text(371, 231, L('', '送るデータなし'), { size: 13, anchor: 'middle', fill: C.red });
  return svg('fig-browser', W, H, b, L('The browser does all the work', 'すべての処理はブラウザの中'));
}

// ---- 14. Local frame VNB of a maneuver ------------------------------------------------------------------------------------------
export function vnb(O) {
  const K = O.kepler2;
  const W = 960, H = 420;
  const az = -20 * Math.PI / 180, el = 32 * Math.PI / 180, s = 120, cx = 420, cy = 230;
  const pr = (p) => {
    const xr = p[0] * Math.cos(az) - p[1] * Math.sin(az), yr = p[0] * Math.sin(az) + p[1] * Math.cos(az);
    return [cx + xr * s, cy - (yr * Math.sin(el) + p[2] * Math.cos(el)) * s];
  };
  let b = '';
  b += path(K.orbit.map(pr), { stroke: 'var(--dim)', width: 1.8, close: true });
  b += circle(cx, cy, 8, { fill: C.sun });
  // Spacecraft at the third sample; velocity direction from the next orbit point.
  const target = K.samples[2].position;
  const i = K.orbit.reduce((best, q, k) => (Math.hypot(q[0] - target[0], q[1] - target[1]) < Math.hypot(K.orbit[best][0] - target[0], K.orbit[best][1] - target[1]) ? k : best), 0);
  const p = K.orbit[i], q = K.orbit[(i + 1) % K.orbit.length];
  const v = unit([q[0] - p[0], q[1] - p[1], q[2] - p[2]]), n = [0, 0, 1], bb = unit(cross(v, n));
  const L3 = 0.9;
  const ax3 = (dir, color, label) => {
    const a = pr(p), e = pr(add(p, mul(dir, L3)));
    const d = Math.hypot(e[0] - a[0], e[1] - a[1]), ux = (e[0] - a[0]) / d, uy = (e[1] - a[1]) / d;
    return arrow(a[0], a[1], e[0], e[1], { stroke: color, width: 3, head: 14 }) + tag(e[0] + ux * 16, e[1] + uy * 16 + 5, label, { size: 16, anchor: 'middle', fill: color, weight: 600 });
  };
  b += ax3(v, C.craft, 'V') + ax3(n, C.green, 'N') + ax3(bb, C.blue, 'B');
  b += circle(...pr(p), 6, { fill: 'var(--fg)' });
  b += tag(pr(p)[0] - 14, pr(p)[1] + 22, L('spacecraft', '探査機'), { size: 13, anchor: 'end' });
  const lx = 690;
  b += text(lx, 80, 'V', { size: 16, weight: 600, fill: C.craft }) + text(lx + 26, 80, L('along the velocity', '速度の方向'), { size: 14 });
  b += text(lx, 112, 'N', { size: 16, weight: 600, fill: C.green }) + text(lx + 26, 112, L('along the orbit normal', '軌道面に垂直な方向'), { size: 14 });
  b += text(lx, 144, 'B', { size: 16, weight: 600, fill: C.blue }) + text(lx + 26, 144, 'V × N', { size: 14 });
  b += text(lx, 190, L('A maneuver in VNB gives its', 'VNB での噴射は、この 3 方向の'), { size: 13, fill: 'var(--dim)' });
  b += text(lx, 210, L('three components on these axes.', '成分で表します。'), { size: 13, fill: 'var(--dim)' });
  return svg('fig-vnb', W, H, b, L('The local frame VNB', '局所座標系 VNB'));
}

export { esc };
