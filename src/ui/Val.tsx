/** A number with its unit and a button that shows the source and the accuracy limit of the number. */
import { create } from 'zustand';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Quantity } from '../app/format';
import { basis, type BasisKind, type BasisContext, describeMeasurement, truthSource, measuredText } from '../app/provenance';
import { t } from '../i18n';
import { useApp } from '../app/store';

interface PopState {
  open: { anchor: DOMRect; kind: BasisKind; ctx: BasisContext } | null;
  show(el: Element, kind: BasisKind, ctx: BasisContext): void;
  close(): void;
}
const usePop = create<PopState>((set) => ({
  open: null,
  show: (el, kind, ctx) => set({ open: { anchor: el.getBoundingClientRect(), kind, ctx } }),
  close: () => set({ open: null }),
}));

/** Button that opens the source text of a kind of number. Use it in a table head or with a value. */
export function Src({ kind, body, famousId }: { kind: BasisKind } & BasisContext) {
  const show = usePop((s) => s.show);
  return (
    <button type="button" className="src" title={t('basis.open')} aria-label={t('basis.open')}
      onClick={(e) => { e.stopPropagation(); show(e.currentTarget, kind, { body, famousId }); }}>i</button>
  );
}

export function Val({ q, kind, body, famousId, className }: { q: Quantity; kind?: BasisKind; className?: string } & BasisContext) {
  return (
    <span className={'val' + (className ? ' ' + className : '')}>
      <span className="num">{q.text}</span>{q.unit && <span className="unit">{q.unit}</span>}
      {kind && <Src kind={kind} body={body} famousId={famousId} />}
    </span>
  );
}

/** The one source window of the application. Put it one time in the root component. */
export function BasisPopover() {
  const open = usePop((s) => s.open);
  const close = usePop((s) => s.close);
  const go = useApp((s) => s.go);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const box = ref.current.getBoundingClientRect();
    const m = 12;
    let left = Math.min(window.innerWidth - box.width - m, Math.max(m, open.anchor.left - 20));
    let top = open.anchor.bottom + 8;
    if (top + box.height > window.innerHeight - m) top = Math.max(m, open.anchor.top - box.height - 8);
    if (window.innerWidth < 520) left = (window.innerWidth - box.width) / 2;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', close); };
  }, [open, close]);

  if (!open) return null;
  const b = basis(open.kind, open.ctx);
  return (
    <div ref={ref} className="pop" role="dialog" aria-label={b.title} style={pos ? pos : { left: 0, top: 0, visibility: 'hidden' }}>
      <div className="row">
        <h4 style={{ flex: 1 }}>{b.title}</h4>
        <span className={'tag ' + (b.status === 'horizons' || b.status === 'analytic' ? 'good' : b.status === 'model' ? 'warn' : '')}>{t('basis.status.' + b.status)}</span>
      </div>
      <dl>
        <dt>{t('basis.method')}</dt><dd>{b.method}</dd>
        <dt>{t('basis.limit')}</dt><dd>{b.limit}</dd>
      </dl>
      {b.evidence.length > 0 && (
        <>
          <h4>{t('basis.evidence')}</h4>
          {b.evidence.map((m) => {
            const x = measuredText(m);
            return (
              <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                <div>{describeMeasurement(m)}</div>
                <div><span className="num">{x.value}</span><span className="unit">{x.unit}</span> <span className="dim">{t('basis.testLimit', { limit: x.limit, unit: x.unit })}</span></div>
                <div className="note">{truthSource(m)}</div>
              </div>
            );
          })}
        </>
      )}
      <div className="row">
        {b.more > 0 && <span className="note" style={{ flex: 1 }}>{t('basis.more', { n: b.more })}</span>}
        <span className="spacer" />
        <button type="button" className="btn small" onClick={() => { close(); go({ mode: 'expert', page: 'accuracy' }); }}>{t('basis.allChecks')}</button>
        <button type="button" className="btn small" onClick={close}>{t('common.close')}</button>
      </div>
    </div>
  );
}
