import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats,
  getNotificationPreferences,
  updateNotificationPreferences,
  testNotification
} from '../controllers/notificationController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Récupération des notifications
router.get('/', getNotifications);
router.get('/stats', getNotificationStats);
router.get('/preferences', getNotificationPreferences);

// Actions sur les notifications
router.put('/:id/read', userRateLimit(100, 15 * 60 * 1000), markNotificationAsRead); // Max 100/15min
router.put('/read-all', userRateLimit(10, 15 * 60 * 1000), markAllNotificationsAsRead); // Max 10/15min
router.delete('/:id', userRateLimit(50, 15 * 60 * 1000), deleteNotification); // Max 50/15min

// Gestion des préférences
router.put('/preferences', userRateLimit(20, 60 * 60 * 1000), updateNotificationPreferences); // Max 20/heure

// Endpoint de test (développement uniquement)
if (process.env.NODE_ENV !== 'production') {
  router.post('/test', userRateLimit(5, 60 * 1000), testNotification); // Max 5/minute en dev
}

export default router;