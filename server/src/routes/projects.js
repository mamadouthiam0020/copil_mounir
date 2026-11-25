import { Router } from 'express';
import { z } from 'zod';
import { collection } from '../db.js';
import {
  addTimelineEntry, asString, enrichProject, enrichTask, HttpError, logAudit, NO_ID,
  nowISO, parsePagination, searchRegex, todayISO, uid,
} from '../utils.js';
import { authorize } from '../auth.js';
import { canAccessProject } from '../access.js';

const meta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

export const projectsRouter = Router();

const projectSchema = z.object({
  name: z.string().trim().min(2, 'Le nom du projet est requis.'),
  code: z.string().trim().optional().nullable(),
  client_id: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  needs: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  budget: z.coerce.number().min(0).default(0),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  manager_id: z.string().optional().nullable(),
  status: z.enum(['cadrage', 'en_cours', 'en_attente', 'termine', 'annule']).default('cadrage'),
  progress: z.coerce.number().min(0).max(100).default(0),
  quote_id: z.string().optional().nullable(),
}).refine((data) => !data.start_date || !data.due_date || data.due_date >= data.start_date, {
  message: 'La date de livraison doit être postérieure à la date de début.',
  path: ['due_date'],
});

const PROJECT_FIELDS = ['name', 'code', 'client_id', 'description', 'needs', 'objectives', 'budget', 'start_date',
  'due_date', 'manager_id', 'status', 'progress', 'quote_id'];

const PROJECT_ENRICH = [
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

const mapProject = (row) => enrichProject(row);

async function findProject(id) {
  const [project] = await collection('projects').aggregate([
    { $match: { id } },
    ...PROJECT_ENRICH,
  ]).toArray();
  return project;
}

async function employeeProjectIds(userId) {
  const ids = await collection('tasks').distinct('project_id', { assignee_id: userId, project_id: { $ne: null } });
  return ids.filter(Boolean);
}

projectsRouter.get('/', async (req, res) => {
  const q = asString(req.query.q);
  const status = asString(req.query.status);
  const clientId = asString(req.query.clientId);
  const managerId = asString(req.query.managerId);
  const from = asString(req.query.from);
  const to = asString(req.query.to);
  const health = asString(req.query.health);
  const sort = asString(req.query.sort);
  const { page, limit, offset } = parsePagination(req.query, 100);

  const filter = {};
  if (req.user.role === 'EMPLOYEE') {
    const ids = await employeeProjectIds(req.user.id);
    filter.$or = [{ manager_id: req.user.id }, { id: { $in: ids } }];
  }
  if (status) filter.status = { $in: status.split(',').filter(Boolean) };
  if (clientId) filter.client_id = clientId;
  if (managerId) filter.manager_id = managerId;
  if (from || to) {
    filter.due_date = {};
    if (from) filter.due_date.$gte = from;
    if (to) filter.due_date.$lte = to;
  }

  const pipeline = [{ $match: filter }, ...PROJECT_ENRICH];
  if (q) {
    const rx = searchRegex(q);
    pipeline.push({
      $match: {
        $or: [{ name: rx }, { code: rx }, { client_company: rx }, { client_name: rx }],
      },
    });
  }

  if (sort === 'created') {
    pipeline.push({ $sort: { created_at: -1 } });
  } else {
    pipeline.push({ $addFields: { _dueSort: { $ifNull: ['$due_date', '9999-12-31'] } } });
    pipeline.push({ $sort: { _dueSort: 1 } });
    pipeline.push({ $unset: ['_dueSort'] });
  }

  pipeline.push({
    $facet: {
      rows: [{ $skip: offset }, { $limit: limit }],
      total: [{ $count: 'n' }],
    },
  });

  const [facet] = await collection('projects').aggregate(pipeline).toArray();
  let rows = (facet?.rows ?? []).map(mapProject);
  if (health) rows = rows.filter((p) => p.health === health);
  const total = facet?.total?.[0]?.n ?? 0;

  res.json({ data: rows, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } });
});

projectsRouter.get('/:id', async (req, res) => {
  const row = await findProject(req.params.id);
  if (!row) throw new HttpError(404, 'Projet introuvable.');
  if (!await canAccessProject(req.user, req.params.id)) {
    throw new HttpError(403, 'Accès non autorisé à ce programme.');
  }
  const tasks = (await collection('tasks').aggregate([
    {
      $match: {
        project_id: req.params.id,
        ...(req.user.role === 'EMPLOYEE' ? { assignee_id: req.user.id } : {}),
      },
    },
    { $lookup: { from: 'users', localField: 'assignee_id', foreignField: 'id', as: '_assignee' } },
    { $addFields: { assignee_name: { $ifNull: [{ $arrayElemAt: ['$_assignee.name', 0] }, null] } } },
    { $unset: ['_assignee', '_id'] },
    { $sort: { due_date: 1 } },
  ]).toArray()).map(enrichTask);
  res.json({ data: { ...mapProject(row), tasks } });
});

