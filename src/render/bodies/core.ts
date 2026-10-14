/**
 * Parts that all body classes share: the uniforms of one frame, the sphere with levels of detail,
 * the list of the maps that load, and the base options of the materials.
 */
import * as THREE from 'three';
import { MAX_CASTERS } from './glsl';
import { acquireSphere, releaseSphere, triangleCount } from './geometry';
import { edgeBasis, imageSize, largerTextureUrl, loadMap, makeBlankTexture, textureUrl, wasPoleRepaired, wasRepaired } from './manifest';
import type { MapOptions } from './manifest';
import { loadMapInParts } from './parts';
import type { PartLoad } from './parts';
import type { BodyQuality, BodyStats, BodyVariant, TextureEntry, TextureManifest } from './types';

/** Radius of the Sun, km (IAU 2015 nominal value, the same number as BODIES.SUN.radius). */
export const SUN_RADIUS_KM = 695700;

/** Radiance of a white diffuse surface that faces the Sun, before tone mapping. The spacecraft lighting gives about the same value. */
export const SUN_GAIN = 1.0;

/** Uniforms that change each frame. All materials of one body share these objects. */
export interface FrameUniforms {
  /** Unit vector to the Sun, body axes. */
  uSunDir: { value: THREE.Vector3 };
  /** Camera position minus body centre, body axes, km. */
  uCamPos: { value: THREE.Vector3 };
  uTime: { value: number };
  uCasters: { value: THREE.Vector4[] };
  uSunAngR: { value: number };
  uSunColor: { value: THREE.Vector3 };
  /** Fill light of the caller for the parts with no sunlight (BodyUpdate.nightFill), 0 to 1. */
  uNightFill: { value: number };
}

export function makeFrameUniforms(): FrameUniforms {
  const casters: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_CASTERS; i++) casters.push(new THREE.Vector4(0, 0, 0, 0));
  return {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uCamPos: { value: new THREE.Vector3(0, 0, 1e6) },
    uTime: { value: 0 },
    uCasters: { value: casters },
    uSunAngR: { value: 0 },
    uSunColor: { value: new THREE.Vector3(SUN_GAIN, SUN_GAIN, SUN_GAIN) },
    uNightFill: { value: 0 },
  };
}

/** One drawable part of a body. */
export interface Part {
  /** Called each frame after the frame uniforms have their new values. camDistance is in km. */
  update?(camDistance: number): void;
  triangles(): number;
  trianglesMax(): number;
  dispose(): void;
}

/** What a body class gives back to createBody. */
export interface Built {
  parts: Part[];
  provenance: 'map' | 'procedural' | 'mixed';
  notes: string[];
  extentKm: number;
  variant: BodyVariant;
  codeTextures: number;
  samplesPerPixel: number;
}

/** What a body class needs to build its parts. */
export interface BuildContext {
  id: string;
  /** The parts add their meshes to this group. Its axes are the body axes. */
  root: THREE.Group;
  /** Equatorial and polar radius, km. */
  radiusKm: number;
  polarRadiusKm: number;
  /** Display colour of the body table (hex). The surface has this colour until its map is ready. */
  color: string;
  quality: BodyQuality;
  variant: BodyVariant;
  maps: MapSet;
  frame: FrameUniforms;
}

/** Linear colour from a hex string of the body table. */
export function colorVector(hex: string, factor = 1): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r * factor, c.g * factor, c.b * factor);
}

/** Linear colour from sRGB components 0 to 255. */
export function srgb(r: number, g: number, b: number): THREE.Vector3 {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
}

/** One map of the surface of a body. It can change to a larger file, and back to its first file. */
interface MapSlot {
  opt: Omit<MapOptions, 'anisotropy'>;
  /**
   * The texture of the first file. It stays until the body is disposed, also while the larger file is in use: the
   * way back then needs no download. null: the first file is not ready, or it did not load.
   */
  first: THREE.Texture | null;
  /** Height of the image of the first file, pixels. 0: the first file is not ready. */
  firstHeight: number;
  /** Address of the larger file. null: the entry has none, or the body keeps its first files, or the larger file did not load. */
  larger: string | null;
  /** The texture of the larger file while the material uses it. null: the material uses the first file. */
  large: THREE.Texture | null;
  /** The load of the larger file, while it runs. */
  load: PartLoad | null;
  /** The texture of this load when the GPU has it. The next `update` takes it into use. */
  arrived: THREE.Texture | null;
  /** True if no view of the frame before needed the larger file (the last `update` of the set found it). */
  far: boolean;
  /**
   * Time for which no view needed the larger file, without a break, seconds.
   * It counts only while the slot has the larger file or loads it.
   */
  idle: number;
  /** Gives the material another texture of the same map. */
  swap: (texture: THREE.Texture) => void;
}

