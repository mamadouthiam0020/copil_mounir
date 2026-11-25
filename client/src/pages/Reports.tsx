import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowUpRight, BarChart3, CalendarRange, CheckCircle2, Download,
  FileText, FolderKanban, Gauge, RefreshCw, Target, TrendingUp, Truck, UsersRound,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { StatCard } from '@/components/StatCard';
import { Avatar, Badge, Button, EmptyState, Progress, SectionHeading } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, getData, neutralizeCsvCell } from '@/lib/api';
import { ROLE_META } from '@/lib/constants';
import { formatMoney, formatNumber, todayISO } from '@/lib/format';
import type { ReportData } from '@/types';
import { cn } from '@/lib/cn';

const PALETTE = ['#0A2540', '#C9A227', '#10B981', '#5C8DBA', '#8B5CF6', '#F59E0B', '#EF4444', '#94A3B8'];

const QUOTE_TONES: Record<string, 'slate' | 'navy' | 'green' | 'red' | 'amber'> = {
  Brouillon: 'slate', Envoyé: 'navy', Accepté: 'green', Refusé: 'red', Expiré: 'amber',
};

const PROJECT_TONES: Record<string, string> = {
  Cadrage: 'bg-violet-400', 'En cours': 'bg-navy-700', 'En attente': 'bg-amber-400',
  Terminé: 'bg-emerald-500', Annulé: 'bg-slate-300',
};

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #E6EBF2',
  boxShadow: '0 16px 40px -20px rgba(10,37,64,.35)',
  fontSize: 12,
  fontFamily: 'Plus Jakarta Sans, sans-serif',
};

const PERIODS = [3, 6, 9, 12];

function ChartCard({
  title, subtitle, action, children, className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card p-4 sm:p-5', className)}>
      <SectionHeading title={title} subtitle={subtitle} action={action} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
      {value ? <strong className="text-navy-900">{value}</strong> : null}
    </span>
  );
}

