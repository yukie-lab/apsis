/**
 * Time scales and calendar conversions.
 *
 * Internal time ("et") is TDB seconds after J2000.0 (JD 2451545.0 TDB), the same convention as SPICE.
 * Supported scales: UTC, TAI, TT, TDB.
 *   TAI = UTC + (leap seconds)        table: NAIF naif0012.tls
 *   TT  = TAI + 32.184 s
 *   TDB = TT + K sin(E),  E = M + EB sin(M),  M = M0 + M1 * TT   (NAIF LSK formula, accuracy about 30 microseconds)
 * Before 1972-01-01 the UTC scale had no leap seconds. This module then uses TAI - UTC = 9 s (SPICE convention).
 */
import constants from './data/constants.json';

export type TimeScale = 'UTC' | 'TAI' | 'TT' | 'TDB';
export const TIME_SCALES: TimeScale[] = ['UTC', 'TDB', 'TT', 'TAI'];
export const J2000_JD = 2451545.0;
export const DAY = 86400;
export const YEAR = 365.25 * DAY;

const T = constants.time;
const DELTA_T_A = T.deltaTA;

export interface Calendar { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Julian day number (at 12:00) of a Gregorian calendar date. */
export function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

/** Seconds after J2000.0 in the scale of the calendar date, with no leap-second logic. */
export function calendarToSeconds(c: Calendar): number {
  const jdn = julianDayNumber(c.year, c.month, c.day);
  return (jdn - J2000_JD) * DAY + (c.hour - 12) * 3600 + c.minute * 60 + c.second;
}

/** Inverse of calendarToSeconds. */
export function secondsToCalendar(sec: number): Calendar {
  // Work on integer days and a remainder to keep sub-millisecond precision.
  const s = sec + 43200; // seconds after 2000-01-01 00:00
  let days = Math.floor(s / DAY);
  let rem = s - days * DAY;
  if (rem >= DAY) { rem -= DAY; days += 1; }
  const jdn = days + 2451545; // JDN of that civil day
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  const hour = Math.floor(rem / 3600);
  const minute = Math.floor((rem - hour * 3600) / 60);
  const second = rem - hour * 3600 - minute * 60;
  return { year, month, day, hour, minute, second };
}

interface Leap { utcStart: number; taiStart: number; dAT: number }
const LEAPS: Leap[] = T.leapSeconds.map((l) => {
  const [y, m, d] = l.utc.split('-').map(Number);
  const utcStart = calendarToSeconds({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
  return { utcStart, taiStart: utcStart + l.taiMinusUtc, dAT: l.taiMinusUtc };
});
const PRE_1972_DAT = LEAPS[0].dAT - 1;

/** TAI - UTC (s) at a UTC instant given as UTC seconds after J2000 (no leap-second count). */
export function taiMinusUtcAtUtc(utcSec: number): number {
  let d = PRE_1972_DAT;
  for (const l of LEAPS) { if (utcSec >= l.utcStart) d = l.dAT; else break; }
  return d;
}

/** TAI - UTC (s) at a TAI instant. */
export function taiMinusUtcAtTai(taiSec: number): number {
  let d = PRE_1972_DAT;
  for (const l of LEAPS) { if (taiSec >= l.taiStart) d = l.dAT; else break; }
  return d;
}

/** TDB - TT (s) at a TT instant (seconds after J2000 TT). */
export function tdbMinusTt(ttSec: number): number {
  const M = T.M[0] + T.M[1] * ttSec;
  const E = M + T.EB * Math.sin(M);
  return T.K * Math.sin(E);
}

export function ttToEt(tt: number): number { return tt + tdbMinusTt(tt); }
export function etToTt(et: number): number {
  let tt = et;
  for (let i = 0; i < 3; i++) tt = et - tdbMinusTt(tt);
  return tt;
}
export function etToTai(et: number): number { return etToTt(et) - DELTA_T_A; }
export function taiToEt(tai: number): number { return ttToEt(tai + DELTA_T_A); }

/** UTC calendar date to et. A value of 60 for the second is permitted on a leap-second day. */
export function utcToEt(c: Calendar): number {
  // Count from the start of the minute, with the TAI - UTC of that minute: a leap second (label 60) is the 61st
  // second of its minute. TAI - UTC changes only at the start of a minute.
  const minute = calendarToSeconds({ ...c, second: 0 });
  return taiToEt(minute + taiMinusUtcAtUtc(minute) + c.second);
}

/** et to a UTC calendar date. During a leap second the result has second >= 60. */
export function etToUtc(et: number): Calendar {
  const tai = etToTai(et);
  const dAT = taiMinusUtcAtTai(tai);
  // Is this instant in the leap second that comes immediately before the next table entry?
  for (const l of LEAPS) {
    if (tai >= l.taiStart - 1 && tai < l.taiStart && l.dAT > dAT) {
      const c = secondsToCalendar(tai - dAT - 1);
      return { ...c, second: c.second + 1 };
    }
  }
  return secondsToCalendar(tai - dAT);
}

/** Convert et to seconds after J2000 in a uniform scale (TAI, TT or TDB). */
export function etToScaleSeconds(et: number, scale: Exclude<TimeScale, 'UTC'>): number {
  if (scale === 'TDB') return et;
  if (scale === 'TT') return etToTt(et);
  return etToTai(et);
}

export function etToCalendar(et: number, scale: TimeScale): Calendar {
  return scale === 'UTC' ? etToUtc(et) : secondsToCalendar(etToScaleSeconds(et, scale));
}

export function calendarToEt(c: Calendar, scale: TimeScale): number {
  if (scale === 'UTC') return utcToEt(c);
  const s = calendarToSeconds(c);
  if (scale === 'TDB') return s;
  if (scale === 'TT') return ttToEt(s);
  return taiToEt(s);
}

/** Julian date in a given scale. For UTC this is the usual pseudo Julian date of the calendar reading. */
export function etToJd(et: number, scale: TimeScale = 'TDB'): number {
  const c = etToCalendar(et, scale);
  return J2000_JD + calendarToSeconds({ ...c, second: Math.min(c.second, 59.999999) }) / DAY;
}
export function jdTdbToEt(jd: number): number { return (jd - J2000_JD) * DAY; }
export function etToJdTdb(et: number): number { return J2000_JD + et / DAY; }

const p2 = (n: number) => String(n).padStart(2, '0');

/** Format as "YYYY-MM-DD HH:MM:SS" (or with a fraction). The scale label is not included. */
export function formatCalendar(c: Calendar, precision: 'day' | 'minute' | 'second' | 'milli' = 'second'): string {
  let { year, month, day, hour, minute, second } = c;
  const date = () => `${year < 0 ? '-' : ''}${String(Math.abs(year)).padStart(4, '0')}-${p2(month)}-${p2(day)}`;
  if (precision === 'day') return date();
  if (precision === 'minute') return `${date()} ${p2(hour)}:${p2(minute)}`;
  if (precision === 'second') {
    let s = Math.floor(second + 1e-6);
    return `${date()} ${p2(hour)}:${p2(minute)}:${p2(s)}`;
  }
  let ms = Math.floor(second * 1000 + 1e-4);
  const s = Math.floor(ms / 1000);
  ms -= s * 1000;
  return `${date()} ${p2(hour)}:${p2(minute)}:${p2(s)}.${String(ms).padStart(3, '0')}`;
}

export function formatEt(et: number, scale: TimeScale, precision: 'day' | 'minute' | 'second' | 'milli' = 'second'): string {
  // Round first so that a reading such as 23:59:59.9996 does not print as 59 s.
  const q = precision === 'milli' ? 0.0005 : precision === 'second' ? 0.5 : 0;
  const c = etToCalendar(et + q, scale);
  return formatCalendar(c, precision);
}

/** ISO 8601 form used in CCSDS files: YYYY-MM-DDTHH:MM:SS.ffffff */
export function formatIso(et: number, scale: TimeScale, digits = 6): string {
  const c = etToCalendar(et, scale);
  let whole = Math.floor(c.second);
  let frac = Math.round((c.second - whole) * 10 ** digits);
  if (frac >= 10 ** digits) {
    // carry: recompute from a slightly later instant
    return formatIso(et + 0.5 * 10 ** -digits, scale, digits);
  }
  const f = digits > 0 ? '.' + String(frac).padStart(digits, '0') : '';
  return `${String(c.year).padStart(4, '0')}-${p2(c.month)}-${p2(c.day)}T${p2(c.hour)}:${p2(c.minute)}:${p2(whole)}${f}`;
}

/** Parse "YYYY-MM-DD", "YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM:SS.sss" (also day-of-year "YYYY-DDDTHH:MM:SS"). Returns null if the text is not a date. */
export function parseCalendar(text: string): Calendar | null {
  const s = text.trim().replace(/Z$/i, '');
  let m = /^(-?\d{1,4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}(?:\.\d*)?))?)?$/.exec(s);
  if (m) {
    const c = { year: +m[1], month: +m[2], day: +m[3], hour: +(m[4] ?? 0), minute: +(m[5] ?? 0), second: +(m[6] ?? 0) };
    if (c.month < 1 || c.month > 12 || c.day < 1 || c.day > 31 || c.hour > 23 || c.minute > 59 || c.second >= 61) return null;
    return c;
  }
  m = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)$/.exec(s);
  if (m) {
    const jdn = julianDayNumber(+m[1], 1, 1) + (+m[2] - 1);
    const c = secondsToCalendar((jdn - J2000_JD) * DAY - 43200);
    return { year: c.year, month: c.month, day: c.day, hour: +m[3], minute: +m[4], second: +m[5] };
  }
  return null;
}

export function parseToEt(text: string, scale: TimeScale): number | null {
  const c = parseCalendar(text);
  return c ? calendarToEt(c, scale) : null;
}

/** Convenience: UTC text to et. Throws if the text is not a date. */
export function utc(text: string): number {
  const et = parseToEt(text, 'UTC');
  if (et === null) throw new Error('Invalid date: ' + text);
  return et;
}
/** Convenience: TDB text to et. */
export function tdb(text: string): number {
  const et = parseToEt(text, 'TDB');
  if (et === null) throw new Error('Invalid date: ' + text);
  return et;
}
