import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { cache } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger, appLogger } from '../utils/logger.js';
import { validateUserUpdate, validatePreferencesUpdate } from '../utils/validators.js';
import bcrypt from 'bcryptjs';

// Obtenir le profil de l'utilisateur connecté
export const getProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Vérifier le cache
  const cacheKey = `user:profile:${userId}`;
  let user = await cache.get(cacheKey);

  if (!user) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        userMode: true,
        isVerified: true,
        phone: true,
        createdAt: true,
        _count: {
          select: {
            products: true,
            offers: true,
            receivedOffers: true,
            likes: true
          }
        }
      }
    });

    if (!user) {
      throw errors.notFound('Utilisateur');
    }

    // Mise en cache pour 5 minutes
    await cache.set(cacheKey, user, 300);
  }

  res.json({
    success: true,
    data: { user }
  });
});

// Obtenir un profil utilisateur public
export const getPublicProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // Vérifier le cache
  const cacheKey = `user:public:${userId}`;
  let user = await cache.get(cacheKey);

  if (!user) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        userMode: true,
        isVerified: true,
        phone: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: {
              where: { status: 'ACTIVE' }
            },
            receivedOffers: {
              where: { status: 'ACCEPTED' }
            }
          }
        }
      }
    });

    if (!user) {
      throw errors.notFound('Utilisateur');
    }

    // Calculer les statistiques publiques
    const stats = await Promise.all([
      // Nombre de ventes réussies
      prisma.offer.count({
        where: {
          sellerId: userId,
          status: 'ACCEPTED'
        }
      }),
      // Note moyenne (simulation)
      prisma.user.findUnique({
        where: { id: userId },
        select: { 
          // En attendant un vrai système de notation
          id: true
        }
      }).then(() => (Math.random() * 2 + 3).toFixed(1)) // Entre 3.0 et 5.0
    ]);

    user.publicStats = {
      completedSales: stats[0],
      averageRating: parseFloat(stats[1]),
      totalRatings: Math.floor(stats[0] * (Math.random() * 0.8 + 0.2)) // Simulation
    };

    // Mise en cache pour 10 minutes
    await cache.set(cacheKey, user, 600);
  }

  res.json({
    success: true,
    data: { user }
  });
});

// Mettre à jour le profil utilisateur
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Validation des données
  const { error, value } = validateUserUpdate(req.body);
  if (error) {
    throw errors.badRequest('Données de profil invalides', error.details);
  }

  const { name, phone, userMode } = value;

  // Vérifier si l'email est déjà utilisé (si fourni)
  if (value.email && value.email !== req.user.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: value.email }
    });
    
    if (existingUser) {
      throw errors.conflict('Cette adresse email est déjà utilisée');
    }
  }

  // Mise à jour
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(name && { name }),
      ...(value.email && { email: value.email }),
      ...(phone && { phone }),
      ...(userMode && { userMode })
    },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      userMode: true,
      isVerified: true,
      phone: true,
      createdAt: true,
      updatedAt: true
    }
  });

  // Invalider les caches
  await cache.del(`user:profile:${userId}`);
  await cache.del(`user:public:${userId}`);
  await cache.del(`user:${userId}`);

  appLogger.business('Profil utilisateur mis à jour', {
    userId,
    updatedFields: Object.keys(value)
  });

  res.json({
    success: true,
    message: 'Profil mis à jour avec succès',
    data: { user: updatedUser }
  });
});

// Changer le mot de passe
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    throw errors.badRequest('Mot de passe actuel et nouveau mot de passe requis');
  }

  if (newPassword.length < 8) {
    throw errors.badRequest('Le nouveau mot de passe doit faire au moins 8 caractères');
  }

  // Vérifier le mot de passe actuel
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true }
  });

  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw errors.badRequest('Mot de passe actuel incorrect');
  }

  // Hasher le nouveau mot de passe
  const hashedNewPassword = await bcrypt.hash(newPassword, 12);

  // Mettre à jour le mot de passe
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });

  appLogger.business('Mot de passe changé', { userId });

  res.json({
    success: true,
    message: 'Mot de passe mis à jour avec succès'
  });
});

