# Déploiement sur Render via Blueprint

Ce guide décrit le déploiement de Copil sur **Render.com** avec le fichier [`render.yaml`](./render.yaml) présent à la racine du dépôt. Le blueprint crée un **Web Service Docker** qui sert à la fois l’API Express et le client React compilé.

> Le dépôt ne contient aucun secret : `.env-dev` et `.env-prod` sont ignorés par Git. Toutes les valeurs de production sont fournies à Render, soit par le blueprint, soit via le dashboard.

## 1. Prérequis

- Un compte Render et un accès au dépôt GitHub `mamadouthiam0020/copil_mounir`.
- Une base **MongoDB Atlas** (ou équivalent) dédiée à la production, avec un utilisateur disposant des droits de lecture/écriture.
- Les secrets suivants, générés séparément et conservés dans un gestionnaire de secrets :

```bash
openssl rand -base64 48   # -> JWT_SECRET
openssl rand -base64 48   # -> AUDIT_SECRET
```

L’URI MongoDB doit contenir le nom de la base, par exemple :

```text
mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/Copil_Mounir_Prod
```

Le nom de base est déduit du chemin de l’URI ; `MONGO_DB_NAME` est inutile si le chemin est correct.

### Réseau MongoDB (Atlas)

Atlas autorise par défaut certaines IP. Les adresses de sortie de Render peuvent varier : autorisez `0.0.0.0/0` dans la liste des IP Atlas, ou utilisez un fournisseur MongoDB avec IP fixe. Limitez l’utilisateur de base aux droits nécessaires sur `Copil_Mounir_Prod`.

## 2. Déployer le blueprint

1. Dans Render : **New → Blueprint**.
2. Connectez le dépôt GitHub puis sélectionnez la branche `main`.
3. Render détecte automatiquement `render.yaml` à la racine.
4. Cliquez sur **Apply** et renseignez les variables marquées `sync: false` :

| Variable | Valeur attendue |
| --- | --- |
| `MONGODB_URI` | URI de connexion MongoDB de production |
| `JWT_SECRET` | Secret long et aléatoire, distinct de tout autre environnement |
| `AUDIT_SECRET` | Second secret long et aléatoire, distinct de `JWT_SECRET` |
| `CORS_ORIGIN` | Facultatif : URL publique si le front et l’API sont sur des domaines différents |

5. Attendez la fin du build. Render lance `docker build`, puis `npm start` (qui force `APP_ENV=production`).
6. Le health check appelle `/api/health` : il doit répondre `200`.

Le service écoute sur le port fourni par Render (`PORT`) ; ne le fixez pas dans le blueprint. Le plan `starter` est utilisé par défaut ; un plan `free` est possible pour un test mais le service se met en veille et le refresh cookie peut expirer pendant l’inactivité.

## 3. Variables du blueprint

| Variable | Valeur du blueprint | Remarque |
| --- | --- | --- |
| `APP_ENV`, `NODE_ENV` | `production` | Active CSP/HSTS, cookie `Secure`, CORS strict |
| `AUTO_SEED` | `false` | Aucun jeu de démonstration ni compte automatique en prod |
| `TRUST_PROXY` | `1` | Nécessaire derrière le proxy Render (rate limits, IP dans les audits) |
| `JWT_EXPIRES` | `15m` | Durée du token en mémoire |
| `REFRESH_TOKEN_DAYS` | `7` | Durée du cookie de renouvellement |
| `PORT` | Non définie | Fournie automatiquement par Render |

Les variables `sync: false` ne sont **jamais écrasées** par le fichier : elles restent dans le dashboard Render.

## 4. Premier compte administrateur

`AUTO_SEED=false` et `seed:prod` ne créent aucun compte par défaut : il n’existe donc **aucun mot de passe connu** en production.

Créez le Super Admin directement dans MongoDB :

1. Générez un hash bcrypt depuis une machine sûre, sans écrire le mot de passe dans l’historique :

```bash
node -e "console.log(require('bcryptjs').hashSync(process.env.ADMIN_PASSWORD, 12))"
```

2. Insérez l’utilisateur avec `mongosh` :

```javascript
use Copil_Mounir_Prod

db.users.insertOne({
  id: 'usr_admin_' + new Date().getTime().toString(36),
  name: 'Administrateur',
  email: 'admin@exemple.ma',
  password_hash: '<HASH_BCRYPT_GENERE>',
  role: 'SUPER_ADMIN',
  job_title: 'Directeur général',
  phone: null,
  avatar_color: '#0B2A5B',
  active: 1,
  token_version: 0,
  created_at: new Date().toISOString()
})
```

3. Connectez-vous sur l’URL Render avec ce compte, puis changez le mot de passe depuis **Paramètres → Compte**.

Les autres comptes se créent ensuite depuis **Équipe** (12 caractères minimum).

## 5. Vérification post-déploiement

```bash
curl https://<votre-service>.onrender.com/api/health
```

Réponse attendue : `{"ok":true,"service":"copil-api",...}`.

À vérifier également :

- Connexion avec le Super Admin, puis rafraîchissement de la page (le refresh cookie doit garder la session active).
- Déconnexion puis tentative de réutilisation de l’ancien cookie : elle doit échouer.
- Création d’un utilisateur de test `EMPLOYEE` : il ne doit voir ni devis, ni e-mails/téléphones des autres collaborateurs.
- Export CSV : les_cellules commençant par `=`, `+`, `-` ou `@` doivent être préfixées par `'`.
- Présence des entrées `auth.login`, `auth.refreshed` et `auth.logout` dans la collection `audit_logs`, avec `hash` et `prev_hash`.

## 6. Mises à jour et rotation des secrets

- **Code** : poussez sur `main` ; Render redéploie automatiquement (`autoDeploy: true`).
- **Blueprint** : modifiez `render.yaml`, commitez puis poussez ; Render propose les nouvelles variables à renseigner.
- **`JWT_SECRET`** : sa rotation invalide immédiatement toutes les sessions (tokens d’accès et refresh).
- **`AUDIT_SECRET`** : conservez l’ancienne valeur si vous devez vérifier l’intégrité des journaux historiques.

## 7. Dépannage

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| Build OK mais health check échoue | `PORT` forcé ou mauvais `dockerfilePath` | Laisser Render fournir `PORT` ; vérifier `./Dockerfile` |
| `JWT_SECRET doit être défini` | Variable absent du dashboard | Ajouter la variable dans Render puis redéployer |
| Erreur de connexion MongoDB | IP Atlas non autorisée ou URI sans nom de base | Autoriser les IP Render et vérifier l’URI |
| 403 sur toutes les routes | `APP_ENV` absent et URL publique sur un domaine distinct | Définir `CORS_ORIGIN` avec l’URL exacte |
| Sessions qui expirent immédiatement | Plusieurs instances avec des secrets différents | Garder `numInstances: 1` et les mêmes secrets |

En cas de besoin, les logs d’exécution sont dans l’onglet **Logs** du service Render et les actions métier dans la collection MongoDB `audit_logs`.
