/** Graph of position differences with time: one line for each comparison flight, on a logarithmic scale. */
import { useCanvas, COLORS, FONT, ticks } from '../ui/canvas';
import { t } from '../i18n';
import { DAY } from '../engine/time';

export interface DiffSeries { id: string; color: string; log: Float32Array }

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** Text of a power of 10 in kilometres. */
function power(n: number): string {
  if (n === 0) return '1';
  if (n === 1) return '10';
  return '10' + [...String(n)].map((c) => SUPER[c] ?? c).join('');
}

export function DiffChart({ times, series, marks, markEt }: {
  times: Float64Array; series: DiffSeries[]; marks: { et: number; text: string }[]; markEt?: number;
}) {
  const ref = useCanvas(({ ctx, w, h }) => {
    const M = { l: 58, r: 14, t: 20, b: 38 };
    const t0 = times[0], t1 = times[times.length - 1];
    if (!(t1 > t0)) return;
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const v of s.log) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!(hi > -Infinity)) { lo = -3; hi = 3; }
    // The scale starts at 1 mm or above: smaller differences are at the bottom line.
    lo = Math.max(-6, Math.floor(lo));
    hi = Math.max(lo + 2, Math.ceil(hi));
    const X = (et: number) => M.l + ((et - t0) / (t1 - t0)) * (w - M.l - M.r);
    const Y = (v: number) => h - M.b - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (h - M.t - M.b);
    ctx.font = FONT;
    ctx.lineWidth = 1;
    const every = hi - lo > 10 ? 2 : 1;
    for (let n = lo; n <= hi; n += every) {
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(M.l, Y(n)); ctx.lineTo(w - M.r, Y(n)); ctx.stroke();
      ctx.fillStyle = COLORS.text; ctx.textAlign = 'right';
      ctx.fillText(power(n), M.l - 6, Y(n) + 4);
    }
    const days = (t1 - t0) / DAY;
    ctx.textAlign = 'center';
    for (const d of ticks(0, days, Math.max(3, Math.floor((w - M.l - M.r) / 90)))) {
      const x = X(t0 + d * DAY);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, h - M.b); ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(String(+d.toPrecision(6)), x, h - M.b + 14);
    }
    ctx.fillText(t('plot.diff.axisX'), (M.l + w - M.r) / 2, h - 6);
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(M.l, M.t, w - M.l - M.r, h - M.t - M.b);
    // events of the flight
    let lastRight = -Infinity;
    ctx.textAlign = 'left';
    for (const m of marks) {
      if (!(m.et > t0 && m.et < t1)) continue;
      const x = X(m.et);
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = COLORS.axis;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, h - M.b); ctx.stroke();
      ctx.restore();
      if (!m.text) continue;
      const tw = ctx.measureText(m.text).width;
      const left = Math.min(x + 3, w - M.r - tw);
      if (left > lastRight + 6) {
        ctx.fillStyle = COLORS.text;
        ctx.fillText(m.text, left, M.t - 6);
        lastRight = left + tw;
      }
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, w - M.l - M.r, h - M.t - M.b); ctx.clip();
    for (const s of [...series].reverse()) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.6;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < times.length; k++) {
        const v = s.log[k];
        if (!Number.isFinite(v)) { pen = false; continue; }
        if (pen) ctx.lineTo(X(times[k]), Y(v)); else ctx.moveTo(X(times[k]), Y(v));
        pen = true;
      }
      ctx.stroke();
    }
    if (markEt !== undefined && markEt >= t0 && markEt <= t1) {
      ctx.strokeStyle = COLORS.bright; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(markEt), M.t); ctx.lineTo(X(markEt), h - M.b); ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = 'left';
  }, [times, series, marks, markEt]);
  return (
    <figure className="plot">
      <canvas ref={ref} className="wide" role="img" aria-label={t('plot.diff.label')} />
      <figcaption className="note">{t('plot.diff.axisY')}</figcaption>
    </figure>
  );
}
