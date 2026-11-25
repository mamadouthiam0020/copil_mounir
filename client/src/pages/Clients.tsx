import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Building2, CalendarClock, FolderKanban, LayoutGrid, List,
  Mail, Phone, Plus, SearchX, Sparkles, Target, UsersRound,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import { ClientModal } from '@/components/modals/ClientModal';
import {
  Avatar, Badge, Button, EmptyState, Pagination, SearchInput,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { getList } from '@/lib/api';
import { CLIENT_STATUS_META } from '@/lib/constants';
import { relativeDay } from '@/lib/format';
import type { Client, User } from '@/types';
import { cn } from '@/lib/cn';

type ViewMode = 'grid' | 'table';

const PAGE_SIZE = 12;

const PRIORITY_TONE: Record<string, 'red' | 'amber' | 'blue' | 'slate'> = {
  Urgent: 'red',
  'Élevé': 'amber',
  Moyen: 'blue',
  Faible: 'slate',
};

export default function Clients() {
  const { canManage } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [view, setView] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);

  const { data, loading, error, refresh } = useAsync(() => getList<Client>('/clients?limit=200'), []);
  const { data: usersData } = useAsync(() => getList<User>('/users'), []);

  const clients = data?.data ?? [];
  const users = usersData?.data ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = clients.filter((client) => {
      if (status && client.status !== status) return false;
      if (owner && client.owner_id !== owner) return false;
      if (term) {
        const haystack = [client.name, client.company, client.contact_name, client.email, client.phone, client.sector, client.city]
          .filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === 'name') return (a.company || a.name).localeCompare(b.company || b.name, 'fr');
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
  }, [clients, search, status, owner, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, status, owner, sort]);

  const stats = useMemo(() => ({
    total: clients.length,
    actifs: clients.filter((client) => client.status === 'actif').length,
    prospects: clients.filter((client) => client.status === 'prospect').length,
    projects: clients.reduce((sum, client) => sum + (client.project_count || 0), 0),
    tasks: clients.reduce((sum, client) => sum + (client.open_task_count || 0), 0),
  }), [clients]);

  const openNew = () => { setSelected(null); setModalOpen(true); };
  const openEdit = (client: Client) => { setSelected(client); setModalOpen(true); };

  if (loading) {
    return <PageLoading eyebrow="Relation client" title="Clients & Programmes" cards={5} />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger les clients"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Relation client"
        title="Clients & Programmes"
        description="Centralisez les comptes, les programmes et les prochaines étapes. Chaque fiche regroupe l’historique, les documents et les livraisons."
        actions={canManage ? <Button variant="gold" icon={Plus} onClick={openNew}>Nouveau client</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Clients" value={stats.total} icon={UsersRound} tone="navy" sub="Portefeuille total" />
        <StatCard label="Comptes actifs" value={stats.actifs} icon={Building2} tone="green" sub="Relation en cours" />
        <StatCard label="Prospects" value={stats.prospects} icon={Target} tone="gold" sub="À convertir" />
        <StatCard label="Programmes liés" value={stats.projects} icon={FolderKanban} tone="blue" sub="Tous clients confondus" />
        <StatCard label="Tâches ouvertes" value={stats.tasks} icon={CalendarClock} tone="amber" sub="Sur les dossiers clients" />
      </div>

      <div className="card p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder="Rechercher un client, un contact, une ville…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[132px]" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut">
              <option value="">Tous les statuts</option>
              {Object.entries(CLIENT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[150px]" value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Filtrer par responsable">
              <option value="">Tous responsables</option>
              {users.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[126px]" value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'name')} aria-label="Trier">
              <option value="recent">Plus récents</option>
              <option value="name">Ordre alphabétique</option>
            </select>
            <div className="segmented">
              <button type="button" data-active={view === 'grid'} onClick={() => setView('grid')} title="Vue cartes"><LayoutGrid size={14} /></button>
              <button type="button" data-active={view === 'table'} onClick={() => setView('table')} title="Vue tableau"><List size={14} /></button>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {(['', 'actif', 'prospect', 'inactif'] as const).map((value) => {
            const count = value ? clients.filter((client) => client.status === value).length : clients.length;
            return (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatus(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition',
                  status === value ? 'border-navy-800 bg-navy-900 text-white' : 'border-line bg-white text-slate-500 hover:border-navy-200',
                )}
              >
                {value ? CLIENT_STATUS_META[value].label : 'Tous'}
                <span className={cn('rounded-full px-1 text-[9px]', status === value ? 'bg-white/15' : 'bg-slate-100 text-slate-500')}>{count}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[10.5px] text-muted">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Aucun client trouvé"
            description="Modifiez vos filtres ou créez une nouvelle fiche client."
            action={canManage ? <Button variant="gold" icon={Plus} onClick={openNew}>Créer un client</Button> : undefined}
          />
        </div>
      ) : view === 'grid' ? (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((client) => (
              <article key={client.id} className="card group flex flex-col p-4 transition hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-800 to-navy-950 text-[13px] font-extrabold text-gold-300 shadow-sm">
                    {(client.company || client.name).slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/clients/${client.id}`} className="block truncate text-[13.5px] font-bold text-navy-950 transition group-hover:text-navy-700">
                      {client.company || client.name}
                    </Link>
                    <p className="truncate text-[10.5px] text-muted">
                      {client.contact_name || client.name}{client.sector ? ` · ${client.sector}` : ''}
                    </p>
                  </div>
                  <Badge tone={CLIENT_STATUS_META[client.status].tone}>{CLIENT_STATUS_META[client.status].label}</Badge>
                </div>

                <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl border border-line bg-slate-50/60 px-2 py-2 text-center">
                  <div>
                    <p className="text-[15px] font-extrabold leading-none text-navy-950">{client.project_count || 0}</p>
                    <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">Projets</p>
                  </div>
                  <div className="border-x border-line">
                    <p className="text-[15px] font-extrabold leading-none text-navy-950">{client.quote_count || 0}</p>
                    <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">Devis</p>
                  </div>
                  <div>
                    <p className="text-[15px] font-extrabold leading-none text-navy-950">{client.open_task_count || 0}</p>
                    <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">Tâches</p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-[10.5px]">
                  {client.email ? <p className="flex items-center gap-1.5 truncate text-slate-500"><Mail size={11} className="shrink-0 text-slate-300" /> {client.email}</p> : null}
                  {client.phone ? <p className="flex items-center gap-1.5 text-slate-500"><Phone size={11} className="shrink-0 text-slate-300" /> {client.phone}</p> : null}
                </div>

                <div className="mt-3 flex-1 rounded-lg border border-gold-100 bg-gold-50/50 px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.08em] text-gold-700">
                    <Sparkles size={9} /> Prochaine étape
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[10.5px] font-medium leading-snug text-navy-900">
                    {client.next_action || 'À définir avec le client'}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className={cn('text-[9px]', (client.next_action_date || '') < new Date().toISOString().slice(0, 10) ? 'font-semibold text-red-500' : 'text-slate-400')}>
                      {client.next_action_date ? relativeDay(client.next_action_date) : 'Sans date'}
                    </span>
                    {client.next_priority ? (
                      <Badge tone={PRIORITY_TONE[client.next_priority] || 'slate'} className="!px-1.5 !py-0.5 !text-[8px]">{client.next_priority}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={client.owner_name} size="xs" />
                    <span className="text-[9.5px] text-slate-400">{client.owner_name || 'Non affecté'}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => openEdit(client)}
                        className="rounded-md px-1.5 py-1 text-[9.5px] font-semibold text-slate-400 transition hover:bg-navy-50 hover:text-navy-800"
                      >
                        Modifier
                      </button>
                    ) : null}
                    <Link to={`/clients/${client.id}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] font-bold text-navy-700 transition hover:bg-navy-50">
                      Ouvrir <ArrowUpRight size={10} />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="card overflow-hidden">
            <Pagination page={page} pages={pages} onChange={setPage} total={filtered.length} />
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Responsable</th>
                  <th>Projets</th>
                  <th>Prochaine étape</th>
                  <th>Statut</th>
                  <th className="w-10"> </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((client) => (
                  <tr key={client.id} className="cursor-pointer" onClick={() => navigate(`/clients/${client.id}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-[10.5px] font-bold text-navy-800">
                          {(client.company || client.name).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold text-navy-950">{client.company || client.name}</p>
                          <p className="truncate text-[10px] text-muted">{client.sector || 'Secteur non renseigné'} · {client.city || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <p className="text-[11.5px] text-slate-600">{client.contact_name || '—'}</p>
                      <p className="truncate text-[9.5px] text-slate-400">{client.email || client.phone || '—'}</p>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <Avatar name={client.owner_name} size="xs" />
                        <span className="text-[11px] text-slate-600">{client.owner_name || '—'}</span>
                      </span>
                    </td>
                    <td>
                      <p className="text-[12px] font-semibold text-navy-900">{client.project_count || 0}</p>
                      <p className="text-[9px] text-slate-400">{client.open_task_count || 0} tâches ouvertes</p>
                    </td>
                    <td>
                      <p className="max-w-[210px] truncate text-[11px] text-slate-600">{client.next_action || 'À définir'}</p>
                      <p className={cn('text-[9.5px]', (client.next_action_date || '') < new Date().toISOString().slice(0, 10) ? 'font-semibold text-red-500' : 'text-slate-400')}>
                        {relativeDay(client.next_action_date)}
                      </p>
                    </td>
                    <td><Badge tone={CLIENT_STATUS_META[client.status].tone}>{CLIENT_STATUS_META[client.status].label}</Badge></td>
                    <td><ArrowUpRight size={14} className="text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line md:hidden">
            {paged.map((client) => (
              <Link key={client.id} to={`/clients/${client.id}`} className="block p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-navy-950">{client.company || client.name}</p>
                    <p className="truncate text-[10.5px] text-muted">{client.contact_name || client.sector || '—'}</p>
                  </div>
                  <Badge tone={CLIENT_STATUS_META[client.status].tone}>{CLIENT_STATUS_META[client.status].label}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span>{client.project_count || 0} projets · {client.open_task_count || 0} tâches</span>
                  <span>{relativeDay(client.next_action_date)}</span>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} total={filtered.length} />
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 border-gold-200/70 bg-gradient-to-r from-gold-50/70 via-white to-white px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 text-navy-950"><Target size={15} /></span>
        <p className="min-w-0 flex-1 text-[11px] text-slate-500">
          <strong className="text-navy-900">Priorité commerciale :</strong> {stats.prospects} prospect{stats.prospects > 1 ? 's' : ''} à convertir et {clients.filter((client) => client.next_action_date && client.next_action_date <= new Date().toISOString().slice(0, 10)).length} relance{clients.filter((client) => client.next_action_date && client.next_action_date <= new Date().toISOString().slice(0, 10)).length > 1 ? 's' : ''} arrivée{clients.filter((client) => client.next_action_date && client.next_action_date <= new Date().toISOString().slice(0, 10)).length > 1 ? 's' : ''} à échéance.
        </p>
        {canManage ? <Button variant="secondary" size="sm" icon={Plus} onClick={openNew}>Ajouter un compte</Button> : null}
      </div>

      <ClientModal
        open={modalOpen}
        client={selected}
        onClose={() => { setModalOpen(false); setSelected(null); }}
        onSaved={() => { refresh(); }}
      />
    </div>
  );
}
