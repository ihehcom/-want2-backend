import bcrypt from 'bcryptjs';
import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { jwtUtils } from '../middleware/auth.js';
import { cache, session } from '../database/redis.js';
import prisma from '../database/connection.js';
import { logger, appLogger } from '../utils/logger.js';
import { validateRegistration, validateLogin } from '../utils/validators.js';

// Inscription d'un nouvel utilisateur
export const register = asyncHandler(async (req, res) => {
  // Validation des données
  const { error, value } = validateRegistration(req.body);
  if (error) {
    throw errors.badRequest('Données d\'inscription invalides', error.details);
  }

  const { name, email, password, userMode } = value;

  // Vérification si l'utilisateur existe déjà
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    throw errors.conflict('Un compte avec cet email existe déjà');
  }

  // Hashage du mot de passe
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Création de l'utilisateur
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      userMode,
      preferences: {
        create: {
          emailNotifications: true,
          pushNotifications: true,
          offerNotifications: true,
          likeNotifications: true
        }
      }
    },
    select: {
      id: true,
      email: true,
      name: true,
      userMode: true,
      isVerified: true,
      createdAt: true
    }
  });

  // Génération des tokens
  const accessToken = jwtUtils.generateAccessToken({ id: user.id });
  const refreshToken = jwtUtils.generateRefreshToken({ id: user.id });

  // Sauvegarde du refresh token en DB
  await prisma.authToken.create({
    data: {
      token: refreshToken,
      type: 'REFRESH',
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours
    }
  });

  // Mise en cache de l'utilisateur
  await cache.set(`user:${user.id}`, user, 3600);

  // Génération du token de vérification email
  const emailToken = jwtUtils.generateEmailToken(user.id);
  
  // TODO: Envoyer l'email de vérification (sera implémenté plus tard)
  
  appLogger.auth(`Nouvel utilisateur inscrit: ${email}`, { userId: user.id });

  res.status(201).json({
    success: true,
    message: 'Inscription réussie',
    data: {
      user,
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// Connexion d'un utilisateur
export const login = asyncHandler(async (req, res) => {
  // Validation des données
  const { error, value } = validateLogin(req.body);
  if (error) {
    throw errors.badRequest('Données de connexion invalides', error.details);
  }

  const { email, password } = value;

  // Recherche de l'utilisateur avec le mot de passe
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      preferences: true
    }
  });

  if (!user) {
    throw errors.unauthorized('Email ou mot de passe incorrect');
  }

  // Vérification du mot de passe
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw errors.unauthorized('Email ou mot de passe incorrect');
  }

  // Pas de mise à jour de date de connexion pour le moment

  // Génération des tokens
  const accessToken = jwtUtils.generateAccessToken({ id: user.id });
  const refreshToken = jwtUtils.generateRefreshToken({ id: user.id });

  // Révocation des anciens refresh tokens
  await prisma.authToken.updateMany({
    where: {
      userId: user.id,
      type: 'REFRESH',
      isRevoked: false
    },
    data: { isRevoked: true }
  });

  // Sauvegarde du nouveau refresh token
  await prisma.authToken.create({
    data: {
      token: refreshToken,
      type: 'REFRESH',
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours
    }
  });

  // Préparation des données utilisateur (sans mot de passe)
  const userData = {
    id: user.id,
    email: user.email,
    name: user.name,
    userMode: user.userMode,
    isVerified: user.isVerified,
    avatar: user.avatar,
    createdAt: user.createdAt,
    preferences: user.preferences
  };

  // Mise en cache
  await cache.set(`user:${user.id}`, userData, 3600);

  appLogger.auth(`Connexion utilisateur: ${email}`, { userId: user.id });

  res.json({
    success: true,
    message: 'Connexion réussie',
    data: {
      user: userData,
      tokens: {
        accessToken,
        refreshToken
      }
    }
  });
});

