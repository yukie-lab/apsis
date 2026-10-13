/** Maneuvers screen: change the maneuvers of the flight, aim a maneuver at an encounter, and see the effect of a change. */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { clock } from '../../app/clock';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { t, bodyName, bodyIn } from '../../i18n';
import { propellantFor, type Mission } from '../../engine/mission';
import type { Flight } from '../../engine/flight';
import { soiRadius, type Maneuver, type Trajectory } from '../../engine/propagate';
import { LOCAL_FRAMES, localToIcrf, icrfToLocal, stateFromIcrf, type LocalFrame } from '../../engine/frames';
import { elementsFromState, apsides, period } from '../../engine/kepler';
import { measureAim, periapsisFromB, bFromPeriapsis, type Aim } from '../../engine/target';
import { BODIES, PLANET_IDS } from '../../engine/bodies';
import { type State, type Vec3, add, norm, sub, dist } from '../../engine/vec';
import { DAY } from '../../engine/time';
import { deltaV, speed, distance, duration, fixed, mass, angleDeg, dateTime, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { Field, NumberInput, DateInput, Panel, Select, BodySelect, Seg } from '../../ui/controls';
import { IconClose } from '../../ui/icons';
import { PageHead, Dt, Empty, scRel, centerGm } from '../common';
import { useDrafts } from '../drafts';

const num = (text: string, unit = ''): Quantity => ({ text, unit });
const strip = ({ anchor: _a, ...m }: Maneuver): Maneuver => m;
const byTime = (a: Maneuver, b: Maneuver): number => a.et - b.et;
const same = (a: Maneuver, b: Maneuver): boolean => a.et === b.et && a.frame === b.frame && a.refBody === b.refBody && a.dv.every((x, k) => x === b.dv[k]);
const AXES: Record<LocalFrame, [string, string, string]> = { VNB: ['V', 'N', 'B'], RTN: ['R', 'T', 'N'], ICRF: ['X', 'Y', 'Z'], ECLIPJ2000: ['X', 'Y', 'Z'] };
const local = (f: LocalFrame): boolean => f === 'VNB' || f === 'RTN';
let counter = 0;

/** State of the spacecraft immediately before a maneuver, from the flight on the screen. null: the time is not in the flight. */
function stateBefore(tr: Trajectory, m: Maneuver): State | null {
  if (!(m.et >= tr.et0 && m.et <= tr.et1)) return null;
  const ev = tr.events.find((e) => e.type === 'maneuver' && e.maneuverId === m.id && e.et === m.et);
  if (ev?.dvIcrf) return { r: ev.state.r, v: sub(ev.state.v, ev.dvIcrf) };
  return tr.stateAt(m.et);
}
/** Body whose sphere of influence has the spacecraft at a time (the Sun if none). */
function mainBody(tr: Trajectory, et: number): string {
  const s = tr.stateAt(et);
  for (const id of PLANET_IDS) {
    if (norm(scRel(s, id, et).r) < soiRadius(system(), id, et)) return id;
  }
  return 'SUN';
}
/** Aims of all closest approaches of a trajectory. */
function aimsOf(tr: Trajectory, times: number[]): Aim[] {
  return tr.events.filter((e) => e.type === 'periapsis' || e.type === 'impact').slice(0, 60).map((e) => measureAim(system(), tr, e, times));
}
function kindText(m: Maneuver): string {
  const k = m.label === 'DSM' ? 'dsm' : m.label === 'TCM' ? 'tcm' : m.label === 'ARRIVAL' ? 'arrival' : null;
  return k ? t('page.mission.kinds.' + k) : t('page.maneuvers.kindUser');
}

function OrbitChange({ m, index, trajectory }: { m: Maneuver; index: number; trajectory: Trajectory }) {
  const frame = useApp((s) => s.settings.frame);
  const sb = stateBefore(trajectory, m);
  const mu = centerGm(m.refBody);
  if (!sb || mu <= 0) return <Panel title={t('page.maneuvers.orbit', { n: index + 1, body: bodyIn(m.refBody) })}><p className="note">{t('page.maneuvers.orbitNone')}</p></Panel>;
  const rel = scRel(sb, m.refBody, m.et);
  const after: State = { r: rel.r, v: add(rel.v, localToIcrf(m.frame, rel, m.dv)) };
  const e0 = elementsFromState(stateFromIcrf(rel, frame), mu), e1 = elementsFromState(stateFromIcrf(after, frame), mu);
  const a0 = apsides(e0), a1 = apsides(e1);
  const unit = m.refBody === 'SUN' ? 'au' : 'km';
  const d = (km: number): Quantity => (Number.isFinite(km) ? distance(km, unit, unit === 'au' ? 5 : 0) : num(t('plan.open')));
  const dd = (x0: number, x1: number): Quantity => (Number.isFinite(x0) && Number.isFinite(x1) ? distance(x1 - x0, unit, unit === 'au' ? 5 : 0) : num(''));
  const closed0 = e0.e < 1, closed1 = e1.e < 1;
  const p0 = closed0 ? period(e0.a, mu) : NaN, p1 = closed1 ? period(e1.a, mu) : NaN;
  const vinf = (el: typeof e0): number => (el.e > 1 ? Math.sqrt(mu / -el.a) : NaN);
  const rows: { key: string; before: Quantity; after: Quantity; change: Quantity }[] = [
    { key: 'plan.sma', before: d(e0.a), after: d(e1.a), change: dd(e0.a, e1.a) },
    { key: 'plan.ecc', before: num(fixed(e0.e, 6)), after: num(fixed(e1.e, 6)), change: num(fixed(e1.e - e0.e, 6)) },
    { key: 'plan.inc', before: angleDeg(e0.i, 4), after: angleDeg(e1.i, 4), change: angleDeg(e1.i - e0.i, 4) },
    { key: 'plan.rp', before: d(a0.rp), after: d(a1.rp), change: dd(a0.rp, a1.rp) },
    { key: 'plan.ra', before: d(a0.ra), after: d(a1.ra), change: dd(a0.ra, a1.ra) },
  ];
  if (closed0 || closed1) rows.push({ key: 'page.maneuvers.period', before: closed0 ? duration(p0) : num(t('plan.open')), after: closed1 ? duration(p1) : num(t('plan.open')), change: closed0 && closed1 ? duration(p1 - p0) : num('') });
  if (!closed0 || !closed1) rows.push({ key: 'page.maneuvers.vinf', before: closed0 ? num('—') : speed(vinf(e0)), after: closed1 ? num('—') : speed(vinf(e1)), change: !closed0 && !closed1 ? speed(vinf(e1) - vinf(e0)) : num('') });
  rows.push({ key: 'page.maneuvers.speed', before: speed(norm(rel.v)), after: speed(norm(after.v)), change: speed(norm(after.v) - norm(rel.v)) });
  rows.push({ key: 'page.maneuvers.distance', before: d(norm(rel.r)), after: d(norm(rel.r)), change: num('') });
  return (
    <Panel title={<>{t('page.maneuvers.orbit', { n: index + 1, body: bodyIn(m.refBody) })} <Src kind="flight.elements" /></>}>
      <div className="scroll">
        <table className="data wrap">
          <thead><tr><th /><th className="r">{t('page.maneuvers.before')}</th><th className="r">{t('page.maneuvers.after')}</th><th className="r">{t('page.maneuvers.change')}</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.key}><td>{t(r.key, { frame: t('frame.' + frame) })}</td><td className="r"><Val q={r.before} /></td><td className="r"><Val q={r.after} /></td><td className="r"><Val q={r.change} /></td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="note">{t('page.maneuvers.orbitNote', { frame: t('frameLong.' + frame) })}</p>
    </Panel>
  );
}

