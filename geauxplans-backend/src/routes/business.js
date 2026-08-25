/**
 * Business Routes
 * Handles LLC/business entity management and Louisiana SOS API integration
 */

const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// The SOS name check and its route now live in routes/businessPublic.js, backed
// by services/laSos.js. They were moved out because this file requires
// ../config/database, which confines it to SQLite mode — so in production the
// check was unreachable and the funnel silently treated every name as available.

/**
 * GET /api/business/entities
 * Get all business entities for authenticated user
 */
router.get('/entities', authenticate, (req, res) => {
  try {
    const entities = db.prepare(`
      SELECT be.*, o.order_number
      FROM business_entities be
      LEFT JOIN orders o ON be.order_id = o.id
      WHERE be.user_id = ?
      ORDER BY be.created_at DESC
    `).all(req.user.id);

    const entitiesWithDocs = entities.map((entity) => {
      const documents = db.prepare(`
        SELECT * FROM business_documents WHERE entity_id = ?
      `).all(entity.id);

      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        status: entity.status,
        state: entity.state,
        registeredAgent: entity.registered_agent,
        formationDate: entity.formation_date,
        orderId: entity.order_id,
        orderNumber: entity.order_number,
        createdAt: entity.created_at,
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
      data: entitiesWithDocs,
    });
  } catch (error) {
    console.error('Get business entities error:', error);
    res.status(500).json({ success: false, error: 'Failed to get business entities' });
  }
});

/**
 * GET /api/business/entities/:id
 * Get single business entity by ID
 */
router.get('/entities/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const entity = db.prepare(`
      SELECT be.*, o.order_number
      FROM business_entities be
      LEFT JOIN orders o ON be.order_id = o.id
      WHERE be.id = ? AND be.user_id = ?
    `).get(id, req.user.id);

    if (!entity) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    const documents = db.prepare(`
      SELECT * FROM business_documents WHERE entity_id = ?
    `).all(entity.id);

    res.json({
      success: true,
      data: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        status: entity.status,
        state: entity.state,
        registeredAgent: entity.registered_agent,
        formationDate: entity.formation_date,
        orderId: entity.order_id,
        orderNumber: entity.order_number,
        createdAt: entity.created_at,
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
    console.error('Get business entity error:', error);
    res.status(500).json({ success: false, error: 'Failed to get business entity' });
  }
});

/**
 * POST /api/business/entities
 * Create a new business entity
 */
router.post('/entities', authenticate, (req, res) => {
  const { name, type = 'llc', state = 'LA', registeredAgent, orderId } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Business name is required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO business_entities (user_id, order_id, name, type, state, registered_agent, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(req.user.id, orderId || null, name, type, state, registeredAgent || null);

    res.status(201).json({
      success: true,
      data: {
        id: result.lastInsertRowid,
        name,
        type,
        state,
        registeredAgent,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Create business entity error:', error);
    res.status(500).json({ success: false, error: 'Failed to create business entity' });
  }
});

/**
 * PUT /api/business/entities/:id
 * Update business entity
 */
router.put('/entities/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const { name, type, state, registeredAgent, status } = req.body;

  try {
    const entity = db.prepare('SELECT * FROM business_entities WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!entity) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    db.prepare(`
      UPDATE business_entities SET
        name = ?, type = ?, state = ?, registered_agent = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || entity.name,
      type || entity.type,
      state || entity.state,
      registeredAgent || entity.registered_agent,
      status || entity.status,
      id
    );

    res.json({ success: true, message: 'Entity updated' });
  } catch (error) {
    console.error('Update business entity error:', error);
    res.status(500).json({ success: false, error: 'Failed to update business entity' });
  }
});

/**
 * POST /api/business/entities/:id/documents
 * Add document to business entity
 */
router.post('/entities/:id/documents', authenticate, (req, res) => {
  const { id } = req.params;
  const { name, type, filePath, downloadUrl } = req.body;

  try {
    const entity = db.prepare('SELECT id FROM business_entities WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!entity) {
      return res.status(404).json({ success: false, error: 'Entity not found' });
    }

    const result = db.prepare(`
      INSERT INTO business_documents (entity_id, name, type, file_path, download_url)
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
 * POST /api/business/check-availability is served by routes/businessPublic.js,
 * which is mounted on this same prefix in both database modes.
 */

/**
 * GET /api/business/entity-types
 * Get available business entity types
 */
router.get('/entity-types', (req, res) => {
  res.json({
    success: true,
    data: [
      { value: 'llc', label: 'Limited Liability Company (LLC)', description: 'Most flexible business structure' },
      { value: 'corporation', label: 'Corporation', description: 'Traditional corporate structure' },
      { value: 'nonprofit', label: 'Non-Profit Corporation', description: 'For charitable organizations' },
      { value: 'partnership', label: 'Partnership', description: 'For multiple owners' },
      { value: 'sole-proprietorship', label: 'Sole Proprietorship', description: 'Single owner, simplest structure' },
    ],
  });
});

/**
 * GET /api/business/states
 * Get available states for business formation
 */
router.get('/states', (req, res) => {
  // Currently focusing on Louisiana but can expand
  res.json({
    success: true,
    data: [
      { value: 'LA', label: 'Louisiana', available: true, featured: true },
      { value: 'TX', label: 'Texas', available: false },
      { value: 'FL', label: 'Florida', available: false },
      { value: 'DE', label: 'Delaware', available: false },
      { value: 'WY', label: 'Wyoming', available: false },
    ],
  });
});

module.exports = router;
