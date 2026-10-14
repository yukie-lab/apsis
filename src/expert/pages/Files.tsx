/**
 * Files screen: reads a trajectory file of a different program and examines it, and writes the flight of the
 * mission in the formats of other programs. The texts of the errors are in the locale files (ioError.*).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useApp, missionFileText, nowEt } from '../../app/store';
import { useClock } from '../../app/clock';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { APP_VERSION } from '../../app/version';
import { t, tEnglish, hasText, bodyName, bodyIn } from '../../i18n';
import { newFlightMission, missionFromJson, type Mission } from '../../engine/mission';
import type { Flight } from '../../engine/flight';
import { FULL_MODEL, type Maneuver, type Trajectory } from '../../engine/propagate';
import { type TimeScale, DAY, formatEt } from '../../engine/time';
import type { FrameId } from '../../engine/frames';
import { norm } from '../../engine/vec';
import {
  IoError, type EphemerisTable, type FileFormat, type Opm, type TableCheck, detectFormat, textLines, segmentRanges,
  parseOem, parseOpm, parseStkEphemeris, parseCsv, parseHorizonsVectors, tableApproaches, tableBoundaries, tableDifference, tableToCenterFrame,
  tableFromTrajectory, tableFromTrajectorySteps, checkTableInterpolation, writeOem, writeOpm, opmFromFlight, flightFromOpm,
  writeStkEphemeris, writeCsv, writeGmatScript, gmatDifferences,
} from '../../engine/io';
import { distance, speed, deltaV, duration, fixed, mass, sig, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { Field, Group, NumberInput, DateInput, Select, BodySelect, Seg, Check, Panel, downloadText } from '../../ui/controls';
import { COLORS } from '../../ui/canvas';
import { confirm } from '../../ui/Confirm';
import { PageHead, Dt } from '../common';
import { DiffChart } from '../DiffChart';
import { useDrafts, type FileIn, type FileInOptions, type FileOut } from '../drafts';

/** Largest file that the screen reads, MB. */
const MAX_FILE_MB = 64;
/** Largest number of samples of a table that the screen writes. */
const MAX_SAMPLES_OUT = 100000;
const MAX_APPROACHES = 60;
/** A closest approach with a larger distance from the next sample of the file gets a caution, km. */
const MISS_WARN_KM = 1000;
const PREVIEW_LINES = 36;
const READ_FORMATS: FileFormat[] = ['oem', 'opm', 'stk', 'horizons', 'csv', 'mission'];
const WRITE_FORMATS: FileOut['format'][] = ['oem', 'opm', 'stk', 'gmat', 'csv', 'mission'];
const SCALES: TimeScale[] = ['UTC', 'TDB', 'TT', 'TAI'];
const FRAMES: FrameId[] = ['ICRF', 'ECLIPJ2000'];
const STEP_S: Record<FileOut['stepUnit'], number> = { s: 1, min: 60, h: 3600, d: DAY };
const EXTENSION: Record<FileOut['format'], string> = { oem: '.oem', opm: '.opm', stk: '.e', gmat: '.script', csv: '.csv', mission: '.apsis.json' };
/** Errors of a Horizons text with no header line for an item: the screen then shows fields for these items. */
const HEADER_CODES = ['horizons.center', 'horizons.frame', 'horizons.units', 'horizons.time'];

const num = (text: string, unit = ''): Quantity => ({ text, unit });
const stem = (name: string): string => name.replace(/\.[^.]*$/, '');
const slug = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface Problem { code: string; line?: number; detail?: string; lineText?: string }

/** Text of an error of the interchange module. */
function problemText(p: Problem): string {
  if (p.code.startsWith('file:') || p.code === 'internal') return t('error.' + p.code);
  const [group, name] = p.code.split('.');
  if (name === 'table' && p.detail) {
    const [kind, index] = p.detail.split(':');
    if (hasText('ioError.table.' + kind)) return t('ioError.table.' + kind, { index: index ?? '' });
  }
  const keys = [`ioError.${group}.${name}`, `ioError.any.${name}`];
  if (HEADER_CODES.includes(p.code) && p.detail === undefined) keys.unshift(`ioError.${group}.${name}Missing`);
  for (const key of keys) if (hasText(key)) return t(key, { n: fixed(MAX_SAMPLES_OUT, 0) });
  return t('ioError.other', { code: p.code });
}
function problemOf(e: unknown, lines?: string[]): Problem {
  if (e instanceof IoError) return { code: e.code, line: e.line, detail: e.detail, lineText: e.line && lines ? lines[e.line - 1] : undefined };
  return { code: 'internal' };
}
function ProblemBox({ problem, title }: { problem: Problem; title?: string }) {
  const consumed = problem.code.endsWith('.table');
  return (
    <div className="banner bad" role="alert">
      {title && <b>{title}</b>}
      <div>{problemText(problem)}</div>
      {problem.detail !== undefined && !consumed && <div className="note">{t('page.files.errorItem')}: <span className="num">{problem.detail}</span></div>}
      {problem.line !== undefined && <div className="note">{t('page.files.errorLine', { n: problem.line })}{problem.lineText !== undefined && <>: <span className="num fileline">{problem.lineText.slice(0, 160)}</span></>}</div>}
    </div>
  );
}

