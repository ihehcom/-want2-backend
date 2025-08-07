import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

// Configuration Prisma avec optimisations
const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event', 
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: 'pretty',
});

// Logging des requêtes Prisma
prisma.$on('query', (e) => {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`🔍 Query: ${e.query}`);
    logger.debug(`📊 Params: ${e.params}`);
    logger.debug(`⏱️ Duration: ${e.duration}ms`);
  }
});

prisma.$on('error', (e) => {
  logger.error('❌ Erreur Prisma:', e);
});

prisma.$on('info', (e) => {
  logger.info(`ℹ️ Info Prisma: ${e.message}`);
});

prisma.$on('warn', (e) => {
  logger.warn(`⚠️ Warning Prisma: ${e.message}`);
});

// Fonction de connexion à la base de données
export async function connectDatabase() {
  try {
    await prisma.$connect();
    
    // Test de la connexion
    await prisma.$queryRaw`SELECT 1`;
    
    logger.info('✅ Connexion PostgreSQL établie');
    
    return prisma;
  } catch (error) {
    logger.error('❌ Erreur de connexion à la base de données:', error);
    throw error;
  }
}

// Fonction de déconnexion propre
export async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('📊 Base de données déconnectée');
  } catch (error) {
    logger.error('❌ Erreur lors de la déconnexion DB:', error);
    throw error;
  }
}

// Export de l'instance Prisma
export default prisma;