export interface MapSetOptions {
  /** Change to a larger file of a map when the camera is near (BodyOptions.mapUpgrade). */
  upgrade: boolean;
  /** Use the smooth filter for a map that is larger on the screen than in its file (BodyOptions.magFilter). */
  smooth: boolean;
  /** Time with no need of the larger file after which a map goes back to its first file, seconds (BodyOptions.mapReturnDelay). Infinity: never. */
  returnDelay: number;
  /** Largest number of maps of all bodies that use their larger file or load it (BodyOptions.maxLargeMaps). Infinity: no limit. */
  maxLarge: number;
}

/** Default of BodyOptions.mapReturnDelay, seconds. */
export const MAP_RETURN_DELAY_S = 10;
/** Default of BodyOptions.maxLargeMaps. */
export const MAX_LARGE_MAPS = 2;
/**
 * A view has no need of the larger file if it needs less than this share of the pixel rows of the first file.
 * A view needs the larger file if it needs more rows than the first file has. Between the two limits a map keeps
 * the file that it has, so a camera at a limit does not make the map change again and again.
 */
const RETURN_BELOW = 0.7;
/** The time between two calls of `update` counts up to this value, seconds (a page that was hidden, a very long frame). */
const MAX_UPDATE_STEP_S = 1;

const VIEWPORT = new THREE.Vector4();

/**
 * The map sets of all bodies of the module that have a map at its larger file, or a load of one. The cap
 * (BodyOptions.maxLargeMaps) counts their maps. A set leaves the list when it has no such map, and when it is disposed.
 */
const largeSets = new Set<MapSet>();

/**
 * Keeps the list of the maps of one body. It calls `onAllDone` one time when each map is ready or has failed.
 *
 * It also selects the size of the maps. A body starts with the small file (quality 'low') or with the standard file
 * (quality 'high') of each map. When the camera is so near that one pixel of a file is larger than one pixel of the
 * screen, at the point below the camera, the set loads the next larger file and changes to it (see `watch`).
 * When no view needs the larger file for some time, the set changes back to the first file, which it keeps for this
 * (see `update`). A cap for all bodies of the module limits the number of larger files (see `admit`). So the memory
 * of the large maps depends on the bodies that are near the camera now.
 */
