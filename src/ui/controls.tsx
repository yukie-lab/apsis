/** Input parts: a text for each label comes from the caller (locale texts). */
import React, { useEffect, useId, useState, type ReactNode } from 'react';
import { BODY_LIST, type Body } from '../engine/bodies';
import { type TimeScale, formatEt, parseToEt, DAY } from '../engine/time';
import { t, bodyName } from '../i18n';
import { useApp } from '../app/store';
import { system } from '../app/system';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="note">{hint}</span>}
    </label>
  );
}

/**
 * Number input. The value goes to the caller when the user leaves the field or pushes the Enter key.
 * The field can show fewer digits than the value has: if the user does not change the text, the value stays.
 */
export function NumberInput({ value, onChange, unit, min, max, digits, disabled, label }: {
  value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; digits?: number; disabled?: boolean; label?: string;
}) {
  const show = (v: number) => (Number.isFinite(v) ? (digits === undefined ? String(+v.toPrecision(10)) : v.toFixed(digits)) : '');
  const [text, setText] = useState(show(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(show(value)); setBad(false); }, [value, digits]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    if (text === show(value)) { setBad(false); return; }
    const v = Number(text.replace(/\s/g, '').replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max)) { setBad(true); return; }
    setBad(false);
    if (v !== value) onChange(v); else setText(show(v));
  };
  const input = (
    <input className={'input num' + (bad ? ' bad' : '')} inputMode="decimal" value={text} disabled={disabled} aria-label={label} aria-invalid={bad}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
  return unit ? <span className="with-unit">{input}<span className="unit">{unit}</span></span> : input;
}

/**
 * Date and time input in the time scale of the settings. The name of the scale shows after the field.
 * In the field, the up and down arrow keys change the date by 1 day (with the Shift key: 10 days).
 * nudge: buttons for 1 day and 10 days. compact: buttons for 1 day only (a click with the Shift key: 10 days).
 */
export function DateInput({ et, onChange, scale, nudge, compact, min, max, label }: {
  et: number; onChange: (et: number) => void; scale?: TimeScale; nudge?: boolean; compact?: boolean; min?: number; max?: number; label?: string;
}) {
  const setting = useApp((s) => s.settings.timeScale);
  const sc = scale ?? setting;
  const [text, setText] = useState(formatEt(et, sc, 'second'));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(formatEt(et, sc, 'second')); setBad(false); }, [et, sc]);
  const lo = min ?? system().etStart, hi = max ?? system().etEnd;
  const commit = () => {
    // The field shows whole seconds: if the user does not change the text, the time stays.
    if (text === formatEt(et, sc, 'second')) { setBad(false); return; }
    const v = parseToEt(text, sc);
    if (v === null || !(v >= lo) || !(v <= hi)) { setBad(true); return; }
    setBad(false);
    if (Math.abs(v - et) > 1e-3) onChange(v); else setText(formatEt(et, sc, 'second'));
  };
  const step = (days: number) => { const v = Math.min(hi, Math.max(lo, et + days * DAY)); if (v !== et) onChange(v); };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
  };
  const wide = nudge && !compact;
  return (
    <span className="with-unit date">
      {wide && <button type="button" className="btn small" onClick={() => step(-10)} title={t('common.daysBack', { n: 10 })}>−10</button>}
      {(nudge || compact) && <button type="button" className="btn small" onClick={(e) => step(compact && e.shiftKey ? -10 : -1)} title={t(compact ? 'common.daysBackShift' : 'common.daysBack', { n: 1 })}>−1</button>}
      <input className={'input num' + (bad ? ' bad' : '')} value={text} aria-label={label} aria-invalid={bad}
        title={bad ? t('common.badDate') : t('common.dateKeys')}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      {(nudge || compact) && <button type="button" className="btn small" onClick={(e) => step(compact && e.shiftKey ? 10 : 1)} title={t(compact ? 'common.daysForwardShift' : 'common.daysForward', { n: 1 })}>+1</button>}
      {wide && <button type="button" className="btn small" onClick={() => step(10)} title={t('common.daysForward', { n: 10 })}>+10</button>}
      <span className="unit">{sc}</span>
    </span>
  );
}

export function Select<T extends string>({ value, onChange, options, label, disabled }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string; disabled?: boolean;
}) {
  return (
    <select className="input" value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const GROUPS: { kind: string; test: (b: Body) => boolean }[] = [
  { kind: 'star', test: (b) => b.kind === 'star' },
  { kind: 'planet', test: (b) => b.kind === 'planet' },
  { kind: 'dwarf', test: (b) => b.kind === 'dwarf' },
  { kind: 'moon', test: (b) => b.kind === 'moon' },
  { kind: 'asteroid', test: (b) => b.kind === 'asteroid' && b.naif !== 0 },
  { kind: 'comet', test: (b) => b.kind === 'comet' },
  { kind: 'custom', test: (b) => b.naif === 0 },
];

/** Body list. `filter` limits the bodies; `extra` adds entries at the top (for example the barycentre). */
export function BodySelect({ value, onChange, filter, extra, label }: {
  value: string; onChange: (id: string) => void; filter?: (b: Body) => boolean; extra?: string[]; label?: string;
}) {
  const bodies = BODY_LIST.filter((b) => !filter || filter(b));
  return (
    <select className="input" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {extra?.map((id) => <option key={id} value={id}>{bodyName(id)}</option>)}
      {GROUPS.map((g) => {
        const list = bodies.filter(g.test);
        if (list.length === 0) return null;
        return <optgroup key={g.kind} label={t('bodyKind.' + g.kind)}>{list.map((b) => <option key={b.id} value={b.id}>{bodyName(b.id)}</option>)}</optgroup>;
      })}
    </select>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {options.map((o) => <button type="button" key={o.value} className={o.value === value ? 'on' : ''} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </span>
  );
}

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const id = useId();
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'panel' + (className ? ' ' + className : '')}>
      {(title || actions) && <header><h2>{title}</h2>{actions}</header>}
      {children}
    </section>
  );
}

/** Save a text as a file on the computer of the user (no server). */
export function downloadText(name: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
