/**
 * Shared spacecraft parts: reflector antennas, truss booms, radioisotope generators, rocket
 * nozzles, thruster pods, star trackers, louvers, solar panels, small antennas and cables.
 *
 * Every part draws into a `Ctx`. The text of each function says where the local origin is and
 * which way the part points.
 */
import * as THREE from 'three';
import type { Ctx } from './builder';
import { arcProfile, box, cyl, disc, extrude, lathe, parabola, plane, polar, tubePath, vadd, vlerp, vscale } from './geometry';
import type { Geo, P2, ProfilePoint, V3 } from './geometry';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------
// Reflector antennas
// ---------------------------------------------------------------------------------------------

export interface DishOptions {
  diameter: number;
  /** Focal length divided by the diameter. Default 0.36. */
  fd?: number;
  /** Number of radial paint seams. */
  gores?: number;
  /** Number of ring paint seams. */
  seams?: number;
  front?: THREE.Material;
  back?: THREE.Material;
  /** Number of radial ribs on the back (0 = none). */
  ribs?: number;
  /** Depth of a rib at the hub (m). */
  ribDepth?: number;
  ribMat?: THREE.Material;
  /** Radii of the ring stiffeners on the back, as fractions of the dish radius. */
  backRings?: readonly number[];
  /** Radius of a central hole (m). */
  hole?: number;
  thickness?: number;
  seg?: number;
}

export interface DishInfo {
  radius: number;
  focal: number;
  /** Height of the rim above the vertex. */
  depth: number;
  thickness: number;
  /** Height of the reflecting surface at radius `r`. */
  z(r: number): number;
}

/**
 * Parabolic reflector. The vertex is at the origin and the dish opens along +Z.
 * Front: painted surface with panel seams. Back: shell with ribs and ring stiffeners. Rounded rim.
 */
export function dish(c: Ctx, o: DishOptions): DishInfo {
  const m = c.mat;
  const R = o.diameter / 2;
  const f = (o.fd ?? 0.36) * o.diameter;
  const t = o.thickness ?? 0.024;
  const seg = o.seg ?? 64;
  const hole = o.hole ?? 0;
  const z = (r: number): number => (r * r) / (4 * f);
  const front = o.front ?? m.dishWhite;
  const back = o.back ?? m.paintWhite;
  const ribMat = o.ribMat ?? back;
  const steps = 14;

  c.add(lathe(parabola(hole, R, f, steps).reverse(), seg, { unitUv: true }), front, {
    uv: [(o.gores ?? 24) / 2, (o.seams ?? 4) / 2],
  });
  c.add(lathe(parabola(hole, R, f, steps, -t), seg), back);
  c.add(lathe(arcProfile(R, z(R) - t / 2, t / 2 + 0.005, -Math.PI / 2, Math.PI / 2, 5), seg), m.paintWhite);
  if (hole > 0) c.add(lathe([[hole, z(hole)], [hole, z(hole) - t]], seg), back);

  const ribs = o.ribs ?? 0;
  if (ribs > 0) {
    const d0 = o.ribDepth ?? R * 0.1;
    const ra = Math.max(hole, R * 0.1);
    const rb = R * 0.975;
    const n = 8;
    const outline: P2[] = [];
    for (let k = 0; k <= n; k++) {
      const r = ra + ((rb - ra) * k) / n;
      outline.push([r, z(r) - t - (d0 * (1 - k / n) + 0.014)]);
    }
    for (let k = n; k >= 0; k--) {
      const r = ra + ((rb - ra) * k) / n;
      outline.push([r, z(r) - t + 0.003]);
    }
    const rib = extrude(outline, -0.007, 0.007);
    for (let k = 0; k < ribs; k++) c.rotZ((TAU * (k + 0.5)) / ribs).rotX(Math.PI / 2).inst('dishRib', rib, ribMat);
  }
  for (const fr of o.backRings ?? []) {
    const r = R * fr;
    const w = 0.03;
    const h = 0.05;
    const zi = z(r - w / 2) - t;
    const zo = z(r + w / 2) - t;
    c.add(lathe([[r - w / 2, zi + 0.003], [r - w / 2, zi - h, 1], [r + w / 2, zo - h, 1], [r + w / 2, zo + 0.003]], seg), ribMat);
  }
  return { radius: R, focal: f, depth: z(R), thickness: t, z };
}

