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

/**
 * True if the build of the map has filled its areas with no image data with colour (field filledSharePercent).
 * Such a map has no black area.
 */
function gapsAreFilled(entry: TextureEntry): boolean {
  return typeof entry.filledSharePercent === 'number' && entry.filledSharePercent > 0;
}

/** True if the manifest says that a large part of the map has no data, and that this part is black (or flat grey) in the file. */
export function isPartial(entry: TextureEntry): boolean {
  return entry.coverage === 'partial' && !gapsAreFilled(entry);
}

/** u offset of a map: u = longitude / 360 + offset, for east longitude in degrees. */
export function longitudeOffset(entry: TextureEntry): number {
  const c = typeof entry.centerLongitudeDeg === 'number' && Number.isFinite(entry.centerLongitudeDeg) ? entry.centerLongitudeDeg : 0;
  return 0.5 - c / 360;
}

/**
 * Inner and outer radius (km) of a ring strip: the fields innerRadiusKm and outerRadiusKm of the manifest.
 * The left edge of the strip is at the inner radius, and the radius is linear along the strip.
 * A strip with no radius is not used: the ring profile is then made by code.
 */
export function ringStripRadii(entry: TextureEntry): { inner: number; outer: number } | null {
  const inner = entry.innerRadiusKm;
  const outer = entry.outerRadiusKm;
  if (typeof inner !== 'number' || typeof outer !== 'number' || !(inner > 0) || !(outer > inner)) return null;
  return { inner, outer };
}

/**
 * Latitude of the rows of a map: the field latitudeType of the manifest ('planetocentric' or 'planetographic').
 * An entry with no such field gets planetocentric latitude. The two kinds differ only for a flattened body.
 */
export function latitudeKind(entry: TextureEntry): 'centric' | 'graphic' {
  return entry.latitudeType === 'planetographic' ? 'graphic' : 'centric';
}

/** Notes for the classes of the field `colour` of the manifest. 'natural' needs no note. */
const COLOUR_NOTES: Record<string, string> = {
  enhanced: 'colour-enhanced',
  'near natural': 'colour-near-natural',
  grey: 'monochrome',
};

/**
 * Words in the free text of an entry that become notes for the user interface.
 * The manifest has no field for these facts, so the code reads them from the note of the entry.
 * "Monochrome" and "Radar" count only as the first word of the note: other notes use these words for a part of a map.
 */
const NOTE_WORDS: [RegExp, string][] = [
  [/\benhanced colou?r\b/i, 'colour-enhanced'],
  [/\bsynthetic colou?r\b/i, 'colour-synthetic'],
  [/^\s*monochrome\b/i, 'monochrome'],
  [/\bnear-infrared\b/i, 'near-infrared'],
  [/^\s*radar\b/i, 'radar'],
];

/**
 * Notes that follow from a manifest entry: from the fields `colour` and `filledSharePercent`, and from the text
 * of the note.
 */
export function notesFromEntry(entry: TextureEntry): string[] {
  const out: string[] = [];
  const colour = typeof entry.colour === 'string' ? COLOUR_NOTES[entry.colour] : undefined;
  if (colour) out.push(colour);
  const text = typeof entry.note === 'string' ? entry.note : '';
  for (const [re, note] of NOTE_WORDS) {
    if (re.test(text) && !out.includes(note)) out.push(note);
  }
  // The build of the map has filled areas with no image data (Saturn, Uranus, Neptune).
  if (gapsAreFilled(entry)) out.push('map-gaps-filled');
  return out;
}

export interface MapOptions {
  /** Colour data (sRGB) or plain data. */
  srgb: boolean;
  /** The map repeats in longitude. */
  wrapU: boolean;
  anisotropy: number;
  /** Test the edges of the image and repair wrong edge lines (see repairEdges). Without it: the value of `wrapU`. */
  repair?: boolean;
}

/** A 1 x 1 white texture. A material uses it until its map is ready. */
export function makeBlankTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'bodies/blank';
  t.needsUpdate = true;
  return t;
}

/** Sum of red, green and blue (0 to 765). A pixel at or below it counts as "no data" in the edge test. */
const EDGE_FLOOR = 24;
/** An edge is tested only if at least this share of its pixels has data. */
const EDGE_MIN_SHARE = 0.05;
/** An edge line is wrong only if it is at least this much darker than the line beside it. */
const EDGE_MIN_DROP = 0.06;

