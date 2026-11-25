import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import bcrypt from 'bcryptjs';
import { parse as parseQueryString } from 'node:querystring';
import { z, ZodError } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collection, connect, MONGO_DB_NAME, MONGO_TARGET, MONGO_URI_VAR, APP_ENV, DB_SOURCE, ENV_LABEL,
} from './db.js';
import {
  signToken, authenticate, authorize, validate, USER_FIELDS, issueRefreshToken,
  consumeRefreshToken, revokeRefreshToken, revokeAccessToken,
} from './auth.js';
import { prepareStartupData } from './seed.js';
import { canAccessClient, visibleClientFilter, accessibleProjectIds } from './access.js';
import {
  HttpError, addDays, asString, logAudit, logExport, nowISO, searchRegex, todayISO,
} from './utils.js';
import { clientsRouter, documentsRouter } from './routes/clients.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { quotesRouter } from './routes/quotes.js';
import { usersRouter } from './routes/users.js';
import { settingsRouter } from './routes/settings.js';
import { dashboardRouter } from './routes/dashboard.js';
import { reportsRouter } from './routes/reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4000;
const isProd = APP_ENV === 'production';

const trustProxy = String(process.env.TRUST_PROXY || '').trim();
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? 1 : trustProxy);
}

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/**
 * Empêche l'injection NoSQL : clés `$...` ou contenant un `.` sont ignorées,
 * y compris dans les query strings (Express 5 ne permet plus de remplacer req.query).
 */
function sanitizeMongo(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map((item) => sanitizeMongo(item, depth + 1));
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      clean[key] = sanitizeMongo(nested, depth + 1);
    }
    return clean;
  }
  return value;
}

app.set('query parser', (query) => sanitizeMongo(parseQueryString(query)));
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...(isProd ? [] : ["'unsafe-inline'"])],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...(isProd ? [] : ['ws:', 'wss:'])],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: isProd ? { policy: 'require-corp' } : false,
  hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true, preload: true } : false,
}));

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origine non autorisée par la politique CORS.'));
  },
  credentials: true,
} : {
  origin: isProd ? false : true,
  credentials: Boolean(allowedOrigins.length),
}));

app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  req.body = sanitizeMongo(req.body ?? {});
  next();
});
app.use(hpp());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Veuillez réessayer plus tard.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de renouvellements de session. Réessayez plus tard.' },
});

app.use('/api', apiLimiter);

try {
  await connect();
  await prepareStartupData();
} catch (error) {
  console.error(`\n  ✖ ${error.message}\n`);
  process.exit(1);
}

app.get('/api/health', (req, res) => {
  const payload = {
    ok: true,
    service: 'copil-api',
    time: nowISO(),
  };
  if (!isProd) {
    payload.environment = APP_ENV;
    payload.config = DB_SOURCE;
    payload.database = MONGO_DB_NAME;
    payload.mongo = MONGO_TARGET;
  }
  res.json(payload);
});

const authRouter = express.Router();
const AUTH_ERROR = 'Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.';
const MAX_LOGIN_FAILURES = Math.max(3, Number(process.env.LOGIN_MAX_FAILURES) || 5);
const LOGIN_LOCK_MINUTES = Math.max(5, Number(process.env.LOGIN_LOCK_MINUTES) || 15);

async function recordLoginFailure(email, reason, req) {
  const now = new Date();
  const row = await collection('login_attempts').findOne({ email });
  const failures = Number(row?.failures || 0) + 1;
  const lockedUntil = failures >= MAX_LOGIN_FAILURES
    ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000).toISOString()
    : null;
  await collection('login_attempts').updateOne(
    { email },
    {
      $set: {
        failures,
        last_failed_at: now.toISOString(),
        ...(lockedUntil ? { locked_until: lockedUntil } : {}),
      },
    },
    { upsert: true },
  );
  await logAudit(null, 'auth.login_failed', 'session', null, email, reason, requestMeta(req));
  if (lockedUntil) console.warn(`[sécurité] Compte verrouillé après ${failures} échecs : ${email}`);
}

