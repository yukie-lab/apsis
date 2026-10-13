/**
 * Low-level procedural geometry for the spacecraft models.
 *
 * Every function returns a plain `Geo` (typed arrays, no GPU resources). The builder merges many
 * `Geo` objects into a few meshes, so these functions never create a `THREE.Mesh`.
 *
 * Conventions:
 * - Units are metres.
 * - Surfaces of revolution turn about the local +Z axis.
 * - Triangles are counter-clockwise when seen from the outside; normals point to the outside.
 * - "Metric" texture coordinates count texture tiles of `TILE` metres, so that a random texture
 *   (thermal blanket, noise) has the same scale on every part. "Unit" texture coordinates go from
 *   0 to 1 across the part and are scaled when the part is added to the model.
 */
import * as THREE from 'three';

/** Metres of surface per texture tile for geometry with metric texture coordinates. */
export const TILE = 0.5;

export type V3 = readonly [number, number, number];
export type P2 = readonly [number, number];

export interface Geo {
  /** Positions (x, y, z). */
  readonly p: Float32Array;
  /** Normals (x, y, z). */
  readonly n: Float32Array;
  /** Texture coordinates (u, v). */
  readonly t: Float32Array;
  /** Triangle indices. */
  readonly i: Uint32Array;
}

// ---------------------------------------------------------------------------------------------
// Small vector helpers on tuples
// ---------------------------------------------------------------------------------------------

