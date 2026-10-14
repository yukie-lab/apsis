/**
 * Core of the video frames: tracks of values in time, objects on the stage, the camera and the scene.
 *
 * A frame is a function of the time only: render(t) sets each object from its tracks. The capture script calls
 * render(t) for each frame, thus the result does not depend on the speed of the computer.
 */

export type Vec3 = [number, number, number];
export type Ease = (u: number) => number;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

/** Easing curves. "smooth" is the default of all motions. */
export const ease = {
  linear: ((u) => u) as Ease,
  smooth: ((u) => u * u * u * (u * (u * 6 - 15) + 10)) as Ease,
  out: ((u) => 1 - (1 - u) ** 3) as Ease,
  in: ((u) => u ** 3) as Ease,
  /** Up, then down again: for a short emphasis. */
  pulse: ((u) => { const v = u < 0.5 ? 2 * u : 2 - 2 * u; return v * v * v * (v * (v * 6 - 15) + 10); }) as Ease,
};

// ---- Interpolation ---------------------------------------------------------------------------------------------

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpVec = (a: Vec3, b: Vec3, u: number): Vec3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
/** Log interpolation for a scale (a zoom looks uniform). */
const lerpLog = (a: number, b: number, u: number) => Math.exp(lerp(Math.log(a), Math.log(b), u));

function parseColor(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
const hex = (x: number) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
export function lerpColor(a: string, b: string, u: number): string {
  if (a === b) return a;
  const A = parseColor(a), B = parseColor(b);
  return '#' + hex(lerp(A[0], B[0], u)) + hex(lerp(A[1], B[1], u)) + hex(lerp(A[2], B[2], u));
}

// ---- Tracks ----------------------------------------------------------------------------------------------------

interface Segment<T> { t0: number; t1: number; from: T; to: T; ease: Ease }

/**
 * A value that changes in time. Each call of `to` adds a change that starts at t0 and ends at t0 + duration. The
 * start value of a change is the value of the track at t0, thus the changes must be added in the sequence of time.
 */
export class Track<T> {
  private segs: Segment<T>[] = [];
  constructor(public initial: T, private readonly mix: (a: T, b: T, u: number) => T) {}
  at(t: number, done = 0): T {
    let v = this.initial;
    for (const s of this.segs) {
      if (t < s.t0) break;
      // After the change: the end value. A pulse (an ease that goes back to 0) ends at its start value.
      v = t >= s.t1 - done ? (s.ease(1) < 0.5 ? s.from : s.to) : this.mix(s.from, s.to, s.ease((t - s.t0) / (s.t1 - s.t0)));
    }
    return v;
  }
  to(value: T, t0: number, duration = 0, e: Ease = ease.smooth): this {
    const last = this.segs[this.segs.length - 1];
    if (last && t0 < last.t0 - 1e-9) throw new Error(`Track: a change at ${t0.toFixed(3)} s comes before the change at ${last.t0.toFixed(3)} s.`);
    // The start value: a change with no duration at t0 (set) is complete at t0.
    this.segs.push({ t0, t1: t0 + Math.max(duration, 1e-6), from: this.at(t0, 2e-6), to: value, ease: e });
    return this;
  }
  /** Value at t: the same as `to` with no duration. */
  set(value: T, t: number): this { return this.to(value, t, 0); }
  /** Time of the last change. */
  get end(): number { return this.segs.length ? this.segs[this.segs.length - 1].t1 : 0; }
}

export const num = (v: number) => new Track<number>(v, lerp);
export const vec = (v: Vec3) => new Track<Vec3>(v, lerpVec);
export const color = (v: string) => new Track<string>(v, lerpColor);
export const zoom = (v: number) => new Track<number>(v, lerpLog);

// ---- SVG -------------------------------------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';
export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.appendChild(el);
  return el;
}
/** Number for an attribute (short text, no exponent). */
export const f2 = (x: number) => (Math.abs(x) < 1e-9 ? '0' : x.toFixed(2));

// ---- Camera ----------------------------------------------------------------------------------------------------

/**
 * Orthographic camera of the world objects. World units are free (au in most scenes). pitch = 0: view from +z
 * (top view, x to the right, y up). pitch = 90: view from -y with +z up. yaw turns the world about z.
 */
