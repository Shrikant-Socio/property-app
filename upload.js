// ==========================================================
// upload.js
// ==========================================================
// SocioDeal Image Upload Middleware
//
// Purpose:
// - Uses multer + CloudinaryStorage
// - Uploads property images directly to Cloudinary
// - Allows only image files
// - Limits each image file size
//
// Important:
// - Max 10 images per property is enforced in server.js route
// - This file controls file type and Cloudinary storage
// ==========================================================

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const cloudinary = require('./cloudinary');

// ----------------------------------------------------------
// Cloudinary storage configuration
// ----------------------------------------------------------

const storage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    return {
      folder: 'sociodeal/property-images',

      // Allowed image formats
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],

      // Optional transformation to keep uploaded images optimized
      transformation: [
        {
          width: 1200,
          height: 900,
          crop: 'limit',
          quality: 'auto',
          fetch_format: 'auto'
        }
      ]
    };
  }
});

// ----------------------------------------------------------
// File filter
// ----------------------------------------------------------

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, PNG and WEBP image files are allowed'), false);
  }
};

// ----------------------------------------------------------
// Multer upload middleware
// ----------------------------------------------------------

const upload = multer({
  storage,
  fileFilter,

  // 5 MB per image
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

module.exports = upload;