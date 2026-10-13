/**
 * CCSDS Orbit Ephemeris Message (OEM) in the keyword = value notation.
 * Sources: CCSDS 502.0-B-2 (Orbit Data Messages, November 2009, with Technical Corrigendum 1), sections 5 and 6;
 * CCSDS 502.0-B-1 (version 1.0) and CCSDS 502.0-B-3 (version 3.0) for the differences that the reader accepts.
 *
 * The writer makes version 2.0. Each segment of the table is one metadata block with its ephemeris lines: a reader
 * must not interpolate across two blocks (5.2.4.6), which is correct for a maneuver.
 * The reader accepts versions 1.0, 2.0 and 3.0. It ignores acceleration columns and covariance blocks.
 */
import type { State } from '../vec';
import { type FrameId, stateToIcrf } from '../frames';
import { type TimeScale, formatIso } from '../time';
import {
  type EphemerisTable, IoError, textLines, formatReal, parseReal, segmentRanges, checkTable, centerFromName, centerToName,
  parseCcsdsTime, kvnLine, kvnText, kvnValue, kvnComments, ccsdsFrame, ccsdsTimeScale,
} from './types';

export interface OemWriteOptions {
  /** Value of ORIGINATOR. */
  originator: string;
  /** Time of creation of the file, et. The engine does not read a clock. */
  creationEt: number;
  /** Interpolation method that the file recommends to its reader (default HERMITE). */
  interpolation?: string;
  /** Interpolation degree that the file recommends (default 7). A block with few lines gets a smaller degree. */
  interpolationDegree?: number;
}

/**
 * Write a table as an OEM, version 2.0. Positions are in km and velocities in km/s with 16 significant digits,
 * times have 6 decimals of the second. REF_FRAME is always ICRF: a table in ECLIPJ2000 is rotated to the ICRF,
 * because version 2.0 of the standard has no keyword for the ecliptic frame.
 */
export function writeOem(table: EphemerisTable, opts: OemWriteOptions): string {
  checkTable(table, 'oem.table');
  const degree = opts.interpolationDegree ?? 7;
  if (!Number.isFinite(opts.creationEt) || !Number.isInteger(degree) || degree < 1) throw new IoError('oem.option');
  const method = kvnValue(opts.interpolation ?? 'HERMITE');
  const scale = table.timeScale;
  const time = (et: number): string => formatIso(et, scale, 6);
  const out: string[] = [
    'CCSDS_OEM_VERS = 2.0',
    ...kvnComments(table.comments),
    'CREATION_DATE = ' + formatIso(opts.creationEt, 'UTC', 0),
    'ORIGINATOR = ' + kvnValue(opts.originator),
  ];
  for (const [a, b] of segmentRanges(table)) {
    const count = b - a + 1;
    out.push(
      '',
      'META_START',
      'OBJECT_NAME = ' + kvnValue(table.objectName),
      'OBJECT_ID = ' + kvnValue(table.objectId),
      'CENTER_NAME = ' + centerToName(table.center),
      'REF_FRAME = ICRF',
      'TIME_SYSTEM = ' + scale,
      'START_TIME = ' + time(table.et[a]),
      'STOP_TIME = ' + time(table.et[b]),
    );
    if (count > 1) {
      // A polynomial through n points has a degree of n - 1 at most (with the velocities: 2n - 1).
      const most = method === 'HERMITE' ? 2 * count - 1 : count - 1;
      out.push('INTERPOLATION = ' + method, 'INTERPOLATION_DEGREE = ' + Math.min(degree, most));
    }
    out.push('META_STOP', '');
    for (let i = a; i <= b; i++) {
      const s = stateToIcrf(table.states[i], table.frame);
      out.push(time(table.et[i]) + ' ' + [...s.r, ...s.v].map((x) => formatReal(x).padStart(23)).join(' '));
    }
  }
  return out.join('\n') + '\n';
}

const HEADER_KEYS = new Set(['CLASSIFICATION', 'CREATION_DATE', 'ORIGINATOR', 'MESSAGE_ID']);
const META_KEYS = new Set([
  'OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'REF_FRAME_EPOCH', 'TIME_SYSTEM', 'START_TIME',
  'USEABLE_START_TIME', 'USEABLE_STOP_TIME', 'STOP_TIME', 'INTERPOLATION', 'INTERPOLATION_DEGREE',
]);

