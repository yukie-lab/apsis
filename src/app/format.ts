/**
 * Number formats. A value never shows with no unit: each function returns the number text and the unit.
 * The decimal sign is a point and the group sign is a thin space in all languages (ISO 80000-1).
 * The thin space is the narrow no-break space (U+202F): a line does not break in a number or between a number and its unit.
 */
import { AU } from '../engine/bodies';
import { type TimeScale, formatEt, DAY, YEAR } from '../engine/time';

export type DistanceUnit = 'km' | 'au';
export interface Quantity { text: string; unit: string }

const THIN = ' ';

/** Fixed-point number with digit groups. */
export function fixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return '—';
  const s = Math.abs(x).toFixed(digits);
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (x < 0 && Number(s) !== 0 ? '−' : '') + grouped + (frac ? '.' + frac : '');
}
/** Number with a given count of significant digits (fixed-point notation). */
export function sig(x: number, digits: number): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(x)));
  return fixed(x, Math.max(0, digits - 1 - mag));
}

const SUPER: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** Scientific notation with a multiplication sign and a superscript exponent: 4.07 × 10⁻⁹. */
export function sci(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(digits - 1).split('e');
  const exp = String(Number(e)).split('').map((c) => SUPER[c] ?? c).join('');
  return `${m.replace('-', '−')} × 10${exp}`;
}
/** Number for a table of measured values: fixed-point notation, or scientific notation for very small and very large values. */
export function auto(x: number, digits = 3): string {
  const a = Math.abs(x);
  return x === 0 ? '0' : a < 1e-4 || a >= 1e7 ? sci(x, digits) : sig(x, digits);
}

export function distance(km: number, unit: DistanceUnit, digits?: number): Quantity {
  if (unit === 'au') return { text: fixed(km / AU, digits ?? 6), unit: 'au' };
  const a = Math.abs(km);
  return { text: fixed(km, digits ?? (a >= 1e6 ? 0 : a >= 1e3 ? 1 : 3)), unit: 'km' };
}
/** Distance for a text that people read in a sentence: 3 significant digits and a suitable unit. */
export function distanceShort(km: number): Quantity {
  const a = Math.abs(km);
  if (a >= 0.05 * AU) return { text: sig(km / AU, 3), unit: 'au' };
  return { text: sig(km, 3), unit: 'km' };
}
export function speed(kmS: number, digits = 4): Quantity { return { text: fixed(kmS, digits), unit: 'km/s' }; }
/** Small velocity changes are in m/s. */
export function deltaV(kmS: number): Quantity {
  return Math.abs(kmS) < 1 ? { text: fixed(kmS * 1000, Math.abs(kmS) < 0.01 ? 3 : 1), unit: 'm/s' } : { text: fixed(kmS, 4), unit: 'km/s' };
}
export function c3(v: number): Quantity { return { text: fixed(v, 3), unit: 'km²/s²' }; }
export function angleDeg(rad: number, digits = 3): Quantity { return { text: fixed((rad * 180) / Math.PI, digits), unit: '°' }; }
export function duration(s: number): Quantity {
  const a = Math.abs(s);
  if (a >= 2 * YEAR) return { text: fixed(s / YEAR, 2), unit: 'y' };
  if (a >= 2 * DAY) return { text: fixed(s / DAY, 1), unit: 'd' };
  if (a >= 7200) return { text: fixed(s / 3600, 1), unit: 'h' };
  if (a >= 120) return { text: fixed(s / 60, 1), unit: 'min' };
  return { text: fixed(s, 1), unit: 's' };
}
export function mass(kg: number): Quantity { return { text: fixed(kg, kg < 100 ? 1 : 0), unit: 'kg' }; }
/** Calendar date and time with the name of the time scale. */
export function dateTime(et: number, scale: TimeScale, precision: 'day' | 'minute' | 'second' | 'milli' = 'second'): Quantity {
  return { text: formatEt(et, scale, precision), unit: scale };
}
export const q = (x: Quantity): string => `${x.text}${x.unit === '°' ? '' : THIN}${x.unit}`;
