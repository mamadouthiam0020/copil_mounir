import { Router } from 'express';
import { collection } from '../db.js';
import { visibleClientFilter, visibleClientIds } from '../access.js';
import { addDays, daysUntil, enrichProject, enrichQuote, enrichTask, todayISO } from '../utils.js';

export const dashboardRouter = Router();

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function buildMonths(count = 6) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: MONTHS_FR[d.getMonth()], year: d.getFullYear() });
  }
  return out;
}

const PROJECT_LOOKUPS = [
  { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
  { $lookup: { from: 'users', localField: 'manager_id', foreignField: 'id', as: '_manager' } },
  {
    $addFields: {
      client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
      client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] },
      manager_name: { $ifNull: [{ $arrayElemAt: ['$_manager.name', 0] }, null] },
      manager_color: { $ifNull: [{ $arrayElemAt: ['$_manager.avatar_color', 0] }, null] },
    },
  },
  { $unset: ['_client', '_manager', '_id'] },
];

const TASK_LOOKUPS = [
  { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
  { $lookup: { from: 'projects', localField: 'project_id', foreignField: 'id', as: '_project' } },
  { $lookup: { from: 'users', localField: 'assignee_id', foreignField: 'id', as: '_assignee' } },
  {
    $addFields: {
      client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
      client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] },
      project_name: { $ifNull: [{ $arrayElemAt: ['$_project.name', 0] }, null] },
      assignee_name: { $ifNull: [{ $arrayElemAt: ['$_assignee.name', 0] }, null] },
      assignee_color: { $ifNull: [{ $arrayElemAt: ['$_assignee.avatar_color', 0] }, null] },
    },
  },
  { $unset: ['_client', '_project', '_assignee', '_id'] },
];

export async function loadProjects(user) {
  const filter = {};
  if (user.role === 'EMPLOYEE') {
    const ids = await collection('tasks').distinct('project_id', { assignee_id: user.id, project_id: { $ne: null } });
    filter.$or = [{ manager_id: user.id }, { id: { $in: ids.filter(Boolean) } }];
  }
  const rows = await collection('projects').aggregate([
    { $match: filter },
    ...PROJECT_LOOKUPS,
    { $sort: { due_date: 1 } },
  ]).toArray();
  return rows.map((p) => enrichProject(p));
}

export async function loadTasks(user) {
  const filter = user.role === 'EMPLOYEE' ? { assignee_id: user.id } : {};
  const rows = await collection('tasks').aggregate([
    { $match: filter },
    ...TASK_LOOKUPS,
    { $sort: { due_date: 1 } },
  ]).toArray();
  return rows.map((t) => enrichTask(t));
}

export async function loadQuotes(user) {
  if (user?.role === 'EMPLOYEE') return [];
  const rows = await collection('quotes').aggregate([
    { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
    { $addFields: { client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] } } },
    { $unset: ['_client', '_id'] },
    { $sort: { issue_date: -1 } },
  ]).toArray();
  return rows.map((q) => enrichQuote(q));
}

