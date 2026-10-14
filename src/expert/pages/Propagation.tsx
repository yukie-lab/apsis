/**
 * Propagation screen: the start state and the force model of the flight, the state at the time of the view, and
 * comparison flights that show the effect of each force and the numerical error of the integration.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp, nowEt } from '../../app/store';
import { clock, useClock } from '../../app/clock';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { t, bodyName, bodyIn, sentences } from '../../i18n';
import { newFlightMission, DEFAULT_SPACECRAFT, type Mission } from '../../engine/mission';
import type { Flight } from '../../engine/flight';
import { ALL_GRAVITY_BODIES, PLANET_GRAVITY_BODIES, FULL_MODEL, type ForceModel, type Maneuver, type Trajectory } from '../../engine/propagate';
import { stateFromIcrf, stateToIcrf, type FrameId } from '../../engine/frames';
import { elementsFromState, stateFromElements, apsides, period } from '../../engine/kepler';
import { AU, BODIES } from '../../engine/bodies';
import { type State, type Vec3, add, norm, dist } from '../../engine/vec';
import { DAY, formatEt } from '../../engine/time';
import { distance, speed, duration, fixed, angleDeg, sci, sig, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { Field, NumberInput, DateInput, Panel, Seg, Check } from '../../ui/controls';
import { COLORS } from '../../ui/canvas';
import { PageHead, Empty, ViewTime, scRel, centerGm } from '../common';
import { FlightPlot } from '../FlightPlot';
import { DiffChart } from '../DiffChart';
import { useDrafts, type ForceStudy, type StudyRow } from '../drafts';

const DEG = Math.PI / 180;
const num = (text: string, unit = ''): Quantity => ({ text, unit });
const strip = ({ anchor: _a, ...m }: Maneuver): Maneuver => m;
/** Relative tolerance of the flights of the application, and the larger tolerances of the comparison. */
const RTOL = 1e-13;
const TOLERANCES = [1e-10, 1e-11, 1e-12];
const SAMPLES = 480;

/** Values of the fields: the flight with no maneuvers, and the data for the radiation pressure. */
interface Draft { et0: number; state0: State; etEnd: number; model: ForceModel; area: number; cr: number }

const sameState = (a: State, b: State): boolean => a.r.every((x, k) => x === b.r[k]) && a.v.every((x, k) => x === b.v[k]);
function sameModel(a: ForceModel, b: ForceModel): boolean {
  if (a.moons !== b.moons || a.j2 !== b.j2 || a.relativity !== b.relativity) return false;
  if (a.bodies.length !== b.bodies.length || !a.bodies.every((x) => b.bodies.includes(x))) return false;
  if (!a.srp || !b.srp) return a.srp === b.srp;
  return a.srp.areaToMass === b.srp.areaToMass && a.srp.cr === b.srp.cr;
}
function draftOf(flight: Flight, mission: Mission): Draft {
  const sc = mission.spacecraft;
  const srp = flight.model.srp;
  return { et0: flight.et0, state0: flight.state0, etEnd: flight.etEnd, model: flight.model, area: srp ? srp.areaToMass * (sc.dryMassKg + sc.propellantKg) : sc.srpAreaM2, cr: srp ? srp.cr : sc.cr };
}

/** Example start state (relative to the SSB, ICRF) and flight time for a new flight about a center. */
function example(center: string, frame: FrameId, et: number): { state0: State; tof: number } {
  const sys = system();
  const cov = center === 'SSB' ? null : sys.coverage(center);
  const id = !cov || et < cov[0] || et > cov[1] || !(BODIES[center]?.gmSystem > 0) ? 'SUN' : center;
  const b = BODIES[id];
  const sun = id === 'SUN';
  const rp = sun ? AU : b.radius + Math.max(300, 0.1 * b.radius);
  const e = sun ? 0.25 : 0;
  const rel = stateToIcrf(stateFromElements({ p: rp * (1 + e), e, i: (sun ? 3 : 30) * DEG, raan: 0, argp: 0, nu: 0 }, b.gmSystem), frame);
  const c = sys.state(id, et);
  return { state0: { r: add(rel.r, c.r), v: add(rel.v, c.v) }, tof: sun ? 400 * DAY : Math.max(DAY, 10 * period(rp, b.gmSystem)) };
}

