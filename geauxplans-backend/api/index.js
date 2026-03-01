/**
 * Vercel Serverless Entry Point
 * This file is specifically for Vercel deployment
 * It only loads Supabase routes - no SQLite dependencies
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware - CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://geauxplans.com',
  'https://www.geauxplans.com',
  'https://geauxplans-react-geaux-ventures.vercel.app',
  'https://geauxplans-react-geaux-counsel.vercel.app',
  /\.vercel\.app$/,  // Allow all vercel.app subdomains
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Check exact match or regex match
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });

    if (isAllowed) {
      return callback(null, true);
    }
    console.log('CORS blocked origin:', origin);
    return callback(null, false);
  },
  credentials: true,
}));

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'supabase',
    environment: 'vercel'
  });
});

// Load Supabase routes only - no SQLite
const submissionsRoutes = require('../src/routes/submissions-supabase');
app.use('/api/submissions', submissionsRoutes);
console.log('Loaded Supabase submissions routes');

// Note: Knackly and Stripe routes are not loaded on Vercel
// They have SQLite dependencies that don't work in serverless
// DocTools is used instead of Knackly for document generation
console.log('Vercel mode: Using DocTools for document generation');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.path);
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.path}`,
  });
});

module.exports = app;
