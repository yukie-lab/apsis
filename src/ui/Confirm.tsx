/** A question with two answers before an operation that removes work of the user. */
import { create } from 'zustand';
import { useEffect, useRef } from 'react';
import { t } from '../i18n';

interface ConfirmState {
  open: { text: string; action: string; resolve: (ok: boolean) => void } | null;
  ask(text: string, action: string): Promise<boolean>;
  answer(ok: boolean): void;
}
const useConfirm = create<ConfirmState>((set, get) => ({
  open: null,
  ask: (text, action) => new Promise<boolean>((resolve) => { get().open?.resolve(false); set({ open: { text, action, resolve } }); }),
  answer: (ok) => { get().open?.resolve(ok); set({ open: null }); },
}));

/** Ask the user. `text`: the question. `action`: the label of the button that continues. */
export const confirm = (text: string, action: string): Promise<boolean> => useConfirm.getState().ask(text, action);

/** The one question window of the application. Put it one time in the root component. */
export function ConfirmDialog() {
  const open = useConfirm((s) => s.open);
  const answer = useConfirm((s) => s.answer);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, answer]);
  if (!open) return null;
  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={open.text}>
        <p>{open.text}</p>
        <div className="row end">
          <button type="button" className="btn" onClick={() => answer(false)}>{t('common.cancel')}</button>
          <button type="button" className="btn primary" ref={ref} onClick={() => answer(true)}>{open.action}</button>
        </div>
      </div>
    </div>
  );
}
