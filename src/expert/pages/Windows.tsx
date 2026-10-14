/** Launch windows screen: a map of the departure date and the arrival date (porkchop plot). */
import { useEffect, useMemo, useState } from 'react';
import { useApp, nowEt } from '../../app/store';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { measurement } from '../../app/provenance';
import { t, bodyName, craftName } from '../../i18n';
import type { PorkchopRequest, PorkchopData } from '../../engine/planopt';
import { synodicPeriod, hohmannTof } from '../../engine/planopt';
import { FAMOUS, famousFacts, newMission } from '../../engine/mission';
import type { Plan } from '../../engine/plan';
import { defaultLeg } from '../../engine/plan';
import { DAY, YEAR, tdb, jdTdbToEt, etToCalendar, calendarToEt, formatEt, type TimeScale } from '../../engine/time';
import { c3, speed, deltaV, angleDeg, duration, fixed, sig, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { BodySelect, DateInput, Field, NumberInput, Panel, Select, Check, Seg } from '../../ui/controls';
import { confirm } from '../../ui/Confirm';
import { useCanvas, COLORS, FONT, ticks, heat, contourSegments } from '../../ui/canvas';
import { PageHead, Dt } from '../common';
import { useDrafts, type WindowQuantity } from '../drafts';
import { ArrivalInputs, defaultArrival, solarBody } from '../planParts';

const QUANTITIES: WindowQuantity[] = ['c3', 'dvTotal', 'vinfArr', 'dvDep'];
const UNIT: Record<WindowQuantity, string> = { c3: 'km²/s²', dvTotal: 'km/s', vinfArr: 'km/s', dvDep: 'km/s' };
const field = (d: PorkchopData, q: WindowQuantity): Float32Array => (q === 'c3' ? d.c3 : q === 'vinfArr' ? d.vinfArr : q === 'dvDep' ? d.dvDep : d.dvTotal);

/** Actual missions with a direct first leg from the Earth: body and dates of the first leg. */
function examples(): { id: string; name: string; to: string; dep: number; arr: number }[] {
  const out = [];
  for (const f of FAMOUS) {
    const facts = famousFacts(f.id);
    const first = facts.encounters[0];
    if (!first || first.body === 'EARTH' || facts.dsm?.some((d) => d.jdTdb < first.jdTdb)) continue;
    out.push({ id: f.id, name: craftName(f.id, f.name), to: first.body, dep: tdb(facts.startTdb), arr: jdTdbToEt(first.jdTdb) });
  }
  return out;
}

/** Date ranges for a map that starts at `start`: one synodic period of departure dates (not more than 12 years). */
function autoRanges(from: string, to: string, start: number): { dep: [number, number]; arr: [number, number] } | null {
  const sys = system();
  const cov = [from, to].map((id) => sys.coverage(id));
  const lo = Math.max(sys.etStart, cov[0][0], cov[1][0]) + DAY, hi = Math.min(sys.etEnd, cov[0][1], cov[1][1]) - DAY;
  const t0 = Math.min(Math.max(start, lo), hi - 60 * DAY);
  let syn = 2 * YEAR, hoh = 200 * DAY;
  try { syn = Math.min(12 * YEAR, synodicPeriod(sys, 'SUN', from, to, t0)); hoh = hohmannTof(sys, 'SUN', from, to, t0); } catch { /* defaults */ }
  const dep: [number, number] = [t0, Math.min(t0 + 1.15 * syn, hi - 0.4 * hoh)];
  const arr: [number, number] = [t0 + 0.4 * hoh, Math.min(hi, dep[1] + 1.9 * hoh)];
  return dep[1] > dep[0] + DAY && arr[1] > arr[0] + DAY ? { dep, arr } : null;
}

function defaultRequest(): PorkchopRequest {
  const r = autoRanges('EARTH', 'MARS', nowEt())!;
  return { central: 'SUN', from: 'EARTH', to: 'MARS', dep: r.dep, arr: r.arr, nx: 96, ny: 96, parkingAltitude: 200, arrival: defaultArrival('MARS', 'flyby'), bothDirections: false };
}

/** Contour values: "nice" numbers above the minimum. */
function contourLevels(min: number, cap: number): number[] {
  const out: number[] = [];
  const base = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  for (let k = Math.floor(Math.log10(min)) - 1; k < 8; k++) for (const b of base) { const v = b * 10 ** k; if (v > min * 1.015 && v <= cap) out.push(+v.toPrecision(3)); }
  while (out.length > 9) for (let i = out.length - 2; i > 0; i -= 2) out.splice(i, 1);
  return out;
}

/** Ticks at the start of months or years. */
function dateTicks(et0: number, et1: number, scale: TimeScale, maxCount = 7): { et: number; label: string }[] {
  const months = (et1 - et0) / (30.44 * DAY);
  const step = [1, 2, 3, 6, 12, 24, 60, 120].find((s) => months / s <= Math.max(2, maxCount)) ?? 240;
  const c0 = etToCalendar(et0, scale);
  const out = [];
  let index = c0.year * 12 + (c0.month - 1);
  index = Math.ceil(index / step) * step;
  for (; ; index += step) {
    const year = Math.floor(index / 12), month = (index % 12) + 1;
    const et = calendarToEt({ year, month, day: 1, hour: 0, minute: 0, second: 0 }, scale);
    if (et > et1) break;
    if (et >= et0) out.push({ et, label: step >= 12 ? String(year) : `${year}-${String(month).padStart(2, '0')}` });
  }
  return out;
}

interface Layer { image: HTMLCanvasElement; levels: number[]; segs: number[][]; min: number; cap: number }

function buildLayer(data: PorkchopData, q: WindowQuantity): Layer | null {
  const { nx, ny } = data.request;
  const F = field(data, q);
  let min = Infinity;
  for (let k = 0; k < F.length; k++) if (F[k] < min) min = F[k];
  if (!Number.isFinite(min) || !(min > 0)) return null;
  const cap = min * (q === 'c3' ? 8 : 3.2);
  const image = document.createElement('canvas');
  image.width = nx; image.height = ny;
  const ictx = image.getContext('2d')!;
  const px = ictx.createImageData(nx, ny);
  const logCap = Math.log(cap / min);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = F[j * nx + i];
      const o = ((ny - 1 - j) * nx + i) * 4;
      if (!Number.isFinite(v)) { px.data[o + 3] = 0; continue; }
      const [r, g, b] = heat(Math.log(v / min) / logCap);
      px.data[o] = r; px.data[o + 1] = g; px.data[o + 2] = b; px.data[o + 3] = 255;
    }
  }
  ictx.putImageData(px, 0, 0);
  const levels = contourLevels(min, cap);
  return { image, levels, segs: levels.map((lv) => contourSegments(F, nx, ny, lv)), min, cap };
}

