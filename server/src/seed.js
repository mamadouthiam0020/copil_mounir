import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ENV } from './env.js';
import { closeDb, collection, connect, ENV_LABEL, MONGO_DB_NAME } from './db.js';
import { addDays, computeQuote, nowISO, todayISO, uid } from './utils.js';

/**
 * Données de démonstration et comptes par défaut
 * ---------------------------------------------
 * `npm run seed` / `npm run seed:dev` réinitialisent la base de développement.
 * `npm run seed:prod` fait la même chose sur la base de production (destructif).
 *
 * Au démarrage de l'API, `prepareStartupData()` crée uniquement ce qui manque :
 * la configuration globale est toujours assurée (les routes devis en ont besoin),
 * les comptes de démonstration sont ajoutés s'ils manquent — même dans une base
 * qui contient déjà des utilisateurs — et le reste du jeu de démonstration est
 * créé seulement si la base ne contient aucun client.
 * Rien n'est écrasé dans une base existante.
 */

const SEED_COLLECTIONS = [
  'users', 'clients', 'projects', 'tasks', 'quotes', 'timeline', 'documents', 'audit_logs', 'settings',
];

const isoDaysAgo = (days) => new Date(Date.now() - Number(days) * 86_400_000).toISOString();
const pad = (value) => String(value).padStart(2, '0');

function buildSettings(now = nowISO()) {
  const year = new Date().getFullYear();
  return {
    id: 'global',
    company: {
      name: 'Copil',
      tagline: 'Pilotage commercial et opérationnel',
      address: '12 rue des Arts, Maarif',
      city: 'Casablanca, Maroc',
      phone: '+212 522 000 000',
      email: 'contact@copil.ma',
      website: 'https://copil.ma',
      ice: '000000000000000',
      rc: '000000',
      if: '',
      cnss: '',
      bank: 'Banque populaire — 000 000 000 000 000',
    },
    quote: {
      prefix: 'DEV',
      tax_rate: 20,
      validity_days: 30,
      payment_terms: '30 jours net à compter de la date de facturation.',
      delivery_days: `Entre 15 et 45 jours selon le programme (${year}).`,
    },
    currency: 'MAD',
    created_at: now,
    updated_at: now,
  };
}

function buildUsers(now = nowISO()) {
  // En développement, les mots de passe de démonstration restent pratiques ;
  // ils peuvent être surchargés via SEED_DEMO_PASSWORD.
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  return [
    {
      id: 'usr_mounir',
      name: 'Mounir El Amrani',
      email: 'mounir@copil.ma',
      password: demoPassword || 'admin123',
      role: 'SUPER_ADMIN',
      job_title: 'Directeur général',
      phone: '+212 600 100 101',
      avatar_color: '#0B2A5B',
      created_at: now,
    },
    {
      id: 'usr_sarah',
      name: 'Sarah Bennani',
      email: 'sarah@copil.ma',
      password: demoPassword || 'admin123',
      role: 'ADMIN',
      job_title: 'Responsable opérations',
      phone: '+212 600 100 102',
      avatar_color: '#B8873B',
      created_at: now,
    },
    {
      id: 'usr_yassine',
      name: 'Yassine Idrissi',
      email: 'yassine@copil.ma',
      password: demoPassword || 'manager123',
      role: 'MANAGER',
      job_title: 'Chef de projets',
      phone: '+212 600 100 103',
      avatar_color: '#2F6FA8',
      created_at: now,
    },
    {
      id: 'usr_karim',
      name: 'Karim Alaoui',
      email: 'karim@copil.ma',
      password: demoPassword || 'employe123',
      role: 'EMPLOYEE',
      job_title: 'Développeur full-stack',
      phone: '+212 600 100 104',
      avatar_color: '#3E8E7E',
      created_at: now,
    },
  ].map(({ password, ...user }) => ({
    ...user,
    password_hash: bcrypt.hashSync(password, 12),
    active: 1,
    token_version: 0,
  }));
}

function makeClient(row, today) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address || 'Zone industrielle',
    city: row.city,
    sector: row.sector,
    status: row.status,
    owner_id: row.owner_id,
    notes: row.notes || `Compte suivi par l'équipe Copil (${row.sector}).`,
    next_action: row.next_action || null,
    next_action_date: row.next_action_offset === null || row.next_action_offset === undefined
      ? null
      : addDays(today, row.next_action_offset),
    next_action_owner: row.owner_id,
    next_priority: row.priority || 'Moyen',
    created_at: isoDaysAgo(row.created_days_ago ?? 90),
    updated_at: isoDaysAgo(row.updated_days_ago ?? 2),
  };
}

