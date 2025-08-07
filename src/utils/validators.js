import Joi from 'joi';

// Schémas de validation communs
const emailSchema = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Format d\'email invalide',
    'string.empty': 'Email requis',
    'any.required': 'Email requis'
  });

const passwordSchema = Joi.string()
  .min(6)
  .max(128)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .required()
  .messages({
    'string.min': 'Le mot de passe doit contenir au moins 6 caractères',
    'string.max': 'Le mot de passe ne peut pas dépasser 128 caractères',
    'string.pattern.base': 'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre',
    'string.empty': 'Mot de passe requis',
    'any.required': 'Mot de passe requis'
  });

const nameSchema = Joi.string()
  .min(2)
  .max(50)
  .trim()
  .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
  .required()
  .messages({
    'string.min': 'Le nom doit contenir au moins 2 caractères',
    'string.max': 'Le nom ne peut pas dépasser 50 caractères',
    'string.pattern.base': 'Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets',
    'string.empty': 'Nom requis',
    'any.required': 'Nom requis'
  });

const phoneSchema = Joi.string()
  .pattern(/^\+?[1-9]\d{1,14}$/)
  .optional()
  .messages({
    'string.pattern.base': 'Format de téléphone invalide'
  });

// Validation d'inscription
export const validateRegistration = (data) => {
  const schema = Joi.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    userMode: Joi.string()
      .valid('BUYER', 'SELLER', 'BOTH')
      .default('BUYER')
      .messages({
        'any.only': 'Mode utilisateur invalide (BUYER, SELLER ou BOTH)'
      })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de connexion
export const validateLogin = (data) => {
  const schema = Joi.object({
    email: emailSchema,
    password: Joi.string().required().messages({
      'string.empty': 'Mot de passe requis',
      'any.required': 'Mot de passe requis'
    })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de mise à jour du profil
export const validateProfileUpdate = (data) => {
  const schema = Joi.object({
    name: nameSchema.optional(),
    phone: phoneSchema,
    avatar: Joi.string().uri().optional().messages({
      'string.uri': 'URL d\'avatar invalide'
    }),
    userMode: Joi.string()
      .valid('BUYER', 'SELLER', 'BOTH')
      .optional()
      .messages({
        'any.only': 'Mode utilisateur invalide (BUYER, SELLER ou BOTH)'
      })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de création de produit
export const validateProductCreation = (data) => {
  const schema = Joi.object({
    title: Joi.string()
      .min(5)
      .max(100)
      .trim()
      .required()
      .messages({
        'string.min': 'Le titre doit contenir au moins 5 caractères',
        'string.max': 'Le titre ne peut pas dépasser 100 caractères',
        'string.empty': 'Titre requis',
        'any.required': 'Titre requis'
      }),
    
    description: Joi.string()
      .min(20)
      .max(1000)
      .trim()
      .required()
      .messages({
        'string.min': 'La description doit contenir au moins 20 caractères',
        'string.max': 'La description ne peut pas dépasser 1000 caractères',
        'string.empty': 'Description requise',
        'any.required': 'Description requise'
      }),
    
    price: Joi.number()
      .positive()
      .precision(2)
      .max(999999.99)
      .required()
      .messages({
        'number.positive': 'Le prix doit être positif',
        'number.max': 'Le prix ne peut pas dépasser 999,999.99',
        'any.required': 'Prix requis'
      }),
    
    category: Joi.string()
      .valid(
        'Vêtements',
        'Chaussures', 
        'Accessoires',
        'Sacs',
        'Bijoux',
        'Montres',
        'Beauté',
        'Maison',
        'Sport',
        'Électronique',
        'Art',
        'Autre'
      )
      .required()
      .messages({
        'any.only': 'Catégorie invalide',
        'any.required': 'Catégorie requise'
      }),
    
    brand: Joi.string()
      .max(50)
      .trim()
      .optional()
      .messages({
        'string.max': 'La marque ne peut pas dépasser 50 caractères'
      }),
    
    condition: Joi.string()
      .valid('NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'DAMAGED')
      .required()
      .messages({
        'any.only': 'État du produit invalide',
        'any.required': 'État du produit requis'
      }),
    
    size: Joi.string()
      .max(20)
      .trim()
      .optional()
      .messages({
        'string.max': 'La taille ne peut pas dépasser 20 caractères'
      }),
    
    color: Joi.string()
      .max(30)
      .trim()
      .optional()
      .messages({
        'string.max': 'La couleur ne peut pas dépasser 30 caractères'
      }),
    
    location: Joi.string()
      .max(100)
      .trim()
      .optional()
      .messages({
        'string.max': 'La localisation ne peut pas dépasser 100 caractères'
      }),
    
    latitude: Joi.number()
      .min(-90)
      .max(90)
      .optional()
      .messages({
        'number.min': 'Latitude invalide',
        'number.max': 'Latitude invalide'
      }),
    
    longitude: Joi.number()
      .min(-180)
      .max(180)
      .optional()
      .messages({
        'number.min': 'Longitude invalide',
        'number.max': 'Longitude invalide'
      })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de mise à jour de produit
export const validateProductUpdate = (data) => {
  const schema = Joi.object({
    title: Joi.string().min(5).max(100).trim().optional(),
    description: Joi.string().min(20).max(1000).trim().optional(),
    price: Joi.number().positive().precision(2).max(999999.99).optional(),
    category: Joi.string().valid(
      'Vêtements', 'Chaussures', 'Accessoires', 'Sacs', 'Bijoux',
      'Montres', 'Beauté', 'Maison', 'Sport', 'Électronique', 'Art', 'Autre'
    ).optional(),
    brand: Joi.string().max(50).trim().optional(),
    condition: Joi.string().valid(
      'NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'DAMAGED'
    ).optional(),
    size: Joi.string().max(20).trim().optional(),
    color: Joi.string().max(30).trim().optional(),
    location: Joi.string().max(100).trim().optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    status: Joi.string().valid('DRAFT', 'ACTIVE', 'PAUSED').optional()
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de création d'offre
export const validateOfferCreation = (data) => {
  const schema = Joi.object({
    productId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.uuid': 'ID de produit invalide',
        'any.required': 'ID de produit requis'
      }),
    
    amount: Joi.number()
      .positive()
      .precision(2)
      .max(999999.99)
      .required()
      .messages({
        'number.positive': 'Le montant doit être positif',
        'number.max': 'Le montant ne peut pas dépasser 999,999.99',
        'any.required': 'Montant requis'
      }),
    
    message: Joi.string()
      .max(500)
      .trim()
      .optional()
      .messages({
        'string.max': 'Le message ne peut pas dépasser 500 caractères'
      })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de recherche de produits
export const validateProductSearch = (data) => {
  const schema = Joi.object({
    q: Joi.string().trim().optional(),
    category: Joi.string().optional(),
    brand: Joi.string().optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
    condition: Joi.array().items(Joi.string().valid(
      'NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'DAMAGED'
    )).optional(),
    location: Joi.string().optional(),
    radius: Joi.number().min(1).max(1000).optional(),
    sortBy: Joi.string().valid(
      'price_asc', 'price_desc', 'date_asc', 'date_desc', 'relevance'
    ).default('relevance'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
  }).with('radius', 'location').messages({
    'object.with': 'Le rayon nécessite une localisation'
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de mise à jour utilisateur  
export const validateUserUpdate = (data) => {
  const schema = Joi.object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    bio: Joi.string().max(500).trim().optional().messages({
      'string.max': 'La bio ne peut pas dépasser 500 caractères'
    }),
    location: Joi.string().max(100).trim().optional().messages({
      'string.max': 'La localisation ne peut pas dépasser 100 caractères'
    }),
    phone: phoneSchema,
    userMode: Joi.string()
      .valid('BUYER', 'SELLER', 'BOTH')
      .optional()
      .messages({
        'any.only': 'Mode utilisateur invalide (BUYER, SELLER ou BOTH)'
      })
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation de mise à jour des préférences
export const validatePreferencesUpdate = (data) => {
  const schema = Joi.object({
    maxPrice: Joi.number().min(0).optional(),
    minPrice: Joi.number().min(0).optional(),
    preferredCategories: Joi.array().items(Joi.string()).optional(),
    preferredBrands: Joi.array().items(Joi.string()).optional(),
    excludedSellers: Joi.array().items(Joi.string().uuid()).optional(),
    requireAuthenticated: Joi.boolean().optional(),
    minAuthenticityScore: Joi.number().min(0).max(1).optional(),
    emailNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    offerNotifications: Joi.boolean().optional(),
    likeNotifications: Joi.boolean().optional(),
    likedProducts: Joi.array().items(Joi.string().uuid()).optional(),
    passedProducts: Joi.array().items(Joi.string().uuid()).optional()
  }).custom((value, helpers) => {
    if (value.minPrice && value.maxPrice && value.minPrice >= value.maxPrice) {
      return helpers.error('custom.priceRange');
    }
    return value;
  }).messages({
    'custom.priceRange': 'Le prix minimum doit être inférieur au prix maximum'
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation des préférences utilisateur (legacy - gardé pour compatibilité)
export const validatePreferences = (data) => {
  const schema = Joi.object({
    maxPrice: Joi.number().min(0).optional(),
    minPrice: Joi.number().min(0).optional(),
    preferredCategories: Joi.array().items(Joi.string()).optional(),
    preferredBrands: Joi.array().items(Joi.string()).optional(),
    excludedSellers: Joi.array().items(Joi.string().uuid()).optional(),
    requireAuthenticated: Joi.boolean().optional(),
    minAuthenticityScore: Joi.number().min(0).max(1).optional(),
    emailNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    offerNotifications: Joi.boolean().optional(),
    likeNotifications: Joi.boolean().optional()
  }).custom((value, helpers) => {
    if (value.minPrice && value.maxPrice && value.minPrice >= value.maxPrice) {
      return helpers.error('custom.priceRange');
    }
    return value;
  }).messages({
    'custom.priceRange': 'Le prix minimum doit être inférieur au prix maximum'
  });

  return schema.validate(data, { abortEarly: false });
};

// Validation d'upload de fichier
export const validateFileUpload = (file) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

  if (!file) {
    return { error: { message: 'Fichier requis' } };
  }

  if (!allowedTypes.includes(file.mimetype)) {
    return { 
      error: { 
        message: 'Type de fichier non autorisé. Formats acceptés: JPEG, PNG, WebP' 
      } 
    };
  }

  if (file.size > maxSize) {
    return { 
      error: { 
        message: `Fichier trop volumineux. Taille maximale: ${maxSize / (1024 * 1024)}MB` 
      } 
    };
  }

  return { value: file };
};