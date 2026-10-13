/**
 * CCSDS Orbit Parameter Message (OPM) in the keyword = value notation: one state at one time, optional spacecraft
 * parameters, and a list of maneuvers.
 * Source: CCSDS 502.0-B-2 (Orbit Data Messages, November 2009, with Technical Corrigendum 1), sections 3 and 6.
 *
 * The writer makes version 2.0. The reader accepts versions 1.0, 2.0 and 3.0; it ignores the Keplerian elements,
 * the covariance matrix and the user-defined parameters.
 *
 * Maneuver frames. Apsis has the local frames VNB and RTN (frames.ts). The message has:
 *   RTN (or RSW) : radial, transverse, normal: the same axes as the Apsis frame RTN.
 *   TNW          : x along the velocity, W along the orbit normal (r x v), N completes the right-handed frame
 *                  (N = W x T). Apsis VNB has V = T, N = W and B = V x N = -N(TNW).
 *                  Thus (dV, dN, dB) of Apsis = (dT, dW, -dN) of the message.
 * Names of the SANA registry of orbit-relative frames that the reader also accepts: VNC (= VNB), NTW, LVLH,
 * each with or without the ending _INERTIAL or _ROTATING.
 * A local frame of a maneuver uses the state relative to the centre of the message.
 */
import type { SolarSystem } from '../system';
import { type Flight, flyFlight } from '../flight';
import type { ForceModel, Maneuver } from '../propagate';
import { type FrameId, type LocalFrame, stateFromIcrf, stateToIcrf, toIcrf } from '../frames';
import { type TimeScale, formatIso } from '../time';
import { type State, type Vec3, norm } from '../vec';
import { G0 } from '../bodies';
import {
  IoError, textLines, formatReal, parseReal, centerFromName, centerToName, parseCcsdsTime, kvnLine, kvnText, kvnValue,
  kvnComments, ccsdsFrame, ccsdsTimeScale,
} from './types';

export interface OpmSpacecraft {
  /** Mass at the epoch of the state, kg. */
  massKg?: number;
  solarRadAreaM2?: number;
  /** Solar radiation pressure coefficient. 0 = no solar radiation pressure (3.2.4.5). */
  solarRadCoeff?: number;
  dragAreaM2?: number;
  /** Drag coefficient. 0 = no drag (3.2.4.6). */
  dragCoeff?: number;
}

export interface OpmManeuver {
  /** Time of ignition, et. */
  et: number;
  /** Duration, s. 0 = impulsive maneuver. */
  durationS: number;
  /** Change of mass, kg (a negative number). */
  deltaMassKg: number;
  /** Frame of `dv` in the convention of Apsis. A local frame uses the state relative to the centre of the message. */
  frame: LocalFrame;
  /** Velocity change, km/s. */
  dv: Vec3;
  comments?: string[];
}

export interface Opm {
  objectName: string;
  objectId: string;
  /** Apsis body id or 'SSB'. */
  center: string;
  frame: FrameId;
  /** Time scale of the text of the file. All times in memory are et. */
  timeScale: TimeScale;
  /** Epoch of the state, et. */
  et: number;
  /** Relative to `center`, in `frame`, km and km/s. */
  state: State;
  spacecraft?: OpmSpacecraft;
  maneuvers: OpmManeuver[];
  comments?: string[];
}

export interface OpmWriteOptions {
  /** Value of ORIGINATOR. */
  originator: string;
  /** Time of creation of the file, et. The engine does not read a clock. */
  creationEt: number;
}

/**
 * Write an OPM, version 2.0, with the units after the values. REF_FRAME is always ICRF (a state in ECLIPJ2000 is
 * rotated). Maneuver frames in the file: ICRF (for ICRF and ECLIPJ2000), RTN, TNW (for VNB).
 * A message with a maneuver must have the mass of the spacecraft (3.2.4.9), and each change of mass must be negative.
 */
