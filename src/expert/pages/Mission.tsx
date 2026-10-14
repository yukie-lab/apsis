/** Mission screen: open or make a mission; the summary of the mission in work, its flight and its comparison with the actual mission. */
import { useMemo, useRef, useState } from 'react';
import { useApp, missionFileText } from '../../app/store';
import { clock, useClock } from '../../app/clock';
import { system } from '../../app/system';
import { engine, EngineError } from '../../app/engine';
import { t, bodyName, bodyIn, craftName } from '../../i18n';
import { FAMOUS, famousFacts, newMission, missionFromJson, dvCapacity, propellantFor, type Mission as MissionT, type SpacecraftSpec } from '../../engine/mission';
import type { RefineReport } from '../../engine/flight';
import type { Trajectory, TrajectoryEvent } from '../../engine/propagate';
import { norm } from '../../engine/vec';
import { tdb, DAY } from '../../engine/time';
import { deltaV, speed, distance, duration, fixed, mass, sig, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { Field, NumberInput, Panel, Select, Seg, downloadText } from '../../ui/controls';
import { View3D, SceneNote, SceneViews } from '../../ui/View3D';
import { Transport, eventMarks } from '../../ui/Transport';
import type { Scene3D } from '../../render/scene/Scene3D';
import { confirm } from '../../ui/Confirm';
import { PageHead, Dt } from '../common';
import { BudgetTable, simplePlan } from '../planParts';
import { OrbitPlot } from '../OrbitPlot';
import { FlightPlot } from '../FlightPlot';
import { compareWithFacts } from '../../validation/selfcheck';
import { SPACECRAFT_KINDS } from '../../app/spacecraftKinds';

const num = (text: string, unit = ''): Quantity => ({ text, unit });
const sequence = (bodies: string[]): string => bodies.map(bodyName).join(' → ');

function useOpeners() {
  const openMission = useApp((s) => s.openMission);
  const setBusy = useApp((s) => s.setBusy);
  const fail = useApp((s) => s.fail);
  const mission = useApp((s) => s.mission);
  const go = useApp((s) => s.go);
  const canReplace = async () => !mission || (await confirm(t('mission.replaceQuestion', { name: mission.name }), t('mission.replace')));
  return {
    async famous(id: string) {
      if (useApp.getState().busy || !(await canReplace())) return;
      setBusy({ task: 'solve', stage: 'plan', fraction: null });
      try {
        const solved = await engine.famous(id, craftName(id, FAMOUS.find((f) => f.id === id)?.name), (p) => setBusy({ task: 'solve', stage: p.text ?? '', fraction: null }));
        setBusy(null);
        await openMission(solved.mission, solved);
      } catch (e) { setBusy(null); fail(e instanceof EngineError ? e.code : 'internal'); }
    },
    async fresh() {
      if (!(await canReplace())) return;
      await openMission(newMission(t('mission.defaultName', { from: bodyName('EARTH'), to: bodyName('MARS') }), simplePlan('EARTH', 'MARS')));
      go({ mode: 'expert', page: 'tour' });
    },
    async stored(m: MissionT) { if (await canReplace()) await openMission(m); },
    async file(file: File) {
      if (!(await canReplace())) return;
      try { await openMission(missionFromJson(await file.text())); } catch (e) { fail('file:' + (e instanceof Error ? e.message : 'json')); }
    },
  };
}

function Start() {
  const open = useOpeners();
  const library = useApp((s) => s.library);
  const removeFromLibrary = useApp((s) => s.removeFromLibrary);
  const busy = useApp((s) => s.busy);
  const go = useApp((s) => s.go);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="cols even">
      <div className="stack">
        <Panel title={t('page.mission.start')}>
          <p className="note">{t('page.mission.startNote')}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void open.fresh()}>{t('mission.new')}</button>
            <button type="button" className="btn" onClick={() => input.current?.click()}>{t('page.mission.readFile')}</button>
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void open.file(f); }} />
            <button type="button" className="btn" onClick={() => go({ mode: 'expert', page: 'files' })}>{t('page.mission.otherFiles')}</button>
          </div>
        </Panel>
        <Panel title={t('page.mission.library')}>
          {library.length === 0 ? <p className="note">{t('page.mission.libraryEmpty')}</p> : (
            <div className="scroll"><table className="data wrap">
              <thead><tr><th>{t('common.name')}</th><th>{t('page.mission.sequence')}</th><th /></tr></thead>
              <tbody>
                {library.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.plan ? sequence(m.plan.nodes.map((n) => n.body)) : t('page.mission.flightOnly')}</td>
                    <td className="r nw">
                      <button type="button" className="btn small" onClick={() => void open.stored(m)}>{t('page.mission.open')}</button>{' '}
                      <button type="button" className="btn small" onClick={() => removeFromLibrary(m.id)}>{t('common.remove')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          <p className="note">{t('page.mission.libraryNote')}</p>
        </Panel>
      </div>
      <Panel title={<>{t('page.mission.actual')} <Src kind="flight.real" /></>}>
        <p className="note">{t('page.mission.actualNote')}</p>
        <div className="scroll"><table className="data wrap">
          <thead><tr><th>{t('page.mission.spacecraft')}</th><th>{t('page.mission.sequence')}</th><th>{t('page.mission.launch')}</th><th /></tr></thead>
          <tbody>
            {FAMOUS.map((f) => {
              const facts = famousFacts(f.id);
              return (
                <tr key={f.id}>
                  <td className="nw">{craftName(f.id, f.name)}</td>
                  <td>{sequence(['EARTH', ...facts.encounters.map((e) => e.body)])}</td>
                  <td className="nw"><Dt et={tdb(facts.startTdb)} precision="day" /></td>
                  <td className="r"><button type="button" className="btn small" disabled={!!busy} onClick={() => void open.famous(f.id)}>{t('page.mission.open')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}

function SpacecraftPanel({ mission }: { mission: MissionT }) {
  const updateMission = useApp((s) => s.updateMission);
  const sc = mission.spacecraft;
  const set = (p: Partial<SpacecraftSpec>) => updateMission((m) => ({ ...m, spacecraft: { ...m.spacecraft, ...p } }));
  return (
    <Panel title={<>{t('page.mission.spacecraft')} <Src kind="mass" /></>}>
      <div className="grid2">
        <Field label={t('page.mission.model')}><Select value={sc.kind} onChange={(kind) => set({ kind })} options={SPACECRAFT_KINDS.map((k) => ({ value: k, label: t('spacecraftKind.' + k) }))} /></Field>
        <Field label={t('page.mission.dryMass')}><NumberInput value={sc.dryMassKg} unit="kg" min={1} max={1e6} onChange={(v) => set({ dryMassKg: v })} /></Field>
        <Field label={t('page.mission.propellant')}><NumberInput value={sc.propellantKg} unit="kg" min={0} max={1e7} onChange={(v) => set({ propellantKg: v })} /></Field>
        <Field label={t('page.mission.isp')}><NumberInput value={sc.ispS} unit="s" min={50} max={20000} onChange={(v) => set({ ispS: v })} /></Field>
      </div>
      <dl className="kv">
        <dt>{t('plan.capacity')}</dt><dd><Val q={deltaV(dvCapacity(sc))} kind="mass" /></dd>
      </dl>
      <p className="note">{t(mission.famousId ? 'page.mission.massNoteActual' : 'page.mission.massNote')}</p>
    </Panel>
  );
}

function FlightPanel({ mission, report, trajectory }: { mission: MissionT; report: RefineReport | null; trajectory: Trajectory }) {
  const flight = mission.flight!;
  const sc = mission.spacecraft;
  const burns = trajectory.events.filter((e) => e.type === 'maneuver' && e.dvIcrf);
  const total = burns.reduce((s, e) => s + norm(e.dvIcrf!), 0);
  const used = propellantFor(sc.dryMassKg + sc.propellantKg, total, sc.ispS);
  return (
    <Panel title={<>{t('page.mission.flight')} <Src kind="flight.state" /></>}>
      {trajectory.failure && <div className="banner bad">{t('page.mission.failure.' + trajectory.failure.reason)}</div>}
      {report && !report.converged && <div className="banner warn">{t('page.mission.notConverged')}</div>}
      <dl className="kv">
        <dt>{t('page.mission.origin')}</dt><dd>{t('page.mission.origins.' + (mission.flightOrigin ?? 'manual'))}{report?.converged && <> <span className="tag good">{t('page.mission.converged')}</span></>}</dd>
        <dt>{t('page.mission.start_')}</dt><dd><Dt et={flight.et0} /></dd>
        <dt>{t('page.mission.end')}</dt><dd><Dt et={trajectory.et1} /></dd>
        <dt>{t('plan.tof')}</dt><dd><Val q={duration(trajectory.et1 - trajectory.et0)} /></dd>
        <dt>{t('page.mission.maneuverCount')}</dt><dd><Val q={num(String(burns.length))} /></dd>
        {report && <><dt>{t('page.mission.launchChange')}</dt><dd><Val q={deltaV(report.launchChange)} kind="flight.dv" /></dd></>}
        {report && <><dt>{t('page.mission.tcmTotal')}</dt><dd><Val q={deltaV(report.totalCorrection)} kind="flight.dv" /></dd></>}
        {report && report.totalDsm > 0 && <><dt>{t('plan.dvDsm')}</dt><dd><Val q={deltaV(report.totalDsm)} kind="flight.dv" /></dd></>}
        {report && report.arrivalBurn > 0 && <><dt>{t('page.mission.arrivalBurn')}</dt><dd><Val q={deltaV(report.arrivalBurn)} kind="flight.dv" /></dd></>}
        <dt><b>{t('page.mission.dvFlight')}</b></dt><dd><Val q={deltaV(total)} kind="flight.dv" /></dd>
        <dt>{t('page.mission.propellantUsed')}</dt><dd><Val q={mass(used)} kind="mass" className={used > sc.propellantKg ? 'bad' : ''} /></dd>
        <dt>{t('page.mission.steps')}</dt><dd><Val q={num(fixed(trajectory.t.length, 0))} /></dd>
      </dl>
      {used > sc.propellantKg && <div className="banner warn">{t('plan.noPropellant', { need: fixed(used, 0), have: fixed(sc.propellantKg, 0) })}</div>}
    </Panel>
  );
}

function EncounterCompare({ mission, report }: { mission: MissionT; report: RefineReport }) {
  const result = useApp((s) => s.planResult);
  return (
    <Panel title={<>{t('page.mission.planVsFlight')} <Src kind="flight.encounter" /></>}>
      <div className="scroll">
        <table className="data wrap">
          <thead>
            <tr>
              <th>{t('common.body')}</th><th>{t('page.mission.closest')}</th><th className="r">{t('page.mission.shift')}</th>
              <th className="r">{t('page.mission.altFlight')}</th><th className="r">{t('page.mission.altPlan')}</th>
              <th className="r">{t('page.mission.vinfFlight')}</th><th className="r">{t('page.mission.vinfPlan')}</th>
              <th className="r">B·T</th><th className="r">B·R</th>
            </tr>
          </thead>
          <tbody>
            {report.encounters.map((e, k) => {
              const node = result?.nodes[k + 1];
              const last = k === report.encounters.length - 1;
              const altPlan = node?.flyby && Number.isFinite(node.flyby.altitude) ? node.flyby.altitude : last && mission.plan ? mission.plan.arrival.periapsisAltitude : NaN;
              return (
                <tr key={k} className="click" onClick={() => clock.set(e.et)}>
                  <td>{bodyName(e.body)}</td>
                  <td><Dt et={e.et} precision="minute" /></td>
                  <td className="r"><Val q={duration(e.et - e.etPlanned)} /></td>
                  <td className="r"><Val q={distance(e.altitude, 'km', 0)} /></td>
                  <td className="r">{Number.isFinite(altPlan) ? <Val q={distance(altPlan, 'km', 0)} /> : ''}</td>
                  <td className="r"><Val q={speed(e.vinf)} /></td>
                  <td className="r">{node?.vinfIn ? <Val q={speed(norm(node.vinfIn))} /> : ''}</td>
                  <td className="r"><Val q={distance(e.BdotT, 'km', 0)} /></td>
                  <td className="r"><Val q={distance(e.BdotR, 'km', 0)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="note">{t('page.mission.planVsFlightNote')}</p>
      {report.corrections.length > 0 && (
        <>
          <h3>{t('page.mission.corrections')}</h3>
          <div className="scroll">
            <table className="data wrap">
              <thead><tr><th>{t('common.date')}</th><th>{t('common.type')}</th><th className="r">Δv <Src kind="flight.dv" /></th></tr></thead>
              <tbody>
                {report.corrections.map((c, k) => (
                  <tr key={k} className="click" onClick={() => clock.set(c.et)}>
                    <td><Dt et={c.et} precision="minute" /></td><td>{t('page.mission.kinds.' + c.kind)}</td><td className="r"><Val q={deltaV(c.dv)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <details>
        <summary>{t('page.mission.solver')}</summary>
        <div className="scroll"><table className="data wrap">
          <thead><tr><th>{t('common.body')}</th><th>{t('page.mission.stage')}</th><th className="r">{t('page.mission.iterations')}</th><th className="r">{t('page.mission.residual')}</th><th /></tr></thead>
          <tbody>
            {report.stages.map((s, k) => (
              <tr key={k}>
                <td>{mission.plan ? bodyName(mission.plan.nodes[s.node]?.body ?? '') : s.node}</td><td>{s.stage}</td><td className="r">{s.iterations}</td>
                <td className="r">{s.stage === 'C' ? <Val q={deltaV(s.residual)} /> : <Val q={num(sig(s.residual, 3))} />}</td>
                <td><span className={'tag ' + (s.converged ? 'good' : 'warn')}>{t(s.converged ? 'page.mission.converged' : 'page.mission.notConvergedShort')}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="note">{t('page.mission.solverNote')}</p>
      </details>
    </Panel>
  );
}

function ActualCompare({ id, report, trajectory }: { id: string; report: RefineReport; trajectory: Trajectory }) {
  const rows = useMemo(() => { try { return compareWithFacts(system(), id, { report, trajectory }); } catch { return []; } }, [id, report, trajectory]);
  const facts = famousFacts(id);
  const name = craftName(id, FAMOUS.find((f) => f.id === id)?.name);
  if (rows.length === 0) return null;
  const pct = (a: number, b: number) => (Number.isFinite(a) && b !== 0 ? num(sig((100 * (a - b)) / b, 2), '%') : num('—'));
  return (
    <Panel title={<>{t('page.mission.actualCompare', { name })} <Src kind="flight.real" famousId={id} /></>}>
      <p className="note">{t('page.mission.actualCompareNote', { source: facts.source })}</p>
      <div className="scroll">
        <table className="data wrap">
          <thead>
            <tr>
              <th>{t('common.body')}</th><th>{t('page.mission.closestActual')}</th><th className="r">{t('page.mission.timeDiff')}</th>
              <th className="r">{t('page.mission.radiusFlight')}</th><th className="r">{t('page.mission.radiusActual')}</th><th className="r">{t('page.mission.diff')}</th>
              <th className="r">{t('page.mission.vinfFlight')}</th><th className="r">{t('page.mission.vinfActual')}</th><th className="r">{t('page.mission.diff')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} className="click" onClick={() => clock.set(r.et)}>
                <td className="nw">{bodyName(r.body)}{r.approach && <sup> a</sup>}{r.aim && <sup> b</sup>}</td>
                <td><Dt et={r.etTruth} precision="minute" /></td>
                <td className="r"><Val q={duration(r.et - r.etTruth)} /></td>
                <td className="r"><Val q={distance(r.radius, 'km', 0)} /></td>
                <td className="r"><Val q={distance(r.radiusTruth, 'km', 0)} /></td>
                <td className="r">{r.aim ? <span className="dim">{t('page.mission.input')}</span> : <Val q={pct(r.radius, r.radiusTruth)} />}</td>
                <td className="r"><Val q={speed(r.vinf)} /></td>
                <td className="r"><Val q={speed(r.vinfTruth)} /></td>
                <td className="r"><Val q={pct(r.vinf, r.vinfTruth)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {t('page.mission.actualInputs')}
        {rows.some((r) => r.approach) && <> <sup>a</sup> {t('page.mission.noteApproach')}</>}
        {rows.some((r) => r.aim) && <> <sup>b</sup> {t('page.mission.noteAim')}</>}
      </p>
    </Panel>
  );
}

function eventRow(e: TrajectoryEvent): { label: string; detail: React.ReactNode } {
  if (e.type === 'maneuver') return { label: t('page.mission.event.maneuver'), detail: e.dvIcrf ? <Val q={deltaV(norm(e.dvIcrf))} /> : null };
  if (e.type === 'periapsis' || e.type === 'impact') {
    return { label: t('page.mission.event.' + e.type, { body: bodyIn(e.body ?? '') }), detail: <><Val q={distance(e.altitude ?? NaN, 'km', 0)} /><span className="pair-sep"> <span className="dim">·</span> </span><Val q={speed(e.speed ?? NaN)} /></> };
  }
  return { label: t('page.mission.event.' + e.type), detail: null };
}

function Events({ trajectory }: { trajectory: Trajectory }) {
  const { et } = useClock(300);
  return (
    <Panel title={<>{t('page.mission.events')} <Src kind="flight.event" /></>}>
      <div className="scroll" style={{ maxHeight: 360 }}>
        <table className="data wrap">
          <thead><tr><th>{t('common.date')}</th><th>{t('page.mission.eventCol')}</th><th className="r">{t('page.mission.eventDetail')}</th></tr></thead>
          <tbody>
            {trajectory.events.map((e, k) => {
              const row = eventRow(e);
              const near = Math.abs(e.et - et) < 0.5 * DAY;
              return <tr key={k} className={'click' + (near ? ' sel' : '')} onClick={() => clock.set(e.et)}><td><Dt et={e.et} precision="minute" /></td><td>{row.label}</td><td className="r">{row.detail}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="note">{t('page.mission.eventsNote')}</p>
    </Panel>
  );
}

export default function Mission() {
  const mission = useApp((s) => s.mission);
  const result = useApp((s) => s.planResult);
  const trajectory = useApp((s) => s.trajectory);
  const stale = useApp((s) => s.flightStale);
  const busy = useApp((s) => s.busy);
  const solve = useApp((s) => s.solve);
  const updateMission = useApp((s) => s.updateMission);
  const save = useApp((s) => s.saveToLibrary);
  const close = useApp((s) => s.closeMission);
  const go = useApp((s) => s.go);
  const inLibrary = useApp((s) => !!s.mission && s.library.some((m) => m.id === s.mission!.id));
  if (!mission) return <><PageHead id="mission" /><Start /></>;
  const report = mission.report ?? null;
  const famous = mission.famousId ? FAMOUS.find((f) => f.id === mission.famousId) : undefined;
  const fileName = (mission.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mission') + '.apsis.json';
  return (
    <>
      <PageHead id="mission" />
      {stale && <div className="banner warn">{t('page.mission.staleNote')}</div>}
      {!mission.flight && <div className="banner">{t('page.mission.noFlight')}</div>}
      <div className="cols">
        <div className="stack">
          <Panel title={t('page.mission.summary')}>
            <Field label={t('common.name')}><input className="input" value={mission.name} maxLength={60} onChange={(e) => updateMission((m) => ({ ...m, name: e.target.value }))} /></Field>
            <dl className="kv">
              <dt>{t('page.mission.sequence')}</dt><dd style={{ textAlign: 'left' }}>{mission.plan ? sequence(mission.plan.nodes.map((n) => n.body)) : t('page.mission.flightOnly')}</dd>
              {famous && <><dt>{t('page.mission.actualOf')}</dt><dd style={{ textAlign: 'left' }}>{craftName(famous.id, famous.name)}</dd></>}
            </dl>
            <div className="row">
              <button type="button" className="btn" onClick={save}>{t(inLibrary ? 'missionBox.saveAgain' : 'page.mission.save')}</button>
              <button type="button" className="btn" onClick={() => downloadText(fileName, missionFileText(mission), 'application/json')}>{t('page.mission.writeFile')}</button>
              <button type="button" className="btn" onClick={close}>{t('common.close')}</button>
            </div>
            <div className="row">
              {mission.plan && <button type="button" className="btn small" onClick={() => go({ mode: 'expert', page: 'tour' })}>{t('page.mission.editPlan')}</button>}
              {mission.flight && <button type="button" className="btn small" onClick={() => go({ mode: 'expert', page: 'maneuvers' })}>{t('page.mission.editManeuvers')}</button>}
              <button type="button" className="btn small" onClick={() => go({ mode: 'explorer', page: trajectory ? 'flight' : 'home' })}>{t('page.mission.toExplorer')}</button>
            </div>
          </Panel>
          <SpacecraftPanel mission={mission} />
        </div>
        <div className="stack">
          <MissionView />
        </div>
      </div>
      <div className="cols even">
        {mission.plan && result && (
          <Panel title={t('plan.budget')}>
            <BudgetTable plan={mission.plan} result={result} spacecraft={mission.spacecraft} />
            <div className="row end">
              {mission.flight && <span className={'tag ' + (stale ? 'warn' : 'good')}>{t(stale ? 'missionBox.flightOld' : 'missionBox.flight')}</span>}
              <button type="button" className={'btn' + (!trajectory || stale ? ' primary' : '')} disabled={!result.ok || !!busy} onClick={() => void solve()}>{t('page.tour.calculate')}</button>
            </div>
          </Panel>
        )}
        {mission.flight && trajectory && <FlightPanel mission={mission} report={stale ? null : report} trajectory={trajectory} />}
      </div>
      {report && !stale && trajectory && mission.famousId && <ActualCompare id={mission.famousId} report={report} trajectory={trajectory} />}
      {report && !stale && <EncounterCompare mission={mission} report={report} />}
      {trajectory && <Events trajectory={trajectory} />}
    </>
  );
}

/** The top view of the plan (two-body arcs) or of the flight. */
function TopView() {
  const mission = useApp((s) => s.mission);
  const result = useApp((s) => s.planResult);
  const { et } = useClock(250);
  const trajectory = useApp((s) => s.trajectory);
  const reference = useApp((s) => s.reference);
  if (mission?.plan && result) return <OrbitPlot plan={mission.plan} result={result} markEt={et} />;
  if (trajectory) return <FlightPlot trajectory={trajectory} markEt={et} reference={reference} />;
  return null;
}

/** The picture of the mission: the 3D view of the flight (the same scene as in the Explorer mode), or the top view. */
function MissionView() {
  const mission = useApp((s) => s.mission);
  const result = useApp((s) => s.planResult);
  const trajectory = useApp((s) => s.trajectory);
  const [mode, setMode] = useState<'3d' | 'top'>('3d');
  const [scene, setScene] = useState<Scene3D | null>(null);
  const watch = useMemo(() => (mission?.plan ? [...new Set(mission.plan.nodes.map((n) => n.body))] : []), [mission?.plan]);
  const craft = useMemo(() => ({ kind: mission?.spacecraft.kind ?? 'apsis', name: mission?.spacecraft.name || mission?.name || '' }), [mission?.spacecraft.kind, mission?.spacecraft.name, mission?.name]);
  const marks = useMemo(() => (trajectory ? eventMarks(trajectory.events) : []), [trajectory]);
  if (!mission || (!trajectory && !(mission.plan && result))) return null;
  if (!trajectory) return <Panel title={t('page.transfer.plot')}><TopView /></Panel>;
  return (
    <Panel title={t('scene.title')} actions={<Seg value={mode} onChange={setMode} label={t('scene.mode')} options={[{ value: '3d', label: t('scene.mode3d') }, { value: 'top', label: t('scene.modeTop') }]} />}>
      {mode === 'top' ? <TopView /> : (
        <>
          <SceneViews scene={scene} flight />
          <View3D className="inpanel" trajectory={trajectory} craft={craft} watch={watch} onScene={(s) => { setScene(s); s?.viewSystem({ immediate: true, fit: true }); }}>
            <SceneNote scene={scene} flight />
          </View3D>
          <Transport et0={trajectory.et0} et1={trajectory.et1} marks={marks} />
        </>
      )}
    </Panel>
  );
}
