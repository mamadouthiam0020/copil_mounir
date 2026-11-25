import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { collection } from '../db.js';
import { asString, HttpError, logAudit, NO_ID, nowISO, uid } from '../utils.js';
import { authorize, USER_FIELDS } from '../auth.js';

export const usersRouter = Router();

const USER_PUBLIC = USER_FIELDS;
const USER_DIRECTORY = {
  _id: 0, id: 1, name: 1, role: 1, job_title: 1, avatar_color: 1,
};
const meta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

const USER_ENRICH = [
  { $lookup: { from: 'tasks', localField: 'id', foreignField: 'assignee_id', as: '_tasks' } },
  { $lookup: { from: 'projects', localField: 'id', foreignField: 'manager_id', as: '_projects' } },
  { $lookup: { from: 'clients', localField: 'id', foreignField: 'owner_id', as: '_clients' } },
  {
    $addFields: {
      open_tasks: {
        $size: { $filter: { input: '$_tasks', as: 't', cond: { $ne: ['$$t.status', 'done'] } } },
      },
      done_tasks: {
        $size: { $filter: { input: '$_tasks', as: 't', cond: { $eq: ['$$t.status', 'done'] } } },
      },
      active_projects: {
        $size: {
          $filter: {
            input: '$_projects',
            as: 'p',
            cond: { $not: [{ $in: ['$$p.status', ['termine', 'annule']] }] },
          },
        },
      },
      clients_count: { $size: '$_clients' },
      _roleOrder: {
        $switch: {
          branches: [
            { case: { $eq: ['$role', 'SUPER_ADMIN'] }, then: 0 },
            { case: { $eq: ['$role', 'ADMIN'] }, then: 1 },
            { case: { $eq: ['$role', 'MANAGER'] }, then: 2 },
          ],
          default: 3,
        },
      },
    },
  },
  { $unset: ['_tasks', '_projects', '_clients', '_id'] },
];

const USER_STATS = [
  { $project: USER_PUBLIC },
  ...USER_ENRICH,
  { $sort: { _roleOrder: 1, name: 1 } },
  { $unset: ['_roleOrder'] },
];

async function findUserStats(id) {
  const [user] = await collection('users').aggregate([{ $match: { id } }, ...USER_STATS]).toArray();
  return user;
}

usersRouter.get('/', async (req, res) => {
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(req.user.role);
  const all = asString(req.query.all);
  const includeInactive = all === '1' && isAdmin;
  const filter = includeInactive ? {} : { active: 1 };

  // Les rôles non administrateurs disposent d'un annuaire minimal :
  // aucun e-mail, téléphone, date de création ni statistique d'activité.
  const pipeline = isAdmin
    ? [{ $match: filter }, ...USER_STATS]
    : [{ $match: filter }, { $project: USER_DIRECTORY }, { $sort: { name: 1 } }];
  const rows = await collection('users').aggregate(
    pipeline,
    { collation: { locale: 'fr', strength: 2 } },
  ).toArray();
  res.json({ data: rows });
});

usersRouter.post('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Le nom est requis.'),
    email: z.string().trim().email('Adresse e-mail invalide.'),
    password: z.string().min(12, 'Le mot de passe doit contenir au moins 12 caractères.').max(200),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
    job_title: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    avatar_color: z.string().optional().nullable(),
  });
  const body = schema.parse(req.body);
  if (body.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Seul un Super Admin peut créer un Super Admin.');
  }
  const email = body.email.toLowerCase();
  if (await collection('users').findOne({ email }, { projection: { _id: 1 } })) {
    throw new HttpError(409, 'Un utilisateur utilise déjà cette adresse e-mail.');
  }
  const id = uid('usr');
  await collection('users').insertOne({
    id,
    name: body.name,
    email,
    password_hash: await bcrypt.hash(body.password, 12),
    role: body.role,
    job_title: body.job_title ?? null,
    phone: body.phone ?? null,
    avatar_color: body.avatar_color ?? '#0B2A5B',
    active: 1,
    token_version: 0,
    created_at: nowISO(),
  });
  await logAudit(req.user, 'user.created', 'user', id, body.name, `Rôle ${body.role}`, meta(req));
  res.status(201).json({ data: await findUserStats(id) });
});

