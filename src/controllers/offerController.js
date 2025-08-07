import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { cache } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger, appLogger } from '../utils/logger.js';
import { validateOfferCreation } from '../utils/validators.js';

// Créer une offre
export const createOffer = asyncHandler(async (req, res) => {
  // Validation des données
  const { error, value } = validateOfferCreation(req.body);
  if (error) {
    throw errors.badRequest('Données d\'offre invalides', error.details);
  }

  const { productId, amount, message } = value;

  // Vérifier que le produit existe et est actif
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      price: true,
      sellerId: true,
      status: true,
      seller: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!product) {
    throw errors.notFound('Produit');
  }

  if (product.status !== 'ACTIVE') {
    throw errors.badRequest('Le produit n\'est plus disponible');
  }

  // Empêcher de faire une offre sur son propre produit
  if (product.sellerId === req.user.id) {
    throw errors.badRequest('Vous ne pouvez pas faire d\'offre sur vos propres produits');
  }

  // Vérifier s'il y a déjà une offre en cours de ce même acheteur
  const existingOffer = await prisma.offer.findFirst({
    where: {
      productId,
      buyerId: req.user.id,
      status: { in: ['PENDING', 'COUNTER_OFFERED'] }
    }
  });

  if (existingOffer) {
    throw errors.conflict('Vous avez déjà une offre en cours pour ce produit');
  }

  // Créer l'offre avec expiration dans 7 jours
  const offer = await prisma.offer.create({
    data: {
      productId,
      buyerId: req.user.id,
      sellerId: product.sellerId,
      amount,
      message,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          mainImage: true
        }
      },
      buyer: {
        select: {
          id: true,
          name: true,
          avatar: true,
          isVerified: true
        }
      }
    }
  });

  // Créer une notification pour le vendeur
  await prisma.notification.create({
    data: {
      type: 'OFFER_RECEIVED',
      title: 'Nouvelle offre reçue !',
      message: `${req.user.name} a fait une offre de ${amount}€ pour "${product.title}"`,
      userId: product.sellerId,
      data: {
        offerId: offer.id,
        productId: product.id,
        amount,
        buyerName: req.user.name,
        buyerId: req.user.id
      }
    }
  }).catch(err => logger.error('Erreur création notification offre:', err));

  // Invalider le cache des offres
  await cache.flushPattern(`offers:*`);

  appLogger.business(`Nouvelle offre créée: ${amount}€ pour ${product.title}`, {
    offerId: offer.id,
    productId: product.id,
    buyerId: req.user.id,
    sellerId: product.sellerId,
    amount
  });

  res.status(201).json({
    success: true,
    message: 'Offre créée avec succès',
    data: { offer }
  });
});

// Obtenir les offres faites par l'utilisateur
export const getMyOffers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const userId = req.user.id;

  // Clé de cache
  const cacheKey = `offers:buyer:${userId}:${page}:${limit}:${status || 'all'}`;
  let cachedOffers = await cache.get(cacheKey);

  if (!cachedOffers) {
    const where = {
      buyerId: userId,
      ...(status && { status })
    };

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              price: true,
              mainImage: true,
              status: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  isVerified: true
                }
              }
            }
          },
          parentOffer: {
            select: {
              id: true,
              amount: true,
              createdAt: true
            }
          },
          counterOffers: {
            select: {
              id: true,
              amount: true,
              status: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.offer.count({ where })
    ]);

    cachedOffers = {
      offers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache pour 2 minutes
    await cache.set(cacheKey, cachedOffers, 120);
  }

  res.json({
    success: true,
    data: cachedOffers
  });
});

// Obtenir les offres reçues par l'utilisateur (vendeur)
export const getReceivedOffers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const userId = req.user.id;

  // Clé de cache
  const cacheKey = `offers:seller:${userId}:${page}:${limit}:${status || 'all'}`;
  let cachedOffers = await cache.get(cacheKey);

  if (!cachedOffers) {
    const where = {
      sellerId: userId,
      ...(status && { status })
    };

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              title: true,
              price: true,
              mainImage: true,
              status: true
            }
          },
          buyer: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isVerified: true
            }
          },
          parentOffer: {
            select: {
              id: true,
              amount: true,
              createdAt: true
            }
          },
          counterOffers: {
            select: {
              id: true,
              amount: true,
              status: true,
              createdAt: true
            }
          }
        }
      }),
      prisma.offer.count({ where })
    ]);

    cachedOffers = {
      offers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache pour 2 minutes
    await cache.set(cacheKey, cachedOffers, 120);
  }

  res.json({
    success: true,
    data: cachedOffers
  });
});

// Obtenir une offre spécifique
export const getOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          mainImage: true,
          images: true,
          status: true,
          seller: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isVerified: true
            }
          }
        }
      },
      buyer: {
        select: {
          id: true,
          name: true,
          avatar: true,
          isVerified: true
        }
      },
      parentOffer: {
        select: {
          id: true,
          amount: true,
          message: true,
          createdAt: true,
          buyer: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        }
      },
      counterOffers: {
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!offer) {
    throw errors.notFound('Offre');
  }

  // Vérifier les permissions
  const canView = offer.buyerId === req.user.id || offer.sellerId === req.user.id;
  if (!canView) {
    throw errors.forbidden('Accès non autorisé à cette offre');
  }

  res.json({
    success: true,
    data: { offer }
  });
});

