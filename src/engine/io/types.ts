/**
 * Interchange of trajectories with other programs: types, and the text tools that the readers and writers share.
 *
 * All readers give times as et (TDB seconds after J2000) and states in km and km/s.
 * A reader or a writer that finds a problem throws an IoError. The error has a short machine code (for example
 * 'oem.keyword'), the line number in the text (first line = 1) and, where it helps, the item that caused the problem.
 * This module has no sentences for the user: the user interface translates the codes. Comment text in a file
 * always comes from the caller.
 */
import type { State } from '../vec';
import { type TimeScale, type Calendar, J2000_JD, DAY, julianDayNumber, secondsToCalendar, calendarToSeconds, taiMinusUtcAtUtc, ttToEt, taiToEt, utcToEt, etToUtc, calendarToEt } from '../time';
import { BODIES, BODY_LIST } from '../bodies';

export interface EphemerisTable {
  objectName: string;
  /** 'UNKNOWN' if there is none. */
  objectId: string;
  /** Apsis body id or 'SSB'. */
  center: string;
  frame: 'ICRF' | 'ECLIPJ2000';
  /** Time scale of the text of the file. All times in memory are et. */
  timeScale: TimeScale;
  et: number[];
  /** Relative to `center`, in `frame`, km and km/s. */
  states: State[];
  comments?: string[];
  /**
   * Indices where a new segment starts (a maneuver is between two segments). The first segment starts at index 0.
   * The last sample of a segment and the first sample of the next segment can have the same time.
   */
  segmentStarts?: number[];
}

export class IoError extends Error {
  constructor(readonly code: string, readonly line?: number, readonly detail?: string) {
    super(code + (line !== undefined ? '@' + line : '') + (detail !== undefined ? ' ' + detail : ''));
    this.name = 'IoError';
  }
}

// ------------------------------------------------------------------------------------------------ text and numbers

/** Lines of a text. Line number = index + 1. The line ends CR LF, LF and CR are accepted. */
export function textLines(text: string): string[] {
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\n|\r/);
}

/**
 * Real number in the exponent form of the CCSDS messages, for example -7.147205881293523E+07.
 * 16 significant digits is the maximum that CCSDS 502.0-B permits. The number must be finite.
 */
export function formatReal(x: number, digits = 16): string {
  const s = x.toExponential(digits - 1);
  const k = s.indexOf('e');
  const exp = Number(s.slice(k + 1));
  const a = Math.abs(exp);
  return s.slice(0, k) + 'E' + (exp < 0 ? '-' : '+') + (a < 10 ? '0' + a : String(a));
}

const REAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
/** Value of a number token (fixed-point or exponent form). NaN if the token is not a finite number. */
export function parseReal(token: string): number {
  if (!REAL.test(token)) return NaN;
  const x = Number(token);
  return Number.isFinite(x) ? x : NaN;
}

/** Text with only printable ASCII characters: other characters become '?'. */
export function asciiText(s: string): string {
  return s.replace(/\t/g, ' ').replace(/[^\x20-\x7e]/g, '?');
}

// ------------------------------------------------------------------------------------------------ tables

/** First and last index of each segment of a table. A table with no `segmentStarts` has one segment. */
export function segmentRanges(table: Pick<EphemerisTable, 'et' | 'segmentStarts'>): [number, number][] {
  const n = table.et.length;
  if (n === 0) return [];
  const starts = [...new Set([0, ...(table.segmentStarts ?? [])])].filter((s) => Number.isInteger(s) && s >= 0 && s < n).sort((a, b) => a - b);
  return starts.map((s, k): [number, number] => [s, (k + 1 < starts.length ? starts[k + 1] : n) - 1]);
}

/**
 * Check that a table can be written. Rules: one sample or more, one state for each time, finite numbers, times that
 * increase in a segment, and no segment that starts before the end of the segment before it.
 * Throws IoError(code) with the rule and the index of the sample in `detail`.
 */