/**
 * Number of wrong lines (0, 1 or 2) at one edge of a map.
 *
 * `px` holds four lines of `n` pixels (red, green, blue, alpha). Line 0 is the edge line and lines 1 to 3 go inward.
 * `at(line, i)` is the place of pixel i of a line in `px`.
 *
 * Some map files have one or two edge lines that are darker copies of the line beside them. The test compares the
 * sums of the lines over the pixels that have data. `natural1` and `natural2` are the steps between inner lines of
 * the same map: a map with strong steps between its lines needs a stronger drop.
 * Two wrong lines are a ramp: the edge line is darker than the second line, and the second line is darker than the third.
 * A real gradient near a pole gives two edge lines of about the same level, or a ramp that goes on inward: the test
 * leaves both as they are.
 */
function darkLines(px: Uint8ClampedArray, n: number, at: (line: number, i: number) => number): number {
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let valid = 0;
  for (let i = 0; i < n; i++) {
    const a2 = at(2, i);
    const a3 = at(3, i);
    const v2 = px[a2] + px[a2 + 1] + px[a2 + 2];
    const v3 = px[a3] + px[a3 + 1] + px[a3 + 2];
    if (v2 <= EDGE_FLOOR || v3 <= EDGE_FLOOR) continue;
    const a0 = at(0, i);
    const a1 = at(1, i);
    s0 += px[a0] + px[a0 + 1] + px[a0 + 2];
    s1 += px[a1] + px[a1 + 1] + px[a1 + 2];
    s2 += v2;
    s3 += v3;
    valid++;
  }
  if (valid < EDGE_MIN_SHARE * n) return 0;
  const k0 = s0 / s2;
  const k1 = s1 / s2;
  const natural2 = Math.abs(s2 / s3 - 1);
  if (1 - k1 > Math.max(3 * natural2, EDGE_MIN_DROP) && (k0 < k1 - 0.05 || k1 < 0.1)) return 2;
  if (s1 <= 0) return 0;
  const natural1 = Math.max(Math.abs(s1 / s2 - 1), natural2);
  return 1 - s0 / s1 > Math.max(3 * natural1, EDGE_MIN_DROP) ? 1 : 0;
}

interface EdgeRepair {
  canvas: HTMLCanvasElement;
  /** A column at the left or the right edge was wrong. */
  columns: boolean;
  /** A row at the top or the bottom edge was wrong. */
  rows: boolean;
}

/**
 * Repair of wrong pixel lines at the edges of a map that goes around the body.
 *
 * Some map files have a first or a last column that is much darker than the columns beside it: the body then shows
 * a thin line along one meridian. Some have a dark first or last row: the body then shows a dark dot at a pole.
 * The function tests the four edges (see darkLines). If an edge has wrong lines, it returns a copy of the image in
 * which the nearest good line replaces them. It returns null if the image is good, or if the browser does not let
 * the code read the pixels.
 */
function repairEdges(image: unknown): EdgeRepair | null {
  if (typeof document === 'undefined' || typeof HTMLImageElement === 'undefined' || !(image instanceof HTMLImageElement)) return null;
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (w < 16 || h < 16) return null;
  try {
    // Four rows of the top edge, then four rows of the bottom edge.
    const rowStrip = document.createElement('canvas');
    rowStrip.width = w;
    rowStrip.height = 8;
    const rctx = rowStrip.getContext('2d', { willReadFrequently: true });
    if (!rctx) return null;
    rctx.drawImage(image, 0, 0, w, 4, 0, 0, w, 4);
    rctx.drawImage(image, 0, h - 4, w, 4, 0, 4, w, 4);
    const rows = rctx.getImageData(0, 0, w, 8).data;
    const top = darkLines(rows, w, (line, i) => (line * w + i) * 4);
    const bottom = darkLines(rows, w, (line, i) => ((7 - line) * w + i) * 4);
    // Four columns of the left edge, then four columns of the right edge.
    const columnStrip = document.createElement('canvas');
    columnStrip.width = 8;
    columnStrip.height = h;
    const cctx = columnStrip.getContext('2d', { willReadFrequently: true });
    if (!cctx) return null;
    cctx.drawImage(image, 0, 0, 4, h, 0, 0, 4, h);
    cctx.drawImage(image, w - 4, 0, 4, h, 4, 0, 4, h);
    const columns = cctx.getImageData(0, 0, 8, h).data;
    const left = darkLines(columns, h, (line, i) => (i * 8 + line) * 4);
    const right = darkLines(columns, h, (line, i) => (i * 8 + 7 - line) * 4);
    if (top + bottom + left + right === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    // The columns first: the rows that follow then copy good corner pixels.
    if (left > 0) {
      const good = ctx.getImageData(left, 0, 1, h);
      for (let x = 0; x < left; x++) ctx.putImageData(good, x, 0);
    }
    if (right > 0) {
      const good = ctx.getImageData(w - 1 - right, 0, 1, h);
      for (let x = 0; x < right; x++) ctx.putImageData(good, w - 1 - x, 0);
    }
    if (top > 0) {
      const good = ctx.getImageData(0, top, w, 1);
      for (let y = 0; y < top; y++) ctx.putImageData(good, 0, y);
    }
    if (bottom > 0) {
      const good = ctx.getImageData(0, h - 1 - bottom, w, 1);
      for (let y = 0; y < bottom; y++) ctx.putImageData(good, 0, h - 1 - y);
    }
    return { canvas, columns: left + right > 0, rows: top + bottom > 0 };
  } catch {
    return null;
  }
}

/**
 * The middle pixel row of the image of a texture: red, green, blue, alpha (0 to 255) for each pixel.
 * Alpha is straight (not multiplied into the colour). Returns null if the browser does not let the code read the pixels.
 */
export function readMiddleRow(texture: THREE.Texture): Uint8ClampedArray | null {
  const image = texture.image as (CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }) | undefined;
  if (!image || typeof document === 'undefined') return null;
  const w = Number(image.naturalWidth ?? image.width ?? 0);
  const h = Number(image.naturalHeight ?? image.height ?? 0);
  if (!(w >= 2) || !(h >= 1)) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, Math.floor(h / 2), w, 1, 0, 0, w, 1);
    return ctx.getImageData(0, 0, w, 1).data;
  } catch {
    return null;
  }
}

