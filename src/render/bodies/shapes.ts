/**
 * Shapes of the small bodies, made by code.
 *
 * Each shape is an approximation of the class of the real body: the number of lobes, the overall proportions
 * and a few large features. It is not a measured shape model. The dimensions in this file are approximate
 * published values, written from general knowledge. No document was checked for them in this work.
 * The proportions of Phobos and Deimos are the radii of the NAIF kernel pck00011.tpc
 * (13.0 x 11.4 x 9.1 km and 7.8 x 6.0 x 5.1 km, in src/engine/data/constants.json).
 *
 * A shape is a set of ellipsoids with a smooth joint. The code sends a ray from a point inside the body through
 * each vertex of a sphere mesh, finds the surface, and then adds lumps, craters and boulders.
 * The result has the volume of a sphere with the radius of the body table (or the three radii of the table).
 */
import * as THREE from 'three';
import { icoSphere } from './geometry';

type V3 = [number, number, number];

interface Lobe {
  /** Centre, km. */
  c: V3;
  /** Half-axes, km. */
  r: V3;
}

interface FixedCrater {
  latDeg: number;
  lonDeg: number;
  /** Radius, km. */
  radius: number;
  /** Depth as a part of the radius. */
  depth: number;
}

export interface ShapeSpec {
  lobes: Lobe[];
  /** Radius of the smooth joint between lobes, km. */
  blend: number;
  /** 2 = ellipsoid. A lower number gives the diamond outline of a "spinning top" body (one lobe only). */
  power: number;
  /** Bend of the long axis: the surface point at x moves by bend * x^2 along y (1/km). The shape looks like a banana. */
  bend: number;
  /** Start of the rays. It must be inside each lobe. */
  origin: V3;
  /** Large lumps: height as a part of the local radius, and number of lumps along one mean radius. */
  lumpAmp: number;
  lumpFreq: number;
  /** Craters with random places: number, smallest and largest radius (parts of the mean radius), depth (part of the radius). */
  craters: { count: number; min: number; max: number; depth: number };
  fixedCraters: FixedCrater[];
  /** Boulders with random places: number, smallest and largest radius (parts of the mean radius). */
  boulders: { count: number; min: number; max: number };
  seed: number;
  /** 'volume': the mesh gets the volume of a sphere with the table radius. 'axes': the mesh gets the three half-axes below. */
  fit: 'volume' | 'axes';
  /** Ratio of the middle half-axis to the longest half-axis, for fit = 'axes'. */
  middleRatio: number;
  /** Lobes cast shadows on each other (bodies with a deep neck). */
  lobeShadows: boolean;
  /** Centre of the neck (km) and radius of the neck zone (km), or null. */
  neck: { at: V3; radius: number } | null;
}

const NO_CRATERS = { count: 0, min: 0.1, max: 0.2, depth: 0.2 };
const NO_BOULDERS = { count: 0, min: 0.03, max: 0.06 };

function single(r: V3, more: Partial<ShapeSpec>): ShapeSpec {
  return {
    lobes: [{ c: [0, 0, 0], r }],
    blend: 0,
    power: 2,
    bend: 0,
    origin: [0, 0, 0],
    lumpAmp: 0.05,
    lumpFreq: 1.6,
    craters: NO_CRATERS,
    fixedCraters: [],
    boulders: NO_BOULDERS,
    seed: 1,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: false,
    neck: null,
    ...more,
  };
}

