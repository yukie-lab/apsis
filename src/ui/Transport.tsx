/** Time controls of a flight: start and stop of the time, the time rate, the position in the flight. */
import { clock, useClock } from '../app/clock';
import { t } from '../i18n';
import { DAY } from '../engine/time';
import { duration, q } from '../app/format';
import { IconPlay, IconPause, IconSkipStart, IconSkipEnd } from './icons';
import { useNarrow, useShort } from './media';

/** Fixed time rates, simulation seconds for each second. */
const RATES: { id: string; rate: number }[] = [
  { id: 'm10', rate: 600 },
  { id: 'h1', rate: 3600 },
  { id: 'h6', rate: 6 * 3600 },
  { id: 'd1', rate: DAY },
  { id: 'd10', rate: 10 * DAY },
  { id: 'd30', rate: 30 * DAY },
  { id: 'd100', rate: 100 * DAY },
];

/** Text of a time rate: "3.2 d each second". */
export function rateText(rate: number): string {
  return t('scene.rate.now', { value: q(duration(rate)) });
}

export interface TransportMark { et: number; kind: 'maneuver' | 'approach' }

/** The marks of a flight: its maneuvers and its closest approaches. */
export function eventMarks(events: { et: number; type: string }[]): TransportMark[] {
  return events.filter((e) => e.type === 'maneuver' || e.type === 'periapsis').map((e) => ({ et: e.et, kind: e.type === 'maneuver' ? 'maneuver' : 'approach' }));
}

/**
 * et0, et1: start and end of the flight. auto: the list of the rates has the automatic rate (the 3D scene sets
 * it from the distance to the nearest body: slow near a body, fast in the cruise).
 * marks: events of the flight. They show on the time line, and the two buttons at the sides of the start button
 * then go to the event before and to the next event.
 * On a narrow or a short screen, the automatic rate shows in a short form.
 */
export function Transport({ et0, et1, auto = true, marks, className }: { et0: number; et1: number; auto?: boolean; marks?: TransportMark[]; className?: string }) {
  const { et, playing, rate, autoRate } = useClock(100);
  const narrow = useNarrow(), short = useShort();
  const compact = narrow || short;
  const span = et1 - et0;
  const frac = (x: number): number => (span !== 0 ? Math.min(1, Math.max(0, (x - et0) / span)) : 0);
  const value = autoRate && auto ? 'auto' : RATES.find((r) => r.rate === rate)?.id ?? 'custom';
  // Event before the time of the view and next event. Two events in the same second are one stop.
  // While the time runs, the button for the event before has a margin of one second of the display: a second push
  // goes one more event back.
  const same = 1;
  const margin = playing ? Math.max(same, 1.2 * Math.abs(rate)) : same;
  const stops = marks ? [et0, ...marks.map((m) => m.et), et1] : [et0, et1];
  const back = (): void => { let to = et0; for (const s of stops) if (s < et - margin) to = s; clock.set(to); };
  const forward = (): void => { const to = stops.find((s) => s > et + same) ?? et1; if (to >= et1) clock.play(false); clock.set(to); };
  return (
    <div className={'transport' + (className ? ' ' + className : '')} data-cover>
      <button type="button" className="btn icon" aria-label={t(marks ? 'scene.prevEvent' : 'scene.toStart')} title={t(marks ? 'scene.prevEvent' : 'scene.toStart')} onClick={back}><IconSkipStart /></button>
      <button type="button" className="btn icon primary" aria-label={t(playing ? 'scene.pause' : 'scene.play')} title={t(playing ? 'scene.pause' : 'scene.play')} onClick={() => clock.play(!playing)}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" className="btn icon" aria-label={t(marks ? 'scene.nextEvent' : 'scene.toEnd')} title={t(marks ? 'scene.nextEvent' : 'scene.toEnd')} onClick={forward}><IconSkipEnd /></button>
      <span className="timeline">
        <input type="range" min={0} max={1000} value={Math.round(1000 * frac(et))} aria-label={t('scene.timeline')} onChange={(e) => clock.set(et0 + (Number(e.target.value) / 1000) * span)} />
        {marks && <span className="ticks" aria-hidden="true">{marks.map((m, k) => <i key={k} className={m.kind} style={{ left: `${100 * frac(m.et)}%` }} />)}</span>}
      </span>
      <select className="input" aria-label={t('scene.rate.label')} title={t('scene.rate.label')} value={value}
        onChange={(e) => { const r = RATES.find((k) => k.id === e.target.value); if (r) clock.setRate(r.rate, false); else clock.setRate(clock.rate, true); }}>
        {auto && <option value="auto">{t('scene.rate.auto')}{autoRate ? ` (${compact ? t('scene.rate.short', { value: q(duration(rate)) }) : rateText(rate)})` : ''}</option>}
        {value === 'custom' && <option value="custom">{rateText(rate)}</option>}
        {RATES.map((r) => <option key={r.id} value={r.id}>{t('scene.rate.' + r.id)}</option>)}
      </select>
    </div>
  );
}
