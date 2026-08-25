/**
 * Vercel Serverless Entry Point
 * This file is specifically for Vercel deployment
 * It only loads Supabase routes - no SQLite dependencies
 *
 * ⚠️ This is a second copy of the app defined in ../src/server.js, and it is the
 * one production actually serves — vercel.json routes every request here. A
 * route added to server.js alone is invisible in production, which is how the
 * SOS name check stayed 404 while looking mounted. Add routes to BOTH files
 * until the two entry points are merged.
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

// Public lead capture — Supabase + Keap only, no SQLite.
const leadsRoutes = require('../src/routes/leads');
app.use('/api/leads', leadsRoutes);
console.log('Loaded leads routes');

// Mount Stripe routes — uses Supabase for subscriptions and guards SQLite
// access via `if (db)` checks, so it's safe in the serverless environment.
try {
  const stripeRoutes = require('../src/routes/stripe');
  app.use('/api/stripe', stripeRoutes);
  console.log('Loaded Stripe routes');
} catch (e) {
  console.warn('Stripe routes failed to load:', e.message);
}

// Louisiana SOS name availability. No database dependency, which is the whole
// reason it lives in its own router — the rest of /api/business is in
// routes/business.js, which requires sql.js and cannot load here.
const businessPublicRoutes = require('../src/routes/businessPublic');
app.use('/api/business', businessPublicRoutes);
console.log('Loaded public business routes');

// Coupon validation. Supabase-only, so it loads in both entry points.
const couponRoutes = require('../src/routes/coupons');
app.use('/api/coupons', couponRoutes);
console.log('Loaded coupon routes');

// Note: Knackly routes are not loaded on Vercel. Documents are drafted by the
// engine named in DOC_ENGINE, which defaults to the in-process local drafter.
console.log(`Vercel mode: document engine = ${process.env.DOC_ENGINE || 'local'}`);

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
