// Small helpers for the figures of the manual: SVG text in two languages, paths, axes of charts.
// A label is a string (the same in the two languages) or an object { en, ja }. The page shows the text of the
// language that the reader selects (CSS classes t-en and t-ja).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A number for a path: 1 decimal. */
export const n1 = (x) => Math.round(x * 10) / 10;

const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/**
 * Text at (x, y). o: size, anchor ('start' | 'middle' | 'end'), fill, weight, cls, base (dominant-baseline).
 * The two languages get two elements: the page hides one of them.
 */
export function text(x, y, label, o = {}) {
  const a = {
    x: n1(x), y: n1(y), 'font-size': o.size ?? 15, 'text-anchor': o.anchor ?? 'start', fill: o.fill ?? 'var(--fg)',
    'font-weight': o.weight, 'dominant-baseline': o.base, transform: o.rotate ? `rotate(${o.rotate} ${n1(x)} ${n1(y)})` : undefined,
    'font-style': o.italic ? 'italic' : undefined, opacity: o.opacity,
  };
  const one = (s, cls) => `<text${attrs({ ...a, class: [cls, o.cls].filter(Boolean).join(' ') || undefined })}>${esc(s)}</text>`;
  if (typeof label === 'string') return one(label);
  return (label.en ? one(label.en, 't-en') : '') + (label.ja ? one(label.ja, 't-ja') : '');
}

/** A text with a dark background (a label on a picture). */
export function tag(x, y, label, o = {}) {
  return `<g class="tag">${text(x, y, label, { ...o, cls: 'halo' })}${text(x, y, label, o)}</g>`;
}

