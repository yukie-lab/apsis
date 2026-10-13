/**
 * Interchange module (src/engine/io).
 *
 * Truth of these tests:
 *  (a) Files written by hand from the format specifications, with numbers chosen by hand. The comments show how
 *      each expected value was calculated by hand (leap seconds: IERS table; TT - TAI = 32.184 s).
 *  (b) Real outputs of the JPL Horizons API: truth/horizons/raw/*.txt against the numbers of truth/horizons/*.json
 *      (made by tools/truth/horizons.py, a different parser), and parts of the outputs in data-src/specs/horizons/
 *      (copied into this file) against truth/horizons/frames.json.
 *  (c) Structure rules of the specifications, checked on the text that the writers make. The checks are written
 *      here again from the specifications: they do not use the readers of the module.
 * Round-trip tests (write, then read) are consistency checks: they do not show that a format is correct.
 * Their limits follow from the number of digits in the files.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { solarSystem, truth, Recorder } from './util';
import { famousMission, solveMission, propellantFor } from '../src/engine/mission';
import { type Flight, flyFlight } from '../src/engine/flight';
import { ANCHOR_LIMIT, FULL_MODEL, PLANET_GRAVITY_BODIES, type ForceModel, type Trajectory } from '../src/engine/propagate';
import { utcToEt, etToTai, taiToEt } from '../src/engine/time';
import { type State, type Vec3, add, sub, norm } from '../src/engine/vec';
import { BODIES, AU } from '../src/engine/bodies';
import { fromIcrf } from '../src/engine/frames';
import {
  type EphemerisTable, IoError, formatReal, parseReal, parseCcsdsTime, parseJulianDate, formatJulianDate, centerFromName, centerToName,
  centerFromNaif, kvnComments, asciiText, checkTable, segmentRanges, ccsdsFrame,
  tableFromTrajectory, tableFromTrajectorySteps, checkTableInterpolation, tableToCenterFrame, interpolateTable,
  detectFormat, tableApproaches, tableBoundaries, tableDifference,
  writeOem, parseOem, writeOpm, parseOpm, opmFromFlight, flightFromOpm, type Opm,
  writeStkEphemeris, parseStkEphemeris, writeCsv, parseCsv, parseHorizonsVectors, writeGmatScript, gmatDifferences,
} from '../src/engine/io';

const rec = new Recorder('io');
afterAll(() => rec.save());
const sys = solarSystem();

const DAY = 86400;
/** 2017-01-01T00:00:00 UTC as et, by hand: 6209.5 days after J2000, TT - UTC = 37 + 32.184 s. TDB - TT is below 1.7 ms. */
const ET_2017 = 6209.5 * DAY + 69.184;
/** 2030-01-01T00:00:00 TDB as et, by hand: 30 years with 8 leap days less half a day = 10957.5 days. */
const ET_2030 = 10957.5 * DAY;
/** Obliquity of the ecliptic at J2000 (IAU 1976): 84381.448 arcseconds. */
const EPS = (84381.448 / 3600) * (Math.PI / 180);

const join = (lines: string[]): string => lines.join('\n');
/** Text with line `n` (first line = 1) replaced, or removed if `value` is null. */
function withLine(lines: string[], n: number, value: string | null): string {
  const c = lines.slice();
  if (value === null) c.splice(n - 1, 1); else c[n - 1] = value;
  return join(c);
}
function expectIoError(fn: () => unknown, code: string, line?: number, detail?: string): void {
  let err: unknown = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, 'an IoError with the code ' + code).toBeInstanceOf(IoError);
  const e = err as IoError;
  expect([e.code, e.line], e.message).toEqual([code, line]);
  if (detail !== undefined) expect(e.detail).toBe(detail);
}
const maxAbs = (a: readonly number[], b: readonly number[]): number => a.reduce((m, x, k) => Math.max(m, Math.abs(x - b[k])), 0);
const S = (r: Vec3, v: Vec3): State => ({ r, v });

// ================================================================================================ text tools

describe('text tools of the interchange module (hand values)', () => {
  it('formatReal writes 16 significant digits in the exponent form', () => {
    // -7.147205881293523E+07 is the text of JPL Horizons for the x position of the Earth on 1950-01-19.
    expect(formatReal(-71472058.81293523)).toBe('-7.147205881293523E+07');
    expect(formatReal(1)).toBe('1.000000000000000E+00');
    expect(formatReal(0)).toBe('0.000000000000000E+00');
    expect(formatReal(-2.5e-12)).toBe('-2.500000000000000E-12');
    // 16 digits are sufficient for a number that starts with 1 to 4: 1.5e123 is not a 64-bit number, the nearest one is 1.5e123 * (1 +- 1.1e-16).
    expect(formatReal(1.5e123)).toBe('1.500000000000000E+123');
  });

  it('parseReal accepts only decimal numbers', () => {
    expect(parseReal('-7.147205881293523E+07')).toBe(-71472058.81293523);
    expect(parseReal('1e3')).toBe(1000);
    expect(parseReal('+.5')).toBe(0.5);
    expect(parseReal('12.')).toBe(12);
    for (const bad of ['', '1.0D+01', '0x10', 'NaN', 'Infinity', '1e', '1 2', '1e999', '--1', '1,5']) expect(parseReal(bad), bad).toBeNaN();
  });

  it('CCSDS time strings in the four time scales', () => {
    expect(parseCcsdsTime('2000-01-01T12:00:00', 'TDB')).toBe(0);
    expect(parseCcsdsTime('2000-001T12:00:00.000Z', 'TDB')).toBe(0);
    expect(parseCcsdsTime('2030-01-01T00:00:00', 'TDB')).toBe(ET_2030);
    // 2000 is a leap year: day 60 is February 29, day 366 is December 31.
    expect(parseCcsdsTime('2000-060T00:00:00', 'TDB')).toBe(parseCcsdsTime('2000-02-29T00:00:00', 'TDB'));
    expect(parseCcsdsTime('2000-366T00:00:00', 'TDB')).toBe(parseCcsdsTime('2000-12-31T00:00:00', 'TDB'));
    // TT 12:00:00 = TAI 11:59:27.816 = UTC 11:58:55.816 on 2000-01-01 (TAI - UTC = 32 s).
    // TDB - TT at J2000: 0.001657 s * sin(357.53 deg) = -71 microseconds, second term -1 microsecond.
    const tt = parseCcsdsTime('2000-01-01T12:00:00', 'TT')!;
    expect(tt).toBeGreaterThan(-7.5e-5);
    expect(tt).toBeLessThan(-7.0e-5);
    expect(Math.abs(parseCcsdsTime('2000-01-01T11:59:27.816', 'TAI')! - tt)).toBeLessThan(1e-9);
    expect(Math.abs(parseCcsdsTime('2000-01-01T11:58:55.816', 'UTC')! - tt)).toBeLessThan(1e-9);
    // Leap second at the end of 2016: 23:59:60 is one SI second after 23:59:59.
    const a = parseCcsdsTime('2016-12-31T23:59:59', 'UTC')!;
    const b = parseCcsdsTime('2016-12-31T23:59:60.5', 'UTC')!;
    const c = parseCcsdsTime('2017-01-01T00:00:00', 'UTC')!;
    expect(Math.abs(b - a - 1.5)).toBeLessThan(1e-6);
    expect(Math.abs(c - a - 2)).toBeLessThan(1e-6);
    expect(Math.abs(c - ET_2017)).toBeLessThan(2e-3);
    // Version 1.0 of the Orbit Data Messages permitted a Julian date.
    expect(parseCcsdsTime('2451545.25', 'TDB', true)).toBe(21600);
    expect(parseCcsdsTime('2451545.25', 'TDB')).toBeNull();
  });

  it('time strings that are not correct give null', () => {
    const bad: [string, 'UTC' | 'TAI' | 'TDB'][] = [
      ['2015-12-31T23:59:60', 'UTC'], // no leap second at the end of 2015
      ['2016-12-31T23:59:60', 'TAI'], // TAI has no leap seconds
      ['2016-12-31T23:59:61', 'UTC'], ['2001-02-29T00:00:00', 'TDB'], ['2001-13-01T00:00:00', 'TDB'], ['2001-01-01T24:00:00', 'TDB'],
      ['2001-01-01T00:60:00', 'TDB'], ['2001-366T00:00:00', 'TDB'], ['2001-000T00:00:00', 'TDB'], ['2001-1-1T00:00:00', 'TDB'],
      ['2001-01-01 00:00:00', 'TDB'], ['2001-01-01T00:00', 'TDB'], ['01-01-2001T00:00:00', 'TDB'], ['', 'TDB'],
    ];
    for (const [s, scale] of bad) expect(parseCcsdsTime(s, scale), s).toBeNull();
  });

  it('Julian dates: integer part and fraction are read from the text', () => {
    expect(parseJulianDate('2451545.0', 'TDB')).toBe(0);
    expect(parseJulianDate('2451545', 'TDB')).toBe(0);
    expect(parseJulianDate('2451545.25', 'TDB')).toBe(21600);
    expect(parseJulianDate('2451544.5', 'TDB')).toBe(-43200);
    // 2457754.5 = 2451545.0 + 6209.5 is 2017-01-01T00:00:00.
    expect(Math.abs(parseJulianDate('2457754.5', 'UTC')! - ET_2017)).toBeLessThan(2e-3);
    for (const bad of ['2451545.0x', '-1.5', '2451545,5', '', '1e6']) expect(parseJulianDate(bad, 'TDB'), bad).toBeNull();
    expect(formatJulianDate({ year: 2000, month: 1, day: 1, hour: 12, minute: 0, second: 0 })).toBe('2451545.000000000000');
    expect(formatJulianDate({ year: 2000, month: 1, day: 1, hour: 18, minute: 0, second: 0 })).toBe('2451545.250000000000');
    expect(formatJulianDate({ year: 2017, month: 1, day: 1, hour: 0, minute: 0, second: 0 })).toBe('2457754.500000000000');
    // 0.0864 s is one millionth of a day.
    expect(formatJulianDate({ year: 2000, month: 1, day: 2, hour: 0, minute: 0, second: 0.0864 })).toBe('2451545.500001000000');
    // A reading in a leap second has no Julian date.
    expect(formatJulianDate({ year: 1977, month: 12, day: 31, hour: 23, minute: 59, second: 60.25 })).toBeNull();
  });

  it('centre names of CCSDS 502.0-B and of the SANA registry, and NAIF codes', () => {
    const names: [string, string | null][] = [
      ['SUN', 'SUN'], ['Sun', 'SUN'], ['EARTH', 'EARTH'], ['MOON', 'MOON'], ['SOLAR SYSTEM BARYCENTER', 'SSB'], ['solar_system_barycenter', 'SSB'],
      ['SSB', 'SSB'], ['MARS BARYCENTER', 'MARS_BARYCENTER'], ['JUPITER BARYCENTER', 'JUPITER_BARYCENTER'], ['EARTH BARYCENTER', 'EMB'],
      ['EARTH-MOON BARYCENTER', 'EMB'], ['VENUS BARYCENTRE', 'VENUS'], ['1 CERES', 'CERES'], ['433 EROS', 'EROS'], ['1P/HALLEY', 'HALLEY'],
      ['PLANET X', null], ['', null], ['BARYCENTER', null],
    ];
    for (const [name, id] of names) expect(centerFromName(name), name).toBe(id);
    expect(centerToName('SSB')).toBe('SOLAR SYSTEM BARYCENTER');
    expect(centerToName('JUPITER_BARYCENTER')).toBe('JUPITER BARYCENTER');
    expect(centerToName('EMB')).toBe('EARTH BARYCENTER');
    const codes: [number, string | null][] = [
      [0, 'SSB'], [10, 'SUN'], [1, 'MERCURY'], [2, 'VENUS'], [3, 'EMB'], [4, 'MARS_BARYCENTER'], [5, 'JUPITER_BARYCENTER'], [9, 'PLUTO_BARYCENTER'],
      [199, 'MERCURY'], [399, 'EARTH'], [301, 'MOON'], [499, 'MARS'], [599, 'JUPITER'], [999, 'PLUTO'], [606, 'TITAN'],
      [2000001, 'CERES'], [20000001, 'CERES'], [2000433, 'EROS'], [12345, null], [-32, null],
    ];
    for (const [code, id] of codes) expect(centerFromNaif(code), String(code)).toBe(id);
    // Each centre name that the writers make is read back as the same centre.
    for (const id of ['SSB', 'EMB', 'SUN', ...Object.keys(BODIES), 'MARS_BARYCENTER', 'JUPITER_BARYCENTER', 'SATURN_BARYCENTER', 'URANUS_BARYCENTER', 'NEPTUNE_BARYCENTER', 'PLUTO_BARYCENTER']) {
      expect(centerFromName(centerToName(id)), id).toBe(id);
    }
  });

  it('frames of CCSDS messages', () => {
    for (const f of ['ICRF', 'icrf', 'ICRF3', 'GCRF', 'EME2000', 'J2000']) expect(ccsdsFrame(f), f).toBe('ICRF');
    expect(ccsdsFrame('J2000_ECLIPTIC')).toBe('ECLIPJ2000');
    for (const f of ['TOD', 'ITRF2000', 'MCI', 'TEME', '']) expect(ccsdsFrame(f), f).toBeNull();
  });

  it('comment lines: printable ASCII, 254 characters at most', () => {
    const long = 'word '.repeat(80).trim(); // 399 characters
    const lines = kvnComments([long, 'two\nlines', 'caf' + String.fromCharCode(0xe9) + '\tbar']);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(254);
      expect(l.startsWith('COMMENT ')).toBe(true);
    }
    expect(lines.map((l) => l.slice(8)).join(' ')).toBe(long + ' two lines caf? bar');
    // The keyword COMMENT must have a blank and a value after it (6.7.4): a line with no text gives no comment line.
    expect(kvnComments(['a\n\n  \nb', ''])).toEqual(['COMMENT a', 'COMMENT b']);
    expect(kvnComments(undefined)).toEqual([]);
    expect(asciiText(String.fromCharCode(0x65e5, 0x672c) + ' a' + String.fromCharCode(0) + 'b')).toBe('?? a?b');
  });

  it('checkTable finds the tables that a file cannot hold', () => {
    const s0 = S([1, 2, 3], [4, 5, 6]);
    const ok: EphemerisTable = { objectName: 'A', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB', et: [0, 1, 1, 2], states: [s0, s0, s0, s0], segmentStarts: [0, 2] };
    expect(() => checkTable(ok, 'x.table')).not.toThrow();
    expect(segmentRanges(ok)).toEqual([[0, 1], [2, 3]]);
    expect(segmentRanges({ et: [0, 1, 2] })).toEqual([[0, 2]]);
    expectIoError(() => checkTable({ ...ok, et: [], states: [] }, 'x.table'), 'x.table', undefined, 'empty');
    expectIoError(() => checkTable({ ...ok, states: [s0] }, 'x.table'), 'x.table', undefined, 'length');
    expectIoError(() => checkTable({ ...ok, segmentStarts: [0, 9] }, 'x.table'), 'x.table', undefined, 'segment:9');
    expectIoError(() => checkTable({ ...ok, et: [0, 1, NaN, 2] }, 'x.table'), 'x.table', undefined, 'number:2');
    expectIoError(() => checkTable({ ...ok, states: [s0, s0, S([1, Infinity, 3], [4, 5, 6]), s0] }, 'x.table'), 'x.table', undefined, 'number:2');
    // Two equal times in one segment, and a segment that starts before the end of the segment before it.
    expectIoError(() => checkTable({ ...ok, segmentStarts: [0] }, 'x.table'), 'x.table', undefined, 'order:2');
    expectIoError(() => checkTable({ ...ok, et: [0, 1, 0.5, 2] }, 'x.table'), 'x.table', undefined, 'order:2');
  });
});

// ================================================================================================ OEM reader

/** Hand-written OEM, version 2.0 (CCSDS 502.0-B-2, section 5). The number at the left is the line number. */
const OEM_A = [
  /*  1 */ 'CCSDS_OEM_VERS = 2.0',
  /*  2 */ 'COMMENT Hand-written file for the reader test',
  /*  3 */ 'CREATION_DATE = 2026-10-14T09:30:00',
  /*  4 */ 'ORIGINATOR = TEST BENCH',
  /*  5 */ '',
  /*  6 */ 'META_START',
  /*  7 */ 'OBJECT_NAME = PROBE ONE',
  /*  8 */ 'OBJECT_ID = 2016-099A',
  /*  9 */ 'CENTER_NAME = SUN',
  /* 10 */ 'REF_FRAME = EME2000',
  /* 11 */ 'TIME_SYSTEM = UTC',
  /* 12 */ 'START_TIME = 2016-12-31T23:59:58',
  /* 13 */ 'USEABLE_START_TIME = 2016-12-31T23:59:58',
  /* 14 */ 'USEABLE_STOP_TIME = 2017-01-01T00:00:00',
  /* 15 */ 'STOP_TIME = 2017-01-01T00:00:00',
  /* 16 */ 'INTERPOLATION = HERMITE',
  /* 17 */ 'INTERPOLATION_DEGREE = 3',
  /* 18 */ 'META_STOP',
  /* 19 */ '',
  /* 20 */ 'COMMENT first block: three lines across a leap second',
  /* 21 */ '2016-12-31T23:59:58.000 150000000.0 -2.5E+07 1.0e3 10.0 -20.5 0.125',
  /* 22 */ '2016-12-31T23:59:60.000   1.50000020E8  -25000041.0   1000.25   10.0 -20.5 0.125   0.001 -0.002 0.003',
  /* 23 */ '2017-001T00:00:00Z 150000030 -25000061.5 1000.375 10 -20.5 0.125',
  /* 24 */ '',
  /* 25 */ 'COVARIANCE_START',
  /* 26 */ 'EPOCH = 2016-12-31T23:59:58',
  /* 27 */ 'COV_REF_FRAME = EME2000',
  /* 28 */ '1.0e-3',
  /* 29 */ '2.0e-4 1.0e-3',
  /* 30 */ 'COVARIANCE_STOP',
  /* 31 */ '',
  /* 32 */ 'META_START',
  /* 33 */ 'COMMENT second block: after a maneuver',
  /* 34 */ 'OBJECT_NAME = PROBE ONE',
  /* 35 */ 'OBJECT_ID = 2016-099A',
  /* 36 */ 'CENTER_NAME = SUN',
  /* 37 */ 'REF_FRAME = EME2000',
  /* 38 */ 'TIME_SYSTEM = UTC',
  /* 39 */ 'START_TIME = 2017-01-01T00:00:00',
  /* 40 */ 'STOP_TIME = 2017-01-01T00:01:00',
  /* 41 */ 'META_STOP',
  /* 42 */ '2017-01-01T00:00:00.000000 150000030 -25000061.5 1000.375 10.5 -20.5 0.125',
  /* 43 */ '2017-01-01T00:01:00.000000 150000660 -25001291.5 1007.875 10.5 -20.5 0.125',
];

/** Hand-written OEM, version 3.0 header keywords (CCSDS 502.0-B-3), one block in a uniform time scale. */
function oemV3(timeSystem: string, t0: string, t1: string): string {
  return join([
    'CCSDS_OEM_VERS = 3.0',
    'COMMENT version 3.0 header',
    'CLASSIFICATION = public test data',
    'CREATION_DATE = 2026-10-14T00:00:00',
    'ORIGINATOR = TEST',
    'MESSAGE_ID = TEST-0001',
    'META_START',
    'OBJECT_NAME = DEEP PROBE',
    'OBJECT_ID = UNKNOWN',
    'CENTER_NAME = SOLAR SYSTEM BARYCENTER',
    'REF_FRAME = ICRF3',
    'TIME_SYSTEM = ' + timeSystem,
    'START_TIME = ' + t0,
    'STOP_TIME = ' + t1,
    'META_STOP',
    t0 + ' 1.0E+09 2.0E+09 -3.0E+09 1.0 2.0 3.0',
    t1 + ' 1.0000006E+09 2.0000012E+09 -2.9999982E+09 1.0 2.0 3.0',
  ]);
}