export function checkTable(table: EphemerisTable, code: string): void {
  const n = table.et.length;
  if (n === 0) throw new IoError(code, undefined, 'empty');
  if (table.states.length !== n) throw new IoError(code, undefined, 'length');
  for (const s of table.segmentStarts ?? []) {
    if (!Number.isInteger(s) || s < 0 || s >= n) throw new IoError(code, undefined, 'segment:' + s);
  }
  for (let i = 0; i < n; i++) {
    const s = table.states[i];
    if (!Number.isFinite(table.et[i]) || !s || s.r.length !== 3 || s.v.length !== 3 || !s.r.every(Number.isFinite) || !s.v.every(Number.isFinite)) {
      throw new IoError(code, undefined, 'number:' + i);
    }
  }
  for (const [a, b] of segmentRanges(table)) {
    if (a > 0 && table.et[a] < table.et[a - 1]) throw new IoError(code, undefined, 'order:' + a);
    for (let i = a + 1; i <= b; i++) if (!(table.et[i] > table.et[i - 1])) throw new IoError(code, undefined, 'order:' + i);
  }
}

// ------------------------------------------------------------------------------------------------ centre names

const PLANETS_WITH_BARYCENTER = ['MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'];
const SPECIAL_CENTERS: Record<string, string> = {
  'SOLAR SYSTEM BARYCENTER': 'SSB', SSB: 'SSB',
  'EARTH BARYCENTER': 'EMB', 'EARTH MOON BARYCENTER': 'EMB', 'EARTH-MOON BARYCENTER': 'EMB', EMB: 'EMB',
  // Mercury and Venus have no moon: the barycentre of the system is the centre of the planet.
  'MERCURY BARYCENTER': 'MERCURY', 'VENUS BARYCENTER': 'VENUS',
  LUNA: 'MOON',
  ...Object.fromEntries(PLANETS_WITH_BARYCENTER.map((p) => [p + ' BARYCENTER', p + '_BARYCENTER'])),
};

/**
 * Apsis id of a centre from the name in a file. Accepts the names of CCSDS 502.0-B and of the SANA registry of
 * orbit centres ('SUN', 'EARTH', 'SOLAR SYSTEM BARYCENTER', 'MARS BARYCENTER', '1 CERES', '1P/HALLEY'), with
 * upper-case or lower-case letters and with a blank or an underscore between words. Returns null if the name is not known.
 */
