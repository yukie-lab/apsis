/**
 * STK external ephemeris file (*.e), format EphemerisTimePosVel.
 * Source: help of Systems Tool Kit 13.1.0, page "Ephemeris File Format (*.e)"
 * (https://help.agi.com/stk/Content/stk/importfiles-02.htm) and the sample files of that page.
 *
 * Time in the file: seconds after ScenarioEpoch. ScenarioEpoch is a Gregorian UTC date. The seconds are SI seconds
 * (the page: the keyword TimeScale with the value TDB makes them TDB seconds "not TAI").
 * A maneuver is a time in the block SegmentBoundaryTimes: the file then has two points with that time, the state
 * before and the state after the maneuver, and the reader does not interpolate across that time.
 */
import type { State } from '../vec';
import { stateToIcrf } from '../frames';
import { type Calendar, type TimeScale, etToUtc, utcToEt, etToTai, taiToEt } from '../time';
import { BODIES } from '../bodies';
import { type EphemerisTable, IoError, textLines, formatReal, parseReal, asciiText, segmentRanges, checkTable, centerFromName, checkedCalendarToEt } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number): string => String(n).padStart(2, '0');

export interface StkWriteOptions {
  /** Interpolation method that the file gives to STK (default Lagrange). */
  interpolation?: 'Lagrange' | 'Hermite';
  /** Number of interpolation points minus 1 (default 5, the default of STK). A short segment makes it smaller. */
  samplesM1?: number;
}

/**
 * Write a table as an STK ephemeris file, version stamp stk.v.11.0, CoordinateSystem ICRF, DistanceUnit Kilometers.
 * The centre must be a body (not a barycentre): its name is the Apsis id with a capital first letter (Sun, Earth).
 * ScenarioEpoch is the whole UTC second at or before the first time. A table in ECLIPJ2000 is rotated to the ICRF.
 * Times have 6 decimals of the second, positions and velocities have 16 significant digits.
 * The comments of the table are lines that start with '#' after the version stamp.
 */
export function writeStkEphemeris(table: EphemerisTable, opts: StkWriteOptions = {}): string {
  checkTable(table, 'stk.table');
  const body = BODIES[table.center];
  if (!body || body.naif === 0) throw new IoError('stk.center', undefined, table.center);
  const m1 = opts.samplesM1 ?? 5;
  if (!Number.isInteger(m1) || m1 < 1) throw new IoError('stk.option');
  const ranges = segmentRanges(table);

  // A leap second (second = 60) cannot be an epoch: use the second before it.
  const c = etToUtc(table.et[0]);
  const epoch: Calendar = { ...c, second: Math.min(59, Math.floor(c.second)) };
  const tai0 = etToTai(utcToEt(epoch));
  const seconds = table.et.map((t) => (etToTai(t) - tai0).toFixed(6));
  const width = seconds[seconds.length - 1].length;

  const shortest = Math.min(...ranges.map(([a, b]) => b - a + 1));
  const out: string[] = ['stk.v.11.0'];
  for (const text of table.comments ?? []) for (const part of text.split(/\r\n|\n|\r/)) out.push(('# ' + asciiText(part)).trimEnd());
  out.push(
    'BEGIN Ephemeris',
    'NumberOfEphemerisPoints ' + table.et.length,
    `ScenarioEpoch ${epoch.day} ${MONTHS[epoch.month - 1]} ${String(epoch.year).padStart(4, '0')} ${p2(epoch.hour)}:${p2(epoch.minute)}:${p2(epoch.second)}.000`,
    'InterpolationMethod ' + (opts.interpolation ?? 'Lagrange'),
    'InterpolationSamplesM1 ' + Math.max(1, Math.min(m1, shortest - 1)),
    'CentralBody ' + table.center[0] + table.center.slice(1).toLowerCase(),
    'CoordinateSystem ICRF',
    'DistanceUnit Kilometers',
  );
  if (ranges.length > 1) {
    out.push('BEGIN SegmentBoundaryTimes');
    for (const [a] of ranges.slice(1)) out.push('    ' + seconds[a]);
    out.push('END SegmentBoundaryTimes');
  }
  out.push('EphemerisTimePosVel');
  for (const [a, b] of ranges) {
    // By convention a blank line is between the two points of a segment boundary.
    if (a > 0) out.push('');
    for (let i = a; i <= b; i++) {
      const s = stateToIcrf(table.states[i], table.frame);
      out.push(seconds[i].padStart(width) + ' ' + [...s.r, ...s.v].map((x) => formatReal(x).padStart(23)).join(' '));
    }
  }
  out.push('END Ephemeris');
  return out.join('\n') + '\n';
}

