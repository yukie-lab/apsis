/**
 * Tisserand graph of a plan: for each planet of the plan, curves of constant speed at infinity in the plane of the
 * periapsis radius and the apoapsis radius of the orbit about the Sun. A flyby with no engine burn moves the orbit
 * of the spacecraft along a curve of that planet. The points are the orbits of the legs of the plan.
 */
import { useMemo } from 'react';
import type { Plan, PlanResult } from '../engine/plan';
import { centralMu } from '../engine/plan';
import { elementsFromState, apsides } from '../engine/kepler';
import { tisserandCurve, tisserandPoint } from '../engine/tisserand';
import { AU, BODIES } from '../engine/bodies';
import { norm } from '../engine/vec';
import { t, bodyName } from '../i18n';
import { useCanvas, COLORS, FONT } from '../ui/canvas';
import { fixed } from '../app/format';

const SPEEDS = [1, 3, 5, 7, 9, 11, 13, 15];

interface Model {
  planets: { id: string; R: number; actual: number[] }[];
  legs: { rp: number; ra: number; label: string }[];
  x: [number, number];
  y: [number, number];
}

function model(plan: Plan, result: PlanResult): Model | null {
  if (plan.central !== 'SUN') return null;
  const mu = centralMu(plan.central);
  const planets: Model['planets'] = [];
  result.nodes.forEach((n) => {
    const b = BODIES[n.body];
    if (!b || !(b.gm > 0) || b.parent !== 'SUN') return;
    let p = planets.find((x) => x.id === n.body);
    if (!p) {
      const el = elementsFromState(n.bodyState, mu + b.gm);
      p = { id: n.body, R: el.a, actual: [] };
      planets.push(p);
    }
    for (const v of [n.vinfIn, n.vinfOut]) if (v) p.actual.push(norm(v));
  });
  if (planets.length === 0) return null;
  const legs: Model['legs'] = [];
  result.legs.forEach((leg, i) => {
    if (!leg.ok) return;
    leg.arcs.forEach((arc, k) => {
      const ap = apsides(elementsFromState(arc.state0, mu));
      legs.push({ rp: ap.rp, ra: ap.ra, label: leg.arcs.length > 1 ? `${i + 1}${k === 0 ? 'a' : 'b'}` : String(i + 1) });
    });
  });
  const radii = planets.map((p) => p.R);
  const finite = legs.filter((l) => Number.isFinite(l.ra));
  const lo = Math.min(...radii, ...legs.map((l) => l.rp)), hi = Math.max(...radii, ...finite.map((l) => l.ra));
  return { planets, legs, x: [lo * 0.55, Math.max(...radii) * 1.08], y: [Math.min(...radii) * 0.9, hi * 2.2] };
}

