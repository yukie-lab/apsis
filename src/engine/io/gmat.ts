/**
 * Script for the General Mission Analysis Tool (GMAT) of NASA that makes a flight of Apsis again. Write only.
 * Source: GMAT User Guide R2015a (the only edition that was available), reference pages Spacecraft, CoordinateSystem,
 * ForceModel (Propagator), ImpulsiveBurn, ReportFile, EphemerisFile, and the commands Propagate and Maneuver.
 * The script uses only fields of those pages. It was not run in GMAT.
 *
 * Contents of the script, in this order:
 *   optional SolarSystem.EphemerisSource, GM of the bodies of the force model (field Mu),
 *   a coordinate system with its origin at the Sun, a Spacecraft (epoch: TDB, modified Julian date of GMAT;
 *   Cartesian state), a ForceModel (central body Sun, point masses), a Propagator (PrinceDormand78),
 *   one ImpulsiveBurn for each maneuver (components in the axes of the coordinate system),
 *   a ReportFile and an EphemerisFile, and the mission sequence (Propagate, Maneuver, ..., Propagate).
 *
 * Axes. The guide has two sets of inertial axes, MJ2000Eq and ICRF. It says that the rotation between them changes
 * with time, and that the difference of a vector is less than 1 m at the surface of the Earth (an angle below
 * 1.6e-7 rad, which is 23 km at 1 au). The guide does not say in which axes GMAT uses the vectors of its planetary
 * ephemeris. This module assumes that GMAT uses them as MJ2000Eq vectors with no rotation. This assumption is not
 * verified. With it, the numbers of Apsis (ICRF vectors of the JPL ephemeris) go into the GMAT axes MJ2000Eq
 * (default). The option `axes: 'ICRF'` uses the GMAT axes ICRF.
 *
 * Parts of the Apsis force model that the script does not have are in the list of gmatDifferences().
 */
import type { SolarSystem } from '../system';
import { type Flight, flyFlight } from '../flight';
import { type ForceModel, type Maneuver, type Trajectory, Propagator, PLANET_GRAVITY_BODIES } from '../propagate';
import { toIcrf } from '../frames';
import { DAY, etToTai } from '../time';
import { type Vec3, norm } from '../vec';
import { AU, BODIES, SOLAR_IRRADIANCE } from '../bodies';
import { IoError, asciiText } from './types';

export interface GmatScriptInput {
  sys: SolarSystem;
  /** The flight must go forward in time. */
  flight: Flight;
  /** Trajectory of the flight, if the caller has it. It gives the velocity change of a maneuver in a local frame. */
  trajectory?: Trajectory;
  /** Text for comment lines at the start of the script. */
  comments?: string[];
  /** Name of the Spacecraft resource: letters, digits and '_', first a letter (default 'Sat'). */
  spacecraftName?: string;
  /** Mass of the spacecraft, kg (default 1000). GMAT uses it only for solar radiation pressure. */
  massKg?: number;
  /** GMAT axes for the numbers of Apsis (default 'MJ2000Eq'; see the file comment). */
  axes?: 'MJ2000Eq' | 'ICRF';
  /** Value for SolarSystem.EphemerisSource, for example 'DE421'. Default: no line (GMAT then uses its default). */
  ephemerisSource?: string;
  /** If true (default), the script sets the GM of each body of the force model to the value of Apsis. */
  setGm?: boolean;
  /** Output of the script: a ReportFile, an EphemerisFile (CCSDS OEM), or the two (default). */
  output?: 'report' | 'oem' | 'both';
  /** File name of the ReportFile (default 'apsis_report.txt'). */
  reportFile?: string;
  /** File name of the EphemerisFile (default 'apsis_ephemeris.oem'). */
  ephemerisFile?: string;
}