function Map({ data, quantity, pick, onPick, example }: {
  data: PorkchopData; quantity: WindowQuantity; pick: { ix: number; iy: number } | null; onPick: (p: { ix: number; iy: number }) => void;
  example: { name: string; dep: number; arr: number } | null;
}) {
  const scale = useApp((s) => s.settings.timeScale);
  const layer = useMemo(() => buildLayer(data, quantity), [data, quantity]);
  const [hover, setHover] = useState<{ ix: number; iy: number } | null>(null);
  const { nx, ny, dep, arr } = data.request;
  const M = { l: 78, r: 74, t: 14, b: 50 };
  const cell = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const W = rect.width - M.l - M.r, H = rect.height - M.t - M.b;
    const fx = (e.clientX - rect.left - M.l) / W, fy = 1 - (e.clientY - rect.top - M.t) / H;
    if (fx < -0.02 || fx > 1.02 || fy < -0.02 || fy > 1.02) return null;
    return { ix: Math.min(nx - 1, Math.max(0, Math.round(fx * (nx - 1)))), iy: Math.min(ny - 1, Math.max(0, Math.round(fy * (ny - 1)))) };
  };
  const ref = useCanvas(({ ctx, w, h }) => {
    const W = w - M.l - M.r, H = h - M.t - M.b;
    if (W < 40 || H < 40) return;
    const X = (gx: number) => M.l + (gx / (nx - 1)) * W, Y = (gy: number) => M.t + H - (gy / (ny - 1)) * H;
    const Xt = (et: number) => M.l + ((et - dep[0]) / (dep[1] - dep[0])) * W, Yt = (et: number) => M.t + H - ((et - arr[0]) / (arr[1] - arr[0])) * H;
    ctx.font = FONT;
    ctx.fillStyle = '#070a12'; ctx.fillRect(M.l, M.t, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, W, H); ctx.clip();
    if (layer) {
      ctx.imageSmoothingEnabled = true;
      // The centre of each image pixel is at a grid point.
      ctx.drawImage(layer.image, M.l - W / (2 * (nx - 1)), M.t - H / (2 * (ny - 1)), (W * nx) / (nx - 1), (H * ny) / (ny - 1));
      // lines of constant time of flight
      const tofLo = Math.max(DAY, arr[0] - dep[1]), tofHi = arr[1] - dep[0];
      ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
      const tofLabels: [string, number, number][] = [];
      for (const days of ticks(tofLo / DAY, tofHi / DAY, 7)) {
        if (days <= 0) continue;
        const T = days * DAY;
        ctx.beginPath(); ctx.moveTo(Xt(dep[0]), Yt(dep[0] + T)); ctx.lineTo(Xt(dep[1]), Yt(dep[1] + T)); ctx.stroke();
        // label where the line leaves the plot (top edge or right edge)
        const etTop = arr[1] - T;
        const lx = etTop <= dep[1] ? Xt(etTop) : Xt(dep[1]), ly = etTop <= dep[1] ? M.t : Yt(dep[1] + T);
        // The label shows only if all of it is in the plot.
        if (lx - 6 - ctx.measureText(`${days} d`).width > M.l && ly < M.t + H - 14) tofLabels.push([`${days} d`, lx - 4, ly + 12]);
      }
      ctx.setLineDash([]);
      // contour lines
      layer.segs.forEach((seg) => {
        ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(X(seg[i]), Y(seg[i + 1])); ctx.lineTo(X(seg[i + 2]), Y(seg[i + 3])); }
        ctx.stroke();
      });
      // The labels of the lines of constant time of flight are above the contour lines, with a dark edge.
      ctx.textAlign = 'right'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,7,12,0.85)'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const [text, x, y] of tofLabels) { ctx.strokeText(text, x, y); ctx.fillText(text, x, y); }
      // One label for each value, where the line crosses the row of the minimum: on the side of the later departure
      // dates or, if there is no space, on the other side. A label that would cover an earlier label is not drawn.
      const ref = data.best ?? data.bestC3;
      const placed: [number, number][] = [];
      // The marks of the minimums are above the labels: a label does not go below a mark.
      for (const m of [data.best, data.bestC3]) if (m && ref && Math.abs(Y(m.iy) - Y(ref.iy)) < 16) placed.push([X(m.ix), 18]);
      if (ref) layer.segs.forEach((seg, k) => {
        let right = -1, left = -1;
        for (let i = 0; i < seg.length; i += 4) {
          const lo = Math.min(seg[i + 1], seg[i + 3]), hi = Math.max(seg[i + 1], seg[i + 3]);
          if (lo > ref.iy || hi < ref.iy) continue;
          if (seg[i] > ref.ix && (right < 0 || seg[i] < seg[right])) right = i;
          if (seg[i] < ref.ix && (left < 0 || seg[i] > seg[left])) left = i;
        }
        const text = String(layer.levels[k]);
        const tw = ctx.measureText(text).width + 6;
        for (const i of [right, left]) {
          if (i < 0) continue;
          const tx = X(seg[i]), ty = Y(seg[i + 1]);
          if (tx + tw / 2 > M.l + W - 2 || tx - tw / 2 < M.l + 2 || placed.some(([px, pw]) => Math.abs(px - tx) < (pw + tw) / 2 + 3)) continue;
          placed.push([tx, tw]);
          ctx.fillStyle = 'rgba(5,7,12,0.82)'; ctx.fillRect(tx - tw / 2, ty - 7, tw, 14);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(text, tx, ty + 4);
          break;
        }
      });
    }
    const mark = (ix: number, iy: number, kind: 'best' | 'c3' | 'pick' | 'hover') => {
      const x = X(ix), y = Y(iy);
      if (kind === 'pick' || kind === 'hover') {
        ctx.strokeStyle = kind === 'pick' ? '#fff' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + H); ctx.moveTo(M.l, y); ctx.lineTo(M.l + W, y); ctx.stroke();
        return;
      }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.fillStyle = kind === 'best' ? COLORS.good : COLORS.blue;
      ctx.beginPath();
      if (kind === 'best') { ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); }
      else ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
      ctx.stroke(); ctx.fill();
    };
    if (hover) mark(hover.ix, hover.iy, 'hover');
    if (pick) mark(pick.ix, pick.iy, 'pick');
    if (data.bestC3) mark(data.bestC3.ix, data.bestC3.iy, 'c3');
    if (data.best) mark(data.best.ix, data.best.iy, 'best');
    if (example && example.dep >= dep[0] && example.dep <= dep[1] && example.arr >= arr[0] && example.arr <= arr[1]) {
      const x = Xt(example.dep), y = Yt(example.arr);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      for (const style of ['#000', '#fff']) {
        ctx.strokeStyle = style; ctx.lineWidth = style === '#000' ? 5 : 2;
        ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x - 7, y + 7); ctx.lineTo(x + 7, y - 7); ctx.stroke();
      }
      ctx.textAlign = x > M.l + W - 110 ? 'right' : 'left';
      const lx = x + (ctx.textAlign === 'right' ? -11 : 11);
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(example.name, lx, y - 9);
      ctx.fillStyle = '#fff'; ctx.fillText(example.name, lx, y - 9);
    }
    ctx.restore();
    // frame and axes
    ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1; ctx.strokeRect(M.l + 0.5, M.t + 0.5, W, H);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'center';
    for (const tk of dateTicks(dep[0], dep[1], scale, Math.floor(W / 78))) {
      const x = Xt(tk.et);
      ctx.beginPath(); ctx.moveTo(x, M.t + H); ctx.lineTo(x, M.t + H + 5); ctx.stroke();
      ctx.fillText(tk.label, x, M.t + H + 18);
    }
    ctx.textAlign = 'right';
    for (const tk of dateTicks(arr[0], arr[1], scale, Math.floor(H / 44))) {
      const y = Yt(tk.et);
      ctx.beginPath(); ctx.moveTo(M.l - 5, y); ctx.lineTo(M.l, y); ctx.stroke();
      ctx.fillText(tk.label, M.l - 8, y + 4);
    }
    ctx.fillStyle = COLORS.bright; ctx.textAlign = 'center';
    ctx.fillText(t('page.windows.axisDep', { scale }), M.l + W / 2, M.t + H + 38);
    ctx.save(); ctx.translate(14, M.t + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(t('page.windows.axisArr', { scale }), 0, 0); ctx.restore();
    // colour scale
    if (layer) {
      const bx = M.l + W + 14, bw = 12;
      const yOf = (v: number) => M.t + H - (Math.log(v / layer.min) / Math.log(layer.cap / layer.min)) * H;
      for (let y = 0; y < H; y++) { const [r, g, b] = heat(1 - y / H); ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(bx, M.t + y, bw, 1.5); }
      ctx.strokeStyle = COLORS.axis; ctx.strokeRect(bx + 0.5, M.t + 0.5, bw, H);
      ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
      let last = Infinity;
      for (const lv of [layer.min, ...layer.levels]) {
        const y = yOf(lv);
        if (last - y < 13) continue;
        last = y;
        ctx.fillText(lv === layer.min ? sig(lv, 3) : String(lv), bx + bw + 5, Math.min(M.t + H, y + 4));
      }
      ctx.fillStyle = COLORS.bright;
      ctx.fillText(UNIT[quantity], bx - 2, M.t + H + 18);
    }
  }, [layer, data, pick, hover, example, scale, quantity]);
  const label = t('page.windows.mapLabel', { from: bodyName(data.request.from), to: bodyName(data.request.to), quantity: t('page.windows.quantity.' + quantity) });
  return (
    <canvas ref={ref} className="map" role="img" aria-label={label}
      onPointerMove={(e) => { const c = cell(e); setHover((h) => (c && h && c.ix === h.ix && c.iy === h.iy ? h : c)); }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => { const c = cell(e); if (c) onPick(c); }} />
  );
}

