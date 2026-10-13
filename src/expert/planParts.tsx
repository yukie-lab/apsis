/** Tables of a plan (patched conics) that some screens share. */
import type { Plan, PlanResult, ArrivalType } from '../engine/plan';
import { centralMu, defaultLeg, evaluatePlan } from '../engine/plan';
import { elementsFromState, apsides } from '../engine/kepler';
import { stateFromIcrf } from '../engine/frames';
import { type SpacecraftSpec, propellantFor, dvCapacity } from '../engine/mission';
import { BODIES } from '../engine/bodies';
import { hohmannTof } from '../engine/planopt';
import { norm } from '../engine/vec';
import { DAY } from '../engine/time';
import { useApp, nowEt } from '../app/store';
import { system } from '../app/system';
import { t, bodyName } from '../i18n';
import { Val, Src } from '../ui/Val';
import { Field, NumberInput, Select } from '../ui/controls';
import { c3, speed, deltaV, angleDeg, duration, distance, fixed, mass, type Quantity } from '../app/format';
import { Dt } from './common';

export const num = (text: string, unit = ''): Quantity => ({ text, unit });

/** Bodies that a plan about the Sun can use: all bodies that go around the Sun. */
export const solarBody = (b: { parent: string | null; id: string }): boolean => b.parent === 'SUN';

/** A plan from one body to a second body that starts at `et` (default: now) with a Hohmann-like flight time. */
export function simplePlan(from: string, to: string, et = nowEt()): Plan {
  const sys = system();
  const cov = [from, to].map((id) => sys.coverage(id));
  const lo = Math.max(sys.etStart, ...cov.map((c) => c[0])) + DAY, hi = Math.min(sys.etEnd, ...cov.map((c) => c[1])) - DAY;
  const t0 = Math.min(Math.max(et, lo), hi - 30 * DAY);
  let tof = 200 * DAY;
  try { tof = hohmannTof(sys, 'SUN', from, to, t0); } catch { /* keep the default */ }
  const t1 = Math.min(hi, t0 + Math.max(20 * DAY, tof));
  return { central: 'SUN', nodes: [{ body: from, et: t0 }, { body: to, et: t1 }], legs: [defaultLeg()], parkingAltitude: 200, arrival: defaultArrival(to, 'flyby'), minFlybyAltitude: {} };
}

/** Arrival values for a body and an arrival type. */
export function defaultArrival(body: string, type: ArrivalType): Plan['arrival'] {
  const b = BODIES[body];
  const small = !(b?.gm > 0);
  if (type === 'orbit' && !small) return { type, periapsisAltitude: Math.max(300, b.minFlybyAltitude), apoapsisRadius: Math.round(b.radius * 20) };
  if (type === 'entry') return { type, periapsisAltitude: 0, apoapsisRadius: null };
  if (type === 'rendezvous' || (type === 'orbit' && small)) return { type: 'rendezvous', periapsisAltitude: 10, apoapsisRadius: null };
  return { type: 'flyby', periapsisAltitude: small ? 50 : Math.max(500, b.minFlybyAltitude), apoapsisRadius: null };
}

export function evaluate(plan: Plan): PlanResult | null {
  try { return evaluatePlan(system(), plan); } catch { return null; }
}

const ARRIVALS: ArrivalType[] = ['flyby', 'orbit', 'rendezvous', 'entry'];

/** Inputs for the arrival at the last body of a plan. */
export function ArrivalInputs({ plan, onChange, detail }: { plan: Plan; onChange: (a: Plan['arrival']) => void; detail?: boolean }) {
  const a = plan.arrival;
  const body = plan.nodes[plan.nodes.length - 1].body;
  const b = BODIES[body];
  const hasMass = b?.gm > 0;
  const types = ARRIVALS.filter((x) => (hasMass ? x !== 'rendezvous' || b.kind !== 'planet' : x === 'flyby' || x === 'rendezvous'));
  const type = types.includes(a.type) ? a.type : types[0];
  return (
    <>
      <Field label={t('plan.arrival')}>
        <Select value={type} onChange={(v) => onChange(defaultArrival(body, v))} options={types.map((x) => ({ value: x, label: t('plan.arrivalType.' + x) }))} />
      </Field>
      {type !== 'rendezvous' && (
        <Field label={t(type === 'entry' ? 'plan.entryAltitude' : 'plan.periapsisAltitude')}>
          <NumberInput value={a.periapsisAltitude} unit="km" min={type === 'entry' ? -b.radius * 0.9 : 0} max={1e8} onChange={(v) => onChange({ ...a, periapsisAltitude: v })} />
        </Field>
      )}
      {type === 'orbit' && (
        <Field label={t('plan.apoapsisRadius')} hint={t('plan.apoapsisHint')}>
          <NumberInput value={a.apoapsisRadius ?? b.radius + a.periapsisAltitude} unit="km" min={b.radius + a.periapsisAltitude} max={1e9} onChange={(v) => onChange({ ...a, apoapsisRadius: v })} />
        </Field>
      )}
      {detail && type !== 'rendezvous' && (
        <Field label={t('plan.bAngle')} hint={t('plan.bAngleHint')}>
          <NumberInput value={((a.bAngle ?? 0) * 180) / Math.PI} unit="°" min={-360} max={360} onChange={(v) => onChange({ ...a, bAngle: (v * Math.PI) / 180 })} />
        </Field>
      )}
      {detail && type === 'flyby' && (
        <Field label={t('plan.coastDays')} hint={t('plan.coastHint')}>
          <NumberInput value={a.coastDays ?? 0} unit="d" min={0} max={20000} onChange={(v) => onChange({ ...a, coastDays: v > 0 ? v : undefined })} />
        </Field>
      )}
    </>
  );
}

