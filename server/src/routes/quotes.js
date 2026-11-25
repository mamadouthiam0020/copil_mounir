import { Router } from 'express';
import { z } from 'zod';
import { collection } from '../db.js';
import {
  addDays, addTimelineEntry, asString, computeQuote, enrichProject, enrichQuote, HttpError, logAudit,
  nextQuoteNumber, NO_ID, nowISO, parsePagination, searchRegex, todayISO, uid,
} from '../utils.js';
import { authorize } from '../auth.js';
import { readSettings } from './settings.js';

export const quotesRouter = Router();

const itemSchema = z.object({
  id: z.string().optional(),
  designation: z.string().trim().min(1, 'La désignation est requise.'),
  description: z.string().optional().nullable(),
  qty: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).max(100).default(0),
});

const quoteSchema = z.object({
  client_id: z.string().optional().nullable(),
  prospect_name: z.string().optional().nullable(),
  prospect_email: z.string().optional().nullable(),
  prospect_phone: z.string().optional().nullable(),
  prospect_address: z.string().optional().nullable(),
  status: z.enum(['draft', 'sent', 'accepted', 'refused', 'expired']).default('draft'),
  issue_date: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  items: z.array(itemSchema).default([]),
  tax_rate: z.coerce.number().min(0).max(100).default(20),
  notes: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  delivery_days: z.string().optional().nullable(),
});

const QUOTE_FIELDS = ['client_id', 'prospect_name', 'prospect_email', 'prospect_phone', 'prospect_address',
  'status', 'issue_date', 'valid_until', 'tax_rate', 'notes', 'payment_terms', 'delivery_days'];

const QUOTE_ENRICH = [
  { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
  { $lookup: { from: 'users', localField: 'created_by', foreignField: 'id', as: '_author' } },
  {
    $addFields: {
      client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
      client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] },
      client_email: { $ifNull: [{ $arrayElemAt: ['$_client.email', 0] }, null] },
      client_phone: { $ifNull: [{ $arrayElemAt: ['$_client.phone', 0] }, null] },
      client_address: { $ifNull: [{ $arrayElemAt: ['$_client.address', 0] }, null] },
      client_city: { $ifNull: [{ $arrayElemAt: ['$_client.city', 0] }, null] },
      author_name: { $ifNull: [{ $arrayElemAt: ['$_author.name', 0] }, null] },
    },
  },
  { $unset: ['_client', '_author', '_id'] },
];

const mapQuote = (row) => enrichQuote(row);

async function findQuote(id) {
  const [quote] = await collection('quotes').aggregate([{ $match: { id } }, ...QUOTE_ENRICH]).toArray();
  return quote;
}

quotesRouter.get('/', async (req, res) => {
  const q = asString(req.query.q);
  const status = asString(req.query.status);
  const clientId = asString(req.query.clientId);
  const { page, limit, offset } = parsePagination(req.query, 50);

  const filter = {};
  if (status) filter.status = { $in: status.split(',').filter(Boolean) };
  if (clientId) filter.client_id = clientId;

  const pipeline = [{ $match: filter }, ...QUOTE_ENRICH];
  if (q) {
    const rx = searchRegex(q);
    pipeline.push({
      $match: {
        $or: [{ number: rx }, { prospect_name: rx }, { client_company: rx }, { client_name: rx }],
      },
    });
  }
  pipeline.push({ $sort: { created_at: -1 } });
  pipeline.push({
    $facet: {
      rows: [{ $skip: offset }, { $limit: limit }],
      total: [{ $count: 'n' }],
    },
  });

  const [facet] = await collection('quotes').aggregate(pipeline).toArray();
  const rows = (facet?.rows ?? []).map(mapQuote);
  const total = facet?.total?.[0]?.n ?? 0;
  res.json({ data: rows, meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) } });
});

quotesRouter.get('/:id', async (req, res) => {
  const row = await findQuote(req.params.id);
  if (!row) throw new HttpError(404, 'Devis introuvable.');
  res.json({ data: mapQuote(row) });
});

quotesRouter.post('/', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const body = quoteSchema.parse(req.body);
  const settings = await readSettings();
  const issue = body.issue_date || todayISO();
  const id = uid('dev');
  const client = body.client_id ? await collection('clients').findOne({ id: body.client_id }, { projection: NO_ID }) : null;
  const totals = computeQuote(body.items, body.tax_rate);
  if (totals.total <= 0) throw new HttpError(400, 'Le devis doit contenir au moins une ligne valorisée.');
  const number = await nextQuoteNumber(settings.quote?.prefix || 'DEV');
  const validUntil = body.valid_until || addDays(issue, Number(settings.quote?.validity_days) || 30);
  const now = nowISO();
  await collection('quotes').insertOne({
    id,
    number,
    client_id: body.client_id ?? null,
    prospect_name: body.prospect_name ?? client?.company ?? null,
    prospect_email: body.prospect_email ?? client?.email ?? null,
    prospect_phone: body.prospect_phone ?? client?.phone ?? null,
    prospect_address: body.prospect_address ?? client?.address ?? null,
    status: body.status,
    issue_date: issue,
    valid_until: validUntil,
    items: totals.lines,
    tax_rate: body.tax_rate,
    notes: body.notes ?? null,
    payment_terms: body.payment_terms ?? settings.quote?.payment_terms ?? null,
    delivery_days: body.delivery_days ?? settings.quote?.delivery_days ?? null,
    created_by: req.user.id,
    created_at: now,
    updated_at: now,
  });
  await logAudit(req.user, 'quote.created', 'quote', id, number,
    `Devis créé pour ${client?.company || body.prospect_name || 'un prospect'}`);
  res.status(201).json({ data: mapQuote(await findQuote(id)) });
});

