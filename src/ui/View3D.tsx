/**
 * The 3D view of the application: a canvas with the scene, the name labels, and the parts that all users of the
 * view share (the notes about the scale, the view buttons). The two modes use this one component: the picture
 * of the Explorer mode and the picture of the Expert mode come from the same scene and the same engine data.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Scene3D, type SceneInfo, type Focus } from '../render/scene/Scene3D';
import type { BodyQuality } from '../render/bodies';
import type { Trajectory } from '../engine/propagate';
import { formatEt } from '../engine/time';
import { system } from '../app/system';
import { clock } from '../app/clock';
import { useApp } from '../app/store';
import { t, hasText, bodyName, bodyIn } from '../i18n';
import { NOMINAL_RADIUS } from '../engine/bodies';
import { BodySelect, Check } from './controls';
import { IconInfo, IconClose } from './icons';

/** A phone or a tablet gets the small textures and the cheaper shaders. */
function quality(): BodyQuality {
  const small = Math.min(window.screen.width, window.screen.height) < 700;
  return small || window.matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}

export interface View3DProps {
  /** Flight to show, or null (the bodies only). */
  trajectory: Trajectory | null;
  craft?: { kind: string; name: string };
  /** Bodies of the mission. */
  watch?: string[];
  className?: string;
  /** Called with the scene when it is ready and with null when it goes away. */
  onScene?: (scene: Scene3D | null) => void;
  /** The user moved the camera while the automatic camera was on. */
  onUserMove?: () => void;
  /** The user selected a name in the view. Default: the camera goes to the object. */
  onPick?: (target: Focus) => void;
  /** Time of the view, et (default: the clock of the application). */
  time?: () => number;
  /** Parts on top of the picture. */
  children?: ReactNode;
}

const NO_CRAFT = { kind: 'apsis', name: '' };
const NO_WATCH: string[] = [];

export function View3D({ trajectory, craft = NO_CRAFT, watch = NO_WATCH, className, onScene, onUserMove, onPick, time, children }: View3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene3D | null>(null);
  const [state, setState] = useState<'ok' | 'none' | 'lost'>('ok');
  const [attempt, setAttempt] = useState(0);
  const custom = useApp((s) => s.custom);
  const handlers = useRef({ onScene, onUserMove, onPick, time });
  handlers.current = { onScene, onUserMove, onPick, time };
  const flight = useRef({ trajectory, craft, watch });
  flight.current = { trajectory, craft, watch };

  useEffect(() => {
    const c = canvas.current!, l = layer.current!;
    let s: Scene3D;
    try {
      s = new Scene3D({
        canvas: c, labelLayer: l, system: system(), quality: quality(), baseUrl: import.meta.env.BASE_URL,
        time: () => (handlers.current.time ? handlers.current.time() : clock.et),
        bodyName,
        onUserMove: () => handlers.current.onUserMove?.(),
        onPick: (target) => {
          if (handlers.current.onPick) handlers.current.onPick(target);
          else if (target.kind === 'craft') s.viewCraft(); else s.viewBody(target.id);
        },
        onRate: (rate) => {
          if (!clock.autoRate || rate === clock.rate) return;
          // While the time runs, the clock tells its listeners at each frame. With the time stopped, this call tells them.
          if (clock.playing) clock.rate = rate; else clock.setRate(rate, true);
        },
        eventName: (e) => (e.body ? t('scene.eventLabel', { body: bodyName(e.body), date: formatEt(e.et, 'UTC', 'day') }) : ''),
        // The time of the view goes to the event.
        onPickEvent: (e) => { if (!handlers.current.time) clock.set(e.et); },
      });
    } catch {
      setState('none');
      return;
    }
    const lost = (e: Event): void => { e.preventDefault(); setState('lost'); };
    c.addEventListener('webglcontextlost', lost);
    scene.current = s;
    // Development only: the test scripts set the camera and the time through this handle.
    if (import.meta.env.DEV) Object.assign(window, { __scene: s, __clock: clock, __store: useApp });
    const f = flight.current;
    s.setFlight(f.trajectory, f.craft, f.watch);
    handlers.current.onScene?.(s);
    setState('ok');
    return () => {
      c.removeEventListener('webglcontextlost', lost);
      handlers.current.onScene?.(null);
      scene.current = null;
      s.dispose();
    };
  }, [attempt]);

  const watchKey = watch.join(' ');
  useEffect(() => { scene.current?.setFlight(trajectory, craft, watch); }, [trajectory, craft.kind, craft.name, watchKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.syncBodies(); }, [custom]);

  return (
    <div className={'view3d' + (className ? ' ' + className : '')}>
      <canvas ref={canvas} key={attempt} tabIndex={0} aria-label={t('scene.label')} />
      <div className="labels" ref={layer} />
      {state !== 'ok' && (
        <div className="view3d-fail">
          <p>{t(state === 'none' ? 'scene.noWebgl' : 'scene.lost')}</p>
          {state === 'lost' && <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>{t('scene.restart')}</button>}
        </div>
      )}
      {state === 'ok' && children}
    </div>
  );
}

