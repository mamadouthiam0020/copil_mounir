import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Copy, Download,
  FileText, Loader2, Plus, Printer, Rocket, Save, Send, Sparkles, Trash2, User, X,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { Badge, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getData, getList } from '@/lib/api';
import { QUOTE_STATUS_META, QUOTE_STATUS_OPTIONS } from '@/lib/constants';
import { formatDate, formatDateTime, formatMoney, todayISO } from '@/lib/format';
import type {
  AppSettings, Client, Quote, QuoteItem, QuoteStatus, QuoteTotals,
} from '@/types';

interface DraftItem {
  key: string;
  id?: string;
  designation: string;
  description: string;
  qty: number;
  unitPrice: number;
  discount: number;
}

interface Draft {
  clientId: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone: string;
  prospectAddress: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  taxRate: number;
  notes: string;
  paymentTerms: string;
  deliveryDays: string;
  items: DraftItem[];
}

function itemKey() {
  return `line-${Math.random().toString(36).slice(2, 9)}`;
}

function blankItem(): DraftItem {
  return { key: itemKey(), designation: '', description: '', qty: 1, unitPrice: 0, discount: 0 };
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function emptyDraft(settings: AppSettings | null, clientId = ''): Draft {
  const issue = todayISO();
  return {
    clientId,
    prospectName: '',
    prospectEmail: '',
    prospectPhone: '',
    prospectAddress: '',
    status: 'draft',
    issueDate: issue,
    validUntil: shiftDays(issue, Number(settings?.quote?.validity_days) || 30),
    taxRate: Number(settings?.quote?.tax_rate ?? 20),
    notes: '',
    paymentTerms: settings?.quote?.payment_terms || '',
    deliveryDays: settings?.quote?.delivery_days || '',
    items: [blankItem()],
  };
}

function fromQuote(quote: Quote): Draft {
  return {
    clientId: quote.client_id || '',
    prospectName: quote.prospect_name || '',
    prospectEmail: quote.prospect_email || '',
    prospectPhone: quote.prospect_phone || '',
    prospectAddress: quote.prospect_address || '',
    status: quote.status,
    issueDate: quote.issue_date || todayISO(),
    validUntil: quote.valid_until || '',
    taxRate: Number(quote.tax_rate) || 0,
    notes: quote.notes || '',
    paymentTerms: quote.payment_terms || '',
    deliveryDays: quote.delivery_days || '',
    items: quote.items.length
      ? quote.items.map((item, index) => ({
        key: item.id || `line-${index}`,
        id: item.id,
        designation: item.designation,
        description: item.description || '',
        qty: Number(item.qty) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
      }))
      : [blankItem()],
  };
}

function computeTotals(items: DraftItem[], taxRate: number): QuoteTotals & { lines: Array<QuoteItem & { lineTotal: number }> } {
  const lines = items
    .filter((item) => item.designation.trim())
    .map((item) => {
      const gross = item.qty * item.unitPrice;
      const discountAmount = Math.round(gross * (item.discount / 100) * 100) / 100;
      return {
        id: item.id,
        designation: item.designation,
        description: item.description || null,
        qty: item.qty,
        unitPrice: item.unitPrice,
        discount: item.discount,
        lineTotal: Math.round((gross - discountAmount) * 100) / 100,
      };
    });
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0) * 100) / 100;
  const discountTotal = Math.round(lines.reduce((sum, line) => sum + line.qty * line.unitPrice * (line.discount / 100), 0) * 100) / 100;
  const base = Math.round((subtotal - discountTotal) * 100) / 100;
  const rate = Number(taxRate) || 0;
  const tax = Math.round(base * (rate / 100) * 100) / 100;
  const total = Math.round((base + tax) * 100) / 100;
  return { lines, subtotal, discountTotal, base, tax, total, taxRate: rate };
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/[\u202F\u00A0]/g, ' ');