/** Apsis body id to the name of the GMAT celestial body. */
const GMAT_BODY: Record<string, string> = {
  SUN: 'Sun', MERCURY: 'Mercury', VENUS: 'Venus', EARTH: 'Earth', MOON: 'Luna', MARS: 'Mars', JUPITER: 'Jupiter',
  SATURN: 'Saturn', URANUS: 'Uranus', NEPTUNE: 'Neptune', PLUTO: 'Pluto',
};
/** Modified Julian date of GMAT (Julian date - 2430000.0) at J2000. */
const GMAT_MJD_J2000 = 21545;
/** Limits of a GMAT epoch, modified Julian date of GMAT (1957-10-04 12:00 and 2100-02-28 00:00). */
const GMAT_MJD_LIMITS: [number, number] = [6116, 58127.5];
/** Names that the script uses, and names of GMAT that a resource must not have (compared with no difference of case). */
const RESERVED = new Set([
  'forces', 'prop', 'statereport', 'stateephemeris', 'sunmj2000eq', 'sunicrf', 'solarsystem', 'solarsystembarycenter',
  'earthmj2000eq', 'earthmj2000ec', 'earthfixed', 'earthicrf', 'gmat', 'create', 'propagate', 'maneuver', 'report',
  'beginmissionsequence', 'luna', ...Object.values(GMAT_BODY).map((n) => n.toLowerCase()),
]);

const maneuverIsLocal = (m: Maneuver): boolean => m.frame === 'VNB' || m.frame === 'RTN';

/** Solar radiation pressure of a force model, or null if it gives no force (off, or a coefficient or an area of zero). */
function activeSrp(model: ForceModel): { areaToMass: number; cr: number } | null {
  return model.srp && model.srp.cr * model.srp.areaToMass !== 0 ? model.srp : null;
}

/** Maneuvers that the propagation of the flight applies, in the order of time. */
function usedManeuvers(flight: Flight): Maneuver[] {
  return flight.maneuvers.filter((m) => m.et >= flight.et0 && m.et <= flight.etEnd).sort((a, b) => a.et - b.et);
}

/**
 * Differences between the flight in Apsis and the flight that the script makes in GMAT, as machine codes:
 *  gmat.ephemeris    positions of the bodies come from the ephemeris of GMAT, not from the data of Apsis (DE440)
 *  gmat.j2           the oblateness of the planets is not in the script
 *  gmat.moons        the large moons as separate masses are not in the script
 *  gmat.smallBodies  bodies of the force model that GMAT does not have (Ceres, Vesta, Psyche)
 *  gmat.reducedModel the force model does not have all the planets: Apsis integrates relative to the barycentre of
 *                    the solar system (the Sun moves as in the ephemeris), GMAT integrates relative to the Sun
 *  gmat.srp          solar radiation pressure: the model of GMAT is not the same code (shadow)
 *  gmat.relativity   relativistic correction: the model of GMAT is not the same code
 *  gmat.anchors      a maneuver has an anchor state (Maneuver.anchor): GMAT continues from its own state
 */
export function gmatDifferences(input: Pick<GmatScriptInput, 'sys' | 'flight'>): string[] {
  const { sys, flight } = input;
  const model = flight.model;
  const active = new Propagator(sys, { ...model, moons: false }).bodyIds;
  const out = ['gmat.ephemeris'];
  if (model.j2 && active.some((id) => BODIES[id].j2 !== 0)) out.push('gmat.j2');
  if (model.moons) out.push('gmat.moons');
  if (active.some((id) => !GMAT_BODY[id])) out.push('gmat.smallBodies');
  if (PLANET_GRAVITY_BODIES.some((id) => !active.includes(id))) out.push('gmat.reducedModel');
  if (activeSrp(model)) out.push('gmat.srp');
  if (model.relativity) out.push('gmat.relativity');
  if (usedManeuvers(flight).some((m) => m.anchor)) out.push('gmat.anchors');
  return out;
}

/**
 * GMAT script of a flight. The text of the comment lines comes from the caller; the script has no other sentences.
 * Errors: gmat.backward (the flight goes backward in time), gmat.epoch (a time is out of the range of GMAT),
 * gmat.model (the force model has no Sun), gmat.option, gmat.fileName, gmat.number, gmat.maneuver (no velocity
 * change is known for a maneuver in a local frame), gmat.srpRange (GMAT does not accept the coefficient or the area
 * of the solar radiation pressure).
 */
