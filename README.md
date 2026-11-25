# Copil — Plateforme de pilotage d’activité

Application SaaS complète de pilotage commercial et opérationnel : dashboard, tâches, clients & programmes, planning des livraisons, devis, rapports, équipe et paramètres.

Interface premium bleu nuit / or, responsive desktop, tablette et mobile, en français.

## Stack MERN

Copil est une application **MERN** : **M**ongoDB (driver officiel `mongodb`), **E**xpress 5, **R**eact 19 avec TypeScript, **N**ode.js. Vite est uniquement l’outil de développement et de build du front React ; aucun autre système de base de données n’est utilisé.

| Couche | Technologies |
| --- | --- |
| Frontend (R) | React 19, TypeScript, Vite 6, Tailwind CSS 3, Recharts, Lucide, jsPDF |
| Backend (E/N) | Node.js 20.19+, Express 5, JWT, bcrypt, Zod |
| Données (M) | MongoDB, driver officiel `mongodb` (collections `users`, `clients`, `projects`, `tasks`, `quotes`, `timeline`, `documents`, `audit_logs`, `settings`) |
| Build | Client compilé dans `client/dist`, servi directement par l’API Express |

Le projet est configuré pour vos deux bases **MongoDB Atlas** : `Copil_Mounir_Dev` en développement et `Copil_Mounir_Prod` en production. `npm run dev` ne démarre donc aucun MongoDB local : l’API se connecte directement au cluster défini dans `.env-dev`. Un MongoDB local reste disponible en option via `npm run dev:local`.

## Environnements, fichiers .env et bases de données

Deux fichiers d’environnement coexistent à la racine du projet. Le serveur choisit automatiquement le bon fichier et la bonne base MongoDB :

| Fichier | Utilisé par | Base MongoDB |
| --- | --- | --- |
| `.env-dev` | `npm run dev`, `npm run start:dev`, `npm run seed:dev` | `Copil_Mounir_Dev` (Atlas) |
| `.env-prod` | `npm start`, `npm run seed:prod` | `Copil_Mounir_Prod` (Atlas) |

La priorité de détection est : `--prod` / `--test` (argument CLI) → `APP_ENV` → `NODE_ENV` → développement. Le fichier correspondant est ensuite chargé automatiquement par `server/src/env.js`. Les variables déjà définies dans le shell restent prioritaires sur celles du fichier.

Variables reconnues dans les fichiers `.env` :

| Variable | Rôle |
| --- | --- |
| `NODE_ENV` | Environnement de l’application (`development` / `production`) |
| `PORT` | Port de l’API (4000 par défaut, également suivi par le proxy Vite en dev) |
| `JWT_SECRET` | **Obligatoire** : secret de signature des tokens d’accès, distinct entre dev et prod |
| `AUDIT_SECRET` | **Obligatoire** : clé HMAC de la chaîne d’intégrité du journal d’audit |
| `JWT_EXPIRES` | Durée de vie du token d’accès en mémoire (`15m` par défaut) |
| `REFRESH_TOKEN_DAYS` | Durée de vie du cookie de renouvellement (`7` jours par défaut) |
| `MONGODB_URI` | URI de connexion MongoDB propre à chaque environnement (alias accepté : `MONGO_URI`) |
| `MONGO_DB_NAME` | Nom de base explicite (facultatif, sinon déduit du chemin de l’URI) |
| `AUTO_SEED` | `true` en dev/test : ajoute les comptes de démonstration manquants, puis crée le reste du jeu de données si aucun client n’existe ; `false` désactive l’initialisation. En production, l’initialisation automatique est désactivée |
| `CORS_ORIGIN` | Origines autorisées séparées par des virgules (obligatoire si l’API et le client sont sur des domaines distincts) |
| `TRUST_PROXY` | Nombre de proxys de confiance ou adresse CIDR (à définir derrière nginx/load balancer) |
| `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_MAX` | Limites de requêtes et de tentatives de connexion |
| `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES` | Verrouillage temporaire après échecs de connexion |
| `ALLOW_PROD_SEED`, `SEED_DEMO_PASSWORD` | Uniquement pour un `seed:prod` volontaire ; voir section scripts |

Le nom de la base est lu directement dans l’URI (`.../Copil_Mounir_Dev` ou `.../Copil_Mounir_Prod`). Si vous changez de cluster, remplacez simplement `MONGODB_URI` dans le fichier d’environnement concerné.

Les fichiers `.env-dev` et `.env-prod` contiennent des secrets et ne sont **pas versionnés** (voir `.gitignore` et `.env.example`). En déploiement, fournissez-les via un volume ou des variables d’environnement :

```bash
MONGODB_URI="mongodb+srv://user:password@cluster.example.mongodb.net/Copil_Mounir_Prod" npm start
```

