import { Router } from 'express';
import { collection } from '../db.js';
import { buildMonths, loadProjects, loadTasks, loadQuotes } from './dashboard.js';
import { todayISO } from '../utils.js';

export const reportsRouter = Router();

reportsRouter.get('/', async (req, res) => {
  const period = Math.min(12, Math.max(3, Number(req.query.period) || 6));
  const months = buildMonths(period);
  const projects = await loadProjects(req.user);
  const tasks = await loadTasks(req.user);
  const quotes = await loadQuotes(req.user);
  const clients = await collection('clients').find({}, { projection: { _id: 0 } }).toArray();
  const users = await collection('users')
    .find({ active: 1 }, { projection: { _id: 0, id: 1, name: 1, role: 1, job_title: 1, avatar_color: 1 } })
    .toArray();

  const accepted = quotes.filter((q) => q.status === 'accepted');
  const issued = quotes.filter((q) => q.status !== 'draft');
  const decided = quotes.filter((q) => ['accepted', 'refused'].includes(q.status));
  const pipeline = projects.filter((p) => ['cadrage', 'en_cours', 'en_attente'].includes(p.status));
  const completed = projects.filter((p) => p.status === 'termine');

  const monthlyRevenue = months.map((m) => {
    const rows = accepted.filter((q) => (q.issue_date || '').slice(0, 7) === m.key);
    return {
      name: m.label,
      ht: Math.round(rows.reduce((s, q) => s + q.totals.base, 0)),
      ttc: Math.round(rows.reduce((s, q) => s + q.totals.total, 0)),
      devis: rows.length,
    };
  });

  const monthlyTasks = months.map((m) => ({
    name: m.label,
    créées: tasks.filter((t) => (t.created_at || '').slice(0, 7) === m.key).length,
    terminées: tasks.filter((t) => t.status === 'done' && (t.completed_at || t.updated_at || '').slice(0, 7) === m.key).length,
  }));

  const sectorMap = new Map();
  for (const c of clients) {
    const sector = c.sector || 'Non renseigné';
    const entry = sectorMap.get(sector) || { name: sector, value: 0 };
    entry.value += 1;
    sectorMap.set(sector, entry);
  }

  const workload = users.map((u) => {
    const mine = tasks.filter((t) => t.assignee_id === u.id && t.status !== 'done');
    return {
      ...u,
      open: mine.length,
      urgent: mine.filter((t) => t.priority === 'urgent' || t.priority === 'high').length,
      late: mine.filter((t) => t.is_late).length,
      projects: projects.filter((p) => p.manager_id === u.id && !['termine', 'annule'].includes(p.status)).length,
    };
  }).sort((a, b) => b.open - a.open);

  const delays = completed
    .filter((p) => p.due_date && p.updated_at)
    .map((p) => Math.round((new Date(p.updated_at.slice(0, 10)) - new Date(p.due_date)) / 86400000));
  const onTime = delays.filter((d) => d <= 0).length;

  const clientTotals = new Map();
  for (const p of projects) {
    const key = p.client_id || 'none';
    const entry = clientTotals.get(key) || {
      name: p.client_company || p.client_name || 'Sans client',
      projects: 0,
      budget: 0,
      active: 0,
    };
    entry.projects += 1;
    entry.budget += Number(p.budget) || 0;
    if (['cadrage', 'en_cours', 'en_attente'].includes(p.status)) entry.active += 1;
    clientTotals.set(key, entry);
  }

  const projectStatusLabels = {
    cadrage: 'Cadrage', en_cours: 'En cours', en_attente: 'En attente', termine: 'Terminé', annule: 'Annulé',
  };
  const quoteStatusLabels = {
    draft: 'Brouillon', sent: 'Envoyé', accepted: 'Accepté', refused: 'Refusé', expired: 'Expiré',
  };

  const projectsByStatus = Object.entries(projectStatusLabels).map(([key, name]) => ({
    name,
    value: projects.filter((p) => p.status === key).length,
  }));

  const quotesByStatus = Object.entries(quoteStatusLabels).map(([key, name]) => ({
    name,
    value: quotes.filter((q) => q.effective_status === key).length,
  }));

  res.json({
    data: {
      period,
      summary: {
        revenue: Math.round(accepted.reduce((s, q) => s + q.totals.base, 0)),
        pipelineValue: Math.round(pipeline.reduce((s, p) => s + Number(p.budget || 0), 0)),
        conversionRate: decided.length ? Math.round((decided.filter((q) => q.status === 'accepted').length / decided.length) * 100) : 0,
        activeProjects: pipeline.length,
        completedProjects: completed.length,
        onTimeRate: delays.length ? Math.round((onTime / delays.length) * 100) : 100,
        avgDelay: delays.length ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0,
        taskCompletion: tasks.length ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100) : 0,
        avgBudget: projects.length ? Math.round(projects.reduce((s, p) => s + Number(p.budget || 0), 0) / projects.length) : 0,
        outstandingQuotes: issued.filter((q) => q.effective_status === 'sent').length,
        outstandingValue: Math.round(issued.filter((q) => q.effective_status === 'sent').reduce((s, q) => s + q.totals.total, 0)),
      },
      monthlyRevenue,
      monthlyTasks,
      clientsBySector: Array.from(sectorMap.values()).sort((a, b) => b.value - a.value),
      workload,
      projectsByStatus,
      quotesByStatus,
      topClients: Array.from(clientTotals.values()).sort((a, b) => b.budget - a.budget).slice(0, 6),
      delivery: {
        completed: completed.length,
        onTime,
        late: delays.length - onTime,
        onTimeRate: delays.length ? Math.round((onTime / delays.length) * 100) : 100,
        avgDelay: delays.length ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0,
      },
      today: todayISO(),
    },
  });
});
