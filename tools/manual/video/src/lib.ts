/**
 * Parts that the scenes of the videos share: colors, shortcuts for the animations, labels with numbers that change,
 * chart axes, angle arcs and the planets.
 */
import { Mob, Camera, Scene, num, color, svgEl, f2, type Vec3, Track, lerp, ease } from './core';
import { Text, type TextOptions, layoutGlyphs, textWidth, type Weight } from './text';
import { Curve, Dot, Arrow, Box, type Picture } from './shapes';
import type { ShotInfo } from './shots';
import { makeValues } from '../../values.mjs';

export const C = {
  text: '#e2e9f6', dim: '#8b98b3', faint: '#3a4763', grid: '#1e2940',
  sun: '#ffd166', craft: '#ffb454', blue: '#78b7ff', green: '#7bd88f', red: '#ff7a6b', purple: '#c792ea',
  teal: '#5fd7c7', yellow: '#ffe08a', pink: '#f78fb3',
};

/** Show an object with a fade from t (the object is hidden before t). */
export function fadeIn<T extends Mob>(m: T, t: number, d = 0.6): T { m.hide(); m.opacity.to(1, t, d); return m; }
/** Fade an object out from t. */
export function fadeOut<T extends Mob>(m: T, t: number, d = 0.6): T { m.opacity.to(0, t, d); return m; }
/** Fade a group of objects out from t. */
export function fadeAll(list: Mob[], t: number, d = 0.6): void { for (const m of list) m.opacity.to(0, t, d); }

/** A line of text in screen pixels that the scene writes at t0 (hidden before). */
export function write(scene: Scene, s: string, x: number, y: number, t0: number, o: TextOptions & { dur?: number; layer?: 'front' | 'ui' } = {}): Text {
  const m = scene.add(new Text(s, x, y, o), o.layer ?? 'ui');
  m.hide(); m.show(t0, o.dur ?? Math.min(1.6, 0.3 + s.length * 0.035));
  return m;
}

/**
 * Text with a content that changes in time (numbers that count). The function gives the text at time t. The glyphs
 * are made again only when the text changes.
 */
export class LiveText extends Mob {
  x: Track<number>; y: Track<number>;
  fill: Track<string>;
  private last = '';
  private readonly g: SVGGElement;
  constructor(readonly content: (t: number) => string, x: number, y: number, readonly o: TextOptions & { screenAt?: (t: number) => [number, number] } = {}) {
    super();
    this.x = num(x); this.y = num(y); this.fill = color(o.color ?? C.text);
    this.g = svgEl('g', {}, this.el);
  }
  draw(t: number, cam: Camera): void {
    const s = this.content(t);
    if (s !== this.last) {
      this.last = s;
      const size = this.o.size ?? 36;
      const { glyphs, width } = layoutGlyphs(s, size, this.o.weight ?? 400);
      const shift = this.o.anchor === 'middle' ? -width / 2 : this.o.anchor === 'end' ? -width : 0;
      this.g.innerHTML = '';
      for (const gl of glyphs) svgEl('path', { d: gl.d, transform: `translate(${f2(shift)} 0)` }, this.g);
    }
    let x = this.x.at(t), y = this.y.at(t);
    if (this.o.at) {
      const p = typeof this.o.at === 'function' ? this.o.at(t) : this.o.at;
      const q = cam.project(p);
      x += q[0]; y += q[1];
    }
    if (this.o.screenAt) { const q = this.o.screenAt(t); x += q[0]; y += q[1]; }
    this.g.setAttribute('transform', `translate(${f2(x)} ${f2(y)})`);
    this.g.setAttribute('fill', this.fill.at(t));
  }
}

/** A value that moves from a to b between t0 and t1 (for the position of a body along its samples). */
export function ramp(t0: number, t1: number, a = 0, b = 1, e = ease.linear): (t: number) => number {
  return (t) => (t <= t0 ? a : t >= t1 ? b : lerp(a, b, e((t - t0) / (t1 - t0))));
}

/** Points of a circular arc about a center, in the plane of the unit vectors u and v, from angle a0 to a1 (degrees). */
export function arcPoints(center: Vec3, u: Vec3, v: Vec3, r: number, a0: number, a1: number, n = 64): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    const c = Math.cos(a) * r, s = Math.sin(a) * r;
    out.push([center[0] + c * u[0] + s * v[0], center[1] + c * u[1] + s * v[1], center[2] + c * u[2] + s * v[2]]);
  }
  return out;
}