/** Shapes by body id. Sizes in km before the fit to the table radius. */
export const SHAPES: Record<string, ShapeSpec> = {
  // Elongated and curved, about 34 x 11 x 11 km, with a wide saddle and large craters.
  EROS: {
    lobes: [
      { c: [-9.6, 0, 0], r: [8.2, 5.8, 5.6] },
      { c: [0, 0, 0], r: [8.0, 4.7, 5.1] },
      { c: [9.6, 0, 0], r: [8.2, 5.5, 5.4] },
    ],
    blend: 3.2,
    power: 2,
    bend: 0.011,
    origin: [0, 0, 0],
    lumpAmp: 0.07,
    lumpFreq: 1.3,
    craters: { count: 16, min: 0.1, max: 0.42, depth: 0.22 },
    fixedCraters: [],
    boulders: NO_BOULDERS,
    seed: 433,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: false,
    neck: null,
  },
  // Two lobes ("body" and "head"), about 0.54 x 0.29 x 0.21 km, covered with boulders, with a smooth neck.
  ITOKAWA: {
    lobes: [
      { c: [-0.07, 0, 0], r: [0.19, 0.135, 0.1] },
      { c: [0.172, 0.02, 0.025], r: [0.1, 0.09, 0.085] },
    ],
    blend: 0.05,
    power: 2,
    bend: 0,
    origin: [0.09, 0.01, 0.01],
    lumpAmp: 0.07,
    lumpFreq: 2.2,
    craters: { count: 3, min: 0.12, max: 0.25, depth: 0.12 },
    fixedCraters: [],
    boulders: { count: 14, min: 0.05, max: 0.13 },
    seed: 25143,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: true,
    neck: { at: [0.085, 0.01, 0.01], radius: 0.07 },
  },
  // Spinning top with a sharp ridge at the equator, about 1.00 x 1.00 x 0.88 km, with boulders.
  RYUGU: single([0.502, 0.502, 0.438], {
    power: 1.42,
    lumpAmp: 0.035,
    lumpFreq: 2.0,
    craters: { count: 7, min: 0.1, max: 0.3, depth: 0.1 },
    boulders: { count: 14, min: 0.05, max: 0.13 },
    fixedCraters: [],
    seed: 162173,
  }),
  // Spinning top, rounder than Ryugu, about 0.57 x 0.54 x 0.51 km, with large boulders.
  BENNU: single([0.2825, 0.2675, 0.254], {
    power: 1.6,
    lumpAmp: 0.04,
    lumpFreq: 2.0,
    craters: { count: 6, min: 0.1, max: 0.3, depth: 0.1 },
    boulders: { count: 18, min: 0.05, max: 0.15 },
    seed: 101955,
  }),
  // Flattened top shape, about 0.82 x 0.80 x 0.60 km.
  DIDYMOS: single([0.41, 0.4, 0.3], {
    power: 1.72,
    lumpAmp: 0.035,
    lumpFreq: 2.2,
    craters: { count: 5, min: 0.1, max: 0.26, depth: 0.1 },
    boulders: { count: 10, min: 0.05, max: 0.11 },
    seed: 65803,
  }),
  // Contact binary of two flattened lobes, about 36 x 20 x 10 km, smooth, with one large crater on the small lobe.
  ARROKOTH: {
    lobes: [
      { c: [-6.2, 0, 0], r: [10.6, 9.95, 4.5] },
      { c: [11.0, 0, 0], r: [7.9, 6.9, 4.9] },
    ],
    blend: 1.3,
    power: 2,
    bend: 0,
    origin: [3.75, 0, 0],
    lumpAmp: 0.03,
    lumpFreq: 1.5,
    craters: { count: 8, min: 0.04, max: 0.1, depth: 0.14 },
    fixedCraters: [{ latDeg: 62, lonDeg: 8, radius: 3.4, depth: 0.2 }],
    boulders: NO_BOULDERS,
    seed: 486958,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: true,
    neck: { at: [3.75, 0, 0], radius: 2.6 },
  },
  // Lumpy ellipsoid, about 278 x 238 x 171 km, with a few very large depressions.
  PSYCHE: single([139, 119, 85.5], {
    lumpAmp: 0.1,
    lumpFreq: 1.2,
    craters: { count: 9, min: 0.12, max: 0.42, depth: 0.16 },
    seed: 16,
  }),
  // Radii of the kernel: 13.0 x 11.4 x 9.1 km. The large crater Stickney is at 1 N, 311 E (IAU gazetteer position from the manifest note).
  PHOBOS: single([13.0, 11.4, 9.1], {
    lumpAmp: 0.05,
    lumpFreq: 1.5,
    fixedCraters: [{ latDeg: 1, lonDeg: 311, radius: 4.6, depth: 0.2 }],
    seed: 401,
    fit: 'axes',
    middleRatio: 11.4 / 13.0,
  }),
  // Radii of the kernel: 7.8 x 6.0 x 5.1 km. Smooth, with a wide hollow in the south.
  DEIMOS: single([7.8, 6.0, 5.1], {
    lumpAmp: 0.045,
    lumpFreq: 1.3,
    fixedCraters: [{ latDeg: -72, lonDeg: 30, radius: 4.4, depth: 0.14 }],
    seed: 402,
    fit: 'axes',
    middleRatio: 6.0 / 7.8,
  }),
  // Comet nucleus, elongated with a waist, about 15 x 8 x 8 km.
  HALLEY: {
    lobes: [
      { c: [-3.3, 0, 0], r: [4.6, 4.0, 3.9] },
      { c: [3.6, 0.3, 0], r: [4.2, 3.6, 3.5] },
    ],
    blend: 2.0,
    power: 2,
    bend: 0,
    origin: [0.3, 0.1, 0],
    lumpAmp: 0.09,
    lumpFreq: 1.6,
    craters: { count: 6, min: 0.1, max: 0.28, depth: 0.14 },
    fixedCraters: [],
    boulders: NO_BOULDERS,
    seed: 1000036,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: true,
    neck: null,
  },
  // Comet nucleus with a flat large lobe and a small lobe on a neck, about 4.3 x 2.6 x 2.1 km.
  CHURYUMOV_GERASIMENKO: {
    lobes: [
      { c: [-0.3, 0, -0.45], r: [2.05, 1.65, 0.9] },
      { c: [0.6, 0, 1.05], r: [1.3, 1.15, 0.9] },
    ],
    blend: 0.35,
    power: 2,
    bend: 0,
    origin: [0.55, 0, 0.25],
    lumpAmp: 0.08,
    lumpFreq: 1.8,
    craters: { count: 8, min: 0.08, max: 0.24, depth: 0.16 },
    fixedCraters: [],
    boulders: { count: 6, min: 0.04, max: 0.07 },
    seed: 1000012,
    fit: 'volume',
    middleRatio: 1,
    lobeShadows: true,
    neck: { at: [0.5, 0, 0.3], radius: 0.6 },
  },
};

