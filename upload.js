// Import multer
const multer = require('multer');

// Import Cloudinary storage adapter for multer
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Import configured Cloudinary instance
const cloudinary = require('./cloudinary');

// Create storage engine for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,

  // These params define how files are stored in Cloudinary
  params: {
    folder: 'property-app',

    // Restrict uploads to image files
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  },
});

// Create multer instance using the Cloudinary storage engine
const upload = multer({ storage });

// Export upload middleware
module.exports = upload;