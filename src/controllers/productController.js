import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { cache } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger, appLogger } from '../utils/logger.js';
import { 
  validateProductCreation, 
  validateProductUpdate, 
  validateProductSearch 
} from '../utils/validators.js';

// Obtenir tous les produits avec filtres et pagination
export const getProducts = asyncHandler(async (req, res) => {
  const { error, value } = validateProductSearch(req.query);
  if (error) {
    throw errors.badRequest('Paramètres de recherche invalides', error.details);
  }

  const {
    q,
    category,
    brand,
    minPrice,
    maxPrice,
    condition,
    location,
    radius,
    sortBy,
    page,
    limit
  } = value;

  // Clé de cache pour cette recherche
  const cacheKey = `products:search:${Buffer.from(JSON.stringify(value)).toString('base64')}`;
  
  // Vérifier le cache
  const cachedResult = await cache.get(cacheKey);
  if (cachedResult) {
    return res.json({
      success: true,
      data: cachedResult,
      cached: true
    });
  }

  // Construction de la requête WHERE
  const where = {
    status: 'ACTIVE',
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } }
      ]
    }),
    ...(category && { category }),
    ...(brand && { brand: { contains: brand, mode: 'insensitive' } }),
    ...(minPrice && { price: { gte: minPrice } }),
    ...(maxPrice && { price: { lte: maxPrice } }),
    ...(condition && { condition: { in: condition } })
  };

  // Construction de l'ordre de tri
  const orderBy = {
    'price_asc': { price: 'asc' },
    'price_desc': { price: 'desc' },
    'date_asc': { createdAt: 'asc' },
    'date_desc': { createdAt: 'desc' },
    'relevance': { createdAt: 'desc' } // Par défaut
  }[sortBy];

  // Exécution de la requête
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        brand: true,
        condition: true,
        authenticityScore: true,
        isAuthenticated: true,
        images: true,
        mainImage: true,
        location: true,
        createdAt: true,
        seller: {
          select: {
            id: true,
            name: true,
            avatar: true,
            isVerified: true
          }
        },
        _count: {
          select: {
            likes: true,
            offers: true,
            views: true
          }
        }
      }
    }),
    prisma.product.count({ where })
  ]);

  const result = {
    products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    filters: {
      q,
      category,
      brand,
      minPrice,
      maxPrice,
      condition,
      sortBy
    }
  };

  // Mise en cache pour 5 minutes
  await cache.set(cacheKey, result, 300);

  appLogger.business(`Recherche produits: ${total} résultats`, { 
    query: q, 
    filters: { category, brand, minPrice, maxPrice },
    userId: req.user?.id 
  });

  res.json({
    success: true,
    data: result
  });
});

// Obtenir un produit spécifique
export const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Vérifier le cache
  const cacheKey = `product:${id}`;
  let product = await cache.get(cacheKey);

  if (!product) {
    product = await prisma.product.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            avatar: true,
            isVerified: true,
            createdAt: true,
            _count: {
              select: {
                products: true,
                receivedOffers: true
              }
            }
          }
        },
        _count: {
          select: {
            likes: true,
            offers: true,
            views: true
          }
        }
      }
    });

    if (!product) {
      throw errors.notFound('Produit');
    }

    // Mise en cache pour 10 minutes
    await cache.set(cacheKey, product, 600);
  }

  // Enregistrer la vue (de manière asynchrone)
  if (req.user?.id !== product.sellerId) {
    prisma.productView.create({
      data: {
        productId: id,
        userId: req.user?.id || null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    }).catch(err => logger.error('Erreur enregistrement vue:', err));
  }

  // Vérifier si l'utilisateur a liké ce produit
  let isLiked = false;
  if (req.user) {
    isLiked = await prisma.like.findFirst({
      where: {
        userId: req.user.id,
        productId: id
      }
    }) !== null;
  }

  res.json({
    success: true,
    data: {
      ...product,
      isLiked
    }
  });
});

