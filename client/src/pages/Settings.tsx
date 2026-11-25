import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, CalendarClock, Check, CreditCard, FileText, Globe,
  Hash, KeyRound, Landmark, LockKeyhole, LogOut, Mail, MapPin, Percent, Phone,
  RotateCcw, Save, ShieldCheck, Sparkles,
} from 'lucide-react';
import { PageError, PageHeader, PageLoading } from '@/components/layout/AppShell';
import { Avatar, Badge, Button, SectionHeading } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useAsync } from '@/hooks/useAsync';
import { api, errorMessage, getData } from '@/lib/api';
import { ROLE_META } from '@/lib/constants';
import { formatDate, formatMoney } from '@/lib/format';
import type { AppSettings } from '@/types';
import { cn } from '@/lib/cn';

type Tab = 'company' | 'quote' | 'account';

const TABS: Array<{ key: Tab; label: string; description: string; icon: typeof Building2 }> = [
  { key: 'company', label: 'Entreprise', description: 'Identité et coordonnées légales', icon: Building2 },
  { key: 'quote', label: 'Devis', description: 'Numérotation, TVA et conditions', icon: FileText },
  { key: 'account', label: 'Compte & sécurité', description: 'Profil et mot de passe', icon: ShieldCheck },
];

const CURRENCIES = ['MAD', 'EUR', 'USD', 'GBP', 'CHF', 'AED', 'SAR'];

