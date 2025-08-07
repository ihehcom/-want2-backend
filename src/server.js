import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

// Import des configurations et middlewares
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { connectDatabase } from './database/connection.js';
import prisma from './database/connection.js';
import { connectRedis } from './database/redis.js';
import { initializeSocketIO, closeSocketIO } from './services/socketService.js';

// Import des routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import offerRoutes from './routes/offers.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/upload.js';
import analyticsRoutes from './routes/analytics.js';

// Configuration des variables d'environnement
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de sécurité et performance
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.use(compression());

// Configuration CORS pour iOS et production
const allowedOrigins = [
  'capacitor://localhost',
  'ionic://localhost', 
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8100',
  // Production origins - depuis variables d'environnement
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];

app.use(cors({
  origin: (origin, callback) => {
    // Permettre les requêtes sans origin (apps mobiles)
    if (!origin) return callback(null, true);
    
    // Vérifier si l'origin est autorisé
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: {
    error: 'Trop de requêtes, veuillez réessayer plus tard.',
    code: 'TOO_MANY_REQUESTS'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting pour les webhooks et health checks
    return req.path === '/health' || req.path.startsWith('/webhooks');
  }
});

app.use(limiter);

// Logging des requêtes
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Parsing du body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);

// Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'WANT2 API',
    version: '1.0.0',
    description: 'API Backend pour l\'application WANT2 - Marketplace authentifié',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users', 
      products: '/api/products',
      offers: '/api/offers',
      notifications: '/api/notifications',
      upload: '/api/upload',
      analytics: '/api/analytics'
    },
    documentation: 'https://docs.want2.app',
    status: 'active'
  });
});

// Middleware de gestion d'erreurs
app.use(notFound);
app.use(errorHandler);

// Fonction de démarrage du serveur
async function startServer() {
  try {
    // Connexion à la base de données
    await connectDatabase();
    logger.info('✅ Base de données connectée');

    // Connexion à Redis  
    // Connexion Redis (optionnelle)
    try {
      await connectRedis();
      logger.info('✅ Redis connecté');
    } catch (error) {
      logger.warn('⚠️ Redis indisponible, serveur démarre sans cache');
    }

    // Création du serveur HTTP
    const server = createServer(app);
    
    // Initialisation de Socket.io
    const io = initializeSocketIO(server);
    logger.info('🔌 Socket.io initialisé');

    // Démarrage du serveur
    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Serveur WANT2 démarré sur le port ${PORT}`);
      logger.info(`📱 API URL: http://localhost:${PORT}/api`);
      logger.info(`🌐 API URL (externe): http://192.168.1.4:${PORT}/api`);
      logger.info(`🔗 WebSocket: ws://localhost:${PORT} / ws://192.168.1.4:${PORT}`);
      logger.info(`💚 Health check: http://localhost:${PORT}/health`);
      logger.info(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
    });

    // Gestion propre de l'arrêt du serveur
    const gracefulShutdown = (signal) => {
      logger.info(`📴 Signal ${signal} reçu, arrêt du serveur...`);
      
      server.close(async () => {
        logger.info('🔌 Serveur HTTP fermé');
        
        try {
          // Fermer Socket.io
          closeSocketIO();
          logger.info('🔌 Socket.io fermé');
          
          // Fermer les connexions DB/Redis proprement
          await prisma.$disconnect();
          logger.info('📊 Base de données déconnectée');
          
          process.exit(0);
        } catch (error) {
          logger.error('❌ Erreur lors de la fermeture:', error);
          process.exit(1);
        }
      });

      // Force shutdown après 30s
      setTimeout(() => {
        logger.error('⚠️ Arrêt forcé du serveur');
        process.exit(1);
      }, 30000);
    };

    // Écoute des signaux d'arrêt
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Gestion des erreurs non capturées
    process.on('uncaughtException', (error) => {
      logger.error('💥 Erreur non capturée:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ Promise rejetée non gérée:', reason);
      logger.error('🔍 Promise:', promise);
      process.exit(1);
    });

  } catch (error) {
    logger.error('💥 Erreur de démarrage du serveur:', error);
    process.exit(1);
  }
}

// Démarrage du serveur
startServer();