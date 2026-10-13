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
  /** 'planetocentric' or 'planetographic': the latitude of the rows of the map. */
  latitudeType?: string;
  /** 'natural', 'near natural', 'enhanced' or 'grey'. */
  colour?: string;
  /** Share of the surface (percent) that the build of the map has filled with a mean colour, because the source has no image data there. */
  filledSharePercent?: number;
  /** Ring strip: distance of the left edge and of the right edge from the centre of the planet, km. */
  innerRadiusKm?: number;
  outerRadiusKm?: number;
  note?: string;
  [key: string]: unknown;
}

export interface TextureManifest {
  textures: TextureEntry[];
  [key: string]: unknown;
}

/**
 * A body that hides a part of the Sun for another body.
 * The two values are lengths in the unit of the scene: km, or km times the scale if the lit body has a scale
 * (see `BodyVisual.object`).
 */
export interface ShadowCaster {
  /** Centre of the caster minus the centre of the lit body, world axes of the scene. */
  pos: THREE.Vector3;
  /** Radius of the caster. */
  radiusKm: number;
}

export interface BodyUpdate {
  /** Unit vector from the body centre to the Sun, world axes of the scene. */
  sunDir: THREE.Vector3;
  /**
   * Camera position minus body centre, world axes of the scene.
   * A length in the unit of the scene: km, or km times the scale if the body has a scale (see `BodyVisual.object`).
   */
  cameraPos: THREE.Vector3;
  /**
   * Display time in seconds for the animated parts (cloud drift, Sun surface).
   * Give the time of the display clock, not the time of the simulation: the motion is slow and it is only for the look.
   * The value can be large (the seconds of the wall clock, for example): the module wraps it before the shaders get it.
   */
  time: number;
  /** Bodies that can hide the Sun (a moon for its planet, a planet for its moon). Four at most are used. */
  shadowCasters?: ShadowCaster[];
  /**
   * Distance from the body to the Sun, km (always km, also for a body with a scale).
   * It sets the width of the soft edge of the shadows. Without it the shadows have a fixed soft edge.
   */
  sunDistanceKm?: number;
  /**
   * Fill light for the parts of the body that have no sunlight: the night side, and a part in the shadow of
   * another body or of the rings. Without it, these parts are almost black and the disc does not show against a black sky.
   * The value is a part of the brightness in full sunlight. With 0.02, a dark part shows the colour of its map
   * (or of its calculated surface) at 2 percent of the brightness that it has when it faces the Sun.
   * A part in full sunlight does not change. A part with some sunlight gets a smaller part of the fill light.
   * The value is in linear light, before the tone mapping. On the screen, a small value looks darker than its number.
   * With ACES tone mapping and exposure 1, the middle of the dark side has a screen level of about 2 to 17 of 255
   * with 0.02, and of about 15 to 70 of 255 with 0.1 (Mercury and Mars are at the low end, Saturn and Uranus at the
   * high end). A body with a dark surface (Callisto, Umbriel, a comet nucleus) stays almost black with these values.
   * The fill light makes no glint. The lights of the cities of the Earth stay on top of it.
   * The dark face of the rings and the ring part in the shadow of the planet get it also. The Sun ignores it.
   * It is not physical light. Default: 0 (no fill light, the picture is the same as without the field).
   * A value below 0 counts as 0. A value above 1 counts as 1.
   */
  nightFill?: number;
}

export interface BodyStats {
  /** Triangles that the body draws now (the sphere has more triangles when the camera is near). */
  triangles: number;
  /** Largest number of triangles that the body can draw. */
  trianglesMax: number;
  /** Texture files of the manifest that the body uses. */
  mapTextures: number;
  /**
   * Textures that the code makes (ring profile, zonal colour profile, the small map of the areas with no data).
   * A ring strip that the code builds from a file of the manifest counts as a map texture: it takes the place of the file.
   * The body has mapTextures + codeTextures textures on the graphics card, and one white pixel that stands in
   * for a map that is not ready.
   */
  codeTextures: number;
  /** Largest number of texture samples for one pixel of the surface. */
  samplesPerPixel: number;
}

export interface BodyVisual {
  id: string;
  /**
   * Root object. Local axes = body-fixed axes: +Z north pole, +X prime meridian on the equator.
   * Unit: km (true size, true flattening). The caller sets position and quaternion.
   * A uniform scale is allowed, on the root or on a parent of the root (a scene that does not use km).
   * Then `cameraPos` and the two values of each shadow caster in `update` are lengths in the unit of the scene.
   * `radiusKm`, `extentKm` and `sunDistanceKm` stay in km.
   */
  object: THREE.Object3D;
  /** Equatorial radius of the solid body (or of the 1 bar level of a giant planet), km. */
  radiusKm: number;
  /**
   * Outer radius for culling and camera limits (rings, atmosphere, glow, longest axis of an irregular body), km.
   * The value can change until `onLoad` fires, in one case only: Venus or Titan in the variant 'surface' whose map
   * does not load gets its default look, and this look has a higher top of the atmosphere.
   */
  readonly extentKm: number;
  /**
   * 'map': real map from the manifest.
   * 'procedural': made by code (the user interface then says "not a photograph").
   * 'mixed': real map plus procedural parts. `notes` says which parts.
   * The value can change until `onLoad` fires: a body whose map file does not load becomes 'procedural'.
   */
  readonly provenance: 'map' | 'procedural' | 'mixed';
  /**
   * Short machine-readable notes for the user interface. The list of all notes is in `NOTE_CODES`.
   * The module can add notes until `onLoad` fires (for example 'no-data-south' after it has read the map).
   */
  notes: string[];
  /**
   * The variant that the body shows. It is 'default' if the map of the variant 'surface' does not exist.
   * It changes from 'surface' to 'default' if this map does not load (before `onLoad` fires).
   */
  readonly variant: BodyVariant;
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
