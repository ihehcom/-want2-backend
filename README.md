# WANT2 Backend API

API Backend pour l'application WANT2 - Marketplace d'articles de luxe authentifiés.

## 🚀 Fonctionnalités

- ✅ **Authentification JWT** (access + refresh tokens)
- ✅ **Base de données PostgreSQL** avec Prisma ORM
- ✅ **Cache Redis** pour les performances
- ✅ **Upload d'images** avec Cloudinary
- ✅ **Rate Limiting** intelligent
- ✅ **Logging structuré** avec Winston
- ✅ **Validation robuste** des données
- ✅ **Gestion d'erreurs** centralisée
- ⏳ **Notifications temps réel** (Socket.io)
- ⏳ **Système d'offres/contre-offres**
- ⏳ **Engine de recommandations IA**

## 📋 Prérequis

- Node.js ≥ 18.0.0
- PostgreSQL ≥ 13
- Redis ≥ 6.0
- npm ≥ 9.0.0

## 🛠️ Installation

1. **Cloner et installer les dépendances**
```bash
cd backend
npm install
```

2. **Configuration des variables d'environnement**
```bash
cp .env.example .env
# Éditer le fichier .env avec vos configurations
```

3. **Setup de la base de données**
```bash
# Génération du client Prisma
npm run db:generate

# Migration de la base de données
npm run db:migrate

# Seed des données de test (optionnel)
npm run db:seed
```

4. **Démarrage en mode développement**
```bash
npm run dev
```

## 📚 API Endpoints

### 🔐 Authentification (`/api/auth`)

| Méthode | Endpoint | Description | Auth requise |
|---------|----------|-------------|--------------|
| POST | `/register` | Inscription utilisateur | Non |
| POST | `/login` | Connexion utilisateur | Non |
| POST | `/refresh` | Rafraîchir le token | Non |
| GET | `/profile` | Profil utilisateur | Oui |
| POST | `/logout` | Déconnexion | Oui |
| POST | `/logout-all` | Déconnexion tous appareils | Oui |
| GET | `/verify-email/:token` | Vérifier l'email | Non |
| POST | `/forgot-password` | Demande reset password | Non |
| POST | `/reset-password` | Reset password | Non |

### 👤 Utilisateurs (`/api/users`)
| Méthode | Endpoint | Description | Auth requise |
|---------|----------|-------------|--------------|
| GET | `/` | Liste utilisateurs | Oui (Admin) |
| GET | `/:id` | Détails utilisateur | Oui |
| PUT | `/:id` | Modifier utilisateur | Oui (Propriétaire) |
| DELETE | `/:id` | Supprimer utilisateur | Oui (Propriétaire) |

### 🛍️ Produits (`/api/products`)
| Méthode | Endpoint | Description | Auth requise |
|---------|----------|-------------|--------------|
| GET | `/` | Liste des produits | Non |
| GET | `/search` | Recherche produits | Non |
| GET | `/recommendations` | Recommandations IA | Oui |
| GET | `/:id` | Détails produit | Non |
| POST | `/` | Créer un produit | Oui (Vendeur) |
| PUT | `/:id` | Modifier produit | Oui (Propriétaire) |
| DELETE | `/:id` | Supprimer produit | Oui (Propriétaire) |
| POST | `/:id/like` | Liker un produit | Oui |
| DELETE | `/:id/like` | Unliker un produit | Oui |

### 💰 Offres (`/api/offers`)
| Méthode | Endpoint | Description | Auth requise |
|---------|----------|-------------|--------------|
| GET | `/` | Mes offres | Oui |
| GET | `/received` | Offres reçues | Oui |
| POST | `/` | Créer une offre | Oui |
| PUT | `/:id/accept` | Accepter une offre | Oui (Vendeur) |
| PUT | `/:id/reject` | Rejeter une offre | Oui (Vendeur) |
| POST | `/:id/counter` | Contre-offre | Oui (Vendeur) |

## 🏗️ Architecture

```
backend/
├── src/
│   ├── controllers/     # Logique métier
│   ├── middleware/      # Middlewares (auth, errors, etc.)
│   ├── routes/          # Définition des routes
│   ├── services/        # Services métier
│   ├── utils/           # Utilitaires (validators, logger, etc.)
│   ├── database/        # Configuration DB & Redis
│   └── server.js        # Point d'entrée
├── prisma/
│   └── schema.prisma    # Schéma de base de données
├── logs/                # Logs applicatifs
├── uploads/             # Fichiers uploadés (temporaire)
└── package.json
```

## 🔧 Configuration

### Variables d'environnement principales

```env
# Serveur
NODE_ENV=development
PORT=3000

# Base de données
DATABASE_URL="postgresql://user:password@localhost:5432/want2_dev"

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_URL=redis://localhost:6379

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 📊 Base de Données

### Modèles principaux

- **User** - Utilisateurs (acheteurs/vendeurs)
- **Product** - Produits mis en vente
- **Offer** - Offres et contre-offres
- **Like** - Likes sur les produits
- **Notification** - Notifications utilisateurs
- **UserPreference** - Préférences et filtres IA
- **AuthToken** - Tokens d'authentification
- **Report** - Signalements/rapports

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Tests avec couverture
npm run test:coverage

# Tests en mode watch
npm run test:watch
```

## 🚀 Déploiement

### Développement
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Docker (optionnel)
```bash
docker-compose up -d
```

## 📈 Monitoring

- **Health Check**: `GET /health`
- **API Documentation**: `GET /api`
- **Logs**: Dossier `logs/`
- **Métriques**: Redis + Prisma logs

## 🛡️ Sécurité

- ✅ Rate limiting par IP et utilisateur
- ✅ Validation stricte des données entrantes
- ✅ Hashage sécurisé des mots de passe (bcrypt)
- ✅ Tokens JWT avec rotation
- ✅ Headers de sécurité (Helmet)
- ✅ CORS configuré pour iOS
- ✅ Révocation de tokens
- ✅ Protection contre les attaques communes

## 🐛 Debugging

### Logs disponibles
- `logs/app.log` - Logs généraux
- `logs/error.log` - Erreurs uniquement
- `logs/combined.log` - Logs combinés

### Variables de debug
```env
LOG_LEVEL=debug  # Pour plus de verbosité
NODE_ENV=development  # Pour stack traces complètes
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
3. Commit les changements
4. Push vers la branche
5. Créer une Pull Request

## 📄 Licence

MIT - voir le fichier [LICENSE](LICENSE) pour plus de détails.