/**
 * Test page for the body rendering module (src/render/bodies).
 *
 * URL query, one body:
 *   body=<ID>              id of the body table, or any other text for the generic rocky body (default EARTH)
 *   quality=high|low       (default high)
 *   distance=<n>|fit       distance of the camera from the body centre in body radii (default fit: the body fills the view)
 *   phase=<deg>            angle Sun - body - camera (default 40). 0: the Sun is behind the camera. 180: the camera looks at the Sun.
 *   lat=<deg> lon=<deg>    point of the body below the camera, body-fixed (default 15, 0; a long body, a moon
 *                          of Uranus and a body with one well-known feature have their own default, see DEFAULT_VIEW)
 *   sunlat=<deg>           latitude of the point below the Sun. Without it the Sun is to the east of the camera at the phase angle
 *                          (Saturn: 18 by default, see SUN_LATITUDE).
 *   aim=<0..1.2>           turn the camera from the body centre to the limb (1 = the limb is in the middle of the view)
 *   aimaz=<deg>            direction of this turn: 0 = east (right), 90 = north (up) (default 90)
 *   variant=default|surface
 *   bg=black|stars|grey    background (default black)
 *   fov=<deg>              vertical field of view (default 35)
 *   t=<seconds>            display time for the animated parts (default 0). anim=1: the time runs.
 *   et=<seconds>           ephemeris time for the orientation of the body (default 0 = J2000)
 *   caster=dx,dy,dist,r    a body that hides the Sun: offset from the Sun line, distance and radius, in body radii
 *   sundist=<au>           distance to the Sun for the width of the soft shadow edge (default: a typical value for the body)
 *   fill=<0..1>            fill light for the parts with no sunlight (BodyUpdate.nightFill, default 0 = none)
 *   maps=none              use an empty manifest (all bodies are then made by code)
 *   drop=id,id             remove these texture ids from the manifest (test of the fallbacks)
 *   fail=id,id|all         give these texture ids the address of a file that does not exist (test of a failed download)
 *   failup=id,id|all       the same, but only for the larger file that a body loads when the camera is near
 *   upgrade=0              the body keeps the map files that it starts with (BodyOptions.mapUpgrade = false)
 *   return=<seconds>|never time with no need of the larger file after which a map goes back to its first file
 *                          (BodyOptions.mapReturnDelay, default 10). Move the camera away with the mouse wheel to see it.
 *   large=<n>|all          number of maps of all bodies that can use their larger file at one time
 *                          (BodyOptions.maxLargeMaps, default 2)
 *   mag=bilinear           the plain filter for a map that is larger on the screen than in its file (BodyOptions.magFilter)
 *   dpr=<n>                pixel ratio of the canvas (default 1)
 *
 * URL query, all bodies in a grid at the same phase:
 *   sheet=1 [quality, phase, lat, lon, variant, bg, maps, drop, fail, failup, upgrade, return, large, mag, fill, labels=0]
 *
 * The body has its real orientation in the ICRF axes (bodyAxes of the engine). It is far from the origin of the
 * scene, as in the application. The renderer has the settings of the application: logarithmic depth buffer,
 * ACES filmic tone mapping, exposure 1, sRGB output. The scene has no three.js light.
 *
 * The page sets `window.__ready = true` and `window.__stats` when all maps are ready, no larger map file loads,
 * and three frames are drawn after that. So a picture of a view from near shows the larger files.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BODIES, BODY_LIST } from '../../src/engine/bodies';
import { bodyAxes } from '../../src/engine/frames';
import { EMPTY_MANIFEST, createBody, createStarfield, loadManifest } from '../../src/render/bodies/index';
import type { BodyOptions, BodyQuality, BodyVariant, BodyVisual, ShadowCaster, TextureManifest } from '../../src/render/bodies/index';

interface BodyReport {
  id: string;
  quality: string;
  variant: string;
  provenance: string;
  notes: string[];
  radiusKm: number;
  extentKm: number;
  triangles: number;
  trianglesMax: number;
  mapTextures: number;
  codeTextures: number;
  samplesPerPixel: number;
  /** Width of the widest map file in use, pixels. */
  mapWidth: number;
  /** Time of createBody, ms. */
  buildMs: number;
  /** Time from createBody to onLoad, ms. */
  loadMs: number;
}