export function vadd(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vsub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vscale(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vlerp(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function vlen(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vnorm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function vcross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function vdot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Point on a circle of radius `r` about the Z axis, at angle `ang` and height `z`. */
export function polar(r: number, ang: number, z = 0): V3 {
  return [r * Math.cos(ang), r * Math.sin(ang), z];
}

// ---------------------------------------------------------------------------------------------
// Geometry writer
// ---------------------------------------------------------------------------------------------

export class GeoWriter {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly t: number[] = [];
  private readonly i: number[] = [];

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const k = this.p.length / 3;
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.t.push(u, v);
    return k;
  }

  tri(a: number, b: number, c: number): void {
    this.i.push(a, b, c);
  }

  /** Quad a-b-c-d, counter-clockwise when seen from the front. */
  quad(a: number, b: number, c: number, d: number): void {
    this.i.push(a, b, c, a, c, d);
  }

  /** True if the winding a-b-c has a geometric normal on the side of (ox, oy, oz). */
  private faces(a: number, b: number, c: number, ox: number, oy: number, oz: number): boolean {
    const p = this.p;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    return cx * ox + cy * oy + cz * oz >= 0;
  }

  /** Triangle with the winding chosen so that it faces the direction (ox, oy, oz). */
  triOut(a: number, b: number, c: number, ox: number, oy: number, oz: number): void {
    if (this.faces(a, b, c, ox, oy, oz)) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }

  /** Quad with the winding chosen so that it faces the direction (ox, oy, oz). */
  quadOut(a: number, b: number, c: number, d: number, ox: number, oy: number, oz: number): void {
    if (this.faces(a, b, c, ox, oy, oz)) this.i.push(a, b, c, a, c, d);
    else this.i.push(a, c, b, a, d, c);
  }

  done(): Geo {
    return {
      p: new Float32Array(this.p),
      n: new Float32Array(this.n),
      t: new Float32Array(this.t),
      i: new Uint32Array(this.i),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Surfaces of revolution
// ---------------------------------------------------------------------------------------------

/**
 * Profile point of a surface of revolution: radius, height and an optional edge flag.
 * Flag 1: hard corner (the normals split at this point).
 * Flag 2: the segment that starts at this point is a bevel. A bevel takes its normals from the
 * two faces that it joins, which gives the look of a rounded edge.
 *
 * The outside is on the right of the direction of travel: a profile that goes up (+Z) has its
 * normals away from the axis; a profile that goes down has its normals to the axis.
 */
export type ProfilePoint = readonly [r: number, z: number, flag?: number];

export interface LatheOptions {
  /** Start angle (rad). Default 0. */
  phi0?: number;
  /** Swept angle (rad). Default 2 pi. */
  phiLen?: number;
  /** Unit texture coordinates (0..1 around, 0..1 along the profile) instead of metric ones. */
  unitUv?: boolean;
  /**
   * Metric texture coordinates from a flat projection along the axis (u = x, v = y). Use it for
   * blunt cones and shallow domes: the usual coordinates squeeze the texture at the axis.
   * Flat faces with hard borders get this projection without the option.
   */
  planarUv?: boolean;
}

export function lathe(profile: readonly ProfilePoint[], seg: number, o: LatheOptions = {}): Geo {
  const phi0 = o.phi0 ?? 0;
  const phiLen = o.phiLen ?? Math.PI * 2;
  const m = profile.length;
  const snr: number[] = [];
  const snz: number[] = [];
  const slen: number[] = [];
  const sbev: boolean[] = [];
  let rMax = 0;
  let total = 0;
  for (let k = 0; k < m; k++) rMax = Math.max(rMax, profile[k][0]);
  for (let k = 0; k < m - 1; k++) {
    const dr = profile[k + 1][0] - profile[k][0];
    const dz = profile[k + 1][1] - profile[k][1];
    const l = Math.hypot(dr, dz);
    const d = l || 1;
    snr.push(dz / d);
    snz.push(-dr / d);
    slen.push(l);
    sbev.push(profile[k][2] === 2);
    total += l;
  }
  const uCount = o.unitUv ? 1 : Math.max(1, Math.round((phiLen * rMax) / TILE));
  const vScale = o.unitUv ? 1 / (total || 1) : 1 / TILE;

  const ringR: number[] = [];
  const ringZ: number[] = [];
  const ringNr: number[] = [];
  const ringNz: number[] = [];
  const ringS: number[] = [];
  const startRing: number[] = new Array<number>(m).fill(-1);
  const endRing: number[] = new Array<number>(m).fill(-1);
  const pushRing = (r: number, z: number, nr: number, nz: number, s: number): number => {
    let a = nr;
    let b = nz;
    if (r < 1e-9) a = 0;
    const l = Math.hypot(a, b);
    if (l > 1e-9) {
      a /= l;
      b /= l;
    } else {
      a = nr;
      b = nz;
    }
    ringR.push(r);
    ringZ.push(z);
    ringNr.push(a);
    ringNz.push(b);
    ringS.push(s);
    return ringR.length - 1;
  };
  let s = 0;
  for (let k = 0; k < m; k++) {
    const r = profile[k][0];
    const z = profile[k][1];
    const hard = profile[k][2] === 1;
    if (k > 0) s += slen[k - 1];
    const hasPrev = k > 0;
    const hasNext = k < m - 1;
    if (hasPrev && hasNext && !hard) {
      const pb = sbev[k - 1];
      const nb = sbev[k];
      let nr: number;
      let nz: number;
      if (pb && !nb) {
        nr = snr[k];
        nz = snz[k];
      } else if (nb && !pb) {
        nr = snr[k - 1];
        nz = snz[k - 1];
      } else {
        nr = snr[k - 1] + snr[k];
        nz = snz[k - 1] + snz[k];
      }
      const id = pushRing(r, z, nr, nz, s);
      startRing[k] = id;
      endRing[k] = id;
    } else {
      if (hasPrev) endRing[k] = pushRing(r, z, snr[k - 1], snz[k - 1], s);
      if (hasNext) startRing[k] = pushRing(r, z, snr[k], snz[k], s);
    }
  }

  // A flat face with hard borders (an end cap, a flange face) gets a flat projection too: the
  // usual coordinates would squeeze the texture toward the axis.
  const flat: boolean[] = new Array<boolean>(ringR.length).fill(o.planarUv === true);
  if (!o.unitUv && !o.planarUv) {
    for (let k = 0; k < m - 1; k++) {
      const ownStart = k === 0 || profile[k][2] === 1;
      const ownEnd = k + 1 === m - 1 || profile[k + 1][2] === 1;
      if (ownStart && ownEnd && slen[k] > 1e-9 && Math.abs(snr[k]) < 1e-6) {
        flat[startRing[k]] = true;
        flat[endRing[k + 1]] = true;
      }
    }
  }

  const g = new GeoWriter();
  const cols = seg + 1;
  for (let q = 0; q < ringR.length; q++) {
    for (let j = 0; j <= seg; j++) {
      const f = j / seg;
      const phi = phi0 + phiLen * f;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      const x = ringR[q] * c;
      const y = ringR[q] * sn;
      const u = flat[q] ? x / TILE : f * uCount;
      const v = flat[q] ? y / TILE : ringS[q] * vScale;
      g.vert(x, y, ringZ[q], ringNr[q] * c, ringNr[q] * sn, ringNz[q], u, v);
    }
  }
  for (let k = 0; k < m - 1; k++) {
    const a = startRing[k];
    const b = endRing[k + 1];
    if (slen[k] < 1e-9) continue;
    const ra = ringR[a];
    const rb = ringR[b];
    for (let j = 0; j < seg; j++) {
      const A = a * cols + j;
      const B = A + 1;
      const D = b * cols + j;
      const C = D + 1;
      if (ra > 1e-9) g.tri(A, B, D);
      if (rb > 1e-9) g.tri(B, C, D);
    }
  }
  return g.done();
}

/** Points of a circular arc in the (r, z) half-plane, for use in a lathe profile. */
export function arcProfile(cr: number, cz: number, radius: number, a0: number, a1: number, steps: number): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push([Math.max(0, cr + radius * Math.cos(a)), cz + radius * Math.sin(a)]);
  }
  return out;
}

/** Closed cylinder along Z from `z0` to `z1`, with an optional rounded-look bevel. */
export function cyl(r: number, z0: number, z1: number, seg: number, bevel = 0): Geo {
  const b = Math.min(bevel, r * 0.5, (z1 - z0) * 0.45);
  const g =
    b <= 0
      ? lathe([[0, z0], [r, z0, 1], [r, z1, 1], [0, z1]], seg)
      : lathe([[0, z0], [r - b, z0, 2], [r, z0 + b], [r, z1 - b, 2], [r - b, z1], [0, z1]], seg);
  // Flat projection on the two end faces, so a texture does not squeeze to a point at the axis.
  const count = g.p.length / 3;
  for (let k = 0; k < count; k++) {
    if (Math.abs(g.n[k * 3 + 2]) > 0.999) {
      g.t[k * 2] = g.p[k * 3] / TILE;
      g.t[k * 2 + 1] = g.p[k * 3 + 1] / TILE;
    }
  }
  return g;
}

/** Closed frustum along Z: radius `r0` at `z0`, radius `r1` at `z1`. */
export function frustum(r0: number, r1: number, z0: number, z1: number, seg: number): Geo {
  return lathe([[0, z0], [r0, z0, 1], [r1, z1, 1], [0, z1]], seg);
}

/** Open pipe wall along Z (no caps), seen from the outside. */
export function pipe(r0: number, r1: number, z0: number, z1: number, seg: number): Geo {
  return lathe([[r0, z0], [r1, z1]], seg);
}

/** Sphere about the origin. */
export function sphere(r: number, seg: number, rings: number): Geo {
  return lathe(arcProfile(0, 0, r, -Math.PI / 2, Math.PI / 2, rings), seg);
}

/**
 * Capsule (tank) along Z: a cylinder of radius `r` between `z0` and `z1` with domes of height
 * `r * domeRatio` beyond each end.
 */
export function capsule(r: number, z0: number, z1: number, seg: number, domeRatio = 1, domeSteps = 5): Geo {
  const prof: ProfilePoint[] = [];
  for (let k = 0; k <= domeSteps; k++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (k / domeSteps);
    prof.push([r * Math.cos(a), z0 + r * domeRatio * Math.sin(a)]);
  }
  for (let k = 0; k <= domeSteps; k++) {
    const a = (Math.PI / 2) * (k / domeSteps);
    prof.push([r * Math.cos(a), z1 + r * domeRatio * Math.sin(a)]);
  }
  prof[0] = [0, prof[0][1]];
  prof[prof.length - 1] = [0, prof[prof.length - 1][1]];
  return lathe(prof, seg);
}

/** Torus about the Z axis: ring radius `R`, tube radius `r`. */
export function torus(R: number, r: number, seg: number, tubeSeg: number): Geo {
  const prof: ProfilePoint[] = [];
  for (let k = 0; k <= tubeSeg; k++) {
    const a = (Math.PI * 2 * k) / tubeSeg;
    prof.push([R + r * Math.cos(a), r * Math.sin(a)]);
  }
  return lathe(prof, seg);
}

/** Replaces the texture coordinates of a flat part with a flat projection: 0..1 over the square that holds radius `r`. */
function planarUv(g: Geo, r: number): Geo {
  const n = g.p.length / 3;
  for (let k = 0; k < n; k++) {
    g.t[k * 2] = g.p[k * 3] / (2 * r) + 0.5;
    g.t[k * 2 + 1] = g.p[k * 3 + 1] / (2 * r) + 0.5;
  }
  return g;
}

/** Flat disc at height `z`. It faces +Z if `up` is true, else -Z. Unit texture coordinates. */
export function disc(r: number, seg: number, z = 0, up = true): Geo {
  return planarUv(lathe(up ? [[r, z], [0, z]] : [[0, z], [r, z]], seg, { unitUv: true }), r);
}

/** Flat ring at height `z`. It faces +Z if `up` is true, else -Z. Unit texture coordinates. */
export function ring(r0: number, r1: number, seg: number, z = 0, up = true): Geo {
  return planarUv(lathe(up ? [[r1, z], [r0, z]] : [[r0, z], [r1, z]], seg, { unitUv: true }), r1);
}

/** Profile of a paraboloid z = r^2 / (4 f), from radius `r0` out to radius `r1`. */
export function parabola(r0: number, r1: number, focal: number, steps: number, zOffset = 0): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const r = r0 + (r1 - r0) * (k / steps);
    out.push([r, (r * r) / (4 * focal) + zOffset]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Boxes and prisms
// ---------------------------------------------------------------------------------------------

function cornerBit(axis: number, sign: number): number {
  return sign > 0 ? 1 << axis : 0;
}

/**
 * Box centred on the origin. A bevel larger than zero adds narrow strips along the edges that
 * take their normals from the faces, so the edges catch the light like rounded edges.
 */
export function box(w: number, h: number, d: number, bevel = 0): Geo {
  const g = new GeoWriter();
  const half = [w / 2, h / 2, d / 2];
  const b = Math.max(0, Math.min(bevel, w * 0.3, h * 0.3, d * 0.3));
  const vid: number[][] = [[], [], []];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (let c = 0; c < 8; c++) {
      const s = [c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1];
      const pos = [0, 0, 0];
      pos[a] = s[a] * half[a];
      pos[u] = s[u] * (half[u] - b);
      pos[v] = s[v] * (half[v] - b);
      const nrm = [0, 0, 0];
      nrm[a] = s[a];
      const tu = pos[u] / TILE + a * 0.37 + (s[a] > 0 ? 0.11 : 0.53);
      const tv = pos[v] / TILE + a * 0.61;
      vid[a][c] = g.vert(pos[0], pos[1], pos[2], nrm[0], nrm[1], nrm[2], tu, tv);
    }
  }
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      const cn = (su: number, sv: number): number => vid[a][cornerBit(a, sa) | cornerBit(u, su) | cornerBit(v, sv)];
      const out = [0, 0, 0];
      out[a] = sa;
      g.quadOut(cn(-1, -1), cn(1, -1), cn(1, 1), cn(-1, 1), out[0], out[1], out[2]);
    }
  }
  if (b > 0) {
    for (let e = 0; e < 3; e++) {
      const u = (e + 1) % 3;
      const v = (e + 2) % 3;
      for (const su of [-1, 1]) {
        for (const sv of [-1, 1]) {
          const c0 = cornerBit(u, su) | cornerBit(v, sv);
          const c1 = c0 | cornerBit(e, 1);
          const out = [0, 0, 0];
          out[u] = su;
          out[v] = sv;
          g.quadOut(vid[u][c0], vid[u][c1], vid[v][c1], vid[v][c0], out[0], out[1], out[2]);
        }
      }
    }
    for (let c = 0; c < 8; c++) {
      g.triOut(vid[0][c], vid[1][c], vid[2][c], c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1);
    }
  }
  return g.done();
}

/** Outline of a regular polygon with `n` corners on a circle of radius `r`. */
export function polygon(n: number, r: number, rotation = 0): P2[] {
  const out: P2[] = [];
  for (let k = 0; k < n; k++) {
    const a = rotation + (Math.PI * 2 * k) / n;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}

/** Radius of the corner circle of a regular polygon with `n` sides and a given width across flats. */
export function cornerRadius(n: number, acrossFlats: number): number {
  return acrossFlats / (2 * Math.cos(Math.PI / n));
}

/**
 * Prism: the outline (in the XY plane) pushed along Z from `z0` to `z1`. The sides are flat.
 * A bevel larger than zero rounds the look of all edges (see `box`).
 */
export function extrude(outline: readonly P2[], z0: number, z1: number, bevel = 0): Geo {
  const n = outline.length;
  let area = 0;
  for (let k = 0; k < n; k++) {
    const p = outline[k];
    const q = outline[(k + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const pts = area >= 0 ? outline.slice() : outline.slice().reverse();
  const dir: P2[] = [];
  const nor: P2[] = [];
  const len: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    dir.push([dx / l, dy / l]);
    nor.push([dy / l, -dx / l]);
    len.push(l);
  }
  const b = Math.max(0, Math.min(bevel, (z1 - z0) * 0.45));
  const inset: P2[] = pts.map((p, k) => {
    if (b <= 0) return [p[0], p[1]];
    const n1 = nor[(k + n - 1) % n];
    const n2 = nor[k];
    const f = b / Math.max(1 + n1[0] * n2[0] + n1[1] * n2[1], 0.25);
    return [p[0] - (n1[0] + n2[0]) * f, p[1] - (n1[1] + n2[1]) * f];
  });

  const g = new GeoWriter();
  const tris = THREE.ShapeUtils.triangulateShape(inset.map((p) => new THREE.Vector2(p[0], p[1])), []);
  const top = inset.map((p) => g.vert(p[0], p[1], z1, 0, 0, 1, p[0] / TILE, p[1] / TILE));
  const bot = inset.map((p) => g.vert(p[0], p[1], z0, 0, 0, -1, p[0] / TILE + 0.43, p[1] / TILE + 0.27));
  for (const t of tris) {
    g.triOut(top[t[0]], top[t[1]], top[t[2]], 0, 0, 1);
    g.triOut(bot[t[0]], bot[t[1]], bot[t[2]], 0, 0, -1);
  }
  const side: number[][] = [];
  let s = 0;
  const zl = z0 + b;
  const zh = z1 - b;
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const q = pts[(k + 1) % n];
    const bb = Math.min(b, len[k] * 0.45);
    const ax = p[0] + dir[k][0] * bb;
    const ay = p[1] + dir[k][1] * bb;
    const bx = q[0] - dir[k][0] * bb;
    const by = q[1] - dir[k][1] * bb;
    const nx = nor[k][0];
    const ny = nor[k][1];
    const u0 = s / TILE;
    const u1 = (s + len[k]) / TILE;
    const v0 = g.vert(ax, ay, zl, nx, ny, 0, u0, zl / TILE);
    const v1 = g.vert(bx, by, zl, nx, ny, 0, u1, zl / TILE);
    const v2 = g.vert(bx, by, zh, nx, ny, 0, u1, zh / TILE);
    const v3 = g.vert(ax, ay, zh, nx, ny, 0, u0, zh / TILE);
    g.quadOut(v0, v1, v2, v3, nx, ny, 0);
    side.push([v0, v1, v2, v3]);
    s += len[k];
  }
  if (b > 0) {
    for (let k = 0; k < n; k++) {
      const kn = (k + 1) % n;
      const a = side[k];
      const c = side[kn];
      const nk = nor[k];
      const nn = nor[kn];
      g.quadOut(a[3], a[2], top[kn], top[k], nk[0], nk[1], 1);
      g.quadOut(a[0], a[1], bot[kn], bot[k], nk[0], nk[1], -1);
      const ox = nk[0] + nn[0];
      const oy = nk[1] + nn[1];
      g.quadOut(a[1], c[0], c[3], a[2], ox, oy, 0);
      g.triOut(a[2], c[3], top[kn], ox, oy, 1);
      g.triOut(a[1], c[0], bot[kn], ox, oy, -1);
    }
  }
  return g.done();
}

/** Flat rectangle in the XY plane, centred, facing +Z. Unit texture coordinates. */
export function plane(w: number, h: number): Geo {
  const g = new GeoWriter();
  const a = g.vert(-w / 2, -h / 2, 0, 0, 0, 1, 0, 0);
  const b = g.vert(w / 2, -h / 2, 0, 0, 0, 1, 1, 0);
  const c = g.vert(w / 2, h / 2, 0, 0, 0, 1, 1, 1);
  const d = g.vert(-w / 2, h / 2, 0, 0, 0, 1, 0, 1);
  g.quad(a, b, c, d);
  return g.done();
}

/** Flat polygon in the XY plane at height `z`, facing +Z or -Z. Unit texture coordinates over its bounding box. */
export function flatPolygon(outline: readonly P2[], z = 0, up = true): Geo {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of outline) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  const g = new GeoWriter();
  const nz = up ? 1 : -1;
  const ids = outline.map((p) => g.vert(p[0], p[1], z, 0, 0, nz, (p[0] - x0) / (x1 - x0 || 1), (p[1] - y0) / (y1 - y0 || 1)));
  const tris = THREE.ShapeUtils.triangulateShape(outline.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const t of tris) g.triOut(ids[t[0]], ids[t[1]], ids[t[2]], 0, 0, nz);
  return g.done();
}

// ---------------------------------------------------------------------------------------------
// Tubes along a path, conversion and merge
// ---------------------------------------------------------------------------------------------

/** Round tube along a smooth curve through the points (cables, pipes). */
export function tubePath(points: readonly V3[], radius: number, radialSeg = 6, stepsPerSpan = 4): Geo {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal');
  const tubular = Math.max(2, (points.length - 1) * stepsPerSpan);
  const tg = new THREE.TubeGeometry(curve, tubular, radius, radialSeg, false);
  const geo = fromBufferGeometry(tg);
  tg.dispose();
  return geo;
}

/** Copy of a three.js geometry as a `Geo`. */
export function fromBufferGeometry(bg: THREE.BufferGeometry): Geo {
  const pos = bg.getAttribute('position');
  const nor = bg.getAttribute('normal');
  const uv = bg.getAttribute('uv');
  const count = pos.count;
  const p = new Float32Array(count * 3);
  const n = new Float32Array(count * 3);
  const t = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) {
    p[k * 3] = pos.getX(k);
    p[k * 3 + 1] = pos.getY(k);
    p[k * 3 + 2] = pos.getZ(k);
    n[k * 3] = nor.getX(k);
    n[k * 3 + 1] = nor.getY(k);
    n[k * 3 + 2] = nor.getZ(k);
    t[k * 2] = uv.getX(k);
    t[k * 2 + 1] = uv.getY(k);
  }
  const index = bg.getIndex();
  const i = new Uint32Array(index ? index.count : count);
  for (let k = 0; k < i.length; k++) i[k] = index ? index.getX(k) : k;
  return { p, n, t, i };
}

/** A `Geo` as a three.js geometry with a white vertex colour (for instanced parts). */
export function toBufferGeometry(geo: Geo): THREE.BufferGeometry {
  const bg = new THREE.BufferGeometry();
  const count = geo.p.length / 3;
  bg.setAttribute('position', new THREE.BufferAttribute(geo.p, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(geo.n, 3));
  bg.setAttribute('uv', new THREE.BufferAttribute(geo.t, 2));
  bg.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(count * 4).fill(255), 4, true));
  bg.setIndex(new THREE.BufferAttribute(count > 65535 ? geo.i : new Uint16Array(geo.i), 1));
  return bg;
}

/** Copy of a `Geo` with a transform applied (the triangles are turned over if the transform mirrors). */
export function transformGeo(geo: Geo, m: THREE.Matrix4): Geo {
  const e = m.elements;
  const count = geo.p.length / 3;
  const p = new Float32Array(count * 3);
  const n = new Float32Array(count * 3);
  const nm = new THREE.Matrix3().getNormalMatrix(m).elements;
  for (let k = 0; k < count; k++) {
    const x = geo.p[k * 3], y = geo.p[k * 3 + 1], z = geo.p[k * 3 + 2];
    p[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    p[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    p[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const a = geo.n[k * 3], b = geo.n[k * 3 + 1], c = geo.n[k * 3 + 2];
    const nx = nm[0] * a + nm[3] * b + nm[6] * c;
    const ny = nm[1] * a + nm[4] * b + nm[7] * c;
    const nz = nm[2] * a + nm[5] * b + nm[8] * c;
    const l = Math.hypot(nx, ny, nz) || 1;
    n[k * 3] = nx / l;
    n[k * 3 + 1] = ny / l;
    n[k * 3 + 2] = nz / l;
  }
  const i = new Uint32Array(geo.i);
  if (m.determinant() < 0) {
    for (let k = 0; k < i.length; k += 3) {
      const tmp = i[k + 1];
      i[k + 1] = i[k + 2];
      i[k + 2] = tmp;
    }
  }
  return { p, n, t: new Float32Array(geo.t), i };
}

/** One `Geo` from several. */
export function mergeGeo(parts: readonly Geo[]): Geo {
  let vc = 0;
  let ic = 0;
  for (const g of parts) {
    vc += g.p.length / 3;
    ic += g.i.length;
  }
  const p = new Float32Array(vc * 3);
  const n = new Float32Array(vc * 3);
  const t = new Float32Array(vc * 2);
  const i = new Uint32Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    p.set(g.p, vo * 3);
    n.set(g.n, vo * 3);
    t.set(g.t, vo * 2);
    for (let k = 0; k < g.i.length; k++) i[io + k] = g.i[k] + vo;
    vo += g.p.length / 3;
    io += g.i.length;
  }
  return { p, n, t, i };
}
