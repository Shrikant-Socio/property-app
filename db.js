// ------------------------------------------------------------
// db.js
// ------------------------------------------------------------
// This file creates and exports a PostgreSQL connection pool.
// It reads database configuration from environment variables
// so the same code works both locally and in production.
// ------------------------------------------------------------

// Load variables from .env file
require('dotenv').config();

// Import PostgreSQL Pool class
const { Pool } = require('pg');

// Create DB connection pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),

  // Enable SSL only in production/cloud DB if needed
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false
});

// Export pool so server.js can use it
module.exports = pool;