/** A rocky body with no entry in SHAPES: an irregular ellipsoid. The id gives the seed, so each body has its own shape. */
export function genericShape(id: string): ShapeSpec {
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const rnd = randomSource(seed);
  const b = 0.72 + 0.2 * rnd();
  const c = b * (0.75 + 0.2 * rnd());
  return single([1, b, c], {
    lumpAmp: 0.09,
    lumpFreq: 1.5,
    craters: { count: 10, min: 0.1, max: 0.35, depth: 0.18 },
    seed,
  });
}

/** A round body: an exact ellipsoid with no lumps. The surface detail comes from the shader. */
export function roundShape(radiusKm: number, polarRadiusKm: number): ShapeSpec {
  return single([radiusKm, radiusKm, polarRadiusKm], { lumpAmp: 0, fit: 'axes', middleRatio: 1 });
}

function randomSource(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  // Curve of degree five: the surface normal has no kink at the borders of the noise cells.
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), ux), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), ux), uy),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), ux), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), ux), uy),
    uz,
  );
}

function fbm3(x: number, y: number, z: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, z);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 3.7;
    z = z * 2.03 + 9.2;
    amp *= 0.5;
  }
  return sum / norm;
}

/**
 * The norm of a lobe: 1 on the surface of the lobe.
 * ax, ay, az: a vector from the centre of the lobe, each part divided by the half-axis of the lobe.
 * power 2 gives an ellipsoid. A lower power gives the outline of a spinning top.
 * The code uses Math.sqrt of a sum and not Math.hypot: the browser runs it several times faster.
 */
function lobeNorm(power: number, ax: number, ay: number, az: number): number {
  if (power === 2) return Math.sqrt(ax * ax + ay * ay + az * az);
  return Math.pow(Math.pow(Math.sqrt(ax * ax + ay * ay), power) + Math.pow(Math.abs(az), power), 1 / power);
}

/** Numbers of one lobe in the table of the inner loop: centre (3), 1 / half-axis (3), smallest half-axis (1). */
const LOBE_NUMBERS = 7;

/** The lobes of a shape as one array of numbers. The inner loop multiplies and does not divide. */
function lobeTable(spec: ShapeSpec): Float64Array {
  const table = new Float64Array(spec.lobes.length * LOBE_NUMBERS);
  spec.lobes.forEach((l, i) => {
    table.set([l.c[0], l.c[1], l.c[2], 1 / l.r[0], 1 / l.r[1], 1 / l.r[2], Math.min(l.r[0], l.r[1], l.r[2])], i * LOBE_NUMBERS);
  });
  return table;
}