export default function Reports() {
  const { canManage } = useAuth();
  const toast = useToast();
  const [period, setPeriod] = useState(6);
  const { data, loading, error, refresh } = useAsync(() => getData<ReportData>(`/reports?period=${period}`), [period]);

  const maxSector = useMemo(() => Math.max(1, ...(data?.clientsBySector.map((entry) => entry.value) || [1])), [data]);
  const maxWorkload = useMemo(() => Math.max(1, ...(data?.workload.map((entry) => entry.open) || [1])), [data]);
  const maxBudget = useMemo(() => Math.max(1, ...(data?.topClients.map((entry) => entry.budget) || [1])), [data]);

  const exportCsv = async () => {
    if (!data) return;
    const rows: Array<Array<string | number>> = [
      ['Rapport Copil', `Période : ${data.period} mois`, `Généré le ${todayISO()}`],
      [],
      ['Indicateur', 'Valeur'],
      ['Chiffre d’affaires accepté', data.summary.revenue],
      ['Pipeline actif', data.summary.pipelineValue],
      ['Taux de conversion', `${data.summary.conversionRate} %`],
      ['Projets actifs', data.summary.activeProjects],
      ['Projets livrés', data.summary.completedProjects],
      ['Ponctualité', `${data.summary.onTimeRate} %`],
      ['Retard moyen (jours)', data.summary.avgDelay],
      ['Taux d’achèvement des tâches', `${data.summary.taskCompletion} %`],
      ['Budget moyen', data.summary.avgBudget],
      ['Devis en attente', data.summary.outstandingQuotes],
      ['Valeur des devis en attente', data.summary.outstandingValue],
      [],
      ['Mois', 'CA HT', 'CA TTC', 'Devis acceptés'],
      ...data.monthlyRevenue.map((entry) => [entry.name, entry.ht, entry.ttc, entry.devis]),
      [],
      ['Top clients', 'Projets', 'Projets actifs', 'Budget'],
      ...data.topClients.map((entry) => [entry.name, entry.projects, entry.active, entry.budget]),
      [],
      ['Collaborateur', 'Rôle', 'Tâches ouvertes', 'Urgentes', 'En retard', 'Projets actifs'],
      ...data.workload.map((entry) => [entry.name, ROLE_META[entry.role]?.label || entry.role, entry.open, entry.urgent, entry.late, entry.projects]),
    ];
    const csv = rows.map((row) => row.map(neutralizeCsvCell).join(';')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Copil-rapport-${todayISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    void api.post('/audit/export', { scope: 'rapports' }).catch(() => undefined);
    toast.success('Rapport exporté', 'Le fichier CSV a été téléchargé.');
  };

  if (loading) {
    return <PageLoading eyebrow="Analyse" title="Rapports & Statistiques" cards={5} panels={2} />;
  }

  if (error || !data) {
    return (
      <PageError
        title="Impossible de charger les rapports"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  const { summary, delivery } = data;
  const deliveryTotal = delivery.onTime + delivery.late;
  const deliveryData = deliveryTotal
    ? [
      { name: 'Dans les délais', value: delivery.onTime },
      { name: 'En retard', value: delivery.late },
    ]
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analyse"
        title="Rapports & Statistiques"
        description="Mesurez la performance commerciale, la charge de l’équipe et la qualité des livraisons sur une période glissante."
        actions={(
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Actualiser</Button>
            <Button variant="gold" icon={Download} onClick={exportCsv}>Exporter CSV</Button>
          </>
        )}
      />

      <div className="card flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><CalendarRange size={14} className="text-gold-600" /> Période d’analyse</span>
        <div className="segmented ml-auto">
          {PERIODS.map((value) => (
            <button key={value} type="button" data-active={period === value} onClick={() => setPeriod(value)}>
              {value} mois
            </button>
          ))}
        </div>
        <span className="text-[10.5px] text-muted">Données au {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="CA accepté" value={formatMoney(summary.revenue, true)} icon={TrendingUp} tone="green" sub={`Sur ${data.period} mois`} />
        <StatCard label="Pipeline actif" value={formatMoney(summary.pipelineValue, true)} icon={FolderKanban} tone="navy" sub={`${summary.activeProjects} programmes en cours`} />
        <StatCard label="Taux de conversion" value={`${summary.conversionRate}%`} icon={Target} tone="gold" sub="Devis acceptés / décidés" />
        <StatCard label="Projets livrés" value={summary.completedProjects} icon={CheckCircle2} tone="blue" sub={`${summary.onTimeRate}% dans les délais`} />
        <StatCard label="Devis en attente" value={summary.outstandingQuotes} icon={FileText} tone="amber" sub={formatMoney(summary.outstandingValue, true)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Chiffre d’affaires accepté"
          subtitle="Montants HT et TTC des devis acceptés, par mois"
          action={(
            <div className="flex flex-wrap items-center gap-3">
              <LegendDot color="#0A2540" label="HT" />
              <LegendDot color="#C9A227" label="TTC" />
            </div>
          )}
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.monthlyRevenue} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(value) => formatMoney(Number(value), true).replace(' MAD', '')} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [formatMoney(value), name === 'ht' ? 'CA HT' : 'CA TTC']}
                />
                <Bar dataKey="ht" name="ht" fill="#0A2540" radius={[6, 6, 0, 0]} maxBarSize={38} />
                <Line dataKey="ttc" name="ttc" type="monotone" stroke="#C9A227" strokeWidth={2.4} dot={{ r: 3, fill: '#C9A227', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Clients par secteur" subtitle="Répartition du portefeuille">
          <div className="h-[196px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.clientsBySector} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={2} stroke="none">
                  {data.clientsBySector.map((entry, index) => (
                    <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${value} client${value > 1 ? 's' : ''}`, 'Secteur']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {data.clientsBySector.slice(0, 6).map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-slate-500">{entry.name}</span>
                <span className="w-16 text-right text-[9px] text-slate-300">{Math.round((entry.value / maxSector) * 100)}%</span>
                <span className="w-5 text-right text-[10.5px] font-bold text-navy-900">{entry.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard title="Activité des tâches" subtitle="Créées et terminées par mois">
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyTasks} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="créées" fill="#0A2540" radius={[5, 5, 0, 0]} maxBarSize={22} />
                <Bar dataKey="terminées" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4">
            <LegendDot color="#0A2540" label="Créées" />
            <LegendDot color="#10B981" label="Terminées" />
          </div>
        </ChartCard>

        <ChartCard title="Statut des programmes" subtitle={`${summary.activeProjects} actifs · ${summary.completedProjects} livrés`}>
          <div className="space-y-3">
            {data.projectsByStatus.map((entry) => {
              const total = Math.max(1, data.projectsByStatus.reduce((sum, item) => sum + item.value, 0));
              return (
                <div key={entry.name}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-600">{entry.name}</span>
                    <span className="font-bold text-navy-900">{entry.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', PROJECT_TONES[entry.name] || 'bg-navy-700')} style={{ width: `${(entry.value / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl border border-line bg-slate-50/60 px-3 py-2.5 text-[10.5px] text-slate-500">
            Budget moyen par programme : <strong className="text-navy-900">{formatMoney(summary.avgBudget, true)}</strong>
          </div>
        </ChartCard>

        <ChartCard title="Portefeuille de devis" subtitle="Cycle de vie des propositions">
          <div className="h-[196px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.quotesByStatus} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={2} stroke="none">
                  {data.quotesByStatus.map((entry, index) => (
                    <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value} devis`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {data.quotesByStatus.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between">
                <Badge tone={QUOTE_TONES[entry.name] || 'slate'} className="!px-2 !py-0.5 !text-[9.5px]">{entry.name}</Badge>
                <span className="text-[11px] font-bold text-navy-900">{entry.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <ChartCard className="xl:col-span-2" title="Charge de l’équipe" subtitle="Tâches ouvertes, urgences et retards par collaborateur">
          {!data.workload.length ? (
            <EmptyState icon={UsersRound} compact title="Aucun collaborateur actif" />
          ) : (
            <div className="space-y-3">
              {data.workload.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                  <Avatar name={member.name} color={member.avatar_color} size="sm" />
                  <div className="min-w-0 flex-[1.2]">
                    <p className="truncate text-[12px] font-semibold text-navy-950">{member.name}</p>
                    <p className="truncate text-[9.5px] text-muted">{ROLE_META[member.role]?.label || member.role}{member.job_title ? ` · ${member.job_title}` : ''}</p>
                  </div>
                  <div className="min-w-0 flex-1 sm:min-w-[110px]">
                    <Progress value={(member.open / maxWorkload) * 100} tone={member.late ? 'red' : member.urgent ? 'amber' : 'navy'} />
                    <p className="mt-1 text-[9px] text-slate-400">{member.projects} projet{member.projects > 1 ? 's' : ''} piloté{member.projects > 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-navy-50 px-2 py-1 text-[9.5px] font-bold text-navy-800">{member.open} ouvert{member.open > 1 ? 'es' : 'e'}</span>
                    {member.urgent ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[9.5px] font-bold text-amber-700">{member.urgent} urgente{member.urgent > 1 ? 's' : ''}</span> : null}
                    {member.late ? <span className="rounded-full bg-red-50 px-2 py-1 text-[9.5px] font-bold text-red-600">{member.late} en retard</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Qualité des livraisons" subtitle={`${delivery.completed} programmes livrés sur la période`}>
          <div className="relative mx-auto h-[180px] w-full">
            {deliveryData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deliveryData} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
                    <Cell fill="#10B981" />
                    <Cell fill="#EF4444" />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-muted">Aucune livraison clôturée</div>
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[26px] font-extrabold leading-none text-navy-950">{delivery.onTimeRate}%</span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Ponctualité</span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600">Dans les délais</p>
              <p className="mt-0.5 text-[16px] font-extrabold text-navy-950">{delivery.onTime}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
              <p className="text-[9px] font-bold uppercase tracking-wide text-red-600">En retard</p>
              <p className="mt-0.5 text-[16px] font-extrabold text-navy-950">{delivery.late}</p>
            </div>
          </div>
          <p className="mt-2.5 text-center text-[10px] text-slate-400">
            Décalage moyen : <strong className={cn('text-[11px]', delivery.avgDelay > 0 ? 'text-red-500' : 'text-emerald-600')}>{delivery.avgDelay > 0 ? `+${delivery.avgDelay}` : delivery.avgDelay} j</strong>
          </p>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-bold text-navy-950">Top clients</h2>
              <p className="mt-0.5 text-xs text-muted">Classement par budget cumulé des programmes</p>
            </div>
            <Badge tone="gold" dot>{data.topClients.length} comptes</Badge>
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-right">Programmes</th>
                  <th className="text-right">Actifs</th>
                  <th className="text-right">Budget</th>
                  <th className="w-[120px]">Poids</th>
                </tr>
              </thead>
              <tbody>
                {data.topClients.map((client, index) => (
                  <tr key={client.name}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-[9.5px] font-extrabold', index === 0 ? 'bg-gold-500 text-navy-950' : 'bg-navy-50 text-navy-700')}>{index + 1}</span>
                        <span className="max-w-[220px] truncate text-[12px] font-semibold text-navy-950">{client.name}</span>
                      </div>
                    </td>
                    <td className="text-right text-[12px] font-semibold text-navy-900">{client.projects}</td>
                    <td className="text-right text-[11.5px] text-slate-500">{client.active}</td>
                    <td className="text-right text-[12px] font-bold text-navy-950">{formatMoney(client.budget, true)}</td>
                    <td>
                      <Progress value={(client.budget / maxBudget) * 100} tone={index === 0 ? 'gold' : 'navy'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-line sm:hidden">
            {data.topClients.map((client, index) => (
              <div key={client.name} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-navy-950">{index + 1}. {client.name}</span>
                  <span className="text-[12px] font-bold text-navy-950">{formatMoney(client.budget, true)}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-400">{client.projects} programmes · {client.active} actifs</p>
                <Progress className="mt-1.5" value={(client.budget / maxBudget) * 100} tone={index === 0 ? 'gold' : 'navy'} />
              </div>
            ))}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-bold text-navy-950">Synthèse opérationnelle</h2>
          <p className="mt-0.5 text-xs text-muted">Indicateurs transverses de la période</p>
          <div className="mt-4 space-y-3">
            {[
              { label: 'Achèvement des tâches', value: `${summary.taskCompletion}%`, icon: CheckCircle2, tone: 'text-emerald-600' },
              { label: 'Ponctualité des livraisons', value: `${summary.onTimeRate}%`, icon: Truck, tone: 'text-navy-700' },
              { label: 'Retard moyen', value: `${summary.avgDelay} j`, icon: Gauge, tone: summary.avgDelay > 0 ? 'text-amber-600' : 'text-emerald-600' },
              { label: 'Budget moyen par projet', value: formatMoney(summary.avgBudget, true), icon: FolderKanban, tone: 'text-navy-700' },
              { label: 'Valeur en attente', value: formatMoney(summary.outstandingValue, true), icon: FileText, tone: 'text-gold-700' },
              { label: 'Tâches suivies', value: formatNumber(data.monthlyTasks.reduce((sum, month) => sum + month['créées'], 0)), icon: BarChart3, tone: 'text-navy-700' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                <row.icon size={15} className={row.tone} />
                <span className="min-w-0 flex-1 text-[11px] text-slate-500">{row.label}</span>
                <span className="text-[12px] font-bold text-navy-950">{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="card flex flex-wrap items-center gap-3 border-gold-200/70 bg-gradient-to-r from-gold-50/80 via-white to-white px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 text-navy-950"><TrendingUp size={15} /></span>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-slate-500">
          <strong className="text-navy-900">Lecture de la période :</strong>{' '}
          {summary.revenue > 0
            ? `${formatMoney(summary.revenue, true)} de chiffre d’affaires accepté avec un taux de conversion de ${summary.conversionRate}%.`
            : 'Aucun devis accepté sur la période. Concentrez les efforts sur la conversion du pipeline.'}{' '}
          {delivery.avgDelay > 0
            ? `Les livraisons accusent un décalage moyen de ${delivery.avgDelay} jour${delivery.avgDelay > 1 ? 's' : ''}, à surveiller.`
            : 'Les livraisons respectent globalement les engagements.'}
        </p>
        {canManage ? (
          <a href="/devis" className="inline-flex items-center gap-1 text-[10.5px] font-bold text-navy-700 transition hover:text-gold-600">
            Gérer les devis <ArrowUpRight size={11} />
          </a>
        ) : null}
      </div>

      <p className="text-center text-[9.5px] text-slate-300">Rapport généré par Copil · {formatDateLongSafe(data.today)}</p>
    </div>
  );
}

function formatDateLongSafe(value?: string | null): string {
  if (!value) return todayISO();
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
