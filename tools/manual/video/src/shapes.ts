/**
 * Shapes of the video frames. "world" shapes have points in world units (the camera projects them); "screen"
 * shapes have points in pixels.
 */
import { Mob, Camera, num, color, vec, svgEl, f2, clamp01, type Vec3, Track, lerp } from './core';

type Space = 'world' | 'screen';
type Points = ArrayLike<number>[];

export interface CurveOptions {
  space?: Space;
  color?: string;
  width?: number;
  dash?: string;
  closed?: boolean;
  fill?: string;
  fillOpacity?: number;
  /** Line end shape. */
  cap?: 'round' | 'butt';
}

/** Point at a fraction f (0 to 1) of a polyline, by the index (the samples have equal time steps in most data). */
function pointAt(pts: Points, f: number): number[] {
  const n = pts.length - 1;
  const x = clamp01(f) * n;
  const k = Math.min(n - 1, Math.floor(x));
  const u = x - k;
  const a = pts[k], b = pts[k + 1] ?? a;
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2] ?? 0, b[2] ?? 0, u)];
}

/**
 * A polyline. Tracks: end (0 to 1: the part from the start that shows), start (0 to 1: the part before it does not
 * show), color, width. The points can change in time (setPoints with a function).
 */
export class Curve extends Mob {
  end = num(1);
  start = num(0);
  stroke: Track<string>;
  width: Track<number>;
  private readonly path: SVGPathElement;
  private pts: Points;
  private pointsAt?: (t: number) => Points;
  constructor(points: Points, readonly o: CurveOptions = {}) {
    super();
    this.pts = points;
    this.stroke = color(o.color ?? '#e2e9f6');
    this.width = num(o.width ?? 3);
    this.path = svgEl('path', { fill: o.fill ?? 'none', 'stroke-linecap': o.cap ?? 'round', 'stroke-linejoin': 'round' }, this.el);
    if (o.fill) this.path.setAttribute('fill-opacity', String(o.fillOpacity ?? 1));
    if (o.dash) this.path.setAttribute('stroke-dasharray', o.dash);
  }
  setPoints(f: (t: number) => Points): this { this.pointsAt = f; return this; }
  draw(t: number, cam: Camera): void {
    const pts = this.pointsAt ? this.pointsAt(t) : this.pts;
    const a = this.start.at(t), b = this.end.at(t);
    if (b <= a || pts.length < 2) { this.path.setAttribute('d', ''); return; }
    const n = pts.length - 1;
    const proj = (p: ArrayLike<number>) => (this.o.space === 'screen' ? [p[0], p[1]] : cam.project(p));
    const parts: string[] = [];
    const first = proj(pointAt(pts, a));
    parts.push(`M${f2(first[0])} ${f2(first[1])}`);
    const k0 = Math.floor(a * n) + 1, k1 = Math.ceil(b * n) - 1;
    for (let k = k0; k <= k1; k++) { const q = proj(pts[k]); parts.push(`L${f2(q[0])} ${f2(q[1])}`); }
    const last = proj(pointAt(pts, b));
    parts.push(`L${f2(last[0])} ${f2(last[1])}`);
    if (this.o.closed && a <= 0 && b >= 1) parts.push('Z');
    this.path.setAttribute('d', parts.join(''));
    this.path.setAttribute('stroke', this.stroke.at(t));
    this.path.setAttribute('stroke-width', f2(this.width.at(t)));
  }
  /** Draw the curve from its start to its end. */
  create(t0: number, duration = 1.5, e?: (u: number) => number): this {
    this.opacity.set(1, t0);
    this.end.set(0, t0).to(1, t0, duration, e);
    return this;
  }
  /** Point of the curve at a fraction of its samples (world or screen units). */
  pointAt(f: number, t = 0): number[] { return pointAt(this.pointsAt ? this.pointsAt(t) : this.pts, f); }
}

export type BodyStyle = 'planet' | 'sun' | 'craft' | 'plain' | 'ring';

export interface DotOptions { space?: Space; radius?: number; color?: string; style?: BodyStyle }

let gradientId = 0;

