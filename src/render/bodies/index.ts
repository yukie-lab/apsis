/**
 * Body rendering: the 3D look of the Sun, the planets, the moons, the rings, the small bodies and the stars.
 *
 * Use:
 *   const manifest = await loadManifest(import.meta.env.BASE_URL);
 *   const earth = createBody('EARTH', { quality: 'high', manifest, baseUrl: import.meta.env.BASE_URL });
 *   scene.add(earth.object);
 *   // each frame, after the caller has set earth.object.position and earth.object.quaternion:
 *   earth.update({ sunDir, cameraPos, time });
 *   renderer.render(scene, camera);
 *
 * A map has two or three files of different sizes. A body starts with a small one and loads a larger one when the
 * camera is near. It goes back to the first one when the camera is far again for some time, or when another body
 * needs a larger file and the cap of all bodies is full (BodyOptions.mapUpgrade, BodyOptions.maxLargeMaps).
 * The module reads the camera and the size of the view from the renderer when the renderer draws the body, so the
 * caller gives no size of the view.
 *
 * The module uses no three.js light and no shadow map. Each material computes its light from the Sun direction.
 * The real maps come from public/textures (see docs/ASSETS.md). All other surfaces are made by code,
 * and `provenance` and `notes` say so.
 */
import * as THREE from 'three';
import { BODIES } from '../../engine/bodies';
import type { Body } from '../../engine/bodies';
import { ATMOSPHERE_MARS, ATMOSPHERE_PLUTO, ATMOSPHERE_TITAN, ATMOSPHERE_TITAN_THIN, ATMOSPHERE_VENUS } from './atmosphere';
import { MAP_RETURN_DELAY_S, MAX_LARGE_MAPS, MapSet, SUN_RADIUS_KM, makeFrameUniforms, sumStats } from './core';
import type { BuildContext, Built } from './core';
import { DECK_TITAN, DECK_VENUS, buildDeck } from './deck';
import { buildEarth } from './earth';
import { buildGiant } from './giant';
import { MAX_CASTERS } from './glsl';
import { findTexture, latitudeKind, notesFromEntry } from './manifest';
import { SHAPES, genericShape } from './shapes';
import { ROCK_LOOKS, ROCK_LOOK_COMET, ROCK_LOOK_GENERIC, ROCK_LOOK_GLOBE, buildRockyGlobe, buildShaped, useRockSurface } from './small';
import { buildSun } from './sun';
import { buildMapped } from './surface';
import type { MappedLook } from './surface';
import type { BodyOptions, BodyStats, BodyUpdate, BodyVariant, BodyVisual, TextureEntry } from './types';

export type {
  BodyOptions,
  BodyQuality,
  BodyStats,
  BodyUpdate,
  BodyVariant,
  BodyVisual,
  ShadowCaster,
  Starfield,
  StarfieldOptions,
  TextureEntry,
  TextureManifest,
} from './types';
export { EMPTY_MANIFEST, loadManifest } from './manifest';
export { createStarfield } from './stars';

/**
 * All notes that a body can have. The user interface turns them into text.
 */
