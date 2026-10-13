/** Accuracy screen: the measured errors of the automatic tests, checks on this computer, and what is not verified. */
import { useMemo, useState } from 'react';
import { t, bodyIn } from '../../i18n';
import { MEASUREMENTS, describeMeasurement, truthSource, measuredText } from '../../app/provenance';
import { runFastChecks, flightChecks, type CheckResult } from '../../validation/selfcheck';
import { system } from '../../app/system';
import { engine } from '../../app/engine';
import { famousMission, FAMOUS } from '../../engine/mission';
import { auto } from '../../app/format';
import { Panel, Seg } from '../../ui/controls';
import { PageHead } from '../common';

const UNVERIFIED = ['outerCenters', 'rotation', 'otherTools', 'ste', 'masses', 'insertionBurns', 'models3d', 'browsers'];
const LIMITS = ['impulses', 'forces', 'moons', 'launch', 'entry', 'interpolation', 'range', 'tables', 'horizonsCenter'];
const SELF_MISSION = 'voyager2';
const CRAFT = FAMOUS.find((f) => f.id === SELF_MISSION)!.name;

function checkText(c: CheckResult): string {
  return t('validation.self.' + c.id, { body: c.body ? bodyIn(c.body) : '', craft: CRAFT });
}

function SelfCheck() {
  const [rows, setRows] = useState<CheckResult[] | null>(null);
  const [state, setState] = useState<'idle' | 'fast' | 'flight' | 'done' | 'failed'>('idle');
  const run = () => {
    setState('fast');
    setRows(null);
    // A short delay lets the browser show the "in progress" state.
    setTimeout(async () => {
      try {
        const fast = runFastChecks(system());
        setRows(fast);
        setState('flight');
        const solved = await engine.solve(famousMission(system(), SELF_MISSION));
        setRows([...fast, ...flightChecks(system(), SELF_MISSION, solved)]);
        setState('done');
      } catch { setState('failed'); }
    }, 30);
  };
  const bad = rows?.filter((r) => !r.ok).length ?? 0;
  return (
    <Panel title={t('page.accuracy.self.title')} actions={<button type="button" className="btn primary" disabled={state === 'fast' || state === 'flight'} onClick={run}>{t('page.accuracy.self.run')}</button>}>
      <p className="note">{t('page.accuracy.self.intro')}</p>
      {(state === 'fast' || state === 'flight') && <p className="row"><span className="spin" />{t(state === 'fast' ? 'page.accuracy.self.fast' : 'page.accuracy.self.flight', { craft: CRAFT })}</p>}
      {state === 'failed' && <div className="banner bad">{t('page.accuracy.self.failed')}</div>}
      {state === 'done' && <div className={'banner ' + (bad ? 'bad' : 'good')}>{bad ? t('page.accuracy.self.bad', { n: bad }) : t('page.accuracy.self.good', { n: rows!.length })}</div>}
      {rows && (
        <table className="data">
          <thead><tr><th>{t('page.accuracy.check')}</th><th className="r">{t('page.accuracy.measured')}</th><th className="r">{t('page.accuracy.limit')}</th><th>{t('page.accuracy.reference')}</th><th>{t('page.accuracy.result')}</th></tr></thead>
          <tbody>
            {rows.map((c, k) => (
              <tr key={k}>
                <td>{checkText(c)}</td>
                <td className="r"><span className="num">{auto(c.value)}</span><span className="unit">{c.unit}</span></td>
                <td className="r"><span className="num">{auto(c.limit)}</span><span className="unit">{c.unit}</span></td>
                <td>{t('validation.selfRef.' + c.reference)}</td>
                <td><span className={'tag ' + (c.ok ? 'good' : 'bad')}>{t(c.ok ? 'page.accuracy.ok' : 'page.accuracy.notOk')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export default function Accuracy() {
  const groups = useMemo(() => [...new Set(MEASUREMENTS.map((m) => m.group))], []);
  const [group, setGroup] = useState('all');
  const [filter, setFilter] = useState('');
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return MEASUREMENTS.filter((m) => group === 'all' || m.group === group)
      .map((m) => ({ m, text: describeMeasurement(m), source: truthSource(m) }))
      .filter((x) => !f || x.text.toLowerCase().includes(f) || x.source.toLowerCase().includes(f));
  }, [group, filter]);
  return (
    <>
      <PageHead id="accuracy" />
      <SelfCheck />
      <Panel title={t('page.accuracy.tests.title', { n: MEASUREMENTS.length })}>
        <p className="note">{t('page.accuracy.tests.intro')}</p>
        <div className="row">
          <Seg value={group} onChange={setGroup} options={[{ value: 'all', label: t('common.all') }, ...groups.map((g) => ({ value: g, label: t('validation.group.' + g) }))]} />
          <input className="input" style={{ maxWidth: 260 }} placeholder={t('common.search')} aria-label={t('common.search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="note">{t('page.accuracy.tests.count', { n: list.length })}</span>
        </div>
        <div className="scroll" style={{ maxHeight: 560 }}>
          <table className="data">
            <thead><tr><th>{t('page.accuracy.check')}</th><th className="r">{t('page.accuracy.measured')}</th><th className="r">{t('page.accuracy.limit')}</th><th>{t('page.accuracy.reference')}</th></tr></thead>
            <tbody>
              {list.map(({ m, text, source }) => {
                const x = measuredText(m);
                return (
                  <tr key={m.id}>
                    <td>{text}</td>
                    <td className="r"><span className="num">{x.value}</span><span className="unit">{x.unit}</span></td>
                    <td className="r"><span className="num">{x.limit}</span><span className="unit">{x.unit}</span></td>
                    <td className="note" style={{ maxWidth: 420 }}>{source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="cols even">
        <Panel title={t('page.accuracy.unverified.title')}>
          <p className="note">{t('page.accuracy.unverified.intro')}</p>
          <dl className="deflist">
            {UNVERIFIED.map((id) => <div key={id}><dt>{t(`validation.unverified.${id}.title`)}</dt><dd>{t(`validation.unverified.${id}.text`)}</dd></div>)}
          </dl>
        </Panel>
        <Panel title={t('page.accuracy.limits.title')}>
          <p className="note">{t('page.accuracy.limits.intro')}</p>
          <dl className="deflist">
            {LIMITS.map((id) => <div key={id}><dt>{t(`validation.limits.${id}.title`)}</dt><dd>{t(`validation.limits.${id}.text`)}</dd></div>)}
          </dl>
        </Panel>
      </div>
    </>
  );
}
