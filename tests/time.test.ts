import { describe, it, expect, afterAll } from 'vitest';
import { utcToEt, etToUtc, formatEt, parseToEt, tdbMinusTt, etToTt, etToTai, taiMinusUtcAtUtc, calendarToSeconds, secondsToCalendar, formatIso, utc } from '../src/engine/time';
import { readFileSync, readdirSync } from 'node:fs';
import { Recorder } from './util';

const rec = new Recorder('time');
afterAll(() => rec.save());

describe('time scales', () => {
  it('calendar conversion is its own inverse', () => {
    for (const s of [0, -43200, 86400 * 365.25 * 50 + 0.123, -86400 * 365.25 * 49.9, 1e9 + 59.5]) {
      const c = secondsToCalendar(s);
      expect(calendarToSeconds(c)).toBeCloseTo(s, 5);
    }
    expect(secondsToCalendar(0)).toMatchObject({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 });
  });

  it('J2000 epoch: 2000-01-01 11:58:55.816 UTC is et = 0 (definition: TT 12:00:00, TAI-UTC 32 s)', () => {
    // TT = UTC + 32 + 32.184 s; TDB - TT at J2000 is about -73 microseconds.
    const et = utcToEt({ year: 2000, month: 1, day: 1, hour: 11, minute: 58, second: 55.816 });
    expect(Math.abs(et)).toBeLessThan(1e-3);
  });

  it('leap seconds from naif0012.tls', () => {
    expect(taiMinusUtcAtUtc(utcSec(2016, 12, 31))).toBe(36);
    expect(taiMinusUtcAtUtc(utcSec(2017, 1, 1))).toBe(37);
    expect(taiMinusUtcAtUtc(utcSec(1972, 1, 1))).toBe(10);
    // one UTC day that contains a leap second has 86401 s
    const a = utcToEt({ year: 2016, month: 12, day: 31, hour: 0, minute: 0, second: 0 });
    const b = utcToEt({ year: 2017, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
    expect(etToTai(b) - etToTai(a)).toBeCloseTo(86401, 6);
    const leap = etToUtc(b - 0.5);
    expect(leap.second).toBeGreaterThanOrEqual(60);
    expect(formatEt(b - 0.75, 'UTC', 'milli')).toBe('2016-12-31 23:59:60.250');
  });

  it('TDB - TT has an amplitude of about 1.66 ms', () => {
    let max = 0;
    for (let d = 0; d < 366; d++) max = Math.max(max, Math.abs(tdbMinusTt(d * 86400)));
    expect(max).toBeGreaterThan(0.0016);
    expect(max).toBeLessThan(0.0017);
    expect(etToTt(1e8) + tdbMinusTt(etToTt(1e8))).toBeCloseTo(1e8, 9);
  });

  it('text round trip', () => {
    const et = parseToEt('1977-08-20 14:29:00', 'UTC')!;
    expect(formatEt(et, 'UTC')).toBe('1977-08-20 14:29:00');
    expect(formatIso(et, 'UTC', 3)).toBe('1977-08-20T14:29:00.000');
    expect(formatEt(parseToEt('2031-02-28T23:59:59.9996', 'TDB')!, 'TDB')).toBe('2031-03-01 00:00:00');
  });

  it('UTC to TDB agrees with JPL Horizons (calendar date in UTC against the Julian date in TDB)', () => {
    // Horizons vector tables requested with TIME_TYPE=UT print the TDB-UT difference. Truth files: truth/horizons/raw/time_*.txt
    const files = readdirSync('truth/horizons/raw').filter((f) => f.startsWith('time_'));
    expect(files.length).toBeGreaterThan(0);
    let worst = 0, n = 0;
    for (const f of files) {
      const text = readFileSync('truth/horizons/raw/' + f, 'utf8');
      const body = /\$\$SOE([\s\S]*?)\$\$EOE/.exec(text)![1];
      for (const line of body.trim().split('\n')) {
        const cols = line.split(',').map((s) => s.trim());
        // JDUT, calendar date (UT), delta-T = TDB - UT (s)
        const m = /A\.D\. (\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d+)/.exec(cols[1])!;
        const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[2]) + 1;
        const c = { year: +m[1], month, day: +m[3], hour: +m[4], minute: +m[5], second: +m[6] };
        if (c.year < 1972) continue; // before 1972 Horizons uses UT1; this product does not model UT1
        const deltaT = +cols[2];
        const mine = utcToEt(c) - calendarToSeconds(c);
        worst = Math.max(worst, Math.abs(mine - deltaT));
        n++;
      }
    }
    rec.add({ id: 'time.utcTdb', group: 'time', value: worst, unit: 's', limit: 5e-5, truth: 'JPL Horizons, TDB-UT column (delta-T) of vector tables, ' + n + ' epochs from 1972 to 2099', detail: { epochs: n } });
    // The NAIF formula for TDB - TT has a documented accuracy of about 30 microseconds.
    expect(worst).toBeLessThan(5e-5);
  });
});

function utcSec(y: number, m: number, d: number): number {
  return calendarToSeconds({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
}
void utc;