function buildClients(today) {
  const rows = [
    {
      id: 'cli_finaxis', name: 'Finaxis', company: 'Finaxis Group', contact_name: 'Amine Farah',
      email: 'amine@finaxis.ma', phone: '+212 522 110 220', city: 'Casablanca', sector: 'Finance',
      status: 'actif', owner_id: 'usr_mounir', next_action: 'Valider le cahier des charges du dashboard',
      next_action_offset: 1, priority: 'Élevé', notes: 'Banque digitale en cours de transformation.',
    },
    {
      id: 'cli_atlas', name: 'Atlas Logistique', company: 'Atlas Logistique', contact_name: 'Nadia Chraibi',
      email: 'nadia@atlas-log.ma', phone: '+212 522 220 330', city: 'Rabat', sector: 'Logistique',
      status: 'actif', owner_id: 'usr_sarah', next_action: 'Point hebdomadaire sur l’entrepôt',
      next_action_offset: 2, priority: 'Moyen',
    },
    {
      id: 'cli_techorbit', name: 'TechOrbit', company: 'TechOrbit SAS', contact_name: 'Omar Rahmani',
      email: 'omar@techorbit.ma', phone: '+212 522 330 440', city: 'Casablanca', sector: 'Technologie',
      status: 'actif', owner_id: 'usr_yassine', next_action: 'Revue des recommandations d’audit',
      next_action_offset: 0, priority: 'Urgent', notes: 'Client stratégique, passage à l’échelle prévu.',
    },
    {
      id: 'cli_nova', name: 'Nova Retail', company: 'Nova Retail', contact_name: 'Salma Idrissi',
      email: 'salma@novaretail.ma', phone: '+212 522 440 550', city: 'Marrakech', sector: 'Distribution',
      status: 'prospect', owner_id: 'usr_sarah', next_action: 'Envoyer la proposition commerciale',
      next_action_offset: 3, priority: 'Élevé',
    },
    {
      id: 'cli_solaris', name: 'Solaris Énergie', company: 'Solaris Énergie', contact_name: 'Hicham Bennani',
      email: 'hicham@solaris.ma', phone: '+212 522 550 660', city: 'Oujda', sector: 'Énergie',
      status: 'actif', owner_id: 'usr_mounir', next_action: 'Programmer la visite du site pilote',
      next_action_offset: 4, priority: 'Moyen',
    },
    {
      id: 'cli_medina', name: 'Medina Habitat', company: 'Medina Habitat', contact_name: 'Laila Tazi',
      email: 'laila@medinahabitat.ma', phone: '+212 522 660 770', city: 'Fès', sector: 'Immobilier',
      status: 'actif', owner_id: 'usr_yassine', next_action: 'Relancer sur le portail locataires',
      next_action_offset: -1, priority: 'Élevé',
    },
    {
      id: 'cli_orient', name: 'Orient Digital', company: 'Orient Digital', contact_name: 'Youssef Amine',
      email: 'youssef@orientdigital.ma', phone: '+212 522 770 880', city: 'Tanger', sector: 'Marketing',
      status: 'inactif', owner_id: 'usr_sarah', next_action: null, next_action_offset: null,
      notes: 'Compte en pause, à réactiver en fin d’année.',
    },
    {
      id: 'cli_verdant', name: 'Verdant Agro', company: 'Verdant Agro', contact_name: 'Fouad Bouzid',
      email: 'fouad@verdantagro.ma', phone: '+212 522 880 990', city: 'Kenitra', sector: 'Agroalimentaire',
      status: 'prospect', owner_id: 'usr_mounir', next_action: 'Qualifier le besoin de traçabilité',
      next_action_offset: 5, priority: 'Moyen',
    },
  ];
  return rows.map((row, index) => makeClient({ ...row, created_days_ago: 120 - index * 8 }, today));
}

