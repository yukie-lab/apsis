/**
 * Source and accuracy of each kind of number that the application shows.
 *
 * The automatic tests write their measured errors to src/validation/measured/*.json. This module connects each
 * kind of number on the screen to the measurements that are its evidence. The texts are in the locale files:
 *   basis.<kind>.title / .method / .limit      what the number is, how it is calculated, its accuracy limit
 *   validation.item.<pattern>                  description of a measurement
 */
import { BODIES, MOON_MODELS } from '../engine/bodies';
import { FAMOUS } from '../engine/mission';
import { t, hasText, bodyName, bodyIn } from '../i18n';
import { auto } from './format';
import { system } from './system';

export interface Measurement {
  id: string;
  group: string;
  value: number;
  unit: string;
  limit: number;
  truth: string;
  detail?: Record<string, number | string>;
}

const files = import.meta.glob('../validation/measured/*.json', { eager: true }) as Record<string, { default: Measurement[] }>;
/** All measurements of the automatic tests, in the order of the files. */
export const MEASUREMENTS: Measurement[] = Object.keys(files).sort().flatMap((k) => files[k].default);
const BY_ID = new Map(MEASUREMENTS.map((m) => [m.id, m]));

export type BasisKind =
  | 'time' | 'frame' | 'const' | 'input' | 'file'
  | 'ephem.state' | 'ephem.elements' | 'ephem.derived'
  | 'twobody' | 'plan.c3' | 'plan.vinf' | 'plan.flyby' | 'plan.dv' | 'plan.time'
  | 'flight.state' | 'flight.encounter' | 'flight.dv' | 'flight.event' | 'flight.real' | 'flight.target' | 'flight.elements' | 'flight.force'
  | 'mass' | 'forensics' | 'tisserand' | 'optimizer';

/**
 * horizons: compared with JPL Horizons. analytic: compared with an exact solution. model: result of a model with
 * no direct comparison (its inputs are verified). input: a value that the user gave. constant: a published constant.
 */
export type BasisStatus = 'horizons' | 'analytic' | 'model' | 'input' | 'constant';

export interface BasisContext { body?: string; famousId?: string | null }
export interface Basis {
  kind: BasisKind;
  status: BasisStatus;
  title: string;
  method: string;
  limit: string;
  /** Measurements that are the evidence, most relevant first. */
  evidence: Measurement[];
  /** Number of other measurements of the same kind (shown on the Accuracy screen). */
  more: number;
}

const OUTER = ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'];
const startsWith = (...prefixes: string[]) => MEASUREMENTS.filter((m) => prefixes.some((p) => m.id.startsWith(p)));
const pick = (...ids: string[]) => ids.map((id) => BY_ID.get(id)).filter((m): m is Measurement => !!m);
/** Margin used: measured value divided by the test limit. The largest values are the most interesting evidence. */
const byMargin = (a: Measurement, b: Measurement) => (b.limit > 0 ? b.value / b.limit : 0) - (a.limit > 0 ? a.value / a.limit : 0);

function ephemEvidence(body?: string): { list: Measurement[]; status: BasisStatus; variant: string } {
  if (!body) return { list: startsWith('ephemeris.').sort(byMargin), status: 'horizons', variant: 'planet' };
  if (system().custom.has(body)) return { list: [], status: 'input', variant: 'custom' };
  if (MOON_MODELS[body]) return { list: pick('moon.' + body), status: 'horizons', variant: 'moon' };
  if (BODIES[body]?.parent === 'SUN' && system().small?.has(body)) return { list: pick('small.' + body), status: 'horizons', variant: 'small' };
  if (OUTER.includes(body)) return { list: pick('ephemeris.' + body, 'ephemeris.' + body + '_BARYCENTER'), status: 'horizons', variant: 'centre' };
  return { list: pick('ephemeris.' + body), status: 'horizons', variant: 'planet' };
}

