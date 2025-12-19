/**
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Generate JWT token
 */
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post(
  '/register',
  [
    body('email')
      .isEmail().withMessage('Please enter a valid email address')
      .normalizeEmail({ gmail_remove_subaddress: false, outlookdotcom_remove_subaddress: false, yahoo_remove_subaddress: false }),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { email, password, firstName, lastName } = req.body;

    try {
      // Check if user exists
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingUser) {
        return res.status(400).json({ success: false, error: 'Email already registered' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const displayName = firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0];
      const result = db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, display_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(email, hashedPassword, firstName || '', lastName || '', displayName);

      const userId = result.lastInsertRowid;

      // Generate token
      const token = generateToken(userId);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: userId,
            email,
            firstName: firstName || '',
            lastName: lastName || '',
            displayName,
            role: 'customer',
          },
          token,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, error: 'Registration failed' });
    }
  }
);

/**
 * POST /api/auth/login
 * Login user
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail({ gmail_remove_subaddress: false, outlookdotcom_remove_subaddress: false, yahoo_remove_subaddress: false }),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Invalid email or password' });
    }

    const { email, password } = req.body;

    try {
      // Find user
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      // Generate token
      const token = generateToken(user.id);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            displayName: user.display_name,
            role: user.role,
          },
          token,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ success: false, error: 'Login failed' });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: req.user,
  });
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server just acknowledges)
 */
router.post('/logout', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post(
  '/forgot-password',
  body('email').isEmail().normalizeEmail({ gmail_remove_subaddress: false, outlookdotcom_remove_subaddress: false, yahoo_remove_subaddress: false }),
  (req, res) => {
    const { email } = req.body;

    // In production, send email with reset token
    // For now, just acknowledge the request
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });
  }
);

/**
 * POST /api/auth/update-password
 * Update password (authenticated)
 */
router.post(
  '/update-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(hashedPassword, req.user.id);

      res.json({
        success: true,
        message: 'Password updated successfully',
      });
    } catch (error) {
      console.error('Password update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update password' });
    }
  }
);

module.exports = router;
