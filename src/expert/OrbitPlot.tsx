/** Top view of a plan: orbits of the bodies, the legs of the plan, the encounters. The view plane is the ecliptic. */
import { useMemo, useState } from 'react';
import type { Plan, PlanResult } from '../engine/plan';
import { centralMu } from '../engine/plan';
import { keplerPropagate, elementsFromState, period } from '../engine/kepler';
import { ICRF_TO_ECLIP } from '../engine/frames';
import { mulMV, type Vec3 } from '../engine/vec';
import { AU, BODIES } from '../engine/bodies';
import { DAY, formatEt } from '../engine/time';
import { system } from '../app/system';
import { useApp } from '../app/store';
import { t, bodyName } from '../i18n';
import { useCanvas, COLORS, FONT, ticks } from '../ui/canvas';
import { IconPlus, IconMinus } from '../ui/icons';

interface Geometry {
  orbits: { id: string; pts: Vec3[] }[];
  legs: { pts: Vec3[]; ok: boolean }[];
  nodes: { id: string; p: Vec3; et: number }[];
  dsm: Vec3[];
  extent: number;
}

const ecl = (v: Vec3): Vec3 => mulMV(ICRF_TO_ECLIP, v);

function geometry(plan: Plan, result: PlanResult): Geometry {
  const sys = system();
  const mu = centralMu(plan.central);
  let extent = 0;
  const grow = (p: Vec3) => { extent = Math.max(extent, Math.hypot(p[0], p[1])); return p; };
  const orbits: Geometry['orbits'] = [];
  for (const id of [...new Set(plan.nodes.map((n) => n.body))]) {
    const et = plan.nodes.find((n) => n.body === id)!.et;
    const cov = sys.coverage(id);
    const lo = Math.max(cov[0], sys.etStart), hi = Math.min(cov[1], sys.etEnd);
    if (!(et >= lo && et <= hi)) continue;
    const s = sys.stateRel(id, plan.central, et);
    const el = elementsFromState(s, mu + BODIES[id].gm);
    const P = el.e < 1 ? period(el.a, mu) : 0;
    const pts: Vec3[] = [];
    if (P > 0) {
      // One period from the ephemeris if the data has it, else the two-body orbit of the state.
      const useData = et - P / 2 >= lo && et + P / 2 <= hi;
      for (let k = 0; k <= 240; k++) {
        const dt = (k / 240 - 0.5) * P;
        pts.push(grow(ecl(useData ? sys.stateRel(id, plan.central, et + dt).r : keplerPropagate(s, dt, mu).r)));
      }
    }
    orbits.push({ id, pts });
  }
  const legs: Geometry['legs'] = [];
  const dsm: Vec3[] = [];
  for (const leg of result.legs) {
    const pts: Vec3[] = [];
    for (const arc of leg.arcs) {
      const n = 160;
      for (let k = 0; k <= n; k++) pts.push(grow(ecl(keplerPropagate(arc.state0, (arc.duration * k) / n, mu).r)));
    }
    if (leg.dsm) dsm.push(ecl(leg.dsm.r));
    legs.push({ pts, ok: leg.ok });
  }
  const nodes = result.nodes.map((n) => ({ id: n.body, p: grow(ecl(n.bodyState.r)), et: n.et }));
  return { orbits, legs, nodes, dsm, extent: extent || AU };
}

