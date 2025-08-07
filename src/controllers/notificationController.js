import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { cache } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger, appLogger } from '../utils/logger.js';
import { getSocketIO } from '../services/socketService.js';

// Obtenir les notifications de l'utilisateur connecté
export const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, isRead } = req.query;
  const userId = req.user.id;

  // Clé de cache
  const cacheKey = `notifications:${userId}:${page}:${limit}:${type || 'all'}:${isRead || 'all'}`;
  let cachedNotifications = await cache.get(cacheKey);

  if (!cachedNotifications) {
    const where = {
      userId,
      ...(type && { type }),
      ...(isRead !== undefined && { isRead: isRead === 'true' })
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ 
        where: { userId, isRead: false } 
      })
    ]);

    cachedNotifications = {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      unreadCount
    };

    // Cache pour 30 secondes seulement (données temps réel)
    await cache.set(cacheKey, cachedNotifications, 30);
  }

  res.json({
    success: true,
    data: cachedNotifications
  });
});

// Marquer une notification comme lue
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const notification = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!notification) {
    throw errors.notFound('Notification');
  }

  if (notification.isRead) {
    return res.json({
      success: true,
      message: 'Notification déjà lue'
    });
  }

  const updatedNotification = await prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  // Invalider le cache des notifications
  await cache.flushPattern(`notifications:${userId}:*`);

  // Notifier via WebSocket du changement de compteur
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  const io = getSocketIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification:read', {
      notificationId: id,
      unreadCount
    });
  }

  res.json({
    success: true,
    message: 'Notification marquée comme lue',
    data: { notification: updatedNotification, unreadCount }
  });
});

// Marquer toutes les notifications comme lues
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  // Invalider le cache
  await cache.flushPattern(`notifications:${userId}:*`);

  // Notifier via WebSocket
  const io = getSocketIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification:all_read', {
      count: result.count
    });
  }

  appLogger.business(`${result.count} notifications marquées comme lues`, { userId });

  res.json({
    success: true,
    message: `${result.count} notifications marquées comme lues`,
    data: { count: result.count }
  });
});

// Supprimer une notification
export const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const notification = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!notification) {
    throw errors.notFound('Notification');
  }

  await prisma.notification.delete({
    where: { id }
  });

  // Invalider le cache
  await cache.flushPattern(`notifications:${userId}:*`);

  // Notifier via WebSocket
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  const io = getSocketIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification:deleted', {
      notificationId: id,
      unreadCount
    });
  }

  res.json({
    success: true,
    message: 'Notification supprimée'
  });
});

// Obtenir les statistiques des notifications
export const getNotificationStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `notification_stats:${userId}`;

  let stats = await cache.get(cacheKey);

  if (!stats) {
    const [
      total,
      unread,
      offerNotifications,
      likeNotifications,
      systemNotifications
    ] = await Promise.all([
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.notification.count({ 
        where: { 
          userId, 
          type: { in: ['OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_COUNTER'] }
        } 
      }),
      prisma.notification.count({ 
        where: { userId, type: 'PRODUCT_LIKED' } 
      }),
      prisma.notification.count({ 
        where: { 
          userId, 
          type: { in: ['ACCOUNT_VERIFIED', 'SYSTEM_MESSAGE'] }
        } 
      })
    ]);

    stats = {
      total,
      unread,
      byType: {
        offers: offerNotifications,
        likes: likeNotifications,
        system: systemNotifications
      },
      readPercentage: total > 0 ? (((total - unread) / total) * 100).toFixed(1) : 100
    };

    // Cache pour 2 minutes
    await cache.set(cacheKey, stats, 120);
  }

  res.json({
    success: true,
    data: { stats }
  });
});

// Obtenir les préférences de notification
export const getNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const preferences = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      emailNotifications: true,
      pushNotifications: true,
      offerNotifications: true,
      likeNotifications: true
    }
  });

  if (!preferences) {
    // Créer des préférences par défaut
    const defaultPrefs = await prisma.userPreference.create({
      data: {
        userId,
        emailNotifications: true,
        pushNotifications: true,
        offerNotifications: true,
        likeNotifications: true
      },
      select: {
        emailNotifications: true,
        pushNotifications: true,
        offerNotifications: true,
        likeNotifications: true
      }
    });

    return res.json({
      success: true,
      data: { preferences: defaultPrefs }
    });
  }

  res.json({
    success: true,
    data: { preferences }
  });
});

// Mettre à jour les préférences de notification
export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { 
    emailNotifications, 
    pushNotifications, 
    offerNotifications, 
    likeNotifications 
  } = req.body;

  const preferences = await prisma.userPreference.upsert({
    where: { userId },
    update: {
      ...(emailNotifications !== undefined && { emailNotifications }),
      ...(pushNotifications !== undefined && { pushNotifications }),
      ...(offerNotifications !== undefined && { offerNotifications }),
      ...(likeNotifications !== undefined && { likeNotifications })
    },
    create: {
      userId,
      emailNotifications: emailNotifications ?? true,
      pushNotifications: pushNotifications ?? true,
      offerNotifications: offerNotifications ?? true,
      likeNotifications: likeNotifications ?? true
    },
    select: {
      emailNotifications: true,
      pushNotifications: true,
      offerNotifications: true,
      likeNotifications: true
    }
  });

  // Invalider le cache utilisateur
  await cache.del(`user:${userId}`);

  appLogger.business('Préférences de notification mises à jour', { 
    userId,
    preferences 
  });

  res.json({
    success: true,
    message: 'Préférences mises à jour',
    data: { preferences }
  });
});

// Test d'envoi de notification (développement)
export const testNotification = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    throw errors.forbidden('Endpoint de test non disponible en production');
  }

  const userId = req.user.id;
  const { title, message, type = 'SYSTEM_MESSAGE' } = req.body;

  if (!title || !message) {
    throw errors.badRequest('Titre et message requis');
  }

  const notification = await prisma.notification.create({
    data: {
      type,
      title,
      message,
      userId,
      data: {
        test: true,
        timestamp: new Date().toISOString()
      }
    }
  });

  // Envoyer via WebSocket
  const io = getSocketIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification:new', {
      notification,
      unreadCount: await prisma.notification.count({
        where: { userId, isRead: false }
      })
    });
  }

  res.json({
    success: true,
    message: 'Notification de test envoyée',
    data: { notification }
  });
});