export class Camera {
  center = vec([0, 0, 0]);
  /** Screen pixels for one world unit. */
  scale = zoom(100);
  yaw = num(0);
  pitch = num(0);
  /** Screen position of the center. */
  screen = vec([960, 540, 0]);
  private c: Vec3 = [0, 0, 0]; private s = 100; private cy = 1; private sy = 0; private cp = 1; private sp = 0; private o: Vec3 = [960, 540, 0];
  update(t: number): void {
    this.c = this.center.at(t); this.s = this.scale.at(t);
    const y = (this.yaw.at(t) * Math.PI) / 180, p = (this.pitch.at(t) * Math.PI) / 180;
    this.cy = Math.cos(y); this.sy = Math.sin(y); this.cp = Math.cos(p); this.sp = Math.sin(p);
    this.o = this.screen.at(t);
  }
  /** Screen x, y and depth (larger: nearer to the viewer) of a world point. */
  project(p: ArrayLike<number>): [number, number, number] {
    const x0 = p[0] - this.c[0], y0 = p[1] - this.c[1], z0 = (p[2] ?? 0) - this.c[2];
    const x = this.cy * x0 + this.sy * y0;
    const y = -this.sy * x0 + this.cy * y0;
    const up = y * this.cp + z0 * this.sp;
    const depth = -y * this.sp + z0 * this.cp;
    return [this.o[0] + this.s * x, this.o[1] - this.s * up, depth];
  }
  get pxPerUnit(): number { return this.s; }
}

// ---- Objects ---------------------------------------------------------------------------------------------------

export abstract class Mob {
  readonly el: SVGGElement;
  opacity = num(1);
  /** Functions that the scene calls at each frame, after the tracks. */
  readonly updaters: ((t: number) => void)[] = [];
  constructor() { this.el = svgEl('g'); }
  /** Apply the tracks at time t. */
  abstract draw(t: number, cam: Camera): void;
  render(t: number, cam: Camera): void {
    const o = this.opacity.at(t);
    if (o <= 0.001) { this.el.setAttribute('display', 'none'); return; }
    this.el.removeAttribute('display');
    this.el.setAttribute('opacity', o >= 0.999 ? '1' : o.toFixed(3));
    this.draw(t, cam);
    for (const u of this.updaters) u(t);
  }
  /** Hidden at the start: opacity 0 until an animation shows the object. */
  hide(): this { this.opacity.initial = 0; return this; }
}

/** A group of objects in one SVG group, with a common opacity and an offset in screen pixels. */
export class Group extends Mob {
  readonly children: Mob[] = [];
  dx = num(0); dy = num(0); scale = num(1);
  /** Point of the scale (screen pixels). */
  origin: [number, number] = [960, 540];
  add<T extends Mob>(m: T): T { this.children.push(m); this.el.appendChild(m.el); return m; }
  draw(t: number, cam: Camera): void {
    const dx = this.dx.at(t), dy = this.dy.at(t), s = this.scale.at(t);
    if (dx || dy || s !== 1) {
      const [ox, oy] = this.origin;
      this.el.setAttribute('transform', `translate(${f2(dx + ox * (1 - s))} ${f2(dy + oy * (1 - s))}) scale(${s.toFixed(4)})`);
    } else this.el.removeAttribute('transform');
    for (const c of this.children) c.render(t, cam);
  }
}

// ---- Scene -----------------------------------------------------------------------------------------------------

export class Scene {
  readonly camera = new Camera();
  readonly root: SVGGElement;
  private readonly layers: Record<'back' | 'world' | 'front' | 'ui', SVGGElement>;
  private readonly mobs: { m: Mob; layer: string }[] = [];
  readonly defs: SVGDefsElement;
  duration = 0;
  constructor(readonly svg: SVGSVGElement) {
    svg.innerHTML = '';
    this.defs = svgEl('defs', {}, svg);
    svgEl('rect', { x: 0, y: 0, width: 1920, height: 1080, fill: '#05070c' }, svg);
    this.root = svgEl('g', {}, svg);
    this.layers = { back: svgEl('g', {}, this.root), world: svgEl('g', {}, this.root), front: svgEl('g', {}, this.root), ui: svgEl('g', {}, this.root) };
  }
  /** Add an object. Layers: back (grids), world (orbits, bodies), front (labels, arrows), ui (text, pictures). */
  add<T extends Mob>(m: T, layer: 'back' | 'world' | 'front' | 'ui' = 'world'): T {
    this.mobs.push({ m, layer });
    this.layers[layer].appendChild(m.el);
    return m;
  }
  remove(m: Mob): void {
    const k = this.mobs.findIndex((x) => x.m === m);
    if (k >= 0) { this.mobs.splice(k, 1); m.el.remove(); }
  }
  render(t: number): void {
    this.camera.update(t);
    for (const { m } of this.mobs) m.render(t, this.camera);
  }
}

export { clamp01 };
