#!/bin/bash

# Script de configuration pour la production WANT2
echo "🚀 Configuration WANT2 Backend pour la Production"
echo "================================================"

# Variables par défaut (tu peux les modifier)
DB_URL=${1:-"postgresql://user:password@localhost:5432/want2_production"}
JWT_SECRET=${2:-$(openssl rand -base64 32)}
JWT_REFRESH_SECRET=${3:-$(openssl rand -base64 32)}

echo "📝 Création du fichier .env de production..."

cat > .env.production << EOF
# Configuration Production WANT2
NODE_ENV=production
PORT=3000

# Base de données PostgreSQL
DATABASE_URL="${DB_URL}"

# Secrets JWT (CHANGEZ CES VALEURS EN PRODUCTION)
JWT_SECRET="${JWT_SECRET}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET}"
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=30d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# CORS - Remplacez par vos vraies URLs
ALLOWED_ORIGINS=https://want2app.com,capacitor://localhost

# Logs
LOG_LEVEL=info

# Sécurité
BCRYPT_SALT_ROUNDS=12
MAX_FILE_SIZE=10485760

# Email (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Cloudinary (optionnel pour images)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
EOF

echo "✅ Fichier .env.production créé"
echo ""
echo "🔐 Secrets générés:"
echo "JWT_SECRET: ${JWT_SECRET}"
echo "JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}"
echo ""
echo "⚠️  IMPORTANT: Sauvegardez ces secrets dans un endroit sûr !"
echo ""
echo "📋 Variables à configurer manuellement:"
echo "- DATABASE_URL: URL de votre base PostgreSQL"
echo "- ALLOWED_ORIGINS: URLs autorisées pour CORS"
echo "- Variables email et Cloudinary (optionnelles)"
echo ""
echo "🔧 Prochaines étapes:"
echo "1. Modifier .env.production avec vos vraies valeurs"
echo "2. Exécuter: npm run db:migrate"
echo "3. Exécuter: npm run db:seed"
echo "4. Tester: npm start"
echo ""
echo "🚀 Prêt pour le déploiement !"