describe('CCSDS OEM reader: files written by hand from the specification', () => {
  it('version 2.0: two blocks, comments, acceleration columns, covariance block, day-of-year time, UTC leap second', () => {
    const t = parseOem(join(OEM_A));
    expect(t.objectName).toBe('PROBE ONE');
    expect(t.objectId).toBe('2016-099A');
    expect(t.center).toBe('SUN');
    expect(t.frame).toBe('ICRF'); // EME2000 is read as the axes of the ICRF
    expect(t.timeScale).toBe('UTC');
    expect(t.comments).toEqual(['Hand-written file for the reader test', 'first block: three lines across a leap second', 'second block: after a maneuver']);
    expect(t.et.length).toBe(5);
    expect(t.segmentStarts).toEqual([0, 3]);
    // Seconds after the first line, by hand: 23:59:58, 23:59:60 (leap second), 00:00:00, 00:00:00, 00:01:00.
    const hand = [0, 2, 3, 3, 63];
    for (let k = 0; k < 5; k++) expect(Math.abs(t.et[k] - t.et[0] - hand[k]), 'line ' + k).toBeLessThan(1e-6);
    expect(Math.abs(t.et[2] - ET_2017)).toBeLessThan(2e-3);
    expect(t.et[3]).toBe(t.et[2]);
    expect(t.states[0]).toEqual(S([150000000, -25000000, 1000], [10, -20.5, 0.125]));
    expect(t.states[1]).toEqual(S([150000020, -25000041, 1000.25], [10, -20.5, 0.125])); // the acceleration is not used
    expect(t.states[2]).toEqual(S([150000030, -25000061.5, 1000.375], [10, -20.5, 0.125]));
    expect(t.states[3]).toEqual(S([150000030, -25000061.5, 1000.375], [10.5, -20.5, 0.125]));
    expect(t.states[4]).toEqual(S([150000660, -25001291.5, 1007.875], [10.5, -20.5, 0.125]));
  });

  it('version 1.0: Julian dates, TDB, centre MARS BARYCENTER', () => {
    const t = parseOem(join([
      'CCSDS_OEM_VERS = 1.0',
      'CREATION_DATE = 2004-281T17:26:06',
      'ORIGINATOR = TEST',
      'META_START',
      'OBJECT_NAME = MARS ORBITER',
      'OBJECT_ID = 2004-001A',
      'CENTER_NAME = MARS BARYCENTER',
      'REF_FRAME = ICRF',
      'TIME_SYSTEM = TDB',
      'START_TIME = 2451545.0',
      'STOP_TIME = 2451545.5',
      'META_STOP',
      '2451545.0 1 2 3 4 5 6',
      '2451545.25 2 3 4 5 6 7',
      '2451545.5 3 4 5 6 7 8',
    ]));
    expect(t.center).toBe('MARS_BARYCENTER');
    expect(t.timeScale).toBe('TDB');
    expect(t.et).toEqual([0, 21600, 43200]);
    expect(t.states[2]).toEqual(S([3, 4, 5], [6, 7, 8]));
    expect(t.comments).toBeUndefined();
  });

  it('version 3.0: header keywords CLASSIFICATION and MESSAGE_ID, frame ICRF3, the same instant in TT, TAI, UTC and TDB', () => {
    const tt = parseOem(oemV3('TT', '2000-01-01T12:00:00', '2000-01-01T12:10:00'));
    expect(tt.center).toBe('SSB');
    expect(tt.frame).toBe('ICRF');
    expect(tt.timeScale).toBe('TT');
    expect(tt.objectId).toBe('UNKNOWN');
    expect(tt.states[1]).toEqual(S([1000000600, 2000001200, -2999998200], [1, 2, 3]));
    // TT 12:00:00 at J2000: et = TDB - TT = -73 microseconds (see the time test above).
    expect(tt.et[0]).toBeGreaterThan(-7.5e-5);
    expect(tt.et[0]).toBeLessThan(-7.0e-5);
    // 600 s of TT are 600 s of TDB plus the change of TDB - TT. By hand: the rate of TDB - TT in January is
    // 0.001657 s * 1.991e-7 rad/s = 3.3e-10 s/s (the Earth is near its perihelion): 2.0e-7 s in 600 s.
    expect(tt.et[1] - tt.et[0] - 600).toBeGreaterThan(1.9e-7);
    expect(tt.et[1] - tt.et[0] - 600).toBeLessThan(2.1e-7);
    const tai = parseOem(oemV3('TAI', '2000-01-01T11:59:27.816', '2000-01-01T12:09:27.816'));
    const utc = parseOem(oemV3('UTC', '2000-01-01T11:58:55.816', '2000-01-01T12:08:55.816'));
    const tdb = parseOem(oemV3('TDB', '2000-01-01T12:00:00', '2000-01-01T12:10:00'));
    expect(tai.timeScale).toBe('TAI');
    expect(Math.abs(tai.et[0] - tt.et[0])).toBeLessThan(1e-9);
    expect(Math.abs(utc.et[0] - tt.et[0])).toBeLessThan(1e-9);
    expect(tdb.et).toEqual([0, 600]);
  });

  it('two blocks that overlap in time: the second block is used from the start of its useable time', () => {
    const meta = (start: string, stop: string, useable?: string): string[] => [
      'META_START', 'OBJECT_NAME = A', 'OBJECT_ID = B', 'CENTER_NAME = EARTH', 'REF_FRAME = GCRF', 'TIME_SYSTEM = TDB',
      'START_TIME = ' + start, ...(useable ? ['USEABLE_START_TIME = ' + useable] : []), 'STOP_TIME = ' + stop, 'META_STOP',
    ];
    const line = (hms: string, x: number): string => `2030-01-01T${hms} ${x} 0 0 1 0 0`;
    const file = join([
      'CCSDS_OEM_VERS = 2.0', 'CREATION_DATE = 2026-10-14T00:00:00', 'ORIGINATOR = TEST',
      ...meta('2030-01-01T12:00:00', '2030-01-01T12:03:00'),
      line('12:00:00', 100), line('12:01:00', 160), line('12:02:00', 220), line('12:03:00', 280),
      ...meta('2030-01-01T12:01:00', '2030-01-01T12:04:00', '2030-01-01T12:02:00'),
      line('12:01:00', 161), line('12:02:00', 221), line('12:03:00', 281), line('12:04:00', 341),
    ]);
    const t = parseOem(file);
    const noon = ET_2030 + 43200;
    expect(t.center).toBe('EARTH');
    expect(t.et).toEqual([noon, noon + 60, noon + 120, noon + 120, noon + 180, noon + 240]);
    expect(t.states.map((s) => s.r[0])).toEqual([100, 160, 220, 221, 281, 341]);
    expect(t.segmentStarts).toEqual([0, 3]);
  });

  it('a file with times that decrease (a propagation backward in time) is put in the order of time', () => {
    const meta = (start: string, stop: string): string[] => [
      'META_START', 'OBJECT_NAME = A', 'OBJECT_ID = B', 'CENTER_NAME = SUN', 'REF_FRAME = ICRF', 'TIME_SYSTEM = TDB',
      'START_TIME = ' + start, 'STOP_TIME = ' + stop, 'META_STOP',
    ];
    const t = parseOem(join([
      'CCSDS_OEM_VERS = 2.0', 'CREATION_DATE = 2026-10-14T00:00:00', 'ORIGINATOR = TEST',
      ...meta('2030-01-01T00:02:00', '2030-01-01T00:01:00'),
      '2030-01-01T00:02:00 5 0 0 1 0 0', '2030-01-01T00:01:00 4 0 0 1 0 0',
      ...meta('2030-01-01T00:01:00', '2030-01-01T00:00:00'),
      '2030-01-01T00:01:00 3 0 0 1 0 0', '2030-01-01T00:00:30 2 0 0 1 0 0', '2030-01-01T00:00:00 1 0 0 1 0 0',
    ]));
    expect(t.et).toEqual([ET_2030, ET_2030 + 30, ET_2030 + 60, ET_2030 + 60, ET_2030 + 120]);
    expect(t.states.map((s) => s.r[0])).toEqual([1, 2, 3, 4, 5]);
    expect(t.segmentStarts).toEqual([0, 3]);
  });

  it('malformed files give an IoError with the code and the line number', () => {
    const A = OEM_A;
    expectIoError(() => parseOem(''), 'oem.header', 1);
    expectIoError(() => parseOem(withLine(A, 1, 'CCSDS_OPM_VERS = 2.0')), 'oem.header', 1);
    expectIoError(() => parseOem(withLine(A, 1, 'CCSDS_OEM_VERS = 4.0')), 'oem.version', 1, '4.0');
    expectIoError(() => parseOem(withLine(A, 2, 'FOO = 1')), 'oem.keyword', 2, 'FOO');
    expectIoError(() => parseOem(withLine(A, 2, 'this is not a keyword line')), 'oem.header', 2);
    expectIoError(() => parseOem(withLine(A, 3, 'CREATION_DATE = 2026-10-14')), 'oem.time', 3);
    // ORIGINATOR is not there: the error is at the line where the header ends (META_START, now line 5).
    expectIoError(() => parseOem(withLine(A, 4, null)), 'oem.header', 5, 'ORIGINATOR');
    expectIoError(() => parseOem(join(A.slice(0, 4))), 'oem.meta', 4, 'META_START');
    expectIoError(() => parseOem(withLine(A, 9, 'CENTER_NAME = PLANET X')), 'oem.center', 9, 'PLANET X');
    // An obligatory keyword is not there: the error is at META_STOP.
    expectIoError(() => parseOem(withLine(A, 9, 'COMMENT no centre')), 'oem.meta', 18, 'CENTER_NAME');
    expectIoError(() => parseOem(withLine(A, 10, 'REF_FRAME = TOD')), 'oem.frame', 10, 'TOD');
    expectIoError(() => parseOem(withLine(A, 11, 'TIME_SYSTEM = GPS')), 'oem.timeSystem', 11, 'GPS');
    // TAI has no leap second: line 22 is not a time.
    expectIoError(() => parseOem(withLine(A, 11, 'TIME_SYSTEM = TAI')), 'oem.time', 22);
    expectIoError(() => parseOem(withLine(A, 12, 'START_TIME = 2016-12-32T00:00:00')), 'oem.time', 12);
    expectIoError(() => parseOem(withLine(A, 17, 'OBJECT_NAME = AGAIN')), 'oem.keyword', 17, 'OBJECT_NAME');
    expectIoError(() => parseOem(withLine(A, 17, 'MAN_DV_1 = 1')), 'oem.keyword', 17, 'MAN_DV_1');
    // No META_STOP: the first ephemeris line is not a keyword line.
    expectIoError(() => parseOem(withLine(A, 18, '')), 'oem.meta', 21);
    expectIoError(() => parseOem(withLine(A, 21, '2016-12-31T23:59:58.000 150000000.0 -2.5E+07 1.0e3 10.0 -20.5')), 'oem.state', 21);
    expectIoError(() => parseOem(withLine(A, 22, '2016-12-31T23:59:60.000 1.5E8 abc 1000.25 10.0 -20.5 0.125')), 'oem.state', 22);
    // A Julian date is not a time of version 2.0.
    expectIoError(() => parseOem(withLine(A, 21, '2457753.499976852 150000000.0 -2.5E+07 1.0e3 10.0 -20.5 0.125')), 'oem.time', 21);
    expectIoError(() => parseOem(withLine(A, 23, '2016-12-31T23:59:60.000 150000030 -25000061.5 1000.375 10 -20.5 0.125')), 'oem.order', 23);
    expectIoError(() => parseOem(withLine(A, 30, 'COMMENT no end of the covariance')), 'oem.covariance', 25);
    expectIoError(() => parseOem(join(A.slice(0, 41))), 'oem.data', 41);
    expectIoError(() => parseOem(withLine(A, 36, 'CENTER_NAME = EARTH')), 'oem.mixed', 32);
    expectIoError(() => parseOem(withLine(A, 38, 'TIME_SYSTEM = TDB')), 'oem.mixed', 32);
  });
});

// ================================================================================================ OEM writer