export const NOTE_CODES = [
  // Parts that the code makes.
  'surface-procedural', // the surface is made by code (Sun, asteroids, a body with no map)
  'glow-procedural', // the glow around the Sun is made by code
  'clouds-procedural', // the cloud deck is made by code (Venus)
  'haze-procedural', // the haze is made by code (Titan, Pluto)
  'atmosphere-procedural', // the air is made by code (Earth, Mars)
  'bands-procedural', // the cloud bands are made by code (a giant planet with no map)
  'rings-procedural', // the ring profile is made by code from published ring limits
  'shape-approximate', // the shape is an approximation of the shape class, not a measured model
  'ring-width-exaggerated', // narrow rings are drawn wider than they are
  'ring-brightness-exaggerated', // dark rings are drawn brighter than they are, so that they show
  'nucleus-only', // a comet shows its nucleus only, with no coma and no tail
  'surface-unknown', // no spacecraft has seen this surface
  'body-unknown', // the id is not in the body table
  // Real maps.
  'rings-map', // the colour and the brightness of the rings come from a file of the manifest (a photograph)
  'ring-opacity-modelled', // the file of the rings has no opacity: the code derives it from the brightness and from published limits
  'rings-partly-procedural', // ring parts outside of the file are made by code (the F ring of Saturn)
  'no-data', // a large part of the map has no data (flat dark grey)
  'no-data-small', // a small part of the map has no data
  'no-data-north', // the area with no data is mostly in the north
  'no-data-south', // the area with no data is mostly in the south
  'map-edge-repaired', // the file had one or two dark pixel columns at its left or right edge (a line along a meridian): the loader replaced them by the column beside them
  'map-pole-repaired', // the file had one or two dark pixel rows at its top or bottom edge (a dot at a pole): the loader replaced them by the row beside them
  'colour-enhanced', // the colours of the map are stronger than the eye sees
  'colour-near-natural', // the map comes from filters for visible light, but it is not an exact copy of what the eye sees
  'map-gaps-filled', // the build of the map has filled areas with no image data with a mean colour (not an observation)
  'colour-muted', // the module shows an enhanced colour map with less colour, nearer to what the eye sees
  'colour-synthetic', // the colours of the map are not measured colours
  'monochrome', // the map is grey
  'near-infrared', // the map shows near-infrared light
  'radar', // the map is a radar image
  // Things that are missing.
  'surface-plain', // the Earth shows no day map: plain colour
  'no-night-lights', // the Earth shows no night map
  'no-clouds', // the Earth shows no cloud map
  'variant-unavailable', // the body shows its default look: the map for the variant 'surface' is not in the manifest, or it did not load
  'ring-map-without-radii', // the ring file of the manifest has no radii, so the code made the ring profile
  'ring-map-unused', // the module has no opacity model for a ring file of this planet, so the code made the ring profile
  'map-load-failed', // a file did not load: the body shows a surface of the code (the Earth: a plain colour)
  'night-map-load-failed',
  'cloud-map-load-failed',
  'ring-map-load-failed',
] as const;

/** Ids of the giant planets. */
const GIANTS = new Set(['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE']);

/**
 * A body of the table with no map and no shape is drawn round if its radius is at least this number (km).
 * Approximate limit: icy and rocky bodies above some hundred km are close to a sphere.
 */
const ROUND_BODY_MIN_RADIUS_KM = 200;

const DEFAULT_LOOK: MappedLook = { seeliger: 0.5, gain: 1, saturation: 1, latitude: 'centric' };

/**
 * Colour saturation for a map that the manifest calls "enhanced colour". Such a map shows strong green, yellow
 * and purple areas that the eye does not see. The lower saturation keeps a trace of them. Set by eye.
 */
const ENHANCED_COLOUR_SATURATION = 0.3;

/**
 * Looks of the bodies with a real map. `seeliger` is high for dark dusty ground and low for bright ice.
 * `gain` sets the display brightness of each map: the maps come from different sources with different levels.
 * All values are set by eye.
 */
const MAPPED_LOOKS: Record<string, Partial<MappedLook>> = {
  MERCURY: { seeliger: 0.75, gain: 1.25 },
  MOON: { seeliger: 0.8, gain: 0.85 },
  MARS: { seeliger: 0.35, gain: 1.5, atmosphere: ATMOSPHERE_MARS, atmosphereNote: 'atmosphere-procedural' },
  PLUTO: { seeliger: 0.4, gain: 1.45, atmosphere: ATMOSPHERE_PLUTO, atmosphereNote: 'haze-procedural' },
  CHARON: { seeliger: 0.5, gain: 1.2 },
  CERES: { seeliger: 0.75, gain: 0.8 },
  VESTA: { seeliger: 0.6, gain: 1.6 },
  IO: { seeliger: 0.35, gain: 1.35 },
  EUROPA: { seeliger: 0.25, gain: 1.7 },
  GANYMEDE: { seeliger: 0.4, gain: 1.6 },
  CALLISTO: { seeliger: 0.55, gain: 3.0 },
  MIMAS: { seeliger: 0.3, gain: 1.9 },
  ENCELADUS: { seeliger: 0.2, gain: 2.9 },
  TETHYS: { seeliger: 0.3, gain: 2.5 },
  DIONE: { seeliger: 0.3, gain: 2.1 },
  RHEA: { seeliger: 0.3, gain: 2.3 },
  IAPETUS: { seeliger: 0.45, gain: 1.6 },
  MIRANDA: { seeliger: 0.35, gain: 1.5 },
  ARIEL: { seeliger: 0.35, gain: 1.8 },
  UMBRIEL: { seeliger: 0.55, gain: 0.6 },
  TITANIA: { seeliger: 0.4, gain: 0.9 },
  OBERON: { seeliger: 0.45, gain: 1.1 },
  TRITON: { seeliger: 0.25, gain: 1.5 },
};

