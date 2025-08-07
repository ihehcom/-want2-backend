import express from 'express';
import {
  upload,
  uploadSingle,
  uploadMultiple,
  deleteImage,
  getImageDetails,
  generateTransformations,
  listImages,
  uploadAvatar,
  getUploadStats
} from '../controllers/uploadController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Upload d'image unique
router.post(
  '/image', 
  userRateLimit(50, 15 * 60 * 1000), // Max 50 uploads/15min
  upload.single('image'), 
  uploadSingle
);

// Upload multiple d'images
router.post(
  '/images', 
  userRateLimit(10, 15 * 60 * 1000), // Max 10 uploads multiples/15min
  upload.array('images', 10), 
  uploadMultiple
);

// Upload d'avatar
router.post(
  '/avatar',
  userRateLimit(20, 60 * 60 * 1000), // Max 20 avatars/heure
  upload.single('avatar'),
  uploadAvatar
);

// Gestion des images existantes
router.get('/image/:publicId/details', getImageDetails);
router.get('/image/:publicId/transform', generateTransformations);
router.delete(
  '/image/:publicId', 
  userRateLimit(100, 15 * 60 * 1000), // Max 100 suppressions/15min
  deleteImage
);

// Listage des images
router.get('/images', listImages);

// Statistiques (admin uniquement)
router.get('/stats', getUploadStats);

export default router;