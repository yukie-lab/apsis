/** Transfer screen: the orbit from one body to a second body for a departure date and an arrival date. */
import { useMemo } from 'react';
import { useApp } from '../../app/store';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { t, bodyName } from '../../i18n';
import type { Plan, PlanLeg } from '../../engine/plan';
import { centralMu } from '../../engine/plan';
import { clonePlan, synodicPeriod, hohmannTof } from '../../engine/planopt';
import { newMission } from '../../engine/mission';
import { elementsFromState, period } from '../../engine/kepler';
import { BODIES, AU } from '../../engine/bodies';
import { ICRF_TO_ECLIP } from '../../engine/frames';
import { mulMV, norm, wrap2pi } from '../../engine/vec';
import { DAY, YEAR } from '../../engine/time';
import { speed, duration, angleDeg, distance, fixed, c3 } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { BodySelect, DateInput, Field, NumberInput, Panel, Select, Check } from '../../ui/controls';
import { confirm } from '../../ui/Confirm';
import { PageHead } from '../common';
import { useDrafts } from '../drafts';
import { ArrivalInputs, BudgetTable, LegTable, LegNote, defaultArrival, evaluate, simplePlan, solarBody } from '../planParts';
import { OrbitPlot } from '../OrbitPlot';

/** Hohmann transfer between two circular orbits in one plane (radii r1 and r2 about a body with the constant mu). */
function hohmann(mu: number, r1: number, r2: number) {
  const at = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
  const tof = Math.PI * Math.sqrt((at * at * at) / mu);
  const n2 = Math.sqrt(mu / (r2 * r2 * r2));
  return {
    vinfDep: Math.abs(v1 * (Math.sqrt((2 * r2) / (r1 + r2)) - 1)),
    vinfArr: Math.abs(v2 * (1 - Math.sqrt((2 * r1) / (r1 + r2)))),
    tof,
    /** Angle from the departure body to the arrival body at the departure, rad (positive: the arrival body is ahead). */
    phase: Math.PI - n2 * tof,
  };
}

function HohmannPanel({ plan }: { plan: Plan }) {
  const result = useMemo(() => evaluate(plan), [plan]);
  const sys = system();
  const mu = centralMu(plan.central);
  const [a, b] = plan.nodes;
  const data = useMemo(() => {
    try {
      const sa = sys.stateRel(a.body, plan.central, a.et), sb0 = sys.stateRel(b.body, plan.central, a.et);
      const r1 = elementsFromState(sa, mu + BODIES[a.body].gm).a, r2 = elementsFromState(sb0, mu + BODIES[b.body].gm).a;
      if (!(r1 > 0) || !(r2 > 0)) return null;
      const ea = mulMV(ICRF_TO_ECLIP, sa.r), eb = mulMV(ICRF_TO_ECLIP, sb0.r);
      let phase = wrap2pi(Math.atan2(eb[1], eb[0]) - Math.atan2(ea[1], ea[0]));
      if (phase > Math.PI) phase -= 2 * Math.PI;
      return { r1, r2, h: hohmann(mu, r1, r2), phase, syn: synodicPeriod(sys, plan.central, a.body, b.body, a.et) };
    } catch { return null; }
  }, [sys, mu, a.body, b.body, a.et, plan.central]);
  if (!data || !result) return null;
  let want = data.h.phase % (2 * Math.PI);
  if (want > Math.PI) want -= 2 * Math.PI;
  if (want < -Math.PI) want += 2 * Math.PI;
  const row = (label: string, ref: React.ReactNode, now: React.ReactNode) => <tr><td>{label}</td><td className="r">{ref}</td><td className="r">{now}</td></tr>;
  return (
    <Panel title={<>{t('page.transfer.hohmann')} <Src kind="twobody" /></>}>
      <p className="note">{t('page.transfer.hohmannNote', { r1: fixed(data.r1 / AU, 4), r2: fixed(data.r2 / AU, 4) })}</p>
      <table className="data">
        <thead><tr><th /><th className="r">{t('page.transfer.reference')}</th><th className="r">{t('page.transfer.thisTransfer')}</th></tr></thead>
        <tbody>
          {row(t('plan.vinfDep'), <Val q={speed(data.h.vinfDep)} />, <Val q={speed(result.departure.vinf)} />)}
          {row(t('plan.c3'), <Val q={c3(data.h.vinfDep ** 2)} />, <Val q={c3(result.departure.c3)} />)}
          {row(t('plan.vinfArr'), <Val q={speed(data.h.vinfArr)} />, <Val q={speed(result.arrival.vinf)} />)}
          {row(t('plan.tof'), <Val q={duration(data.h.tof)} />, <Val q={duration(result.tof)} />)}
          {row(t('page.transfer.phase'), <Val q={angleDeg(want, 2)} />, <Val q={angleDeg(data.phase, 2)} />)}
          {row(t('page.transfer.synodic'), <Val q={duration(data.syn)} />, '')}
        </tbody>
      </table>
    </Panel>
  );
}