function StartPanel({ draft, onChange, children }: { draft: Draft; onChange: (d: Draft) => void; children?: ReactNode }) {
  const s = useApp((x) => x.settings);
  const fail = useApp((x) => x.fail);
  const sys = system();
  const [form, setForm] = useState<'cartesian' | 'elements'>('cartesian');
  const cov = s.center === 'SSB' ? [-Infinity, Infinity] : sys.coverage(s.center);
  const inRange = (et: number): boolean => et >= Math.max(cov[0], sys.etStart) && et <= Math.min(cov[1], sys.etEnd);
  const centerAt = (et: number): State => (s.center === 'SSB' ? { r: [0, 0, 0], v: [0, 0, 0] } : sys.state(s.center, et));
  const toSsb = (x: State, et: number): State => { const i = stateToIcrf(x, s.frame), c = centerAt(et); return { r: add(i.r, c.r), v: add(i.v, c.v) }; };
  const rel = inRange(draft.et0) ? stateFromIcrf(scRel(draft.state0, s.center, draft.et0), s.frame) : null;
  const setRel = (x: State) => onChange({ ...draft, state0: toSsb(x, draft.et0) });
  /** The numbers in the fields stay: the state relative to the center is the same at the new time. */
  const setEpoch = (et: number) => onChange({ ...draft, et0: et, etEnd: Math.min(sys.etEnd, et + (draft.etEnd - draft.et0)), state0: rel && inRange(et) ? toSsb(rel, et) : draft.state0 });
  const component = (part: 'r' | 'v', k: number, v: number) => {
    if (!rel) return;
    const x: State = { r: [...rel.r] as Vec3, v: [...rel.v] as Vec3 };
    x[part][k] = v;
    setRel(x);
  };
  const mu = centerGm(s.center);
  const el = rel && mu > 0 ? elementsFromState(rel, mu) : null;
  const rp = el ? el.p / (1 + el.e) : NaN;
  const setElement = (p: Partial<Record<'rp' | 'e' | 'i' | 'raan' | 'argp' | 'nu', number>>) => {
    if (!el) return;
    const n = { rp, e: el.e, i: el.i, raan: el.raan, argp: el.argp, nu: el.nu, ...p };
    // A point on a hyperbola is between its two asymptotes.
    if (!(n.rp > 0) || !(n.e >= 0) || !(1 + n.e * Math.cos(n.nu) > 1e-9)) { fail('propagation:elements'); return; }
    setRel(stateFromElements({ p: n.rp * (1 + n.e), e: n.e, i: n.i, raan: n.raan, argp: n.argp, nu: n.nu }, mu));
  };
  const radius = BODIES[s.center]?.radius ?? 0;
  const r = rel ? norm(rel.r) : NaN;
  const axes = ['X', 'Y', 'Z'];
  const angle = (key: 'i' | 'raan' | 'argp' | 'nu', lo: number, hi: number) => (
    <Field label={t('el.' + key)}><NumberInput value={el![key] / DEG} unit="°" digits={7} min={lo} max={hi} onChange={(v) => setElement({ [key]: v * DEG })} /></Field>
  );
  return (
    <Panel title={<>{t('page.propagation.start')} <Src kind="input" /></>}>
      <Field label={t('page.propagation.epoch')}><DateInput et={draft.et0} compact min={sys.etStart} max={sys.etEnd - DAY} onChange={setEpoch} /></Field>
      <Field label={t('page.propagation.end')}><DateInput et={draft.etEnd} compact min={draft.et0 + 60} max={sys.etEnd} onChange={(etEnd) => onChange({ ...draft, etEnd })} /></Field>
      <div className="grid2">
        <Field label={t('page.propagation.tof')}>
          <NumberInput value={(draft.etEnd - draft.et0) / DAY} unit="d" digits={6} min={0.001} max={(sys.etEnd - draft.et0) / DAY} onChange={(d) => onChange({ ...draft, etEnd: draft.et0 + d * DAY })} />
        </Field>
        <Field label={t('page.propagation.form')}>
          <Seg value={form} onChange={setForm} options={[{ value: 'cartesian', label: t('page.propagation.cartesian') }, { value: 'elements', label: t('page.propagation.elements') }]} />
        </Field>
      </div>
      {!rel && <div className="banner warn">{t('error.propagation:center')}</div>}
      {rel && form === 'cartesian' && axes.map((a, k) => (
        <div className="grid2" key={a}>
          <Field label={`${t('page.propagation.position')} ${a}`}><NumberInput value={rel.r[k]} unit="km" digits={6} onChange={(v) => component('r', k, v)} /></Field>
          <Field label={`${t('page.propagation.velocity')} ${a}`}><NumberInput value={rel.v[k]} unit="km/s" digits={9} onChange={(v) => component('v', k, v)} /></Field>
        </div>
      ))}
      {rel && form === 'elements' && !el && <div className="banner">{t('page.propagation.elementsNeedBody')}</div>}
      {el && form === 'elements' && (
        <>
          <div className="grid2">
            <Field label={t('page.propagation.rp')}><NumberInput value={rp} unit="km" digits={6} min={1e-3} onChange={(v) => setElement({ rp: v })} /></Field>
            <Field label={t('el.e')}><NumberInput value={el.e} digits={9} min={0} max={1000} onChange={(v) => setElement({ e: v })} /></Field>
          </div>
          <div className="grid2">{angle('i', 0, 180)}{angle('raan', -360, 360)}</div>
          <div className="grid2">{angle('argp', -360, 360)}{angle('nu', -360, 360)}</div>
          <p className="note">{t('page.propagation.elementsNote', { center: bodyIn(s.center) })}</p>
        </>
      )}
      {rel && (
        <dl className="kv">
          <dt>{t('page.propagation.radius')}</dt><dd><Val q={distance(r, s.distUnit, s.distUnit === 'km' ? 3 : 9)} /></dd>
          {radius > 0 && r < 100 * radius && <><dt>{t('page.propagation.altitude')}</dt><dd><Val q={distance(r - radius, 'km', 3)} /></dd></>}
          <dt>{t('page.propagation.speed')}</dt><dd><Val q={speed(norm(rel.v), 6)} /></dd>
          {el && el.e < 1 && <><dt>{t('el.period')}</dt><dd><Val q={duration(period(el.a, mu))} kind="flight.elements" /></dd></>}
          {el && el.e > 1 && <><dt>{t('page.propagation.vinf')}</dt><dd><Val q={speed(Math.sqrt(mu / -el.a))} kind="flight.elements" /></dd></>}
        </dl>
      )}
      <p className="note">{t('page.propagation.contextNote', { center: bodyIn(s.center), frame: t('frame.' + s.frame) })}</p>
      {children}
    </Panel>
  );
}

