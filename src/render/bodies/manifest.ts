/**
 * Reader of the texture manifest (public/textures/manifest.json) and loader of the map files.
 *
 * The module never assumes that a file exists: a body asks for an entry, and a body with no entry
 * gets a surface that the code makes.
 */
import * as THREE from 'three';
import type { BodyQuality, TextureEntry, TextureManifest } from './types';

/** A manifest with no texture. All bodies are then made by code. */
export const EMPTY_MANIFEST: TextureManifest = { textures: [] };

function withSlash(baseUrl: string): string {
  return baseUrl === '' || baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

/**
 * Loads `<baseUrl>textures/manifest.json`. The promise fails if the file is not there or is not a manifest.
 * A caller that wants to continue without maps can use EMPTY_MANIFEST.
 */
export async function loadManifest(baseUrl: string): Promise<TextureManifest> {
  const url = `${withSlash(baseUrl)}textures/manifest.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Texture manifest: HTTP ${response.status} for ${url}`);
  const data: unknown = await response.json();
  const list = (data as { textures?: unknown } | null)?.textures;
  if (!Array.isArray(list)) throw new Error(`Texture manifest: no "textures" list in ${url}`);
  const textures = list.filter(
    (e): e is TextureEntry =>
      typeof e === 'object' && e !== null && typeof (e as TextureEntry).id === 'string' && typeof (e as TextureEntry).file === 'string',
  );
  return { ...(data as Record<string, unknown>), textures };
}

/** The entry for a body and a role, or null. */
export function findTexture(manifest: TextureManifest, body: string, role: string): TextureEntry | null {
  for (const e of manifest.textures) {
    if (e.body === body && e.role === role) return e;
  }
  return null;
}

/** Address of the file of an entry for a quality. */
export function textureUrl(entry: TextureEntry, quality: BodyQuality, baseUrl: string): string {
  const file = quality === 'low' && typeof entry.small === 'string' ? entry.small : entry.file;
  return `${withSlash(baseUrl)}${file}`;
}

/** True if the manifest says that a large part of the map has no data. */
export function isPartial(entry: TextureEntry): boolean {
  return entry.coverage === 'partial';
}

/** u offset of a map: u = longitude / 360 + offset, for east longitude in degrees. */
export function longitudeOffset(entry: TextureEntry): number {
  const c = typeof entry.centerLongitudeDeg === 'number' && Number.isFinite(entry.centerLongitudeDeg) ? entry.centerLongitudeDeg : 0;
  return 0.5 - c / 360;
}