/** Negative inside the body, positive outside, about the distance to the surface in km. */
function field(spec: ShapeSpec, table: Float64Array, x: number, y: number, z: number): number {
  y -= spec.bend * x * x;
  const top = table.length === LOBE_NUMBERS && spec.power !== 2;
  let d = 1e30;
  for (let o = 0; o < table.length; o += LOBE_NUMBERS) {
    const ax = (x - table[o]) * table[o + 3];
    const ay = (y - table[o + 1]) * table[o + 4];
    const az = (z - table[o + 2]) * table[o + 5];
    if (top) return (lobeNorm(spec.power, ax, ay, az) - 1) * table[o + 6];
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax * table[o + 3];
    const by = ay * table[o + 4];
    const bz = az * table[o + 5];
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    const di = k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -table[o + 6];
    if (o === 0 || spec.blend <= 0) {
      d = Math.min(d, di);
    } else {
      const h = Math.max(spec.blend - Math.abs(d - di), 0) / spec.blend;
      d = Math.min(d, di) - h * h * spec.blend * 0.25;
    }
  }
  return d;
}

/** True for one lobe with no bend around the start of the rays. The surface along a ray then has a formula. */
function hasFormula(spec: ShapeSpec): boolean {
  const l = spec.lobes[0];
  return spec.lobes.length === 1 && spec.bend === 0 && l.c[0] === spec.origin[0] && l.c[1] === spec.origin[1] && l.c[2] === spec.origin[2];
}

/** Distance from the origin of the rays to the surface, along a unit direction. `table` is lobeTable(spec). */
function surfaceDistance(spec: ShapeSpec, table: Float64Array, dx: number, dy: number, dz: number, bound: number): number {
  // One lobe around the start of the rays: its norm grows in proportion to the distance, so the surface is at 1 / norm.
  if (hasFormula(spec)) return 1 / lobeNorm(spec.power, dx * table[3], dy * table[4], dz * table[5]);
  // More lobes: the code walks along the ray from the outside to the first point inside. This finds the outer
  // surface also where a ray crosses the body more than one time.
  // The field is a low estimate of the distance to the lobes. A step of half of the field, less the width of the
  // joint, does not pass the surface. The bend stretches the space by the factor `stretch` at most, so the step
  // is smaller by this factor. The smallest step is 1/40 of the range.
  const ox = spec.origin[0];
  const oy = spec.origin[1];
  const oz = spec.origin[2];
  const smallest = bound / 40;
  const shear = 2 * Math.abs(spec.bend) * (Math.abs(ox) + bound);
  const stretch = 0.5 * (shear + Math.sqrt(shear * shear + 4));
  let outside = bound;
  let fOutside = field(spec, table, ox + dx * bound, oy + dy * bound, oz + dz * bound);
  let inside = 0;
  let fInside = -1;
  for (;;) {
    const t = Math.max(0, outside - Math.max(smallest, (0.5 * (fOutside - spec.blend)) / stretch));
    const f = field(spec, table, ox + dx * t, oy + dy * t, oz + dz * t);
    if (f < 0 || t === 0) {
      inside = t;
      fInside = f;
      break;
    }
    outside = t;
    fOutside = f;
  }
  // Halve the range twelve times. The field is smooth in the small range that is left:
  // the zero of the straight line through both ends is the surface.
  for (let i = 0; i < 12; i++) {
    const mid = 0.5 * (inside + outside);
    const f = field(spec, table, ox + dx * mid, oy + dy * mid, oz + dz * mid);
    if (f < 0) {
      inside = mid;
      fInside = f;
    } else {
      outside = mid;
      fOutside = f;
    }
  }
  const span = fOutside - fInside;
  return fInside < 0 && span > 0 ? inside + ((outside - inside) * -fInside) / span : 0.5 * (inside + outside);
}

/**
 * Normals of the vertices: the sum of the normals of the faces around a vertex, each with the weight of the area
 * of its face. This is the rule of BufferGeometry.computeVertexNormals, with plain arrays (several times faster).
 */
function vertexNormals(pos: Float32Array, index: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let f = 0; f < index.length; f += 3) {
    const a = index[f] * 3;
    const b = index[f + 1] * 3;
    const c = index[f + 2] * 3;
    const ux = pos[c] - pos[b];
    const uy = pos[c + 1] - pos[b + 1];
    const uz = pos[c + 2] - pos[b + 2];
    const vx = pos[a] - pos[b];
    const vy = pos[a + 1] - pos[b + 1];
    const vz = pos[a + 2] - pos[b + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    n[a] += nx;
    n[a + 1] += ny;
    n[a + 2] += nz;
    n[b] += nx;
    n[b + 1] += ny;
    n[b + 2] += nz;
    n[c] += nx;
    n[c + 1] += ny;
    n[c + 2] += nz;
  }
  for (let k = 0; k < n.length; k += 3) {
    const length = Math.sqrt(n[k] * n[k] + n[k + 1] * n[k + 1] + n[k + 2] * n[k + 2]) || 1;
    n[k] /= length;
    n[k + 1] /= length;
    n[k + 2] /= length;
  }
  return n;
}

