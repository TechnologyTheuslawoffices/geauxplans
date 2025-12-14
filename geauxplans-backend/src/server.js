/**
 * GeauxPlans Backend Server
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

// Import database initialization
const { initializeDatabase } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://geauxplans.com',
  'https://www.geauxplans.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (available before db init)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server after database initialization
async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();

    // Import routes after database is ready
    const authRoutes = require('./routes/auth');
    const userRoutes = require('./routes/user');
    const estatePlanRoutes = require('./routes/estatePlans');
    const orderRoutes = require('./routes/orders');
    const cartRoutes = require('./routes/cart');
    const businessRoutes = require('./routes/business');
    const submissionsRoutes = require('./routes/submissions');
    const knacklyRoutes = require('./routes/knackly');

    // API Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/user', userRoutes);
    app.use('/api/estate-plans', estatePlanRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/cart', cartRoutes);
    app.use('/api/business', businessRoutes);
    app.use('/api/submissions', submissionsRoutes);
    app.use('/api/knackly', knacklyRoutes);

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    });

    app.listen(PORT, () => {
      console.log(`🚀 GeauxPlans Backend running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
