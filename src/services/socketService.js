import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

let io = null;

// Initialiser Socket.io avec le serveur HTTP
export const initializeSocketIO = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost:8100',
        'http://localhost:3000'
      ],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // Middleware d'authentification pour Socket.io
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Token d\'authentification requis'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.join(`user:${decoded.id}`);
      next();
    } catch (error) {
      logger.error('Erreur authentification Socket.io:', error);
      next(new Error('Token invalide'));
    }
  });

  // Gestionnaire de connexion
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`Utilisateur connecté via WebSocket: ${userId}`, { socketId: socket.id });

    // Rejoindre la room de l'utilisateur
    socket.join(`user:${userId}`);

    // Événements personnalisés
    socket.on('notification:mark_read', async (data) => {
      try {
        // Ici on pourrait ajouter la logique pour marquer comme lu
        // et notifier les autres connexions de l'utilisateur
        socket.to(`user:${userId}`).emit('notification:read', {
          notificationId: data.notificationId
        });
      } catch (error) {
        logger.error('Erreur marquage notification:', error);
        socket.emit('error', { message: 'Erreur lors du marquage de la notification' });
      }
    });

    socket.on('offer:status_update', async (data) => {
      try {
        // Notifier les parties impliquées dans une offre
        const { offerId, status, targetUserId } = data;
        
        if (targetUserId) {
          socket.to(`user:${targetUserId}`).emit('offer:updated', {
            offerId,
            status,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        logger.error('Erreur mise à jour offre:', error);
      }
    });

    socket.on('typing:start', (data) => {
      // Pour les futures fonctionnalités de chat
      socket.to(`chat:${data.chatId}`).emit('user:typing', {
        userId,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`chat:${data.chatId}`).emit('user:stopped_typing', {
        userId,
        timestamp: new Date().toISOString()
      });
    });

    // Événements de présence
    socket.on('user:online', () => {
      socket.broadcast.emit('user:status_changed', {
        userId,
        status: 'online',
        timestamp: new Date().toISOString()
      });
    });

    // Gestionnaire de déconnexion
    socket.on('disconnect', (reason) => {
      logger.info(`Utilisateur déconnecté: ${userId}`, { 
        reason, 
        socketId: socket.id 
      });

      socket.broadcast.emit('user:status_changed', {
        userId,
        status: 'offline',
        timestamp: new Date().toISOString()
      });
    });

    // Gestion des erreurs
    socket.on('error', (error) => {
      logger.error('Erreur Socket.io:', { error, userId, socketId: socket.id });
    });
  });

  logger.info('Socket.io initialisé avec succès');
  return io;
};

// Obtenir l'instance Socket.io
export const getSocketIO = () => {
  if (!io) {
    throw new Error('Socket.io non initialisé. Appelez initializeSocketIO() d\'abord.');
  }
  return io;
};

// Utilitaires pour envoyer des notifications
export const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
    logger.debug(`Événement ${event} envoyé à l'utilisateur ${userId}`, data);
  }
};

export const emitToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
    logger.debug(`Événement ${event} envoyé à la room ${room}`, data);
  }
};

// Utilitaire pour diffuser à tous les clients connectés
export const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
    logger.debug(`Événement ${event} diffusé à tous les clients`, data);
  }
};

// Obtenir les statistiques de connexion
export const getConnectionStats = () => {
  if (!io) return null;
  
  const connectedUsers = new Set();
  const sockets = io.sockets.sockets;
  
  sockets.forEach(socket => {
    if (socket.userId) {
      connectedUsers.add(socket.userId);
    }
  });

  return {
    totalSockets: sockets.size,
    uniqueUsers: connectedUsers.size,
    timestamp: new Date().toISOString()
  };
};

// Fonction de nettoyage
export const closeSocketIO = () => {
  if (io) {
    logger.info('Fermeture de Socket.io...');
    io.close();
    io = null;
  }
};

export default {
  initializeSocketIO,
  getSocketIO,
  emitToUser,
  emitToRoom,
  broadcastToAll,
  getConnectionStats,
  closeSocketIO
};