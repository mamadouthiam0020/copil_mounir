import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, Check,
  CheckCircle2, CheckSquare, FilePlus2, FileText, LayoutDashboard, PackageCheck, Phone, Plus,
  Send, Sparkles, TrendingUp, Truck, UserPlus, UsersRound,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import { Avatar, Badge, Button, EmptyState, Progress, SectionHeading } from '@/components/ui';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { TaskModal } from '@/components/modals/TaskModal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getData } from '@/lib/api';
import { PROJECT_STATUS_META, PRIORITY_META } from '@/lib/constants';
import { firstName, formatDate, formatMoney, greeting, relativeDay, timeAgo } from '@/lib/format';
import type { DashboardData, Project, Task } from '@/types';
import { cn } from '@/lib/cn';

const TASK_COLORS: Record<string, string> = {
  todo: '#CBD5E1',
  in_progress: '#123C68',
  waiting: '#D9B950',
  late: '#EF4444',
  done: '#10B981',
};

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #E6EBF2',
  boxShadow: '0 16px 40px -20px rgba(10,37,64,.35)',
  fontSize: 12,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
};

const ACTIVITY_ICONS: Record<string, { icon: typeof Activity; className: string }> = {
  'task.completed': { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  'task.created': { icon: CheckSquare, className: 'bg-navy-50 text-navy-700' },
  'task.updated': { icon: CheckSquare, className: 'bg-slate-100 text-slate-500' },
  'client.created': { icon: UserPlus, className: 'bg-navy-50 text-navy-700' },
  'client.updated': { icon: UsersRound, className: 'bg-slate-100 text-slate-500' },
  'quote.created': { icon: FileText, className: 'bg-gold-50 text-gold-700' },
  'quote.sent': { icon: Send, className: 'bg-sky-50 text-sky-600' },
  'quote.accepted': { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  'project.delivered': { icon: PackageCheck, className: 'bg-emerald-50 text-emerald-600' },
  'project.rescheduled': { icon: CalendarClock, className: 'bg-amber-50 text-amber-600' },
  'project.created': { icon: Sparkles, className: 'bg-violet-50 text-violet-600' },
};

type FocusKind = 'task' | 'deadline' | 'followup' | 'meeting';

interface FocusItem {
  id: string;
  kind: FocusKind;
  title: string;
  meta: string;
  date?: string | null;
  late: boolean;
  task?: Task;
  project?: Project;
  to?: string;
}

const FOCUS_META: Record<FocusKind, { icon: typeof Activity; className: string }> = {
  task: { icon: CheckSquare, className: 'bg-navy-50 text-navy-700' },
  deadline: { icon: CalendarClock, className: 'bg-amber-50 text-amber-600' },
  followup: { icon: Phone, className: 'bg-gold-50 text-gold-600' },
  meeting: { icon: CalendarDays, className: 'bg-sky-50 text-sky-600' },
};

export default function Dashboard() {
  const { user, canManage } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useAsync(() => getData<DashboardData>('/dashboard'), []);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  if (loading) {
    return <PageLoading eyebrow="Pilotage quotidien" title="Chargement de votre cockpit…" cards={4} cardColumns="md:grid-cols-4" />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger le dashboard"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  const { kpis, today, charts, activity } = data;
  const totalTasks = charts.tasksByStatus.reduce((sum, item) => sum + item.value, 0);
  const todayISO = new Date().toISOString().slice(0, 10);

  const focusItems: FocusItem[] = [
    ...today.tasks.map((task) => ({
      id: `task-${task.id}`,
      kind: 'task' as const,
      title: task.title,
      meta: `${PRIORITY_META[task.priority]?.label || 'Priorité'} · ${task.project_name || task.client_company || 'Général'}`,
      date: task.due_date,
      late: task.effective_status === 'late',
      task,
    })),
    ...today.deadlines.map((project) => ({
      id: `deadline-${project.id}`,
      kind: 'deadline' as const,
      title: project.name,
      meta: `Livraison · ${project.client_company || project.client_name || 'Sans client'}`,
      date: project.due_date,
      late: project.health === 'late',
      project,
    })),
    ...today.followUps.map((client) => ({
      id: `followup-${client.id}`,
      kind: 'followup' as const,
      title: client.next_action || 'Relance à définir',
      meta: `Relance · ${client.company || client.name}`,
      date: client.next_action_date,
      late: Boolean(client.next_action_date && client.next_action_date < todayISO),
      to: `/clients/${client.id}`,
    })),
    ...today.meetings.map((meeting) => ({
      id: `meeting-${meeting.id}`,
      kind: 'meeting' as const,
      title: meeting.title,
      meta: `${meeting.type === 'call' ? 'Appel' : 'Rendez-vous'} · ${meeting.client_company || meeting.client_name || 'Interne'}`,
      date: meeting.date,
      late: false,
      to: `/clients/${meeting.client_id}`,
    })),
  ]
    .sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')))
    .slice(0, 7);

  const lateFocus = focusItems.filter((item) => item.late).length;
  const projectsPreview = data.projects.slice(0, 5);

  const completeTask = async (task: Task) => {
    setCompletingId(task.id);
    try {
      await api.put(`/tasks/${task.id}`, { status: 'done', progress: 100 });
      toast.success('Tâche terminée', task.title);
      refresh();
    } catch (err) {
      toast.error('Mise à jour impossible', errorMessage(err));
    } finally {
      setCompletingId(null);
    }
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setTaskOpen(true);
  };

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setProjectOpen(true);
  };

  const openFocus = (item: FocusItem) => {
    if (item.task) return openTask(item.task);
    if (item.project) return openProject(item.project);
    if (item.to) navigate(item.to);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pilotage quotidien"
        title={`${greeting()}, ${firstName(user?.name)}.`}
        description="Vos priorités, vos échéances et les signaux à traiter. L’essentiel, sans le bruit."
        actions={(
          <>
            {canManage ? (
              <Link to="/devis/nouveau" className="btn-secondary">
                <FilePlus2 size={15} /> Nouveau devis
              </Link>
            ) : null}
            <Link to="/taches?new=1" className="btn-gold">
              <Plus size={15} /> Nouvelle tâche
            </Link>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Clients au total"
          value={kpis.clients}
          icon={UsersRound}
          tone="navy"
          sub={`${kpis.prospects} prospect${kpis.prospects > 1 ? 's' : ''} à convertir`}
          to="/clients"
        />
        <StatCard
          label="Programmes actifs"
          value={kpis.activeProjects}
          icon={LayoutDashboard}
          tone="gold"
          sub={`${kpis.upcomingDeliveries} livraisons sous 7 j`}
          to="/planning"
        />
        <StatCard
          label="Tâches ouvertes"
          value={kpis.openTasks}
          icon={CheckSquare}
          tone="blue"
          sub={kpis.lateTasks ? `${kpis.lateTasks} en retard` : 'Aucune tâche en retard'}
          attention={kpis.lateTasks > 0}
          to="/taches"
        />
        <StatCard
          label="Devis en attente"
          value={kpis.pendingQuotes}
          icon={FileText}
          tone="amber"
          sub={`${formatMoney(kpis.pendingQuotesValue, true)} en jeu`}
          to={canManage ? '/devis' : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card card-pad min-w-0">
          <SectionHeading
            title="Priorités du jour"
            subtitle={formatDate(todayISO, 'full')}
            action={(
              <Badge tone={lateFocus ? 'red' : 'gold'} dot>
                {focusItems.length} à traiter
              </Badge>
            )}
          />

          {focusItems.length ? (
            <div className="mt-3 divide-y divide-line/70">
              {focusItems.map((item) => {
                const meta = FOCUS_META[item.kind];
                const Icon = meta.icon;
                const task = item.task;
                return (
                  <div key={item.id} className="group flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                      <Icon size={14} />
                    </span>
                    <button type="button" onClick={() => openFocus(item)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold text-navy-950 transition group-hover:text-navy-600">{item.title}</span>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold',
                            item.late ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {relativeDay(item.date)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted">{item.meta}</span>
                    </button>
                    {task ? (
                      <button
                        type="button"
                        onClick={() => completeTask(task)}
                        disabled={completingId === task.id}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-transparent transition hover:border-emerald-400 hover:text-emerald-500 disabled:opacity-60"
                        title="Marquer comme terminée"
                        aria-label={`Terminer ${task.title}`}
                      >
                        {completingId === task.id
                          ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                          : <Check size={11} strokeWidth={3} />}
                      </button>
                    ) : (
                      <ArrowRight size={13} className="shrink-0 text-slate-300 transition group-hover:text-gold-500" />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center">
              <CheckCircle2 size={22} className="mx-auto text-emerald-500" />
              <p className="mt-2 text-xs font-semibold text-navy-900">Rien d’urgent aujourd’hui</p>
              <p className="mt-1 text-[11px] text-muted">Vos tâches et échéances sont sous contrôle.</p>
            </div>
          )}

          <Link
            to="/taches"
            className="mt-3 flex items-center justify-between rounded-xl border border-line bg-slate-50/60 px-3.5 py-2.5 text-[10.5px] font-semibold text-navy-700 transition hover:border-navy-200 hover:bg-white"
          >
            Ouvrir la to-do list <ArrowRight size={13} className="text-gold-500" />
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-5 text-white shadow-lift">
          <div className="canvas-grid pointer-events-none absolute inset-0 opacity-40" />
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-gold-300">Engagements</p>
                <h2 className="mt-1 text-[15px] font-bold">Livraisons à venir</h2>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-gold-300">
                <Truck size={17} />
              </span>
            </div>

            <div className="mt-5 flex items-end gap-2">
              <span className="text-[38px] font-extrabold leading-none tracking-[-0.04em]">{kpis.upcomingDeliveries}</span>
              <span className="mb-1 text-[11px] leading-tight text-white/45">livraisons<br />sous 7 jours</span>
            </div>

            <div className="mt-5 grid grid-cols-5 gap-1.5">
              {[
                { key: 'overdue', label: 'Dépassées', value: data.deliveries.overdue, className: 'bg-red-400/15 text-red-300 border-red-400/20' },
                { key: 'today', label: 'Auj.', value: data.deliveries.today, className: 'bg-gold-400/15 text-gold-300 border-gold-400/25' },
                { key: 'tomorrow', label: 'Demain', value: data.deliveries.tomorrow, className: 'bg-white/[0.06] text-white/80 border-white/10' },
                { key: 'd3', label: '3 jours', value: data.deliveries.d3, className: 'bg-white/[0.05] text-white/70 border-white/10' },
                { key: 'd7', label: '7 jours', value: data.deliveries.d7, className: 'bg-white/[0.04] text-white/55 border-white/10' },
              ].map((bucket) => (
                <Link
                  key={bucket.key}
                  to={`/planning?bucket=${bucket.key}`}
                  className={cn('rounded-lg border px-1 py-2 text-center transition hover:brightness-125', bucket.className)}
                >
                  <span className="block text-[16px] font-bold leading-none">{bucket.value}</span>
                  <span className="mt-1 block text-[7.5px] font-semibold uppercase tracking-wide opacity-70">{bucket.label}</span>
                </Link>
              ))}
            </div>

            {kpis.lateDeliveries > 0 ? (
              <Link
                to="/planning?bucket=overdue"
                className="mt-4 flex items-center gap-2 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2.5 text-[10.5px] font-semibold text-red-200 transition hover:bg-red-400/15"
              >
                <AlertTriangle size={13} />
                <span className="flex-1">{kpis.lateDeliveries} engagement{kpis.lateDeliveries > 1 ? 's' : ''} en retard</span>
                <ArrowRight size={12} />
              </Link>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-[10.5px] font-medium text-emerald-200">
                <CheckCircle2 size={13} /> Tous les engagements sont tenus.
              </div>
            )}

            <Link
              to="/planning"
              className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[10.5px] font-semibold text-white/80 transition hover:bg-white/[0.08]"
            >
              Ouvrir le planning des livraisons <ArrowRight size={13} className="text-gold-300" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
            <SectionHeading
              title="Programmes actifs"
              subtitle="Progression et prochaines livraisons"
              action={<Badge tone="navy">{kpis.activeProjects} actifs</Badge>}
            />
            <Link to="/planning" className="text-[11px] font-semibold text-navy-700 transition hover:text-gold-600">
              Tout voir →
            </Link>
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Programme</th>
                  <th>Responsable</th>
                  <th className="w-[150px]">Avancement</th>
                  <th>Livraison</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {projectsPreview.map((project) => (
                  <tr key={project.id} className="cursor-pointer" onClick={() => openProject(project)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-[10px] font-bold text-navy-700">
                          {(project.client_company || project.client_name || 'IN').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-navy-950">{project.name}</p>
                          <p className="truncate text-[10px] text-muted">{project.client_company || project.client_name || 'Sans client'} · {project.code}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={project.manager_name} color={project.manager_color} size="xs" />
                        <span className="text-[11.5px] text-slate-600">{project.manager_name?.split(' ')[0] || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Progress value={project.progress} tone={project.progress >= 80 ? 'green' : 'navy'} />
                        <span className="w-8 text-right text-[10.5px] font-bold text-navy-800">{project.progress}%</span>
                      </div>
                    </td>
                    <td>
                      <p className="text-[11.5px] font-medium text-navy-900">{formatDate(project.due_date)}</p>
                      <p className={cn('text-[9.5px]', project.health === 'late' ? 'font-semibold text-red-500' : 'text-slate-400')}>{relativeDay(project.due_date)}</p>
                    </td>
                    <td>
                      <Badge tone={PROJECT_STATUS_META[project.status]?.tone || 'navy'}>{PROJECT_STATUS_META[project.status]?.label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3 px-4 pb-5 md:hidden">
            {projectsPreview.map((project) => (
              <button key={project.id} type="button" onClick={() => openProject(project)} className="w-full rounded-xl border border-line p-3.5 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-navy-950">{project.name}</p>
                    <p className="truncate text-[10px] text-muted">{project.client_company || project.client_name}</p>
                  </div>
                  <Badge tone={PROJECT_STATUS_META[project.status]?.tone || 'navy'}>{PROJECT_STATUS_META[project.status]?.label}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Progress value={project.progress} />
                  <span className="text-[10px] font-bold text-navy-800">{project.progress}%</span>
                </div>
                <div className="mt-2 flex justify-between text-[9.5px] text-slate-400">
                  <span>{project.manager_name || 'Non affecté'}</span>
                  <span>{relativeDay(project.due_date)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[14px] font-bold text-navy-950">Dernières activités</h2>
              <p className="text-[10.5px] text-muted">Journal des actions importantes</p>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Activity size={14} /></span>
          </div>
          <div className="px-5 py-1">
            {activity.length ? activity.slice(0, 5).map((entry) => {
              const meta = ACTIVITY_ICONS[entry.action] || { icon: Activity, className: 'bg-slate-100 text-slate-500' };
              const Icon = meta.icon;
              return (
                <div key={entry.id} className="flex gap-3 border-b border-line/60 py-3 last:border-0">
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', meta.className)}>
                    <Icon size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] leading-snug text-slate-600">
                      <strong className="font-semibold text-navy-950">{entry.entity_label || 'Activité'}</strong>
                    </p>
                    <p className="mt-0.5 truncate text-[9.5px] text-slate-400">
                      <span className="font-medium text-slate-500">{entry.actor_name || 'Système'}</span>
                      <span className="mx-1">·</span>
                      {timeAgo(entry.created_at)}
                    </p>
                  </div>
                </div>
              );
            }) : <p className="py-8 text-center text-xs text-muted">Aucune activité récente.</p>}
          </div>
          <Link to="/rapports" className="flex items-center justify-between border-t border-line px-5 py-3 text-[10.5px] font-semibold text-navy-700 transition hover:bg-navy-50/50">
            Consulter les rapports <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card card-pad">
          <SectionHeading
            title="Évolution des programmes"
            subtitle="Créés et livrés sur 6 mois"
            action={<Badge tone="navy"><TrendingUp size={11} /> 6 mois</Badge>}
          />
          <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-navy-700" /> Créés</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold-500" /> Livrés</span>
          </div>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.projectsEvolution} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#123C68" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#123C68" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C9A227" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#C9A227" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} dy={6} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="créés" stroke="#123C68" strokeWidth={2.2} fill="url(#gradCreated)" dot={{ r: 3, fill: '#123C68', strokeWidth: 2, stroke: '#fff' }} />
                <Area type="monotone" dataKey="livrés" stroke="#C9A227" strokeWidth={2.2} fill="url(#gradDelivered)" dot={{ r: 3, fill: '#C9A227', strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-pad">
          <SectionHeading
            title="Répartition des tâches"
            subtitle="État de la charge opérationnelle"
            action={<Badge tone="slate">{totalTasks} tâches</Badge>}
          />
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-[180px] w-full min-w-0 sm:w-[52%] sm:min-w-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={charts.tasksByStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={72} paddingAngle={3} stroke="none">
                    {charts.tasksByStatus.map((entry) => (
                      <Cell key={entry.key} fill={TASK_COLORS[entry.key] || '#CBD5E1'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[24px] font-extrabold leading-none text-navy-950">{totalTasks}</span>
                <span className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wider text-slate-400">Tâches</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2.5">
              {charts.tasksByStatus.map((item) => (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TASK_COLORS[item.key] }} />
                  <span className="flex-1 truncate text-[10.5px] text-slate-500">{item.name}</span>
                  <span className="text-[11px] font-bold text-navy-900">{item.value}</span>
                  <span className="w-8 text-right text-[9px] text-slate-400">{totalTasks ? Math.round((item.value / totalTasks) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <TaskModal
        open={taskOpen}
        task={selectedTask}
        onClose={() => setTaskOpen(false)}
        onSaved={() => refresh()}
      />
      <ProjectModal
        open={projectOpen}
        project={selectedProject}
        onClose={() => setProjectOpen(false)}
        onSaved={() => { refresh(); }}
        readOnly={!canManage}
      />
    </div>
  );
}
