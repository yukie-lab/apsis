/**
 * About screen: what the application is, what it does with the data of the user, what the 3D view shows, and
 * the sources of the data, of the maps, of the spacecraft models and of the software.
 */
import { useEffect, useState } from 'react';
import { useApp } from './store';
import { switchMode } from './nav';
import { APP_VERSION, LIBRARIES } from './version';
import { t, hasText, bodyName } from '../i18n';
import { confirm } from '../ui/Confirm';
import { Panel } from '../ui/controls';
import { Logo, IconClose } from '../ui/icons';

/** The fields of an entry of public/textures/manifest.json that this screen shows. */
interface MapEntry {
  id: string;
  body: string;
  role: string;
  title?: string;
  author?: string;
  licence?: string;
  licenceUrl?: string;
  sourceUrl?: string;
  changes?: string;
}

/** The list of the maps: null while the file loads, 'failed' if the browser cannot read it. */
function useMaps(): MapEntry[] | null | 'failed' {
  const [maps, setMaps] = useState<MapEntry[] | null | 'failed'>(null);
  useEffect(() => {
    let alive = true;
    fetch(import.meta.env.BASE_URL + 'textures/manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status'))))
      .then((m: { textures?: MapEntry[] }) => { if (alive) setMaps(Array.isArray(m.textures) ? m.textures : 'failed'); })
      .catch(() => { if (alive) setMaps('failed'); });
    return () => { alive = false; };
  }, []);
  return maps;
}

/** Text of the changes of a map. A locale can replace the text of the manifest. */
function changesText(m: MapEntry): string {
  const key = 'about.maps.changeText.' + m.id;
  return hasText(key) ? t(key) : m.changes ?? '';
}

const SECTIONS = ['privacy', 'view', 'data', 'maps', 'models', 'software', 'names'] as const;
type SectionId = (typeof SECTIONS)[number];

/** Removes the items that the application put in the storage of the browser, then starts the application again. */
async function clearStored(): Promise<void> {
  if (!(await confirm(t('about.privacy.clearQuestion'), t('about.privacy.clearAction')))) return;
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('apsis.')) localStorage.removeItem(key);
  } catch { /* the storage is not available: there is nothing to remove */ }
  location.reload();
}

