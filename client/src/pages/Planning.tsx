import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addDays, addMonths, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval,
  endOfMonth, endOfWeek, format, isSameMonth, isToday as isTodayFn, startOfMonth, startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Columns3,
  GanttChartSquare, List, PackageCheck, Plus, SearchX, Timer, Truck,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import { ProjectModal } from '@/components/modals/ProjectModal';
import {
  Avatar, Badge, Button, EmptyState, Progress, SearchInput,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { getList } from '@/lib/api';
import { HEALTH_META, PROJECT_STATUS_META } from '@/lib/constants';
import { formatDate, formatMoney, relativeDay, todayISO, toDate } from '@/lib/format';
import type { Project, User } from '@/types';
import { cn } from '@/lib/cn';

type ViewMode = 'month' | 'week' | 'timeline' | 'list';
type Bucket = '' | 'overdue' | 'today' | 'tomorrow' | 'd3' | 'd7';

const BUCKETS: Array<{ key: Exclude<Bucket, ''>; label: string; tone: 'red' | 'gold' | 'navy' | 'amber' | 'slate' }> = [
  { key: 'overdue', label: 'En retard', tone: 'red' },
  { key: 'today', label: 'Aujourd’hui', tone: 'gold' },
  { key: 'tomorrow', label: 'Demain', tone: 'navy' },
  { key: 'd3', label: 'Sous 3 jours', tone: 'amber' },
  { key: 'd7', label: 'Sous 7 jours', tone: 'slate' },
];

const ACTIVE_STATUSES = ['cadrage', 'en_cours', 'en_attente'];

function bucketOf(project: Project): Exclude<Bucket, ''> | null {
  if (!project.due_date || !ACTIVE_STATUSES.includes(project.status)) return null;
  const days = project.days_left ?? null;
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 3) return 'd3';
  if (days <= 7) return 'd7';
  return null;
}

const BUCKET_TONE: Record<string, 'red' | 'gold' | 'navy' | 'amber' | 'slate'> = {
  overdue: 'red', today: 'gold', tomorrow: 'navy', d3: 'amber', d7: 'slate',
};

