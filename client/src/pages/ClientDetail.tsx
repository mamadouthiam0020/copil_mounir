import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Building2, CalendarClock, CheckSquare, Download, FileText, FileUp,
  FolderKanban, Globe, Mail, MapPin, MessageSquare, Pencil, Phone, Plus, Receipt,
  Sparkles, Trash2, UsersRound, History, ClipboardList, LayoutDashboard,
} from 'lucide-react';
import { PageError, PageLoading } from '@/components/layout/AppShell';
import { ClientModal } from '@/components/modals/ClientModal';
import { InteractionModal } from '@/components/modals/InteractionModal';
import { ProjectModal } from '@/components/modals/ProjectModal';
import { TaskModal } from '@/components/modals/TaskModal';
import {
  Avatar, Badge, Button, EmptyState, Progress, SectionHeading,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, downloadDocument, errorMessage, getData } from '@/lib/api';
import {
  CLIENT_STATUS_META, HEALTH_META, PRIORITY_META, PROJECT_STATUS_META,
  QUOTE_STATUS_META, TASK_STATUS_META, TIMELINE_META,
} from '@/lib/constants';
import { fileSize, formatDate, formatDateTime, formatMoney, relativeDay, timeAgo } from '@/lib/format';
import type { ClientDetailData, Project, Task, TimelineEntry } from '@/types';
import { cn } from '@/lib/cn';

type Tab = 'overview' | 'projects' | 'timeline' | 'documents' | 'tasks';

const TABS: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
  { key: 'projects', label: 'Programmes', icon: FolderKanban },
  { key: 'timeline', label: 'Historique', icon: History },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'tasks', label: 'Tâches', icon: ClipboardList },
];

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'blue' | 'slate'> = {
  Urgent: 'red', 'Élevé': 'amber', Moyen: 'blue', Faible: 'slate',
};

