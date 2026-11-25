import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Détermine l'environnement actif.
 * Priorité : argument CLI (--prod / --test) > APP_ENV > NODE_ENV > development.
 */
function resolveEnv(argv = process.argv) {
  if (argv.includes('--prod') || argv.includes('--production')) return 'production';
  if (argv.includes('--test')) return 'test';
  const declared = String(process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (declared === 'production' || declared === 'prod') return 'production';
  if (declared === 'test') return 'test';
  return 'development';
}

export const APP_ENV = resolveEnv();

// `--local` force l'utilisation du MongoDB local (server/data/mongo-dev)
// même si le fichier .env de l'environnement pointe vers un cluster distant.
export const LOCAL_MONGO = process.argv.includes('--local');

// Un fichier .env par environnement, à la racine du projet.
// Les noms alternatifs sont acceptés pour rester compatible avec les conventions usuelles.
const ENV_FILES = {
  development: ['.env-dev', '.env.dev', '.env.development'],
  production: ['.env-prod', '.env.prod', '.env.production'],
  test: ['.env-test', '.env.test'],
};

function findEnvFile() {
  for (const name of ENV_FILES[APP_ENV]) {
    const candidate = path.join(PROJECT_ROOT, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export const ENV_FILE = findEnvFile();
export const ENV_FILE_NAME = ENV_FILE ? path.basename(ENV_FILE) : null;

// Les variables déjà définies dans le shell restent prioritaires :
// process.loadEnvFile ne remplace pas les valeurs existantes.
if (ENV_FILE) process.loadEnvFile(ENV_FILE);
