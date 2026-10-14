/** Flyby tour screen: the sequence of bodies and dates of the plan of the mission, its flybys and its velocity budget. */
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { t, bodyName } from '../../i18n';
import type { Plan, PlanLeg } from '../../engine/plan';
import { defaultLeg, eclipticLonLat, centralMu } from '../../engine/plan';
import { elementsFromState, apsides } from '../../engine/kepler';
import { stateFromIcrf } from '../../engine/frames';
import { clonePlan, planCost, type Objective } from '../../engine/planopt';
import { newMission } from '../../engine/mission';
import { BODIES, AU } from '../../engine/bodies';
import { norm } from '../../engine/vec';
import { DAY } from '../../engine/time';
import { deltaV, fixed, speed, angleDeg, distance, duration } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { BodySelect, DateInput, Field, NumberInput, Panel, Select, Check } from '../../ui/controls';
import { IconPlus, IconClose } from '../../ui/icons';
import { PageHead, Empty } from '../common';
import { ArrivalInputs, BudgetTable, EncounterTable, LegNote, defaultArrival, evaluate, simplePlan, solarBody } from '../planParts';
import { OrbitPlot } from '../OrbitPlot';
import { TisserandPlot } from '../TisserandPlot';

const OBJECTIVES: Objective[] = ['total', 'afterLaunch', 'c3', 'arrival'];

function NoPlan() {
  const mission = useApp((s) => s.mission);
  const openMission = useApp((s) => s.openMission);
  const go = useApp((s) => s.go);
  return (
    <Empty text={t(mission ? 'page.tour.noPlan' : 'page.tour.noMission')}>
      {!mission && <button type="button" className="btn primary" onClick={() => void openMission(newMission(t('mission.defaultName', { from: bodyName('EARTH'), to: bodyName('MARS') }), simplePlan('EARTH', 'MARS')))}>{t('mission.new')}</button>}
      <button type="button" className="btn" onClick={() => go({ mode: 'expert', page: 'mission' })}>{t('page.tour.toMission')}</button>
    </Empty>
  );
}

/** Insert a body after node i. The new last node gets the arrival of the plan. */
function insertNode(plan: Plan, i: number): Plan {
  const p = clonePlan(plan);
  const sys = system();
  const last = i === p.nodes.length - 1;
  const et = last ? Math.min(sys.etEnd - DAY, p.nodes[i].et + 300 * DAY) : 0.5 * (p.nodes[i].et + p.nodes[i + 1].et);
  const body = last ? p.nodes[i].body : ['VENUS', 'EARTH', 'MARS', 'JUPITER'].find((b) => b !== p.nodes[i].body && b !== p.nodes[i + 1].body) ?? 'VENUS';
  p.nodes.splice(i + 1, 0, { body, et });
  p.legs.splice(i, 0, defaultLeg());
  const alt: Record<number, number> = {};
  for (const [k, v] of Object.entries(p.minFlybyAltitude)) alt[Number(k) > i ? Number(k) + 1 : Number(k)] = v;
  p.minFlybyAltitude = alt;
  return p;
}
function removeNode(plan: Plan, i: number): Plan {
  const p = clonePlan(plan);
  const wasLast = i === p.nodes.length - 1;
  p.nodes.splice(i, 1);
  p.legs.splice(Math.max(0, i - 1), 1);
  const alt: Record<number, number> = {};
  for (const [k, v] of Object.entries(p.minFlybyAltitude)) { const n = Number(k); if (n !== i) alt[n > i ? n - 1 : n] = v; }
  delete alt[0]; delete alt[p.nodes.length - 1];
  p.minFlybyAltitude = alt;
  if (wasLast) p.arrival = defaultArrival(p.nodes[p.nodes.length - 1].body, p.arrival.type);
  return p;
}

