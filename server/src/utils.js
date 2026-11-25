import crypto from 'node:crypto';
import { collection } from './db.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const uid = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
export const nowISO = () => new Date().toISOString();
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const toDateOnly = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(dateISO, days) {
  const d = new Date(`${dateISO}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

export function daysUntil(dateISO) {
  if (!dateISO) return null;
  const target = new Date(`${dateISO}T12:00:00`).getTime();
  const today = new Date(`${todayISO()}T12:00:00`).getTime();
  return Math.round((target - today) / 86400000);
}

export const canManage = (user) => ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user?.role);
export const isAdmin = (user) => ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);

export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const asString = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return undefined;
};
export const searchRegex = (value) => ({ $regex: escapeRegex(asString(value) ?? ''), $options: 'i' });

/** Projection Mongo qui retire le champ technique `_id`. */
export const NO_ID = { _id: 0 };

export function projectHealth(project) {
  if (project.status === 'termine') return 'done';
  if (project.status === 'annule') return 'cancelled';
  const d = daysUntil(project.due_date);
  if (d === null) return 'ontime';
  if (d < 0) return 'late';
  if (d <= 7) return 'soon';
  return 'ontime';
}

export function enrichProject(row) {
  if (!row) return row;
  const days_left = daysUntil(row.due_date);
  return {
    ...row,
    comments: row.comments ?? [],
    date_history: row.date_history ?? [],
    days_left,
    health: projectHealth(row),
    is_late: days_left !== null && days_left < 0 && !['termine', 'annule'].includes(row.status),
  };
}

export function enrichTask(row) {
  if (!row) return row;
  const isLate = row.status !== 'done' && row.due_date && row.due_date < todayISO();
  return {
    ...row,
    comments: row.comments ?? [],
    attachments: (row.attachments ?? []).map(({ data, ...rest }) => ({ ...rest, has_data: Boolean(data) })),
    is_late: Boolean(isLate),
    effective_status: isLate ? 'late' : row.status,
    days_left: daysUntil(row.due_date),
  };
}

export function computeQuote(items, taxRate) {
  const lines = (items || []).map((item) => {
    const qty = Number(item.qty) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    const gross = qty * unitPrice;
    const discountAmount = Math.round(gross * (discount / 100) * 100) / 100;
    return { ...item, qty, unitPrice, discount, lineTotal: Math.round((gross - discountAmount) * 100) / 100 };
  });
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100;
  const discountTotal = Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitPrice * (l.discount / 100), 0) * 100) / 100;
  const base = Math.round((subtotal - discountTotal) * 100) / 100;
  const rate = Number(taxRate) || 0;
  const tax = Math.round(base * (rate / 100) * 100) / 100;
  const total = Math.round((base + tax) * 100) / 100;
  return { lines, subtotal, discountTotal, base, tax, total, taxRate: rate };
}

export function enrichQuote(row) {
  if (!row) return row;
  const totals = computeQuote(row.items, row.tax_rate);
  const expired = row.status === 'sent' && row.valid_until && row.valid_until < todayISO();
  return {
    ...row,
    items: totals.lines,
    totals,
    effective_status: expired ? 'expired' : row.status,
    client_display: row.client_company || row.prospect_name || 'Prospect',
  };
}

/**
 * Journaux d’audit avec chaîne d’intégrité : chaque entrée contient le hash de
 * la précédente. La clé est externalisée via AUDIT_SECRET.
 */
function auditKey() {
  const key = process.env.AUDIT_SECRET || process.env.JWT_SECRET;
  if (!key) throw new Error('AUDIT_SECRET doit être défini pour journaliser les actions.');
  return key;
}

export async function logAudit(user, action, entity, entityId, entityLabel, detail, meta = {}) {
  const previous = await collection('audit_logs')
    .find({}, { projection: { _id: 0, hash: 1 } })
    .sort({ created_at: -1, id: -1 })
    .limit(1)
    .next();

  const entry = {
    id: uid('log'),
    actor_id: user?.id ?? null,
    actor_role: user?.role ?? null,
    action,
    entity,
    entity_id: entityId ?? null,
    entity_label: entityLabel ?? null,
    detail: detail ?? null,
    ip: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
    created_at: nowISO(),
  };
  entry.prev_hash = previous?.hash ?? null;
  entry.hash = crypto.createHmac('sha256', auditKey())
    .update(`${entry.prev_hash || ''}|${JSON.stringify(entry)}`)
    .digest('hex');

  await collection('audit_logs').insertOne(entry);
  return entry;
}

/** Demande traçable d’un export côté client. */
export const logExport = (user, scope, meta) => logAudit(
  user, 'report.exported', 'report', null, scope, `Export ${scope}`, meta,
);

const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * Valide et normalise une data URI. Refuse les types non autorisés, le base64
 * invalide et les volumes excessifs avant toute persistance.
 */
export function parseDataUri(value, { maxBytes = 6_000_000, allowedMimes = ALLOWED_UPLOAD_MIMES } = {}) {
  if (typeof value !== 'string' || !value.startsWith('data:')) {
    throw new HttpError(400, 'Format de document invalide.');
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !allowedMimes.has(match[1].toLowerCase())) {
    throw new HttpError(400, 'Type de document non autorisé.');
  }
  if (match[2].length % 4 !== 0) throw new HttpError(400, 'Données de document invalides.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new HttpError(400, 'Document vide.');
  if (buffer.length > maxBytes) throw new HttpError(413, 'Document trop volumineux.');
  return {
    mime: match[1].toLowerCase(),
    buffer,
    data: `data:${match[1].toLowerCase()};base64,${buffer.toString('base64')}`,
  };
}

/** Empêche l’interprétation des cellules comme formules dans Excel/Sheets. */
export const neutralizeCsvCell = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function addTimelineEntry(clientId, type, title, content, authorId, date) {
  if (!clientId) return;
  await collection('timeline').insertOne({
    id: uid('tl'),
    client_id: clientId,
    type,
    title,
    content: content ?? null,
    date: date ?? todayISO(),
    author_id: authorId ?? null,
    created_at: nowISO(),
  });
}

export async function syncProjectProgress(projectId) {
  if (!projectId) return;
  const rows = await collection('tasks')
    .find({ project_id: projectId }, { projection: { _id: 0, progress: 1, status: 1 } })
    .toArray();
  if (!rows.length) return;
  const avg = Math.round(rows.reduce((s, r) => s + (r.status === 'done' ? 100 : Number(r.progress) || 0), 0) / rows.length);
  await collection('projects').updateOne({ id: projectId }, { $set: { progress: avg, updated_at: nowISO() } });
}

export function parsePagination(query, defaultLimit = 20) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export async function nextQuoteNumber(prefix = 'DEV') {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^${escapeRegex(prefix)}-${year}-`);
  const row = await collection('quotes')
    .find({ number: pattern }, { projection: { _id: 0, number: 1 } })
    .sort({ number: -1 })
    .limit(1)
    .next();
  const last = row ? Number(String(row.number).split('-').pop()) : 0;
  return `${prefix}-${year}-${String(last + 1).padStart(4, '0')}`;
}