function makeProject(row, today, index) {
  const year = new Date().getFullYear();
  return {
    id: row.id,
    name: row.name,
    code: `PRJ-${year}-${pad(index + 1)}`,
    client_id: row.client_id,
    description: row.description || `${row.name} — accompagnement Copil du cadrage à la livraison.`,
    needs: row.needs || 'Clarification des besoins, cadrage technique et planning de livraison.',
    objectives: row.objectives || 'Livrer une solution robuste dans les délais convenus.',
    budget: row.budget,
    start_date: addDays(today, row.start_offset),
    due_date: addDays(today, row.due_offset),
    manager_id: row.manager_id,
    status: row.status,
    progress: row.progress,
    comments: [],
    date_history: [],
    quote_id: row.quote_id || null,
    created_at: isoDaysAgo(row.created_days_ago ?? 60),
    updated_at: isoDaysAgo(row.updated_days_ago ?? 1),
  };
}

function buildProjects(today) {
  const rows = [
    { id: 'prj_techorbit_audit', name: 'Audit de la plateforme', client_id: 'cli_techorbit', manager_id: 'usr_yassine', status: 'en_cours', start_offset: -28, due_offset: 2, budget: 68000, progress: 65, quote_id: 'dev_2411', objectives: 'Identifier les risques et prioriser les correctifs avant la mise à l’échelle.' },
    { id: 'prj_techorbit_migration', name: 'Migration vers le cloud', client_id: 'cli_techorbit', manager_id: 'usr_yassine', status: 'en_cours', start_offset: -45, due_offset: -3, budget: 120000, progress: 80, objectives: 'Basculer les services critiques sans interruption.' },
    { id: 'prj_finaxis_dashboard', name: 'Dashboard décisionnel', client_id: 'cli_finaxis', manager_id: 'usr_mounir', status: 'en_cours', start_offset: -20, due_offset: 5, budget: 95000, progress: 55, quote_id: 'dev_2412' },
    { id: 'prj_finaxis_api', name: 'API bancaire v2', client_id: 'cli_finaxis', manager_id: 'usr_sarah', status: 'cadrage', start_offset: -5, due_offset: 18, budget: 150000, progress: 15 },
    { id: 'prj_atlas_wms', name: 'Entrepôt intelligent', client_id: 'cli_atlas', manager_id: 'usr_sarah', status: 'en_cours', start_offset: -24, due_offset: 1, budget: 110000, progress: 72, quote_id: 'dev_2413' },
    { id: 'prj_atlas_flotte', name: 'Suivi de flotte', client_id: 'cli_atlas', manager_id: 'usr_yassine', status: 'en_cours', start_offset: -30, due_offset: -1, budget: 54000, progress: 85 },
    { id: 'prj_nova_shop', name: 'Boutique e-commerce', client_id: 'cli_nova', manager_id: 'usr_sarah', status: 'cadrage', start_offset: -8, due_offset: 9, budget: 78000, progress: 10 },
    { id: 'prj_nova_app', name: 'Application fidélité', client_id: 'cli_nova', manager_id: 'usr_yassine', status: 'en_attente', start_offset: -2, due_offset: 25, budget: 46000, progress: 5 },
    { id: 'prj_solaris_scada', name: 'Supervision SCADA', client_id: 'cli_solaris', manager_id: 'usr_mounir', status: 'en_cours', start_offset: -18, due_offset: 4, budget: 135000, progress: 60, quote_id: 'dev_2415' },
    { id: 'prj_solaris_reporting', name: 'Reporting énergie', client_id: 'cli_solaris', manager_id: 'usr_sarah', status: 'termine', start_offset: -70, due_offset: -20, budget: 38000, progress: 100, updated_days_ago: 20 },
    { id: 'prj_medina_crm', name: 'CRM locataires', client_id: 'cli_medina', manager_id: 'usr_yassine', status: 'en_cours', start_offset: -15, due_offset: 6, budget: 62000, progress: 48 },
    { id: 'prj_medina_portail', name: 'Portail copropriété', client_id: 'cli_medina', manager_id: 'usr_mounir', status: 'cadrage', start_offset: -4, due_offset: 12, budget: 71000, progress: 12 },
    { id: 'prj_orient_campagne', name: 'Campagne digitale Q4', client_id: 'cli_orient', manager_id: 'usr_sarah', status: 'en_attente', start_offset: -40, due_offset: -5, budget: 25000, progress: 35 },
    { id: 'prj_orient_branding', name: 'Refonte de marque', client_id: 'cli_orient', manager_id: 'usr_mounir', status: 'annule', start_offset: -55, due_offset: 40, budget: 18000, progress: 0 },
    { id: 'prj_verdant_trace', name: 'Traçabilité des lots', client_id: 'cli_verdant', manager_id: 'usr_yassine', status: 'en_cours', start_offset: -12, due_offset: 7, budget: 58000, progress: 42 },
    { id: 'prj_verdant_bio', name: 'Certification bio', client_id: 'cli_verdant', manager_id: 'usr_sarah', status: 'cadrage', start_offset: -3, due_offset: 21, budget: 32000, progress: 8 },
  ];
  return rows.map((row, index) => makeProject(row, today, index));
}

