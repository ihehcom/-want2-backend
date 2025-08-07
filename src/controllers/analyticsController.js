import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { cache } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { getConnectionStats } from '../services/socketService.js';

// Obtenir les statistiques globales de la plateforme
export const getPlatformStats = asyncHandler(async (req, res) => {
  const cacheKey = 'analytics:platform:stats';
  let stats = await cache.get(cacheKey);

  if (!stats) {
    const [
      totalUsers,
      activeUsers,
      totalProducts,
      activeProducts,
      totalOffers,
      acceptedOffers,
      totalViews,
      totalLikes,
      recentSignups,
      recentProducts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          lastActiveAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 jours
          }
        }
      }),
      prisma.product.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.offer.count(),
      prisma.offer.count({ where: { status: 'ACCEPTED' } }),
      prisma.productView.count(),
      prisma.like.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 jours
          }
        }
      }),
      prisma.product.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 jours
          }
        }
      })
    ]);

    stats = {
      users: {
        total: totalUsers,
        active: activeUsers,
        recentSignups: recentSignups,
        activePercentage: totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : 0
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        recent: recentProducts,
        activePercentage: totalProducts > 0 ? ((activeProducts / totalProducts) * 100).toFixed(1) : 0
      },
      offers: {
        total: totalOffers,
        accepted: acceptedOffers,
        acceptanceRate: totalOffers > 0 ? ((acceptedOffers / totalOffers) * 100).toFixed(1) : 0
      },
      engagement: {
        totalViews,
        totalLikes,
        avgViewsPerProduct: totalProducts > 0 ? (totalViews / totalProducts).toFixed(1) : 0,
        avgLikesPerProduct: totalProducts > 0 ? (totalLikes / totalProducts).toFixed(1) : 0
      },
      realTime: getConnectionStats()
    };

    // Cache pour 15 minutes
    await cache.set(cacheKey, stats, 900);
  }

  res.json({
    success: true,
    data: { stats }
  });
});

// Obtenir les statistiques de l'utilisateur connecté
export const getUserStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `analytics:user:${userId}`;
  
  let stats = await cache.get(cacheKey);

  if (!stats) {
    const [
      totalProducts,
      activeProducts,
      soldProducts,
      totalOffersMade,
      acceptedOffersMade,
      totalOffersReceived,
      acceptedOffersReceived,
      totalLikesGiven,
      totalLikesReceived,
      totalViews,
      recentActivity
    ] = await Promise.all([
      prisma.product.count({ where: { sellerId: userId } }),
      prisma.product.count({ where: { sellerId: userId, status: 'ACTIVE' } }),
      prisma.product.count({ where: { sellerId: userId, status: 'SOLD' } }),
      prisma.offer.count({ where: { buyerId: userId } }),
      prisma.offer.count({ where: { buyerId: userId, status: 'ACCEPTED' } }),
      prisma.offer.count({ where: { sellerId: userId } }),
      prisma.offer.count({ where: { sellerId: userId, status: 'ACCEPTED' } }),
      prisma.like.count({ where: { userId } }),
      prisma.like.count({
        where: {
          product: { sellerId: userId }
        }
      }),
      prisma.productView.count({
        where: {
          product: { sellerId: userId }
        }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { 
          lastActiveAt: true,
          createdAt: true
        }
      })
    ]);

    stats = {
      products: {
        total: totalProducts,
        active: activeProducts,
        sold: soldProducts,
        conversionRate: totalProducts > 0 ? ((soldProducts / totalProducts) * 100).toFixed(1) : 0
      },
      offers: {
        made: {
          total: totalOffersMade,
          accepted: acceptedOffersMade,
          successRate: totalOffersMade > 0 ? ((acceptedOffersMade / totalOffersMade) * 100).toFixed(1) : 0
        },
        received: {
          total: totalOffersReceived,
          accepted: acceptedOffersReceived,
          acceptanceRate: totalOffersReceived > 0 ? ((acceptedOffersReceived / totalOffersReceived) * 100).toFixed(1) : 0
        }
      },
      engagement: {
        likesGiven: totalLikesGiven,
        likesReceived: totalLikesReceived,
        viewsReceived: totalViews,
        avgViewsPerProduct: activeProducts > 0 ? (totalViews / activeProducts).toFixed(1) : 0
      },
      activity: {
        joinDate: recentActivity.createdAt,
        lastSeen: recentActivity.lastActiveAt,
        daysSinceJoined: Math.floor((Date.now() - new Date(recentActivity.createdAt)) / (1000 * 60 * 60 * 24))
      }
    };

    // Cache pour 10 minutes
    await cache.set(cacheKey, stats, 600);
  }

  res.json({
    success: true,
    data: { stats }
  });
});

