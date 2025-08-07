import express from 'express';
import {
  createOffer,
  getMyOffers,
  getReceivedOffers,
  getOffer,
  acceptOffer,
  rejectOffer,
  createCounterOffer,
  cancelOffer,
  getOfferStats
} from '../controllers/offerController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// CRUD des offres
router.post('/', userRateLimit(30, 60 * 60 * 1000), createOffer); // Max 30 offres/heure
router.get('/sent', getMyOffers);
router.get('/received', getReceivedOffers);
router.get('/stats', getOfferStats);
router.get('/:id', getOffer);

// Actions sur les offres (vendeur)
router.put('/:id/accept', acceptOffer);
router.put('/:id/reject', rejectOffer);
router.post('/:id/counter', userRateLimit(10, 60 * 60 * 1000), createCounterOffer); // Max 10 contre-offres/heure

// Actions sur les offres (acheteur)
router.put('/:id/cancel', cancelOffer);

export default router;