function makeTask(row, index, today) {
  const status = row.status || 'todo';
  const progress = status === 'done' ? 100 : (row.progress ?? 0);
  const now = nowISO();
  return {
    id: `tsk_${pad(index)}`,
    title: row.title,
    description: row.description || `${row.title} — suivi dans le cadre du programme.`,
    status,
    priority: row.priority || 'medium',
    assignee_id: row.assignee_id || null,
    client_id: row.client_id || null,
    project_id: row.project_id || null,
    start_date: addDays(today, row.start_offset ?? -5),
    due_date: addDays(today, row.due_offset),
    progress,
    comments: index % 6 === 0
      ? [{ id: uid('tc'), at: isoDaysAgo(1), author_id: 'usr_sarah', author_name: 'Sarah Bennani', text: 'Point avancé en réunion, on reste sur le planning.' }]
      : [],
    attachments: [],
    completed_at: status === 'done' ? isoDaysAgo(1) : null,
    created_at: isoDaysAgo(row.created_days_ago ?? 12),
    updated_at: now,
  };
}

function buildTasks(today) {
  const rows = [
    { title: 'Cadrer l’audit de sécurité', project_id: 'prj_techorbit_audit', client_id: 'cli_techorbit', assignee_id: 'usr_yassine', status: 'in_progress', priority: 'high', due_offset: 0, progress: 70 },
    { title: 'Collecter les indicateurs Finaxis', project_id: 'prj_finaxis_dashboard', client_id: 'cli_finaxis', assignee_id: 'usr_karim', status: 'in_progress', priority: 'high', due_offset: 1, progress: 60 },
    { title: 'Préparer la revue d’entrepôt', project_id: 'prj_atlas_wms', client_id: 'cli_atlas', assignee_id: 'usr_sarah', status: 'todo', priority: 'medium', due_offset: 2 },
    { title: 'Corriger les alertes retard SCADA', project_id: 'prj_solaris_scada', client_id: 'cli_solaris', assignee_id: 'usr_karim', status: 'todo', priority: 'urgent', due_offset: -1 },
    { title: 'Rédiger le rapport d’audit', project_id: 'prj_techorbit_audit', client_id: 'cli_techorbit', assignee_id: 'usr_mounir', status: 'waiting', priority: 'high', due_offset: 3, progress: 45 },
    { title: 'Intégrer le flux bancaire', project_id: 'prj_finaxis_api', client_id: 'cli_finaxis', assignee_id: 'usr_karim', status: 'todo', priority: 'medium', due_offset: 7 },
    { title: 'Mettre à jour le planning de migration', project_id: 'prj_techorbit_migration', client_id: 'cli_techorbit', assignee_id: 'usr_yassine', status: 'in_progress', priority: 'high', due_offset: -3, progress: 80 },
    { title: 'Tester le suivi de flotte', project_id: 'prj_atlas_flotte', client_id: 'cli_atlas', assignee_id: 'usr_karim', status: 'in_progress', priority: 'medium', due_offset: 2, progress: 55 },
    { title: 'Envoyer la proposition Nova', project_id: 'prj_nova_shop', client_id: 'cli_nova', assignee_id: 'usr_sarah', status: 'todo', priority: 'high', due_offset: 0 },
    { title: 'Valider les maquettes CRM', project_id: 'prj_medina_crm', client_id: 'cli_medina', assignee_id: 'usr_yassine', status: 'waiting', priority: 'medium', due_offset: 4 },
    { title: 'Documenter l’API v2', project_id: 'prj_finaxis_api', client_id: 'cli_finaxis', assignee_id: 'usr_karim', status: 'todo', priority: 'low', due_offset: 10 },
    { title: 'Clôturer le reporting énergie', project_id: 'prj_solaris_reporting', client_id: 'cli_solaris', assignee_id: 'usr_sarah', status: 'done', priority: 'medium', due_offset: -20 },
    { title: 'Préparer le comité de pilotage', project_id: 'prj_techorbit_audit', client_id: 'cli_techorbit', assignee_id: 'usr_mounir', status: 'todo', priority: 'urgent', due_offset: 1 },
    { title: 'Contrôler les lots Verdant', project_id: 'prj_verdant_trace', client_id: 'cli_verdant', assignee_id: 'usr_karim', status: 'in_progress', priority: 'medium', due_offset: 5, progress: 40 },
    { title: 'Relancer Medina Habitat', project_id: 'prj_medina_portail', client_id: 'cli_medina', assignee_id: 'usr_mounir', status: 'todo', priority: 'high', due_offset: -2 },
    { title: 'Archiver la campagne Orient', project_id: 'prj_orient_campagne', client_id: 'cli_orient', assignee_id: 'usr_sarah', status: 'done', priority: 'low', due_offset: -5 },
    { title: 'Affiner le budget prévisionnel', project_id: 'prj_nova_app', client_id: 'cli_nova', assignee_id: 'usr_yassine', status: 'waiting', priority: 'medium', due_offset: 9 },
    { title: 'Déployer l’environnement de recette', project_id: 'prj_techorbit_migration', client_id: 'cli_techorbit', assignee_id: 'usr_karim', status: 'in_progress', priority: 'high', due_offset: -4, progress: 75 },
    { title: 'Former les utilisateurs SCADA', project_id: 'prj_solaris_scada', client_id: 'cli_solaris', assignee_id: 'usr_mounir', status: 'todo', priority: 'medium', due_offset: 6 },
    { title: 'Répondre aux questions Verdant', project_id: 'prj_verdant_bio', client_id: 'cli_verdant', assignee_id: 'usr_sarah', status: 'todo', priority: 'low', due_offset: 12 },
    { title: 'Valider la note de cadrage', project_id: 'prj_finaxis_dashboard', client_id: 'cli_finaxis', assignee_id: 'usr_mounir', status: 'done', priority: 'medium', due_offset: -8 },
    { title: 'Préparer les livrables Atlas', project_id: 'prj_atlas_wms', client_id: 'cli_atlas', assignee_id: 'usr_karim', status: 'in_progress', priority: 'high', due_offset: 1, progress: 65 },
    { title: 'Planifier la visite Solaris', project_id: 'prj_solaris_scada', client_id: 'cli_solaris', assignee_id: 'usr_sarah', status: 'todo', priority: 'medium', due_offset: 4 },
    { title: 'Finaliser le bilan de migration', project_id: 'prj_techorbit_migration', client_id: 'cli_techorbit', assignee_id: 'usr_yassine', status: 'waiting', priority: 'urgent', due_offset: -2, progress: 85 },
  ];
  return rows.map((row, index) => makeTask(row, index + 1, today));
}

