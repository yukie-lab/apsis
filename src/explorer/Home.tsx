/** Start screen of the Explorer mode: select a destination or an actual mission, then launch. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp, nowEt } from '../app/store';
import { system, assetUrl } from '../app/system';
import { clock } from '../app/clock';
import { engine, EngineError } from '../app/engine';
import { t, bodyName, bodyIn } from '../i18n';
import { BODIES, MEAN_RADIUS, NOMINAL_RADIUS } from '../engine/bodies';
import { FAMOUS, famousFacts, quickTargets, DEFAULT_SPACECRAFT, type QuickGoal, type QuickStyle } from '../engine/mission';
import { tdb, formatEt } from '../engine/time';
import { distanceShort } from '../app/format';
import { loadManifest, type TextureManifest } from '../render/bodies';
import type { Scene3D } from '../render/scene/Scene3D';
import { DateInput, Seg, Select } from '../ui/controls';
import { SceneNote } from '../ui/View3D';
import { confirm } from '../ui/Confirm';
import { IconClose, IconRocket } from '../ui/icons';
import { SPACECRAFT_KINDS } from '../app/spacecraftKinds';
import { made } from './start';

let manifestCache: Promise<TextureManifest> | null = null;
/** Small maps of the bodies for the buttons (the files of the 3D view). */
function useThumbs(): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    let alive = true;
    manifestCache ??= loadManifest(import.meta.env.BASE_URL);
    manifestCache.then((m) => {
      if (!alive) return;
      const out = new Map<string, string>();
      for (const e of m.textures) if (e.role === 'color' && typeof e.small === 'string') out.set(e.body, assetUrl(e.small));
      setMap(out);
    }).catch(() => { manifestCache = null; });
    return () => { alive = false; };
  }, []);
  return map;
}

export function useNarrow(): boolean {
  const query = '(max-width: 720px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = (): void => setNarrow(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return narrow;
}

/** The question before a new mission replaces a mission that the user changed. */
async function canReplace(): Promise<boolean> {
  const m = useApp.getState().mission;
  if (!m || m === made.mission) return true;
  return confirm(t('mission.replaceQuestion', { name: m.name }), t('mission.replace'));
}

function Thumb({ id, thumbs }: { id: string; thumbs: Map<string, string> }) {
  const url = thumbs.get(id);
  return <span className="thumb" style={url ? { backgroundImage: `url("${url}")` } : { background: BODIES[id]?.color }} />;
}