interface Stats {
  mode: 'single' | 'sheet';
  bodies: BodyReport[];
  drawCalls: number;
  /** Median time of one frame with a pixel read-back, ms. It is a rough number for this computer only. */
  frameMs: number;
  glTextures: number;
  glPrograms: number;
  width: number;
  height: number;
  /**
   * One body only. Each frame that first showed a map file of a new width: the width, and the time of the frame
   * with a pixel read-back (ms). The read-back waits for the GPU, so the time has the work of the GPU in it.
   */
  mapFrames?: { width: number; ms: number }[];
  /**
   * One body only. The longest frame (ms, with a pixel read-back) from the second frame after the first maps were
   * ready, until the page is ready. A larger map file loads in this time: the value shows if the picture stops.
   */
  longestFrameMs?: number;
  /** One body only. Number of frames from the first frame with the first maps to the first frame with the larger files. */
  upgradeFrames?: number;
}

declare global {
  interface Window {
    __ready?: boolean;
    __stats?: Stats;
    __error?: string;
  }
}

const AU_KM = 149597870.7;

/** Typical distance to the Sun in au, for the soft edge of the shadows on this page only. Round values. */
const SUN_DISTANCE_AU: Record<string, number> = {
  MERCURY: 0.39,
  VENUS: 0.72,
  EARTH: 1,
  MARS: 1.52,
  JUPITER: 5.2,
  SATURN: 9.5,
  URANUS: 19.2,
  NEPTUNE: 30,
  PLUTO: 39.5,
};

/**
 * Default latitude and longitude of the point below the camera, for the bodies that need their own.
 * A body with a long shape: from (15, 0) the camera would look along the long axis and the body would look round.
 * A moon of Uranus: its map has data in the south only, and from (15, 0) most of the view would be the area with no data.
 * A body with one well-known feature: the feature is a little to the east of the view centre, so it is in the light
 * at each phase angle up to 90 degrees. The places were found by a look at the map files.
 */
const DEFAULT_VIEW: Record<string, [number, number]> = {
  // The great canyon and the three volcanoes in a row.
  MARS: [-10, -85],
  // The Great Red Spot (in this map file it is 48 degrees to the west of the image centre).
  JUPITER: [-8, -70],
  // The bright heart-shaped plain.
  PLUTO: [25, 160],
  // The large crater with the central peak.
  MIMAS: [5, -135],
  // The four long cracks near the south pole.
  ENCELADUS: [-50, 0],
  EROS: [62, 90],
  ITOKAWA: [22, 90],
  ARROKOTH: [68, 90],
  HALLEY: [20, 90],
  CHURYUMOV_GERASIMENKO: [8, 90],
  MIRANDA: [-55, 0],
  ARIEL: [-55, 0],
  UMBRIEL: [-55, 0],
  TITANIA: [-55, 0],
  OBERON: [-55, 0],
};

/**
 * Default latitude of the point below the Sun for a body with bright rings, degrees.
 * A Sun to the east of the camera at a phase of 90 degrees is in the ring plane: the rings would get no sunlight.
 */
const SUN_LATITUDE: Record<string, number> = { SATURN: 18 };

/** Where the body is in the scene, km. A large offset tests the precision of the shaders. */
const BODY_POSITION = new THREE.Vector3(1.1e8, -0.9e8, 0.4e8);

const DEG = Math.PI / 180;

function num(q: URLSearchParams, key: string, fallback: number): number {
  const text = q.get(key);
  if (text === null || text === '') return fallback;
  const v = Number(text);
  return Number.isFinite(v) ? v : fallback;
}

function direction(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
}