export default function Transfer() {
  const draft = useDrafts((d) => d.transfer);
  const setDrafts = useDrafts((d) => d.set);
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const openMission = useApp((s) => s.openMission);
  const mission = useApp((s) => s.mission);
  const go = useApp((s) => s.go);
  useApp((s) => s.custom);
  useApp((s) => s.settings);
  const plan = useMemo(() => draft ?? simplePlan('EARTH', 'MARS'), [draft]);
  const setPlan = (p: Plan) => setDrafts({ transfer: p });
  const result = useMemo(() => evaluate(plan), [plan]);
  const sys = system();
  const [n0, n1] = plan.nodes;
  const leg = plan.legs[0];
  const mu = centralMu(plan.central);

  const range = (id: string): [number, number] => { const c = sys.coverage(id); return [Math.max(c[0], sys.etStart), Math.min(c[1], sys.etEnd)]; };
  const setNode = (i: 0 | 1, change: Partial<Plan['nodes'][0]>) => {
    const p = clonePlan(plan);
    p.nodes[i] = { ...p.nodes[i], ...change };
    if (change.body && i === 1) p.arrival = defaultArrival(change.body, p.arrival.type);
    if (change.body) {
      // The dates must be in the data range of the two bodies.
      const lo = Math.max(range(p.nodes[0].body)[0], range(p.nodes[1].body)[0]) + DAY, hi = Math.min(range(p.nodes[0].body)[1], range(p.nodes[1].body)[1]) - DAY;
      const tof = p.nodes[1].et - p.nodes[0].et;
      p.nodes[0].et = Math.min(Math.max(p.nodes[0].et, lo), hi - tof);
      p.nodes[1].et = p.nodes[0].et + tof;
    }
    if (i === 0 && change.et !== undefined && p.nodes[1].et <= p.nodes[0].et) p.nodes[1].et = Math.min(range(p.nodes[1].body)[1], p.nodes[0].et + (n1.et - n0.et));
    setPlan(p);
  };
  const setLeg = (change: Partial<PlanLeg>) => { const p = clonePlan(plan); p.legs[0] = { ...p.legs[0], ...change }; setPlan(p); };

  // The two solutions with complete revolutions: the list shows the semi-major axis of each one.
  const branches = useMemo(() => {
    if (leg.revs === 0) return [];
    return (['left', 'right'] as const).map((branch) => {
      const p = clonePlan(plan); p.legs[0].branch = branch;
      const r = evaluate(p);
      const el = r?.legs[0].ok ? r.legs[0].elements : null;
      return { value: branch, label: el ? t('page.transfer.branchA', { a: fixed(el.a / AU, 4) }) : t('page.transfer.branchNone') };
    });
  }, [plan, leg.revs]);

  const findBest = async () => {
    if (busy) return;
    const a = n0.body, b = n1.body;
    const lo = Math.max(range(a)[0], range(b)[0]) + DAY, hi = Math.min(range(a)[1], range(b)[1]) - DAY;
    const t0 = Math.max(lo, n0.et);
    let syn = 2 * YEAR, hoh = 200 * DAY;
    try { syn = Math.min(12 * YEAR, synodicPeriod(sys, 'SUN', a, b, t0)); hoh = hohmannTof(sys, 'SUN', a, b, t0); } catch { /* defaults */ }
    const dep: [number, number] = [t0, Math.min(t0 + syn, hi - 0.4 * hoh)];
    const arr: [number, number] = [t0 + 0.35 * hoh, Math.min(hi, t0 + syn + 2.2 * hoh)];
    if (!(dep[1] > dep[0] + DAY) || !(arr[1] > arr[0] + DAY)) { fail('quick:coverage'); return; }
    setBusy({ task: 'porkchop', stage: '', fraction: null });
    try {
      const map = await engine.porkchop({ central: 'SUN', from: a, to: b, dep, arr, nx: 72, ny: 72, parkingAltitude: plan.parkingAltitude, arrival: plan.arrival, bothDirections: false });
      if (!map.best) { setBusy(null); fail('quick:window'); return; }
      const p = clonePlan(plan);
      p.nodes[0].et = map.best.dep; p.nodes[1].et = map.best.arr;
      p.legs[0] = { ...p.legs[0], revs: 0, branch: 'single', retrograde: false, dsm: null };
      setBusy({ task: 'optimize', stage: '', fraction: null });
      const out = await engine.optimize(p, { freeTimes: [true, true], objective: 'total' });
      const ok = out.result.ok && out.plan.nodes[0].et >= lo && out.plan.nodes[1].et <= hi;
      setPlan(ok ? out.plan : p);
      setBusy(null);
    } catch (e) {
      setBusy(null);
      fail(e instanceof EngineError ? e.code : 'internal');
    }
  };

  const makeMission = async () => {
    if (mission && !(await confirm(t('mission.replaceQuestion', { name: mission.name }), t('mission.replace')))) return;
    await openMission(newMission(t('mission.defaultName', { from: bodyName(n0.body), to: bodyName(n1.body) }), clonePlan(plan)));
    go({ mode: 'expert', page: 'tour' });
  };

  const el = result?.legs[0].ok ? result.legs[0].elements : null;
  const transferAngle = result?.legs[0].ok ? (() => {
    const r1 = result.nodes[0].bodyState.r, r2 = result.nodes[1].bodyState.r;
    const c = (r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]) / (norm(r1) * norm(r2));
    const ang = Math.acos(Math.min(1, Math.max(-1, c)));
    const e1 = mulMV(ICRF_TO_ECLIP, r1), e2 = mulMV(ICRF_TO_ECLIP, r2);
    const short = (e1[0] * e2[1] - e1[1] * e2[0] >= 0) !== leg.retrograde;
    return (short ? ang : 2 * Math.PI - ang) + 2 * Math.PI * leg.revs;
  })() : 0;

  return (
    <>
      <PageHead id="transfer" />
      <div className="cols">
        <div className="stack">
          <Panel title={t('page.transfer.input')}>
            <div className="grid2">
              <Field label={t('page.transfer.from')}><BodySelect value={n0.body} filter={solarBody} onChange={(body) => { if (body !== n1.body) setNode(0, { body }); }} /></Field>
              <Field label={t('page.transfer.to')}><BodySelect value={n1.body} filter={solarBody} onChange={(body) => { if (body !== n0.body) setNode(1, { body }); }} /></Field>
            </div>
            <Field label={t('page.transfer.depDate')}><DateInput et={n0.et} min={range(n0.body)[0]} max={Math.min(range(n0.body)[1], n1.et - DAY)} nudge onChange={(et) => setNode(0, { et })} /></Field>
            <Field label={t('page.transfer.arrDate')}><DateInput et={n1.et} min={n0.et + DAY} max={range(n1.body)[1]} nudge onChange={(et) => setNode(1, { et })} /></Field>
            <Field label={t('plan.tof')}><NumberInput value={(n1.et - n0.et) / DAY} unit="d" min={1} max={(range(n1.body)[1] - n0.et) / DAY} digits={2} onChange={(d) => setNode(1, { et: n0.et + d * DAY })} /></Field>
            <div className="row">
              <button type="button" className="btn" disabled={!!busy} onClick={findBest}>{t('page.transfer.findBest')}</button>
              <span className="note" style={{ flex: 1, minWidth: 180 }}>{t('page.transfer.findBestNote')}</span>
            </div>
          </Panel>
          <Panel title={t('page.transfer.ends')}>
            <div className="grid2">
              <Field label={t('plan.parkingAltitude')}><NumberInput value={plan.parkingAltitude} unit="km" min={0} max={1e6} onChange={(v) => setPlan({ ...clonePlan(plan), parkingAltitude: v })} /></Field>
              <ArrivalInputs plan={plan} onChange={(arrival) => setPlan({ ...clonePlan(plan), arrival })} />
            </div>
          </Panel>
          <Panel title={t('page.transfer.options')}>
            <div className="grid2">
              <Field label={t('plan.revs')}>
                <Select value={String(leg.revs)} onChange={(v) => setLeg({ revs: Number(v), branch: Number(v) === 0 ? 'single' : leg.branch === 'single' ? 'left' : leg.branch })}
                  options={[0, 1, 2, 3].map((k) => ({ value: String(k), label: String(k) }))} />
              </Field>
              {leg.revs > 0 && (
                <Field label={t('page.transfer.branch')}>
                  <Select value={leg.branch === 'single' ? 'left' : leg.branch} onChange={(branch) => setLeg({ branch })} options={branches} />
                </Field>
              )}
            </div>
            <Check checked={leg.retrograde} onChange={(retrograde) => setLeg({ retrograde })} label={t('page.transfer.retrograde')} />
            <p className="note">{t('page.transfer.optionsNote')}</p>
          </Panel>
        </div>
        <div className="stack">
          {result ? (
            <>
              <div className="cols even">
                <Panel title={t('plan.budget')}>
                  <BudgetTable plan={plan} result={result} />
                  {el && (
                    <dl className="kv">
                      <dt>{t('page.transfer.angle')}</dt><dd><Val q={angleDeg(transferAngle, 2)} kind="twobody" /></dd>
                      <dt>{t('page.transfer.period')}</dt><dd>{el.e < 1 ? <Val q={duration(period(el.a, mu))} kind="twobody" /> : t('plan.open')}</dd>
                      <dt>{t('page.transfer.periapsisSun')}</dt><dd><Val q={distance(el.p / (1 + el.e), 'au', 4)} kind="twobody" /></dd>
                    </dl>
                  )}
                  <div className="row end"><button type="button" className="btn primary" disabled={!result.ok} onClick={makeMission}>{t('page.transfer.makeMission')}</button></div>
                </Panel>
                <Panel title={t('page.transfer.plot')}>
                  <OrbitPlot plan={plan} result={result} />
                </Panel>
              </div>
              <Panel title={t('plan.legs')}><LegTable plan={plan} result={result} /><LegNote /></Panel>
              <HohmannPanel plan={plan} />
            </>
          ) : <div className="banner bad">{t('plan.notOk')}</div>}
          <p className="note">{t('page.transfer.modelNote')}</p>
        </div>
      </div>
    </>
  );
}
