/**
 * Orders Routes
 */

const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Generate unique order number
 */
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GPX-${timestamp}-${random}`;
}

/**
 * GET /api/orders
 * Get all orders for authenticated user
 */
router.get('/', authenticate, (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);

    const ordersWithItems = orders.map((order) => {
      const items = db.prepare(`
        SELECT oi.*, p.slug as product_slug
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
      `).all(order.id);

      return {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        billingAddress: order.billing_address ? JSON.parse(order.billing_address) : null,
        shippingAddress: order.shipping_address ? JSON.parse(order.shipping_address) : null,
        paymentMethod: order.payment_method,
        notes: order.notes,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productSlug: item.product_slug,
          variationId: item.variation_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
      };
    });

    res.json({
      success: true,
      data: ordersWithItems,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to get orders' });
  }
});

/**
 * GET /api/orders/:id
 * Get single order by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.slug as product_slug, p.description as product_description
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(order.id);

    res.json({
      success: true,
      data: {
        id: order.id,
        orderNumber: order.order_number,
        status: order.status,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        billingAddress: order.billing_address ? JSON.parse(order.billing_address) : null,
        shippingAddress: order.shipping_address ? JSON.parse(order.shipping_address) : null,
        paymentMethod: order.payment_method,
        notes: order.notes,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productSlug: item.product_slug,
          variationId: item.variation_id,
          name: item.name,
          description: item.product_description,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })),
      },
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: 'Failed to get order' });
  }
});

/**
 * POST /api/orders
 * Create a new order
 */
router.post('/', authenticate, (req, res) => {
  const { items, billingAddress, shippingAddress, paymentMethod, notes } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Order must have items' });
  }

  try {
    // Calculate totals
    let subtotal = 0;
    items.forEach((item) => {
      subtotal += item.price * item.quantity;
    });

    const tax = subtotal * 0.0945; // Louisiana state + local tax approximation
    const total = subtotal + tax;

    const orderNumber = generateOrderNumber();

    // Create order
    const orderResult = db.prepare(`
      INSERT INTO orders (user_id, order_number, status, subtotal, tax, total, billing_address, shipping_address, payment_method, notes)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      orderNumber,
      subtotal,
      tax,
      total,
      billingAddress ? JSON.stringify(billingAddress) : null,
      shippingAddress ? JSON.stringify(shippingAddress) : null,
      paymentMethod || 'card',
      notes || null
    );

    const orderId = orderResult.lastInsertRowid;

    // Add order items
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, variation_id, name, quantity, price, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    items.forEach((item) => {
      insertItem.run(
        orderId,
        item.productId,
        item.variationId || null,
        item.name,
        item.quantity,
        item.price,
        item.price * item.quantity
      );

      // If it's an estate plan product, create the plan entry
      const estatePlanTypes = [606, 614, 673, 676];
      if (estatePlanTypes.includes(item.productId)) {
        db.prepare(`
          INSERT INTO estate_plans (user_id, order_id, name, type, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(
          req.user.id,
          orderId,
          item.name,
          item.productId === 606 || item.productId === 673 ? 'single' : 'married'
        );
      }
    });

    res.status(201).json({
      success: true,
      data: {
        id: orderId,
        orderNumber,
        status: 'pending',
        subtotal,
        tax,
        total,
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

/**
 * PUT /api/orders/:id/status
 * Update order status (admin only in production)
 */
router.put('/:id/status', authenticate, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  try {
    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    db.prepare(`
      UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);

    res.json({ success: true, message: 'Order status updated' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
});

/**
 * POST /api/orders/:id/cancel
 * Cancel an order
 */
router.post('/:id/cancel', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
      return res.status(400).json({ success: false, error: 'Order cannot be cancelled' });
    }

    db.prepare(`
      UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    res.json({ success: true, message: 'Order cancelled' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel order' });
  }
});

module.exports = router;
