/**
 * Test page for the procedural spacecraft models.
 *
 * URL query:
 *   kind=voyager|cassini|...     model (default voyager)
 *   view=front|side|top|iso|back   whole model from five sides (default front)
 *   view=mid                     the body without the long booms
 *   view=far                     from 50 m
 *   view=close|detail            two close cameras, set for each model
 *   bg=dark|grey                 background (default dark = black)
 *   env=room|flat|none           environment map (default room; flat and none test weak reflections)
 *   sun=x,y,z                    direction to the Sun in model axes
 *   dir=x,y,z  target=x,y,z  dist=metres   free camera (overrides the view)
 *   spin=1                       turn the model with its spin rate (time is 20 times faster)
 *
 * The lighting is the lighting of the application: one strong directional light (the Sun), a weak
 * fill light, a dim prefiltered environment map, logarithmic depth buffer, ACES filmic tone
 * mapping, sRGB output.
 *
 * After the first frames the page sets `window.__ready = true` and `window.__stats` (triangles,
 * triangles per mesh, draw calls, build times and geometry checks) for the screenshot script.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SPACECRAFT_KINDS, buildSpacecraft } from '../../src/render/spacecraft/index';
import type { SpacecraftKind, SpacecraftModel } from '../../src/render/spacecraft/index';

interface Stats {
  kind: string;
  triangles: number;
  meshes: number;
  drawCalls: number;
  buildMsFirst: number;
  buildMsMedian: number;
  radius: number;
  flippedTriangles: number;
  badVertices: number;
  unnamedMeshes: number;
  shadowFlags: number;
  /** Triangles per mesh, largest first. */
  parts: { name: string; triangles: number }[];
}

declare global {
  interface Window {
    __ready?: boolean;
    __stats?: Stats;
    __error?: string;
  }
}

/** Lighting constants of the test page. The application must use the same values for the same look. */
export const LIGHTING = {
  sunIntensity: 3.2,
  fillIntensity: 0.22,
  environmentIntensity: 0.32,
  exposure: 1.0,
};

type V3 = [number, number, number];

function parseVec(text: string | null): V3 | null {
  if (!text) return null;
  const p = text.split(',').map(Number);
  return p.length === 3 && p.every((v) => Number.isFinite(v)) ? [p[0], p[1], p[2]] : null;
}

const VIEWS: Record<string, { dir: V3; up: V3 }> = {
  front: { dir: [0.4, 0.3, 1], up: [0, 1, 0] },
  side: { dir: [1, 0.22, 0.14], up: [0, 0, 1] },
  top: { dir: [0.05, 1, 0.2], up: [0, 0, 1] },
  iso: { dir: [-0.75, 0.5, 0.7], up: [0, 0, 1] },
  back: { dir: [0.55, -0.4, -1], up: [0, 1, 0] },
  mid: { dir: [0.7, 0.45, 0.8], up: [0, 0, 1] },
  far: { dir: [0.75, 0.5, 0.6], up: [0, 0, 1] },
  close: { dir: [0.62, 0.42, 0.66], up: [0, 0, 1] },
  detail: { dir: [0.62, 0.42, 0.66], up: [0, 0, 1] },
};

interface Cam {
  dir: V3;
  target: V3;
  dist: number;
}

/**
 * Per model: `core` = radius (m) of the body without its long booms (the "mid" view frames it),
 * and two close cameras that look at the detail from about 5 m and from about 3.5 m.
 */
