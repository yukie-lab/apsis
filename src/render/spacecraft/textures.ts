/**
 * Procedural texture pixels for the spacecraft materials.
 *
 * Every function computes RGBA bytes in code: no image file and no canvas is necessary, so the
 * models also build where there is no DOM. The pixel arrays are kept in a module cache (plain
 * memory, no GPU resource); each model wraps them in its own `THREE.DataTexture` and frees that
 * texture when it is disposed.
 *
 * All textures tile without a seam.
 */

export interface Pixels {
  readonly data: Uint8Array;
  readonly size: number;
}

export type Rgb = readonly [number, number, number];

const cache = new Map<string, Pixels>();
const foilCache = new Map<string, FoilMaps>();

function cached(key: string, make: () => Pixels): Pixels {
  let p = cache.get(key);
  if (!p) {
    p = make();
    cache.set(key, p);
  }
  return p;
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** Tileable fractal value noise, values 0..1. */
function fbmField(size: number, basePeriod: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let period = basePeriod;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(period * period);
    for (let y = 0; y < period; y++) {
      for (let x = 0; x < period; x++) lat[y * period + x] = hash2(x, y, seed + o * 131);
    }
    const scale = period / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const ya = (y0 % period) * period;
      const yb = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const fx = x * scale;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % period;
        const xb = (x0 + 1) % period;
        const top = lat[ya + xa] + (lat[ya + xb] - lat[ya + xa]) * sx;
        const bot = lat[yb + xa] + (lat[yb + xb] - lat[yb + xa]) * sx;
        out[y * size + x] += amp * (top + (bot - top) * sy);
      }
    }
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  for (let k = 0; k < out.length; k++) out[k] /= norm;
  return out;
}

/** One octave of tileable gradient noise with `px` x `py` lattice cells across the tile, values about 0..1. */
function gradientNoise(size: number, px: number, py: number, seed: number): Float32Array {
  const gx = new Float32Array(px * py);
  const gy = new Float32Array(px * py);
  for (let y = 0; y < py; y++) {
    for (let x = 0; x < px; x++) {
      const ang = hash2(x, y, seed) * Math.PI * 2;
      gx[y * px + x] = Math.cos(ang);
      gy[y * px + x] = Math.sin(ang);
    }
  }
  const out = new Float32Array(size * size);
  const sx = px / size;
  const sy = py / size;
  for (let y = 0; y < size; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const wy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
    const ya = (y0 % py) * px;
    const yb = ((y0 + 1) % py) * px;
    for (let x = 0; x < size; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const wx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
      const xa = x0 % px;
      const xb = (x0 + 1) % px;
      const n00 = gx[ya + xa] * tx + gy[ya + xa] * ty;
      const n10 = gx[ya + xb] * (tx - 1) + gy[ya + xb] * ty;
      const n01 = gx[yb + xa] * tx + gy[yb + xa] * (ty - 1);
      const n11 = gx[yb + xb] * (tx - 1) + gy[yb + xb] * (ty - 1);
      const top = n00 + (n10 - n00) * wx;
      const bot = n01 + (n11 - n01) * wx;
      out[y * size + x] = 0.5 + 0.7 * (top + (bot - top) * wy);
    }
  }
  return out;
}

export interface FoilMaps {
  /** Tangent-space normal map of a crinkled thermal blanket. */
  normal: Pixels;
  /** Roughness variation (the same value in R, G and B). */
  rough: Pixels;
}

/**
 * Crinkled thermal blanket. The height field has slow billows (the blanket lies loose between its
 * fixing points), two families of sharp creases and fine wrinkles. The normal map is the slope of
 * that field. `coarse` is the number of billows across one tile; `slope` is the mean slope.
 */