export default function Settings() {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('company');
  const [form, setForm] = useState<AppSettings | null>(null);
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const { data, loading, error, refresh } = useAsync(() => getData<AppSettings>('/settings'), []);

  useEffect(() => {
    if (!data) return;
    setForm(JSON.parse(JSON.stringify(data)) as AppSettings);
    setInitial(JSON.stringify(data));
  }, [data]);

  const dirty = useMemo(() => Boolean(form && JSON.stringify(form) !== initial), [form, initial]);

  const updateCompany = (patch: Partial<AppSettings['company']>) => {
    setForm((current) => (current ? { ...current, company: { ...current.company, ...patch } } : current));
  };

  const updateQuote = (patch: Partial<AppSettings['quote']>) => {
    setForm((current) => (current ? { ...current, quote: { ...current.quote, ...patch } } : current));
  };

  const reset = () => {
    if (!initial) return;
    setForm(JSON.parse(initial) as AppSettings);
    setFormError(null);
    toast.info('Modifications annulées', 'Les paramètres enregistrés ont été restaurés.');
  };

  const save = async () => {
    if (!form || !isAdmin) return;
    if (!form.company.name.trim()) {
      setFormError('Le nom de l’entreprise est requis.');
      setTab('company');
      return;
    }
    if (!form.quote.prefix.trim() || form.quote.prefix.trim().length < 2) {
      setFormError('Le préfixe de numérotation doit contenir au moins 2 caractères.');
      setTab('quote');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = await api.put<{ data: AppSettings }>('/settings', form);
      setForm(JSON.parse(JSON.stringify(result.data)) as AppSettings);
      setInitial(JSON.stringify(result.data));
      toast.success('Paramètres enregistrés', 'Les nouveaux réglages sont appliqués à la plateforme.');
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast.error('Enregistrement impossible', message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!password.current) { setPasswordError('Saisissez votre mot de passe actuel.'); return; }
    if (password.next.length < 6) { setPasswordError('Le nouveau mot de passe doit contenir au moins 6 caractères.'); return; }
    if (password.next !== password.confirm) { setPasswordError('Les deux mots de passe ne correspondent pas.'); return; }
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      await api.post('/auth/password', { current: password.current, next: password.next });
      setPassword({ current: '', next: '', confirm: '' });
      toast.success('Mot de passe modifié', 'Votre nouveau mot de passe est actif immédiatement.');
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return <PageLoading eyebrow="Organisation" title="Paramètres" panels={2} />;
  }

  if (error || !data || !form) {
    return (
      <PageError
        title="Impossible de charger les paramètres"
        description={error}
        action={<Button onClick={refresh}>Réessayer</Button>}
      />
    );
  }

  const year = new Date().getFullYear();
  const previewNumber = `${form.quote.prefix || 'DEV'}-${year}-0001`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Organisation"
        title="Paramètres"
        description="Configurez l’identité de l’entreprise, les valeurs par défaut des devis et la sécurité de votre compte."
        actions={tab !== 'account' ? (
          <>
            {dirty ? (
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset} disabled={saving}>Annuler</Button>
            ) : null}
            {isAdmin ? (
              <Button size="sm" icon={Save} loading={saving} onClick={save} disabled={!dirty}>Enregistrer</Button>
            ) : null}
          </>
        ) : undefined}
      />

      {!isAdmin ? (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-navy-100 bg-navy-50/60 px-4 py-3 text-[11.5px] text-slate-600">
          <LockKeyhole size={15} className="shrink-0 text-navy-600" />
          <span className="min-w-0 flex-1">Vous consultez les paramètres en lecture seule. Seuls les administrateurs peuvent les modifier.</span>
          <Badge tone="navy">Lecture seule</Badge>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition',
              tab === entry.key ? 'border-navy-800 bg-navy-900 text-white shadow-sm' : 'border-line bg-white text-slate-600 hover:border-navy-200',
            )}
          >
            <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tab === entry.key ? 'bg-white/10 text-gold-300' : 'bg-navy-50 text-navy-700')}>
              <entry.icon size={16} />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[12.5px] font-bold', tab === entry.key ? 'text-white' : 'text-navy-950')}>{entry.label}</span>
              <span className={cn('mt-0.5 block truncate text-[10px]', tab === entry.key ? 'text-white/50' : 'text-muted')}>{entry.description}</span>
            </span>
          </button>
        ))}
      </div>

      {formError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[12px] font-medium text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{formError}</span>
        </div>
      ) : null}

      {tab === 'account' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="card p-5">
              <SectionHeading title="Mot de passe" subtitle="Choisissez un mot de passe robuste et unique pour sécuriser votre accès." />
              <form
                id="password-form"
                className="mt-4 grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => { event.preventDefault(); changePassword(); }}
              >
                {passwordError ? (
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[11.5px] font-medium text-red-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {passwordError}
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="current-password">Mot de passe actuel *</label>
                  <input id="current-password" type="password" className="input" value={password.current} onChange={(event) => setPassword((current) => ({ ...current, current: event.target.value }))} autoComplete="current-password" placeholder="Saisissez votre mot de passe actuel" />
                </div>
                <div>
                  <label className="label" htmlFor="next-password">Nouveau mot de passe *</label>
                  <input id="next-password" type="password" className="input" value={password.next} onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))} autoComplete="new-password" placeholder="6 caractères minimum" />
                </div>
                <div>
                  <label className="label" htmlFor="confirm-password">Confirmer le mot de passe *</label>
                  <input id="confirm-password" type="password" className="input" value={password.confirm} onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))} autoComplete="new-password" placeholder="Répétez le nouveau mot de passe" />
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-[10.5px] text-slate-400">Le changement est immédiat et journalisé dans l’audit de sécurité.</p>
                  <Button icon={KeyRound} loading={passwordSaving} type="submit" form="password-form">Modifier le mot de passe</Button>
                </div>
              </form>
            </section>

            <section className="card p-5">
              <SectionHeading title="Session & appareil" subtitle="Votre session est sécurisée par un jeton signé." />
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-slate-50/60 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Check size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-navy-950">Session active</p>
                  <p className="text-[10.5px] text-muted">Connecté en tant que {user?.email} · {ROLE_META[user?.role || 'EMPLOYEE'].label}</p>
                </div>
                <Button variant="secondary" size="sm" icon={LogOut} onClick={() => { logout(); navigate('/login'); }}>Se déconnecter</Button>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="card overflow-hidden">
              <div className="relative overflow-hidden bg-gradient-to-br from-navy-900 to-navy-950 px-5 py-6 text-white">
                <div className="canvas-grid pointer-events-none absolute inset-0 opacity-40" />
                <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gold-500/10 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <Avatar name={user?.name} color={user?.avatar_color || '#C9A227'} size="xl" className="ring-2 ring-white/20" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold">{user?.name}</p>
                    <p className="truncate text-[11px] text-white/60">{user?.job_title || ROLE_META[user?.role || 'EMPLOYEE'].label}</p>
                    <span className="mt-1.5 inline-flex rounded-full bg-gold-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-navy-950">{ROLE_META[user?.role || 'EMPLOYEE'].label}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5 px-5 py-4 text-[11.5px] text-slate-500">
                <p className="flex items-center gap-2 truncate"><Mail size={13} className="shrink-0 text-slate-300" /> {user?.email}</p>
                {user?.phone ? <p className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-slate-300" /> {user.phone}</p> : null}
                <p className="flex items-center gap-2"><CalendarClock size={13} className="shrink-0 text-slate-300" /> Membre depuis {formatDate(user?.created_at, 'long')}</p>
              </div>
              {isAdmin ? (
                <div className="border-t border-line px-5 py-3">
                  <Link to="/equipe" className="flex items-center justify-between text-[11px] font-semibold text-navy-700 transition hover:text-gold-600">
                    Gérer les profils de l’équipe <span>→</span>
                  </Link>
                </div>
              ) : null}
            </section>

            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-navy-950"><ShieldCheck size={16} className="text-gold-600" /> Bonnes pratiques</h2>
              <ul className="mt-3 space-y-2 text-[10.5px] leading-relaxed text-slate-500">
                <li className="flex gap-2"><Check size={12} className="mt-0.5 shrink-0 text-emerald-500" /> Utilisez au moins 12 caractères avec chiffres et symboles.</li>
                <li className="flex gap-2"><Check size={12} className="mt-0.5 shrink-0 text-emerald-500" /> Ne partagez jamais votre mot de passe.</li>
                <li className="flex gap-2"><Check size={12} className="mt-0.5 shrink-0 text-emerald-500" /> Déconnectez-vous sur les appareils partagés.</li>
              </ul>
            </section>
          </div>
        </div>
      ) : tab === 'company' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="card p-5">
              <SectionHeading title="Identité de l’entreprise" subtitle="Ces informations apparaissent sur les devis et documents générés." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="company-name">Raison sociale *</label>
                  <input id="company-name" className="input" value={form.company.name} disabled={!isAdmin} onChange={(event) => updateCompany({ name: event.target.value })} placeholder="Copil Mounir" />
                </div>
                <div>
                  <label className="label" htmlFor="company-tagline">Signature / accroche</label>
                  <input id="company-tagline" className="input" value={form.company.tagline || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ tagline: event.target.value })} placeholder="Conseil & pilotage d’activité" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="company-address"><MapPin size={11} className="mr-1 inline" /> Adresse</label>
                  <input id="company-address" className="input" value={form.company.address || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ address: event.target.value })} placeholder="24 Boulevard Zerktouni" />
                </div>
                <div>
                  <label className="label" htmlFor="company-city">Ville & code postal</label>
                  <input id="company-city" className="input" value={form.company.city || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ city: event.target.value })} placeholder="20100 Casablanca, Maroc" />
                </div>
                <div>
                  <label className="label" htmlFor="company-phone"><Phone size={11} className="mr-1 inline" /> Téléphone</label>
                  <input id="company-phone" className="input" value={form.company.phone || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ phone: event.target.value })} placeholder="+212 5 22 48 90 00" />
                </div>
                <div>
                  <label className="label" htmlFor="company-email"><Mail size={11} className="mr-1 inline" /> E-mail</label>
                  <input id="company-email" type="email" className="input" value={form.company.email || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ email: event.target.value })} placeholder="contact@copil.ma" />
                </div>
                <div>
                  <label className="label" htmlFor="company-website"><Globe size={11} className="mr-1 inline" /> Site web</label>
                  <input id="company-website" className="input" value={form.company.website || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ website: event.target.value })} placeholder="www.copil.ma" />
                </div>
                <div>
                  <label className="label" htmlFor="company-currency"><CreditCard size={11} className="mr-1 inline" /> Devise des documents</label>
                  <select id="company-currency" className="select" value={form.currency} disabled={!isAdmin} onChange={(event) => setForm((current) => (current ? { ...current, currency: event.target.value } : current))}>
                    {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionHeading title="Mentions légales" subtitle="Identifiants fiscaux et bancaires repris en pied de document." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="company-ice"><Hash size={11} className="mr-1 inline" /> ICE</label>
                  <input id="company-ice" className="input" value={form.company.ice || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ ice: event.target.value })} placeholder="002458796000041" />
                </div>
                <div>
                  <label className="label" htmlFor="company-rc"><Hash size={11} className="mr-1 inline" /> Registre de commerce</label>
                  <input id="company-rc" className="input" value={form.company.rc || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ rc: event.target.value })} placeholder="458796" />
                </div>
                <div>
                  <label className="label" htmlFor="company-if"><Hash size={11} className="mr-1 inline" /> Identifiant fiscal</label>
                  <input id="company-if" className="input" value={form.company.if || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ if: event.target.value })} placeholder="40258796" />
                </div>
                <div>
                  <label className="label" htmlFor="company-cnss"><Hash size={11} className="mr-1 inline" /> CNSS</label>
                  <input id="company-cnss" className="input" value={form.company.cnss || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ cnss: event.target.value })} placeholder="9876543" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="company-bank"><Landmark size={11} className="mr-1 inline" /> Coordonnées bancaires</label>
                  <input id="company-bank" className="input" value={form.company.bank || ''} disabled={!isAdmin} onChange={(event) => updateCompany({ bank: event.target.value })} placeholder="Banque — IBAN / RIB" />
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <section className="card overflow-hidden">
              <div className="relative overflow-hidden bg-gradient-to-br from-navy-900 to-navy-950 px-5 py-6 text-white">
                <div className="canvas-grid pointer-events-none absolute inset-0 opacity-40" />
                <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold-500/10 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-950 text-[20px] font-extrabold text-gold-400 ring-1 ring-white/10">C</span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold">{form.company.name || 'Votre entreprise'}</p>
                    <p className="truncate text-[10.5px] text-gold-300">{form.company.tagline || 'Signature de l’entreprise'}</p>
                  </div>
                </div>
                <div className="relative mt-4 space-y-1.5 text-[10.5px] text-white/55">
                  {form.company.address ? <p className="flex items-start gap-2"><MapPin size={11} className="mt-0.5 shrink-0" /> <span>{form.company.address}{form.company.city ? `, ${form.company.city}` : ''}</span></p> : null}
                  {form.company.phone ? <p className="flex items-center gap-2"><Phone size={11} className="shrink-0" /> {form.company.phone}</p> : null}
                  {form.company.email ? <p className="flex items-center gap-2"><Mail size={11} className="shrink-0" /> {form.company.email}</p> : null}
                  {form.company.website ? <p className="flex items-center gap-2"><Globe size={11} className="shrink-0" /> {form.company.website}</p> : null}
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400">Aperçu de l’en-tête document</p>
                <div className="mt-2.5 rounded-lg border border-line bg-slate-50/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10.5px] font-bold text-navy-950">{form.company.name || 'Entreprise'}</p>
                      <p className="text-[8.5px] text-slate-400">{[form.company.ice ? `ICE ${form.company.ice}` : '', form.company.rc ? `RC ${form.company.rc}` : ''].filter(Boolean).join(' · ') || 'Mentions légales'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-extrabold tracking-wider text-navy-900">DEVIS</p>
                      <p className="text-[8px] text-gold-700">{previewNumber}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-0.5 rounded-full bg-gold-500" />
                </div>
              </div>
            </section>

            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-navy-950"><Sparkles size={15} className="text-gold-600" /> Valeurs par défaut</h2>
              <div className="mt-3 space-y-2 text-[11px] text-slate-500">
                <div className="flex items-center justify-between"><span>Numérotation</span><strong className="text-navy-900">{previewNumber}</strong></div>
                <div className="flex items-center justify-between"><span>TVA appliquée</span><strong className="text-navy-900">{form.quote.tax_rate}%</strong></div>
                <div className="flex items-center justify-between"><span>Validité</span><strong className="text-navy-900">{form.quote.validity_days} jours</strong></div>
                <div className="flex items-center justify-between"><span>Devise</span><strong className="text-navy-900">{form.currency}</strong></div>
              </div>
              <Link to="/devis/nouveau" className="btn-secondary btn-sm mt-3 w-full">Tester avec un nouveau devis</Link>
            </section>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="card p-5">
              <SectionHeading title="Préférences de devis" subtitle="Ces valeurs préremplissent automatiquement chaque nouvelle proposition." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="quote-prefix">Préfixe de numérotation *</label>
                  <input id="quote-prefix" className="input uppercase" value={form.quote.prefix} disabled={!isAdmin} maxLength={8} onChange={(event) => updateQuote({ prefix: event.target.value.toUpperCase() })} placeholder="DEV" />
                  <p className="mt-1 text-[10px] text-slate-400">Prochain numéro : <strong className="text-navy-800">{previewNumber}</strong></p>
                </div>
                <div>
                  <label className="label" htmlFor="quote-tax"><Percent size={11} className="mr-1 inline" /> Taux de TVA par défaut</label>
                  <input id="quote-tax" type="number" min={0} max={100} step="0.5" className="input" value={form.quote.tax_rate} disabled={!isAdmin} onChange={(event) => updateQuote({ tax_rate: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
                </div>
                <div>
                  <label className="label" htmlFor="quote-validity"><CalendarClock size={11} className="mr-1 inline" /> Durée de validité (jours)</label>
                  <input id="quote-validity" type="number" min={1} max={365} step="1" className="input" value={form.quote.validity_days} disabled={!isAdmin} onChange={(event) => updateQuote({ validity_days: Math.min(365, Math.max(1, Number(event.target.value) || 1)) })} />
                </div>
                <div>
                  <label className="label" htmlFor="quote-currency">Devise des documents</label>
                  <select id="quote-currency" className="select" value={form.currency} disabled={!isAdmin} onChange={(event) => setForm((current) => (current ? { ...current, currency: event.target.value } : current))}>
                    {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="quote-payment">Conditions de règlement</label>
                  <textarea id="quote-payment" className="textarea" value={form.quote.payment_terms} disabled={!isAdmin} onChange={(event) => updateQuote({ payment_terms: event.target.value })} placeholder="Paiement à 30 jours fin de mois…" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="quote-delivery">Délai de livraison</label>
                  <input id="quote-delivery" className="input" value={form.quote.delivery_days} disabled={!isAdmin} onChange={(event) => updateQuote({ delivery_days: event.target.value })} placeholder="4 à 6 semaines à compter de la validation." />
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionHeading title="Aperçu du récapitulatif" subtitle="Rendu des totaux sur un devis exemple de 100 000 en HT." />
              <div className="mt-4 max-w-sm rounded-xl border border-line bg-slate-50/60 p-4 text-[11.5px]">
                <div className="flex justify-between py-1 text-slate-500"><span>Sous-total HT</span><span className="font-semibold text-navy-900">{formatMoney(100000, false, form.currency)}</span></div>
                <div className="flex justify-between py-1 text-slate-500"><span>Base HT</span><span className="font-semibold text-navy-900">{formatMoney(100000, false, form.currency)}</span></div>
                <div className="flex justify-between py-1 text-slate-500"><span>TVA {form.quote.tax_rate}%</span><span className="font-semibold text-navy-900">{formatMoney(100000 * (form.quote.tax_rate / 100), false, form.currency)}</span></div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-navy-900 px-3 py-2.5 text-white">
                  <span className="text-[9.5px] font-bold uppercase tracking-wide">Total TTC</span>
                  <span className="text-[13px] font-extrabold text-gold-300">{formatMoney(100000 * (1 + form.quote.tax_rate / 100), false, form.currency)}</span>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-[14px] font-bold text-navy-950"><FileText size={15} className="text-navy-600" /> Cycle de vie</h2>
              <div className="mt-3 space-y-2.5">
                {[
                  { label: 'Brouillon', detail: 'Édition libre, non transmis', tone: 'slate' as const },
                  { label: 'Envoyé', detail: 'Transmis au client, en attente', tone: 'navy' as const },
                  { label: 'Accepté', detail: 'Convertible en programme', tone: 'green' as const },
                  { label: 'Refusé / Expiré', detail: 'Archivé, analysé dans les rapports', tone: 'red' as const },
                ].map((step) => (
                  <div key={step.label} className="flex items-center gap-2.5">
                    <Badge tone={step.tone} className="w-[110px] justify-center !text-[9.5px]">{step.label}</Badge>
                    <span className="text-[10.5px] text-slate-500">{step.detail}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <h2 className="text-[14px] font-bold text-navy-950">Bon à savoir</h2>
              <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
                Modifier le préfixe ne renumérote pas les devis existants. Les nouveaux devis utilisent immédiatement le nouveau format et la TVA par défaut.
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
