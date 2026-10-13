/**
 * Tables of comma-separated values. This is a format of Apsis for spreadsheet programs and scripts; no standard defines it.
 *
 * The first line has the column names. A column name has the unit:
 *   time_utc | time_tdb | time_tt | time_tai : calendar time, YYYY-MM-DDThh:mm:ss.ffffff
 *   jd_utc | jd_tdb | jd_tt | jd_tai         : Julian date (the writer gives 12 decimals)
 *   x_km, y_km, z_km, vx_km_s, vy_km_s, vz_km_s   (the reader also accepts x_m and vx_m_s)
 * Two lines with the same time are a segment boundary (a maneuver): the state before and the state after.
 * The file does not have the centre and the frame: the reader gets them from its options.
 */
import type { State } from '../vec';
import type { FrameId } from '../frames';
import { type TimeScale, etToCalendar, formatIso } from '../time';
import { type EphemerisTable, IoError, textLines, parseReal, checkTable, parseCcsdsTime, parseJulianDate, formatJulianDate, checkedCalendarToEt } from './types';

export interface CsvWriteOptions {
  /** Time column: calendar time (default) or Julian date. */
  time?: 'iso' | 'jd';
}

/**
 * Write a table as CSV. Numbers have 17 significant digits: the reader gets exactly the same 64-bit numbers.
 * Calendar times have 6 decimals of the second. A Julian date has 12 decimals (0.09 microsecond).
 * A UTC time in a leap second has no Julian date: IoError('csv.time').
 */
export function writeCsv(table: EphemerisTable, opts: CsvWriteOptions = {}): string {
  checkTable(table, 'csv.table');
  const jd = opts.time === 'jd';
  const scale = table.timeScale;
  const out: string[] = [`${jd ? 'jd' : 'time'}_${scale.toLowerCase()},x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s`];
  for (let i = 0; i < table.et.length; i++) {
    let time: string;
    if (jd) {
      const text = formatJulianDate(etToCalendar(table.et[i], scale));
      if (text === null) throw new IoError('csv.time', undefined, 'leapSecond:' + i);
      time = text;
    } else {
      time = formatIso(table.et[i], scale, 6);
    }
    const s = table.states[i];
    out.push([time, ...s.r.map((x) => x.toExponential(16)), ...s.v.map((x) => x.toExponential(16))].join(','));
  }
  return out.join('\n') + '\n';
}

export interface CsvReadOptions {
  /** Centre of the states: Apsis body id or 'SSB'. */
  center: string;
  frame: FrameId;
  /** Time scale, used only if the name of the time column does not have it (column `time` or `jd`). */
  timeScale?: TimeScale;
  /** Unit of distance, used only if the column names do not have it (columns `x`, `vx`). */
  distanceUnit?: 'km' | 'm';
  objectName?: string;
  objectId?: string;
}

const SCALES: Record<string, TimeScale> = { utc: 'UTC', tdb: 'TDB', tt: 'TT', tai: 'TAI' };
const TIME_NAMES = [/^(time|epoch|date|jd|julian_date)(?:_(utc|tdb|tt|tai))?$/, /^(jd)(utc|tdb|tt|tai)$/, /^()(utc|tdb|tt|tai)$/];
const CALENDAR = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d*)?))?Z?$/;
/** Names of the columns: position, then velocity (also the names of the CCSDS messages: x_dot). */
const STATE_NAMES: { names: string[]; velocity: boolean }[] = [
  { names: ['x'], velocity: false }, { names: ['y'], velocity: false }, { names: ['z'], velocity: false },
  { names: ['vx', 'x_dot', 'xdot'], velocity: true }, { names: ['vy', 'y_dot', 'ydot'], velocity: true }, { names: ['vz', 'z_dot', 'zdot'], velocity: true },
];

/**
 * Read a CSV table. The columns are found from the names in the first line (capital letters and other characters
 * between the words make no difference: 'X (km)' is x_km, 'VX [km/s]' is vx_km_s). Columns that are not known
 * are ignored. The separator is the comma, the semicolon or the tab. Lines that start with '#' are ignored.
 * Each line with the same time as the line before it starts a new segment.
 */
