import { asyncHandler, errors } from '../middleware/errorHandler.js';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { logger, appLogger } from '../utils/logger.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Configuration Multer pour upload temporaire
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Vérifier le type de fichier
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers image sont autorisés'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10 // 10 fichiers max par upload
  }
});

// Fonction utilitaire pour optimiser les images
const optimizeImage = async (buffer, options = {}) => {
  const {
    width = 800,
    height = 600,
    quality = 80,
    format = 'jpeg'
  } = options;

  try {
    return await sharp(buffer)
      .resize(width, height, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .toFormat(format, { quality })
      .toBuffer();
  } catch (error) {
    logger.error('Erreur optimisation image:', error);
    throw new Error('Erreur lors de l\'optimisation de l\'image');
  }
};

// Upload d'image unique
export const uploadSingle = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw errors.badRequest('Aucun fichier fourni');
  }

  const { buffer, mimetype, originalname } = req.file;
  const { folder = 'general', optimize = 'true' } = req.body;

  try {
    let processedBuffer = buffer;
    
    // Optimisation de l'image si demandée
    if (optimize === 'true') {
      processedBuffer = await optimizeImage(buffer, {
        width: 1200,
        height: 900,
        quality: 85
      });
    }

    // Upload vers Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `want2/${folder}`,
          resource_type: 'image',
          transformation: [
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ],
          tags: ['want2', folder, req.user?.id]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(processedBuffer);
    });

    appLogger.business('Image uploadée avec succès', {
      userId: req.user?.id,
      publicId: result.public_id,
      folder,
      originalName: originalname,
      size: result.bytes
    });

    res.json({
      success: true,
      message: 'Image uploadée avec succès',
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        folder
      }
    });

  } catch (error) {
    logger.error('Erreur upload Cloudinary:', error);
    throw errors.internalServer('Erreur lors de l\'upload de l\'image');
  }
});

// Upload multiple d'images
export const uploadMultiple = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw errors.badRequest('Aucun fichier fourni');
  }

  if (req.files.length > 10) {
    throw errors.badRequest('Maximum 10 images par upload');
  }

  const { folder = 'general', optimize = 'true' } = req.body;
  const uploadPromises = [];

  // Traitement de chaque fichier
  for (const file of req.files) {
    const { buffer, mimetype, originalname } = file;
    
    const uploadPromise = (async () => {
      try {
        let processedBuffer = buffer;
        
        // Optimisation de l'image si demandée
        if (optimize === 'true') {
          processedBuffer = await optimizeImage(buffer, {
            width: 1200,
            height: 900,
            quality: 85
          });
        }

        // Upload vers Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: `want2/${folder}`,
              resource_type: 'image',
              transformation: [
                { quality: 'auto:good' },
                { fetch_format: 'auto' }
              ],
              tags: ['want2', folder, req.user?.id]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(processedBuffer);
        });

        return {
          publicId: result.public_id,
          url: result.secure_url,
          width: result.width,
          height: result.height,
          format: result.format,
          size: result.bytes,
          originalName: originalname
        };

      } catch (error) {
        logger.error(`Erreur upload ${originalname}:`, error);
        return {
          originalName: originalname,
          error: error.message
        };
      }
    })();

    uploadPromises.push(uploadPromise);
  }

  // Attendre tous les uploads
  const results = await Promise.all(uploadPromises);
  
  // Séparer les succès et échecs
  const successful = results.filter(result => !result.error);
  const failed = results.filter(result => result.error);

  appLogger.business('Upload multiple terminé', {
    userId: req.user?.id,
    folder,
    totalFiles: req.files.length,
    successful: successful.length,
    failed: failed.length
  });

  res.json({
    success: true,
    message: `${successful.length} image(s) uploadée(s) avec succès`,
    data: {
      successful,
      failed,
      total: req.files.length
    }
  });
});

// Supprimer une image de Cloudinary
export const deleteImage = asyncHandler(async (req, res) => {
  const { publicId } = req.params;

  if (!publicId) {
    throw errors.badRequest('Public ID requis');
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      appLogger.business('Image supprimée', {
        userId: req.user?.id,
        publicId
      });

      res.json({
        success: true,
        message: 'Image supprimée avec succès'
      });
    } else {
      throw errors.notFound('Image non trouvée');
    }

  } catch (error) {
    logger.error('Erreur suppression Cloudinary:', error);
    throw errors.internalServer('Erreur lors de la suppression de l\'image');
  }
});

