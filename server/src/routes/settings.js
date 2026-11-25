import { Router } from 'express';
import { z } from 'zod';
import { collection } from '../db.js';
import { logAudit, HttpError } from '../utils.js';
import { authorize } from '../auth.js';

export const settingsRouter = Router();

export async function readSettings() {
  const row = await collection('settings').findOne({ id: 'global' });
  if (!row) throw new HttpError(500, 'Configuration introuvable.');
  const settings = { ...row };
  delete settings._id;
  delete settings.id;
  return settings;
}

settingsRouter.get('/', async (req, res) => {
  const settings = await readSettings();
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
    const company = { ...settings.company };
    for (const field of ['ice', 'rc', 'if', 'cnss', 'bank']) delete company[field];
    return res.json({ data: { ...settings, company } });
  }
  return res.json({ data: settings });
});

settingsRouter.put('/', authorize('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const schema = z.object({
    company: z.object({
      name: z.string().trim().min(2, 'Le nom de l’entreprise est requis.').optional(),
      tagline: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().optional().nullable(),
      website: z.string().optional().nullable(),
      ice: z.string().optional().nullable(),
      rc: z.string().optional().nullable(),
      if: z.string().optional().nullable(),
      cnss: z.string().optional().nullable(),
      bank: z.string().optional().nullable(),
    }).optional(),
    quote: z.object({
      prefix: z.string().trim().min(2).max(8).optional(),
      tax_rate: z.coerce.number().min(0).max(100).optional(),
      validity_days: z.coerce.number().min(1).max(365).optional(),
      payment_terms: z.string().optional().nullable(),
      delivery_days: z.string().optional().nullable(),
    }).optional(),
    currency: z.string().min(1).max(8).optional(),
  }).partial();
  const body = schema.parse(req.body);
  const current = await readSettings();
  const next = {
    ...current,
    ...body,
    company: { ...current.company, ...(body.company || {}) },
    quote: { ...current.quote, ...(body.quote || {}) },
  };
  await collection('settings').updateOne(
    { id: 'global' },
    { $set: next },
    { upsert: true },
  );
  await logAudit(req.user, 'settings.updated', 'settings', 'global', 'Paramètres', 'Paramètres de l’entreprise mis à jour');
  res.json({ data: next });
});
