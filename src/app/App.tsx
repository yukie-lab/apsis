/** Root of the application: data load, top bar, the two modes, messages. */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useApp, nowEt } from './store';
import { loadSystem, system } from './system';
import { engine } from './engine';
import { clock } from './clock';
import type { Mode, ExpertPage, ExplorerPage } from './router';
import { t, useLocale, LOCALES, getLocale, setLocale, bodyName } from '../i18n';
import { TIME_SCALES, type TimeScale } from '../engine/time';
import { FRAMES, type FrameId } from '../engine/frames';
import { BODIES } from '../engine/bodies';
import { BasisPopover } from '../ui/Val';
import { ConfirmDialog } from '../ui/Confirm';
import { BodySelect, Select } from '../ui/controls';
import { Logo } from '../ui/icons';
import type { DistanceUnit } from './format';

const ExpertApp = lazy(() => import('../expert/ExpertApp'));
const ExplorerApp = lazy(() => import('../explorer/ExplorerApp'));
const About = lazy(() => import('./About'));

/** Last page of each mode: a change of the mode goes back to it. */
const last: { expert: ExpertPage; explorer: ExplorerPage } = { expert: 'mission', explorer: 'home' };

function switchMode(mode: Mode): void {
  const s = useApp.getState();
  if (mode === 'expert') s.go({ mode: 'expert', page: last.expert });
  else s.go({ mode: 'explorer', page: last.explorer === 'flight' && !s.trajectory ? 'home' : last.explorer });
}

function TopBar() {
  const route = useApp((s) => s.route);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const go = useApp((s) => s.go);
  const expert = route.mode === 'expert';
  return (
    <header className="top">
      <a className="brand" href="#/explorer" aria-label={t('app.name')}><Logo /><span className="brandname">{t('app.name')}</span></a>
      <div className="mode" role="group" aria-label={t('mode.label')}>
        <button type="button" className={!expert ? 'on' : ''} aria-pressed={!expert} onClick={() => switchMode('explorer')}>{t('mode.explorer')}</button>
        <button type="button" className={expert ? 'on' : ''} aria-pressed={expert} onClick={() => switchMode('expert')}>{t('mode.expert')}</button>
      </div>
      {expert && route.page !== 'about' && (
        <div className="context">
          <label>{t('context.timeScale')}
            <Select<TimeScale> value={settings.timeScale} onChange={(v) => setSettings({ timeScale: v })} options={TIME_SCALES.map((v) => ({ value: v, label: v }))} />
          </label>
          <label>{t('context.frame')}
            <Select<FrameId> value={settings.frame} onChange={(v) => setSettings({ frame: v })} options={FRAMES.map((v) => ({ value: v, label: t('frame.' + v) }))} />
          </label>
          <label>{t('context.center')}
            <BodySelect value={settings.center} onChange={(v) => setSettings({ center: v })} extra={['SSB']} filter={(b) => b.gm > 0} />
          </label>
          <label>{t('context.distance')}
            <Select<DistanceUnit> value={settings.distUnit} onChange={(v) => setSettings({ distUnit: v })} options={[{ value: 'km', label: 'km' }, { value: 'au', label: 'au' }]} />
          </label>
        </div>
      )}
      <span className="spacer" />
      {LOCALES.length > 1 && (
        <label className="context">{t('app.language')}
          <Select value={getLocale()} onChange={setLocale} options={LOCALES.map((l) => ({ value: l.code, label: l.name }))} />
        </label>
      )}
      <button type="button" className={'btn ghost small' + (route.page === 'about' ? ' on' : '')} onClick={() => go({ mode: route.mode, page: 'about' })}>{t('nav.about')}</button>
    </header>
  );
}

function stageText(stage: string): string {
  if (stage === 'window') return t('busy.window');
  if (stage === 'plan') return t('busy.plan');
  const best = /^best:(.+)$/.exec(stage);
  if (best) return t('busy.best', { value: best[1] + ' km/s' });
  const m = /^(\w+): (\w)$/.exec(stage);
  return m ? t('busy.stage', { body: bodyName(m[1]), stage: m[2] }) : '';
}

function BusyOverlay() {
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  if (!busy) return null;
  return (
    <div className="busy" role="status" aria-live="polite">
      <div>
        <span className="spin" />
        <span>{t('busy.' + busy.task)}{busy.stage && stageText(busy.stage) ? ' — ' + stageText(busy.stage) : ''}</span>
        {busy.fraction !== null && <span className="bar"><i style={{ width: `${Math.round(100 * busy.fraction)}%` }} /></span>}
        <button type="button" className="btn small" onClick={() => { engine.cancel(); setBusy(null); }}>{t('busy.cancel')}</button>
      </div>
    </div>
  );
}

function ErrorToast() {
  const code = useApp((s) => s.errorCode);
  const clear = useApp((s) => s.clearError);
  useLocale();
  if (!code) return null;
  const key = 'error.' + code;
  const text = t(key);
  return (
    <div className="toast" role="alert">
      <div className="banner bad">
        <b>{t('error.title')}</b>
        <div>{text === key ? t('error.internal') : text}</div>
        <div className="row end"><button type="button" className="btn small" onClick={clear}>{t('common.close')}</button></div>
      </div>
    </div>
  );
}

export function App() {
  const locale = useLocale();
  const route = useApp((s) => s.route);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    loadSystem().then(() => {
      if (!alive) return;
      const sys = system();
      clock.setLimits(sys.etStart, sys.etEnd);
      clock.set(nowEt());
      useApp.getState().restoreCustom();
      void engine.start();
      setState('ready');
    }).catch(() => { if (alive) setState('failed'); });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    if (route.page === 'about') return;
    if (route.mode === 'expert') last.expert = route.page as ExpertPage; else last.explorer = route.page as ExplorerPage;
  }, [route]);
  useEffect(() => { document.documentElement.lang = locale; document.title = `${t('app.name')} — ${t('app.tagline')}`; }, [locale]);

  // The centre of the settings can be a body that is not in this data set (an old setting): use the Sun.
  const center = useApp((s) => s.settings.center);
  useEffect(() => { if (state === 'ready' && center !== 'SSB' && !BODIES[center]) useApp.getState().setSettings({ center: 'SUN' }); }, [state, center]);

  if (state !== 'ready') {
    return (
      <div className="splash">
        <Logo size={72} />
        <h1>{t('app.name')}</h1>
        <p className="dim">{t('app.tagline')}</p>
        {state === 'loading' ? <p className="row"><span className="spin" />{t('app.loading')}</p> : (
          <>
            <p className="banner bad">{t('app.loadFailed')}</p>
            <button type="button" className="btn primary" onClick={() => setAttempt((n) => n + 1)}>{t('app.retry')}</button>
          </>
        )}
      </div>
    );
  }
  return (
    <div className={'app mode-' + route.mode} key={locale}>
      <TopBar />
      <Suspense fallback={<div className="splash"><span className="spin" /></div>}>
        {route.page === 'about' ? <About /> : route.mode === 'expert' ? <ExpertApp /> : <ExplorerApp />}
      </Suspense>
      <BusyOverlay />
      <ErrorToast />
      <BasisPopover />
      <ConfirmDialog />
    </div>
  );
}