export interface CassegrainOptions {
  subDiameter: number;
  /** Height of the rim of the subreflector. Default 0.86 of the focal length. */
  subZ?: number;
  struts?: number;
  /** Radius where the struts stand on the dish, as a fraction of the dish radius. */
  strutAt?: number;
  strutR?: number;
  strutMat?: THREE.Material;
  /** Mouth radius and length of the feed horn at the vertex (0 = no horn). */
  hornR?: number;
  hornLen?: number;
  /** Rotation of the strut pattern about the axis (rad). */
  phase?: number;
}

export interface FeedInfo {
  /** Height of the top of the subreflector housing. */
  topZ: number;
  subZ: number;
  subR: number;
}

/** Subreflector on struts, and the feed horn at the vertex of a dish (same origin and axis as the dish). */
export function cassegrain(c: Ctx, d: DishInfo, o: CassegrainOptions): FeedInfo {
  const m = c.mat;
  const rs = o.subDiameter / 2;
  const zs = o.subZ ?? d.focal * 0.86;
  const bulge = rs * 0.3;
  const prof: ProfilePoint[] = [];
  for (let k = 0; k <= 6; k++) {
    const r = (rs * k) / 6;
    prof.push([r, zs - bulge * (1 - (r / rs) * (r / rs))]);
  }
  prof[6] = [rs, zs, 1];
  prof.push([rs, zs + 0.014, 1], [rs * 0.55, zs + rs * 0.42], [rs * 0.3, zs + rs * 0.5, 1], [0, zs + rs * 0.5]);
  c.add(lathe(prof, 32), m.paintWhite);
  const topZ = zs + rs * 0.5;

  const n = o.struts ?? 4;
  const rd = d.radius * (o.strutAt ?? 0.62);
  const sr = o.strutR ?? 0.013;
  const sm = o.strutMat ?? m.paintWhite;
  for (let k = 0; k < n; k++) {
    const a = (o.phase ?? 0) + (TAU * k) / n;
    const foot = polar(rd, a, d.z(rd));
    const head = polar(rs * 0.96, a, zs + 0.007);
    c.strut(foot, head, sr, sm, 8);
    c.at(foot).cyl(sr * 2.4, -0.004, 0.02, sm, 10);
    c.at(head).add(box(sr * 4, sr * 4, sr * 2.5, 0), sm);
  }

  const hr = o.hornR ?? rs * 0.42;
  const hl = o.hornLen ?? rs * 0.9;
  if (hr > 0) {
    const r0 = hr * 0.42;
    const z0 = -0.004;
    c.add(
      lathe(
        [
          [r0 * 1.7, z0], [r0 * 1.7, 0.03, 1], [r0, 0.03, 1], [r0, hl * 0.32], [hr, hl, 1], [hr - 0.006, hl, 1],
        ],
        24,
      ),
      m.paintWhite,
    );
    c.add(lathe([[hr - 0.006, hl], [r0 * 0.8, hl * 0.34, 1], [0, hl * 0.34]], 24), m.paintBlack);
    for (let k = 1; k <= 3; k++) {
      const zz = hl * (0.4 + 0.18 * k);
      const rr = r0 + ((hr - r0) * (zz - hl * 0.32)) / (hl * 0.68);
      c.add(lathe([[rr, zz - 0.006], [rr + 0.008, zz - 0.006, 1], [rr + 0.008, zz + 0.006, 1], [rr, zz + 0.006]], 24), m.paintWhite);
    }
  }
  return { topZ, subZ: zs, subR: rs };
}

// ---------------------------------------------------------------------------------------------
// Truss booms
// ---------------------------------------------------------------------------------------------

export interface TrussOptions {
  length: number;
  /** Side length of the cross-section at the root. */
  width: number;
  /** Side length at the tip (default: same as the root). */
  endWidth?: number;
  bays: number;
  sides?: number;
  longeron?: number;
  batten?: number;
  diagonal?: number;
  mat?: THREE.Material;
  diagMat?: THREE.Material;
  /** Two diagonals per bay face instead of one. */
  cross?: boolean;
  phase?: number;
}