export function writeOpm(opm: Opm, opts: OpmWriteOptions): string {
  const sc = opm.spacecraft ?? {};
  const numbers = [opts.creationEt, opm.et, ...opm.state.r, ...opm.state.v, ...Object.values(sc).filter((x): x is number => x !== undefined)];
  for (const m of opm.maneuvers) numbers.push(m.et, m.durationS, m.deltaMassKg, ...m.dv);
  if (!numbers.every(Number.isFinite)) throw new IoError('opm.number');
  if (opm.maneuvers.length > 0 && sc.massKg === undefined) throw new IoError('opm.mass');
  if (sc.massKg !== undefined && !(sc.massKg > 0)) throw new IoError('opm.mass');
  opm.maneuvers.forEach((m, k) => {
    if (!(m.deltaMassKg < 0)) throw new IoError('opm.deltaMass', undefined, String(k));
    if (m.durationS < 0) throw new IoError('opm.duration', undefined, String(k));
  });
  const time = (et: number): string => formatIso(et, opm.timeScale, 6);
  const s = stateToIcrf(opm.state, opm.frame);
  const out: string[] = [
    'CCSDS_OPM_VERS = 2.0',
    ...kvnComments(opm.comments),
    'CREATION_DATE = ' + formatIso(opts.creationEt, 'UTC', 0),
    'ORIGINATOR = ' + kvnValue(opts.originator),
    '',
    'OBJECT_NAME = ' + kvnValue(opm.objectName),
    'OBJECT_ID = ' + kvnValue(opm.objectId),
    'CENTER_NAME = ' + centerToName(opm.center),
    'REF_FRAME = ICRF',
    'TIME_SYSTEM = ' + opm.timeScale,
    '',
    'EPOCH = ' + time(opm.et),
    `X = ${formatReal(s.r[0])} [km]`,
    `Y = ${formatReal(s.r[1])} [km]`,
    `Z = ${formatReal(s.r[2])} [km]`,
    `X_DOT = ${formatReal(s.v[0])} [km/s]`,
    `Y_DOT = ${formatReal(s.v[1])} [km/s]`,
    `Z_DOT = ${formatReal(s.v[2])} [km/s]`,
  ];
  const spacecraft: string[] = [];
  if (sc.massKg !== undefined) spacecraft.push(`MASS = ${formatReal(sc.massKg)} [kg]`);
  if (sc.solarRadAreaM2 !== undefined) spacecraft.push(`SOLAR_RAD_AREA = ${formatReal(sc.solarRadAreaM2)} [m**2]`);
  if (sc.solarRadCoeff !== undefined) spacecraft.push(`SOLAR_RAD_COEFF = ${formatReal(sc.solarRadCoeff)}`);
  if (sc.dragAreaM2 !== undefined) spacecraft.push(`DRAG_AREA = ${formatReal(sc.dragAreaM2)} [m**2]`);
  if (sc.dragCoeff !== undefined) spacecraft.push(`DRAG_COEFF = ${formatReal(sc.dragCoeff)}`);
  if (spacecraft.length > 0) out.push('', ...spacecraft);
  for (const m of opm.maneuvers) {
    let frame: string, dv: Vec3;
    if (m.frame === 'RTN') { frame = 'RTN'; dv = m.dv; }
    else if (m.frame === 'VNB') { frame = 'TNW'; dv = [m.dv[0], -m.dv[2], m.dv[1]]; }
    else { frame = 'ICRF'; dv = toIcrf(m.dv, m.frame); }
    out.push(
      '',
      ...kvnComments(m.comments),
      'MAN_EPOCH_IGNITION = ' + time(m.et),
      `MAN_DURATION = ${formatReal(m.durationS)} [s]`,
      `MAN_DELTA_MASS = ${formatReal(m.deltaMassKg)} [kg]`,
      'MAN_REF_FRAME = ' + frame,
      `MAN_DV_1 = ${formatReal(dv[0])} [km/s]`,
      `MAN_DV_2 = ${formatReal(dv[1])} [km/s]`,
      `MAN_DV_3 = ${formatReal(dv[2])} [km/s]`,
    );
  }
  return out.join('\n') + '\n';
}