/** Text field that gives its value when the user leaves it or pushes the Enter key. */
function TextInput({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input className="input" value={text} aria-label={label} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value) onChange(text); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

// ------------------------------------------------------------------------------------------------ read

function defaultOptions(): FileInOptions {
  const s = useApp.getState().settings;
  return { center: s.center, frame: s.frame, timeScale: 'UTC', distanceUnit: 'km', horizonsUnits: 'KM-S', horizonsScale: 'TDB' };
}

let serial = 0;

/** Read a text: find its format, read it, and (after a short delay, so that the screen shows the file first) examine the table. */
function load(name: string, text: string, choice: FileFormat | null, options: FileInOptions): void {
  const drafts = useDrafts.getState();
  const prev = drafts.fileIn;
  const lines = textLines(text);
  const detected = detectFormat(text);
  const format = choice ?? detected;
  let needsOptions = !!prev && prev.text === text && prev.needsOptions;
  const next: FileIn = {
    serial: ++serial, name, text, lines: lines.length, detected, choice, format, needsOptions, options, error: null, table: null, opm: null, mission: null,
    approaches: null, boundaries: [], search: null, use: [],
  };
  const read = (): void => {
    if (format === 'oem') next.table = parseOem(text);
    else if (format === 'stk') next.table = parseStkEphemeris(text, name ? { objectName: stem(name) } : {});
    else if (format === 'csv') next.table = parseCsv(text, { center: options.center, frame: options.frame, timeScale: options.timeScale, distanceUnit: options.distanceUnit, ...(name ? { objectName: stem(name) } : {}) });
    else if (format === 'horizons') next.table = parseHorizonsVectors(text, needsOptions ? { center: options.center, frame: options.frame, units: options.horizonsUnits, timeScale: options.horizonsScale } : {});
    else if (format === 'opm') next.opm = parseOpm(text);
    else if (format === 'mission') next.mission = missionFromJson(text);
  };
  try {
    try { read(); } catch (e) {
      // A Horizons text with no header: read it again with the values of the fields.
      if (!(e instanceof IoError) || !HEADER_CODES.includes(e.code) || e.detail !== undefined || needsOptions) throw e;
      needsOptions = next.needsOptions = true;
      next.error = problemOf(e, lines);
    }
  } catch (e) {
    next.error = format === 'mission' && !(e instanceof IoError) && e instanceof Error ? { code: 'file:' + e.message } : problemOf(e, lines);
  }
  drafts.set({ fileIn: next });
  const table = next.table;
  if (!table) return;
  setTimeout(() => {
    if (useDrafts.getState().fileIn !== next) return;
    const done: FileIn = { ...next, approaches: [] };
    try {
      done.boundaries = tableBoundaries(system(), table);
      done.use = done.boundaries.map(() => true);
      done.approaches = tableApproaches(system(), table, FULL_MODEL, MAX_APPROACHES + 1);
    } catch (e) { done.error = problemOf(e); }
    useDrafts.getState().set({ fileIn: done });
  }, 30);
}

function ReadPanel() {
  const fileIn = useDrafts((d) => d.fileIn);
  const setDrafts = useDrafts((d) => d.set);
  const fail = useApp((s) => s.fail);
  const [paste, setPaste] = useState('');
  const [over, setOver] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File) => {
    setTooLarge(file.size > MAX_FILE_MB * 1e6);
    if (file.size > MAX_FILE_MB * 1e6) return;
    try { load(file.name, await file.text(), null, fileIn?.options ?? defaultOptions()); } catch { fail('internal'); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void read(f); };
  const again = (choice: FileFormat | null, options: FileInOptions) => { if (fileIn) load(fileIn.name, fileIn.text, choice, options); };
  const opt = (p: Partial<FileInOptions>) => { if (fileIn) again(fileIn.choice, { ...fileIn.options, ...p }); };
  const o = fileIn?.options;
  return (
    <section className={'panel droparea' + (over ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <header><h2>{t('page.files.read')}</h2></header>
      <p className="note">{t('page.files.readNote')} {t('page.files.moveNote')}</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => input.current?.click()}>{t('page.files.select')}</button>
        <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void read(f); }} />
        {fileIn && <button type="button" className="btn" onClick={() => { setDrafts({ fileIn: null }); setPaste(''); }}>{t('page.files.clear')}</button>}
      </div>
      {tooLarge && <div className="banner bad" role="alert">{t('page.files.tooLarge', { n: MAX_FILE_MB })}</div>}
      {!fileIn && (
        <>
          <Field label={t('page.files.paste')}>
            <textarea className="input filetext" rows={7} spellCheck={false} value={paste} onChange={(e) => setPaste(e.target.value)} />
          </Field>
          <div className="row"><button type="button" className="btn" disabled={paste.trim() === ''} onClick={() => load('', paste, null, defaultOptions())}>{t('page.files.readText')}</button></div>
        </>
      )}
      {fileIn && o && (
        <>
          <dl className="kv">
            <dt>{t('page.files.file')}</dt><dd>{fileIn.name || t('page.files.pasted')}</dd>
            <dt>{t('page.files.lines')}</dt><dd><span className="num">{fixed(fileIn.lines, 0)}</span></dd>
          </dl>
          <Field label={t('page.files.format')} hint={fileIn.choice ? undefined : t(fileIn.detected ? 'page.files.found' : 'page.files.notFound')}>
            <Select<string> value={fileIn.choice ?? 'auto'} onChange={(v) => again(v === 'auto' ? null : (v as FileFormat), o)}
              options={[{ value: 'auto', label: t('fileFormat.auto') + (fileIn.detected ? ': ' + t('fileFormat.' + fileIn.detected) : '') }, ...READ_FORMATS.map((f) => ({ value: f, label: t('fileFormat.' + f) }))]} />
          </Field>
          {fileIn.format === 'csv' && (
            <>
              <h3>{t('page.files.csvOptions')}</h3>
              <div className="grid2">
                <Field label={t('page.files.optCenter')}><BodySelect value={o.center} extra={['SSB']} onChange={(center) => opt({ center })} /></Field>
                <Field label={t('page.files.optFrame')}><Select value={o.frame} onChange={(frame) => opt({ frame })} options={FRAMES.map((f) => ({ value: f, label: t('frameLong.' + f) }))} /></Field>
                <Field label={t('page.files.optScale')} hint={t('page.files.optScaleHint')}><Select value={o.timeScale} onChange={(timeScale) => opt({ timeScale })} options={SCALES.map((s) => ({ value: s, label: s }))} /></Field>
                <Field label={t('page.files.optUnit')} hint={t('page.files.optUnitHint')}><Select value={o.distanceUnit} onChange={(distanceUnit) => opt({ distanceUnit })} options={[{ value: 'km', label: 'km' }, { value: 'm', label: 'm' }]} /></Field>
              </div>
            </>
          )}
          {fileIn.format === 'horizons' && fileIn.needsOptions && (
            <>
              <h3>{t('page.files.horizonsOptions')}</h3>
              <div className="grid2">
                <Field label={t('page.files.optCenter')}><BodySelect value={o.center} extra={['SSB']} onChange={(center) => opt({ center })} /></Field>
                <Field label={t('page.files.optFrame')}><Select value={o.frame} onChange={(frame) => opt({ frame })} options={FRAMES.map((f) => ({ value: f, label: t('frameLong.' + f) }))} /></Field>
                <Field label={t('page.files.optUnits')}><Select value={o.horizonsUnits} onChange={(horizonsUnits) => opt({ horizonsUnits })} options={[{ value: 'KM-S', label: t('page.files.unitsKmS') }, { value: 'AU-D', label: t('page.files.unitsAuD') }, { value: 'KM-D', label: t('page.files.unitsKmD') }]} /></Field>
                <Field label={t('page.files.optScale')}><Select value={o.horizonsScale} onChange={(horizonsScale) => opt({ horizonsScale })} options={[{ value: 'TDB', label: 'TDB' }, { value: 'UTC', label: 'UTC' }]} /></Field>
              </div>
            </>
          )}
          {fileIn.error && <ProblemBox problem={fileIn.error} title={t('page.files.errorTitle')} />}
        </>
      )}
    </section>
  );
}

