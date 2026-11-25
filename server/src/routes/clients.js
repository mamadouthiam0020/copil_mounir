import { Router } from 'express';
import { z } from 'zod';
import { collection } from '../db.js';
import {
  addTimelineEntry, asString, enrichProject, enrichQuote, enrichTask, HttpError, logAudit, NO_ID,
  nowISO, parseDataUri, parsePagination, searchRegex, todayISO, uid,
} from '../utils.js';
import { authorize } from '../auth.js';
import { accessibleProjectIds, canAccessClient, canWriteClient, visibleClientFilter } from '../access.js';

const meta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

export const clientsRouter = Router();
export const documentsRouter = Router();

const optionalString = z.string().trim().optional().nullable();

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.'),
  company: optionalString,
  contact_name: optionalString,
  email: z.union([z.string().trim().email('Adresse e-mail invalide.'), z.literal(''), z.null()]).optional(),
  phone: optionalString,
  address: optionalString,
  city: optionalString,
  sector: optionalString,
  status: z.enum(['prospect', 'actif', 'inactif']).default('actif'),
  owner_id: optionalString,
  notes: optionalString,
  next_action: optionalString,
  next_action_date: optionalString,
  next_action_owner: optionalString,
  next_priority: z.enum(['Faible', 'Moyen', 'Élevé', 'Urgent']).optional().nullable(),
});

const timelineSchema = z.object({
  type: z.enum(['call', 'meeting', 'email', 'note', 'document', 'project']).default('note'),
  title: z.string().trim().min(2, 'Un intitulé est requis.'),
  content: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  author_id: optionalString,
});

const CLIENT_FIELDS = ['name', 'company', 'contact_name', 'email', 'phone', 'address', 'city', 'sector', 'status',
  'owner_id', 'notes', 'next_action', 'next_action_date', 'next_action_owner', 'next_priority'];

/** Enrichit un client avec son propriétaire et les compteurs liés. */
const CLIENT_ENRICH = [
  { $lookup: { from: 'users', localField: 'owner_id', foreignField: 'id', as: '_owner' } },
  { $lookup: { from: 'projects', localField: 'id', foreignField: 'client_id', as: '_projects' } },
  { $lookup: { from: 'tasks', localField: 'id', foreignField: 'client_id', as: '_tasks' } },
  { $lookup: { from: 'quotes', localField: 'id', foreignField: 'client_id', as: '_quotes' } },
  {
    $addFields: {
      owner_name: { $ifNull: [{ $arrayElemAt: ['$_owner.name', 0] }, null] },
      project_count: { $size: '$_projects' },
      open_task_count: {
        $size: {
          $filter: { input: '$_tasks', as: 't', cond: { $ne: ['$$t.status', 'done'] } },
        },
      },
      quote_count: { $size: '$_quotes' },
    },
  },
  { $unset: ['_owner', '_projects', '_tasks', '_quotes', '_id'] },
];

async function findClient(id) {
  const [client] = await collection('clients').aggregate([{ $match: { id } }, ...CLIENT_ENRICH]).toArray();
  return client;
}