const HEADER_KEYS = ['CLASSIFICATION', 'CREATION_DATE', 'ORIGINATOR', 'MESSAGE_ID'];
const META_KEYS = ['OBJECT_NAME', 'OBJECT_ID', 'CENTER_NAME', 'REF_FRAME', 'REF_FRAME_EPOCH', 'TIME_SYSTEM'];
const STATE_KEYS = ['EPOCH', 'X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'];
const KEPLER_KEYS = ['SEMI_MAJOR_AXIS', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'TRUE_ANOMALY', 'MEAN_ANOMALY', 'GM'];
const SPACECRAFT_KEYS = ['MASS', 'SOLAR_RAD_AREA', 'SOLAR_RAD_COEFF', 'DRAG_AREA', 'DRAG_COEFF'];
const MANEUVER_KEYS = ['MAN_EPOCH_IGNITION', 'MAN_DURATION', 'MAN_DELTA_MASS', 'MAN_REF_FRAME', 'MAN_DV_1', 'MAN_DV_2', 'MAN_DV_3'];
const SINGLE_KEYS = new Set([...HEADER_KEYS, ...META_KEYS, ...STATE_KEYS, ...KEPLER_KEYS, ...SPACECRAFT_KEYS]);
const IGNORED_KEY = /^(USER_DEFINED_.+|COV_REF_FRAME|C[XYZ](_DOT)?_[XYZ](_DOT)?)$/;
/** Units of the values that the reader uses (table 3-3). A value with a different unit in brackets is an error. */
const UNITS: Record<string, string> = {
  X: 'km', Y: 'km', Z: 'km', X_DOT: 'km/s', Y_DOT: 'km/s', Z_DOT: 'km/s',
  MASS: 'kg', SOLAR_RAD_AREA: 'm**2', SOLAR_RAD_COEFF: '', DRAG_AREA: 'm**2', DRAG_COEFF: '',
  MAN_DURATION: 's', MAN_DELTA_MASS: 'kg', MAN_DV_1: 'km/s', MAN_DV_2: 'km/s', MAN_DV_3: 'km/s',
};

interface Entry { value: string; line: number }

/** Frame and components of a maneuver in the convention of Apsis, from MAN_REF_FRAME and MAN_DV_1 to MAN_DV_3. */
function maneuverFrame(value: string, d: Vec3): { frame: LocalFrame; dv: Vec3 } | null {
  const inertial = ccsdsFrame(value);
  if (inertial) return { frame: inertial, dv: d };
  switch (kvnText(value).replace(/ (INERTIAL|ROTATING)$/, '')) {
    case 'RTN': case 'RSW': return { frame: 'RTN', dv: d };
    case 'VNC': return { frame: 'VNB', dv: d };
    // TNW: x = velocity, z = orbit normal, y = z cross x = -B
    case 'TNW': return { frame: 'VNB', dv: [d[0], d[2], -d[1]] };
    // NTW: y = velocity, z = orbit normal, x = y cross z = B
    case 'NTW': return { frame: 'VNB', dv: [d[1], d[2], d[0]] };
    // LVLH: z = -radial, y = -orbit normal, x = y cross z = transverse
    case 'LVLH': return { frame: 'RTN', dv: [-d[2], d[0], -d[1]] };
    default: return null;
  }
}