/** True if loadMap has repaired a column at the left or the right edge of this texture. */
export function wasRepaired(texture: THREE.Texture): boolean {
  return texture.userData.edgeRepaired === true;
}

/** True if loadMap has repaired a row at the top or the bottom edge of this texture (a pole of the body). */
export function wasPoleRepaired(texture: THREE.Texture): boolean {
  return texture.userData.poleRepaired === true;
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
    (loaded) => {
      if (!alive) {
        loaded.dispose();
        return;
      }
      let texture: THREE.Texture = loaded;
      const repaired = (opt.repair ?? opt.wrapU) ? repairEdges(loaded.image) : null;
      if (repaired) {
        loaded.dispose();
        texture = new THREE.CanvasTexture(repaired.canvas);
        texture.userData.edgeRepaired = repaired.columns;
        texture.userData.poleRepaired = repaired.rows;
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
  /**
   * A small map of the areas with no data: for each cell the share (0 to 255) of the cells around it that have
   * no data. The rows go from the south to the north. A shader uses it to tell an area with no data from a
   * dark shadow in a good area.
   */
  area: Uint8Array;
  areaWidth: number;
  areaHeight: number;
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
 * The small copy is a mean over many pixels of the map, so a narrow shadow between bright rocks is not black in it.
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
    // The browser then takes the mean of the pixels of the map for each pixel of the copy.
    ctx.imageSmoothingQuality = 'high';
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
    const none = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let gone = 0;
      for (let x = 0; x < w; x++) {
        const v = level[y * w + x];
        if (v < 10 || (flatLevel >= 0 && Math.abs(v - flatLevel) <= 10 && grey[y * w + x] === 1)) {
          gone++;
          none[y * w + x] = 1;
        }
      }
      if (y < h / 2) {
        north += weights[y] * w;
        missNorth += weights[y] * gone;
      } else {
        south += weights[y] * w;
        missSouth += weights[y] * gone;
      }
    }
    // Share of the cells with no data in a square of 5 x 5 cells. The map goes around the body in x.
    const area = new Uint8Array(w * h);
    const reach = 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let dy = -reach; dy <= reach; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -reach; dx <= reach; dx++) sum += none[yy * w + ((x + dx + w) % w)];
        }
        // Row 0 of the result is the south edge of the map.
        area[(h - 1 - y) * w + x] = Math.round((255 * sum) / ((2 * reach + 1) * (2 * reach + 1)));
      }
    }
    return {
      missing: (missNorth + missSouth) / all,
      missingNorth: missNorth / north,
      missingSouth: missSouth / south,
      black,
      flat: flatLevel >= 0 ? { low: toLinear(flatLevel - 10), high: toLinear(flatLevel + 10) } : null,
      area,
      areaWidth: w,
      areaHeight: h,
    };
  } catch {
    return null;
  }
}