/** Shortest and longest time between two samples of a segment, s. */
function stepRange(table: EphemerisTable): [number, number] | null {
  let lo = Infinity, hi = 0;
  for (const [a, b] of segmentRanges(table)) for (let i = a + 1; i <= b; i++) { const d = table.et[i] - table.et[i - 1]; if (d < lo) lo = d; if (d > hi) hi = d; }
  return hi > 0 ? [lo, hi] : null;
}

function useOpen() {
  const openMission = useApp((s) => s.openMission);
  const setReference = useApp((s) => s.setReference);
  return async (m: Mission, reference: EphemerisTable | null): Promise<void> => {
    const now = useApp.getState().mission;
    if (now && !(await confirm(t('mission.replaceQuestion', { name: now.name }), t('mission.replace')))) return;
    await openMission(m);
    if (reference && useApp.getState().mission?.id === m.id) setReference(reference);
  };
}

function TablePanel({ fileIn, table }: { fileIn: FileIn; table: EphemerisTable }) {
  const n = table.et.length;
  const range = stepRange(table);
  const spacecraftAtSsb = fileIn.format === 'horizons' && table.center === 'SSB' && /\(spacecraft\)|\(-\d+\)/i.test(table.objectName);
  return (
    <Panel title={t('page.files.table')}>
      <dl className="kv">
        <dt>{t('page.files.object')}</dt><dd>{table.objectName}</dd>
        <dt>{t('page.files.objectId')}</dt><dd><span className="num">{table.objectId}</span></dd>
        <dt>{t('page.files.center')}</dt><dd>{bodyName(table.center)}</dd>
        <dt>{t('page.files.frame')}</dt><dd>{t('frameLong.' + table.frame)}</dd>
        <dt>{t('page.files.fileScale')}</dt><dd>{table.timeScale}</dd>
        <dt>{t('page.files.samples')}</dt><dd><Val q={num(fixed(n, 0))} kind="file.read" /></dd>
        <dt>{t('page.files.segments')}</dt><dd><span className="num">{segmentRanges(table).length}</span></dd>
        <dt>{t('page.files.first')}</dt><dd><Dt et={table.et[0]} /></dd>
        <dt>{t('page.files.last')}</dt><dd><Dt et={table.et[n - 1]} /></dd>
        {range && <><dt>{t('page.files.stepRange')}</dt><dd>{range[1] - range[0] < 1e-3 * range[1] ? <Val q={duration(range[1])} /> : <span>{t('page.files.stepFromTo', { min: `${duration(range[0]).text} ${duration(range[0]).unit}`, max: `${duration(range[1]).text} ${duration(range[1]).unit}` })}</span>}</dd></>}
      </dl>
      {spacecraftAtSsb && <div className="banner warn">{t('page.files.ssbNote')}</div>}
      {table.comments && table.comments.length > 0 && (
        <details>
          <summary className="note">{t('page.files.comments')}</summary>
          <pre className="filetext">{table.comments.slice(0, 40).join('\n')}</pre>
        </details>
      )}
    </Panel>
  );
}

function ApproachPanel({ fileIn }: { fileIn: FileIn }) {
  const unit = useApp((s) => s.settings.distUnit);
  const scale = useApp((s) => s.settings.timeScale);
  const list = fileIn.approaches;
  const shown = list?.slice(0, MAX_APPROACHES) ?? [];
  const far = shown.filter((a) => a.missKm > MISS_WARN_KM);
  return (
    <Panel title={<>{t('page.files.approaches')}<Src kind="file.approach" /></>}>
      <p className="note">{t('page.files.approachesIntro')}</p>
      {list === null && <p className="row"><span className="spin" />{t('page.files.analysis')}</p>}
      {list !== null && shown.length === 0 && <p className="note">{t('page.files.noApproach')}</p>}
      {shown.length > 0 && (
        <div className="scroll"><table className="data">
          <thead><tr><th>{t('common.body')}</th><th>{t('common.time')}</th><th className="r">{t('page.files.radius')}</th><th className="r">{t('page.files.altitude')}</th><th className="r">{t('page.files.speed')}</th><th className="r">{t('page.files.miss')}</th></tr></thead>
          <tbody>
            {shown.map((a, k) => (
              <tr key={k}>
                <td className="nw">{bodyName(a.body)}{!a.refined && <> <span className="tag warn">{t('page.files.fromSample')}</span></>}</td>
                <td className="nw"><Dt et={a.et} precision={a.refined ? 'second' : 'minute'} /></td>
                <td className="r"><Val q={distance(a.radius, unit)} /></td>
                <td className="r"><Val q={distance(a.altitude, unit)} /></td>
                <td className="r"><Val q={speed(a.speed)} /></td>
                <td className="r">{Number.isFinite(a.missKm) ? <Val q={a.missKm < 1 ? num(sig(a.missKm * 1000, 3), 'm') : num(sig(a.missKm, 3), 'km')} className={a.missKm > MISS_WARN_KM ? 'warn' : ''} /> : <span className="dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {far.slice(0, 3).map((a, k) => <div key={k} className="banner warn">{t('page.files.missWarn', { body: bodyIn(a.body), time: dateText(a.et, scale), scale })}</div>)}
      {list !== null && list.length > MAX_APPROACHES && <p className="note">{t('page.files.moreApproaches', { n: MAX_APPROACHES })}</p>}
    </Panel>
  );
}

const dateText = (et: number, scale: TimeScale): string => formatEt(et, scale, 'minute');

// ------------------------------------------------------------------------------------------------ maneuvers and mission

function ManeuverPanel({ fileIn, table }: { fileIn: FileIn; table: EphemerisTable }) {
  const setDrafts = useDrafts((d) => d.set);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const busy = useApp((s) => s.busy);
  const hasFlight = useApp((s) => !!s.trajectory);
  const setReference = useApp((s) => s.setReference);
  const reference = useApp((s) => s.reference);
  const open = useOpen();
  const [threshold, setThreshold] = useState(fileIn.search ? fileIn.search.threshold * 1000 : 3);
  const nb = fileIn.boundaries.length;
  const sys = system();
  const n = table.et.length;
  const inRange = table.et[0] >= sys.etStart && table.et[n - 1] <= sys.etEnd;
  /** First and last sample of the new flight. */
  const [span, setSpan] = useState<[number, number]>([0, n - 1]);
  /** Index of the sample nearest to a time. At a maneuver (two samples with one time): the later one for a start, the earlier one for an end. */
  const nearest = (et: number, start: boolean): number => {
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table.et[mid] <= et) lo = mid; else hi = mid; }
    let i = et - table.et[lo] <= table.et[hi] - et ? lo : hi;
    if (start) { while (i + 1 < n && table.et[i + 1] === table.et[i]) i++; } else { while (i > 0 && table.et[i - 1] === table.et[i]) i--; }
    return i;
  };
  const toggle = (k: number) => setDrafts({ fileIn: { ...fileIn, use: fileIn.use.map((u, i) => (i === k ? !u : u)) } });
  const search = async () => {
    if (busy) return;
    setBusy({ task: 'search', stage: '', fraction: 0 });
    try {
      const abs = tableToCenterFrame(sys, table, 'SSB', 'ICRF');
      const out = await engine.findManeuvers({ et: abs.et, states: abs.states, model: FULL_MODEL, threshold: threshold / 1000 }, (p) => setBusy({ task: 'search', stage: '', fraction: p.fraction ?? null }));
      setBusy(null);
      const now = useDrafts.getState().fileIn;
      if (now?.table !== table) return;
      // A result for an interval with a flyby is frequently not a maneuver: it is not selected at the start.
      const skipped = Array.from(out.mismatch).filter((x) => !Number.isFinite(x)).length - (segmentRanges(table).length - 1);
      setDrafts({ fileIn: { ...now, search: { threshold: threshold / 1000, candidates: out.candidates, noiseFloor: out.noiseFloor, skipped: Math.max(0, skipped) }, use: [...now.use.slice(0, nb), ...out.candidates.map((c) => c.flyby === null)] } });
    } catch (e) { setBusy(null); fail(e instanceof EngineError ? e.code : 'internal'); }
  };
  const make = () => {
    const abs = tableToCenterFrame(sys, table, 'SSB', 'ICRF');
    const [first, last] = span;
    const inside = (et: number): boolean => et > abs.et[first] && et < abs.et[last];
    const maneuvers: Maneuver[] = [];
    fileIn.boundaries.forEach((b, k) => { if (fileIn.use[k] && b.index > first && b.index <= last && inside(b.et)) maneuvers.push({ id: 'file' + (k + 1), et: b.et, dv: b.dv, frame: 'ICRF', refBody: 'SUN' }); });
    fileIn.search?.candidates.forEach((c, k) => { if (fileIn.use[nb + k] && inside(c.et)) maneuvers.push({ id: 'found' + (k + 1), et: c.et, dv: c.dv, frame: 'ICRF', refBody: 'SUN' }); });
    maneuvers.sort((a, b) => a.et - b.et);
    const flight: Flight = { et0: abs.et[first], state0: abs.states[first], etEnd: abs.et[last], maneuvers, model: FULL_MODEL };
    const name = table.objectName && table.objectName !== 'UNKNOWN' ? table.objectName : stem(fileIn.name) || t('page.files.table');
    void open(newFlightMission(name, flight, 'import'), table);
  };
  const found = fileIn.search;
  return (
    <Panel title={t('page.files.maneuvers')}>
      {nb === 0 ? <p className="note">{t('page.files.noBoundaries')}</p> : (
        <>
          <p className="note">{t('page.files.boundaries')}</p>
          <div className="scroll"><table className="data">
            <thead><tr><th>{t('page.files.use')}</th><th>{t('common.time')}</th><th className="r">{t('page.files.dv')}</th></tr></thead>
            <tbody>
              {fileIn.boundaries.map((b, k) => (
                <tr key={k}>
                  <td><input type="checkbox" checked={fileIn.use[k] ?? false} aria-label={t('page.files.use')} onChange={() => toggle(k)} /></td>
                  <td className="nw"><Dt et={b.et} /></td>
                  <td className="r"><Val q={deltaV(b.dvMag)} kind="file.read" /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      <h3>{t('page.files.search')}<Src kind="forensics" /></h3>
      <p className="note">{t('page.files.searchIntro')}</p>
      {!inRange ? <p className="note">{t('page.files.noCoverage')}</p> : (
        <div className="row">
          <Field label={t('page.files.threshold')}><NumberInput value={threshold} unit="m/s" min={0.001} max={1e5} onChange={setThreshold} /></Field>
          <button type="button" className="btn" disabled={!!busy || table.et.length < 2} onClick={() => void search()}>{t(found ? 'page.files.searchAgain' : 'page.files.search')}</button>
        </div>
      )}
      {found && (
        <>
          <dl className="kv">
            <dt title={t('page.files.noiseHint')}>{t('page.files.noise')}</dt><dd><Val q={deltaV(found.noiseFloor)} kind="forensics" /></dd>
            {found.skipped > 0 && <><dt>{t('page.files.skipped')}</dt><dd><span className="num">{fixed(found.skipped, 0)}</span></dd></>}
          </dl>
          <p className="note">{t('page.files.noiseHint')}{found.skipped > 0 && <> {t('page.files.skippedHint')}</>}</p>
          {found.candidates.length === 0 ? <p className="note">{t('page.files.searchNone')}</p> : (
            <>
              <div className="scroll" style={{ maxHeight: 360 }}><table className="data">
                <thead><tr><th>{t('page.files.use')}</th><th>{t('page.files.between')}</th><th>{t('page.files.estTime')}</th><th className="r">{t('page.files.dv')}</th><th className="r">{t('page.files.gap')}</th><th>{t('page.files.flyby')}</th></tr></thead>
                <tbody>
                  {found.candidates.map((c, k) => (
                    <tr key={k}>
                      <td><input type="checkbox" checked={fileIn.use[nb + k] ?? false} aria-label={t('page.files.use')} onChange={() => toggle(nb + k)} /></td>
                      <td className="nw"><Dt et={c.et0} precision="minute" /> – <Dt et={c.et1} precision="minute" /></td>
                      <td className="nw"><Dt et={c.et} precision="minute" /></td>
                      <td className="r"><Val q={deltaV(c.dvMag)} kind="forensics" /></td>
                      <td className="r">{Number.isFinite(c.gapKm) ? <Val q={distance(c.gapKm, 'km')} /> : <span className="dim">—</span>}</td>
                      <td>{c.flyby ? <span className="tag warn">{bodyName(c.flyby)}</span> : <span className="dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {found.candidates.some((c) => c.flyby) && <p className="note">{t('page.files.flybyNote')}</p>}
            </>
          )}
        </>
      )}
      {inRange && (
        <>
          <h3>{t('page.files.newFlight')}</h3>
          <div className="grid2 dates">
            <Field label={t('page.files.startAt')}><DateInput et={table.et[span[0]]} min={table.et[0]} max={table.et[n - 1]} onChange={(et) => setSpan([Math.min(nearest(et, true), span[1] - 1), span[1]])} /></Field>
            <Field label={t('page.files.endAt')}><DateInput et={table.et[span[1]]} min={table.et[0]} max={table.et[n - 1]} onChange={(et) => setSpan([span[0], Math.max(nearest(et, false), span[0] + 1)])} /></Field>
          </div>
          <div className="row">
            <button type="button" className="btn primary" disabled={!!busy || n < 2} onClick={make}>{t('page.files.makeMission')}</button>
            {hasFlight && reference !== table && <button type="button" className="btn" onClick={() => setReference(table)}>{t('page.files.compare')}</button>}
          </div>
          <p className="note">{t('page.files.spanNote')} {t('page.files.makeNote')}{hasFlight && <> {t('page.files.compareNote')}</>}</p>
        </>
      )}
    </Panel>
  );
}

function OpmPanel({ fileIn, opm }: { fileIn: FileIn; opm: Opm }) {
  const sys = system();
  const open = useOpen();
  const lastBurn = opm.maneuvers.reduce((m, x) => Math.max(m, x.et), opm.et);
  const [etEnd, setEtEnd] = useState(Math.min(sys.etEnd, Math.max(opm.et + 365 * DAY, lastBurn + 30 * DAY)));
  const [problem, setProblem] = useState<Problem | null>(null);
  const inRange = opm.et >= sys.etStart && opm.et < sys.etEnd;
  const make = () => {
    try {
      const flight = flightFromOpm(sys, opm, FULL_MODEL, etEnd);
      setProblem(null);
      const name = opm.objectName && opm.objectName !== 'UNKNOWN' ? opm.objectName : stem(fileIn.name) || t('page.files.opm');
      void open(newFlightMission(name, flight, 'import'), null);
    } catch (e) { setProblem(problemOf(e)); }
  };
  const sc = opm.spacecraft;
  return (
    <Panel title={t('page.files.opm')}>
      <dl className="kv">
        <dt>{t('page.files.object')}</dt><dd>{opm.objectName}</dd>
        <dt>{t('page.files.objectId')}</dt><dd><span className="num">{opm.objectId}</span></dd>
        <dt>{t('page.files.center')}</dt><dd>{bodyName(opm.center)}</dd>
        <dt>{t('page.files.frame')}</dt><dd>{t('frameLong.' + opm.frame)}</dd>
        <dt>{t('page.files.fileScale')}</dt><dd>{opm.timeScale}</dd>
        <dt>{t('page.files.opmEpoch')}</dt><dd><Dt et={opm.et} precision="milli" /></dd>
        {(['x', 'y', 'z'] as const).map((axis, k) => <FragmentRow key={axis} label={t('common.' + axis)}><Val q={distance(opm.state.r[k], 'km', 6)} kind="file.read" /></FragmentRow>)}
        {(['x', 'y', 'z'] as const).map((axis, k) => <FragmentRow key={'v' + axis} label={'V' + t('common.' + axis)}><Val q={speed(opm.state.v[k], 9)} kind="file.read" /></FragmentRow>)}
        {sc?.massKg !== undefined && <><dt>{t('page.files.opmMass')}</dt><dd><Val q={mass(sc.massKg)} kind="file.read" /></dd></>}
        {sc?.solarRadAreaM2 !== undefined && sc.solarRadCoeff !== undefined && <><dt>{t('page.files.opmSrp')}</dt><dd><span className="num">{sig(sc.solarRadAreaM2, 6)}</span><span className="unit">m²</span> · <span className="num">{sig(sc.solarRadCoeff, 6)}</span></dd></>}
      </dl>
      <h3>{t('page.files.opmManeuvers')}</h3>
      {opm.maneuvers.length === 0 ? <p className="note">{t('page.files.opmNoManeuvers')}</p> : (
        <div className="scroll"><table className="data">
          <thead><tr><th>{t('common.time')}</th><th className="r">{t('page.files.duration')}</th><th className="r">{t('page.files.dv')}</th><th>{t('page.files.manFrame')}</th><th className="r">{t('page.files.deltaMass')}</th></tr></thead>
          <tbody>
            {opm.maneuvers.map((m, k) => (
              <tr key={k}>
                <td className="nw"><Dt et={m.et} /></td>
                <td className="r"><Val q={num(fixed(m.durationS, 3), 's')} /></td>
                <td className="r"><Val q={deltaV(norm(m.dv))} kind="file.read" /></td>
                <td>{t('frame.' + m.frame)}</td>
                <td className="r"><Val q={num(fixed(m.deltaMassKg, 3), 'kg')} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {!inRange ? <p className="note">{t('page.files.noCoverage')}</p> : (
        <>
          <Field label={t('page.files.opmEnd')}><DateInput et={etEnd} min={opm.et + 60} max={sys.etEnd} nudge onChange={setEtEnd} /></Field>
          <div className="row"><button type="button" className="btn primary" onClick={make}>{t('page.files.opmMake')}</button></div>
          <p className="note">{t('page.files.opmMakeNote')}</p>
        </>
      )}
      {problem && <ProblemBox problem={problem} />}
    </Panel>
  );
}
function FragmentRow({ label, children }: { label: string; children: ReactNode }) {
  return <><dt>{label}</dt><dd>{children}</dd></>;
}

function MissionFilePanel({ mission }: { mission: Mission }) {
  const open = useOpen();
  return (
    <Panel title={t('page.files.missionFile')}>
      <dl className="kv">
        <dt>{t('common.name')}</dt><dd>{mission.name}</dd>
        <dt>{t('page.files.missionPlan')}</dt><dd>{mission.plan ? mission.plan.nodes.map((n) => bodyName(n.body)).join(' → ') : t('common.none')}</dd>
        <dt>{t('page.files.missionFlight')}</dt><dd>{t(mission.flight ? 'common.yes' : 'common.no')}</dd>
      </dl>
      <div className="row"><button type="button" className="btn primary" onClick={() => void open(mission, null)}>{t('page.files.openMission')}</button></div>
    </Panel>
  );
}

/** Distance between the flight of the mission and the trajectory of the file, at the samples of the file. */
function DifferencePanel({ trajectory, reference }: { trajectory: Trajectory; reference: EphemerisTable }) {
  const setReference = useApp((s) => s.setReference);
  const { et } = useClock(250);
  const diff = useMemo(() => { try { return tableDifference(system(), trajectory, reference); } catch { return null; } }, [trajectory, reference]);
  const chart = useMemo(() => {
    if (!diff || diff.et.length < 2) return null;
    const log = new Float32Array(diff.km.length);
    for (let i = 0; i < log.length; i++) log[i] = Math.log10(Math.max(diff.km[i], 1e-6));
    const marks = trajectory.events.filter((e) => (e.type === 'periapsis' && e.body) || e.type === 'maneuver').map((e) => ({ et: e.et, text: e.type === 'periapsis' ? bodyName(e.body!) : '' }));
    return { log, marks };
  }, [diff, trajectory]);
  const n = diff?.km.length ?? 0;
  return (
    <Panel title={<>{t('page.files.difference')}<Src kind="file.difference" /></>} actions={<button type="button" className="btn small" onClick={() => setReference(null)}>{t('page.files.removeReference')}</button>}>
      <p className="note">{t('page.files.differenceIntro')}</p>
      {!diff ? <p className="note">{t('page.files.diffNone')}</p> : (
        <>
          <dl className="kv wide">
            <dt>{t('page.files.diffMax')}</dt><dd><Val q={distance(diff.maxKm, 'km')} kind="file.difference" /></dd>
            <dt>{t('page.files.diffAt')}</dt><dd><Dt et={diff.maxEt} precision="minute" /></dd>
            <dt>{t('page.files.diffEnd')}</dt><dd><Val q={distance(diff.km[n - 1], 'km')} kind="file.difference" /></dd>
            <dt>{t('page.files.diffSamples')}</dt><dd><span className="num">{fixed(n, 0)}</span></dd>
          </dl>
          {chart && <DiffChart times={diff.et} series={[{ id: 'file', color: COLORS.accent, log: chart.log }]} marks={chart.marks} markEt={et} label={t('page.files.diffLabel')} />}
        </>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------ write

interface Built { text: string; lines: number; preview: string; problem: Problem | null }

function finish(text: string): Built {
  let lines = 0, cut = -1;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) { lines++; if (lines === PREVIEW_LINES) cut = i; }
  if (text.length > 0 && !text.endsWith('\n')) lines++;
  return { text, lines, preview: cut >= 0 ? text.slice(0, cut) : text.replace(/\n$/, ''), problem: null };
}
const sizeText = (bytes: number): Quantity => (bytes >= 1e6 ? num(fixed(bytes / 1e6, 1), 'MB') : num(fixed(bytes / 1e3, 1), 'kB'));

function WritePanel() {
  const mission = useApp((s) => s.mission);
  const trajectory = useApp((s) => s.trajectory);
  const stale = useApp((s) => s.flightStale);
  const settings = useApp((s) => s.settings);
  const go = useApp((s) => s.go);
  const out = useDrafts((d) => d.fileOut);
  const setDrafts = useDrafts((d) => d.set);
  const set = (p: Partial<FileOut>) => setDrafts({ fileOut: { ...out, ...p } });
  const sys = system();
  const flight = mission?.flight ?? null;
  const ready = !!flight && !!trajectory;
  const format = ready ? out.format : 'mission';
  const isTable = format === 'oem' || format === 'stk' || format === 'csv';
  const name = (out.objectName ?? mission?.name ?? '').trim() || 'APSIS';
  const center = format === 'stk' && (out.center ?? settings.center) === 'SSB' ? 'SUN' : out.center ?? settings.center;
  const timeScale = format === 'stk' ? 'UTC' : out.timeScale ?? settings.timeScale;
  const frame: FrameId = format === 'csv' ? out.frame ?? settings.frame : 'ICRF';
  const stepS = out.step * STEP_S[out.stepUnit];

  // The table and its interpolation check do not change with the names: they are calculated one time for each selection.
  const table = useMemo((): { table: EphemerisTable | null; problem: Problem | null } => {
    if (!isTable || !trajectory) return { table: null, problem: null };
    try {
      const opts = { center, frame, timeScale, objectName: '', objectId: '' };
      const count = out.sampling === 'steps' ? trajectory.t.length * (out.between + 1) : Math.abs(trajectory.et1 - trajectory.et0) / stepS;
      if (!(count <= MAX_SAMPLES_OUT)) throw new IoError('sample.size');
      return { table: out.sampling === 'steps' ? tableFromTrajectorySteps(sys, trajectory, { ...opts, between: out.between }) : tableFromTrajectory(sys, trajectory, { ...opts, stepS }), problem: null };
    } catch (e) { return { table: null, problem: problemOf(e) }; }
  }, [isTable, trajectory, sys, center, frame, timeScale, out.sampling, out.between, stepS]);
  const check = useMemo((): TableCheck | null => {
    if (!table.table || !trajectory || !flight) return null;
    try { return checkTableInterpolation(sys, trajectory, flight.model, table.table); } catch { return null; }
  }, [table, trajectory, flight, sys]);
  const differences = useMemo(() => (format === 'gmat' && flight ? gmatDifferences({ sys, flight }) : []), [format, flight, sys]);

  const built = useMemo((): Built => {
    const none: Built = { text: '', lines: 0, preview: '', problem: null };
    if (!mission) return none;
    try {
      if (format === 'mission') return finish(missionFileText(mission) + '\n');
      if (!flight || !trajectory) return none;
      // The text in a file for other programs is English in all languages of the user interface (ASCII characters only).
      const comments = [tEnglish('page.files.comment', { app: tEnglish('app.name'), version: APP_VERSION, name: mission.name }), tEnglish('page.files.commentModel', { app: tEnglish('app.name') })];
      const header = { originator: tEnglish('app.name').toUpperCase(), creationEt: nowEt() };
      if (isTable) {
        if (!table.table) return { ...none, problem: table.problem };
        const full: EphemerisTable = { ...table.table, objectName: name, objectId: out.objectId.trim() || 'UNKNOWN', comments };
        if (format === 'oem') return finish(writeOem(full, header));
        // 4 samples with their velocities: a Hermite polynomial of degree 7, the interpolation of the check.
        if (format === 'stk') return finish(writeStkEphemeris(full, { interpolation: 'Hermite', samplesM1: 3 }));
        return finish(writeCsv(full, { time: out.csvTime }));
      }
      if (format === 'opm') {
        const sc = mission.spacecraft;
        const opm = opmFromFlight(sys, flight, { objectName: name, objectId: out.objectId.trim() || 'UNKNOWN', center, frame: 'ICRF', timeScale, comments, spacecraft: { massKg: sc.dryMassKg + sc.propellantKg, ispS: sc.ispS } });
        return finish(writeOpm(opm, header));
      }
      const sc = mission.spacecraft;
      return finish(writeGmatScript({
        sys, flight, trajectory, comments: [...comments, ...differences.map((d) => tEnglish('gmatDiff.' + d.split('.')[1]))], massKg: sc.dryMassKg + sc.propellantKg,
        axes: out.gmatAxes, output: out.gmatOutput, setGm: out.gmatSetGm, ...(out.gmatSource.trim() ? { ephemerisSource: out.gmatSource.trim() } : {}),
      }));
    } catch (e) { return { ...none, problem: problemOf(e) }; }
  }, [mission, flight, trajectory, format, isTable, table, name, out.objectId, out.csvTime, out.gmatAxes, out.gmatOutput, out.gmatSetGm, out.gmatSource, center, timeScale, differences, sys]);

  if (!mission) {
    return (
      <Panel title={t('page.files.write')}>
        <p className="note">{t('page.files.noMission')}</p>
        <div className="row"><button type="button" className="btn" onClick={() => go({ mode: 'expert', page: 'mission' })}>{t('nav.mission')}</button></div>
      </Panel>
    );
  }
  const fileName = (slug(name) || 'flight') + EXTENSION[format];
  const sc = mission.spacecraft;
  const formats = ready ? WRITE_FORMATS : (['mission'] as FileOut['format'][]);
  const bad = check !== null && check.maxKm > 1;
  return (
    <Panel title={t('page.files.write')}>
      {!ready && <div className="banner">{t('page.files.noFlight')}</div>}
      {ready && stale && <div className="banner warn">{t('page.files.flightOld')}</div>}
      <Field label={t('page.files.format')}>
        <Select value={format} onChange={(f) => set({ format: f })} options={formats.map((f) => ({ value: f, label: t('fileFormatLong.' + f) }))} />
      </Field>
      {format === 'mission' && <p className="note">{t('page.files.missionNote')}</p>}
      {format !== 'mission' && format !== 'gmat' && (
        <div className="grid2">
          <Field label={t('page.files.objectName')}><TextInput value={out.objectName ?? mission.name} onChange={(v) => set({ objectName: v })} /></Field>
          <Field label={t('page.files.objectId')} hint={format === 'csv' ? undefined : t('page.files.objectIdHint')}><TextInput value={out.objectId} onChange={(v) => set({ objectId: v })} /></Field>
        </div>
      )}
      {(isTable || format === 'opm') && (
        <div className="grid2">
          <Field label={t('page.files.optCenter')}><BodySelect value={center} extra={format === 'stk' ? undefined : ['SSB']} onChange={(c) => set({ center: c })} /></Field>
          {format === 'stk'
            ? <Group label={t('page.files.fileScale')}><span className="note">{t('page.files.scaleFixed')}</span></Group>
            : <Field label={t('page.files.fileScale')}><Select value={timeScale} onChange={(s) => set({ timeScale: s })} options={SCALES.map((s) => ({ value: s, label: s }))} /></Field>}
          {format === 'csv'
            ? <Field label={t('page.files.optFrame')}><Select value={frame} onChange={(f) => set({ frame: f })} options={FRAMES.map((f) => ({ value: f, label: t('frameLong.' + f) }))} /></Field>
            : <Group label={t('page.files.optFrame')}><span className="note">{t('page.files.frameFixed')}</span></Group>}
          {format === 'csv' && <Field label={t('page.files.csvTime')}><Select value={out.csvTime} onChange={(v) => set({ csvTime: v })} options={[{ value: 'iso', label: t('page.files.csvIso') }, { value: 'jd', label: t('page.files.csvJd') }]} /></Field>}
        </div>
      )}
      {isTable && (
        <>
          <div className="row">
            <Group label={t('page.files.sampling')}><Seg value={out.sampling} onChange={(v) => set({ sampling: v })} options={[{ value: 'steps', label: t('page.files.samplingSteps') }, { value: 'fixed', label: t('page.files.samplingFixed') }]} /></Group>
            {out.sampling === 'steps'
              ? <Field label={t('page.files.samplesBetween')}><NumberInput value={out.between} min={0} max={64} digits={0} onChange={(v) => set({ between: Math.round(v) })} /></Field>
              : (
                <Field label={t('page.files.step')}>
                  <span className="with-unit">
                    <NumberInput value={out.step} min={1e-3} max={1e6} onChange={(v) => set({ step: v })} label={t('page.files.step')} />
                    <Select value={out.stepUnit} onChange={(u) => set({ stepUnit: u })} options={(['s', 'min', 'h', 'd'] as const).map((u) => ({ value: u, label: u }))} />
                  </span>
                </Field>
              )}
          </div>
          <p className="note">{t('page.files.samplingNote')}</p>
        </>
      )}
      {format === 'opm' && <p className="note">{t('page.files.opmNote')} {t('page.files.opmMassNote', { mass: `${mass(sc.dryMassKg + sc.propellantKg).text} kg`, isp: `${fixed(sc.ispS, 0)} s` })}</p>}
      {format === 'gmat' && (
        <>
          <div className="grid2">
            <Field label={t('page.files.gmatAxes')}><Select value={out.gmatAxes} onChange={(v) => set({ gmatAxes: v })} options={[{ value: 'MJ2000Eq', label: 'MJ2000Eq' }, { value: 'ICRF', label: 'ICRF' }]} /></Field>
            <Field label={t('page.files.gmatOutput')}><Select value={out.gmatOutput} onChange={(v) => set({ gmatOutput: v })} options={[{ value: 'both', label: t('page.files.gmatBoth') }, { value: 'report', label: t('page.files.gmatReport') }, { value: 'oem', label: t('page.files.gmatOem') }]} /></Field>
            <Field label={t('page.files.gmatSource')} hint={t('page.files.gmatSourceHint')}><TextInput value={out.gmatSource} onChange={(v) => set({ gmatSource: v })} /></Field>
            <Check checked={out.gmatSetGm} onChange={(v) => set({ gmatSetGm: v })} label={t('page.files.gmatSetGm')} />
          </div>
          <p className="note">{t('page.files.gmatAxesNote')}</p>
          <h3>{t('page.files.gmatDifferences')}</h3>
          <ul className="note list">{differences.map((d) => <li key={d}>{t('gmatDiff.' + d.split('.')[1])}</li>)}</ul>
        </>
      )}
      {built.problem && <ProblemBox problem={built.problem} />}
      {isTable && table.table && check && (
        <>
          <h3>{t('page.files.check')}<Src kind="file.check" /></h3>
          <dl className="kv">
            <dt>{t('page.files.samples')}</dt><dd><span className="num">{fixed(table.table.et.length, 0)}</span></dd>
            <dt>{t('page.files.checkText')}</dt><dd><Val q={check.maxKm < 1 ? num(sig(check.maxKm * 1000, 3), 'm') : distance(check.maxKm, 'km')} kind="file.check" className={bad ? 'bad' : 'good'} /></dd>
            <dt>{t('page.files.checkAt')}</dt><dd><Dt et={check.et} precision="minute" /></dd>
            <dt>{t('page.files.checkCount')}</dt><dd><span className="num">{t('page.files.checkCountValue', { n: fixed(check.examined, 0), total: fixed(check.intervals, 0) })}</span></dd>
          </dl>
          <div className={'banner ' + (bad ? 'bad' : 'good')}>{t(bad ? 'page.files.checkBad' : 'page.files.checkGood')}</div>
        </>
      )}
      {built.text !== '' && (
        <>
          <h3>{t('page.files.preview')}</h3>
          <pre className="filetext" tabIndex={0}>{built.preview}</pre>
          {built.lines > PREVIEW_LINES && <p className="note">{t('page.files.moreLines', { n: fixed(built.lines - PREVIEW_LINES, 0) })}</p>}
          <dl className="kv">
            <dt>{t('page.files.fileName')}</dt><dd><span className="num">{fileName}</span></dd>
            <dt>{t('page.files.lines')}</dt><dd><span className="num">{fixed(built.lines, 0)}</span></dd>
            <dt>{t('page.files.fileSize')}</dt><dd><Val q={sizeText(built.text.length)} /></dd>
          </dl>
          <div className="row"><button type="button" className="btn primary" onClick={() => downloadText(fileName, built.text, format === 'mission' ? 'application/json' : 'text/plain')}>{t('page.files.writeFile')}</button></div>
          {format !== 'mission' && format !== 'csv' && <p className="note">{t('page.files.notVerified')}</p>}
        </>
      )}
    </Panel>
  );
}

export default function Files() {
  const fileIn = useDrafts((d) => d.fileIn);
  const trajectory = useApp((s) => s.trajectory);
  const reference = useApp((s) => s.reference);
  return (
    <>
      <PageHead id="files" />
      <div className="cols even">
        <div className="stack">
          <ReadPanel />
          {fileIn?.table && <TablePanel fileIn={fileIn} table={fileIn.table} />}
          {fileIn?.opm && <OpmPanel key={fileIn.serial} fileIn={fileIn} opm={fileIn.opm} />}
          {fileIn?.mission && <MissionFilePanel mission={fileIn.mission} />}
        </div>
        <WritePanel />
      </div>
      {fileIn?.table && <ApproachPanel fileIn={fileIn} />}
      {fileIn?.table && <ManeuverPanel key={fileIn.serial} fileIn={fileIn} table={fileIn.table} />}
      {trajectory && reference && <DifferencePanel trajectory={trajectory} reference={reference} />}
    </>
  );
}