authRouter.post('/login', loginLimiter, validate(z.object({
  email: z.string().trim().email('Adresse e-mail invalide.').max(254),
  password: z.string().min(1, 'Le mot de passe est requis.').max(200),
})), async (req, res) => {
  const email = req.body.email.toLowerCase();
  const attempt = await collection('login_attempts').findOne({ email }, { projection: { _id: 0 } });
  if (attempt?.locked_until && new Date(attempt.locked_until).getTime() > Date.now()) {
    await logAudit(null, 'auth.login_blocked', 'session', null, email, 'Compte temporairement verrouillé', requestMeta(req));
    throw new HttpError(401, AUTH_ERROR);
  }

  const user = await collection('users').findOne({ email });
  const validPassword = user ? await bcrypt.compare(req.body.password, user.password_hash) : false;
  if (!user || !validPassword || !user.active) {
    await recordLoginFailure(email, !user ? 'Utilisateur inconnu' : !validPassword ? 'Mot de passe incorrect' : 'Compte désactivé', req);
    throw new HttpError(401, AUTH_ERROR);
  }

  await collection('login_attempts').deleteOne({ email });
  const safe = await collection('users').findOne({ id: user.id }, { projection: USER_FIELDS });
  await issueRefreshToken(res, safe);
  await logAudit(safe, 'auth.login', 'session', safe.id, safe.name, 'Connexion à la plateforme', requestMeta(req));
  res.json({ data: { token: signToken(safe), user: safe } });
});

authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const user = await consumeRefreshToken(req, res);
  if (!user) throw new HttpError(401, 'Session expirée, veuillez vous reconnecter.');
  await logAudit(user, 'auth.refreshed', 'session', user.id, user.name, 'Session renouvelée', requestMeta(req));
  res.json({ data: { token: signToken(user), user } });
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await Promise.all([
    revokeAccessToken(req.tokenPayload),
    revokeRefreshToken(req, res),
    logAudit(req.user, 'auth.logout', 'session', req.user.id, req.user.name, 'Déconnexion', requestMeta(req)),
  ]);
  res.json({ ok: true });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ data: req.user });
});

authRouter.post('/password', authenticate, validate(z.object({
  current: z.string().min(1, 'Mot de passe actuel requis.').max(200),
  next: z.string().min(12, 'Le nouveau mot de passe doit contenir au moins 12 caractères.').max(200),
})), async (req, res) => {
  const user = await collection('users').findOne({ id: req.user.id });
  if (!user || !await bcrypt.compare(req.body.current, user.password_hash)) {
    throw new HttpError(400, 'Le mot de passe actuel est incorrect.');
  }
  await collection('users').updateOne(
    { id: user.id },
    {
      $set: {
        password_hash: await bcrypt.hash(req.body.next, 12),
        password_changed_at: nowISO(),
      },
      $inc: { token_version: 1 },
    },
  );
  await Promise.all([
    revokeAccessToken(req.tokenPayload),
    revokeRefreshToken(req, res),
    logAudit(req.user, 'auth.password', 'user', user.id, user.name, 'Mot de passe modifié', requestMeta(req)),
  ]);
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/clients', authenticate, clientsRouter);
app.use('/api/documents', authenticate, documentsRouter);
app.use('/api/projects', authenticate, projectsRouter);
app.use('/api/tasks', authenticate, tasksRouter);
app.use('/api/quotes', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), quotesRouter);
app.use('/api/users', authenticate, usersRouter);
app.use('/api/settings', authenticate, settingsRouter);
app.use('/api/dashboard', authenticate, dashboardRouter);
app.use('/api/reports', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), reportsRouter);

app.get('/api/audit', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(asString(req.query.limit)) || 60));
  const q = asString(req.query.q);
  const pipeline = [
    { $lookup: { from: 'users', localField: 'actor_id', foreignField: 'id', as: '_actor' } },
    {
      $addFields: {
        actor_name: { $ifNull: [{ $arrayElemAt: ['$_actor.name', 0] }, null] },
        actor_color: { $ifNull: [{ $arrayElemAt: ['$_actor.avatar_color', 0] }, null] },
      },
    },
  ];
  if (q) {
    const rx = searchRegex(q);
    pipeline.push({ $match: { $or: [{ action: rx }, { entity_label: rx }, { actor_name: rx }] } });
  }
  pipeline.push({ $unset: ['_actor', '_id'] });
  pipeline.push({ $sort: { created_at: -1 } });
  pipeline.push({ $limit: limit });
  const rows = await collection('audit_logs').aggregate(pipeline).toArray();
  res.json({ data: rows });
});

app.post('/api/audit/export', authenticate, authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'), async (req, res) => {
  await logExport(req.user, 'rapports', requestMeta(req));
  res.json({ ok: true });
});

