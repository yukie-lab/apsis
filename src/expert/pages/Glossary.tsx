/** Glossary screen: the technical names that the application uses, with their definitions. */
import { useMemo, useState } from 'react';
import { t, glossary } from '../../i18n';
import { Panel } from '../../ui/controls';
import { PageHead } from '../common';

export default function Glossary() {
  const [filter, setFilter] = useState('');
  const all = useMemo(() => glossary(), []);
  const f = filter.trim().toLowerCase();
  const list = all.filter((g) => !f || g.term.toLowerCase().includes(f) || g.definition.toLowerCase().includes(f) || (g.sort ?? '').toLowerCase().includes(f));
  return (
    <>
      <PageHead id="glossary" />
      <Panel>
        <div className="row">
          <input className="input" style={{ maxWidth: 320 }} placeholder={t('common.search')} aria-label={t('common.search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="note">{t('page.glossary.count', { n: list.length })}</span>
        </div>
        <dl className="deflist two">
          {list.map((g) => <div key={g.id} id={'term-' + g.id}><dt>{g.term}</dt><dd>{g.definition}</dd></div>)}
        </dl>
      </Panel>
    </>
  );
}