/** Lattice boom from the origin along +Z: longerons, battens and diagonals (all instanced). */
export function trussBoom(c: Ctx, o: TrussOptions): void {
  const sides = o.sides ?? 3;
  const mat = o.mat ?? c.mat.fibre;
  const diagMat = o.diagMat ?? mat;
  const k0 = 1 / (2 * Math.sin(Math.PI / sides));
  const rad0 = o.width * k0;
  const rad1 = (o.endWidth ?? o.width) * k0;
  const pt = (i: number, j: number): V3 => {
    const f = i / o.bays;
    const rad = rad0 + (rad1 - rad0) * f;
    const a = (TAU * j) / sides + (o.phase ?? 0);
    return [rad * Math.cos(a), rad * Math.sin(a), o.length * f];
  };
  const lr = o.longeron ?? 0.008;
  const br = o.batten ?? lr * 0.75;
  const dr = o.diagonal ?? lr * 0.5;
  for (let j = 0; j < sides; j++) {
    const jn = (j + 1) % sides;
    c.strut(pt(0, j), pt(o.bays, j), lr, mat, 6, true);
    for (let i = 0; i < o.bays; i++) {
      if ((i + j) % 2 === 0 || o.cross) c.strut(pt(i, j), pt(i + 1, jn), dr, diagMat, 4, false);
      if ((i + j) % 2 === 1 || o.cross) c.strut(pt(i, jn), pt(i + 1, j), dr, diagMat, 4, false);
    }
    for (let i = 0; i <= o.bays; i++) c.strut(pt(i, j), pt(i, jn), br, mat, 4, false);
  }
}

// ---------------------------------------------------------------------------------------------
// Radioisotope generators
// ---------------------------------------------------------------------------------------------

export interface RtgOptions {
  /** Length of the case. */
  length: number;
  /** Radius of the case. */
  coreR: number;
  /** Radius at the tips of the fins. */
  finR: number;
  fins: number;
  finT?: number;
  /** Fraction of the length that the fins cover. Default 0.86. */
  finSpan?: number;
  /** Length of the slope at each end of a fin (m). */
  finTaper?: number;
  /** Thin cooling tubes along the case, between the fins. */
  tubes?: boolean;
  body?: THREE.Material;
  /** Colour factor of the case (sRGB hex). The default makes the case a little darker than the fins. */
  bodyTint?: number;
  finMat?: THREE.Material;
  /** Colour factor of the fins (sRGB hex). */
  finTint?: number;
  trim?: THREE.Material;
}

