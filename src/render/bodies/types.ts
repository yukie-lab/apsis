/**
 * Public types of the body rendering module.
 */
import type * as THREE from 'three';

/** 'low' is for a phone: small textures, fewer triangles, cheaper shaders. */
export type BodyQuality = 'high' | 'low';

/**
 * 'default' is the look in visible light.
 * 'surface' shows the solid surface below a thick atmosphere (Venus: radar map, Titan: near-infrared map).
 * A body that has no such map ignores 'surface'.
 */
export type BodyVariant = 'default' | 'surface';

/** One entry of public/textures/manifest.json. Only the fields that this module reads have a type. */
export interface TextureEntry {
  id: string;
  /** Engine id of the body in upper case, or 'STARS'. */
  body: string;
  /** 'color', 'surface', 'night', 'clouds', 'ring', 'stars' and others. */
  role: string;
  /** Path of the large file, relative to the public directory. */
  file: string;
  /** Path of the small file, relative to the public directory. */
  small?: string;
  width?: number;
  height?: number;
  /** East longitude at the image centre, degrees. null: not known. */
  centerLongitudeDeg?: number | null;
  /** 'global' or 'partial'. */
  coverage?: string;
  note?: string;
  [key: string]: unknown;
}

export interface TextureManifest {
  textures: TextureEntry[];
  [key: string]: unknown;
}

/** A body that hides a part of the Sun for another body. */
export interface ShadowCaster {
  /** Centre of the caster minus the centre of the lit body, km, world axes of the scene. */
  pos: THREE.Vector3;
  radiusKm: number;
}

export interface BodyUpdate {
  /** Unit vector from the body centre to the Sun, world axes of the scene. */
  sunDir: THREE.Vector3;
  /** Camera position minus body centre, km, world axes of the scene. */
  cameraPos: THREE.Vector3;
  /**
   * Display time in seconds for the animated parts (cloud drift, Sun surface).
   * Give the time of the display clock, not the time of the simulation: the motion is slow and it is only for the look.
   */
  time: number;
  /** Bodies that can hide the Sun (a moon for its planet, a planet for its moon). Four at most are used. */
  shadowCasters?: ShadowCaster[];
  /**
   * Distance from the body to the Sun, km. It sets the width of the soft edge of the shadows.
   * Without it the shadows have a fixed soft edge.
   */
  sunDistanceKm?: number;
}

export interface BodyStats {
  /** Triangles that the body draws now (the sphere has more triangles when the camera is near). */
  triangles: number;
  /** Largest number of triangles that the body can draw. */
  trianglesMax: number;
  /** Texture files of the manifest that the body uses. */
  mapTextures: number;
  /** Textures that the code makes (ring profile, zonal colour profile). */
  codeTextures: number;
  /** Largest number of texture samples for one pixel of the surface. */
  samplesPerPixel: number;
}

export interface BodyVisual {
  id: string;
  /**
   * Root object. Local axes = body-fixed axes: +Z north pole, +X prime meridian on the equator.
   * Unit: km (true size, true flattening). The caller sets position and quaternion.
   * A uniform scale of the root is allowed.
   */
  object: THREE.Object3D;
  /** Equatorial radius of the solid body (or of the 1 bar level of a giant planet), km. */
  radiusKm: number;
  /** Outer radius for culling and camera limits (rings, atmosphere, glow, longest axis of an irregular body), km. */
  extentKm: number;
  /**
   * 'map': real map from the manifest.
   * 'procedural': made by code (the user interface then says "not a photograph").
   * 'mixed': real map plus procedural parts. `notes` says which parts.
   */
  provenance: 'map' | 'procedural' | 'mixed';
  /**
   * Short machine-readable notes for the user interface. The list of all notes is in `NOTE_CODES`.
   * The module can add notes until `onLoad` fires (for example 'no-data-south' after it has read the map).
   */
  notes: string[];
  /** The variant that the body shows. It is 'default' if the map of the variant 'surface' does not exist. */
  variant: BodyVariant;
  /** Call each frame, after the caller has set position and quaternion. */
  update(p: BodyUpdate): void;
  /** Numbers for a performance report. */
  stats(): BodyStats;
  dispose(): void;
}

export interface BodyOptions {
  quality: BodyQuality;
  manifest: TextureManifest;
  /** Address of the public directory, for example import.meta.env.BASE_URL. */
  baseUrl: string;
  /** Fires one time: when all maps of the body are ready, or at once (in a microtask) for a body with no map. */
  onLoad?: () => void;
  variant?: BodyVariant;
}

export interface StarfieldOptions {
  quality: BodyQuality;
  manifest: TextureManifest;
  baseUrl: string;
  onLoad?: () => void;
}

export interface Starfield {
  /**
   * A very large sphere. Its local axes are the ICRF axes. The shader ignores the position of the object and the
   * depth range of the camera: the stars are always at infinity and behind all other objects.
   */
  object: THREE.Object3D;
  /** 'map': real star map. 'none': the manifest has no star map, so the sphere is black (the code does not invent stars). */
  provenance: 'map' | 'none';
  /** Brightness factor. 1 is the default look. */
  setBrightness(value: number): void;
  dispose(): void;
}
