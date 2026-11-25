import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const open = Boolean(state);

  const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => {
    setState({ options, resolve });
  }), []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  useDialogA11y(open, () => close(false), dialogRef);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && createPortal(
        <div className="fixed inset-0 z-[var(--z-confirm)] flex items-center justify-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 cursor-default bg-navy-950/45 backdrop-blur-[2px] animate-fade-in"
            onClick={() => close(false)}
          />
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-lift animate-scale-in focus:outline-none"
          >
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${state.options.tone === 'primary' ? 'bg-navy-50 text-navy-800' : 'bg-red-50 text-red-600'}`}>
              {state.options.tone === 'primary' ? <HelpCircle size={22} /> : <AlertTriangle size={22} />}
            </div>
            <h3 id={titleId} className="text-lg font-bold text-navy-950">{state.options.title}</h3>
            {state.options.message ? <p className="mt-2 text-[13px] leading-relaxed text-muted">{state.options.message}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => close(false)}>
                {state.options.cancelLabel || 'Annuler'}
              </Button>
              <Button
                variant={state.options.tone === 'primary' ? 'primary' : 'danger'}
                onClick={() => close(true)}
                icon={state.options.tone === 'primary' ? undefined : Trash2}
              >
                {state.options.confirmLabel || 'Confirmer'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