export function parseCsv(text: string, opts: CsvReadOptions): EphemerisTable {
  const lines = textLines(text);
  let i = 0;
  const skip = (): boolean => {
    while (i < lines.length && (lines[i].trim() === '' || lines[i].trimStart().startsWith('#'))) i++;
    return i < lines.length;
  };
  if (!skip()) throw new IoError('csv.columns', lines.length);
  const headerLine = i + 1;
  const sep = lines[i].includes(',') ? ',' : lines[i].includes(';') ? ';' : '\t';
  const cells = (line: string): string[] => line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
  const names = cells(lines[i]).map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));

  // Time column: the first column with a name of a time.
  let timeCol = -1, julian = false;
  let scale: TimeScale | undefined;
  for (let k = 0; k < names.length && timeCol < 0; k++) {
    for (const pattern of TIME_NAMES) {
      const m = pattern.exec(names[k]);
      if (!m) continue;
      timeCol = k;
      julian = m[1] === 'jd' || m[1] === 'julian_date';
      scale = m[2] ? SCALES[m[2]] : opts.timeScale;
      break;
    }
  }
  if (timeCol < 0) throw new IoError('csv.columns', headerLine, 'time');
  if (!scale) throw new IoError('csv.timeScale', headerLine);
  const timeScale: TimeScale = scale;

  // State columns: the name, then the unit.
  const factorOf = (suffix: string, velocity: boolean): number | null => {
    if (suffix === '') return opts.distanceUnit === 'km' ? 1 : opts.distanceUnit === 'm' ? 1e-3 : null;
    if (velocity) return /^_(km_s|km_per_s|kmps|km_sec)$/.test(suffix) ? 1 : /^_(m_s|m_per_s|mps|m_sec)$/.test(suffix) ? 1e-3 : null;
    return suffix === '_km' ? 1 : suffix === '_m' ? 1e-3 : null;
  };
  const cols = STATE_NAMES.map((def): { col: number; factor: number } => {
    for (let k = 0; k < names.length; k++) {
      for (const name of def.names) {
        if (names[k] !== name && !names[k].startsWith(name + '_')) continue;
        const suffix = names[k].slice(name.length);
        if (!def.velocity && /^_dot(_|$)/.test(suffix)) continue; // x_dot is a velocity
        const factor = factorOf(suffix, def.velocity);
        if (factor === null) throw new IoError('csv.units', headerLine, names[k]);
        return { col: k, factor };
      }
    }
    throw new IoError('csv.columns', headerLine, def.names[0]);
  });
  if (cols.slice(0, 3).some((c) => c.factor !== cols[0].factor) || cols.slice(3).some((c) => c.factor !== cols[3].factor)) throw new IoError('csv.units', headerLine);
  const width = Math.max(timeCol, ...cols.map((c) => c.col)) + 1;

  const time = (t: string): number | null => {
    if (julian) return parseJulianDate(t, timeScale);
    const strict = parseCcsdsTime(t, timeScale);
    if (strict !== null) return strict;
    // Forms that spreadsheet programs write: a blank between the date and the time, no seconds, one digit for a field.
    const m = CALENDAR.exec(t);
    return m ? checkedCalendarToEt({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +(m[6] ?? 0) }, timeScale) : null;
  };
  const et: number[] = [];
  const states: State[] = [];
  const segmentStarts: number[] = [0];
  for (i++; skip(); i++) {
    const c = cells(lines[i]);
    if (c.length < width) throw new IoError('csv.columns', i + 1);
    const t = time(c[timeCol]);
    if (t === null) throw new IoError('csv.time', i + 1, c[timeCol]);
    const x = cols.map((k) => parseReal(c[k.col]) * k.factor);
    if (x.some(Number.isNaN)) throw new IoError('csv.number', i + 1);
    if (et.length > 0) {
      if (t < et[et.length - 1]) throw new IoError('csv.order', i + 1);
      if (t === et[et.length - 1]) segmentStarts.push(et.length);
    }
    et.push(t);
    states.push({ r: [x[0], x[1], x[2]], v: [x[3], x[4], x[5]] });
  }
  if (et.length === 0) throw new IoError('csv.data', headerLine);
  return {
    objectName: opts.objectName ?? 'UNKNOWN', objectId: opts.objectId ?? 'UNKNOWN', center: opts.center, frame: opts.frame, timeScale,
    et, states, segmentStarts,
  };
}
