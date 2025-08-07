import winston from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration des formats de log
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Configuration pour la console (development)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    if (stack) {
      log += `\\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      log += `\\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Création des transports
const transports = [];

// Console transport (toujours actif)
transports.push(
  new winston.transports.Console({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  })
);

// File transports (production et développement)
if (process.env.NODE_ENV !== 'test') {
  // Log général
  transports.push(
    new winston.transports.File({
      filename: join(__dirname, '../../logs/app.log'),
      level: 'info',
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  // Log d'erreurs
  transports.push(
    new winston.transports.File({
      filename: join(__dirname, '../../logs/error.log'),
      level: 'error', 
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );

  // Log combiné
  transports.push(
    new winston.transports.File({
      filename: join(__dirname, '../../logs/combined.log'),
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      tailable: true
    })
  );
}

// Création du logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// Méthodes utilitaires pour l'application
export const appLogger = {
  // Log d'authentification
  auth: (message, meta = {}) => {
    logger.info(`🔐 [AUTH] ${message}`, meta);
  },

  // Log de base de données
  database: (message, meta = {}) => {
    logger.info(`📊 [DATABASE] ${message}`, meta);
  },

  // Log d'API
  api: (message, meta = {}) => {
    logger.info(`🌐 [API] ${message}`, meta);
  },

  // Log de cache
  cache: (message, meta = {}) => {
    logger.info(`💾 [CACHE] ${message}`, meta);
  },

  // Log de sécurité
  security: (message, meta = {}) => {
    logger.warn(`🛡️ [SECURITY] ${message}`, meta);
  },

  // Log de performance
  performance: (message, meta = {}) => {
    logger.info(`⚡ [PERFORMANCE] ${message}`, meta);
  },

  // Log de business logic
  business: (message, meta = {}) => {
    logger.info(`💼 [BUSINESS] ${message}`, meta);
  },

  // Log d'erreur avec contexte
  errorWithContext: (error, context = {}) => {
    logger.error(`❌ [ERROR]`, {
      message: error.message,
      stack: error.stack,
      ...context
    });
  }
};

export default logger;