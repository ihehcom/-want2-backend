import express from 'express';
import {
  getPlatformStats,
  getUserStats,
  getCategoryStats,
  getTimeSeriesData,
  getTopItems,
  getInsights
} from '../controllers/analyticsController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Statistiques utilisateur personnelles
router.get('/user/stats', getUserStats);
router.get('/user/insights', userRateLimit(20, 15 * 60 * 1000), getInsights);

// Statistiques globales (limitées)
router.get('/platform/stats', userRateLimit(10, 15 * 60 * 1000), getPlatformStats);
router.get('/categories/stats', userRateLimit(10, 15 * 60 * 1000), getCategoryStats);
router.get('/timeseries', userRateLimit(20, 15 * 60 * 1000), getTimeSeriesData);
router.get('/top', userRateLimit(20, 15 * 60 * 1000), getTopItems);

export default router;