// Rafraîchissement du token d'accès
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw errors.badRequest('Refresh token requis');
  }

  // Vérification du token
  const decoded = jwtUtils.verifyRefreshToken(refreshToken);

  // Vérification en base de données
  const tokenRecord = await prisma.authToken.findFirst({
    where: {
      token: refreshToken,
      type: 'REFRESH',
      isRevoked: false,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          userMode: true,
          isVerified: true,
          avatar: true
        }
      }
    }
  });

  if (!tokenRecord) {
    throw errors.unauthorized('Refresh token invalide ou expiré');
  }

  // Génération d'un nouveau token d'accès
  const newAccessToken = jwtUtils.generateAccessToken({ id: tokenRecord.userId });

  // Optionnel: rotation des refresh tokens (sécurité renforcée)
  let newRefreshToken = refreshToken;
  if (process.env.ROTATE_REFRESH_TOKENS === 'true') {
    newRefreshToken = jwtUtils.generateRefreshToken({ id: tokenRecord.userId });
    
    // Révocation de l'ancien
    await prisma.authToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true }
    });

    // Création du nouveau
    await prisma.authToken.create({
      data: {
        token: newRefreshToken,
        type: 'REFRESH',
        userId: tokenRecord.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  }

  res.json({
    success: true,
    message: 'Token rafraîchi',
    data: {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    }
  });
});

// Déconnexion
export const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  // Révocation du token d'accès
  if (req.token) {
    await jwtUtils.revokeToken(req.token);
  }

  // Révocation du refresh token
  if (refreshToken) {
    await prisma.authToken.updateMany({
      where: {
        token: refreshToken,
        userId: req.user.id
      },
      data: { isRevoked: true }
    });
  }

  // Suppression du cache utilisateur
  await cache.del(`user:${req.user.id}`);

  appLogger.auth(`Déconnexion utilisateur: ${req.user.email}`, { userId: req.user.id });

  res.json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

// Déconnexion de tous les appareils
export const logoutAll = asyncHandler(async (req, res) => {
  // Révocation du token d'accès actuel
  if (req.token) {
    await jwtUtils.revokeToken(req.token);
  }

  // Révocation de tous les refresh tokens
  await prisma.authToken.updateMany({
    where: {
      userId: req.user.id,
      type: 'REFRESH',
      isRevoked: false
    },
    data: { isRevoked: true }
  });

  // Suppression du cache utilisateur
  await cache.del(`user:${req.user.id}`);

  appLogger.auth(`Déconnexion de tous les appareils: ${req.user.email}`, { userId: req.user.id });

  res.json({
    success: true,
    message: 'Déconnexion de tous les appareils réussie'
  });
});

// Profil de l'utilisateur connecté
export const profile = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      userMode: true,
      isVerified: true,
      avatar: true,
      createdAt: true,
      preferences: true,
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

  if (!user) {
    throw errors.notFound('Utilisateur');
  }

  res.json({
    success: true,
    data: { user }
  });
});

// Vérification de l'email
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Vérification du token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (decoded.type !== 'email_verification') {
    throw errors.badRequest('Token de vérification invalide');
  }

  // Mise à jour de l'utilisateur
  const user = await prisma.user.update({
    where: { id: decoded.userId },
    data: { isVerified: true },
    select: {
      id: true,
      email: true,
      name: true,
      isVerified: true
    }
  });

  // Mise à jour du cache
  await cache.del(`user:${user.id}`);

  appLogger.auth(`Email vérifié: ${user.email}`, { userId: user.id });

  res.json({
    success: true,
    message: 'Email vérifié avec succès',
    data: { user }
  });
});

// Demande de reset de mot de passe
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw errors.badRequest('Email requis');
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  // On retourne toujours la même réponse pour éviter l'énumération des emails
  if (!user) {
    return res.json({
      success: true,
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
    });
  }

  // Génération du token de reset
  const resetToken = jwtUtils.generateResetToken(user.id);

  // TODO: Envoyer l'email de reset (sera implémenté plus tard)

  appLogger.auth(`Demande de reset password: ${email}`, { userId: user.id });

  res.json({
    success: true,
    message: 'Si cet email existe, un lien de réinitialisation a été envoyé'
  });
});

// Reset du mot de passe
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    throw errors.badRequest('Token et nouveau mot de passe requis');
  }

  // Vérification du token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  if (decoded.type !== 'password_reset') {
    throw errors.badRequest('Token de reset invalide');
  }

  // Hashage du nouveau mot de passe
  const hashedPassword = await bcrypt.hash(password, 12);

  // Mise à jour du mot de passe
  await prisma.user.update({
    where: { id: decoded.userId },
    data: { password: hashedPassword }
  });

  // Révocation de tous les tokens de l'utilisateur
  await prisma.authToken.updateMany({
    where: {
      userId: decoded.userId,
      isRevoked: false
    },
    data: { isRevoked: true }
  });

  // Suppression du cache
  await cache.del(`user:${decoded.userId}`);

  appLogger.auth(`Mot de passe réinitialisé`, { userId: decoded.userId });

  res.json({
    success: true,
    message: 'Mot de passe réinitialisé avec succès'
  });
});