export function foilMaps(size: number, coarse: number, seed: number, slope = 0.36): FoilMaps {
  const key = `foil:${size}:${coarse}:${seed}:${slope}`;
  const hit = foilCache.get(key);
  if (hit) return hit;
  const normal: Pixels = { data: new Uint8Array(size * size * 4), size };
  const rough: Pixels = { data: new Uint8Array(size * size * 4), size };
  foilCache.set(key, { normal, rough });

  const n = size * size;
  const billow = gradientNoise(size, coarse, coarse, seed);
  const carrier1 = gradientNoise(size, coarse + 1, coarse + 2, seed + 1);
  const carrier2 = gradientNoise(size, coarse * 2 + 1, coarse * 3, seed + 2);
  const carrier3 = gradientNoise(size, coarse * 5, coarse * 4 + 1, seed + 3);
  const fine = gradientNoise(size, coarse * 11, coarse * 13, seed + 4);
  const h = new Float32Array(n);
  const crease = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    // A crease is the crest line where a carrier crosses its middle value.
    const r1 = 1 - Math.abs(2 * (0.7 * carrier1[k] + 0.3 * carrier2[k]) - 1);
    const r2 = 1 - Math.abs(2 * (0.65 * carrier2[k] + 0.35 * carrier3[k]) - 1);
    h[k] = 0.6 * billow[k] + 0.34 * r1 * r1 + 0.17 * r2 * r2 + 0.03 * fine[k];
    crease[k] = Math.max(r1, r2);
  }
  // Slopes by central differences; then scale them to the wanted mean slope.
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  let sum = 0;
  for (let y = 0; y < size; y++) {
    const ym = ((y + size - 1) % size) * size;
    const yp = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x + size - 1) % size;
      const xp = (x + 1) % size;
      const k = y * size + x;
      sx[k] = h[y * size + xp] - h[y * size + xm];
      sy[k] = h[yp + x] - h[ym + x];
      sum += sx[k] * sx[k] + sy[k] * sy[k];
    }
  }
  const gain = slope / (Math.sqrt(sum / n) || 1);
  const nd = normal.data;
  const rd = rough.data;
  for (let k = 0; k < n; k++) {
    const gx = sx[k] * gain;
    const gy = sy[k] * gain;
    const inv = 1 / Math.hypot(gx, gy, 1);
    const o = k * 4;
    nd[o] = clampByte(Math.round((-gx * inv * 0.5 + 0.5) * 255));
    nd[o + 1] = clampByte(Math.round((-gy * inv * 0.5 + 0.5) * 255));
    nd[o + 2] = clampByte(Math.round((inv * 0.5 + 0.5) * 255));
    nd[o + 3] = 255;
    // Smooth film on the billows, scuffed film on the creases.
    const worn = smooth((crease[k] - 0.86) / 0.14);
    const r = 0.66 + 0.2 * (billow[k] - 0.5) + 0.16 * (carrier3[k] - 0.5) + 0.3 * worn;
    const rb = clampByte(Math.round(r * 255));
    rd[o] = rb;
    rd[o + 1] = rb;
    rd[o + 2] = rb;
    rd[o + 3] = 255;
  }
  return { normal, rough };
}

/** Soft blotches and streaks, light values (for roughness or a slight change of colour). */
export function grunge(size: number, seed: number, low = 0.6): Pixels {
  return cached(`grunge:${size}:${seed}:${low}`, () => {
    const a = fbmField(size, 4, 4, seed);
    const b = fbmField(size, 2, 2, seed + 5);
    const data = new Uint8Array(size * size * 4);
    for (let k = 0; k < size * size; k++) {
      const t = smooth(0.5 + (a[k] - 0.5) * 2.2) * 0.75 + b[k] * 0.25;
      const v = clampByte(Math.round((low + (1 - low) * t) * 255));
      data[k * 4] = v;
      data[k * 4 + 1] = v;
      data[k * 4 + 2] = v;
      data[k * 4 + 3] = 255;
    }
    return { data, size };
  });
}

export interface TileSpec {
  /** Pixels per side. */
  size: number;
  /** Cells per side. */
  cells: number;
  /** Colour of a cell (sRGB bytes). */
  base: Rgb;
  /** Colour of the gap between cells (sRGB bytes). */
  gap: Rgb;
  /** Half width of the gap in pixels. */
  gapPx: number;
  /** Brightness difference between cells (0..1). */
  jitter: number;
  /** Colour shift between cells: adds to red and subtracts from blue (0..1). */
  warmth?: number;
  /** Number of thin lines across each cell (current collectors of a solar cell). */
  fingers?: number;
  /** Number of wide bars across each cell, at a right angle to the thin lines. */
  bars?: number;
  /** Colour of the lines and bars. */
  line?: Rgb;
  /** Size in pixels of the cut corners of each cell (0 = square cells). */
  cut?: number;
  /** Amplitude of the fine noise (0..1). */
  noise?: number;
  seed: number;
}