quotesRouter.put('/:id', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const existing = await collection('quotes').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Devis introuvable.');
  const body = quoteSchema.partial().parse(req.body);

  const updates = {};
  for (const field of QUOTE_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] ?? null;
  }
  if (body.items !== undefined) {
    const totals = computeQuote(body.items, body.tax_rate ?? existing.tax_rate);
    if (totals.total <= 0) throw new HttpError(400, 'Le devis doit contenir au moins une ligne valorisée.');
    updates.items = totals.lines;
  }
  if (!Object.keys(updates).length) throw new HttpError(400, 'Aucune modification transmise.');
  updates.updated_at = nowISO();
  await collection('quotes').updateOne({ id: req.params.id }, { $set: updates });

  if (body.status === 'accepted' && existing.status !== 'accepted') {
    await logAudit(req.user, 'quote.accepted', 'quote', existing.id, existing.number, 'Devis accepté');
  } else if (body.status === 'sent' && existing.status !== 'sent') {
    await logAudit(req.user, 'quote.sent', 'quote', existing.id, existing.number, 'Devis envoyé au client');
  } else {
    await logAudit(req.user, 'quote.updated', 'quote', existing.id, existing.number, 'Devis mis à jour');
  }
  res.json({ data: mapQuote(await findQuote(req.params.id)) });
});

quotesRouter.post('/:id/duplicate', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const existing = await collection('quotes').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!existing) throw new HttpError(404, 'Devis introuvable.');
  const settings = await readSettings();
  const id = uid('dev');
  const number = await nextQuoteNumber(settings.quote?.prefix || 'DEV');
  const issue = todayISO();
  const validUntil = addDays(issue, Number(settings.quote?.validity_days) || 30);
  const now = nowISO();
  await collection('quotes').insertOne({
    id,
    number,
    client_id: existing.client_id,
    prospect_name: existing.prospect_name,
    prospect_email: existing.prospect_email,
    prospect_phone: existing.prospect_phone,
    prospect_address: existing.prospect_address,
    status: 'draft',
    issue_date: issue,
    valid_until: validUntil,
    items: existing.items ?? [],
    tax_rate: existing.tax_rate,
    notes: existing.notes,
    payment_terms: existing.payment_terms,
    delivery_days: existing.delivery_days,
    created_by: req.user.id,
    created_at: now,
    updated_at: now,
  });
  await logAudit(req.user, 'quote.duplicated', 'quote', id, number, `Duplicata de ${existing.number}`);
  res.status(201).json({ data: mapQuote(await findQuote(id)) });
});

quotesRouter.post('/:id/convert', authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const quote = await collection('quotes').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!quote) throw new HttpError(404, 'Devis introuvable.');
  if (!quote.client_id) throw new HttpError(400, 'Associez le devis à une fiche client avant de créer le projet.');
  const client = await collection('clients').findOne({ id: quote.client_id }, { projection: NO_ID });
  if (!client) throw new HttpError(400, 'Client du devis introuvable.');
  const body = z.object({ name: z.string().trim().optional() }).optional().parse(req.body ?? {});
  const totals = computeQuote(quote.items ?? [], quote.tax_rate);
  const already = await collection('projects').countDocuments({ quote_id: quote.id });
  if (already) throw new HttpError(409, 'Un projet a déjà été créé depuis ce devis.');
  const id = uid('prj');
  const now = nowISO();
  const start = todayISO();
  const due = addDays(start, 45);
  const name = body?.name || `Projet ${client.company || client.name}`;
  const count = await collection('projects').countDocuments();
  await collection('projects').insertOne({
    id,
    name,
    code: `PRJ-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`,
    client_id: client.id,
    description: `Projet issu du devis ${quote.number}. ${quote.notes || ''}`.trim(),
    needs: totals.lines.map((l) => l.designation).join(', '),
    objectives: totals.lines.map((l) => l.designation).join(', '),
    budget: totals.base,
    start_date: start,
    due_date: due,
    manager_id: quote.created_by || req.user.id,
    status: 'en_cours',
    progress: 0,
    comments: [],
    date_history: [],
    quote_id: quote.id,
    created_at: now,
    updated_at: now,
  });
  await collection('quotes').updateOne({ id: quote.id }, { $set: { status: 'accepted', updated_at: now } });
  await addTimelineEntry(client.id, 'project', 'Projet créé depuis un devis', `${name} — ${quote.number}`, req.user.id, todayISO());
  await logAudit(req.user, 'project.created', 'project', id, name, `Créé depuis le devis ${quote.number}`);
  const [project] = await collection('projects').aggregate([
    { $match: { id } },
    { $lookup: { from: 'clients', localField: 'client_id', foreignField: 'id', as: '_client' } },
    { $lookup: { from: 'users', localField: 'manager_id', foreignField: 'id', as: '_manager' } },
    {
      $addFields: {
        client_name: { $ifNull: [{ $arrayElemAt: ['$_client.name', 0] }, null] },
        client_company: { $ifNull: [{ $arrayElemAt: ['$_client.company', 0] }, null] },
        manager_name: { $ifNull: [{ $arrayElemAt: ['$_manager.name', 0] }, null] },
      },
    },
    { $unset: ['_client', '_manager', '_id'] },
  ]).toArray();
  res.status(201).json({ data: enrichProject(project) });
});

quotesRouter.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const quote = await collection('quotes').findOne({ id: req.params.id }, { projection: NO_ID });
  if (!quote) throw new HttpError(404, 'Devis introuvable.');
  await collection('quotes').deleteOne({ id: req.params.id });
  await logAudit(req.user, 'quote.deleted', 'quote', quote.id, quote.number, 'Devis supprimé');
  res.json({ ok: true });
});
