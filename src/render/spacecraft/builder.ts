/**
 * Model builder: collects geometry, merges it into a few meshes and makes instanced meshes.
 *
 * A model is a root group with named assemblies (sub-groups). In each assembly, all static
 * geometry that uses the same material becomes ONE mesh, and all copies of the same small part
 * (truss members, fins, louver blades) become ONE instanced mesh. A model with thousands of
 * parts thus needs only some tens of draw calls.
 *
 * A `Ctx` is a drawing position: an assembly plus a transform. Its methods return new contexts
 * (`move`, `rotZ`, `aim`...) or add geometry at the current transform (`add`, `box`, `strut`...).
 */
import * as THREE from 'three';
import { box, cyl, lathe, pipe, toBufferGeometry, vcross, vlen, vnorm, vsub } from './geometry';
import type { Geo, ProfilePoint, V3 } from './geometry';
import { Materials } from './materials';

/** What a model file returns to the builder. */
export interface ModelSpec {
  /** Boresight of the main antenna (model axes). */
  boresight: V3;
  /** Spin axis and rate (rad/s), or null for a three-axis spacecraft. */
  spin: { axis: V3; rate: number } | null;
}

export interface EmitOptions {
  /** Scale (and optional offset) of the texture coordinates: [su, sv, ou, ov]. */
  uv?: readonly [number, number, number?, number?];
  /** Colour factor (sRGB hex) applied to this part through the vertex colours. */
  tint?: number;
}

interface Emission {
  geo: Geo;
  m: THREE.Matrix4;
  su: number;
  sv: number;
  ou: number;
  ov: number;
  tint: number;
}

interface Batch {
  mat: THREE.Material;
  list: Emission[];
  verts: number;
  indices: number;
}

interface InstanceSet {
  key: string;
  geo: Geo;
  mat: THREE.Material;
  matrices: number[];
  tints: number[];
  tinted: boolean;
}

export interface BuiltModel {
  object: THREE.Group;
  radius: number;
  dispose(): void;
}

const WHITE = 0xffffff;
const strutGeoCache = new Map<string, Geo>();
const geoIds = new WeakMap<Geo, number>();
let nextGeoId = 1;

function geoId(geo: Geo): number {
  let id = geoIds.get(geo);
  if (id === undefined) {
    id = nextGeoId++;
    geoIds.set(geo, id);
  }
  return id;
}

function strutGeo(sides: number, capped: boolean): Geo {
  const key = `${sides}:${capped ? 1 : 0}`;
  let g = strutGeoCache.get(key);
  if (!g) {
    g = capped ? cyl(1, 0, 1, sides) : pipe(1, 1, 0, 1, sides);
    strutGeoCache.set(key, g);
  }
  return g;
}

/** Transform with the origin at `from` and the local +Z axis to `to`. */
export function aimMatrix(from: V3, to: V3, up: V3 = [0, 0, 1]): THREE.Matrix4 {
  const z = vnorm(vsub(to, from));
  let x = vcross(up, z);
  if (vlen(x) < 1e-4) x = vcross(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z);
  x = vnorm(x);
  const y = vcross(z, x);
  return new THREE.Matrix4().set(
    x[0], y[0], z[0], from[0],
    x[1], y[1], z[1], from[1],
    x[2], y[2], z[2], from[2],
    0, 0, 0, 1,
  );
}

export class Assembly {
  readonly group: THREE.Group;
  /** False for parts that must not enlarge the bounding radius of the model (very long wires). */
  inRadius = true;
  readonly batches = new Map<THREE.Material, Batch>();
  readonly instances = new Map<string, InstanceSet>();

  constructor(readonly builder: Builder, readonly name: string) {
    this.group = new THREE.Group();
    this.group.name = `${builder.kind}/${name}`;
  }

  /** Drawing context at the origin of this assembly. */
  ctx(): Ctx {
    return new Ctx(this, new THREE.Matrix4());
  }
}

