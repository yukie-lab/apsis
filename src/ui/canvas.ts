/** Helpers for the 2D graphs (canvas). */
import { useEffect, useRef, type RefObject } from 'react';

export interface Surface { ctx: CanvasRenderingContext2D; w: number; h: number; dpr: number }

/**
 * A canvas that draws again when its size changes or when `deps` change. `draw` gets the size in CSS pixels;
 * the context is scaled for the pixel ratio of the screen.
 */
export function useCanvas(draw: (s: Surface) => void, deps: unknown[]): RefObject<HTMLCanvasElement | null> {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const fn = useRef(draw);
  fn.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(10, Math.round(rect.width)), h = Math.max(10, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      fn.current({ ctx, w, h, dpr });
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const ro = new ResizeObserver(request);
    ro.observe(canvas);
    request();
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

export const COLORS = {
  axis: '#33405e', grid: '#18203a', text: '#93a0b8', bright: '#e2e9f6', accent: '#ffb454', blue: '#78b7ff', good: '#5fd38d', bad: '#ff6b6b',
  legs: ['#ffb454', '#78b7ff', '#5fd38d', '#ff8fa3', '#c9a2ff', '#6fe3e1', '#ffd166'],
};
export const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

/** "Nice" tick values that cover [lo, hi] with about `count` steps. */
export function ticks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9 * span; v += step) out.push(Math.abs(v) < 1e-12 * span ? 0 : v);
  return out;
}

/** Colour map for a value 0..1 (dark blue, blue, green, yellow, orange): low values are the good ones. */
export function heat(x: number): [number, number, number] {
  const stops: [number, number, number][] = [[255, 214, 102], [255, 150, 70], [214, 84, 96], [130, 60, 140], [58, 46, 128], [22, 28, 68], [10, 13, 28]];
  const t = Math.min(1, Math.max(0, x)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/**
 * Contour lines of a grid (marching squares). Returns line segments in grid coordinates (x: 0..nx-1, y: 0..ny-1).
 * Cells with a value that is not finite have no lines.
 */
export function contourSegments(data: ArrayLike<number>, nx: number, ny: number, level: number): number[] {
  const seg: number[] = [];
  const v = (i: number, j: number) => data[j * nx + i];
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const code = (a > level ? 1 : 0) | (b > level ? 2 : 0) | (c > level ? 4 : 0) | (d > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const pts: [number, number][] = [];
      if ((a > level) !== (b > level)) pts.push([i + lerp(a, b), j]);
      if ((b > level) !== (c > level)) pts.push([i + 1, j + lerp(b, c)]);
      if ((d > level) !== (c > level)) pts.push([i + lerp(d, c), j + 1]);
      if ((a > level) !== (d > level)) pts.push([i, j + lerp(a, d)]);
      if (pts.length === 2) seg.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      else if (pts.length === 4) {
        // Saddle: connect the points by the mean value of the cell.
        const mid = (a + b + c + d) / 4 > level;
        const order = mid === a > level ? [0, 1, 2, 3] : [0, 3, 1, 2];
        seg.push(pts[order[0]][0], pts[order[0]][1], pts[order[1]][0], pts[order[1]][1], pts[order[2]][0], pts[order[2]][1], pts[order[3]][0], pts[order[3]][1]);
      }
    }
  }
  return seg;
}