export interface StkReadOptions {
  /** The file has no name of the object (default 'UNKNOWN'). */
  objectName?: string;
  objectId?: string;
}

/** Largest difference between a time of SegmentBoundaryTimes and the time of a point that is the same time, s. */
const BOUNDARY_TOLERANCE = 1e-6;

/**
 * Read an STK ephemeris file of the format EphemerisTimePosVel. DistanceUnit can be Meters (the default of the
 * format) or Kilometers. CoordinateSystem must be ICRF or J2000 (read as the axes of the ICRF). ScenarioEpoch is
 * necessary. The time scale of the table is UTC (the scale of ScenarioEpoch), or TDB if the file has TimeScale TDB.
 */
export function parseStkEphemeris(text: string, opts: StkReadOptions = {}): EphemerisTable {
  const lines = textLines(text);
  const comments: string[] = [];
  let i = 0;
  /** Go to the next line that is not empty and not a comment. Returns false at the end of the text. */
  const skip = (): boolean => {
    for (; i < lines.length; i++) {
      const s = lines[i].trim();
      if (s === '') continue;
      if (s.startsWith('#')) { comments.push(s.slice(1).trim()); continue; }
      return true;
    }
    return false;
  };
  if (!skip() || !/^stk\.v\.\d+\.\d+$/i.test(lines[i].trim())) throw new IoError('stk.header', Math.min(i + 1, lines.length));
  i++;
  if (!skip() || !/^BEGIN\s+Ephemeris$/i.test(lines[i].trim())) throw new IoError('stk.header', Math.min(i + 1, lines.length));
  const beginLine = i + 1;

  let unit = 1e-3; // the default distance unit of the format is the metre
  let frame: { value: string; line: number } | null = null;
  let center: { value: string; line: number } = { value: 'Earth', line: beginLine };
  let epoch: { value: string; line: number } | null = null;
  let scale: TimeScale = 'UTC';
  let maxPoints = Infinity;
  const boundaries: number[] = [];
  let formatLine = -1;
  for (i++; formatLine < 0; i++) {
    if (!skip()) throw new IoError('stk.format', lines.length);
    const s = lines[i].trim();
    const m = /^(\S+)(?:\s+(.*))?$/.exec(s)!;
    const key = m[1].toLowerCase(), value = (m[2] ?? '').trim();
    if (key === 'ephemeristimeposvel') { formatLine = i + 1; continue; }
    // Other formats (position only, with acceleration, latitude and longitude, covariance) are not read.
    if (/^(ephemeris|covariance)[a-z]*time/.test(key) || key === 'end') throw new IoError('stk.format', i + 1, m[1]);
    if (key === 'begin') {
      // A block in the header. Only the list of segment boundary times is used.
      const name = value.toLowerCase();
      const from = i + 1;
      for (i++; ; i++) {
        if (!skip()) throw new IoError('stk.header', from, value);
        const t = lines[i].trim();
        if (/^END\s+/i.test(t) && t.replace(/^END\s+/i, '').toLowerCase() === name) break;
        if (name !== 'segmentboundarytimes') continue;
        const x = parseReal(t);
        if (Number.isNaN(x)) throw new IoError('stk.boundary', i + 1);
        boundaries.push(x);
      }
      continue;
    }
    switch (key) {
      case 'numberofephemerispoints': {
        if (!/^\d+$/.test(value)) throw new IoError('stk.header', i + 1, m[1]);
        maxPoints = Number(value);
        break;
      }
      case 'scenarioepoch': epoch = { value, line: i + 1 }; break;
      case 'centralbody': center = { value, line: i + 1 }; break;
      case 'coordinatesystem': frame = { value, line: i + 1 }; break;
      case 'distanceunit': {
        const u = value.toLowerCase();
        if (u === 'kilometers' || u === 'kilometer' || u === 'km') unit = 1;
        else if (u === 'meters' || u === 'meter' || u === 'm') unit = 1e-3;
        else throw new IoError('stk.units', i + 1, value);
        break;
      }
      case 'timeformat': if (value.toLowerCase() !== 'epsec') throw new IoError('stk.timeFormat', i + 1, value); break;
      case 'timescale': {
        if (value.toUpperCase() !== 'TDB') throw new IoError('stk.timeScale', i + 1, value);
        scale = 'TDB';
        break;
      }
      default: break; // STK gives only a warning for a keyword that it does not know
    }
  }

  if (!frame || !/^(ICRF|J2000)$/i.test(frame.value)) throw new IoError('stk.frame', frame?.line ?? beginLine, frame?.value);
  const centerId = centerFromName(center.value);
  if (!centerId) throw new IoError('stk.center', center.line, center.value);
  if (!epoch) throw new IoError('stk.epoch', formatLine);
  const e = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2}(?:\.\d*)?)$/.exec(epoch.value);
  const month = e ? MONTHS.findIndex((x) => x.toLowerCase() === e[2].toLowerCase()) + 1 : 0;
  const epochEt = e && month > 0 ? checkedCalendarToEt({ year: +e[3], month, day: +e[1], hour: +e[4], minute: +e[5], second: +e[6] }, 'UTC') : null;
  if (epochEt === null) throw new IoError('stk.epoch', epoch.line, epoch.value);
  const tai0 = etToTai(epochEt);
  const toEt = (sec: number): number => (scale === 'TDB' ? epochEt + sec : taiToEt(tai0 + sec));

  const seconds: number[] = [];
  const states: State[] = [];
  const rowLines: number[] = [];
  for (; seconds.length < maxPoints; i++) {
    if (!skip()) break;
    const tok = lines[i].trim().split(/\s+/);
    // The first line that is not a point ends the points (END Ephemeris, or a covariance section).
    if (/^[A-Za-z]/.test(tok[0])) break;
    const x = tok.map(parseReal);
    if (tok.length !== 7 || x.some(Number.isNaN)) throw new IoError('stk.state', i + 1);
    if (seconds.length > 0 && x[0] < seconds[seconds.length - 1]) throw new IoError('stk.order', i + 1);
    seconds.push(x[0]);
    states.push({ r: [x[1] * unit, x[2] * unit, x[3] * unit], v: [x[4] * unit, x[5] * unit, x[6] * unit] });
    rowLines.push(i + 1);
  }
  if (seconds.length === 0) throw new IoError('stk.data', formatLine);

  // Segments: a time of the boundary list separates the points before it from the points after it.
  const same = (a: number, b: number): boolean => Math.abs(a - b) <= BOUNDARY_TOLERANCE;
  const et: number[] = [];
  const outStates: State[] = [];
  const segmentStarts: number[] = [0];
  for (let k = 0; k < seconds.length; k++) {
    const t = seconds[k];
    if (k > 0) {
      const before = seconds[k - 1];
      if (t === before) {
        // Two points with the same time are permitted only at a segment boundary: the second point starts a segment.
        if (!boundaries.some((b) => same(b, t))) throw new IoError('stk.order', rowLines[k]);
        segmentStarts.push(et.length);
      } else if (boundaries.some((b) => b > before + BOUNDARY_TOLERANCE && b < t - BOUNDARY_TOLERANCE)) {
        // A boundary between two points.
        segmentStarts.push(et.length);
      } else if (boundaries.some((b) => same(b, t)) && k + 1 < seconds.length && seconds[k + 1] !== t) {
        // One point at a boundary: it is the end of a segment and also the start of the next segment.
        et.push(toEt(t));
        outStates.push({ r: [...states[k].r], v: [...states[k].v] });
        segmentStarts.push(et.length);
      }
    }
    et.push(toEt(t));
    outStates.push(states[k]);
  }
  const table: EphemerisTable = {
    objectName: opts.objectName ?? 'UNKNOWN', objectId: opts.objectId ?? 'UNKNOWN', center: centerId, frame: 'ICRF', timeScale: scale,
    et, states: outStates, segmentStarts,
  };
  if (comments.length > 0) table.comments = comments;
  return table;
}