/** A body or a point: a disc of a constant size in pixels at a world point (or a screen point). */
export class Dot extends Mob {
  pos: Track<Vec3>;
  radius: Track<number>;
  fill: Track<string>;
  private posAt?: (t: number) => ArrayLike<number>;
  private readonly shape: SVGElement;
  private readonly glow?: SVGCircleElement;
  constructor(defs: SVGDefsElement, p: Vec3 | ((t: number) => ArrayLike<number>), readonly o: DotOptions = {}) {
    super();
    if (typeof p === 'function') { this.posAt = p; this.pos = vec([0, 0, 0]); } else this.pos = vec(p);
    this.radius = num(o.radius ?? 8);
    this.fill = color(o.color ?? '#e2e9f6');
    const style = o.style ?? 'planet';
    if (style === 'sun') {
      const id = `g${gradientId++}`;
      const grad = svgEl('radialGradient', { id }, defs);
      svgEl('stop', { offset: '0%', 'stop-color': '#fff6d8', 'stop-opacity': 1 }, grad);
      svgEl('stop', { offset: '35%', 'stop-color': '#ffd166', 'stop-opacity': 0.9 }, grad);
      svgEl('stop', { offset: '100%', 'stop-color': '#ffb454', 'stop-opacity': 0 }, grad);
      this.glow = svgEl('circle', { fill: `url(#${id})` }, this.el);
    }
    if (style === 'craft') this.shape = svgEl('path', { stroke: '#05070c', 'stroke-width': 1.5 }, this.el);
    else if (style === 'ring') this.shape = svgEl('circle', { fill: 'none', 'stroke-width': 2.5 }, this.el);
    else this.shape = svgEl('circle', {}, this.el);
    if (style === 'planet') {
      // Light from the upper left: a gradient with the color of the body.
      const id = `g${gradientId++}`;
      const grad = svgEl('radialGradient', { id, cx: '35%', cy: '30%', r: '75%' }, defs);
      this.stops = [svgEl('stop', { offset: '0%' }, grad), svgEl('stop', { offset: '100%' }, grad)];
      this.shape.setAttribute('fill', `url(#${id})`);
    }
  }
  private stops?: SVGStopElement[];
  screenPos(t: number, cam: Camera): [number, number] {
    const p = this.posAt ? this.posAt(t) : this.pos.at(t);
    if (this.o.space === 'screen') return [p[0], p[1]];
    const q = cam.project(p);
    return [q[0], q[1]];
  }
  draw(t: number, cam: Camera): void {
    const [x, y] = this.screenPos(t, cam);
    const r = this.radius.at(t), c = this.fill.at(t);
    const style = this.o.style ?? 'planet';
    if (this.glow) { this.glow.setAttribute('cx', f2(x)); this.glow.setAttribute('cy', f2(y)); this.glow.setAttribute('r', f2(r * 3.2)); }
    if (style === 'craft') {
      const s = r * 1.25;
      this.shape.setAttribute('d', `M${f2(x)} ${f2(y - s)}L${f2(x + s)} ${f2(y)}L${f2(x)} ${f2(y + s)}L${f2(x - s)} ${f2(y)}Z`);
      this.shape.setAttribute('fill', c);
      return;
    }
    this.shape.setAttribute('cx', f2(x)); this.shape.setAttribute('cy', f2(y)); this.shape.setAttribute('r', f2(style === 'sun' ? r * 0.9 : r));
    if (style === 'ring') this.shape.setAttribute('stroke', c);
    else if (this.stops) {
      this.stops[0].setAttribute('stop-color', lighten(c, 0.35));
      this.stops[1].setAttribute('stop-color', darken(c, 0.45));
    } else this.shape.setAttribute('fill', style === 'sun' ? '#fff3c4' : c);
  }
}

function mixHex(c: string, with_: number, u: number): string {
  const h = c.replace('#', '');
  const v = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  return '#' + v.map((x) => Math.round(lerp(x, with_, u)).toString(16).padStart(2, '0')).join('');
}
export const lighten = (c: string, u: number) => mixHex(c, 255, u);
export const darken = (c: string, u: number) => mixHex(c, 0, u);

export interface ArrowOptions { space?: Space; color?: string; width?: number; tip?: number }