export class Ctx {
  constructor(readonly asm: Assembly, readonly m: THREE.Matrix4) {}

  /** Material library of the model. */
  get mat(): Materials {
    return this.asm.builder.mat;
  }

  mul(m: THREE.Matrix4): Ctx {
    return new Ctx(this.asm, this.m.clone().multiply(m));
  }

  move(x: number, y: number, z: number): Ctx {
    return this.mul(new THREE.Matrix4().makeTranslation(x, y, z));
  }

  at(p: V3): Ctx {
    return this.move(p[0], p[1], p[2]);
  }

  rotX(a: number): Ctx {
    return this.mul(new THREE.Matrix4().makeRotationX(a));
  }

  rotY(a: number): Ctx {
    return this.mul(new THREE.Matrix4().makeRotationY(a));
  }

  rotZ(a: number): Ctx {
    return this.mul(new THREE.Matrix4().makeRotationZ(a));
  }

  scale(sx: number, sy = sx, sz = sx): Ctx {
    return this.mul(new THREE.Matrix4().makeScale(sx, sy, sz));
  }

  /** Context with the origin at `from` and the local +Z axis to `to`. */
  aim(from: V3, to: V3, up: V3 = [0, 0, 1]): Ctx {
    return this.mul(aimMatrix(from, to, up));
  }

  /**
   * Context on a face: the origin moves by `dist` along `dir` and the local +Z axis becomes `dir`.
   * For a horizontal `dir`, the local +Y axis is the old +Z axis and the local +X axis is horizontal.
   */
  face(dir: V3, dist: number): Ctx {
    const p: V3 = [dir[0] * dist, dir[1] * dist, dir[2] * dist];
    return this.aim(p, [p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]]);
  }

  /** A point of this context in the coordinates of the assembly. */
  point(p: V3): V3 {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.m);
    return [v.x, v.y, v.z];
  }

  /** Adds static geometry at the current transform. */
  add(geo: Geo, mat: THREE.Material, o: EmitOptions = {}): this {
    let batch = this.asm.batches.get(mat);
    if (!batch) {
      batch = { mat, list: [], verts: 0, indices: 0 };
      this.asm.batches.set(mat, batch);
    }
    const uv = o.uv;
    batch.list.push({
      geo,
      m: this.m,
      su: uv ? uv[0] : 1,
      sv: uv ? uv[1] : 1,
      ou: uv ? (uv[2] ?? 0) : 0,
      ov: uv ? (uv[3] ?? 0) : 0,
      tint: o.tint ?? WHITE,
    });
    batch.verts += geo.p.length / 3;
    batch.indices += geo.i.length;
    return this;
  }

  /** Adds one copy of a repeated part. All copies of the same geometry and material share one instanced mesh. */
  inst(key: string, geo: Geo, mat: THREE.Material, tint: number = WHITE): this {
    const id = `${geoId(geo)}|${mat.uuid}`;
    let set = this.asm.instances.get(id);
    if (!set) {
      set = { key, geo, mat, matrices: [], tints: [], tinted: false };
      this.asm.instances.set(id, set);
    }
    const e = this.m.elements;
    for (let k = 0; k < 16; k++) set.matrices.push(e[k]);
    set.tints.push(tint);
    if (tint !== WHITE) set.tinted = true;
    return this;
  }

  /** Round member between two points (instanced). */
  strut(a: V3, b: V3, radius: number, mat: THREE.Material, sides = 6, capped = true, tint: number = WHITE): this {
    const len = vlen(vsub(b, a));
    if (len < 1e-6) return this;
    const c = this.mul(aimMatrix(a, b).multiply(new THREE.Matrix4().makeScale(radius, radius, len)));
    c.inst(`strut${sides}${capped ? 'c' : 'o'}`, strutGeo(sides, capped), mat, tint);
    return this;
  }

  /** Chain of round members through the points. */
  polyline(points: readonly V3[], radius: number, mat: THREE.Material, sides = 6): this {
    for (let k = 0; k < points.length - 1; k++) this.strut(points[k], points[k + 1], radius, mat, sides);
    return this;
  }

  /** Box centred on the current origin. */
  box(w: number, h: number, d: number, mat: THREE.Material, bevel = 0.008, tint: number = WHITE): this {
    // The texture offset depends on the place of the box, so equal boxes do not look the same.
    const e = this.m.elements;
    const ou = e[12] * 0.731 + e[13] * 1.377 + e[14] * 0.413;
    const ov = e[12] * 1.129 - e[13] * 0.587 + e[14] * 0.871;
    return this.add(box(w, h, d, bevel), mat, { tint, uv: [1, 1, ou - Math.floor(ou), ov - Math.floor(ov)] });
  }

  /** Closed cylinder along the local Z axis. */
  cyl(r: number, z0: number, z1: number, mat: THREE.Material, seg = 16, bevel = 0, tint: number = WHITE): this {
    return this.add(cyl(r, z0, z1, seg, bevel), mat, { tint });
  }

  /** Surface of revolution about the local Z axis. */
  lathe(profile: readonly ProfilePoint[], mat: THREE.Material, seg = 24, tint: number = WHITE): this {
    return this.add(lathe(profile, seg), mat, { tint });
  }
}

