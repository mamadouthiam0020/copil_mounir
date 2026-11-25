import { Router } from 'express';
import { z } from 'zod';
import { collection } from '../db.js';
import {
  asString, enrichTask, HttpError, logAudit, NO_ID, nowISO, parseDataUri, parsePagination,
  searchRegex, syncProjectProgress, todayISO, uid,
} from '../utils.js';
import { authorize } from '../auth.js';

export const tasksRouter = Router();

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  mime: z.string().optional().nullable(),
  size: z.number().optional().nullable(),
  data: z.string().optional().nullable(),
  uploaded_at: z.string().optional().nullable(),
});

const taskSchema = z.object({
  title: z.string().trim().min(2, 'Le titre de la tâche est requis.'),
  description: z.string().optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'waiting', 'done']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignee_id: z.string().optional().nullable(),
  client_id: z.string().optional().nullable(),
  project_id: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  progress: z.coerce.number().min(0).max(100).default(0),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

const TASK_FIELDS = ['title', 'description', 'status', 'priority', 'assignee_id', 'client_id', 'project_id',
  'start_date', 'due_date', 'progress', 'attachments'];

const TASK_ENRICH = [
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
      assignee_role: { $ifNull: [{ $arrayElemAt: ['$_assignee.role', 0] }, null] },
    },
  },
  { $unset: ['_client', '_project', '_assignee', '_id'] },
];

const mapTask = (row) => enrichTask(row);

async function findTask(id) {
  const [task] = await collection('tasks').aggregate([{ $match: { id } }, ...TASK_ENRICH]).toArray();
  return task;
}

tasksRouter.get('/', async (req, res) => {
  const q = asString(req.query.q);
  const status = asString(req.query.status);
  const priority = asString(req.query.priority);
  const assigneeId = asString(req.query.assigneeId);
  const clientId = asString(req.query.clientId);
  const projectId = asString(req.query.projectId);
  const mine = asString(req.query.mine);
  const from = asString(req.query.from);
  const to = asString(req.query.to);
  const { page, limit, offset } = parsePagination(req.query, 200);

  const filter = {};
  if (req.user.role === 'EMPLOYEE') {
    filter.assignee_id = req.user.id;
  } else if (mine === '1') {
    filter.assignee_id = req.user.id;
  }
  if (status) {
    if (status === 'late') {
      filter.status = { $ne: 'done' };
      filter.due_date = { $ne: null, $lt: todayISO() };
    } else {
      filter.status = { $in: status.split(',').filter(Boolean) };
    }
  }
  if (priority) filter.priority = { $in: priority.split(',').filter(Boolean) };
  if (assigneeId) filter.assignee_id = assigneeId;
  if (clientId) filter.client_id = clientId;
  if (projectId) filter.project_id = projectId;
  if (from || to) {
    filter.due_date = filter.due_date && typeof filter.due_date === 'object' ? filter.due_date : {};
    if (from) filter.due_date.$gte = from;
    if (to) filter.due_date.$lte = to;
  }

  const pipeline = [{ $match: filter }, ...TASK_ENRICH];
  if (q) {
    const rx = searchRegex(q);
    pipeline.push({
      $match: {
        $or: [
          { title: rx },
          { description: rx },
          { client_company: rx },
          { project_name: rx },
        ],
      },
    });
  }
  pipeline.push({ $addFields: { _dueSort: { $ifNull: ['$due_date', '9999-12-31'] } } });
  pipeline.push({ $sort: { _dueSort: 1, created_at: -1 } });
  pipeline.push({ $unset: ['_dueSort'] });
  pipeline.push({
    $facet: {
      rows: [{ $skip: offset }, { $limit: limit }],
      total: [{ $count: 'n' }],
    },
  });

  const [facet] = await collection('tasks').aggregate(pipeline).toArray();
  const rows = (facet?.rows ?? []).map(mapTask);
  const total = facet?.total?.[0]?.n ?? 0;
  res.json({ data: rows, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } });
});

tasksRouter.get('/:id/attachments', async (req, res) => {
  const task = await collection('tasks').findOne(
    { id: req.params.id },
    { projection: { _id: 0, attachments: 1, assignee_id: 1 } },
  );
  if (!task) throw new HttpError(404, 'Tâche introuvable.');
  if (req.user.role === 'EMPLOYEE' && task.assignee_id !== req.user.id) {
    throw new HttpError(403, 'Accès non autorisé à cette tâche.');
  }
  res.json({ data: task.attachments ?? [] });
});

