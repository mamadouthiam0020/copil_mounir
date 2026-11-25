import { useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BadgeCheck, Ban, Check, Clock3,
  LayoutGrid, List, LockKeyhole, Mail, Minus, Pencil, Phone, Plus, SearchX,
  ShieldCheck, Trash2, UserCheck, UserX, UsersRound, X,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import {
  Avatar, Badge, Button, EmptyState, Modal, Progress, SearchInput,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getData, getList } from '@/lib/api';
import { ROLE_META } from '@/lib/constants';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import type { AuditEntry, Role, Task, User } from '@/types';
import { cn } from '@/lib/cn';

type ViewMode = 'grid' | 'table';

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  job_title: string;
  phone: string;
  avatar_color: string;
  active: boolean;
}

const AVATAR_COLORS = ['#0A2540', '#123C68', '#C9A227', '#10B981', '#6366F1', '#0EA5E9', '#F59E0B', '#EF4444'];

const PERMISSION_MATRIX: Array<{ label: string; roles: Record<Role, boolean | 'partial'> }> = [
  { label: 'Accéder au tableau de bord', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: true } },
  { label: 'Traiter ses tâches assignées', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: true } },
  { label: 'Créer des tâches et programmes', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: false } },
  { label: 'Gérer les fiches clients', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: 'partial' } },
  { label: 'Créer et convertir des devis', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: false } },
  { label: 'Consulter les rapports', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: true, EMPLOYEE: false } },
  { label: 'Gérer l’équipe', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: 'partial', EMPLOYEE: false } },
  { label: 'Modifier les paramètres', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: false, EMPLOYEE: false } },
  { label: 'Supprimer des données', roles: { SUPER_ADMIN: true, ADMIN: true, MANAGER: false, EMPLOYEE: false } },
];

const AUDIT_TONE: Record<string, string> = {
  'auth.login': 'bg-sky-400',
  'auth.password': 'bg-gold-500',
  'user.created': 'bg-emerald-500',
  'user.updated': 'bg-navy-500',
  'user.deactivated': 'bg-red-400',
  'user.deleted': 'bg-red-500',
  'settings.updated': 'bg-gold-500',
};

function isActive(user: User): boolean {
  return Boolean(Number(user.active ?? 1));
}

