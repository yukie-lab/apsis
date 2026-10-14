/** The calculation in work: its name and stage, the progress and the button that stops it. */
import { useApp } from '../app/store';
import { engine } from '../app/engine';
import { t, bodyName } from '../i18n';

function stageText(stage: string): string {
  if (stage === 'window') return t('busy.window');
  if (stage === 'plan') return t('busy.plan');
  const miss = /^miss:(.+)$/.exec(stage);
  if (miss) return t('busy.miss', { value: miss[1] });
  const best = /^best:(.+)$/.exec(stage);
  if (best) return t('busy.best', { value: best[1] + ' km/s' });
  const m = /^(\w+): (\w)$/.exec(stage);
  return m ? t('busy.stage', { body: bodyName(m[1]), stage: m[2] }) : '';
}

/** The parts of the progress line. The parent element gives the layout. */
export function BusyContent() {
  const busy = useApp((s) => s.busy);
  const setBusy = useApp((s) => s.setBusy);
  if (!busy) return null;
  const stage = busy.stage ? stageText(busy.stage) : '';
  return (
    <>
      <span className="spin" />
      <span className="busy-text">{t('busy.' + busy.task)}{stage ? ' — ' + stage : ''}</span>
      {busy.fraction !== null && <span className="bar"><i style={{ width: `${Math.round(100 * busy.fraction)}%` }} /></span>}
      <button type="button" className="btn small" onClick={() => { engine.cancel(); setBusy(null); }}>{t('busy.cancel')}</button>
    </>
  );
}
