import { useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Inbox, Loader2, Search, X, type LucideIcon } from 'lucide-react';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { cn } from '@/lib/cn';
import type { BadgeTone } from '@/types';

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  gold: 'btn-gold',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export function Button({
  variant = 'primary', loading, icon: Icon, size = 'md', className, children, disabled, ...props
}: ButtonProps) {
  return (
    <button
      className={cn(VARIANT_CLASS[variant], size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

export function Badge({ tone = 'slate', children, className, dot }: { tone?: BadgeTone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn(`badge-${tone}`, className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" /> : null}
      {children}
    </span>
  );
}

/* --------------------------------- Avatar ---------------------------------- */

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-[9px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-11 w-11 text-[13px]',
  xl: 'h-14 w-14 text-base',
};

export function Avatar({
  name, color, size = 'md', className, ring,
}: { name?: string | null; color?: string | null; size?: keyof typeof AVATAR_SIZES; className?: string; ring?: boolean }) {
  const letters = (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const tone = color || '#0B2E52';
  return (
    <span
      title={name || undefined}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold uppercase tracking-wide', AVATAR_SIZES[size], ring && 'ring-2 ring-white', className)}
      style={{ backgroundColor: `${tone}18`, color: tone, boxShadow: `inset 0 0 0 1px ${tone}22` }}
    >
      {letters || '?'}
    </span>
  );
}

/* -------------------------------- Progress --------------------------------- */

export function Progress({ value, tone = 'navy', className, height = 'h-1.5' }: { value: number; tone?: 'navy' | 'gold' | 'green' | 'red' | 'amber'; className?: string; height?: string }) {
  const colors = {
    navy: 'bg-navy-700',
    gold: 'bg-gold-500',
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
  };
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-slate-100', height, className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', colors[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* --------------------------------- Inputs ---------------------------------- */

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export function SearchInput({ className, onClear, value, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        className={cn('input pl-9 pr-8', className)}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Effacer la recherche"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------- EmptyState -------------------------------- */

export function EmptyState({
  icon: Icon = Inbox, title, description, action, compact,
}: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-14')}>
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-gradient-to-br from-white to-navy-50 text-navy-500 shadow-sm">
        <Icon size={24} strokeWidth={1.7} />
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-gold-400" />
      </div>
      <p className="text-[14px] font-semibold text-navy-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------- Pagination -------------------------------- */

export function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total?: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
      <span>
        Page <strong className="text-navy-800">{page}</strong> sur {pages}
        {typeof total === 'number' ? ` · ${total} résultat${total > 1 ? 's' : ''}` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="btn-icon h-8 w-8" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Page précédente">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="btn-icon h-8 w-8" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Page suivante">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- Modal ---------------------------------- */

const MODAL_SIZES = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof MODAL_SIZES;
  bodyClassName?: string;
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', bodyClassName }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, dialogRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-default bg-navy-950/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn('relative flex max-h-[min(94dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift animate-slide-up focus:outline-none sm:max-h-[min(90dvh,860px)] sm:rounded-2xl', MODAL_SIZES[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-[17px] font-bold text-navy-950">{title}</h2>
            {description ? <div className="mt-0.5 text-xs text-muted">{description}</div> : null}
          </div>
          <button type="button" onClick={onClose} className="btn-icon -mr-1 shrink-0" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className={cn('scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line bg-slate-50/50 px-5 py-3.5 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Helpers --------------------------------- */

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-muted">
      <Loader2 size={26} className="animate-spin text-navy-600" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3" />
            <div className="skeleton h-2.5 w-1/2" />
          </div>
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SectionHeading({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h2 className="text-[15px] font-bold text-navy-950">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