/** Velocity budget of a plan. With a spacecraft: the propellant for the burns after the launch. */
export function BudgetTable({ plan, result, spacecraft }: { plan: Plan; result: PlanResult; spacecraft?: SpacecraftSpec }) {
  const d = result.departure, a = result.arrival;
  const m0 = spacecraft ? spacecraft.dryMassKg + spacecraft.propellantKg : 0;
  const need = spacecraft ? propellantFor(m0, result.dvAfterLaunch, spacecraft.ispS) : 0;
  const cap = spacecraft ? dvCapacity(spacecraft) : 0;
  return (
    <>
      {!result.ok && <div className="banner bad">{t('plan.notOk')}</div>}
      <dl className="kv">
        <dt>{t('plan.c3')}</dt><dd><Val q={c3(d.c3)} kind="plan.c3" /></dd>
        <dt>{t('plan.vinfDep')}</dt><dd><Val q={speed(d.vinf)} kind="plan.vinf" /></dd>
        <dt>{t('plan.dla')}</dt><dd><Val q={angleDeg(d.dla, 2)} kind="plan.c3" /></dd>
        <dt>{t('plan.rla')}</dt><dd><Val q={angleDeg(d.rla, 2)} kind="plan.c3" /></dd>
        <dt>{t('plan.dvDep', { alt: fixed(plan.parkingAltitude, 0) })}</dt><dd><Val q={deltaV(d.dv)} kind="plan.dv" /></dd>
        {result.dvFlybys > 1e-6 && (<><dt className="warn">{t('plan.dvFlyby')}</dt><dd><Val q={deltaV(result.dvFlybys)} kind="plan.flyby" className="warn" /></dd></>)}
        {result.legs.some((l) => l.dsm) && (<><dt>{t('plan.dvDsm')}</dt><dd><Val q={deltaV(result.dvDsm)} kind="plan.dv" /></dd></>)}
        <dt>{t('plan.vinfArr')}</dt><dd><Val q={speed(a.vinf)} kind="plan.vinf" /></dd>
        <dt>{t('plan.dvArr', { type: t('plan.arrivalType.' + a.type) })}</dt><dd><Val q={deltaV(a.dv)} kind="plan.dv" /></dd>
        <dt>{t('plan.dvAfter')}</dt><dd><Val q={deltaV(result.dvAfterLaunch)} kind="plan.dv" /></dd>
        <dt><b>{t('plan.dvTotal')}</b></dt><dd><Val q={deltaV(result.dvTotal)} kind="plan.dv" /></dd>
        <dt>{t('plan.tof')}</dt><dd><Val q={duration(result.tof)} kind="plan.time" /></dd>
        {spacecraft && (
          <>
            <dt>{t('plan.propellant')}</dt><dd><Val q={mass(need)} kind="mass" className={need > spacecraft.propellantKg ? 'bad' : ''} /></dd>
            <dt>{t('plan.capacity')}</dt><dd><Val q={deltaV(cap)} kind="mass" /></dd>
          </>
        )}
      </dl>
      {spacecraft && need > spacecraft.propellantKg && <div className="banner warn">{t('plan.noPropellant', { need: fixed(need, 0), have: fixed(spacecraft.propellantKg, 0) })}</div>}
    </>
  );
}