/** Read an OPM (versions 1.0, 2.0 and 3.0). */
export function parseOpm(text: string): Opm {
  const lines = textLines(text);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const first = i < lines.length ? kvnLine(lines[i]) : null;
  if (!first || first.key !== 'CCSDS_OPM_VERS') throw new IoError('opm.header', Math.min(i + 1, lines.length));
  const version = /^(\d+)\.\d+$/.exec(first.value);
  if (!version || +version[1] < 1 || +version[1] > 3) throw new IoError('opm.version', i + 1, first.value);
  const julian = +version[1] === 1;

  const single = new Map<string, Entry>();
  const blocks: { line: number; values: Map<string, Entry>; comments: string[] }[] = [];
  const comments: string[] = [];
  let pending: string[] = [];
  for (i++; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    const kv = kvnLine(lines[i]);
    if (!kv) throw new IoError('opm.syntax', i + 1);
    if (kv.key === 'COMMENT') { pending.push(kv.value); continue; }
    if (kv.key === 'MAN_EPOCH_IGNITION') {
      // Start of the data of one maneuver. The comments immediately before it are the comments of the maneuver.
      blocks.push({ line: i + 1, values: new Map([[kv.key, { value: kv.value, line: i + 1 }]]), comments: pending });
      pending = [];
      continue;
    }
    comments.push(...pending);
    pending = [];
    if (MANEUVER_KEYS.includes(kv.key)) {
      const block = blocks[blocks.length - 1];
      if (!block || block.values.has(kv.key)) throw new IoError('opm.keyword', i + 1, kv.key);
      block.values.set(kv.key, { value: kv.value, line: i + 1 });
    } else if (SINGLE_KEYS.has(kv.key)) {
      if (single.has(kv.key)) throw new IoError('opm.keyword', i + 1, kv.key);
      single.set(kv.key, { value: kv.value, line: i + 1 });
    } else if (!IGNORED_KEY.test(kv.key)) {
      throw new IoError('opm.keyword', i + 1, kv.key);
    }
  }
  comments.push(...pending);

  const last = lines.length;
  const need = (key: string): Entry => {
    const e = single.get(key);
    if (!e || e.value === '') throw new IoError('opm.missing', e?.line ?? last, key);
    return e;
  };
  /** Number of a value, with a check of the unit in brackets if there is one. */
  const number = (key: string, e: Entry): number => {
    const m = /^(\S+)(?:\s+\[(.*)\])?$/.exec(e.value);
    const x = m ? parseReal(m[1]) : NaN;
    if (Number.isNaN(x)) throw new IoError('opm.number', e.line, key);
    // '[n/a]' for a value with no unit is not correct (6.6.1.2), but its meaning is clear.
    const unit = m![2]?.replace(/\s+/g, '').toLowerCase().replace(/^n\/a$/, '');
    if (unit !== undefined && unit !== UNITS[key]) throw new IoError('opm.units', e.line, key);
    return x;
  };
  const creation = need('CREATION_DATE');
  if (parseCcsdsTime(creation.value, 'UTC', julian) === null) throw new IoError('opm.time', creation.line, creation.value);
  need('ORIGINATOR');
  const name = need('OBJECT_NAME'), id = need('OBJECT_ID'), cen = need('CENTER_NAME'), ref = need('REF_FRAME'), sys = need('TIME_SYSTEM');
  const center = centerFromName(cen.value);
  if (!center) throw new IoError('opm.center', cen.line, cen.value);
  const frame = ccsdsFrame(ref.value);
  if (!frame) throw new IoError('opm.frame', ref.line, ref.value);
  const timeScale = ccsdsTimeScale(sys.value);
  if (!timeScale) throw new IoError('opm.timeSystem', sys.line, sys.value);
  const time = (e: Entry): number => {
    const t = parseCcsdsTime(e.value, timeScale, julian);
    if (t === null) throw new IoError('opm.time', e.line, e.value);
    return t;
  };
  const et = time(need('EPOCH'));
  const [x, y, z, vx, vy, vz] = ['X', 'Y', 'Z', 'X_DOT', 'Y_DOT', 'Z_DOT'].map((k) => number(k, need(k)));

  const opm: Opm = { objectName: name.value, objectId: id.value, center, frame, timeScale, et, state: { r: [x, y, z], v: [vx, vy, vz] }, maneuvers: [] };
  const optional = (key: string): number | undefined => {
    const e = single.get(key);
    return e ? number(key, e) : undefined;
  };
  const sc: OpmSpacecraft = {
    massKg: optional('MASS'), solarRadAreaM2: optional('SOLAR_RAD_AREA'), solarRadCoeff: optional('SOLAR_RAD_COEFF'),
    dragAreaM2: optional('DRAG_AREA'), dragCoeff: optional('DRAG_COEFF'),
  };
  for (const k of Object.keys(sc) as (keyof OpmSpacecraft)[]) if (sc[k] === undefined) delete sc[k];
  if (Object.keys(sc).length > 0) opm.spacecraft = sc;

  for (const b of blocks) {
    // All the parameters of a maneuver must be given (table 3-3).
    for (const key of MANEUVER_KEYS) if (!b.values.has(key) || b.values.get(key)!.value === '') throw new IoError('opm.maneuver', b.line, key);
    const get = (key: string): Entry => b.values.get(key)!;
    const d: Vec3 = [number('MAN_DV_1', get('MAN_DV_1')), number('MAN_DV_2', get('MAN_DV_2')), number('MAN_DV_3', get('MAN_DV_3'))];
    const f = maneuverFrame(get('MAN_REF_FRAME').value, d);
    if (!f) throw new IoError('opm.manFrame', get('MAN_REF_FRAME').line, get('MAN_REF_FRAME').value);
    const man: OpmManeuver = {
      et: time(get('MAN_EPOCH_IGNITION')), durationS: number('MAN_DURATION', get('MAN_DURATION')),
      deltaMassKg: number('MAN_DELTA_MASS', get('MAN_DELTA_MASS')), frame: f.frame, dv: f.dv,
    };
    if (man.durationS < 0) throw new IoError('opm.number', get('MAN_DURATION').line, 'MAN_DURATION');
    if (b.comments.length > 0) man.comments = b.comments;
    opm.maneuvers.push(man);
  }
  if (comments.length > 0) opm.comments = comments;
  return opm;
}