function ForcePanel({ draft, onChange, mass }: { draft: Draft; onChange: (d: Draft) => void; mass: number }) {
  const m = draft.model;
  const setModel = (p: Partial<ForceModel>) => onChange({ ...draft, model: { ...m, ...p } });
  const toggle = (id: string, on: boolean) => setModel({ bodies: [...ALL_GRAVITY_BODIES.filter((b) => (b === id ? on : m.bodies.includes(b))), ...m.bodies.filter((b) => !ALL_GRAVITY_BODIES.includes(b))] });
  const srp = (on: boolean, area = draft.area, cr = draft.cr) => onChange({ ...draft, area, cr, model: { ...m, srp: on ? { areaToMass: area / mass, cr } : null } });
  return (
    <Panel title={<>{t('page.propagation.model')} <Src kind="flight.force" /></>}>
      <div className="row">
        <span className="note">{t('page.propagation.presets')}</span>
        <button type="button" className="btn small" onClick={() => setModel({ ...FULL_MODEL, srp: m.srp })}>{t('page.propagation.presetFull')}</button>
        <button type="button" className="btn small" onClick={() => setModel({ bodies: [...PLANET_GRAVITY_BODIES], moons: false, j2: false, relativity: false, srp: null })}>{t('page.propagation.presetPlanets')}</button>
        <button type="button" className="btn small" onClick={() => setModel({ bodies: ['SUN'], moons: false, j2: false, relativity: false, srp: null })}>{t('page.propagation.presetSun')}</button>
      </div>
      <h3>{t('page.propagation.gravity')}</h3>
      <div className="checks">
        {ALL_GRAVITY_BODIES.map((id) => <Check key={id} checked={m.bodies.includes(id)} label={bodyName(id)} onChange={(on) => toggle(id, on)} />)}
      </div>
      {m.bodies.length === 0 && <div className="banner warn">{t('page.propagation.needBody')}</div>}
      <div className="option"><Check checked={m.moons} label={t('force.moons')} onChange={(moons) => setModel({ moons })} /><span className="note">{t('page.propagation.moonsHint')}</span></div>
      <div className="option"><Check checked={m.j2} label={t('force.j2')} onChange={(j2) => setModel({ j2 })} /><span className="note">{t('page.propagation.j2Hint')}</span></div>
      <div className="option"><Check checked={m.relativity} label={t('force.relativity')} onChange={(relativity) => setModel({ relativity })} /><span className="note">{t('page.propagation.relativityHint')}</span></div>
      <div className="option"><Check checked={!!m.srp} label={t('force.srp')} onChange={(on) => srp(on)} /><span className="note">{t('page.propagation.srpHint')}</span></div>
      {m.srp && (
        <>
          <div className="grid2">
            <Field label={t('page.propagation.area')}><NumberInput value={draft.area} unit="m²" min={0} max={1e6} onChange={(v) => srp(true, v, draft.cr)} /></Field>
            <Field label={t('page.propagation.cr')}><NumberInput value={draft.cr} min={0} max={2} onChange={(v) => srp(true, draft.area, v)} /></Field>
          </div>
          <dl className="kv">
            <dt>{t('page.propagation.mass')}</dt><dd><Val q={num(fixed(mass, 0), 'kg')} kind="mass" /></dd>
            <dt>{t('page.propagation.areaToMass')}</dt><dd><Val q={num(sig(m.srp.areaToMass, 5), 'm²/kg')} /></dd>
          </dl>
        </>
      )}
      <p className="note">{sentences(t('page.propagation.asteroidNote'), t('page.propagation.notModeled'))}</p>
    </Panel>
  );
}