function PropellantTable({ rows, mission }: { rows: Maneuver[]; mission: Mission }) {
  const sc = mission.spacecraft;
  let m0 = sc.dryMassKg + sc.propellantKg;
  let total = 0, used = 0;
  const lines = rows.map((r) => {
    const dv = norm(r.dv);
    const p = propellantFor(m0, dv, sc.ispS);
    const line = { id: r.id, et: r.et, dv, before: m0, used: p, after: m0 - p };
    m0 -= p; total += dv; used += p;
    return line;
  });
  return (
    <Panel title={<>{t('page.maneuvers.propellant')} <Src kind="mass" /></>}>
      <div className="scroll">
        <table className="data wrap">
          <thead><tr><th>{t('plan.node')}</th><th>{t('common.date')}</th><th className="r">Δv</th><th className="r">{t('page.maneuvers.massBefore')}</th><th className="r">{t('page.maneuvers.propellantUsed')}</th><th className="r">{t('page.maneuvers.massAfter')}</th></tr></thead>
          <tbody>
            {lines.map((l, k) => (
              <tr key={l.id}>
                <td>{k + 1}</td><td className="nw"><Dt et={l.et} precision="minute" /></td><td className="r"><Val q={deltaV(l.dv)} /></td>
                <td className="r"><Val q={mass(l.before)} /></td><td className="r"><Val q={mass(l.used)} /></td><td className="r"><Val q={mass(l.after)} className={l.after < sc.dryMassKg - 1e-9 ? 'bad' : ''} /></td>
              </tr>
            ))}
            <tr><td colSpan={2}><b>{t('common.total')}</b></td><td className="r"><Val q={deltaV(total)} /></td><td /><td className="r"><Val q={mass(used)} className={used > sc.propellantKg ? 'bad' : ''} /></td><td /></tr>
          </tbody>
        </table>
      </div>
      {used > sc.propellantKg && <div className="banner warn">{t('page.maneuvers.noPropellant', { need: fixed(used, 0), have: fixed(sc.propellantKg, 0) })}</div>}
      <p className="note">{t('page.maneuvers.propellantNote', { isp: fixed(sc.ispS, 0), dry: fixed(sc.dryMassKg, 0), prop: fixed(sc.propellantKg, 0) })}</p>
    </Panel>
  );
}