clientsRouter.get('/', async (req, res) => {
  const q = asString(req.query.q);
  const status = asString(req.query.status);
  const ownerId = asString(req.query.ownerId);
  const sortParam = asString(req.query.sort);
  const { page, limit, offset } = parsePagination(req.query, 20);
  const filter = { ...(await visibleClientFilter(req.user)) };
  if (q) {
    const rx = searchRegex(q);
    filter.$or = ['name', 'company', 'contact_name', 'email', 'phone', 'sector'].map((field) => ({ [field]: rx }));
  }
  if (status) filter.status = status;
  if (ownerId) filter.owner_id = ownerId;

  const sort = sortParam === 'name' ? { name: 1 } : { updated_at: -1 };
  const rows = await collection('clients').aggregate(
    [{ $match: filter }, ...CLIENT_ENRICH, { $sort: sort }, { $skip: offset }, { $limit: limit }],
    { collation: { locale: 'fr', strength: 2 } },
  ).toArray();
  const total = await collection('clients').countDocuments(filter);
  res.json({
    data: rows,
    meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

clientsRouter.get('/:id', async (req, res) => {
  const client = await findClient(req.params.id);
  if (!client) throw new HttpError(404, 'Client introuvable.');
  if (!await canAccessClient(req.user, req.params.id)) {
    throw new HttpError(403, 'Accès non autorisé à cette fiche client.');
  }

  const isEmployee = req.user.role === 'EMPLOYEE';
  const projectIds = isEmployee ? await accessibleProjectIds(req.user) : null;
  const projectScope = projectIds ? { id: { $in: projectIds } } : {};
  const projects = (await collection('projects').aggregate([
    { $match: { client_id: req.params.id, ...projectScope } },
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
    { $sort: { due_date: 1 } },
  ]).toArray()).map(enrichProject);

  const quotes = isEmployee ? [] : (await collection('quotes').aggregate([
    { $match: { client_id: req.params.id } },
    { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
    { $addFields: { client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] } } },
    { $unset: ['_client', '_id'] },
    { $sort: { issue_date: -1 } },
  ]).toArray()).map(enrichQuote);

  const timeline = await collection('timeline').aggregate([
    { $match: { client_id: req.params.id } },
    { $lookup: { from: 'users', localField: 'author_id', foreignField: 'id', as: '_author' } },
    { $addFields: { author_name: { $ifNull: [{ $arrayElemAt: ['$_author.name', 0] }, null] } } },
    { $unset: ['_author', '_id'] },
    { $sort: { date: -1, created_at: -1 } },
  ]).toArray();

  const documents = await collection('documents')
    .find({ client_id: req.params.id }, { projection: { _id: 0, data: 0 } })
    .sort({ created_at: -1 })
    .toArray();

  const tasks = (await collection('tasks').aggregate([
    { $match: { client_id: req.params.id, ...(isEmployee ? { assignee_id: req.user.id } : {}) } },
    { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
    { $lookup: { from: 'projects', localField: 'project_id', foreignField: 'id', as: '_project' } },
    { $lookup: { from: 'users', localField: 'assignee_id', foreignField: 'id', as: '_assignee' } },
    {
      $addFields: {
        client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
        project_name: { $ifNull: [{ $arrayElemAt: ['$_project.name', 0] }, null] },
        assignee_name: { $ifNull: [{ $arrayElemAt: ['$_assignee.name', 0] }, null] },
        assignee_color: { $ifNull: [{ $arrayElemAt: ['$_assignee.avatar_color', 0] }, null] },
      },
    },
    { $unset: ['_client', '_project', '_assignee', '_id'] },
    { $sort: { due_date: 1 } },
  ]).toArray()).map(enrichTask);

  res.json({ data: { client, projects, quotes, timeline, documents, tasks } });
});

clientsRouter.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const body = clientSchema.parse(req.body);
  const id = uid('cli');
  const now = nowISO();
  await collection('clients').insertOne({
    id,
    name: body.name,
    company: body.company ?? null,
    contact_name: body.contact_name ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    sector: body.sector ?? null,
    status: body.status,
    owner_id: body.owner_id ?? null,
    notes: body.notes ?? null,
    next_action: body.next_action ?? null,
    next_action_date: body.next_action_date ?? null,
    next_action_owner: body.next_action_owner ?? null,
    next_priority: body.next_priority ?? 'Moyen',
    created_at: now,
    updated_at: now,
  });
  await logAudit(req.user, 'client.created', 'client', id, body.company || body.name, 'Nouveau client enregistré');
  res.status(201).json({ data: await findClient(id) });
});

clientsRouter.put('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const existing = await collection('clients').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Client introuvable.');
  const body = clientSchema.partial().parse(req.body);
  const updates = {};
  for (const field of CLIENT_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] ?? null;
  }
  if (!Object.keys(updates).length) throw new HttpError(400, 'Aucune modification transmise.');
  updates.updated_at = nowISO();
  await collection('clients').updateOne({ id: req.params.id }, { $set: updates });
  await logAudit(req.user, 'client.updated', 'client', req.params.id, body.name || existing.name, 'Fiche client mise à jour');
  res.json({ data: await findClient(req.params.id) });
});

clientsRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const existing = await collection('clients').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Client introuvable.');
  await Promise.all([
    collection('timeline').deleteMany({ client_id: req.params.id }),
    collection('documents').deleteMany({ client_id: req.params.id }),
    collection('tasks').updateMany({ client_id: req.params.id }, { $set: { client_id: null } }),
    collection('projects').updateMany({ client_id: req.params.id }, { $set: { client_id: null } }),
    collection('quotes').updateMany({ client_id: req.params.id }, { $set: { client_id: null } }),
  ]);
  await collection('clients').deleteOne({ id: req.params.id });
  await logAudit(req.user, 'client.deleted', 'client', req.params.id, existing.name, 'Fiche client supprimée');
  res.json({ ok: true });
});

clientsRouter.post('/:id/timeline', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const client = await collection('clients').findOne({ id: req.params.id }, { projection: { _id: 0, id: 1, name: 1 } });
  if (!client) throw new HttpError(404, 'Client introuvable.');
  const body = timelineSchema.parse(req.body);
  const id = uid('tl');
  await collection('timeline').insertOne({
    id,
    client_id: client.id,
    type: body.type,
    title: body.title,
    content: body.content ?? null,
    date: body.date || todayISO(),
    author_id: req.user.id,
    created_at: nowISO(),
  });
  await logAudit(req.user, 'client.interaction', 'client', client.id, client.name, `Échange ajouté : ${body.title}`);
  const [entry] = await collection('timeline').aggregate([
    { $match: { id } },
    { $lookup: { from: 'users', localField: 'author_id', foreignField: 'id', as: '_author' } },
    { $addFields: { author_name: { $ifNull: [{ $arrayElemAt: ['$_author.name', 0] }, null] } } },
    { $unset: ['_author', '_id'] },
  ]).toArray();
  res.status(201).json({ data: entry });
});

clientsRouter.delete('/timeline/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const entry = await collection('timeline').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!entry) throw new HttpError(404, 'Échange introuvable.');
  await collection('timeline').deleteOne({ id: req.params.id });
  res.json({ ok: true });
});

clientsRouter.post('/:id/documents', async (req, res) => {
  const client = await collection('clients').findOne({ id: req.params.id }, { projection: { _id: 0, id: 1, name: 1 } });
  if (!client) throw new HttpError(404, 'Client introuvable.');
  if (!await canWriteClient(req.user, client.id)) {
    throw new HttpError(403, 'Accès non autorisé à ce dossier client.');
  }
  const schema = z.object({
    name: z.string().trim().min(1).max(255),
    mime: z.string().trim().max(120).optional().nullable(),
    size: z.number().int().min(0).max(6_000_000).optional().nullable(),
    data: z.string().optional().nullable(),
  });
  const body = schema.parse(req.body);
  const parsed = body.data ? parseDataUri(body.data, { maxBytes: 6_000_000 }) : null;
  const id = uid('doc');
  await collection('documents').insertOne({
    id,
    client_id: client.id,
    name: body.name,
    mime: parsed?.mime ?? body.mime ?? null,
    size: parsed?.buffer.length ?? body.size ?? 0,
    data: parsed?.data ?? null,
    uploaded_by: req.user.id,
    created_at: nowISO(),
  });
  await logAudit(req.user, 'document.uploaded', 'document', id, body.name, `Document ajouté au dossier ${client.name}`, meta(req));
  await addTimelineEntry(client.id, 'document', 'Document ajouté', body.name, req.user.id, todayISO());
  const doc = await collection('documents').findOne({ id }, { projection: { _id: 0, data: 0 } });
  res.status(201).json({ data: doc });
});

clientsRouter.delete('/documents/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const doc = await collection('documents').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!doc) throw new HttpError(404, 'Document introuvable.');
  await collection('documents').deleteOne({ id: req.params.id });
  await logAudit(req.user, 'document.deleted', 'document', doc.id, doc.name, 'Document supprimé');
  res.json({ ok: true });
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await collection('documents').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!doc) throw new HttpError(404, 'Document introuvable.');
  if (!await canAccessClient(req.user, doc.client_id)) {
    throw new HttpError(403, 'Accès non autorisé à ce document.');
  }
  await logAudit(req.user, 'document.downloaded', 'document', doc.id, doc.name, 'Téléchargement de document', meta(req));
  if (!doc.data) {
    const { data, ...safe } = doc;
    return res.json({ data: safe });
  }
  return res.json({ data: doc });
});