export default function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { canManage, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>('overview');
  const [clientOpen, setClientOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, loading, error, refresh, setData } = useAsync(
    () => getData<ClientDetailData>(`/clients/${id}`),
    [id],
  );

  useEffect(() => { setTab('overview'); }, [id]);

  const stats = useMemo(() => {
    if (!data) return { projects: 0, activeProjects: 0, openTasks: 0, quotesValue: 0, sentQuotes: 0 };
    return {
      projects: data.projects.length,
      activeProjects: data.projects.filter((project) => !['termine', 'annule'].includes(project.status)).length,
      openTasks: data.tasks.filter((task) => task.status !== 'done').length,
      quotesValue: data.quotes.filter((quote) => quote.status === 'accepted').reduce((sum, quote) => sum + (quote.totals?.total || 0), 0),
      sentQuotes: data.quotes.filter((quote) => quote.effective_status === 'sent').length,
    };
  }, [data]);

  if (loading) {
    return <PageLoading eyebrow="Relation client" title="Chargement du dossier…" cards={4} cardColumns="md:grid-cols-4" />;
  }

  if (error || !data) {
    return (
      <PageError
        icon={Building2}
        title="Dossier client introuvable"
        description={error || 'Ce client a peut-être été supprimé.'}
        action={<Button onClick={() => navigate('/clients')}>Retour aux clients</Button>}
      />
    );
  }

  const { client, projects, quotes, timeline, documents, tasks } = data;
  const displayName = client.company || client.name;
  const nextDue = client.next_action_date && client.next_action_date <= new Date().toISOString().slice(0, 10);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('Fichier trop volumineux', 'La limite est de 5 Mo par document.');
      return;
    }
    setUploading(true);
    try {
      const payload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(file);
      });
      await api.post(`/clients/${client.id}/documents`, { name: file.name, mime: file.type, size: file.size, data: payload });
      toast.success('Document ajouté', file.name);
      refresh();
    } catch (err) {
      toast.error('Ajout impossible', errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (docId: string, name: string) => {
    const ok = await confirm({ title: 'Supprimer ce document ?', message: `« ${name} » sera définitivement supprimé du dossier client.`, confirmLabel: 'Supprimer' });
    if (!ok) return;
    try {
      await api.del(`/clients/documents/${docId}`);
      toast.success('Document supprimé', name);
      refresh();
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    }
  };

  const removeInteraction = async (entry: TimelineEntry) => {
    const ok = await confirm({ title: 'Supprimer cet échange ?', message: `« ${entry.title} » sera retiré de l’historique du client.`, confirmLabel: 'Supprimer' });
    if (!ok) return;
    try {
      await api.del(`/clients/timeline/${entry.id}`);
      toast.success('Échange supprimé');
      if (data) setData({ ...data, timeline: data.timeline.filter((item) => item.id !== entry.id) });
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    }
  };

  const removeClient = async () => {
    const ok = await confirm({
      title: 'Supprimer la fiche client ?',
      message: `« ${displayName} » sera supprimé. Les programmes et devis seront détachés de cette fiche, les documents et l’historique seront perdus.`,
      confirmLabel: 'Supprimer le client',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.del(`/clients/${client.id}`);
      toast.success('Client supprimé', displayName);
      navigate('/clients');
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
      setDeleting(false);
    }
  };

  const tabCounts: Partial<Record<Tab, number>> = {
    projects: projects.length,
    timeline: timeline.length,
    documents: documents.length,
    tasks: tasks.length,
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate('/clients')} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:text-navy-800">
        <ArrowLeft size={14} /> Clients & Programmes
      </button>

      <div className="card relative overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-navy-900 via-navy-700 to-gold-500" />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 text-[17px] font-extrabold text-gold-300 shadow-lift">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[21px] font-extrabold tracking-tight text-navy-950">{displayName}</h1>
                <Badge tone={CLIENT_STATUS_META[client.status].tone}>{CLIENT_STATUS_META[client.status].label}</Badge>
                {client.sector ? <Badge tone="slate">{client.sector}</Badge> : null}
              </div>
              <p className="mt-1 text-[12.5px] text-muted">{client.name}{client.contact_name ? ` · Contact : ${client.contact_name}` : ''}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                {client.email ? <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-navy-800"><Mail size={12} className="text-slate-300" /> {client.email}</a> : null}
                {client.phone ? <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-navy-800"><Phone size={12} className="text-slate-300" /> {client.phone}</a> : null}
                {client.city ? <span className="inline-flex items-center gap-1.5"><MapPin size={12} className="text-slate-300" /> {client.address ? `${client.address}, ` : ''}{client.city}</span> : null}
                <span className="inline-flex items-center gap-1.5"><Avatar name={client.owner_name} size="xs" /> {client.owner_name || 'Non affecté'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {canManage ? (
              <>
                <Button variant="secondary" size="sm" icon={MessageSquare} onClick={() => setInteractionOpen(true)}>Ajouter un échange</Button>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setClientOpen(true)}>Modifier</Button>
                <Button variant="gold" size="sm" icon={Plus} onClick={() => { setSelectedProject(null); setProjectOpen(true); }}>Programme</Button>
              </>
            ) : null}
            {isAdmin ? (
              <Button variant="danger" size="sm" icon={Trash2} loading={deleting} onClick={removeClient}>Supprimer</Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          {[
            { label: 'Programmes', value: stats.projects, sub: `${stats.activeProjects} actifs` },
            { label: 'Tâches ouvertes', value: stats.openTasks, sub: `${tasks.filter((task) => task.effective_status === 'late').length} en retard` },
            { label: 'Devis', value: quotes.length, sub: `${stats.sentQuotes} en attente` },
            { label: 'CA accepté', value: formatMoney(stats.quotesValue, true), sub: 'Devis validés' },
          ].map((item) => (
            <div key={item.label} className="bg-white px-4 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{item.label}</p>
              <p className="mt-1 text-[19px] font-extrabold leading-none text-navy-950">{item.value}</p>
              <p className="mt-1 text-[9.5px] text-slate-400">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map((item) => {
          const Icon = item.icon;
          const count = tabCounts[item.key];
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition',
                tab === item.key ? 'border-gold-500 text-navy-950' : 'border-transparent text-slate-500 hover:text-navy-800',
              )}
            >
              <Icon size={14} /> {item.label}
              {typeof count === 'number' && count > 0 ? (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', tab === item.key ? 'bg-gold-100 text-gold-800' : 'bg-slate-100 text-slate-500')}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <div className="card card-pad">
              <SectionHeading title="Prochaine étape" subtitle="La prochaine action concrète pour faire avancer la relation" />
              <div className={cn('mt-4 rounded-xl border p-4', nextDue ? 'border-red-100 bg-red-50/50' : 'border-gold-200 bg-gold-50/50')}>
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', nextDue ? 'bg-red-100 text-red-600' : 'bg-gold-500 text-navy-950')}>
                    <Sparkles size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-navy-950">{client.next_action || 'Définir la prochaine action commerciale'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {client.next_action_date ? formatDate(client.next_action_date, 'long') : 'Sans date'}</span>
                      <span className={cn('inline-flex items-center gap-1', nextDue && 'font-semibold text-red-500')}>{client.next_action_date ? relativeDay(client.next_action_date) : ''}</span>
                      {client.next_priority ? <Badge tone={PRIORITY_TONE[client.next_priority] || 'slate'} className="!px-1.5 !py-0.5 !text-[8.5px]">{client.next_priority}</Badge> : null}
                      {client.next_action_owner ? <span className="inline-flex items-center gap-1"><Avatar name={client.next_action_owner} size="xs" /> {client.next_action_owner}</span> : null}
                    </div>
                  </div>
                  {canManage ? <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setClientOpen(true)}>Mettre à jour</Button> : null}
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-bold text-navy-950">Programmes du client</h2>
                  <p className="text-[10.5px] text-muted">Livraisons et engagements en cours</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setTab('projects')}>Voir tout</Button>
              </div>
              <div className="divide-y divide-line">
                {projects.slice(0, 4).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => { setSelectedProject(project); setProjectOpen(true); }}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-navy-50/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-[9.5px] font-bold text-navy-700">
                      {(project.name || 'PR').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-navy-950">{project.name}</p>
                      <p className="text-[9.5px] text-slate-400">{project.code} · {project.manager_name || 'Non affecté'}</p>
                    </div>
                    <div className="hidden w-28 items-center gap-2 sm:flex">
                      <Progress value={project.progress} tone={project.progress >= 80 ? 'green' : 'navy'} />
                      <span className="w-7 text-right text-[9.5px] font-bold text-navy-800">{project.progress}%</span>
                    </div>
                    <div className="text-right">
                      <Badge tone={HEALTH_META[project.health || 'ontime'].tone}>{HEALTH_META[project.health || 'ontime'].label}</Badge>
                      <p className="mt-0.5 text-[9px] text-slate-400">{relativeDay(project.due_date)}</p>
                    </div>
                  </button>
                ))}
                {!projects.length ? <EmptyState compact icon={FolderKanban} title="Aucun programme" description="Créez un programme pour structurer la relation." /> : null}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-bold text-navy-950">Devis du client</h2>
                  <p className="text-[10.5px] text-muted">Propositions commerciales et montants</p>
                </div>
                {canManage ? <Link to={`/devis/nouveau?client=${client.id}`} className="btn-secondary btn-sm"><Plus size={13} /> Nouveau devis</Link> : null}
              </div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="data-table">
                  <thead>
                    <tr><th>Numéro</th><th>Date</th><th>Montant TTC</th><th>Statut</th><th className="w-10"> </th></tr>
                  </thead>
                  <tbody>
                    {quotes.slice(0, 5).map((quote) => (
                      <tr key={quote.id} className="cursor-pointer" onClick={() => canManage && navigate(`/devis/${quote.id}`)}>
                        <td><span className="font-semibold text-navy-950">{quote.number}</span></td>
                        <td className="text-[11px] text-muted">{formatDate(quote.issue_date, 'long')}</td>
                        <td><span className="text-[12px] font-bold text-navy-900">{formatMoney(quote.totals?.total)}</span></td>
                        <td><Badge tone={QUOTE_STATUS_META[quote.effective_status].tone}>{QUOTE_STATUS_META[quote.effective_status].label}</Badge></td>
                        <td><Receipt size={14} className="text-slate-300" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!quotes.length ? <EmptyState compact icon={Receipt} title="Aucun devis" description="Générez une proposition chiffrée pour ce client." /> : null}
              </div>
              <div className="divide-y divide-line sm:hidden">
                {quotes.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[11.5px] font-semibold text-navy-950">{quote.number}</p>
                      <p className="text-[9.5px] text-slate-400">{formatDate(quote.issue_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-navy-900">{formatMoney(quote.totals?.total, true)}</p>
                      <Badge tone={QUOTE_STATUS_META[quote.effective_status].tone} className="!px-1.5 !py-0.5 !text-[8px]">{QUOTE_STATUS_META[quote.effective_status].label}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="card card-pad">
              <SectionHeading title="Informations" subtitle="Coordonnées et données administratives" />
              <dl className="mt-4 space-y-3 text-[11.5px]">
                <div className="flex items-start gap-3"><Building2 size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Raison sociale</dt><dd className="text-navy-900">{client.company || client.name}</dd></div></div>
                <div className="flex items-start gap-3"><UsersRound size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Contact principal</dt><dd className="text-navy-900">{client.contact_name || '—'}</dd></div></div>
                <div className="flex items-start gap-3"><Mail size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">E-mail</dt><dd className="truncate text-navy-900">{client.email || '—'}</dd></div></div>
                <div className="flex items-start gap-3"><Phone size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Téléphone</dt><dd className="text-navy-900">{client.phone || '—'}</dd></div></div>
                <div className="flex items-start gap-3"><MapPin size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Adresse</dt><dd className="text-navy-900">{[client.address, client.city].filter(Boolean).join(', ') || '—'}</dd></div></div>
                <div className="flex items-start gap-3"><Globe size={14} className="mt-0.5 shrink-0 text-slate-300" /><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Secteur</dt><dd className="text-navy-900">{client.sector || '—'}</dd></div></div>
              </dl>
              <div className="mt-4 border-t border-line pt-3 text-[9.5px] text-slate-400">
                Créé le {formatDate(client.created_at, 'long')} · Mis à jour {timeAgo(client.updated_at)}
              </div>
            </div>

            <div className="card card-pad">
              <SectionHeading title="Notes internes" subtitle="Visible par l’équipe uniquement" />
              <p className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-slate-50/60 p-3.5 text-[11.5px] leading-relaxed text-slate-600">
                {client.notes || 'Aucune note interne pour ce client.'}
              </p>
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-[14px] font-bold text-navy-950">Derniers échanges</h2>
                  <p className="text-[10.5px] text-muted">Historique de la relation</p>
                </div>
                <button type="button" onClick={() => setTab('timeline')} className="text-[10.5px] font-semibold text-navy-700 hover:text-gold-600">Tout voir →</button>
              </div>
              <div className="space-y-3 px-5 py-4">
                {timeline.slice(0, 4).map((entry) => {
                  const meta = TIMELINE_META[entry.type] || TIMELINE_META.note;
                  return (
                    <div key={entry.id} className="flex gap-2.5">
                      <Badge tone={meta.tone} className="!h-6 !shrink-0 !px-1.5 !py-0 !text-[8.5px]">{meta.label}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-navy-900">{entry.title}</p>
                        <p className="text-[9px] text-slate-400">{formatDate(entry.date)} · {entry.author_name || 'Équipe'}</p>
                      </div>
                    </div>
                  );
                })}
                {!timeline.length ? <EmptyState compact icon={MessageSquare} title="Aucun échange" description="Ajoutez un appel, un rendez-vous ou une note." /> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'projects' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted"><strong className="text-navy-900">{projects.length}</strong> programme{projects.length > 1 ? 's' : ''} lié{projects.length > 1 ? 's' : ''} à ce client</p>
            {canManage ? <Button variant="gold" size="sm" icon={Plus} onClick={() => { setSelectedProject(null); setProjectOpen(true); }}>Nouveau programme</Button> : null}
          </div>
          {!projects.length ? (
            <div className="card"><EmptyState icon={FolderKanban} title="Aucun programme" description="Structurez la relation client en créant un premier programme." action={canManage ? <Button variant="gold" icon={Plus} onClick={() => { setSelectedProject(null); setProjectOpen(true); }}>Créer un programme</Button> : undefined} /></div>
          ) : (
            <div className="grid gap-3.5 lg:grid-cols-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => { setSelectedProject(project); setProjectOpen(true); }}
                  className="card group p-4 text-left transition hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-navy-950">{project.name}</p>
                      <p className="text-[10px] text-muted">{project.code} · {project.manager_name || 'Non affecté'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={PROJECT_STATUS_META[project.status]?.tone || 'navy'}>{PROJECT_STATUS_META[project.status]?.label}</Badge>
                      <Badge tone={HEALTH_META[project.health || 'ontime'].tone} className="!px-1.5 !py-0.5 !text-[8px]">{HEALTH_META[project.health || 'ontime'].label}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[10.5px] leading-relaxed text-slate-500">{project.description || project.objectives || 'Aucune description.'}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={project.progress} tone={project.progress >= 80 ? 'green' : 'navy'} />
                    <span className="text-[10px] font-bold text-navy-800">{project.progress}%</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-[9.5px] text-slate-400">
                    <span className="inline-flex items-center gap-1"><CalendarClock size={10} /> {formatDate(project.start_date)} → {formatDate(project.due_date)}</span>
                    <span className={cn(project.health === 'late' && 'font-semibold text-red-500')}>{relativeDay(project.due_date)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'timeline' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="card card-pad">
            <SectionHeading
              title="Historique de la relation"
              subtitle="Rendez-vous, appels, e-mails et notes internes"
              action={canManage ? <Button variant="gold" size="sm" icon={Plus} onClick={() => setInteractionOpen(true)}>Ajouter un échange</Button> : undefined}
            />
            {!timeline.length ? (
              <EmptyState icon={MessageSquare} title="Aucun échange enregistré" description="Tracez chaque interaction pour garder le contexte de la relation." />
            ) : (
              <ol className="relative mt-5 space-y-4 border-l border-line pl-5">
                {timeline.map((entry) => {
                  const meta = TIMELINE_META[entry.type] || TIMELINE_META.note;
                  return (
                    <li key={entry.id} className="relative">
                      <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-gold-500 ring-2 ring-gold-100" />
                      <div className="rounded-xl border border-line bg-white p-3.5 transition hover:border-navy-200">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <span className="text-[10px] text-slate-400">{formatDate(entry.date, 'long')}</span>
                          {canManage ? (
                            <button type="button" onClick={() => removeInteraction(entry)} className="ml-auto rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500" title="Supprimer">
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[12.5px] font-semibold text-navy-950">{entry.title}</p>
                        {entry.content ? <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-slate-600">{entry.content}</p> : null}
                        <p className="mt-1.5 text-[9.5px] text-slate-400">Par {entry.author_name || 'Équipe'}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <div className="space-y-3">
            {Object.entries(TIMELINE_META).slice(0, 4).map(([key, meta]) => {
              const count = timeline.filter((entry) => entry.type === key).length;
              return (
                <div key={key} className="card flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2"><Badge tone={meta.tone}>{meta.label}</Badge></span>
                  <span className="text-[13px] font-bold text-navy-950">{count}</span>
                </div>
              );
            })}
            <div className="card card-pad">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Dernier contact</p>
              <p className="mt-1 text-[13px] font-bold text-navy-950">{timeline[0]?.title || 'Aucun contact'}</p>
              <p className="mt-1 text-[10.5px] text-muted">{timeline[0] ? `${formatDate(timeline[0].date, 'long')} · ${timeAgo(timeline[0].date)}` : 'Ajoutez un premier échange.'}</p>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'documents' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[14px] font-bold text-navy-950">Documents du dossier</h2>
              <p className="text-[10.5px] text-muted">Contrats, briefs, livrables et pièces administratives · 5 Mo max.</p>
            </div>
            <input ref={fileInput} type="file" className="hidden" onChange={upload} />
            <Button variant="gold" size="sm" icon={FileUp} loading={uploading} onClick={() => fileInput.current?.click()}>Ajouter un document</Button>
          </div>
          {!documents.length ? (
            <EmptyState icon={FileText} title="Aucun document" description="Ajoutez un contrat, un brief ou un livrable pour centraliser le dossier." action={<Button variant="secondary" icon={FileUp} onClick={() => fileInput.current?.click()}>Choisir un fichier</Button>} />
          ) : (
            <div className="divide-y divide-line">
              {documents.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 transition hover:bg-navy-50/30 sm:px-5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><FileText size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-navy-950">{doc.name}</p>
                    <p className="text-[9.5px] text-slate-400">{fileSize(doc.size)} · Ajouté le {formatDateTime(doc.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try { await downloadDocument(doc.id); } catch (err) { toast.error('Téléchargement impossible', errorMessage(err)); }
                      }}
                      className="btn-icon h-8 w-8"
                      title="Télécharger"
                    >
                      <Download size={14} />
                    </button>
                    {canManage ? (
                      <button type="button" onClick={() => removeDocument(doc.id, doc.name)} className="btn-icon h-8 w-8 hover:bg-red-50 hover:text-red-600" title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-muted"><strong className="text-navy-900">{tasks.length}</strong> tâche{tasks.length > 1 ? 's' : ''} · {tasks.filter((task) => task.status !== 'done').length} ouverte{tasks.filter((task) => task.status !== 'done').length > 1 ? 's' : ''}</p>
            {canManage ? <Button variant="gold" size="sm" icon={Plus} onClick={() => { setSelectedTask(null); setTaskOpen(true); }}>Nouvelle tâche</Button> : null}
          </div>
          <div className="card overflow-hidden">
            {!tasks.length ? (
              <EmptyState icon={CheckSquare} title="Aucune tâche" description="Créez une tâche rattachée à ce client pour organiser le suivi." action={canManage ? <Button variant="gold" icon={Plus} onClick={() => { setSelectedTask(null); setTaskOpen(true); }}>Créer une tâche</Button> : undefined} />
            ) : (
              <div className="divide-y divide-line">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => { setSelectedTask(task); setTaskOpen(true); }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-navy-50/40 sm:px-5"
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', task.effective_status === 'late' ? 'bg-red-500' : task.status === 'done' ? 'bg-emerald-500' : task.status === 'waiting' ? 'bg-gold-500' : 'bg-navy-600')} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-[12px] font-semibold', task.status === 'done' ? 'text-slate-400 line-through' : 'text-navy-950')}>{task.title}</p>
                      <p className="truncate text-[9.5px] text-slate-400">{task.project_name || 'Sans programme'} · {task.assignee_name || 'Non affecté'}</p>
                    </div>
                    <Badge tone={PRIORITY_META[task.priority].tone} className="hidden !px-1.5 !py-0.5 !text-[8.5px] sm:inline-flex">{PRIORITY_META[task.priority].label}</Badge>
                    <span className={cn('hidden w-20 text-right text-[9.5px] sm:block', task.effective_status === 'late' ? 'font-semibold text-red-500' : 'text-slate-400')}>{relativeDay(task.due_date)}</span>
                    <Badge tone={TASK_STATUS_META[task.effective_status].tone} className="!px-1.5 !py-0.5 !text-[8.5px]">{TASK_STATUS_META[task.effective_status].label}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ClientModal open={clientOpen} client={client} onClose={() => setClientOpen(false)} onSaved={() => { refresh(); }} />
      <InteractionModal
        open={interactionOpen}
        clientId={client.id}
        onClose={() => setInteractionOpen(false)}
        onSaved={() => { refresh(); setTab('timeline'); }}
      />
      <ProjectModal
        open={projectOpen}
        project={selectedProject}
        defaultClientId={client.id}
        readOnly={!canManage}
        onClose={() => { setProjectOpen(false); setSelectedProject(null); }}
        onSaved={() => { refresh(); }}
      />
      <TaskModal
        open={taskOpen}
        task={selectedTask}
        defaultClientId={client.id}
        onClose={() => { setTaskOpen(false); setSelectedTask(null); }}
        onSaved={() => { refresh(); }}
      />
    </div>
  );
}