export default function Team() {
  const { user: currentUser, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = currentUser?.role === 'SUPER_ADMIN';

  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, refresh } = useAsync(() => getList<User>(`/users?all=${isAdmin ? 1 : 0}`), [isAdmin]);
  const { data: tasksData } = useAsync(() => getList<Task>('/tasks?limit=200'), []);
  const { data: auditData, refresh: refreshAudit } = useAsync(() => getData<AuditEntry[]>('/audit?limit=8'), []);

  const members = data?.data ?? [];
  const tasks = tasksData?.data ?? [];

  const lateByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (task.is_late && task.assignee_id) map.set(task.assignee_id, (map.get(task.assignee_id) || 0) + 1);
    }
    return map;
  }, [tasks]);

  const stats = useMemo(() => {
    const active = members.filter(isActive);
    return {
      total: active.length,
      managers: active.filter((member) => ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(member.role)).length,
      open: active.reduce((sum, member) => sum + (member.open_tasks || 0), 0),
      late: active.reduce((sum, member) => sum + (lateByUser.get(member.id) || 0), 0),
      projects: active.reduce((sum, member) => sum + (member.active_projects || 0), 0),
      clients: active.reduce((sum, member) => sum + (member.clients_count || 0), 0),
    };
  }, [members, lateByUser]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((member) => {
      if (role && member.role !== role) return false;
      if (status === 'active' && !isActive(member)) return false;
      if (status === 'inactive' && isActive(member)) return false;
      if (term) {
        const haystack = [member.name, member.email, member.job_title, member.phone].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [members, search, role, status]);

  const maxLoad = Math.max(1, ...filtered.map((member) => (member.open_tasks || 0) + (lateByUser.get(member.id) || 0)));

  const canEditMember = (member: User) => isAdmin && (member.role !== 'SUPER_ADMIN' || isSuper);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '', email: '', password: '', role: 'EMPLOYEE', job_title: '', phone: '',
      avatar_color: AVATAR_COLORS[0], active: true,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (member: User) => {
    setEditing(member);
    setForm({
      name: member.name,
      email: member.email,
      password: '',
      role: member.role,
      job_title: member.job_title || '',
      phone: member.phone || '',
      avatar_color: member.avatar_color || AVATAR_COLORS[0],
      active: isActive(member),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const updateForm = (patch: Partial<UserForm>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const submit = async () => {
    if (!form) return;
    if (form.name.trim().length < 2) { setFormError('Le nom complet est requis.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFormError('Adresse e-mail invalide.'); return; }
    if (!editing && form.password.length < 12) { setFormError('Le mot de passe doit contenir au moins 12 caractères.'); return; }
    if (form.password && form.password.length < 12) { setFormError('Le mot de passe doit contenir au moins 12 caractères.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          job_title: form.job_title || null,
          phone: form.phone || null,
          avatar_color: form.avatar_color,
          active: form.active,
          password: form.password || undefined,
        });
        toast.success('Collaborateur mis à jour', form.name);
      } else {
        await api.post('/users', {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          job_title: form.job_title || null,
          phone: form.phone || null,
          avatar_color: form.avatar_color,
        });
        toast.success('Collaborateur ajouté', `${form.name} · ${ROLE_META[form.role].label}`);
      }
      setModalOpen(false);
      setEditing(null);
      refresh();
      refreshAudit();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (member: User) => {
    if (isActive(member)) {
      const ok = await confirm({
        title: 'Désactiver ce compte ?',
        message: `${member.name} ne pourra plus se connecter. Ses tâches et projets restent inchangés.`,
        confirmLabel: 'Désactiver',
      });
      if (!ok) return;
    }
    setBusyId(member.id);
    try {
      await api.put(`/users/${member.id}`, { active: !isActive(member) });
      toast.success(isActive(member) ? 'Compte désactivé' : 'Compte réactivé', member.name);
      refresh();
      refreshAudit();
    } catch (err) {
      toast.error('Action impossible', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: User) => {
    const ok = await confirm({
      title: 'Supprimer ce collaborateur ?',
      message: `${member.name} sera supprimé de la plateforme. Ses tâches et programmes seront réaffectés sans responsable.`,
      confirmLabel: 'Supprimer définitivement',
    });
    if (!ok) return;
    setBusyId(member.id);
    try {
      await api.del(`/users/${member.id}`);
      toast.success('Collaborateur supprimé', member.name);
      refresh();
      refreshAudit();
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <PageLoading eyebrow="Organisation" title="Équipe & Utilisateurs" cards={5} />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger l’équipe"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  const roleOptions: Role[] = isSuper ? ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] : ['ADMIN', 'MANAGER', 'EMPLOYEE'];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organisation"
        title="Équipe & Utilisateurs"
        description="Pilotez les accès, la charge de travail et les responsabilités. Les permissions sont appliquées côté serveur et chaque action est auditée."
        actions={isAdmin ? <Button variant="gold" icon={Plus} onClick={openNew}>Ajouter un collaborateur</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Équipe active" value={stats.total} icon={UsersRound} tone="navy" sub={`${members.length - stats.total} compte${members.length - stats.total > 1 ? 's' : ''} désactivé${members.length - stats.total > 1 ? 's' : ''}`} />
        <StatCard label="Encadrement" value={stats.managers} icon={ShieldCheck} tone="gold" sub="Admins & managers" />
        <StatCard label="Tâches ouvertes" value={stats.open} icon={Clock3} tone="blue" sub="Toutes équipes confondues" />
        <StatCard label="En retard" value={stats.late} icon={AlertTriangle} tone="red" sub={stats.late ? 'Relances prioritaires' : 'Aucun retard'} attention={stats.late > 0} />
        <StatCard label="Projets pilotés" value={stats.projects} icon={Activity} tone="green" sub={`${stats.clients} clients suivis`} />
      </div>

      <div className="card p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder="Rechercher un collaborateur, un poste, un e-mail…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[130px]" value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filtrer par rôle">
              <option value="">Tous les rôles</option>
              {Object.entries(ROLE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            {isAdmin ? (
              <select className="select w-auto min-w-0 max-w-full sm:min-w-[130px]" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut">
                <option value="">Tous statuts</option>
                <option value="active">Actifs</option>
                <option value="inactive">Désactivés</option>
              </select>
            ) : null}
            <div className="segmented">
              <button type="button" data-active={view === 'grid'} onClick={() => setView('grid')} title="Vue cartes"><LayoutGrid size={14} /></button>
              <button type="button" data-active={view === 'table'} onClick={() => setView('table')} title="Vue tableau"><List size={14} /></button>
            </div>
          </div>
        </div>
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Aucun collaborateur trouvé"
            description="Ajustez la recherche ou les filtres pour retrouver un membre de l’équipe."
            action={isAdmin ? <Button variant="gold" icon={Plus} onClick={openNew}>Ajouter un collaborateur</Button> : undefined}
          />
        </div>
      ) : view === 'grid' ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => {
            const active = isActive(member);
            const late = lateByUser.get(member.id) || 0;
            const load = (member.open_tasks || 0) + late;
            const editable = canEditMember(member);
            return (
              <article key={member.id} className={cn('card flex flex-col p-4 transition hover:border-navy-200 hover:shadow-lift', !active && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar name={member.name} color={member.avatar_color} size="lg" />
                    <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white', active ? 'bg-emerald-500' : 'bg-slate-300')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-navy-950">{member.name}</p>
                    <p className="truncate text-[10.5px] text-muted">{member.job_title || ROLE_META[member.role].description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={ROLE_META[member.role].tone}>{ROLE_META[member.role].label}</Badge>
                      {!active ? <Badge tone="slate">Désactivé</Badge> : null}
                      {late ? <Badge tone="red">{late} retard</Badge> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 grid grid-cols-4 gap-1.5 rounded-xl border border-line bg-slate-50/60 px-2 py-2 text-center">
                  <div>
                    <p className="text-[14px] font-extrabold leading-none text-navy-950">{member.open_tasks || 0}</p>
                    <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Ouvertes</p>
                  </div>
                  <div className="border-l border-line">
                    <p className="text-[14px] font-extrabold leading-none text-emerald-600">{member.done_tasks || 0}</p>
                    <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Terminées</p>
                  </div>
                  <div className="border-l border-line">
                    <p className="text-[14px] font-extrabold leading-none text-navy-950">{member.active_projects || 0}</p>
                    <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Projets</p>
                  </div>
                  <div className="border-l border-line">
                    <p className="text-[14px] font-extrabold leading-none text-gold-700">{member.clients_count || 0}</p>
                    <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-400">Clients</p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[9.5px] text-slate-400">
                    <span>Charge de travail</span>
                    <span className={cn('font-bold', late ? 'text-red-500' : 'text-navy-800')}>{load} tâche{load > 1 ? 's' : ''}</span>
                  </div>
                  <Progress value={(load / maxLoad) * 100} tone={late ? 'red' : load >= maxLoad && load > 0 ? 'amber' : 'navy'} />
                </div>

                <div className="mt-3 flex-1 space-y-1 text-[10.5px]">
                  <p className="flex items-center gap-1.5 truncate text-slate-500"><Mail size={11} className="shrink-0 text-slate-300" /> {member.email}</p>
                  {member.phone ? <p className="flex items-center gap-1.5 text-slate-500"><Phone size={11} className="shrink-0 text-slate-300" /> {member.phone}</p> : null}
                  <p className="flex items-center gap-1.5 text-slate-400"><UserCheck size={11} className="shrink-0 text-slate-300" /> Depuis {formatDate(member.created_at, 'long')}</p>
                </div>

                {editable ? (
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                    <button type="button" onClick={() => toggleActive(member)} disabled={busyId === member.id || member.id === currentUser?.id} className="rounded-md px-1.5 py-1 text-[9.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-navy-800 disabled:cursor-not-allowed disabled:opacity-40">
                      {active ? 'Désactiver' : 'Réactiver'}
                    </button>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(member)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-bold text-navy-700 transition hover:bg-navy-50">
                        <Pencil size={10} /> Modifier
                      </button>
                      <button type="button" onClick={() => remove(member)} disabled={busyId === member.id || member.id === currentUser?.id} className="rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40" title="Supprimer" aria-label="Supprimer">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[9.5px] text-slate-400">
                    <span>Accès en lecture</span>
                    <LockKeyhole size={12} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Rôle</th>
                  <th>Charge</th>
                  <th className="text-right">Tâches</th>
                  <th className="text-right">Projets</th>
                  <th className="text-right">Clients</th>
                  <th>Statut</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const active = isActive(member);
                  const late = lateByUser.get(member.id) || 0;
                  const load = (member.open_tasks || 0) + late;
                  const editable = canEditMember(member);
                  return (
                    <tr key={member.id} className={cn(!active && 'opacity-60')}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={member.name} color={member.avatar_color} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-semibold text-navy-950">{member.name}</p>
                            <p className="truncate text-[9.5px] text-muted">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="text-[11px] font-medium text-slate-600">{ROLE_META[member.role].label}</p>
                        <p className="truncate text-[9.5px] text-slate-400">{member.job_title || '—'}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Progress value={(load / maxLoad) * 100} tone={late ? 'red' : 'navy'} className="w-20" />
                          <span className={cn('text-[10px] font-bold', late ? 'text-red-500' : 'text-navy-800')}>{load}</span>
                        </div>
                      </td>
                      <td className="text-right text-[11px] text-slate-600">{member.open_tasks || 0} / {formatNumber((member.open_tasks || 0) + (member.done_tasks || 0))}</td>
                      <td className="text-right text-[11px] text-slate-600">{member.active_projects || 0}</td>
                      <td className="text-right text-[11px] text-slate-600">{member.clients_count || 0}</td>
                      <td>
                        <Badge tone={active ? 'green' : 'slate'} dot>{active ? 'Actif' : 'Désactivé'}</Badge>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {editable ? (
                            <>
                              <button type="button" className="btn-icon h-8 w-8" title="Modifier" onClick={() => openEdit(member)}><Pencil size={13} /></button>
                              <button type="button" className="btn-icon h-8 w-8" title={active ? 'Désactiver' : 'Réactiver'} disabled={member.id === currentUser?.id} onClick={() => toggleActive(member)}>
                                {active ? <Ban size={13} /> : <UserCheck size={13} />}
                              </button>
                            </>
                          ) : (
                            <span className="text-[9.5px] text-slate-300">Verrouillé</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line md:hidden">
            {filtered.map((member) => {
              const active = isActive(member);
              const editable = canEditMember(member);
              return (
                <div key={member.id} className={cn('p-4', !active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={member.name} color={member.avatar_color} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold text-navy-950">{member.name}</p>
                        <p className="truncate text-[10px] text-muted">{ROLE_META[member.role].label} · {member.job_title || '—'}</p>
                      </div>
                    </div>
                    <Badge tone={active ? 'green' : 'slate'}>{active ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{member.open_tasks || 0} tâches · {member.active_projects || 0} projets</span>
                    {editable ? <button type="button" onClick={() => openEdit(member)} className="font-bold text-navy-700">Modifier</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-navy-950"><ShieldCheck size={17} className="text-gold-600" /> Matrice des permissions</h2>
            <p className="mt-0.5 text-xs text-muted">Droits appliqués côté serveur, indépendamment de l’interface.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[11.5px]">
              <thead>
                <tr className="bg-navy-50/40">
                  <th className="border-b border-line px-5 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-500">Capacité</th>
                  {(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as Role[]).map((roleKey) => (
                    <th key={roleKey} className="border-b border-line px-2 py-2.5 text-center text-[9.5px] font-bold uppercase tracking-[0.06em] text-slate-500">{ROLE_META[roleKey].short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.map((permission) => (
                  <tr key={permission.label} className="border-b border-line/70 last:border-b-0">
                    <td className="px-5 py-2.5 text-slate-600">{permission.label}</td>
                    {(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'] as Role[]).map((roleKey) => {
                      const allowed = permission.roles[roleKey];
                      return (
                        <td key={roleKey} className="px-2 py-2.5 text-center">
                          {allowed === true ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={12} strokeWidth={3} /></span>
                          ) : allowed === 'partial' ? (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-600" title="Accès partiel"><Minus size={12} strokeWidth={3} /></span>
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 text-slate-300"><X size={11} strokeWidth={2.6} /></span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-line bg-slate-50/50 px-5 py-2.5 text-[9.5px] text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Autorisé</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Partiel</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Refusé</span>
            <span className="ml-auto">SA · AD · MG · EM</span>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-navy-950"><Activity size={16} className="text-navy-600" /> Dernières actions</h2>
              <p className="mt-0.5 text-xs text-muted">Journal d’audit des accès et modifications</p>
            </div>
            <Badge tone="navy">Live</Badge>
          </div>
          {(auditData || []).length ? (
            <div className="divide-y divide-line">
              {(auditData || []).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', AUDIT_TONE[entry.action] || 'bg-slate-300')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-snug text-slate-600">
                      <strong className="text-navy-900">{entry.actor_name || 'Système'}</strong>{' '}
                      {entry.detail || entry.action}
                    </p>
                    <p className="mt-0.5 text-[9.5px] text-slate-400">
                      {entry.entity_label ? `${entry.entity_label} · ` : ''}{timeAgo(entry.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Activity} compact title="Aucune action récente" />
          )}
          <div className="border-t border-line bg-slate-50/50 px-5 py-2.5 text-[9.5px] text-slate-400">
            Toutes les actions sensibles sont horodatées et conservées.
          </div>
        </section>
      </div>

      <div className="card flex flex-wrap items-center gap-3 border-navy-100 bg-gradient-to-r from-navy-50/70 via-white to-white px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-gold-300"><LockKeyhole size={15} /></span>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-navy-900">Sécurité des accès :</strong> les droits sont vérifiés sur chaque requête API. Un collaborateur ne peut consulter que ses propres tâches, et les opérations sensibles sont réservées aux administrateurs.
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><BadgeCheck size={13} /> Contrôle actif</span>
      </div>

      <Modal
        open={modalOpen && Boolean(form)}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        title={editing ? `Modifier ${editing.name}` : 'Ajouter un collaborateur'}
        description={editing ? 'Mettez à jour le profil, le rôle et l’accès du collaborateur.' : 'Créez un accès nominatif avec un rôle et un mot de passe initial.'}
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setModalOpen(false); setEditing(null); }}>Annuler</Button>
            <Button icon={editing ? Check : Plus} loading={saving} type="submit" form="user-form">
              {editing ? 'Enregistrer' : 'Créer le compte'}
            </Button>
          </>
        )}
      >
        {form ? (
          <form id="user-form" className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            {formError ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[11.5px] font-medium text-red-700">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {formError}
              </div>
            ) : null}

            <div className="flex items-center gap-3 rounded-xl border border-line bg-slate-50/60 px-3.5 py-3">
              <Avatar name={form.name || 'Nouveau membre'} color={form.avatar_color} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-navy-950">{form.name || 'Nouveau collaborateur'}</p>
                <p className="text-[10.5px] text-muted">{ROLE_META[form.role].label}{form.job_title ? ` · ${form.job_title}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVATAR_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => updateForm({ avatar_color: color })} className={cn('h-5 w-5 rounded-full border-2 transition', form.avatar_color === color ? 'border-navy-900 scale-110' : 'border-white')} style={{ backgroundColor: color }} aria-label={`Couleur ${color}`} />
                ))}
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="user-name">Nom complet *</label>
                <input id="user-name" className="input" value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="Prénom Nom" autoFocus />
              </div>
              <div>
                <label className="label" htmlFor="user-email">Adresse e-mail *</label>
                <input id="user-email" type="email" className="input" value={form.email} onChange={(event) => updateForm({ email: event.target.value })} placeholder="prenom@copil.ma" />
              </div>
              <div>
                <label className="label" htmlFor="user-role">Rôle *</label>
                <select id="user-role" className="select" value={form.role} onChange={(event) => updateForm({ role: event.target.value as Role })}>
                  {roleOptions.map((value) => <option key={value} value={value}>{ROLE_META[value].label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="user-title">Intitulé du poste</label>
                <input id="user-title" className="input" value={form.job_title} onChange={(event) => updateForm({ job_title: event.target.value })} placeholder="Ex. Directrice de clientèle" />
              </div>
              <div>
                <label className="label" htmlFor="user-phone">Téléphone</label>
                <input id="user-phone" className="input" value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} placeholder="+212 6 00 00 00 00" />
              </div>
              <div>
                <label className="label" htmlFor="user-password">{editing ? 'Nouveau mot de passe' : 'Mot de passe *'}</label>
                <input id="user-password" type="password" className="input" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} placeholder={editing ? 'Laisser vide pour conserver' : '12 caractères minimum'} autoComplete="new-password" />
              </div>
            </div>

            <p className="rounded-lg border border-line bg-navy-50/40 px-3 py-2 text-[10.5px] leading-relaxed text-slate-500">
              {ROLE_META[form.role].description}
            </p>

            {editing ? (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-[11.5px] font-medium text-slate-600">
                  {form.active ? <UserCheck size={15} className="text-emerald-600" /> : <UserX size={15} className="text-slate-400" />}
                  Compte actif — autorisé à se connecter
                </span>
                <input type="checkbox" checked={form.active} onChange={(event) => updateForm({ active: event.target.checked })} className="h-4 w-4 accent-navy-900" />
              </label>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
