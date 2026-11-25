export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type BadgeTone = 'navy' | 'gold' | 'green' | 'red' | 'amber' | 'slate' | 'blue' | 'purple';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  job_title?: string | null;
  phone?: string | null;
  avatar_color?: string | null;
  active?: number | boolean;
  created_at?: string;
  open_tasks?: number;
  done_tasks?: number;
  active_projects?: number;
  clients_count?: number;
}

export interface Client {
  id: string;
  name: string;
  company?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  sector?: string | null;
  status: 'prospect' | 'actif' | 'inactif';
  owner_id?: string | null;
  owner_name?: string | null;
  notes?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  next_action_owner?: string | null;
  next_priority?: string | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
  open_task_count?: number;
  quote_count?: number;
}

export interface ProjectComment {
  id: string;
  at: string;
  author_id?: string;
  author_name?: string;
  text: string;
}

export interface DateChange {
  id: string;
  at: string;
  by: string;
  by_name?: string;
  from_start?: string | null;
  from_due?: string | null;
  to_start?: string | null;
  to_due?: string | null;
}

export type ProjectHealth = 'late' | 'soon' | 'ontime' | 'done' | 'cancelled';

export interface Project {
  id: string;
  name: string;
  code?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  description?: string | null;
  needs?: string | null;
  objectives?: string | null;
  budget?: number;
  start_date?: string | null;
  due_date?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  manager_color?: string | null;
  status: 'cadrage' | 'en_cours' | 'en_attente' | 'termine' | 'annule';
  progress: number;
  comments: ProjectComment[];
  date_history: DateChange[];
  quote_id?: string | null;
  created_at: string;
  updated_at: string;
  days_left?: number | null;
  health?: ProjectHealth;
  is_late?: boolean;
  tasks?: Task[];
}

export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done' | 'late';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskComment {
  id: string;
  at: string;
  author_id?: string;
  author_name?: string;
  text: string;
}

export interface Attachment {
  id?: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  data?: string | null;
  has_data?: boolean;
  uploaded_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: Exclude<TaskStatus, 'late'>;
  effective_status: TaskStatus;
  priority: TaskPriority;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignee_color?: string | null;
  assignee_role?: Role | null;
  client_id?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  progress: number;
  comments: TaskComment[];
  attachments: Attachment[];
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  is_late?: boolean;
  days_left?: number | null;
}

export interface QuoteItem {
  id?: string;
  designation: string;
  description?: string | null;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal?: number;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'refused' | 'expired';

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  base: number;
  tax: number;
  total: number;
  taxRate: number;
}

export interface Quote {
  id: string;
  number: string;
  client_id?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  client_city?: string | null;
  client_display?: string | null;
  prospect_name?: string | null;
  prospect_email?: string | null;
  prospect_phone?: string | null;
  prospect_address?: string | null;
  status: QuoteStatus;
  effective_status: QuoteStatus;
  issue_date: string;
  valid_until?: string | null;
  items: QuoteItem[];
  tax_rate: number;
  totals: QuoteTotals;
  notes?: string | null;
  payment_terms?: string | null;
  delivery_days?: string | null;
  author_name?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type TimelineType = 'call' | 'meeting' | 'email' | 'note' | 'document' | 'project';

export interface TimelineEntry {
  id: string;
  client_id: string;
  type: TimelineType;
  title: string;
  content?: string | null;
  date: string;
  author_id?: string | null;
  author_name?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  created_at: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  name: string;
  mime?: string | null;
  size?: number | null;
  uploaded_by?: string | null;
  created_at: string;
  data?: string | null;
}

export interface ClientDetailData {
  client: Client;
  projects: Project[];
  quotes: Quote[];
  timeline: TimelineEntry[];
  documents: ClientDocument[];
  tasks: Task[];
}

export interface CompanySettings {
  name: string;
  tagline?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  ice?: string;
  rc?: string;
  if?: string;
  cnss?: string;
  bank?: string;
}

export interface QuoteSettings {
  prefix: string;
  tax_rate: number;
  validity_days: number;
  payment_terms: string;
  delivery_days: string;
}

export interface AppSettings {
  company: CompanySettings;
  quote: QuoteSettings;
  currency: string;
}

export interface AuditEntry {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_color?: string;
  action: string;
  entity: string;
  entity_id?: string;
  entity_label?: string;
  detail?: string;
  created_at: string;
}

export interface DashboardData {
  kpis: {
    clients: number;
    prospects: number;
    activeProjects: number;
    tasksInProgress: number;
    openTasks: number;
    upcomingDeliveries: number;
    lateDeliveries: number;
    pendingQuotes: number;
    pendingQuotesValue: number;
    lateTasks: number;
  };
  today: {
    tasks: Task[];
    meetings: TimelineEntry[];
    deadlines: Project[];
    followUps: Client[];
  };
  projects: Project[];
  activity: AuditEntry[];
  charts: {
    projectsEvolution: Array<{ name: string; créés: number; livrés: number }>;
    tasksByStatus: Array<{ key: string; name: string; value: number }>;
    quotesEvolution: Array<{ name: string; envoyés: number; acceptés: number; montant: number }>;
    deliveryPerformance: Array<{ name: string; livrés: number; 'dans les délais': number }>;
  };
  deliveries: { overdue: number; today: number; tomorrow: number; d3: number; d7: number };
  team: Array<Pick<User, 'id' | 'name' | 'role' | 'job_title' | 'avatar_color' | 'open_tasks'>>;
  meta: { generatedAt: string; role: Role };
}

export interface ReportData {
  period: number;
  summary: {
    revenue: number;
    pipelineValue: number;
    conversionRate: number;
    activeProjects: number;
    completedProjects: number;
    onTimeRate: number;
    avgDelay: number;
    taskCompletion: number;
    avgBudget: number;
    outstandingQuotes: number;
    outstandingValue: number;
  };
  monthlyRevenue: Array<{ name: string; ht: number; ttc: number; devis: number }>;
  monthlyTasks: Array<{ name: string; créées: number; terminées: number }>;
  clientsBySector: Array<{ name: string; value: number }>;
  workload: Array<{ id: string; name: string; role: Role; job_title?: string; avatar_color?: string; open: number; urgent: number; late: number; projects: number }>;
  projectsByStatus: Array<{ name: string; value: number }>;
  quotesByStatus: Array<{ name: string; value: number }>;
  topClients: Array<{ name: string; projects: number; budget: number; active: number }>;
  delivery: { completed: number; onTime: number; late: number; onTimeRate: number; avgDelay: number };
  today: string;
}

export interface ApiList<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface NotificationItem {
  id: string;
  type: 'project' | 'task' | 'client' | 'quote' | 'info';
  title: string;
  detail: string;
  tone: 'red' | 'amber' | 'gold' | 'navy';
  date?: string;
  to: string;
}
