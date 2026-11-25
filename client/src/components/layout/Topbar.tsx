import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, CheckSquare, ChevronDown, FileText, Menu, Search, UserRound, X } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { CommandPalette } from '@/components/CommandPalette';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { api } from '@/lib/api';
import { ROLE_META } from '@/lib/constants';
import { formatDate, relativeDay, todayISO } from '@/lib/format';
import type { NotificationItem } from '@/types';
import { cn } from '@/lib/cn';

const PAGE_TITLES: Array<{ test: (path: string) => boolean; title: string; section: string }> = [
  { test: (p) => p === '/', title: 'Dashboard', section: 'Pilotage' },
  { test: (p) => p.startsWith('/taches'), title: 'To-do List', section: 'Pilotage' },
  { test: (p) => /^\/clients\/[^/]+/.test(p), title: 'Fiche client', section: 'Clients & Programmes' },
  { test: (p) => p.startsWith('/clients'), title: 'Clients & Programmes', section: 'Commercial' },
  { test: (p) => p.startsWith('/planning'), title: 'Planning & Livraisons', section: 'Commercial' },
  { test: (p) => p.startsWith('/devis'), title: 'Devis', section: 'Commercial' },
  { test: (p) => p.startsWith('/rapports'), title: 'Rapports & Statistiques', section: 'Analyse' },
  { test: (p) => p.startsWith('/equipe'), title: 'Équipe & Utilisateurs', section: 'Organisation' },
  { test: (p) => p.startsWith('/parametres'), title: 'Paramètres', section: 'Organisation' },
];

const NOTIF_ICONS = {
  project: CalendarClock,
  task: CheckSquare,
  client: UserRound,
  quote: FileText,
  info: Bell,
};

const NOTIF_TONES = {
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
  gold: 'bg-gold-50 text-gold-600',
  navy: 'bg-navy-50 text-navy-700',
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const page = PAGE_TITLES.find((entry) => entry.test(location.pathname)) || PAGE_TITLES[0];

  const { data: notifications, refresh } = useAsync(
    async () => {
      const result = await api.get<{ data: NotificationItem[]; meta?: { total?: number } }>('/notifications');
      return { items: result.data, total: result.meta?.total ?? result.data.length };
    },
    [location.pathname],
  );
  const notifCount = notifications?.total ?? 0;
  const notifLabel = notifCount > 99 ? '99+' : String(notifCount);

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [notificationsOpen]);

  return (
    <>
      <header className="no-print sticky top-0 z-[var(--z-header)] border-b border-line/80 bg-white/85 backdrop-blur-xl">
        <div className="flex h-topbar items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <button type="button" onClick={onMenu} className="btn-icon -ml-2 shrink-0 lg:hidden" aria-label="Ouvrir le menu" aria-controls="navigation-principale">
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:block">
              {page.section} <span className="mx-1.5 text-slate-300">/</span> {formatDate(todayISO(), 'long')}
            </p>
            <p className="truncate text-[14px] font-bold text-navy-950 sm:mt-0.5 sm:text-[15.5px]">{page.title}</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 min-w-[210px] items-center gap-2 rounded-xl border border-line bg-slate-50/70 px-3 text-left text-xs text-slate-400 transition hover:border-navy-200 hover:bg-white md:flex"
            >
              <Search size={14} />
              <span className="flex-1">Rechercher…</span>
              <kbd className="rounded border border-line bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} className="btn-icon md:hidden" aria-label="Rechercher">
              <Search size={19} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  refresh();
                }}
                className="btn-icon relative"
                aria-label={notifCount ? `Notifications, ${notifCount} alerte${notifCount > 1 ? 's' : ''}` : 'Notifications'}
                aria-haspopup="true"
                aria-expanded={notificationsOpen}
                title={notifCount ? `${notifCount} alerte${notifCount > 1 ? 's' : ''} à traiter` : 'Aucune notification'}
              >
                <Bell size={18} />
                {notifCount > 0 ? (
                  <span className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-[17px] min-w-[17px] select-none items-center justify-center rounded-full bg-gold-500 px-1 text-[9.5px] font-extrabold leading-none tabular-nums text-navy-950 shadow-[0_2px_6px_rgba(10,37,64,.2)] ring-2 ring-white">
                    {notifLabel}
                  </span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <>
                  <button type="button" tabIndex={-1} className="fixed inset-0 z-[var(--z-overlay)] cursor-default" onClick={() => setNotificationsOpen(false)} aria-label="Fermer les notifications" />
                  <div className="fixed left-4 right-4 top-[calc(var(--topbar-height)+8px)] z-[var(--z-sidebar)] overflow-hidden rounded-2xl border border-line bg-white shadow-lift animate-scale-in sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[380px]">
                    <div className="flex items-center justify-between border-b border-line px-4 py-3">
                      <div>
                        <p className="text-[13px] font-bold text-navy-950">Notifications</p>
                        <p className="text-[10.5px] text-muted">
                          {notifCount > 0 ? `${notifCount} alerte${notifCount > 1 ? 's' : ''} à traiter` : 'Aucune alerte en cours'}
                        </p>
                      </div>
                      <button type="button" onClick={() => setNotificationsOpen(false)} className="btn-icon h-7 w-7" aria-label="Fermer">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="scrollbar-thin max-h-[min(360px,55dvh)] overflow-y-auto">
                      {!notifications?.items?.length ? (
                        <div className="px-4 py-10 text-center">
                          <p className="text-xs font-semibold text-navy-900">Tout est à jour</p>
                          <p className="mt-1 text-[11px] text-muted">Aucune alerte pour le moment.</p>
                        </div>
                      ) : notifications.items.map((notification) => {
                        const Icon = NOTIF_ICONS[notification.type] || Bell;
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => {
                              navigate(notification.to);
                              setNotificationsOpen(false);
                            }}
                            className="flex w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left transition last:border-0 hover:bg-navy-50/40"
                          >
                            <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', NOTIF_TONES[notification.tone])}>
                              <Icon size={15} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold text-navy-950">{notification.title}</span>
                                {notification.date ? <span className="shrink-0 text-[9.5px] text-slate-400">{relativeDay(notification.date)}</span> : null}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted">{notification.detail}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Link to="/planning" className="block border-t border-line bg-slate-50/60 px-4 py-2.5 text-center text-[11px] font-semibold text-navy-700 transition hover:bg-navy-50">
                      Voir le planning des livraisons
                    </Link>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mx-1 hidden h-7 w-px bg-line sm:block" />

            <Link
              to="/parametres"
              className="flex items-center gap-2.5 rounded-xl p-1 pr-1.5 transition hover:bg-navy-50 sm:pr-2"
            >
              <Avatar name={user?.name} color={user?.avatar_color} size="sm" />
              <span className="hidden min-w-0 leading-tight xl:block">
                <span className="block max-w-[140px] truncate text-[12px] font-semibold text-navy-950">{user?.name}</span>
                <span className="block text-[9.5px] text-muted">{user ? ROLE_META[user.role].label : ''}</span>
              </span>
              <ChevronDown size={13} className="hidden text-slate-400 xl:block" />
            </Link>
          </div>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
