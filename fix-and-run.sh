#!/bin/bash

echo "🔧 Script de réparation et lancement WANT2..."
echo ""

# Réparer les permissions npm
echo "1️⃣ Réparation des permissions npm..."
sudo chown -R $(whoami) ~/.npm
echo "✅ Permissions réparées"

# Installation des dépendances  
echo "2️⃣ Installation des dépendances..."
npm install
echo "✅ Dépendances installées"

# Génération Prisma
echo "3️⃣ Génération du client Prisma..."
npm run db:generate
echo "✅ Client Prisma généré"

# Migration de la base de données
echo "4️⃣ Migration de la base de données..."
npm run db:migrate
echo "✅ Base de données migrée"

# Seeding des données de test
echo "5️⃣ Ajout des données de test..."
npm run db:seed
echo "✅ Données de test ajoutées"

echo ""
echo "🎉 Backend WANT2 prêt !"
echo "Pour lancer : npm run dev"
echo ""
echo "📋 Comptes de test :"
echo "   - sophie@test.com (password123)"
echo "   - thomas@test.com (password123)" 
echo "   - marie@test.com (password123)"
echo ""
echo "🌐 API: http://localhost:3000/api"
echo "🔌 WebSocket: ws://localhost:3000"