function firstNumber(entry: TextureEntry, keys: string[]): number | null {
  for (const k of keys) {
    const v = entry[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/**
 * Inner and outer radius (km) of a ring strip, if the manifest gives them as numbers.
 * The names of these fields were not fixed when this module was written, so the function accepts the likely names.
 * A strip with no radius is not used: the ring profile is then made by code.
 */
export function ringStripRadii(entry: TextureEntry): { inner: number; outer: number } | null {
  let inner = firstNumber(entry, ['innerRadiusKm', 'innerKm', 'radiusInnerKm', 'ringInnerKm', 'innerRadius']);
  let outer = firstNumber(entry, ['outerRadiusKm', 'outerKm', 'radiusOuterKm', 'ringOuterKm', 'outerRadius']);
  for (const k of ['radiiKm', 'radialRangeKm', 'radiusRangeKm', 'rangeKm']) {
    const v = entry[k];
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
      inner = inner ?? v[0];
      outer = outer ?? v[1];
    }
  }
  if (inner === null || outer === null || !(outer > inner)) return null;
  return { inner, outer };
}

/** Words in the free text of an entry that become notes for the user interface. */
const NOTE_WORDS: [RegExp, string][] = [
  [/enhanced colou?r/i, 'colour-enhanced'],
  [/synthetic colou?r/i, 'colour-synthetic'],
  [/monochrome/i, 'monochrome'],
  [/near-infrared/i, 'near-infrared'],
  [/radar/i, 'radar'],
];

/** Notes that follow from the text of a manifest entry. */
export function notesFromEntry(entry: TextureEntry): string[] {
  const text = typeof entry.note === 'string' ? entry.note : '';
  const out: string[] = [];
  for (const [re, note] of NOTE_WORDS) {
    if (re.test(text)) out.push(note);
  }
  return out;
}

export interface MapOptions {
  /** Colour data (sRGB) or plain data. */
  srgb: boolean;
  /** The map repeats in longitude. */
  wrapU: boolean;
  anisotropy: number;
}

/** A 1 x 1 white texture. A material uses it until its map is ready. */
export function makeBlankTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'bodies/blank';
  t.needsUpdate = true;
  return t;
}

/**
 * Starts the download of a map. `done` gets the texture, or null if the file did not load.
 * The returned function stops the use of the result (after dispose).
 */
export function loadMap(url: string, opt: MapOptions, done: (texture: THREE.Texture | null) => void): () => void {
  let alive = true;
  const loader = new THREE.TextureLoader();
  loader.load(
    url,
    (texture) => {
      if (!alive) {
        texture.dispose();
        return;
      }
      texture.name = url;
      texture.colorSpace = opt.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = opt.wrapU ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = opt.anisotropy;
      texture.needsUpdate = true;
      done(texture);
    },
    undefined,
    () => {
      if (alive) done(null);
    },
  );
  return () => {
    alive = false;
  };
}

export interface MapScan {
  /** Fraction of the surface with no data, 0 to 1. */
  missing: number;
  /** Fraction of the northern and of the southern hemisphere with no data. */
  missingNorth: number;
  missingSouth: number;
  /** True if the map marks its areas with no data with pure black. */
  black: boolean;
  /**
   * Limits (linear light) of a flat grey level that marks areas with no data, or null.
   * Some maps fill these areas with a light grey and not with black.
   */
  flat: { low: number; high: number } | null;
}

function toLinear(level: number): number {
  const c = Math.min(1, Math.max(0, level / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Looks at a small copy of a map and measures the area with no data.
 * No data is pure black. For a map that the manifest calls partial and that has no black area, no data can also be
 * one flat grey level: the code accepts it only if this level fills the top row or the bottom row of the map
 * and if it is a narrow separate peak in the histogram of the map.
 * Returns null if the browser does not let the code read the pixels.
 */
export function scanMap(texture: THREE.Texture, partial: boolean): MapScan | null {
  const image = texture.image as CanvasImageSource | undefined;
  if (!image || typeof document === 'undefined') return null;
  const w = 256;
  const h = 128;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const level = new Uint8Array(w * h);
    const grey = new Uint8Array(w * h);
    const weights = new Float64Array(h);
    const hist = new Float64Array(256);
    let all = 0;
    let blackArea = 0;
    for (let y = 0; y < h; y++) {
      // Each row has the weight of its area on the sphere.
      const weight = Math.cos(((y + 0.5) / h - 0.5) * Math.PI);
      weights[y] = weight;
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const hi = Math.max(px[k], px[k + 1], px[k + 2]);
        const lo = Math.min(px[k], px[k + 1], px[k + 2]);
        level[y * w + x] = hi;
        grey[y * w + x] = hi - lo <= 12 ? 1 : 0;
        hist[hi] += weight;
        all += weight;
        if (hi < 10) blackArea += weight;
      }
    }
    const black = blackArea / all > 0.003;

    let flatLevel = -1;
    if (partial && blackArea / all < 0.02) {
      for (const y of [0, h - 1]) {
        const row = Array.from(level.subarray(y * w, (y + 1) * w)).sort((a, b) => a - b);
        const median = row[w >> 1];
        let near = 0;
        for (let x = 0; x < w; x++) {
          if (Math.abs(level[y * w + x] - median) <= 6 && grey[y * w + x] === 1) near++;
        }
        if (near < 0.9 * w || median < 30) continue;
        const share = (from: number, to: number): number => {
          let sum = 0;
          for (let v = Math.max(0, from); v <= Math.min(255, to); v++) sum += hist[v];
          return sum / all;
        };
        const peak = share(median - 7, median + 7);
        if (peak >= 0.04 && share(median - 20, median - 8) <= 0.3 * peak && share(median + 8, median + 20) <= 0.3 * peak) {
          flatLevel = median;
          break;
        }
      }
    }

    let north = 0;
    let south = 0;
    let missNorth = 0;
    let missSouth = 0;
    for (let y = 0; y < h; y++) {
      let gone = 0;
      for (let x = 0; x < w; x++) {
        const v = level[y * w + x];
        if (v < 10 || (flatLevel >= 0 && Math.abs(v - flatLevel) <= 10 && grey[y * w + x] === 1)) gone++;
      }
      if (y < h / 2) {
        north += weights[y] * w;
        missNorth += weights[y] * gone;
      } else {
        south += weights[y] * w;
        missSouth += weights[y] * gone;
      }
    }
    return {
      missing: (missNorth + missSouth) / all,
      missingNorth: missNorth / north,
      missingSouth: missSouth / south,
      black,
      flat: flatLevel >= 0 ? { low: toLinear(flatLevel - 10), high: toLinear(flatLevel + 10) } : null,
    };
  } catch {
    return null;
  }
}