function openPrintView(quote: Quote, settings: AppSettings) {
  const currency = settings.currency || 'MAD';
  const money = (value: number) => `${(Number(value) || 0)
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202F\u00A0]/g, ' ')} ${currency}`;
  const status = QUOTE_STATUS_META[quote.effective_status || quote.status]?.label || 'Devis';
  const company = settings.company || { name: 'Copil' };

  const rows = quote.items.map((item, index) => `
    <tr class="${index % 2 ? 'alt' : ''}">
      <td>
        <strong>${escapeHtml(item.designation)}</strong>
        ${item.description ? `<span class="desc">${escapeHtml(item.description)}</span>` : ''}
      </td>
      <td class="right">${item.qty}</td>
      <td class="right">${money(item.unitPrice)}</td>
      <td class="right">${item.discount ? `${item.discount} %` : '—'}</td>
      <td class="right strong">${money(item.lineTotal ?? item.qty * item.unitPrice)}</td>
    </tr>`).join('');

  const notes = [
    quote.notes ? { label: 'Notes', body: quote.notes } : null,
    quote.payment_terms ? { label: 'Conditions de règlement', body: quote.payment_terms } : null,
    quote.delivery_days ? { label: 'Délai de livraison', body: quote.delivery_days } : null,
  ].filter(Boolean) as Array<{ label: string; body: string }>;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Devis ${escapeHtml(quote.number)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #eef2f7; color: #0f172a; font-family: -apple-system, 'Segoe UI', Arial, sans-serif; font-size: 12px; }
  .sheet { max-width: 820px; margin: 24px auto; background: #fff; box-shadow: 0 18px 50px -24px rgba(10,37,64,.4); }
  .header { background: #0A2540; color: #fff; padding: 28px 32px; border-bottom: 4px solid #C9A227; display: flex; justify-content: space-between; gap: 24px; }
  .brand { display: flex; gap: 12px; }
  .mark { width: 4px; background: #C9A227; border-radius: 2px; }
  .brand h1 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .tagline { margin: 5px 0 0; color: #E7CE84; font-size: 11px; }
  .brand p { margin: 10px 0 0; color: #C4D6E6; font-size: 10px; line-height: 1.65; }
  .head-right { text-align: right; }
  .head-right h2 { margin: 0; font-size: 28px; letter-spacing: .06em; }
  .number { margin: 4px 0 0; color: #E7CE84; font-size: 13px; font-weight: 700; }
  .status { display: inline-block; margin-top: 10px; border: 1px solid #C9A227; color: #E7CE84; border-radius: 999px; padding: 3px 12px; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .body { padding: 28px 32px 20px; }
  .grid { display: flex; justify-content: space-between; gap: 24px; }
  .label { color: #C9A227; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 8px; }
  .emitter strong { font-size: 14px; color: #0A2540; }
  .emitter p { margin: 3px 0 0; color: #64748B; font-size: 10.5px; line-height: 1.6; }
  .client { width: 300px; border-left: 3px solid #C9A227; background: #F3F7FB; border-radius: 6px; padding: 14px 16px; }
  .client strong { display: block; color: #0A2540; font-size: 13px; }
  .client p { margin: 3px 0 0; color: #64748B; font-size: 10.5px; line-height: 1.55; }
  .meta { display: flex; gap: 30px; margin: 22px 0; padding: 12px 0; border-top: 1px solid #E6EBF2; border-bottom: 1px solid #E6EBF2; }
  .meta div span { display: block; color: #94A3B8; font-size: 8.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .meta div strong { display: block; margin-top: 4px; color: #0A2540; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #0A2540; color: #fff; text-align: left; padding: 9px 10px; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
  thead th.right { text-align: right; }
  tbody td { padding: 10px; border-bottom: 1px solid #E6EBF2; vertical-align: top; font-size: 11px; color: #334155; }
  tbody tr.alt td { background: #F9FBFD; }
  td.right { text-align: right; white-space: nowrap; }
  td strong { color: #0A2540; font-size: 11.5px; }
  td.strong { font-weight: 700; color: #123C68; }
  .desc { display: block; margin-top: 3px; color: #64748B; font-size: 10px; }
  .bottom { display: flex; justify-content: space-between; gap: 28px; margin-top: 20px; }
  .notes { flex: 1; }
  .note { margin-bottom: 12px; }
  .note span { display: block; color: #C9A227; font-size: 8.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; }
  .note p { margin: 0; color: #64748B; font-size: 10.5px; line-height: 1.6; }
  .totals { width: 260px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; color: #64748B; font-size: 11px; }
  .totals .row strong { color: #0A2540; }
  .totals .grand { display: flex; justify-content: space-between; align-items: center; background: #0A2540; color: #fff; border-radius: 6px; padding: 10px 12px; margin-top: 8px; }
  .totals .grand span { font-size: 10px; font-weight: 800; letter-spacing: .08em; }
  .totals .grand strong { color: #E7CE84; font-size: 16px; }
  .footer { border-top: 1px solid #E6EBF2; margin-top: 26px; padding: 12px 32px 20px; color: #94A3B8; font-size: 9px; display: flex; justify-content: space-between; gap: 20px; }
  .footer strong { color: #0A2540; }
  @page { size: A4; margin: 12mm; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; max-width: none; box-shadow: none; }
    .header { border-radius: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <div class="mark"></div>
        <div>
          <h1>${escapeHtml(company.name || 'Copil')}</h1>
          <p class="tagline">${escapeHtml(company.tagline || "Conseil & pilotage d'activité")}</p>
          <p>
            ${[company.address, company.city].filter(Boolean).map(escapeHtml).join(' · ')}<br/>
            ${[company.phone, company.email].filter(Boolean).map(escapeHtml).join(' · ')}<br/>
            ${[company.website].filter(Boolean).map(escapeHtml).join('')}
          </p>
        </div>
      </div>
      <div class="head-right">
        <h2>DEVIS</h2>
        <p class="number">${escapeHtml(quote.number)}</p>
        <span class="status">${escapeHtml(status)}</span>
      </div>
    </div>

    <div class="body">
      <div class="grid">
        <div class="emitter">
          <div class="label">Émetteur</div>
          <strong>${escapeHtml(company.name || 'Copil')}</strong>
          <p>
            ${[company.ice ? `ICE ${company.ice}` : '', company.rc ? `RC ${company.rc}` : '', company.if ? `IF ${company.if}` : ''].filter(Boolean).map(escapeHtml).join(' · ')}
          </p>
        </div>
        <div class="client">
          <div class="label">Client</div>
          <strong>${escapeHtml(quote.client_company || quote.prospect_name || quote.client_name || 'Prospect')}</strong>
          <p>
            ${quote.client_name ? `${escapeHtml(quote.client_name)}<br/>` : ''}
            ${[quote.client_address, quote.client_city].filter(Boolean).map(escapeHtml).join('<br/>')}
            ${quote.client_email || quote.prospect_email ? `<br/>${escapeHtml(quote.client_email || quote.prospect_email)}` : ''}
            ${quote.client_phone || quote.prospect_phone ? `<br/>${escapeHtml(quote.client_phone || quote.prospect_phone)}` : ''}
          </p>
        </div>
      </div>

      <div class="meta">
        <div><span>Date d'émission</span><strong>${escapeHtml(formatDate(quote.issue_date, 'long'))}</strong></div>
        <div><span>Valable jusqu'au</span><strong>${escapeHtml(formatDate(quote.valid_until, 'long'))}</strong></div>
        <div><span>Référence</span><strong>${escapeHtml(quote.number)}</strong></div>
        <div><span>Auteur</span><strong>${escapeHtml(quote.author_name || '—')}</strong></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="right">Qté</th>
            <th class="right">P.U. HT</th>
            <th class="right">Remise</th>
            <th class="right">Total HT</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5">Aucune ligne renseignée.</td></tr>'}</tbody>
      </table>

      <div class="bottom">
        <div class="notes">
          ${notes.map((note) => `<div class="note"><span>${escapeHtml(note.label)}</span><p>${escapeHtml(note.body).replace(/\n/g, '<br/>')}</p></div>`).join('')}
        </div>
        <div class="totals">
          <div class="row"><span>Sous-total HT</span><strong>${money(quote.totals.subtotal)}</strong></div>
          ${quote.totals.discountTotal > 0 ? `<div class="row"><span>Remise commerciale</span><strong>- ${money(quote.totals.discountTotal)}</strong></div>` : ''}
          <div class="row"><span>Base HT</span><strong>${money(quote.totals.base)}</strong></div>
          <div class="row"><span>TVA ${quote.totals.taxRate} %</span><strong>${money(quote.totals.tax)}</strong></div>
          <div class="grand"><span>TOTAL TTC</span><strong>${money(quote.totals.total)}</strong></div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>${[company.name, company.ice ? `ICE ${company.ice}` : '', company.rc ? `RC ${company.rc}` : '', company.if ? `IF ${company.if}` : ''].filter(Boolean).map(escapeHtml).join(' · ')}</span>
      <span><strong>${escapeHtml(quote.number)}</strong> · ${escapeHtml(formatDate(quote.issue_date, 'long'))}</span>
    </div>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=920,height=1040');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      /* printing is user controlled */
    }
  }, 450);
  return true;
}

export default function QuoteEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useAsync(async () => {
    const [clients, settings] = await Promise.all([
      getList<Client>('/clients?limit=200'),
      getData<AppSettings>('/settings'),
    ]);
    const quote = id ? await getData<Quote>(`/quotes/${id}`) : null;
    return { clients: clients.data, settings, quote };
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const prefill = searchParams.get('client') || '';
    const known = data.clients.some((client) => client.id === prefill) ? prefill : '';
    const next = data.quote ? fromQuote(data.quote) : emptyDraft(data.settings, known);
    setDraft(next);
    setInitial(JSON.stringify(next));
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const totals = useMemo(() => computeTotals(draft?.items || [], draft?.taxRate ?? 0), [draft?.items, draft?.taxRate]);
  const selectedClient = data?.clients.find((client) => client.id === draft?.clientId) || null;
  const dirty = Boolean(draft && JSON.stringify(draft) !== initial);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setDraft((current) => (current
      ? { ...current, items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }
      : current));
  };

  const addItem = () => {
    setDraft((current) => (current ? { ...current, items: [...current.items, blankItem()] } : current));
  };

  const removeItem = (key: string) => {
    setDraft((current) => {
      if (!current) return current;
      const items = current.items.filter((item) => item.key !== key);
      return { ...current, items: items.length ? items : [blankItem()] };
    });
  };

  const validate = (source: Draft): string | null => {
    if (!source.clientId && !source.prospectName.trim()) {
      return 'Sélectionnez un client existant ou renseignez le nom du prospect.';
    }
    if (!source.items.some((item) => item.designation.trim())) {
      return 'Ajoutez au moins une ligne de prestation avec une désignation.';
    }
    if (source.validUntil && source.issueDate && source.validUntil < source.issueDate) {
      return 'La date de validité doit être postérieure à la date d’émission.';
    }
    if (computeTotals(source.items, source.taxRate).total <= 0) {
      return 'Le devis doit contenir au moins une ligne valorisée (montant supérieur à 0).';
    }
    return null;
  };

  const buildPayload = (source: Draft) => {
    const computed = computeTotals(source.items, source.taxRate);
    return {
      client_id: source.clientId || null,
      prospect_name: source.clientId ? null : source.prospectName || null,
      prospect_email: source.clientId ? null : source.prospectEmail || null,
      prospect_phone: source.clientId ? null : source.prospectPhone || null,
      prospect_address: source.clientId ? null : source.prospectAddress || null,
      status: source.status,
      issue_date: source.issueDate || null,
      valid_until: source.validUntil || null,
      items: computed.lines.map((line) => ({
        id: line.id,
        designation: line.designation,
        description: line.description,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discount: line.discount,
      })),
      tax_rate: source.taxRate,
      notes: source.notes || null,
      payment_terms: source.paymentTerms || null,
      delivery_days: source.deliveryDays || null,
    };
  };

  const save = async (overrides?: Partial<Draft>) => {
    if (!draft) return;
    const source: Draft = { ...draft, ...overrides };
    const message = validate(source);
    if (message) {
      setFormError(message);
      toast.warning('Devis incomplet', message);
      return;
    }
    setFormError(null);
    setSaving(true);
    setDraft(source);
    try {
      const payload = buildPayload(source);
      const result = id
        ? await api.put<{ data: Quote }>(`/quotes/${id}`, payload)
        : await api.post<{ data: Quote }>('/quotes', payload);
      const next = fromQuote(result.data);
      setDraft(next);
      setInitial(JSON.stringify(next));
      toast.success(isNew ? 'Devis créé' : 'Devis enregistré', `${result.data.number} · ${formatMoney(result.data.totals.total)}`);
      if (isNew) navigate(`/devis/${result.data.id}`, { replace: true });
      else refresh();
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast.error('Enregistrement impossible', message);
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!id) return;
    setBusy('duplicate');
    try {
      const result = await api.post<{ data: Quote }>(`/quotes/${id}/duplicate`);
      toast.success('Devis dupliqué', result.data.number);
      navigate(`/devis/${result.data.id}`);
    } catch (err) {
      toast.error('Duplication impossible', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const convert = async () => {
    if (!id || !data?.quote) return;
    const ok = await confirm({
      title: 'Transformer ce devis en projet ?',
      message: 'Un programme sera créé à partir des lignes du devis et le devis sera marqué comme accepté.',
      confirmLabel: 'Créer le projet',
      tone: 'primary',
    });
    if (!ok) return;
    setBusy('convert');
    try {
      await api.post(`/quotes/${id}/convert`);
      toast.success('Projet créé', 'Le devis a été converti en programme opérationnel.');
      navigate('/planning');
    } catch (err) {
      toast.error('Conversion impossible', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!id) return;
    const ok = await confirm({
      title: 'Supprimer ce devis ?',
      message: 'Cette action est définitive et retire également le devis de l’historique client.',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await api.del(`/quotes/${id}`);
      toast.success('Devis supprimé');
      navigate('/devis');
    } catch (err) {
      toast.error('Suppression impossible', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const previewQuote = (): Quote | null => {
    if (!draft || !data) return null;
    const computed = computeTotals(draft.items, draft.taxRate);
    const today = todayISO();
    const effective: QuoteStatus = draft.status === 'sent' && draft.validUntil && draft.validUntil < today ? 'expired' : draft.status;
    return {
      id: id || 'preview',
      number: data.quote?.number || `${data.settings.quote?.prefix || 'DEV'}-${new Date().getFullYear()}-BROUILLON`,
      client_id: draft.clientId || null,
      client_name: selectedClient?.name || null,
      client_company: selectedClient?.company || selectedClient?.name || null,
      client_email: selectedClient?.email || null,
      client_phone: selectedClient?.phone || null,
      client_address: selectedClient?.address || null,
      client_city: selectedClient?.city || null,
      client_display: selectedClient?.company || selectedClient?.name || draft.prospectName || 'Prospect',
      prospect_name: draft.prospectName || null,
      prospect_email: draft.prospectEmail || null,
      prospect_phone: draft.prospectPhone || null,
      prospect_address: draft.prospectAddress || null,
      status: draft.status,
      effective_status: effective,
      issue_date: draft.issueDate,
      valid_until: draft.validUntil || null,
      items: computed.lines,
      tax_rate: draft.taxRate,
      totals: computed,
      notes: draft.notes || null,
      payment_terms: draft.paymentTerms || null,
      delivery_days: draft.deliveryDays || null,
      author_name: data.quote?.author_name || user?.name || null,
      created_by: data.quote?.created_by || user?.id || null,
      created_at: data.quote?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  const downloadPdf = async () => {
    if (!data) return;
    const quote = previewQuote();
    if (!quote) return;
    try {
      const { downloadQuotePdf } = await import('@/lib/quotePdf');
      downloadQuotePdf(quote, data.settings);
      toast.success('PDF généré', `Devis ${quote.number}`);
    } catch (err) {
      toast.error('Génération impossible', errorMessage(err));
    }
  };

  const print = () => {
    if (!data) return;
    const quote = previewQuote();
    if (!quote) return;
    const opened = openPrintView(quote, data.settings);
    if (!opened) toast.warning('Fenêtre bloquée', 'Autorisez les fenêtres pop-up pour imprimer le devis.');
  };

  if (loading) {
    return <PageLoading eyebrow="Commercial" title="Chargement du devis…" panels={2} panelClassName="h-[400px]" />;
  }

  if (error || !data || !draft) {
    return (
      <PageError
        icon={FileText}
        title={isNew ? 'Impossible de préparer le devis' : 'Devis introuvable'}
        description={error || 'Ce devis a peut-être été supprimé ou vous n’avez pas les droits nécessaires.'}
        action={<Button onClick={isNew ? refresh : () => navigate('/devis')}>{isNew ? 'Réessayer' : 'Retour aux devis'}</Button>}
      />
    );
  }

  const displayStatus: QuoteStatus = draft.status === 'sent' && draft.validUntil && draft.validUntil < todayISO() ? 'expired' : draft.status;
  const statusMeta = QUOTE_STATUS_META[displayStatus];
  const quoteNumber = data.quote?.number;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Commercial"
        title={isNew ? 'Nouveau devis' : (quoteNumber || 'Devis')}
        description={isNew
          ? 'Composez une proposition claire, ajustez les lignes et générez un document prêt à envoyer.'
          : `Proposition ${quoteNumber} · créée ${data.quote ? formatDate(data.quote.created_at, 'long') : ''}`}
        actions={(
          <>
            <Link to="/devis" className="btn-secondary btn-sm">
              <ArrowLeft size={14} /> Retour
            </Link>
            <Button variant="secondary" size="sm" icon={Printer} onClick={print}>Imprimer</Button>
            <Button variant="gold" size="sm" icon={Download} onClick={downloadPdf}>PDF</Button>
            <Button size="sm" icon={Save} loading={saving} onClick={() => save()}>Enregistrer</Button>
          </>
        )}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={statusMeta.tone} dot>{statusMeta.label}</Badge>
          {dirty ? <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Modifications non enregistrées</span> : null}
          {!isNew ? <span className="text-[10.5px] text-muted">Dernière mise à jour {data.quote ? formatDateTime(data.quote.updated_at) : '—'}</span> : null}
        </div>
      </PageHeader>

      {formError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{formError}</span>
          <button type="button" onClick={() => setFormError(null)} className="rounded p-0.5 text-red-400 hover:text-red-700" aria-label="Masquer l’erreur"><X size={14} /></button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* Client */}
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-navy-950">Client & destinataire</h2>
                <p className="mt-0.5 text-xs text-muted">Associez le devis à un compte existant ou saisissez un prospect.</p>
              </div>
              <Badge tone={selectedClient ? 'green' : 'gold'}>{selectedClient ? 'Compte client' : 'Prospect'}</Badge>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="quote-client">Compte client</label>
                <select
                  id="quote-client"
                  className="select"
                  value={draft.clientId}
                  onChange={(event) => update({ clientId: event.target.value })}
                >
                  <option value="">— Prospect / nouveau contact —</option>
                  {data.clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.company || client.name}</option>
                  ))}
                </select>
              </div>

              {selectedClient ? (
                <div className="sm:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-slate-50/60 px-4 py-3 text-[11.5px] text-slate-600">
                  <span className="font-semibold text-navy-900">{selectedClient.company || selectedClient.name}</span>
                  {selectedClient.contact_name ? <span>{selectedClient.contact_name}</span> : null}
                  {selectedClient.email ? <span>{selectedClient.email}</span> : null}
                  {selectedClient.phone ? <span>{selectedClient.phone}</span> : null}
                  <Link to={`/clients/${selectedClient.id}`} className="link ml-auto text-[11px]">Ouvrir la fiche</Link>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="prospect-name">Nom du prospect *</label>
                    <input id="prospect-name" className="input" value={draft.prospectName} placeholder="Ex. Horizon Voyages" onChange={(event) => update({ prospectName: event.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="prospect-email">E-mail</label>
                    <input id="prospect-email" type="email" className="input" value={draft.prospectEmail} placeholder="contact@entreprise.ma" onChange={(event) => update({ prospectEmail: event.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="prospect-phone">Téléphone</label>
                    <input id="prospect-phone" className="input" value={draft.prospectPhone} placeholder="+212 6 00 00 00 00" onChange={(event) => update({ prospectPhone: event.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="prospect-address">Adresse</label>
                    <input id="prospect-address" className="input" value={draft.prospectAddress} placeholder="Adresse de facturation" onChange={(event) => update({ prospectAddress: event.target.value })} />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Items */}
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-bold text-navy-950">Lignes de la proposition</h2>
                <p className="mt-0.5 text-xs text-muted">Quantités, prix unitaires et remises sont recalculés en direct.</p>
              </div>
              <Button variant="secondary" size="sm" icon={Plus} onClick={addItem}>Ajouter une ligne</Button>
            </div>

            <div className="divide-y divide-line">
              {draft.items.map((item, index) => {
                const gross = item.qty * item.unitPrice;
                const lineTotal = gross - gross * (item.discount / 100);
                return (
                  <div key={item.key} className="px-5 py-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-50 text-[9px] text-navy-700">{index + 1}</span>
                        Ligne de prestation
                      </span>
                      <button type="button" onClick={() => removeItem(item.key)} className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600" title="Supprimer la ligne" aria-label="Supprimer la ligne">
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-12">
                        <label className="label">Désignation *</label>
                        <input className="input" value={item.designation} placeholder="Ex. Cadrage produit & ateliers métier" onChange={(event) => updateItem(item.key, { designation: event.target.value })} />
                      </div>
                      <div className="sm:col-span-12">
                        <label className="label">Description</label>
                        <input className="input" value={item.description} placeholder="Détail de la prestation, livrables inclus…" onChange={(event) => updateItem(item.key, { description: event.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Qté</label>
                        <input type="number" min={0} step="1" className="input text-right" value={item.qty} onChange={(event) => updateItem(item.key, { qty: Math.max(0, Number(event.target.value) || 0) })} />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="label">Prix unitaire HT</label>
                        <input type="number" min={0} step="100" className="input text-right" value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label">Remise %</label>
                        <input type="number" min={0} max={100} step="1" className="input text-right" value={item.discount} onChange={(event) => updateItem(item.key, { discount: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
                      </div>
                      <div className="sm:col-span-4 flex flex-col justify-end">
                        <span className="label">Total HT</span>
                        <div className="flex h-[42px] items-center justify-end rounded-xl border border-gold-100 bg-gold-50/50 px-3.5">
                          <span className="text-[13px] font-extrabold text-navy-950">{formatMoney(lineTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-slate-50/50 px-5 py-3.5">
              <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-navy-700 transition hover:text-gold-600">
                <Plus size={14} /> Ajouter une prestation
              </button>
              <span className="text-[11px] text-muted">{totals.lines.length} ligne{totals.lines.length > 1 ? 's' : ''} valorisée{totals.lines.length > 1 ? 's' : ''}</span>
            </div>
          </section>

          {/* Notes */}
          <section className="card p-5">
            <h2 className="text-[15px] font-bold text-navy-950">Notes & conditions</h2>
            <p className="mt-0.5 text-xs text-muted">Ces mentions apparaissent en bas du devis PDF et de la version imprimée.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="quote-notes">Notes pour le client</label>
                <textarea id="quote-notes" className="textarea" value={draft.notes} placeholder="Périmètre, hypothèses, options incluses…" onChange={(event) => update({ notes: event.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="quote-payment">Conditions de règlement</label>
                <input id="quote-payment" className="input" value={draft.paymentTerms} placeholder="Paiement à 30 jours…" onChange={(event) => update({ paymentTerms: event.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="quote-delivery">Délai de livraison</label>
                <input id="quote-delivery" className="input" value={draft.deliveryDays} placeholder="4 à 6 semaines…" onChange={(event) => update({ deliveryDays: event.target.value })} />
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="card overflow-hidden">
            <div className="border-b border-line bg-gradient-to-r from-navy-950 to-navy-800 px-5 py-4 text-white">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-gold-300">Récapitulatif</p>
              <p className="mt-1 text-[15px] font-bold">{quoteNumber || 'Nouveau devis'}</p>
              <p className="mt-0.5 text-[10.5px] text-white/50">Total TTC</p>
              <p className="mt-1 text-[26px] font-extrabold leading-none tracking-tight text-gold-300">{formatMoney(totals.total)}</p>
            </div>
            <div className="space-y-2 px-5 py-4 text-[12px]">
              <div className="flex justify-between text-slate-500"><span>Sous-total HT</span><span className="font-semibold text-navy-900">{formatMoney(totals.subtotal)}</span></div>
              {totals.discountTotal > 0 ? (
                <div className="flex justify-between text-slate-500"><span>Remise</span><span className="font-semibold text-emerald-600">- {formatMoney(totals.discountTotal)}</span></div>
              ) : null}
              <div className="flex justify-between text-slate-500"><span>Base HT</span><span className="font-semibold text-navy-900">{formatMoney(totals.base)}</span></div>
              <div className="flex justify-between text-slate-500"><span>TVA {totals.taxRate}%</span><span className="font-semibold text-navy-900">{formatMoney(totals.tax)}</span></div>
              <div className="mt-2 flex justify-between border-t border-line pt-2.5 text-[13px] font-bold text-navy-950"><span>Total TTC</span><span>{formatMoney(totals.total)}</span></div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[14px] font-bold text-navy-950">Paramètres du devis</h2>
            <div className="mt-4 space-y-3.5">
              <div>
                <label className="label" htmlFor="quote-status">Statut</label>
                <select id="quote-status" className="select" value={draft.status} onChange={(event) => update({ status: event.target.value as QuoteStatus })}>
                  {QUOTE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="quote-issue"><CalendarDays size={11} className="mr-1 inline" />Émission</label>
                  <input id="quote-issue" type="date" className="input" value={draft.issueDate} onChange={(event) => update({ issueDate: event.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="quote-valid">Validité</label>
                  <input id="quote-valid" type="date" className="input" value={draft.validUntil} onChange={(event) => update({ validUntil: event.target.value })} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="quote-tax">Taux de TVA (%)</label>
                <input id="quote-tax" type="number" min={0} max={100} step="0.5" className="input" value={draft.taxRate} onChange={(event) => update({ taxRate: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Button className="w-full" icon={saving ? undefined : Save} loading={saving} onClick={() => save()}>
                {isNew ? 'Créer le devis' : 'Enregistrer les modifications'}
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="secondary" size="sm" icon={Download} onClick={downloadPdf}>Télécharger</Button>
                <Button variant="secondary" size="sm" icon={Printer} onClick={print}>Imprimer</Button>
              </div>
            </div>

            {!isNew ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">Actions rapides</p>
                <div className="grid gap-2">
                  {draft.status === 'draft' ? (
                    <Button variant="secondary" size="sm" icon={Send} onClick={() => save({ status: 'sent' })}>Marquer comme envoyé</Button>
                  ) : null}
                  {draft.status === 'sent' ? (
                    <>
                      <Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => save({ status: 'accepted' })}>Marquer accepté</Button>
                      <Button variant="ghost" size="sm" icon={X} onClick={() => save({ status: 'refused' })}>Marquer refusé</Button>
                    </>
                  ) : null}
                  <Button variant="secondary" size="sm" icon={Copy} loading={busy === 'duplicate'} onClick={duplicate}>Dupliquer le devis</Button>
                  {draft.clientId ? (
                    <Button variant="secondary" size="sm" icon={Rocket} loading={busy === 'convert'} onClick={convert}>Convertir en projet</Button>
                  ) : null}
                  {isAdmin ? (
                    <Button variant="danger" size="sm" icon={Trash2} loading={busy === 'delete'} onClick={remove}>Supprimer le devis</Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="card p-5">
            <h2 className="text-[14px] font-bold text-navy-950">Traçabilité</h2>
            <div className="mt-3 space-y-2.5 text-[11.5px] text-slate-500">
              <p className="flex items-start gap-2"><User size={13} className="mt-0.5 shrink-0 text-slate-300" /> <span>Auteur : <strong className="text-navy-900">{data.quote?.author_name || user?.name || '—'}</strong></span></p>
              <p className="flex items-start gap-2"><CalendarDays size={13} className="mt-0.5 shrink-0 text-slate-300" /> <span>Créé le {data.quote ? formatDateTime(data.quote.created_at) : 'à l’enregistrement'}</span></p>
              <p className="flex items-start gap-2"><Sparkles size={13} className="mt-0.5 shrink-0 text-gold-500" /> <span>{isNew ? 'Le numéro définitif sera attribué automatiquement.' : `Dernière mise à jour ${formatDateTime(data.quote?.updated_at)}`}</span></p>
            </div>
          </section>
        </div>
      </div>

      {saving ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full bg-navy-950 px-4 py-2 text-[11px] font-semibold text-white shadow-lift">
          <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin text-gold-400" /> Enregistrement du devis…</span>
        </div>
      ) : null}
    </div>
  );
}
