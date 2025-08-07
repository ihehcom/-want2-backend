import { logger } from '../utils/logger.js';

// Middleware pour les routes non trouvées
export const notFound = (req, res, next) => {
  const error = new Error(`Route non trouvée - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Middleware global de gestion d'erreurs
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erreur interne du serveur';
  let details = null;

  // Log de l'erreur avec contexte
  logger.error('❌ Erreur API:', {
    message: err.message,
    stack: err.stack,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Gestion spécifique des erreurs Prisma
  if (err.code) {
    switch (err.code) {
      case 'P1001':
        statusCode = 503;
        message = 'Base de données indisponible';
        break;
      case 'P2002':
        statusCode = 409;
        message = 'Violation de contrainte unique';
        details = `Le champ ${err.meta?.target?.[0] || 'inconnu'} doit être unique`;
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Enregistrement non trouvé';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Violation de contrainte de clé étrangère';
        break;
      case 'P2014':
        statusCode = 400;
        message = 'Relation requise manquante';
        break;
      default:
        statusCode = 500;
        message = 'Erreur de base de données';
    }
  }

  // Erreurs de validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Erreur de validation';
    details = Object.values(err.errors).map(e => e.message);
  }

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token invalide';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expiré';
  }

  // Erreurs de cast (MongoDB/Mongoose style)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Format d\'ID invalide';
  }

  // Erreur de syntaxe JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Format JSON invalide';
  }

  // Erreur de limite de taille
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Fichier trop volumineux';
  }

  // Erreur de type de fichier
  if (err.code === 'INVALID_FILE_TYPE') {
    statusCode = 400;
    message = 'Type de fichier non autorisé';
  }

  // Structure de réponse d'erreur
  const errorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  };

  // Ajouter les détails si disponibles
  if (details) {
    errorResponse.error.details = details;
  }

  // En développement, inclure la stack trace
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.raw = err;
  }

  // Ajouter un ID de trace pour le débogage
  const traceId = req.headers['x-trace-id'] || 
                  Math.random().toString(36).substring(2, 15);
  errorResponse.error.traceId = traceId;

  res.status(statusCode).json(errorResponse);
};

// Middleware pour capturer les erreurs async
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Factory pour créer des erreurs personnalisées
export class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Erreurs pré-définies courantes
export const errors = {
  notFound: (resource = 'Ressource') => 
    new AppError(`${resource} non trouvée`, 404),
  
  unauthorized: (message = 'Non autorisé') => 
    new AppError(message, 401),
  
  forbidden: (message = 'Accès interdit') => 
    new AppError(message, 403),
  
  badRequest: (message = 'Requête invalide', details = null) => 
    new AppError(message, 400, details),
  
  conflict: (message = 'Conflit de données') => 
    new AppError(message, 409),
  
  tooManyRequests: (message = 'Trop de requêtes') => 
    new AppError(message, 429),
  
  internal: (message = 'Erreur interne du serveur') => 
    new AppError(message, 500)
};