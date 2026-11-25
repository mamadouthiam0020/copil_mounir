import { MongoClient } from 'mongodb';
import { APP_ENV, ENV_FILE_NAME, LOCAL_MONGO } from './env.js';

/**
 * Connexion MongoDB
 * -----------------
 * L'environnement est déterminé par server/src/env.js, qui charge le fichier
 * .env-dev ou .env-prod à la racine du projet.
 *
 * Chaque environnement possède sa propre base, définie dans son fichier .env :
 *   • development → Copil_Mounir_Dev   (.env-dev, MongoDB Atlas)
 *   • production  → Copil_Mounir_Prod  (.env-prod, MongoDB Atlas)
 *   • test        → copil_test         (--test / MongoDB local)
 *
 * MONGODB_URI (ou son alias MONGO_URI), défini dans le fichier .env ou dans
 * le shell, reste prioritaire. Le nom de la base est déduit de l'URI (dernier
 * segment du chemin), sauf si MONGO_DB_NAME est renseigné.
 */
export { APP_ENV };

export const ENV_LABEL = { development: 'Développement', production: 'Production', test: 'Test' }[APP_ENV];
export const DB_SOURCE = ENV_FILE_NAME || 'variables d’environnement';

const DEFAULT_URIS = {
  development: 'mongodb://127.0.0.1:27017/copil_dev',
  production: 'mongodb://127.0.0.1:27017/copil_prod',
  test: 'mongodb://127.0.0.1:27017/copil_test',
};

// MONGODB_URI est le nom standard (Atlas, mongodb-memory-server, etc.).
// MONGO_URI reste accepté comme alias pour les configurations existantes.
// Avec --local, l'URI distante du fichier .env est ignorée au profit du MongoDB local.
const URI_FROM_ENV = LOCAL_MONGO
  ? process.env.MONGODB_URI_LOCAL
  : (process.env.MONGODB_URI || process.env.MONGO_URI);
export const MONGO_URI_VAR = LOCAL_MONGO
  ? 'MongoDB local (--local)'
  : process.env.MONGODB_URI
    ? 'MONGODB_URI'
    : process.env.MONGO_URI
      ? 'MONGO_URI'
      : null;
export const MONGO_URI = String(URI_FROM_ENV || DEFAULT_URIS[APP_ENV]).trim();

function resolveDatabaseName(uri) {
  if (process.env.MONGO_DB_NAME) return process.env.MONGO_DB_NAME;
  if (process.env.MONGODB_DB_NAME) return process.env.MONGODB_DB_NAME;
  try {
    const parsed = new URL(uri);
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0]);
    if (name) return name;
  } catch {
    // URI exotique : on retombe sur le nom par défaut de l'environnement.
  }
  return `copil_${APP_ENV}`;
}

export const MONGO_DB_NAME = resolveDatabaseName(MONGO_URI);

// Cible lisible (sans identifiants) pour les journaux et /api/health.
export const MONGO_TARGET = (() => {
  try {
    const parsed = new URL(MONGO_URI);
    const auth = parsed.username ? `${parsed.username}@` : '';
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}`;
  } catch {
    return MONGO_DB_NAME;
  }
})();

let client = null;
let database = null;

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('users').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { email: 1 }, name: 'uniq_email', unique: true },
      { key: { active: 1, role: 1 }, name: 'active_role' },
    ]),
    db.collection('clients').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { owner_id: 1 }, name: 'owner' },
      { key: { status: 1 }, name: 'status' },
      { key: { updated_at: -1 }, name: 'updated' },
    ]),
    db.collection('projects').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { client_id: 1 }, name: 'client' },
      { key: { manager_id: 1 }, name: 'manager' },
      { key: { status: 1 }, name: 'status' },
      { key: { due_date: 1 }, name: 'due' },
      { key: { quote_id: 1 }, name: 'quote' },
    ]),
    db.collection('tasks').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { assignee_id: 1 }, name: 'assignee' },
      { key: { client_id: 1 }, name: 'client' },
      { key: { project_id: 1 }, name: 'project' },
      { key: { status: 1 }, name: 'status' },
      { key: { due_date: 1 }, name: 'due' },
    ]),
    db.collection('quotes').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { number: 1 }, name: 'uniq_number', unique: true },
      { key: { client_id: 1 }, name: 'client' },
      { key: { status: 1 }, name: 'status' },
    ]),
    db.collection('timeline').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { client_id: 1, date: -1 }, name: 'client_date' },
    ]),
    db.collection('documents').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { client_id: 1 }, name: 'client' },
    ]),
    db.collection('audit_logs').createIndexes([
      { key: { id: 1 }, name: 'uniq_id', unique: true },
      { key: { created_at: -1 }, name: 'recent' },
    ]),
    db.collection('revoked_tokens').createIndexes([
      { key: { jti: 1 }, name: 'uniq_jti', unique: true },
      { key: { expires_at: 1 }, name: 'expiry', expireAfterSeconds: 0 },
    ]),
    db.collection('refresh_tokens').createIndexes([
      { key: { token_hash: 1 }, name: 'uniq_hash', unique: true },
      { key: { user_id: 1 }, name: 'user' },
      { key: { expires_at: 1 }, name: 'expiry', expireAfterSeconds: 0 },
    ]),
    db.collection('login_attempts').createIndexes([
      { key: { email: 1 }, name: 'uniq_email', unique: true },
    ]),
  ]);
}

export async function connect() {
  if (database) return database;
  const attempts = Math.max(1, Number(process.env.MONGO_CONNECT_ATTEMPTS) || 30);
  const delay = Math.max(100, Number(process.env.MONGO_CONNECT_DELAY_MS) || 500);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const candidate = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2000, appName: 'copil-api' });
    try {
      await candidate.connect();
      await candidate.db(MONGO_DB_NAME).command({ ping: 1 });
      database = candidate.db(MONGO_DB_NAME);
      client = candidate;
      await ensureIndexes(database);
      return database;
    } catch (error) {
      lastError = error;
      await candidate.close().catch(() => {});
      if (attempt < attempts) {
        if (attempt === 1) console.log(`  Connexion MongoDB… ${MONGO_TARGET}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Impossible de se connecter à MongoDB (${MONGO_TARGET}) après ${attempts} tentatives. `
    + `Vérifiez MONGODB_URI (ou MONGO_URI) et l'accès réseau au cluster. Détail : ${lastError?.message || 'inconnu'}`,
  );
}

export function db() {
  if (!database) throw new Error('MongoDB n’est pas connecté. Appelez connect() au démarrage.');
  return database;
}

export const collection = (name) => db().collection(name);

export async function closeDb() {
  if (client) await client.close();
  client = null;
  database = null;
}