/** Screen with no mission: the fields make a new mission that has only a flight. */
function NewFlight() {
  const s = useApp((x) => x.settings);
  const openMission = useApp((x) => x.openMission);
  const busy = useApp((x) => x.busy);
  const make = (): Draft => {
    const et = nowEt();
    const ex = example(s.center, s.frame, et);
    return { et0: et, state0: ex.state0, etEnd: Math.min(system().etEnd, et + ex.tof), model: FULL_MODEL, area: DEFAULT_SPACECRAFT.srpAreaM2, cr: DEFAULT_SPACECRAFT.cr };
  };
  const [draft, setDraft] = useState<Draft>(make);
  const [name, setName] = useState(t('page.propagation.newName'));
  const sc = { ...DEFAULT_SPACECRAFT, srpAreaM2: draft.area, cr: draft.cr };
  const create = () => {
    if (draft.model.bodies.length === 0) return;
    const flight: Flight = { et0: draft.et0, state0: draft.state0, etEnd: draft.etEnd, maneuvers: [], model: draft.model };
    void openMission(newFlightMission(name.trim() || t('page.propagation.newName'), flight, 'import', sc));
  };
  return (
    <>
      <PageHead id="propagation" />
      <div className="banner">{t('page.propagation.noMission')}</div>
      <div className="cols even">
        <StartPanel draft={draft} onChange={setDraft}>
          <div className="row">
            <button type="button" className="btn small" onClick={() => setDraft(make())}>{t('page.propagation.example', { center: bodyIn(s.center === 'SSB' ? 'SUN' : s.center) })}</button>
          </div>
          <p className="note">{t('page.propagation.exampleNote')}</p>
        </StartPanel>
        <div className="stack">
          <ForcePanel draft={draft} onChange={setDraft} mass={sc.dryMassKg + sc.propellantKg} />
          <Panel>
            <Field label={t('common.name')}><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="row end">
              <button type="button" className="btn primary" disabled={!!busy || draft.model.bodies.length === 0} onClick={create}>{t('page.propagation.create')}</button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function PlotNow({ trajectory }: { trajectory: Trajectory }) {
  const { et } = useClock(250);
  const reference = useApp((s) => s.reference);
  return (
    <Panel title={t('page.propagation.plot')}>
      <FlightPlot trajectory={trajectory} markEt={et} reference={reference} />
    </Panel>
  );
}

function NowPanel({ trajectory }: { trajectory: Trajectory }) {
  const { et: now } = useClock(150);
  const s = useApp((x) => x.settings);
  const sys = system();
  const et = Math.min(trajectory.et1, Math.max(trajectory.et0, now));
  const cov = s.center === 'SSB' ? [-Infinity, Infinity] : sys.coverage(s.center);
  const rel = et >= cov[0] && et <= cov[1] ? stateFromIcrf(scRel(trajectory.stateAt(et), s.center, et), s.frame) : null;
  const mu = centerGm(s.center);
  const el = rel && mu > 0 ? elementsFromState(rel, mu) : null;
  const pos = (km: number): Quantity => distance(km, s.distUnit, s.distUnit === 'km' ? 3 : 9);
  return (
    <Panel title={<>{t('page.propagation.now')} <Src kind="flight.state" /></>}>
      <ViewTime et0={trajectory.et0} et1={trajectory.et1} />
      {!rel && <div className="banner warn">{t('error.propagation:center')}</div>}
      {rel && (
        <div className="scroll">
          <table className="data">
            <thead><tr><th /><th className="r">{t('page.ephemeris.position')}</th><th className="r">{t('page.ephemeris.velocity')}</th></tr></thead>
            <tbody>
              {['x', 'y', 'z'].map((a, k) => <tr key={a}><td>{t('common.' + a)}</td><td className="r"><Val q={pos(rel.r[k])} /></td><td className="r"><Val q={speed(rel.v[k], 7)} /></td></tr>)}
              <tr><td>{t('page.ephemeris.magnitude')}</td><td className="r"><Val q={pos(norm(rel.r))} /></td><td className="r"><Val q={speed(norm(rel.v), 7)} /></td></tr>
            </tbody>
          </table>
        </div>
      )}
      {el && (
        <>
          <h3>{t('page.propagation.nowElements', { center: bodyIn(s.center) })} <Src kind="flight.elements" /></h3>
          <dl className="kv wide">
            <dt>{t('el.a')}</dt><dd><Val q={Number.isFinite(el.a) ? pos(el.a) : num(t('plan.open'))} /></dd>
            <dt>{t('el.e')}</dt><dd><Val q={num(fixed(el.e, 9))} /></dd>
            <dt>{t('el.i')}</dt><dd><Val q={angleDeg(el.i, 6)} /></dd>
            <dt>{t('el.raan')}</dt><dd><Val q={angleDeg(el.raan, 6)} /></dd>
            <dt>{t('el.argp')}</dt><dd><Val q={angleDeg(el.argp, 6)} /></dd>
            <dt>{t('el.nu')}</dt><dd><Val q={angleDeg(el.nu, 6)} /></dd>
            <dt>{t('el.rp')}</dt><dd><Val q={pos(apsides(el).rp)} /></dd>
            {el.e < 1 ? <><dt>{t('el.ra')}</dt><dd><Val q={pos(apsides(el).ra)} /></dd></> : <><dt>{t('page.propagation.vinf')}</dt><dd><Val q={speed(Math.sqrt(mu / -el.a))} /></dd></>}
            {el.e < 1 && <><dt>{t('el.period')}</dt><dd><Val q={duration(period(el.a, mu))} /></dd></>}
          </dl>
        </>
      )}
      <p className="note">{t('page.ephemeris.centerNote', { center: bodyName(s.center), frame: t('frame.' + s.frame) })}</p>
    </Panel>
  );
}

function IntegrationPanel({ trajectory }: { trajectory: Trajectory }) {
  return (
    <Panel title={<>{t('page.propagation.integration')} <Src kind="flight.state" /></>}>
      <dl className="kv">
        <dt>{t('page.propagation.method')}</dt><dd>{t('page.propagation.methodName')}</dd>
        <dt>{t('page.propagation.tolerance')}</dt><dd><Val q={num(sci(RTOL, 1))} /></dd>
        <dt>{t('page.propagation.maxStep')}</dt><dd><Val q={num('4', 'd')} /></dd>
        <dt>{t('page.propagation.steps')}</dt><dd><Val q={num(fixed(trajectory.t.length - trajectory.segStarts.length, 0))} /></dd>
        <dt>{t('page.propagation.evals')}</dt><dd><Val q={num(fixed(trajectory.evals, 0))} /></dd>
      </dl>
    </Panel>
  );
}

/** Not more than `count` items of a list, with equal steps between them (the first and the last are always there). */
function spread<T>(list: T[], count: number): T[] {
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, k) => list[Math.round((k * (list.length - 1)) / (count - 1))]);
}