function mappedLook(id: string, entry: TextureEntry): MappedLook {
  const look = { ...DEFAULT_LOOK, ...MAPPED_LOOKS[id], latitude: latitudeKind(entry) };
  if (notesFromEntry(entry).includes('colour-enhanced')) look.saturation = ENHANCED_COLOUR_SATURATION;
  return look;
}

function build(ctx: BuildContext, body: Body | undefined, notes: string[]): Built {
  const id = ctx.id;
  const manifest = ctx.maps.manifest;
  if (!body) {
    notes.push('body-unknown');
    return buildShaped(ctx, genericShape(id), ROCK_LOOK_GENERIC, null, notes);
  }
  if (body.kind === 'star') return buildSun(ctx, notes);
  if (id === 'EARTH') return buildEarth(ctx, notes);

  if (id === 'VENUS' || id === 'TITAN') {
    const deck = (): Built =>
      id === 'VENUS'
        ? buildDeck(ctx, { ...DECK_VENUS, atmosphere: ATMOSPHERE_VENUS }, notes, 'clouds-procedural')
        : buildDeck(ctx, { ...DECK_TITAN, atmosphere: ATMOSPHERE_TITAN }, notes, 'haze-procedural');
    if (ctx.variant === 'surface') {
      const surface = findTexture(manifest, id, 'surface');
      if (surface) {
        const look: MappedLook =
          id === 'VENUS'
            ? { seeliger: 0.3, gain: 1.0, saturation: 1, latitude: 'centric' }
            : { seeliger: 0.3, gain: 1.3, saturation: 1, latitude: 'centric', atmosphere: ATMOSPHERE_TITAN_THIN, atmosphereNote: 'haze-procedural' };
        const built = buildMapped(ctx, surface, look, notes, () => {
          // The map of the variant did not load: the body changes to its default look.
          for (const part of built.parts) part.dispose();
          ctx.root.clear();
          notes.length = 0;
          notes.push('map-load-failed', 'variant-unavailable');
          const fallback = deck();
          built.parts.length = 0;
          built.parts.push(...fallback.parts);
          built.extentKm = fallback.extentKm;
          built.variant = 'default';
        });
        built.variant = 'surface';
        return built;
      }
      notes.push('variant-unavailable');
    }
    return deck();
  }

  if (GIANTS.has(id)) return buildGiant(ctx, body.rings, notes);

  const entry = findTexture(manifest, id, 'color');
  const shape = SHAPES[id];
  if (shape) {
    if (body.kind === 'comet') notes.push('nucleus-only');
    if (id === 'PSYCHE') notes.push('surface-unknown');
    return buildShaped(ctx, shape, ROCK_LOOKS[id] ?? (body.kind === 'comet' ? ROCK_LOOK_COMET : ROCK_LOOK_GENERIC), entry, notes);
  }
  if (entry) {
    // A map that does not load: the sphere gets the cratered surface of the code.
    return buildMapped(ctx, entry, mappedLook(id, entry), notes, (globe) => {
      useRockSurface(ctx, globe, ROCK_LOOK_GLOBE);
      notes.push('surface-procedural');
    });
  }

  // A body of the table with no map and no shape.
  if (body.radius >= ROUND_BODY_MIN_RADIUS_KM) return buildRockyGlobe(ctx, ROCK_LOOK_GLOBE, notes);
  if (body.kind === 'comet') notes.push('nucleus-only');
  return buildShaped(ctx, genericShape(id), body.kind === 'comet' ? ROCK_LOOK_COMET : ROCK_LOOK_GENERIC, null, notes);
}

/** Inverse of the upper 3 x 3 part of a 4 x 4 matrix (three.js element order), in double precision. Returns the determinant. */
function invert3(e: ArrayLike<number>, out: number[]): number {
  const a = e[0], b = e[4], c = e[8];
  const d = e[1], f = e[5], g = e[9];
  const h = e[2], i = e[6], j = e[10];
  const det = a * (f * j - g * i) - b * (d * j - g * h) + c * (d * i - f * h);
  const k = det !== 0 ? 1 / det : 0;
  out[0] = (f * j - g * i) * k;
  out[1] = (c * i - b * j) * k;
  out[2] = (b * g - c * f) * k;
  out[3] = (g * h - d * j) * k;
  out[4] = (a * j - c * h) * k;
  out[5] = (c * d - a * g) * k;
  out[6] = (d * i - f * h) * k;
  out[7] = (b * h - a * i) * k;
  out[8] = (a * f - b * d) * k;
  return det;
}