/** Grid of cells with gaps: solar cells, antenna paint panels, heat shield tiles, mirror tiles. */
export function tiles(spec: TileSpec): Pixels {
  const key = `tiles:${JSON.stringify(spec)}`;
  return cached(key, () => {
    const { size, cells, base, gap, gapPx, jitter, seed } = spec;
    const warmth = spec.warmth ?? 0;
    const fingers = spec.fingers ?? 0;
    const bars = spec.bars ?? 0;
    const line = spec.line ?? gap;
    const cut = spec.cut ?? 0;
    const noiseAmp = spec.noise ?? 0;
    const cell = size / cells;
    const noise = noiseAmp > 0 ? fbmField(size, 8, 3, seed + 3) : null;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const cy = Math.floor(y / cell);
      const ly = y - cy * cell;
      const ey = Math.min(ly, cell - 1 - ly);
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x / cell);
        const lx = x - cx * cell;
        const ex = Math.min(lx, cell - 1 - lx);
        let r: number;
        let g: number;
        let b: number;
        const inGap = ex < gapPx || ey < gapPx || (cut > 0 && ex + ey < cut + gapPx);
        if (inGap) {
          r = gap[0];
          g = gap[1];
          b = gap[2];
        } else {
          const j = 1 + jitter * (hash2(cx, cy, seed) - 0.5) * 2;
          const w = warmth * (hash2(cx, cy, seed + 9) - 0.5) * 2;
          r = base[0] * j * (1 + w);
          g = base[1] * j;
          b = base[2] * j * (1 - w);
          let onLine = false;
          if (fingers > 0) {
            const fp = cell / fingers;
            if (Math.floor(ly % fp) === Math.floor(fp / 2)) onLine = true;
          }
          if (bars > 0) {
            const bp = cell / bars;
            const m = lx % bp;
            if (Math.abs(m - bp / 2) < 0.75) onLine = true;
          }
          if (onLine) {
            r = r * 0.45 + line[0] * 0.55;
            g = g * 0.45 + line[1] * 0.55;
            b = b * 0.45 + line[2] * 0.55;
          }
        }
        if (noise) {
          const nz = 1 + noiseAmp * (noise[y * size + x] - 0.5) * 2;
          r *= nz;
          g *= nz;
          b *= nz;
        }
        const o = (y * size + x) * 4;
        data[o] = clampByte(Math.round(r));
        data[o + 1] = clampByte(Math.round(g));
        data[o + 2] = clampByte(Math.round(b));
        data[o + 3] = 255;
      }
    }
    return { data, size };
  });
}

/** Open wire mesh: opaque wires on a nearly clear ground (alpha channel). */
export function wireMesh(size: number, pitch: number, color: Rgb, clear = 0.06): Pixels {
  return cached(`mesh:${size}:${pitch}:${color.join(',')}:${clear}`, () => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wire = x % pitch === 0 || y % pitch === 0;
        const knot = x % pitch === 0 && y % pitch === 0;
        const o = (y * size + x) * 4;
        const shade = knot ? 1.15 : 1;
        data[o] = clampByte(Math.round(color[0] * shade));
        data[o + 1] = clampByte(Math.round(color[1] * shade));
        data[o + 2] = clampByte(Math.round(color[2] * shade));
        data[o + 3] = wire ? 255 : Math.round(clear * 255);
      }
    }
    return { data, size };
  });
}

/** Fine woven cloth or carbon fibre: a small two-tone weave with light values. */
export function weave(size: number, pitch: number, seed: number): Pixels {
  return cached(`weave:${size}:${pitch}:${seed}`, () => {
    const data = new Uint8Array(size * size * 4);
    const soft = fbmField(size, 4, 2, seed);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const a = Math.floor(x / pitch) + Math.floor(y / pitch);
        const over = a % 2 === 0;
        const along = over ? (x % pitch) / pitch : (y % pitch) / pitch;
        const t = 0.74 + (over ? 0.14 : 0) + 0.1 * Math.sin(along * Math.PI) + 0.1 * (soft[y * size + x] - 0.5);
        const v = clampByte(Math.round(t * 255));
        const o = (y * size + x) * 4;
        data[o] = v;
        data[o + 1] = v;
        data[o + 2] = v;
        data[o + 3] = 255;
      }
    }
    return { data, size };
  });
}
