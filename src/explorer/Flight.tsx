/**
 * Flight screen of the Explorer mode: the flight in the 3D view with a small set of readouts and controls.
 * All values come from the trajectory of the mission in work: the Expert mode shows the same numbers with all digits.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/store';
import { system } from '../app/system';
import { clock, useClock } from '../app/clock';
import { t, bodyName, bodyIn } from '../i18n';
import type { Mission } from '../engine/mission';
import type { Trajectory, TrajectoryEvent } from '../engine/propagate';
import { norm } from '../engine/vec';
import { BODIES, NOMINAL_RADIUS } from '../engine/bodies';
import { DAY, formatEt } from '../engine/time';
import { deltaV, distanceShort, duration, fixed, q, speed } from '../app/format';
import type { Scene3D } from '../render/scene/Scene3D';
import { SceneNote, useSceneInfo } from '../ui/View3D';
import { Transport, eventMarks } from '../ui/Transport';
import { IconBack, IconNumbers, IconRocket } from '../ui/icons';
import { useNarrow, useShort } from '../ui/media';
import { made } from './start';

function eventTitle(e: TrajectoryEvent): string {
  if (e.type === 'periapsis' || e.type === 'impact') return t('explorer.flight.event.' + e.type, { body: bodyIn(e.body ?? '') });
  return t('explorer.flight.event.' + e.type);
}
function eventDetail(e: TrajectoryEvent): string {
  if (e.type === 'maneuver' && e.dvIcrf) return t('explorer.flight.maneuverDetail', { dv: q(deltaV(norm(e.dvIcrf))) });
  // A body with no radius in the database has no altitude: the distance from its center shows.
  if (e.type === 'periapsis' && e.body && NOMINAL_RADIUS.has(e.body) && e.radius !== undefined && e.speed !== undefined) {
    return t('explorer.flight.centerDetail', { distance: q(distanceShort(e.radius)), body: bodyIn(e.body), speed: q(speed(e.speed, 2)) });
  }
  if (e.type === 'periapsis' && e.altitude !== undefined && e.speed !== undefined) {
    return t('explorer.flight.approachDetail', { altitude: q(distanceShort(e.altitude)), body: bodyIn(e.body ?? ''), speed: q(speed(e.speed, 2)) });
  }
  return '';
}

export function Flight({ scene, mission, trajectory }: { scene: Scene3D | null; mission: Mission; trajectory: Trajectory }) {
  const go = useApp((s) => s.go);
  const result = useApp((s) => s.planResult);
  const info = useSceneInfo(scene, 250);
  const { et, playing } = useClock(150);
  const narrow = useNarrow();
  const short = useShort();
  const sys = system();
  const et0 = trajectory.et0, et1 = trajectory.et1;
  const lo = Math.min(et0, et1), hi = Math.max(et0, et1);
  const events = trajectory.events;
  const marks = useMemo(() => eventMarks(events), [events]);
  // The text of the last event that the time went through, with the other events at the same time (an arrival
  // burn is at a periapsis).
  const [caption, setCaption] = useState<TrajectoryEvent[] | null>(null);
  const atTime = (e: TrajectoryEvent): TrajectoryEvent[] => events.filter((x) => x.type !== 'end' && Math.abs(x.et - e.et) < 1);
  // A small screen has little space: the flight data are closed until the user opens them.
  const [showData, setShowData] = useState(() => !window.matchMedia('(max-width: 720px), (max-height: 520px)').matches);
  const before = useRef(et);

  // Start of the screen: a new flight starts to play from its start. A flight that was in view before continues.
  useEffect(() => {
    if (!scene) return;
    scene.setLayers({ labels: true, orbits: true, smallBodies: false });
    if (made.autoStart) {
      made.autoStart = false;
      clock.set(et0);
      before.current = et0;
      clock.setRate(clock.rate, true);
      scene.setDirector(true, { immediate: true });
      clock.play(true);
      const start = events.find((e) => e.type === 'start');
      setCaption(start ? atTime(start) : null);
    } else scene.setDirector(true, { immediate: true });
    return () => { clock.play(false); scene.setDirector(false); };
  }, [scene, trajectory]); // eslint-disable-line react-hooks/exhaustive-deps
  // The controls cover the lower part of the view.
  useEffect(() => { scene?.setShift(0, narrow ? 0.18 : short ? 0.14 : 0.07); }, [scene, narrow, short]);

  // An event that the time of the view goes through shows for some seconds.
  useEffect(() => {
    const a = before.current;
    before.current = et;
    if (et === a) return;
    // The time goes forward through an event, or a control puts the time on an event.
    let hit: TrajectoryEvent | null = null;
    for (const e of events) if (e.type !== 'end' && ((e.et > a && e.et <= et) || e.et === et)) hit = e;
    if (hit) setCaption(atTime(hit));
    // A change of the time by hand removes the text of an event that is not at the new time.
    else if (!playing) setCaption(null);
  }, [et, events]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!caption) return;
    const timer = window.setTimeout(() => setCaption(null), 7000);
    return () => clearTimeout(timer);
  }, [caption]);

  const etc = Math.max(lo, Math.min(hi, et));
  const s = trajectory.stateAt(etc);
  const sun = sys.state('SUN', etc), earth = sys.state('EARTH', etc);
  const dist = (a: ArrayLike<number>, b: ArrayLike<number>): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const near = info?.near && info.near.distanceKm < 80 * (sys.hasBody(info.near.id) ? (info.near.distanceKm - info.near.altitudeKm) : 0) ? info.near : null;
  const next = events.find((e) => e.et > et + 1 && e.type !== 'start');
  // Body of the view button: the body that the spacecraft is near, or the next body of the flight, or the last one.
  // After the last body, a planet (or a body with no parent planet) comes before its moons.
  const isVisit = (e: TrajectoryEvent): boolean => (e.type === 'periapsis' || e.type === 'impact') && !!e.body;
  const visits = events.filter(isVisit);
  const last = [...visits].reverse().find((e) => BODIES[e.body!]?.parent === 'SUN') ?? visits[visits.length - 1];
  const target = near?.id ?? visits.find((e) => e.et > et)?.body ?? last?.body ?? 'EARTH';
  const done = !playing && et >= hi - 1e-6 * (hi - lo);
  const burns = events.filter((e) => e.type === 'maneuver' && e.dvIcrf).reduce((sum, e) => sum + norm(e.dvIcrf!), 0);
  const total = Math.max(1, Math.ceil((hi - lo) / DAY));
  const day = Math.min(total, Math.floor((etc - lo) / DAY) + 1);
  const auto = info?.director != null;
  const focus = info?.focus;

  const again = (): void => {
    clock.set(et0);
    before.current = et0;
    clock.setRate(clock.rate, true);
    scene?.setDirector(true, { immediate: true });
    clock.play(true);
  };
  const numbers = (): void => go({ mode: 'expert', page: 'mission' });

  return (
    <div className={'xp-flight' + (done ? ' done' : '')}>
      <header className="xp-top" data-cover>
        <button type="button" className="btn icon" aria-label={t('explorer.flight.back')} title={t('explorer.flight.back')} onClick={() => go({ mode: 'explorer', page: 'home' })}><IconBack /></button>
        <div className="xp-title">
          <b>{mission.name}</b>
          <span className="xp-when"><span><span className="num">{formatEt(etc, 'UTC', 'minute')}</span><span className="unit">UTC</span></span><span className="sep"> · </span><span>{t('explorer.flight.day', { n: fixed(day, 0), total: fixed(total, 0) })}</span></span>
        </div>
        <button type="button" className="btn" title={t('explorer.flight.numbersTitle')} onClick={numbers}><IconNumbers />{t('explorer.flight.numbers')}</button>
      </header>

      <section className={'xp-data' + (showData ? '' : ' closed')} aria-label={t('explorer.flight.readouts')} data-cover>
        <button type="button" className="xp-data-toggle" aria-expanded={showData} onClick={() => setShowData((v) => !v)}>{t('explorer.flight.readouts')}</button>
        {showData && (
          <dl>
            <dt>{t('explorer.flight.speed')}</dt><dd><span className="num">{speed(dist(s.v, sun.v), 2).text}</span><span className="unit">km/s</span></dd>
            <dt>{t('explorer.flight.fromEarth')}</dt><dd><span className="num">{distanceShort(dist(s.r, earth.r)).text}</span><span className="unit">{distanceShort(dist(s.r, earth.r)).unit}</span></dd>
            <dt>{t('explorer.flight.fromSun')}</dt><dd><span className="num">{distanceShort(dist(s.r, sun.r)).text}</span><span className="unit">{distanceShort(dist(s.r, sun.r)).unit}</span></dd>
            {near && (NOMINAL_RADIUS.has(near.id)
              ? <><dt>{t('explorer.flight.centerDistance', { body: bodyIn(near.id) })}</dt><dd><span className="num">{distanceShort(near.distanceKm).text}</span><span className="unit">{distanceShort(near.distanceKm).unit}</span></dd></>
              : <><dt>{t('explorer.flight.altitude', { body: bodyIn(near.id) })}</dt><dd><span className="num">{distanceShort(near.altitudeKm).text}</span><span className="unit">{distanceShort(near.altitudeKm).unit}</span></dd></>)}
            {next && <><dt>{t('explorer.flight.next')}</dt><dd className="xp-next">{eventTitle(next)}<br /><span className="dim">{t('explorer.flight.inTime', { time: q(duration(next.et - et)) })}</span></dd></>}
          </dl>
        )}
      </section>

      <div className="xp-views" role="group" aria-label={t('explorer.flight.views.label')} data-cover>
        <button type="button" className={'btn small' + (auto ? ' on' : '')} aria-pressed={auto} onClick={() => scene?.setDirector(!auto)}>{t('explorer.flight.views.auto')}</button>
        <button type="button" className={'btn small' + (!auto && focus?.kind === 'craft' ? ' on' : '')} onClick={() => { scene?.setDirector(false); scene?.viewCraft(); }}>{t('explorer.flight.views.craft')}</button>
        <button type="button" className={'btn small' + (!auto && focus?.kind === 'body' && focus.id === target ? ' on' : '')} onClick={() => { scene?.setDirector(false); scene?.viewBody(target); }}>{bodyName(target)}</button>
        <button type="button" className={'btn small' + (!auto && focus?.kind === 'body' && focus.id === 'SUN' ? ' on' : '')} onClick={() => { scene?.setDirector(false); scene?.viewSystem(); }}>{t('explorer.flight.views.system')}</button>
      </div>

      {caption && !done && (
        <div className="xp-caption" role="status" data-cover>
          {caption.map((e, k) => (
            <Fragment key={k}>
              <b>{eventTitle(e)}</b>
              {eventDetail(e) && <span>{eventDetail(e)}</span>}
            </Fragment>
          ))}
          <span className="dim"><span className="num">{formatEt(caption[0].et, 'UTC', 'minute')}</span><span className="unit">UTC</span></span>
        </div>
      )}
      {done && (
        <section className="xp-done" aria-label={t('explorer.flight.done.title')} data-cover>
          <h2>{t('explorer.flight.done.title')}</h2>
          <dl className="kv">
            <dt>{t('explorer.flight.done.time')}</dt><dd><span className="num">{duration(hi - lo).text}</span><span className="unit">{duration(hi - lo).unit}</span></dd>
            {result && <><dt>{t('explorer.flight.done.launchEnergy')}</dt><dd><span className="num">{fixed(result.departure.c3, 1)}</span><span className="unit">km²/s²</span></dd></>}
            <dt>{t('explorer.flight.done.dv')}</dt><dd><span className="num">{deltaV(burns).text}</span><span className="unit">{deltaV(burns).unit}</span></dd>
          </dl>
          <div className="row">
            <button type="button" className="btn primary" onClick={again}><IconRocket />{t('explorer.flight.done.again')}</button>
            <button type="button" className="btn" onClick={numbers}><IconNumbers />{t('explorer.flight.done.numbers')}</button>
            <button type="button" className="btn" onClick={() => go({ mode: 'explorer', page: 'home' })}>{t('explorer.flight.done.new')}</button>
          </div>
        </section>
      )}

      <div className="xp-bottom">
        <SceneNote scene={scene} flight />
        <Transport et0={et0} et1={et1} marks={marks} />
      </div>
    </div>
  );
}