export function OrbitPlot({ plan, result, markEt }: { plan: Plan; result: PlanResult; markEt?: number }) {
  const scale = useApp((s) => s.settings.timeScale);
  const g = useMemo(() => geometry(plan, result), [plan, result]);
  // The view is always centred on the central body. zoom 1 shows all of the plan.
  const [zoom, setZoom] = useState(1);
  const ref = useCanvas(({ ctx, w, h }) => {
    const pad = 26;
    const R = (g.extent * 1.08) / zoom;
    const k = (Math.min(w, h) / 2 - pad) / R;
    const cx = w / 2, cy = h / 2;
    const X = (p: Vec3) => cx + p[0] * k, Y = (p: Vec3) => cy - p[1] * k;
    ctx.font = FONT;
    // distance rings
    const step = ticks(0, R / AU, 4)[1] ?? 1;
    ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.lineWidth = 1;
    const placed: [number, number, number, number][] = [];
    const rings: [string, number, number, number][] = [];
    for (let r = step; r * AU < R * 1.45; r += step) {
      ctx.beginPath(); ctx.arc(cx, cy, r * AU * k, 0, 2 * Math.PI); ctx.stroke();
      // The label of a ring shows only if all of it is in the plot.
      const text = `${+r.toFixed(3)} au`, lx = cx + r * AU * k * 0.7071 + 3, ly = cy + r * AU * k * 0.7071 + 11, tw = ctx.measureText(text).width;
      if (lx + tw < w - 2 && ly < h - 2) rings.push([text, lx, ly, tw]);
    }
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(Math.min(w - 8, cx + R * k), cy); ctx.stroke();
    ctx.fillText('+X', Math.min(w - 22, cx + R * k - 16), cy - 5);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, Math.max(8, cy - R * k)); ctx.stroke();
    ctx.fillText('+Y', cx + 5, Math.max(16, cy - R * k + 12));
    // central body
    ctx.fillStyle = BODIES[plan.central]?.color ?? '#ffd27a';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); ctx.fill();
    const line = (pts: Vec3[]) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p)))); ctx.stroke(); };
    for (const o of g.orbits) { ctx.strokeStyle = (BODIES[o.id]?.color ?? '#888') + '88'; ctx.lineWidth = 1; line(o.pts); }
    g.legs.forEach((leg, i) => { ctx.strokeStyle = leg.ok ? COLORS.legs[i % COLORS.legs.length] : COLORS.bad; ctx.lineWidth = 2; line(leg.pts); });
    ctx.fillStyle = COLORS.bright;
    for (const p of g.dsm) { ctx.beginPath(); ctx.moveTo(X(p), Y(p) - 5); ctx.lineTo(X(p) + 5, Y(p)); ctx.lineTo(X(p), Y(p) + 5); ctx.lineTo(X(p) - 5, Y(p)); ctx.closePath(); ctx.fill(); }
    g.nodes.forEach((n, i) => {
      ctx.fillStyle = BODIES[n.id]?.color ?? '#ccc';
      ctx.beginPath(); ctx.arc(X(n.p), Y(n.p), 4.5, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      const label = `${i + 1} ${bodyName(n.id)} ${formatEt(n.et, scale, 'day')}`;
      const tw = ctx.measureText(label).width;
      if (X(n.p) < -20 || X(n.p) > w + 20 || Y(n.p) < -20 || Y(n.p) > h + 20) return;
      const lx = X(n.p) + 8 + tw > w ? X(n.p) - 8 - tw : X(n.p) + 8;
      // A label that would cover an earlier label moves down.
      let ly = Math.max(12, Y(n.p) - 6);
      for (let k = 0; k < 8 && placed.some(([x0, y0, x1, y1]) => lx < x1 && lx + tw > x0 && ly - 11 < y1 && ly + 4 > y0); k++) ly += 15;
      placed.push([lx - 3, ly - 11, lx + tw + 3, ly + 4]);
      ctx.fillStyle = 'rgba(5,7,12,0.92)'; ctx.fillRect(lx - 3, ly - 11, tw + 6, 15);
      ctx.fillStyle = COLORS.bright;
      ctx.fillText(label, lx, ly);
    });
    // The label of a ring shows only where no label of an encounter is.
    ctx.fillStyle = COLORS.text;
    for (const [text, lx, ly, tw] of rings) {
      if (!placed.some(([x0, y0, x1, y1]) => lx < x1 && lx + tw > x0 && ly - 11 < y1 && ly + 3 > y0)) ctx.fillText(text, lx, ly);
    }
    if (markEt !== undefined) {
      const mu = centralMu(plan.central);
      for (const leg of result.legs) for (const arc of leg.arcs) {
        if (markEt >= arc.et0 && markEt <= arc.et0 + arc.duration) {
          const p = ecl(keplerPropagate(arc.state0, markEt - arc.et0, mu).r);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(X(p), Y(p), 6, 0, 2 * Math.PI); ctx.stroke();
        }
      }
    }
  }, [g, scale, markEt, zoom]);
  const days = (result.tof / DAY).toFixed(0);
  return (
    <figure className="plot">
      <div className="plotwrap">
        <canvas ref={ref} className="square" role="img" aria-label={t('plot.orbit.label', { days })} />
        <span className="plotzoom">
          <button type="button" className="btn small" disabled={zoom <= 1} title={t('plot.zoomOut')} aria-label={t('plot.zoomOut')} onClick={() => setZoom((z) => Math.max(1, z / 1.8))}><IconMinus /></button>
          <button type="button" className="btn small" disabled={zoom >= 60} title={t('plot.zoomIn')} aria-label={t('plot.zoomIn')} onClick={() => setZoom((z) => Math.min(60, z * 1.8))}><IconPlus /></button>
        </span>
      </div>
      <figcaption className="note">{t('plot.orbit.caption', { scale })}</figcaption>
    </figure>
  );
}