export default function Planning() {
  const { canManage } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<ViewMode>('timeline');
  const [bucket, setBucket] = useState<Bucket>((searchParams.get('bucket') as Bucket) || '');
  const [search, setSearch] = useState('');
  const [manager, setManager] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);

  const { data, loading, error, refresh } = useAsync(() => getList<Project>('/projects?limit=200'), []);
  const { data: usersData } = useAsync(() => getList<User>('/users'), []);

  const projects = data?.data ?? [];
  const users = usersData?.data ?? [];

  useEffect(() => {
    const next = (searchParams.get('bucket') as Bucket) || '';
    setBucket(next);
    if (next) setView('list');
  }, [searchParams]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { overdue: 0, today: 0, tomorrow: 0, d3: 0, d7: 0 };
    for (const project of projects) {
      const key = bucketOf(project);
      if (key) out[key] += 1;
    }
    return out;
  }, [projects]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (bucket && bucketOf(project) !== bucket) return false;
      if (manager && project.manager_id !== manager) return false;
      if (status && project.status !== status) return false;
      if (term) {
        const haystack = [project.name, project.code, project.client_company, project.client_name, project.manager_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [projects, bucket, manager, status, search]);

  const active = projects.filter((project) => ACTIVE_STATUSES.includes(project.status));
  const nextSeven = active.filter((project) => (project.days_left ?? 999) >= 0 && (project.days_left ?? 999) <= 7);
  const onTime = active.filter((project) => (project.days_left ?? 0) >= 0);
  const pipeline = active.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);

  const openProject = (project: Project) => { setSelected(project); setModalOpen(true); };

  const chooseBucket = (key: Bucket) => {
    setBucket(key);
    const next = new URLSearchParams(searchParams);
    if (key) next.set('bucket', key); else next.delete('bucket');
    setSearchParams(next, { replace: true });
  };

  const byDueDate = (dateKey: string) => filtered.filter((project) => project.due_date === dateKey);

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const timeline = useMemo(() => {
    const projectsWithDates = filtered.filter((project) => project.start_date || project.due_date);
    if (!projectsWithDates.length) return null;
    const dates = projectsWithDates.flatMap((project) => [toDate(project.start_date), toDate(project.due_date)]).filter(Boolean) as Date[];
    if (!dates.length) return null;
    const min = startOfMonth(new Date(Math.min(...dates.map((d) => d.getTime()))));
    const max = endOfMonth(new Date(Math.max(...dates.map((d) => d.getTime()))));
    const totalDays = Math.max(1, differenceInCalendarDays(max, min) + 1);
    const months = eachMonthOfInterval({ start: min, end: max });
    const today = toDate(todayISO())!;
    return {
      min, max, totalDays, months,
      todayLeft: differenceInCalendarDays(today, min) / totalDays * 100,
    };
  }, [filtered]);

  if (loading) {
    return <PageLoading eyebrow="Engagements" title="Planning & Livraisons" cards={5} />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger le planning"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Engagements"
        title="Planning & Livraisons"
        description="Visualisez chaque engagement de livraison et anticipez les risques. Les alertes se déclenchent à 7, 3 et 1 jour, le jour même et dès qu’une échéance est dépassée."
        actions={canManage ? <Button variant="gold" icon={Plus} onClick={() => { setSelected(null); setModalOpen(true); }}>Nouveau programme</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Programmes actifs" value={active.length} icon={Truck} tone="navy" sub={`${formatMoney(pipeline, true)} de budget`} />
        <StatCard label="Sous 7 jours" value={nextSeven.length} icon={CalendarClock} tone="gold" sub="Livraisons imminentes" />
        <StatCard label="En retard" value={counts.overdue} icon={Timer} tone="red" sub={counts.overdue ? 'Plan de rattrapage requis' : 'Aucun retard'} attention={counts.overdue > 0} />
        <StatCard label="Aujourd’hui" value={counts.today} icon={CalendarDays} tone="amber" sub="Échéances du jour" />
        <StatCard label="Dans les délais" value={onTime.length} icon={PackageCheck} tone="green" sub={`${active.length ? Math.round((onTime.length / active.length) * 100) : 100}% du portefeuille`} />
      </div>

      <div className="card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {BUCKETS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => chooseBucket(bucket === item.key ? '' : item.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-semibold transition',
                bucket === item.key
                  ? item.key === 'overdue' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gold-300 bg-gold-50 text-navy-900'
                  : 'border-line bg-white text-slate-500 hover:border-navy-200',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', item.tone === 'red' ? 'bg-red-500' : item.tone === 'gold' ? 'bg-gold-500' : item.tone === 'amber' ? 'bg-amber-500' : item.tone === 'navy' ? 'bg-navy-600' : 'bg-slate-400')} />
              {item.label}
              <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', bucket === item.key ? 'bg-white/70 text-navy-900' : 'bg-slate-100 text-slate-500')}>{counts[item.key]}</span>
            </button>
          ))}
          {bucket ? <button type="button" onClick={() => chooseBucket('')} className="text-[10.5px] font-semibold text-slate-400 underline-offset-2 hover:text-navy-800 hover:underline">Réinitialiser</button> : null}
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder="Rechercher un programme, un client, un code…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[140px]" value={manager} onChange={(event) => setManager(event.target.value)} aria-label="Filtrer par responsable">
              <option value="">Tous responsables</option>
              {users.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[136px]" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut">
              <option value="">Tous statuts</option>
              {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            <div className="segmented">
              <button type="button" data-active={view === 'month'} onClick={() => setView('month')} title="Vue mois"><CalendarDays size={14} /><span className="hidden sm:inline">Mois</span></button>
              <button type="button" data-active={view === 'week'} onClick={() => setView('week')} title="Vue semaine"><Columns3 size={14} /><span className="hidden sm:inline">Semaine</span></button>
              <button type="button" data-active={view === 'timeline'} onClick={() => setView('timeline')} title="Vue chronologie"><GanttChartSquare size={14} /><span className="hidden sm:inline">Chronologie</span></button>
              <button type="button" data-active={view === 'list'} onClick={() => setView('list')} title="Vue liste"><List size={14} /><span className="hidden sm:inline">Liste</span></button>
            </div>
          </div>
        </div>
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Aucune livraison sur ce filtre"
            description="Ajustez la période ou les filtres pour retrouver vos engagements."
            action={<Button variant="secondary" onClick={() => { chooseBucket(''); setSearch(''); setStatus(''); setManager(''); }}>Réinitialiser les filtres</Button>}
          />
        </div>
      ) : view === 'month' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setMonth((current) => addMonths(current, -1))} aria-label="Mois précédent"><ChevronLeft size={15} /></button>
              <p className="min-w-0 flex-1 truncate text-center text-[12px] font-bold capitalize text-navy-950 sm:flex-none sm:min-w-[150px] sm:text-[13px]">{format(month, 'MMMM yyyy', { locale: fr })}</p>
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setMonth((current) => addMonths(current, 1))} aria-label="Mois suivant"><ChevronRight size={15} /></button>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setMonth(startOfMonth(new Date()))}>Aujourd’hui</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> En retard</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gold-500" /> Échéance proche</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-navy-600" /> Dans les délais</span>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-line bg-navy-50/40">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => <div key={day} className="px-2 py-2 text-center text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-500">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const items = byDueDate(format(day, 'yyyy-MM-dd'));
              return (
                <div key={day.toISOString()} className={cn('min-h-[108px] border-b border-r border-line p-1.5 sm:min-h-[128px]', !isSameMonth(day, month) && 'bg-slate-50/60', isTodayFn(day) && 'bg-gold-50/50')}>
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold', isTodayFn(day) ? 'bg-gold-500 text-navy-950' : isSameMonth(day, month) ? 'text-navy-800' : 'text-slate-300')}>{format(day, 'd')}</span>
                    {items.length ? <span className="text-[8px] font-bold text-slate-400">{items.length}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 2).map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => openProject(project)}
                        className={cn(
                          'block w-full truncate rounded px-1.5 py-1 text-left text-[9px] font-medium transition hover:brightness-95',
                          project.health === 'late' ? 'bg-red-50 text-red-700' : project.health === 'soon' ? 'bg-gold-50 text-gold-800' : 'bg-navy-50 text-navy-800',
                        )}
                        title={project.name}
                      >
                        {project.name}
                      </button>
                    ))}
                    {items.length > 2 ? <p className="px-1 text-[8px] font-semibold text-slate-400">+{items.length - 2} autres</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === 'week' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setWeekStart((current) => addDays(current, -7))} aria-label="Semaine précédente"><ChevronLeft size={15} /></button>
              <p className="min-w-0 flex-1 truncate text-center text-[11.5px] font-bold text-navy-950 sm:flex-none sm:min-w-[190px] sm:text-[13px]">
                {format(weekStart, 'd MMM', { locale: fr })} — {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: fr })}
              </p>
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setWeekStart((current) => addDays(current, 7))} aria-label="Semaine suivante"><ChevronRight size={15} /></button>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Cette semaine</Button>
            </div>
            <p className="text-[10.5px] text-muted">Livraisons et démarrages planifiés</p>
          </div>
          <div className="scrollbar-thin flex overflow-x-auto">
            {weekDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const due = filtered.filter((project) => project.due_date === key);
              const starting = filtered.filter((project) => project.start_date === key && project.due_date !== key);
              return (
                <div key={key} className={cn('min-h-[420px] min-w-[170px] flex-1 border-r border-line p-2 last:border-r-0', isTodayFn(day) && 'bg-gold-50/40')}>
                  <div className="mb-2 border-b border-line pb-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">{format(day, 'EEEE', { locale: fr })}</p>
                    <p className={cn('text-[14px] font-extrabold', isTodayFn(day) ? 'text-gold-700' : 'text-navy-950')}>{format(day, 'd MMM', { locale: fr })}</p>
                  </div>
                  <div className="space-y-1.5">
                    {due.map((project) => (
                      <button key={`due-${project.id}`} type="button" onClick={() => openProject(project)} className={cn('block w-full rounded-lg border p-2 text-left transition hover:shadow-sm', project.health === 'late' ? 'border-red-100 bg-red-50' : project.health === 'soon' ? 'border-gold-200 bg-gold-50' : 'border-navy-100 bg-navy-50/70')}>
                        <span className="mb-1 flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-slate-400"><Truck size={9} /> Livraison</span>
                        <span className="block truncate text-[10px] font-semibold text-navy-950">{project.name}</span>
                        <span className="mt-0.5 block truncate text-[8.5px] text-slate-400">{project.client_company || project.client_name || 'Sans client'}</span>
                      </button>
                    ))}
                    {starting.map((project) => (
                      <button key={`start-${project.id}`} type="button" onClick={() => openProject(project)} className="block w-full rounded-lg border border-line bg-white p-2 text-left transition hover:shadow-sm">
                        <span className="mb-1 flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-slate-400"><CalendarClock size={9} /> Démarrage</span>
                        <span className="block truncate text-[10px] font-semibold text-navy-950">{project.name}</span>
                        <span className="mt-0.5 block truncate text-[8.5px] text-slate-400">{project.manager_name || 'Non affecté'}</span>
                      </button>
                    ))}
                    {!due.length && !starting.length ? <p className="rounded-lg border border-dashed border-line px-2 py-6 text-center text-[9px] text-slate-300">Libre</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === 'timeline' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="text-[14px] font-bold text-navy-950">Chronologie des programmes</h2>
              <p className="text-[10.5px] text-muted">Du démarrage à la livraison promise · {filtered.filter((project) => project.start_date || project.due_date).length} programmes</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> En retard</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gold-500" /> Proche</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Dans les délais</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Livré / annulé</span>
            </div>
          </div>

          {!timeline ? (
            <EmptyState icon={GanttChartSquare} title="Aucune date planifiée" description="Renseignez les dates de démarrage et de livraison pour afficher la chronologie." />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="flex border-b border-line bg-navy-50/40">
                  <div className="w-[240px] shrink-0 border-r border-line px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-500">Programme</div>
                  <div className="relative flex-1">
                    {timeline.months.map((item) => {
                      const left = differenceInCalendarDays(item, timeline.min) / timeline.totalDays * 100;
                      const width = differenceInCalendarDays(endOfMonth(item), item) / timeline.totalDays * 100;
                      return (
                        <div key={item.toISOString()} className="absolute top-0 border-l border-line/70 py-2 pl-2 text-[9px] font-bold uppercase tracking-wide text-slate-500" style={{ left: `${left}%`, width: `${width}%` }}>
                          {format(item, 'MMM yy', { locale: fr })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-[240px] right-0">
                    {timeline.months.map((item) => {
                      const left = differenceInCalendarDays(item, timeline.min) / timeline.totalDays * 100;
                      return <span key={item.toISOString()} className="absolute inset-y-0 border-l border-line/60" style={{ left: `${left}%` }} />;
                    })}
                    {timeline.todayLeft >= 0 && timeline.todayLeft <= 100 ? (
                      <span className="absolute inset-y-0 z-10 border-l-2 border-dashed border-gold-500/70" style={{ left: `${timeline.todayLeft}%` }} />
                    ) : null}
                  </div>

                  {filtered.filter((project) => project.start_date || project.due_date).map((project) => {
                    const start = toDate(project.start_date) || toDate(project.due_date)!;
                    const due = toDate(project.due_date) || addDays(start, 14);
                    const clampStart = start < timeline.min ? timeline.min : start;
                    const clampDue = due > timeline.max ? timeline.max : due;
                    const left = differenceInCalendarDays(clampStart, timeline.min) / timeline.totalDays * 100;
                    const width = Math.max(1.2, (differenceInCalendarDays(clampDue, clampStart) + 1) / timeline.totalDays * 100);
                    const tone = project.health === 'late' ? 'from-red-400 to-red-500' : project.health === 'soon' ? 'from-gold-400 to-gold-500' : project.health === 'done' ? 'from-emerald-400 to-emerald-500' : project.health === 'cancelled' ? 'from-slate-300 to-slate-400' : 'from-navy-500 to-navy-700';
                    return (
                      <div key={project.id} className="flex h-11 items-center border-b border-line/60 transition hover:bg-navy-50/30">
                        <button type="button" onClick={() => openProject(project)} className="flex w-[240px] shrink-0 items-center gap-2 border-r border-line px-4 text-left">
                          <Avatar name={project.manager_name} color={project.manager_color} size="xs" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10.5px] font-semibold text-navy-950">{project.name}</span>
                            <span className="block truncate text-[8.5px] text-slate-400">{project.client_company || project.client_name || 'Sans client'}</span>
                          </span>
                        </button>
                        <div className="relative h-full flex-1">
                          <button
                            type="button"
                            onClick={() => openProject(project)}
                            title={`${project.name} · ${formatDate(project.start_date)} → ${formatDate(project.due_date)}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            className={cn('absolute top-1/2 flex h-5 -translate-y-1/2 items-center overflow-hidden rounded-full bg-gradient-to-r px-1.5 shadow-sm transition hover:brightness-110', tone)}
                          >
                            <span className="truncate text-[8px] font-bold text-white/95">{project.progress}%</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Programme</th>
                  <th>Client</th>
                  <th>Responsable</th>
                  <th>Livraison</th>
                  <th>Reste</th>
                  <th className="w-[128px]">Avancement</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))).map((project) => (
                  <tr key={project.id} className="cursor-pointer" onClick={() => openProject(project)}>
                    <td>
                      <p className="max-w-[260px] truncate text-[12.5px] font-semibold text-navy-950">{project.name}</p>
                      <p className="text-[9.5px] text-muted">{project.code} · {formatMoney(project.budget, true)}</p>
                    </td>
                    <td><p className="max-w-[160px] truncate text-[11.5px] text-slate-600">{project.client_company || project.client_name || '—'}</p></td>
                    <td>
                      <span className="flex items-center gap-2">
                        <Avatar name={project.manager_name} color={project.manager_color} size="xs" />
                        <span className="text-[11px] text-slate-600">{project.manager_name || '—'}</span>
                      </span>
                    </td>
                    <td>
                      <p className="text-[11.5px] font-medium text-navy-900">{formatDate(project.due_date)}</p>
                      <p className="text-[9.5px] text-slate-400">{formatDate(project.start_date)} →</p>
                    </td>
                    <td>
                      <span className={cn('text-[10.5px] font-semibold', project.health === 'late' ? 'text-red-500' : project.health === 'soon' ? 'text-amber-600' : 'text-slate-400')}>
                        {relativeDay(project.due_date)}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Progress value={project.progress} tone={project.progress >= 80 ? 'green' : 'navy'} />
                        <span className="w-7 text-right text-[10px] font-bold text-navy-800">{project.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={PROJECT_STATUS_META[project.status]?.tone || 'navy'}>{PROJECT_STATUS_META[project.status]?.label}</Badge>
                        <Badge tone={HEALTH_META[project.health || 'ontime'].tone} className="!px-1.5 !py-0.5 !text-[8px]">{HEALTH_META[project.health || 'ontime'].label}</Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line md:hidden">
            {[...filtered].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))).map((project) => (
              <button key={project.id} type="button" onClick={() => openProject(project)} className="block w-full p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-navy-950">{project.name}</p>
                    <p className="truncate text-[10px] text-muted">{project.client_company || project.client_name || 'Sans client'}</p>
                  </div>
                  <Badge tone={BUCKET_TONE[bucketOf(project) || 'd7']}>{relativeDay(project.due_date)}</Badge>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Progress value={project.progress} tone={project.progress >= 80 ? 'green' : 'navy'} />
                  <span className="text-[10px] font-bold text-navy-800">{project.progress}%</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-slate-400">
                  <span>{project.manager_name || 'Non affecté'}</span>
                  <span>{formatDate(project.due_date)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <ProjectModal
        open={modalOpen}
        project={selected}
        readOnly={!canManage}
        onClose={() => { setModalOpen(false); setSelected(null); }}
        onSaved={() => { refresh(); }}
      />
    </div>
  );
}
