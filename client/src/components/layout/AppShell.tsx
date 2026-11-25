import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TriangleAlert, type LucideIcon } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const location = useLocation();

  const openMenu = useCallback(() => {
    menuTriggerRef.current = document.activeElement as HTMLElement | null;
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus?.());
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, closeMenu]);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex min-h-screen flex-col lg:pl-sidebar">
        <Topbar onMenu={openMenu} />
        <main className="flex-1 px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8">
          <div className="mx-auto w-full max-w-shell">
            <Suspense fallback={<PageLoading title="Chargement de la vue…" cards={4} cardColumns="md:grid-cols-4" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <footer className="no-print border-t border-line/70 px-4 py-4 text-[10.5px] text-slate-400 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-shell flex-wrap items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} Copil — Plateforme premium de pilotage d’activité.</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Toutes les données sont sauvegardées</span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow, title, description, actions, children,
}: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-600">{eyebrow}</p> : null}
        <h1 className="text-balance text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-navy-950 sm:text-[26px]">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** One shared, discreet loading state for every lazy page. */
export function PageLoading({
  eyebrow, title, cards = 0, cardColumns = 'md:grid-cols-3 xl:grid-cols-5', panels = 1, panelClassName = 'h-[340px]',
}: {
  eyebrow?: string;
  title: string;
  cards?: number;
  cardColumns?: string;
  panels?: number;
  panelClassName?: string;
}) {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-busy="true">
      <PageHeader eyebrow={eyebrow} title={title} />
      {cards > 0 ? (
        <div className={cn('grid grid-cols-2 gap-3', cardColumns)}>
          {Array.from({ length: cards }).map((_, index) => (
            <div key={index} className="skeleton h-[124px] rounded-2xl" />
          ))}
        </div>
      ) : null}
      {Array.from({ length: panels }).map((_, index) => (
        <div key={index} className={cn('skeleton rounded-2xl', panelClassName)} />
      ))}
      <span className="sr-only">Chargement en cours…</span>
    </div>
  );
}

/** One shared error state with the existing EmptyState + retry pattern. */
export function PageError({
  icon = TriangleAlert, title, description, action,
}: { icon?: LucideIcon; title: string; description?: string | null; action?: ReactNode }) {
  return (
    <div className="card" role="alert">
      <EmptyState
        icon={icon}
        title={title}
        description={description || 'Une erreur inattendue est survenue.'}
        action={action}
      />
    </div>
  );
}