function CellValues({ data, cell, example }: { data: PorkchopData; cell: { ix: number; iy: number }; example: string | null }) {
  const { nx, ny, dep, arr } = data.request;
  const k = cell.iy * nx + cell.ix;
  const tDep = dep[0] + ((dep[1] - dep[0]) * cell.ix) / (nx - 1), tArr = arr[0] + ((arr[1] - arr[0]) * cell.iy) / (ny - 1);
  const ok = Number.isFinite(data.c3[k]);
  const m = example ? measurement('window.c3.' + example) : undefined;
  const v = (q: Quantity, kind: 'plan.c3' | 'plan.vinf' | 'plan.dv' | 'plan.time') => (ok ? <Val q={q} kind={kind} /> : t('common.notApplicable'));
  return (
    <>
      <dl className="kv wide">
        <dt>{t('page.transfer.depDate')}</dt><dd><Dt et={tDep} precision="minute" /></dd>
        <dt>{t('page.transfer.arrDate')}</dt><dd><Dt et={tArr} precision="minute" /></dd>
        <dt>{t('plan.tof')}</dt><dd>{v(duration(tArr - tDep), 'plan.time')}</dd>
        <dt>{t('plan.c3')}</dt><dd>{v(c3(data.c3[k]), 'plan.c3')}</dd>
        <dt>{t('plan.vinfDep')}</dt><dd>{v(speed(Math.sqrt(data.c3[k])), 'plan.vinf')}</dd>
        <dt>{t('plan.dla')}</dt><dd>{v(angleDeg(data.dla[k], 2), 'plan.c3')}</dd>
        <dt>{t('plan.dvDep', { alt: fixed(data.request.parkingAltitude, 0) })}</dt><dd>{v(deltaV(data.dvDep[k]), 'plan.dv')}</dd>
        <dt>{t('plan.vinfArr')}</dt><dd>{v(speed(data.vinfArr[k]), 'plan.vinf')}</dd>
        <dt>{t('plan.dvArr', { type: t('plan.arrivalType.' + data.request.arrival.type) })}</dt><dd>{v(deltaV(data.dvArr[k]), 'plan.dv')}</dd>
        <dt><b>{t('plan.dvTotal')}</b></dt><dd>{v(deltaV(data.dvTotal[k]), 'plan.dv')}</dd>
      </dl>
      {!ok && <div className="banner warn">{t('page.windows.noTransfer')}</div>}
      {m && typeof m.detail?.truthC3 === 'number' && typeof m.detail?.c3 === 'number' && (
        <div className="banner good">{t('page.windows.exampleCheck', { ours: fixed(m.detail.c3, 2), actual: fixed(m.detail.truthC3, 2), diff: sig(m.value, 2) })}</div>
      )}
    </>
  );
}

