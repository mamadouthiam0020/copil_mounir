import { useEffect, useState, type FormEvent } from 'react';
import { Building2, CalendarClock, TriangleAlert } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage, getList } from '@/lib/api';
import { SECTORS } from '@/lib/constants';
import { todayISO } from '@/lib/format';
import type { Client, User } from '@/types';

interface ClientModalProps {
  open: boolean;
  onClose: () => void;
  client?: Client | null;
  onSaved: (client: Client) => void;
}

interface FormState {
  name: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  sector: string;
  status: string;
  owner_id: string;
  notes: string;
  next_action: string;
  next_action_date: string;
  next_action_owner: string;
  next_priority: string;
}

const EMPTY: FormState = {
  name: '', company: '', contact_name: '', email: '', phone: '', address: '', city: '', sector: '',
  status: 'actif', owner_id: '', notes: '', next_action: '', next_action_date: '', next_action_owner: '', next_priority: 'Moyen',
};

export function ClientModal({ open, onClose, client, onSaved }: ClientModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (client) {
      setForm({
        name: client.name || '',
        company: client.company || '',
        contact_name: client.contact_name || '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || '',
        city: client.city || '',
        sector: client.sector || '',
        status: client.status || 'actif',
        owner_id: client.owner_id || '',
        notes: client.notes || '',
        next_action: client.next_action || '',
        next_action_date: client.next_action_date || '',
        next_action_owner: client.next_action_owner || '',
        next_priority: client.next_priority || 'Moyen',
      });
    } else {
      setForm({ ...EMPTY, next_action_date: todayISO() });
    }
    getList<User>('/users').then((result) => setUsers(result.data)).catch(() => setUsers([]));
  }, [open, client?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        owner_id: form.owner_id || null,
        next_action_date: form.next_action_date || null,
        next_action_owner: form.next_action_owner || null,
        status: form.status,
      };
      const result = client
        ? await api.put<{ data: Client }>(`/clients/${client.id}`, payload)
        : await api.post<{ data: Client }>('/clients', payload);
      toast.success(client ? 'Fiche client mise à jour' : 'Client enregistré', result.data.company || result.data.name);
      onSaved(result.data);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? 'Modifier la fiche client' : 'Nouveau client'}
      description={client ? client.company || client.name : 'Centralisez les informations et les prochaines étapes de la relation.'}
      footer={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
          <Button variant="gold" type="submit" form="client-form" loading={saving}>
            {client ? 'Enregistrer' : 'Créer la fiche client'}
          </Button>
        </>
      )}
    >
      <form id="client-form" onSubmit={submit} className="space-y-6">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Building2 size={15} className="text-gold-600" />
            <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-navy-900">Identité & coordonnées</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Nom du client *</label>
              <input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Groupe Atlas" />
            </div>
            <div>
              <label className="label">Entreprise</label>
              <input className="input" value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Raison sociale" />
            </div>
            <div>
              <label className="label">Personne de contact</label>
              <input className="input" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Nom et prénom" />
            </div>
            <div>
              <label className="label">Secteur d’activité</label>
              <select className="select" value={form.sector} onChange={(e) => set('sector', e.target.value)}>
                <option value="">Sélectionner…</option>
                {SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Adresse e-mail</label>
              <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@entreprise.com" />
            </div>
            <div>
              <label className="label">Téléphone</label>
              <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+212 6 00 00 00 00" />
            </div>
            <div>
              <label className="label">Adresse géographique</label>
              <input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Rue, numéro" />
            </div>
            <div>
              <label className="label">Ville</label>
              <input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Casablanca" />
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="actif">Actif</option>
                <option value="inactif">Inactif</option>
              </select>
            </div>
            <div>
              <label className="label">Responsable du compte</label>
              <select className="select" value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
                <option value="">Non affecté</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={15} className="text-gold-600" />
            <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-navy-900">Prochaines étapes</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Prochaine action</label>
              <input className="input" value={form.next_action} onChange={(e) => set('next_action', e.target.value)} placeholder="Ex. Valider le cadrage fonctionnel" />
            </div>
            <div>
              <label className="label">Date de relance</label>
              <input className="input" type="date" value={form.next_action_date} onChange={(e) => set('next_action_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Responsable</label>
              <select className="select" value={form.next_action_owner} onChange={(e) => set('next_action_owner', e.target.value)}>
                <option value="">Non affecté</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Niveau de priorité</label>
              <select className="select" value={form.next_priority} onChange={(e) => set('next_priority', e.target.value)}>
                {['Faible', 'Moyen', 'Élevé', 'Urgent'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </div>
          </div>
        </section>

        <div>
          <label className="label">Notes internes</label>
          <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Contexte, points de vigilance, préférences du client…" />
        </div>
      </form>
    </Modal>
  );
}