export function writeGmatScript(input: GmatScriptInput): string {
  const { sys, flight } = input;
  const model = flight.model;
  if (!(flight.etEnd >= flight.et0)) throw new IoError('gmat.backward');
  const numbers = [flight.et0, flight.etEnd, ...flight.state0.r, ...flight.state0.v];
  if (!numbers.every(Number.isFinite)) throw new IoError('gmat.number');
  const mjd = (et: number): number => GMAT_MJD_J2000 + et / DAY;
  for (const t of [flight.et0, flight.etEnd]) {
    if (mjd(t) < GMAT_MJD_LIMITS[0] || mjd(t) > GMAT_MJD_LIMITS[1]) throw new IoError('gmat.epoch');
  }
  const axes = input.axes ?? 'MJ2000Eq';
  const output = input.output ?? 'both';
  const mass = input.massKg ?? 1000;
  if ((axes !== 'MJ2000Eq' && axes !== 'ICRF') || !['report', 'oem', 'both'].includes(output) || !(mass > 0) || !Number.isFinite(mass)) throw new IoError('gmat.option');
  if (input.ephemerisSource !== undefined && !/^[A-Za-z0-9_]+$/.test(input.ephemerisSource)) throw new IoError('gmat.option', undefined, 'ephemerisSource');
  const srp = activeSrp(model);
  // Limits of the Spacecraft fields in the guide: 0 <= Cr <= 2.0 and SRPArea > 0.
  if (srp && (!(srp.cr > 0 && srp.cr <= 2) || !(srp.areaToMass > 0) || !Number.isFinite(srp.areaToMass * mass))) throw new IoError('gmat.srpRange');
  const fileName = (name: string): string => {
    // A file name in the script: printable ASCII with no quote and no comment character.
    if (name === '' || /[^\x20-\x7e]|['%]/.test(name)) throw new IoError('gmat.fileName', undefined, asciiText(name));
    return name;
  };
  const reportFile = fileName(input.reportFile ?? 'apsis_report.txt');
  const ephemerisFile = fileName(input.ephemerisFile ?? 'apsis_ephemeris.oem');

  // Bodies of the force model that GMAT has. The moons option is off: the script has each planet system as one mass.
  const prop = new Propagator(sys, { ...model, moons: false });
  const bodies = prop.bodyIds.filter((id) => GMAT_BODY[id]);
  if (!bodies.includes('SUN')) throw new IoError('gmat.model');

  // Maneuvers: velocity change in the ICRF axes.
  const maneuvers = usedManeuvers(flight);
  let events = input.trajectory?.events ?? null;
  const burns = maneuvers.map((m): { et: number; dv: Vec3 } => {
    if (!maneuverIsLocal(m)) {
      const dv = toIcrf([m.dv[0], m.dv[1], m.dv[2]], m.frame as 'ICRF' | 'ECLIPJ2000');
      if (!dv.every(Number.isFinite)) throw new IoError('gmat.number', undefined, m.id);
      return { et: m.et, dv };
    }
    events ??= flyFlight(sys, flight).events;
    const e = events.find((ev) => ev.type === 'maneuver' && ev.maneuverId === m.id && ev.et === m.et);
    if (!e?.dvIcrf || !e.dvIcrf.every(Number.isFinite)) throw new IoError('gmat.maneuver', undefined, m.id);
    return { et: m.et, dv: [e.dvIcrf[0], e.dvIcrf[1], e.dvIcrf[2]] };
  }).filter((b) => norm(b.dv) > 0); // a maneuver with no velocity change is not in the script

  const named = input.spacecraftName ?? 'Sat';
  const sat = /^[A-Za-z][A-Za-z0-9_]*$/.test(named) && !RESERVED.has(named.toLowerCase()) && !/^burn\d+$/i.test(named) ? named : 'Sat';
  const cs = axes === 'ICRF' ? 'SunICRF' : 'SunMJ2000Eq';
  const sun = sys.state('SUN', flight.et0);
  const s0 = flight.state0;
  const rel = [s0.r[0] - sun.r[0], s0.r[1] - sun.r[1], s0.r[2] - sun.r[2], s0.v[0] - sun.v[0], s0.v[1] - sun.v[1], s0.v[2] - sun.v[2]];

  const out: string[] = [];
  for (const text of input.comments ?? []) for (const part of text.split(/\r\n|\n|\r/)) out.push(('% ' + asciiText(part)).trimEnd());
  if (out.length > 0) out.push('');
  if (input.ephemerisSource !== undefined) out.push(`GMAT SolarSystem.EphemerisSource = '${input.ephemerisSource}';`);
  if (input.setGm !== false) for (const id of bodies) out.push(`GMAT ${GMAT_BODY[id]}.Mu = ${prop.gmOf(id)};`);
  if (out.length > 0 && out[out.length - 1] !== '') out.push('');
  out.push(
    `Create CoordinateSystem ${cs};`,
    `GMAT ${cs}.Origin = Sun;`,
    `GMAT ${cs}.Axes = ${axes};`,
    '',
    `Create Spacecraft ${sat};`,
    `GMAT ${sat}.DateFormat = TDBModJulian;`,
    // 11 decimals of a day: 0.9 microsecond
    `GMAT ${sat}.Epoch = '${mjd(flight.et0).toFixed(11)}';`,
    `GMAT ${sat}.CoordinateSystem = ${cs};`,
    `GMAT ${sat}.DisplayStateType = Cartesian;`,
    ...['X', 'Y', 'Z', 'VX', 'VY', 'VZ'].map((k, i) => `GMAT ${sat}.${k} = ${rel[i]};`),
  );
  if (srp) {
    out.push(`GMAT ${sat}.DryMass = ${mass};`, `GMAT ${sat}.Cr = ${srp.cr};`, `GMAT ${sat}.SRPArea = ${srp.areaToMass * mass};`);
  }
  out.push(
    '',
    'Create ForceModel Forces;',
    'GMAT Forces.CentralBody = Sun;',
    `GMAT Forces.PointMasses = {${bodies.map((id) => GMAT_BODY[id]).join(', ')}};`,
    `GMAT Forces.RelativisticCorrection = ${model.relativity ? 'On' : 'Off'};`,
    `GMAT Forces.SRP = ${srp ? 'On' : 'Off'};`,
  );
  if (srp) out.push(`GMAT Forces.SRP.Flux = ${SOLAR_IRRADIANCE};`, `GMAT Forces.SRP.Nominal_Sun = ${AU};`);
  out.push(
    'GMAT Forces.ErrorControl = RSSStep;',
    '',
    'Create Propagator Prop;',
    'GMAT Prop.FM = Forces;',
    'GMAT Prop.Type = PrinceDormand78;',
    'GMAT Prop.InitialStepSize = 60;',
    'GMAT Prop.Accuracy = 1e-12;',
    'GMAT Prop.MaxStep = 86400;',
    'GMAT Prop.MaxStepAttempts = 50;',
    'GMAT Prop.StopIfAccuracyIsViolated = true;',
  );
  burns.forEach((b, k) => {
    out.push(
      '',
      `Create ImpulsiveBurn Burn${k + 1};`,
      `GMAT Burn${k + 1}.CoordinateSystem = ${cs};`,
      `GMAT Burn${k + 1}.Element1 = ${b.dv[0]};`,
      `GMAT Burn${k + 1}.Element2 = ${b.dv[1]};`,
      `GMAT Burn${k + 1}.Element3 = ${b.dv[2]};`,
      `GMAT Burn${k + 1}.DecrementMass = false;`,
    );
  });
  if (output !== 'oem') {
    out.push(
      '',
      'Create ReportFile StateReport;',
      `GMAT StateReport.Filename = '${reportFile}';`,
      'GMAT StateReport.Precision = 16;',
      `GMAT StateReport.Add = {${sat}.TDBModJulian, ${['X', 'Y', 'Z', 'VX', 'VY', 'VZ'].map((k) => `${sat}.${cs}.${k}`).join(', ')}};`,
      'GMAT StateReport.WriteHeaders = true;',
    );
  }
  if (output !== 'report') {
    out.push(
      '',
      'Create EphemerisFile StateEphemeris;',
      `GMAT StateEphemeris.Spacecraft = ${sat};`,
      `GMAT StateEphemeris.Filename = '${ephemerisFile}';`,
      'GMAT StateEphemeris.FileFormat = CCSDS-OEM;',
      'GMAT StateEphemeris.EpochFormat = UTCGregorian;',
      `GMAT StateEphemeris.CoordinateSystem = ${cs};`,
    );
  }

  // Mission sequence. The length of a Propagate command is in seconds of TAI (the elapsed time of GMAT).
  out.push('', 'BeginMissionSequence;');
  let t = flight.et0;
  const coast = (to: number): void => {
    const seconds = etToTai(to) - etToTai(t);
    if (seconds > 0) out.push(`Propagate Prop(${sat}) {${sat}.ElapsedSecs = ${seconds}};`);
    t = to;
  };
  burns.forEach((b, k) => {
    coast(b.et);
    out.push(`Maneuver Burn${k + 1}(${sat});`);
  });
  coast(flight.etEnd);
  return out.join('\n') + '\n';
}
