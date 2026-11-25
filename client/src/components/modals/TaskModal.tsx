import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Download, FileUp, MessageSquare, Paperclip, Send, TriangleAlert, X,
} from 'lucide-react';
import { Modal, Button, Avatar, Badge, Progress } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { api, downloadDataUri, errorMessage, getList } from '@/lib/api';
import { PRIORITY_META, PRIORITY_OPTIONS, TASK_STATUS_META, TASK_STATUS_OPTIONS } from '@/lib/constants';
import { fileSize, formatDateTime, todayISO } from '@/lib/format';
import type { Attachment, Client, Project, Task, TaskComment } from '@/types';

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultStatus?: string;
  defaultClientId?: string;
  defaultProjectId?: string;
  onSaved: (task: Task) => void;
}

interface FormState {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string;
  client_id: string;
  project_id: string;
  start_date: string;
  due_date: string;
  progress: number;
}

const EMPTY: FormState = {
  title: '', description: '', status: 'todo', priority: 'medium', assignee_id: '',
  client_id: '', project_id: '', start_date: todayISO(), due_date: '', progress: 0,
};

export function TaskModal({ open, onClose, task, defaultStatus, defaultClientId, defaultProjectId, onSaved }: TaskModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const isEmployee = user?.role === 'EMPLOYEE';
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setComment('');
    if (task) {
      setForm({
        title: task.title,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        assignee_id: task.assignee_id || '',
        client_id: task.client_id || '',
        project_id: task.project_id || '',
        start_date: task.start_date || '',
        due_date: task.due_date || '',
        progress: task.progress,
      });
      setComments(Array.isArray(task.comments) ? task.comments : []);
      setAttachments([]);
      api.get<{ data: Attachment[] }>(`/tasks/${task.id}/attachments`)
        .then((result) => setAttachments(result.data || []))
        .catch(() => setAttachments([]));
    } else {
      setForm({
        ...EMPTY,
        status: defaultStatus && defaultStatus !== 'late' ? defaultStatus : 'todo',
        client_id: defaultClientId || '',
        project_id: defaultProjectId || '',
      });
      setAttachments([]);
      setComments([]);
    }
    Promise.all([
      getList<{ id: string; name: string }>('/users'),
      getList<Client>('/clients?limit=100'),
      getList<Project>('/projects?limit=100'),
    ]).then(([userResult, clientResult, projectResult]) => {
      setUsers(userResult.data);
      setClients(clientResult.data);
      setProjects(projectResult.data);
    }).catch(() => undefined);
  }, [open, task?.id, defaultStatus, defaultClientId, defaultProjectId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const filteredProjects = form.client_id
    ? projects.filter((project) => project.client_id === form.client_id)
    : projects;

  const chooseProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    setForm((current) => ({
      ...current,
      project_id: projectId,
      client_id: project?.client_id || current.client_id,
    }));
  };

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    const next = [...attachments];
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024) {
        toast.warning('Fichier ignoré', `${file.name} dépasse la limite de 3 Mo.`);
        continue;
      }
      if (next.length >= 10) {
        toast.warning('Limite atteinte', 'Une tâche peut contenir jusqu’à 10 pièces jointes.');
        break;
      }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (!data) continue;
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        mime: file.type,
        size: file.size,
        data,
        uploaded_at: new Date().toISOString(),
      });
    }
    setAttachments(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.start_date && form.due_date && form.due_date < form.start_date) {
      setError('L’échéance doit être postérieure à la date de début.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        status: form.status,
        priority: form.priority,
        progress: form.status === 'done' ? 100 : form.progress,
        assignee_id: form.assignee_id || null,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        attachments: attachments.map(({ has_data, ...rest }) => rest),
      };
      const result = task
        ? await api.put<{ data: Task }>(`/tasks/${task.id}`, payload)
        : await api.post<{ data: Task }>('/tasks', payload);
      toast.success(task ? 'Tâche mise à jour' : 'Tâche créée', result.data.title);
      onSaved(result.data);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addComment = async () => {
    if (!task || !comment.trim()) return;
    setCommenting(true);
    try {
      const result = await api.post<{ data: TaskComment }>(`/tasks/${task.id}/comments`, { text: comment });
      setComments((current) => [...current, result.data]);
      setComment('');
      toast.success('Commentaire ajouté');
    } catch (err) {
      toast.error('Commentaire non enregistré', errorMessage(err));
    } finally {
      setCommenting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={task ? 'Détail de la tâche' : 'Nouvelle tâche'}
      description={task ? `${task.client_company || task.client_name || 'Tâche interne'}${task.project_name ? ` · ${task.project_name}` : ''}` : 'Attribuez, planifiez et suivez son avancement.'}
      footer={(
        <>
          {isEmployee ? <p className="mr-auto hidden max-w-xs text-[10.5px] leading-relaxed text-slate-400 sm:block">Vous pouvez mettre à jour l’avancement, les pièces jointes et les commentaires.</p> : null}
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button variant="gold" type="submit" form="task-form" loading={saving}>
            {task ? 'Enregistrer' : 'Créer la tâche'}
          </Button>
        </>
      )}
    >
      <form id="task-form" onSubmit={submit} className="space-y-5">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        <div>
          <label className="label">Intitulé de la tâche *</label>
          <input className="input" required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Finaliser la recette du module de facturation" disabled={isEmployee} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Statut</label>
            <select
              className="select"
              value={form.status}
              onChange={(e) => {
                const status = e.target.value;
                setForm((current) => ({ ...current, status, progress: status === 'done' ? 100 : current.progress }));
              }}
            >
              {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priorité</label>
            <select className="select" value={form.priority} onChange={(e) => set('priority', e.target.value)} disabled={isEmployee}>
              {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Responsable</label>
            <select className="select" value={form.assignee_id} onChange={(e) => set('assignee_id', e.target.value)} disabled={isEmployee}>
              <option value="">Non affecté</option>
              {users.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Client associé</label>
            <select
              className="select"
              value={form.client_id}
              onChange={(e) => setForm((current) => ({ ...current, client_id: e.target.value, project_id: '' }))}
              disabled={isEmployee}
            >
              <option value="">Aucun client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.company || client.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Programme / projet</label>
            <select className="select" value={form.project_id} onChange={(e) => chooseProject(e.target.value)} disabled={isEmployee}>
              <option value="">Sans programme</option>
              {filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date de début</label>
            <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} disabled={isEmployee} />
          </div>
          <div>
            <label className="label">Échéance</label>
            <input className="input" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} disabled={isEmployee} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-slate-50/50 p-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="label mb-0">Avancement</span>
            <span className="font-bold text-navy-900">{form.status === 'done' ? 100 : form.progress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={form.status === 'done' ? 100 : form.progress}
            onChange={(e) => set('progress', Number(e.target.value))}
            className="mt-2.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-navy-900"
          />
          <Progress value={form.status === 'done' ? 100 : form.progress} tone={form.progress >= 100 ? 'green' : 'navy'} className="mt-3" />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="textarea" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Contexte, livrables attendus, points de vigilance…" disabled={isEmployee} />
        </div>

        <div className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Paperclip size={14} className="text-gold-600" />
              <span className="text-[12px] font-semibold text-navy-900">Pièces jointes</span>
              <span className="text-[10px] text-slate-400">({attachments.length}/10)</span>
            </div>
            <Button type="button" variant="secondary" size="sm" icon={FileUp} onClick={() => fileInput.current?.click()} disabled={attachments.length >= 10}>
              Ajouter un fichier
            </Button>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={onFiles} />
          </div>
          {!attachments.length ? (
            <p className="mt-3 text-[11px] text-slate-400">Aucun document. Formats libres, 3 Mo maximum par fichier.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {attachments.map((attachment) => (
                <li key={attachment.id || attachment.name} className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2">
                  <Paperclip size={13} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-medium text-navy-900">{attachment.name}</p>
                    <p className="text-[9.5px] text-slate-400">{fileSize(attachment.size)}{attachment.uploaded_at ? ` · ${formatDateTime(attachment.uploaded_at)}` : ''}</p>
                  </div>
                  {attachment.data ? (
                    <button
                      type="button"
                      onClick={() => {
                        try { downloadDataUri(attachment.data!, attachment.name); }
                        catch (err) { toast.error('Téléchargement impossible', errorMessage(err)); }
                      }}
                      className="btn-icon h-7 w-7"
                      title="Télécharger"
                    >
                      <Download size={13} />
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))} className="btn-icon h-7 w-7 hover:bg-red-50 hover:text-red-600" title="Retirer">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {task ? (
          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare size={14} className="text-gold-600" />
              <span className="text-[12px] font-semibold text-navy-900">Commentaires</span>
              <span className="text-[10px] text-slate-400">({comments.length})</span>
            </div>
            {comments.length ? (
              <ul className="mb-3 space-y-2.5">
                {comments.map((item) => (
                  <li key={item.id} className="flex gap-2.5">
                    <Avatar name={item.author_name || 'Utilisateur'} size="xs" color="#1E4E8C" />
                    <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-navy-900">{item.author_name || 'Utilisateur'}</span>
                        <span className="text-[9px] text-slate-400">{formatDateTime(item.at)}</span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ajouter un commentaire…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }}
              />
              <Button type="button" variant="primary" icon={Send} onClick={addComment} loading={commenting} disabled={!comment.trim()}>
                Envoyer
              </Button>
            </div>
          </div>
        ) : null}

        {task ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[10.5px] text-slate-400">
            <Badge tone={TASK_STATUS_META[task.effective_status]?.tone || 'slate'}>{TASK_STATUS_META[task.effective_status]?.label}</Badge>
            <Badge tone={PRIORITY_META[task.priority]?.tone || 'slate'} dot>{PRIORITY_META[task.priority]?.label}</Badge>
            <span className="ml-auto">Créée le {formatDateTime(task.created_at)}</span>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
