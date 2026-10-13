/** Shell of the Expert mode: list of the screens, the screen in view, status line. */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { useApp } from '../app/store';
import { EXPERT_PAGES, type ExpertPage } from '../app/router';
import { useClock } from '../app/clock';
import { t, bodyName } from '../i18n';
import { formatEt } from '../engine/time';

const PAGES: Record<ExpertPage, LazyExoticComponent<ComponentType>> = {
  mission: lazy(() => import('./pages/Mission')),
  ephemeris: lazy(() => import('./pages/Ephemeris')),
  transfer: lazy(() => import('./pages/Transfer')),
  windows: lazy(() => import('./pages/Windows')),
  tour: lazy(() => import('./pages/Tour')),
  maneuvers: lazy(() => import('./pages/Maneuvers')),
  propagation: lazy(() => import('./pages/Propagation')),
  files: lazy(() => import('./pages/Files')),
  accuracy: lazy(() => import('./pages/Accuracy')),
  glossary: lazy(() => import('./pages/Glossary')),
};

function MissionBox() {
  const mission = useApp((s) => s.mission);
  const stale = useApp((s) => s.flightStale);
  const hasFlight = useApp((s) => !!s.trajectory);
  const inLibrary = useApp((s) => !!s.mission && s.library.some((m) => m.id === s.mission!.id));
  const save = useApp((s) => s.saveToLibrary);
  const close = useApp((s) => s.closeMission);
  if (!mission) return <div className="missionbox"><span>{t('missionBox.none')}</span></div>;
  return (
    <div className="missionbox">
      <b style={{ color: 'var(--text)' }}>{mission.name}</b>
      <span className="row" style={{ gap: 4 }}>
        {mission.plan && <span className="tag">{t('missionBox.plan')}</span>}
        {hasFlight && <span className={'tag ' + (stale ? 'warn' : 'good')}>{t(stale ? 'missionBox.flightOld' : 'missionBox.flight')}</span>}
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button type="button" className="btn small" onClick={save}>{t(inLibrary ? 'missionBox.saveAgain' : 'common.save')}</button>
        <button type="button" className="btn small" onClick={close}>{t('common.close')}</button>
      </span>
    </div>
  );
}

function StatusBar() {
  const { et } = useClock(250);
  const s = useApp((x) => x.settings);
  return (
    <footer className="statusbar">
      <span>{t('context.viewTime')}: <b className="num">{formatEt(et, s.timeScale)} {s.timeScale}</b></span>
      <span>{t('context.frame')}: <b>{t('frameLong.' + s.frame)}</b></span>
      <span>{t('context.center')}: <b>{bodyName(s.center)}</b></span>
      <span>{t('context.units')}: <b>{t('context.unitList')}</b></span>
      <span>{t('context.ephemeris')}: <b>{t('context.ephemerisName')}</b></span>
    </footer>
  );
}

export default function ExpertApp() {
  const route = useApp((s) => s.route);
  const go = useApp((s) => s.go);
  const page = (EXPERT_PAGES as string[]).includes(route.page) ? (route.page as ExpertPage) : 'mission';
  const Page = PAGES[page];
  return (
    <>
      <div className="expert">
        <nav className="nav" aria-label={t('nav.label')}>
          {EXPERT_PAGES.map((p) => (
            <button type="button" key={p} className={p === page ? 'on' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => go({ mode: 'expert', page: p })}>{t('nav.' + p)}</button>
          ))}
          <MissionBox />
        </nav>
        <main className="page" key={page}>
          <div className="banner warn narrowOnly">{t('app.narrow')}</div>
          <Suspense fallback={<span className="spin" />}><Page /></Suspense>
        </main>
      </div>
      <StatusBar />
    </>
  );
}
