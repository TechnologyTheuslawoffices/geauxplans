/**
 * User Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/user/profile
 * Get user profile
 */
router.get('/profile', authenticate, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, first_name, last_name, display_name, role, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put(
  '/profile',
  authenticate,
  [
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('displayName').optional().trim(),
  ],
  (req, res) => {
    const { firstName, lastName, displayName } = req.body;

    try {
      const updates = [];
      const values = [];

      if (firstName !== undefined) {
        updates.push('first_name = ?');
        values.push(firstName);
      }
      if (lastName !== undefined) {
        updates.push('last_name = ?');
        values.push(lastName);
      }
      if (displayName !== undefined) {
        updates.push('display_name = ?');
        values.push(displayName);
      }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.user.id);

      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      const user = db.prepare(`
        SELECT id, email, first_name, last_name, display_name, role
        FROM users WHERE id = ?
      `).get(req.user.id);

      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          displayName: user.display_name,
          role: user.role,
        },
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  }
);

/**
 * GET /api/user/addresses
 * Get user addresses
 */
router.get('/addresses', authenticate, (req, res) => {
  try {
    const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ?').all(req.user.id);

    res.json({
      success: true,
      data: addresses.map((addr) => ({
        id: addr.id,
        type: addr.type,
        firstName: addr.first_name,
        lastName: addr.last_name,
        company: addr.company,
        address1: addr.address1,
        address2: addr.address2,
        city: addr.city,
        state: addr.state,
        postcode: addr.postcode,
        country: addr.country,
        phone: addr.phone,
      })),
    });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ success: false, error: 'Failed to get addresses' });
  }
});

/**
 * POST /api/user/addresses
 * Add new address
 */
router.post(
  '/addresses',
  authenticate,
  [
    body('type').isIn(['billing', 'shipping']),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('address1').notEmpty().trim(),
    body('city').notEmpty().trim(),
    body('state').notEmpty().trim(),
    body('postcode').notEmpty().trim(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { type, firstName, lastName, company, address1, address2, city, state, postcode, country, phone } = req.body;

    try {
      const result = db.prepare(`
        INSERT INTO addresses (user_id, type, first_name, last_name, company, address1, address2, city, state, postcode, country, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        type,
        firstName || '',
        lastName || '',
        company || '',
        address1,
        address2 || '',
        city,
        state,
        postcode,
        country || 'US',
        phone || ''
      );

      res.status(201).json({
        success: true,
        data: {
          id: result.lastInsertRowid,
          type,
          firstName,
          lastName,
          company,
          address1,
          address2,
          city,
          state,
          postcode,
          country: country || 'US',
          phone,
        },
      });
    } catch (error) {
      console.error('Add address error:', error);
      res.status(500).json({ success: false, error: 'Failed to add address' });
    }
  }
);

/**
 * PUT /api/user/addresses/:id
 * Update address
 */
router.put('/addresses/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, company, address1, address2, city, state, postcode, country, phone } = req.body;

  try {
    const address = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!address) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    db.prepare(`
      UPDATE addresses SET
        first_name = ?, last_name = ?, company = ?, address1 = ?, address2 = ?,
        city = ?, state = ?, postcode = ?, country = ?, phone = ?
      WHERE id = ? AND user_id = ?
    `).run(
      firstName || address.first_name,
      lastName || address.last_name,
      company || address.company,
      address1 || address.address1,
      address2 || address.address2,
      city || address.city,
      state || address.state,
      postcode || address.postcode,
      country || address.country,
      phone || address.phone,
      id,
      req.user.id
    );

    res.json({ success: true, message: 'Address updated' });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ success: false, error: 'Failed to update address' });
  }
});

/**
 * DELETE /api/user/addresses/:id
 * Delete address
 */
router.delete('/addresses/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    res.json({ success: true, message: 'Address deleted' });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete address' });
  }
});

/**
 * GET /api/user/subscription
 * Get Legal Edge Plan subscription status
 */
router.get('/subscription', authenticate, (req, res) => {
  try {
    const subscription = db.prepare(`
      SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id);

    if (!subscription) {
      return res.json({
        success: true,
        data: {
          hasSubscription: false,
          subscription: null,
        },
      });
    }

    res.json({
      success: true,
      data: {
        hasSubscription: subscription.status === 'active',
        subscription: {
          id: subscription.id,
          planType: subscription.plan_type,
          status: subscription.status,
          price: subscription.price,
          startDate: subscription.start_date,
          nextBillingDate: subscription.next_billing_date,
          cancelledAt: subscription.cancelled_at,
        },
      },
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to get subscription' });
  }
});

/**
 * POST /api/user/subscription
 * Subscribe to Legal Edge Plan
 */
router.post('/subscription', authenticate, (req, res) => {
  try {
    // Check if already has active subscription
    const existing = db.prepare(`
      SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'
    `).get(req.user.id);

    if (existing) {
      return res.status(400).json({ success: false, error: 'Already have an active subscription' });
    }

    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    const result = db.prepare(`
      INSERT INTO subscriptions (user_id, plan_type, status, price, next_billing_date)
      VALUES (?, 'legal-edge', 'active', 29.00, ?)
    `).run(req.user.id, nextBillingDate.toISOString());

    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        planType: 'legal-edge',
        status: 'active',
        price: 29.0,
        nextBillingDate: nextBillingDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to create subscription' });
  }
});

/**
 * DELETE /api/user/subscription
 * Cancel Legal Edge Plan subscription
 */
router.delete('/subscription', authenticate, (req, res) => {
  try {
    const result = db.prepare(`
      UPDATE subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'active'
    `).run(req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'No active subscription found' });
    }

    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

/**
 * GET /api/user/downloads
 * Get user's available downloads
 */
router.get('/downloads', authenticate, (req, res) => {
  try {
    const downloads = db.prepare('SELECT * FROM downloads WHERE user_id = ?').all(req.user.id);

    res.json({
      success: true,
      data: downloads.map((d) => ({
        id: d.id,
        name: d.name,
        fileUrl: d.file_url,
        createdAt: d.created_at,
      })),
    });
  } catch (error) {
    console.error('Get downloads error:', error);
    res.status(500).json({ success: false, error: 'Failed to get downloads' });
  }
});

module.exports = router;
