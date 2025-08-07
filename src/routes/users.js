import express from 'express';
import {
  getProfile,
  getPublicProfile,
  updateProfile,
  changePassword,
  getPreferences,
  updatePreferences,
  deleteAccount,
  getActivityHistory,
  updateLastSeen,
  searchUsers
} from '../controllers/userController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Routes publiques
router.get('/search', authenticate, userRateLimit(50, 15 * 60 * 1000), searchUsers);
router.get('/:userId/profile', getPublicProfile);

// Toutes les autres routes nécessitent une authentification
router.use(authenticate);

// Profil utilisateur
router.get('/profile', getProfile);
router.put('/profile', userRateLimit(20, 60 * 60 * 1000), updateProfile); // Max 20 mises à jour/heure
router.post('/change-password', userRateLimit(5, 60 * 60 * 1000), changePassword); // Max 5 changements/heure
router.delete('/account', userRateLimit(3, 24 * 60 * 60 * 1000), deleteAccount); // Max 3 tentatives/jour

// Préférences utilisateur
router.get('/preferences', getPreferences);
router.put('/preferences', userRateLimit(10, 60 * 60 * 1000), updatePreferences); // Max 10 mises à jour/heure

// Activité utilisateur
router.get('/activity', getActivityHistory);
router.post('/last-seen', updateLastSeen);

export default router;