function makeQuote(row, index, today) {
  const year = new Date().getFullYear();
  const issueDate = addDays(today, row.issue_offset);
  const items = row.items.map((item, itemIndex) => ({
    id: `qi_${index}_${itemIndex + 1}`,
    description: null,
    discount: 0,
    ...item,
  }));
  const totals = computeQuote(items, row.tax_rate ?? 20);
  return {
    id: `dev_${2410 + index}`,
    number: `DEV-${year}-${String(index).padStart(4, '0')}`,
    client_id: row.client_id || null,
    prospect_name: row.prospect_name || null,
    prospect_email: row.prospect_email || null,
    prospect_phone: null,
    prospect_address: null,
    status: row.status,
    issue_date: issueDate,
    valid_until: addDays(issueDate, row.valid_days ?? 30),
    items: totals.lines,
    tax_rate: row.tax_rate ?? 20,
    notes: row.notes || 'Conditions subjectives à validation. Merci de nous retourner le devis signé.',
    payment_terms: '30 jours net à compter de la date de facturation.',
    delivery_days: 'Entre 15 et 45 jours selon le programme.',
    created_by: row.created_by,
    created_at: isoDaysAgo(row.created_days_ago ?? 10),
    updated_at: isoDaysAgo(row.updated_days_ago ?? 3),
  };
}