const CCSDS_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/;
/** Real number of a message: the mantissa has 16 digits at most (CCSDS 502.0-B-2, 6.5.5). */
const CCSDS_REAL = /^[-+]?\d\.\d{1,15}E[-+]\d{2,3}$/;
const OEM_META_ORDER = ['OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'REF_FRAME_EPOCH', 'TIME_SYSTEM', 'START_TIME', 'USEABLE_START_TIME', 'USEABLE_STOP_TIME', 'STOP_TIME', 'INTERPOLATION', 'INTERPOLATION_DEGREE'];
const OEM_META_OBLIGATORY = ['OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM', 'START_TIME', 'STOP_TIME'];

interface OemShape { header: Record<string, string>; comments: string[]; blocks: { meta: Record<string, string>; data: string[][] }[] }

/**
 * Structure rules of CCSDS 502.0-B-2 for an OEM in the keyword = value notation, written here from the standard:
 * lines of 254 characters at most (6.3.2), printable ASCII, keywords in upper case with the form 'KEYWORD = value'
 * (6.4), header and metadata keywords in the order of tables 5-2 and 5-3 with all the obligatory keywords, comments
 * only where 6.7.5 permits them, ephemeris lines of an epoch and six numbers.
 */
function oemShape(text: string): OemShape {
  expect(text.endsWith('\n')).toBe(true);
  const lines = text.split('\n').slice(0, -1);
  for (const l of lines) {
    expect(l.length).toBeLessThanOrEqual(254);
    expect(l).toMatch(/^[\x20-\x7e]*$/);
  }
  const kv = (l: string): [string, string] => {
    const m = /^([A-Z][A-Z0-9_]*) = (\S.*)$/.exec(l);
    expect(m, 'keyword line: ' + l).not.toBeNull();
    return [m![1], m![2]];
  };
  const shape: OemShape = { header: {}, comments: [], blocks: [] };
  let i = 0;
  // header: version, comments, CREATION_DATE, ORIGINATOR
  expect(lines[i]).toBe('CCSDS_OEM_VERS = 2.0');
  i++;
  while (lines[i].startsWith('COMMENT')) shape.comments.push(lines[i++].slice(8));
  for (const key of ['CREATION_DATE', 'ORIGINATOR']) {
    const [k, v] = kv(lines[i++]);
    expect(k).toBe(key);
    shape.header[k] = v;
  }
  expect(shape.header.CREATION_DATE).toMatch(CCSDS_TIME);
  while (i < lines.length) {
    if (lines[i] === '') { i++; continue; }
    expect(lines[i]).toBe('META_START');
    i++;
    const meta: Record<string, string> = {};
    let last = -1;
    for (; lines[i] !== 'META_STOP'; i++) {
      const [k, v] = kv(lines[i]);
      const pos = OEM_META_ORDER.indexOf(k);
      expect(pos, 'metadata keyword ' + k).toBeGreaterThan(last);
      last = pos;
      meta[k] = v;
    }
    i++;
    for (const k of OEM_META_OBLIGATORY) expect(meta[k], k).toBeDefined();
    const data: string[][] = [];
    for (; i < lines.length && lines[i] !== 'META_START'; i++) {
      if (lines[i] === '') continue;
      const tok = lines[i].trim().split(/ +/);
      expect(tok.length).toBe(7);
      expect(tok[0]).toMatch(CCSDS_TIME);
      for (const x of tok.slice(1)) expect(x).toMatch(CCSDS_REAL);
      data.push(tok);
    }
    expect(data.length).toBeGreaterThan(0);
    // START_TIME and STOP_TIME are the limits of the ephemeris lines of the block.
    expect(meta.START_TIME).toBe(data[0][0]);
    expect(meta.STOP_TIME).toBe(data[data.length - 1][0]);
    shape.blocks.push({ meta, data });
  }
  return shape;
}

describe('CCSDS OEM writer: structure rules and hand values', () => {
  const table: EphemerisTable = {
    objectName: 'Probe one', objectId: '2030-001A', center: 'SSB', frame: 'ICRF', timeScale: 'TDB',
    et: [0, 60, 60, 120, 180],
    states: [S([1, -2.5, 3e8], [0.001, -30.125, 0]), S([2, 0, 0], [0, 0, 0]), S([2, 0, 0], [0.5, 0, 0]), S([3, 0, 0], [0, 0, 0]), S([4, 0, 0], [0, 0, 0])],
    segmentStarts: [0, 2],
    comments: ['Comment from the caller', 'x'.repeat(300)],
  };

  it('header, metadata blocks, ephemeris lines', () => {
    const text = writeOem(table, { originator: 'Apsis test', creationEt: 0 });
    const s = oemShape(text);
    // et = 0 is 2000-01-01T11:58:55.816 UTC: the creation date has whole seconds.
    expect(s.header).toEqual({ CREATION_DATE: '2000-01-01T11:58:56', ORIGINATOR: 'APSIS TEST' });
    expect(s.comments.length).toBe(3); // the long comment is on two lines
    expect(s.comments[0]).toBe('Comment from the caller');
    expect(s.comments[1] + s.comments[2]).toBe('x'.repeat(300));
    expect(s.blocks.length).toBe(2);
    expect(s.blocks[0].meta).toEqual({
      OBJECT_NAME: 'PROBE ONE', OBJECT_ID: '2030-001A', CENTER_NAME: 'SOLAR SYSTEM BARYCENTER', REF_FRAME: 'ICRF', TIME_SYSTEM: 'TDB',
      START_TIME: '2000-01-01T12:00:00.000000', STOP_TIME: '2000-01-01T12:01:00.000000', INTERPOLATION: 'HERMITE', INTERPOLATION_DEGREE: '3',
    });
    // The second block has three lines: a Hermite polynomial through three points has the degree 5 at most.
    expect(s.blocks[1].meta.INTERPOLATION_DEGREE).toBe('5');
    expect(s.blocks[0].data[0]).toEqual(['2000-01-01T12:00:00.000000', '1.000000000000000E+00', '-2.500000000000000E+00', '3.000000000000000E+08', '1.000000000000000E-03', '-3.012500000000000E+01', '0.000000000000000E+00']);
    expect(s.blocks[1].data.map((d) => d[0])).toEqual(['2000-01-01T12:01:00.000000', '2000-01-01T12:02:00.000000', '2000-01-01T12:03:00.000000']);
    expect(s.blocks[1].data[0][4]).toBe('5.000000000000000E-01');
  });

  it('time labels in the four time scales (hand values for et = 0)', () => {
    // TT = TDB + 73 microseconds at J2000, TAI = TT - 32.184 s, UTC = TAI - 32 s.
    const first = (scale: 'TDB' | 'TT' | 'TAI' | 'UTC'): string => oemShape(writeOem({ ...table, timeScale: scale }, { originator: 'A', creationEt: 0 })).blocks[0].data[0][0];
    expect(first('TDB')).toBe('2000-01-01T12:00:00.000000');
    expect(first('TT')).toMatch(/^2000-01-01T12:00:00\.00007[23]$/);
    expect(first('TAI')).toMatch(/^2000-01-01T11:59:27\.81607[23]$/);
    expect(first('UTC')).toMatch(/^2000-01-01T11:58:55\.81607[23]$/);
  });

  it('a table in the ecliptic frame is written in the ICRF', () => {
    // The y axis of ECLIPJ2000 in the ICRF is (0, cos e, sin e), e = 84381.448 arcseconds.
    const ecl: EphemerisTable = { ...table, frame: 'ECLIPJ2000', et: [0], states: [S([0, 1000, 0], [0, 0, 1])], segmentStarts: [0], comments: undefined };
    const s = oemShape(writeOem(ecl, { originator: 'A', creationEt: 0 }));
    expect(s.blocks[0].meta.REF_FRAME).toBe('ICRF');
    expect(s.blocks[0].meta.INTERPOLATION).toBeUndefined(); // one line: no interpolation
    const x = s.blocks[0].data[0].slice(1).map(Number);
    expect(maxAbs(x, [0, 1000 * Math.cos(EPS), 1000 * Math.sin(EPS), 0, -Math.sin(EPS), Math.cos(EPS)])).toBeLessThan(1e-12);
  });

  it('options and tables that are not correct', () => {
    expectIoError(() => writeOem({ ...table, et: [0, 60, 30, 120, 180] }, { originator: 'A', creationEt: 0 }), 'oem.table', undefined, 'order:2');
    expectIoError(() => writeOem(table, { originator: 'A', creationEt: NaN }), 'oem.option');
    expectIoError(() => writeOem(table, { originator: 'A', creationEt: 0, interpolationDegree: 0 }), 'oem.option');
    const lagrange = oemShape(writeOem(table, { originator: '', creationEt: 0, interpolation: 'lagrange', interpolationDegree: 9 }));
    expect(lagrange.header.ORIGINATOR).toBe('UNKNOWN');
    expect(lagrange.blocks.map((b) => [b.meta.INTERPOLATION, b.meta.INTERPOLATION_DEGREE])).toEqual([['LAGRANGE', '1'], ['LAGRANGE', '2']]);
  });
});

// ================================================================================================ OPM

/** Hand-written OPM, version 2.0 (CCSDS 502.0-B-2, section 3). The state is at an apsis of an orbit of the Earth. */
const OPM_A = [
  /*  1 */ 'CCSDS_OPM_VERS = 2.0',
  /*  2 */ 'COMMENT Hand-written file for the reader test',
  /*  3 */ 'CREATION_DATE = 2026-10-14T09:30:00',
  /*  4 */ 'ORIGINATOR = TEST BENCH',
  /*  5 */ 'OBJECT_NAME = PROBE ONE',
  /*  6 */ 'OBJECT_ID = 2026-001A',
  /*  7 */ 'CENTER_NAME = EARTH',
  /*  8 */ 'REF_FRAME = ICRF',
  /*  9 */ 'TIME_SYSTEM = TDB',
  /* 10 */ 'COMMENT state',
  /* 11 */ 'EPOCH = 2030-01-01T00:00:00',
  /* 12 */ 'X = 7000.0 [km]',
  /* 13 */ 'Y = 0.0 [km]',
  /* 14 */ 'Z = 0.0 [km]',
  /* 15 */ 'X_DOT = 0.0 [km/s]',
  /* 16 */ 'Y_DOT = 7.5 [km/s]',
  /* 17 */ 'Z_DOT = 0.0 [km/s]',
  /* 18 */ 'SEMI_MAJOR_AXIS = 6915.84 [km]',
  /* 19 */ 'ECCENTRICITY = 0.012169',
  /* 20 */ 'INCLINATION = 0.0 [deg]',
  /* 21 */ 'RA_OF_ASC_NODE = 0.0 [deg]',
  /* 22 */ 'ARG_OF_PERICENTER = 180.0 [deg]',
  /* 23 */ 'TRUE_ANOMALY = 180.0 [deg]',
  /* 24 */ 'GM = 398600.4415 [km**3/s**2]',
  /* 25 */ 'MASS = 2000.0 [kg]',
  /* 26 */ 'SOLAR_RAD_AREA = 12.5 [m**2]',
  /* 27 */ 'SOLAR_RAD_COEFF = 1.3',
  /* 28 */ 'DRAG_AREA = 10.0 [m**2]',
  /* 29 */ 'DRAG_COEFF = 2.2',
  /* 30 */ 'COMMENT first maneuver',
  /* 31 */ 'MAN_EPOCH_IGNITION = 2030-01-01T00:00:00',
  /* 32 */ 'MAN_DURATION = 0.0 [s]',
  /* 33 */ 'MAN_DELTA_MASS = -224.8 [kg]',
  /* 34 */ 'MAN_REF_FRAME = TNW',
  /* 35 */ 'MAN_DV_1 = 0.1 [km/s]',
  /* 36 */ 'MAN_DV_2 = 0.2 [km/s]',
  /* 37 */ 'MAN_DV_3 = 0.3 [km/s]',
  /* 38 */ 'USER_DEFINED_NOTE = not used',
];
const EARTH_ONLY: ForceModel = { bodies: ['SUN', 'EARTH'], moons: false, j2: false, relativity: false, srp: null };

describe('CCSDS OPM: reader, writer and flights', () => {
  it('hand-written file: state, spacecraft parameters, maneuver, comments', () => {
    const o = parseOpm(join(OPM_A));
    expect(o.objectName).toBe('PROBE ONE');
    expect(o.objectId).toBe('2026-001A');
    expect(o.center).toBe('EARTH');
    expect(o.frame).toBe('ICRF');
    expect(o.timeScale).toBe('TDB');
    expect(o.et).toBe(ET_2030);
    expect(o.state).toEqual(S([7000, 0, 0], [0, 7.5, 0]));
    expect(o.spacecraft).toEqual({ massKg: 2000, solarRadAreaM2: 12.5, solarRadCoeff: 1.3, dragAreaM2: 10, dragCoeff: 2.2 });
    expect(o.comments).toEqual(['Hand-written file for the reader test', 'state']);
    // TNW (0.1, 0.2, 0.3): T = V of Apsis, W = N of Apsis, N of the message = -B of Apsis.
    expect(o.maneuvers).toEqual([{ et: ET_2030, durationS: 0, deltaMassKg: -224.8, frame: 'VNB', dv: [0.1, 0.3, -0.2], comments: ['first maneuver'] }]);
  });

  it('maneuver frames: the velocity change in the ICRF is the hand value for each frame of the message', () => {
    // State: r = 7000 km along +x, v = 7.5 km/s along +y. Unit vectors in the ICRF, by hand:
    //   radial R = +x, velocity V = T = +y, orbit normal (r x v) = +z.
    //   TNW:  T = +y, W = +z, N = W x T = -x          -> 0.1 T + 0.2 N + 0.3 W = (-0.2, 0.1, 0.3)
    //   RTN:  R = +x, T = N x R = +y, N = +z          -> (0.1, 0.2, 0.3)
    //   VNC:  V = +y, N = +z, C = V x N = +x          -> (0.3, 0.1, 0.2)
    //   NTW:  T = +y, W = +z, N = T x W = +x          -> 0.1 N + 0.2 T + 0.3 W = (0.1, 0.2, 0.3)
    //   LVLH: z = -R = -x, y = -normal = -z, x = y x z = +y -> 0.1 (+y) + 0.2 (-z) + 0.3 (-x) = (-0.3, 0.1, -0.2)
    //   J2000_ECLIPTIC: rotation about x by the obliquity e -> (0.1, 0.2 cos e - 0.3 sin e, 0.2 sin e + 0.3 cos e)
    const cases: [string, Vec3][] = [
      ['TNW', [-0.2, 0.1, 0.3]], ['RTN', [0.1, 0.2, 0.3]], ['RSW', [0.1, 0.2, 0.3]], ['VNC', [0.3, 0.1, 0.2]], ['NTW_INERTIAL', [0.1, 0.2, 0.3]],
      ['LVLH', [-0.3, 0.1, -0.2]], ['LVLH_ROTATING', [-0.3, 0.1, -0.2]], ['EME2000', [0.1, 0.2, 0.3]], ['ICRF', [0.1, 0.2, 0.3]],
      ['J2000_ECLIPTIC', [0.1, 0.2 * Math.cos(EPS) - 0.3 * Math.sin(EPS), 0.2 * Math.sin(EPS) + 0.3 * Math.cos(EPS)]],
    ];
    for (const [frame, icrf] of cases) {
      const opm = parseOpm(withLine(OPM_A, 34, 'MAN_REF_FRAME = ' + frame));
      const flight = flightFromOpm(sys, opm, EARTH_ONLY, opm.et + 600);
      expect(flight.et0).toBe(ET_2030);
      const ev = flyFlight(sys, flight).events.find((e) => e.type === 'maneuver')!;
      // The position relative to the Earth has an error of 2e-8 km (a sum with 1.5e8 km): the axes turn by 3e-12 rad.
      expect(maxAbs(ev.dvIcrf!, icrf), frame).toBeLessThan(1e-11);
    }
    // The start state of the flight is the state of the message plus the state of the Earth.
    const flight = flightFromOpm(sys, parseOpm(join(OPM_A)), EARTH_ONLY, ET_2030 + 600);
    const earth = sys.state('EARTH', ET_2030);
    expect(maxAbs(sub(flight.state0.r, earth.r), [7000, 0, 0])).toBeLessThan(1e-7);
    expect(maxAbs(sub(flight.state0.v, earth.v), [0, 7.5, 0])).toBeLessThan(1e-14);
    expect(flight.maneuvers).toEqual([{ id: 'man1', et: ET_2030, dv: [0.1, 0.3, -0.2], frame: 'VNB', refBody: 'EARTH' }]);
  });

  it('writer: keyword order of tables 3-1 to 3-3, units, frames of the maneuvers', () => {
    const opm: Opm = {
      objectName: 'Probe one', objectId: '2026-001A', center: 'EARTH', frame: 'ICRF', timeScale: 'TDB', et: ET_2030, state: S([7000, 0, 0], [0, 7.5, 0]),
      spacecraft: { massKg: 2000, solarRadAreaM2: 12.5, solarRadCoeff: 1.3 },
      maneuvers: [
        { et: ET_2030, durationS: 0, deltaMassKg: -224.8, frame: 'VNB', dv: [0.1, 0.3, -0.2], comments: ['Maneuver comment from the caller'] },
        { et: ET_2030 + 60, durationS: 0, deltaMassKg: -1, frame: 'RTN', dv: [0.01, 0.02, 0.03] },
        { et: ET_2030 + 120, durationS: 0, deltaMassKg: -1, frame: 'ECLIPJ2000', dv: [0, 1, 0] },
      ],
      comments: ['Comment from the caller'],
    };
    const text = writeOpm(opm, { originator: 'Apsis test', creationEt: 0 });
    const lines = text.split('\n').slice(0, -1).filter((l) => l !== '');
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(254);
      expect(l).toMatch(/^[\x20-\x7e]*$/);
    }
    const keys = lines.map((l) => (l.startsWith('COMMENT') ? 'COMMENT' : /^([A-Z0-9_]+) = \S/.exec(l)![1]));
    const man = ['MAN_EPOCH_IGNITION', 'MAN_DURATION', 'MAN_DELTA_MASS', 'MAN_REF_FRAME', 'MAN_DV_1', 'MAN_DV_2', 'MAN_DV_3'];
    expect(keys).toEqual([
      'CCSDS_OPM_VERS', 'COMMENT', 'CREATION_DATE', 'ORIGINATOR', 'OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'TIME_SYSTEM',
      'EPOCH', 'X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT', 'MASS', 'SOLAR_RAD_AREA', 'SOLAR_RAD_COEFF', 'COMMENT', ...man, ...man, ...man,
    ]);
    const value = (key: string, n = 0): string => lines.filter((l) => l.startsWith(key + ' = '))[n].slice(key.length + 3);
    expect(value('CCSDS_OPM_VERS')).toBe('2.0');
    expect(value('CREATION_DATE')).toBe('2000-01-01T11:58:56');
    expect(value('ORIGINATOR')).toBe('APSIS TEST');
    expect(value('CENTER_NAME')).toBe('EARTH');
    expect(value('EPOCH')).toBe('2030-01-01T00:00:00.000000');
    expect(value('X')).toBe('7.000000000000000E+03 [km]');
    expect(value('Y_DOT')).toBe('7.500000000000000E+00 [km/s]');
    expect(value('MASS')).toBe('2.000000000000000E+03 [kg]');
    expect(value('SOLAR_RAD_AREA')).toBe('1.250000000000000E+01 [m**2]');
    expect(value('SOLAR_RAD_COEFF')).toBe('1.300000000000000E+00');
    expect(value('MAN_DURATION')).toBe('0.000000000000000E+00 [s]');
    expect(value('MAN_DELTA_MASS')).toBe('-2.248000000000000E+02 [kg]');
    // VNB (0.1, 0.3, -0.2) of Apsis is TNW (0.1, 0.2, 0.3): the hand value of the test above.
    expect([value('MAN_REF_FRAME'), value('MAN_DV_1'), value('MAN_DV_2'), value('MAN_DV_3')]).toEqual(['TNW', '1.000000000000000E-01 [km/s]', '2.000000000000000E-01 [km/s]', '3.000000000000000E-01 [km/s]']);
    expect([value('MAN_REF_FRAME', 1), value('MAN_DV_1', 1)]).toEqual(['RTN', '1.000000000000000E-02 [km/s]']);
    expect(value('MAN_EPOCH_IGNITION', 1)).toBe('2030-01-01T00:01:00.000000');
    // ECLIPJ2000 (0, 1, 0) in the ICRF is (0, cos e, sin e).
    expect(value('MAN_REF_FRAME', 2)).toBe('ICRF');
    expect(Math.abs(parseFloat(value('MAN_DV_2', 2)) - Math.cos(EPS))).toBeLessThan(1e-15);
    expect(Math.abs(parseFloat(value('MAN_DV_3', 2)) - Math.sin(EPS))).toBeLessThan(1e-15);

    // Round trip (consistency check): the reader gives the same data.
    const back = parseOpm(text);
    expect(back.maneuvers.map((m) => [m.frame, m.et])).toEqual([['VNB', ET_2030], ['RTN', ET_2030 + 60], ['ICRF', ET_2030 + 120]]);
    expect(back.maneuvers[0]).toEqual({ ...opm.maneuvers[0], comments: ['Maneuver comment from the caller'] });
    expect(back.state).toEqual(opm.state);
    expect(back.spacecraft).toEqual(opm.spacecraft);
    expect(back.comments).toEqual(['Comment from the caller']);

    // A message with a maneuver must have the mass (3.2.4.9); a change of mass is a negative number (3.2.4.7).
    expectIoError(() => writeOpm({ ...opm, spacecraft: undefined }, { originator: 'A', creationEt: 0 }), 'opm.mass');
    expectIoError(() => writeOpm({ ...opm, maneuvers: [{ ...opm.maneuvers[0], deltaMassKg: 0 }] }, { originator: 'A', creationEt: 0 }), 'opm.deltaMass', undefined, '0');
    expectIoError(() => writeOpm({ ...opm, state: S([NaN, 0, 0], [0, 0, 0]) }, { originator: 'A', creationEt: 0 }), 'opm.number');
  });

  it('flight to message: frames of the maneuvers and change of mass (rocket equation)', () => {
    const earth = sys.state('EARTH', ET_2030);
    const flight: Flight = {
      et0: ET_2030, state0: S(add(earth.r, [7000, 0, 0]), add(earth.v, [0, 7.5, 0])), etEnd: ET_2030 + 3600,
      maneuvers: [
        { id: 'a', et: ET_2030, dv: [0.1, 0.3, -0.2], frame: 'VNB', refBody: 'EARTH' },
        { id: 'zero', et: ET_2030 + 100, dv: [0, 0, 0], frame: 'ICRF', refBody: 'SUN' },
        { id: 'b', et: ET_2030 + 600, dv: [0, 0.05, 0], frame: 'ECLIPJ2000', refBody: 'SUN' },
      ],
      model: { ...EARTH_ONLY, srp: { areaToMass: 0.005, cr: 1.3 } },
    };
    const sc = { massKg: 2000, ispS: 320 };
    // Centre Earth: the local frame of the maneuver refers to the centre of the message, thus it stays.
    const geo = opmFromFlight(sys, flight, { objectName: 'P', objectId: 'UNKNOWN', center: 'EARTH', frame: 'ICRF', timeScale: 'TDB', spacecraft: sc });
    expect(maxAbs(geo.state.r, [7000, 0, 0])).toBeLessThan(1e-7);
    expect(maxAbs(geo.state.v, [0, 7.5, 0])).toBeLessThan(1e-14);
    expect(geo.maneuvers.map((m) => [m.frame, m.dv, m.et, m.durationS])).toEqual([['VNB', [0.1, 0.3, -0.2], ET_2030, 0], ['ECLIPJ2000', [0, 0.05, 0], ET_2030 + 600, 0]]);
    // Mass: m1 = m0 exp(-dv / (Isp g0)). Independent function of the engine: propellantFor.
    const used1 = propellantFor(2000, Math.sqrt(0.14), 320);
    expect(Math.abs(geo.maneuvers[0].deltaMassKg + used1)).toBeLessThan(1e-9);
    expect(used1).toBeGreaterThan(224.7); // by hand: 2000 * (1 - exp(-374.166 / 3138.128)) = 224.8 kg
    expect(used1).toBeLessThan(224.9);
    expect(Math.abs(geo.maneuvers[1].deltaMassKg + propellantFor(2000 - used1, 0.05, 320))).toBeLessThan(1e-9);
    // Solar radiation pressure values come from the force model of the flight: area = 0.005 m^2/kg * 2000 kg.
    expect(geo.spacecraft).toEqual({ massKg: 2000, solarRadAreaM2: 10, solarRadCoeff: 1.3 });
    // Centre Sun: the frame VNB relative to the Earth has no name in the message. The velocity change is given in
    // the ICRF. Hand value (see the frame test): 0.1 V + 0.3 N - 0.2 B = 0.1 (+y) + 0.3 (+z) - 0.2 (+x).
    const helio = opmFromFlight(sys, flight, { objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ECLIPJ2000', timeScale: 'UTC', spacecraft: sc });
    expect(helio.maneuvers[0].frame).toBe('ICRF');
    expect(maxAbs(helio.maneuvers[0].dv, [-0.2, 0.1, 0.3])).toBeLessThan(1e-11);
    const sun = sys.state('SUN', ET_2030);
    expect(maxAbs(helio.state.r, fromIcrf(sub(flight.state0.r, sun.r), 'ECLIPJ2000'))).toBe(0);
    // A flight with a maneuver needs the mass; a flight backward in time has no message.
    expectIoError(() => opmFromFlight(sys, flight, { objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB' }), 'opm.mass');
    expectIoError(() => opmFromFlight(sys, { ...flight, etEnd: ET_2030 - 10 }, { objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB' }), 'opm.backward');
    expectIoError(() => opmFromFlight(sys, flight, { objectName: 'P', objectId: 'UNKNOWN', center: 'VULCAN', frame: 'ICRF', timeScale: 'TDB' }), 'opm.center');
  });

  it('malformed files give an IoError with the code and the line number', () => {
    const A = OPM_A;
    expectIoError(() => parseOpm(''), 'opm.header', 1);
    expectIoError(() => parseOpm(withLine(A, 1, 'CCSDS_OEM_VERS = 2.0')), 'opm.header', 1);
    expectIoError(() => parseOpm(withLine(A, 1, 'CCSDS_OPM_VERS = 9.0')), 'opm.version', 1, '9.0');
    expectIoError(() => parseOpm(withLine(A, 5, 'OBJECT_NAME PROBE ONE')), 'opm.syntax', 5);
    expectIoError(() => parseOpm(withLine(A, 5, 'OBJECT_COLOUR = RED')), 'opm.keyword', 5, 'OBJECT_COLOUR');
    expectIoError(() => parseOpm(withLine(A, 6, 'OBJECT_NAME = AGAIN')), 'opm.keyword', 6, 'OBJECT_NAME');
    expectIoError(() => parseOpm(withLine(A, 3, 'CREATION_DATE = yesterday')), 'opm.time', 3);
    expectIoError(() => parseOpm(withLine(A, 7, 'CENTER_NAME = VULCAN')), 'opm.center', 7, 'VULCAN');
    expectIoError(() => parseOpm(withLine(A, 8, 'REF_FRAME = ITRF2000')), 'opm.frame', 8, 'ITRF2000');
    expectIoError(() => parseOpm(withLine(A, 9, 'TIME_SYSTEM = GPS')), 'opm.timeSystem', 9, 'GPS');
    expectIoError(() => parseOpm(withLine(A, 11, 'EPOCH = 2030-02-30T00:00:00')), 'opm.time', 11);
    expectIoError(() => parseOpm(withLine(A, 12, 'X = 7000000.0 [m]')), 'opm.units', 12, 'X');
    expectIoError(() => parseOpm(withLine(A, 16, 'Y_DOT = 7.5 [m/s]')), 'opm.units', 16, 'Y_DOT');
    expectIoError(() => parseOpm(withLine(A, 13, 'Y = zero [km]')), 'opm.number', 13, 'Y');
    // An obligatory keyword is not there: the error is at the last line of the file (37 lines after the removal).
    expectIoError(() => parseOpm(withLine(A, 17, null)), 'opm.missing', 37, 'Z_DOT');
    expectIoError(() => parseOpm(withLine(A, 4, null)), 'opm.missing', 37, 'ORIGINATOR');
    // A maneuver must have all its parameters (table 3-3): the error is at the first line of the maneuver.
    expectIoError(() => parseOpm(withLine(A, 37, 'COMMENT no third component')), 'opm.maneuver', 31, 'MAN_DV_3');
    expectIoError(() => parseOpm(withLine(A, 34, 'MAN_REF_FRAME = BODY_FIXED')), 'opm.manFrame', 34, 'BODY_FIXED');
    expectIoError(() => parseOpm(withLine(A, 31, 'MAN_DURATION = 0.0 [s]')), 'opm.keyword', 31, 'MAN_DURATION');
    expectIoError(() => parseOpm(withLine(A, 32, 'MAN_DURATION = -5.0 [s]')), 'opm.number', 32, 'MAN_DURATION');
    // A maneuver with a duration is read, but Apsis has only impulsive maneuvers.
    const finite = parseOpm(withLine(A, 32, 'MAN_DURATION = 120.0 [s]'));
    expect(finite.maneuvers[0].durationS).toBe(120);
    expectIoError(() => flightFromOpm(sys, finite, EARTH_ONLY, ET_2030 + 600), 'opm.finiteBurn', undefined, '0');
  });
});

// ================================================================================================ STK

/** Hand-written STK ephemeris in the style of the sample files of the STK help. Distances are in metres (the default). */
const STK_A = [
  /*  1 */ 'stk.v.11.0',
  /*  2 */ '# WrittenBy    HandMade',
  /*  3 */ 'BEGIN Ephemeris',
  /*  4 */ 'NumberOfEphemerisPoints 5',
  /*  5 */ 'ScenarioEpoch           1 Jan 2017 00:00:00.000',
  /*  6 */ 'InterpolationMethod     Lagrange',
  /*  7 */ 'InterpolationSamplesM1  5',
  /*  8 */ 'CentralBody             Sun',
  /*  9 */ 'CoordinateSystem        J2000',
  /* 10 */ 'BEGIN SegmentBoundaryTimes',
  /* 11 */ '   1.2000000000000000e+02',
  /* 12 */ 'END SegmentBoundaryTimes',
  /* 13 */ '',
  /* 14 */ 'EphemerisTimePosVel',
  /* 15 */ '',
  /* 16 */ '0.0000000000000000e+00  1.5000000000000000e+11  2.0000000000000000e+10 -3.0000000000000000e+09  1.0000000000000000e+04 -2.0000000000000000e+04  3.0000000000000000e+03',
  /* 17 */ '6.0000000000000000e+01  1.5000060000000000e+11  1.9998800000000000e+10 -2.9998200000000000e+09  1.0000000000000000e+04 -2.0000000000000000e+04  3.0000000000000000e+03',
  /* 18 */ '1.2000000000000000e+02  1.5000120000000000e+11  1.9997600000000000e+10 -2.9996400000000000e+09  1.0000000000000000e+04 -2.0000000000000000e+04  3.0000000000000000e+03',
  /* 19 */ '',
  /* 20 */ '1.2000000000000000e+02  1.5000120000000000e+11  1.9997600000000000e+10 -2.9996400000000000e+09  1.0500000000000000e+04 -2.0000000000000000e+04  3.0000000000000000e+03',
  /* 21 */ '1.8000000000000000e+02  1.5000183000000000e+11  1.9996400000000000e+10 -2.9994600000000000e+09  1.0500000000000000e+04 -2.0000000000000000e+04  3.0000000000000000e+03',
  /* 22 */ '',
  /* 23 */ 'END Ephemeris',
];

describe('STK ephemeris file (.e), format EphemerisTimePosVel', () => {
  it('hand-written file: metres, boundary of two segments, comment line', () => {
    const t = parseStkEphemeris(join(STK_A), { objectName: 'PROBE' });
    expect(t.objectName).toBe('PROBE');
    expect(t.objectId).toBe('UNKNOWN');
    expect(t.center).toBe('SUN');
    expect(t.frame).toBe('ICRF'); // J2000 is read as the axes of the ICRF
    expect(t.timeScale).toBe('UTC');
    expect(t.comments).toEqual(['WrittenBy    HandMade']);
    expect(t.segmentStarts).toEqual([0, 3]);
    expect(Math.abs(t.et[0] - ET_2017)).toBeLessThan(2e-3);
    const hand = [0, 60, 120, 120, 180];
    for (let k = 0; k < 5; k++) expect(Math.abs(t.et[k] - t.et[0] - hand[k])).toBeLessThan(1e-6);
    expect(t.et[3]).toBe(t.et[2]);
    // metres to kilometres
    expect(maxAbs(t.states[0].r, [150000000, 20000000, -3000000])).toBeLessThan(1e-7);
    expect(maxAbs(t.states[0].v, [10, -20, 3])).toBeLessThan(1e-14);
    expect(maxAbs(t.states[1].r, [150000600, 19998800, -2999820])).toBeLessThan(1e-7);
    expect(maxAbs(t.states[3].v, [10.5, -20, 3])).toBeLessThan(1e-14);
    expect(maxAbs(t.states[4].r, [150001830, 19996400, -2999460])).toBeLessThan(1e-7);
  });

  it('kilometres, tab characters, exponents of three digits, keywords in other cases, default centre, seconds across a leap second', () => {
    const t = parseStkEphemeris(join([
      'stk.v.4.3',
      'BEGIN Ephemeris',
      'numberofephemerispoints 4',
      'SCENARIOEPOCH 31 Dec 2016 23:59:59.000',
      'CoordinateSystem ICRF',
      'DistanceUnit Kilometers',
      'UnknownKeyword 42',
      'EphemerisTimePosVel',
      '0.0e+000\t7.0e+003\t0.0e+000\t0.0e+000\t0.0e+000\t7.5e+000\t0.0e+000',
      '1.0e+000\t7.0e+003\t7.5e+000\t0.0e+000\t0.0e+000\t7.5e+000\t0.0e+000',
      '2.0e+000\t7.0e+003\t1.5e+001\t0.0e+000\t0.0e+000\t7.5e+000\t0.0e+000',
      '3.0e+000\t7.0e+003\t2.25e+001\t0.0e+000\t0.0e+000\t7.5e+000\t0.0e+000',
      'END Ephemeris',
    ]));
    expect(t.center).toBe('EARTH'); // the default central body of the format
    expect(t.states[3]).toEqual(S([7000, 22.5, 0], [0, 7.5, 0]));
    expect(t.segmentStarts).toEqual([0]);
    // The seconds are SI seconds after 23:59:59 UTC: 23:59:60 (leap second), 00:00:00, 00:00:01.
    expect(Math.abs(t.et[2] - ET_2017)).toBeLessThan(2e-3);
    for (let k = 0; k < 4; k++) expect(Math.abs(t.et[k] - t.et[0] - k)).toBeLessThan(1e-6);
    expect(Math.abs(t.et[1] - parseCcsdsTime('2016-12-31T23:59:60', 'UTC')!)).toBeLessThan(1e-6);
  });

  it('NumberOfEphemerisPoints is the largest number of points that are read; one point at a boundary; TimeScale TDB', () => {
    const three = parseStkEphemeris(withLine(STK_A, 4, 'NumberOfEphemerisPoints 3'));
    expect(three.et.length).toBe(3);
    // One point at the time of a boundary is the end of a segment and the start of the next segment.
    const single = parseStkEphemeris(withLine(STK_A, 20, ''));
    expect(single.segmentStarts).toEqual([0, 3]);
    expect(single.et.length).toBe(5);
    expect(single.et[3]).toBe(single.et[2]);
    expect(single.states[3]).toEqual(single.states[2]);
    // With TimeScale TDB the seconds are TDB seconds after the epoch.
    const lines = STK_A.slice();
    lines.splice(9, 0, 'TimeScale TDB');
    const tdb = parseStkEphemeris(join(lines));
    expect(tdb.timeScale).toBe('TDB');
    expect(tdb.et[4] - tdb.et[0]).toBe(180);
  });

  const table: EphemerisTable = {
    objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'UTC',
    et: [0, 60, 60, 120, 180].map((s) => ET_2017 + 0.25 + s),
    states: [S([1.5e8, -2.5, 3e8], [0.001, -30.125, 0]), S([2, 0, 0], [0, 0, 0]), S([2, 0, 0], [0.5, 0, 0]), S([3, 0, 0], [0, 0, 0]), S([4, 0, 0], [0, 0, 0])],
    segmentStarts: [0, 2], comments: ['Comment from the caller'],
  };

  it('writer: keywords of the format and one line for each point', () => {
    const text = writeStkEphemeris(table);
    expect(text.endsWith('\n')).toBe(true);
    const lines = text.split('\n').slice(0, -1);
    for (const l of lines) expect(l).toMatch(/^[\x20-\x7e]*$/);
    expect(lines[0]).toBe('stk.v.11.0');
    expect(lines[1]).toBe('# Comment from the caller');
    expect(lines[2]).toBe('BEGIN Ephemeris');
    expect(lines[lines.length - 1]).toBe('END Ephemeris');
    const at = lines.indexOf('EphemerisTimePosVel');
    const header = Object.fromEntries(lines.slice(3, at).filter((l) => /^[A-Za-z]\S* /.test(l) && !/^(BEGIN|END) /.test(l)).map((l) => [l.split(' ')[0], l.slice(l.indexOf(' ') + 1)]));
    // The whole second at or before the first time (ET_2017 is inside 2 ms of 00:00:00 UTC, the first time is 0.25 s later).
    expect(header).toEqual({
      NumberOfEphemerisPoints: '5', ScenarioEpoch: '1 Jan 2017 00:00:00.000', InterpolationMethod: 'Lagrange', InterpolationSamplesM1: '1',
      CentralBody: 'Sun', CoordinateSystem: 'ICRF', DistanceUnit: 'Kilometers',
    });
    const b0 = lines.indexOf('BEGIN SegmentBoundaryTimes'), b1 = lines.indexOf('END SegmentBoundaryTimes');
    expect(b0).toBeGreaterThan(2);
    expect(b1).toBe(b0 + 2);
    expect(b1).toBeLessThan(at);
    const rows = lines.slice(at + 1, -1).filter((l) => l !== '').map((l) => l.trim().split(/ +/));
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.length).toBe(7);
      expect(r[0]).toMatch(/^\d+\.\d{6}$/);
      for (const x of r.slice(1)) expect(x).toMatch(CCSDS_REAL);
    }
    // Seconds after the epoch: 0.25 s plus the seconds of the table (TDB - TT changes by less than 1e-7 s in 180 s).
    const seconds = rows.map((r) => Number(r[0]));
    for (let k = 0; k < 5; k++) expect(Math.abs(seconds[k] - seconds[0] - [0, 60, 60, 120, 180][k])).toBeLessThan(2e-6);
    expect(Math.abs(seconds[0] - 0.25)).toBeLessThan(2e-3);
    // The boundary time is the time of the two points of the boundary; a blank line is between them.
    expect(lines[b0 + 1].trim()).toBe(rows[2][0]);
    expect(rows[1][0]).toBe(rows[2][0]);
    expect(lines[lines.indexOf(lines.slice(at + 1).find((l) => l.trim().startsWith(rows[2][0]) && l.includes('5.000000000000000E-01'))!) - 1]).toBe('');
    expect(rows[0].slice(1)).toEqual(['1.500000000000000E+08', '-2.500000000000000E+00', '3.000000000000000E+08', '1.000000000000000E-03', '-3.012500000000000E+01', '0.000000000000000E+00']);
  });

  it('writer: tables that the format cannot hold', () => {
    expectIoError(() => writeStkEphemeris({ ...table, center: 'SSB' }), 'stk.center', undefined, 'SSB');
    expectIoError(() => writeStkEphemeris({ ...table, center: 'JUPITER_BARYCENTER' }), 'stk.center', undefined, 'JUPITER_BARYCENTER');
    expectIoError(() => writeStkEphemeris({ ...table, states: [] }), 'stk.table', undefined, 'length');
    expectIoError(() => writeStkEphemeris(table, { samplesM1: 0 }), 'stk.option');
    const one: EphemerisTable = { ...table, segmentStarts: [0], et: [0, 60, 120, 180, 240, 300, 360, 420].map((s) => ET_2017 + s), states: new Array<State>(8).fill(S([1, 2, 3], [4, 5, 6])) };
    const lines = writeStkEphemeris(one, { interpolation: 'Hermite', samplesM1: 7 }).split('\n');
    expect(lines).toContain('InterpolationMethod Hermite');
    expect(lines).toContain('InterpolationSamplesM1 7');
    expect(lines).not.toContain('BEGIN SegmentBoundaryTimes');
  });

  it('malformed files give an IoError with the code and the line number', () => {
    const A = STK_A;
    expectIoError(() => parseStkEphemeris(''), 'stk.header', 1);
    expectIoError(() => parseStkEphemeris(join(A.slice(2))), 'stk.header', 1);
    expectIoError(() => parseStkEphemeris(withLine(A, 3, 'BEGIN Attitude')), 'stk.header', 3);
    expectIoError(() => parseStkEphemeris(withLine(A, 4, 'NumberOfEphemerisPoints five')), 'stk.header', 4);
    expectIoError(() => parseStkEphemeris(withLine(A, 5, 'ScenarioEpoch 2017-01-01T00:00:00')), 'stk.epoch', 5);
    expectIoError(() => parseStkEphemeris(withLine(A, 5, 'ScenarioEpoch 31 Jun 2017 00:00:00.000')), 'stk.epoch', 5);
    // No epoch: the error is at the line of the format keyword.
    expectIoError(() => parseStkEphemeris(withLine(A, 5, '')), 'stk.epoch', 14);
    expectIoError(() => parseStkEphemeris(withLine(A, 7, 'DistanceUnit Feet')), 'stk.units', 7, 'Feet');
    expectIoError(() => parseStkEphemeris(withLine(A, 7, 'TimeFormat JDate')), 'stk.timeFormat', 7, 'JDate');
    expectIoError(() => parseStkEphemeris(withLine(A, 7, 'TimeScale UTC')), 'stk.timeScale', 7, 'UTC');
    expectIoError(() => parseStkEphemeris(withLine(A, 8, 'CentralBody Vulcan')), 'stk.center', 8, 'Vulcan');
    expectIoError(() => parseStkEphemeris(withLine(A, 9, 'CoordinateSystem Fixed')), 'stk.frame', 9, 'Fixed');
    // No coordinate system: the default of the format is Fixed, which Apsis does not read. The error is at BEGIN Ephemeris.
    expectIoError(() => parseStkEphemeris(withLine(A, 9, '')), 'stk.frame', 3);
    expectIoError(() => parseStkEphemeris(withLine(A, 11, 'abc')), 'stk.boundary', 11);
    expectIoError(() => parseStkEphemeris(withLine(A, 12, '')), 'stk.boundary', 14);
    expectIoError(() => parseStkEphemeris(withLine(A, 14, 'EphemerisTimePos')), 'stk.format', 14, 'EphemerisTimePos');
    expectIoError(() => parseStkEphemeris(join(A.slice(0, 13))), 'stk.format', 13);
    expectIoError(() => parseStkEphemeris(withLine(A, 17, '6.0e+01 1.5e+11 2.0e+10 -3.0e+09 1.0e+04 -2.0e+04')), 'stk.state', 17);
    expectIoError(() => parseStkEphemeris(withLine(A, 17, '6.0e+01 1.5e+11 2.0e+10 -3.0e+09 1.0e+04 -2.0e+04 x')), 'stk.state', 17);
    expectIoError(() => parseStkEphemeris(withLine(A, 18, '3.0e+01 1.5e+11 2.0e+10 -3.0e+09 1.0e+04 -2.0e+04 3.0e+03')), 'stk.order', 18);
    // Two points with the same time are permitted only at a segment boundary.
    expectIoError(() => parseStkEphemeris(withLine(A, 11, '   9.0e+01')), 'stk.order', 20);
    expectIoError(() => parseStkEphemeris(join([...A.slice(0, 15), 'END Ephemeris'])), 'stk.data', 14);
  });
});

// ================================================================================================ CSV

describe('CSV tables', () => {
  it('hand-written file: column names with units, comment line, two segments, leap second', () => {
    const t = parseCsv(join([
      /* 1 */ '# hand-written',
      /* 2 */ 'time_utc,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s',
      /* 3 */ '2016-12-31T23:59:59.000000,1.5e8,-2.5e7,1000,10,-20.5,0.125',
      /* 4 */ '2016-12-31T23:59:60.000000,150000010,-25000020.5,1000.125,10,-20.5,0.125',
      /* 5 */ '2017-01-01T00:00:00.000000,150000020,-25000041,1000.25,10,-20.5,0.125',
      /* 6 */ '2017-01-01T00:00:00.000000,150000020,-25000041,1000.25,10.5,-20.5,0.125',
      /* 7 */ '2017-01-01 00:01,150000650,-25001271,1007.75,10.5,-20.5,0.125',
    ]), { center: 'SUN', frame: 'ECLIPJ2000', objectName: 'PROBE' });
    expect([t.objectName, t.objectId, t.center, t.frame, t.timeScale]).toEqual(['PROBE', 'UNKNOWN', 'SUN', 'ECLIPJ2000', 'UTC']);
    expect(t.segmentStarts).toEqual([0, 3]);
    const hand = [0, 1, 2, 2, 62];
    for (let k = 0; k < 5; k++) expect(Math.abs(t.et[k] - t.et[0] - hand[k])).toBeLessThan(1e-6);
    expect(Math.abs(t.et[2] - ET_2017)).toBeLessThan(2e-3);
    expect(t.states[0]).toEqual(S([150000000, -25000000, 1000], [10, -20.5, 0.125]));
    expect(t.states[4]).toEqual(S([150000650, -25001271, 1007.75], [10.5, -20.5, 0.125]));
  });

  it('other forms: Julian date, semicolons, metres, names of spreadsheet programs, other columns, options', () => {
    const t = parseCsv(join([
      'Name;JD_TDB;X (m);Y (m);Z (m);VX (m/s);VY (m/s);VZ (m/s);Range',
      '"a";2451545.0;1000;2000;3000;4;5;6;99',
      '"b";2451545.25;2000;3000;4000;5;6;7;99',
    ]), { center: 'EARTH', frame: 'ICRF', timeScale: 'UTC' });
    expect(t.timeScale).toBe('TDB'); // the column name has the time scale: the option is not used
    expect(t.et).toEqual([0, 21600]);
    expect(t.states[1]).toEqual(S([2, 3, 4], [0.005, 0.006, 0.007]));
    // No unit and no time scale in the names: the options give them. Names of the CCSDS messages for the velocity.
    const u = parseCsv('Epoch\tX_DOT\tY_DOT\tZ_DOT\tX\tY\tZ\n2000-01-01T12:00:00\t4\t5\t6\t1\t2\t3\n', { center: 'MARS', frame: 'ICRF', timeScale: 'TDB', distanceUnit: 'km' });
    expect(u.et).toEqual([0]);
    expect(u.states[0]).toEqual(S([1, 2, 3], [4, 5, 6]));
    const m = parseCsv('tdb,x,y,z,vx,vy,vz\n2000-01-01T12:00:00,1000,2000,3000,4,5,6\n', { center: 'MARS', frame: 'ICRF', distanceUnit: 'm' });
    expect(m.states[0]).toEqual(S([1, 2, 3], [0.004, 0.005, 0.006]));
  });

  const table: EphemerisTable = {
    objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB', et: [0, 21600, 21600, 43200],
    states: [S([1, -2.5, 3e8], [0.001, -30.125, 0]), S([0.1, 0.2, 0.3], [0, 0, 0]), S([0.1, 0.2, 0.3], [0.5, 0, 0]), S([1 / 3, 0, 0], [0, 0, 0])], segmentStarts: [0, 2],
  };

  it('writer: header line, one line for each sample, 17 digits', () => {
    const lines = writeCsv(table).split('\n');
    expect(lines.length).toBe(6);
    expect(lines[5]).toBe('');
    expect(lines[0]).toBe('time_tdb,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s');
    expect(lines[1]).toBe('2000-01-01T12:00:00.000000,1.0000000000000000e+0,-2.5000000000000000e+0,3.0000000000000000e+8,1.0000000000000000e-3,-3.0125000000000000e+1,0.0000000000000000e+0');
    expect(lines[2].split(',')[0]).toBe('2000-01-01T18:00:00.000000');
    expect(lines[3].split(',')[0]).toBe('2000-01-01T18:00:00.000000');
    const jd = writeCsv(table, { time: 'jd' }).split('\n');
    expect(jd[0]).toBe('jd_tdb,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s');
    expect(jd.slice(1, 5).map((l) => l.split(',')[0])).toEqual(['2451545.000000000000', '2451545.250000000000', '2451545.250000000000', '2451545.500000000000']);
    // 17 significant digits give the same 64-bit numbers again (consistency check).
    for (const text of [writeCsv(table), writeCsv(table, { time: 'jd' })]) {
      const back = parseCsv(text, { center: 'SUN', frame: 'ICRF' });
      expect(back.et).toEqual(table.et);
      expect(back.states).toEqual(table.states);
      expect(back.segmentStarts).toEqual([0, 2]);
      expect(back.timeScale).toBe('TDB');
    }
    expectIoError(() => writeCsv({ ...table, et: [] }), 'csv.table', undefined, 'empty');
  });

  it('malformed files give an IoError with the code and the line number', () => {
    const opts = { center: 'SUN', frame: 'ICRF' as const };
    const head = 'time_utc,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s';
    const row = '2017-01-01T00:00:00,1,2,3,4,5,6';
    expectIoError(() => parseCsv('', opts), 'csv.columns', 1);
    expectIoError(() => parseCsv('# only a comment\n', opts), 'csv.columns', 2);
    expectIoError(() => parseCsv('when,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s\n' + row, opts), 'csv.columns', 1, 'time');
    expectIoError(() => parseCsv('time_utc,x_km,y_km,z_km,vx_km_s,vy_km_s\n' + row, opts), 'csv.columns', 1, 'vz');
    expectIoError(() => parseCsv('time,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s\n' + row, opts), 'csv.timeScale', 1);
    expectIoError(() => parseCsv('time_utc,x,y,z,vx,vy,vz\n' + row, opts), 'csv.units', 1, 'x');
    expectIoError(() => parseCsv('time_utc,x_ft,y_ft,z_ft,vx_km_s,vy_km_s,vz_km_s\n' + row, opts), 'csv.units', 1, 'x_ft');
    expectIoError(() => parseCsv('time_utc,x_km,y_m,z_km,vx_km_s,vy_km_s,vz_km_s\n' + row, opts), 'csv.units', 1);
    expectIoError(() => parseCsv(head + '\n', opts), 'csv.data', 1);
    expectIoError(() => parseCsv(join(['# c', head, row, '2017-01-01T00:00:10,1,2,3,4,5']), opts), 'csv.columns', 4);
    expectIoError(() => parseCsv(join([head, row, '2017-01-01T00:00:10,1,2,three,4,5,6']), opts), 'csv.number', 3);
    expectIoError(() => parseCsv(join([head, row, '2017-02-30T00:00:10,1,2,3,4,5,6']), opts), 'csv.time', 3, '2017-02-30T00:00:10');
    expectIoError(() => parseCsv(join([head, row, '2016-12-31T23:59:59,1,2,3,4,5,6']), opts), 'csv.order', 3);
    expectIoError(() => parseCsv(join(['jd_tdb,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s', '2017-01-01T00:00:00,1,2,3,4,5,6']), opts), 'csv.time', 2);
  });
});

// ================================================================================================ Horizons

const RAW = 'truth/horizons/raw/';
const raw = (name: string): string => readFileSync(RAW + name, 'utf8');

/**
 * Parts of real outputs of the JPL Horizons API (retrieved 2026-10-13; the complete files, with the request, are
 * in data-src/specs/horizons/). Each part is a copy with no change: the header from the first line of asterisks
 * to $$SOE, then the first records, then $$EOE. The headers of the eight outputs are the same except for the
 * items that are the parameters of hzHead.
 */
const HZ_RULE = '*'.repeat(79);
interface HzHead { clock: string; target: string; ut?: boolean; units: string; format: string; frame: string; columns: string[]; rule?: number }
function hzHead(o: HzHead): string[] {
  const scale = o.ut ? 'UT ' : 'TDB';
  return [
    HZ_RULE,
    `Ephemeris / API_USER Tue Oct 13 ${o.clock} 2026 Pasadena, USA      / Horizons`,
    HZ_RULE,
    `Target body name: ${o.target}`,
    'Center body name: Sun (10)                        {source: DE441}',
    'Center-site name: BODY CENTER',
    HZ_RULE,
    `Start time      : A.D. 1950-Jan-19 00:00:00.0000 ${scale}`,
    `Stop  time      : A.D. 2099-Oct-24 00:00:00.0000 ${scale}`,
    'Step-size       : DISCRETE TIME-LIST',
    HZ_RULE,
    'Center geodetic : 0.0, 0.0, 0.0                   {E-lon(deg),Lat(deg),Alt(km)}',
    'Center cylindric: 0.0, 0.0, 0.0                   {E-lon(deg),Dxy(km),Dz(km)}',
    'Center radii    : 695700.0, 695700.0, 695700.0 km {Equator_a, b, pole_c}',
    `Output units    : ${o.units}`,
    'Calendar mode   : Mixed Julian/Gregorian',
    'Output type     : GEOMETRIC cartesian states',
    `Output format   : ${o.format}`,
    // An output in UT has two lines about the data of the orientation of the Earth.
    ...(o.ut ? ['EOP file        : eop.261012.p270108', 'EOP coverage    : DATA-BASED 1962-JAN-20 TO 2026-OCT-12. PREDICTS-> 2027-JAN-07'] : []),
    `Reference frame : ${o.frame}`,
    HZ_RULE,
    ...o.columns,
    '*'.repeat(o.rule ?? 79),
    '$$SOE',
  ];
}
/** labelled_icrf_EARTH_t3.txt: labelled form, km and s, with light time, range and range rate. */
const HZ_LABELLED = [
  ...hzHead({ clock: '11:10:50', target: 'Earth (399)                     {source: DE441}', units: 'KM-S', format: '3 (position, velocity, LT, range, range-rate)', frame: 'ICRF', columns: ['JDTDB', '   X     Y     Z', '   VX    VY    VZ', '   LT    RG    RR'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB ',
  ' X =-7.147205881293523E+07 Y = 1.180540388819448E+08 Z = 5.119852524884287E+07',
  ' VX=-2.653834516507536E+01 VY=-1.337765654695384E+01 VZ=-5.802556846502521E+00',
  ' LT= 4.909889022717734E+02 RG= 1.471947698627767E+08 RR= 1.384657015894261E-01',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 TDB ',
  ' X =-6.801234601273094E+07 Y =-1.242198152488732E+08 Z =-5.386689621380971E+07',
  ' VX= 2.613816488017532E+01 VY=-1.237752523199641E+01 VZ=-5.368370529033613E+00',
  ' LT= 5.054116259287692E+02 RG= 1.515185936389622E+08 RR= 3.233493694512130E-01',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB ',
  ' X =-2.649903367743050E+07 Y = 1.327574173383451E+08 Z = 5.755671847054072E+07',
  ' VX=-2.979426007043741E+01 VY=-5.018052308799903E+00 VZ=-2.175393802830554E+00',
  ' LT= 4.906852158341626E+02 RG= 1.471037269591841E+08 RR=-1.273313936463401E-02',
  '$$EOE',
];
/** labelled_icrf_EARTH_kmd.txt: km and days. */
const HZ_KMD = [
  ...hzHead({ clock: '11:11:26', target: 'Earth (399)                     {source: DE441}', units: 'KM-D', format: '2 (position and velocity)', frame: 'ICRF', columns: ['JDTDB', '   X     Y     Z', '   VX    VY    VZ'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB ',
  ' X =-7.147205881293523E+07 Y = 1.180540388819448E+08 Z = 5.119852524884287E+07',
  ' VX=-2.292913022262511E+06 VY=-1.155829525656812E+06 VZ=-5.013409115378178E+05',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 TDB ',
  ' X =-6.801234601273094E+07 Y =-1.242198152488732E+08 Z =-5.386689621380971E+07',
  ' VX= 2.258337445647147E+06 VY=-1.069418180044490E+06 VZ=-4.638272137085042E+05',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB ',
  ' X =-2.649903367743050E+07 Y = 1.327574173383451E+08 Z = 5.755671847054072E+07',
  ' VX=-2.574224070085792E+06 VY=-4.335597194803116E+05 VZ=-1.879540245645599E+05',
  '$$EOE',
];
/** labelled_ecl_MARS_aud.txt: ecliptic of J2000, au and days. */
const HZ_MARS_AUD = [
  ...hzHead({ clock: '11:10:53', target: 'Mars (499)                      {source: mar099}', units: 'AU-D', format: '2 (position and velocity)', frame: 'Ecliptic of J2000.0', columns: ['JDTDB', '   X     Y     Z', '   VX    VY    VZ'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB ',
  ' X =-1.508068924569373E+00 Y = 7.057086381705086E-01 Z = 5.199739770411232E-02',
  ' VX=-5.401585338425733E-03 VY=-1.148406320997540E-02 VZ=-1.070350645459473E-04',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 TDB ',
  ' X = 3.614420463794308E-01 Y = 1.493307504327362E+00 Z = 2.235976563462245E-02',
  ' VX=-1.306514445406141E-02 VY= 4.479415443942788E-03 VZ= 4.158069511012645E-04',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB ',
  ' X = 1.390715921746351E+00 Y =-1.341631815101244E-02 Z =-3.446766277581799E-02',
  ' VX= 6.714995020673780E-04 VY= 1.518724809448758E-02 VZ= 3.016517720181207E-04',
  '$$EOE',
];
/** plain_icrf_JUPITER_BARYCENTER.txt: the form with no labels. */
const HZ_PLAIN = [
  ...hzHead({ clock: '11:11:17', target: 'Jupiter Barycenter (5)          {source: DE441}', units: 'KM-S', format: '2 (position and velocity)', frame: 'ICRF', columns: ['JDTDB', '   X     Y     Z', '   VX    VY    VZ'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB ',
  '   5.242546955566884E+08 -4.987640649435021E+08 -2.265930031428252E+08',
  '   9.286560736708800E+00  8.965474921155614E+00  3.616914080606669E+00',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 TDB ',
  '  -7.521260466580855E+08  2.649082456398448E+08  1.318936294507996E+08',
  '  -4.932924723015328E+00 -1.067089037410427E+01 -4.454129971316061E+00',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 TDB ',
  '   5.985675835979289E+08  4.093863501165546E+08  1.608943471230070E+08',
  '  -7.909837688567292E+00  1.018349781536609E+01  4.557719053468124E+00',
  '$$EOE',
];
/** csv_ecl_VENUS_aud_t3.txt: CSV form, ecliptic, au and days, with light time, range and range rate. */
const HZ_VENUS_CSV = [
  ...hzHead({
    clock: '11:11:15', target: 'Venus (299)                     {source: DE441}', units: 'AU-D', format: '3 (position, velocity, LT, range, range-rate)', frame: 'Ecliptic of J2000.0', rule: 266,
    columns: ['            JDTDB,            Calendar Date (TDB),                      X,                      Y,                      Z,                     VX,                     VY,                     VZ,                     LT,                     RG,                     RR,'],
  }),
  '2433300.500000000, A.D. 1950-Jan-19 00:00:00.0000, -2.644264557270322E-01,  6.678520589193560E-01,  2.430604514569433E-02, -1.887447563008991E-02, -7.559690889304759E-03,  9.879868604915000E-04,  4.150900451321246E-03,  7.187061339113556E-01, -4.707122398773993E-05,',
  '2440000.500000000, A.D. 1968-May-24 00:00:00.0000,  5.069039480302215E-01,  5.150339598640331E-01, -2.227744930648022E-02, -1.447695459370469E-02,  1.410138787054791E-02,  1.027449836177548E-03,  4.175615385033151E-03,  7.229853920304716E-01, -1.364076884315016E-04,',
  '2451545.000000000, A.D. 2000-Jan-01 12:00:00.0000, -7.183022963453890E-01, -3.265430819980606E-02,  4.101418202684621E-02,  7.981175157753219E-04, -2.029521870223381E-02, -3.234515157278357E-04,  4.159602945139007E-03,  7.202129240067817E-01,  1.057611995958599E-04,',
  '$$EOE',
];
/** labelled_icrf_EARTH_ut_dt.txt: UT with the difference TDB - UT in each record. */
const HZ_UT_DT = [
  ...hzHead({ clock: '11:11:23', target: 'Earth (399)                     {source: DE441}', ut: true, units: 'KM-S', format: '2 (position and velocity)', frame: 'ICRF', columns: ['JDUT ', '   X     Y     Z', '   VX    VY    VZ'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 UT1 [del_T=     28.950881 s]',
  ' X =-7.147282712015317E+07 Y = 1.180536515849334E+08 Z = 5.119835725881176E+07',
  ' VX=-2.653825846751742E+01 VY=-1.337779945185697E+01 VZ=-5.802618905208945E+00',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 UTC [del_T=     38.663629 s]',
  ' X =-6.801133541447295E+07 Y =-1.242202938053599E+08 Z =-5.386710377295344E+07',
  ' VX= 2.613826623382189E+01 VY=-1.237734151350137E+01 VZ=-5.368290843426982E+00',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 UTC [del_T=     64.183903 s]',
  ' X =-2.650094598710609E+07 Y = 1.327570952487192E+08 Z = 5.755657884032085E+07',
  ' VX=-2.979419056188855E+01 VY=-5.018408841720492E+00 VZ=-2.175548186292134E+00',
  '$$EOE',
];
/** csv_icrf_EARTH_ut_dt.txt: the same records in the CSV form. */
const HZ_UT_DT_CSV = [
  ...hzHead({
    clock: '11:28:27', target: 'Earth (399)                     {source: DE441}', ut: true, units: 'KM-S', format: '2 (position and velocity)', frame: 'ICRF', rule: 210,
    columns: ['            JDUT ,            Calendar Date (UT ),        delta-T,                      X,                      Y,                      Z,                     VX,                     VY,                     VZ,'],
  }),
  '2433300.500000000, A.D. 1950-Jan-19 00:00:00.0000,      28.950881, -7.147282712015317E+07,  1.180536515849334E+08,  5.119835725881176E+07, -2.653825846751742E+01, -1.337779945185697E+01, -5.802618905208945E+00,',
  '2440000.500000000, A.D. 1968-May-24 00:00:00.0000,      38.663629, -6.801133541447295E+07, -1.242202938053599E+08, -5.386710377295344E+07,  2.613826623382189E+01, -1.237734151350137E+01, -5.368290843426982E+00,',
  '2451545.000000000, A.D. 2000-Jan-01 12:00:00.0000,      64.183903, -2.650094598710609E+07,  1.327570952487192E+08,  5.755657884032085E+07, -2.979419056188855E+01, -5.018408841720492E+00, -2.175548186292134E+00,',
  '$$EOE',
];
/** labelled_icrf_EARTH_ut.txt: UT with no difference to TDB. Records: UT1 (1950), UTC before 1972 (1968), UTC (2000, 2020). */
const HZ_UT = [
  ...hzHead({ clock: '11:11:20', target: 'Earth (399)                     {source: DE441}', ut: true, units: 'KM-S', format: '2 (position and velocity)', frame: 'ICRF', columns: ['JDUT ', '   X     Y     Z', '   VX    VY    VZ'] }),
  '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 UT1 ',
  ' X =-7.147282712015317E+07 Y = 1.180536515849334E+08 Z = 5.119835725881176E+07',
  ' VX=-2.653825846751742E+01 VY=-1.337779945185697E+01 VZ=-5.802618905208945E+00',
  '2440000.500000000 = A.D. 1968-May-24 00:00:00.0000 UTC ',
  ' X =-6.801133541447295E+07 Y =-1.242202938053599E+08 Z =-5.386710377295344E+07',
  ' VX= 2.613826623382189E+01 VY=-1.237734151350137E+01 VZ=-5.368290843426982E+00',
  '2451545.000000000 = A.D. 2000-Jan-01 12:00:00.0000 UTC ',
  ' X =-2.650094598710609E+07 Y = 1.327570952487192E+08 Z = 5.755657884032085E+07',
  ' VX=-2.979419056188855E+01 VY=-5.018408841720492E+00 VZ=-2.175548186292134E+00',
  '2459000.500000000 = A.D. 2020-May-31 00:00:00.0000 UTC ',
  ' X =-5.252621041738061E+07 Y =-1.305534039086825E+08 Z =-5.659495480920379E+07',
  ' VX= 2.746138370004375E+01 VY=-9.556238069767256E+00 VZ=-4.142807046969219E+00',
  '$$EOE',
];
/** The parts and the names of the complete files in data-src/specs/horizons/. */
const HZ_PARTS: [string, string[]][] = [
  ['labelled_icrf_EARTH_t3.txt', HZ_LABELLED], ['labelled_icrf_EARTH_kmd.txt', HZ_KMD], ['labelled_ecl_MARS_aud.txt', HZ_MARS_AUD],
  ['plain_icrf_JUPITER_BARYCENTER.txt', HZ_PLAIN], ['csv_ecl_VENUS_aud_t3.txt', HZ_VENUS_CSV], ['labelled_icrf_EARTH_ut_dt.txt', HZ_UT_DT],
  ['csv_icrf_EARTH_ut_dt.txt', HZ_UT_DT_CSV], ['labelled_icrf_EARTH_ut.txt', HZ_UT],
];
/** Line number (first line = 1) of the first record of a part. */
const hzFirst = (lines: string[]): number => lines.indexOf('$$SOE') + 2;

describe('JPL Horizons vector tables: real outputs', () => {
  it('the parts of real outputs in this file are copies of the complete outputs (checked if the complete files are there)', () => {
    for (const [name, part] of HZ_PARTS) {
      expect(part[part.length - 1]).toBe('$$EOE');
      const path = 'data-src/specs/horizons/' + name;
      if (!existsSync(path)) continue;
      const real = readFileSync(path, 'utf8').split('\n');
      const start = real.indexOf(HZ_RULE);
      expect(real.slice(start, start + part.length - 1), name).toEqual(part.slice(0, -1));
    }
  });

  const stats = { files: 0, rows: 0, pos: 0, vel: 0, time: 0 };
  /** Compare a raw file with the rows of a truth file (each truth row must be in the raw file). */
  function compare(file: string, jd: number[], state: number[][], center: string, frame: 'ICRF' | 'ECLIPJ2000'): EphemerisTable {
    const t = parseHorizonsVectors(raw(file));
    expect([t.center, t.frame, t.timeScale], file).toEqual([center, frame, 'TDB']);
    expect(t.et.length, file).toBeGreaterThanOrEqual(jd.length);
    let j = 0;
    for (let k = 0; k < jd.length; k++) {
      const et = (jd[k] - 2451545) * DAY;
      while (j + 1 < t.et.length && Math.abs(t.et[j + 1] - et) <= Math.abs(t.et[j] - et)) j++;
      stats.time = Math.max(stats.time, Math.abs(t.et[j] - et));
      stats.pos = Math.max(stats.pos, maxAbs(t.states[j].r, state[k].slice(0, 3)));
      stats.vel = Math.max(stats.vel, maxAbs(t.states[j].v, state[k].slice(3, 6)));
      stats.rows++;
    }
    stats.files++;
    return t;
  }

  it('all the vector tables of truth/horizons/raw are read; other outputs are refused', () => {
    let vectors = 0;
    const refused: Record<string, number> = {};
    for (const f of readdirSync(RAW).filter((x) => x.endsWith('.txt'))) {
      const text = raw(f);
      const hasTable = text.includes('$$SOE');
      const isVectors = /^Output type\s*:\s*GEOMETRIC cartesian states\s*$/m.test(text) && hasTable;
      if (isVectors) {
        const t = parseHorizonsVectors(text);
        // Each line between $$SOE and $$EOE of these files is one record.
        const rows = /\$\$SOE\n([\s\S]*?)\n\$\$EOE/.exec(text)![1].split('\n').length;
        expect(t.et.length, f).toBe(rows);
        vectors++;
      } else {
        let code = '';
        try { parseHorizonsVectors(text); } catch (e) { code = e instanceof IoError ? e.code : 'other'; }
        // The other tables of this directory are tables of osculating elements. An output with no table has object data only.
        expect(code, f).toBe(hasTable ? 'horizons.type' : 'horizons.soe');
        refused[code] = (refused[code] ?? 0) + 1;
      }
    }
    // Numbers of files on 2026-10-14: 268 vector tables, 4 tables of elements, 30 outputs with no table.
    // The limits are minimum values: a new file of one of these three types in the directory must not fail this test.
    expect(vectors).toBeGreaterThanOrEqual(268);
    expect(refused['horizons.type']).toBeGreaterThanOrEqual(4);
    expect(refused['horizons.soe']).toBeGreaterThanOrEqual(30);
  });

  it('header of a spacecraft table: target, centre, frame', () => {
    const t = parseHorizonsVectors(raw('enc_voyager2_599_0_hour.txt'));
    expect([t.objectName, t.objectId, t.center, t.frame, t.timeScale]).toEqual(['Voyager 2 (spacecraft)', '-32', 'JUPITER', 'ICRF', 'TDB']);
    expect(t.segmentStarts).toEqual([0]);
    // First record of the file, read by eye: 2444062.500000000, X = 1.512310135652006E+06 ... VZ = 3.949102431133455E+00
    expect(t.et[0]).toBe((2444062.5 - 2451545) * DAY);
    expect(t.states[0]).toEqual(S([1512310.135652006, -1704104.451533407, -639426.9263239345], [-2.479056762712793, 11.9873829364208, 3.949102431133455]));
    // Second record: 2444062.541666667 is one hour later (resolution of the 9 decimals: 43 microseconds).
    expect(Math.abs(t.et[1] - t.et[0] - 3600)).toBeLessThan(5e-5);
    const ceres = parseHorizonsVectors(raw('small_checkb_CERES.txt'));
    expect(ceres.center).toBe('SSB');
    expect(ceres.objectName).toContain('Ceres');
  });

  it('numbers of the raw files against the truth files (a different parser made them)', () => {
    const arcs = truth('arcs');
    for (const [name, a] of Object.entries<any>(arcs.arcs)) {
      const t = compare(`arc_${name}.txt`, a.jd, a.state, 'SSB', 'ICRF');
      expect(t.objectId).toBe(a.horizonsId);
    }
    const enc = truth('encounters');
    for (const [m, v] of Object.entries<any>(enc.missions)) {
      compare(`enc_${m}_start.txt`, v.startGeocentric.jd, v.startGeocentric.state, 'EARTH', 'ICRF');
      compare(`enc_${m}_helio_10d.txt`, v.heliocentric10d.jd, v.heliocentric10d.state, 'SUN', 'ICRF');
      const count: Record<string, number> = {};
      for (const e of v.encounters) {
        const k = count[e.planet] ?? 0;
        count[e.planet] = k + 1;
        const planet = centerFromNaif(Number(e.planet))!;
        compare(`enc_${m}_${e.planet}_${k}_hour.txt`, e.hourly.jd, e.hourly.state, planet, 'ICRF');
        compare(`enc_${m}_${e.planet}_${k}_min.txt`, e.fine.jd, e.fine.state, planet, 'ICRF');
      }
    }
    for (const [id, b] of Object.entries<any>(truth('frames').bodies)) {
      compare(`frame_icrf_${id}.txt`, b.jd, b.icrf, 'SUN', 'ICRF');
      compare(`frame_ecl_${id}.txt`, b.jd, b.ecliptic, 'SUN', 'ECLIPJ2000');
    }
    for (const [id, b] of Object.entries<any>(truth('planets').bodies)) compare(`planet_${id}.txt`, b.jd, b.state, 'SSB', 'ICRF');
    for (const [id, b] of Object.entries<any>(truth('small_check').bodies)) compare(`small_checkb_${id}.txt`, b.jd, b.state, 'SSB', 'ICRF');
    for (const [id, b] of Object.entries<any>(truth('moons_check').bodies)) compare(`moon_check_${id}.txt`, b.jd, b.state, centerFromNaif(Number(b.center))!, 'ICRF');
    for (const name of ['cassini_dsm', 'juno_dsm']) {
      const d = truth(name);
      compare(`${name}_search.txt`, d.jd, d.state, 'SUN', 'ICRF');
    }
    // 166 files on 2026-10-14. The truth files give the list: a new entry in a truth file adds to this number.
    expect(stats.files).toBeGreaterThanOrEqual(166);
    // The numbers of the two parsers come from the same decimal text: they must be the same 64-bit numbers.
    expect(stats.pos).toBe(0);
    expect(stats.vel).toBe(0);
    rec.add({
      id: 'io.horizonsVectors', group: 'interchange', value: stats.pos, unit: 'km', limit: 1e-9,
      truth: `JPL Horizons vector tables: ${stats.files} raw outputs against the numbers of truth/horizons/*.json (an independent parser); the same decimal text gives the same number, thus the correct value is 0`,
      detail: { files: stats.files, rows: stats.rows, maxVelocityDifferenceKmS: stats.vel },
    });
    // The truth files have the Julian date in one 64-bit number: its step at 2.4 million days is 2^-31 day =
    // 40.2 microseconds. The reader uses the text (integer part and fraction). Limit: half of that step
    // (20.1 microseconds) plus the rounding of the two results in seconds (0.12 microsecond each): 21 microseconds.
    rec.add({
      id: 'io.horizonsTime', group: 'interchange', value: stats.time, unit: 's', limit: 2.1e-5,
      truth: 'Julian dates of the same raw outputs as one 64-bit number (step 40 microseconds) in truth/horizons/*.json',
      detail: { rows: stats.rows },
    });
    expect(stats.time).toBeLessThanOrEqual(2.1e-5);
  });

  it('labelled form, form with no labels, CSV form; km-s, km-d and au-d; ICRF and ecliptic (parts of real outputs)', () => {
    const frames = truth('frames').bodies;
    const et = [2433300.5, 2440000.5, 2451545.0].map((jd) => (jd - 2451545) * DAY);
    let unitPos = 0, unitVel = 0;
    const check = (lines: string[], body: string, key: 'icrf' | 'ecliptic', units: boolean): EphemerisTable => {
      const t = parseHorizonsVectors(join(lines));
      expect(t.et).toEqual(et);
      expect([t.center, t.frame, t.timeScale]).toEqual(['SUN', key === 'icrf' ? 'ICRF' : 'ECLIPJ2000', 'TDB']);
      for (let k = 0; k < 3; k++) {
        const truthRow: number[] = frames[body][key][k];
        const dp = maxAbs(t.states[k].r, truthRow.slice(0, 3)), dv = maxAbs(t.states[k].v, truthRow.slice(3, 6));
        if (units) { unitPos = Math.max(unitPos, dp); unitVel = Math.max(unitVel, dv); } else { expect(dp).toBe(0); expect(dv).toBe(0); }
      }
      return t;
    };
    const earth = check(HZ_LABELLED, 'EARTH', 'icrf', false);
    expect([earth.objectName, earth.objectId]).toEqual(['Earth', '399']);
    const jupiter = check(HZ_PLAIN, 'JUPITER_BARYCENTER', 'icrf', false);
    expect([jupiter.objectName, jupiter.objectId]).toEqual(['Jupiter Barycenter', '5']);
    check(HZ_KMD, 'EARTH', 'icrf', true);
    check(HZ_MARS_AUD, 'MARS', 'ecliptic', true);
    check(HZ_VENUS_CSV, 'VENUS', 'ecliptic', true);
    // Limits for the tables in other units (the two tables of Horizons have 16 digits each).
    // Position (Mars, 1.7 au = 2.5e8 km): half of the last digit of the au value is 5e-16 au = 7.5e-8 km; half of the
    // last digit of the km value is 5e-8 km; four roundings of 64-bit numbers of 1.5e-8 to 1.7e-8 km (two texts to
    // numbers, the product with the au, the division in Horizons): sum 1.9e-7 km, limit 2e-7 km.
    // Velocity (Venus, 35 km/s = 0.02 au/d): 5e-18 au/d = 8.7e-15 km/s, 5e-15 km/s, four roundings of 3.6e-15 km/s:
    // sum 2.8e-14 km/s, limit 3e-14 km/s.
    rec.add({
      id: 'io.horizonsUnits', group: 'interchange', value: unitPos, unit: 'km', limit: 2e-7,
      truth: 'JPL Horizons: tables of Mars and Venus in au and days and of the Earth in km and days against the tables of the same bodies in km and s (truth/horizons/frames.json)',
      detail: { maxVelocityDifferenceKmS: unitVel, velocityLimitKmS: 3e-14 },
    });
    expect(unitPos).toBeLessThanOrEqual(2e-7);
    expect(unitVel).toBeLessThanOrEqual(3e-14);
  });

  it('UT tables: the difference TDB - UT of each record gives the time (truth: the motion of the Earth between the two tables)', () => {
    // The TDB table and the UT table have the same Julian date numbers. The UT instant is later by del_T.
    // Truth of the conversion: the position of the Earth in the UT table must be the position of the TDB table
    // moved for that time: r + v dt + a dt^2 / 2, a = -GM r / |r|^3. Terms that this formula does not have are
    // below 1e-4 km (the Moon moves the Earth by 3.3e-8 km/s^2 * dt^2 / 2 = 8e-5 km in 69 s).
    // An error of 1 ms in dt is 0.03 km.
    const tdb = parseHorizonsVectors(join(HZ_LABELLED));
    for (const lines of [HZ_UT_DT, HZ_UT_DT_CSV]) {
      const ut = parseHorizonsVectors(join(lines));
      expect(ut.timeScale).toBe('UTC');
      const delta = [28.950881, 38.663629, 64.183903];
      for (let k = 0; k < 3; k++) {
        const dt = ut.et[k] - tdb.et[k];
        expect(Math.abs(dt - delta[k])).toBeLessThan(1e-6); // the number of the record
        const { r, v } = tdb.states[k];
        const a = -BODIES.SUN.gm / norm(r) ** 3;
        const moved = r.map((x, c) => x + v[c] * dt + 0.5 * a * x * dt * dt);
        expect(maxAbs(ut.states[k].r, moved)).toBeLessThan(1e-3);
      }
    }
    // First record of truth/horizons/raw/time_mars_ut.txt by hand: JD 2436938.625 UT, delta-T 33.076017 s:
    // (2436938.625 - 2451545) * 86400 + 33.076017 = -1261990766.923983
    const mars = parseHorizonsVectors(raw('time_mars_ut.txt'));
    // The header of the file has "Step-size : 97 steps": 98 records.
    expect([mars.center, mars.frame, mars.timeScale, mars.et.length]).toEqual(['SSB', 'ECLIPJ2000', 'UTC', 98]);
    expect(Math.abs(mars.et[0] - -1261990766.923983)).toBeLessThan(1e-6);
    // All the records (1960 to 2099): the position of Mars from the ephemeris of this application at the time that
    // the reader gives. Limit: 0.05 km, the limit of the ephemeris test of Mars. An error of 1 s in the time is 24 km.
    let worst = 0;
    for (let k = 0; k < mars.et.length; k++) worst = Math.max(worst, maxAbs(mars.states[k].r, fromIcrf(sys.state('MARS', mars.et[k]).r, 'ECLIPJ2000')));
    expect(worst).toBeLessThan(0.05);
  });

  it('UT tables with no difference to TDB: read as UTC from 1972, refused before 1972', () => {
    // The first record is UT1 (1950). Each record has three lines.
    const first = hzFirst(HZ_UT);
    expectIoError(() => parseHorizonsVectors(join(HZ_UT)), 'horizons.ut', first);
    // Without the first record: the UTC of 1968 is not the UTC with leap seconds.
    expectIoError(() => parseHorizonsVectors(join([...HZ_UT.slice(0, first - 1), ...HZ_UT.slice(first + 2)])), 'horizons.ut', first);
    // Without the first two records: 2000 and 2020.
    const t = parseHorizonsVectors(join([...HZ_UT.slice(0, first - 1), ...HZ_UT.slice(first + 5)]));
    expect(t.timeScale).toBe('UTC');
    expect(t.et.length).toBe(2);
    // Numbers of Horizons for these two records (data-src/specs/horizons/labelled_icrf_EARTH_ut_dt.txt):
    // TDB - UTC = 64.183903 s and 69.184934 s. Limit 50 microseconds: the limit of the test of the UTC to TDB
    // conversion (tests/time.test.ts), because the formula for TDB - TT of this application has two terms.
    expect(Math.abs(t.et[0] - (0 + 64.183903))).toBeLessThan(5e-5);
    expect(Math.abs(t.et[1] - ((2459000.5 - 2451545) * DAY + 69.184934))).toBeLessThan(5e-5);
  });

  it('tables that are not geometric states relative to the centre of a body are refused (header lines of real outputs)', () => {
    const lineOf = (lines: string[], start: string): number => lines.findIndex((l) => l.startsWith(start)) + 1;
    const swap = (start: string, value: string): string => join(HZ_LABELLED.map((l) => (l.startsWith(start) ? value : l)));
    // data-src/specs/horizons/reject_lt_corrected_EARTH.txt
    expectIoError(() => parseHorizonsVectors(swap('Output type', 'Output type     : LT CORRECTED cartesian states')), 'horizons.type', lineOf(HZ_LABELLED, 'Output type'), 'LT CORRECTED cartesian states');
    // truth/horizons/raw/frame_elem_EARTH.txt: a table of osculating elements. The error is at its line "Output type".
    const elements = raw('frame_elem_EARTH.txt');
    const typeLine = elements.split('\n').findIndex((l) => l.startsWith('Output type')) + 1;
    expect(typeLine).toBeGreaterThan(0);
    expectIoError(() => parseHorizonsVectors(elements), 'horizons.type', typeLine, 'GEOMETRIC osculating elements');
    // reject_position_only_EARTH.txt
    expectIoError(() => parseHorizonsVectors(swap('Output format', 'Output format   : 1 (position only)')), 'horizons.velocity', lineOf(HZ_LABELLED, 'Output format'));
    // reject_b1950_EARTH.txt and reject_body_equator_MARS.txt
    expectIoError(() => parseHorizonsVectors(swap('Reference frame', 'Reference frame : FK4/B1950 Earth mean equator and equinox')), 'horizons.frame', lineOf(HZ_LABELLED, 'Reference frame'));
    expectIoError(() => parseHorizonsVectors(swap('Reference frame', 'Reference frame : IAU_SUN body equator and node of date')), 'horizons.frame', lineOf(HZ_LABELLED, 'Reference frame'));
    // reject_topocentric_MARS.txt
    expectIoError(() => parseHorizonsVectors(swap('Center-site name', 'Center-site name: Palomar Mountain')), 'horizons.center', lineOf(HZ_LABELLED, 'Center-site name'), 'Palomar Mountain');
    expectIoError(() => parseHorizonsVectors(swap('Center body name', 'Center body name: Hale-Bopp (90002212)        {source: JPL#113}')), 'horizons.center', lineOf(HZ_LABELLED, 'Center body name'));
    expectIoError(() => parseHorizonsVectors(swap('Output units', 'Output units    : AU-S')), 'horizons.units', lineOf(HZ_LABELLED, 'Output units'), 'AU-S');
  });

  it('malformed tables give an IoError with the code and the line number', () => {
    // L: records of four lines (time, position, velocity, light time). P: records of three lines with no labels.
    const L = HZ_LABELLED, P = HZ_PLAIN, V = HZ_VENUS_CSV;
    const l1 = hzFirst(L), p1 = hzFirst(P), v1 = hzFirst(V);
    expectIoError(() => parseHorizonsVectors('no table'), 'horizons.soe', 1, '$$SOE');
    expectIoError(() => parseHorizonsVectors(join(L.slice(0, -1))), 'horizons.soe', L.length - 1, '$$EOE');
    // No record between $$SOE and $$EOE: the error is at the line $$SOE.
    expectIoError(() => parseHorizonsVectors(join([...L.slice(0, l1 - 1), '$$EOE'])), 'horizons.data', l1 - 1);
    // A record with no VZ: the error is at the first line of the record.
    expectIoError(() => parseHorizonsVectors(withLine(L, l1 + 2, ' VX=-2.653834516507536E+01 VY=-1.337765654695384E+01')), 'horizons.state', l1);
    // The second record has a text that is not a number.
    expectIoError(() => parseHorizonsVectors(withLine(P, p1 + 4, '  -7.521260466580855E+08  2.649082456398448E+08  n.a.')), 'horizons.state', p1 + 3);
    // The first record has only a position.
    expectIoError(() => parseHorizonsVectors(withLine(P, p1 + 2, '')), 'horizons.velocity', p1);
    // The first line after $$SOE is not the time of a record.
    expectIoError(() => parseHorizonsVectors(withLine(L, l1, 'A.D. 1950-Jan-19 00:00:00.0000 TDB')), 'horizons.state', l1);
    // The second record has the time of the first record.
    expectIoError(() => parseHorizonsVectors(withLine(L, l1 + 4, '2433300.500000000 = A.D. 1950-Jan-19 00:00:00.0000 TDB ')), 'horizons.order', l1 + 4);
    // CSV form: the second record has a text that is not a number.
    expectIoError(() => parseHorizonsVectors(withLine(V, v1 + 1, '2440000.500000000, A.D. 1968-May-24 00:00:00.0000,  5.069039480302215E-01,  n.a.,')), 'horizons.state', v1 + 1);
    // Only the records, with no header: the options give the centre, the frame and the units.
    const body = join(['$$SOE', ...L.slice(l1 - 1)]);
    expectIoError(() => parseHorizonsVectors(body), 'horizons.center', 1);
    expectIoError(() => parseHorizonsVectors(body, { center: 'SUN' }), 'horizons.units', 1);
    expectIoError(() => parseHorizonsVectors(body, { center: 'SUN', units: 'KM-S' }), 'horizons.frame', 1);
    const t = parseHorizonsVectors(body, { center: 'SUN', units: 'KM-S', frame: 'ICRF' });
    expect([t.objectName, t.objectId, t.center, t.timeScale]).toEqual(['UNKNOWN', 'UNKNOWN', 'SUN', 'TDB']);
    expect(t.states[0].r[0]).toBe(-71472058.81293523);
    // Without a label of the time scale in the records and with no header, the option is necessary.
    const plain = join(['$$SOE', '2451545.000000000, A.D. 2000-Jan-01 12:00:00.0000, 1, 2, 3, 4, 5, 6,', '$$EOE']);
    expectIoError(() => parseHorizonsVectors(plain, { center: 'SUN', units: 'KM-S', frame: 'ICRF' }), 'horizons.time', 2);
    expect(parseHorizonsVectors(plain, { center: 'SUN', units: 'AU-D', frame: 'ICRF', timeScale: 'TDB' }).states[0]).toEqual(S([AU, 2 * AU, 3 * AU], [4 * AU / DAY, 5 * AU / DAY, 6 * AU / DAY]));
  });
});

// ================================================================================================ real flight

interface SolvedFlight { flight: Flight; trajectory: Trajectory; parkingAltitude: number }
let voyagerCache: SolvedFlight | null = null;
/** Flight of Voyager 2 that the engine solves from the real dates (about 2 s). */
function voyager(): SolvedFlight {
  if (!voyagerCache) {
    const planned = famousMission(sys, 'voyager2');
    const solved = solveMission(sys, planned);
    if (!solved.mission.flight) throw new Error('the engine did not make a flight for Voyager 2');
    voyagerCache = { flight: solved.mission.flight, trajectory: solved.trajectory, parkingAltitude: planned.plan.parkingAltitude };
  }
  return voyagerCache;
}
/** Dates (UTC) from which TAI - UTC is one second larger, IERS Bulletin C, for the years of the flight. */
const LEAP_DATES = ['1978-01-01', '1979-01-01', '1980-01-01', '1981-07-01', '1982-07-01', '1983-07-01', '1985-07-01', '1988-01-01', '1990-01-01'];

describe('tables from a real flight (Voyager 2, solved by the engine)', () => {
  const sample = (center: string, frame: 'ICRF' | 'ECLIPJ2000', timeScale: 'UTC' | 'TDB', stepS = DAY): EphemerisTable =>
    tableFromTrajectory(sys, voyager().trajectory, { center, frame, timeScale, stepS, objectName: 'Voyager 2', objectId: '1977-076A', comments: ['Flight that Apsis calculated from the dates of the real flight'] });

  it('fixed step, first and last time, one segment for each coast arc', () => {
    const { trajectory: traj, flight, parkingAltitude } = voyager();
    const maneuvers = traj.events.filter((e) => e.type === 'maneuver');
    expect(maneuvers.length).toBe(flight.maneuvers.length);
    expect(maneuvers.length).toBeGreaterThanOrEqual(3); // one correction after each of the flybys of Jupiter, Saturn and Uranus
    const t = sample('SSB', 'ICRF', 'TDB');
    expect(t.et[0]).toBe(traj.et0);
    expect(t.et[t.et.length - 1]).toBe(traj.et1);
    expect(t.segmentStarts!.length).toBe(maneuvers.length + 1);
    expect(() => checkTable(t, 'x')).not.toThrow();
    // Grid: each sample is a whole number of steps after the first time, or it is an end of a segment.
    const ends = new Set(segmentRanges(t).flat());
    let onGrid = 0;
    for (let i = 0; i < t.et.length; i++) {
      const steps = (t.et[i] - t.et[0]) / DAY;
      if (Math.abs(steps - Math.round(steps)) < 1e-9) onGrid++; else expect(ends.has(i), 'sample ' + i).toBe(true);
    }
    expect(onGrid).toBe(Math.floor((traj.et1 - traj.et0) / DAY) + 1);
    // Start of the flight: periapsis of the departure hyperbola at the altitude of the parking orbit.
    const geo = sample('EARTH', 'ECLIPJ2000', 'TDB', 10 * DAY);
    expect(Math.abs(norm(geo.states[0].r) - (BODIES.EARTH.radius + parkingAltitude))).toBeLessThan(1e-6);
    // The samples are the states of the trajectory relative to the centre, in the frame.
    for (const i of [1, 7, 40, 200]) {
      const s = traj.stateAt(geo.et[i]), e = sys.state('EARTH', geo.et[i]);
      expect(maxAbs(geo.states[i].r, fromIcrf(sub(s.r, e.r), 'ECLIPJ2000'))).toBe(0);
      expect(maxAbs(geo.states[i].v, fromIcrf(sub(s.v, e.v), 'ECLIPJ2000'))).toBe(0);
    }
  });

  it('a maneuver is between two segments: equal times, velocity step of the maneuver', () => {
    const { trajectory: traj, flight } = voyager();
    for (const [center, frame] of [['SSB', 'ICRF'], ['SUN', 'ECLIPJ2000']] as const) {
      const t = sample(center, frame, 'UTC');
      const starts = t.segmentStarts!;
      const sorted = flight.maneuvers.slice().sort((a, b) => a.et - b.et);
      for (let k = 1; k < starts.length; k++) {
        const s = starts[k], m = sorted[k - 1];
        expect(m.frame).toBe('ICRF');
        expect(t.et[s]).toBe(m.et);
        expect(t.et[s - 1]).toBe(m.et);
        // The state after the maneuver is the anchor of the maneuver: nearer than ANCHOR_LIMIT to state + dv.
        const dv = fromIcrf(m.dv, frame);
        expect(norm(sub(sub(t.states[s].v, t.states[s - 1].v), dv))).toBeLessThanOrEqual(ANCHOR_LIMIT.v * 1.001);
        expect(norm(sub(t.states[s].r, t.states[s - 1].r))).toBeLessThanOrEqual(ANCHOR_LIMIT.r * 1.001);
        expect(norm(dv)).toBeGreaterThan(10 * ANCHOR_LIMIT.v);
        // Interpolation does not go across the maneuver: 1 s before and 1 s after it.
        const before = interpolateTable(t, m.et - 1), after = interpolateTable(t, m.et + 1);
        expect(norm(sub(sub(after.v, before.v), dv))).toBeLessThan(1e-4);
        expect(interpolateTable(t, m.et)).toEqual(t.states[s]);
      }
      const ev = traj.events.filter((e) => e.type === 'maneuver');
      expect(ev.every((e) => e.anchorMiss?.used)).toBe(true);
    }
  });

  it('UTC labels of a step of 86400 SI seconds go back by one second at each leap second (hand list of the leap seconds)', () => {
    const t = sample('SUN', 'ICRF', 'UTC');
    const shape = oemShape(writeOem(t, { originator: 'Apsis test', creationEt: 0 }));
    expect(shape.blocks.length).toBe(t.segmentStarts!.length);
    const rows = shape.blocks.flatMap((b) => b.data.map((d) => d[0]));
    expect(rows.length).toBe(t.et.length);
    const secondOfDay = (label: string): number => Number(label.slice(11, 13)) * 3600 + Number(label.slice(14, 16)) * 60 + Number(label.slice(17));
    const leapsBefore = (label: string): number => LEAP_DATES.filter((d) => d <= label.slice(0, 10)).length;
    const tai0 = etToTai(t.et[0]);
    let checked = 0, last = 0;
    for (let i = 0; i < rows.length; i++) {
      const steps = (etToTai(t.et[i]) - tai0) / DAY;
      if (Math.abs(steps - Math.round(steps)) > 1e-9) continue; // an end of a segment
      last = leapsBefore(rows[i]);
      expect(Math.abs(secondOfDay(rows[i]) - (secondOfDay(rows[0]) - last)), rows[i]).toBeLessThan(1.5e-6);
      checked++;
    }
    expect(checked).toBeGreaterThan(4000);
    // 1977-08-20 to 1989: eight leap seconds (the end of 1977, 1978 and 1979, the middle of 1981, 1982, 1983 and 1985, the end of 1987).
    expect(last).toBe(8);
    expect(rows[0].slice(0, 10)).toBe('1977-08-20');
  });

  it('five samples across the leap second at the end of 1977: UTC labels in the OEM and the CSV file, uniform seconds in the STK file', () => {
    const traj = voyager().trajectory;
    const tai = etToTai(utcToEt({ year: 1977, month: 12, day: 31, hour: 23, minute: 59, second: 58 }));
    const et = [0, 1, 2, 3, 4].map((k) => taiToEt(tai + k));
    const states = et.map((x) => { const s = traj.stateAt(x), c = sys.state('SUN', x); return S(sub(s.r, c.r), sub(s.v, c.v)); });
    const t: EphemerisTable = { objectName: 'Voyager 2', objectId: '1977-076A', center: 'SUN', frame: 'ICRF', timeScale: 'UTC', et, states };
    const labels = ['1977-12-31T23:59:58.000000', '1977-12-31T23:59:59.000000', '1977-12-31T23:59:60.000000', '1978-01-01T00:00:00.000000', '1978-01-01T00:00:01.000000'];
    const oem = writeOem(t, { originator: 'Apsis test', creationEt: 0 });
    expect(oemShape(oem).blocks[0].data.map((d) => d[0])).toEqual(labels);
    const csv = writeCsv(t);
    expect(csv.split('\n').slice(1, 6).map((l) => l.split(',')[0])).toEqual(labels);
    // A reading in a leap second has no Julian date.
    expectIoError(() => writeCsv(t, { time: 'jd' }), 'csv.time', undefined, 'leapSecond:2');
    const stk = writeStkEphemeris(t).split('\n');
    expect(stk).toContain('ScenarioEpoch 31 Dec 1977 23:59:58.000');
    const at = stk.indexOf('EphemerisTimePosVel');
    expect(stk.slice(at + 1, at + 6).map((l) => l.trim().split(/ +/)[0])).toEqual(['0.000000', '1.000000', '2.000000', '3.000000', '4.000000']);
    // Read back (consistency check): the same instants.
    for (const back of [parseOem(oem), parseCsv(csv, { center: 'SUN', frame: 'ICRF' }), parseStkEphemeris(stk.join('\n'))]) {
      expect(back.timeScale).toBe('UTC');
      expect(maxAbs(back.et, et)).toBeLessThanOrEqual(1e-6); // 6 decimals of the second
    }
  });

  it('round trip of the table through the OEM, STK and CSV files (consistency check; limits from the digits of the files)', () => {
    const t = sample('SUN', 'ICRF', 'UTC');
    const biggest = Math.max(...t.states.map((s) => Math.max(...s.r.map(Math.abs))));
    const fastest = Math.max(...t.states.map((s) => Math.max(...s.v.map(Math.abs))));
    // The limits below are for coordinates below 1e10 km, velocity components below 100 km/s and times nearer
    // than 2^30 s (34 years) to J2000.
    expect(biggest).toBeLessThan(1e10);
    expect(fastest).toBeLessThan(100);
    expect(Math.max(Math.abs(t.et[0]), Math.abs(t.et[t.et.length - 1]))).toBeLessThan(2 ** 30);
    const diff = (back: EphemerisTable): { pos: number; vel: number; time: number } => {
      expect(back.et.length).toBe(t.et.length);
      expect(back.segmentStarts).toEqual(t.segmentStarts);
      expect([back.center, back.frame, back.timeScale]).toEqual(['SUN', 'ICRF', 'UTC']);
      let pos = 0, vel = 0, time = 0;
      for (let i = 0; i < t.et.length; i++) {
        pos = Math.max(pos, maxAbs(back.states[i].r, t.states[i].r));
        vel = Math.max(vel, maxAbs(back.states[i].v, t.states[i].v));
        time = Math.max(time, Math.abs(back.et[i] - t.et[i]));
      }
      return { pos, vel, time };
    };
    // 16 significant digits. The text differs from the number by half of the last digit at most. The reader gives
    // the 64-bit number that is nearest to the text, and that number is not farther from the text than the number
    // that was written. Thus the limit is one unit of the last digit:
    //   position: 1e-6 km for a coordinate from 1e9 to 1e10 km; velocity: 1e-14 km/s for a component from 10 to 100 km/s.
    // Time: 6 decimals of the second. Half of the last digit is 0.5 microsecond. The conversions between et, TAI and
    // the calendar reading round 64-bit numbers by 0.06 microsecond each (eight times at most): limit 1 microsecond.
    const POS = 1e-6, VEL = 1e-14, TIME = 1e-6;
    const digits = 'the same table read back from the file; limit from the digits of the file';
    const oemText = writeOem(t, { originator: 'Apsis test', creationEt: 0 });
    const oem = diff(parseOem(oemText));
    expect(parseOem(oemText).objectName).toBe('VOYAGER 2');
    expect(parseOem(oemText).objectId).toBe('1977-076A');
    expect(parseOem(oemText).comments).toEqual(t.comments);
    rec.add({ id: 'io.oemPosition', group: 'interchange', value: oem.pos, unit: 'km', limit: POS, truth: `Round trip of a flight table (Voyager 2, ${t.et.length} samples, ${t.segmentStarts!.length} segments) through an OEM file: ${digits} (16 digits)`, detail: { samples: t.et.length, segments: t.segmentStarts!.length, largestCoordinateKm: biggest } });
    rec.add({ id: 'io.oemVelocity', group: 'interchange', value: oem.vel, unit: 'km/s', limit: VEL, truth: `Round trip through an OEM file: ${digits} (16 digits)`, detail: { largestComponentKmS: fastest } });
    rec.add({ id: 'io.oemTime', group: 'interchange', value: oem.time, unit: 's', limit: TIME, truth: `Round trip through an OEM file with UTC times: ${digits} (6 decimals of the second)` });
    expect(oem.pos).toBeLessThanOrEqual(POS);
    expect(oem.vel).toBeLessThanOrEqual(VEL);
    expect(oem.time).toBeLessThanOrEqual(TIME);

    const stk = diff(parseStkEphemeris(writeStkEphemeris(t)));
    rec.add({ id: 'io.stkPosition', group: 'interchange', value: stk.pos, unit: 'km', limit: POS, truth: `Round trip of the same table through an STK ephemeris file: ${digits} (16 digits)` });
    rec.add({ id: 'io.stkVelocity', group: 'interchange', value: stk.vel, unit: 'km/s', limit: VEL, truth: `Round trip through an STK ephemeris file: ${digits} (16 digits)` });
    rec.add({ id: 'io.stkTime', group: 'interchange', value: stk.time, unit: 's', limit: TIME, truth: `Round trip through an STK ephemeris file: ${digits} (seconds after the epoch with 6 decimals)` });
    expect(stk.pos).toBeLessThanOrEqual(POS);
    expect(stk.vel).toBeLessThanOrEqual(VEL);
    expect(stk.time).toBeLessThanOrEqual(TIME);

    // CSV: 17 digits give the same 64-bit numbers. Julian date with 12 decimals: half of the last digit is
    // 0.043 microsecond; with four roundings of 0.06 microsecond the limit is 0.3 microsecond.
    const csv = diff(parseCsv(writeCsv(t), { center: 'SUN', frame: 'ICRF' }));
    expect(csv.pos).toBe(0);
    expect(csv.vel).toBe(0);
    expect(csv.time).toBeLessThanOrEqual(TIME);
    const tdb = sample('SUN', 'ICRF', 'TDB');
    const back = parseCsv(writeCsv(tdb, { time: 'jd' }), { center: 'SUN', frame: 'ICRF' });
    const jd = Math.max(...tdb.et.map((x, i) => Math.abs(back.et[i] - x)));
    rec.add({ id: 'io.csvTime', group: 'interchange', value: csv.time, unit: 's', limit: TIME, truth: `Round trip through a CSV file with calendar times: ${digits} (6 decimals of the second; positions and velocities have 17 digits and come back with no change)`, detail: { julianDateColumnS: jd, julianDateLimitS: 3e-7 } });
    expect(jd).toBeLessThanOrEqual(3e-7);
  });

  it('change of centre and frame of a table', () => {
    // Limit: sums of numbers up to 4.6e9 km round by 4.8e-7 km each (three sums and the rotation): 2e-6 km.
    const a = sample('SUN', 'ECLIPJ2000', 'TDB', 5 * DAY);
    const b = sample('SSB', 'ICRF', 'TDB', 5 * DAY);
    const c = tableToCenterFrame(sys, a, 'SSB', 'ICRF');
    expect(c.et).toEqual(b.et);
    expect([c.center, c.frame, c.objectName, c.comments, c.segmentStarts]).toEqual(['SSB', 'ICRF', a.objectName, a.comments, a.segmentStarts]);
    let worst = 0, worstV = 0;
    for (let i = 0; i < b.et.length; i++) { worst = Math.max(worst, maxAbs(c.states[i].r, b.states[i].r)); worstV = Math.max(worstV, maxAbs(c.states[i].v, b.states[i].v)); }
    expect(worst).toBeLessThan(2e-6);
    expect(worstV).toBeLessThan(1e-13);
    // Hand values: the origin of a table with the centre Sun is the Sun; the y axis of the ICRF in the ecliptic frame is (0, cos e, -sin e).
    const zero: EphemerisTable = { objectName: 'O', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB', et: [0, ET_2030], states: [S([0, 0, 0], [0, 0, 0]), S([0, 1, 0], [0, 0, 0])] };
    const moved = tableToCenterFrame(sys, zero, 'SSB', 'ICRF');
    expect(moved.states[0]).toEqual(sys.state('SUN', 0));
    const turned = tableToCenterFrame(sys, zero, 'SUN', 'ECLIPJ2000');
    expect(maxAbs(turned.states[1].r, [0, Math.cos(EPS), -Math.sin(EPS)])).toBeLessThan(1e-16);
    expect(zero.states[1].r).toEqual([0, 1, 0]); // the input table does not change
    expectIoError(() => tableToCenterFrame(sys, zero, 'VULCAN', 'ICRF'), 'table.center', undefined, 'VULCAN');
  });

  it('a trajectory that was propagated backward gives a table with times that increase', () => {
    // Hand flight: start 50000 km from the Earth, backward for 10000 s, one maneuver 4000 s before the start.
    const earth = sys.state('EARTH', ET_2030);
    const dv: Vec3 = [0.01, -0.02, 0.03];
    const flight: Flight = {
      et0: ET_2030, state0: S(add(earth.r, [50000, 0, 0]), add(earth.v, [0, 3, 0])), etEnd: ET_2030 - 10000,
      maneuvers: [{ id: 'm', et: ET_2030 - 4000, dv, frame: 'ICRF', refBody: 'SUN' }], model: EARTH_ONLY,
    };
    const traj = flyFlight(sys, flight);
    expect(traj.forward).toBe(false);
    const t = tableFromTrajectory(sys, traj, { center: 'SSB', frame: 'ICRF', timeScale: 'TDB', stepS: 1500, objectName: 'Back', objectId: 'UNKNOWN' });
    // The grid starts at the first time of the propagation (the latest time): 0, -1500, -3000, ... s. The ends of
    // the two segments (-4000 s and -10000 s) are not on the grid. By hand, in the order of time:
    expect(t.et.map((x) => x - ET_2030)).toEqual([-10000, -9000, -7500, -6000, -4500, -4000, -4000, -3000, -1500, 0]);
    expect(t.segmentStarts).toEqual([0, 6]);
    expect(() => checkTable(t, 'x')).not.toThrow();
    expect(t.states[9]).toEqual(flight.state0);
    // The state after the maneuver (the later segment) is the state before it plus the velocity change.
    expect(t.states[6].r).toEqual(t.states[5].r);
    expect(maxAbs(sub(t.states[6].v, t.states[5].v), dv)).toBeLessThan(1e-14);
    expect(interpolateTable(t, ET_2030 - 4000)).toEqual(t.states[6]);
    for (const i of [1, 4, 7]) expect(t.states[i]).toEqual(traj.stateAt(t.et[i]));
    // The OEM file has the two blocks in the order of time.
    const shape = oemShape(writeOem(t, { originator: 'Apsis test', creationEt: 0 }));
    expect(shape.blocks.map((b) => [b.meta.START_TIME, b.meta.STOP_TIME])).toEqual([
      ['2029-12-31T21:13:20.000000', '2029-12-31T22:53:20.000000'], ['2029-12-31T22:53:20.000000', '2030-01-01T00:00:00.000000'],
    ]);
  });

  it('options that are not correct', () => {
    const traj = voyager().trajectory;
    const opts = { center: 'SUN', frame: 'ICRF' as const, timeScale: 'TDB' as const, stepS: DAY, objectName: 'V', objectId: 'UNKNOWN' };
    expectIoError(() => tableFromTrajectory(sys, traj, { ...opts, stepS: 0 }), 'sample.step');
    expectIoError(() => tableFromTrajectory(sys, traj, { ...opts, stepS: 1e-3 }), 'sample.size');
    expectIoError(() => tableFromTrajectory(sys, traj, { ...opts, center: 'VULCAN' }), 'sample.center', undefined, 'VULCAN');
    // The data of Ceres start in 1980; the flight starts in 1977.
    expectIoError(() => tableFromTrajectory(sys, traj, { ...opts, center: 'CERES' }), 'sample.coverage', undefined, 'CERES');
  });

  it('flight to OPM to flight: the same start state and the same maneuvers (consistency check)', () => {
    const { flight } = voyager();
    const opm = opmFromFlight(sys, flight, { objectName: 'Voyager 2', objectId: '1977-076A', center: 'SUN', frame: 'ECLIPJ2000', timeScale: 'UTC', comments: ['Comment from the caller'], spacecraft: { massKg: 2000, ispS: 320 } });
    const text = writeOpm(opm, { originator: 'Apsis test', creationEt: 0 });
    const back = flightFromOpm(sys, parseOpm(text), flight.model, flight.etEnd);
    // 16 digits of the heliocentric state (1.5e8 km, below 64 km/s): half of the last digit is 5e-8 km and 5e-15 km/s.
    // Each sum or product of 64-bit numbers rounds by 1.5e-8 km (3.6e-15 km/s). Before the text: the change of
    // centre (1 rounding) and the rotation to the ecliptic frame (3); after it: the text to a number (1), the
    // rotation back (3, and it makes the errors before it larger by the factor 1.32 at most), the change of centre (1).
    // The epoch has 6 decimals: the Sun moves 1.6e-8 km in 1 microsecond.
    // Position: (1.5 + 4.5 + 5 + 1.5) e-8 * 1.32 + 6e-8 + 1.6e-8 = 2.4e-7 km, limit 3e-7 km.
    // Velocity: (3.6 + 10.7 + 5 + 3.6) e-15 * 1.32 + 14.2e-15 = 4.4e-14 km/s, limit 5e-14 km/s.
    const pos = maxAbs(back.state0.r, flight.state0.r), vel = maxAbs(back.state0.v, flight.state0.v);
    rec.add({ id: 'io.opmState', group: 'interchange', value: pos, unit: 'km', limit: 3e-7, truth: 'Round trip of the start state of a flight (Voyager 2, heliocentric, ecliptic frame) through an OPM file: limit from the 16 digits of the file', detail: { velocityDifferenceKmS: vel, velocityLimitKmS: 5e-14, epochDifferenceS: Math.abs(back.et0 - flight.et0) } });
    expect(pos).toBeLessThanOrEqual(3e-7);
    expect(vel).toBeLessThanOrEqual(5e-14);
    expect(Math.abs(back.et0 - flight.et0)).toBeLessThanOrEqual(1e-6); // 6 decimals of the second
    const sorted = flight.maneuvers.slice().sort((a, b) => a.et - b.et);
    expect(back.maneuvers.length).toBe(sorted.length);
    back.maneuvers.forEach((m, k) => {
      expect(m.frame).toBe('ICRF');
      expect(Math.abs(m.et - sorted[k].et)).toBeLessThanOrEqual(1e-6);
      expect(maxAbs(m.dv, sorted[k].dv)).toBeLessThan(1e-17); // 16 digits of a velocity change below 0.1 km/s
      expect(m.anchor).toBeUndefined(); // the message has no anchor states
    });
    // The two flights have the same path before the first flyby. The time of the epoch in the file has an error of
    // 0.5 microsecond at most, which moves the start by 6e-6 km along the path (11 km/s at the start).
    const t = flight.et0 + 30 * DAY;
    const a = flyFlight(sys, { ...flight, etEnd: t, maneuvers: [] }).stateAt(t);
    const b = flyFlight(sys, { ...back, etEnd: t, maneuvers: [] }).stateAt(t);
    expect(norm(sub(a.r, b.r))).toBeLessThan(0.01);
  });
});

// ================================================================================================ interpolation

describe('Hermite interpolation in a table', () => {
  /** Circular orbit: r = R (cos wt, sin wt, 0). */
  const R = 7000, W = 1e-3;
  const circle = (t: number): State => S([R * Math.cos(W * t), R * Math.sin(W * t), 0], [-R * W * Math.sin(W * t), R * W * Math.cos(W * t), 0]);
  const circleTable = (h: number, n: number): EphemerisTable => {
    const et = Array.from({ length: n }, (_, i) => i * h);
    return { objectName: 'C', objectId: 'UNKNOWN', center: 'EARTH', frame: 'ICRF', timeScale: 'TDB', et, states: et.map(circle) };
  };
  const worstAtMiddles = (h: number): number => {
    const t = circleTable(h, 9);
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.5) * h;
      worst = Math.max(worst, maxAbs(interpolateTable(t, x).r, circle(x).r));
    }
    return worst;
  };

  it('circular orbit: the error is below the remainder of the Hermite formula', () => {
    // Four points with position and velocity: polynomial of degree 7. Remainder: f(8)(xi) / 8! * product of
    // (x - x_i)^2. For each coordinate of the circle |f(8)| <= R w^8. In the middle of the first interval of a
    // window the product is (0.5 * 0.5 * 1.5 * 2.5)^2 h^8 = 0.879 h^8 (window at the end of the table); in the
    // middle of a centred window it is 0.316 h^8. With w h = 0.2: 7000 * 0.2^8 * 0.879 / 40320 = 3.9e-7 km.
    const h = 200;
    const bound = (R * (W * h) ** 8 * 0.87890625) / 40320;
    const worst = worstAtMiddles(h);
    rec.add({ id: 'io.hermiteCircle', group: 'interchange', value: worst, unit: 'km', limit: bound, truth: 'Analytic circular orbit (radius 7000 km, 0.2 rad between samples), interpolation in the middle between samples; limit: remainder of the Hermite formula of degree 7' });
    expect(worst).toBeLessThanOrEqual(bound);
    expect(worst).toBeGreaterThan(bound / 100); // the error has the order of the formula: the test is not empty
    // A step of one half makes the error smaller by 2^8 = 256.
    const ratio = worst / worstAtMiddles(h / 2);
    expect(ratio).toBeGreaterThan(200);
    expect(ratio).toBeLessThan(300);
    // The velocity is the derivative of the same polynomial.
    const t = circleTable(h, 9);
    expect(maxAbs(interpolateTable(t, 3.5 * h).v, circle(3.5 * h).v)).toBeLessThan(1e-9);
    // Two points: cubic Hermite polynomial, remainder R w^4 / 4! * (h/2)^4.
    expect(maxAbs(interpolateTable(t, 3.5 * h, 2).r, circle(3.5 * h).r)).toBeLessThanOrEqual((R * (W * h) ** 4) / 24 / 16);
  });

  it('a polynomial of degree 7 comes back with no error of the method', () => {
    const c = [1, 2, -3, 0.5, -0.25, 0.125, -0.0625, 0.03125];
    const p = (t: number): number => c.reduce((a, ck, k) => a + ck * t ** k, 0);
    const dp = (t: number): number => c.reduce((a, ck, k) => a + (k === 0 ? 0 : k * ck * t ** (k - 1)), 0);
    const et = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const t: EphemerisTable = { objectName: 'P', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB', et, states: et.map((x) => S([p(x), -p(x), 2 * p(x)], [dp(x), -dp(x), 2 * dp(x)])) };
    for (const x of [0.3, 1.5, 3.3, 4.75, 6.5, 7.9]) {
      const s = interpolateTable(t, x);
      // p(8) = 43000: rounding of 64-bit numbers in the divided differences
      expect(Math.abs(s.r[0] - p(x))).toBeLessThan(1e-9);
      expect(Math.abs(s.r[2] - 2 * p(x))).toBeLessThan(2e-9);
      expect(Math.abs(s.v[1] + dp(x))).toBeLessThan(1e-8);
    }
  });

  it('segments, samples and limits of a table', () => {
    const s = (x: number, v: number): State => S([x, 0, 0], [v, 0, 0]);
    const t: EphemerisTable = { objectName: 'T', objectId: 'UNKNOWN', center: 'SUN', frame: 'ICRF', timeScale: 'TDB', et: [0, 10, 20, 20, 30, 40], states: [s(0, 1), s(10, 1), s(20, 1), s(20, 2), s(40, 2), s(60, 2)], segmentStarts: [0, 3] };
    expect(interpolateTable(t, 5)).toEqual(s(5, 1));
    expect(interpolateTable(t, 20)).toEqual(s(20, 2)); // at a boundary: the state after the maneuver
    expect(interpolateTable(t, 25)).toEqual(s(30, 2));
    expect(interpolateTable(t, 10)).toEqual(s(10, 1));
    expect(interpolateTable(t, 40)).toEqual(s(60, 2));
    const copy = interpolateTable(t, 0);
    copy.r[0] = 99;
    expect(t.states[0].r[0]).toBe(0);
    expectIoError(() => interpolateTable(t, -1), 'table.range');
    expectIoError(() => interpolateTable(t, 40.5), 'table.range');
    expectIoError(() => interpolateTable(t, 5, 1), 'table.points');
    const one: EphemerisTable = { ...t, et: [5], states: [s(1, 2)], segmentStarts: [0] };
    expect(interpolateTable(one, 5)).toEqual(s(1, 2));
  });

  it('table of the real flight in a cruise arc against the trajectory (consistency check)', () => {
    // 200 to 500 days after the start: no body is near. The interpolation of the table with a step of 2 days is
    // compared with the dense output of the propagator, which has an error below 1e-3 km in a cruise arc.
    const traj = voyager().trajectory;
    const t = tableFromTrajectory(sys, traj, { center: 'SUN', frame: 'ICRF', timeScale: 'TDB', stepS: 2 * DAY, objectName: 'V', objectId: 'UNKNOWN' });
    let worst = 0;
    for (let d = 200.37; d < 500; d += 7.77) {
      const et = traj.et0 + d * DAY;
      const s = traj.stateAt(et), c = sys.state('SUN', et);
      worst = Math.max(worst, norm(sub(interpolateTable(t, et).r, sub(s.r, c.r))));
    }
    expect(worst).toBeLessThan(0.01);
  });
});

// ================================================================================================ GMAT

describe('GMAT script (structure only: the script was not run in GMAT)', () => {
  const sections = (text: string): string[] => text.split('\n').filter((l) => /^(Create |BeginMissionSequence)/.test(l)).map((l) => l.replace(/;$/, ''));
  const field = (text: string, name: string): string => {
    const hit = text.split('\n').filter((l) => l.startsWith(`GMAT ${name} = `));
    expect(hit.length, name).toBe(1);
    return hit[0].slice(`GMAT ${name} = `.length).replace(/;$/, '');
  };

  it('hand flight: epoch, state, force model, maneuvers in the axes of the Sun-centred system, mission sequence', () => {
    const earth = sys.state('EARTH', ET_2030), sun = sys.state('SUN', ET_2030);
    const flight: Flight = {
      et0: ET_2030, state0: S(add(earth.r, [7000, 0, 0]), add(earth.v, [0, 7.5, 0])), etEnd: ET_2030 + 3600,
      maneuvers: [
        { id: 'b', et: ET_2030 + 600, dv: [0, 0.05, 0], frame: 'ECLIPJ2000', refBody: 'SUN' },
        { id: 'a', et: ET_2030, dv: [0.1, 0.3, -0.2], frame: 'VNB', refBody: 'EARTH' },
        { id: 'zero', et: ET_2030 + 100, dv: [0, 0, 0], frame: 'ICRF', refBody: 'SUN' },
        { id: 'late', et: ET_2030 + 7200, dv: [1, 0, 0], frame: 'ICRF', refBody: 'SUN' },
      ],
      model: { bodies: [...PLANET_GRAVITY_BODIES], moons: false, j2: false, relativity: false, srp: { areaToMass: 0.01, cr: 1.3 } },
    };
    const text = writeGmatScript({ sys, flight, comments: ['Comment from the caller', 'caf' + String.fromCharCode(0xe9)], spacecraftName: 'Probe_1' });
    const lines = text.split('\n').slice(0, -1);
    expect(lines.slice(0, 3)).toEqual(['% Comment from the caller', '% caf?', '']);
    for (const l of lines) {
      expect(l).toMatch(/^[\x20-\x7e]*$/);
      // Each line is a comment, a blank line, or a statement that ends with a semicolon.
      expect(l === '' || l.startsWith('% ') || /^(GMAT \S+ = .+|Create \w+ \w+|BeginMissionSequence|Propagate .+|Maneuver .+);$/.test(l), l).toBe(true);
    }
    expect(sections(text)).toEqual([
      'Create CoordinateSystem SunMJ2000Eq', 'Create Spacecraft Probe_1', 'Create ForceModel Forces', 'Create Propagator Prop',
      'Create ImpulsiveBurn Burn1', 'Create ImpulsiveBurn Burn2', 'Create ReportFile StateReport', 'Create EphemerisFile StateEphemeris', 'BeginMissionSequence',
    ]);
    expect(field(text, 'SunMJ2000Eq.Origin')).toBe('Sun');
    expect(field(text, 'SunMJ2000Eq.Axes')).toBe('MJ2000Eq');
    // Epoch: the modified Julian date of GMAT is the Julian date - 2430000.0. 2030-01-01T00:00 TDB = JD 2462502.5.
    expect(field(text, 'Probe_1.DateFormat')).toBe('TDBModJulian');
    expect(field(text, 'Probe_1.Epoch')).toBe("'32502.50000000000'");
    expect(field(text, 'Probe_1.CoordinateSystem')).toBe('SunMJ2000Eq');
    expect(field(text, 'Probe_1.DisplayStateType')).toBe('Cartesian');
    // State relative to the Sun: the state of the Earth relative to the Sun plus (7000, 0, 0) km and (0, 7.5, 0) km/s.
    const rel = sys.stateRel('EARTH', 'SUN', ET_2030);
    const got = ['X', 'Y', 'Z', 'VX', 'VY', 'VZ'].map((k) => Number(field(text, 'Probe_1.' + k)));
    expect(maxAbs(got.slice(0, 3), add(rel.r, [7000, 0, 0]))).toBeLessThan(1e-7);
    expect(maxAbs(got.slice(3), add(rel.v, [0, 7.5, 0]))).toBeLessThan(1e-14);
    expect(got.slice(0, 3)).toEqual(sub(flight.state0.r, sun.r));
    // Solar radiation pressure: area = 0.01 m^2/kg * 1000 kg (default mass), flux and distance of the Apsis model.
    expect([field(text, 'Probe_1.DryMass'), field(text, 'Probe_1.Cr'), field(text, 'Probe_1.SRPArea')]).toEqual(['1000', '1.3', '10']);
    expect([field(text, 'Forces.SRP'), field(text, 'Forces.SRP.Flux'), field(text, 'Forces.SRP.Nominal_Sun')]).toEqual(['On', '1361', '149597870.7']);
    expect(field(text, 'Forces.CentralBody')).toBe('Sun');
    expect(field(text, 'Forces.PointMasses')).toBe('{Sun, Mercury, Venus, Earth, Luna, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto}');
    expect(field(text, 'Forces.RelativisticCorrection')).toBe('Off');
    // GM values of Apsis: the Earth alone and the Moon alone, the other planets with their moons.
    expect(Number(field(text, 'Sun.Mu'))).toBe(BODIES.SUN.gm);
    expect(Number(field(text, 'Earth.Mu'))).toBe(BODIES.EARTH.gm);
    expect(Number(field(text, 'Luna.Mu'))).toBe(BODIES.MOON.gm);
    expect(Number(field(text, 'Jupiter.Mu'))).toBe(BODIES.JUPITER.gmSystem);
    expect(BODIES.JUPITER.gmSystem).toBeGreaterThan(BODIES.JUPITER.gm);
    expect([field(text, 'Prop.FM'), field(text, 'Prop.Type'), field(text, 'Prop.Accuracy')]).toEqual(['Forces', 'PrinceDormand78', '1e-12']);
    // Maneuvers in the ICRF axes, by hand. VNB (0.1, 0.3, -0.2) at r = +x, v = +y relative to the Earth:
    // 0.1 (+y) + 0.3 (+z) - 0.2 (+x) = (-0.2, 0.1, 0.3). ECLIPJ2000 (0, 0.05, 0) = 0.05 (0, cos e, sin e).
    const burn = (n: number): number[] => [1, 2, 3].map((k) => Number(field(text, `Burn${n}.Element${k}`)));
    expect(maxAbs(burn(1), [-0.2, 0.1, 0.3])).toBeLessThan(1e-11);
    expect(maxAbs(burn(2), [0, 0.05 * Math.cos(EPS), 0.05 * Math.sin(EPS)])).toBeLessThan(1e-16);
    expect([field(text, 'Burn1.CoordinateSystem'), field(text, 'Burn2.CoordinateSystem'), field(text, 'Burn1.DecrementMass')]).toEqual(['SunMJ2000Eq', 'SunMJ2000Eq', 'false']);
    expect(field(text, 'StateReport.Add')).toBe('{Probe_1.TDBModJulian, Probe_1.SunMJ2000Eq.X, Probe_1.SunMJ2000Eq.Y, Probe_1.SunMJ2000Eq.Z, Probe_1.SunMJ2000Eq.VX, Probe_1.SunMJ2000Eq.VY, Probe_1.SunMJ2000Eq.VZ}');
    expect([field(text, 'StateEphemeris.Spacecraft'), field(text, 'StateEphemeris.FileFormat'), field(text, 'StateEphemeris.CoordinateSystem')]).toEqual(['Probe_1', 'CCSDS-OEM', 'SunMJ2000Eq']);
    // Mission sequence: maneuver at the start, 600 s, maneuver, 3000 s. The maneuver with no velocity change and
    // the maneuver after the end of the flight are not in the script.
    const mission = lines.slice(lines.indexOf('BeginMissionSequence;') + 1);
    expect(mission.length).toBe(4);
    expect(mission[0]).toBe('Maneuver Burn1(Probe_1);');
    expect(mission[2]).toBe('Maneuver Burn2(Probe_1);');
    const secs = [mission[1], mission[3]].map((l) => Number(/^Propagate Prop\(Probe_1\) \{Probe_1\.ElapsedSecs = ([-+.e\d]+)\};$/.exec(l)![1]));
    // Elapsed seconds are TAI seconds. In January TDB goes faster than TAI by 3.3e-10 s/s (see the OEM test in TT):
    // 600 s of TDB are 600 s - 2.0e-7 s of TAI, 3000 s of TDB are 3000 s - 9.9e-7 s. The times of this flight are
    // near 9.5e8 s, where the step of a 64-bit number is 1.2e-7 s: limit 3e-7 s for the two rounded times.
    expect(Math.abs(secs[0] - (600 - 600 * 3.3e-10))).toBeLessThan(3e-7);
    expect(Math.abs(secs[1] - (3000 - 3000 * 3.3e-10))).toBeLessThan(3e-7);
    expect(gmatDifferences({ sys, flight })).toEqual(['gmat.ephemeris', 'gmat.srp']);
  });

  it('real flight (Voyager 2): one burn for each maneuver, the legs have the length of the flight', () => {
    const { flight, trajectory } = voyager();
    const text = writeGmatScript({ sys, flight, trajectory, output: 'report', axes: 'ICRF', ephemerisSource: 'DE421', setGm: false, reportFile: 'voyager2.txt' });
    const n = flight.maneuvers.length;
    expect(sections(text)).toEqual([
      'Create CoordinateSystem SunICRF', 'Create Spacecraft Sat', 'Create ForceModel Forces', 'Create Propagator Prop',
      ...Array.from({ length: n }, (_, k) => `Create ImpulsiveBurn Burn${k + 1}`), 'Create ReportFile StateReport', 'BeginMissionSequence',
    ]);
    expect(text.split('\n')[0]).toBe("GMAT SolarSystem.EphemerisSource = 'DE421';");
    expect(text).not.toContain('.Mu = ');
    expect(field(text, 'SunICRF.Axes')).toBe('ICRF');
    expect(field(text, 'StateReport.Filename')).toBe("'voyager2.txt'");
    // The force model of the flight has Ceres, Vesta and Psyche: GMAT does not have these bodies.
    expect(field(text, 'Forces.PointMasses')).toBe('{Sun, Mercury, Venus, Earth, Luna, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto}');
    expect(field(text, 'Forces.RelativisticCorrection')).toBe('On');
    expect(field(text, 'Forces.SRP')).toBe('Off');
    expect(text).not.toContain('DryMass');
    // Epoch: 11 decimals of a day are 0.9 microsecond.
    const mjd = Number(field(text, 'Sat.Epoch').replace(/'/g, ''));
    expect(Math.abs((mjd - 21545) * DAY - flight.et0)).toBeLessThan(1e-6);
    const sorted = flight.maneuvers.slice().sort((a, b) => a.et - b.et);
    sorted.forEach((m, k) => expect([1, 2, 3].map((c) => Number(field(text, `Burn${k + 1}.Element${c}`)))).toEqual(m.dv));
    const mission2 = text.split('\n').slice(text.split('\n').indexOf('BeginMissionSequence;') + 1).filter((l) => l !== '');
    expect(mission2.filter((l) => l.startsWith('Maneuver ')).map((l) => l)).toEqual(sorted.map((_, k) => `Maneuver Burn${k + 1}(Sat);`));
    expect(mission2.length).toBe(2 * n + 1);
    const total = mission2.filter((l) => l.startsWith('Propagate ')).reduce((a, l) => a + Number(/ElapsedSecs = ([-+.e\d]+)\}/.exec(l)![1]), 0);
    // Elapsed seconds are TAI seconds: the same as the TDB seconds within 4 ms (TDB - TT has an amplitude of 1.7 ms).
    expect(Math.abs(total - (etToTai(flight.etEnd) - etToTai(flight.et0)))).toBeLessThan(1e-6);
    expect(Math.abs(total - (flight.etEnd - flight.et0))).toBeLessThan(4e-3);
    expect(gmatDifferences({ sys, flight })).toEqual(['gmat.ephemeris', 'gmat.j2', 'gmat.smallBodies', 'gmat.relativity', 'gmat.anchors']);
  });

  it('flights and options that the script cannot have', () => {
    const base: Flight = { et0: ET_2030, state0: S([1.5e8, 0, 0], [0, 30, 0]), etEnd: ET_2030 + DAY, maneuvers: [], model: FULL_MODEL };
    expectIoError(() => writeGmatScript({ sys, flight: { ...base, etEnd: ET_2030 - DAY } }), 'gmat.backward');
    // GMAT has epochs from 1957-10-04 to 2100-02-28 only.
    expectIoError(() => writeGmatScript({ sys, flight: { ...base, et0: -45 * 365.25 * DAY, etEnd: 0 } }), 'gmat.epoch');
    expectIoError(() => writeGmatScript({ sys, flight: { ...base, model: { ...FULL_MODEL, bodies: ['EARTH'] } } }), 'gmat.model');
    expectIoError(() => writeGmatScript({ sys, flight: base, reportFile: "it's.txt" }), 'gmat.fileName');
    expectIoError(() => writeGmatScript({ sys, flight: base, ephemerisSource: "DE'405" }), 'gmat.option', undefined, 'ephemerisSource');
    expectIoError(() => writeGmatScript({ sys, flight: base, massKg: 0 }), 'gmat.option');
    expectIoError(() => writeGmatScript({ sys, flight: { ...base, state0: S([NaN, 0, 0], [0, 30, 0]) } }), 'gmat.number');
    // Limits of the GMAT guide for the Spacecraft fields: 0 <= Cr <= 2.0 and SRPArea > 0.
    const withSrp = (areaToMass: number, cr: number): Flight => ({ ...base, model: { ...FULL_MODEL, srp: { areaToMass, cr } } });
    expectIoError(() => writeGmatScript({ sys, flight: withSrp(0.01, 2.5) }), 'gmat.srpRange');
    expectIoError(() => writeGmatScript({ sys, flight: withSrp(-0.01, 1.2) }), 'gmat.srpRange');
    expect(writeGmatScript({ sys, flight: withSrp(0.01, 2) })).toContain('GMAT Sat.Cr = 2;');
    // The force of the Apsis model is proportional to coefficient x area: with a zero, the script has no SRP.
    for (const flight of [withSrp(0.01, 0), withSrp(0, 1.2)]) {
      const text = writeGmatScript({ sys, flight });
      expect(text).toContain('GMAT Forces.SRP = Off;');
      expect(text).not.toContain('SRPArea');
      expect(gmatDifferences({ sys, flight })).not.toContain('gmat.srp');
    }
    // A name that GMAT uses for a body is not the name of the spacecraft.
    expect(writeGmatScript({ sys, flight: base, spacecraftName: 'Earth' })).toContain('Create Spacecraft Sat;');
    expect(writeGmatScript({ sys, flight: base, spacecraftName: '2fast' })).toContain('Create Spacecraft Sat;');
    expect(gmatDifferences({ sys, flight: { ...base, model: { bodies: ['SUN'], moons: true, j2: false, relativity: false, srp: null } } })).toEqual(['gmat.ephemeris', 'gmat.moons', 'gmat.reducedModel']);
  });
});

// ================================================================================================ steps of the integrator

describe('tables with the steps of the integrator (Voyager 2, solved by the engine)', () => {
  const opts = { center: 'SUN', frame: 'ICRF' as const, timeScale: 'TDB' as const, objectName: 'Voyager 2', objectId: '1977-076A' };

  it('each sample is a step of the trajectory; a maneuver is between two segments', () => {
    const { trajectory: traj, flight } = voyager();
    const t = tableFromTrajectorySteps(sys, traj, { ...opts, center: 'SSB' });
    expect(() => checkTable(t, 'x')).not.toThrow();
    expect(t.et[0]).toBe(traj.et0);
    expect(t.et[t.et.length - 1]).toBe(traj.et1);
    expect(t.segmentStarts!.length).toBe(flight.maneuvers.length + 1);
    // Relative to the barycentre in the ICRF, a sample is exactly a step of the integrator (no arithmetic).
    const steps = new Map<number, number[]>();
    for (let i = 0; i < traj.t.length; i++) { const list = steps.get(traj.t[i]) ?? []; list.push(i); steps.set(traj.t[i], list); }
    for (let k = 0; k < t.et.length; k++) {
      const hits = steps.get(t.et[k]);
      expect(hits, 'sample ' + k).toBeDefined();
      expect(hits!.some((i) => [0, 1, 2].every((c) => traj.y[6 * i + c] === t.states[k].r[c] && traj.y[6 * i + 3 + c] === t.states[k].v[c])), 'sample ' + k).toBe(true);
    }
    // No step of the trajectory is left out, but steps shorter than 1 ms (there are none in a cruise).
    expect(t.et.length).toBeGreaterThanOrEqual(traj.t.length - 2 * traj.segStarts.length);
    expect(t.et.length).toBeLessThanOrEqual(traj.t.length);
    // The boundaries of the segments are the maneuvers: equal times, and the velocity step of the flight.
    const sorted = flight.maneuvers.slice().sort((a, b) => a.et - b.et);
    const b = tableBoundaries(sys, t);
    expect(b.map((x) => x.et)).toEqual(sorted.map((m) => m.et));
    b.forEach((x, k) => {
      expect(sorted[k].frame).toBe('ICRF');
      expect(norm(sub(x.dv, sorted[k].dv))).toBeLessThanOrEqual(ANCHOR_LIMIT.v * 1.001);
      expect(x.gapKm).toBeLessThanOrEqual(ANCHOR_LIMIT.r * 1.001);
      expect(x.index).toBe(t.segmentStarts![k + 1]);
    });
  });

  it('samples between the steps are at equal parts of each step', () => {
    const traj = voyager().trajectory;
    const a = tableFromTrajectorySteps(sys, traj, opts);
    const b = tableFromTrajectorySteps(sys, traj, { ...opts, between: 2 });
    const intervals = a.et.length - a.segmentStarts!.length;
    expect(b.et.length).toBe(a.et.length + 2 * intervals);
    // First segment: samples 0, 3, 6 of the second table are samples 0, 1, 2 of the first one.
    for (const i of [0, 1, 2, 10]) {
      expect(b.et[3 * i]).toBe(a.et[i]);
      expect(b.states[3 * i]).toEqual(a.states[i]);
      const h = a.et[i + 1] - a.et[i];
      expect(Math.abs(b.et[3 * i + 1] - (a.et[i] + h / 3))).toBeLessThan(1e-6);
      expect(Math.abs(b.et[3 * i + 2] - (a.et[i] + (2 * h) / 3))).toBeLessThan(1e-6);
    }
    expectIoError(() => tableFromTrajectorySteps(sys, traj, { ...opts, between: -1 }), 'sample.step');
    expectIoError(() => tableFromTrajectorySteps(sys, traj, { ...opts, between: 1.5 }), 'sample.step');
    expectIoError(() => tableFromTrajectorySteps(sys, traj, { ...opts, center: 'VULCAN' }), 'sample.center', undefined, 'VULCAN');
  });

  it('interpolation in a table against the flight: a table with a fixed step is not accurate at a flyby', () => {
    const { trajectory: traj, flight } = voyager();
    const steps = tableFromTrajectorySteps(sys, traj, opts);
    const daily = tableFromTrajectory(sys, traj, { ...opts, stepS: DAY });
    const a = checkTableInterpolation(sys, traj, flight.model, steps);
    const b = checkTableInterpolation(sys, traj, flight.model, daily);
    // Bookkeeping of the check: with no limit, all intervals are examined, and the result is not smaller.
    const all = checkTableInterpolation(sys, traj, flight.model, steps, { limit: 1e9 });
    expect(all.examined).toBe(all.intervals);
    expect(all.intervals).toBe(steps.et.length - steps.segmentStarts!.length);
    expect(a.examined).toBeLessThanOrEqual(400);
    expect(all.maxKm).toBeGreaterThanOrEqual(a.maxKm);
    // The value at the reported time, calculated here again: the flight is propagated with a stop at that time.
    const again = (table: EphemerisTable, et: number): number => {
      const exact = flyFlight(sys, flight, [et]).stateAt(et), sun = sys.state('SUN', et);
      return norm(sub(interpolateTable(table, et).r, sub(exact.r, sun.r)));
    };
    // The two propagations do not have the same steps: their difference is below 0.01 km in this flight.
    expect(Math.abs(again(steps, a.et) - a.maxKm)).toBeLessThan(0.01);
    expect(Math.abs(again(daily, b.et) - b.maxKm)).toBeLessThan(0.01 + 1e-6 * b.maxKm);
    // A step of one day is too long at a flyby (Voyager 2 goes around Neptune in some hours): the largest error
    // of the daily table is near a closest approach, and it is more than 1000 times that of the table of steps.
    const flybys = traj.events.filter((e) => e.type === 'periapsis').map((e) => e.et);
    expect(Math.min(...flybys.map((t) => Math.abs(t - b.et)))).toBeLessThan(2 * DAY);
    expect(b.maxKm).toBeGreaterThan(1000 * a.maxKm);
    expect(steps.et.length).toBeLessThan(daily.et.length);
    rec.add({ id: 'io.stepsTable', group: 'interchange', value: all.maxKm, unit: 'km', limit: 1, truth: 'Flight of Voyager 2 (12 years, 4 flybys): Hermite interpolation of degree 7 in the table of integrator steps against a new integration to the middle of each interval (consistency check, regression limit)', detail: { samples: steps.et.length, samplesOfTheDailyTable: daily.et.length, errorOfTheDailyTableKm: b.maxKm } });
    expect(all.maxKm).toBeLessThan(1);
  });

  it('distance between a trajectory and a table at the sample times (hand offsets)', () => {
    const traj = voyager().trajectory;
    const t = tableFromTrajectorySteps(sys, traj, { ...opts, center: 'SSB' });
    const same = tableDifference(sys, traj, t, 1e9)!;
    expect(same.et.length).toBe(t.et.length);
    // A sample is a step of the trajectory, and the trajectory gives its steps back with no arithmetic.
    // (At a maneuver the trajectory gives the state after it: the sample before it is then different.)
    const boundary = new Set(t.segmentStarts!.slice(1).map((s) => s - 1));
    same.km.forEach((d, k) => { if (!boundary.has(k)) expect(d, 'sample ' + k).toBe(0); });
    const moved: EphemerisTable = { ...t, states: t.states.map((s, k) => (k === 100 ? S([s.r[0] + 3, s.r[1] + 4, s.r[2]], s.v) : s)) };
    const d = tableDifference(sys, traj, moved, 1e9)!;
    expect(Math.abs(d.maxKm - 5)).toBeLessThan(1e-6); // 3-4-5 triangle
    expect(d.maxEt).toBe(t.et[100]);
    // With a limit, the samples are at equal steps of the index, and the last sample is always there.
    const few = tableDifference(sys, traj, t, 50)!;
    expect(few.et.length).toBeLessThanOrEqual(51);
    expect(few.et[few.et.length - 1]).toBe(t.et[t.et.length - 1]);
    // No sample in the time of the trajectory.
    const later: EphemerisTable = { ...t, et: t.et.map((x) => x + 20 * 365.25 * DAY) };
    expect(tableDifference(sys, traj, later)).toBeNull();
  });
});

// ================================================================================================ analysis of a file

describe('analysis of the text and of the table of a file', () => {
  it('format of a text from its first lines (hand texts)', () => {
    expect(detectFormat('CCSDS_OEM_VERS = 2.0\nCREATION_DATE = 2030-01-01T00:00:00\n')).toBe('oem');
    expect(detectFormat('﻿  CCSDS_OPM_VERS=2.0\n')).toBe('opm');
    expect(detectFormat('# comment\nstk.v.11.0\nBEGIN Ephemeris\n')).toBe('stk');
    expect(detectFormat('Target body name: X\n$$SOE\n$$EOE\n')).toBe('horizons');
    expect(detectFormat('# made by a spreadsheet\ntime_utc,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s\n')).toBe('csv');
    expect(detectFormat('JD;X;Y;Z;VX;VY;VZ\n')).toBe('csv');
    expect(detectFormat('  {"format":"apsis-mission"}')).toBe('mission');
    expect(detectFormat('Hello, this is a letter.\n')).toBeNull();
    expect(detectFormat('')).toBeNull();
  });

  it('maneuvers of a table: two samples with the same time (hand values)', () => {
    const table: EphemerisTable = {
      objectName: 'X', objectId: 'UNKNOWN', center: 'SSB', frame: 'ECLIPJ2000', timeScale: 'TDB',
      et: [0, 100, 200, 200, 300, 400, 500, 600],
      states: [
        S([1e8, 0, 0], [0, 20, 0]), S([1e8, 2000, 0], [0, 20, 0]), S([1e8, 4000, 0], [0, 20, 0]),
        S([1e8, 4000, 0], [0, 20.3, 0.4]), S([1e8, 6030, 40], [0, 20.3, 0.4]), S([1e8, 8060, 80], [0, 20.3, 0.4]),
        S([1e8, 9000, 0], [0, 21, 0]), S([1e8, 11100, 0], [0, 21, 0]),
      ],
      segmentStarts: [0, 3, 6],
    };
    const b = tableBoundaries(sys, table);
    // One maneuver at 200 s: 0.3 and 0.4 km/s in the ecliptic frame, thus 0.5 km/s. The segment that starts at
    // 500 s is not at the time of the sample before it (400 s): it is a gap of the data, not a maneuver.
    expect(b.length).toBe(1);
    expect([b[0].index, b[0].et, b[0].gapKm]).toEqual([3, 200, 0]);
    expect(Math.abs(b[0].dvMag - 0.5)).toBeLessThan(1e-12);
    // In the ICRF: y' = y cos e - z sin e, z' = y sin e + z cos e.
    expect(maxAbs(b[0].dv, [0, 0.3 * Math.cos(EPS) - 0.4 * Math.sin(EPS), 0.3 * Math.sin(EPS) + 0.4 * Math.cos(EPS)])).toBeLessThan(1e-12);
    expect(tableBoundaries(sys, { ...table, segmentStarts: undefined })).toEqual([]);
  });

  it('closest approach of Cassini to Venus from JPL Horizons tables with one sample each hour and each day (truth: the 1-minute table)', () => {
    if (!existsSync('truth/horizons/raw/enc_cassini_299_0_hour.txt')) return;
    const e = truth('encounters').missions.cassini.encounters[0];
    expect(e.planet).toBe('299');
    // Truth: parabola through the three 1-minute samples of r^2 that are nearest to the minimum.
    const jd: number[] = e.fine.jd;
    const r2: number[] = e.fine.state.map((s: number[]) => s[0] ** 2 + s[1] ** 2 + s[2] ** 2);
    const m = r2.indexOf(Math.min(...r2));
    expect(m > 0 && m < r2.length - 1).toBe(true);
    const den = r2[m - 1] - 2 * r2[m] + r2[m + 1];
    const x = (0.5 * (r2[m - 1] - r2[m + 1])) / den;
    const rpTruth = Math.sqrt(r2[m] - 0.25 * (r2[m - 1] - r2[m + 1]) * x);
    const etTruth = (jd[m] - 2451545) * DAY + x * 60;
    const out: Record<string, { radius: number; time: number }> = {};
    for (const [key, file] of [['hour', 'enc_cassini_299_0_hour'], ['day', 'enc_cassini_299_coarse']] as const) {
      const table = parseHorizonsVectors(readFileSync(`truth/horizons/raw/${file}.txt`, 'utf8'));
      const venus = tableApproaches(sys, table).filter((a) => a.body === 'VENUS');
      expect(venus.length).toBeGreaterThanOrEqual(1);
      const a = venus[0];
      expect(a.refined).toBe(true);
      out[key] = { radius: Math.abs(a.radius - rpTruth), time: Math.abs(a.et - etTruth) };
      expect(Math.abs(a.altitude - (a.radius - BODIES.VENUS.radius))).toBeLessThan(1e-9);
    }
    // The nearest sample of the hourly table is 3700 km above the closest approach, that of the daily table is
    // much more: the result does not come from the samples themselves.
    // Limits: the parabola has an error below 0.5 km (the term of the fourth order in 60 s), and the propagation
    // of a flyby from a state one day before it agrees with Horizons to 0.06 km (test of the flybys).
    rec.add({ id: 'io.approachHourly', group: 'interchange', value: out.hour.radius, unit: 'km', limit: 1, truth: 'JPL Horizons trajectory of Cassini at Venus (1998-04-26), 1-minute samples: closest approach from the table with 1-hour samples', detail: { timeDifferenceS: out.hour.time, truthRadiusKm: rpTruth } });
    rec.add({ id: 'io.approachDaily', group: 'interchange', value: out.day.radius, unit: 'km', limit: 1, truth: 'JPL Horizons trajectory of Cassini at Venus (1998-04-26), 1-minute samples: closest approach from the table with 1-day samples', detail: { timeDifferenceS: out.day.time, truthRadiusKm: rpTruth } });
    expect(out.hour.radius).toBeLessThan(1);
    expect(out.day.radius).toBeLessThan(1);
    expect(out.hour.time).toBeLessThan(2);
    expect(out.day.time).toBeLessThan(2);
  });

  it('all the flybys of Cassini from the table with 1-day samples: the same bodies in the same order as the encounters of the truth file', () => {
    if (!existsSync('truth/horizons/raw/enc_cassini_299_coarse.txt')) return;
    const P: Record<string, string> = { '299': 'VENUS', '399': 'EARTH', '599': 'JUPITER', '699': 'SATURN' };
    const enc = truth('encounters').missions.cassini.encounters;
    const table = parseHorizonsVectors(readFileSync('truth/horizons/raw/enc_cassini_299_coarse.txt', 'utf8'));
    const found = tableApproaches(sys, table).filter((a) => a.body !== 'MOON');
    expect(found.map((a) => a.body)).toEqual(enc.map((e: { planet: string }) => P[e.planet]));
    // The function propagates from the sample before the closest approach to the sample after it, without a
    // maneuver, and gives the distance from that sample (missKm). At Saturn the table does not agree with a path
    // without a maneuver: the miss is more than 100 times that of each other flyby (measured: 141 620 km against
    // 228 km or less). The closest approach to Saturn is in the same 1-day interval as the arrival in orbit about
    // Saturn, where the speed relative to Saturn must change.
    const last = found[found.length - 1];
    const others = found.slice(0, -1);
    expect(last.body).toBe('SATURN');
    for (const a of found) expect(a.refined && Number.isFinite(a.missKm), a.body).toBe(true);
    expect(last.missKm).toBeGreaterThan(100 * Math.max(...others.map((a) => a.missKm)));
    // Times: the minimum of the 1-minute samples of the truth file is within 1 minute of the closest approach.
    // This is correct only where the table agrees with a path without a maneuver, thus not for Saturn.
    others.forEach((a, k) => expect(Math.abs(a.et - (enc[k].jdClosest - 2451545) * DAY), a.body).toBeLessThan(90));
  });
});