interface Block {
  metaLine: number;
  objectName: string;
  objectId: string;
  center: string;
  frame: FrameId;
  timeScale: TimeScale;
  /** Start of the time span that the block is for (USEABLE_START_TIME, or START_TIME if there is none). */
  useFrom: number;
  et: number[];
  states: State[];
  /** Line number of each ephemeris line. */
  lines: number[];
}

type Meta = Map<string, { value: string; line: number }>;

function readMeta(meta: Meta, metaLine: number, stopLine: number, julian: boolean): Block {
  const need = (key: string): { value: string; line: number } => {
    const e = meta.get(key);
    if (!e || e.value === '') throw new IoError('oem.meta', stopLine, key);
    return e;
  };
  const name = need('OBJECT_NAME'), id = need('OBJECT_ID'), cen = need('CENTER_NAME'), ref = need('REF_FRAME');
  const sys = need('TIME_SYSTEM'), start = need('START_TIME'), stop = need('STOP_TIME');
  const center = centerFromName(cen.value);
  if (!center) throw new IoError('oem.center', cen.line, cen.value);
  const frame = ccsdsFrame(ref.value);
  if (!frame) throw new IoError('oem.frame', ref.line, ref.value);
  const timeScale = ccsdsTimeScale(sys.value);
  if (!timeScale) throw new IoError('oem.timeSystem', sys.line, sys.value);
  const time = (e: { value: string; line: number }): number => {
    const t = parseCcsdsTime(e.value, timeScale, julian);
    if (t === null) throw new IoError('oem.time', e.line, e.value);
    return t;
  };
  // All the time values are checked. A file can have its times in the opposite order (backward propagation).
  const limits = [time(start), time(stop)];
  const useable = ['USEABLE_START_TIME', 'USEABLE_STOP_TIME'].map((k) => meta.get(k)).filter((e) => e !== undefined).map(time);
  return {
    metaLine, objectName: name.value, objectId: id.value, center, frame, timeScale,
    useFrom: Math.min(...(useable.length > 0 ? useable : limits)), et: [], states: [], lines: [],
  };
}

/**
 * Read an OEM (versions 1.0, 2.0 and 3.0). Each metadata block of the file is one segment of the table.
 * All blocks must have the same object, centre, frame and time system. If the lines of two blocks overlap in time,
 * the lines of the first block are used up to the start of the useable time of the second block.
 * A file with times that decrease is put in the order of time.
 */