// Obtenir les préférences utilisateur
export const getPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  let preferences = await prisma.userPreference.findUnique({
    where: { userId }
  });

  if (!preferences) {
    // Créer des préférences par défaut
    preferences = await prisma.userPreference.create({
      data: {
        userId,
        emailNotifications: true,
        pushNotifications: true,
        offerNotifications: true,
        likeNotifications: true,
        requireAuthenticated: false,
        minAuthenticityScore: 0.5
      }
    });
  }

  res.json({
    success: true,
    data: { preferences }
  });
});

// Mettre à jour les préférences utilisateur
export const updatePreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // Validation des données
  const { error, value } = validatePreferencesUpdate(req.body);
  if (error) {
    throw errors.badRequest('Données de préférences invalides', error.details);
  }

  const preferences = await prisma.userPreference.upsert({
    where: { userId },
    update: value,
    create: {
      userId,
      ...value
    }
  });

  // Invalider le cache utilisateur
  await cache.del(`user:${userId}`);
  await cache.del(`user:profile:${userId}`);

  appLogger.business('Préférences utilisateur mises à jour', {
    userId,
    preferences: Object.keys(value)
  });

  res.json({
    success: true,
    message: 'Préférences mises à jour avec succès',
    data: { preferences }
  });
});

// Supprimer le compte utilisateur
export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const userId = req.user.id;

  if (!password) {
    throw errors.badRequest('Mot de passe requis pour supprimer le compte');
  }

  // Vérifier le mot de passe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, email: true }
  });

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw errors.badRequest('Mot de passe incorrect');
  }

  // Vérifier s'il y a des offres en cours
  const pendingOffers = await prisma.offer.count({
    where: {
      OR: [
        { buyerId: userId, status: { in: ['PENDING', 'COUNTER_OFFERED'] } },
        { sellerId: userId, status: { in: ['PENDING', 'COUNTER_OFFERED'] } }
      ]
    }
  });

  if (pendingOffers > 0) {
    throw errors.badRequest('Impossible de supprimer le compte avec des offres en cours. Veuillez d\'abord annuler ou traiter toutes vos offres.');
  }

  // Transaction pour supprimer le compte de manière sécurisée
  await prisma.$transaction(async (tx) => {
    // Anonymiser les données au lieu de les supprimer complètement
    // (pour préserver l'intégrité des données liées aux transactions)
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted_${userId}@deleted.want2.app`,
        name: 'Utilisateur supprimé',
        password: 'deleted',
        avatar: null,
        phone: null,
        name: null,
        phone: null,
        isVerified: false,
        isVerified: false,
        status: 'DELETED'
      }
    });

    // Supprimer les préférences
    await tx.userPreference.deleteMany({
      where: { userId }
    });

    // Marquer tous les produits comme supprimés
    await tx.product.updateMany({
      where: { sellerId: userId },
      data: { status: 'DELETED' }
    });

    // Supprimer les likes
    await tx.like.deleteMany({
      where: { userId }
    });

    // Supprimer les notifications
    await tx.notification.deleteMany({
      where: { userId }
    });
  });

  // Invalider tous les caches liés à cet utilisateur
  await cache.flushPattern(`user:${userId}:*`);
  await cache.flushPattern(`*:${userId}:*`);

  appLogger.business('Compte utilisateur supprimé', {
    userId,
    email: user.email
  });

  res.json({
    success: true,
    message: 'Compte supprimé avec succès'
  });
});

// Obtenir l'historique d'activité
export const getActivityHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = req.query;
  const userId = req.user.id;

  // Clé de cache
  const cacheKey = `user:activity:${userId}:${page}:${limit}:${type || 'all'}`;
  let cachedActivity = await cache.get(cacheKey);

  if (!cachedActivity) {
    // Récupérer les différents types d'activités
    const [offers, receivedOffers, likes, products] = await Promise.all([
      // Offres faites
      prisma.offer.findMany({
        where: { buyerId: userId },
        take: type === 'offers' ? limit : 5,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              mainImage: true,
              price: true
            }
          }
        }
      }),
      // Offres reçues
      prisma.offer.findMany({
        where: { sellerId: userId },
        take: type === 'received_offers' ? limit : 5,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              mainImage: true,
              price: true
            }
          },
          buyer: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      }),
      // Likes donnés
      prisma.like.findMany({
        where: { userId },
        take: type === 'likes' ? limit : 5,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              id: true,
              title: true,
              mainImage: true,
              price: true,
              seller: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }),
      // Produits créés
      prisma.product.findMany({
        where: { sellerId: userId },
        take: type === 'products' ? limit : 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          mainImage: true,
          price: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              likes: true,
              offers: true,
              views: true
            }
          }
        }
      })
    ]);

    // Formater les activités avec un type uniforme
    const activities = [];

    if (!type || type === 'offers') {
      offers.forEach(offer => {
        activities.push({
          id: offer.id,
          type: 'offer_made',
          title: `Offre de ${offer.amount}€ pour "${offer.product.title}"`,
          status: offer.status,
          createdAt: offer.createdAt,
          data: {
            offerId: offer.id,
            productId: offer.product.id,
            productTitle: offer.product.title,
            productImage: offer.product.mainImage,
            amount: offer.amount,
            originalPrice: offer.product.price
          }
        });
      });
    }

    if (!type || type === 'received_offers') {
      receivedOffers.forEach(offer => {
        activities.push({
          id: `received_${offer.id}`,
          type: 'offer_received',
          title: `Offre reçue de ${offer.buyer.name} pour "${offer.product.title}"`,
          status: offer.status,
          createdAt: offer.createdAt,
          data: {
            offerId: offer.id,
            productId: offer.product.id,
            productTitle: offer.product.title,
            productImage: offer.product.mainImage,
            amount: offer.amount,
            buyerId: offer.buyer.id,
            buyerName: offer.buyer.name,
            buyerAvatar: offer.buyer.avatar
          }
        });
      });
    }

    if (!type || type === 'likes') {
      likes.forEach(like => {
        activities.push({
          id: `like_${like.id}`,
          type: 'product_liked',
          title: `Produit liké: "${like.product.title}"`,
          status: 'active',
          createdAt: like.createdAt,
          data: {
            productId: like.product.id,
            productTitle: like.product.title,
            productImage: like.product.mainImage,
            productPrice: like.product.price,
            sellerId: like.product.seller.id,
            sellerName: like.product.seller.name
          }
        });
      });
    }

    if (!type || type === 'products') {
      products.forEach(product => {
        activities.push({
          id: `product_${product.id}`,
          type: 'product_created',
          title: `Produit publié: "${product.title}"`,
          status: product.status.toLowerCase(),
          createdAt: product.createdAt,
          data: {
            productId: product.id,
            productTitle: product.title,
            productImage: product.mainImage,
            productPrice: product.price,
            likesCount: product._count.likes,
            offersCount: product._count.offers,
            viewsCount: product._count.views
          }
        });
      });
    }

    // Trier par date et limiter
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const paginatedActivities = activities.slice(0, limit);

    cachedActivity = {
      activities: paginatedActivities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: activities.length,
        hasMore: activities.length > limit
      }
    };

    // Mise en cache pour 2 minutes
    await cache.set(cacheKey, cachedActivity, 120);
  }

  res.json({
    success: true,
    data: cachedActivity
  });
});

// Mettre à jour l'activité utilisateur (last seen)
export const updateLastSeen = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  await prisma.user.update({
    where: { id: userId },
    data: { updatedAt: new Date() }
  });

  // Invalider le cache de profil
  await cache.del(`user:profile:${userId}`);
  await cache.del(`user:public:${userId}`);

  res.json({
    success: true,
    message: 'Activité mise à jour'
  });
});

// Rechercher des utilisateurs (pour les vendeurs)
export const searchUsers = asyncHandler(async (req, res) => {
  const { q, userMode = 'SELLER', page = 1, limit = 20 } = req.query;

  if (!q || q.length < 2) {
    throw errors.badRequest('Terme de recherche trop court (minimum 2 caractères)');
  }

  const where = {
    AND: [
      {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ]
      },
      { userMode: { in: userMode === 'SELLER' ? ['SELLER', 'BOTH'] : [userMode] } },
      { id: { not: req.user.id } } // Exclure l'utilisateur actuel
    ]
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar: true,
        userMode: true,
        isVerified: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            products: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { isVerified: 'desc' },
        { createdAt: 'desc' }
      ]
    }),
    prisma.user.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});