export function Home({ scene, tab, time }: { scene: Scene3D | null; tab: 'make' | 'famous'; time: () => number }) {
  const go = useApp((s) => s.go);
  const mission = useApp((s) => s.mission);
  const hasFlight = useApp((s) => !!s.trajectory);
  const busy = useApp((s) => s.busy);
  const thumbs = useThumbs();
  const narrow = useNarrow();
  const targets = useMemo(() => quickTargets(), []);
  const [target, setTarget] = useState<string | null>(null);
  const [famous, setFamous] = useState<string | null>(null);
  const [goal, setGoal] = useState<QuickGoal>('flyby');
  const [style, setStyle] = useState<QuickStyle>('efficient');
  const [after, setAfter] = useState(() => nowEt());
  const [kind, setKind] = useState<string>('apsis');
  const [now, setNow] = useState(time);
  const first = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  /** The part of the view that the panels do not cover: its middle (in half-sizes of the view) and its size (px). */
  const [free, setFree] = useState<{ x: number; y: number; w: number; h: number; side: number } | null>(null);

  useEffect(() => { const timer = window.setInterval(() => setNow(time()), 1000); return () => clearInterval(timer); }, [time]);

  const goals = targets.find((x) => x.id === target)?.goals ?? [];
  useEffect(() => { if (target && !goals.includes(goal)) setGoal('flyby'); }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = famous ? famousFacts(famous) : null;
  const look = tab === 'make' ? target : facts ? facts.encounters[facts.encounters.length - 1].body : null;
  const open = tab === 'make' ? target !== null : famous !== null;

  // Measure the part of the view that the text and the panels do not cover: the body shows in the middle of it.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = (): void => {
      const view = el.getBoundingClientRect();
      if (view.width < 20 || view.height < 20) return;
      const rect = (sel: string): DOMRect | undefined => el.querySelector(sel)?.getBoundingClientRect();
      const hero = rect('.xp-hero'), tray = rect('.xp-tray'), card = rect('.xp-card'), note = rect('.scene-note-line');
      const top = hero ? hero.bottom : view.top;
      let bottom = tray ? tray.top : view.bottom, right = view.right;
      // A wide panel is below the body. A narrow panel is at the side of the body.
      if (card && card.width > 0.7 * view.width) bottom = Math.min(bottom, card.top);
      else if (card) right = card.left;
      if (note && note.width > 0.4 * (right - view.left)) bottom = Math.min(bottom, note.top);
      const w = Math.max(60, right - view.left), h = Math.max(60, bottom - top);
      const next = {
        x: Math.round((((view.left + right) / 2 - (view.left + view.width / 2)) / (view.width / 2)) * 100) / 100,
        y: Math.round((-((top + bottom) / 2 - (view.top + view.height / 2)) / (view.height / 2)) * 100) / 100,
        w: Math.round(w / 8) * 8, h: Math.round(h / 8) * 8, side: Math.min(view.width, view.height),
      };
      setFree((old) => (old && old.x === next.x && old.y === next.y && old.w === next.w && old.h === next.h && old.side === next.side ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.querySelectorAll('.xp-hero, .xp-tray, .xp-card')) observer.observe(child);
    return () => observer.disconnect();
  }, [open, narrow, tab]);

  // The camera goes to the body of the selection. With no selection it looks at the Earth.
  const lookAt = look ?? 'EARTH';
  useEffect(() => {
    if (!scene || !free) return;
    scene.setDirector(false);
    scene.setLayers({ labels: true, orbits: false, smallBodies: false });
    // Rings are wide and flat: they can use more of the width.
    const size = Math.min(free.w, free.h * (BODIES[lookAt]?.rings ? 1.7 : 1));
    scene.viewBody(lookAt, { immediate: first.current, fill: (0.8 * size) / free.side });
    scene.setShift(free.x, free.y, first.current);
    scene.setSpin(0.02);
    first.current = false;
  }, [scene, lookAt, free]);
  useEffect(() => () => { scene?.setSpin(0); }, [scene]);

  const begin = (): void => {
    made.mission = useApp.getState().mission;
    made.autoStart = true;
    clock.setRate(clock.rate, true);
    go({ mode: 'explorer', page: 'flight' });
  };
  const launch = async (): Promise<void> => {
    const app = useApp.getState();
    if (app.busy || !target || !(await canReplace())) return;
    app.setBusy({ task: 'quick', stage: 'window', fraction: null });
    try {
      const name = t('explorer.missionName', { body: bodyName(target) });
      const { solved } = await engine.quick({ target, goal, after, style }, name, { ...DEFAULT_SPACECRAFT, kind }, (p) => app.setBusy({ task: 'quick', stage: p.text ?? '', fraction: null }));
      app.setBusy(null);
      await app.openMission(solved.mission, solved);
      begin();
    } catch (e) { app.setBusy(null); app.fail(e instanceof EngineError ? e.code : 'internal'); }
  };
  const fly = async (): Promise<void> => {
    const app = useApp.getState();
    if (app.busy || !famous || !(await canReplace())) return;
    app.setBusy({ task: 'solve', stage: 'plan', fraction: null });
    try {
      const solved = await engine.famous(famous, (p) => app.setBusy({ task: 'solve', stage: p.text ?? '', fraction: null }));
      app.setBusy(null);
      await app.openMission(solved.mission, solved);
      begin();
    } catch (e) { app.setBusy(null); app.fail(e instanceof EngineError ? e.code : 'internal'); }
  };

  const sys = system();
  const body = target ? BODIES[target] : null;
  const distance = target && sys.hasBody(target) ? (() => { const r = sys.stateRel(target, 'EARTH', now).r; return Math.hypot(r[0], r[1], r[2]); })() : NaN;
  const info = famous ? FAMOUS.find((f) => f.id === famous) : undefined;

  return (
    <div className="xp-home" ref={root}>
      {!(narrow && open) && (
        <header className="xp-hero">
          <h1>{t('explorer.headline')}</h1>
          <p>{t('explorer.sub')}</p>
          <p className="xp-live">{t('explorer.live', { date: formatEt(now, 'UTC', 'second') + ' UTC' })}</p>
          {mission && hasFlight && <button type="button" className="btn" onClick={() => { made.autoStart = false; go({ mode: 'explorer', page: 'flight' }); }}>{t('explorer.continue', { name: mission.name })}</button>}
        </header>
      )}
      <div className="xp-mid">
        <SceneNote scene={scene} flight={false} />
        {tab === 'make' && body && target && (
          <section className="xp-card" aria-label={bodyName(target)}>
            <header>
              <Thumb id={target} thumbs={thumbs} />
              <h2>{bodyName(target)}</h2>
              <button type="button" className="btn ghost icon" aria-label={t('explorer.close')} title={t('explorer.close')} onClick={() => setTarget(null)}><IconClose /></button>
            </header>
            <dl className="kv">
              <dt>{t('explorer.target.distance')}</dt><dd><span className="num">{distanceShort(distance).text}</span><span className="unit">{distanceShort(distance).unit}</span></dd>
              {!NOMINAL_RADIUS.has(target) && <><dt>{t(MEAN_RADIUS.has(target) ? 'const.meanRadius' : 'const.radius')}</dt><dd><span className="num">{distanceShort(body.radius).text}</span><span className="unit">{distanceShort(body.radius).unit}</span></dd></>}
            </dl>
            <div className="xp-field">
              <span className="label">{t('explorer.goal.label')}</span>
              <Seg<QuickGoal> value={goal} onChange={setGoal} label={t('explorer.goal.label')} options={goals.map((g) => ({ value: g, label: t('explorer.goal.' + g) }))} />
            </div>
            <details>
              <summary>{t('explorer.options')}</summary>
              <div className="xp-options">
                <div className="xp-field">
                  <span className="label">{t('explorer.style.label')}</span>
                  <Seg<QuickStyle> value={style} onChange={setStyle} label={t('explorer.style.label')} options={[{ value: 'efficient', label: t('explorer.style.efficient') }, { value: 'fast', label: t('explorer.style.fast') }]} />
                </div>
                <div className="xp-field">
                  <span className="label">{t('explorer.after')}</span>
                  <DateInput et={after} onChange={setAfter} scale="UTC" label={t('explorer.after')} />
                </div>
                <div className="xp-field">
                  <span className="label">{t('explorer.model')}</span>
                  <Select value={kind} onChange={setKind} label={t('explorer.model')} options={SPACECRAFT_KINDS.map((k) => ({ value: k as string, label: t('spacecraftKind.' + k) }))} />
                </div>
              </div>
            </details>
            <button type="button" className="btn primary big" disabled={!!busy} onClick={() => void launch()}><IconRocket />{t('explorer.launch', { body: bodyIn(target) })}</button>
          </section>
        )}
        {tab === 'famous' && info && facts && (
          <section className="xp-card" aria-label={info.name}>
            <header>
              <h2>{info.name}</h2>
              <button type="button" className="btn ghost icon" aria-label={t('explorer.close')} title={t('explorer.close')} onClick={() => setFamous(null)}><IconClose /></button>
            </header>
            <p>{t('explorer.famous.story.' + info.id)}</p>
            <dl className="kv">
              <dt>{t('explorer.famous.launchDate')}</dt><dd><span className="num">{formatEt(tdb(facts.startTdb), 'UTC', 'day')}</span><span className="unit">UTC</span></dd>
              <dt>{t('explorer.famous.route')}</dt><dd className="xp-route">{['EARTH', ...facts.encounters.map((e) => e.body)].map(bodyName).join(' → ')}</dd>
            </dl>
            <p className="note">{t('explorer.famous.note')}</p>
            <button type="button" className="btn primary big" disabled={!!busy} onClick={() => void fly()}><IconRocket />{t('explorer.famous.fly')}</button>
          </section>
        )}
      </div>
      <div className="xp-tray">
        <div className="xp-tabs" role="group" aria-label={t('explorer.tabs.label')}>
          <button type="button" className={tab === 'make' ? 'on' : ''} aria-pressed={tab === 'make'} onClick={() => go({ mode: 'explorer', page: 'home' })}>{t('explorer.tabs.make')}</button>
          <button type="button" className={tab === 'famous' ? 'on' : ''} aria-pressed={tab === 'famous'} onClick={() => go({ mode: 'explorer', page: 'famous' })}>{t('explorer.tabs.famous')}</button>
        </div>
        {tab === 'make' ? (
          <div className="xp-chips" role="group" aria-label={t('explorer.destinations')}>
            {targets.map((x) => (
              <button type="button" key={x.id} className={'chip' + (x.id === target ? ' on' : '')} aria-pressed={x.id === target} onClick={() => setTarget(x.id === target ? null : x.id)}>
                <Thumb id={x.id} thumbs={thumbs} />{bodyName(x.id)}
              </button>
            ))}
          </div>
        ) : (
          <div className="xp-chips" role="group" aria-label={t('explorer.missions')}>
            {FAMOUS.map((f) => (
              <button type="button" key={f.id} className={'chip' + (f.id === famous ? ' on' : '')} aria-pressed={f.id === famous} onClick={() => setFamous(f.id === famous ? null : f.id)}>
                {f.name}<span className="dim num">{famousFacts(f.id).startTdb.slice(0, 4)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
