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
  /** Path of the standard file (2048 pixels wide for a map of a body), relative to the public directory. */
  file: string;
  /** Path of the small file (half the width of the standard file), relative to the public directory. */
  small?: string;
  /**
   * Path of the large file (about 4096 pixels wide), relative to the public directory.
   * Only a map with a large original has it. A body takes it into use when the camera is near (see BodyStats.mapWidth).
   */
  large?: string;
  /** Size of the standard file, pixels. */
  width?: number;
  height?: number;
  /** Size of the large file, pixels. */
  largeWidth?: number;
  largeHeight?: number;
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
  /**
   * Largest number of texture samples for one pixel of the surface.
   * A lookup in a map is one sample where one pixel of the map file covers two screen pixels or less.
   * It is five samples where a pixel of the map file is larger on the screen (see BodyOptions.magFilter).
   */
  samplesPerPixel: number;
  /**
   * Width in pixels of the widest map file that the surface of the body shows now.
   * 0: no map is ready, or the body has no map. A ring strip does not count.
   * The value grows when the body takes a larger file into use, and it goes back when the body goes back to
   * its first file (see BodyOptions.mapUpgrade).
   */
  mapWidth: number;
  /** Number of larger map files that the body loads now. They are not in use yet. */
  mapsLoading: number;
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
   * After that, only 'map-edge-repaired' and 'map-pole-repaired' can change: they tell what the loader did to the
   * map files in use, and the body can change to another file of a map later (see BodyOptions.mapUpgrade).
   */
  notes: string[];
  /**
   * The variant that the body shows. It is 'default' if the map of the variant 'surface' does not exist.
   * It changes from 'surface' to 'default' if this map does not load (before `onLoad` fires).
   */
  readonly variant: BodyVariant;
  /**
   * Call each frame, after the caller has set position and quaternion, and before the caller renders the scene.
   * The module reads the camera and the size of the view when the renderer draws the body. `update` then uses
   * these values of the frame before to select the size of the maps (see BodyOptions.mapUpgrade).
   * `update` also gives the renderer that drew the body last the next part of a map file that loads. So call it
   * each frame, also for a body that is not in the view: a body that gets no call keeps the files that it has
   * (only the cap `maxLargeMaps` can then take back a larger file, for another body).
   */
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
  /**
   * Change to a larger file of a map when the camera is near. Default: true.
   *
   * A body starts with the small file (quality 'low') or with the standard file (quality 'high') of each map.
   * When the renderer draws the body, the module calculates the size of one screen pixel on the ground at the point
   * below the camera, from the camera and the size of the view of this renderer. If one pixel of the map file in use
   * is larger than this size, the body loads the next file: the standard file for the quality 'low', the large file
   * (field `large` of the manifest) for the quality 'high'. The quality 'low' never loads the large file.
   * The body shows the first file while the larger file loads. The module downloads the larger file with fetch (as
   * the manifest), the browser decodes it in the background, and the graphics card gets its pixels in parts: one
   * part in each frame (each call of `update`), so no frame is long.
   * When the graphics card has all of the larger file, the body changes to it from one frame to the next. The body
   * keeps the texture of the first file for the way back.
   * The larger file gets at least the repair of the edge lines that the first file has (the notes
   * 'map-edge-repaired' and 'map-pole-repaired'). The areas with no data stay the areas that the module found in
   * the first file.
   *
   * The way back: a map goes back to its first file when no view needs the larger file for the time
   * `mapReturnDelay` without a break. "No need" means: a file with 0.7 times the pixel rows of the first file is
   * enough for each view, or no renderer draws the body. The change is from one frame to the next, with no download
   * and no transfer: the graphics card still has the first file. The body then releases the texture and the pixels
   * of the larger file. After the way back, the body can change to the larger file again in the same way (it
   * downloads the larger file again, as a rule from the cache of the browser).
   * The cap `maxLargeMaps` limits the number of larger files of all bodies together. So the memory of the larger
   * files depends on the bodies that are near the camera now, and it has a limit.
   *
   * Memory of a larger file in use: its pixels stay in the memory of the page (4 bytes for each pixel: 33.6 MB for a
   * file of 4096 x 2048 pixels, 8.4 MB for 2048 x 1024), because the renderer needs them after a loss of the WebGL
   * context. The graphics card has it with its smaller copies for the filter (44.7 MB and 11.2 MB). The first file
   * stays as it was before the change. While a larger file loads, the decoded file takes its size once more.
   * A larger file that does not load changes nothing: the body keeps its first file and does not ask for the larger
   * file again.
   * `onLoad` does not wait for the larger files, and it does not fire again.
   * false: the body keeps the files that it starts with.
   */
  mapUpgrade?: boolean;
  /**
   * Time in seconds with no need of the larger file after which a map goes back to its first file (see
   * `mapUpgrade`). Default: 10. Infinity: a map that has changed to its larger file keeps it while the body lives,
   * unless the cap `maxLargeMaps` takes it back for another body.
   * The time counts in the calls of `update`. A time between two calls that is longer than 1 second counts as 1 second.
   */
  mapReturnDelay?: number;
  /**
   * Largest number of maps that use their larger file at one time, for all bodies of the module together (see
   * `mapUpgrade`). A map that loads its larger file counts. Default: 2. Infinity: no limit.
   * A value below 1, or a value that is not a number, gives the default. To keep all first files, use
   * `mapUpgrade: false`.
   * When a body needs a larger file and the limit is full, a body whose larger files have no need now (the time of
   * `mapReturnDelay` runs, or no renderer draws it) goes back to its first files at once: the body whose need
   * stopped first goes first. If each map with a larger file has need now, the new body keeps its first files and
   * asks again in a later frame. So two bodies that are both near the camera do not take the larger files from each
   * other.
   * The maps of one body change together. A body with more maps than the limit (the Earth at the quality 'low' has
   * three) can use all of them when no other body uses a larger file.
   * With the default, the larger files take at most about 157 MB more than the first files at the quality 'high'
   * (two files of 4096 x 2048 pixels: 33.6 MB in the page and 44.7 MB on the graphics card each), and at most about
   * 59 MB at the quality 'low' (the three maps of the Earth: 8.4 MB and 11.2 MB each), plus the decoded file of each
   * load that runs.
   * Each body uses its own value when it asks for a larger file, so give all bodies the same value.
   */
  maxLargeMaps?: number;
  /**
   * Filter for a map that is larger on the screen than in its file (the camera is very near). Default: 'bicubic'.
   * 'bilinear': the plain filter of the GPU. Each pixel of the map shows as a diamond, and a thin line of the map
   * shows as steps.
   * 'bicubic': a smooth curve through the pixels of the map (the cubic curve of Catmull and Rom), as sharp as
   * the plain filter. It comes in by degrees where one pixel of the map file covers more than two screen pixels,
   * and it is complete where a pixel covers six screen pixels or more. There it needs five texture samples where
   * the plain filter needs one. It changes no pixel where a pixel of the map file covers two screen pixels or less.
   */
  magFilter?: 'bicubic' | 'bilinear';
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