export interface BuiltShape {
  geometry: THREE.BufferGeometry;
  /** Largest distance of a vertex from the centre, km. */
  extentKm: number;
  /** Radius of the sphere with the same volume, km. */
  meanRadiusKm: number;
  /** The lobes in the axes and the scale of the mesh (for the shadows). Empty if the lobes cast no shadows. */
  lobes: { c: THREE.Vector3; r: THREE.Vector3 }[];
  /** The neck zone in the axes and the scale of the mesh, or null. */
  neck: { at: THREE.Vector3; radius: number } | null;
}

/**
 * Builds the mesh of a shape.
 * level: subdivision level of the sphere mesh (20 * 4^level triangles).
 * radiusKm, polarRadiusKm: radii of the body table.
 */
export function buildShape(spec: ShapeSpec, level: number, radiusKm: number, polarRadiusKm: number): BuiltShape {
  const ico = icoSphere(level);
  const count = ico.directions.length / 3;
  const pos = new Float32Array(count * 3);
  const rnd = randomSource(spec.seed);
  const table = lobeTable(spec);

  let bound = 0;
  let meanLobe = 0;
  for (const l of spec.lobes) {
    bound = Math.max(bound, Math.hypot(l.c[0] - spec.origin[0], l.c[1] - spec.origin[1], l.c[2] - spec.origin[2]) + Math.max(l.r[0], l.r[1], l.r[2]));
    meanLobe += Math.cbrt(l.r[0] * l.r[1] * l.r[2]);
  }
  bound = bound * 1.6 + spec.bend * bound * bound * 4;
  const size = meanLobe / Math.pow(spec.lobes.length, 2 / 3);

  // Places of the craters and the boulders on the smooth surface.
  interface Mark {
    x: number;
    y: number;
    z: number;
    radius: number;
    height: number;
    crater: boolean;
  }
  const marks: Mark[] = [];
  const place = (dx: number, dy: number, dz: number, radius: number, height: number, crater: boolean): void => {
    const t = surfaceDistance(spec, table, dx, dy, dz, bound);
    marks.push({ x: spec.origin[0] + dx * t, y: spec.origin[1] + dy * t, z: spec.origin[2] + dz * t, radius, height, crater });
  };
  const randomDirection = (): V3 => {
    const z = 2 * rnd() - 1;
    const a = 2 * Math.PI * rnd();
    const c = Math.sqrt(1 - z * z);
    return [c * Math.cos(a), c * Math.sin(a), z];
  };
  for (const f of spec.fixedCraters) {
    const lat = (f.latDeg * Math.PI) / 180;
    const lon = (f.lonDeg * Math.PI) / 180;
    place(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat), f.radius, f.depth * f.radius, true);
  }
  // A mark that is smaller than the distance between two vertices would be a spike, so the mesh leaves it out.
  // The random numbers are taken in the same order at each level: the large marks are at the same places.
  const spacing = Math.sqrt((4 * Math.PI * size * size) / count);
  for (let i = 0; i < spec.craters.count; i++) {
    const u = rnd();
    const radius = size * spec.craters.min * Math.pow(spec.craters.max / spec.craters.min, u * u);
    const d = randomDirection();
    if (radius >= 1.5 * spacing) place(d[0], d[1], d[2], radius, spec.craters.depth * radius, true);
  }
  for (let i = 0; i < spec.boulders.count; i++) {
    const u = rnd();
    const radius = size * spec.boulders.min * Math.pow(spec.boulders.max / spec.boulders.min, u * u);
    const d = randomDirection();
    const height = radius * (0.5 + 0.4 * rnd());
    if (radius >= 2 * spacing) place(d[0], d[1], d[2], radius, height, false);
  }

  const lumpScale = spec.lumpFreq / size;
  const seedShift = (spec.seed % 977) * 0.37;
  for (let k = 0; k < count; k++) {
    const dx = ico.directions[k * 3];
    const dy = ico.directions[k * 3 + 1];
    const dz = ico.directions[k * 3 + 2];
    let t = surfaceDistance(spec, table, dx, dy, dz, bound);
    const sx = spec.origin[0] + dx * t;
    const sy = spec.origin[1] + dy * t;
    const sz = spec.origin[2] + dz * t;
    let shift = 0;
    if (spec.lumpAmp > 0) {
      shift += spec.lumpAmp * size * 2 * (fbm3(sx * lumpScale + seedShift, sy * lumpScale + 5.1, sz * lumpScale + 9.7, 4) - 0.5);
    }
    for (const m of marks) {
      const ex = sx - m.x;
      const ey = sy - m.y;
      const ez = sz - m.z;
      const far = 1.7 * m.radius;
      const squared = ex * ex + ey * ey + ez * ez;
      if (squared > far * far) continue;
      const d = Math.sqrt(squared) / m.radius;
      if (m.crater) {
        const bowl = d < 1 ? -(1 - d * d) * (1 - d * d) : 0;
        const rim = 0.28 * Math.exp(-((d - 1) * (d - 1)) / 0.045);
        shift += m.height * (bowl + rim);
      } else if (d < 1) {
        // A boulder: a dome with an uneven top.
        const lumpy = 0.7 + 0.6 * valueNoise((sx * 2.6) / m.radius + 3.3, (sy * 2.6) / m.radius + 1.7, (sz * 2.6) / m.radius + 8.1);
        shift += m.height * (1 - d * d) * lumpy;
      }
    }
    t = Math.max(t + shift, 0.05 * t);
    pos[k * 3] = spec.origin[0] + dx * t;
    pos[k * 3 + 1] = spec.origin[1] + dy * t;
    pos[k * 3 + 2] = spec.origin[2] + dz * t;
  }

  // Volume and centre of mass (uniform density).
  let volume = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const idx = ico.index;
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3;
    const b = idx[f + 1] * 3;
    const c = idx[f + 2] * 3;
    const v =
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) +
        pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) /
      6;
    volume += v;
    cx += (v * (pos[a] + pos[b] + pos[c])) / 4;
    cy += (v * (pos[a + 1] + pos[b + 1] + pos[c + 1])) / 4;
    cz += (v * (pos[a + 2] + pos[b + 2] + pos[c + 2])) / 4;
  }
  cx /= volume;
  cy /= volume;
  cz /= volume;

  // Scale: the volume of the table radius, or the three half-axes of the table.
  let sx = 1;
  let sy = 1;
  let sz = 1;
  if (spec.fit === 'axes') {
    let ex = 0;
    let ey = 0;
    let ez = 0;
    for (let k = 0; k < count; k++) {
      ex = Math.max(ex, Math.abs(pos[k * 3] - cx));
      ey = Math.max(ey, Math.abs(pos[k * 3 + 1] - cy));
      ez = Math.max(ez, Math.abs(pos[k * 3 + 2] - cz));
    }
    sx = radiusKm / ex;
    sy = (radiusKm * spec.middleRatio) / ey;
    sz = polarRadiusKm / ez;
  } else {
    const mean = Math.cbrt((3 * volume) / (4 * Math.PI));
    sx = sy = sz = radiusKm / mean;
  }
  let extent = 0;
  for (let k = 0; k < count; k++) {
    pos[k * 3] = (pos[k * 3] - cx) * sx;
    pos[k * 3 + 1] = (pos[k * 3 + 1] - cy) * sy;
    pos[k * 3 + 2] = (pos[k * 3 + 2] - cz) * sz;
    extent = Math.max(extent, Math.hypot(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.setAttribute('normal', new THREE.BufferAttribute(vertexNormals(pos, idx), 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent);
  geometry.name = 'bodies/shape';

  const move = (p: V3): THREE.Vector3 => new THREE.Vector3((p[0] - cx) * sx, (p[1] - cy) * sy, (p[2] - cz) * sz);
  return {
    geometry,
    extentKm: extent,
    meanRadiusKm: Math.cbrt((3 * volume * sx * sy * sz) / (4 * Math.PI)),
    lobes: spec.lobeShadows ? spec.lobes.map((l) => ({ c: move(l.c), r: new THREE.Vector3(l.r[0] * sx, l.r[1] * sy, l.r[2] * sz) })) : [],
    neck: spec.neck ? { at: move(spec.neck.at), radius: spec.neck.radius * sx } : null,
  };
}
