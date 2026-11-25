import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, CheckSquare, FileText, LayoutDashboard, Search, UsersRound, X,
} from 'lucide-react';
import { getList } from '@/lib/api';
import { useAsync } from '@/hooks/useAsync';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { useAuth } from '@/context/AuthContext';
import type { Client, Project, Task } from '@/types';
import { cn } from '@/lib/cn';

interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  to: string;
  group: string;
  icon: typeof Search;
}

const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const { canManage } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, dialogRef);

  const { data, loading } = useAsync(async () => {
    if (!open) return { clients: [] as Client[], projects: [] as Project[], tasks: [] as Task[] };
    const [clients, projects, tasks] = await Promise.all([
      getList<Client>('/clients?limit=100'),
      getList<Project>('/projects?limit=100'),
      getList<Task>('/tasks?limit=200'),
    ]);
    return { clients: clients.data, projects: projects.data, tasks: tasks.data };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!data) return [];
    const base: PaletteItem[] = [
      { id: 'nav-dash', label: 'Dashboard', sub: 'Vue d’ensemble', to: '/', group: 'Navigation', icon: LayoutDashboard },
      { id: 'nav-tasks', label: 'To-do List', sub: 'Kanban, liste & calendrier', to: '/taches', group: 'Navigation', icon: CheckSquare },
      { id: 'nav-clients', label: 'Clients & Programmes', sub: 'CRM et relation commerciale', to: '/clients', group: 'Navigation', icon: UsersRound },
      { id: 'nav-planning', label: 'Planning & Livraisons', sub: 'Calendrier des engagements', to: '/planning', group: 'Navigation', icon: CalendarDays },
    ];
    if (canManage) {
      base.push(
        { id: 'nav-quotes', label: 'Devis', sub: 'Générer et suivre les devis', to: '/devis', group: 'Navigation', icon: FileText },
        { id: 'action-task', label: 'Nouvelle tâche', sub: 'Créer une tâche', to: '/taches?new=1', group: 'Actions rapides', icon: CheckSquare },
        { id: 'action-quote', label: 'Nouveau devis', sub: 'Ouvrir l’éditeur de devis', to: '/devis/nouveau', group: 'Actions rapides', icon: FileText },
      );
    }
    base.push({ id: 'action-client', label: 'Nouveau client', sub: 'Enregistrer une fiche', to: '/clients?new=1', group: 'Actions rapides', icon: UsersRound });

    const dynamic: PaletteItem[] = [
      ...data.clients.map((c) => ({
        id: `c-${c.id}`, label: c.company || c.name, sub: `${c.sector || 'Client'} · ${c.city || ''}`.trim(),
        to: `/clients/${c.id}`, group: 'Clients', icon: UsersRound,
      })),
      ...data.projects.map((p) => ({
        id: `p-${p.id}`, label: p.name, sub: `${p.client_company || p.client_name || 'Sans client'} · ${p.code || ''}`.trim(),
        to: `/planning?project=${p.id}`, group: 'Programmes', icon: CalendarDays,
      })),
      ...data.tasks.map((t) => ({
        id: `t-${t.id}`, label: t.title, sub: `${t.client_company || t.client_name || 'Interne'} · ${t.project_name || 'Sans projet'}`,
        to: `/taches?task=${t.id}`, group: 'Tâches', icon: CheckSquare,
      })),
    ];

    const all = [...base, ...dynamic];
    if (!query.trim()) return base;
    const needle = norm(query);
    return all.filter((item) => norm(item.label).includes(needle) || norm(item.sub || '').includes(needle)).slice(0, 18);
  }, [data, query, canManage]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const groups = Array.from(new Set(items.map((item) => item.group)));

  const choose = (item: PaletteItem) => {
    navigate(item.to);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center px-3 pt-[8vh] sm:px-4 sm:pt-[14vh]">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-default bg-navy-950/50 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Recherche globale"
        tabIndex={-1}
        className="relative flex max-h-[84dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-lift animate-scale-in focus:outline-none"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((current) => Math.min(items.length - 1, current + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((current) => Math.max(0, current - 1));
          } else if (event.key === 'Enter' && items[selected]) {
            event.preventDefault();
            choose(items[selected]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Search size={18} className="text-slate-400" />
          <input
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un client, un projet, une tâche…"
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
          />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-xs text-muted">Recherche en cours…</p>
          ) : !items.length ? (
            <p className="px-3 py-8 text-center text-xs text-muted">Aucun résultat pour « {query} ».</p>
          ) : (
            groups.map((group) => (
              <div key={group} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">{group}</p>
                {items.filter((item) => item.group === group).map((item) => {
                  const index = items.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
                        index === selected ? 'bg-navy-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', index === selected ? 'bg-navy-900 text-gold-300' : 'bg-slate-100 text-navy-600')}>
                        <item.icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-navy-950">{item.label}</span>
                        {item.sub ? <span className="block truncate text-[11px] text-muted">{item.sub}</span> : null}
                      </span>
                      <ArrowRight size={14} className={cn('shrink-0 text-slate-300 transition', index === selected && 'text-gold-500')} />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-slate-50/60 px-4 py-2 text-[10.5px] text-slate-400">
          <span>↑ ↓ pour naviguer · Entrée pour ouvrir</span>
          <span>Recherche globale</span>
        </div>
      </div>
    </div>
  );
}
