import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  isToday as isTodayFn, startOfMonth, startOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  CalendarDays, Check, CheckCircle2, Columns3, List, ListChecks, Plus, SearchX,
  Timer, TriangleAlert, UserRound,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import { TaskModal } from '@/components/modals/TaskModal';
import {
  Avatar, Badge, Button, EmptyState, Pagination, Progress, SearchInput,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getList } from '@/lib/api';
import { PRIORITY_META, PRIORITY_OPTIONS, TASK_STATUS_META } from '@/lib/constants';
import { formatDate, relativeDay } from '@/lib/format';
import type { Task, TaskStatus, User } from '@/types';
import { cn } from '@/lib/cn';

type ViewMode = 'kanban' | 'list' | 'calendar';

const COLUMNS: Array<{ key: Exclude<TaskStatus, 'late'>; accent: string; dot: string }> = [
  { key: 'todo', accent: 'border-t-slate-300', dot: 'bg-slate-400' },
  { key: 'in_progress', accent: 'border-t-navy-700', dot: 'bg-navy-700' },
  { key: 'waiting', accent: 'border-t-gold-500', dot: 'bg-gold-500' },
  { key: 'done', accent: 'border-t-emerald-500', dot: 'bg-emerald-500' },
];

const PAGE_SIZE = 10;

