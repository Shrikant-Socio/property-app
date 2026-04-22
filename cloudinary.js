// Load environment variables from .env
require('dotenv').config();

// Import Cloudinary SDK
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using values from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Export configured instance so other files can use it
module.exports = cloudinary;