/** Path through points [x, y] (screen units). */
export function path(points, o = {}) {
  if (points.length < 2) return '';
  const d = points.map((p, k) => `${k ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join('') + (o.close ? 'Z' : '');
  return `<path${attrs({ d, fill: o.fill ?? 'none', stroke: o.stroke ?? 'var(--fg)', 'stroke-width': o.width ?? 2,
    'stroke-dasharray': o.dash, 'stroke-linejoin': 'round', 'stroke-linecap': o.cap ?? 'round', opacity: o.opacity, 'fill-opacity': o.fillOpacity, class: o.cls })}/>`;
}

/** Split a path at the points where the function cut(p) changes (for example: parts outside a frame). */
export function parts(points, keep) {
  const out = [];
  let cur = [];
  for (const p of points) {
    if (keep(p)) cur.push(p);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out.filter((c) => c.length > 1);
}

export function circle(x, y, r, o = {}) {
  return `<circle${attrs({ cx: n1(x), cy: n1(y), r, fill: o.fill ?? 'var(--fg)', stroke: o.stroke, 'stroke-width': o.width, opacity: o.opacity, 'stroke-dasharray': o.dash })}/>`;
}

export function line(x1, y1, x2, y2, o = {}) {
  return `<line${attrs({ x1: n1(x1), y1: n1(y1), x2: n1(x2), y2: n1(y2), stroke: o.stroke ?? 'var(--fg)', 'stroke-width': o.width ?? 1.5, 'stroke-dasharray': o.dash, opacity: o.opacity, 'stroke-linecap': 'round' })}/>`;
}

/** An arrow from (x1, y1) to (x2, y2): a line and a head of the same color. */
export function arrow(x1, y1, x2, y2, o = {}) {
  const c = o.stroke ?? 'var(--fg)', w = o.width ?? 2.5, L = o.head ?? 12;
  const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
  const k = Math.max(0, len - L * 0.8) / len;
  const hx = x1 + (x2 - x1) * k, hy = y1 + (y2 - y1) * k;
  const p1 = [x2 - L * Math.cos(a - 0.4), y2 - L * Math.sin(a - 0.4)], p2 = [x2 - L * Math.cos(a + 0.4), y2 - L * Math.sin(a + 0.4)];
  return line(x1, y1, hx, hy, { stroke: c, width: w, dash: o.dash }) +
    `<path d="M${n1(x2)} ${n1(y2)}L${n1(p1[0])} ${n1(p1[1])}L${n1(p2[0])} ${n1(p2[1])}Z" fill="${c}"/>`;
}

export function rect(x, y, w, h, o = {}) {
  return `<rect${attrs({ x: n1(x), y: n1(y), width: n1(w), height: n1(h), rx: o.rx, fill: o.fill ?? 'none', stroke: o.stroke, 'stroke-width': o.width, opacity: o.opacity, 'stroke-dasharray': o.dash, 'fill-opacity': o.fillOpacity })}/>`;
}

/** A diamond with its center at (x, y). */
export function diamond(x, y, r, o = {}) {
  return `<path d="M${n1(x)} ${n1(y - r)}L${n1(x + r)} ${n1(y)}L${n1(x)} ${n1(y + r)}L${n1(x - r)} ${n1(y)}Z"${attrs({ fill: o.fill ?? 'var(--fg)', stroke: o.stroke, 'stroke-width': o.width })}/>`;
}

/**
 * Axes of a chart. Frame: x, y, w, h (screen units). xr, yr: ranges of the values. xlog, ylog: logarithmic scale.
 * xticks, yticks: [{ v, label }]. Returns the scale functions and the SVG of the frame (grid, ticks, titles).
 */
export function axes(o) {
  const { x, y, w, h } = o;
  const tx = o.xlog ? Math.log10 : (v) => v, ty = o.ylog ? Math.log10 : (v) => v;
  const [x0, x1] = o.xr.map(tx), [y0, y1] = o.yr.map(ty);
  const sx = (v) => x + ((tx(v) - x0) / (x1 - x0)) * w;
  const sy = (v) => y + h - ((ty(v) - y0) / (y1 - y0)) * h;
  let s = rect(x, y, w, h, { fill: 'var(--plot)', stroke: 'var(--grid)', width: 1 });
  for (const t of o.xticks ?? []) {
    const X = sx(t.v);
    if (o.grid !== false) s += line(X, y, X, y + h, { stroke: 'var(--grid)', width: 1 });
    s += line(X, y + h, X, y + h + 5, { stroke: 'var(--dim)', width: 1 });
    if (t.label) s += text(X, y + h + 22, t.label, { size: o.tickSize ?? 13, anchor: 'middle', fill: 'var(--dim)' });
  }
  for (const t of o.yticks ?? []) {
    const Y = sy(t.v);
    if (o.grid !== false) s += line(x, Y, x + w, Y, { stroke: 'var(--grid)', width: 1 });
    s += line(x - 5, Y, x, Y, { stroke: 'var(--dim)', width: 1 });
    if (t.label) s += text(x - 9, Y + 4.5, t.label, { size: o.tickSize ?? 13, anchor: 'end', fill: 'var(--dim)' });
  }
  if (o.xTitle) s += text(x + w / 2, y + h + 46, o.xTitle, { size: 14, anchor: 'middle', fill: 'var(--dim)' });
  if (o.yTitle) s += text(x - (o.yTitleGap ?? 52), y + h / 2, o.yTitle, { size: 14, anchor: 'middle', fill: 'var(--dim)', rotate: -90 });
  const inside = ([px, py]) => px >= x - 0.5 && px <= x + w + 0.5 && py >= y - 0.5 && py <= y + h + 0.5;
  return { sx, sy, svg: s, inside, clip: `<clipPath id="${o.id}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`, clipRef: `clip-path="url(#${o.id}-clip)"` };
}

/** The SVG element of a figure. */
export function svg(id, w, h, body, label) {
  const lab = typeof label === 'string' ? { en: label, ja: label } : label;
  return `<svg class="fig" id="${id}" viewBox="0 0 ${w} ${h}" role="img" data-label-en="${esc(lab.en)}" data-label-ja="${esc(lab.ja)}" aria-label="${esc(lab.en)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// ---- Dates ---------------------------------------------------------------------------------------------------------
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayMs = 86400000;
export const parseDay = (s) => Date.parse(s.slice(0, 10) + 'T' + (s.length > 10 ? s.slice(11, 16) : '00:00') + ':00Z');
/** A date as a label: "14 Oct 2026" / "2026年10月14日". */
export function dateLabel(ms) {
  const d = new Date(ms);
  return { en: `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`, ja: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日` };
}
export function dateLong(ms) {
  const d = new Date(ms);
  return { en: `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`, ja: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日` };
}
export function monthLabel(ms, withYear) {
  const d = new Date(ms);
  const m = d.getUTCMonth(), y = d.getUTCFullYear();
  return withYear ? { en: `${MONTHS_EN[m]} ${y}`, ja: `${y}年${m + 1}月` } : { en: MONTHS_EN[m], ja: `${m + 1}月` };
}
/** Ticks at the first day of each month (every step months) between two times, as days from t0. */
export function monthTicks(t0, t1, step, yearAtJan = true) {
  const out = [];
  const d = new Date(t0);
  let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  if (m > 11) { m = 0; y++; }
  for (let k = 0; k < 400; k++) {
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (m % step === 0) out.push({ v: (t - t0) / dayMs, label: monthLabel(t, yearAtJan && m === 0), t });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

// ---- Names of the bodies ---------------------------------------------------------------------------------------------
export const BODY = {
  SUN: { en: 'Sun', ja: '太陽' }, MERCURY: { en: 'Mercury', ja: '水星' }, VENUS: { en: 'Venus', ja: '金星' }, EARTH: { en: 'Earth', ja: '地球' },
  MOON: { en: 'Moon', ja: '月' }, MARS: { en: 'Mars', ja: '火星' }, JUPITER: { en: 'Jupiter', ja: '木星' }, SATURN: { en: 'Saturn', ja: '土星' },
  URANUS: { en: 'Uranus', ja: '天王星' }, NEPTUNE: { en: 'Neptune', ja: '海王星' }, PLUTO: { en: 'Pluto', ja: '冥王星' },
};

// ---- Colors (the same colors as the videos) -----------------------------------------------------------------------------
export const C = {
  fg: 'var(--fg)', dim: 'var(--dim)', sun: '#ffd166', craft: '#ffb454', blue: '#78b7ff', green: '#7bd88f', red: '#ff7a6b',
  purple: '#c792ea', teal: '#5fd7c7', yellow: '#ffe08a', pink: '#f78fb3',
};