/** Values of the scene for a component (a copy, some times each second). */
export function useSceneInfo(scene: Scene3D | null, intervalMs = 250): SceneInfo | null {
  const [info, setInfo] = useState<SceneInfo | null>(null);
  useEffect(() => {
    if (!scene) { setInfo(null); return; }
    let key = '';
    const read = (): void => {
      const i = scene.info;
      // A new object only when a value that the components show has changed.
      const k = [i.focus.kind, i.focus.kind === 'body' ? i.focus.id : '', i.near?.id ?? '', i.pathFrames.join(','), i.craftModel, i.director ?? '', Math.round(Math.log(Math.max(i.cameraDistanceKm, 1e-9)) * 20), Math.round(Math.log(Math.max(i.near?.distanceKm ?? 1, 1e-9)) * 200)].join('|');
      if (k === key) return;
      key = k;
      setInfo({ ...i, near: i.near ? { ...i.near } : null, pathFrames: [...i.pathFrames] });
    };
    read();
    const timer = window.setInterval(read, intervalMs);
    return () => clearInterval(timer);
  }, [scene, intervalMs]);
  return info;
}

/** How the scene makes the picture of a body (the notes can change while the maps load). */
function usePicture(scene: Scene3D | null, id: string | null): { provenance: string; notes: string[] } | null {
  const [picture, setPicture] = useState<{ provenance: string; notes: string[] } | null>(null);
  useEffect(() => {
    if (!scene || !id) { setPicture(null); return; }
    let key = '';
    const read = (): void => {
      const p = scene.picture(id);
      const k = p ? p.provenance + '|' + p.notes.join(',') : '';
      if (k === key) return;
      key = k;
      setPicture(p ? { provenance: p.provenance, notes: [...p.notes] } : null);
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => clearInterval(timer);
  }, [scene, id]);
  return picture;
}

/** What is a photograph and what is a calculation in the picture of a body. */
function PictureNotes({ id, picture }: { id: string; picture: { provenance: string; notes: string[] } }) {
  const notes = picture.notes.filter((n) => hasText('picture.note.' + n));
  // The first note of a calculated surface says the same as the summary line.
  const lines = picture.provenance === 'procedural' ? notes.filter((n) => n !== 'surface-procedural') : notes;
  return (
    <div className="scene-picture">
      <h4>{t('picture.title', { body: bodyIn(id) })}</h4>
      <ul>
        <li>{t('picture.provenance.' + picture.provenance)}</li>
        {lines.map((n) => <li key={n}>{t('picture.note.' + n)}</li>)}
        {id === 'EARTH' && !picture.notes.includes('no-clouds') && <li>{t('picture.earthClouds')}</li>}
        {NOMINAL_RADIUS.has(id) && <li>{t('picture.nominalSize')}</li>}
      </ul>
      <a href="#/about/maps">{t('picture.sources')}</a>
    </div>
  );
}

/**
 * The notes of the view: the scale, the frame of the flight path, the example attitude, and how the picture of
 * the body in view is made. The short line always shows. The button opens the full text.
 */
export function SceneNote({ scene, flight }: { scene: Scene3D | null; flight: boolean }) {
  const info = useSceneInfo(scene, 400);
  const [open, setOpen] = useState(false);
  const frames = info?.pathFrames ?? [];
  const path = !flight ? null : frames.length ? t('scene.pathBody', { body: bodyIn(frames[0]) }) : t('scene.pathSsb');
  const body = info ? (info.focus.kind === 'body' ? info.focus.id : info.near?.id ?? null) : null;
  const picture = usePicture(scene, open ? body : null);
  return (
    <div className={'scene-note' + (open ? ' open' : '')}>
      <button type="button" className="scene-note-line" aria-expanded={open} title={t('scene.notes')} onClick={() => setOpen((v) => !v)}>
        {open ? <IconClose /> : <IconInfo />}
        <span><b>{t('scene.trueScale')}</b>{path && <> · {path}</>}</span>
      </button>
      {open && (
        <div className="scene-note-text">
          {body && picture && <PictureNotes id={body} picture={picture} />}
          <p>{t('scene.scaleNote')}</p>
          {flight && <p>{t('scene.attitudeNote')}</p>}
          {flight && <p>{t('scene.perspectiveNote')}</p>}
          <p>{t('scene.effectsNote')}</p>
          <p>{t('scene.howTo')}</p>
          {flight && (
            <ul className="scene-legend">
              <li><i className="past" />{t('scene.legend.past')}</li>
              <li><i className="future" />{t('scene.legend.future')}</li>
              <li><i className="maneuver" />{t('scene.legend.maneuver')}</li>
              <li><i className="approach" />{t('scene.legend.approach')}</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** View buttons of the Expert mode: spacecraft, a body, the solar system, the automatic camera, the layers. */
export function SceneViews({ scene, flight }: { scene: Scene3D | null; flight: boolean }) {
  const info = useSceneInfo(scene, 300);
  const [labels, setLabels] = useState(true);
  const [orbits, setOrbits] = useState(true);
  const [small, setSmall] = useState(false);
  const focus = info?.focus;
  const body = focus?.kind === 'body' ? focus.id : '';
  const auto = info?.director != null;
  if (!scene) return null;
  return (
    <div className="scene-views" role="group" aria-label={t('scene.view.label')}>
      {flight && <button type="button" className={'btn small' + (focus?.kind === 'craft' && !auto ? ' on' : '')} onClick={() => { scene.setDirector(false); scene.viewCraft(); }}>{t('scene.view.craft')}</button>}
      <button type="button" className={'btn small' + (body === 'SUN' && !auto ? ' on' : '')} onClick={() => { scene.setDirector(false); scene.viewSystem(); }}>{t('scene.view.system')}</button>
      <BodySelect value={body || 'SUN'} label={t('scene.view.body')} onChange={(id) => { scene.setDirector(false); scene.viewBody(id); }} />
      {flight && <Check checked={auto} label={t('scene.view.auto')} onChange={(v) => scene.setDirector(v)} />}
      <Check checked={labels} label={t('scene.layers.labels')} onChange={(v) => { setLabels(v); scene.setLayers({ labels: v }); }} />
      <Check checked={orbits} label={t('scene.layers.orbits')} onChange={(v) => { setOrbits(v); scene.setLayers({ orbits: v }); }} />
      <Check checked={small} label={t('scene.layers.smallBodies')} onChange={(v) => { setSmall(v); scene.setLayers({ smallBodies: v }); }} />
    </div>
  );
}
