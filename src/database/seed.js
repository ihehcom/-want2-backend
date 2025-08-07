import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

// Données de seed
const categories = [
  'Vêtements', 'Chaussures', 'Accessoires', 'Sacs', 'Bijoux',
  'Montres', 'Beauté', 'Maison', 'Sport', 'Électronique', 'Art', 'Autre'
];

const brands = [
  'Louis Vuitton', 'Chanel', 'Hermès', 'Gucci', 'Prada', 'Rolex', 
  'Nike', 'Adidas', 'Apple', 'Samsung', 'Zara', 'H&M'
];

const conditions = ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'];

const locations = [
  'Paris, France', 'Lyon, France', 'Marseille, France', 'Toulouse, France',
  'Nice, France', 'Nantes, France', 'Montpellier, France', 'Strasbourg, France'
];

// Utilisateurs de test
const testUsers = [
  {
    name: 'Sophie Martin',
    email: 'sophie@test.com',
    userMode: 'BOTH'
  },
  {
    name: 'Thomas Dubois',
    email: 'thomas@test.com',
    userMode: 'SELLER'
  },
  {
    name: 'Marie Leroy',
    email: 'marie@test.com',
    userMode: 'BUYER'
  },
  {
    name: 'Pierre Moreau',
    email: 'pierre@test.com',
    userMode: 'BOTH'
  },
  {
    name: 'Julie Petit',
    email: 'julie@test.com',
    userMode: 'SELLER'
  }
];

// Produits de test
const testProducts = [
  {
    title: 'Sac Louis Vuitton Speedy 30 Authentique',
    description: 'Magnifique sac Louis Vuitton Speedy 30 en toile monogram. État impeccable, utilisé seulement quelques fois. Vient avec sa dust bag et certificat d\'authenticité.',
    price: 850.00,
    category: 'Sacs',
    brand: 'Louis Vuitton',
    condition: 'LIKE_NEW',
    color: 'Marron',
    mainImage: 'https://example.com/lv-speedy.jpg'
  },
  {
    title: 'Montre Rolex Submariner Vintage',
    description: 'Rare montre Rolex Submariner des années 80. Mouvement automatique en parfait état de marche. Quelques marques d\'usure normales pour l\'âge.',
    price: 8500.00,
    category: 'Montres',
    brand: 'Rolex',
    condition: 'VERY_GOOD',
    color: 'Acier',
    mainImage: 'https://example.com/rolex-sub.jpg'
  },
  {
    title: 'Baskets Nike Air Jordan 1 Retro High',
    description: 'Paire de Nike Air Jordan 1 Retro High "Bred" taille 42. Portées une seule fois, dans un état quasi neuf. Boîte originale incluse.',
    price: 180.00,
    category: 'Chaussures',
    brand: 'Nike',
    condition: 'LIKE_NEW',
    size: '42',
    color: 'Noir/Rouge',
    mainImage: 'https://example.com/jordan1.jpg'
  },
  {
    title: 'Robe Chanel en Tweed Vintage',
    description: 'Authentique robe Chanel en tweed des années 90. Coupe iconique, parfaite pour des occasions spéciales. Quelques signes d\'usage mineurs.',
    price: 1200.00,
    category: 'Vêtements',
    brand: 'Chanel',
    condition: 'GOOD',
    size: 'M',
    color: 'Rose/Blanc',
    mainImage: 'https://example.com/chanel-dress.jpg'
  },
  {
    title: 'iPhone 14 Pro Max 256GB',
    description: 'iPhone 14 Pro Max 256GB en excellent état. Protection écran et coque depuis l\'achat. Batterie à 98%. Boîte et accessoires inclus.',
    price: 1100.00,
    category: 'Électronique',
    brand: 'Apple',
    condition: 'VERY_GOOD',
    color: 'Violet',
    mainImage: 'https://example.com/iphone14.jpg'
  },
  {
    title: 'Collier Hermès en Argent',
    description: 'Collier Hermès modèle Chaîne d\'Ancre en argent massif. Très peu porté, éclat parfait. Pochette Hermès incluse.',
    price: 450.00,
    category: 'Bijoux',
    brand: 'Hermès',
    condition: 'LIKE_NEW',
    color: 'Argent',
    mainImage: 'https://example.com/hermes-collar.jpg'
  },
  {
    title: 'Tableau Contemporain Original',
    description: 'Œuvre originale d\'artiste contemporain français. Huile sur toile 60x80cm. Pièce unique signée et certifiée.',
    price: 2500.00,
    category: 'Art',
    brand: null,
    condition: 'NEW',
    color: 'Multicolore',
    mainImage: 'https://example.com/painting.jpg'
  },
  {
    title: 'Sac à dos Gucci GG Supreme',
    description: 'Sac à dos Gucci en toile GG Supreme avec détails en cuir. Design moderne et pratique. État impeccable.',
    price: 980.00,
    category: 'Sacs',
    brand: 'Gucci',
    condition: 'LIKE_NEW',
    color: 'Beige/Marron',
    mainImage: 'https://example.com/gucci-backpack.jpg'
  }
];