/**
 * Comparison flights: one change of the force model each, then larger tolerances.
 * arc: each comparison flight starts again from the state of the flight on the screen after each maneuver, thus a
 * value is the effect in one arc. whole: the comparison flight has the same maneuvers and no new start.
 */
async function runStudy(mission: Mission, flight: Flight, shown: Trajectory, mode: ForceStudy['mode'], progress: (fraction: number) => void): Promise<ForceStudy> {
  const watch = mission.plan ? [...new Set(mission.plan.nodes.map((n) => n.body))] : [];
  const m = flight.model;
  const sc = mission.spacecraft;
  const runs: { id: string; group: StudyRow['group']; inModel: boolean; model: ForceModel; rtol?: number }[] = [];
  for (const id of ALL_GRAVITY_BODIES) {
    const has = m.bodies.includes(id);
    if (has && m.bodies.length === 1) continue;
    runs.push({ id: 'body:' + id, group: 'force', inModel: has, model: { ...m, bodies: has ? m.bodies.filter((b) => b !== id) : [...m.bodies, id] } });
  }
  runs.push({ id: 'moons', group: 'force', inModel: m.moons, model: { ...m, moons: !m.moons } });
  runs.push({ id: 'j2', group: 'force', inModel: m.j2, model: { ...m, j2: !m.j2 } });
  runs.push({ id: 'relativity', group: 'force', inModel: m.relativity, model: { ...m, relativity: !m.relativity } });
  runs.push({ id: 'srp', group: 'force', inModel: !!m.srp, model: { ...m, srp: m.srp ? null : { areaToMass: sc.srpAreaM2 / (sc.dryMassKg + sc.propellantKg), cr: sc.cr } } });
  for (const rtol of TOLERANCES) runs.push({ id: 'tol:' + rtol.toExponential(0), group: 'tolerance', inModel: false, model: m, rtol });

  progress(0);
  let base: Flight, ref: Trajectory;
  if (mode === 'arc') {
    const after = new Map(shown.events.filter((e) => e.type === 'maneuver' && e.maneuverId).map((e) => [e.maneuverId!, e.state]));
    base = { ...flight, maneuvers: flight.maneuvers.map((x) => { const anchor = after.get(x.id); return anchor ? { ...strip(x), anchor } : strip(x); }) };
    ref = shown;
  } else {
    // The stored states of the solver would hide a difference smaller than 1 km at each maneuver: these flights do not use them.
    base = { ...flight, maneuvers: flight.maneuvers.map(strip) };
    ref = await engine.fly(base, watch);
  }
  const list: number[] = [];
  for (let k = 0; k <= SAMPLES; k++) list.push(ref.et0 + ((ref.et1 - ref.et0) * k) / SAMPLES);
  for (const e of ref.events) {
    if (!(e.et > ref.et0 && e.et < ref.et1)) continue;
    list.push(e.et);
    // The value immediately before a maneuver is the value at the end of its arc.
    if (e.type === 'maneuver' && e.et - 1 > ref.et0) list.push(e.et - 1);
  }
  const times = Float64Array.from([...new Set(list)].sort((a, b) => a - b));
  // An engine burn at a closest approach (an orbit insertion) starts a new arc at that time: the value for this
  // closest approach is then the value 1 s before the burn, at the end of the arc that comes in.
  const burns = mode === 'arc' ? ref.events.filter((e) => e.type === 'maneuver').map((e) => e.et) : [];
  const measureAt = (et: number): number => { const b = burns.find((x) => Math.abs(x - et) <= 60); return b === undefined ? et : Math.min(et, b - 1); };
  const encounters = spread(ref.events.filter((e) => (e.type === 'periapsis' || e.type === 'impact') && e.et > ref.et0 + 3600), 6).map((e) => ({ et: e.et, body: e.body ?? '' }));
  // A comparison flight can end before the flight on the screen (for example, it hits a body).
  const endLimit = ref.et1 - Math.min(DAY, 0.01 * (ref.et1 - ref.et0));
  const rows: StudyRow[] = [];
  for (let k = 0; k < runs.length; k++) {
    progress((k + 1) / (runs.length + 1));
    const run = runs[k];
    const tr = await engine.fly({ ...base, model: run.model }, watch, { rtol: run.rtol, restartAtAnchors: mode === 'arc' });
    const apart = (et: number): number => dist(ref.stateAt(et).r, tr.stateAt(et).r);
    const log = new Float32Array(times.length).fill(NaN);
    let maxKm = 0, maxEt = times[0];
    for (let i = 0; i < times.length && times[i] <= tr.et1; i++) {
      const d = apart(times[i]);
      log[i] = Math.log10(Math.max(d, 1e-9));
      if (d > maxKm) { maxKm = d; maxEt = times[i]; }
    }
    // A flight that ends at a surface ends at a different time in each comparison: compare at the earlier end.
    const endKm = tr.et1 >= endLimit ? apart(Math.min(ref.et1, tr.et1)) : null;
    const hit = tr.events.find((e) => e.type === 'impact');
    const stop: StudyRow['stop'] = tr.et1 >= endLimit ? null : { et: tr.et1, body: tr.failure?.body ?? hit?.body ?? null };
    rows.push({
      id: run.id, group: run.group, inModel: run.inModel, endKm, maxKm, maxEt, stop,
      at: encounters.map((e) => { const et = measureAt(e.et); return et <= tr.et1 ? apart(et) : NaN; }),
      steps: tr.t.length - tr.segStarts.length, evals: tr.evals, log,
    });
  }
  return { flight, mode, encounters, times, rows, steps: ref.t.length - ref.segStarts.length, evals: ref.evals };
}