// Créer un nouveau produit
export const createProduct = asyncHandler(async (req, res) => {
  // Validation des données
  const { error, value } = validateProductCreation(req.body);
  if (error) {
    throw errors.badRequest('Données du produit invalides', error.details);
  }

  // Vérifier que l'utilisateur peut vendre
  if (req.user.userMode === 'BUYER') {
    throw errors.forbidden('Vous devez être vendeur pour créer des produits');
  }

  const productData = {
    ...value,
    sellerId: req.user.id,
    // Score d'authenticité simulé (sera remplacé par la vraie logique plus tard)
    authenticityScore: Math.random() * 0.4 + 0.6, // Entre 0.6 et 1.0
    isAuthenticated: Math.random() > 0.3 // 70% de chance d'être "authentifié"
  };

  const product = await prisma.product.create({
    data: productData,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          avatar: true,
          isVerified: true
        }
      }
    }
  });

  appLogger.business(`Nouveau produit créé: ${product.title}`, { 
    productId: product.id, 
    sellerId: req.user.id 
  });

  res.status(201).json({
    success: true,
    message: 'Produit créé avec succès',
    data: { product }
  });
});

// Mettre à jour un produit
export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Validation des données
  const { error, value } = validateProductUpdate(req.body);
  if (error) {
    throw errors.badRequest('Données de mise à jour invalides', error.details);
  }

  // Vérifier l'existence et la propriété
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sellerId: true, title: true }
  });

  if (!existingProduct) {
    throw errors.notFound('Produit');
  }

  if (existingProduct.sellerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez modifier que vos propres produits');
  }

  // Mise à jour
  const product = await prisma.product.update({
    where: { id },
    data: value,
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          avatar: true,
          isVerified: true
        }
      }
    }
  });

  // Invalidation du cache
  await cache.del(`product:${id}`);
  await cache.flushPattern(`products:search:*`);

  appLogger.business(`Produit mis à jour: ${product.title}`, { 
    productId: id, 
    sellerId: req.user.id 
  });

  res.json({
    success: true,
    message: 'Produit mis à jour avec succès',
    data: { product }
  });
});

// Supprimer un produit
export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Vérifier l'existence et la propriété
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sellerId: true, title: true }
  });

  if (!product) {
    throw errors.notFound('Produit');
  }

  if (product.sellerId !== req.user.id) {
    throw errors.forbidden('Vous ne pouvez supprimer que vos propres produits');
  }

  // Soft delete (changement de statut)
  await prisma.product.update({
    where: { id },
    data: { status: 'DELETED' }
  });

  // Invalidation du cache
  await cache.del(`product:${id}`);
  await cache.flushPattern(`products:search:*`);

  appLogger.business(`Produit supprimé: ${product.title}`, { 
    productId: id, 
    sellerId: req.user.id 
  });

  res.json({
    success: true,
    message: 'Produit supprimé avec succès'
  });
});

// Liker un produit
export const likeProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Vérifier que le produit existe
  const product = await prisma.product.findUnique({
    where: { id, status: 'ACTIVE' },
    select: { id: true, sellerId: true, title: true }
  });

  if (!product) {
    throw errors.notFound('Produit');
  }

  // Empêcher de liker son propre produit
  if (product.sellerId === req.user.id) {
    throw errors.badRequest('Vous ne pouvez pas liker vos propres produits');
  }

  // Vérifier si déjà liké
  const existingLike = await prisma.like.findUnique({
    where: {
      userId_productId: {
        userId: req.user.id,
        productId: id
      }
    }
  });

  if (existingLike) {
    throw errors.conflict('Produit déjà liké');
  }

  // Créer le like
  await prisma.like.create({
    data: {
      userId: req.user.id,
      productId: id
    }
  });

  // Créer une notification pour le vendeur
  await prisma.notification.create({
    data: {
      type: 'PRODUCT_LIKED',
      title: 'Nouveau like !',
      message: `${req.user.name} a liké votre produit "${product.title}"`,
      userId: product.sellerId,
      data: {
        productId: id,
        likedBy: req.user.id,
        likedByName: req.user.name
      }
    }
  }).catch(err => logger.error('Erreur création notification:', err));

  // Invalidation du cache
  await cache.del(`product:${id}`);

  appLogger.business(`Produit liké: ${product.title}`, { 
    productId: id, 
    userId: req.user.id,
    sellerId: product.sellerId 
  });

  res.json({
    success: true,
    message: 'Produit liké avec succès'
  });
});

// Unliker un produit
export const unlikeProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Supprimer le like
  const deletedLike = await prisma.like.deleteMany({
    where: {
      userId: req.user.id,
      productId: id
    }
  });

  if (deletedLike.count === 0) {
    throw errors.notFound('Like non trouvé');
  }

  // Invalidation du cache
  await cache.del(`product:${id}`);

  appLogger.business(`Produit unliké`, { 
    productId: id, 
    userId: req.user.id 
  });

  res.json({
    success: true,
    message: 'Like retiré avec succès'
  });
});

