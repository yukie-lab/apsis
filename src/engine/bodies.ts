/**
 * Body catalogue.
 * GM, radii and rotation: NAIF kernels gm_de440.tpc and pck00011.tpc (see data/constants.json).
 * J2: NASA NSSDC planetary fact sheets (Earth: IERS 2010 value from the JPL Horizons data sheet).
 * Ring radii: NSSDC Saturnian Rings Fact Sheet and Uranus Rings Fact Sheet.
 */
import constants from './data/constants.json';
import moonsData from './data/moons.json';

export type BodyKind = 'star' | 'planet' | 'dwarf' | 'moon' | 'asteroid' | 'comet';

export interface Body {
  id: string;
  naif: number;
  kind: BodyKind;
  /** Body that this body moves around. */
  parent: string | null;
  /** GM of the body alone, km^3/s^2. 0 for bodies with negligible mass in this application. */
  gm: number;
  /** GM of the body with its moons (planet systems). Equal to gm for other bodies. */
  gmSystem: number;
  /** Equatorial radius, km. */
  radius: number;
  /** Polar radius, km. */
  polarRadius: number;
  /** Second zonal harmonic. 0 if not modelled. */
  j2: number;
  /** IAU rotation model: pole right ascension and declination (deg, deg/century), prime meridian (deg, deg/day). */
  poleRa: number[];
  poleDec: number[];
  pm: number[];
  /** Default minimum flyby altitude, km (product decision: above atmosphere or rings). */
  minFlybyAltitude: number;
  /** Display colour (hex). */
  color: string;
  /** Rings: inner and outer radius, km. */
  rings?: { inner: number; outer: number };
}

type ConstBody = { gm?: number; radii?: number[]; poleRa?: number[]; poleDec?: number[]; pm?: number[] };
const CB = constants.bodies as Record<string, ConstBody>;

function make(
  id: string, naif: number, kind: BodyKind, parent: string | null, color: string,
  opt: { systemNaif?: number; j2?: number; minAlt?: number; rings?: { inner: number; outer: number }; radius?: number; gm?: number } = {},
): Body {
  const c = CB[String(naif)] ?? {};
  const radii = c.radii ?? [opt.radius ?? 1, opt.radius ?? 1, opt.radius ?? 1];
  const gm = c.gm ?? opt.gm ?? 0;
  const gmSystem = opt.systemNaif !== undefined ? CB[String(opt.systemNaif)].gm ?? gm : gm;
  return {
    id, naif, kind, parent, gm, gmSystem,
    radius: radii[0], polarRadius: radii[2],
    j2: opt.j2 ?? 0,
    poleRa: c.poleRa ?? [0, 0, 0], poleDec: c.poleDec ?? [90, 0, 0], pm: c.pm ?? [0, 0, 0],
    minFlybyAltitude: opt.minAlt ?? 0,
    color,
    rings: opt.rings,
  };
}

const list: Body[] = [
  make('SUN', 10, 'star', null, '#ffd27a', { minAlt: 3 * 695700 }),
  make('MERCURY', 199, 'planet', 'SUN', '#9c8f84', { systemNaif: 1, j2: 50.3e-6, minAlt: 200 }),
  make('VENUS', 299, 'planet', 'SUN', '#e6c58a', { systemNaif: 2, j2: 4.458e-6, minAlt: 250 }),
  make('EARTH', 399, 'planet', 'SUN', '#4f8fd6', { j2: 0.00108262545, minAlt: 300 }),
  make('MARS', 499, 'planet', 'SUN', '#c7623a', { systemNaif: 4, j2: 1960.45e-6, minAlt: 200 }),
  make('JUPITER', 599, 'planet', 'SUN', '#d2a679', { systemNaif: 5, j2: 14736e-6, minAlt: 200000 }),
  make('SATURN', 699, 'planet', 'SUN', '#e3cf9c', { systemNaif: 6, j2: 16298e-6, minAlt: 20000, rings: { inner: 74658, outer: 136780 } }),
  make('URANUS', 799, 'planet', 'SUN', '#a6dfe6', { systemNaif: 7, j2: 3343.43e-6, minAlt: 26000, rings: { inner: 41837, outer: 51149 } }),
  make('NEPTUNE', 899, 'planet', 'SUN', '#4f6fe0', { systemNaif: 8, j2: 3411e-6, minAlt: 4000 }),
  make('PLUTO', 999, 'dwarf', 'SUN', '#cdb08f', { systemNaif: 9, minAlt: 1000 }),
  make('MOON', 301, 'moon', 'EARTH', '#b9b6ae', { minAlt: 50 }),
  make('PHOBOS', 401, 'moon', 'MARS', '#8d8175'),
  make('DEIMOS', 402, 'moon', 'MARS', '#a59a8c'),
  make('IO', 501, 'moon', 'JUPITER', '#e8d36a', { minAlt: 100 }),
  make('EUROPA', 502, 'moon', 'JUPITER', '#d9c7a3', { minAlt: 50 }),
  make('GANYMEDE', 503, 'moon', 'JUPITER', '#a39683', { minAlt: 50 }),
  make('CALLISTO', 504, 'moon', 'JUPITER', '#6f6557', { minAlt: 50 }),
  make('MIMAS', 601, 'moon', 'SATURN', '#c9c9c9'),
  make('ENCELADUS', 602, 'moon', 'SATURN', '#f2f4f7', { minAlt: 25 }),
  make('TETHYS', 603, 'moon', 'SATURN', '#d9d9d9'),
  make('DIONE', 604, 'moon', 'SATURN', '#cfcfcf'),
  make('RHEA', 605, 'moon', 'SATURN', '#c6c2bb'),
  make('TITAN', 606, 'moon', 'SATURN', '#e0a34a', { minAlt: 950 }),
  make('IAPETUS', 608, 'moon', 'SATURN', '#9a8b76'),
  make('MIRANDA', 705, 'moon', 'URANUS', '#bdbdbd'),
  make('ARIEL', 701, 'moon', 'URANUS', '#cfcfcf'),
  make('UMBRIEL', 702, 'moon', 'URANUS', '#8a8a8a'),
  make('TITANIA', 703, 'moon', 'URANUS', '#c2b8ac'),
  make('OBERON', 704, 'moon', 'URANUS', '#a89a90'),
  make('TRITON', 801, 'moon', 'NEPTUNE', '#d6c3b8', { minAlt: 50 }),
  make('CHARON', 901, 'moon', 'PLUTO', '#9d9690'),
];

/**
 * Small bodies. Their ephemeris is public/data/small.bin. Mass is not modelled (gm = 0).
 * Mean radius (km): JPL Small-Body Database (values copied by tools/truth/fetch_small_info.py into data/small.json).
 */
import smallData from './data/small.json';
const meanRadius = new Set<string>();
const nominalRadius = new Set<string>();
for (const s of smallData.bodies as { id: string; naif: number; kind: BodyKind; radiusKm: number | null; gm: number; color: string }[]) {
  // A body with no radius in the database is drawn with a nominal radius of 10 km.
  list.push(make(s.id, s.naif, s.kind, 'SUN', s.color, { radius: s.radiusKm ?? 10, gm: s.gm, minAlt: 0 }));
  (s.radiusKm === null ? nominalRadius : meanRadius).add(s.id);
}
/** Bodies whose `radius` is the mean radius of the JPL Small-Body Database (all other bodies: the equatorial radius). */
export const MEAN_RADIUS: ReadonlySet<string> = meanRadius;
/** Bodies with no radius in the database: `radius` is a nominal value (10 km), not a measurement. */
export const NOMINAL_RADIUS: ReadonlySet<string> = nominalRadius;

const registry: Record<string, Body> = Object.fromEntries(list.map((b) => [b.id, b]));
/** All bodies by id. Custom bodies of the user are added with registerCustomBody. */
export const BODIES: Readonly<Record<string, Body>> = registry;
export const BODY_LIST: readonly Body[] = list;

/** Add (or replace) a body that the user defines by orbit elements. It has no mass. */
export function registerCustomBody(id: string, radiusKm = 1, color = '#9fb4c8'): Body {
  const old = registry[id];
  if (old && old.naif !== 0) throw new Error('The id is in use: ' + id);
  const b: Body = {
    id, naif: 0, kind: 'asteroid', parent: 'SUN', gm: 0, gmSystem: 0, radius: radiusKm, polarRadius: radiusKm, j2: 0,
    poleRa: [0, 0, 0], poleDec: [90, 0, 0], pm: [0, 0, 0], minFlybyAltitude: 0, color,
  };
  registry[id] = b;
  const k = list.findIndex((x) => x.id === id);
  if (k >= 0) list[k] = b; else list.push(b);
  return b;
}
export function removeCustomBody(id: string): void {
  if (registry[id]?.naif !== 0) return;
  delete registry[id];
  const k = list.findIndex((x) => x.id === id);
  if (k >= 0) list.splice(k, 1);
}
export const PLANET_IDS = ['MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'] as const;

export interface MoonModel {
  naif: number; center: string;
  poleRa: number; poleDec: number; a: number; e: number; inc: number;
  node0: number; nodeRate: number; peri0: number; periRate: number; L0: number; n: number;
  libAmp: number; libRate: number; libPhase: number;
  fitRmsKm: number; fitMaxKm: number;
}
export const MOON_MODELS = moonsData.bodies as Record<string, MoonModel>;

export const GM_SUN = BODIES.SUN.gm;
/** Astronomical unit, km (IAU 2012 Resolution B2, exact). */
export const AU = 149597870.7;
/** Speed of light, km/s (exact). */
export const C_LIGHT = 299792.458;
/** Standard gravity, m/s^2 (exact, used for specific impulse). */
export const G0 = 9.80665;
/** Nominal total solar irradiance at 1 au, W/m^2 (IAU 2015 Resolution B3). */
export const SOLAR_IRRADIANCE = 1361;

export function body(id: string): Body {
  const b = BODIES[id];
  if (!b) throw new Error('Unknown body: ' + id);
  return b;
}

/** Children of a body (moons of a planet, planets of the Sun). */
export function childrenOf(id: string): Body[] {
  return list.filter((b) => b.parent === id);
}
