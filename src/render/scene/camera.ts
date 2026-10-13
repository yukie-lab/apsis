/**
 * Camera control of the 3D scene: the camera moves on a sphere around the object in focus.
 * The distance changes on a logarithmic scale, from some metres (a spacecraft) to the size of the solar system.
 * Pointer: one finger or the left button turns the view, two fingers or the wheel change the distance.
 * Keyboard (the canvas has the focus): the arrow keys turn the view, + and - change the distance.
 */
export interface CameraPose { az: number; el: number; dist: number }

const EL_MAX = 1.553; // 89 degrees
const TWO_PI = 2 * Math.PI;
const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** Difference b - a of two angles, between -pi and pi. */
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
  return d;
};

export class OrbitCamera {
  /** Azimuth and elevation of the camera as seen from the focus, rad (world axes: +Z is up). */
  az = 0.9;
  el = 0.45;
  /** Distance from the focus, km. */
  dist = 1e9;
  minDist = 1e-3;
  maxDist = 3e10;
  /** Called when the user moves the view. */
  onUser: (() => void) | null = null;
  /** True while a pointer is down on the view. */
  dragging = false;
  private anim: { from: CameraPose; to: CameraPose; t: number; duration: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private vAz = 0;
  private vEl = 0;
  private lastMove = 0;
  private pinch = 0;
  private changed = true;

  constructor(private readonly el_: HTMLElement) {
    el_.addEventListener('pointerdown', this.down);
    el_.addEventListener('pointermove', this.move);
    el_.addEventListener('pointerup', this.up);
    el_.addEventListener('pointercancel', this.up);
    el_.addEventListener('wheel', this.wheel, { passive: false });
    el_.addEventListener('keydown', this.key);
  }
  dispose(): void {
    const e = this.el_;
    e.removeEventListener('pointerdown', this.down);
    e.removeEventListener('pointermove', this.move);
    e.removeEventListener('pointerup', this.up);
    e.removeEventListener('pointercancel', this.up);
    e.removeEventListener('wheel', this.wheel);
    e.removeEventListener('keydown', this.key);
  }

  /** Progress of the animation (0 to 1, with ease), or 1 if no animation is in progress. */
  get progress(): number { return this.anim ? ease(Math.min(1, this.anim.t / this.anim.duration)) : 1; }
  get animating(): boolean { return this.anim !== null; }

  set(p: Partial<CameraPose>): void {
    this.anim = null;
    if (p.az !== undefined) this.az = p.az;
    if (p.el !== undefined) this.el = Math.max(-EL_MAX, Math.min(EL_MAX, p.el));
    if (p.dist !== undefined) this.dist = this.limit(p.dist);
    this.changed = true;
  }
  animateTo(p: Partial<CameraPose>, seconds: number): void {
    const to: CameraPose = { az: p.az ?? this.az, el: Math.max(-EL_MAX, Math.min(EL_MAX, p.el ?? this.el)), dist: this.limit(p.dist ?? this.dist) };
    this.anim = { from: { az: this.az, el: this.el, dist: this.dist }, to, t: 0, duration: Math.max(0.01, seconds) };
    this.vAz = this.vEl = 0;
  }
  /** Turn the view to a direction with a time constant (for a camera that follows a moving object). */
  follow(az: number, el: number, dt: number, tau: number): void {
    if (this.anim || this.dragging) return;
    const k = 1 - Math.exp(-dt / tau);
    const dAz = angleDiff(this.az, az) * k, dEl = (el - this.el) * k;
    if (Math.abs(dAz) + Math.abs(dEl) < 1e-6) return;
    this.az += dAz;
    this.el = Math.max(-EL_MAX, Math.min(EL_MAX, this.el + dEl));
    this.changed = true;
  }
  private limit(d: number): number { return Math.max(this.minDist, Math.min(this.maxDist, d)); }

  /** Advance the animation and the motion after a drag. Returns true if the pose changed. */
  update(dt: number): boolean {
    let changed = this.changed;
    this.changed = false;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const u = ease(Math.min(1, a.t / a.duration));
      this.az = a.from.az + angleDiff(a.from.az, a.to.az) * u;
      this.el = a.from.el + (a.to.el - a.from.el) * u;
      this.dist = Math.exp(Math.log(a.from.dist) + (Math.log(a.to.dist) - Math.log(a.from.dist)) * u);
      if (a.t >= a.duration) this.anim = null;
      changed = true;
    } else if (!this.dragging && (Math.abs(this.vAz) > 1e-4 || Math.abs(this.vEl) > 1e-4)) {
      this.az += this.vAz * dt;
      this.el = Math.max(-EL_MAX, Math.min(EL_MAX, this.el + this.vEl * dt));
      const k = Math.exp(-dt / 0.22);
      this.vAz *= k; this.vEl *= k;
      changed = true;
    }
    const d = this.limit(this.dist);
    if (d !== this.dist) { this.dist = d; changed = true; }
    return changed;
  }

  private user(): void {
    this.anim = null;
    this.changed = true;
    this.onUser?.();
  }
  private down = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.el_.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.dragging = true;
    this.vAz = this.vEl = 0;
    this.pinch = 0;
    this.lastMove = performance.now();
  };
  private move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1) {
      if (dx === 0 && dy === 0) return;
      const k = 0.0055;
      const now = performance.now();
      const dt = Math.max(0.004, (now - this.lastMove) / 1000);
      this.lastMove = now;
      this.az -= dx * k;
      this.el = Math.max(-EL_MAX, Math.min(EL_MAX, this.el + dy * k));
      // Speed for the motion after the drag (mean of the last moves).
      this.vAz = 0.6 * this.vAz + 0.4 * ((-dx * k) / dt);
      this.vEl = 0.6 * this.vEl + 0.4 * ((dy * k) / dt);
      this.user();
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) { this.dist = this.limit((this.dist * this.pinch) / d); this.user(); }
      this.pinch = d;
      this.vAz = this.vEl = 0;
    }
  };
  private up = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
    this.dragging = this.pointers.size > 0;
    // A finger that stays for a moment before it leaves the screen gives no motion after the drag.
    if (performance.now() - this.lastMove > 90) this.vAz = this.vEl = 0;
  };
  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    this.dist = this.limit(this.dist * Math.exp(Math.max(-1.2, Math.min(1.2, e.deltaY * unit * 0.0014))));
    this.user();
  };
  private key = (e: KeyboardEvent): void => {
    const step = 0.09;
    if (e.key === 'ArrowLeft') this.az += step;
    else if (e.key === 'ArrowRight') this.az -= step;
    else if (e.key === 'ArrowUp') this.el = Math.min(EL_MAX, this.el + step);
    else if (e.key === 'ArrowDown') this.el = Math.max(-EL_MAX, this.el - step);
    else if (e.key === '+' || e.key === '=') this.dist = this.limit(this.dist / 1.25);
    else if (e.key === '-' || e.key === '_') this.dist = this.limit(this.dist * 1.25);
    else return;
    e.preventDefault();
    this.user();
  };
}
