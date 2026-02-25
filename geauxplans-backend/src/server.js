/**
 * GeauxPlans Backend Server
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

// Check if we're using Supabase (for Vercel) or SQLite (local)
const USE_SUPABASE = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log(`Database mode: ${USE_SUPABASE ? 'Supabase (cloud)' : 'SQLite (local)'}`);

const app = express();
const PORT = process.env.PORT || 5000;

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
    database: USE_SUPABASE ? 'supabase' : 'sqlite'
  });
});

// Import and set up routes synchronously for Vercel compatibility
if (USE_SUPABASE) {
  // Supabase mode - use Supabase routes only
  // DO NOT require any SQLite-dependent routes - they will crash Vercel
  const submissionsRoutes = require('./routes/submissions-supabase');
  app.use('/api/submissions', submissionsRoutes);
  console.log('Loaded Supabase submissions routes');
} else {
  // SQLite mode - use all routes (local development only)
  // This block is ignored by Vercel when SUPABASE env vars are set
  loadSqliteRoutes();
}

// Helper to load SQLite routes - only called in non-Supabase mode
function loadSqliteRoutes() {
  const { initializeDatabase } = require('./config/database');

  // Initialize database synchronously for route loading
  initializeDatabase().then(() => {
    console.log('Database initialized');
  }).catch(err => {
    console.error('Database init error:', err);
  });

  const authRoutes = require('./routes/auth');
  const userRoutes = require('./routes/user');
  const estatePlanRoutes = require('./routes/estatePlans');
  const orderRoutes = require('./routes/orders');
  const cartRoutes = require('./routes/cart');
  const businessRoutes = require('./routes/business');
  const submissionsRoutes = require('./routes/submissions');

  app.use('/api/auth', authRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/estate-plans', estatePlanRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/business', businessRoutes);
  app.use('/api/submissions', submissionsRoutes);
}

// These routes work in both modes
const knacklyRoutes = require('./routes/knackly');
const stripeRoutes = require('./routes/stripe');
app.use('/api/knackly', knacklyRoutes);
app.use('/api/stripe', stripeRoutes);

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

// Only start listening in non-Vercel environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 GeauxPlans Backend running on http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