tasksRouter.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const body = taskSchema.parse(req.body);
  const id = uid('tsk');
  const now = nowISO();
  const progress = body.status === 'done' ? 100 : body.progress;
  await collection('tasks').insertOne({
    id,
    title: body.title,
    description: body.description ?? null,
    status: body.status,
    priority: body.priority,
    assignee_id: body.assignee_id ?? null,
    client_id: body.client_id ?? null,
    project_id: body.project_id ?? null,
    start_date: body.start_date ?? null,
    due_date: body.due_date ?? null,
    progress,
    comments: [],
    attachments: body.attachments ?? [],
    completed_at: body.status === 'done' ? now : null,
    created_at: now,
    updated_at: now,
  });
  await syncProjectProgress(body.project_id);
  await logAudit(req.user, 'task.created', 'task', id, body.title, `Priorité ${body.priority}`);
  res.status(201).json({ data: mapTask(await findTask(id)) });
});

tasksRouter.put('/:id', async (req, res) => {
  const existing = await collection('tasks').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Tâche introuvable.');
  const isEmployee = req.user.role === 'EMPLOYEE';
  if (isEmployee && existing.assignee_id !== req.user.id) {
    throw new HttpError(403, 'Vous ne pouvez modifier que les tâches qui vous sont attribuées.');
  }
  const body = taskSchema.partial().parse(req.body);
  const allowed = isEmployee ? ['status', 'progress', 'attachments'] : TASK_FIELDS;

  if (body.attachments) {
    for (const att of body.attachments) {
      if (!att?.name) throw new HttpError(400, 'Pièce jointe invalide.');
      if (!att.data) continue; // conservation d'une pièce jointe existante
      const parsed = parseDataUri(att.data, { maxBytes: 3_000_000 });
      att.data = parsed.data;
      att.mime = parsed.mime;
      att.size = parsed.buffer.length;
    }
  }

  const updates = {};
  for (const field of allowed) {
    if (body[field] !== undefined) updates[field] = body[field] ?? null;
  }
  if (!Object.keys(updates).length) throw new HttpError(400, 'Aucune modification transmise.');

  const nextStatus = body.status ?? existing.status;
  if (nextStatus === 'done') {
    if (updates.progress === undefined) updates.progress = 100;
    updates.completed_at = nowISO();
  } else if (body.status && existing.status === 'done') {
    updates.completed_at = null;
  }
  updates.updated_at = nowISO();
  await collection('tasks').updateOne({ id: req.params.id }, { $set: updates });

  await syncProjectProgress(existing.project_id);
  if (body.project_id !== undefined && body.project_id !== existing.project_id) {
    await syncProjectProgress(body.project_id);
  }

  if (nextStatus === 'done' && existing.status !== 'done') {
    await logAudit(req.user, 'task.completed', 'task', existing.id, body.title || existing.title, 'Tâche terminée à 100 %');
  } else {
    await logAudit(req.user, 'task.updated', 'task', existing.id, body.title || existing.title, 'Tâche mise à jour');
  }
  res.json({ data: mapTask(await findTask(req.params.id)) });
});

tasksRouter.post('/:id/comments', async (req, res) => {
  const task = await collection('tasks').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!task) throw new HttpError(404, 'Tâche introuvable.');
  if (req.user.role === 'EMPLOYEE' && task.assignee_id !== req.user.id) {
    throw new HttpError(403, 'Vous ne pouvez commenter que vos tâches.');
  }
  const body = z.object({ text: z.string().trim().min(1, 'Le commentaire est vide.') }).parse(req.body);
  const comment = { id: uid('tc'), at: nowISO(), author_id: req.user.id, author_name: req.user.name, text: body.text };
  await collection('tasks').updateOne(
    { id: task.id },
    { $push: { comments: comment }, $set: { updated_at: nowISO() } },
  );
  await logAudit(req.user, 'task.comment', 'task', task.id, task.title, 'Commentaire ajouté');
  res.status(201).json({ data: comment });
});

tasksRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const task = await collection('tasks').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!task) throw new HttpError(404, 'Tâche introuvable.');
  await collection('tasks').deleteOne({ id: req.params.id });
  await syncProjectProgress(task.project_id);
  await logAudit(req.user, 'task.deleted', 'task', task.id, task.title, 'Tâche supprimée');
  res.json({ ok: true });
});