dashboardRouter.get('/', async (req, res) => {
  const user = req.user;
  const today = todayISO();
  const weekEnd = addDays(today, 7);
  const projects = await loadProjects(user);
  const tasks = await loadTasks(user);
  const quotes = await loadQuotes(user);
  const clients = await collection('clients')
    .find(await visibleClientFilter(user), { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();
  const activeStatuses = ['cadrage', 'en_cours', 'en_attente'];
  const activeProjects = projects.filter((p) => activeStatuses.includes(p.status));
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const upcomingDeliveries = activeProjects.filter((p) => p.due_date && p.due_date >= today && p.due_date <= weekEnd);
  const lateDeliveries = activeProjects.filter((p) => p.due_date && p.due_date < today);
  const pendingQuotes = quotes.filter((q) => q.effective_status === 'sent');

  const priorityRank = (p) => ({ urgent: 0, high: 1, medium: 2, low: 3 }[p] ?? 4);
  const todaysTasks = openTasks
    .filter((t) => t.due_date && t.due_date <= today)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 6);

  const clientIds = await visibleClientIds(user);
  const clientTimelineScope = clientIds ? { client_id: { $in: clientIds } } : {};
  const meetings = await collection('timeline').aggregate([
    { $match: { type: { $in: ['meeting', 'call'] }, date: { $gte: today }, ...clientTimelineScope } },
    { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
    { $lookup: { from: 'users', localField: 'author_id', foreignField: 'id', as: '_author' } },
    {
      $addFields: {
        client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] },
        client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
        author_name: { $ifNull: [{ $arrayElemAt: ['$_author.name', 0] }, null] },
      },
    },
    { $unset: ['_client', '_author', '_id'] },
    { $sort: { date: 1 } },
    { $limit: 5 },
  ]).toArray();

  const deadlines = activeProjects
    .filter((p) => p.due_date && p.due_date <= weekEnd)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 5);

  const followUps = clients
    .filter((c) => c.next_action_date && c.next_action_date <= weekEnd && c.status !== 'inactif')
    .sort((a, b) => String(a.next_action_date).localeCompare(String(b.next_action_date)))
    .slice(0, 5);

  const logs = await collection('audit_logs').aggregate([
    ...(user.role === 'EMPLOYEE' ? [{ $match: { actor_id: user.id } }] : []),
    { $lookup: { from: 'users', localField: 'actor_id', foreignField: 'id', as: '_actor' } },
    {
      $addFields: {
        actor_name: { $ifNull: [{ $arrayElemAt: ['$_actor.name', 0] }, null] },
        actor_color: { $ifNull: [{ $arrayElemAt: ['$_actor.avatar_color', 0] }, null] },
      },
    },
    { $unset: ['_actor', '_id'] },
    { $sort: { created_at: -1 } },
    { $limit: 8 },
  ]).toArray();

  const months = buildMonths(6);

  const projectsEvolution = months.map((m) => {
    const created = projects.filter((p) => (p.created_at || '').slice(0, 7) === m.key).length;
    const delivered = projects.filter((p) => p.status === 'termine' && (p.updated_at || '').slice(0, 7) === m.key).length;
    return { name: m.label, créés: created, livrés: delivered };
  });

  const taskStatusCounts = { todo: 0, in_progress: 0, waiting: 0, done: 0, late: 0 };
  for (const t of tasks) {
    if (t.effective_status === 'late') taskStatusCounts.late += 1;
    else if (taskStatusCounts[t.effective_status] !== undefined) taskStatusCounts[t.effective_status] += 1;
  }
  const tasksByStatus = [
    { key: 'todo', name: 'À faire', value: taskStatusCounts.todo },
    { key: 'in_progress', name: 'En cours', value: taskStatusCounts.in_progress },
    { key: 'waiting', name: 'En attente', value: taskStatusCounts.waiting },
    { key: 'late', name: 'En retard', value: taskStatusCounts.late },
    { key: 'done', name: 'Terminées', value: taskStatusCounts.done },
  ];

  const quotesEvolution = months.map((m) => {
    const issued = quotes.filter((q) => (q.issue_date || '').slice(0, 7) === m.key && q.status !== 'draft');
    const accepted = issued.filter((q) => q.status === 'accepted');
    return {
      name: m.label,
      envoyés: issued.length,
      acceptés: accepted.length,
      montant: Math.round(accepted.reduce((s, q) => s + q.totals.base, 0) / 1000),
    };
  });

  const completed = projects.filter((p) => p.status === 'termine');
  const deliveryPerformance = months.map((m) => {
    const delivered = completed.filter((p) => (p.updated_at || '').slice(0, 7) === m.key);
    const onTime = delivered.filter((p) => !p.due_date || (p.updated_at || '').slice(0, 10) <= p.due_date).length;
    return { name: m.label, livrés: delivered.length, 'dans les délais': onTime };
  });

  const deliveryBuckets = { overdue: 0, today: 0, tomorrow: 0, d3: 0, d7: 0 };
  for (const p of activeProjects) {
    if (!p.due_date) continue;
    const d = daysUntil(p.due_date);
    if (d < 0) deliveryBuckets.overdue += 1;
    else if (d === 0) deliveryBuckets.today += 1;
    else if (d === 1) deliveryBuckets.tomorrow += 1;
    else if (d <= 3) deliveryBuckets.d3 += 1;
    else if (d <= 7) deliveryBuckets.d7 += 1;
  }

  const team = await collection('users').aggregate([
    { $match: { active: 1 } },
    {
      $project: {
        _id: 0, id: 1, name: 1, role: 1, job_title: 1, avatar_color: 1,
      },
    },
    { $lookup: { from: 'tasks', localField: 'id', foreignField: 'assignee_id', as: '_tasks' } },
    {
      $addFields: {
        open_tasks: {
          $size: { $filter: { input: '$_tasks', as: 't', cond: { $ne: ['$$t.status', 'done'] } } },
        },
      },
    },
    { $unset: ['_tasks'] },
    { $sort: { name: 1 } },
  ]).toArray();

  res.json({
    data: {
      kpis: {
        clients: clients.length,
        prospects: clients.filter((c) => c.status === 'prospect').length,
        activeProjects: activeProjects.length,
        tasksInProgress: tasks.filter((t) => t.status === 'in_progress').length,
        openTasks: openTasks.length,
        upcomingDeliveries: upcomingDeliveries.length,
        lateDeliveries: lateDeliveries.length,
        pendingQuotes: pendingQuotes.length,
        pendingQuotesValue: Math.round(pendingQuotes.reduce((s, q) => s + q.totals.total, 0)),
        lateTasks: tasks.filter((t) => t.effective_status === 'late').length,
      },
      today: { tasks: todaysTasks, meetings, deadlines, followUps },
      projects: activeProjects.slice(0, 6),
      activity: logs,
      charts: { projectsEvolution, tasksByStatus, quotesEvolution, deliveryPerformance },
      deliveries: deliveryBuckets,
      team,
      meta: { generatedAt: new Date().toISOString(), role: user.role },
    },
  });
});

export { MONTHS_FR, buildMonths };