/** An arrow from a tail point to a head point. Track grow: 0 to 1 (the arrow grows from the tail). */
export class Arrow extends Mob {
  tail: Track<Vec3>; head: Track<Vec3>;
  grow = num(1);
  stroke: Track<string>;
  private tailAt?: (t: number) => ArrayLike<number>;
  private headAt?: (t: number) => ArrayLike<number>;
  private readonly line: SVGPathElement;
  private readonly tipEl: SVGPathElement;
  constructor(tail: Vec3 | ((t: number) => ArrayLike<number>), head: Vec3 | ((t: number) => ArrayLike<number>), readonly o: ArrowOptions = {}) {
    super();
    if (typeof tail === 'function') { this.tailAt = tail; this.tail = vec([0, 0, 0]); } else this.tail = vec(tail);
    if (typeof head === 'function') { this.headAt = head; this.head = vec([0, 0, 0]); } else this.head = vec(head);
    this.stroke = color(o.color ?? '#e2e9f6');
    this.line = svgEl('path', { fill: 'none', 'stroke-linecap': 'round' }, this.el);
    this.tipEl = svgEl('path', {}, this.el);
  }
  draw(t: number, cam: Camera): void {
    const proj = (p: ArrayLike<number>) => (this.o.space === 'screen' ? [p[0], p[1]] : cam.project(p));
    const a = proj(this.tailAt ? this.tailAt(t) : this.tail.at(t));
    const h = proj(this.headAt ? this.headAt(t) : this.head.at(t));
    const g = this.grow.at(t);
    const bx = a[0] + (h[0] - a[0]) * g, by = a[1] + (h[1] - a[1]) * g;
    const L = Math.hypot(bx - a[0], by - a[1]);
    const c = this.stroke.at(t);
    const w = this.o.width ?? 4;
    if (L < 1) { this.line.setAttribute('d', ''); this.tipEl.setAttribute('d', ''); return; }
    const tip = Math.min(this.o.tip ?? 18, L * 0.45);
    const ux = (bx - a[0]) / L, uy = (by - a[1]) / L;
    const ex = bx - ux * tip * 0.8, ey = by - uy * tip * 0.8;
    this.line.setAttribute('d', `M${f2(a[0])} ${f2(a[1])}L${f2(ex)} ${f2(ey)}`);
    this.line.setAttribute('stroke', c);
    this.line.setAttribute('stroke-width', f2(w));
    const px = -uy, py = ux;
    const s = tip * 0.5;
    this.tipEl.setAttribute('d', `M${f2(bx)} ${f2(by)}L${f2(bx - ux * tip + px * s)} ${f2(by - uy * tip + py * s)}L${f2(bx - ux * tip - px * s)} ${f2(by - uy * tip - py * s)}Z`);
    this.tipEl.setAttribute('fill', c);
  }
  /** Screen points of the tail and the head at time t. */
  ends(t: number, cam: Camera): [number[], number[]] {
    const proj = (p: ArrayLike<number>) => (this.o.space === 'screen' ? [p[0], p[1]] : cam.project(p));
    return [proj(this.tailAt ? this.tailAt(t) : this.tail.at(t)), proj(this.headAt ? this.headAt(t) : this.head.at(t))];
  }
  growIn(t0: number, duration = 0.8): this {
    this.opacity.set(1, t0);
    this.grow.set(0, t0).to(1, t0, duration);
    return this;
  }
}

/** A filled polygon (world or screen points). */
export class Poly extends Mob {
  fill: Track<string>;
  private readonly path: SVGPathElement;
  private ptsAt?: (t: number) => Points;
  constructor(private pts: Points, readonly o: { space?: Space; color?: string; fillOpacity?: number; stroke?: string } = {}) {
    super();
    this.fill = color(o.color ?? '#78b7ff');
    this.path = svgEl('path', { 'fill-opacity': o.fillOpacity ?? 0.35 }, this.el);
    if (o.stroke) { this.path.setAttribute('stroke', o.stroke); this.path.setAttribute('stroke-width', '1.5'); }
  }
  setPoints(f: (t: number) => Points): this { this.ptsAt = f; return this; }
  draw(t: number, cam: Camera): void {
    const pts = this.ptsAt ? this.ptsAt(t) : this.pts;
    const proj = (p: ArrayLike<number>) => (this.o.space === 'screen' ? [p[0], p[1]] : cam.project(p));
    this.path.setAttribute('d', pts.map((p, k) => { const q = proj(p); return `${k ? 'L' : 'M'}${f2(q[0])} ${f2(q[1])}`; }).join('') + 'Z');
    this.path.setAttribute('fill', this.fill.at(t));
  }
}

