// ==========================================================
// cloudinary.js
// ==========================================================
// SocioDeal Cloudinary Configuration
//
// Purpose:
// - Central Cloudinary setup file
// - Reads Cloudinary credentials from .env
// - Exports configured Cloudinary instance
// ==========================================================

require('dotenv').config();

const cloudinary = require('cloudinary').v2;

// ----------------------------------------------------------
// Validate required environment variables
// ----------------------------------------------------------
// Required in .env:
//
// CLOUDINARY_CLOUD_NAME=your_cloud_name
// CLOUDINARY_API_KEY=your_api_key
// CLOUDINARY_API_SECRET=your_api_secret
// ----------------------------------------------------------

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn(
    '⚠️ Cloudinary environment variables are missing. Image upload will fail.'
  );
}

// ----------------------------------------------------------
// Configure Cloudinary
// ----------------------------------------------------------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = cloudinary;