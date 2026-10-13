/**
 * Reader for the text of a JPL Horizons "Vectors" table (https://ssd.jpl.nasa.gov/horizons/).
 *
 * The data are between the lines $$SOE and $$EOE. Three forms are read:
 *   CSV      : 2433300.500000000, A.D. 1950-Jan-19 00:00:00.0000, X, Y, Z, VX, VY, VZ, [LT, RG, RR,]
 *   labelled : 2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB
 *               X =-7.147205881293523E+07 Y = 1.180540388819448E+08 Z = 5.119852524884287E+07
 *               VX=-2.653834516507536E+01 VY=-1.337765654695384E+01 VZ=-5.802556846502521E+00
 *   plain    : the same lines with no labels
 * The header of the table gives the target, the centre, the units and the frame. Only geometric states relative
 * to the centre of a body are read (not states with a light-time correction, not a site on a surface, not elements).
 *
 * Time. The first number of a record is a Julian date: TDB (column JDTDB) or UT (column JDUT).
 * The Julian date is read as text (integer part and fraction): the 9 decimals give a resolution of 86.4 microseconds.
 * A UT table with the difference TDB - UT in each record (delta-T, option VEC_DELTA_T) is converted with that
 * difference. A UT table with no difference is read as UTC. That is possible only from 1972: before 1972 the UT of
 * Horizons is UT1 or the UTC of that time, and this application has no data for these scales.
 */
import type { State } from '../vec';
import type { FrameId } from '../frames';
import { J2000_JD, DAY, secondsToCalendar, utcToEt } from '../time';
import { AU } from '../bodies';
import { type EphemerisTable, IoError, textLines, parseReal, centerFromNaif } from './types';

export interface HorizonsReadOptions {
  /** Centre, used only if the text has no header line with the centre. */
  center?: string;
  /** Frame, used only if the text has no header line with the frame. */
  frame?: FrameId;
  /** Units, used only if the text has no header line with the units. */
  units?: 'KM-S' | 'AU-D' | 'KM-D';
  /** Time scale of the Julian dates, used only if the text does not show it. */
  timeScale?: 'TDB' | 'UTC';
}

/** 1972-01-01 00:00:00 UTC, the start of the UTC with leap seconds, as seconds of the calendar reading after J2000. */
const UTC_1972 = (2441317.5 - J2000_JD) * DAY;
const LABELLED = /\b(VX|VY|VZ|X|Y|Z)\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
const EPOCH_LINE = /^\s*(\d+)\.(\d+)\s*=\s*[AB]\.[DC]\.\s*\S+\s+\S+(?:\s+(TDB|UT1|UTC|UT~|UT|CT))?(?:\s*\[del_T=\s*([-+]?[\d.]+)\s*s\])?\s*$/;
/** Header lines that the reader uses: label of the line, key in this module. */
const HEADER: [RegExp, string][] = [
  [/^Target body name\s*:\s*(.*?)\s*(?:\{.*)?$/, 'target'],
  [/^Center body name\s*:\s*(.*?)\s*(?:\{.*)?$/, 'center'],
  [/^Center-site name\s*:\s*(.*?)\s*$/, 'site'],
  [/^Output units\s*:\s*(.*?)\s*$/, 'units'],
  [/^Output type\s*:\s*(.*?)\s*$/, 'type'],
  [/^Output format\s*:\s*(.*?)\s*$/, 'format'],
  [/^Reference frame\s*:\s*(.*?)\s*$/, 'frame'],
];

interface Entry { value: string; line: number }
interface Rec { line: number; whole: string; fraction: string; deltaT: number | null; label: string | null; x: number[] }

/** Seconds after J2000 of a Julian date given as the text of its integer part and of its fraction. */
function jdSeconds(whole: string, fraction: string): number {
  return (Number(whole) - J2000_JD) * DAY + Number('0.' + (fraction || '0')) * DAY;
}

/**
 * Read the text of a Horizons vector table (position and velocity). The table gets one segment.
 * The time scale of the table is 'TDB' or 'UTC' (for all the UT tables).
 */
export function parseHorizonsVectors(text: string, opts: HorizonsReadOptions = {}): EphemerisTable {
  const lines = textLines(text);
  const soe = lines.findIndex((l) => l.trim() === '$$SOE');
  if (soe < 0) throw new IoError('horizons.soe', lines.length, '$$SOE');
  const eoe = lines.findIndex((l, k) => k > soe && l.trim() === '$$EOE');
  if (eoe < 0) throw new IoError('horizons.soe', lines.length, '$$EOE');

  // ---- header
  const head = new Map<string, Entry>();
  let scale: 'TDB' | 'UTC' | undefined = opts.timeScale;
  let columns: string[] | null = null;
  for (let k = 0; k < soe; k++) {
    const l = lines[k];
    for (const [pattern, key] of HEADER) {
      const m = pattern.exec(l);
      if (m) head.set(key, { value: m[1], line: k + 1 });
    }
    // Names of the columns: one line with commas (CSV form), or the name of the time column alone.
    const time = /^\s*JD(TDB|UT)\b/.exec(l);
    if (time) {
      scale = time[1] === 'TDB' ? 'TDB' : 'UTC';
      if (l.includes(',')) columns = l.split(',').map((c) => c.trim().replace(/\s+/g, ' '));
    }
  }
  // The checks are in this order: what the table is, where its origin is, its units, its axes.
  const type = head.get('type');
  // States with a light-time or aberration correction are not points of a trajectory. Elements are not states.
  if (type && !/^GEOMETRIC cartesian states$/i.test(type.value)) throw new IoError('horizons.type', type.line, type.value);
  const format = head.get('format');
  // 2 = position and velocity, 3 = the same with light time, range and range rate. 1 = position only.
  if (format && !/^[23]\b/.test(format.value)) throw new IoError('horizons.velocity', format.line, format.value);
  let center = opts.center;
  const cen = head.get('center');
  if (cen) {
    const code = /\((-?\d+)\)$/.exec(cen.value);
    const id = code ? centerFromNaif(Number(code[1])) : null;
    if (!id) throw new IoError('horizons.center', cen.line, cen.value);
    center = id;
  }
  if (!center) throw new IoError('horizons.center', soe + 1);
  const site = head.get('site');
  // A site on the surface of a body is not a centre of this application.
  if (site && site.value.toUpperCase() !== 'BODY CENTER') throw new IoError('horizons.center', site.line, site.value);
  let units = opts.units;
  const un = head.get('units');
  if (un) {
    const u = un.value.toUpperCase();
    if (u !== 'KM-S' && u !== 'AU-D' && u !== 'KM-D') throw new IoError('horizons.units', un.line, un.value);
    units = u;
  }
  if (!units) throw new IoError('horizons.units', soe + 1);
  let frame = opts.frame;
  const fr = head.get('frame');
  if (fr) {
    if (fr.value === 'ICRF') frame = 'ICRF';
    else if (fr.value === 'Ecliptic of J2000.0') frame = 'ECLIPJ2000';
    else throw new IoError('horizons.frame', fr.line, fr.value);
  }
  if (!frame) throw new IoError('horizons.frame', soe + 1);
  const kr = units === 'AU-D' ? AU : 1;
  const kv = units === 'AU-D' ? AU / DAY : units === 'KM-D' ? 1 / DAY : 1;
  let objectName = 'UNKNOWN', objectId = 'UNKNOWN';
  const target = head.get('target');
  if (target && target.value !== '') {
    const id = /^(.*\S)\s*\((-?\d+)\)$/.exec(target.value);
    objectName = id ? id[1] : target.value;
    if (id) objectId = id[2];
  }

  // ---- records
  const recs: Rec[] = [];
  let first = soe + 1;
  while (first < eoe && lines[first].trim() === '') first++;
  if (first >= eoe) throw new IoError('horizons.data', soe + 1);
  if (lines[first].includes(',')) {
    // CSV form. With no line of column names the usual order is assumed.
    let iJd = 0, iDt = -1, iX = 2;
    if (columns) {
      const names = columns;
      iJd = names.findIndex((c) => /^JD(TDB|UT)$/.test(c));
      iDt = names.findIndex((c) => /^delta-T$/i.test(c));
      iX = names.indexOf('X');
      if (iJd < 0 || iX < 0) throw new IoError('horizons.state', first + 1);
      if (!['Y', 'Z', 'VX', 'VY', 'VZ'].every((n, j) => names[iX + 1 + j] === n)) throw new IoError('horizons.velocity', first + 1);
    }
    for (let k = first; k < eoe; k++) {
      if (lines[k].trim() === '') continue;
      const c = lines[k].split(',').map((s) => s.trim());
      if (c[c.length - 1] === '') c.pop();
      let jDt = iDt, jX = iX;
      if (!columns) {
        // 8 or 11 values: no delta-T. 9 or 12 values: delta-T is the third value. 5 or 6 values: position only.
        if (c.length === 5 || c.length === 6) throw new IoError('horizons.velocity', k + 1);
        if (c.length === 9 || c.length === 12) { jDt = 2; jX = 3; }
      }
      const jd = /^(\d+)\.(\d*)$/.exec(c[iJd] ?? '');
      const x = c.slice(jX, jX + 6).map(parseReal);
      if (!jd || x.length !== 6 || x.some(Number.isNaN)) throw new IoError('horizons.state', k + 1);
      const dt = jDt >= 0 ? parseReal(c[jDt] ?? '') : null;
      if (dt !== null && Number.isNaN(dt)) throw new IoError('horizons.state', k + 1);
      recs.push({ line: k + 1, whole: jd[1], fraction: jd[2], deltaT: dt, label: null, x });
    }
  } else {
    // Labelled or plain form: one line with the time, then the lines with the numbers.
    let rec: Rec | null = null;
    let body: string[] = [];
    const close = (): void => {
      if (!rec) return;
      const joined = body.join(' ');
      const labelled = new Map<string, number>();
      for (const m of joined.matchAll(LABELLED)) labelled.set(m[1], Number(m[2]));
      if (labelled.size > 0) {
        if (labelled.has('X') && !labelled.has('VX')) throw new IoError('horizons.velocity', rec.line);
        rec.x = ['X', 'Y', 'Z', 'VX', 'VY', 'VZ'].map((n) => labelled.get(n) ?? NaN);
      } else {
        const all = joined.trim() === '' ? [] : joined.trim().split(/\s+/).map(parseReal);
        if (all.length === 3 && !all.some(Number.isNaN)) throw new IoError('horizons.velocity', rec.line);
        rec.x = all.slice(0, 6);
      }
      if (rec.x.length !== 6 || !rec.x.every(Number.isFinite)) throw new IoError('horizons.state', rec.line);
      recs.push(rec);
    };
    for (let k = first; k < eoe; k++) {
      if (lines[k].trim() === '') continue;
      const m = EPOCH_LINE.exec(lines[k]);
      if (m) {
        close();
        rec = { line: k + 1, whole: m[1], fraction: m[2], deltaT: m[4] !== undefined ? parseReal(m[4]) : null, label: m[3] ?? null, x: [] };
        if (rec.deltaT !== null && Number.isNaN(rec.deltaT)) throw new IoError('horizons.state', k + 1);
        body = [];
      } else if (!rec) {
        throw new IoError('horizons.state', k + 1);
      } else {
        body.push(lines[k]);
      }
    }
    close();
  }

  // ---- time scale and conversion
  const label = recs[0].label;
  if (label) scale = label.startsWith('UT') ? 'UTC' : 'TDB';
  if (!scale) throw new IoError('horizons.time', recs[0].line);
  const et: number[] = [];
  const states: State[] = [];
  for (const r of recs) {
    const sec = jdSeconds(r.whole, r.fraction);
    let t: number;
    if (scale === 'TDB') t = sec;
    else if (r.deltaT !== null) t = sec + r.deltaT;
    else {
      // UT with no difference to TDB: the record must be in the UTC with leap seconds.
      if (sec < UTC_1972 || r.label === 'UT1') throw new IoError('horizons.ut', r.line);
      t = utcToEt(secondsToCalendar(sec));
    }
    if (et.length > 0 && !(t > et[et.length - 1])) throw new IoError('horizons.order', r.line);
    et.push(t);
    states.push({ r: [r.x[0] * kr, r.x[1] * kr, r.x[2] * kr], v: [r.x[3] * kv, r.x[4] * kv, r.x[5] * kv] });
  }
  return { objectName, objectId, center, frame, timeScale: scale, et, states, segmentStarts: [0] };
}