// Obtenir les recommandations IA pour un utilisateur
export const getRecommendations = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user.id;

  // Clé de cache pour les recommandations
  const cacheKey = `recommendations:${userId}:${page}:${limit}`;
  
  let recommendations = await cache.get(cacheKey);
  
  if (!recommendations) {
    // Récupérer les préférences utilisateur
    const userPrefs = await prisma.userPreference.findUnique({
      where: { userId }
    });

    // Récupérer les produits likés et passés
    const likedProducts = userPrefs?.likedProducts || [];
    const passedProducts = userPrefs?.passedProducts || [];

    // Construction de la requête de recommandation
    const where = {
      status: 'ACTIVE',
      sellerId: { not: userId }, // Exclure ses propres produits
      id: { notIn: [...likedProducts, ...passedProducts] }, // Exclure déjà vus
      ...(userPrefs?.preferredCategories?.length && {
        category: { in: userPrefs.preferredCategories }
      }),
      ...(userPrefs?.preferredBrands?.length && {
        brand: { in: userPrefs.preferredBrands }
      }),
      ...(userPrefs?.maxPrice && { price: { lte: userPrefs.maxPrice } }),
      ...(userPrefs?.minPrice && { price: { gte: userPrefs.minPrice } }),
      ...(userPrefs?.requireAuthenticated && { isAuthenticated: true }),
      ...(userPrefs?.minAuthenticityScore && { 
        authenticityScore: { gte: userPrefs.minAuthenticityScore } 
      }),
      ...(userPrefs?.excludedSellers?.length && {
        sellerId: { notIn: userPrefs.excludedSellers }
      })
    };

    // Algorithme de recommandation simple basé sur les likes
    let orderBy = { createdAt: 'desc' }; // Par défaut

    // Si l'utilisateur a des likes, on recommande des produits similaires
    if (likedProducts.length > 0) {
      // Récupérer les catégories et marques des produits likés
      const likedProductsData = await prisma.product.findMany({
        where: { id: { in: likedProducts } },
        select: { category: true, brand: true }
      });

      const likedCategories = [...new Set(likedProductsData.map(p => p.category))];
      const likedBrands = [...new Set(likedProductsData.map(p => p.brand).filter(Boolean))];

      // Prioriser les produits des catégories/marques likées
      if (likedCategories.length > 0) {
        where.OR = [
          { category: { in: likedCategories } },
          ...(likedBrands.length > 0 ? [{ brand: { in: likedBrands } }] : [])
        ];
      }
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          currency: true,
          category: true,
          brand: true,
          condition: true,
          authenticityScore: true,
          isAuthenticated: true,
          images: true,
          mainImage: true,
          createdAt: true,
          seller: {
            select: {
              id: true,
              name: true,
              avatar: true,
              isVerified: true
            }
          },
          _count: {
            select: {
              likes: true,
              offers: true
            }
          }
        }
      }),
      prisma.product.count({ where })
    ]);

    recommendations = {
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      algorithm: {
        basedOnLikes: likedProducts.length > 0,
        personalizedFilters: Boolean(userPrefs),
        excludedCount: likedProducts.length + passedProducts.length
      }
    };

    // Mise en cache pour 30 minutes
    await cache.set(cacheKey, recommendations, 1800);
  }

  appLogger.business(`Recommandations générées: ${recommendations.products.length} produits`, { 
    userId,
    algorithm: recommendations.algorithm 
  });

  res.json({
    success: true,
    data: recommendations
  });
});

// Obtenir les produits d'un vendeur
export const getSellerProducts = asyncHandler(async (req, res) => {
  const { sellerId } = req.params;
  const { page = 1, limit = 20, status = 'ACTIVE' } = req.query;

  // Vérifier que le vendeur existe
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { id: true, name: true, avatar: true, isVerified: true }
  });

  if (!seller) {
    throw errors.notFound('Vendeur');
  }

  // Seul le propriétaire peut voir ses produits non actifs
  const canSeeAll = req.user?.id === sellerId;
  const statusFilter = canSeeAll ? 
    (status === 'all' ? undefined : status) : 
    'ACTIVE';

  const where = {
    sellerId,
    ...(statusFilter && { status: statusFilter })
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        price: true,
        currency: true,
        category: true,
        brand: true,
        condition: true,
        status: true,
        authenticityScore: true,
        isAuthenticated: true,
        images: true,
        mainImage: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            offers: true,
            views: true
          }
        }
      }
    }),
    prisma.product.count({ where })
  ]);

  res.json({
    success: true,
    data: {
      seller,
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});