function forceName(id: string): string {
  return id.startsWith('body:') ? t('force.gravity', { body: bodyIn(id.slice(5)) }) : t('force.' + id);
}
const diffText = (km: number): Quantity => (km < 1 ? num(sig(km * 1000, 3), 'm') : km < 1e7 ? num(sig(km, 4), 'km') : num(sig(km / AU, 4), 'au'));

function StudyPanel({ mission, flight, trajectory, dirty }: { mission: Mission; flight: Flight; trajectory: Trajectory; dirty: boolean }) {
  const study = useDrafts((s) => s.forceStudy);
  const setDrafts = useDrafts((s) => s.set);
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const scale = useApp((s) => s.settings.timeScale);
  const { et } = useClock(300);
  const mine = study && study.flight === flight ? study : null;
  const [mode, setMode] = useState<ForceStudy['mode']>(mine?.mode ?? 'arc');
  const forces = useMemo(() => (mine ? mine.rows.filter((r) => r.group === 'force').sort((a, b) => b.maxKm - a.maxKm) : []), [mine]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Set<string>>(new Set());
  useEffect(() => { setHidden(new Set()); setExtra(new Set()); }, [mine]);
  // The graph shows the six largest effects; a click on a row adds or removes its line.
  const shown = forces.filter((r, k) => (k < 6 ? !hidden.has(r.id) : extra.has(r.id)));
  const color = (id: string): string | null => { const k = shown.findIndex((r) => r.id === id); return k < 0 ? null : COLORS.legs[k % COLORS.legs.length]; };
  const flip = (id: string, k: number) => {
    const set = new Set(k < 6 ? hidden : extra);
    if (set.has(id)) set.delete(id); else set.add(id);
    if (k < 6) setHidden(set); else setExtra(set);
  };
  const marks = useMemo(() => trajectory.events.filter((e) => e.type === 'periapsis' || e.type === 'maneuver' || e.type === 'impact').slice(0, 80)
    .map((e) => ({ et: e.et, text: e.type === 'maneuver' ? '' : bodyName(e.body ?? '') })), [trajectory]);
  const series = useMemo(() => shown.map((r, k) => ({ id: r.id, color: COLORS.legs[k % COLORS.legs.length], log: r.log })), [forces, hidden, extra]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => {
    if (busy) return;
    setBusy({ task: 'study', stage: '', fraction: 0 });
    try {
      const out = await runStudy(mission, flight, trajectory, mode, (fraction) => setBusy({ task: 'study', stage: '', fraction }));
      setDrafts({ forceStudy: out });
      setBusy(null);
    } catch (e) { setBusy(null); fail(e instanceof EngineError ? e.code : 'internal'); }
  };
  const tolerances = mine ? mine.rows.filter((r) => r.group === 'tolerance') : [];
  const stopText = (r: StudyRow): string => (r.stop
    ? t(r.stop.body ? 'page.propagation.stoppedHit' : 'page.propagation.stoppedAt', { time: formatEt(r.stop.et, scale, 'minute'), scale, body: r.stop.body ? bodyIn(r.stop.body) : '' })
    : t('page.propagation.stopped'));
  const cell = (r: StudyRow, km: number | null): ReactNode => (km === null || Number.isNaN(km) ? <span className="tag warn" title={stopText(r)}>{t('page.propagation.stoppedShort')}</span> : <Val q={diffText(km)} />);
  // Two closest approaches on the same day (an orbit about a body): the headings then show the time also.
  const days = mine ? mine.encounters.map((e) => e.body + formatEt(e.et, scale, 'day')) : [];
  const precision = new Set(days).size < days.length ? 'minute' : 'day';
  const heads = mine ? mine.encounters.map((e, k) => {
    const [date, time] = formatEt(e.et, scale, precision).split(' ');
    return <th className="r" key={k}>{bodyName(e.body)}<br /><span className="num">{date}</span>{time && <><br /><span className="num">{time}</span></>}</th>;
  }) : null;
  const stops = mine ? mine.rows.filter((r) => r.stop) : [];
  const hasManeuvers = flight.maneuvers.length > 0;
  return (
    <>
      <Panel title={<>{t('page.propagation.study')} <Src kind="flight.force" /></>}>
        <p className="note">{t('page.propagation.studyIntro')}</p>
        <div className="row">
          {hasManeuvers && (
            <Seg value={mode} onChange={setMode} label={t('page.propagation.studyMode')}
              options={[{ value: 'arc', label: t('page.propagation.modeArc') }, { value: 'whole', label: t('page.propagation.modeWhole') }]} />
          )}
          <button type="button" className={'btn' + (mine && mine.mode === mode ? '' : ' primary')} disabled={!!busy || dirty} onClick={() => void run()}>{t(mine ? 'page.propagation.studyAgain' : 'page.propagation.studyRun')}</button>
          {dirty && <span className="note">{t('page.propagation.studyDirty')}</span>}
          {!dirty && study && !mine && <span className="note">{t('page.propagation.studyOld')}</span>}
        </div>
        {hasManeuvers && <p className="note">{t(mode === 'arc' ? 'page.propagation.modeArcNote' : 'page.propagation.modeWholeNote')}</p>}
        {mine && (
          <>
            <DiffChart times={mine.times} series={series} marks={marks} markEt={et} />
            <div className="scroll">
              <table className="data wrap">
                <thead>
                  <tr>
                    <th /><th>{t('page.propagation.colForce')}</th><th>{t('page.propagation.colChange')}</th>
                    {heads}
                    <th className="r">{t('page.propagation.colMax')}</th><th className="r">{t('page.propagation.colEnd')}</th>
                  </tr>
                </thead>
                <tbody>
                  {forces.map((r, k) => (
                    <tr key={r.id} className="click" onClick={() => flip(r.id, k)}>
                      <td><span className="swatch" style={{ background: color(r.id) ?? 'transparent', borderColor: color(r.id) ?? 'var(--line-2)' }} /></td>
                      <td>{forceName(r.id)}</td>
                      <td>{t(r.inModel ? 'page.propagation.removed' : 'page.propagation.added')}</td>
                      {r.at.map((km, j) => <td className="r" key={j}>{cell(r, km)}</td>)}
                      <td className="r"><Val q={diffText(r.maxKm)} /></td>
                      <td className="r">{cell(r, r.endKm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">{sentences(t('page.propagation.studyNote'), t(mine.mode === 'arc' ? 'page.propagation.studyNoteArc' : 'page.propagation.studyNoteWhole'))}</p>
            {stops.length > 0 && (
              <ul className="note">
                {stops.map((r) => <li key={r.id}>{r.group === 'force' ? forceName(r.id) : sci(Number(r.id.slice(4)), 1)}: {stopText(r)}</li>)}
              </ul>
            )}
          </>
        )}
      </Panel>
      {mine && (
        <Panel title={<>{t('page.propagation.tolerance_')} <Src kind="flight.state" /></>}>
          <p className="note">{t('page.propagation.toleranceIntro')}</p>
          <div className="scroll">
            <table className="data wrap">
              <thead>
                <tr>
                  <th>{t('page.propagation.colTolerance')}</th><th className="r">{t('page.propagation.steps')}</th><th className="r">{t('page.propagation.evals')}</th>
                  {heads}
                  <th className="r">{t('page.propagation.colMax')}</th><th className="r">{t('page.propagation.colEnd')}</th>
                </tr>
              </thead>
              <tbody>
                {tolerances.map((r) => (
                  <tr key={r.id}>
                    <td className="num nw">{sci(Number(r.id.slice(4)), 1)}</td>
                    <td className="r"><Val q={num(fixed(r.steps, 0))} /></td><td className="r"><Val q={num(fixed(r.evals, 0))} /></td>
                    {r.at.map((km, j) => <td className="r" key={j}>{cell(r, km)}</td>)}
                    <td className="r"><Val q={diffText(r.maxKm)} /></td><td className="r">{cell(r, r.endKm)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="nw"><span className="num">{sci(RTOL, 1)}</span> <span className="dim">({t('page.propagation.reference')})</span></td>
                  <td className="r"><Val q={num(fixed(mine.steps, 0))} /></td><td className="r"><Val q={num(fixed(mine.evals, 0))} /></td>
                  <td colSpan={mine.encounters.length + 2} />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="note">{sentences(t('page.propagation.toleranceNote'), mine.mode === 'whole' && hasManeuvers && t('page.propagation.toleranceWhole'))}</p>
        </Panel>
      )}
    </>
  );
}

function FlightEditor({ mission, flight, trajectory }: { mission: Mission; flight: Flight; trajectory: Trajectory | null }) {
  const setFlight = useApp((s) => s.setFlight);
  const updateMission = useApp((s) => s.updateMission);
  const busy = useApp((s) => s.busy);
  const [draft, setDraft] = useState<Draft>(() => draftOf(flight, mission));
  useEffect(() => { setDraft(draftOf(flight, mission)); }, [flight]); // eslint-disable-line react-hooks/exhaustive-deps
  const sc = mission.spacecraft;
  const mass = sc.dryMassKg + sc.propellantKg;
  const pathChanged = draft.et0 !== flight.et0 || !sameState(draft.state0, flight.state0) || !sameModel(draft.model, flight.model);
  const dirty = pathChanged || draft.etEnd !== flight.etEnd;
  const outside = flight.maneuvers.filter((m) => !(m.et > draft.et0 && m.et < draft.etEnd)).length;
  const apply = async () => {
    if (draft.model.bodies.length === 0) return;
    if (draft.model.srp && (draft.area !== sc.srpAreaM2 || draft.cr !== sc.cr)) updateMission((m) => ({ ...m, spacecraft: { ...m.spacecraft, srpAreaM2: draft.area, cr: draft.cr } }));
    // A change of the start or of the model moves the path at all maneuvers: the stored states of the solver are then incorrect.
    const maneuvers = flight.maneuvers.filter((m) => m.et > draft.et0 && m.et < draft.etEnd).map((m) => (pathChanged ? strip(m) : m));
    await setFlight({ et0: draft.et0, state0: draft.state0, etEnd: draft.etEnd, maneuvers, model: draft.model }, 'manual');
  };
  const copyNow = () => {
    if (!trajectory) return;
    const et = Math.min(trajectory.et1 - 60, Math.max(trajectory.et0, clock.et));
    setDraft({ ...draft, et0: et, state0: trajectory.stateAt(et), etEnd: Math.max(draft.etEnd, et + 60) });
  };
  return (
    <>
      <PageHead id="propagation" />
      {mission.flightOrigin === 'manual' && mission.plan && <div className="banner">{t('page.propagation.manualNote')}</div>}
      {trajectory?.failure && <div className="banner bad">{t('page.mission.failure.' + trajectory.failure.reason)}</div>}
      <div className="cols even">
        <StartPanel draft={draft} onChange={setDraft}>
          {trajectory && <div className="row"><button type="button" className="btn small" onClick={copyNow}>{t('page.propagation.copyNow')}</button></div>}
        </StartPanel>
        <div className="stack">
          <ForcePanel draft={draft} onChange={setDraft} mass={mass} />
          <Panel>
            {outside > 0 && <div className="banner warn">{t('page.propagation.outside', { n: outside })}</div>}
            {pathChanged && flight.maneuvers.length > 0 && <p className="note">{t('page.propagation.anchorNote')}</p>}
            <div className="row end">
              {dirty && <span className="tag warn">{t('page.maneuvers.dirty')}</span>}
              <button type="button" className="btn" disabled={!dirty || !!busy} onClick={() => setDraft(draftOf(flight, mission))}>{t('page.maneuvers.discard')}</button>
              <button type="button" className={'btn' + (dirty ? ' primary' : '')} disabled={!dirty || !!busy || draft.model.bodies.length === 0} onClick={() => void apply()}>{t('page.maneuvers.apply')}</button>
            </div>
          </Panel>
        </div>
      </div>
      {trajectory && (
        <>
          <div className="cols even">
            <PlotNow trajectory={trajectory} />
            <div className="stack">
              <NowPanel trajectory={trajectory} />
              <IntegrationPanel trajectory={trajectory} />
            </div>
          </div>
          <StudyPanel mission={mission} flight={flight} trajectory={trajectory} dirty={dirty} />
        </>
      )}
    </>
  );
}

export default function Propagation() {
  const mission = useApp((s) => s.mission);
  const trajectory = useApp((s) => s.trajectory);
  const busy = useApp((s) => s.busy);
  const solve = useApp((s) => s.solve);
  if (!mission) return <NewFlight />;
  if (!mission.flight) {
    return (
      <>
        <PageHead id="propagation" />
        <Empty text={t('page.propagation.noFlight')}>
          {mission.plan && <button type="button" className="btn primary" disabled={!!busy} onClick={() => void solve()}>{t('page.tour.calculate')}</button>}
        </Empty>
      </>
    );
  }
  return <FlightEditor key={mission.id} mission={mission} flight={mission.flight} trajectory={trajectory} />;
}