interface TargetOut { id: string; dv: Vec3; iterations: number; dvBefore: number; dvAfter: number; miss: number; timeMiss: number | null; body: string }

function Targeter({ rows, selected, flight, trajectory, onResult }: {
  rows: Maneuver[]; selected: string | null; flight: Flight; trajectory: Trajectory; onResult: (out: TargetOut) => void;
}) {
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const scale = useApp((s) => s.settings.timeScale);
  const [mid, setMid] = useState(selected ?? rows[0]?.id ?? '');
  useEffect(() => { if (selected) setMid(selected); }, [selected]);
  const man = rows.find((r) => r.id === mid) ?? rows[0];
  const approaches = useMemo(() => trajectory.events.filter((e) => (e.type === 'periapsis' || e.type === 'impact') && man && e.et > man.et).slice(0, 40), [trajectory, man?.et]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState(0);
  const ev = approaches[Math.min(pick, approaches.length - 1)];
  const times = useMemo(() => flight.maneuvers.map((m) => m.et), [flight]);
  const aim = useMemo(() => (ev ? measureAim(system(), trajectory, ev, times) : null), [ev, trajectory, times]);
  const [bt, setBt] = useState(0);
  const [br, setBr] = useState(0);
  const [mode, setMode] = useState<'free' | 'set'>('free');
  const [tca, setTca] = useState(0);
  useEffect(() => {
    if (aim && Number.isFinite(aim.BdotT)) { setBt(Math.round(aim.BdotT * 1000) / 1000); setBr(Math.round(aim.BdotR * 1000) / 1000); setTca(aim.et); }
  }, [aim?.et, aim?.body, aim?.BdotT, aim?.BdotR]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!man) return <Panel title={t('page.maneuvers.target')}><p className="note">{t('page.maneuvers.targetNoManeuver')}</p></Panel>;
  const body = aim ? BODIES[aim.body] : null;
  const ok = !!aim && Number.isFinite(aim.BdotT) && !!body;
  const mu = body?.gmSystem ?? 0;
  const b = Math.hypot(bt, br);
  const angle = Math.atan2(br, bt);
  const altitude = ok ? periapsisFromB(mu, b, aim.vinf) - body.radius : NaN;
  const setAltitude = (alt: number) => {
    if (!ok) return;
    const nb = bFromPeriapsis(mu, alt + body.radius, aim.vinf);
    setBt(nb * Math.cos(angle)); setBr(nb * Math.sin(angle));
  };
  const setAngle = (deg: number) => { const a = (deg * Math.PI) / 180; setBt(b * Math.cos(a)); setBr(b * Math.sin(a)); };
  const run = async () => {
    if (!ok || busy) return;
    setBusy({ task: 'target', stage: '', fraction: null });
    try {
      const out = await engine.target({ flight, maneuverId: man.id, body: aim.body, et: aim.et, BdotT: bt, BdotR: br, tca: mode === 'set' ? tca : null },
        (p) => setBusy({ task: 'target', stage: 'miss:' + (p.text ?? ''), fraction: null }));
      setBusy(null);
      if (!out.converged) { fail('target:converge'); return; }
      onResult({ id: man.id, dv: out.dv, iterations: out.iterations, dvBefore: out.dvBefore, dvAfter: out.dvAfter, miss: Math.hypot(out.miss.BdotT, out.miss.BdotR), timeMiss: mode === 'set' ? out.miss.time : null, body: aim.body });
    } catch (e) { setBusy(null); fail(e instanceof EngineError ? e.code : 'internal'); }
  };
  return (
    <Panel title={<>{t('page.maneuvers.target')} <Src kind="flight.target" /></>}>
      <p className="note">{t('page.maneuvers.targetNote')}</p>
      <div className="grid3">
        <Field label={t('page.maneuvers.targetManeuver')}>
          <Select value={man.id} onChange={setMid} options={rows.map((r, k) => ({ value: r.id, label: t('page.maneuvers.maneuverN', { n: k + 1, date: dateTime(r.et, scale, 'day').text }) }))} />
        </Field>
        <Field label={t('page.maneuvers.targetEncounter')}>
          {approaches.length === 0 ? <span className="note">{t('page.maneuvers.targetNoEncounter')}</span> : (
            <select className="input" value={Math.min(pick, approaches.length - 1)} onChange={(e) => setPick(Number(e.target.value))}>
              {approaches.map((a, k) => <option key={k} value={k}>{t('page.maneuvers.encounterN', { body: bodyName(a.body ?? ''), date: dateTime(a.et, scale, 'day').text })}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('page.maneuvers.targetTime')}>
          <Seg value={mode} onChange={setMode} options={[{ value: 'free', label: t('page.maneuvers.timeFree') }, { value: 'set', label: t('page.maneuvers.timeSet') }]} />
        </Field>
      </div>
      {aim && !ok && <div className="banner warn">{t('page.maneuvers.targetNotHyperbola')}</div>}
      {ok && (
        <>
          <div className="scroll">
            <table className="data inputs wrap">
              <thead>
                <tr>
                  <th /><th className="r">B·T</th><th className="r">B·R</th><th className="r">{t('page.maneuvers.bAngle')}</th><th className="r">{t('page.maneuvers.altitudeTwoBody')}</th>
                  <th className="r">{t('plan.vinfIn')}</th><th>{t('page.maneuvers.closest')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="nw">{t('page.maneuvers.now')}</td>
                  <td className="r"><Val q={distance(aim.BdotT, 'km', 1)} kind="flight.encounter" /></td>
                  <td className="r"><Val q={distance(aim.BdotR, 'km', 1)} /></td>
                  <td className="r"><Val q={angleDeg(Math.atan2(aim.BdotR, aim.BdotT), 3)} /></td>
                  <td className="r"><Val q={distance(periapsisFromB(mu, Math.hypot(aim.BdotT, aim.BdotR), aim.vinf) - body.radius, 'km', 1)} /></td>
                  <td className="r"><Val q={speed(aim.vinf)} /></td>
                  <td className="nw"><Dt et={aim.et} /></td>
                </tr>
                <tr>
                  <td className="nw">{t('page.maneuvers.wanted')}</td>
                  <td style={{ minWidth: 150 }}><NumberInput value={bt} unit="km" digits={3} label="B·T" onChange={setBt} /></td>
                  <td style={{ minWidth: 150 }}><NumberInput value={br} unit="km" digits={3} label="B·R" onChange={setBr} /></td>
                  <td style={{ minWidth: 118 }}><NumberInput value={(angle * 180) / Math.PI} unit="°" digits={3} min={-360} max={360} label={t('page.maneuvers.bAngle')} onChange={setAngle} /></td>
                  <td style={{ minWidth: 150 }}><NumberInput value={altitude} unit="km" digits={1} min={-body.radius * 0.999} label={t('page.maneuvers.altitudeTwoBody')} onChange={setAltitude} /></td>
                  <td className="r"><span className="dim">{t('page.maneuvers.result')}</span></td>
                  <td>{mode === 'set' ? <DateInput et={tca} compact min={man.et + 3600} max={trajectory.et1} label={t('page.maneuvers.closest')} onChange={setTca} /> : <span className="dim">{t('page.maneuvers.timeFreeCell')}</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {altitude < 0 && <div className="banner warn">{t('page.maneuvers.targetBelow')}</div>}
          <div className="row end">
            <span className="note" style={{ flex: '1 1 280px' }}>{t('page.maneuvers.targetAxes')}</span>
            <button type="button" className="btn primary" disabled={!!busy} onClick={() => void run()}>{t('page.maneuvers.targetRun', { n: rows.indexOf(man) + 1 })}</button>
          </div>
        </>
      )}
    </Panel>
  );
}

function Effect({ trajectory, flight }: { trajectory: Trajectory; flight: Flight }) {
  const effect = useDrafts((s) => s.maneuverEffect);
  const mission = useApp((s) => s.mission);
  const now = useMemo(() => aimsOf(trajectory, flight.maneuvers.map((m) => m.et)), [trajectory, flight]);
  if (!effect || effect.missionId !== mission?.id) return null;
  const match = (a: Aim): Aim | null => {
    let best: Aim | null = null;
    for (const p of effect.before) if (p.body === a.body && (!best || Math.abs(p.et - a.et) < Math.abs(best.et - a.et))) best = p;
    return best && Math.abs(best.et - a.et) < 60 * DAY ? best : null;
  };
  const endMove = trajectory.et1 === effect.endEt ? dist(trajectory.stateAt(trajectory.et1).r, effect.endState.r) : null;
  const tg = effect.target;
  const diff = (x: number, y: number | undefined, f: (v: number) => Quantity): React.ReactNode => (y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? <Val q={f(x - y)} /> : '');
  const dvText = (v: number): string => { const q = deltaV(v); return `${q.text} ${q.unit}`; };
  return (
    <Panel title={<>{t('page.maneuvers.effect')} <Src kind="flight.encounter" /></>}>
      {tg && (
        <div className="banner good">
          {t('page.maneuvers.targetDone', { n: tg.index + 1, body: bodyIn(tg.body), iterations: tg.iterations, before: dvText(tg.dvBefore), after: dvText(tg.dvAfter), miss: fixed(tg.miss, 3) })}
          {tg.timeMiss !== null && <> {t('page.maneuvers.targetDoneTime', { time: fixed(Math.abs(tg.timeMiss), 2) })}</>}
        </div>
      )}
      <div className="scroll">
        <table className="data wrap">
          <thead>
            <tr>
              <th>{t('common.body')}</th><th>{t('page.maneuvers.closest')}</th><th className="r">{t('page.maneuvers.timeChange')}</th>
              <th className="r">{t('plan.altitude')}</th><th className="r">{t('page.maneuvers.change')}</th>
              <th className="r">{t('plan.vinfIn')}</th><th className="r">{t('page.maneuvers.change')}</th>
              <th className="r">B·T</th><th className="r">{t('page.maneuvers.change')}</th><th className="r">B·R</th><th className="r">{t('page.maneuvers.change')}</th>
            </tr>
          </thead>
          <tbody>
            {now.map((a, k) => {
              const p = match(a);
              return (
                <tr key={k} className="click" onClick={() => clock.set(a.et)}>
                  <td className="nw">{bodyName(a.body)}</td>
                  <td className="nw"><Dt et={a.et} precision="minute" /></td>
                  <td className="r">{p ? <Val q={duration(a.et - p.et)} /> : <span className="tag">{t('page.maneuvers.newEncounter')}</span>}</td>
                  <td className="r"><Val q={distance(a.altitude, 'km', 0)} /></td><td className="r">{diff(a.altitude, p?.altitude, (v) => distance(v, 'km', 1))}</td>
                  <td className="r">{Number.isFinite(a.vinf) ? <Val q={speed(a.vinf)} /> : '—'}</td><td className="r">{diff(a.vinf, p?.vinf, deltaV)}</td>
                  <td className="r">{Number.isFinite(a.BdotT) ? <Val q={distance(a.BdotT, 'km', 0)} /> : '—'}</td><td className="r">{diff(a.BdotT, p?.BdotT, (v) => distance(v, 'km', 1))}</td>
                  <td className="r">{Number.isFinite(a.BdotR) ? <Val q={distance(a.BdotR, 'km', 0)} /> : '—'}</td><td className="r">{diff(a.BdotR, p?.BdotR, (v) => distance(v, 'km', 1))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {now.length === 0 && <p className="note">{t('page.maneuvers.effectNone')}</p>}
      <p className="note">
        {t('page.maneuvers.effectNote')}
        {endMove !== null && <> {t('page.maneuvers.effectEnd', { value: distance(endMove, 'km').text })}</>}
      </p>
    </Panel>
  );
}

function Editor({ mission, flight, trajectory }: { mission: Mission; flight: Flight; trajectory: Trajectory | null }) {
  const setFlight = useApp((s) => s.setFlight);
  const busy = useApp((s) => s.busy);
  const sys = system();
  const setDrafts = useDrafts((s) => s.set);
  const [rows, setRows] = useState<Maneuver[]>(() => flight.maneuvers.map(strip).sort(byTime));
  const [end, setEnd] = useState(flight.etEnd);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { setRows(flight.maneuvers.map(strip).sort(byTime)); setEnd(flight.etEnd); }, [flight]);

  const dirty = end !== flight.etEnd || rows.length !== flight.maneuvers.length || rows.some((r) => { const o = flight.maneuvers.find((m) => m.id === r.id); return !o || !same(o, r); });
  /** Flight of the table. The maneuvers before the first change keep the stored states of the solver. */
  const build = (list: Maneuver[]): Flight => {
    let first = Infinity;
    for (const r of list) { const o = flight.maneuvers.find((m) => m.id === r.id); if (!o || !same(o, r)) first = Math.min(first, r.et, o?.et ?? Infinity); }
    for (const o of flight.maneuvers) if (!list.some((r) => r.id === o.id)) first = Math.min(first, o.et);
    const maneuvers = [...list].sort(byTime).map((r) => (r.et < first ? flight.maneuvers.find((m) => m.id === r.id) ?? r : r));
    return { ...flight, maneuvers, etEnd: end };
  };
  const apply = async (list: Maneuver[] = rows, target: TargetOut | null = null) => {
    const before = trajectory ? { before: aimsOf(trajectory, flight.maneuvers.map((m) => m.et)), endEt: trajectory.et1, endState: trajectory.stateAt(trajectory.et1) } : null;
    const ok = await setFlight(build(list), 'manual');
    if (ok && before) {
      const index = target ? [...list].sort(byTime).findIndex((r) => r.id === target.id) : -1;
      setDrafts({ maneuverEffect: { missionId: mission.id, ...before, target: target ? { index, body: target.body, iterations: target.iterations, dvBefore: target.dvBefore, dvAfter: target.dvAfter, miss: target.miss, timeMiss: target.timeMiss } : null } });
    }
  };
  const change = (id: string, f: (m: Maneuver) => Maneuver) => setRows((list) => list.map((r) => (r.id === id ? f(r) : r)).sort(byTime));
  /** Change the frame or the reference body: the velocity change in the ICRF stays the same. */
  const reframe = (m: Maneuver, frame: LocalFrame, refBody: string): Maneuver => {
    const sb = trajectory && stateBefore(trajectory, m);
    if (!sb) return { ...m, frame, refBody };
    const icrf = localToIcrf(m.frame, scRel(sb, m.refBody, m.et), m.dv);
    return { ...m, frame, refBody, dv: icrfToLocal(frame, scRel(sb, refBody, m.et), icrf) };
  };
  const addRow = () => {
    const et = Math.min(end - 3600, Math.max(flight.et0 + 3600, clock.et));
    counter += 1;
    const id = 'u' + Date.now().toString(36) + counter.toString(36);
    const refBody = trajectory && et >= trajectory.et0 && et <= trajectory.et1 ? mainBody(trajectory, et) : 'SUN';
    setRows((list) => [...list, { id, et, dv: [0, 0, 0] as Vec3, frame: 'VNB' as LocalFrame, refBody }].sort(byTime));
    setSelected(id);
  };
  const onTarget = (out: TargetOut) => {
    const next = rows.map((r) => (r.id === out.id ? { ...r, dv: out.dv } : r));
    setRows(next);
    void apply(next, out);
  };
  const sel = rows.find((r) => r.id === selected) ?? null;
  const lastManeuver = rows.length ? rows[rows.length - 1].et : flight.et0;
  const draftFlight = useMemo(() => build(rows), [rows, end, flight]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHead id="maneuvers" />
      {mission.flightOrigin === 'manual' && mission.plan && <div className="banner">{t('page.maneuvers.manualNote')}</div>}
      {trajectory?.failure && <div className="banner bad">{t('page.mission.failure.' + trajectory.failure.reason)}</div>}
      <Panel title={<>{t('page.maneuvers.table')} <Src kind="flight.dv" famousId={mission.famousId} /></>}>
        <div className="scroll">
          <table className="data inputs wrap">
            <thead>
              <tr>
                <th>{t('plan.node')}</th><th>{t('common.type')}</th><th>{t('common.date')}</th><th>{t('context.frame')}</th><th>{t('page.maneuvers.refBody')}</th>
                <th colSpan={3}>{t('page.maneuvers.components')}</th><th className="r">Δv</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="dim">{t('page.maneuvers.none')}</td></tr>}
              {rows.map((r, k) => (
                <tr key={r.id} className={r.id === selected ? 'sel' : ''}>
                  <td><button type="button" className={'btn small' + (r.id === selected ? ' on' : '')} aria-pressed={r.id === selected} title={t('page.maneuvers.select')} onClick={() => { setSelected(r.id); clock.set(r.et); }}>{k + 1}</button></td>
                  <td className="nw">{kindText(r)}</td>
                  <td><DateInput et={r.et} compact min={flight.et0 + 60} max={end - 60} label={t('page.maneuvers.dateOf', { n: k + 1 })} onChange={(et) => change(r.id, (m) => ({ ...m, et }))} /></td>
                  <td style={{ minWidth: 118 }}><Select value={r.frame} label={t('page.maneuvers.frameOf', { n: k + 1 })} options={LOCAL_FRAMES.map((f) => ({ value: f, label: t('frame.' + f) }))} onChange={(f) => change(r.id, (m) => reframe(m, f, m.refBody))} /></td>
                  <td style={{ minWidth: 116 }}>{local(r.frame) ? <BodySelect value={r.refBody} label={t('page.maneuvers.refBodyOf', { n: k + 1 })} filter={(b) => b.gm > 0 && (b.kind === 'star' || b.kind === 'planet' || b.kind === 'dwarf')} onChange={(id) => change(r.id, (m) => reframe(m, m.frame, id))} /> : <span className="dim">{t('common.notApplicable')}</span>}</td>
                  {[0, 1, 2].map((c) => (
                    <td key={c} style={{ minWidth: 112 }}>
                      <span className="with-unit"><span className="axis">{AXES[r.frame][c]}</span>
                        <NumberInput value={r.dv[c] * 1000} digits={4} min={-50000} max={50000} label={t('page.maneuvers.componentOf', { n: k + 1, axis: AXES[r.frame][c] })}
                          onChange={(v) => change(r.id, (m) => ({ ...m, dv: m.dv.map((x, j) => (j === c ? v / 1000 : x)) as Vec3 }))} />
                      </span>
                    </td>
                  ))}
                  <td className="r nw"><Val q={deltaV(norm(r.dv))} /></td>
                  <td className="r"><button type="button" className="btn small" title={t('common.remove')} aria-label={t('page.maneuvers.removeOf', { n: k + 1 })} onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}><IconClose /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={addRow}>{t('page.maneuvers.add')}</button>
          <span className="row" style={{ gap: 6 }}><span className="note">{t('page.mission.end')}</span><DateInput et={end} compact min={Math.max(lastManeuver, flight.et0) + DAY} max={sys.etEnd} label={t('page.mission.end')} onChange={setEnd} /></span>
          <span className="spacer" />
          {dirty && <span className="tag warn">{t('page.maneuvers.dirty')}</span>}
          <button type="button" className="btn" disabled={!dirty || !!busy} onClick={() => { setRows(flight.maneuvers.map(strip).sort(byTime)); setEnd(flight.etEnd); }}>{t('page.maneuvers.discard')}</button>
          <button type="button" className={'btn' + (dirty ? ' primary' : '')} disabled={!dirty || !!busy} onClick={() => void apply()}>{t('page.maneuvers.apply')}</button>
        </div>
        <p className="note">{t('page.maneuvers.tableNote')}</p>
      </Panel>
      {trajectory && (
        <>
          <div className="cols even">
            {sel ? <OrbitChange m={sel} index={rows.indexOf(sel)} trajectory={trajectory} /> : <Panel title={t('page.maneuvers.orbitTitle')}><p className="note">{t('page.maneuvers.orbitSelect')}</p></Panel>}
            <PropellantTable rows={rows} mission={mission} />
          </div>
          <Targeter rows={rows} selected={selected} flight={draftFlight} trajectory={trajectory} onResult={onTarget} />
          <Effect trajectory={trajectory} flight={flight} />
        </>
      )}
    </>
  );
}

export default function Maneuvers() {
  const mission = useApp((s) => s.mission);
  const trajectory = useApp((s) => s.trajectory);
  const busy = useApp((s) => s.busy);
  const solve = useApp((s) => s.solve);
  const go = useApp((s) => s.go);
  if (!mission) {
    return (
      <>
        <PageHead id="maneuvers" />
        <Empty text={t('page.maneuvers.noMission')}>
          <button type="button" className="btn primary" onClick={() => go({ mode: 'expert', page: 'mission' })}>{t('page.maneuvers.toMission')}</button>
          <button type="button" className="btn" onClick={() => go({ mode: 'expert', page: 'propagation' })}>{t('page.maneuvers.toPropagation')}</button>
        </Empty>
      </>
    );
  }
  if (!mission.flight) {
    return (
      <>
        <PageHead id="maneuvers" />
        <Empty text={t('page.maneuvers.noFlight')}>
          {mission.plan && <button type="button" className="btn primary" disabled={!!busy} onClick={() => void solve()}>{t('page.tour.calculate')}</button>}
        </Empty>
      </>
    );
  }
  return <Editor key={mission.id} mission={mission} flight={mission.flight} trajectory={trajectory} />;
}