/** Rotation of the body-fixed axes in the world (ICRF) axes. An id that is not in the body table has no rotation. */
function orientation(id: string, et: number): THREE.Quaternion {
  const body = BODIES[id];
  if (!body) return new THREE.Quaternion();
  const a = bodyAxes(body, et);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...a.x), new THREE.Vector3(...a.y), new THREE.Vector3(...a.z));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function sunDistanceKm(id: string, q: URLSearchParams): number {
  const given = num(q, 'sundist', 0);
  if (given > 0) return given * AU_KM;
  const body = BODIES[id];
  const parent = body?.parent && body.parent !== 'SUN' ? body.parent : id;
  return (SUN_DISTANCE_AU[parent] ?? 2) * AU_KM;
}

interface View {
  /** Unit vector from the body to the camera, body axes. */
  cam: THREE.Vector3;
  /** Unit vector from the body to the Sun, body axes. */
  sun: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
}

function makeView(q: URLSearchParams, id: string): View {
  const side = DEFAULT_VIEW[id] ?? [15, 0];
  const lat = num(q, 'lat', side[0]);
  const lon = num(q, 'lon', side[1]);
  const phase = num(q, 'phase', 40) * DEG;
  const cam = direction(lat, lon);
  const east = new THREE.Vector3(-Math.sin(lon * DEG), Math.cos(lon * DEG), 0);
  const north = new THREE.Vector3().crossVectors(cam, east).normalize();
  let sun: THREE.Vector3;
  const sunLat: number | undefined = q.has('sunlat') ? num(q, 'sunlat', 0) : SUN_LATITUDE[id];
  if (sunLat !== undefined) {
    // The point below the Sun has the given latitude. Its longitude gives the phase angle, as well as the latitudes allow.
    const c = (Math.cos(phase) - Math.sin(lat * DEG) * Math.sin(sunLat * DEG)) / (Math.cos(lat * DEG) * Math.cos(sunLat * DEG));
    const dLon = Math.acos(Math.min(1, Math.max(-1, c))) / DEG;
    sun = direction(sunLat, lon + dLon);
  } else {
    sun = cam.clone().multiplyScalar(Math.cos(phase)).addScaledVector(east, Math.sin(phase)).normalize();
  }
  return { cam, sun, east, north };
}

function editManifest(manifest: TextureManifest, q: URLSearchParams): TextureManifest {
  if (q.get('maps') === 'none') return EMPTY_MANIFEST;
  const list = (key: string): string[] => (q.get(key) ?? '').split(',').filter((s) => s !== '');
  const drop = list('drop');
  const fail = list('fail');
  const failUp = list('failup');
  if (drop.length === 0 && fail.length === 0 && failUp.length === 0) return manifest;
  const low = q.get('quality') === 'low';
  const textures = manifest.textures
    .filter((e) => !drop.includes(e.id))
    .map((e) => {
      const gone = `textures/no-such-file-${e.id}.jpg`;
      // The star map stays: a test of the bodies does not need a black sky.
      const hit = (ids: string[]): boolean => ids.includes(e.id) || (ids.includes('all') && e.role !== 'stars');
      if (hit(fail)) return { ...e, file: gone, small: gone, ...(e.large ? { large: gone } : {}) };
      if (hit(failUp)) {
        // The larger file is the standard file for the low quality, and the large file for the high quality.
        if (low) return e.small ? { ...e, file: gone } : e;
        return e.large ? { ...e, large: gone } : e;
      }
      return e;
    });
  return { ...manifest, textures };
}

/** Options of the module that the query can change. */
function moduleOptions(q: URLSearchParams): Pick<BodyOptions, 'mapUpgrade' | 'mapReturnDelay' | 'maxLargeMaps' | 'magFilter'> {
  const back = q.get('return');
  const large = q.get('large');
  return {
    mapUpgrade: q.get('upgrade') !== '0',
    // Without the parameter the module uses its default.
    ...(back !== null ? { mapReturnDelay: back === 'never' ? Infinity : num(q, 'return', 10) } : {}),
    ...(large !== null ? { maxLargeMaps: large === 'all' ? Infinity : num(q, 'large', 2) } : {}),
    magFilter: q.get('mag') === 'bilinear' ? 'bilinear' : 'bicubic',
  };
}

