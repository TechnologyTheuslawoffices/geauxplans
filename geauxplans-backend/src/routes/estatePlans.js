/**
 * Estate Plans Routes
 */

const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Plan type mappings (matching WordPress product IDs)
const PLAN_TYPES = {
  606: { name: 'Single Estate Plan', type: 'single' },
  614: { name: 'Married Estate Plan', type: 'married' },
  673: { name: 'Single Estate Plan (No Trust)', type: 'single-no-trust' },
  676: { name: 'Married Estate Plan (No Trust)', type: 'married-no-trust' },
};

/**
 * GET /api/estate-plans
 * Get all estate plans for authenticated user
 */
router.get('/', authenticate, (req, res) => {
  try {
    const plans = db.prepare(`
      SELECT ep.*, o.order_number
      FROM estate_plans ep
      LEFT JOIN orders o ON ep.order_id = o.id
      WHERE ep.user_id = ?
      ORDER BY ep.created_at DESC
    `).all(req.user.id);

    const plansWithDocuments = plans.map((plan) => {
      const documents = db.prepare(`
        SELECT * FROM plan_documents WHERE plan_id = ?
      `).all(plan.id);

      return {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        status: plan.status,
        purchaseDate: plan.purchase_date,
        completedDate: plan.completed_date,
        orderId: plan.order_id,
        orderNumber: plan.order_number,
        knacklyToken: plan.knackly_token,
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          downloadUrl: doc.download_url,
          createdAt: doc.created_at,
        })),
      };
    });

    res.json({
      success: true,
      data: plansWithDocuments,
    });
  } catch (error) {
    console.error('Get estate plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to get estate plans' });
  }
});

/**
 * GET /api/estate-plans/:id
 * Get single estate plan by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const plan = db.prepare(`
      SELECT ep.*, o.order_number
      FROM estate_plans ep
      LEFT JOIN orders o ON ep.order_id = o.id
      WHERE ep.id = ? AND ep.user_id = ?
    `).get(id, req.user.id);

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const documents = db.prepare(`
      SELECT * FROM plan_documents WHERE plan_id = ?
    `).all(plan.id);

    res.json({
      success: true,
      data: {
        id: plan.id,
        name: plan.name,
        type: plan.type,
        status: plan.status,
        purchaseDate: plan.purchase_date,
        completedDate: plan.completed_date,
        orderId: plan.order_id,
        orderNumber: plan.order_number,
        knacklyToken: plan.knackly_token,
        documents: documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          downloadUrl: doc.download_url,
          createdAt: doc.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('Get estate plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to get estate plan' });
  }
});

/**
 * POST /api/estate-plans
 * Create a new estate plan (typically after purchase)
 */
router.post('/', authenticate, (req, res) => {
  const { name, type, orderId, knacklyToken } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO estate_plans (user_id, order_id, name, type, status, knackly_token)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(req.user.id, orderId || null, name, type, knacklyToken || null);

    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        name,
        type,
        status: 'pending',
        orderId,
        knacklyToken,
      },
    });
  } catch (error) {
    console.error('Create estate plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to create estate plan' });
  }
});

/**
 * PUT /api/estate-plans/:id/status
 * Update estate plan status
 */
router.put('/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'in-progress', 'review', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  try {
    const plan = db.prepare('SELECT id FROM estate_plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status];

    if (status === 'completed') {
      updates.push('completed_date = CURRENT_TIMESTAMP');
    }

    values.push(id);
    db.prepare(`UPDATE estate_plans SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('Update plan status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

/**
 * POST /api/estate-plans/:id/documents
 * Add document to estate plan
 */
router.post('/:id/documents', authenticate, (req, res) => {
  const { id } = req.params;
  const { name, type, filePath, downloadUrl } = req.body;

  try {
    const plan = db.prepare('SELECT id FROM estate_plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const result = db.prepare(`
      INSERT INTO plan_documents (plan_id, name, type, file_path, download_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, type || 'document', filePath || null, downloadUrl || null);

    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        name,
        type,
        downloadUrl,
      },
    });
  } catch (error) {
    console.error('Add document error:', error);
    res.status(500).json({ success: false, error: 'Failed to add document' });
  }
});

/**
 * GET /api/estate-plans/:id/knackly-url
 * Get Knackly interview URL for estate plan
 */
router.get('/:id/knackly-url', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const plan = db.prepare('SELECT * FROM estate_plans WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!plan) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    // In production, this would call the Knackly API to get the interview URL
    // For now, return a placeholder
    const knacklyUrl = plan.knackly_token
      ? `https://knackly.io/interview/${plan.knackly_token}`
      : null;

    res.json({
      success: true,
      data: {
        url: knacklyUrl,
        planId: plan.id,
        planType: plan.type,
      },
    });
  } catch (error) {
    console.error('Get Knackly URL error:', error);
    res.status(500).json({ success: false, error: 'Failed to get Knackly URL' });
  }
});

/**
 * GET /api/estate-plans/types
 * Get available estate plan types
 */
router.get('/types/list', (req, res) => {
  res.json({
    success: true,
    data: Object.entries(PLAN_TYPES).map(([productId, info]) => ({
      productId: parseInt(productId),
      ...info,
    })),
  });
});

module.exports = router;