/** Radioisotope generator along +Z from the origin: case with end flanges and domes, radial fins. */
export function rtg(c: Ctx, o: RtgOptions): void {
  const m = c.mat;
  const body = o.body ?? m.generator;
  const finMat = o.finMat ?? body;
  const trim = o.trim ?? m.aluminium;
  const L = o.length;
  const r = o.coreR;
  const fl = Math.min(0.03, L * 0.06);
  c.add(
    lathe(
      [
        [0, -r * 0.2], [r * 0.5, -r * 0.15], [r * 0.84, -r * 0.04], [r * 0.9, 0, 1],
        [r * 1.1, 0, 1], [r * 1.1, fl, 1], [r, fl, 1],
        [r, L - fl, 1], [r * 1.1, L - fl, 1], [r * 1.1, L, 1], [r * 0.9, L, 1],
        [r * 0.84, L + r * 0.04], [r * 0.5, L + r * 0.15], [0, L + r * 0.2],
      ],
      24,
    ),
    body,
    { tint: o.bodyTint ?? 0xb4b4b8 },
  );
  c.cyl(r * 0.2, L + r * 0.12, L + r * 0.42, trim, 10);
  c.cyl(r * 0.34, -r * 0.3, -r * 0.1, trim, 12);

  const span = o.finSpan ?? 0.86;
  const z0 = (L * (1 - span)) / 2;
  const z1 = L - z0;
  const tp = o.finTaper ?? (o.finR - r) * 0.7;
  const fin = extrude([[r * 0.96, z0], [o.finR, z0 + tp], [o.finR, z1 - tp], [r * 0.96, z1]], -(o.finT ?? 0.006) / 2, (o.finT ?? 0.006) / 2);
  for (let k = 0; k < o.fins; k++) c.rotZ((TAU * k) / o.fins).rotX(Math.PI / 2).inst('rtgFin', fin, finMat, o.finTint ?? 0xffffff);
  if (o.tubes) {
    for (let k = 0; k < o.fins; k++) {
      const a = (TAU * (k + 0.5)) / o.fins;
      c.strut(polar(r + 0.011, a, z0), polar(r + 0.011, a, z1), 0.008, trim, 6);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Rocket engines
// ---------------------------------------------------------------------------------------------

export interface NozzleOptions {
  exitR: number;
  /** Length of the bell, from the throat to the exit. */
  length: number;
  throatR?: number;
  chamberR?: number;
  chamberLen?: number;
  mat?: THREE.Material;
  inner?: THREE.Material;
  seg?: number;
}

/** Rocket engine: the chamber starts at the origin, the bell opens along +Z. Returns the height of the exit. */
export function nozzle(c: Ctx, o: NozzleOptions): number {
  const m = c.mat;
  const re = o.exitR;
  const rt = o.throatR ?? re * 0.2;
  const rc = o.chamberR ?? rt * 2;
  const lc = o.chamberLen ?? rc * 1.7;
  const zt = lc + (rc - rt) * 1.25;
  const L = o.length;
  const wall = Math.max(0.0025, re * 0.035);
  const seg = o.seg ?? 24;
  const n = 10;
  const bell: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const a = (1 - s) * (1 - s);
    const b = 2 * s * (1 - s);
    const d = s * s;
    bell.push([a * rt + b * (rt + 0.74 * (re - rt)) + d * re, a * zt + b * (zt + 0.36 * L) + d * (zt + L)]);
  }
  const outer: ProfilePoint[] = [[0, 0], [rc * 0.8, 0, 2], [rc, rc * 0.2], [rc, lc]];
  for (const p of bell) outer.push([p[0], p[1]]);
  outer[outer.length - 1] = [re, zt + L, 1];
  outer.push([re - wall, zt + L]);
  c.add(lathe(outer, seg), o.mat ?? m.nozzle);
  const inner: ProfilePoint[] = [];
  for (let k = n; k >= 0; k--) inner.push([Math.max(0.001, bell[k][0] - wall), bell[k][1]]);
  inner[inner.length - 1] = [inner[inner.length - 1][0], zt, 1];
  inner.push([0, zt]);
  c.add(lathe(inner, seg), o.inner ?? m.nozzleInner);
  // Stiffening ring near the exit and the injector flange.
  c.add(lathe([[re * 0.985, zt + L * 0.9], [re * 1.05, zt + L * 0.9, 1], [re * 1.05, zt + L * 0.93, 1], [re * 0.995, zt + L * 0.93]], seg), o.mat ?? m.nozzle);
  c.cyl(rc * 1.25, -rc * 0.25, rc * 0.08, m.titanium, 16);
  return zt + L;
}

let thrusterGeo: { bell: Geo; inside: Geo; valve: Geo } | null = null;

/**
 * Small attitude thruster: valve body at the origin, nozzle along +Z. `size` is the exit radius.
 * All thrusters of a model share three low-detail geometries (they are a few centimetres long).
 */
export function thruster(c: Ctx, size: number): void {
  const m = c.mat;
  // Unit thruster with exit radius 1: chamber, throat and bell; the dark inside; the valve body.
  thrusterGeo ??= {
    bell: lathe([[0, 0], [0.55, 0, 1], [0.55, 1.3], [0.28, 1.65], [0.7, 2.9], [1, 4.05, 1], [0.92, 4.05]], 10),
    inside: lathe([[0.92, 4.05], [0.62, 2.9], [0.2, 1.65, 1], [0, 1.65]], 10),
    valve: lathe([[0, -2.5], [1, -2.5, 1], [1, -2.2, 1], [0.75, -2.2, 1], [0.75, 0]], 8),
  };
  const s = c.scale(size);
  s.inst('thrusterBell', thrusterGeo.bell, m.nozzle);
  s.inst('thrusterInside', thrusterGeo.inside, m.nozzleInner);
  s.inst('thrusterValve', thrusterGeo.valve, m.titanium);
}

/**
 * Thruster pod: a small blanket-covered housing at the origin with thrusters that point along
 * the given local directions.
 */
export function thrusterPod(c: Ctx, dirs: readonly V3[], size = 0.022, housing?: THREE.Material): void {
  const m = c.mat;
  const s = size * 3.2;
  c.box(s * 2, s * 2, s * 2, housing ?? m.foilGold, s * 0.25);
  for (const d of dirs) {
    const start = vscale(d, s * 0.9);
    thruster(c.aim(start, vadd(start, d)).move(0, 0, size * 2.3), size);
  }
}

// ---------------------------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------------------------

/** Star tracker: body at the origin, conical baffle that opens along +Z. */
export function starTracker(c: Ctx, s = 1, bodyMat?: THREE.Material): void {
  const m = c.mat;
  c.move(0, 0, -0.07 * s).box(0.14 * s, 0.14 * s, 0.15 * s, bodyMat ?? m.foilBlack, 0.012 * s);
  const r0 = 0.05 * s;
  const r1 = 0.09 * s;
  const z1 = 0.26 * s;
  c.add(lathe([[r0, 0], [r0, 0.03 * s], [r1, z1, 1], [r1 - 0.005 * s, z1]], 20), m.aluminium);
  c.add(lathe([[r1 - 0.005 * s, z1], [r0 - 0.005 * s, 0.035 * s, 1], [0, 0.035 * s]], 20), m.paintBlack);
  c.add(disc(r0 * 0.7, 14, 0.04 * s), m.glass);
}

/**
 * Camera or telescope barrel along +Z from the origin: tube with a dark inside and a lens.
 * `hood` > 0 adds a wider sun shade of that length at the front.
 */
export function barrel(c: Ctx, r: number, len: number, mat: THREE.Material, hood = 0): void {
  const m = c.mat;
  const wall = Math.max(0.004, r * 0.08);
  const prof: ProfilePoint[] = [[0, 0], [r, 0, 1], [r, len, 1]];
  let rf = r;
  let zf = len;
  if (hood > 0) {
    rf = r * 1.18;
    zf = len + hood;
    prof.push([rf, len, 1], [rf, zf, 1]);
  }
  prof.push([rf - wall, zf]);
  c.add(lathe(prof, 20), mat);
  const depth = hood > 0 ? hood + len * 0.25 : len * 0.3;
  c.add(lathe([[rf - wall, zf], [rf - wall, zf - depth, 1], [0, zf - depth]], 20), m.paintBlack);
  c.add(disc((rf - wall) * 0.86, 16, zf - depth + 0.004), m.glass);
}

// ---------------------------------------------------------------------------------------------
// Thermal hardware
// ---------------------------------------------------------------------------------------------

/** Repeatable pseudo-random number 0..1 for the layout of irregular parts. */
function rand(k: number, seed: number): number {
  const v = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

let buttonGeo: Geo | null = null;

export interface QuiltOptions {
  cols: number;
  rows: number;
  mat?: THREE.Material;
  /** Colour factors of the panels (sRGB hex); the pattern repeats. */
  tints?: readonly number[];
  thickness?: number;
  /** Width of the groove between two panels (m). */
  gap?: number;
  /** Fixing buttons at the corners of the panels. */
  buttons?: boolean;
  seed?: number;
}

/**
 * Thermal blanket made of separate panels, in the local XY plane, facing +Z. The panels have
 * slightly different sizes and tones, with narrow grooves between them.
 */
export function quilt(c: Ctx, w: number, h: number, o: QuiltOptions): void {
  const m = c.mat;
  const mat = o.mat ?? m.foilGold;
  const t = o.thickness ?? 0.02;
  const gap = o.gap ?? 0.012;
  const tints = o.tints ?? [0xffffff, 0xf4dcb4, 0xfbeacc, 0xeed2a2];
  const seed = o.seed ?? 1;
  const cut = (n: number, total: number, sd: number): number[] => {
    const out = [-total / 2];
    for (let k = 1; k < n; k++) out.push(-total / 2 + (total * (k + 0.34 * (rand(k, sd) - 0.5))) / n);
    out.push(total / 2);
    return out;
  };
  const xs = cut(o.cols, w, seed);
  const ys = cut(o.rows, h, seed + 7);
  for (let i = 0; i < o.cols; i++) {
    for (let j = 0; j < o.rows; j++) {
      const pw = xs[i + 1] - xs[i] - gap;
      const ph = ys[j + 1] - ys[j] - gap;
      const k = i * o.rows + j;
      c.move((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, t / 2 - 0.004).add(box(pw, ph, t, t * 0.3), mat, {
        tint: tints[(i * 3 + j * 5 + seed) % tints.length],
        uv: [1, 1, rand(k, seed + 3), rand(k, seed + 5)],
      });
    }
  }
  if (o.buttons) {
    buttonGeo ??= lathe([[0.009, 0], [0.009, 0.005, 1], [0, 0.005]], 6);
    for (let i = 0; i <= o.cols; i++) {
      for (let j = 0; j <= o.rows; j++) {
        const x = xs[i] + (i === 0 ? 0.03 : i === o.cols ? -0.03 : 0);
        const y = ys[j] + (j === 0 ? 0.03 : j === o.rows ? -0.03 : 0);
        c.move(x, y, t - 0.004).inst('blanketButton', buttonGeo, m.aluminium);
      }
    }
  }
}

/** Louver radiator in the local XY plane, facing +Z: frame, centre housing and rows of blades. */
export function louvers(c: Ctx, w: number, h: number, blades = 9): void {
  const m = c.mat;
  const d = 0.028;
  const fr = 0.014;
  c.move(0, 0, 0.004).add(plane(w, h), m.paintBlack);
  c.move(0, h / 2 - fr / 2, d / 2).box(w, fr, d, m.aluminium, 0.002);
  c.move(0, -h / 2 + fr / 2, d / 2).box(w, fr, d, m.aluminium, 0.002);
  c.move(w / 2 - fr / 2, 0, d / 2).box(fr, h, d, m.aluminium, 0.002);
  c.move(-w / 2 + fr / 2, 0, d / 2).box(fr, h, d, m.aluminium, 0.002);
  const spine = Math.min(0.04, w * 0.1);
  c.move(0, 0, d / 2).box(spine, h - fr * 2, d * 1.1, m.aluminium, 0.003);
  const len = w / 2 - fr - spine / 2 - 0.004;
  const pitch = (h - fr * 2) / blades;
  const blade = box(len, pitch * 1.02, 0.0025, 0);
  for (let k = 0; k < blades; k++) {
    const y = -h / 2 + fr + pitch * (k + 0.5);
    for (const sx of [-1, 1]) {
      c.move(sx * (spine / 2 + 0.002 + len / 2), y, d * 0.6).rotX(0.5).inst('louverBlade', blade, m.aluminium);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fasteners and connectors
// ---------------------------------------------------------------------------------------------

let boltGeo: Geo | null = null;
let plugGeo: Geo | null = null;

/** Row of `count` bolt heads in the local XY plane, heads toward +Z, from point `a` to point `b`. */
export function bolts(c: Ctx, a: P2, b: P2, count: number, mat?: THREE.Material): void {
  boltGeo ??= lathe([[0.008, 0], [0.008, 0.006, 1], [0, 0.006]], 6);
  for (let k = 0; k < count; k++) {
    const f = count === 1 ? 0.5 : k / (count - 1);
    c.move(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0).inst('bolt', boltGeo, mat ?? c.mat.aluminium);
  }
}

/** Bolted cover plate in the local XY plane, facing +Z: a thin plate with bolts along its border. */
export function coverPlate(c: Ctx, w: number, h: number, mat: THREE.Material, tint = 0xffffff, pitch = 0.09): void {
  const t = 0.008;
  const e = 0.022;
  c.move(0, 0, t / 2).box(w, h, t, mat, 0.002, tint);
  const nx = Math.max(2, Math.round(w / pitch));
  const ny = Math.max(2, Math.round(h / pitch));
  const top = c.move(0, 0, t);
  bolts(top, [-w / 2 + e, h / 2 - e], [w / 2 - e, h / 2 - e], nx);
  bolts(top, [-w / 2 + e, -h / 2 + e], [w / 2 - e, -h / 2 + e], nx);
  if (ny > 2) {
    const dy = (h - 2 * e) / (ny - 1);
    bolts(top, [-w / 2 + e, -h / 2 + e + dy], [-w / 2 + e, h / 2 - e - dy], ny - 2);
    bolts(top, [w / 2 - e, -h / 2 + e + dy], [w / 2 - e, h / 2 - e - dy], ny - 2);
  }
}

/** Row of round electrical connectors along the local X axis, sockets toward +Z. */
export function plugs(c: Ctx, count: number, pitch: number): void {
  plugGeo ??= lathe([[0.017, 0], [0.017, 0.012, 1], [0.013, 0.012, 1], [0.013, 0.03, 1], [0, 0.03]], 10);
  for (let k = 0; k < count; k++) c.move((k - (count - 1) / 2) * pitch, 0, 0).inst('plug', plugGeo, c.mat.aluminium);
}

// ---------------------------------------------------------------------------------------------
// Solar arrays
// ---------------------------------------------------------------------------------------------

export interface PanelOptions {
  /** Size along local X. */
  w: number;
  /** Size along local Y. */
  h: number;
  /** Number of cells along X and along Y. */
  cols: number;
  rows: number;
  thickness?: number;
  /** Bare border around the cells (m). */
  margin?: number;
  /** Stiffening ribs on the back: count along X and along Y. */
  ribsX?: number;
  ribsY?: number;
  /** The cell area is split into this many blocks along X and along Y, with narrow gaps. */
  blocksX?: number;
  blocksY?: number;
  back?: THREE.Material;
}

const CELL_TINTS = [0xffffff, 0xe6e9ff, 0xf4f0ff, 0xdfe6fa];

/** Solar panel in the local XY plane, centred on the origin. The cells face +Z; the back has ribs. */
export function solarPanel(c: Ctx, o: PanelOptions): void {
  const m = c.mat;
  const t = o.thickness ?? 0.022;
  const mg = o.margin ?? 0.03;
  const back = o.back ?? m.solarBack;
  c.box(o.w, o.h, t, back, 0.003);
  const bx = o.blocksX ?? 1;
  const by = o.blocksY ?? 1;
  const gap = 0.018;
  const bw = (o.w - mg * 2 - gap * (bx - 1)) / bx;
  const bh = (o.h - mg * 2 - gap * (by - 1)) / by;
  const block = plane(bw, bh);
  for (let i = 0; i < bx; i++) {
    for (let j = 0; j < by; j++) {
      const x = -o.w / 2 + mg + bw / 2 + i * (bw + gap);
      const y = -o.h / 2 + mg + bh / 2 + j * (bh + gap);
      // Whole numbers of cells per block; a different offset per block breaks the repeat of the texture.
      const cu = Math.max(1, Math.round(o.cols / bx));
      const cv = Math.max(1, Math.round(o.rows / by));
      c.move(x, y, t / 2 + 0.0025).add(block, m.solarCells, {
        uv: [cu / 4, cv / 4, (i * 3 + j) * 0.25, (j * 3 + i) * 0.25],
        tint: CELL_TINTS[(i * 2 + j * 3 + bx) % CELL_TINTS.length],
      });
    }
  }
  const rd = 0.022;
  const nx = o.ribsX ?? 3;
  const ny = o.ribsY ?? 2;
  for (let k = 0; k < nx; k++) {
    const x = -o.w / 2 + (o.w * (k + 0.5)) / nx;
    c.move(x, 0, -t / 2 - rd / 2).box(0.018, o.h - 0.02, rd, m.carbon, 0.002);
  }
  for (let k = 0; k < ny; k++) {
    const y = -o.h / 2 + (o.h * (k + 0.5)) / ny;
    c.move(0, y, -t / 2 - rd / 2).box(o.w - 0.02, 0.018, rd, m.carbon, 0.002);
  }
}

/** Hinge: barrel along the local X axis with two leaves in the XY plane. */
export function hinge(c: Ctx, len = 0.1, r = 0.014): void {
  const m = c.mat;
  c.rotY(Math.PI / 2).cyl(r, -len / 2, len / 2, m.aluminium, 10);
  c.move(0, r * 1.7, 0).box(len * 0.8, r * 3, r * 0.6, m.aluminium, 0);
  c.move(0, -r * 1.7, 0).box(len * 0.8, r * 3, r * 0.6, m.aluminium, 0);
}

// ---------------------------------------------------------------------------------------------
// Small antennas
// ---------------------------------------------------------------------------------------------

/** Horn antenna that opens along +Z from the origin, with its dark inside. */
export function horn(c: Ctx, r0: number, r1: number, len: number, mat?: THREE.Material): void {
  const m = c.mat;
  const wall = Math.max(0.003, r1 * 0.05);
  c.add(lathe([[0, 0], [r0, 0, 1], [r0, len * 0.25], [r1, len, 1], [r1 - wall, len]], 20), mat ?? m.paintWhite);
  c.add(lathe([[r1 - wall, len], [r0 * 0.8, len * 0.3, 1], [0, len * 0.3]], 20), m.paintBlack);
}

/** Low-gain antenna along +Z from the origin: short mast, choke cone and white cap. */
export function lowGain(c: Ctx, s = 1, mastLen = 0.12): void {
  const m = c.mat;
  const z0 = mastLen * s;
  c.cyl(0.018 * s, 0, z0, m.aluminium, 10);
  c.add(lathe([[0, z0], [0.03 * s, z0, 1], [0.065 * s, z0 + 0.09 * s, 1], [0.065 * s, z0 + 0.12 * s]], 18), m.aluminium);
  c.add(lathe([[0.065 * s, z0 + 0.12 * s], [0.055 * s, z0 + 0.15 * s], [0.03 * s, z0 + 0.168 * s], [0, z0 + 0.172 * s]], 18), m.paintWhite);
}

/** Whip antenna from the origin along +Z, with a spring base. */
export function whip(c: Ctx, len: number, r: number, mat?: THREE.Material): void {
  const m = c.mat;
  c.cyl(r * 3.4, 0, r * 9, m.aluminium, 10);
  c.add(lathe([[r * 3.4, r * 9], [r * 1.4, r * 16]], 10), m.aluminium);
  c.strut([0, 0, r * 9], [0, 0, len], r, mat ?? m.antennaWire, 6);
}

// ---------------------------------------------------------------------------------------------
// Cables and structure
// ---------------------------------------------------------------------------------------------

/** Cable bundle along a smooth curve through the points. */
export function cable(c: Ctx, pts: readonly V3[], r: number, mat?: THREE.Material): void {
  c.add(tubePath(pts, r, 6, 5), mat ?? c.mat.cable);
}

/** Cable that sags between the points of a path: one extra point per span, moved along `sag`. */
export function looseCable(c: Ctx, pts: readonly V3[], r: number, sag: V3, mat?: THREE.Material): void {
  const out: V3[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    out.push(pts[k], vadd(vlerp(pts[k], pts[k + 1], 0.5), sag));
  }
  out.push(pts[pts.length - 1]);
  cable(c, out, r, mat);
}

/** Ring of `n` equal struts from points on a lower circle to points on an upper circle (a truss cone). */
export function strutRing(
  c: Ctx,
  n: number,
  r0: number,
  z0: number,
  r1: number,
  z1: number,
  radius: number,
  mat: THREE.Material,
  zigzag = true,
  phase = 0,
): void {
  for (let k = 0; k < n; k++) {
    const a0 = phase + (TAU * k) / n;
    if (zigzag) {
      const a1 = phase + (TAU * (k + 0.5)) / n;
      const a2 = phase + (TAU * (k + 1)) / n;
      c.strut(polar(r0, a0, z0), polar(r1, a1, z1), radius, mat);
      c.strut(polar(r1, a1, z1), polar(r0, a2, z0), radius, mat);
    } else {
      c.strut(polar(r0, a0, z0), polar(r1, a0, z1), radius, mat);
    }
  }
}

/** Flat mounting flange (ring with a rim) about +Z at the origin. */
export function flange(c: Ctx, r0: number, r1: number, h: number, mat: THREE.Material, seg = 24): void {
  c.add(lathe([[r0, 0], [r1, 0, 1], [r1, h, 1], [r0, h, 1], [r0, 0]], seg), mat);
}

/** Closed cylinder between two points. */
export function rod(c: Ctx, a: V3, b: V3, r: number, mat: THREE.Material, seg = 12): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  c.aim(a, b).add(cyl(r, 0, len, seg), mat);
}
