/**
 * Parts that all body classes share: the uniforms of one frame, the sphere with levels of detail,
 * the list of the maps that load, and the base options of the materials.
 */
import * as THREE from 'three';
import { MAX_CASTERS } from './glsl';
import { acquireSphere, releaseSphere, triangleCount } from './geometry';
import { loadMap, makeBlankTexture, textureUrl, wasPoleRepaired, wasRepaired } from './manifest';
import type { MapOptions } from './manifest';
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

/**
 * Keeps the list of the maps of one body. It calls `onAllDone` one time when each map is ready or has failed.
 */
export class MapSet {
  private pending = 0;
  private sealed = false;
  private fired = false;
  private readonly cancels: (() => void)[] = [];
  private readonly textures: THREE.Texture[] = [];
  private blankTexture: THREE.DataTexture | null = null;
  /** Number of map files that the body asked for. */
  requested = 0;
  /** Number of map files that did not load. */
  failed = 0;
  /** The notes of the body. The set adds 'map-edge-repaired' and 'map-pole-repaired' when the loader has repaired a map. */
  notes: string[] | null = null;

  constructor(
    private readonly quality: BodyQuality,
    readonly manifest: TextureManifest,
    private readonly baseUrl: string,
    private readonly onAllDone: () => void,
  ) {}

  /** A white 1 x 1 texture for a sampler whose map is not ready. */
  get blank(): THREE.DataTexture {
    if (!this.blankTexture) this.blankTexture = makeBlankTexture();
    return this.blankTexture;
  }

  get anisotropy(): number {
    return this.quality === 'high' ? 8 : 2;
  }

  /** Starts the download of the file of an entry. `ready` gets the texture, or null after an error. */
  load(entry: TextureEntry, opt: Omit<MapOptions, 'anisotropy'>, ready: (texture: THREE.Texture | null) => void): void {
    this.pending++;
    this.requested++;
    const cancel = loadMap(textureUrl(entry, this.quality, this.baseUrl), { ...opt, anisotropy: this.anisotropy }, (texture) => {
      if (texture) this.textures.push(texture);
      else this.failed++;
      ready(texture);
      if (texture && wasRepaired(texture) && this.notes && !this.notes.includes('map-edge-repaired')) this.notes.push('map-edge-repaired');
      if (texture && wasPoleRepaired(texture) && this.notes && !this.notes.includes('map-pole-repaired')) this.notes.push('map-pole-repaired');
      this.pending--;
      this.check();
    });
    this.cancels.push(cancel);
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
    for (const c of this.cancels) c();
    for (const t of this.textures) t.dispose();
    this.blankTexture?.dispose();
    this.textures.length = 0;
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
  return { triangles, trianglesMax, mapTextures: maps.requested - maps.failed, codeTextures: built.codeTextures, samplesPerPixel: built.samplesPerPixel };
}
