/**
 * Geometry of the body meshes.
 *
 * All round bodies share a few unit spheres (+Z is the pole). A mesh gives the sphere its size and its
 * flattening with `mesh.scale`. The spheres have positions only: the shaders compute normals and map
 * coordinates from the position.
 */
import * as THREE from 'three';

interface Shared {
  geometry: THREE.BufferGeometry;
  users: number;
}

const spheres = new Map<string, Shared>();

function buildSphere(columns: number, rows: number): THREE.BufferGeometry {
  const count = columns * (rows - 1) + 2;
  const pos = new Float32Array(count * 3);
  // Vertex 0 is the north pole. The last vertex is the south pole.
  pos[2] = 1;
  let k = 3;
  for (let j = 1; j < rows; j++) {
    const lat = Math.PI / 2 - (Math.PI * j) / rows;
    const z = Math.sin(lat);
    const c = Math.cos(lat);
    for (let i = 0; i < columns; i++) {
      const lon = (2 * Math.PI * i) / columns;
      pos[k++] = c * Math.cos(lon);
      pos[k++] = c * Math.sin(lon);
      pos[k++] = z;
    }
  }
  pos[k + 2] = -1;
  const south = count - 1;
  const at = (j: number, i: number): number => 1 + (j - 1) * columns + (i % columns);
  const index: number[] = [];
  for (let i = 0; i < columns; i++) {
    index.push(0, at(1, i), at(1, i + 1));
    index.push(south, at(rows - 1, i + 1), at(rows - 1, i));
  }
  for (let j = 1; j < rows - 1; j++) {
    for (let i = 0; i < columns; i++) {
      const a = at(j, i);
      const b = at(j, i + 1);
      const c = at(j + 1, i);
      const d = at(j + 1, i + 1);
      index.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(count > 65535 ? new THREE.BufferAttribute(new Uint32Array(index), 1) : new THREE.BufferAttribute(new Uint16Array(index), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  g.name = `bodies/sphere-${columns}x${rows}`;
  return g;
}

/** A shared unit sphere with `columns` segments in longitude and `rows` segments in latitude. Give it back with releaseSphere. */
export function acquireSphere(columns: number, rows: number): THREE.BufferGeometry {
  const key = `${columns}x${rows}`;
  let s = spheres.get(key);
  if (!s) {
    s = { geometry: buildSphere(columns, rows), users: 0 };
    spheres.set(key, s);
  }
  s.users++;
  return s.geometry;
}

export function releaseSphere(geometry: THREE.BufferGeometry): void {
  for (const [key, s] of spheres) {
    if (s.geometry !== geometry) continue;
    s.users--;
    if (s.users <= 0) {
      s.geometry.dispose();
      spheres.delete(key);
    }
    return;
  }
}

/** Number of triangles of a geometry. */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute('position').count) / 3;
}

/**
 * A flat ring in the plane z = 0, in km. The mesh is a little wider than [inner, outer]:
 * the shader cuts the exact circles, so the edges are round with any number of segments.
 */
export function buildAnnulus(inner: number, outer: number, segments: number): THREE.BufferGeometry {
  const r0 = inner * 0.99;
  const r1 = (outer * 1.01) / Math.cos(Math.PI / segments);
  const pos = new Float32Array(segments * 2 * 3);
  const index: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.set([r0 * c, r0 * s, 0, r1 * c, r1 * s, 0], i * 6);
    const j = (i + 1) % segments;
    index.push(2 * i, 2 * i + 1, 2 * j + 1, 2 * i, 2 * j + 1, 2 * j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(index), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), r1);
  g.name = 'bodies/ring';
  return g;
}

export interface IcoSphere {
  /** Unit vectors, three numbers for each vertex. */
  directions: Float32Array;
  index: Uint32Array;
}

const icoCache = new Map<number, IcoSphere>();

/** A sphere of nearly equal triangles: an icosahedron after `level` subdivisions (20 * 4^level triangles). */
export function icoSphere(level: number): IcoSphere {
  const cached = icoCache.get(level);
  if (cached) return cached;
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: number[] = [];
  const add = (x: number, y: number, z: number): number => {
    const n = Math.hypot(x, y, z);
    verts.push(x / n, y / n, z / n);
    return verts.length / 3 - 1;
  };
  for (const [x, y, z] of [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]) add(x, y, z);
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  for (let l = 0; l < level; l++) {
    const mid = new Map<number, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? a * 1048576 + b : b * 1048576 + a;
      let m = mid.get(key);
      if (m === undefined) {
        m = add(verts[a * 3] + verts[b * 3], verts[a * 3 + 1] + verts[b * 3 + 1], verts[a * 3 + 2] + verts[b * 3 + 2]);
        mid.set(key, m);
      }
      return m;
    };
    const next: number[] = [];
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f];
      const b = faces[f + 1];
      const c = faces[f + 2];
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    faces = next;
  }
  const ico = { directions: new Float32Array(verts), index: new Uint32Array(faces) };
  icoCache.set(level, ico);
  return ico;
}