// Obtenir les détails d'une image
export const getImageDetails = asyncHandler(async (req, res) => {
  const { publicId } = req.params;

  if (!publicId) {
    throw errors.badRequest('Public ID requis');
  }

  try {
    const result = await cloudinary.api.resource(publicId, {
      image_metadata: true
    });

    res.json({
      success: true,
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        size: result.bytes,
        createdAt: result.created_at,
        folder: result.folder,
        tags: result.tags,
        metadata: result.image_metadata
      }
    });

  } catch (error) {
    logger.error('Erreur récupération détails image:', error);
    
    if (error.http_code === 404) {
      throw errors.notFound('Image non trouvée');
    }
    
    throw errors.internalServer('Erreur lors de la récupération des détails');
  }
});

// Générer des transformations d'image
export const generateTransformations = asyncHandler(async (req, res) => {
  const { publicId } = req.params;
  const { 
    width, 
    height, 
    crop = 'fill', 
    gravity = 'center',
    quality = 'auto:good',
    format = 'auto'
  } = req.query;

  if (!publicId) {
    throw errors.badRequest('Public ID requis');
  }

  try {
    // Construire les transformations
    const transformations = [];
    
    if (width || height) {
      transformations.push({
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
        crop,
        gravity
      });
    }

    transformations.push({
      quality,
      fetch_format: format
    });

    // Générer l'URL transformée
    const transformedUrl = cloudinary.url(publicId, {
      transformation: transformations,
      secure: true
    });

    res.json({
      success: true,
      data: {
        originalPublicId: publicId,
        transformedUrl,
        transformations
      }
    });

  } catch (error) {
    logger.error('Erreur génération transformations:', error);
    throw errors.internalServer('Erreur lors de la génération des transformations');
  }
});

// Lister les images d'un dossier
export const listImages = asyncHandler(async (req, res) => {
  const { folder = 'general', limit = 20, nextCursor } = req.query;
  const folderPath = `want2/${folder}`;

  try {
    const options = {
      type: 'upload',
      prefix: folderPath,
      max_results: parseInt(limit)
    };

    if (nextCursor) {
      options.next_cursor = nextCursor;
    }

    const result = await cloudinary.api.resources(options);

    res.json({
      success: true,
      data: {
        images: result.resources.map(resource => ({
          publicId: resource.public_id,
          url: resource.secure_url,
          width: resource.width,
          height: resource.height,
          format: resource.format,
          size: resource.bytes,
          createdAt: resource.created_at
        })),
        nextCursor: result.next_cursor,
        totalCount: result.total_count
      }
    });

  } catch (error) {
    logger.error('Erreur listage images:', error);
    throw errors.internalServer('Erreur lors du listage des images');
  }
});

// Upload d'avatar utilisateur
export const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw errors.badRequest('Aucun fichier fourni');
  }

  const { buffer, originalname } = req.file;
  const userId = req.user.id;

  try {
    // Optimisation spéciale pour avatar (carré, plus petite taille)
    const processedBuffer = await optimizeImage(buffer, {
      width: 400,
      height: 400,
      quality: 90
    });

    // Upload vers Cloudinary avec transformation circulaire
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'want2/avatars',
          resource_type: 'image',
          public_id: `avatar_${userId}`,
          overwrite: true,
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' },
            { radius: 'max' } // Rendre circulaire
          ],
          tags: ['want2', 'avatar', userId]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(processedBuffer);
    });

    appLogger.business('Avatar uploadé', {
      userId,
      publicId: result.public_id,
      originalName: originalname,
      size: result.bytes
    });

    res.json({
      success: true,
      message: 'Avatar uploadé avec succès',
      data: {
        publicId: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height,
        size: result.bytes
      }
    });

  } catch (error) {
    logger.error('Erreur upload avatar:', error);
    throw errors.internalServer('Erreur lors de l\'upload de l\'avatar');
  }
});

// Obtenir les statistiques d'utilisation Cloudinary
export const getUploadStats = asyncHandler(async (req, res) => {
  try {
    const [usage, quota] = await Promise.all([
      cloudinary.api.usage(),
      cloudinary.api.usage({ date: new Date().toISOString().split('T')[0] })
    ]);

    res.json({
      success: true,
      data: {
        usage: {
          storage: usage.storage,
          bandwidth: usage.bandwidth,
          requests: usage.requests,
          resources: usage.resources
        },
        quota: {
          storage: quota.storage,
          bandwidth: quota.bandwidth,
          requests: quota.requests
        },
        limits: {
          storageLimit: usage.plan?.storage_limit,
          bandwidthLimit: usage.plan?.bandwidth_limit,
          requestsLimit: usage.plan?.requests_limit
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération stats Cloudinary:', error);
    throw errors.internalServer('Erreur lors de la récupération des statistiques');
  }
});