function buildQuotes(today) {
  const rows = [
    { client_id: 'cli_techorbit', status: 'accepted', issue_offset: -35, created_by: 'usr_yassine', items: [{ designation: 'Audit de sécurité', qty: 1, unitPrice: 58000 }, { designation: 'Plan de remédiation', qty: 1, unitPrice: 10000 }] },
    { client_id: 'cli_finaxis', status: 'sent', issue_offset: -12, created_by: 'usr_mounir', items: [{ designation: 'Dashboard décisionnel', qty: 1, unitPrice: 76000 }, { designation: 'Formation utilisateurs', qty: 2, unitPrice: 4500 }] },
    { client_id: 'cli_atlas', status: 'accepted', issue_offset: -28, created_by: 'usr_sarah', items: [{ designation: 'Entrepôt intelligent — phase 1', qty: 1, unitPrice: 92000 }] },
    { client_id: 'cli_nova', status: 'sent', issue_offset: -6, created_by: 'usr_sarah', prospect_name: 'Nova Retail', items: [{ designation: 'Boutique e-commerce', qty: 1, unitPrice: 65000 }, { designation: 'Intégration paiement', qty: 1, unitPrice: 13000 }] },
    { client_id: 'cli_solaris', status: 'sent', issue_offset: -40, valid_days: 20, created_by: 'usr_mounir', items: [{ designation: 'Supervision SCADA', qty: 1, unitPrice: 112000 }] },
    { client_id: 'cli_medina', status: 'draft', issue_offset: -2, created_by: 'usr_yassine', items: [{ designation: 'CRM locataires', qty: 1, unitPrice: 52000 }] },
    { client_id: 'cli_orient', status: 'refused', issue_offset: -55, created_by: 'usr_sarah', items: [{ designation: 'Campagne digitale', qty: 1, unitPrice: 21000 }] },
    { client_id: 'cli_verdant', status: 'sent', issue_offset: -9, created_by: 'usr_mounir', items: [{ designation: 'Traçabilité des lots', qty: 1, unitPrice: 48000 }, { designation: 'Accompagnement certification', qty: 1, unitPrice: 10000 }] },
    { prospect_name: 'Atlas Consulting', prospect_email: 'contact@atlasconsulting.ma', status: 'draft', issue_offset: -1, created_by: 'usr_sarah', items: [{ designation: 'Audit organisationnel', qty: 1, unitPrice: 28000 }] },
  ];
  return rows.map((row, index) => makeQuote(row, index + 1, today));
}

function buildTimeline(today) {
  const entries = [
    { client_id: 'cli_finaxis', type: 'meeting', title: 'Comité de pilotage', content: 'Revue des indicateurs et validation du dashboard.', date_offset: 1, author_id: 'usr_mounir' },
    { client_id: 'cli_techorbit', type: 'call', title: 'Point audit', content: 'Restitution des premiers constats.', date_offset: 0, author_id: 'usr_yassine' },
    { client_id: 'cli_atlas', type: 'meeting', title: 'Visite entrepôt', content: 'Observation des flux et des zones de picking.', date_offset: 2, author_id: 'usr_sarah' },
    { client_id: 'cli_nova', type: 'email', title: 'Proposition envoyée', content: 'Offre e-commerce transmise à Salma.', date_offset: -3, author_id: 'usr_sarah' },
    { client_id: 'cli_solaris', type: 'call', title: 'Site pilote', content: 'Organisation de la visite technique.', date_offset: 4, author_id: 'usr_mounir' },
    { client_id: 'cli_medina', type: 'note', title: 'Relance portail', content: 'Le client attend une nouvelle version du cadrage.', date_offset: -1, author_id: 'usr_yassine' },
    { client_id: 'cli_verdant', type: 'document', title: 'Cahier des charges', content: 'Document de traçabilité reçu.', date_offset: -6, author_id: 'usr_mounir' },
    { client_id: 'cli_techorbit', type: 'project', title: 'Migration lancée', content: 'Démarrage de la phase de bascule.', date_offset: -12, author_id: 'usr_yassine' },
    { client_id: 'cli_finaxis', type: 'email', title: 'Données transmises', content: 'Jeu de données de test disponible.', date_offset: -9, author_id: 'usr_karim' },
    { client_id: 'cli_orient', type: 'note', title: 'Compte mis en pause', content: 'Reprise prévue en fin d’année.', date_offset: -15, author_id: 'usr_sarah' },
  ];
  return entries.map((entry, index) => ({
    id: `tl_${pad(index + 1)}`,
    client_id: entry.client_id,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    date: addDays(today, entry.date_offset),
    author_id: entry.author_id,
    created_at: isoDaysAgo(Math.max(1, -entry.date_offset + 1)),
  }));
}

