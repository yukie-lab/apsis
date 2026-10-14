/**
 * Text as glyph outlines (font Inter, SIL Open Font License 1.1, package @fontsource/inter). Each glyph is one SVG
 * path: the "write" animation draws the outline of each glyph, then fills it.
 */
import { parse, type Font, type Glyph } from 'opentype.js';
import { Mob, Camera, num, color, svgEl, f2, clamp01, type Vec3, Track } from './core';
import latin400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import latin600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url';
import latinExt400 from '@fontsource/inter/files/inter-latin-ext-400-normal.woff?url';
import latinExt600 from '@fontsource/inter/files/inter-latin-ext-600-normal.woff?url';
import greek400 from '@fontsource/inter/files/inter-greek-400-normal.woff?url';
import greek600 from '@fontsource/inter/files/inter-greek-600-normal.woff?url';

export type Weight = 400 | 600;
const FILES: Record<Weight, string[]> = { 400: [latin400, latinExt400, greek400], 600: [latin600, latinExt600, greek600] };
const fonts: Partial<Record<Weight, Font[]>> = {};

/** Load the fonts. Call once before the scene makes text. */
export async function loadFonts(): Promise<void> {
  for (const w of [400, 600] as Weight[]) {
    fonts[w] = await Promise.all(FILES[w].map(async (u) => parse(await (await fetch(u)).arrayBuffer())));
  }
}

interface Placed { d: string; x0: number; x1: number }

/** Glyph paths of one line of text with the baseline at y = 0 and the start at x = 0. */
export function layoutGlyphs(text: string, size: number, weight: Weight): { glyphs: Placed[]; width: number } {
  const list = fonts[weight];
  if (!list) throw new Error('Fonts are not loaded.');
  const out: Placed[] = [];
  let x = 0;
  let prev: { font: Font; glyph: Glyph } | null = null;
  for (const ch of text) {
    const font = list.find((f) => f.hasChar(ch));
    if (!font) throw new Error(`The font has no glyph for "${ch}" (U+${ch.codePointAt(0)!.toString(16)}) in: ${text}`);
    const glyph = font.charToGlyph(ch);
    const k = size / font.unitsPerEm;
    if (prev && prev.font === font) x += font.getKerningValue(prev.glyph, glyph) * k;
    const d = glyph.getPath(x, 0, size).toPathData({ decimalPlaces: 2, flipY: false });
    const adv = (glyph.advanceWidth ?? 0) * k;
    if (d) out.push({ d, x0: x, x1: x + adv });
    x += adv;
    prev = { font, glyph };
  }
  return { glyphs: out, width: x };
}

export function textWidth(text: string, size: number, weight: Weight = 400): number { return layoutGlyphs(text, size, weight).width; }

export interface TextOptions {
  size?: number;
  weight?: Weight;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Lines of more than one line: distance between the baselines, in units of the size. */
  lineHeight?: number;
  /** Position of a world point (labels of bodies): the text is at the projection of this point plus (x, y). */
  at?: Vec3 | ((t: number) => Vec3);
}

/**
 * Text in screen pixels. (x, y) is the baseline point of the first line at the anchor. Tracks: write (0 to 1 draws
 * the glyphs), x and y (move), color.
 */
export class Text extends Mob {
  write = num(1);
  x: Track<number>; y: Track<number>;
  fill: Track<string>;
  readonly width: number;
  readonly height: number;
  private readonly paths: SVGPathElement[] = [];
  private readonly inner: SVGGElement;
  private readonly at?: Vec3 | ((t: number) => Vec3);
  constructor(readonly content: string, x: number, y: number, o: TextOptions = {}) {
    super();
    const size = o.size ?? 36, weight = o.weight ?? 400, lh = (o.lineHeight ?? 1.3) * size;
    this.x = num(x); this.y = num(y); this.fill = color(o.color ?? '#e2e9f6');
    this.at = o.at;
    this.inner = svgEl('g', {}, this.el);
    const lines = content.split('\n');
    let maxW = 0;
    lines.forEach((line, i) => {
      const { glyphs, width } = layoutGlyphs(line, size, weight);
      maxW = Math.max(maxW, width);
      const shift = o.anchor === 'middle' ? -width / 2 : o.anchor === 'end' ? -width : 0;
      for (const g of glyphs) {
        const p = svgEl('path', { d: g.d, transform: `translate(${f2(shift)} ${f2(i * lh)})`, pathLength: 1 }, this.inner);
        this.paths.push(p);
      }
    });
    this.width = maxW;
    this.height = size + (lines.length - 1) * lh;
    this.inner.setAttribute('stroke-linejoin', 'round');
    this.strokeWidth = Math.max(0.8, size / 30);
  }
  private strokeWidth: number;
  draw(t: number, cam: Camera): void {
    let x = this.x.at(t), y = this.y.at(t);
    if (this.at) {
      const p = typeof this.at === 'function' ? this.at(t) : this.at;
      const [sx, sy] = cam.project(p);
      x += sx; y += sy;
    }
    this.inner.setAttribute('transform', `translate(${f2(x)} ${f2(y)})`);
    const c = this.fill.at(t);
    this.inner.setAttribute('fill', c);
    this.inner.setAttribute('stroke', c);
    writeGlyphs(this.paths, this.write.at(t), this.strokeWidth);
  }
  /** Write the text from t0: the glyphs draw from the first glyph to the last. */
  show(t0: number, duration = 1): this {
    this.opacity.set(1, t0);
    this.write.set(0, t0).to(1, t0, duration, (u) => u);
    return this;
  }
}

/**
 * The write animation for a list of glyph paths: each glyph has a window of the progress; in its window, the
 * outline draws (first 60 %) and the fill comes (last 50 %).
 */
export function writeGlyphs(paths: SVGElement[], progress: number, strokeWidth: number): void {
  const n = paths.length;
  if (!n) return;
  const p = clamp01(progress);
  if (p >= 1) {
    for (const el of paths) { el.setAttribute('stroke-width', '0'); el.removeAttribute('stroke-dasharray'); el.setAttribute('fill-opacity', '1'); }
    return;
  }
  const w = Math.min(1, Math.max(0.15, 3 / n));
  for (let k = 0; k < n; k++) {
    const start = n > 1 ? (k * (1 - w)) / (n - 1) : 0;
    const u = clamp01((p - start) / w);
    const el = paths[k];
    const drawn = clamp01(u / 0.6);
    const fill = clamp01((u - 0.5) / 0.5);
    el.setAttribute('stroke-dasharray', `${drawn.toFixed(4)} 1`);
    el.setAttribute('stroke-width', f2(strokeWidth * (1 - fill * 0.9)));
    el.setAttribute('fill-opacity', fill.toFixed(3));
    el.setAttribute('stroke-opacity', u > 0 ? '1' : '0');
  }
}