export function parseOem(text: string): EphemerisTable {
  const lines = textLines(text);
  const comments: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const first = i < lines.length ? kvnLine(lines[i]) : null;
  if (!first || first.key !== 'CCSDS_OEM_VERS') throw new IoError('oem.header', Math.min(i + 1, lines.length));
  const version = /^(\d+)\.\d+$/.exec(first.value);
  if (!version || +version[1] < 1 || +version[1] > 3) throw new IoError('oem.version', i + 1, first.value);
  // Version 1.0 permitted a Julian date for a time.
  const julian = +version[1] === 1;

  const header = new Set<string>();
  for (i++; i < lines.length; i++) {
    const s = lines[i].trim();
    if (s === '') continue;
    if (s === 'META_START') break;
    const kv = kvnLine(lines[i]);
    if (!kv) throw new IoError('oem.header', i + 1);
    if (kv.key === 'COMMENT') { comments.push(kv.value); continue; }
    if (!HEADER_KEYS.has(kv.key) || header.has(kv.key)) throw new IoError('oem.keyword', i + 1, kv.key);
    if (kv.key === 'CREATION_DATE' && parseCcsdsTime(kv.value, 'UTC', julian) === null) throw new IoError('oem.time', i + 1, kv.value);
    header.add(kv.key);
  }
  for (const key of ['CREATION_DATE', 'ORIGINATOR']) {
    if (!header.has(key)) throw new IoError('oem.header', Math.min(i + 1, lines.length), key);
  }
  if (i >= lines.length) throw new IoError('oem.meta', lines.length, 'META_START');

  const blocks: Block[] = [];
  while (i < lines.length) {
    // lines[i] is META_START
    const metaLine = i + 1;
    const meta: Meta = new Map();
    let stop = -1;
    for (i++; i < lines.length; i++) {
      const s = lines[i].trim();
      if (s === '') continue;
      if (s === 'META_STOP') { stop = i; break; }
      const kv = kvnLine(lines[i]);
      if (!kv) throw new IoError('oem.meta', i + 1);
      if (kv.key === 'COMMENT') { comments.push(kv.value); continue; }
      if (!META_KEYS.has(kv.key) || meta.has(kv.key)) throw new IoError('oem.keyword', i + 1, kv.key);
      meta.set(kv.key, { value: kv.value, line: i + 1 });
    }
    if (stop < 0) throw new IoError('oem.meta', metaLine, 'META_STOP');
    const block = readMeta(meta, metaLine, stop + 1, julian);
    for (i = stop + 1; i < lines.length; i++) {
      const s = lines[i].trim();
      if (s === '') continue;
      if (s === 'META_START') break;
      if (s === 'COVARIANCE_START') {
        // Covariance data are not used.
        const from = i + 1;
        while (i < lines.length && lines[i].trim() !== 'COVARIANCE_STOP') i++;
        if (i >= lines.length) throw new IoError('oem.covariance', from);
        continue;
      }
      if (/^COMMENT(\s|$)/.test(s)) { comments.push(s.slice(7).trim()); continue; }
      const tok = s.split(/\s+/);
      // epoch, position and velocity, and optionally the acceleration (version 2.0 and later)
      if (tok.length !== 7 && tok.length !== 10) throw new IoError('oem.state', i + 1);
      const x = tok.slice(1).map(parseReal);
      if (x.some(Number.isNaN)) throw new IoError('oem.state', i + 1);
      const t = parseCcsdsTime(tok[0], block.timeScale, julian);
      if (t === null) throw new IoError('oem.time', i + 1, tok[0]);
      block.et.push(t);
      block.states.push({ r: [x[0], x[1], x[2]], v: [x[3], x[4], x[5]] });
      block.lines.push(i + 1);
    }
    if (block.et.length === 0) throw new IoError('oem.data', stop + 1);
    blocks.push(block);
  }

  const b0 = blocks[0];
  for (const b of blocks) {
    if (b.center !== b0.center || b.frame !== b0.frame || b.timeScale !== b0.timeScale || kvnText(b.objectName) !== kvnText(b0.objectName) || kvnText(b.objectId) !== kvnText(b0.objectId)) {
      throw new IoError('oem.mixed', b.metaLine);
    }
  }

  // Direction of time in the file: a program can write a backward propagation with times that decrease.
  let dir = 0;
  for (const b of blocks) for (let k = 1; k < b.et.length && dir === 0; k++) dir = Math.sign(b.et[k] - b.et[k - 1]);
  for (let k = 1; k < blocks.length && dir === 0; k++) dir = Math.sign(blocks[k].et[0] - blocks[k - 1].et[0]);
  if (dir < 0) {
    blocks.reverse();
    for (const b of blocks) { b.et.reverse(); b.states.reverse(); b.lines.reverse(); }
  }
  for (const b of blocks) {
    for (let k = 1; k < b.et.length; k++) if (!(b.et[k] > b.et[k - 1])) throw new IoError('oem.order', b.lines[k]);
  }
  for (let k = 1; k < blocks.length; k++) {
    const p = blocks[k - 1], q = blocks[k];
    if (q.et[0] >= p.et[p.et.length - 1]) continue;
    // The lines of the two blocks overlap in time: the later block is used from the start of its useable time.
    const line = q.lines[0];
    const cut = q.useFrom;
    const keepP = p.et.filter((t) => t <= cut).length;
    const dropQ = q.et.filter((t) => t < cut).length;
    p.et.length = keepP; p.states.length = keepP; p.lines.length = keepP;
    q.et.splice(0, dropQ); q.states.splice(0, dropQ); q.lines.splice(0, dropQ);
    if (p.et.length === 0 || q.et.length === 0) throw new IoError('oem.order', line);
  }

  const et: number[] = [];
  const states: State[] = [];
  const segmentStarts: number[] = [];
  for (const b of blocks) {
    segmentStarts.push(et.length);
    for (let k = 0; k < b.et.length; k++) { et.push(b.et[k]); states.push(b.states[k]); }
  }
  const table: EphemerisTable = { objectName: b0.objectName, objectId: b0.objectId, center: b0.center, frame: b0.frame, timeScale: b0.timeScale, et, states, segmentStarts };
  if (comments.length > 0) table.comments = comments;
  return table;
}