function makeRenderer(q: URLSearchParams): THREE.WebGLRenderer {
  // The settings of the application.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(num(q, 'dpr', 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function backgroundColor(q: URLSearchParams): THREE.Color {
  return new THREE.Color(q.get('bg') === 'grey' ? 0x3b3e44 : 0x000000);
}

function report(body: BodyVisual, quality: string, buildMs: number, loadMs: number): BodyReport {
  const s = body.stats();
  return {
    id: body.id,
    quality,
    variant: body.variant,
    provenance: body.provenance,
    notes: [...body.notes],
    radiusKm: body.radiusKm,
    extentKm: Math.round(body.extentKm * 1000) / 1000,
    triangles: s.triangles,
    trianglesMax: s.trianglesMax,
    mapTextures: s.mapTextures,
    codeTextures: s.codeTextures,
    samplesPerPixel: s.samplesPerPixel,
    mapWidth: s.mapWidth,
    buildMs: Math.round(buildMs * 10) / 10,
    loadMs: Math.round(loadMs),
  };
}

/** Distance in body radii at which a sphere of `fitRadii` body radii fills most of the view. */
function fitDistance(fitRadii: number, fovDeg: number, aspect: number): number {
  const halfV = (fovDeg / 2) * DEG;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return fitRadii / Math.sin(0.86 * Math.min(halfV, halfH));
}