// Accepter une offre (vendeur)
export const acceptOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Récupérer l'offre avec les détails
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          sellerId: true,
          status: true
        }
      },
      buyer: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!offer) {
    throw errors.notFound('Offre');
  }

  // Vérifications de sécurité
  if (offer.sellerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez accepter que vos propres offres');
  }

  if (offer.status !== 'PENDING' && offer.status !== 'COUNTER_OFFERED') {
    throw errors.badRequest(`Impossible d'accepter une offre avec le statut: ${offer.status}`);
  }

  if (offer.product.status !== 'ACTIVE') {
    throw errors.badRequest('Le produit n\'est plus disponible');
  }

  if (offer.expiresAt && new Date() > offer.expiresAt) {
    throw errors.badRequest('Cette offre a expiré');
  }

  // Transaction pour accepter l'offre
  const result = await prisma.$transaction(async (tx) => {
    // Mettre à jour l'offre
    const updatedOffer = await tx.offer.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date()
      }
    });

    // Marquer le produit comme vendu
    await tx.product.update({
      where: { id: offer.product.id },
      data: { status: 'SOLD' }
    });

    // Rejeter toutes les autres offres en attente pour ce produit
    await tx.offer.updateMany({
      where: {
        productId: offer.product.id,
        status: { in: ['PENDING', 'COUNTER_OFFERED'] },
        id: { not: id }
      },
      data: {
        status: 'REJECTED',
        respondedAt: new Date()
      }
    });

    return updatedOffer;
  });

  // Créer une notification pour l'acheteur
  await prisma.notification.create({
    data: {
      type: 'OFFER_ACCEPTED',
      title: 'Offre acceptée ! 🎉',
      message: `Votre offre de ${offer.amount}€ pour "${offer.product.title}" a été acceptée !`,
      userId: offer.buyerId,
      data: {
        offerId: offer.id,
        productId: offer.product.id,
        amount: offer.amount,
        sellerName: req.user.name
      }
    }
  }).catch(err => logger.error('Erreur création notification acceptation:', err));

  // Invalider les caches
  await cache.flushPattern(`offers:*`);
  await cache.del(`product:${offer.product.id}`);

  appLogger.business(`Offre acceptée: ${offer.amount}€ pour ${offer.product.title}`, {
    offerId: offer.id,
    productId: offer.product.id,
    buyerId: offer.buyerId,
    sellerId: req.user.id
  });

  res.json({
    success: true,
    message: 'Offre acceptée avec succès',
    data: { offer: result }
  });
});

// Rejeter une offre (vendeur)
export const rejectOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          sellerId: true
        }
      },
      buyer: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!offer) {
    throw errors.notFound('Offre');
  }

  if (offer.sellerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez rejeter que vos propres offres');
  }

  if (offer.status !== 'PENDING' && offer.status !== 'COUNTER_OFFERED') {
    throw errors.badRequest(`Impossible de rejeter une offre avec le statut: ${offer.status}`);
  }

  // Mettre à jour l'offre
  const updatedOffer = await prisma.offer.update({
    where: { id },
    data: {
      status: 'REJECTED',
      respondedAt: new Date(),
      ...(reason && { message: reason })
    }
  });

  // Créer une notification pour l'acheteur
  await prisma.notification.create({
    data: {
      type: 'OFFER_REJECTED',
      title: 'Offre déclinée',
      message: `Votre offre de ${offer.amount}€ pour "${offer.product.title}" a été déclinée`,
      userId: offer.buyerId,
      data: {
        offerId: offer.id,
        productId: offer.product.id,
        amount: offer.amount,
        sellerName: req.user.name,
        reason
      }
    }
  }).catch(err => logger.error('Erreur création notification rejet:', err));

  // Invalider les caches
  await cache.flushPattern(`offers:*`);

  appLogger.business(`Offre rejetée: ${offer.amount}€ pour ${offer.product.title}`, {
    offerId: offer.id,
    productId: offer.product.id,
    buyerId: offer.buyerId,
    sellerId: req.user.id,
    reason
  });

  res.json({
    success: true,
    message: 'Offre rejetée',
    data: { offer: updatedOffer }
  });
});