function build(kind: BasisKind, ctx: BasisContext): { list: Measurement[]; status: BasisStatus; variant?: string } {
  switch (kind) {
    case 'time': return { list: pick('time.utcTdb'), status: 'horizons' };
    case 'frame': return { list: pick('frames.ecliptic', 'frames.heliocentric'), status: 'horizons' };
    case 'const': return { list: [], status: 'constant' };
    case 'input': return { list: [], status: 'input' };
    case 'file': return { list: [], status: 'input' };
    case 'ephem.state': return ephemEvidence(ctx.body);
    case 'ephem.derived': return ephemEvidence(ctx.body);
    case 'ephem.elements': { const e = ephemEvidence(ctx.body); return { ...e, list: [...pick('frames.elements'), ...e.list] }; }
    case 'twobody': return { list: pick('analytic.hohmann', 'lambert.consistency', 'tisserand.hohmann'), status: 'analytic' };
    case 'plan.c3': return { list: startsWith('window.').sort(byMargin), status: 'horizons' };
    case 'plan.vinf': return { list: MEASUREMENTS.filter((m) => /\.conic\.(vinf|mismatch)\./.test(m.id)).sort(byMargin), status: 'horizons' };
    case 'plan.flyby': return { list: MEASUREMENTS.filter((m) => /\.conic\.periapsis\./.test(m.id)).sort(byMargin), status: 'horizons' };
    case 'plan.dv': return { list: [...pick('analytic.hohmann', 'missions.cassini.conic.dsm'), ...startsWith('window.c3.').sort(byMargin)], status: 'model' };
    case 'plan.time': return { list: [], status: 'input' };
    case 'optimizer': return { list: pick('quick.solved', 'window.mars2020.porkchop', 'window.mars2020.period'), status: 'model' };
    case 'flight.state': return { list: [...startsWith('propagation.asteroid.', 'propagation.spacecraft.').sort(byMargin), ...pick('integrator.kepler10', 'integrator.order')], status: 'horizons' };
    case 'flight.encounter': {
      const mine = ctx.famousId ? MEASUREMENTS.filter((m) => m.id.startsWith('famous.') && m.id.split('.')[2] === ctx.famousId && (!ctx.body || m.id.endsWith('.' + ctx.body))) : [];
      const all = [...startsWith('propagation.flyby.'), ...startsWith('famous.vinf.', 'famous.periapsis.')].sort(byMargin);
      return { list: [...mine, ...all.filter((m) => !mine.includes(m))], status: 'horizons' };
    }
    case 'flight.event': return { list: [...startsWith('missions.voyager2.time.'), ...pick('famous.newhorizons.time.PLUTO', 'famous.mars2020.arrival')].sort(byMargin), status: 'horizons' };
    case 'flight.dv': {
      const mine = ctx.famousId ? pick('famous.corrections.' + ctx.famousId, 'famous.dsm.' + ctx.famousId, 'famous.capture.' + ctx.famousId) : [];
      const all = [...startsWith('famous.corrections.', 'famous.dsm.', 'famous.capture.'), ...pick('famous.cassini.realCorrections', 'quick.solved')];
      return { list: [...mine, ...all.filter((m) => !mine.includes(m))], status: 'model' };
    }
    case 'flight.target': return { list: pick('target.closure', 'target.closureDistant', 'target.closureInsertion', 'target.bplane'), status: 'model' };
    case 'flight.elements': return { list: pick('frames.elements'), status: 'model' };
    case 'flight.force': return { list: [...startsWith('propagation.asteroid.').sort(byMargin).slice(0, 2), ...startsWith('propagation.spacecraft.').sort(byMargin)], status: 'model' };
    case 'flight.real': return { list: startsWith('famous.').filter((m) => !ctx.famousId || m.id.split('.').includes(ctx.famousId)).sort(byMargin), status: 'horizons' };
    case 'mass': return { list: [], status: 'model' };
    case 'forensics': return { list: startsWith('forensics.'), status: 'horizons' };
    case 'tisserand': return { list: startsWith('tisserand.'), status: 'analytic' };
  }
}

const SHOWN = 4;

/** Source and accuracy of a kind of number. */
export function basis(kind: BasisKind, ctx: BasisContext = {}): Basis {
  const b = build(kind, ctx);
  const key = (part: string): string => {
    const withVariant = `basis.${kind}.${part}_${b.variant ?? ''}`;
    return hasText(withVariant) ? t(withVariant) : t(`basis.${kind}.${part}`);
  };
  return {
    kind, status: b.status, title: key('title'), method: key('method'), limit: key('limit'),
    evidence: b.list.slice(0, SHOWN), more: Math.max(0, b.list.length - SHOWN),
  };
}

// ------------------------------------------------------------------------------------- measurement texts

const craftName = (id: string): string => FAMOUS.find((f) => f.id === id)?.name ?? (hasText('spacecraft.' + id) ? t('spacecraft.' + id) : id);
const nth = (k: string | undefined): string => (k === undefined ? '' : String(Number(k) + 1));

