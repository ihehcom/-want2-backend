import jwt from 'jsonwebtoken';
import { asyncHandler, errors } from './errorHandler.js';
import prisma from '../database/connection.js';
import { cache, rateLimiter } from '../database/redis.js';
import { logger } from '../utils/logger.js';

// Middleware d'authentification principale
export const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  // Récupération du token depuis les headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Vérification de la présence du token
  if (!token) {
    throw errors.unauthorized('Token d\'authentification requis');
  }

  try {
    // Vérification et décodage du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérification dans le cache Redis d'abord
    let user = await cache.get(`user:${decoded.id}`);
    
    if (!user) {
      // Si pas en cache, récupération depuis la DB
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          name: true,
          userMode: true,
          isVerified: true,
          avatar: true,
          createdAt: true
        }
      });

      if (!user) {
        throw errors.unauthorized('Utilisateur non trouvé');
      }

      // Mise en cache de l'utilisateur pour 1 heure
      await cache.set(`user:${user.id}`, user, 3600);
    }

    // Vérification que le token n'est pas révoqué
    const isTokenRevoked = await cache.exists(`revoked_token:${token}`);
    if (isTokenRevoked) {
      throw errors.unauthorized('Token révoqué');
    }

    // Ajout des informations utilisateur à la requête
    req.user = user;
    req.token = token;

    logger.info(`🔐 Utilisateur authentifié: ${user.email} (${user.id})`);
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw errors.unauthorized('Token invalide');
    }
    if (error.name === 'TokenExpiredError') {
      throw errors.unauthorized('Token expiré');
    }
    throw error;
  }
});

// Middleware optionnel (utilisateur connecté ou anonyme)
export const optionalAuth = asyncHandler(async (req, res, next) => {
  try {
    await authenticate(req, res, next);
  } catch (error) {
    // Ignore l'erreur et continue sans utilisateur
    req.user = null;
    next();
  }
});

// Middleware de vérification des rôles
export const authorize = (...roles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw errors.unauthorized('Authentification requise');
    }

    if (!roles.includes(req.user.userMode)) {
      throw errors.forbidden(`Accès restreint aux rôles: ${roles.join(', ')}`);
    }

    next();
  });
};

// Middleware de vérification email vérifié
export const requireVerified = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw errors.unauthorized('Authentification requise');
  }

  if (!req.user.isVerified) {
    throw errors.forbidden('Email non vérifié. Vérifiez votre boîte mail.');
  }

  next();
});

// Middleware de vérification propriétaire de ressource
export const requireOwnership = (resourceParam = 'id', userField = 'userId') => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw errors.unauthorized('Authentification requise');
    }

    const resourceId = req.params[resourceParam];
    
    // Récupération de la ressource pour vérifier la propriété
    // Cette logique dépendra du type de ressource (Product, Offer, etc.)
    // Elle sera implémentée dans les contrôleurs spécifiques
    
    req.resourceId = resourceId;
    next();
  });
};

// Middleware de limitation par utilisateur
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const key = `rate_limit:user:${req.user.id}`;
    const { current, remaining, resetTime } = await rateLimiter.check(
      key, 
      maxRequests, 
      Math.floor(windowMs / 1000)
    );

    // Ajout des headers de rate limiting
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': new Date(Date.now() + resetTime * 1000).toISOString()
    });

    if (current > maxRequests) {
      throw errors.tooManyRequests('Limite de requêtes dépassée');
    }

    next();
  });
};

// Utilitaires JWT
export const jwtUtils = {
  // Génération d'un token d'accès
  generateAccessToken: (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      issuer: 'want2-api',
      audience: 'want2-app'
    });
  },

  // Génération d'un token de rafraîchissement
  generateRefreshToken: (payload) => {
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'want2-api',
      audience: 'want2-app'
    });
  },

  // Vérification d'un token de rafraîchissement
  verifyRefreshToken: (token) => {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  },

  // Révocation d'un token
  revokeToken: async (token) => {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await cache.set(`revoked_token:${token}`, true, ttl);
      }
    }
  },

  // Génération d'un token de vérification email
  generateEmailToken: (userId) => {
    return jwt.sign(
      { userId, type: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Génération d'un token de reset password
  generateResetToken: (userId) => {
    return jwt.sign(
      { userId, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  }
};