export const sub3 = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)];
export const add3 = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[0] + b[0], a[1] + b[1], (a[2] ?? 0) + (b[2] ?? 0)];
export const scale3 = (a: ArrayLike<number>, k: number): Vec3 => [a[0] * k, a[1] * k, (a[2] ?? 0) * k];
export const len3 = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2] ?? 0);
export const unit3 = (a: ArrayLike<number>): Vec3 => scale3(a, 1 / len3(a));
export const cross3 = (a: ArrayLike<number>, b: ArrayLike<number>): Vec3 => [a[1] * (b[2] ?? 0) - (a[2] ?? 0) * b[1], (a[2] ?? 0) * b[0] - a[0] * (b[2] ?? 0), a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0);

/** Format a number with a fixed count of decimals. */
export const fx = (x: number, n: number) => x.toFixed(n);

// ---- Chart axes (screen pixels) ---------------------------------------------------------------------------------

export interface AxesOptions {
  x: number; y: number; w: number; h: number;
  xRange: [number, number]; yRange: [number, number];
  xTicks?: { v: number; label: string }[]; yTicks?: { v: number; label: string }[];
  xTitle?: string; yTitle?: string;
  log?: boolean;
}

/** Axes of a chart: (x, y) is the top left corner of the plot area. */
export class Axes {
  readonly parts: Mob[] = [];
  constructor(readonly scene: Scene, readonly o: AxesOptions) {}
  sx(v: number): number { const [a, b] = this.o.xRange; return this.o.x + ((v - a) / (b - a)) * this.o.w; }
  sy(v: number): number { const [a, b] = this.o.yRange; return this.o.y + this.o.h - ((v - a) / (b - a)) * this.o.h; }
  p(xv: number, yv: number): Vec3 { return [this.sx(xv), this.sy(yv), 0]; }
  /** Draw the axes from t0. */
  build(t0: number, o: { grid?: boolean } = {}): this {
    const { x, y, w, h } = this.o;
    const s = this.scene;
    const ax = s.add(new Curve([[x, y + h], [x + w, y + h]], { space: 'screen', color: C.dim, width: 2.5 }), 'back');
    const ay = s.add(new Curve([[x, y + h], [x, y]], { space: 'screen', color: C.dim, width: 2.5 }), 'back');
    ax.hide(); ax.create(t0, 0.8); ay.hide(); ay.create(t0, 0.8);
    this.parts.push(ax, ay);
    for (const tk of this.o.xTicks ?? []) {
      const px = this.sx(tk.v);
      const m = s.add(new Curve([[px, y + h], [px, y + h + 10]], { space: 'screen', color: C.dim, width: 2 }), 'back');
      fadeIn(m, t0 + 0.4, 0.4);
      const l = s.add(new Text(tk.label, px, y + h + 42, { size: 24, color: C.dim, anchor: 'middle' }), 'ui');
      fadeIn(l, t0 + 0.5, 0.5);
      this.parts.push(m, l);
      if (o.grid) { const g = s.add(new Curve([[px, y], [px, y + h]], { space: 'screen', color: C.grid, width: 1.5 }), 'back'); fadeIn(g, t0 + 0.4, 0.6); this.parts.push(g); }
    }
    for (const tk of this.o.yTicks ?? []) {
      const py = this.sy(tk.v);
      const m = s.add(new Curve([[x - 10, py], [x, py]], { space: 'screen', color: C.dim, width: 2 }), 'back');
      fadeIn(m, t0 + 0.4, 0.4);
      const l = s.add(new Text(tk.label, x - 18, py + 8, { size: 24, color: C.dim, anchor: 'end' }), 'ui');
      fadeIn(l, t0 + 0.5, 0.5);
      this.parts.push(m, l);
      if (o.grid) { const g = s.add(new Curve([[x, py], [x + w, py]], { space: 'screen', color: C.grid, width: 1.5 }), 'back'); fadeIn(g, t0 + 0.4, 0.6); this.parts.push(g); }
    }
    if (this.o.xTitle) { const l = s.add(new Text(this.o.xTitle, x + w / 2, y + h + 90, { size: 28, color: C.text, anchor: 'middle' }), 'ui'); l.hide(); l.show(t0 + 0.6, 1); this.parts.push(l); }
    if (this.o.yTitle) { const l = s.add(new Text(this.o.yTitle, x, y - 30, { size: 28, color: C.text, anchor: 'start' }), 'ui'); l.hide(); l.show(t0 + 0.6, 1); this.parts.push(l); }
    return this;
  }
  fadeOut(t: number, d = 0.6): void { fadeAll(this.parts, t, d); }
}

// ---- Planets ----------------------------------------------------------------------------------------------------

export interface PlanetData {
  epochUtc: string; dailyStartUtc: string;
  planets: { id: string; color: string; radiusKm: number; position: number[]; orbit: number[][]; a: number; periodDays: number }[];
  daily: Record<string, number[][]>;
}

export const NAMES: Record<string, string> = {
  SUN: 'Sun', MERCURY: 'Mercury', VENUS: 'Venus', EARTH: 'Earth', MARS: 'Mars', JUPITER: 'Jupiter', SATURN: 'Saturn',
  URANUS: 'Uranus', NEPTUNE: 'Neptune', PLUTO: 'Pluto', MOON: 'Moon',
};

