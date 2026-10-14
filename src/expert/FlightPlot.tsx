/**
 * Top view of a flight: the trajectory of the spacecraft relative to the center of the settings, the paths of the
 * bodies in the same time, the maneuvers and the closest approaches. The view plane is the X-Y plane of the frame
 * of the settings.
 */
import { useMemo, useState } from 'react';
import type { Trajectory } from '../engine/propagate';
import type { EphemerisTable } from '../engine/io/types';
import { fromIcrf, toIcrf } from '../engine/frames';
import { type Vec3, sub } from '../engine/vec';
import { AU, BODIES, PLANET_IDS } from '../engine/bodies';
import { formatEt } from '../engine/time';
import { system } from '../app/system';
import { useApp } from '../app/store';
import { t, bodyName, bodyIn } from '../i18n';
import { useCanvas, COLORS, FONT, ticks } from '../ui/canvas';
import { IconPlus, IconMinus } from '../ui/icons';
import { fixed } from '../app/format';
import type { FrameId } from '../engine/frames';

interface Geometry {
  path: Vec3[][];
  bodies: { id: string; pts: Vec3[] }[];
  marks: { kind: 'maneuver' | 'approach' | 'start' | 'end'; p: Vec3; et: number; body?: string }[];
  reference: Vec3[][];
  extent: number;
}

/** Position of a body relative to the center, in the axes of the frame. null: no data at this time. */
function bodyAt(id: string, center: string, et: number, frame: FrameId): Vec3 | null {
  const sys = system();
  const [lo, hi] = sys.coverage(id);
  if (!(et >= Math.max(lo, sys.etStart) && et <= Math.min(hi, sys.etEnd))) return null;
  return fromIcrf(sys.stateRel(id, center, et).r, frame);
}

function geometry(tr: Trajectory, center: string, frame: FrameId, reference: EphemerisTable | null): Geometry {
  const sys = system();
  const centerAt = (et: number): Vec3 => (center === 'SSB' ? [0, 0, 0] : sys.state(center, et).r);
  const rel = (r: Vec3, et: number): Vec3 => fromIcrf(sub(r, centerAt(et)), frame);
  let extent = 0;
  const grow = (p: Vec3) => { extent = Math.max(extent, Math.hypot(p[0], p[1])); return p; };
  // The samples of the integrator are near to each other where the path bends: use them, with 3 points between.
  const n = tr.t.length;
  const stride = Math.max(1, Math.ceil(n / 6000));
  const path: Vec3[][] = [];
  const starts = [...tr.segStarts, n];
  for (let s = 0; s < starts.length - 1; s++) {
    const pts: Vec3[] = [];
    const a = starts[s], b = starts[s + 1] - 1;
    for (let i = a; i <= b; i += stride) {
      const t0 = tr.t[i];
      pts.push(grow(rel([tr.y[6 * i], tr.y[6 * i + 1], tr.y[6 * i + 2]], t0)));
      const j = Math.min(b, i + stride);
      if (j > i && stride === 1) for (let k = 1; k < 4; k++) { const tt = t0 + ((tr.t[j] - t0) * k) / 4; pts.push(grow(rel(tr.stateAt(tt).r, tt))); }
    }
    if (b > a) pts.push(grow(rel([tr.y[6 * b], tr.y[6 * b + 1], tr.y[6 * b + 2]], tr.t[b])));
    if (pts.length > 1) path.push(pts);
  }
  const marks: Geometry['marks'] = [];
  for (const e of tr.events) {
    const kind = e.type === 'maneuver' ? 'maneuver' : e.type === 'periapsis' || e.type === 'impact' ? 'approach' : e.type;
    marks.push({ kind, p: rel(e.state.r, e.et), et: e.et, body: e.body });
  }
  // Paths of the bodies in the time of the flight. A body far outside the view of the flight is not drawn.
  const span = Math.abs(tr.et1 - tr.et0);
  const lo = Math.min(tr.et0, tr.et1);
  const ids = [...new Set<string>([...PLANET_IDS, ...tr.events.map((e) => e.body).filter((b): b is string => !!b), ...(center !== 'SSB' && center !== 'SUN' ? ['SUN'] : [])])].filter((id) => id !== center && BODIES[id]);
  const bodies: Geometry['bodies'] = [];
  for (const id of ids) {
    const count = 360;
    const pts: Vec3[] = [];
    let far = 0;
    for (let k = 0; k <= count; k++) {
      const p = bodyAt(id, center, lo + (span * k) / count, frame);
      if (p) { pts.push(p); far = Math.max(far, Math.hypot(p[0], p[1])); }
    }
    const near = pts.reduce((m, p) => Math.min(m, Math.hypot(p[0], p[1])), Infinity);
    if (pts.length > 1 && near < 1.8 * extent && far < 40 * extent) bodies.push({ id, pts });
  }
  const refPath: Vec3[][] = [];
  if (reference) {
    const cuts = [...(reference.segmentStarts ?? [0]), reference.et.length];
    const refCenter = (et: number): Vec3 => (reference.center === 'SSB' ? [0, 0, 0] : sys.state(reference.center, et).r);
    for (let s = 0; s < cuts.length - 1; s++) {
      const pts: Vec3[] = [];
      const step = Math.max(1, Math.ceil((cuts[s + 1] - cuts[s]) / 4000));
      for (let i = cuts[s]; i < cuts[s + 1]; i += step) {
        const et = reference.et[i];
        if (et < sys.etStart || et > sys.etEnd) continue;
        // The table is relative to its own center, in the axes of its own frame.
        const r = toIcrf(reference.states[i].r, reference.frame);
        const c = refCenter(et);
        pts.push(grow(rel([r[0] + c[0], r[1] + c[1], r[2] + c[2]], et)));
      }
      if (pts.length > 1) refPath.push(pts);
    }
  }
  return { path, bodies, marks, reference: refPath, extent: extent || AU };
}