En développement/test (`AUTO_SEED=true`), les comptes de démonstration manquants sont ajoutés au démarrage, même si la base contient déjà des utilisateurs ; le reste du jeu de données est créé uniquement si aucun client n’existe. Rien n’est écrasé. La production n’est jamais initialisée au démarrage et aucun compte à mot de passe connu n’y est créé. `npm run seed:prod` est refusé tant que `ALLOW_PROD_SEED=1` n’est pas explicitement défini ; même autorisé, il n’insère aucun compte de démonstration (créez votre Super Admin via l’interface/MongoDB ou fournissez `SEED_DEMO_PASSWORD`, 12 caractères minimum). `npm run seed` réinitialise uniquement la base **dev**.

## Démarrage

Prérequis : **Node.js 20.19+** (le driver MongoDB et `mongodb-memory-server` requièrent cette version).

```bash
npm install
npm run dev
```

`npm run dev` lance deux processus : API (`API`) et frontend Vite (`WEB`).

- Application : http://localhost:5173
- API : http://localhost:4000/api
- Base utilisée : `Copil_Mounir_Dev` sur MongoDB Atlas (fichier `.env-dev`)

Pour travailler avec un MongoDB local à la place d’Atlas :

```bash
npm run dev:local   # démarre MongoDB local + API + frontend
npm run mongo       # démarre uniquement le MongoDB local
```

En production locale :

```bash
npm run build
npm start
```

L’application complète est alors servie sur http://localhost:4000 avec la base `Copil_Mounir_Prod` (fichier `.env-prod`), sur votre cluster Atlas.

En production comme en développement, `JWT_SECRET` et `AUDIT_SECRET` sont obligatoires : le serveur refuse de démarrer si l’un deux est absent (aucun secret de développement n’est utilisé). Générez-les séparément avec `openssl rand -base64 48` et ne les réutilisez pas d’un environnement à l’autre.

## Comptes de démonstration

En développement/test (`AUTO_SEED=true`), ces comptes sont ajoutés automatiquement au démarrage s’ils manquent, même si la base contient déjà des utilisateurs. `npm run seed` permet de recréer l’ensemble à tout moment ; il réinitialise également le jeu de données.

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Super Admin | `mounir@copil.ma` | `admin123` |
| Admin | `sarah@copil.ma` | `admin123` |
| Manager | `yassine@copil.ma` | `manager123` |
| Employé | `karim@copil.ma` | `employe123` |

Le jeu de données comprend 8 clients, 16 programmes, 24 tâches, 9 devis, des documents, des échéances et un journal d’audit.

### Première connexion

```bash
npm run dev
```

1. Ouvrez http://localhost:5173.
2. Connectez-vous avec `mounir@copil.ma` / `admin123`.
3. Modifiez le mot de passe depuis **Paramètres → Compte**, puis ceux des autres comptes depuis **Équipe**.

> Ces identifiants sont réservés à la démonstration **development/test**. La production n’est jamais initialisée automatiquement (`AUTO_SEED=false`) et `seed:prod` n’y crée aucun compte par défaut. Créez votre Super Admin directement dans MongoDB avec un mot de passe d’au moins 12 caractères.

## Modules

- **Dashboard** — 4 indicateurs clés, priorités du jour consolidées (tâches, échéances, relances, rendez-vous), livraisons à venir, programmes actifs et tendances.
- **To-do List** — vues Kanban, liste et calendrier, priorités, assignations, progression, commentaires, pièces jointes, détection automatique des retards.
- **Clients & Programmes** — CRM complet, fiche client avec timeline, documents, projets, devis et prochaines étapes.
- **Planning & Livraisons** — vues mois, semaine, timeline et liste, alertes à J-7, J-3, J-1, jour J et retards.
- **Devis** — éditeur dynamique, totaux et TVA automatiques, PDF soigné, impression, duplication, conversion en projet, statuts.
- **Rapports** — période 3/6/9/12 mois, chiffre d’affaires, conversion, charge de l’équipe, secteurs, statuts, export CSV.
- **Équipe & Utilisateurs** — création/modification/désactivation, charge de travail, matrice des permissions, audit.
- **Paramètres** — identité entreprise, numérotation et conditions de devis, compte et mot de passe.

## Rôles et sécurité

Les permissions sont appliquées **côté serveur**, pas seulement dans l’interface.

| Action | SUPER_ADMIN | ADMIN | MANAGER | EMPLOYÉ |
| --- | --- | --- | --- | --- |
| Dashboard, tâches, clients, planning | ✅ | ✅ | ✅ | ✅ (lecture / ses tâches) |
| Devis, rapports, équipe | ✅ | ✅ | ✅ | ❌ |
| Créer/modifier tâches et programmes | ✅ | ✅ | ✅ | ❌ |
| Modifier les clients | ✅ | ✅ | ✅ | ❌ (lecture seule) |
| Gérer les utilisateurs | ✅ | ✅ | ❌ | ❌ |
| Modifier les paramètres entreprise/devis | ✅ | ✅ | ❌ | ❌ |

Un employé ne voit que les clients et programmes liés à lui (propriétaire, manager ou tâche assignée), uniquement ses tâches, jamais les devis ni les données d’équipe détaillées (e-mail, téléphone, statistiques). L’annuaire des non-admins est volontairement minimal. Chaque action sensible est enregistrée dans un journal d’audit à chaîne HMAC (`prev_hash` / `hash`, clé `AUDIT_SECRET`).