/** Encounters of a plan: speed at infinity, turn angle, periapsis altitude, engine burn of each flyby. */
export function EncounterTable({ result, onPick, picked }: { result: PlanResult; onPick?: (i: number) => void; picked?: number }) {
  const unitD = useApp((s) => s.settings.distUnit);
  const n = result.nodes.length;
  return (
    <div className="scroll">
      <table className="data">
        <thead>
          <tr>
            <th>{t('plan.node')}</th><th>{t('common.body')}</th><th>{t('common.date')} <Src kind="plan.time" /></th>
            <th className="r">{t('plan.vinfIn')} <Src kind="plan.vinf" /></th><th className="r">{t('plan.vinfOut')}</th>
            <th className="r">{t('plan.turn')} <Src kind="plan.flyby" /></th><th className="r">{t('plan.altitude')}</th>
            <th className="r">{t('plan.flybyDv')}</th><th className="r">B·T</th><th className="r">B·R</th>
          </tr>
        </thead>
        <tbody>
          {result.nodes.map((nd, i) => {
            const f = nd.flyby;
            const burn = f ? f.dv > 1e-6 : false;
            return (
              <tr key={i} className={(onPick ? 'click ' : '') + (picked === i ? 'sel' : '')} onClick={onPick ? () => onPick(i) : undefined}>
                <td>{i + 1}</td>
                <td>{bodyName(nd.body)} {i === 0 && <span className="tag">{t('plan.role.departure')}</span>}{i === n - 1 && <span className="tag">{t('plan.arrivalType.' + result.arrival.type)}</span>}</td>
                <td><Dt et={nd.et} precision="minute" /></td>
                <td className="r">{nd.vinfIn ? <Val q={speed(norm(nd.vinfIn))} /> : ''}</td>
                <td className="r">{nd.vinfOut ? <Val q={speed(norm(nd.vinfOut))} /> : ''}</td>
                <td className="r">{f && f.turn > 0 ? <Val q={angleDeg(f.turn, 2)} /> : ''}</td>
                <td className="r">{f && Number.isFinite(f.altitude) ? <Val q={distance(f.altitude, 'km', 0)} className={f.limited ? 'warn' : ''} /> : ''}</td>
                <td className="r">{f ? (burn ? <Val q={deltaV(f.dv)} className="warn" /> : <span className="tag good">{t('plan.free')}</span>) : ''}</td>
                <td className="r">{f && Number.isFinite(f.rp) ? <Val q={distance(f.BdotT, unitD === 'au' ? 'km' : unitD, 0)} /> : ''}</td>
                <td className="r">{f && Number.isFinite(f.rp) ? <Val q={distance(f.BdotR, 'km', 0)} /> : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Explanation of the symbols of the leg table (the frame of the inclination changes with the settings). */
export function LegNote() {
  const frame = useApp((s) => s.settings.frame);
  return <p className="note">{t('plan.legNote', { frame: t('frameLong.' + frame) })}</p>;
}

/** Legs of a plan: the orbit about the central body between two encounters. */
export function LegTable({ plan, result }: { plan: Plan; result: PlanResult }) {
  const s = useApp((x) => x.settings);
  const mu = centralMu(plan.central);
  const dsm = result.legs.some((l) => l.dsm);
  return (
    <div className="scroll">
      <table className="data">
        <thead>
          <tr>
            <th>{t('plan.legCol')}</th><th className="r">{t('plan.tof')} <Src kind="plan.time" /></th>
            <th className="r" title={t('plan.sma')}>a <Src kind="twobody" /></th><th className="r" title={t('plan.ecc')}>e</th>
            <th className="r" title={t('plan.inc', { frame: t('frame.' + s.frame) })}>i</th>
            <th className="r" title={t('plan.rp')}>r<sub>p</sub></th><th className="r" title={t('plan.ra')}>r<sub>a</sub></th><th className="r" title={t('plan.revs')}>{t('plan.revsShort')}</th>
            {dsm && <><th>{t('plan.dsmDate')}</th><th className="r">{t('plan.dsmDv')} <Src kind="plan.dv" /></th></>}
          </tr>
        </thead>
        <tbody>
          {result.legs.map((leg, i) => {
            const name = t('plan.leg', { from: bodyName(plan.nodes[i].body), to: bodyName(plan.nodes[i + 1].body) });
            if (!leg.ok) return <tr key={i}><td className="nw">{name}</td><td colSpan={dsm ? 9 : 7} className="bad">{t('plan.legBad')}</td></tr>;
            // After a deep-space maneuver the orbit changes: show the orbit of the last arc of the leg.
            const arc = leg.arcs[leg.arcs.length - 1];
            const el = elementsFromState(stateFromIcrf(arc.state0, s.frame), mu);
            const ap = apsides(el);
            return (
              <tr key={i}>
                <td className="nw">{name}</td>
                <td className="r"><Val q={duration(plan.nodes[i + 1].et - plan.nodes[i].et)} /></td>
                <td className="r"><Val q={distance(el.a, 'au', 4)} /></td>
                <td className="r"><Val q={num(fixed(el.e, 4))} /></td>
                <td className="r"><Val q={angleDeg(el.i, 3)} /></td>
                <td className="r"><Val q={distance(ap.rp, 'au', 4)} /></td>
                <td className="r">{Number.isFinite(ap.ra) ? <Val q={distance(ap.ra, 'au', 4)} /> : t('plan.open')}</td>
                <td className="r">{plan.legs[i].revs}</td>
                {dsm && <td>{leg.dsm ? <Dt et={leg.dsm.et} precision="minute" /> : ''}</td>}
                {dsm && <td className="r">{leg.dsm ? <Val q={deltaV(leg.dsm.dvMag)} /> : ''}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
