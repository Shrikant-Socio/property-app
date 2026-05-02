// ------------------------------------------------------------
// api.js
// ------------------------------------------------------------
// This file creates a reusable axios instance for API calls.
// In local development it uses localhost:5000.
// In production it uses the deployed backend URL from env var.
// ------------------------------------------------------------

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
});

export default api;