function buildDocuments() {
  const rows = [
    { client_id: 'cli_finaxis', name: 'Cahier des charges — Dashboard.pdf', mime: 'application/pdf', size: 248000, uploaded_by: 'usr_mounir' },
    { client_id: 'cli_techorbit', name: 'Rapport d’audit — TechOrbit.pdf', mime: 'application/pdf', size: 412000, uploaded_by: 'usr_yassine' },
    { client_id: 'cli_atlas', name: 'Plan d’entrepôt — Phase 1.pdf', mime: 'application/pdf', size: 305000, uploaded_by: 'usr_sarah' },
    { client_id: 'cli_solaris', name: 'Schéma SCADA.pdf', mime: 'application/pdf', size: 520000, uploaded_by: 'usr_mounir' },
    { client_id: 'cli_medina', name: 'Spécifications CRM.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 128000, uploaded_by: 'usr_yassine' },
    { client_id: 'cli_verdant', name: 'Grille de traçabilité.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 96000, uploaded_by: 'usr_mounir' },
  ];
  return rows.map((row, index) => ({
    id: `doc_${pad(index + 1)}`,
    ...row,
    data: null,
    created_at: isoDaysAgo(5 + index),
  }));
}

function buildAuditLogs() {
  const year = new Date().getFullYear();
  const entries = [
    { actor_id: 'usr_mounir', action: 'auth.login', entity: 'session', entity_id: null, entity_label: 'Connexion', detail: 'Connexion à la plateforme' },
    { actor_id: 'usr_mounir', action: 'client.created', entity: 'client', entity_id: 'cli_finaxis', entity_label: 'Finaxis', detail: 'Nouveau client enregistré' },
    { actor_id: 'usr_sarah', action: 'client.created', entity: 'client', entity_id: 'cli_atlas', entity_label: 'Atlas Logistique', detail: 'Nouveau client enregistré' },
    { actor_id: 'usr_yassine', action: 'project.created', entity: 'project', entity_id: 'prj_techorbit_audit', entity_label: 'Audit de la plateforme', detail: 'Nouveau programme créé' },
    { actor_id: 'usr_sarah', action: 'quote.sent', entity: 'quote', entity_id: 'dev_2412', entity_label: `DEV-${year}-0002`, detail: 'Devis envoyé au client' },
    { actor_id: 'usr_yassine', action: 'task.completed', entity: 'task', entity_id: 'tsk_21', entity_label: 'Valider la note de cadrage', detail: 'Tâche terminée à 100 %' },
    { actor_id: 'usr_mounir', action: 'quote.accepted', entity: 'quote', entity_id: 'dev_2411', entity_label: `DEV-${year}-0001`, detail: 'Devis accepté' },
    { actor_id: 'usr_karim', action: 'task.updated', entity: 'task', entity_id: 'tsk_18', entity_label: 'Déployer l’environnement de recette', detail: 'Tâche mise à jour' },
    { actor_id: 'usr_sarah', action: 'settings.updated', entity: 'settings', entity_id: 'global', entity_label: 'Paramètres', detail: 'Paramètres de l’entreprise mis à jour' },
    { actor_id: 'usr_yassine', action: 'project.rescheduled', entity: 'project', entity_id: 'prj_medina_crm', entity_label: 'CRM locataires', detail: 'Échéance déplacée' },
  ];
  return entries.map((entry, index) => ({
    id: `log_${pad(index + 1)}`,
    ...entry,
    created_at: isoDaysAgo(15 - index),
  }));
}

async function insertMissing(collectionName, records, keys = ['id']) {
  let inserted = 0;
  let skipped = 0;
  for (const record of records) {
    const filters = keys.filter((key) => record[key] !== undefined).map((key) => ({ [key]: record[key] }));
    const filter = filters.length ? { $or: filters } : { id: record.id };
    if (await collection(collectionName).findOne(filter, { projection: { _id: 1 } })) {
      skipped += 1;
      continue;
    }
    await collection(collectionName).insertOne(record);
    inserted += 1;
  }
  return { inserted, skipped };
}

async function syncProjectProgress() {
  const tasks = await collection('tasks')
    .find({}, { projection: { _id: 0, project_id: 1, progress: 1, status: 1 } })
    .toArray();
  const grouped = new Map();
  for (const task of tasks) {
    if (!task.project_id) continue;
    const bucket = grouped.get(task.project_id) || [];
    bucket.push(task.status === 'done' ? 100 : Number(task.progress) || 0);
    grouped.set(task.project_id, bucket);
  }
  for (const [projectId, values] of grouped) {
    const progress = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    await collection('projects').updateOne(
      { id: projectId },
      { $set: { progress, updated_at: nowISO() } },
    );
  }
}

export async function seed({ reset = false, quiet = false } = {}) {
  const today = todayISO();
  const now = nowISO();
  const isProd = APP_ENV === 'production';

  if (isProd && reset && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error(
      'Seed destructif refusé en production. Définissez ALLOW_PROD_SEED=1 uniquement si vous savez ce que vous faites.',
    );
  }
  if (isProd && process.env.SEED_DEMO_PASSWORD && process.env.SEED_DEMO_PASSWORD.length < 12) {
    throw new Error('SEED_DEMO_PASSWORD doit contenir au moins 12 caractères.');
  }

  if (reset) {
    await Promise.all(SEED_COLLECTIONS.map((name) => collection(name).deleteMany({})));
  }

  const result = {
    settings: await insertMissing('settings', [buildSettings(now)]),
    // Jamais de comptes à mots de passe connus en production.
    users: await insertMissing('users', isProd ? [] : buildUsers(now), ['id', 'email']),
    clients: await insertMissing('clients', buildClients(today)),
    projects: await insertMissing('projects', buildProjects(today)),
    quotes: await insertMissing('quotes', buildQuotes(today), ['id', 'number']),
    tasks: await insertMissing('tasks', buildTasks(today)),
    timeline: await insertMissing('timeline', buildTimeline(today)),
    documents: await insertMissing('documents', buildDocuments()),
    audit_logs: await insertMissing('audit_logs', buildAuditLogs()),
  };

  await syncProjectProgress();

  if (!quiet) {
    const total = Object.values(result).reduce((sum, value) => sum + value.inserted, 0);
    console.log(`\n  Seed ${reset ? 'complet' : 'incrémental'} — ${ENV_LABEL} / ${MONGO_DB_NAME}`);
    console.log(`  ${total} enregistrement(s) créé(s).`);
    console.log('  Comptes de démonstration : mounir@copil.ma / sarah@copil.ma / yassine@copil.ma / karim@copil.ma');
    console.log('  Changez les mots de passe avant toute mise en production.\n');
  }

  return result;
}

/**
 * Initialisation au démarrage de l'API.
 * - AUTO_SEED=false désactive toute écriture.
 * - La configuration globale est créée si elle manque (routes devis).
 * - En production, aucun compte n'est créé automatiquement.
 * - En dev/test, les comptes manquants sont toujours ajoutés ; le reste du jeu
 *   de démonstration n'est créé que si la base ne contient aucun client.
 */
export async function prepareStartupData() {
  const enabled = String(process.env.AUTO_SEED ?? 'true').trim().toLowerCase() === 'true';
  if (!enabled) return;

  const now = nowISO();
  const existingSettings = await collection('settings').findOne({ id: 'global' }, { projection: { _id: 1 } });
  if (!existingSettings) {
    await collection('settings').insertOne(buildSettings(now));
    console.log('  Seed: configuration globale initialisée.');
  }

  if (APP_ENV === 'production') return;

  const users = await insertMissing('users', buildUsers(now), ['id', 'email']);
  if (users.inserted > 0) {
    console.log(`  Seed: ${users.inserted} compte(s) de démonstration créé(s) dans ${MONGO_DB_NAME} (voir README).`);
  }

  const clients = await collection('clients').countDocuments();
  if (clients === 0) {
    await seed({ quiet: true });
    console.log('  Seed: jeu de démonstration créé (base sans client).');
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await connect();
    await seed({ reset: process.argv.includes('--reset') });
  } catch (error) {
    console.error(`\n  ✖ Seed impossible : ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
