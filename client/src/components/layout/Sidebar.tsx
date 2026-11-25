import { useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarDays, FileText, LayoutDashboard, ListTodo,
  LogOut, Plus, Settings, Sparkles, Users, UsersRound, X,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ROLE_META } from '@/lib/constants';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  managerOnly?: boolean;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Pilotage',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/taches', label: 'To-do List', icon: ListTodo },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { to: '/clients', label: 'Clients & Programmes', icon: UsersRound },
      { to: '/planning', label: 'Planning & Livraisons', icon: CalendarDays },
      { to: '/devis', label: 'Devis', icon: FileText, managerOnly: true },
    ],
  },
  {
    label: 'Analyse',
    items: [{ to: '/rapports', label: 'Rapports & Statistiques', icon: BarChart3, managerOnly: true }],
  },
  {
    label: 'Organisation',
    items: [
      { to: '/equipe', label: 'Équipe & Utilisateurs', icon: Users, managerOnly: true },
      { to: '/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout, canManage } = useAuth();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hiddenOnMobile = !open && !isDesktop;

  useEffect(() => {
    if (open && !isDesktop) closeButtonRef.current?.focus();
  }, [open, isDesktop]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[var(--z-overlay)] bg-navy-950/50 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
          aria-label="Fermer le menu"
        />
      ) : null}
      <aside
        id="navigation-principale"
        className={cn(
          'no-print fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex w-sidebar flex-col overflow-hidden bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950 text-white transition-transform duration-200 ease-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navigation principale"
        aria-hidden={hiddenOnMobile || undefined}
        aria-modal={isDesktop ? undefined : true}
        inert={hiddenOnMobile || undefined}
        role={isDesktop ? undefined : 'dialog'}
      >
        <div className="canvas-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -right-24 top-1/4 h-56 w-56 rounded-full bg-navy-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-gold-500/[0.07] blur-3xl" />

        <div className="relative flex h-topbar shrink-0 items-center justify-between px-6">
          <button type="button" onClick={() => { navigate('/'); onClose(); }} className="text-left">
            <Logo dark />
          </button>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>

        <div className="relative px-5 pb-1 pt-3">
          <Link
            to={canManage ? '/taches?new=1' : '/taches'}
            onClick={onClose}
            className="group flex items-center justify-between gap-2 rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 px-3.5 py-2.5 text-[12.5px] font-bold text-navy-950 shadow-gold transition hover:from-gold-300 hover:to-gold-400"
          >
            <span className="flex items-center gap-2">
              <Plus size={15} strokeWidth={2.6} />
              {canManage ? 'Nouvelle tâche' : 'Mes tâches'}
            </span>
            <Sparkles size={13} className="opacity-50 transition group-hover:opacity-90" />
          </Link>
        </div>

        <nav className="scrollbar-thin relative flex-1 overflow-y-auto px-5 pb-4">
          {GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.managerOnly || canManage);
            if (!items.length) return null;
            return (
              <div key={group.label}>
                <p className="nav-group-label px-3">{group.label}</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) => cn('nav-link', isActive && 'active')}
                    >
                      <item.icon size={17} strokeWidth={1.9} className="shrink-0 text-white/55 transition-colors" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="relative shrink-0 border-t border-white/10 p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur">
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} color={user?.avatar_color || '#C9A227'} size="sm" className="ring-1 ring-white/20" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white">{user?.name}</p>
                <p className="truncate text-[10px] text-white/45">{user ? ROLE_META[user.role].label : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => { logout(); navigate('/login'); }}
                className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/10 hover:text-gold-300"
                title="Se déconnecter"
                aria-label="Se déconnecter"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-[9.5px] text-white/30">
            <span>Copil · v1.0</span>
            <span className="inline-flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-emerald-400" /> Données persistantes</span>
          </div>
        </div>
      </aside>
    </>
  );
}