### Sessions

- Le token d’accès JWT (15 min par défaut) reste **en mémoire** côté client : il n’est ni persistance dans `localStorage`, ni exposé à un cookie lisible par JavaScript.
- Le refresh token est un cookie `HttpOnly`, `Secure` en production, `SameSite=Lax`, limité au chemin `/api/auth`, à rotation automatique à chaque renouvellement.
- Le client tente silencieusement `/api/auth/refresh` sur une réponse 401, avec une seule requête de refresh concurrentielle.
- `logout`, changement de mot de passe, changement de rôle, désactivation et suppression de compte révoquent les sessions via `jti` et `token_version`.
- Les mots de passe sont hachés avec bcrypt (coût 12) et doivent contenir au moins 12 caractères.
- Connexion : limite globale, verrouillage temporaire après échecs, messages d’erreur uniformes et journalisation des tentatives.
- Les documents uploadés sont validés (MIME autorisé, base64 valide, taille max 6 Mo) et leur téléchargement est tracé. Les pièces jointes de tâches sont limitées à 3 Mo. Les exports CSV neutralisent les formules (`=`, `+`, `-`, `@`).

## Déploiement

```bash
# Build de l'image (les secrets sont injectés à l'exécution, jamais dans l'image)
docker build -t copil:latest .

docker run --rm -p 4000:4000 \
  --env-file /chemin/secret/.env-prod \
  -e TRUST_PROXY=1 \
  copil:latest
```

Un exemple de reverse proxy HTTPS est fourni dans `deploy/nginx.conf` (HSTS, limitations de taille, headers transmis à Express). Définissez `CORS_ORIGIN` si le front et l’API sont servis depuis des origines différentes.

Le workflow `.github/workflows/ci.yml` exécute à chaque push/PR : `npm audit --audit-level=high` (SCA), `node --check` sur le serveur, typecheck, build client et refus de tout fichier `.env*` versionné.

## Scripts utiles

```bash
npm run mongo       # démarre uniquement le MongoDB local de développement
npm run dev         # API + frontend en développement (base Atlas Copil_Mounir_Dev)
npm run dev:local   # MongoDB local + API + frontend (sans Atlas)
npm run build       # build de production du client
npm start           # API + client compilé (base Atlas Copil_Mounir_Prod)
npm run start:dev   # API + client compilé (base Atlas Copil_Mounir_Dev)
npm run typecheck   # vérification TypeScript
npm run seed        # recrée comptes et données de démonstration (dev, destructif)
npm run seed:dev    # idem, explicite
npm run seed:prod   # production (destructif, refusé sans ALLOW_PROD_SEED=1, sans comptes de démo)
```

`npm run seed` et `npm run seed:prod` sont destructifs : ils vident puis recréent les collections de l’environnement ciblé. `seed:prod` nécessite `ALLOW_PROD_SEED=1` et ne crée pas de comptes de démonstration. Sans ces scripts, le démarrage ne crée que ce qui manque et ne touche jamais les données existantes.

## Structure

```text
client/             React + TypeScript + Tailwind
  src/pages/        Dashboard, Tasks, Clients, Planning, Quotes, Reports, Team, Settings
  src/components/   UI, layouts, modales, command palette
  src/lib/          API, PDF, formatage, constantes
server/
  src/env.js        sélection et chargement de .env-dev / .env-prod
  src/db.js         connexion MongoDB, indexes et métadonnées d’environnement
  src/routes/       clients, projects, tasks, quotes, users, settings, reports, dashboard
  src/auth.js       JWT, refresh, révocation, rôles et permissions
  src/access.js     périmètre client/projet par utilisateur
  src/seed.js       comptes par défaut et données de démonstration
  scripts/          mongo-dev.js (MongoDB local persistant, dev uniquement)
  data/             mongo-dev/ (données du MongoDB local, non versionnées)
.env.example        modèle de configuration (sans secret réel)
.env-dev            configuration de développement (non versionnée)
.env-prod           configuration de production (non versionnée)
Dockerfile          image de production multi-étages
deploy/nginx.conf   reverse proxy HTTPS
.github/workflows/ci.yml vérifications CI + SCA
```

## Notes

- Les PDF de devis sont générés côté client (jsPDF) et téléchargés en A4 aux couleurs de la marque.
- L’impression ouvre une fenêtre autonome avec feuille de style dédiée.
- L’export CSV utilise un BOM UTF-8 et le séparateur `;` pour Excel francophone.
- Le code source est organisé par domaine ; les montants sont stockés en MAD mais la devise est configurable.
- Les comptes de démonstration ne doivent jamais être conservés tels quels en production : créez vos propres comptes.
- En cas de compromission, faites pivoter `JWT_SECRET` et `AUDIT_SECRET` : la rotation de `JWT_SECRET` invalide toutes les sessions existantes.
