import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Serveur MongoDB local de développement.
 * ---------------------------------------
 * Démarre un mongod isolé sur le port 27017 avec un stockage persistant dans
 * server/data/mongo-dev. Les bases copil_dev / copil_prod / copil_test y
 * coexistent, comme sur un serveur MongoDB classique.
 *
 * En développement et en production, ce script n'est pas utilisé par défaut :
 * MONGODB_URI pointe vers votre cluster MongoDB (Atlas, replica set, serveur dédié…).
 * Utilisez `npm run dev:local` pour travailler avec ce MongoDB local.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'data', 'mongo-dev');
const port = Number(process.env.MONGO_PORT) || 27017;

fs.mkdirSync(dbPath, { recursive: true });

let mongod;
try {
  mongod = await MongoMemoryServer.create({
    instance: {
      port,
      dbPath,
      dbName: 'copil_dev',
      storageEngine: 'wiredTiger',
      portGeneration: false,
    },
  });
} catch (error) {
  console.error(`\n  ✖ Impossible de démarrer MongoDB sur le port ${port}.`);
  console.error('    Un autre serveur MongoDB écoute peut-être déjà sur ce port.');
  console.error(`    Détail : ${error.message}\n`);
  process.exit(1);
}

console.log(`\n  MongoDB dev — mongodb://127.0.0.1:${port}`);
console.log(`  Données     : ${dbPath}`);
console.log('  Bases       : copil_dev (dev), copil_prod (prod locale), copil_test');
console.log('  Arrêt       : Ctrl+C\n');

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await mongod.stop({ doCleanup: false });
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
