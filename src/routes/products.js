import express from 'express';
import { 
  getProducts, 
  getProduct, 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  likeProduct, 
  unlikeProduct, 
  getRecommendations,
  getSellerProducts 
} from '../controllers/productController.js';
import { authenticate, authorize, optionalAuth, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Routes publiques (avec auth optionnelle)
router.get('/', optionalAuth, getProducts);
router.get('/search', optionalAuth, getProducts);
router.get('/:id', optionalAuth, getProduct);
router.get('/seller/:sellerId', optionalAuth, getSellerProducts);

// Routes authentifiées
router.use(authenticate);

// Recommandations IA (nécessite authentification)
router.get('/recommendations/ai', userRateLimit(50, 15 * 60 * 1000), getRecommendations);

// Gestion des likes
router.post('/:id/like', userRateLimit(100, 15 * 60 * 1000), likeProduct);
router.delete('/:id/like', unlikeProduct);

// CRUD produits (vendeurs uniquement)
router.post('/', authorize('SELLER', 'BOTH'), userRateLimit(20, 60 * 60 * 1000), createProduct);
router.put('/:id', authorize('SELLER', 'BOTH'), updateProduct);
router.delete('/:id', authorize('SELLER', 'BOTH'), deleteProduct);

export default router;