projectsRouter.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const body = projectSchema.parse(req.body);
  const id = uid('prj');
  const now = nowISO();
  let code = body.code;
  if (!code) {
    const count = await collection('projects').countDocuments();
    code = `PRJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
  }
  await collection('projects').insertOne({
    id,
    name: body.name,
    code,
    client_id: body.client_id ?? null,
    description: body.description ?? null,
    needs: body.needs ?? null,
    objectives: body.objectives ?? null,
    budget: body.budget,
    start_date: body.start_date ?? null,
    due_date: body.due_date ?? null,
    manager_id: body.manager_id ?? req.user.id,
    status: body.status,
    progress: body.progress,
    comments: [],
    date_history: [],
    quote_id: body.quote_id ?? null,
    created_at: now,
    updated_at: now,
  });
  const project = await findProject(id);
  await logAudit(req.user, 'project.created', 'project', id, body.name, 'Nouveau programme créé');
  if (body.client_id) {
    await addTimelineEntry(body.client_id, 'project', 'Nouveau programme', `${body.name} — ${body.objectives || 'Programme initié'}`, req.user.id, todayISO());
  }
  res.status(201).json({ data: mapProject(project) });
});

projectsRouter.put('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const existing = await collection('projects').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Projet introuvable.');
  const body = projectSchema.partial().parse(req.body);

  const updates = {};
  for (const field of PROJECT_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] ?? null;
  }
  if (!Object.keys(updates).length) throw new HttpError(400, 'Aucune modification transmise.');

  const nextStatus = body.status ?? existing.status;
  if (nextStatus === 'termine' && updates.progress === undefined) updates.progress = 100;

  const dateChanged = (body.start_date !== undefined && body.start_date !== existing.start_date)
    || (body.due_date !== undefined && body.due_date !== existing.due_date);
  if (dateChanged) {
    const history = Array.isArray(existing.date_history) ? existing.date_history : [];
    history.push({
      id: uid('ph'),
      at: nowISO(),
      by: req.user.id,
      by_name: req.user.name,
      from_start: existing.start_date,
      from_due: existing.due_date,
      to_start: body.start_date ?? existing.start_date,
      to_due: body.due_date ?? existing.due_date,
    });
    updates.date_history = history;
  }

  updates.updated_at = nowISO();
  await collection('projects').updateOne({ id: req.params.id }, { $set: updates });

  if (dateChanged) {
    await logAudit(req.user, 'project.rescheduled', 'project', req.params.id, existing.name,
      `Échéance déplacée du ${existing.due_date || '—'} au ${body.due_date ?? existing.due_date}`);
  }
  if (nextStatus === 'termine' && existing.status !== 'termine') {
    await logAudit(req.user, 'project.delivered', 'project', req.params.id, existing.name, 'Projet livré et clôturé');
    if (existing.client_id) {
      await addTimelineEntry(existing.client_id, 'project', 'Projet livré', `${existing.name} a été livré.`, req.user.id, todayISO());
    }
  } else {
    await logAudit(req.user, 'project.updated', 'project', req.params.id, body.name || existing.name, 'Programme mis à jour');
  }
  res.json({ data: mapProject(await findProject(req.params.id)) });
});

projectsRouter.post('/:id/comments', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const project = await collection('projects').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!project) throw new HttpError(404, 'Projet introuvable.');
  const body = z.object({ text: z.string().trim().min(1, 'Le commentaire est vide.') }).parse(req.body);
  const comment = { id: uid('pc'), at: nowISO(), author_id: req.user.id, author_name: req.user.name, text: body.text };
  await collection('projects').updateOne(
    { id: project.id },
    { $push: { comments: comment }, $set: { updated_at: nowISO() } },
  );
  await logAudit(req.user, 'project.comment', 'project', project.id, project.name, 'Commentaire ajouté');
  res.status(201).json({ data: comment });
});

projectsRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const project = await collection('projects').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!project) throw new HttpError(404, 'Projet introuvable.');
  await collection('tasks').updateMany({ project_id: req.params.id }, { $set: { project_id: null } });
  await collection('projects').deleteOne({ id: req.params.id });
  await logAudit(req.user, 'project.deleted', 'project', req.params.id, project.name, 'Projet supprimé');
  res.json({ ok: true });
});
