import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight, BadgeCheck, Copy, Download, FilePenLine, FileText, Plus, SearchX,
  Send, Timer, Trash2, TrendingUp,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import {
  Badge, Button, EmptyState, Pagination, SearchInput,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getData, getList } from '@/lib/api';
import { QUOTE_STATUS_META } from '@/lib/constants';
import { formatDate, formatMoney, relativeDay } from '@/lib/format';
import type { AppSettings, Quote, QuoteStatus } from '@/types';
import { cn } from '@/lib/cn';

type StatusFilter = '' | QuoteStatus;
type SortKey = 'recent' | 'amount' | 'validity' | 'number';

const PAGE_SIZE = 10;

const STATUS_ORDER: Array<{ value: StatusFilter; label: string }> = [
  { value: '', label: 'Tous' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'sent', label: 'Envoyés' },
  { value: 'accepted', label: 'Acceptés' },
  { value: 'refused', label: 'Refusés' },
  { value: 'expired', label: 'Expirés' },
];

function effectiveStatus(quote: Quote): QuoteStatus {
  return quote.effective_status || quote.status;
}

export default function Quotes() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || '');
  const [client, setClient] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, refresh } = useAsync(() => getList<Quote>('/quotes?limit=200'), []);
  const { data: settings } = useAsync(() => getData<AppSettings>('/settings'), []);

  const quotes = data?.data ?? [];

  useEffect(() => {
    const next = (searchParams.get('status') as StatusFilter) || '';
    setStatus(next);
  }, [searchParams]);

  useEffect(() => { setPage(1); }, [search, status, client, sort]);

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    for (const quote of quotes) {
      if (quote.client_id && !map.has(quote.client_id)) {
        map.set(quote.client_id, quote.client_company || quote.client_name || 'Client');
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [quotes]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { '': quotes.length, draft: 0, sent: 0, accepted: 0, refused: 0, expired: 0 };
    for (const quote of quotes) out[effectiveStatus(quote)] = (out[effectiveStatus(quote)] || 0) + 1;
    return out;
  }, [quotes]);

  const stats = useMemo(() => {
    const accepted = quotes.filter((quote) => effectiveStatus(quote) === 'accepted');
    const pending = quotes.filter((quote) => effectiveStatus(quote) === 'sent');
    const decided = quotes.filter((quote) => ['accepted', 'refused'].includes(effectiveStatus(quote)));
    const acceptedValue = accepted.reduce((sum, quote) => sum + quote.totals.total, 0);
    const pendingValue = pending.reduce((sum, quote) => sum + quote.totals.total, 0);
    return {
      total: quotes.length,
      acceptedCount: accepted.length,
      acceptedValue,
      pendingCount: pending.length,
      pendingValue,
      conversion: decided.length ? Math.round((accepted.length / decided.length) * 100) : 0,
      average: accepted.length ? Math.round(acceptedValue / accepted.length) : 0,
    };
  }, [quotes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = quotes.filter((quote) => {
      if (status && effectiveStatus(quote) !== status) return false;
      if (client && quote.client_id !== client) return false;
      if (term) {
        const haystack = [
          quote.number, quote.client_company, quote.client_name, quote.prospect_name,
          quote.prospect_email, quote.author_name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === 'amount') return b.totals.total - a.totals.total;
      if (sort === 'validity') return String(a.valid_until || '9999').localeCompare(String(b.valid_until || '9999'));
      if (sort === 'number') return String(b.number).localeCompare(String(a.number));
      return String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [quotes, search, status, client, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chooseStatus = (next: StatusFilter) => {
    setStatus(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set('status', next); else params.delete('status');
    setSearchParams(params, { replace: true });
  };

  const downloadPdf = async (quote: Quote) => {
    if (!settings) {
      toast.warning('Paramètres indisponibles', 'Impossible de générer le PDF pour le moment.');
      return;
    }
    try {
      const { downloadQuotePdf } = await import('@/lib/quotePdf');
      downloadQuotePdf(quote, settings);
      toast.success('PDF généré', `Devis ${quote.number}`);
    } catch (err) {
      toast.error('Génération impossible', errorMessage(err));
    }
  };

  const duplicate = async (quote: Quote) => {
    setBusyId(quote.id);
    try {
      const result = await api.post<{ data: Quote }>(`/quotes/${quote.id}/duplicate`);
      toast.success('Devis dupliqué', result.data.number);
      navigate(`/devis/${result.data.id}`);
    } catch (err) {
      toast.error('Duplication impossible', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (quote: Quote) => {
    const ok = await confirm({
      title: 'Supprimer ce devis ?',
      message: `Le devis ${quote.number} sera définitivement supprimé. Cette action est irréversible.`,
      confirmLabel: 'Supprimer le devis',
    });
    if (!ok) return;
    setBusyId(quote.id);
    try {
      await api.del(`/quotes/${quote.id}`);
      toast.success('Devis supprimé', quote.number);
      refresh();
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <PageLoading eyebrow="Commercial" title="Devis & Propositions" cards={5} />;
  }

  if (error || !data) {
    return (
      <PageError
        icon={FilePenLine}
        title="Impossible de charger les devis"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Commercial"
        title="Devis & Propositions"
        description="Générez des propositions premium, suivez leur cycle de vie et transformez les devis acceptés en programmes opérationnels."
        actions={<Button variant="gold" icon={Plus} onClick={() => navigate('/devis/nouveau')}>Nouveau devis</Button>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Devis émis" value={stats.total} icon={FileText} tone="navy" sub={`${counts.draft || 0} brouillon${(counts.draft || 0) > 1 ? 's' : ''}`} />
        <StatCard label="CA accepté" value={formatMoney(stats.acceptedValue, true)} icon={BadgeCheck} tone="green" sub={`${stats.acceptedCount} devis signé${stats.acceptedCount > 1 ? 's' : ''}`} />
        <StatCard label="En attente" value={stats.pendingCount} icon={Send} tone="gold" sub={formatMoney(stats.pendingValue, true)} />
        <StatCard label="Taux d’acceptation" value={`${stats.conversion}%`} icon={TrendingUp} tone="blue" sub="Sur les devis décidés" />
        <StatCard label="Panier moyen" value={formatMoney(stats.average, true)} icon={Timer} tone="amber" sub="Devis acceptés" />
      </div>

      <div className="card p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              placeholder="Rechercher un numéro, un client, un auteur…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[170px]" value={client} onChange={(event) => setClient(event.target.value)} aria-label="Filtrer par client">
              <option value="">Tous les clients</option>
              {clients.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
            <select className="select w-auto min-w-0 max-w-full sm:min-w-[150px]" value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Trier les devis">
              <option value="recent">Plus récents</option>
              <option value="amount">Montant décroissant</option>
              <option value="validity">Validité proche</option>
              <option value="number">Numéro</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {STATUS_ORDER.map((entry) => (
            <button
              key={entry.value || 'all'}
              type="button"
              onClick={() => chooseStatus(entry.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition',
                status === entry.value
                  ? 'border-navy-800 bg-navy-900 text-white'
                  : 'border-line bg-white text-slate-500 hover:border-navy-200',
              )}
            >
              {entry.label}
              <span className={cn('rounded-full px-1 text-[9px]', status === entry.value ? 'bg-white/15' : 'bg-slate-100 text-slate-500')}>
                {counts[entry.value] || 0}
              </span>
            </button>
          ))}
          <span className="ml-auto text-[10.5px] text-muted">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {!filtered.length ? (
        <div className="card">
          <EmptyState
            icon={SearchX}
            title="Aucun devis trouvé"
            description="Ajustez les filtres ou créez une nouvelle proposition commerciale."
            action={<Button variant="gold" icon={Plus} onClick={() => navigate('/devis/nouveau')}>Créer un devis</Button>}
          />
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Devis</th>
                    <th>Client</th>
                    <th className="text-right">Montant HT</th>
                    <th className="text-right">Total TTC</th>
                    <th>Validité</th>
                    <th>Statut</th>
                    <th className="w-[148px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((quote) => {
                    const state = effectiveStatus(quote);
                    const meta = QUOTE_STATUS_META[state] || QUOTE_STATUS_META.draft;
                    return (
                      <tr key={quote.id} className="cursor-pointer" onClick={() => navigate(`/devis/${quote.id}`)}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                              <FileText size={16} strokeWidth={1.9} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[12.5px] font-bold text-navy-950">{quote.number}</p>
                              <p className="text-[9.5px] text-muted">{formatDate(quote.issue_date)} · {quote.author_name || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <p className="max-w-[210px] truncate text-[11.5px] font-medium text-slate-700">
                            {quote.client_company || quote.prospect_name || quote.client_name || 'Prospect'}
                          </p>
                          <p className="max-w-[210px] truncate text-[9.5px] text-slate-400">{quote.prospect_email || quote.client_email || quote.client_name || 'Sans e-mail'}</p>
                        </td>
                        <td className="text-right">
                          <p className="text-[12px] font-semibold text-navy-900">{formatMoney(quote.totals.base)}</p>
                          {quote.totals.discountTotal > 0 ? (
                            <p className="text-[9px] font-medium text-emerald-600">-{formatMoney(quote.totals.discountTotal)} de remise</p>
                          ) : null}
                        </td>
                        <td className="text-right">
                          <p className="text-[12.5px] font-bold text-navy-950">{formatMoney(quote.totals.total)}</p>
                          <p className="text-[9px] text-slate-400">TVA {quote.totals.taxRate}%</p>
                        </td>
                        <td>
                          <p className="text-[11px] font-medium text-navy-900">{formatDate(quote.valid_until)}</p>
                          <p className={cn('text-[9.5px]', state === 'expired' ? 'font-semibold text-red-500' : 'text-slate-400')}>
                            {relativeDay(quote.valid_until)}
                          </p>
                        </td>
                        <td>
                          <Badge tone={meta.tone} dot>{meta.label}</Badge>
                        </td>
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn-icon h-8 w-8" title="Télécharger le PDF" onClick={() => downloadPdf(quote)}>
                              <Download size={14} />
                            </button>
                            <button type="button" className="btn-icon h-8 w-8" title="Dupliquer" disabled={busyId === quote.id} onClick={() => duplicate(quote)}>
                              <Copy size={14} />
                            </button>
                            <button type="button" className="btn-icon h-8 w-8" title="Modifier" onClick={() => navigate(`/devis/${quote.id}`)}>
                              <ArrowUpRight size={14} />
                            </button>
                            {isAdmin ? (
                              <button type="button" className="btn-icon h-8 w-8 hover:bg-red-50 hover:text-red-600" title="Supprimer" disabled={busyId === quote.id} onClick={() => remove(quote)}>
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-line md:hidden">
              {paged.map((quote) => {
                const state = effectiveStatus(quote);
                const meta = QUOTE_STATUS_META[state] || QUOTE_STATUS_META.draft;
                return (
                  <button key={quote.id} type="button" onClick={() => navigate(`/devis/${quote.id}`)} className="block w-full p-4 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold text-navy-950">{quote.number}</p>
                        <p className="truncate text-[10.5px] text-muted">{quote.client_company || quote.prospect_name || quote.client_name || 'Prospect'}</p>
                      </div>
                      <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    </div>
                    <div className="mt-2.5 flex items-end justify-between">
                      <div>
                        <p className="text-[14px] font-extrabold text-navy-950">{formatMoney(quote.totals.total)}</p>
                        <p className="text-[9.5px] text-slate-400">Validité {formatDate(quote.valid_until)} · {relativeDay(quote.valid_until)}</p>
                      </div>
                      <span className="text-[9.5px] font-semibold text-gold-700">Ouvrir →</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <Pagination page={page} pages={pages} onChange={setPage} total={filtered.length} />
          </div>

          <div className="card flex flex-wrap items-center gap-3 border-gold-200/70 bg-gradient-to-r from-gold-50/70 via-white to-white px-4 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 text-navy-950"><TrendingUp size={15} /></span>
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500">
              <strong className="text-navy-900">Pipeline commercial :</strong> {stats.pendingCount} devis en attente pour {formatMoney(stats.pendingValue, true)}.
              {stats.conversion >= 50 ? ' Le taux de conversion est solide — maintenez le rythme de relance.' : ' Priorisez les relances des devis arrivant à échéance.'}
            </p>
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => navigate('/devis/nouveau')}>Nouvelle proposition</Button>
          </div>
        </>
      )}
    </div>
  );
}
