import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { icon: typeof Info; className: string; iconClass: string }> = {
  success: { icon: CheckCircle2, className: 'border-emerald-100', iconClass: 'text-emerald-600' },
  error: { icon: XCircle, className: 'border-red-100', iconClass: 'text-red-600' },
  info: { icon: Info, className: 'border-navy-100', iconClass: 'text-navy-700' },
  warning: { icon: AlertTriangle, className: 'border-amber-100', iconClass: 'text-amber-600' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const add = useCallback((tone: ToastTone, title: string, description?: string) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
    window.setTimeout(() => remove(id), 4600);
  }, [remove]);

  const apiValue = useMemo<ToastApi>(() => ({
    success: (title, description) => add('success', title, description),
    error: (title, description) => add('error', title, description),
    info: (title, description) => add('info', title, description),
    warning: (title, description) => add('warning', title, description),
  }), [add]);

  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed right-4 top-4 z-[var(--z-toast)] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2.5 sm:right-6 sm:top-6"
          role="status"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Messages de l’application"
        >
          {toasts.map((toast) => {
            const meta = TONES[toast.tone];
            const Icon = meta.icon;
            return (
              <div
                key={toast.id}
                className={cn('pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white p-3.5 shadow-lift animate-slide-up', meta.className)}
              >
                <Icon size={19} className={cn('mt-0.5 shrink-0', meta.iconClass)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{toast.title}</p>
                  {toast.description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(toast.id)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Fermer"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