export function FlightPlot({ trajectory, markEt, reference = null }: { trajectory: Trajectory; markEt?: number; reference?: EphemerisTable | null }) {
  const settings = useApp((s) => s.settings);
  const { center, frame, timeScale } = settings;
  const g = useMemo(() => geometry(trajectory, center, frame, reference), [trajectory, center, frame, reference]);
  const [zoom, setZoom] = useState(1);
  const ref = useCanvas(({ ctx, w, h }) => {
    const pad = 26;
    const R = (g.extent * 1.1) / zoom;
    const k = (Math.min(w, h) / 2 - pad) / R;
    const cx = w / 2, cy = h / 2;
    const X = (p: Vec3) => cx + p[0] * k, Y = (p: Vec3) => cy - p[1] * k;
    ctx.font = FONT;
    // distance rings: au for a wide view, km for a view near a body
    const useAu = R > 0.05 * AU;
    const unit = useAu ? AU : 1;
    const step = ticks(0, R / unit, 4)[1] ?? 1;
    ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.lineWidth = 1;
    const rings: [string, number, number, number][] = [];
    for (let r = step; r * unit < R * 1.45; r += step) {
      // The disk of the center body is above a ring that is in the body: this ring has no label.
      if (r * unit <= (BODIES[center]?.radius ?? 0)) continue;
      ctx.beginPath(); ctx.arc(cx, cy, r * unit * k, 0, 2 * Math.PI); ctx.stroke();
      const text = useAu ? `${+r.toFixed(3)} au` : `${fixed(r, 0)} km`;
      const ly = cy + r * unit * k * 0.7071 + 11, tw = ctx.measureText(text).width;
      if (ly < h - 2) rings.push([text, Math.min(w - tw - 4, cx + r * unit * k * 0.7071 + 3), ly, tw]);
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(Math.min(w - 8, cx + R * k), cy); ctx.stroke();
    ctx.fillText('+X', Math.min(w - 22, cx + R * k - 16), cy - 5);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, Math.max(8, cy - R * k)); ctx.stroke();
    ctx.fillText('+Y', cx + 5, Math.max(16, cy - R * k + 12));
    // center
    const cb = BODIES[center];
    ctx.fillStyle = cb?.color ?? '#9fb4c8';
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(3.5, (cb?.radius ?? 0) * k), 0, 2 * Math.PI); ctx.fill();
    const line = (pts: Vec3[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)))); ctx.stroke(); };
    for (const b of g.bodies) { ctx.strokeStyle = (BODIES[b.id]?.color ?? '#888') + '88'; ctx.lineWidth = 1; line(b.pts); }
    if (g.reference.length) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = COLORS.good; ctx.lineWidth = 1.5;
      g.reference.forEach(line);
      ctx.restore();
    }
    g.path.forEach((pts, i) => { ctx.strokeStyle = COLORS.legs[i % COLORS.legs.length]; ctx.lineWidth = 2; line(pts); });
    const placed: [number, number, number, number][] = [];
    const label = (p: Vec3, text: string) => {
      const tw = ctx.measureText(text).width;
      if (X(p) < -20 || X(p) > w + 20 || Y(p) < -20 || Y(p) > h + 20) return;
      const lx = X(p) + 8 + tw > w ? X(p) - 8 - tw : X(p) + 8;
      let ly = Math.max(12, Y(p) - 6);
      for (let j = 0; j < 8 && placed.some(([x0, y0, x1, y1]) => lx < x1 && lx + tw > x0 && ly - 11 < y1 && ly + 4 > y0); j++) ly += 15;
      placed.push([lx - 3, ly - 11, lx + tw + 3, ly + 4]);
      ctx.fillStyle = 'rgba(5,7,12,0.92)'; ctx.fillRect(lx - 3, ly - 11, tw + 6, 15);
      ctx.fillStyle = COLORS.bright;
      ctx.fillText(text, lx, ly);
    };
    const labeled: { body: string; x: number; y: number }[] = [];
    for (const m of g.marks) {
      if (m.kind === 'maneuver') {
        ctx.fillStyle = COLORS.bright;
        ctx.beginPath(); ctx.moveTo(X(m.p), Y(m.p) - 5); ctx.lineTo(X(m.p) + 5, Y(m.p)); ctx.lineTo(X(m.p), Y(m.p) + 5); ctx.lineTo(X(m.p) - 5, Y(m.p)); ctx.closePath(); ctx.fill();
      } else if (m.kind === 'approach') {
        ctx.fillStyle = BODIES[m.body ?? '']?.color ?? '#ccc';
        ctx.beginPath(); ctx.arc(X(m.p), Y(m.p), 4.5, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
        // An orbit about a body has a closest approach in each revolution, at almost the same point: only the
        // first one of these has a label.
        const body = m.body ?? '';
        if (labeled.length < 12 && !labeled.some((q) => q.body === body && Math.hypot(q.x - X(m.p), q.y - Y(m.p)) < 40)) {
          labeled.push({ body, x: X(m.p), y: Y(m.p) });
          label(m.p, `${bodyName(body)} ${formatEt(m.et, timeScale, 'day')}`);
        }
      } else if (m.kind === 'start') {
        ctx.strokeStyle = COLORS.bright; ctx.lineWidth = 1.5;
        ctx.strokeRect(X(m.p) - 4, Y(m.p) - 4, 8, 8);
        label(m.p, `${t('page.mission.event.start')} ${formatEt(m.et, timeScale, 'day')}`);
      }
    }
    // The label of a ring shows only where no label of an event is.
    ctx.fillStyle = COLORS.text;
    for (const [text, lx, ly, tw] of rings) {
      if (!placed.some(([x0, y0, x1, y1]) => lx < x1 && lx + tw > x0 && ly - 11 < y1 && ly + 3 > y0)) ctx.fillText(text, lx, ly);
    }
    if (markEt !== undefined && markEt >= Math.min(trajectory.et0, trajectory.et1) && markEt <= Math.max(trajectory.et0, trajectory.et1)) {
      // The bodies and the spacecraft at the time of the view.
      for (const b of g.bodies) {
        const p = bodyAt(b.id, center, markEt, frame);
        if (!p) continue;
        ctx.fillStyle = BODIES[b.id]?.color ?? '#ccc';
        ctx.beginPath(); ctx.arc(X(p), Y(p), 3, 0, 2 * Math.PI); ctx.fill();
      }
      const c = center === 'SSB' ? ([0, 0, 0] as Vec3) : system().state(center, markEt).r;
      const p = fromIcrf(sub(trajectory.stateAt(markEt).r, c), frame);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(p), Y(p), 6, 0, 2 * Math.PI); ctx.stroke();
    }
  }, [g, timeScale, markEt, zoom, center, frame, trajectory]);
  return (
    <figure className="plot">
      <div className="plotwrap">
        <canvas ref={ref} className="square" role="img" aria-label={t('plot.flight.label', { center: bodyIn(center) })} />
        <span className="plotzoom">
          <button type="button" className="btn small" disabled={zoom <= 1} title={t('plot.zoomOut')} aria-label={t('plot.zoomOut')} onClick={() => setZoom((z) => Math.max(1, z / 1.8))}><IconMinus /></button>
          <button type="button" className="btn small" disabled={zoom >= 20000} title={t('plot.zoomIn')} aria-label={t('plot.zoomIn')} onClick={() => setZoom((z) => Math.min(20000, z * 1.8))}><IconPlus /></button>
        </span>
      </div>
      <figcaption className="note">
        {t('plot.flight.caption', { center: bodyIn(center), frame: t('frameLong.' + frame), scale: timeScale })}
        {g.reference.length > 0 && <> {t('plot.flight.reference')}</>}
      </figcaption>
    </figure>
  );
}