/** Median time of a frame with a read-back of one pixel, so that the GPU work is inside the time. */
function measureFrame(renderer: THREE.WebGLRenderer, draw: () => void): number {
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const times: number[] = [];
  for (let k = 0; k < 9; k++) {
    const t = performance.now();
    draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return Math.round(times[4] * 100) / 100;
}

async function startSingle(q: URLSearchParams, manifest: TextureManifest, baseUrl: string): Promise<void> {
  const id = q.get('body') ?? 'EARTH';
  const quality: BodyQuality = q.get('quality') === 'low' ? 'low' : 'high';
  const variant: BodyVariant = q.get('variant') === 'surface' ? 'surface' : 'default';
  const renderer = makeRenderer(q);
  const scene = new THREE.Scene();
  scene.background = backgroundColor(q);

  let pending = 1;
  let loadMs = 0;
  const t0 = performance.now();
  const body = createBody(id, {
    quality,
    manifest,
    baseUrl,
    variant,
    ...moduleOptions(q),
    onLoad: () => {
      loadMs = performance.now() - t0;
      pending--;
    },
  });
  const buildMs = performance.now() - t0;
  body.object.position.copy(BODY_POSITION);
  body.object.quaternion.copy(orientation(id, num(q, 'et', 0)));
  scene.add(body.object);

  if (q.get('bg') === 'stars') {
    pending++;
    const stars = createStarfield({
      quality,
      manifest,
      baseUrl,
      onLoad: () => {
        pending--;
      },
    });
    scene.add(stars.object);
  }

  const fov = num(q, 'fov', 35);
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.001, 1e11);
  const view = makeView(q, id);
  const toWorld = (v: THREE.Vector3): THREE.Vector3 => v.clone().applyQuaternion(body.object.quaternion);
  const camDir = toWorld(view.cam);
  const sunDir = toWorld(view.sun);
  const east = toWorld(view.east);
  const north = toWorld(view.north);

  const distanceText = q.get('distance');
  const fitRadii = Math.min(body.extentKm / body.radiusKm, 2.5);
  const distance = distanceText && distanceText !== 'fit' ? num(q, 'distance', 4) : fitDistance(fitRadii, fov, aspect);
  camera.up.copy(north);
  camera.position.copy(BODY_POSITION).addScaledVector(camDir, distance * body.radiusKm);
  const aim = num(q, 'aim', 0);
  let controls: OrbitControls | null = null;
  if (aim !== 0) {
    const beta = aim * Math.asin(Math.min(1, 1 / distance));
    const az = num(q, 'aimaz', 90) * DEG;
    const forward = camDir
      .clone()
      .multiplyScalar(-Math.cos(beta))
      .addScaledVector(east, Math.cos(az) * Math.sin(beta))
      .addScaledVector(north, Math.sin(az) * Math.sin(beta));
    camera.lookAt(camera.position.clone().addScaledVector(forward, body.radiusKm));
  } else {
    camera.lookAt(BODY_POSITION);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(BODY_POSITION);
    controls.minDistance = body.radiusKm * 1.005;
    controls.maxDistance = body.radiusKm * 1e4;
    controls.update();
  }

  const casters: ShadowCaster[] = [];
  const casterText = q.get('caster');
  if (casterText) {
    const p = casterText.split(',').map(Number);
    if (p.length === 4 && p.every((v) => Number.isFinite(v))) {
      const pole = toWorld(new THREE.Vector3(0, 0, 1));
      const side = new THREE.Vector3().crossVectors(pole, sunDir).normalize();
      const up = new THREE.Vector3().crossVectors(sunDir, side);
      const pos = sunDir.clone().multiplyScalar(p[2]).addScaledVector(side, p[0]).addScaledVector(up, p[1]).multiplyScalar(body.radiusKm);
      casters.push({ pos, radiusKm: p[3] * body.radiusKm });
    }
  }
  const sunDistance = sunDistanceKm(id, q);
  const nightFill = num(q, 'fill', 0);

  const animate = q.get('anim') === '1';
  const timeStart = num(q, 't', 0);
  const clock = performance.now();
  const camRel = new THREE.Vector3();
  const draw = (): void => {
    const time = animate ? timeStart + (performance.now() - clock) / 1000 : timeStart;
    camRel.subVectors(camera.position, body.object.position);
    body.update({ sunDir, cameraPos: camRel, time, shadowCasters: casters, sunDistanceKm: sunDistance, nightFill });
    renderer.render(scene, camera);
  };

  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const mapFrames: { width: number; ms: number }[] = [];
  let mapWidth = 0;
  let longestFrameMs = 0;
  let framesWithMaps = 0;
  let upgradeFrames = 0;
  let frames = 0;
  const tick = (): void => {
    const start = performance.now();
    draw();
    if (!window.__ready) {
      // The read-back waits for the GPU, so the time of the frame has the work of the GPU in it.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const ms = performance.now() - start;
      const stats = body.stats();
      if (pending === 0) framesWithMaps++;
      if (framesWithMaps > 1) longestFrameMs = Math.max(longestFrameMs, ms);
      if (stats.mapWidth !== mapWidth) {
        // The first frame with a map file of a new width.
        mapWidth = stats.mapWidth;
        mapFrames.push({ width: mapWidth, ms: Math.round(ms * 10) / 10 });
        if (mapFrames.length > 1) upgradeFrames = framesWithMaps - 1;
      }
      // The first maps are ready and no larger file loads. A larger file starts to load in the second frame at the latest.
      frames = pending === 0 && stats.mapsLoading === 0 ? frames + 1 : 0;
      if (frames === 3) {
        const drawCalls = renderer.info.render.calls;
        window.__stats = {
          mode: 'single',
          bodies: [report(body, quality, buildMs, loadMs)],
          drawCalls,
          frameMs: measureFrame(renderer, draw),
          glTextures: renderer.info.memory.textures,
          glPrograms: renderer.info.programs?.length ?? 0,
          width: renderer.domElement.width,
          height: renderer.domElement.height,
          mapFrames,
          longestFrameMs: Math.round(longestFrameMs * 10) / 10,
          upgradeFrames,
        };
        window.__ready = true;
      }
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

interface Cell {
  body: BodyVisual;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sunDir: THREE.Vector3;
  camRel: THREE.Vector3;
  sunDistance: number;
  buildMs: number;
  loadMs: number;
}

async function startSheet(q: URLSearchParams, manifest: TextureManifest, baseUrl: string): Promise<void> {
  const quality: BodyQuality = q.get('quality') === 'low' ? 'low' : 'high';
  const variant: BodyVariant = q.get('variant') === 'surface' ? 'surface' : 'default';
  const renderer = makeRenderer(q);
  renderer.setScissorTest(true);
  // The last cell shows a body that is not in the body table.
  const ids = [...BODY_LIST.map((b) => b.id), 'NOT_IN_THE_TABLE'];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const columns = Math.ceil(Math.sqrt((ids.length * width) / height));
  const rows = Math.ceil(ids.length / columns);
  const cellW = Math.floor(width / columns);
  const cellH = Math.floor(height / rows);
  const fov = 30;
  const background = backgroundColor(q);

  let pending = ids.length;
  const cells: Cell[] = ids.map((id) => {
    const scene = new THREE.Scene();
    scene.background = background;
    const t0 = performance.now();
    const cell = {} as Cell;
    const body = createBody(id, {
      quality,
      manifest,
      baseUrl,
      variant,
      ...moduleOptions(q),
      onLoad: () => {
        cell.loadMs = performance.now() - t0;
        pending--;
      },
    });
    cell.buildMs = performance.now() - t0;
    cell.loadMs = 0;
    body.object.position.copy(BODY_POSITION);
    body.object.quaternion.copy(orientation(id, num(q, 'et', 0)));
    scene.add(body.object);
    const toWorld = (v: THREE.Vector3): THREE.Vector3 => v.clone().applyQuaternion(body.object.quaternion);
    const view = makeView(q, id);
    const camera = new THREE.PerspectiveCamera(fov, cellW / cellH, 0.001, 1e11);
    const fitRadii = Math.min(body.extentKm / body.radiusKm, 2.5);
    camera.up.copy(toWorld(view.north));
    camera.position.copy(BODY_POSITION).addScaledVector(toWorld(view.cam), fitDistance(fitRadii, fov, cellW / cellH) * body.radiusKm);
    camera.lookAt(BODY_POSITION);
    cell.body = body;
    cell.scene = scene;
    cell.camera = camera;
    cell.sunDir = toWorld(view.sun);
    cell.camRel = new THREE.Vector3().subVectors(camera.position, BODY_POSITION);
    cell.sunDistance = sunDistanceKm(id, q);
    return cell;
  });

  if (q.get('labels') !== '0') {
    ids.forEach((id, k) => {
      const label = document.createElement('div');
      label.className = 'cell-label';
      label.textContent = id;
      label.style.left = `${(k % columns) * cellW + 4}px`;
      label.style.top = `${Math.floor(k / columns) * cellH + 3}px`;
      document.body.appendChild(label);
    });
  }

  const time = num(q, 't', 0);
  const nightFill = num(q, 'fill', 0);
  let drawCalls = 0;
  const draw = (): void => {
    drawCalls = 0;
    cells.forEach((cell, k) => {
      const x = (k % columns) * cellW;
      const y = height - (Math.floor(k / columns) + 1) * cellH;
      renderer.setViewport(x, y, cellW, cellH);
      renderer.setScissor(x, y, cellW, cellH);
      cell.body.update({ sunDir: cell.sunDir, cameraPos: cell.camRel, time, sunDistanceKm: cell.sunDistance, nightFill });
      renderer.render(cell.scene, cell.camera);
      drawCalls += renderer.info.render.calls;
    });
  };

  let frames = 0;
  const tick = (): void => {
    draw();
    if (!window.__ready) {
      // The first maps are ready and no body loads a larger file.
      frames = pending === 0 && cells.every((c) => c.body.stats().mapsLoading === 0) ? frames + 1 : 0;
      if (frames === 3) {
        window.__stats = {
          mode: 'sheet',
          bodies: cells.map((c) => report(c.body, quality, c.buildMs, c.loadMs)),
          drawCalls,
          frameMs: measureFrame(renderer, draw),
          glTextures: renderer.info.memory.textures,
          glPrograms: renderer.info.programs?.length ?? 0,
          width: renderer.domElement.width,
          height: renderer.domElement.height,
        };
        window.__ready = true;
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

async function start(): Promise<void> {
  const q = new URLSearchParams(location.search);
  // The public directory of the dev server is at the root of the site.
  const baseUrl = new URL('/', location.href).href;
  const manifest = editManifest(await loadManifest(baseUrl), q);
  if (q.get('sheet') === '1') await startSheet(q, manifest, baseUrl);
  else await startSingle(q, manifest, baseUrl);
}

start().catch((err: unknown) => {
  window.__error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  window.__ready = true;
  console.error(err);
});
