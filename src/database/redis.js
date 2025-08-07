import Redis from 'redis';
import { logger } from '../utils/logger.js';

let redisClient = null;

// Configuration Redis
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  retryDelayOnClusterDown: 300,
  retryDelayOnFailoverAttempt: 100,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4,
  db: 0
};

// Création et connexion du client Redis
export async function connectRedis() {
  try {
    redisClient = Redis.createClient(redisConfig);

    // Gestion des événements Redis
    redisClient.on('connect', () => {
      logger.info('🔄 Connexion à Redis en cours...');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis connecté et prêt');
    });

    redisClient.on('error', (error) => {
      logger.warn('⚠️ Redis indisponible:', error.code);
      // Ne pas reconnecter automatiquement
      redisClient = null;
    });

    redisClient.on('end', () => {
      logger.info('🔌 Connexion Redis fermée');
    });

    // Connexion avec timeout
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });
    
    await Promise.race([redisClient.connect(), timeout]);

    // Test de la connexion
    await redisClient.ping();
    
    return redisClient;
  } catch (error) {
    logger.warn('⚠️ Redis indisponible, fonctionne sans cache:', error.message);
    redisClient = null;
    return null;
  }
}

// Fonction de déconnexion propre
export async function disconnectRedis() {
  try {
    if (redisClient) {
      await redisClient.disconnect();
      logger.info('📊 Redis déconnecté');
    }
  } catch (error) {
    logger.error('❌ Erreur lors de la déconnexion Redis:', error);
    throw error;
  }
}

// Utilitaires Redis pour cache
export const cache = {
  // GET avec parsing JSON automatique
  async get(key) {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`❌ Erreur cache GET ${key}:`, error);
      return null;
    }
  },

  // SET avec sérialisation JSON automatique
  async set(key, value, ttl = 3600) {
    if (!redisClient) return false;
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redisClient.setEx(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error(`❌ Erreur cache SET ${key}:`, error);
      return false;
    }
  },

  // DELETE
  async del(key) {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error(`❌ Erreur cache DEL ${key}:`, error);
      return false;
    }
  },

  // CHECK existence
  async exists(key) {
    if (!redisClient) return false;
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error(`❌ Erreur cache EXISTS ${key}:`, error);
      return false;
    }
  },

  // FLUSH pattern
  async flushPattern(pattern) {
    if (!redisClient) return 0;
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      return keys.length;
    } catch (error) {
      logger.error(`❌ Erreur cache FLUSH PATTERN ${pattern}:`, error);
      return 0;
    }
  }
};

// Session management
export const session = {
  async create(sessionId, userData, ttl = 7 * 24 * 3600) { // 7 jours par défaut
    return await cache.set(`session:${sessionId}`, userData, ttl);
  },

  async get(sessionId) {
    return await cache.get(`session:${sessionId}`);
  },

  async update(sessionId, userData, ttl = 7 * 24 * 3600) {
    return await cache.set(`session:${sessionId}`, userData, ttl);
  },

  async destroy(sessionId) {
    return await cache.del(`session:${sessionId}`);
  }
};

// Rate limiting utilities
export const rateLimiter = {
  async check(key, limit, window) {
    if (!redisClient) {
      return { current: 0, remaining: limit, resetTime: window };
    }
    try {
      const current = await redisClient.incr(key);
      
      if (current === 1) {
        await redisClient.expire(key, window);
      }
      
      return {
        current,
        remaining: Math.max(0, limit - current),
        resetTime: await redisClient.ttl(key)
      };
    } catch (error) {
      logger.error(`❌ Erreur rate limiter ${key}:`, error);
      return { current: 0, remaining: limit, resetTime: window };
    }
  }
};

export default redisClient;