const tmpColor = new THREE.Color();
const tmpNormalMatrix = new THREE.Matrix3();
const tmpMatrix = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();

interface Merged {
  geometry: THREE.BufferGeometry;
  /** Largest distance of a vertex from the model origin. */
  reach: number;
}

function mergeBatch(batch: Batch, world: THREE.Matrix4): Merged {
  const w = world.elements;
  let reach2 = 0;
  const vc = batch.verts;
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const uv = new Float32Array(vc * 2);
  const col = new Uint8Array(vc * 4);
  const idx = vc > 65535 ? new Uint32Array(batch.indices) : new Uint16Array(batch.indices);
  let vo = 0;
  let io = 0;
  for (const e of batch.list) {
    const g = e.geo;
    const m = e.m.elements;
    const k = tmpNormalMatrix.getNormalMatrix(e.m).elements;
    const flip = e.m.determinant() < 0;
    tmpColor.setHex(e.tint);
    const cr = Math.round(tmpColor.r * 255);
    const cg = Math.round(tmpColor.g * 255);
    const cb = Math.round(tmpColor.b * 255);
    const count = g.p.length / 3;
    for (let v = 0; v < count; v++) {
      const x = g.p[v * 3], y = g.p[v * 3 + 1], z = g.p[v * 3 + 2];
      const o3 = (vo + v) * 3;
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      pos[o3] = px;
      pos[o3 + 1] = py;
      pos[o3 + 2] = pz;
      const wx = w[0] * px + w[4] * py + w[8] * pz + w[12];
      const wy = w[1] * px + w[5] * py + w[9] * pz + w[13];
      const wz = w[2] * px + w[6] * py + w[10] * pz + w[14];
      const d2 = wx * wx + wy * wy + wz * wz;
      if (d2 > reach2) reach2 = d2;
      const a = g.n[v * 3], b = g.n[v * 3 + 1], c = g.n[v * 3 + 2];
      const nx = k[0] * a + k[3] * b + k[6] * c;
      const ny = k[1] * a + k[4] * b + k[7] * c;
      const nz = k[2] * a + k[5] * b + k[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[o3] = nx / l;
      nor[o3 + 1] = ny / l;
      nor[o3 + 2] = nz / l;
      const o2 = (vo + v) * 2;
      uv[o2] = g.t[v * 2] * e.su + e.ou;
      uv[o2 + 1] = g.t[v * 2 + 1] * e.sv + e.ov;
      const o4 = (vo + v) * 4;
      col[o4] = cr;
      col[o4 + 1] = cg;
      col[o4 + 2] = cb;
      col[o4 + 3] = 255;
    }
    const gi = g.i;
    for (let t = 0; t < gi.length; t += 3) {
      idx[io] = gi[t] + vo;
      idx[io + 1] = (flip ? gi[t + 2] : gi[t + 1]) + vo;
      idx[io + 2] = (flip ? gi[t + 1] : gi[t + 2]) + vo;
      io += 3;
    }
    vo += count;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  bg.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
  bg.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry: bg, reach: Math.sqrt(reach2) };
}

/** Largest distance from the model origin of the corners of a box under two transforms. */
function boxReach(bb: THREE.Box3, instance: THREE.Matrix4, world: THREE.Matrix4): number {
  let reach2 = 0;
  for (let c = 0; c < 8; c++) {
    tmpVec.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
    tmpVec.applyMatrix4(instance).applyMatrix4(world);
    reach2 = Math.max(reach2, tmpVec.lengthSq());
  }
  return Math.sqrt(reach2);
}

export class Builder {
  readonly root: THREE.Group;
  readonly mat = new Materials();
  private readonly assemblies: Assembly[] = [];

  constructor(readonly kind: string) {
    this.root = new THREE.Group();
    this.root.name = kind;
  }

  /** New named assembly (a sub-group of the model, or of another assembly). */
  assembly(name: string, parent?: Assembly): Assembly {
    const a = new Assembly(this, name);
    (parent ? parent.group : this.root).add(a.group);
    this.assemblies.push(a);
    return a;
  }

  /** Builds the meshes. Call once, after all geometry is added. */
  finish(): BuiltModel {
    const geometries: THREE.BufferGeometry[] = [];
    const instanced: THREE.InstancedMesh[] = [];
    const templates = new Map<Geo, THREE.BufferGeometry>();
    let radius = 0;
    this.root.updateMatrixWorld(true);

    for (const asm of this.assemblies) {
      const world = asm.group.matrixWorld;

      for (const batch of asm.batches.values()) {
        if (batch.verts === 0) continue;
        const merged = mergeBatch(batch, world);
        const bg = merged.geometry;
        bg.computeBoundingSphere();
        geometries.push(bg);
        const mesh = new THREE.Mesh(bg, batch.mat);
        mesh.name = `${asm.group.name}/${batch.mat.name}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        asm.group.add(mesh);
        if (asm.inRadius) radius = Math.max(radius, merged.reach);
      }

      for (const set of asm.instances.values()) {
        let bg = templates.get(set.geo);
        if (!bg) {
          bg = toBufferGeometry(set.geo);
          bg.computeBoundingBox();
          bg.computeBoundingSphere();
          templates.set(set.geo, bg);
          geometries.push(bg);
        }
        const count = set.matrices.length / 16;
        const mesh = new THREE.InstancedMesh(bg, set.mat, count);
        mesh.name = `${asm.group.name}/${set.key}/${set.mat.name}`;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.instanceMatrix.array.set(set.matrices);
        mesh.instanceMatrix.needsUpdate = true;
        if (set.tinted) {
          const colors = new Float32Array(count * 3);
          for (let k = 0; k < count; k++) {
            tmpColor.setHex(set.tints[k]);
            colors[k * 3] = tmpColor.r;
            colors[k * 3 + 1] = tmpColor.g;
            colors[k * 3 + 2] = tmpColor.b;
          }
          mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        }
        mesh.computeBoundingSphere();
        asm.group.add(mesh);
        instanced.push(mesh);
        const bb = bg.boundingBox;
        if (asm.inRadius && bb) {
          for (let k = 0; k < count; k++) {
            tmpMatrix.fromArray(set.matrices, k * 16);
            radius = Math.max(radius, boxReach(bb, tmpMatrix, world));
          }
        }
      }
      asm.batches.clear();
      asm.instances.clear();
    }

    const mat = this.mat;
    return {
      object: this.root,
      radius,
      dispose(): void {
        for (const g of geometries) g.dispose();
        for (const m of instanced) m.dispose();
        mat.dispose();
      },
    };
  }
}
