import { useEffect, useState, type FormEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { api, errorMessage } from '@/lib/api';
import { TIMELINE_META } from '@/lib/constants';
import { todayISO } from '@/lib/format';
import type { TimelineEntry } from '@/types';

const TYPE_OPTIONS = ['call', 'meeting', 'email', 'note'] as const;

export function InteractionModal({ open, onClose, clientId, onSaved }: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onSaved: (entry: TimelineEntry) => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<string>('call');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType('call');
    setTitle('');
    setContent('');
    setDate(todayISO());
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await api.post<{ data: TimelineEntry }>(`/clients/${clientId}/timeline`, { type, title, content, date });
      toast.success('Échange enregistré', title);
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
      size="sm"
      title="Ajouter un échange"
      description="Rendez-vous, appel, e-mail ou note interne : tout est historisé."
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button variant="gold" type="submit" form="interaction-form" loading={saving}>Enregistrer</Button>
        </>
      )}
    >
      <form id="interaction-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}
        <div>
          <label className="label">Type d’échange</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={`rounded-xl border px-3 py-2 text-[11.5px] font-semibold transition ${
                  type === option ? 'border-gold-300 bg-gold-50 text-navy-900 shadow-sm' : 'border-line bg-white text-slate-500 hover:border-navy-200'
                }`}
              >
                {TIMELINE_META[option].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Intitulé *</label>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Point d’avancement avec le client" />
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Compte rendu</label>
          <textarea className="textarea" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Décisions, points de vigilance, prochaines étapes…" />
        </div>
      </form>
    </Modal>
  );
}
