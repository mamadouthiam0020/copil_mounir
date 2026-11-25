import type { BadgeTone, QuoteStatus, Role, TaskPriority, TaskStatus } from '@/types';

export const TASK_STATUS_META: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  todo: { label: 'À faire', tone: 'slate' },
  in_progress: { label: 'En cours', tone: 'navy' },
  waiting: { label: 'En attente', tone: 'amber' },
  done: { label: 'Terminé', tone: 'green' },
  late: { label: 'En retard', tone: 'red' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; tone: BadgeTone }> = {
  low: { label: 'Faible', tone: 'slate' },
  medium: { label: 'Moyen', tone: 'blue' },
  high: { label: 'Élevé', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'red' },
};

export const PROJECT_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  cadrage: { label: 'Cadrage', tone: 'purple' },
  en_cours: { label: 'En cours', tone: 'navy' },
  en_attente: { label: 'En attente', tone: 'amber' },
  termine: { label: 'Terminé', tone: 'green' },
  annule: { label: 'Annulé', tone: 'slate' },
};

export const HEALTH_META: Record<string, { label: string; tone: BadgeTone }> = {
  late: { label: 'En retard', tone: 'red' },
  soon: { label: 'Échéance proche', tone: 'amber' },
  ontime: { label: 'Dans les délais', tone: 'green' },
  done: { label: 'Livré', tone: 'navy' },
  cancelled: { label: 'Annulé', tone: 'slate' },
};

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Brouillon', tone: 'slate' },
  sent: { label: 'Envoyé', tone: 'navy' },
  accepted: { label: 'Accepté', tone: 'green' },
  refused: { label: 'Refusé', tone: 'red' },
  expired: { label: 'Expiré', tone: 'amber' },
};

export const CLIENT_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  prospect: { label: 'Prospect', tone: 'gold' },
  actif: { label: 'Actif', tone: 'green' },
  inactif: { label: 'Inactif', tone: 'slate' },
};

export const ROLE_META: Record<Role, { label: string; short: string; tone: BadgeTone; description: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', short: 'SA', tone: 'navy', description: 'Accès total, gouvernance et sécurité de la plateforme.' },
  ADMIN: { label: 'Administrateur', short: 'AD', tone: 'purple', description: 'Gestion complète de l’activité et des utilisateurs autorisés.' },
  MANAGER: { label: 'Manager', short: 'MG', tone: 'gold', description: 'Suivi des clients, projets, équipes et engagements.' },
  EMPLOYEE: { label: 'Employé', short: 'EM', tone: 'slate', description: 'Accès aux tâches et projets attribués.' },
};

export const PRIORITY_OPTIONS = Object.entries(PRIORITY_META).map(([value, meta]) => ({ value, label: meta.label }));
export const TASK_STATUS_OPTIONS = (['todo', 'in_progress', 'waiting', 'done'] as const).map((value) => ({
  value,
  label: TASK_STATUS_META[value].label,
}));
export const PROJECT_STATUS_OPTIONS = Object.entries(PROJECT_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }));
export const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }));
export const TIMELINE_META: Record<string, { label: string; tone: BadgeTone }> = {
  call: { label: 'Appel', tone: 'blue' },
  meeting: { label: 'Rendez-vous', tone: 'navy' },
  email: { label: 'E-mail', tone: 'purple' },
  note: { label: 'Note interne', tone: 'gold' },
  document: { label: 'Document', tone: 'slate' },
  project: { label: 'Projet', tone: 'green' },
};
export const NEXT_PRIORITY_OPTIONS = PRIORITY_OPTIONS;
export const SECTORS = [
  'Industrie & BTP', 'Retail & Luxe', 'Santé', 'Finance & Assurance', 'Tourisme',
  'Industrie', 'Architecture', 'Technologies', 'Éducation', 'Services', 'Autre',
];