// Faire une contre-offre (vendeur)
export const createCounterOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, message } = req.body;

  if (!amount || amount <= 0) {
    throw errors.badRequest('Montant de contre-offre requis et positif');
  }

  const originalOffer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          sellerId: true,
          status: true
        }
      },
      buyer: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!originalOffer) {
    throw errors.notFound('Offre');
  }

  if (originalOffer.sellerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez faire de contre-offre que sur vos propres offres');
  }

  if (originalOffer.status !== 'PENDING' && originalOffer.status !== 'COUNTER_OFFERED') {
    throw errors.badRequest(`Impossible de faire une contre-offre sur une offre avec le statut: ${originalOffer.status}`);
  }

  if (originalOffer.product.status !== 'ACTIVE') {
    throw errors.badRequest('Le produit n\'est plus disponible');
  }

  // Transaction pour créer la contre-offre
  const result = await prisma.$transaction(async (tx) => {
    // Mettre à jour l'offre originale
    await tx.offer.update({
      where: { id },
      data: {
        status: 'COUNTER_OFFERED',
        respondedAt: new Date()
      }
    });

    // Créer la contre-offre
    const counterOffer = await tx.offer.create({
      data: {
        productId: originalOffer.product.id,
        buyerId: originalOffer.buyerId, // L'acheteur reste le même
        sellerId: req.user.id,
        amount: parseFloat(amount),
        message,
        parentOfferId: id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
        status: 'PENDING'
      },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            price: true,
            mainImage: true
          }
        },
        buyer: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        parentOffer: {
          select: {
            id: true,
            amount: true,
            createdAt: true
          }
        }
      }
    });

    return counterOffer;
  });

  // Créer une notification pour l'acheteur
  await prisma.notification.create({
    data: {
      type: 'OFFER_COUNTER',
      title: 'Contre-offre reçue !',
      message: `${req.user.name} vous propose ${amount}€ pour "${originalOffer.product.title}"`,
      userId: originalOffer.buyerId,
      data: {
        offerId: result.id,
        parentOfferId: id,
        productId: originalOffer.product.id,
        originalAmount: originalOffer.amount,
        counterAmount: amount,
        sellerName: req.user.name
      }
    }
  }).catch(err => logger.error('Erreur création notification contre-offre:', err));

  // Invalider les caches
  await cache.flushPattern(`offers:*`);

  appLogger.business(`Contre-offre créée: ${amount}€ (original: ${originalOffer.amount}€) pour ${originalOffer.product.title}`, {
    counterOfferId: result.id,
    originalOfferId: id,
    productId: originalOffer.product.id,
    buyerId: originalOffer.buyerId,
    sellerId: req.user.id,
    originalAmount: originalOffer.amount,
    counterAmount: amount
  });

  res.status(201).json({
    success: true,
    message: 'Contre-offre créée avec succès',
    data: { offer: result }
  });
});

// Annuler une offre (acheteur)
export const cancelOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const offer = await prisma.offer.findUnique({
    where: { id },
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      status: true,
      amount: true,
      product: {
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  if (!offer) {
    throw errors.notFound('Offre');
  }

  if (offer.buyerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez annuler que vos propres offres');
  }

  if (offer.status !== 'PENDING' && offer.status !== 'COUNTER_OFFERED') {
    throw errors.badRequest(`Impossible d'annuler une offre avec le statut: ${offer.status}`);
  }

  // Annuler l'offre
  const cancelledOffer = await prisma.offer.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      respondedAt: new Date()
    }
  });

  // Invalider les caches
  await cache.flushPattern(`offers:*`);

  appLogger.business(`Offre annulée: ${offer.amount}€ pour ${offer.product.title}`, {
    offerId: offer.id,
    productId: offer.product.id,
    buyerId: req.user.id,
    sellerId: offer.sellerId
  });

  res.json({
    success: true,
    message: 'Offre annulée avec succès',
    data: { offer: cancelledOffer }
  });
});

// Obtenir les statistiques des offres pour un utilisateur
export const getOfferStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Clé de cache
  const cacheKey = `offer_stats:${userId}`;
  let stats = await cache.get(cacheKey);

  if (!stats) {
    const [
      sentOffers,
      receivedOffers,
      acceptedSent,
      acceptedReceived,
      pendingSent,
      pendingReceived
    ] = await Promise.all([
      prisma.offer.count({ where: { buyerId: userId } }),
      prisma.offer.count({ where: { sellerId: userId } }),
      prisma.offer.count({ where: { buyerId: userId, status: 'ACCEPTED' } }),
      prisma.offer.count({ where: { sellerId: userId, status: 'ACCEPTED' } }),
      prisma.offer.count({ where: { buyerId: userId, status: { in: ['PENDING', 'COUNTER_OFFERED'] } } }),
      prisma.offer.count({ where: { sellerId: userId, status: { in: ['PENDING', 'COUNTER_OFFERED'] } } })
    ]);

    stats = {
      sent: {
        total: sentOffers,
        accepted: acceptedSent,
        pending: pendingSent,
        acceptanceRate: sentOffers > 0 ? ((acceptedSent / sentOffers) * 100).toFixed(1) : 0
      },
      received: {
        total: receivedOffers,
        accepted: acceptedReceived,
        pending: pendingReceived,
        acceptanceRate: receivedOffers > 0 ? ((acceptedReceived / receivedOffers) * 100).toFixed(1) : 0
      }
    };

    // Cache pour 5 minutes
    await cache.set(cacheKey, stats, 300);
  }

  res.json({
    success: true,
    data: { stats }
  });
});