type Vars = Record<string, string>;
const PATTERNS: [RegExp, string, (m: RegExpExecArray) => Vars][] = [
  [/^ephemeris\.(\w+)$/, 'ephemeris', (m) => ({ body: bodyName(m[1]) })],
  [/^moon\.(\w+)$/, 'moon', (m) => ({ body: bodyName(m[1]), parent: bodyName(BODIES[m[1]]?.parent ?? '') })],
  [/^small\.(\w+)$/, 'small', (m) => ({ body: bodyName(m[1]) })],
  [/^famous\.vinf\.(\w+)\.(\d+)\.(\w+)$/, 'flightVinf', (m) => ({ craft: craftName(m[1]), n: nth(m[2]), body: bodyIn(m[3]) })],
  [/^famous\.periapsis\.(\w+)\.(\d+)\.(\w+)$/, 'flightPeriapsis', (m) => ({ craft: craftName(m[1]), n: nth(m[2]), body: bodyIn(m[3]) })],
  [/^famous\.corrections\.(\w+)$/, 'corrections', (m) => ({ craft: craftName(m[1]) })],
  [/^missions\.(\w+)\.nbody\.corrections$/, 'corrections', (m) => ({ craft: craftName(m[1]) })],
  [/^famous\.dsm\.(\w+)$/, 'dsm', (m) => ({ craft: craftName(m[1]) })],
  [/^missions\.(\w+)\.nbody\.dsm$/, 'dsmNbody', (m) => ({ craft: craftName(m[1]) })],
  [/^missions\.(\w+)\.conic\.dsm$/, 'dsmConic', (m) => ({ craft: craftName(m[1]) })],
  [/^famous\.capture\.(\w+)$/, 'capture', (m) => ({ craft: craftName(m[1]) })],
  [/^missions\.(\w+)\.time\.(\w+)$/, 'encounterTime', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[2]) })],
  [/^missions\.(\w+)\.conic\.mismatch\.(?:(\d+)\.)?(\w+)$/, 'conicMismatch', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^missions\.(\w+)\.conic\.vinf\.(?:(\d+)\.)?(\w+)$/, 'conicVinf', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^missions\.(\w+)\.conic\.periapsis\.(?:(\d+)\.)?(\w+)$/, 'conicPeriapsis', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^missions\.(\w+)\.nbody\.vinf\.(?:(\d+)\.)?(\w+)$/, 'nbodyVinf', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^missions\.(\w+)\.nbody\.periapsis\.(?:(\d+)\.)?(\w+)$/, 'nbodyPeriapsis', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^missions\.(\w+)\.nbody\.published\.(?:(\d+)\.)?(\w+)$/, 'nbodyPublished', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^propagation\.asteroid\.(\w+)$/, 'propAsteroid', (m) => ({ body: bodyName(m[1]) })],
  [/^propagation\.spacecraft\.([a-z0-9]+?)_(\d{4})_(\d{4})$/, 'propSpacecraft', (m) => ({ craft: craftName(m[1]), from: m[2], to: m[3] })],
  [/^propagation\.spacecraft\.([a-z0-9]+?)_cruise$/, 'propSpacecraftCruise', (m) => ({ craft: craftName(m[1]) })],
  [/^propagation\.flyby\.(\w+)\.(\d+)\.(\w+)$/, 'propFlyby', (m) => ({ craft: craftName(m[1]), body: bodyIn(m[3]) })],
  [/^window\.c3\.(\w+)$/, 'windowC3', (m) => ({ craft: craftName(m[1]) })],
  [/^famous\.newhorizons\.published\.(\w+)$/, 'publishedDistance', (m) => ({ craft: craftName('newhorizons'), body: bodyIn(m[1]) })],
];

/** Description of a measurement in the language of the user. */
export function describeMeasurement(m: Measurement): string {
  const direct = 'validation.item.' + m.id.replace(/\./g, '_');
  if (hasText(direct)) return t(direct);
  for (const [re, key, vars] of PATTERNS) {
    const hit = re.exec(m.id);
    if (hit) return t('validation.item.' + key, vars(hit));
  }
  return m.id;
}
/** Where the reference value of a measurement comes from. A locale can replace the text of the test file. */
export function truthSource(m: Measurement): string {
  const key = 'validation.truth.' + m.id.replace(/\./g, '_');
  return hasText(key) ? t(key) : m.truth;
}
/** Measured value and limit as text with the unit. */
export function measuredText(m: Measurement): { value: string; limit: string; unit: string } {
  const unit = hasText('validation.unit.' + m.unit) ? t('validation.unit.' + m.unit) : m.unit;
  return { value: auto(m.value), limit: auto(m.limit), unit };
}
export function measurement(id: string): Measurement | undefined { return BY_ID.get(id); }
