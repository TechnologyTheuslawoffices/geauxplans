/**
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    const { email } = req.body;

    try {
      // Check if user exists
      const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);

      // Always return success to prevent email enumeration
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.',
        });
      }

      // Generate a secure reset token
      const resetToken = crypto.randomBytes(32).toString('hex');

      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Delete any existing tokens for this user
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

      // Store the new token
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES (?, ?, ?)
      `).run(user.id, resetToken, expiresAt);

      // Build reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      // Log reset URL for development (replace with email service in production)
      console.log(`\n📧 Password reset requested for: ${email}`);
      console.log(`🔗 Reset URL: ${resetUrl}\n`);

      // TODO: In production, send email here using nodemailer or similar
      // await sendPasswordResetEmail(user.email, resetUrl);

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
        // Include token in development mode for testing (remove in production)
        ...(process.env.NODE_ENV !== 'production' && { resetUrl }),
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ success: false, error: 'Failed to process password reset request' });
    }
  }
);

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { token, password } = req.body;

    try {
      // Find valid token
      const resetRecord = db.prepare(`
        SELECT user_id, expires_at, used
        FROM password_reset_tokens
        WHERE token = ?
      `).get(token);

      if (!resetRecord) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
      }

      if (resetRecord.used) {
        return res.status(400).json({ success: false, error: 'This reset link has already been used' });
      }

      if (new Date(resetRecord.expires_at) < new Date()) {
        return res.status(400).json({ success: false, error: 'This reset link has expired' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user's password
      db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(hashedPassword, resetRecord.user_id);

      // Mark token as used
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

      res.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.',
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
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
