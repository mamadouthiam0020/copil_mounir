import crypto from 'node:crypto';
import { APP_ENV } from './env.js';
import jwt from 'jsonwebtoken';
import { collection } from './db.js';
import { HttpError, logAudit, nowISO } from './utils.js';

const ISSUER = 'copil-api';
const AUDIENCE = 'copil-client';
const REFRESH_COOKIE = 'copil_refresh';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET doit être défini (aucun secret de développement n’est autorisé).');
}
if (!process.env.AUDIT_SECRET) {
  throw new Error('AUDIT_SECRET doit être défini pour garantir l’intégrité des journaux.');
}

const SECRET = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES || '15m';
const REFRESH_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS) || 7);
const isProd = APP_ENV === 'production';

export const USER_FIELDS = {
  _id: 0,
  id: 1,
  name: 1,
  email: 1,
  role: 1,
  job_title: 1,
  phone: 1,
  avatar_color: 1,
  active: 1,
  created_at: 1,
};

export const signToken = (user) => jwt.sign(
  {
    sub: user.id,
    role: user.role,
    ver: Number(user.token_version || 0),
    jti: crypto.randomUUID(),
  },
  SECRET,
  { expiresIn: EXPIRES, issuer: ISSUER, audience: AUDIENCE, algorithm: 'HS256' },
);

export const verifyToken = (token) => jwt.verify(token, SECRET, {
  issuer: ISSUER,
  audience: AUDIENCE,
  algorithms: ['HS256'],
});

export async function revokeAccessToken(payload) {
  if (!payload?.jti || !payload?.exp) return;
  await collection('revoked_tokens').updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        user_id: payload.sub ?? null,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        revoked_at: nowISO(),
      },
    },
    { upsert: true },
  );
}

export async function bumpTokenVersion(userId) {
  await collection('users').updateOne({ id: userId }, { $inc: { token_version: 1 } });
}

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) acc[key] = rest.join('=');
    return acc;
  }, {});
}

const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
});

export async function issueRefreshToken(res, user) {
  const token = crypto.randomBytes(48).toString('base64url');
  await collection('refresh_tokens').insertOne({
    token_hash: hashRefreshToken(token),
    user_id: user.id,
    token_version: Number(user.token_version || 0),
    created_at: nowISO(),
    expires_at: new Date(Date.now() + REFRESH_DAYS * 86_400_000).toISOString(),
  });
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
  return token;
}

export async function consumeRefreshToken(req, res) {
  const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
  if (!token) return null;
  const tokenHash = hashRefreshToken(token);
  const row = await collection('refresh_tokens').findOneAndDelete({ token_hash: tokenHash });
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const user = await collection('users').findOne(
    { id: row.user_id },
    { projection: USER_FIELDS },
  );
  if (!user || !user.active) return null;
  const currentVersion = Number(user.token_version || 0);
  const tokenVersion = Number(row.token_version ?? currentVersion);
  if (tokenVersion !== currentVersion) return null;
  await issueRefreshToken(res, user);
  return user;
}

export async function revokeRefreshToken(req, res) {
  const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
  if (token) {
    await collection('refresh_tokens').deleteOne({ token_hash: hashRefreshToken(token) });
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth', httpOnly: true, secure: isProd, sameSite: 'lax' });
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Authentification requise.');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, 'Session expirée, veuillez vous reconnecter.');
    }

    const revoked = await collection('revoked_tokens').findOne({ jti: payload.jti }, { projection: { _id: 1 } });
    if (revoked) throw new HttpError(401, 'Session révoquée, veuillez vous reconnecter.');

    const user = await collection('users').findOne({ id: payload.sub }, { projection: USER_FIELDS });
    if (!user) throw new HttpError(401, 'Compte introuvable.');
    if (Number(user.token_version || 0) !== Number(payload.ver || 0)) {
      throw new HttpError(401, 'Session expirée, veuillez vous reconnecter.');
    }
    if (!user.active) throw new HttpError(403, 'Ce compte est désactivé.');

    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      void logAudit(null, 'auth.token_rejected', 'session', null, null, error.message, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }).catch(() => undefined);
    }
    next(error);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Authentification requise.'));
    if (!roles.includes(req.user.role)) {
      void logAudit(req.user, 'auth.denied', 'access', null, req.path, `Rôle ${req.user.role}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }).catch(() => undefined);
      return next(new HttpError(403, 'Vos droits d’accès ne permettent pas cette action.'));
    }
    next();
  };
}

export const canManageRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
export const adminRoles = ['SUPER_ADMIN', 'ADMIN'];

export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