const FOCUS: Record<SpacecraftKind, { core: number; close: Cam; detail: Cam }> = {
  voyager: {
    core: 3.3,
    close: { dir: [0.8, 0.55, 0.16], target: [0.5, 0, 0.1], dist: 5.5 },
    detail: { dir: [0.5, 0.75, -0.3], target: [1.6, 0.4, -0.1], dist: 3.6 },
  },
  cassini: {
    core: 4.2,
    close: { dir: [0.75, 0.55, 0.3], target: [0, 0, 0.2], dist: 6.5 },
    detail: { dir: [0.6, 0.7, -0.25], target: [0, 0, -1.4], dist: 4.2 },
  },
  newhorizons: {
    core: 2.6,
    close: { dir: [0.7, 0.62, 0.35], target: [0.2, 0, 0.1], dist: 5.2 },
    detail: { dir: [0.35, 0.9, 0.2], target: [0, 0.3, 0], dist: 3.4 },
  },
  juno: {
    core: 3.6,
    close: { dir: [0.6, 0.55, 0.58], target: [0, 0, 0.5], dist: 6.0 },
    detail: { dir: [0.3, 0.85, 0.35], target: [0, 1.6, 0.3], dist: 4.0 },
  },
  galileo: {
    core: 4.4,
    close: { dir: [0.7, 0.6, 0.25], target: [0, 0, -0.6], dist: 6.5 },
    detail: { dir: [0.75, 0.55, -0.2], target: [0.3, 0, -1.6], dist: 4.0 },
  },
  pioneer: {
    core: 3.6,
    close: { dir: [0.6, 0.6, 0.5], target: [0, 0, 0.2], dist: 5.5 },
    detail: { dir: [0.6, 0.7, -0.4], target: [0, 0, -0.2], dist: 3.6 },
  },
  marscruise: {
    core: 2.7,
    close: { dir: [0.6, 0.5, 0.62], target: [0, 0, 0.6], dist: 6.0 },
    detail: { dir: [0.7, 0.68, 0.2], target: [0.8, 0.8, 1.0], dist: 3.4 },
  },
  apsis: {
    core: 3.0,
    close: { dir: [0.5, 0.72, 0.48], target: [0, 0, 0.3], dist: 6.0 },
    detail: { dir: [0.55, 0.6, -0.55], target: [0.2, 0, -0.9], dist: 3.6 },
  },
  ulysses: {
    core: 3.6,
    close: { dir: [0.55, 0.6, 0.55], target: [0, 0, 0.2], dist: 6.5 },
    detail: { dir: [-0.75, 0.6, 0.25], target: [-1.6, 0, 0.1], dist: 4.2 },
  },
};

interface Count {
  triangles: number;
  meshes: number;
  unnamed: number;
  shadowFlags: number;
  parts: { name: string; triangles: number }[];
}

function countTriangles(root: THREE.Object3D): Count {
  let triangles = 0;
  let meshes = 0;
  let unnamed = 0;
  let shadowFlags = 0;
  const parts: { name: string; triangles: number }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    if (!mesh.name) unnamed++;
    if (mesh.castShadow || mesh.receiveShadow) shadowFlags++;
    const g = mesh.geometry;
    const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
    const copies = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    triangles += n * copies;
    parts.push({ name: mesh.name, triangles: n * copies });
  });
  parts.sort((a, b) => b.triangles - a.triangles);
  return { triangles, meshes, unnamed, shadowFlags, parts };
}

/** Counts triangles whose winding disagrees with their vertex normals, and vertices that are not finite. */
function checkGeometry(root: THREE.Object3D): { flipped: number; bad: number } {
  let flipped = 0;
  let bad = 0;
  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || seen.has(mesh.geometry)) return;
    seen.add(mesh.geometry);
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const idx = g.index;
    if (!idx) return;
    for (let k = 0; k < pos.count; k++) {
      if (!Number.isFinite(pos.getX(k) + pos.getY(k) + pos.getZ(k) + nor.getX(k) + nor.getY(k) + nor.getZ(k))) bad++;
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      const ia = idx.getX(t);
      const ib = idx.getX(t + 1);
      const ic = idx.getX(t + 2);
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      e1.cross(e2);
      const area = e1.length();
      if (area < 1e-12) continue;
      n.set(
        nor.getX(ia) + nor.getX(ib) + nor.getX(ic),
        nor.getY(ia) + nor.getY(ib) + nor.getY(ic),
        nor.getZ(ia) + nor.getZ(ib) + nor.getZ(ic),
      );
      if (e1.dot(n) < -1e-6 * area) flipped++;
    }
  });
  return { flipped, bad };
}