export function centerFromName(name: string): string | null {
  const raw = name.trim();
  if (raw !== '' && Object.hasOwn(BODIES, raw)) return raw;
  const n = raw.toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ').replace('BARYCENTRE', 'BARYCENTER');
  if (Object.hasOwn(SPECIAL_CENTERS, n)) return SPECIAL_CENTERS[n];
  // Small bodies of the SANA registry have a number or a designation before the name.
  for (const t of [n, n.replace(/^\d+ /, ''), n.replace(/^\d+[A-Z]\//, '')]) {
    const id = t.replace(/[ -]/g, '_');
    if (id !== '' && Object.hasOwn(BODIES, id)) return id;
  }
  return null;
}

/** Name of a centre for a CCSDS message: 'SOLAR SYSTEM BARYCENTER', 'EARTH BARYCENTER', 'MARS BARYCENTER', 'SUN'. */
export function centerToName(id: string): string {
  if (id === 'SSB') return 'SOLAR SYSTEM BARYCENTER';
  if (id === 'EMB') return 'EARTH BARYCENTER';
  return asciiText(id).toUpperCase().replace(/_/g, ' ');
}

/** Apsis id of a centre from its NAIF integer code (0 = solar system barycentre, 10 = Sun, 399 = Earth). */
export function centerFromNaif(code: number): string | null {
  if (code === 0) return 'SSB';
  if (code === 1) return 'MERCURY';
  if (code === 2) return 'VENUS';
  if (code === 3) return 'EMB';
  if (code >= 4 && code <= 9) return PLANETS_WITH_BARYCENTER[code - 4] + '_BARYCENTER';
  // Asteroids: the catalogue has the codes 20000000 + number, JPL Horizons also gives 2000000 + number.
  const alt = code > 2000000 && code < 3000000 ? code + 18000000 : code;
  for (const b of BODY_LIST) if (b.naif !== 0 && (b.naif === code || b.naif === alt)) return b.id;
  return null;
}

// ------------------------------------------------------------------------------------------------ time

/** et from seconds after J2000 in a time scale. For UTC the seconds are those of the calendar reading (no leap seconds). */
export function scaleSecondsToEt(sec: number, scale: TimeScale): number {
  if (scale === 'TDB') return sec;
  if (scale === 'TT') return ttToEt(sec);
  if (scale === 'TAI') return taiToEt(sec);
  return utcToEt(secondsToCalendar(sec));
}

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(y: number, m: number): number {
  return m === 2 && isLeapYear(y) ? 29 : MONTH_DAYS[m - 1];
}

/**
 * Calendar date with a check of each field. The second can be 60 to 60.999 only in UTC and only in a leap second.
 * Returns et, or null if a field is out of range.
 */
export function checkedCalendarToEt(c: Calendar, scale: TimeScale): number | null {
  if (!(c.month >= 1 && c.month <= 12) || !(c.day >= 1 && c.day <= daysInMonth(c.year, c.month))) return null;
  if (!(c.hour >= 0 && c.hour <= 23) || !(c.minute >= 0 && c.minute <= 59) || !(c.second >= 0 && c.second < 61)) return null;
  if (c.second >= 60) {
    // A second of 60 is correct only in UTC and only if this minute has a leap second.
    if (scale !== 'UTC') return null;
    // The time is counted on the TAI scale from second 59 of the same minute. (utcToEt is not used for a second
    // of 60: the engine function gives a time that is one second late for such a reading.)
    const utc59 = calendarToSeconds({ ...c, second: 59 });
    const tai59 = utc59 + taiMinusUtcAtUtc(utc59);
    // The minute has a leap second if the instant 1.5 s after second 59 has the reading 60.5.
    if (!(etToUtc(taiToEt(tai59 + 1.5)).second >= 60)) return null;
    return taiToEt(tai59 + (c.second - 59));
  }
  return calendarToEt(c, scale);
}

const CCSDS_CALENDAR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/;
const CCSDS_DAY_OF_YEAR = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z?$/;
const JULIAN_DATE = /^(\d{1,8})(?:\.(\d*))?$/;

/**
 * Time string of a CCSDS message to et: YYYY-MM-DDThh:mm:ss[.d...][Z] or YYYY-DDDThh:mm:ss[.d...][Z]
 * (CCSDS 502.0-B-2, 6.5.9). Version 1.0 of the standard also permitted a Julian date: `allowJulian`.
 * Returns null if the text is not a correct time.
 */
export function parseCcsdsTime(text: string, scale: TimeScale, allowJulian = false): number | null {
  let m = CCSDS_CALENDAR.exec(text);
  if (m) return checkedCalendarToEt({ year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +m[6] }, scale);
  m = CCSDS_DAY_OF_YEAR.exec(text);
  if (m) {
    const year = +m[1];
    let day = +m[2], month = 1;
    if (day < 1 || day > (isLeapYear(year) ? 366 : 365)) return null;
    while (day > daysInMonth(year, month)) { day -= daysInMonth(year, month); month += 1; }
    return checkedCalendarToEt({ year, month, day, hour: +m[3], minute: +m[4], second: +m[5] }, scale);
  }
  return allowJulian ? parseJulianDate(text, scale) : null;
}

/**
 * Julian date text to et. The integer part and the fraction are read separately: one 64-bit number has a
 * resolution of only 40 microseconds for a Julian date. Returns null if the text is not a Julian date.
 */
export function parseJulianDate(text: string, scale: TimeScale): number | null {
  const m = JULIAN_DATE.exec(text);
  if (!m) return null;
  const fraction = m[2] ? Number('0.' + m[2]) : 0;
  return scaleSecondsToEt((Number(m[1]) - J2000_JD) * DAY + fraction * DAY, scale);
}

/**
 * Julian date text with 12 decimals (0.09 microsecond) from a calendar reading in any time scale.
 * Returns null for a reading in a leap second (second >= 60): it has no Julian date.
 */
export function formatJulianDate(c: Calendar): string | null {
  if (c.second >= 60) return null;
  // The Julian day number is for 12:00 of the civil day.
  let whole = julianDayNumber(c.year, c.month, c.day);
  let sec = c.hour * 3600 + c.minute * 60 + c.second - 43200;
  if (sec < 0) { sec += DAY; whole -= 1; }
  let frac = Math.round((sec / DAY) * 1e12);
  if (frac >= 1e12) { frac -= 1e12; whole += 1; }
  return `${whole}.${String(frac).padStart(12, '0')}`;
}

// ------------------------------------------------------------------------------------------------ CCSDS keyword = value

/** One line of a CCSDS message in the keyword = value notation (KVN). */
export interface KvnLine { key: string; value: string }

const KVN = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;
const KVN_COMMENT = /^\s*COMMENT(?:\s+(.*?))?\s*$/;

/**
 * Read one line: 'KEYWORD = value', or 'COMMENT text' (key 'COMMENT'). Keywords have upper-case letters
 * (CCSDS 502.0-B-2, 6.4.4). Returns null if the line has a different form.
 */
export function kvnLine(line: string): KvnLine | null {
  let m = KVN_COMMENT.exec(line);
  if (m) return { key: 'COMMENT', value: m[1] ?? '' };
  m = KVN.exec(line);
  return m ? { key: m[1], value: m[2] } : null;
}

/** Text value of a CCSDS keyword: no difference between upper case and lower case, '_' = one blank, many blanks = one blank. */
export function kvnText(value: string): string {
  return value.toUpperCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Text value for a writer: printable ASCII, upper case (CCSDS 502.0-B-2, 6.5.6). Empty text becomes 'UNKNOWN'. */
export function kvnValue(text: string): string {
  const t = asciiText(text).replace(/\s+/g, ' ').trim().toUpperCase();
  return t === '' ? 'UNKNOWN' : t;
}

/**
 * Frame of a CCSDS REF_FRAME value, or null if Apsis does not read the frame.
 * ICRF, GCRF (also with a realization number), EME2000 and its other name J2000 are read as the axes of the ICRF:
 * the difference between the EME2000 axes and the ICRF axes is a constant rotation of about 0.02 arcsecond, which
 * this application does not apply. J2000_ECLIPTIC (SANA registry) is ECLIPJ2000.
 */
export function ccsdsFrame(value: string): 'ICRF' | 'ECLIPJ2000' | null {
  const v = kvnText(value);
  if (/^(ICRF|GCRF)\d*$/.test(v) || v === 'EME2000' || v === 'J2000') return 'ICRF';
  if (v === 'J2000 ECLIPTIC') return 'ECLIPJ2000';
  return null;
}

/** Time scale of a CCSDS TIME_SYSTEM value, or null if Apsis does not read the time system. */
export function ccsdsTimeScale(value: string): TimeScale | null {
  const v = kvnText(value);
  return v === 'UTC' || v === 'TAI' || v === 'TT' || v === 'TDB' ? v : null;
}

/** Longest line of a CCSDS message, characters (CCSDS 502.0-B-2, 6.3.2). */
export const CCSDS_LINE_LIMIT = 254;

/** COMMENT lines for caller text. A line break starts a new line. A line that is too long continues on the next line. */
export function kvnComments(comments: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const room = CCSDS_LINE_LIMIT - 'COMMENT '.length;
  for (const c of comments ?? []) {
    for (const part of c.split(/\r\n|\n|\r/)) {
      let rest = asciiText(part).trimEnd();
      if (rest === '') { out.push('COMMENT'); continue; }
      while (rest.length > room) {
        let cut = rest.lastIndexOf(' ', room);
        if (cut <= 0) cut = room;
        out.push('COMMENT ' + rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      if (rest !== '') out.push('COMMENT ' + rest);
    }
  }
  return out;
}