export default function Tour() {
  const mission = useApp((s) => s.mission);
  const result = useApp((s) => s.planResult);
  const updatePlan = useApp((s) => s.updatePlan);
  const updateMission = useApp((s) => s.updateMission);
  const solve = useApp((s) => s.solve);
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const go = useApp((s) => s.go);
  const stale = useApp((s) => s.flightStale);
  useApp((s) => s.custom);
  const settings = useApp((s) => s.settings);
  const plan = mission?.plan ?? null;
  const n = plan?.nodes.length ?? 0;
  const [free, setFree] = useState<boolean[]>([]);
  const [objective, setObjective] = useState<Objective>('afterLaunch');
  const [global, setGlobal] = useState(false);
  const [rangeDays, setRangeDays] = useState(120);
  const [maxC3, setMaxC3] = useState(0);
  const [freeDsm, setFreeDsm] = useState(true);
  const [last, setLast] = useState<{ before: number; after: number } | null>(null);
  useEffect(() => { setFree(Array.from({ length: n }, () => true)); setLast(null); }, [n, mission?.id]);
  const sys = system();

  // The two solutions of a leg with complete revolutions: the list shows the semi-major axis of each one.
  const branchLabels = useMemo(() => {
    if (!plan) return [];
    return plan.legs.map((leg, i) => {
      if (leg.revs === 0) return [];
      return (['left', 'right'] as const).map((branch) => {
        const p = clonePlan(plan); p.legs[i].branch = branch;
        const el = evaluate(p)?.legs[i];
        return { value: branch, label: el?.ok && el.elements ? t('page.transfer.branchA', { a: fixed(el.elements.a / AU, 3) }) : t('page.transfer.branchNone') };
      });
    });
  }, [plan]);

  if (!plan || !mission) return <><PageHead id="tour" /><NoPlan /></>;

  const range = (id: string): [number, number] => { const c = sys.coverage(id); return [Math.max(c[0], sys.etStart), Math.min(c[1], sys.etEnd)]; };
  const setNode = (i: number, change: Partial<Plan['nodes'][0]>) => updatePlan((old) => {
    const p = clonePlan(old);
    p.nodes[i] = { ...p.nodes[i], ...change };
    if (change.body) {
      delete p.minFlybyAltitude[i];
      if (i === p.nodes.length - 1) p.arrival = defaultArrival(change.body, p.arrival.type);
      const [lo, hi] = range(change.body);
      p.nodes[i].et = Math.min(hi - DAY, Math.max(lo + DAY, p.nodes[i].et));
    }
    return p;
  });
  const setLeg = (i: number, change: Partial<PlanLeg>) => updatePlan((old) => { const p = clonePlan(old); p.legs[i] = { ...p.legs[i], ...change }; return p; });
  const setPlan = (change: (p: Plan) => void) => updatePlan((old) => { const p = clonePlan(old); change(p); return p; });

  const optimize = async (target: Plan, options: Parameters<typeof engine.optimize>[1]) => {
    if (busy) return;
    const before = result ? planCost(result, options.objective ?? 'total', options.maxC3) : NaN;
    setBusy({ task: 'optimize', stage: '', fraction: 0 });
    try {
      const out = await engine.optimize(target, options, (p) => setBusy({ task: 'optimize', stage: p.best !== undefined && p.best < 1e5 ? 'best:' + p.best.toFixed(3) : '', fraction: p.fraction ?? null }));
      setBusy(null);
      if (useApp.getState().mission?.id !== mission.id) return;
      // The dates must stay in the range of the data of each body.
      const inRange = out.plan.nodes.every((nd) => nd.et > range(nd.body)[0] && nd.et < range(nd.body)[1]);
      if (!inRange || !out.result.ok) { fail('optimize:range'); return; }
      updatePlan(() => out.plan);
      setLast({ before, after: out.cost });
    } catch (e) {
      setBusy(null);
      fail(e instanceof EngineError ? e.code : 'internal');
    }
  };
  const runOptimizer = () => {
    const bounds: [number, number][] = [];
    plan.nodes.forEach((nd, i) => { if (free[i]) { const [lo, hi] = range(nd.body); bounds.push([Math.max(lo + DAY, nd.et - rangeDays * DAY), Math.min(hi - DAY, nd.et + rangeDays * DAY)]); } });
    void optimize(plan, { freeTimes: free, freeDsm, objective, global, generations: 300, timeBounds: bounds, ...(maxC3 > 0 ? { maxC3 } : {}) });
  };
  const toggleDsm = (i: number, on: boolean) => {
    if (!on) { setLeg(i, { dsm: null }); return; }
    const p = clonePlan(plan);
    const node = result?.nodes[i];
    if (i === 0) {
      const v = node?.vinfOut ?? [3, 0, 0];
      const dir = eclipticLonLat(v);
      p.legs[0].dsm = { eta: 0.5, vinf: Math.max(0.5, norm(v)), lon: dir.lon, lat: dir.lat };
    } else {
      const body = BODIES[p.nodes[i].body];
      const rp = node?.flyby && Number.isFinite(node.flyby.rp) ? node.flyby.rp / body.radius : 2;
      p.legs[i].dsm = { eta: 0.5, rpRadii: Math.max(1 + (p.minFlybyAltitude[i] ?? body.minFlybyAltitude) / body.radius, rp), beta: 0 };
    }
    // The optimizer finds the best values of the new maneuver. The dates stay.
    void optimize(p, { objective: 'afterLaunch', freeDsm: true });
  };
  const calculateFlight = async () => { if (await solve()) go({ mode: 'expert', page: 'mission' }); };
  const flybyBurns = result ? result.dvFlybys > 1e-6 : false;

  const mu = centralMu(plan.central);
  const frame = settings.frame;
  const hasDsm = plan.legs.some((l) => l.dsm);

  return (
    <>
      <PageHead id="tour" />
      <Panel title={<>{t('page.tour.sequence')} <Src kind="plan.flyby" /></>}>
        <div className="scroll">
          <table className="data inputs wrap">
            <thead>
              <tr>
                <th>{t('plan.node')}</th><th>{t('common.body')}</th><th>{t('common.date')}</th>
                <th title={t('page.tour.freeHint')}>{t('page.tour.free')}</th><th>{t('page.tour.minAltitude')}</th>
                <th className="r">{t('plan.vinfIn')}</th><th className="r">{t('plan.vinfOut')}</th><th className="r">{t('plan.turn')}</th>
                <th className="r">{t('plan.altitude')}</th><th className="r">{t('plan.flybyDv')}</th><th />
              </tr>
            </thead>
            <tbody>
              {plan.nodes.map((nd, i) => {
                const b = BODIES[nd.body];
                const inner = i > 0 && i < n - 1;
                const [lo, hi] = range(nd.body);
                const res = result?.nodes[i];
                const f = res?.flyby ?? null;
                const burn = f ? f.dv > 1e-6 : false;
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ minWidth: 116 }}><BodySelect value={nd.body} filter={solarBody} label={t('page.tour.bodyOf', { n: i + 1 })} onChange={(body) => setNode(i, { body })} /></td>
                    <td><DateInput et={nd.et} compact label={t('page.tour.dateOf', { n: i + 1 })} min={Math.max(lo, i > 0 ? plan.nodes[i - 1].et + DAY : lo)} max={Math.min(hi, i < n - 1 ? plan.nodes[i + 1].et - DAY : hi)} onChange={(et) => setNode(i, { et })} /></td>
                    <td><input type="checkbox" checked={!!free[i]} aria-label={t('page.tour.freeOf', { n: i + 1 })} onChange={(e) => setFree(free.map((x, k) => (k === i ? e.target.checked : x)))} /></td>
                    <td style={{ minWidth: 112 }}>
                      {inner && b.gm > 0 && <NumberInput value={plan.minFlybyAltitude[i] ?? b.minFlybyAltitude} unit="km" min={0} max={1e7} digits={0} label={t('page.tour.minAltitudeOf', { n: i + 1 })} onChange={(v) => setPlan((p) => { p.minFlybyAltitude[i] = v; })} />}
                      {i === 0 && <span className="tag">{t('plan.role.departure')}</span>}
                      {i === n - 1 && <span className="tag">{t('plan.arrivalType.' + plan.arrival.type)}</span>}
                    </td>
                    <td className="r">{res?.vinfIn ? <Val q={speed(norm(res.vinfIn))} /> : ''}</td>
                    <td className="r">{res?.vinfOut ? <Val q={speed(norm(res.vinfOut))} /> : ''}</td>
                    <td className="r">{f && f.turn > 0 ? <Val q={angleDeg(f.turn, 2)} /> : ''}</td>
                    <td className="r">{f && Number.isFinite(f.altitude) ? <Val q={distance(f.altitude, 'km', 0)} className={f.limited ? 'warn' : ''} /> : ''}</td>
                    <td className="r">{f ? (burn ? <Val q={deltaV(f.dv)} className="warn" /> : <span className="tag good">{t('plan.free')}</span>) : ''}</td>
                    <td className="nw r">
                      <button type="button" className="btn small" title={t('page.tour.insert')} aria-label={t('page.tour.insertAfter', { n: i + 1 })} onClick={() => updatePlan((old) => insertNode(old, i))}><IconPlus /></button>{' '}
                      <button type="button" className="btn small" title={t('common.remove')} aria-label={t('page.tour.removeOf', { n: i + 1 })} disabled={n <= 2} onClick={() => updatePlan((old) => removeNode(old, i))}><IconClose /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {flybyBurns && <div className="banner warn">{t('page.tour.poweredNote')}</div>}
        <p className="note">{t('page.tour.sequenceNote')}</p>
        {result && n > 2 && (
          <details>
            <summary>{t('page.tour.bplane')}</summary>
            <EncounterTable result={result} />
            <p className="note">{t('page.tour.encounterNote')}</p>
          </details>
        )}
      </Panel>
      <Panel title={<>{t('plan.legs')} <Src kind="twobody" /></>}>
        <div className="scroll">
          <table className="data inputs wrap">
            <thead>
              <tr>
                <th>{t('plan.legCol')}</th><th>{t('plan.revs')}</th><th>{t('page.tour.retro')}</th><th>{t('page.tour.dsm')}</th>
                {hasDsm && <th>{t('page.tour.dsmTime')}</th>}
                {hasDsm && <th className="r">{t('plan.dsmDv')}</th>}
                <th className="r">{t('plan.tof')}</th>
                <th className="r" title={t('plan.sma')}>a</th><th className="r" title={t('plan.ecc')}>e</th><th className="r" title={t('plan.inc', { frame: t('frame.' + frame) })}>i</th>
                <th className="r" title={t('plan.rp')}>r<sub>p</sub></th><th className="r" title={t('plan.ra')}>r<sub>a</sub></th>
              </tr>
            </thead>
            <tbody>
              {plan.legs.map((leg, i) => {
                const res = result?.legs[i];
                const arc = res?.ok ? res.arcs[res.arcs.length - 1] : null;
                const el = arc ? elementsFromState(stateFromIcrf(arc.state0, frame), mu) : null;
                const ap = el ? apsides(el) : null;
                return (
                  <tr key={i}>
                    <td className="nw">{t('plan.leg', { from: bodyName(plan.nodes[i].body), to: bodyName(plan.nodes[i + 1].body) })}{res && !res.ok && <> <span className="tag bad">{t('plan.legBad')}</span></>}</td>
                    <td>
                      <span className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                        <span style={{ width: 66, flex: 'none' }}><Select value={String(leg.revs)} label={t('plan.revs')} onChange={(v) => setLeg(i, { revs: Number(v), branch: Number(v) === 0 ? 'single' : leg.branch === 'single' ? 'left' : leg.branch })} options={[0, 1, 2, 3].map((k) => ({ value: String(k), label: String(k) }))} /></span>
                        {leg.revs > 0 && <span style={{ width: 138, flex: 'none' }}><Select value={leg.branch === 'single' ? 'left' : leg.branch} label={t('page.transfer.branch')} onChange={(branch) => setLeg(i, { branch })} options={branchLabels[i] ?? []} /></span>}
                      </span>
                    </td>
                    <td><input type="checkbox" checked={leg.retrograde} aria-label={t('page.transfer.retrograde')} onChange={(e) => setLeg(i, { retrograde: e.target.checked })} /></td>
                    <td><input type="checkbox" checked={!!leg.dsm} disabled={!!busy} aria-label={t('page.tour.dsmOf', { n: i + 1 })} onChange={(e) => toggleDsm(i, e.target.checked)} /></td>
                    {hasDsm && <td style={{ minWidth: 96 }}>{leg.dsm && <NumberInput value={leg.dsm.eta * 100} unit="%" min={2} max={98} digits={1} label={t('page.tour.dsmTime')} onChange={(v) => setLeg(i, { dsm: { ...leg.dsm!, eta: v / 100 } })} />}</td>}
                    {hasDsm && <td className="r">{res?.dsm ? <Val q={deltaV(res.dsm.dvMag)} /> : ''}</td>}
                    <td className="r"><Val q={duration(plan.nodes[i + 1].et - plan.nodes[i].et)} /></td>
                    <td className="r">{el ? <Val q={distance(el.a, 'au', 4)} /> : ''}</td>
                    <td className="r">{el ? <Val q={{ text: fixed(el.e, 4), unit: '' }} /> : ''}</td>
                    <td className="r">{el ? <Val q={angleDeg(el.i, 3)} /> : ''}</td>
                    <td className="r">{ap ? <Val q={distance(ap.rp, 'au', 4)} /> : ''}</td>
                    <td className="r">{ap ? (Number.isFinite(ap.ra) ? <Val q={distance(ap.ra, 'au', 4)} /> : t('plan.open')) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <LegNote />
        <p className="note">{t('page.tour.legNote')}</p>
      </Panel>
      {result ? (
        <div className="cols">
          <div className="stack">
            <Panel title={t('plan.budget')}>
              <BudgetTable plan={plan} result={result} spacecraft={mission.spacecraft} />
              <Check checked={mission.refine.moons} onChange={(moons) => updateMission((m) => ({ ...m, refine: { ...m.refine, moons } }))} label={t('page.tour.moons')} />
              {plan.legs.some((l, i) => l.dsm && i > 0) && <Check checked={mission.refine.optimizeDsm} onChange={(optimizeDsm) => updateMission((m) => ({ ...m, refine: { ...m.refine, optimizeDsm } }))} label={t('page.tour.optimizeDsm')} />}
              <div className="row end">
                {mission.flight && <span className={'tag ' + (stale ? 'warn' : 'good')}>{t(stale ? 'missionBox.flightOld' : 'missionBox.flight')}</span>}
                <button type="button" className="btn primary" disabled={!result.ok || !!busy} onClick={calculateFlight}>{t('page.tour.calculate')}</button>
              </div>
              <p className="note">{t('page.tour.calculateNote')}</p>
            </Panel>
            <Panel title={t('page.transfer.ends')}>
              <div className="grid2">
                <Field label={t('plan.parkingAltitude')}><NumberInput value={plan.parkingAltitude} unit="km" min={0} max={1e6} onChange={(v) => setPlan((p) => { p.parkingAltitude = v; })} /></Field>
                <ArrivalInputs plan={plan} detail onChange={(arrival) => setPlan((p) => { p.arrival = arrival; })} />
              </div>
              <Check checked={!!plan.soiTime} onChange={(v) => setPlan((p) => { p.soiTime = v; })} label={t('page.tour.soiTime')} />
            </Panel>
          </div>
          <div className="stack">
            <div className="cols even">
              <Panel title={t('page.transfer.plot')}><OrbitPlot plan={plan} result={result} /></Panel>
              <Panel title={<>{t('page.tour.tisserand')} <Src kind="tisserand" /></>}><TisserandPlot plan={plan} result={result} /></Panel>
            </div>
            <Panel title={<>{t('page.tour.optimizer')} <Src kind="optimizer" /></>}>
              <Field label={t('page.tour.objective')}><Select value={objective} onChange={setObjective} options={OBJECTIVES.map((o) => ({ value: o, label: t('page.tour.objectives.' + o) }))} /></Field>
              <Check checked={freeDsm} onChange={setFreeDsm} label={t('page.tour.freeDsm')} />
              <Check checked={global} onChange={setGlobal} label={t('page.tour.global')} />
              <div className="grid2">
                <Field label={t('page.tour.range')}><NumberInput value={rangeDays} unit="d" min={1} max={2000} disabled={!global} onChange={setRangeDays} /></Field>
                <Field label={t('page.tour.maxC3')} hint={t('page.tour.maxC3Hint')}><NumberInput value={maxC3} unit="km²/s²" min={0} max={1000} onChange={setMaxC3} /></Field>
              </div>
              <div className="row end">
                {last && Number.isFinite(last.before) && <span className="note" style={{ flex: 1 }}>{t('page.tour.lastRun')} <Val q={deltaV(last.before)} /> → <Val q={deltaV(last.after)} /></span>}
                <button type="button" className="btn" disabled={!!busy || (!free.some(Boolean) && !(freeDsm && hasDsm))} onClick={runOptimizer}>{t('page.tour.optimize')}</button>
              </div>
              <p className="note">{t('page.tour.optimizerNote')}</p>
            </Panel>
          </div>
        </div>
      ) : <div className="banner bad">{t('plan.notOk')}</div>}
    </>
  );
}
