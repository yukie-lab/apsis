/**
 * Formulas: MathJax converts TeX to SVG paths on the development server (/__tex). Parts of a formula can have a
 * name with \class{name}{...}: part(name) then gives the SVG groups of that part (for a color change).
 */
import { Mob, Camera, num, color, svgEl, f2, Track } from './core';
import { writeGlyphs } from './text';

export interface TexOptions { size?: number; color?: string; anchor?: 'start' | 'middle' | 'end'; display?: boolean }

export class Tex extends Mob {
  write = num(1);
  x: Track<number>; y: Track<number>;
  fill: Track<string>;
  width = 0; height = 0;
  private readonly inner: SVGGElement;
  private paths: SVGElement[] = [];
  private rects: SVGElement[] = [];
  private k = 1;
  private shift = 0;
  private readonly partColors: { els: SVGElement[]; color: Track<string> }[] = [];
  private constructor(x: number, y: number, o: TexOptions) {
    super();
    this.x = num(x); this.y = num(y); this.fill = color(o.color ?? '#e2e9f6');
    this.inner = svgEl('g', {}, this.el);
  }

  static async make(src: string, x: number, y: number, o: TexOptions = {}): Promise<Tex> {
    const m = new Tex(x, y, o);
    const res = await fetch(`/__tex?display=${o.display === false ? 0 : 1}&src=${encodeURIComponent(src)}`);
    if (!res.ok) throw new Error(`TeX error for ${src}: ${await res.text()}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
    const svg = doc.documentElement;
    const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '0 0 1000 1000').split(/\s+/).map(Number);
    const size = o.size ?? 44;
    // MathJax units: 1000 units for 1 em.
    m.k = size / 1000;
    m.width = vw * m.k; m.height = vh * m.k;
    m.shift = o.anchor === 'start' ? 0 : o.anchor === 'end' ? -m.width : -m.width / 2;
    // The origin of the group is the left end of the baseline (MathJax: y = 0 at the baseline).
    const g = svgEl('g', { transform: `scale(${m.k}) translate(${-vx} 0)` }, m.inner);
    for (const child of Array.from(svg.childNodes)) g.appendChild(document.importNode(child, true));
    void vy; void vh;
    m.paths = Array.from(g.querySelectorAll('path'));
    m.rects = Array.from(g.querySelectorAll('rect'));
    for (const p of m.paths) p.setAttribute('pathLength', '1');
    return m;
  }

  /** SVG groups of the parts with \class{name}{...}. */
  part(name: string): SVGElement[] { return Array.from(this.inner.querySelectorAll(`.${CSS.escape(name)}`)) as SVGElement[]; }
  /** A color track for a named part. */
  partColor(name: string, initial: string): Track<string> {
    const tr = color(initial);
    this.partColors.push({ els: this.part(name), color: tr });
    return tr;
  }

  draw(t: number, _cam: Camera): void {
    this.inner.setAttribute('transform', `translate(${f2(this.x.at(t) + this.shift)} ${f2(this.y.at(t))})`);
    this.inner.setAttribute('color', this.fill.at(t));
    for (const pc of this.partColors) { const c = pc.color.at(t); for (const el of pc.els) el.setAttribute('color', c); }
    const w = this.write.at(t);
    // The stroke width is in MathJax units (1000 for 1 em): 1.3 screen pixels.
    writeGlyphs(this.paths, w, 1.3 / this.k);
    for (const r of this.rects) r.setAttribute('fill-opacity', Math.min(1, Math.max(0, (w - 0.3) / 0.5)).toFixed(3));
  }

  show(t0: number, duration = 1.2): this {
    this.opacity.set(1, t0);
    this.write.set(0, t0).to(1, t0, duration, (u) => u);
    return this;
  }
}