function applyRows(m: number[], v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z);
}

/**
 * Creates the 3D object of a body. The function returns at once: the maps load in the background and the body
 * shows its plain colour until they are ready.
 *
 * id: an id of the body table (src/engine/bodies.ts). Any other id gives a generic rocky body of 1 km radius.
 */
export function createBody(id: string, opt: BodyOptions): BodyVisual {
  const body = BODIES[id] as Body | undefined;
  const radiusKm = body && body.radius > 0 ? body.radius : 1;
  const polarRadiusKm = body && body.polarRadius > 0 ? body.polarRadius : radiusKm;
  const root = new THREE.Group();
  root.name = `body/${id}`;
  const frame = makeFrameUniforms();
  let disposed = false;
  // A value that is not a time (a negative number, not a number) gives the default.
  const returnDelay = typeof opt.mapReturnDelay === 'number' && opt.mapReturnDelay >= 0 ? opt.mapReturnDelay : MAP_RETURN_DELAY_S;
  // A value below 1, or not a number, gives the default. Infinity stays: no cap.
  const maxLarge = typeof opt.maxLargeMaps === 'number' && opt.maxLargeMaps >= 1 ? Math.floor(opt.maxLargeMaps) : MAX_LARGE_MAPS;
  const maps = new MapSet(
    opt.quality,
    opt.manifest,
    opt.baseUrl,
    () => {
      if (!disposed) opt.onLoad?.();
    },
    { upgrade: opt.mapUpgrade !== false, smooth: opt.magFilter !== 'bilinear', returnDelay, maxLarge },
  );
  const variant: BodyVariant = opt.variant ?? 'default';
  const ctx: BuildContext = { id, root, radiusKm, polarRadiusKm, color: body ? body.color : '#8a8580', quality: opt.quality, variant, maps, frame };
  const notes: string[] = [];
  maps.notes = notes;
  const built = build(ctx, body, notes);
  maps.seal();

  const inverse: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const local = new THREE.Vector3();

  return {
    id,
    object: root,
    radiusKm,
    // A map that does not load can change these three values, so they are read from the body each time.
    get extentKm(): number {
      return built.extentKm;
    },
    get provenance(): BodyVisual['provenance'] {
      return built.provenance;
    },
    get variant(): BodyVariant {
      return built.variant;
    },
    notes: built.notes,
    update(p: BodyUpdate): void {
      if (disposed) return;
      // World axes to body axes, on the CPU in double precision. The shaders work in the body axes only.
      root.updateWorldMatrix(true, false);
      const det = invert3(root.matrixWorld.elements, inverse);
      const scale = Math.cbrt(Math.abs(det)) || 1;
      applyRows(inverse, p.sunDir, frame.uSunDir.value).normalize();
      applyRows(inverse, p.cameraPos, frame.uCamPos.value);
      // The parts wrap the time themselves (64 bit numbers), so a large value is no problem. A value that is not a number stops the motion.
      frame.uTime.value = Number.isFinite(p.time) ? p.time : 0;
      frame.uSunAngR.value = p.sunDistanceKm && p.sunDistanceKm > 0 ? SUN_RADIUS_KM / p.sunDistanceKm : 0;
      frame.uNightFill.value = p.nightFill !== undefined && p.nightFill > 0 ? Math.min(p.nightFill, 1) : 0;
      const casters = p.shadowCasters;
      for (let k = 0; k < MAX_CASTERS; k++) {
        const target = frame.uCasters.value[k];
        const caster = casters && k < casters.length ? casters[k] : null;
        if (caster && caster.radiusKm > 0) {
          applyRows(inverse, caster.pos, local);
          target.set(local.x, local.y, local.z, caster.radiusKm / scale);
        } else {
          target.set(0, 0, 0, 0);
        }
      }
      const camDistance = frame.uCamPos.value.length();
      for (const part of built.parts) part.update?.(camDistance);
      // The maps: the file of each map for the views of the frame before, and the next part of a file that loads.
      maps.update();
    },
    stats(): BodyStats {
      return sumStats(built.parts, maps, built);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const part of built.parts) part.dispose();
      maps.dispose();
      root.clear();
      root.removeFromParent();
    },
  };
}