export class MapSet {
  private pending = 0;
  private sealed = false;
  private fired = false;
  private disposed = false;
  private readonly cancels: (() => void)[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly slots: MapSlot[] = [];
  private blankTexture: THREE.DataTexture | null = null;
  private watched = false;
  /**
   * Height in pixels of a map that has one pixel for each screen pixel at the point below the camera: the largest
   * value of the views since the last `update`. 0: no renderer drew the body since then.
   */
  private need = 0;
  /** The renderer that drew the body last. A file that loads in parts goes to the GPU of this renderer. */
  private renderer: THREE.WebGLRenderer | null = null;
  /** Time of the last call of `update` (performance.now, ms). 0: no call yet. */
  private updated = 0;
  /** Number of map files that the body asked for. A larger file does not count. */
  requested = 0;
  /** Number of map files that did not load. A larger file does not count: the body keeps its first file. */
  failed = 0;
  /** Number of larger files that load now, or that are ready and not in use yet. */
  loading = 0;
  /** The notes of the body. The set adds 'map-edge-repaired' and 'map-pole-repaired' when the loader has repaired a map in use. */
  notes: string[] | null = null;

  constructor(
    private readonly quality: BodyQuality,
    readonly manifest: TextureManifest,
    private readonly baseUrl: string,
    private readonly onAllDone: () => void,
    private readonly options: MapSetOptions = { upgrade: true, smooth: true, returnDelay: MAP_RETURN_DELAY_S, maxLarge: MAX_LARGE_MAPS },
  ) {}

  /** A white 1 x 1 texture for a sampler whose map is not ready. */
  get blank(): THREE.DataTexture {
    if (!this.blankTexture) this.blankTexture = makeBlankTexture();
    return this.blankTexture;
  }

  get anisotropy(): number {
    return this.quality === 'high' ? 8 : 2;
  }

  /** True if the materials use the smooth filter for a map that is larger on the screen than in its file (GLSL_MAP, MAP_SMOOTH). */
  get smooth(): boolean {
    return this.options.smooth;
  }

  /** Largest number of texture samples of one lookup in a map (GLSL_MAP: five where a map pixel is large on the screen). */
  get taps(): number {
    return this.options.smooth ? 5 : 1;
  }

  /** Width in pixels of the widest map of the surface that is in use, or 0. */
  get mapWidth(): number {
    let width = 0;
    for (const slot of this.slots) {
      const texture = slot.large ?? slot.first;
      if (texture) width = Math.max(width, imageSize(texture).width);
    }
    return width;
  }

  /**
   * Starts the download of the file of an entry. `ready` gets the texture, or null after an error.
   *
   * `swap`: give it for a map of the surface. The set calls it (in `update`, or in the `update` of another body for
   * the cap) when the material must show another file of the map: the larger file when the GPU has all of it, or
   * the first file again. It must give the material the texture, and nothing more. The set disposes the texture of a
   * larger file after the way back, and the texture of the first file when the body is disposed.
   * The areas with no data of the larger file are the areas of the first file (the files show the same picture),
   * so the small map of these areas and its notes stay. A load with no `swap` keeps its first file.
   */
  load(entry: TextureEntry, opt: Omit<MapOptions, 'anisotropy'>, ready: (texture: THREE.Texture | null) => void, swap?: (texture: THREE.Texture) => void): void {
    this.pending++;
    this.requested++;
    const larger = this.options.upgrade ? largerTextureUrl(entry, this.quality, this.baseUrl) : null;
    const slot: MapSlot | null = swap
      ? { opt, first: null, firstHeight: 0, larger, large: null, load: null, arrived: null, far: true, idle: 0, swap }
      : null;
    if (slot) this.slots.push(slot);
    const cancel = loadMap(textureUrl(entry, this.quality, this.baseUrl), { ...opt, anisotropy: this.anisotropy }, (texture) => {
      if (texture) this.textures.push(texture);
      else this.failed++;
      if (slot) {
        slot.first = texture;
        slot.firstHeight = texture ? imageSize(texture).height : 0;
      }
      ready(texture);
      this.setRepairNotes(false);
      this.pending--;
      this.check();
    });
    this.cancels.push(cancel);
  }

  /**
   * Tells the set which mesh shows the maps. Each time a renderer draws the mesh, the set calculates the size of
   * one screen pixel on the ground at the point below the camera, from the camera and the viewport of this
   * renderer. So the caller of the module gives no size of the view, and each camera and each viewport counts.
   * A body that no renderer draws asks for no larger file.
   * The set also keeps the renderer: `update` gives it the parts of a file that loads (parts.ts).
   * `radiusKm`: radius of the sphere that the maps cover (the mean radius for a body with an irregular shape).
   */
  watch(mesh: THREE.Mesh, radiusKm: number): void {
    if (this.watched || !this.options.upgrade || !(radiusKm > 0)) return;
    this.watched = true;
    mesh.onBeforeRender = (renderer, _scene, camera): void => {
      if (this.disposed) return;
      this.renderer = renderer;
      const heightPx = renderer.getCurrentViewport(VIEWPORT).w;
      const p = camera.projectionMatrix.elements;
      if (!(heightPx > 0) || !(p[5] > 0)) return;
      const m = mesh.matrixWorld.elements;
      // Scene units for each km. The matrix of the mesh holds the scale of the mesh itself and the scale of the scene.
      const det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
      const radius = radiusKm * Math.cbrt(Math.abs(det / (mesh.scale.x * mesh.scale.y * mesh.scale.z)));
      if (!(radius > 0)) return;
      // Size of one screen pixel on the ground below the camera, in scene units. The pixel is one in the middle of
      // the view: a pixel at the edge of a wide view is a little smaller.
      let pixel = 2 / (p[5] * heightPx);
      if (p[15] === 0) {
        // A camera with perspective: the size grows with the height of the camera above the ground.
        const c = camera.matrixWorld.elements;
        const distance = Math.hypot(c[12] - m[12], c[13] - m[13], c[14] - m[14]);
        pixel *= Math.max(distance - radius, 1e-4 * radius);
      }
      // A map of this height (pixels from pole to pole) has one pixel for each screen pixel there.
      const need = (Math.PI * radius) / pixel;
      if (need > this.need) this.need = need;
    };
  }

  /**
   * Call each frame, before the renderer draws the body. It selects the file of each map from the views of the
   * frame before:
   * - A view needs more pixel rows than the first file has: the map loads its larger file and changes to it. The
   *   larger file goes to the GPU in parts, one part in each frame, and the first file stays in use until the GPU
   *   has all of the larger file. Then one call changes the texture. The cap of the module can make the body wait
   *   (see `admit`).
   * - No view needs more than RETURN_BELOW times the rows of the first file, for the time `returnDelay` without a
   *   break: the map changes back to its first file at once (see `goBack`). A body that no renderer draws has no
   *   need. After that, the map can change to the larger file again in the same way.
   * A load of the larger file ends with no change if no view needed the larger file for the time `returnDelay`.
   */
  update(): void {
    const need = this.need;
    this.need = 0;
    if (this.disposed) return;
    const now = performance.now();
    const dt = this.updated > 0 ? Math.min(Math.max(now - this.updated, 0) / 1000, MAX_UPDATE_STEP_S) : 0;
    this.updated = now;
    let want = 0;
    for (const slot of this.slots) {
      if (!slot.first) continue;
      // No view of the frame before needed the larger file.
      slot.far = need < RETURN_BELOW * slot.firstHeight;
      const loads = slot.load !== null || slot.arrived !== null;
      slot.idle = slot.far && (slot.large !== null || loads) ? slot.idle + dt : 0;
      const idleLong = slot.far && slot.idle >= this.options.returnDelay;
      if (loads) {
        if (idleLong) this.dropLoad(slot);
        else if (slot.arrived) this.take(slot, slot.arrived);
        else if (this.renderer) slot.load?.step(this.renderer);
      } else if (slot.large) {
        if (idleLong) this.goBack(slot);
      } else if (this.wants(slot, need)) {
        want++;
      }
    }
    // The maps of one body change together: the body asks for all of them in one step.
    if (want > 0 && this.admit(want)) {
      for (const slot of this.slots) if (this.wants(slot, need)) this.startLoad(slot);
    }
    this.register();
  }

  /** True if a view needs more rows than the first file has, and the map has no larger file and no load of it. */
  private wants(slot: MapSlot, need: number): boolean {
    return slot.first !== null && slot.larger !== null && slot.large === null && slot.load === null && slot.arrived === null && need > slot.firstHeight;
  }

  /**
   * The cap of the module (BodyOptions.maxLargeMaps): true if `count` more maps of this body can load their larger
   * files now. The cap counts the maps of all bodies that use a larger file or load one.
   * When the cap is full, another body with maps that have no need now gives them back: their maps change back to
   * the first files at once (or their loads stop). The body whose map has had no need for the longest time goes
   * first. If each map with a larger file has need now, this body keeps its first files and asks again in a later
   * frame: so two bodies that are both near the camera do not take the larger files from each other.
   * A body whose maps alone are more than the cap (the three maps of the Earth at the quality 'low') can load them
   * when no other body uses a larger file.
   */
  private admit(count: number): boolean {
    const own = this.largeCount();
    for (;;) {
      let others = 0;
      let oldest: MapSet | null = null;
      let oldestIdle = -1;
      for (const set of largeSets) {
        if (set === this) continue;
        others += set.largeCount();
        const idle = set.farIdle();
        if (idle > oldestIdle) {
          oldest = set;
          oldestIdle = idle;
        }
      }
      if (others === 0 || others + own + count <= this.options.maxLarge) return true;
      // Each step takes back at least one map, so the loop ends.
      if (!oldest || oldest.release() === 0) return false;
    }
  }

  /** Number of maps of this body that use the larger file or load it (the cap counts them). */
  private largeCount(): number {
    let n = 0;
    for (const slot of this.slots) if (slot.large || slot.load || slot.arrived) n++;
    return n;
  }

  /** The longest time without need of a map of this body that uses the larger file or loads it and has no need now, seconds. -1: no such map. */
  private farIdle(): number {
    let idle = -1;
    for (const slot of this.slots) {
      if (slot.far && (slot.large || slot.load || slot.arrived)) idle = Math.max(idle, slot.idle);
    }
    return idle;
  }

  /** For the cap of the module: each map of this body that has no need now gives back its larger file at once. It gives the number of these maps. */
  private release(): number {
    let n = 0;
    for (const slot of this.slots) {
      if (!slot.far) continue;
      if (slot.load || slot.arrived) {
        this.dropLoad(slot);
        n++;
      } else if (slot.large && slot.first) {
        this.goBack(slot);
        n++;
      }
    }
    this.register();
    return n;
  }

  /** Keeps the list of the module (largeSets) up to date. */
  private register(): void {
    if (!this.disposed && this.largeCount() > 0) largeSets.add(this);
    else largeSets.delete(this);
  }

  /** Starts the load of the larger file of a map. */
  private startLoad(slot: MapSlot): void {
    const first = slot.first;
    const url = slot.larger;
    if (!first || url === null) return;
    this.loading++;
    // The larger file gets at least the edge repair of the first file.
    slot.load = loadMapInParts(url, { ...slot.opt, anisotropy: this.anisotropy }, edgeBasis(first), (texture) => {
      slot.load = null;
      if (texture) {
        slot.arrived = texture;
        return;
      }
      // A larger file that did not load: the body keeps its first file and does not ask for the larger file again.
      this.loading--;
      slot.larger = null;
      this.register();
    });
  }

  /** Ends the load of the larger file with no change of the map, and releases what the load holds. */
  private dropLoad(slot: MapSlot): void {
    slot.load?.cancel();
    slot.load = null;
    slot.arrived?.dispose();
    slot.arrived = null;
    slot.idle = 0;
    this.loading--;
  }

  /**
   * The material gets the texture of the larger file. The GPU has all of it, so the frame that first shows it has
   * no more work than the frame before. Each frame shows a complete map: the first file or the larger file.
   * The texture of the first file stays for the way back.
   */
  private take(slot: MapSlot, texture: THREE.Texture): void {
    slot.arrived = null;
    this.loading--;
    const first = slot.first;
    if (!first || imageSize(texture).height <= imageSize(first).height) {
      // A "larger" file that is not larger: the body keeps its first file and does not ask again.
      texture.dispose();
      slot.larger = null;
      return;
    }
    slot.large = texture;
    slot.swap(texture);
    this.setRepairNotes(true);
  }

  /**
   * The way back: the material gets the texture of the first file again, from one frame to the next. The GPU still
   * has this texture, so the change needs no download and no transfer. (After a loss of the WebGL context the
   * renderer sends the first file again in the frame that shows it, from its image.) The texture of the larger file
   * and its pixels are released.
   */
  private goBack(slot: MapSlot): void {
    const large = slot.large;
    if (!large || !slot.first) return;
    slot.large = null;
    slot.idle = 0;
    slot.swap(slot.first);
    large.dispose();
    this.setRepairNotes(true);
  }

  /**
   * The two notes of the loader repairs follow the textures in use. `remove`: also take a note away when no
   * texture in use has the repair (after a change to another file of a map).
   */
  private setRepairNotes(remove: boolean): void {
    const notes = this.notes;
    if (!notes) return;
    const set = (note: string, on: boolean): void => {
      const k = notes.indexOf(note);
      if (on && k < 0) notes.push(note);
      else if (!on && k >= 0 && remove) notes.splice(k, 1);
    };
    // The first files, and the larger file in place of the first file of a map that uses it.
    const inUse = this.textures.map((t) => this.slots.find((slot) => slot.first === t)?.large ?? t);
    set('map-edge-repaired', inUse.some(wasRepaired));
    set('map-pole-repaired', inUse.some(wasPoleRepaired));
  }

  /** Call after the last `load`. A body with no map fires the callback in a microtask. */
  seal(): void {
    this.sealed = true;
    if (this.pending === 0) queueMicrotask(() => this.check());
  }

  private check(): void {
    if (this.sealed && this.pending === 0 && !this.fired) {
      this.fired = true;
      this.onAllDone();
    }
  }

  dispose(): void {
    this.fired = true;
    this.disposed = true;
    largeSets.delete(this);
    for (const c of this.cancels) c();
    this.cancels.length = 0;
    // The textures of the first files.
    for (const t of this.textures) t.dispose();
    this.blankTexture?.dispose();
    this.textures.length = 0;
    for (const slot of this.slots) {
      // A load in each state: it runs, or the GPU has its texture and the map does not use it yet.
      slot.load?.cancel();
      slot.load = null;
      slot.arrived?.dispose();
      slot.arrived = null;
      slot.large?.dispose();
      slot.large = null;
      slot.first = null;
      slot.larger = null;
    }
    this.loading = 0;
    this.renderer = null;
  }
}

/** Options that all shader materials of the module use. */
export function shaderBase(name: string): THREE.ShaderMaterialParameters {
  return { name, toneMapped: true, dithering: true };
}

interface Level {
  /** The level is used when (camera distance / radius) is larger than this number. */
  beyond: number;
  columns: number;
  rows: number;
}

const LEVELS: Record<BodyQuality, Level[]> = {
  // The numbers keep the error of the outline below about one pixel on a screen of 1000 pixels.
  high: [
    { beyond: 1.6, columns: 128, rows: 64 },
    { beyond: 0, columns: 256, rows: 128 },
  ],
  low: [
    { beyond: 4, columns: 48, rows: 24 },
    { beyond: 1.4, columns: 96, rows: 48 },
    { beyond: 0, columns: 192, rows: 96 },
  ],
};

/**
 * An ellipsoid mesh that takes a finer sphere when the camera comes near.
 * The far level is the sphere of the quality (128 x 64 or 48 x 24).
 */
export class Globe implements Part {
  readonly mesh: THREE.Mesh;
  private readonly geometries: THREE.BufferGeometry[];
  private readonly levels: Level[];
  private current = 0;
  private readonly radius: number;

