import express from 'express';
import { 
  register, 
  login, 
  refresh, 
  logout, 
  logoutAll, 
  profile, 
  verifyEmail, 
  forgotPassword, 
  resetPassword 
} from '../controllers/authController.js';
import { authenticate, userRateLimit } from '../middleware/auth.js';

const router = express.Router();

// Routes publiques (non authentifiées)
router.post('/register', userRateLimit(5, 15 * 60 * 1000), register);
router.post('/login', userRateLimit(10, 15 * 60 * 1000), login);
router.post('/refresh', userRateLimit(20, 15 * 60 * 1000), refresh);
router.post('/forgot-password', userRateLimit(3, 60 * 60 * 1000), forgotPassword);
router.post('/reset-password', userRateLimit(3, 60 * 60 * 1000), resetPassword);
router.get('/verify-email/:token', verifyEmail);

// Routes authentifiées
router.use(authenticate);

router.get('/profile', profile);
router.post('/logout', logout);
router.post('/logout-all', logoutAll);

export default router;