// Obtenir les statistiques par catégorie
export const getCategoryStats = asyncHandler(async (req, res) => {
  const cacheKey = 'analytics:categories:stats';
  let categoryStats = await cache.get(cacheKey);

  if (!categoryStats) {
    const categories = await prisma.product.groupBy({
      by: ['category'],
      where: { status: 'ACTIVE' },
      _count: {
        id: true
      },
      _avg: {
        price: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    // Obtenir les likes par catégorie
    const categoryLikes = await prisma.$queryRaw`
      SELECT p.category, COUNT(l.id) as likes_count
      FROM "Product" p
      LEFT JOIN "Like" l ON p.id = l."productId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.category
      ORDER BY likes_count DESC
    `;

    // Obtenir les offres par catégorie
    const categoryOffers = await prisma.$queryRaw`
      SELECT p.category, COUNT(o.id) as offers_count, COUNT(CASE WHEN o.status = 'ACCEPTED' THEN 1 END) as accepted_offers
      FROM "Product" p
      LEFT JOIN "Offer" o ON p.id = o."productId"
      WHERE p.status = 'ACTIVE'
      GROUP BY p.category
      ORDER BY offers_count DESC
    `;

    // Combiner les données
    categoryStats = categories.map(cat => {
      const likes = categoryLikes.find(l => l.category === cat.category) || { likes_count: 0 };
      const offers = categoryOffers.find(o => o.category === cat.category) || { offers_count: 0, accepted_offers: 0 };

      return {
        category: cat.category,
        productCount: cat._count.id,
        averagePrice: cat._avg.price ? parseFloat(cat._avg.price).toFixed(2) : '0.00',
        totalLikes: parseInt(likes.likes_count),
        totalOffers: parseInt(offers.offers_count),
        acceptedOffers: parseInt(offers.accepted_offers),
        conversionRate: offers.offers_count > 0 
          ? ((parseInt(offers.accepted_offers) / parseInt(offers.offers_count)) * 100).toFixed(1)
          : '0.0'
      };
    });

    // Cache pour 30 minutes
    await cache.set(cacheKey, categoryStats, 1800);
  }

  res.json({
    success: true,
    data: { categories: categoryStats }
  });
});

// Obtenir les tendances temporelles
export const getTimeSeriesData = asyncHandler(async (req, res) => {
  const { period = '7d', metric = 'users' } = req.query;
  
  const periods = {
    '7d': 7,
    '30d': 30,
    '90d': 90
  };

  const days = periods[period] || 7;
  const cacheKey = `analytics:timeseries:${metric}:${period}`;
  
  let timeSeriesData = await cache.get(cacheKey);

  if (!timeSeriesData) {
    const dates = [];
    const currentDate = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - i);
      dates.push({
        date: date.toISOString().split('T')[0],
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      });
    }

    let dataPromises = [];

    switch (metric) {
      case 'users':
        dataPromises = dates.map(({ date, start, end }) => 
          prisma.user.count({
            where: {
              createdAt: {
                gte: start,
                lt: end
              }
            }
          }).then(count => ({ date, value: count }))
        );
        break;
        
      case 'products':
        dataPromises = dates.map(({ date, start, end }) =>
          prisma.product.count({
            where: {
              createdAt: {
                gte: start,
                lt: end
              }
            }
          }).then(count => ({ date, value: count }))
        );
        break;
        
      case 'offers':
        dataPromises = dates.map(({ date, start, end }) =>
          prisma.offer.count({
            where: {
              createdAt: {
                gte: start,
                lt: end
              }
            }
          }).then(count => ({ date, value: count }))
        );
        break;
        
      case 'views':
        dataPromises = dates.map(({ date, start, end }) =>
          prisma.productView.count({
            where: {
              createdAt: {
                gte: start,
                lt: end
              }
            }
          }).then(count => ({ date, value: count }))
        );
        break;
        
      default:
        throw errors.badRequest('Métrique non supportée');
    }

    timeSeriesData = await Promise.all(dataPromises);

    // Cache pour 1 heure
    await cache.set(cacheKey, timeSeriesData, 3600);
  }

  res.json({
    success: true,
    data: {
      metric,
      period,
      data: timeSeriesData
    }
  });
});

// Obtenir les top produits/utilisateurs
export const getTopItems = asyncHandler(async (req, res) => {
  const { type = 'products', sortBy = 'views', limit = 10 } = req.query;
  const cacheKey = `analytics:top:${type}:${sortBy}:${limit}`;
  
  let topItems = await cache.get(cacheKey);

  if (!topItems) {
    switch (type) {
      case 'products':
        if (sortBy === 'views') {
          topItems = await prisma.product.findMany({
            where: { status: 'ACTIVE' },
            take: parseInt(limit),
            orderBy: {
              views: {
                _count: 'desc'
              }
            },
            select: {
              id: true,
              title: true,
              price: true,
              mainImage: true,
              category: true,
              createdAt: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  avatar: true
                }
              },
              _count: {
                select: {
                  views: true,
                  likes: true,
                  offers: true
                }
              }
            }
          });
        } else if (sortBy === 'likes') {
          topItems = await prisma.product.findMany({
            where: { status: 'ACTIVE' },
            take: parseInt(limit),
            orderBy: {
              likes: {
                _count: 'desc'
              }
            },
            select: {
              id: true,
              title: true,
              price: true,
              mainImage: true,
              category: true,
              createdAt: true,
              seller: {
                select: {
                  id: true,
                  name: true,
                  avatar: true
                }
              },
              _count: {
                select: {
                  views: true,
                  likes: true,
                  offers: true
                }
              }
            }
          });
        }
        break;
        
      case 'sellers':
        topItems = await prisma.user.findMany({
          where: { 
            userMode: { in: ['SELLER', 'BOTH'] }
          },
          take: parseInt(limit),
          orderBy: [
            { isVerified: 'desc' },
            { products: { _count: 'desc' } }
          ],
          select: {
            id: true,
            name: true,
            avatar: true,
            userMode: true,
            isVerified: true,
            location: true,
            createdAt: true,
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
        break;
        
      default:
        throw errors.badRequest('Type non supporté');
    }

    // Cache pour 20 minutes
    await cache.set(cacheKey, topItems, 1200);
  }

  res.json({
    success: true,
    data: {
      type,
      sortBy,
      items: topItems
    }
  });
});

// Obtenir des insights et recommandations
export const getInsights = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `analytics:insights:${userId}`;
  
  let insights = await cache.get(cacheKey);

  if (!insights) {
    // Récupérer les données utilisateur
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        userMode: true,
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

    const isNewUser = (Date.now() - new Date(userData.createdAt)) < (7 * 24 * 60 * 60 * 1000);
    const isSeller = ['SELLER', 'BOTH'].includes(userData.userMode);

    insights = {
      recommendations: [],
      alerts: [],
      achievements: []
    };

    // Recommandations basées sur l'activité
    if (isSeller && userData._count.products === 0) {
      insights.recommendations.push({
        type: 'first_product',
        title: 'Publiez votre premier produit',
        description: 'Commencez à vendre en publiant votre premier article',
        priority: 'high',
        action: 'create_product'
      });
    }

    if (userData._count.products > 0 && userData._count.products < 5) {
      insights.recommendations.push({
        type: 'more_products',
        title: 'Ajoutez plus de produits',
        description: 'Les vendeurs avec plus de produits reçoivent plus d\'offres',
        priority: 'medium',
        action: 'create_product'
      });
    }

    if (userData._count.offers === 0 && !isNewUser) {
      insights.recommendations.push({
        type: 'start_buying',
        title: 'Faites votre première offre',
        description: 'Explorez les produits et faites des offres intéressantes',
        priority: 'medium',
        action: 'browse_products'
      });
    }

    // Alertes
    if (isNewUser) {
      insights.alerts.push({
        type: 'welcome',
        title: 'Bienvenue sur WANT2 !',
        description: 'Complétez votre profil pour commencer',
        severity: 'info'
      });
    }

    // Achievements
    if (userData._count.products >= 1) {
      insights.achievements.push({
        type: 'first_product',
        title: 'Premier vendeur',
        description: 'Vous avez publié votre premier produit !',
        unlockedAt: new Date()
      });
    }

    if (userData._count.offers >= 1) {
      insights.achievements.push({
        type: 'first_offer',
        title: 'Premier acheteur',
        description: 'Vous avez fait votre première offre !',
        unlockedAt: new Date()
      });
    }

    // Cache pour 1 heure
    await cache.set(cacheKey, insights, 3600);
  }

  res.json({
    success: true,
    data: { insights }
  });
});