usersRouter.put('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const existing = await collection('users').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Utilisateur introuvable.');
  if (existing.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Seul un Super Admin peut modifier un Super Admin.');
  }
  const schema = z.object({
    name: z.string().trim().min(2).optional(),
    email: z.string().trim().email('Adresse e-mail invalide.').optional(),
    password: z.string().min(12, 'Le mot de passe doit contenir au moins 12 caractères.').max(200).optional().or(z.literal('')),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    job_title: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    avatar_color: z.string().optional().nullable(),
    active: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  });
  const body = schema.parse(req.body);
  // Le stockage Mongo conserve la représentation historique 1 / 0.
  if (body.active !== undefined) body.active = body.active === true || body.active === 1 ? 1 : 0;
  if (body.role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    throw new HttpError(403, 'Seul un Super Admin peut attribuer ce rôle.');
  }
  if (body.email) {
    const email = body.email.toLowerCase();
    if (email !== String(existing.email).toLowerCase()
      && await collection('users').findOne({ email, id: { $ne: existing.id } }, { projection: { _id: 1 } })) {
      throw new HttpError(409, 'Un utilisateur utilise déjà cette adresse e-mail.');
    }
    body.email = email;
  }
  if (body.active === 0 && existing.id === req.user.id) {
    throw new HttpError(400, 'Vous ne pouvez pas désactiver votre propre compte.');
  }

  const updates = {};
  for (const field of ['name', 'email', 'role', 'job_title', 'phone', 'avatar_color', 'active']) {
    if (body[field] !== undefined) updates[field] = body[field] ?? null;
  }
  if (body.password) updates.password_hash = await bcrypt.hash(body.password, 12);
  if (!Object.keys(updates).length) throw new HttpError(400, 'Aucune modification transmise.');

  const securityChange = Boolean(
    body.password || body.role !== undefined || body.active !== undefined || body.email,
  );
  await collection('users').updateOne(
    { id: req.params.id },
    {
      $set: updates,
      ...(securityChange ? { $inc: { token_version: 1 } } : {}),
    },
  );
  await logAudit(req.user, body.active === 0 ? 'user.deactivated' : 'user.updated', 'user', existing.id,
    body.name || existing.name, 'Compte utilisateur mis à jour', meta(req));
  res.json({ data: await findUserStats(req.params.id) });
});

usersRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const existing = await collection('users').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Utilisateur introuvable.');
  if (existing.id === req.user.id) throw new HttpError(400, 'Vous ne pouvez pas supprimer votre propre compte.');
  if (existing.role === 'SUPER_ADMIN') {
    const supers = await collection('users').countDocuments({ role: 'SUPER_ADMIN' });
    if (supers <= 1) throw new HttpError(400, 'Le dernier Super Admin ne peut pas être supprimé.');
    if (req.user.role !== 'SUPER_ADMIN') throw new HttpError(403, 'Seul un Super Admin peut supprimer un Super Admin.');
  }
  await Promise.all([
    collection('tasks').updateMany({ assignee_id: existing.id }, { $set: { assignee_id: null } }),
    collection('projects').updateMany({ manager_id: existing.id }, { $set: { manager_id: null } }),
    collection('clients').updateMany({ owner_id: existing.id }, { $set: { owner_id: null } }),
    collection('refresh_tokens').deleteMany({ user_id: existing.id }),
  ]);
  await collection('users').deleteOne({ id: existing.id });
  await logAudit(req.user, 'user.deleted', 'user', existing.id, existing.name, 'Compte utilisateur supprimé', meta(req));
  res.json({ ok: true });
});

export const AUDIT_FIELDS = USER_FIELDS;