function Outside({ href, children }: { href: string; children: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function Maps() {
  const maps = useMaps();
  if (maps === null) return <p className="row"><span className="spin" /></p>;
  if (maps === 'failed') return <p className="banner bad">{t('about.maps.failed')}</p>;
  return (
    <div className="about-maps">
      {maps.map((m) => (
        <article key={m.id}>
          <h3>{m.body === 'STARS' ? t('about.maps.stars') : bodyName(m.body)}<span className="tag">{t('about.maps.role.' + m.role)}</span></h3>
          <dl>
            <dt>{t('about.maps.file')}</dt>
            <dd>{m.title}</dd>
            <dt>{t('about.maps.credit')}</dt>
            <dd>{m.author}</dd>
            <dt>{t('about.maps.license')}</dt>
            <dd>{m.licenceUrl ? <Outside href={m.licenceUrl}>{m.licence ?? m.licenceUrl}</Outside> : m.licence}</dd>
            {m.sourceUrl && <><dt>{t('about.maps.source')}</dt><dd><Outside href={m.sourceUrl}>{t('about.maps.open')}</Outside></dd></>}
            {changesText(m) && <><dt>{t('about.maps.changes')}</dt><dd>{changesText(m)}</dd></>}
          </dl>
        </article>
      ))}
    </div>
  );
}

export default function About() {
  const route = useApp((s) => s.route);
  const go = useApp((s) => s.go);

  // "#/about/maps" opens the screen at a section.
  useEffect(() => {
    const show = (): void => {
      const id = location.hash.split('/')[2];
      if (id && (SECTIONS as readonly string[]).includes(id)) document.getElementById('about-' + id)?.scrollIntoView({ block: 'start' });
    };
    show();
    window.addEventListener('hashchange', show);
    return () => window.removeEventListener('hashchange', show);
  }, []);

  const to = (id: SectionId): void => { document.getElementById('about-' + id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  return (
    <div className="page about">
      <div className="about-body">
      <div className="about-head">
        <Logo size={44} />
        <div>
          <h1>{t('about.title')}</h1>
          <p className="dim">{t('about.version', { version: APP_VERSION })}</p>
        </div>
        <span className="spacer" />
        <button type="button" className="btn icon" aria-label={t('about.close')} title={t('about.close')} onClick={() => switchMode(route.mode)}><IconClose /></button>
      </div>
      <p className="about-intro">{t('about.intro')}</p>
      <nav className="about-nav" aria-label={t('about.sections')}>
        {SECTIONS.map((id) => <button key={id} type="button" className="btn small" onClick={() => to(id)}>{t(`about.${id}.title`)}</button>)}
      </nav>

      <section id="about-privacy">
        <Panel title={t('about.privacy.title')}>
          <ul className="list">
            <li>{t('about.privacy.local')}</li>
            <li>{t('about.privacy.network')}</li>
            <li>{t('about.privacy.tracking')}</li>
            <li>{t('about.privacy.storage')}</li>
            <li>{t('about.privacy.links')}</li>
          </ul>
          <div className="row"><button type="button" className="btn" onClick={() => void clearStored()}>{t('about.privacy.clear')}</button></div>
        </Panel>
      </section>

      <section id="about-view">
        <Panel title={t('about.view.title')}>
          <ul className="list">
            <li>{t('about.view.engine')}</li>
            <li>{t('scene.scaleNote')}</li>
            <li>{t('scene.sunlightNote')}</li>
            <li>{t('scene.nightNote')}</li>
            <li>{t('scene.effectsNote')}</li>
            <li>{t('about.view.aids')}</li>
            <li>{t('about.view.notes')}</li>
          </ul>
        </Panel>
      </section>

      <section id="about-data">
        <Panel title={t('about.data.title')}>
          <p>{t('about.data.intro')}</p>
          <dl className="deflist">
            <div><dt>{t('about.data.planets')}</dt><dd>{t('basis.ephem.state.method')}</dd></div>
            <div><dt>{t('about.data.centers')}</dt><dd>{t('basis.ephem.state.method_centre')}</dd></div>
            <div><dt>{t('about.data.moons')}</dt><dd>{t('basis.ephem.state.method_moon')}</dd></div>
            <div><dt>{t('about.data.small')}</dt><dd>{t('basis.ephem.state.method_small')}</dd></div>
            <div><dt>{t('basis.const.title')}</dt><dd>{t('basis.const.method')}</dd></div>
            <div><dt>{t('basis.time.title')}</dt><dd>{t('basis.time.method')}</dd></div>
            <div><dt>{t('basis.frame.title')}</dt><dd>{t('basis.frame.method')}</dd></div>
          </dl>
          <p>{t('about.data.accuracy')}</p>
          <div className="row"><button type="button" className="btn" onClick={() => go({ mode: 'expert', page: 'accuracy' })}>{t('about.data.open')}</button></div>
        </Panel>
      </section>

      <section id="about-maps">
        <Panel title={t('about.maps.title')}>
          <p>{t('about.maps.intro')}</p>
          <p className="note">{t('about.maps.noMap')}</p>
          <Maps />
        </Panel>
      </section>

      <section id="about-models">
        <Panel title={t('about.models.title')}>
          <ul className="list">
            <li>{t('about.models.original')}</li>
            <li>{t('about.models.look')}</li>
            <li>{t('about.models.apsis')}</li>
            <li>{t('about.models.attitude')}</li>
          </ul>
        </Panel>
      </section>

      <section id="about-software">
        <Panel title={t('about.software.title')}>
          <p>{t('about.software.intro')}</p>
          <div className="scroll"><table className="data about-libs">
            <thead><tr><th>{t('about.software.library')}</th><th>{t('about.software.version')}</th><th>{t('about.software.license')}</th></tr></thead>
            <tbody>{LIBRARIES.map((l) => <tr key={l.name}><td>{l.name}</td><td className="num">{l.version}</td><td>{l.license}</td></tr>)}</tbody>
          </table></div>
          <div className="row"><a className="btn" href={import.meta.env.BASE_URL + 'licenses.txt'} target="_blank" rel="noopener noreferrer">{t('about.software.texts')}</a></div>
          <p>{t('about.software.fonts')}</p>
        </Panel>
      </section>

      <section id="about-names">
        <Panel title={t('about.names.title')}>
          <p>{t('about.names.text')}</p>
        </Panel>
      </section>
      </div>
    </div>
  );
}