// Fonction utilitaire pour générer des données aléatoires
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];
const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomBoolean = () => Math.random() > 0.5;

async function main() {
  try {
    logger.info('🌱 Début du seeding de la base de données...');

    // Nettoyer les données existantes
    logger.info('🗑️ Nettoyage des données existantes...');
    await prisma.notification.deleteMany();
    await prisma.productView.deleteMany();
    await prisma.like.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.product.deleteMany();
    await prisma.userPreference.deleteMany();
    await prisma.user.deleteMany();

    // Créer les utilisateurs
    logger.info('👥 Création des utilisateurs...');
    const hashedPassword = await bcrypt.hash('Password123', 12);
    
    const createdUsers = [];
    for (const userData of testUsers) {
      const user = await prisma.user.create({
        data: {
          ...userData,
          password: hashedPassword,
          isVerified: getRandomBoolean()
        }
      });
      createdUsers.push(user);
      
      // Créer les préférences pour chaque utilisateur
      await prisma.userPreference.create({
        data: {
          userId: user.id,
          emailNotifications: getRandomBoolean(),
          pushNotifications: getRandomBoolean(),
          offerNotifications: true,
          likeNotifications: getRandomBoolean(),
          maxPrice: getRandomNumber(500, 5000),
          minPrice: getRandomNumber(50, 300),
          requireAuthenticated: getRandomBoolean(),
          minAuthenticityScore: Math.random() * 0.5 + 0.5,
          preferredCategories: JSON.stringify(categories.filter(() => Math.random() > 0.7)),
          preferredBrands: JSON.stringify(brands.filter(() => Math.random() > 0.8))
        }
      });
    }

    // Créer les produits
    logger.info('📦 Création des produits...');
    const createdProducts = [];
    
    for (const productData of testProducts) {
      const sellerId = getRandomItem(createdUsers.filter(u => ['SELLER', 'BOTH'].includes(u.userMode))).id;
      
      const product = await prisma.product.create({
        data: {
          ...productData,
          sellerId,
          location: getRandomItem(locations),
          latitude: 48.8566 + (Math.random() - 0.5) * 0.1,
          longitude: 2.3522 + (Math.random() - 0.5) * 0.1,
          authenticityScore: Math.random() * 0.4 + 0.6,
          isAuthenticated: getRandomBoolean(),
          images: JSON.stringify([productData.mainImage]),
          status: getRandomItem(['ACTIVE', 'ACTIVE', 'ACTIVE', 'SOLD']) // 75% actifs
        }
      });
      createdProducts.push(product);
    }

    // Générer des produits supplémentaires
    for (let i = 0; i < 20; i++) {
      const sellerId = getRandomItem(createdUsers.filter(u => ['SELLER', 'BOTH'].includes(u.userMode))).id;
      const category = getRandomItem(categories);
      const brand = Math.random() > 0.3 ? getRandomItem(brands) : null;
      
      const product = await prisma.product.create({
        data: {
          title: `${category} ${brand || 'Sans marque'} #${i + 1}`,
          description: `${category.toLowerCase()} de qualité en ${getRandomItem(conditions.map(c => c.toLowerCase()))} état. Pièce unique à ne pas manquer !`,
          price: getRandomNumber(20, 2000),
          category,
          brand,
          condition: getRandomItem(conditions),
          sellerId,
          location: getRandomItem(locations),
          latitude: 48.8566 + (Math.random() - 0.5) * 2,
          longitude: 2.3522 + (Math.random() - 0.5) * 2,
          authenticityScore: Math.random() * 0.4 + 0.6,
          isAuthenticated: getRandomBoolean(),
          color: getRandomItem(['Noir', 'Blanc', 'Rouge', 'Bleu', 'Vert', 'Marron', 'Gris']),
          size: Math.random() > 0.5 ? getRandomItem(['XS', 'S', 'M', 'L', 'XL', '38', '40', '42']) : null,
          mainImage: `https://example.com/product${i + 1}.jpg`,
          images: JSON.stringify([`https://example.com/product${i + 1}.jpg`]),
          status: getRandomItem(['ACTIVE', 'ACTIVE', 'ACTIVE', 'SOLD'])
        }
      });
      createdProducts.push(product);
    }

    // Créer des likes
    logger.info('❤️ Création des likes...');
    const activeProducts = createdProducts.filter(p => p.status === 'ACTIVE');
    
    for (let i = 0; i < 50; i++) {
      const userId = getRandomItem(createdUsers).id;
      const product = getRandomItem(activeProducts);
      
      // Éviter de liker son propre produit
      if (product.sellerId !== userId) {
        try {
          await prisma.like.create({
            data: {
              userId,
              productId: product.id
            }
          });
        } catch (error) {
          // Ignorer les doublons
        }
      }
    }

    // Créer des vues de produits
    logger.info('👁️ Création des vues...');
    for (let i = 0; i < 100; i++) {
      const userId = Math.random() > 0.3 ? getRandomItem(createdUsers).id : null;
      const product = getRandomItem(createdProducts);
      
      await prisma.productView.create({
        data: {
          productId: product.id,
          userId,
          ipAddress: `192.168.1.${getRandomNumber(1, 254)}`,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          createdAt: new Date(Date.now() - getRandomNumber(0, 30) * 24 * 60 * 60 * 1000)
        }
      });
    }

    // Créer des offres
    logger.info('💰 Création des offres...');
    for (let i = 0; i < 30; i++) {
      const buyers = createdUsers.filter(u => ['BUYER', 'BOTH'].includes(u.userMode));
      const buyerId = getRandomItem(buyers).id;
      const product = getRandomItem(activeProducts);
      
      // Éviter de faire une offre sur son propre produit
      if (product.sellerId !== buyerId) {
        const offerAmount = product.price * (0.7 + Math.random() * 0.25); // 70-95% du prix
        
        try {
          const offer = await prisma.offer.create({
            data: {
              productId: product.id,
              buyerId,
              sellerId: product.sellerId,
              amount: Math.round(offerAmount * 100) / 100,
              message: getRandomItem([
                'Bonjour, je suis très intéressé par votre article.',
                'Belle pièce ! Accepteriez-vous cette offre ?',
                'Produit magnifique, j\'aimerais l\'acheter.',
                'Offre sérieuse, paiement immédiat possible.'
              ]),
              status: getRandomItem(['PENDING', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED']),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              createdAt: new Date(Date.now() - getRandomNumber(0, 10) * 24 * 60 * 60 * 1000)
            }
          });

          // Créer quelques contre-offres
          if (Math.random() > 0.8 && offer.status === 'PENDING') {
            const counterAmount = offer.amount * (1.1 + Math.random() * 0.2); // 110-130% de l'offre
            
            await prisma.offer.create({
              data: {
                productId: product.id,
                buyerId,
                sellerId: product.sellerId,
                amount: Math.round(counterAmount * 100) / 100,
                message: 'Contre-offre du vendeur',
                parentOfferId: offer.id,
                status: 'PENDING',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                createdAt: new Date(offer.createdAt.getTime() + 60 * 60 * 1000) // 1h après
              }
            });
          }
        } catch (error) {
          // Ignorer les doublons d'offres
        }
      }
    }

    // Créer des notifications
    logger.info('🔔 Création des notifications...');
    const notificationTypes = [
      'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_COUNTER',
      'PRODUCT_LIKED', 'ACCOUNT_VERIFIED', 'SYSTEM_MESSAGE'
    ];

    for (let i = 0; i < 40; i++) {
      const userId = getRandomItem(createdUsers).id;
      const type = getRandomItem(notificationTypes);
      
      let title, message;
      switch (type) {
        case 'OFFER_RECEIVED':
          title = 'Nouvelle offre reçue !';
          message = 'Vous avez reçu une nouvelle offre sur un de vos produits.';
          break;
        case 'OFFER_ACCEPTED':
          title = 'Offre acceptée ! 🎉';
          message = 'Votre offre a été acceptée !';
          break;
        case 'PRODUCT_LIKED':
          title = 'Nouveau like !';
          message = 'Quelqu\'un a liké un de vos produits.';
          break;
        default:
          title = 'Notification';
          message = 'Vous avez une nouvelle notification.';
      }

      await prisma.notification.create({
        data: {
          type,
          title,
          message,
          userId,
          isRead: getRandomBoolean(),
          readAt: getRandomBoolean() ? new Date() : null,
          data: JSON.stringify({ test: true }),
          createdAt: new Date(Date.now() - getRandomNumber(0, 7) * 24 * 60 * 60 * 1000)
        }
      });
    }

    // Statistiques finales
    const stats = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.offer.count(),
      prisma.like.count(),
      prisma.notification.count(),
      prisma.productView.count()
    ]);

    logger.info('✅ Seeding terminé avec succès !');
    logger.info(`📊 Statistiques créées:`);
    logger.info(`   - ${stats[0]} utilisateurs`);
    logger.info(`   - ${stats[1]} produits`);
    logger.info(`   - ${stats[2]} offres`);
    logger.info(`   - ${stats[3]} likes`);
    logger.info(`   - ${stats[4]} notifications`);
    logger.info(`   - ${stats[5]} vues de produits`);
    
    logger.info('🔑 Comptes de test créés (mot de passe: Password123):');
    testUsers.forEach(user => {
      logger.info(`   - ${user.email} (${user.userMode})`);
    });

  } catch (error) {
    logger.error('❌ Erreur lors du seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution du script
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });