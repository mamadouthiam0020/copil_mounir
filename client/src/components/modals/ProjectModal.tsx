import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, History, MessageSquare, Send, Trash2, TriangleAlert } from 'lucide-react';
import { Modal, Button, Avatar, EmptyState, Badge } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, getList } from '@/lib/api';
import { PROJECT_STATUS_OPTIONS, PROJECT_STATUS_META } from '@/lib/constants';
import { formatDate, formatDateTime, todayISO } from '@/lib/format';
import type { Client, Project, ProjectComment, User } from '@/types';
import { cn } from '@/lib/cn';

interface ProjectModalProps {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  defaultClientId?: string;
  onSaved: (project: Project) => void;
  readOnly?: boolean;
}

interface FormState {
  name: string;
  code: string;
  client_id: string;
  manager_id: string;
  status: string;
  start_date: string;
  due_date: string;
  budget: string;
  progress: number;
  description: string;
  needs: string;
  objectives: string;
}

const EMPTY: FormState = {
  name: '', code: '', client_id: '', manager_id: '', status: 'cadrage', start_date: todayISO(),
  due_date: '', budget: '0', progress: 0, description: '', needs: '', objectives: '',
};

type Tab = 'details' | 'comments' | 'history';

export function ProjectModal({ open, onClose, project, defaultClientId, onSaved, readOnly }: ProjectModalProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('details');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('details');
    setError(null);
    setComment('');
    if (project) {
      setForm({
        name: project.name,
        code: project.code || '',
        client_id: project.client_id || '',
        manager_id: project.manager_id || '',
        status: project.status,
        start_date: project.start_date || '',
        due_date: project.due_date || '',
        budget: String(project.budget ?? 0),
        progress: project.progress,
        description: project.description || '',
        needs: project.needs || '',
        objectives: project.objectives || '',
      });
      setComments(Array.isArray(project.comments) ? project.comments : []);
    } else {
      setForm({ ...EMPTY, client_id: defaultClientId || '' });
      setComments([]);
    }
    Promise.all([getList<Client>('/clients?limit=100'), getList<User>('/users')])
      .then(([clientResult, userResult]) => {
        setClients(clientResult.data);
        setUsers(userResult.data);
      })
      .catch(() => undefined);
  }, [open, project?.id, defaultClientId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      setError('La date de livraison doit être postérieure à la date de début.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        budget: Number(form.budget) || 0,
        progress: form.status === 'termine' ? 100 : form.progress,
        client_id: form.client_id || null,
        manager_id: form.manager_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        code: form.code || null,
      };
      const result = project
        ? await api.put<{ data: Project }>(`/projects/${project.id}`, payload)
        : await api.post<{ data: Project }>('/projects', payload);
      toast.success(project ? 'Programme mis à jour' : 'Programme créé', result.data.name);
      onSaved(result.data);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!project || !comment.trim()) return;
    setCommenting(true);
    try {
      const result = await api.post<{ data: ProjectComment }>(`/projects/${project.id}/comments`, { text: comment });
      setComments((current) => [...current, result.data]);
      setComment('');
      toast.success('Commentaire ajouté');
    } catch (err) {
      toast.error('Impossible d’ajouter le commentaire', errorMessage(err));
    } finally {
      setCommenting(false);
    }
  };

  const remove = async () => {
    if (!project) return;
    const ok = await confirm({
      title: 'Supprimer ce programme ?',
      message: `« ${project.name} » sera définitivement supprimé. Les tâches associées seront conservées mais détachées du programme.`,
      confirmLabel: 'Supprimer le programme',
    });
    if (!ok) return;
    try {
      await api.del(`/projects/${project.id}`);
      toast.success('Programme supprimé');
      onSaved({ ...project, id: project.id });
      onClose();
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    }
  };

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'details', label: 'Détails' },
    ...(project ? [
      { key: 'comments' as Tab, label: 'Commentaires', count: comments.length },
      { key: 'history' as Tab, label: 'Historique des dates', count: project.date_history?.length || 0 },
    ] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={readOnly ? project?.name || 'Programme' : project ? 'Modifier le programme' : 'Nouveau programme'}
      description={project ? `${project.code || 'Programme'} · ${project.client_company || project.client_name || 'Sans client'}` : 'Définissez le cadre, les dates et les responsabilités du programme.'}
      bodyClassName="p-0"
      footer={tab === 'details' ? (
        readOnly ? <Button variant="secondary" onClick={onClose}>Fermer</Button> : (
          <>
            {project && isAdmin ? (
              <Button variant="danger" icon={Trash2} onClick={remove} className="sm:mr-auto">Supprimer</Button>
            ) : null}
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button variant="gold" type="submit" form="project-form" loading={saving}>
              {project ? 'Enregistrer les modifications' : 'Créer le programme'}
            </Button>
          </>
        )
      ) : <Button variant="secondary" onClick={onClose}>Fermer</Button>}
    >
      <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line px-5 pt-1 sm:px-6">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[12px] font-semibold transition',
              tab === item.key ? 'border-gold-500 text-navy-950' : 'border-transparent text-slate-500 hover:text-navy-800',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && item.count > 0 ? (
              <span className="rounded-full bg-navy-50 px-1.5 py-0.5 text-[9px] font-bold text-navy-700">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {error ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        {tab === 'details' ? (
          <form id="project-form" onSubmit={submit}>
            <fieldset disabled={readOnly} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label">Nom du programme *</label>
                  <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Refonte de la plateforme logistique" />
                </div>
                <div>
                  <label className="label">Client</label>
                  <select className="select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
                    <option value="">Sans client</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.company || client.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Responsable du dossier</label>
                  <select className="select" value={form.manager_id} onChange={(e) => set('manager_id', e.target.value)}>
                    <option value="">Non affecté</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Code programme</label>
                  <input className="input" value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="Généré automatiquement" />
                </div>
                <div>
                  <label className="label">Statut</label>
                  <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                    {PROJECT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Date de début</label>
                  <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">Date de livraison promise</label>
                  <input className="input" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">Budget estimatif (MAD)</label>
                  <input className="input" type="number" min={0} step={1000} value={form.budget} onChange={(e) => set('budget', e.target.value)} />
                </div>
                <div>
                  <label className="label">Avancement · {form.progress}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={form.progress}
                    onChange={(e) => set('progress', Number(e.target.value))}
                    className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-navy-900"
                  />
                  <div className="mt-1 flex justify-between text-[9.5px] text-slate-400"><span>0 %</span><span>100 %</span></div>
                </div>
              </div>

              <div>
                <label className="label">Description du programme</label>
                <textarea className="textarea" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Périmètre général et contexte…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Besoins exprimés</label>
                  <textarea className="textarea" rows={3} value={form.needs} onChange={(e) => set('needs', e.target.value)} placeholder="Attentes et contraintes du client…" />
                </div>
                <div>
                  <label className="label">Objectifs</label>
                  <textarea className="textarea" rows={3} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} placeholder="Résultats attendus et indicateurs…" />
                </div>
              </div>

              {project ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-slate-50/60 px-3.5 py-3">
                  <CalendarClock size={14} className="text-gold-600" />
                  <span className="text-[11px] text-muted">Créé le {formatDate(project.created_at, 'long')}</span>
                  <Badge tone={PROJECT_STATUS_META[project.status]?.tone || 'navy'}>{PROJECT_STATUS_META[project.status]?.label || project.status}</Badge>
                  {project.health ? <Badge tone={project.health === 'late' ? 'red' : project.health === 'soon' ? 'amber' : project.health === 'done' ? 'green' : 'navy'}>
                    {project.health === 'late' ? 'En retard' : project.health === 'soon' ? 'Échéance proche' : project.health === 'done' ? 'Livré' : 'Dans les délais'}
                  </Badge> : null}
                </div>
              ) : null}
            </fieldset>
          </form>
        ) : null}

        {tab === 'comments' && project ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Ajouter un commentaire sur le programme…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }}
              />
              <Button variant="primary" icon={Send} onClick={addComment} loading={commenting} disabled={!comment.trim()}>Publier</Button>
            </div>
            {comments.length === 0 ? (
              <EmptyState compact icon={MessageSquare} title="Aucun commentaire" description="Partagez un point d’avancement ou un risque avec l’équipe." />
            ) : (
              <div className="space-y-3">
                {[...comments].reverse().map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-xl border border-line bg-white p-3.5">
                    <Avatar name={item.author_name || 'Utilisateur'} size="sm" color="#1E4E8C" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-semibold text-navy-950">{item.author_name || 'Utilisateur'}</span>
                        <span className="text-[10px] text-slate-400">{formatDateTime(item.at)}</span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'history' && project ? (
          <div>
            {!project.date_history?.length ? (
              <EmptyState icon={History} title="Aucun changement de date" description="L’historique des échéances apparaîtra ici à chaque modification." />
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {[...project.date_history].reverse().map((change) => (
                  <li key={change.id} className="relative">
                    <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-gold-500 ring-2 ring-gold-100" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{formatDateTime(change.at)}</p>
                    <p className="mt-0.5 text-[12.5px] text-slate-600">
                      Échéance déplacée du <strong className="text-navy-900">{formatDate(change.from_due, 'long')}</strong> au <strong className="text-navy-900">{formatDate(change.to_due, 'long')}</strong>.
                    </p>
                    {change.from_start !== change.to_start ? (
                      <p className="mt-0.5 text-[11px] text-muted">Début : {formatDate(change.from_start, 'long')} → {formatDate(change.to_start, 'long')}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10.5px] text-slate-400">Par {change.by_name || 'un utilisateur'}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