export default function Tasks() {
  const { user, canManage } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<string>('todo');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const openedNew = useRef(false);
  const openedTask = useRef(false);

  const { data, loading, error, refresh, setData } = useAsync(
    () => getList<Task>('/tasks?limit=400'),
    [],
  );
  const { data: usersData } = useAsync(() => getList<User>('/users'), []);

  const tasks = data?.data ?? [];
  const users = usersData?.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (term) {
        const haystack = [task.title, task.description, task.client_company, task.client_name, task.project_name]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (priority && task.priority !== priority) return false;
      if (assignee && task.assignee_id !== assignee) return false;
      if (onlyMine && task.assignee_id !== user?.id) return false;
      return true;
    });
  }, [tasks, search, priority, assignee, onlyMine, user?.id]);

  const counts = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((task) => task.effective_status === 'todo').length,
    inProgress: tasks.filter((task) => task.effective_status === 'in_progress').length,
    late: tasks.filter((task) => task.effective_status === 'late').length,
    done: tasks.filter((task) => task.effective_status === 'done').length,
  }), [tasks]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, priority, assignee, onlyMine]);

  useEffect(() => {
    if (!data) return;
    if (!openedNew.current && searchParams.get('new') === '1' && canManage) {
      openedNew.current = true;
      setSelected(null);
      setDefaultStatus('todo');
      setModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    const taskId = searchParams.get('task');
    if (taskId && !openedTask.current) {
      const match = tasks.find((task) => task.id === taskId);
      if (match) {
        openedTask.current = true;
        setSelected(match);
        setModalOpen(true);
        const next = new URLSearchParams(searchParams);
        next.delete('task');
        setSearchParams(next, { replace: true });
      }
    }
  }, [data, searchParams, canManage, setSearchParams, tasks]);

  const openNew = (status: string = 'todo') => {
    setSelected(null);
    setDefaultStatus(status);
    setModalOpen(true);
  };

  const openTask = (task: Task) => {
    setSelected(task);
    setModalOpen(true);
  };

  const completeTask = async (task: Task) => {
    setCompleting(task.id);
    try {
      const result = await api.put<{ data: Task }>(`/tasks/${task.id}`, { status: 'done', progress: 100 });
      if (data) setData({ ...data, data: data.data.map((item) => (item.id === task.id ? result.data : item)) });
      toast.success('Tâche terminée', task.title);
    } catch (err) {
      toast.error('Mise à jour impossible', errorMessage(err));
    } finally {
      setCompleting(null);
    }
  };

  const moveTask = async (task: Task, status: Exclude<TaskStatus, 'late'>) => {
    if (task.status === status) return;
    setDragId(null);
    setOverColumn(null);
    const progress = status === 'done' ? 100 : task.progress;
    if (data) {
      setData({
        ...data,
        data: data.data.map((item) => (item.id === task.id
          ? { ...item, status, progress, effective_status: status === 'done' ? 'done' : (item.is_late ? 'late' : status) }
          : item)),
      });
    }
    try {
      const result = await api.put<{ data: Task }>(`/tasks/${task.id}`, { status, progress });
      if (data) setData({ ...data, data: data.data.map((item) => (item.id === task.id ? result.data : item)) });
      toast.success('Tâche déplacée', `${task.title} · ${TASK_STATUS_META[status].label}`);
    } catch (err) {
      toast.error('Déplacement impossible', errorMessage(err));
      refresh();
    }
  };

  const taskForDay = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return filtered.filter((task) => task.due_date === key);
  };

  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  if (loading) {
    return <PageLoading eyebrow="Exécution & suivi" title="To-do List" cards={5} />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger les tâches"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Exécution & suivi"
        title="To-do List"
        description="Pilotez les tâches de l’équipe, du premier cadrage à la livraison finale. Le statut « en retard » est calculé automatiquement à partir de l’échéance."
        actions={canManage ? <Button variant="gold" icon={Plus} onClick={() => openNew('todo')}>Nouvelle tâche</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Tâches actives" value={counts.total - counts.done} icon={ListChecks} tone="navy" sub={`${counts.total} tâches au total`} />
        <StatCard label="À faire" value={counts.todo} icon={ListChecks} tone="slate" sub="À planifier" />
        <StatCard label="En cours" value={counts.inProgress} icon={Timer} tone="gold" sub="Traitement actif" />
        <StatCard label="En retard" value={counts.late} icon={TriangleAlert} tone="red" sub={counts.late ? 'Action requise' : 'Aucun retard'} attention={counts.late > 0} />
        <StatCard label="Terminées" value={counts.done} icon={CheckCircle2} tone="green" sub="Sur l’ensemble du portefeuille" />
      </div>

      <div className="card p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder="Rechercher une tâche, un client, un programme…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[132px]" value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filtrer par priorité">
              <option value="">Toutes priorités</option>
              {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {canManage ? (
              <select className="select w-auto min-w-0 max-w-full sm:min-w-[150px]" value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Filtrer par responsable">
                <option value="">Toute l’équipe</option>
                {users.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setOnlyMine((value) => !value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition',
                onlyMine ? 'border-gold-300 bg-gold-50 text-navy-900' : 'border-line bg-white text-slate-500 hover:border-navy-200',
              )}
            >
              <UserRound size={14} /> Mes tâches
            </button>
            <div className="segmented">
              <button type="button" data-active={view === 'kanban'} onClick={() => setView('kanban')} title="Vue Kanban">
                <Columns3 size={14} /> <span className="hidden sm:inline">Kanban</span>
              </button>
              <button type="button" data-active={view === 'list'} onClick={() => setView('list')} title="Vue liste">
                <List size={14} /> <span className="hidden sm:inline">Liste</span>
              </button>
              <button type="button" data-active={view === 'calendar'} onClick={() => setView('calendar')} title="Vue calendrier">
                <CalendarDays size={14} /> <span className="hidden sm:inline">Calendrier</span>
              </button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[11px] text-muted">
          <span className="font-semibold text-navy-800">{filtered.length}</span> tâche{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
          {filtered.length !== tasks.length ? <span className="text-slate-400">sur {tasks.length}</span> : null}
          {filtered.some((task) => task.effective_status === 'late') ? (
            <Badge tone="red" className="ml-auto">{filtered.filter((task) => task.effective_status === 'late').length} en retard</Badge>
          ) : null}
        </div>
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Aucune tâche ne correspond"
            description="Ajustez les filtres ou créez une nouvelle tâche pour lancer le suivi."
            action={canManage ? <Button variant="gold" icon={Plus} onClick={() => openNew('todo')}>Créer une tâche</Button> : undefined}
          />
        </div>
      ) : view === 'kanban' ? (
        <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {COLUMNS.map((column) => {
            const columnTasks = filtered.filter((task) => task.status === column.key);
            return (
              <section
                key={column.key}
                onDragOver={(event) => { event.preventDefault(); setOverColumn(column.key); }}
                onDragLeave={() => setOverColumn((current) => (current === column.key ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const task = filtered.find((item) => item.id === dragId);
                  if (task) moveTask(task, column.key);
                }}
                className={cn(
                  'kanban-column border-t-[3px] transition-colors',
                  column.accent,
                  overColumn === column.key && 'border-navy-300 bg-navy-50/60',
                )}
              >
                <header className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn('h-2 w-2 rounded-full', column.dot)} />
                  <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-navy-900">{TASK_STATUS_META[column.key].label}</h2>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-slate-500 ring-1 ring-line">{columnTasks.length}</span>
                  {canManage ? (
                    <button type="button" onClick={() => openNew(column.key)} className="btn-icon ml-auto h-6 w-6" title={`Ajouter dans ${TASK_STATUS_META[column.key].label}`}>
                      <Plus size={13} />
                    </button>
                  ) : null}
                </header>

                <div className="flex-1 space-y-2.5">
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      draggable
                      onDragStart={() => setDragId(task.id)}
                      onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                      onClick={() => openTask(task)}
                      className={cn('kanban-card select-none', dragId === task.id && 'dragging')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12.5px] font-semibold leading-snug text-navy-950">{task.title}</p>
                        {task.effective_status === 'late' ? (
                          <Badge tone="red" className="!shrink-0 !px-1.5 !py-0.5 !text-[8.5px]">Retard</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted">
                        {task.client_company || task.client_name || task.project_name || 'Tâche interne'}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={PRIORITY_META[task.priority].tone} dot className="!px-1.5 !py-0.5 !text-[9px]">{PRIORITY_META[task.priority].label}</Badge>
                        {task.due_date ? (
                          <span className={cn('inline-flex items-center gap-1 text-[9.5px]', task.effective_status === 'late' ? 'font-semibold text-red-500' : 'text-slate-400')}>
                            <CalendarDays size={10} /> {relativeDay(task.due_date)}
                          </span>
                        ) : null}
                      </div>
                      {task.status !== 'done' && task.progress > 0 ? (
                        <div className="mt-2.5 flex items-center gap-2">
                          <Progress value={task.progress} tone={task.progress >= 80 ? 'green' : 'navy'} height="h-1" />
                          <span className="text-[9px] font-bold text-slate-400">{task.progress}%</span>
                        </div>
                      ) : null}
                      <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5">
                        <span className="flex items-center gap-1.5">
                          <Avatar name={task.assignee_name} color={task.assignee_color} size="xs" />
                          <span className="max-w-[110px] truncate text-[9.5px] text-slate-500">{task.assignee_name?.split(' ')[0] || 'Non affecté'}</span>
                        </span>
                        {task.status !== 'done' ? (
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); completeTask(task); }}
                            disabled={completing === task.id}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-semibold text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                            title="Marquer comme terminée"
                          >
                            <Check size={11} /> Terminer
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600"><CheckCircle2 size={11} /> Terminé</span>
                        )}
                      </div>
                    </article>
                  ))}
                  {!columnTasks.length ? (
                    <div className="rounded-xl border border-dashed border-line/90 px-3 py-8 text-center text-[10.5px] text-slate-400">
                      Glissez une tâche ici
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ) : view === 'list' ? (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10"> </th>
                  <th>Tâche</th>
                  <th>Responsable</th>
                  <th>Priorité</th>
                  <th>Échéance</th>
                  <th className="w-[130px]">Avancement</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((task) => (
                  <tr key={task.id} className="cursor-pointer" onClick={() => openTask(task)}>
                    <td onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => completeTask(task)}
                        disabled={task.status === 'done' || completing === task.id}
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full border transition',
                          task.status === 'done'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-slate-300 bg-white text-transparent hover:border-emerald-400 hover:text-emerald-500',
                        )}
                        title={task.status === 'done' ? 'Terminée' : 'Marquer comme terminée'}
                      >
                        <Check size={9} strokeWidth={3} />
                      </button>
                    </td>
                    <td>
                      <p className="max-w-[340px] truncate text-[12.5px] font-semibold text-navy-950">{task.title}</p>
                      <p className="max-w-[340px] truncate text-[10px] text-muted">
                        {task.client_company || task.client_name || 'Interne'}{task.project_name ? ` · ${task.project_name}` : ''}
                      </p>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <Avatar name={task.assignee_name} color={task.assignee_color} size="xs" />
                        <span className="text-[11.5px] text-slate-600">{task.assignee_name || '—'}</span>
                      </span>
                    </td>
                    <td><Badge tone={PRIORITY_META[task.priority].tone} dot>{PRIORITY_META[task.priority].label}</Badge></td>
                    <td>
                      <p className={cn('text-[11.5px] font-medium', task.effective_status === 'late' ? 'text-red-600' : 'text-navy-900')}>{formatDate(task.due_date)}</p>
                      <p className="text-[9.5px] text-slate-400">{task.due_date ? relativeDay(task.due_date) : 'Sans échéance'}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Progress value={task.progress} tone={task.progress >= 80 ? 'green' : 'navy'} />
                        <span className="w-7 text-right text-[10px] font-bold text-navy-800">{task.progress}%</span>
                      </div>
                    </td>
                    <td><Badge tone={TASK_STATUS_META[task.effective_status].tone}>{TASK_STATUS_META[task.effective_status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-line md:hidden">
            {paged.map((task) => (
              <button key={task.id} type="button" onClick={() => openTask(task)} className="block w-full p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12.5px] font-semibold leading-snug text-navy-950">{task.title}</p>
                  <Badge tone={TASK_STATUS_META[task.effective_status].tone}>{TASK_STATUS_META[task.effective_status].label}</Badge>
                </div>
                <p className="mt-1 truncate text-[10px] text-muted">{task.client_company || task.client_name || 'Interne'}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Avatar name={task.assignee_name} color={task.assignee_color} size="xs" />
                  <span className="text-[10px] text-slate-500">{task.assignee_name || 'Non affecté'}</span>
                  <Badge tone={PRIORITY_META[task.priority].tone} className="!px-1.5 !py-0.5 !text-[8.5px]">{PRIORITY_META[task.priority].label}</Badge>
                  <span className={cn('ml-auto text-[10px]', task.effective_status === 'late' ? 'font-semibold text-red-500' : 'text-slate-400')}>{relativeDay(task.due_date)}</span>
                </div>
              </button>
            ))}
          </div>

          <Pagination page={page} pages={pages} onChange={setPage} total={filtered.length} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setMonth((current) => addMonths(current, -1))} aria-label="Mois précédent">‹</button>
              <p className="min-w-0 flex-1 truncate text-center text-[12px] font-bold capitalize text-navy-950 sm:flex-none sm:min-w-[150px] sm:text-[13px]">{format(month, 'MMMM yyyy', { locale: fr })}</p>
              <button type="button" className="btn-icon h-8 w-8 shrink-0" onClick={() => setMonth((current) => addMonths(current, 1))} aria-label="Mois suivant">›</button>
              <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setMonth(startOfMonth(new Date()))}>Aujourd’hui</Button>
            </div>
            <p className="text-[10.5px] text-muted">Échéances des tâches · {filtered.filter((task) => task.due_date).length} planifiées</p>
          </div>

          <div className="grid grid-cols-7 border-b border-line bg-navy-50/40">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
              <div key={day} className="px-2 py-2 text-center text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-500">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const dayTasks = taskForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-[104px] border-b border-r border-line p-1.5 sm:min-h-[120px]',
                    !isSameMonth(day, month) && 'bg-slate-50/60',
                    isTodayFn(day) && 'bg-gold-50/50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between px-0.5">
                    <span className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                      isTodayFn(day) ? 'bg-gold-500 text-navy-950' : isSameMonth(day, month) ? 'text-navy-800' : 'text-slate-300',
                    )}>
                      {format(day, 'd')}
                    </span>
                    {dayTasks.length > 2 ? <span className="text-[8.5px] font-bold text-slate-400">+{dayTasks.length - 2}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 2).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => openTask(task)}
                        className={cn(
                          'block w-full truncate rounded px-1.5 py-1 text-left text-[9px] font-medium transition hover:brightness-95',
                          task.effective_status === 'late'
                            ? 'bg-red-50 text-red-700'
                            : task.status === 'done'
                              ? 'bg-emerald-50 text-emerald-700 line-through opacity-70'
                              : 'bg-navy-50 text-navy-800',
                        )}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelected(null); }}
        task={selected}
        defaultStatus={defaultStatus}
        onSaved={() => { refresh(); }}
      />
    </div>
  );
}