/** Position of a planet on a day from the epoch of planets.json (daily samples, linear between two days). */
export function planetAt(P: PlanetData, id: string, day: number): Vec3 {
  const list = P.daily[id];
  const k0 = day + 366; // the daily samples start 366 days before the epoch
  const k = Math.max(0, Math.min(list.length - 1.001, k0));
  const i = Math.floor(k), u = k - i;
  const a = list[i], b = list[i + 1];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

/** Orbits and bodies of planets. The day function gives the day from the epoch at time t of the video. */
export function addPlanets(scene: Scene, P: PlanetData, ids: string[], day: (t: number) => number, o: { t0?: number; radius?: number; labels?: boolean; orbitWidth?: number } = {}): { orbits: Curve[]; bodies: Dot[]; labels: Text[] } {
  const orbits: Curve[] = [], bodies: Dot[] = [], labels: Text[] = [];
  const t0 = o.t0 ?? 0;
  ids.forEach((id, k) => {
    const pl = P.planets.find((x) => x.id === id)!;
    const c = scene.add(new Curve(pl.orbit, { color: pl.color, width: o.orbitWidth ?? 2, closed: true }), 'back');
    c.stroke.initial = pl.color;
    c.hide(); c.create(t0 + 0.12 * k, 1.4);
    c.opacity.to(0.55, t0 + 0.12 * k + 1.4, 0.6);
    const b = scene.add(new Dot(scene.defs, (t) => planetAt(P, id, day(t)), { color: pl.color, radius: o.radius ?? 9 }));
    fadeIn(b, t0 + 0.12 * k + 0.8, 0.5);
    orbits.push(c); bodies.push(b);
    if (o.labels) {
      const l = scene.add(new Text(NAMES[id], 0, -18, { size: 24, color: pl.color, anchor: 'middle', at: (t) => planetAt(P, id, day(t)) }), 'front');
      fadeIn(l, t0 + 0.12 * k + 1, 0.5);
      labels.push(l);
    }
  });
  return { orbits, bodies, labels };
}

/** The Sun at the origin. */
export function addSun(scene: Scene, t0: number, radius = 20): Dot {
  const s = scene.add(new Dot(scene.defs, [0, 0, 0], { style: 'sun', radius }));
  return fadeIn(s, t0, 0.8);
}

/** A velocity arrow that starts at a moving point (world units). */
export function arrowFrom(scene: Scene, from: (t: number) => ArrayLike<number>, vec: (t: number) => ArrayLike<number>, o: { color?: string; width?: number; layer?: 'front' | 'world' } = {}): Arrow {
  return scene.add(new Arrow(from, (t) => add3(from(t), vec(t)), { color: o.color ?? C.blue, width: o.width ?? 5 }), o.layer ?? 'front');
}

/** Title card at the start of a video: the title and the number of the video. */
export function titleCard(scene: Scene, title: string, part: string, end: number): void {
  const t = write(scene, title, 960, 530, 0.3, { size: 104, weight: 600, anchor: 'middle', dur: 1.2 });
  const p = write(scene, part, 960, 610, 0.8, { size: 32, color: C.dim, anchor: 'middle', dur: 0.8 });
  fadeOut(t, end, 0.6); fadeOut(p, end, 0.6);
}

// ---- Values of the narration ------------------------------------------------------------------------------------

/**
 * The named values of the narration and the manual (tools/manual/values.mjs), in English. A scene uses the same
 * texts as the narration (dates, rounded numbers).
 */
export async function loadValues(data: <T = unknown>(name: string) => Promise<T>): Promise<(name: string) => string> {
  const D: Record<string, unknown> = {};
  for (const n of ['planets', 'orbits', 'mars', 'quick-mars', 'voyager2', 'missions', 'accuracy']) D[n] = await data(n);
  const V = makeValues(D);
  return (name) => {
    const v = V[name];
    if (v === undefined) throw new Error(`No value "${name}".`);
    return typeof v === 'string' ? v : v.en;
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Date (UTC) of a day from a start time "YYYY-MM-DD hh:mm...": "14 October 2026". */
export function dayDate(startUtc: string, day: number): string {
  const t = Date.parse(startUtc.slice(0, 10) + 'T' + (startUtc.slice(11, 16) || '00:00') + ':00Z') + day * 86400000;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** Year with a fraction of a time "YYYY-MM-DD..." plus days (for time axes). */
export function yearOf(startUtc: string, day = 0): number {
  const t = Date.parse(startUtc.slice(0, 10) + 'T00:00:00Z') + day * 86400000;
  const y = new Date(t).getUTCFullYear();
  const a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
  return y + (t - a) / (b - a);
}
/** Time in milliseconds (UTC) of a text "YYYY-MM-DD", "YYYY-MM-DD hh:mm" or "YYYY-MM-DD hh:mm:ss". */
export function utcMs(text: string): number {
  return Date.parse(text.slice(0, 10) + 'T' + (text.slice(11, 19) || '00:00:00').padEnd(8, ':00').slice(0, 8) + 'Z');
}
/** Days from a start time to 1 January of a year. */
export function daysTo(startUtc: string, year: number): number {
  return (Date.UTC(year, 0, 1) - Date.parse(startUtc.slice(0, 10) + 'T' + (startUtc.slice(11, 16) || '00:00') + ':00Z')) / 86400000;
}

// ---- Cards, marks and pictures ----------------------------------------------------------------------------------

/** A card: a rectangle with a border and a dark fill (screen pixels), drawn from t0. */
export function card(scene: Scene, x: number, y: number, w: number, h: number, t0: number, o: { color?: string; fill?: string } = {}): Box {
  const b = scene.add(new Box(x, y, w, h, { color: o.color ?? '#2a3654', width: 2.5, radius: 18, fill: o.fill ?? '#0b1222', fillOpacity: 1 }), 'ui');
  b.hide(); b.create(t0, 0.7);
  return b;
}
/** A cross mark (two lines) at a screen point. */
export function crossMark(scene: Scene, cx: number, cy: number, s: number, c: string, t0: number): Curve[] {
  const a = scene.add(new Curve([[cx - s, cy - s], [cx + s, cy + s]], { space: 'screen', color: c, width: 6 }), 'ui');
  const b = scene.add(new Curve([[cx + s, cy - s], [cx - s, cy + s]], { space: 'screen', color: c, width: 6 }), 'ui');
  a.hide(); a.create(t0, 0.3); b.hide(); b.create(t0 + 0.2, 0.3);
  return [a, b];
}
/** A check mark at a screen point. */
export function checkMark(scene: Scene, cx: number, cy: number, s: number, c: string, t0: number): Curve {
  const m = scene.add(new Curve([[cx - s, cy], [cx - s * 0.3, cy + s * 0.7], [cx + s, cy - s * 0.8]], { space: 'screen', color: c, width: 6 }), 'ui');
  m.hide(); m.create(t0, 0.5);
  return m;
}
/** Move and scale a picture (the same ratio of width and height). */
export function placePicture(p: Picture, t: number, d: number, x: number, y: number, w: number, e = ease.smooth): void {
  const k = p.h.at(t) / p.w.at(t);
  p.x.to(x, t, d, e); p.y.to(y, t, d, e); p.w.to(w, t, d, e); p.h.to(w * k, t, d, e);
}
/**
 * A frame around a marked part of a picture of a screen (the boxes of the screenshot step). The picture must not
 * move after t0 while the frame shows.
 */
export function markBox(scene: Scene, p: Picture, info: ShotInfo, name: string, t0: number, o: { color?: string; pad?: number } = {}): Box {
  const b = info.boxes[name];
  if (!b) throw new Error(`The picture ${info.name} has no box "${name}".`);
  const pad = o.pad ?? 6;
  const [x0, y0] = p.toScreen(b[0], b[1], t0);
  const [x1, y1] = p.toScreen(b[0] + b[2], b[1] + b[3], t0);
  const m = scene.add(new Box(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, { color: o.color ?? C.craft, width: 5, radius: 12 }), 'ui');
  m.hide(); m.create(t0, 0.7);
  return m;
}
/** Break a text into lines that are not wider than w (screen pixels) at a size and weight. */
export function wrap(s: string, w: number, size: number, weight: Weight = 400): string {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word;
    if (cur && textWidth(next, size, weight) > w) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

/** Line segments (world or screen points): for contour lines. Each segment is [x0, y0, x1, y1] (or 3D points). */
export class Segments extends Mob {
  private readonly path: SVGPathElement;
  stroke: Track<string>;
  constructor(readonly segs: [ArrayLike<number>, ArrayLike<number>][], readonly o: { space?: 'world' | 'screen'; color?: string; width?: number; dash?: string } = {}) {
    super();
    this.stroke = color(o.color ?? C.text);
    this.path = svgEl('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-width': o.width ?? 2 }, this.el);
    if (o.dash) this.path.setAttribute('stroke-dasharray', o.dash);
  }
  draw(t: number, cam: Camera): void {
    const proj = (p: ArrayLike<number>) => (this.o.space === 'screen' ? [p[0], p[1]] : cam.project(p));
    let d = '';
    for (const [a, b] of this.segs) { const p = proj(a), q = proj(b); d += `M${f2(p[0])} ${f2(p[1])}L${f2(q[0])} ${f2(q[1])}`; }
    this.path.setAttribute('d', d);
    this.path.setAttribute('stroke', this.stroke.at(t));
  }
}
