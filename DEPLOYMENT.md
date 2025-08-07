# 🚀 Guide de Déploiement WANT2 Backend

Ce guide détaille comment déployer le backend WANT2 en ligne pour le rendre accessible publiquement.

## 📋 Prérequis

- Compte GitHub (gratuit)
- Compte Railway (gratuit) - https://railway.app
- Git installé localement

## 🎯 Option 1 : Déploiement avec Railway (Recommandé)

### Étape 1 : Préparer le code

1. **Créer un repository GitHub** :
```bash
cd /Users/liam/Documents/WANT 2/backend
git init
git add .
git commit -m "Initial backend setup for WANT2"
```

2. **Créer un nouveau repo sur GitHub** :
   - Aller sur https://github.com/new
   - Nom : `want2-backend`
   - Public ou Private (au choix)
   - Créer le repository

3. **Pousser le code** :
```bash
git remote add origin https://github.com/VOTRE-USERNAME/want2-backend.git
git branch -M main
git push -u origin main
```

### Étape 2 : Déployer sur Railway

1. **Se connecter à Railway** :
   - Aller sur https://railway.app
   - Se connecter avec GitHub

2. **Créer un nouveau projet** :
   - Cliquer "New Project"
   - Sélectionner "Deploy from GitHub repo"
   - Choisir le repo `want2-backend`

3. **Configurer les variables d'environnement** :
   - Aller dans Settings > Variables
   - Ajouter ces variables **OBLIGATOIRES** :

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:password@hostname:5432/railway
JWT_SECRET=your_super_secure_jwt_secret_minimum_32_characters_long
JWT_REFRESH_SECRET=your_super_secure_refresh_secret_minimum_32_characters
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=30d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
ALLOWED_ORIGINS=*
LOG_LEVEL=info
BCRYPT_SALT_ROUNDS=12
MAX_FILE_SIZE=10485760
```

4. **Ajouter une base de données PostgreSQL** :
   - Dans le projet Railway, cliquer "New Service"
   - Sélectionner "PostgreSQL"
   - Railway va automatiquement créer la base et configurer `DATABASE_URL`

5. **Le déploiement se lance automatiquement** !
   - Railway détecte automatiquement Node.js
   - Utilise le `railway.json` pour la configuration
   - Installe les dépendances et démarre le serveur

### Étape 3 : Récupérer l'URL publique

Une fois déployé :
1. Dans le dashboard Railway, aller dans Settings > Public Networking
2. Cliquer "Generate Domain"
3. Noter l'URL (ex: `want2-backend-production.up.railway.app`)

## 🎯 Option 2 : Déploiement avec Render (Alternative)

### Étape 1 : Créer un compte Render
- Aller sur https://render.com
- Se connecter avec GitHub

### Étape 2 : Créer un Web Service
1. **Nouveau Web Service** :
   - Cliquer "New +" > "Web Service"
   - Connecter le repo GitHub `want2-backend`

2. **Configuration** :
   - **Name** : `want2-backend`
   - **Runtime** : `Node`
   - **Build Command** : `npm install && npx prisma generate`
   - **Start Command** : `npx prisma migrate deploy && npm start`

3. **Variables d'environnement** : Ajouter les mêmes que Railway

4. **Base de données** :
   - Créer un PostgreSQL service séparément
   - Copier l'URL dans `DATABASE_URL`

## 📱 Étape 4 : Mettre à jour l'app iOS

Modifier le fichier Swift pour utiliser l'URL de production :

```swift
// Dans APIManager.swift
let baseURL = "https://VOTRE-URL-RAILWAY.up.railway.app/api"
// ou 
let baseURL = "https://want2-backend.onrender.com/api"
```

## 🧪 Étape 5 : Tester le déploiement

### Tests de base :
```bash
# Health check
curl https://VOTRE-URL/health

# Test API
curl https://VOTRE-URL/api

# Test inscription
curl -X POST https://VOTRE-URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com", 
    "password": "password123",
    "userMode": "BUYER"
  }'
```

## 🔒 Étape 6 : Sécurisation (Important)

1. **Changer les secrets JWT** :
   - Générer des clés sécurisées (32+ caractères)
   - Utiliser un générateur de mots de passe

2. **Configurer CORS** :
   - Remplacer `ALLOWED_ORIGINS=*` par les vraies URLs
   - Ex: `ALLOWED_ORIGINS=https://yourapp.com,capacitor://localhost`

3. **Monitoring** :
   - Railway/Render fournissent des logs automatiquement
   - Surveiller les erreurs dans les dashboards

## 🎉 Étape 7 : Ajouter des données de test

Depuis le dashboard Railway/Render, exécuter :
```bash
npx prisma db seed
```

Ou créer manuellement des utilisateurs via l'API.

## 📊 URLs finales

Une fois déployé, votre API sera accessible à :
- **Base URL** : `https://votre-app.up.railway.app`
- **API Endpoint** : `https://votre-app.up.railway.app/api`
- **Health Check** : `https://votre-app.up.railway.app/health`
- **Documentation** : `https://votre-app.up.railway.app/api`

## 🔧 Dépannage

### Erreur de build :
- Vérifier les logs dans Railway/Render
- S'assurer que `package.json` est correct
- Vérifier que `DATABASE_URL` est configuré

### Base de données non accessible :
- Vérifier que PostgreSQL est bien ajouté
- Attendre la fin de la création de la DB (quelques minutes)
- Vérifier les migrations Prisma

### CORS Errors :
- Vérifier `ALLOWED_ORIGINS`
- Tester avec `*` temporairement
- S'assurer que l'app iOS utilise la bonne URL

## 💰 Coûts

- **Railway** : Gratuit jusqu'à $5/mois d'usage
- **Render** : Gratuit avec limitations, puis $7/mois

Les deux offrent largement assez pour commencer !

---

🚀 **Une fois déployé, votre app WANT2 sera accessible à tous dans le monde entier !**