export interface OpmFromFlightOptions {
  objectName: string;
  objectId: string;
  /** Centre of the state in the message: Apsis body id or 'SSB'. */
  center: string;
  frame: FrameId;
  timeScale: TimeScale;
  comments?: string[];
  /**
   * Mass at the start of the flight and specific impulse of the engine: they give the change of mass of each
   * maneuver (rocket equation). Necessary if the flight has a maneuver.
   * Area and coefficient for solar radiation pressure: default = the values of the force model of the flight.
   */
  spacecraft?: { massKg: number; ispS: number; solarRadAreaM2?: number; solarRadCoeff?: number };
}

/**
 * OPM data of a flight: the state at the start of the flight and its maneuvers.
 * A maneuver in an inertial frame, or in a local frame that refers to the centre of the message, keeps its frame.
 * A maneuver in a local frame that refers to a different body is converted to the ICRF with a propagation of the
 * flight. A maneuver with a velocity change of zero is not in the message (its change of mass is not negative).
 * The message has no force model and no anchor states (Maneuver.anchor).
 */
export function opmFromFlight(sys: SolarSystem, flight: Flight, opts: OpmFromFlightOptions): Opm {
  if (!sys.hasBody(opts.center)) throw new IoError('opm.center', undefined, opts.center);
  // The epoch of a message is before its maneuvers: a flight that goes backward in time has no message.
  if (flight.etEnd < flight.et0) throw new IoError('opm.backward');
  const c = sys.state(opts.center, flight.et0);
  const s0 = flight.state0;
  const state = stateFromIcrf({ r: [s0.r[0] - c.r[0], s0.r[1] - c.r[1], s0.r[2] - c.r[2]], v: [s0.v[0] - c.v[0], s0.v[1] - c.v[1], s0.v[2] - c.v[2]] }, opts.frame);
  const opm: Opm = {
    objectName: opts.objectName, objectId: opts.objectId, center: opts.center, frame: opts.frame, timeScale: opts.timeScale,
    et: flight.et0, state: { r: [...state.r] as Vec3, v: [...state.v] as Vec3 }, maneuvers: [],
  };
  if (opts.comments) opm.comments = [...opts.comments];
  const sc = opts.spacecraft;
  if (sc) {
    if (!(sc.massKg > 0) || !(sc.ispS > 0)) throw new IoError('opm.mass');
    const srp = flight.model.srp;
    opm.spacecraft = { massKg: sc.massKg };
    const area = sc.solarRadAreaM2 ?? (srp ? srp.areaToMass * sc.massKg : undefined);
    const coeff = sc.solarRadCoeff ?? srp?.cr;
    if (area !== undefined) opm.spacecraft.solarRadAreaM2 = area;
    if (coeff !== undefined) opm.spacecraft.solarRadCoeff = coeff;
  }
  const used = flight.maneuvers.filter((m) => m.et >= flight.et0 && m.et <= flight.etEnd && norm(m.dv) > 0).sort((a, b) => a.et - b.et);
  if (used.length === 0) return opm;
  if (!sc) throw new IoError('opm.mass');
  const local = (m: Maneuver): boolean => m.frame === 'VNB' || m.frame === 'RTN';
  // Velocity changes in the ICRF from a propagation, only if a maneuver needs it.
  const events = used.some((m) => local(m) && m.refBody !== opts.center) ? flyFlight(sys, flight).events.filter((e) => e.type === 'maneuver') : [];
  let mass = sc.massKg;
  for (const m of used) {
    let frame: LocalFrame = m.frame;
    let dv: Vec3 = [m.dv[0], m.dv[1], m.dv[2]];
    if (local(m) && m.refBody !== opts.center) {
      const e = events.find((ev) => ev.maneuverId === m.id && ev.et === m.et);
      if (!e?.dvIcrf) throw new IoError('opm.maneuver', undefined, m.id);
      frame = 'ICRF';
      dv = [e.dvIcrf[0], e.dvIcrf[1], e.dvIcrf[2]];
    }
    const after = mass * Math.exp((-norm(dv) * 1000) / (sc.ispS * G0));
    opm.maneuvers.push({ et: m.et, durationS: 0, deltaMassKg: after - mass, frame, dv });
    mass = after;
  }
  return opm;
}