export default function Windows() {
  const d = useDrafts();
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const go = useApp((s) => s.go);
  const mission = useApp((s) => s.mission);
  const openMission = useApp((s) => s.openMission);
  useApp((s) => s.custom);
  const [req, setReq] = useState<PorkchopRequest>(() => d.windowRequest ?? defaultRequest());
  const list = useMemo(examples, []);
  const sys = system();
  const range = (id: string): [number, number] => { const c = sys.coverage(id); return [Math.max(c[0], sys.etStart), Math.min(c[1], sys.etEnd)]; };

  const calculate = async (request: PorkchopRequest, example: string | null) => {
    if (busy) return;
    if (!(request.dep[1] > request.dep[0]) || !(request.arr[1] > request.arr[0]) || !(request.arr[1] > request.dep[0] + DAY)) { fail('window:range'); return; }
    setBusy({ task: 'porkchop', stage: '', fraction: null });
    try {
      const data = await engine.porkchop(request);
      d.set({ windowRequest: request, windowData: data, windowPick: null, windowExample: example });
      setBusy(null);
      if (!data.best) fail('quick:window');
    } catch (e) {
      setBusy(null);
      fail(e instanceof EngineError ? e.code : 'internal');
    }
  };
  // The first time, the screen shows the map of the default request.
  useEffect(() => { if (!d.windowData && !busy) void calculate(req, null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (p: Partial<PorkchopRequest>) => setReq({ ...req, ...p });
  const setBodies = (from: string, to: string) => {
    if (from === to) return;
    const r = autoRanges(from, to, req.dep[0]);
    setReq({ ...req, from, to, ...(r ?? {}), arrival: to === req.to ? req.arrival : defaultArrival(to, req.arrival.type) });
  };
  const useExample = (id: string) => {
    const ex = list.find((x) => x.id === id);
    if (!ex) return;
    let syn = 2 * YEAR;
    try { syn = synodicPeriod(sys, 'SUN', 'EARTH', ex.to, ex.dep); } catch { /* default */ }
    const tof = ex.arr - ex.dep;
    const next: PorkchopRequest = {
      ...req, from: 'EARTH', to: ex.to, dep: [ex.dep - 0.14 * syn, ex.dep + 0.14 * syn], arr: [ex.arr - 0.3 * tof, ex.arr + 0.45 * tof],
      arrival: defaultArrival(ex.to, 'flyby'), parkingAltitude: 200, bothDirections: false,
    };
    setReq(next);
    void calculate(next, id);
  };

  const data = d.windowData;
  const cell = d.windowPick ?? (data?.best ? { ix: data.best.ix, iy: data.best.iy } : null);
  const exampleInfo = d.windowExample ? list.find((x) => x.id === d.windowExample) ?? null : null;
  const planOf = (): Plan | null => {
    if (!data || !cell) return null;
    const { nx, ny, dep, arr, from, to, parkingAltitude, arrival } = data.request;
    const t0 = dep[0] + ((dep[1] - dep[0]) * cell.ix) / (nx - 1), t1 = arr[0] + ((arr[1] - arr[0]) * cell.iy) / (ny - 1);
    if (!Number.isFinite(data.c3[cell.iy * nx + cell.ix])) return null;
    return { central: 'SUN', nodes: [{ body: from, et: t0 }, { body: to, et: t1 }], legs: [defaultLeg()], parkingAltitude, arrival: { ...arrival }, minFlybyAltitude: {} };
  };
  const toTransfer = () => { const p = planOf(); if (p) { d.set({ transfer: p }); go({ mode: 'expert', page: 'transfer' }); } };
  const makeMission = async () => {
    const p = planOf();
    if (!p) return;
    if (mission && !(await confirm(t('mission.replaceQuestion', { name: mission.name }), t('mission.replace')))) return;
    await openMission(newMission(t('mission.defaultName', { from: bodyName(p.nodes[0].body), to: bodyName(p.nodes[1].body) }), p));
    go({ mode: 'expert', page: 'tour' });
  };
  const scale = useApp((s) => s.settings.timeScale);

  return (
    <>
      <PageHead id="windows" />
      <div className="cols">
        <div className="stack">
          <Panel title={t('page.windows.input')}>
            <div className="grid2">
              <Field label={t('page.transfer.from')}><BodySelect value={req.from} filter={solarBody} onChange={(v) => setBodies(v, req.to)} /></Field>
              <Field label={t('page.transfer.to')}><BodySelect value={req.to} filter={solarBody} onChange={(v) => setBodies(req.from, v)} /></Field>
            </div>
            <Field label={t('page.windows.depFrom')}><DateInput et={req.dep[0]} min={range(req.from)[0]} max={range(req.from)[1]} onChange={(et) => change({ dep: [et, Math.max(req.dep[1], et + DAY)] })} /></Field>
            <Field label={t('page.windows.depTo')}><DateInput et={req.dep[1]} min={req.dep[0] + DAY} max={range(req.from)[1]} onChange={(et) => change({ dep: [req.dep[0], et] })} /></Field>
            <Field label={t('page.windows.arrFrom')}><DateInput et={req.arr[0]} min={range(req.to)[0]} max={range(req.to)[1]} onChange={(et) => change({ arr: [et, Math.max(req.arr[1], et + DAY)] })} /></Field>
            <Field label={t('page.windows.arrTo')}><DateInput et={req.arr[1]} min={req.arr[0] + DAY} max={range(req.to)[1]} onChange={(et) => change({ arr: [req.arr[0], et] })} /></Field>
            <div className="row">
              <button type="button" className="btn small" onClick={() => { const r = autoRanges(req.from, req.to, req.dep[0]); if (r) change(r); }}>{t('page.windows.auto')}</button>
              <span className="note" style={{ flex: 1, minWidth: 160 }}>{t('page.windows.autoNote')}</span>
            </div>
            <div className="grid2">
              <Field label={t('plan.parkingAltitude')}><NumberInput value={req.parkingAltitude} unit="km" min={0} max={1e6} onChange={(v) => change({ parkingAltitude: v })} /></Field>
              <ArrivalInputs plan={{ central: 'SUN', nodes: [{ body: req.from, et: 0 }, { body: req.to, et: 1 }], legs: [defaultLeg()], parkingAltitude: req.parkingAltitude, arrival: req.arrival, minFlybyAltitude: {} }} onChange={(arrival) => change({ arrival })} />
              <Field label={t('page.windows.grid')}>
                <Select value={String(req.nx)} onChange={(v) => change({ nx: Number(v), ny: Number(v) })} options={[64, 96, 128, 192].map((n) => ({ value: String(n), label: t('page.windows.gridN', { n, cells: fixed(n * n, 0) }) }))} />
              </Field>
            </div>
            <Check checked={!!req.bothDirections} onChange={(v) => change({ bothDirections: v })} label={t('page.windows.both')} />
            <div className="row end"><button type="button" className="btn primary" disabled={!!busy} onClick={() => calculate(req, null)}>{t('page.windows.calculate')}</button></div>
          </Panel>
          <Panel title={t('page.windows.examples')}>
            <p className="note">{t('page.windows.examplesNote')}</p>
            <div className="row">
              {list.map((x) => <button key={x.id} type="button" className={'btn small' + (d.windowExample === x.id ? ' on' : '')} disabled={!!busy} onClick={() => useExample(x.id)}>{x.name}</button>)}
            </div>
          </Panel>
        </div>
        <div className="stack">
          {data ? (
            <>
              <Panel title={<>{t('page.windows.map', { from: bodyName(data.request.from), to: bodyName(data.request.to) })} <Src kind="plan.c3" /></>}
                actions={<Seg value={d.windowQuantity} onChange={(windowQuantity) => d.set({ windowQuantity })} options={QUANTITIES.map((q) => ({ value: q, label: t('page.windows.quantity.' + q) }))} label={t('page.windows.quantityLabel')} />}>
                <Map data={data} quantity={d.windowQuantity} pick={d.windowPick} onPick={(windowPick) => d.set({ windowPick })} example={exampleInfo} />
                <div className="legend">
                  <span><i className="mk best" />{t('page.windows.legendBest')}</span>
                  <span><i className="mk c3" />{t('page.windows.legendC3')}</span>
                  {exampleInfo && <span><i className="mk x" />{t('page.windows.legendActual', { name: exampleInfo.name, date: formatEt(exampleInfo.dep, scale, 'day'), scale })}</span>}
                  <span><i className="mk tof" />{t('page.windows.legendTof')}</span>
                </div>
                <p className="note">{t('page.windows.mapNote')}</p>
              </Panel>
              {cell && (
                <Panel title={d.windowPick ? t('page.windows.picked') : t('page.windows.best')}
                  actions={<>
                    {d.windowPick && <button type="button" className="btn small" onClick={() => d.set({ windowPick: null })}>{t('page.windows.showBest')}</button>}
                  </>}>
                  <CellValues data={data} cell={cell} example={d.windowPick ? null : d.windowExample} />
                  <div className="row end">
                    <button type="button" className="btn" disabled={!planOf()} onClick={toTransfer}>{t('page.windows.toTransfer')}</button>
                    <button type="button" className="btn primary" disabled={!planOf()} onClick={makeMission}>{t('page.transfer.makeMission')}</button>
                  </div>
                </Panel>
              )}
            </>
          ) : <div className="panel empty"><p>{t('page.windows.empty')}</p></div>}
        </div>
      </div>
    </>
  );
}