app.get('/api/notifications', authenticate, async (req, res) => {
  const today = todayISO();
  const soon = addDays(today, 3);
  const items = [];
  const projectProjection = { _id: 0, id: 1, name: 1, due_date: 1 };
  const isEmployee = req.user.role === 'EMPLOYEE';
  const projectIds = isEmployee ? await accessibleProjectIds(req.user) : null;
  const activeProjectBase = {
    status: { $nin: ['termine', 'annule'] },
    due_date: { $ne: null },
    ...(projectIds ? { id: { $in: projectIds } } : {}),
  };

  const lateProjects = await collection('projects')
    .find({ ...activeProjectBase, due_date: { $lt: today } }, { projection: projectProjection })
    .sort({ due_date: 1 })
    .limit(3)
    .toArray();
  for (const p of lateProjects) {
    items.push({ id: `p-${p.id}`, type: 'project', title: 'Livraison dépassée', detail: p.name, tone: 'red', date: p.due_date, to: '/planning' });
  }

  const soonProjects = await collection('projects')
    .find({ ...activeProjectBase, due_date: { $gte: today, $lte: soon } }, { projection: projectProjection })
    .sort({ due_date: 1 })
    .limit(3)
    .toArray();
  for (const p of soonProjects) {
    items.push({ id: `ps-${p.id}`, type: 'project', title: 'Échéance proche', detail: p.name, tone: 'amber', date: p.due_date, to: '/planning' });
  }

  if (!isEmployee) {
    const pendingQuotes = await collection('quotes')
      .find({ status: 'sent' }, { projection: { _id: 0, id: 1, number: 1, valid_until: 1 } })
      .sort({ valid_until: 1 })
      .limit(2)
      .toArray();
    for (const q of pendingQuotes) {
      items.push({ id: `q-${q.id}`, type: 'quote', title: 'Devis en attente', detail: q.number, tone: 'gold', date: q.valid_until, to: '/devis' });
    }
  }

  const clientScope = await visibleClientFilter(req.user);
  const followUps = await collection('clients')
    .find(
      { ...clientScope, status: { $ne: 'inactif' }, next_action_date: { $ne: null, $lte: soon } },
      { projection: { _id: 0, id: 1, company: 1, name: 1, next_action: 1, next_action_date: 1 } },
    )
    .sort({ next_action_date: 1 })
    .limit(2)
    .toArray();
  for (const c of followUps) {
    items.push({ id: `c-${c.id}`, type: 'client', title: 'Relance client', detail: c.company || c.name, tone: 'navy', date: c.next_action_date, to: `/clients/${c.id}` });
  }

  const myTasks = await collection('tasks')
    .find(
      { assignee_id: req.user.id, status: { $ne: 'done' }, due_date: { $ne: null, $lte: today } },
      { projection: { _id: 0, id: 1, title: 1, due_date: 1 } },
    )
    .sort({ due_date: 1 })
    .limit(3)
    .toArray();
  for (const t of myTasks) {
    items.push({ id: `t-${t.id}`, type: 'task', title: 'Tâche à traiter', detail: t.title, tone: t.due_date < today ? 'red' : 'navy', date: t.due_date, to: '/taches' });
  }

  res.json({ data: items.slice(0, 8), meta: { total: items.length } });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ressource introuvable.' });
});

const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(dist, 'index.html'));
    }
    next();
  });
}

app.use((err, req, res, next) => {
  void next;
  if (err instanceof ZodError) {
    const issues = err.issues ?? err.errors ?? [];
    return res.status(400).json({
      error: issues[0]?.message || 'Données invalides.',
      issues: issues.map((e) => ({ path: e.path.join('.'), message: e.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Le contenu envoyé est trop volumineux.' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Cette opération entre en conflit avec des données existantes.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Le format des données est invalide.' });
  }
  console.error('[api]', err);
  res.status(500).json({ error: 'Une erreur interne est survenue. Veuillez réessayer.' });
});

const server = app.listen(PORT, () => {
  console.log(`\n  Copil API — http://localhost:${PORT}`);
  console.log(`  Environnement : ${ENV_LABEL} (${APP_ENV})`);
  console.log(`  Fichier env   : ${DB_SOURCE}`);
  console.log(`  Variable URI  : ${MONGO_URI_VAR || 'valeur par défaut'}`);
  console.log(`  MongoDB       : ${MONGO_TARGET}`);
  console.log(`  Base de données : ${MONGO_DB_NAME}`);
  console.log('  Sécurité : JWT_SECRET et AUDIT_SECRET requis, sessions en refresh rotating.');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