/**
 * Flight from OPM data: start at the epoch of the message, impulsive maneuvers, the force model of the caller.
 * A local frame of a maneuver refers to the centre of the message. Maneuver ids: 'man1', 'man2', ...
 * Throws IoError('opm.finiteBurn') for a maneuver with a duration: Apsis has only impulsive maneuvers.
 */
export function flightFromOpm(sys: SolarSystem, opm: Opm, model: ForceModel, etEnd: number): Flight {
  if (!sys.hasBody(opm.center)) throw new IoError('opm.center', undefined, opm.center);
  const c = sys.state(opm.center, opm.et);
  const s = stateToIcrf(opm.state, opm.frame);
  const maneuvers = opm.maneuvers.map((m, k): Maneuver => {
    if (m.durationS !== 0) throw new IoError('opm.finiteBurn', undefined, String(k));
    return { id: 'man' + (k + 1), et: m.et, dv: [m.dv[0], m.dv[1], m.dv[2]], frame: m.frame, refBody: opm.center };
  });
  return {
    et0: opm.et,
    state0: { r: [s.r[0] + c.r[0], s.r[1] + c.r[1], s.r[2] + c.r[2]], v: [s.v[0] + c.v[0], s.v[1] + c.v[1], s.v[2] + c.v[2]] },
    etEnd, maneuvers, model,
  };
}