export function TisserandPlot({ plan, result }: { plan: Plan; result: PlanResult }) {
  const m = useMemo(() => model(plan, result), [plan, result]);
  const ref = useCanvas(({ ctx, w, h }) => {
    if (!m) return;
    const M = { l: 58, r: 16, t: 12, b: 40 };
    const W = w - M.l - M.r, H = h - M.t - M.b;
    const lx = (v: number) => Math.log(v), X = (rp: number) => M.l + ((lx(rp) - lx(m.x[0])) / (lx(m.x[1]) - lx(m.x[0]))) * W;
    const Y = (ra: number) => M.t + H - ((lx(ra) - lx(m.y[0])) / (lx(m.y[1]) - lx(m.y[0]))) * H;
    ctx.font = FONT;
    ctx.fillStyle = '#070a12'; ctx.fillRect(M.l, M.t, W, H);
    // grid: 1, 2, 5 steps of each decade (au)
    const grid = (lo: number, hi: number) => { const out: number[] = []; for (let k = -2; k < 3; k++) for (const b of [1, 2, 3, 5, 7]) { const v = +(b * 10 ** k).toPrecision(3); if (v * AU >= lo && v * AU <= hi) out.push(v); } return out; };
    ctx.strokeStyle = COLORS.grid; ctx.fillStyle = COLORS.text; ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    for (const v of grid(m.x[0], m.x[1])) { const x = X(v * AU); ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + H); ctx.stroke(); ctx.fillText(String(v), x, M.t + H + 15); }
    ctx.textAlign = 'right';
    for (const v of grid(m.y[0], m.y[1])) { const y = Y(v * AU); ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + W, y); ctx.stroke(); ctx.fillText(String(v), M.l - 6, y + 4); }
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, W, H); ctx.clip();
    // The orbit must have periapsis <= apoapsis: the area below the diagonal is not possible.
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath(); ctx.moveTo(X(m.x[0]), Y(m.x[0])); ctx.lineTo(X(m.x[1]), Y(m.x[1])); ctx.lineTo(X(m.x[1]), M.t + H + 50); ctx.lineTo(X(m.x[0]), M.t + H + 50); ctx.closePath(); ctx.fill();
    for (const p of m.planets) {
      const color = BODIES[p.id].color;
      const curve = (v: number, width: number, alpha: string, label: boolean) => {
        const pts = tisserandCurve(p.R, v, 181).filter((q) => Number.isFinite(q.ra));
        if (pts.length < 2) return;
        ctx.strokeStyle = color + alpha; ctx.lineWidth = width;
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(X(q.rp), Y(q.ra)) : ctx.moveTo(X(q.rp), Y(q.ra)))); ctx.stroke();
        if (label) {
          // Label at the point with the pump angle 90 degrees: the labels of one planet then make a line away from the planet.
          const q = tisserandPoint(p.R, v, Math.PI / 2);
          if (Number.isFinite(q.ra) && q.rp > m.x[0] * 1.04 && q.ra < m.y[1] * 0.96) {
            const text = String(v);
            const tw = ctx.measureText(text).width + 4;
            ctx.fillStyle = 'rgba(7,10,18,0.85)'; ctx.fillRect(X(q.rp) - tw / 2, Y(q.ra) - 7, tw, 13);
            ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, X(q.rp), Y(q.ra) + 4);
          }
        }
      };
      for (const v of SPEEDS) curve(v, 1, '70', true);
      for (const v of new Set(p.actual.map((x) => +x.toFixed(2)))) curve(v, 2.5, 'ff', false);
      // the planet: a circular orbit has periapsis = apoapsis = R
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(p.R), Y(p.R), 5, 0, 2 * Math.PI); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillText(bodyName(p.id), X(p.R) - 8, Y(p.R) + 15);
    }
    // orbits of the legs, in the order of the flight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath();
    m.legs.forEach((l, i) => { const x = X(l.rp), y = Y(Math.min(l.ra, m.y[1] * 0.97)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
    m.legs.forEach((l) => {
      const open = !Number.isFinite(l.ra);
      const x = X(l.rp), y = Y(Math.min(l.ra, m.y[1] * 0.97));
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (open) { ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x - 6, y + 4); ctx.closePath(); } else ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
      ctx.stroke(); ctx.fill();
      ctx.textAlign = 'left';
      ctx.lineWidth = 3; ctx.strokeText(l.label, x + 8, y + 4); ctx.fillText(l.label, x + 8, y + 4);
    });
    ctx.restore();
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1; ctx.strokeRect(M.l + 0.5, M.t + 0.5, W, H);
    ctx.fillStyle = COLORS.bright; ctx.textAlign = 'center';
    ctx.fillText(t('plot.tisserand.x'), M.l + W / 2, M.t + H + 32);
    ctx.save(); ctx.translate(13, M.t + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t('plot.tisserand.y'), 0, 0); ctx.restore();
  }, [m]);
  if (!m) return null;
  const speeds = m.planets.filter((p) => p.actual.length > 0).map((p) => `${bodyName(p.id)} ${[...new Set(p.actual.map((v) => fixed(v, 2)))].join(', ')}`).join('; ');
  return (
    <figure className="plot">
      <canvas ref={ref} className="tiss" role="img" aria-label={t('plot.tisserand.label')} />
      <figcaption className="note">{t('plot.tisserand.caption', { speeds })}</figcaption>
    </figure>
  );
}