function start(): void {
  const q = new URLSearchParams(location.search);
  const kindText = q.get('kind') ?? 'voyager';
  if (!(SPACECRAFT_KINDS as string[]).includes(kindText)) {
    throw new Error(`Unknown kind "${kindText}". Known kinds: ${SPACECRAFT_KINDS.join(', ')}`);
  }
  const kind = kindText as SpacecraftKind;
  const viewName = q.get('view') ?? 'front';
  const view = VIEWS[viewName] ?? VIEWS.front;

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHTING.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(q.get('bg') === 'grey' ? 0x3b3e44 : 0x000000);

  const envName = q.get('env') ?? 'room';
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (envName === 'room') {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = LIGHTING.environmentIntensity;
  } else if (envName === 'flat') {
    const flat = new THREE.Scene();
    flat.background = new THREE.Color(0x30343c);
    scene.environment = pmrem.fromScene(flat).texture;
    scene.environmentIntensity = 1;
  }
  pmrem.dispose();

  const sunDir = new THREE.Vector3(...(parseVec(q.get('sun')) ?? [0.45, 0.55, 0.7])).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, LIGHTING.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(1000);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, LIGHTING.fillIntensity));

  // Build: first build (with the texture work), then the median of five more builds.
  const t0 = performance.now();
  let model: SpacecraftModel = buildSpacecraft(kind);
  const buildMsFirst = performance.now() - t0;
  const times: number[] = [];
  for (let k = 0; k < 5; k++) {
    model.dispose();
    const t = performance.now();
    model = buildSpacecraft(kind);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  scene.add(model.object);

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 1e7);
  const aspect = window.innerWidth / window.innerHeight;
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const half = Math.min(halfV, halfH);
  const focus = FOCUS[kind];
  const cam = viewName === 'close' ? focus.close : viewName === 'detail' ? focus.detail : null;
  const dir = new THREE.Vector3(...(parseVec(q.get('dir')) ?? cam?.dir ?? view.dir)).normalize();
  const target = new THREE.Vector3(...(parseVec(q.get('target')) ?? cam?.target ?? [0, 0, 0]));
  const frame = (r: number): number => (r / Math.sin(half)) * 1.03;
  let dist = cam ? cam.dist : viewName === 'far' ? 50 : viewName === 'mid' ? frame(Math.min(focus.core, model.radius)) : frame(model.radius);
  const distText = q.get('dist');
  if (distText && Number.isFinite(Number(distText))) dist = Number(distText);
  camera.up.set(...view.up);
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.update();

  const spin = q.get('spin') === '1' ? model.spin : null;
  let last = performance.now();
  let frames = 0;
  const tick = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (spin) model.object.rotateOnAxis(spin.axis, spin.rate * dt * 20);
    renderer.render(scene, camera);
    frames++;
    if (frames === 3) {
      const tri = countTriangles(model.object);
      const chk = checkGeometry(model.object);
      window.__stats = {
        kind,
        triangles: tri.triangles,
        meshes: tri.meshes,
        drawCalls: renderer.info.render.calls,
        buildMsFirst: Math.round(buildMsFirst * 10) / 10,
        buildMsMedian: Math.round(times[2] * 10) / 10,
        radius: Math.round(model.radius * 1000) / 1000,
        flippedTriangles: chk.flipped,
        badVertices: chk.bad,
        unnamedMeshes: tri.unnamed,
        shadowFlags: tri.shadowFlags,
        parts: tri.parts,
      };
      window.__ready = true;
    }
    requestAnimationFrame(tick);
  };
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
  tick();
}

try {
  start();
} catch (e) {
  window.__error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error(e);
  window.__ready = true;
}