/** A rectangle in screen pixels. Track draw: 0 to 1 draws the border. */
export class Box extends Mob {
  draw_ = num(1);
  x: Track<number>; y: Track<number>; w: Track<number>; h: Track<number>;
  stroke: Track<string>;
  private readonly rect: SVGRectElement;
  constructor(x: number, y: number, w: number, h: number, readonly o: { color?: string; width?: number; radius?: number; fill?: string; fillOpacity?: number } = {}) {
    super();
    this.x = num(x); this.y = num(y); this.w = num(w); this.h = num(h);
    this.stroke = color(o.color ?? '#ffb454');
    this.rect = svgEl('rect', { rx: o.radius ?? 10, fill: o.fill ?? 'none', pathLength: 1 }, this.el);
    if (o.fill) this.rect.setAttribute('fill-opacity', String(o.fillOpacity ?? 1));
  }
  draw(t: number): void {
    const r = this.rect;
    r.setAttribute('x', f2(this.x.at(t))); r.setAttribute('y', f2(this.y.at(t)));
    r.setAttribute('width', f2(Math.max(0, this.w.at(t)))); r.setAttribute('height', f2(Math.max(0, this.h.at(t))));
    r.setAttribute('stroke', this.stroke.at(t));
    r.setAttribute('stroke-width', String(this.o.width ?? 4));
    const d = this.draw_.at(t);
    if (d < 1) r.setAttribute('stroke-dasharray', `${d.toFixed(4)} 1`); else r.removeAttribute('stroke-dasharray');
  }
  create(t0: number, duration = 0.8): this {
    this.opacity.set(1, t0);
    this.draw_.set(0, t0).to(1, t0, duration);
    return this;
  }
}

/**
 * A picture (screen pixels). The window (vx, vy, vw, vh, in pixels of the picture) selects the part that shows:
 * a change of the window moves or zooms the picture in its frame.
 */
export class Picture extends Mob {
  x: Track<number>; y: Track<number>; w: Track<number>; h: Track<number>;
  win: Track<Vec3>;
  winW: Track<number>;
  private readonly inner: SVGSVGElement;
  private readonly border: SVGRectElement;
  private readonly clipRect: SVGRectElement;
  constructor(defs: SVGDefsElement, readonly href: string, readonly natural: [number, number], x: number, y: number, w: number, o: { radius?: number } = {}) {
    super();
    const h = (w * natural[1]) / natural[0];
    this.x = num(x); this.y = num(y); this.w = num(w); this.h = num(h);
    this.win = vec([0, 0, 0]);
    this.winW = num(natural[0]);
    const id = `c${gradientId++}`;
    const clip = svgEl('clipPath', { id }, defs);
    this.clipRect = svgEl('rect', { rx: o.radius ?? 14 }, clip);
    const g = svgEl('g', { 'clip-path': `url(#${id})` }, this.el);
    this.inner = svgEl('svg', { preserveAspectRatio: 'xMidYMid slice' }, g);
    svgEl('image', { href, x: 0, y: 0, width: natural[0], height: natural[1] }, this.inner);
    this.border = svgEl('rect', { rx: o.radius ?? 14, fill: 'none', stroke: '#33405e', 'stroke-width': 2 }, this.el);
  }
  draw(t: number): void {
    const x = this.x.at(t), y = this.y.at(t), w = this.w.at(t), h = this.h.at(t);
    for (const r of [this.clipRect, this.border]) { r.setAttribute('x', f2(x)); r.setAttribute('y', f2(y)); r.setAttribute('width', f2(w)); r.setAttribute('height', f2(h)); }
    this.inner.setAttribute('x', f2(x)); this.inner.setAttribute('y', f2(y)); this.inner.setAttribute('width', f2(w)); this.inner.setAttribute('height', f2(h));
    const [vx, vy] = this.win.at(t);
    const vw = this.winW.at(t), vh = (vw * h) / w;
    this.inner.setAttribute('viewBox', `${f2(vx)} ${f2(vy)} ${f2(vw)} ${f2(vh)}`);
  }
  /** Screen point of a pixel of the picture at time t (for marks on the picture). */
  toScreen(px: number, py: number, t: number): [number, number] {
    const [vx, vy] = this.win.at(t);
    const k = this.w.at(t) / this.winW.at(t);
    return [this.x.at(t) + (px - vx) * k, this.y.at(t) + (py - vy) * k];
  }
}