  constructor(name: string, material: THREE.Material, radii: THREE.Vector3, quality: BodyQuality, fixed?: { columns: number; rows: number }) {
    this.levels = fixed ? [{ beyond: 0, ...fixed }] : LEVELS[quality];
    this.geometries = this.levels.map((l) => acquireSphere(l.columns, l.rows));
    this.mesh = new THREE.Mesh(this.geometries[0], material);
    this.mesh.name = name;
    this.mesh.scale.copy(radii);
    this.radius = Math.max(radii.x, radii.y, radii.z);
  }

  update(camDistance: number): void {
    const d = camDistance / this.radius;
    let k = this.levels.length - 1;
    for (let i = 0; i < this.levels.length; i++) {
      // A level stays a little longer than its limit, so the mesh does not flicker at the limit.
      const limit = this.levels[i].beyond * (i >= this.current ? 1 : 1.06);
      if (d > limit) {
        k = i;
        break;
      }
    }
    if (k !== this.current) {
      this.current = k;
      this.mesh.geometry = this.geometries[k];
    }
  }

  triangles(): number {
    return triangleCount(this.geometries[this.current]);
  }

  trianglesMax(): number {
    return triangleCount(this.geometries[this.geometries.length - 1]);
  }

  dispose(): void {
    for (const g of this.geometries) releaseSphere(g);
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** A part with one fixed mesh that owns its geometry and its material. */
export class MeshPart implements Part {
  constructor(
    readonly mesh: THREE.Mesh,
    private readonly ownsGeometry = true,
  ) {}

  triangles(): number {
    return triangleCount(this.mesh.geometry);
  }

  trianglesMax(): number {
    return this.triangles();
  }

  dispose(): void {
    if (this.ownsGeometry) this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export function sumStats(parts: Part[], maps: MapSet, built: Built): BodyStats {
  let triangles = 0;
  let trianglesMax = 0;
  for (const p of parts) {
    triangles += p.triangles();
    trianglesMax += p.trianglesMax();
  }
  return {
    triangles,
    trianglesMax,
    mapTextures: maps.requested - maps.failed,
    codeTextures: built.codeTextures,
    samplesPerPixel: built.samplesPerPixel,
    mapWidth: maps.mapWidth,
    mapsLoading: maps.loading,
  };
}
