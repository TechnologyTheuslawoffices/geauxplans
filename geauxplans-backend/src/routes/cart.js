/**
 * Cart Routes
 */

const express = require('express');
const { db } = require('../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Get or create cart for user/session
 */
function getOrCreateCart(userId, sessionId) {
  let cart;

  if (userId) {
    cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
  } else if (sessionId) {
    cart = db.prepare('SELECT * FROM carts WHERE session_id = ?').get(sessionId);
  }

  if (!cart) {
    const result = db.prepare(`
      INSERT INTO carts (user_id, session_id) VALUES (?, ?)
    `).run(userId || null, sessionId || null);
    cart = { id: result.lastInsertRowid, user_id: userId, session_id: sessionId };
  }

  return cart;
}

/**
 * Get cart items with product details
 */
function getCartItems(cartId) {
  return db.prepare(`
    SELECT ci.*, p.name, p.slug, p.price, p.regular_price, p.sale_price, p.short_description
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.cart_id = ?
  `).all(cartId);
}

/**
 * Calculate cart totals
 */
function calculateCartTotals(items) {
  let subtotal = 0;
  items.forEach((item) => {
    const price = item.sale_price || item.price;
    subtotal += price * item.quantity;
  });

  const tax = subtotal * 0.0945;
  const total = subtotal + tax;

  return { subtotal, tax, total, itemCount: items.length };
}

/**
 * GET /api/cart
 * Get cart contents
 */
router.get('/', optionalAuth, (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = getOrCreateCart(req.user?.id, sessionId);
    const items = getCartItems(cart.id);
    const totals = calculateCartTotals(items);

    res.json({
      success: true,
      data: {
        id: cart.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          variationId: item.variation_id,
          name: item.name,
          slug: item.slug,
          price: item.sale_price || item.price,
          regularPrice: item.regular_price,
          quantity: item.quantity,
          description: item.short_description,
          total: (item.sale_price || item.price) * item.quantity,
        })),
        ...totals,
      },
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cart' });
  }
});

/**
 * POST /api/cart/items
 * Add item to cart
 */
router.post('/items', optionalAuth, (req, res) => {
  const { productId, variationId, quantity = 1 } = req.body;

  if (!productId) {
    return res.status(400).json({ success: false, error: 'Product ID is required' });
  }

  try {
    // Verify product exists
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const sessionId = req.headers['x-session-id'];
    const cart = getOrCreateCart(req.user?.id, sessionId);

    // Check if item already in cart
    const existingItem = db.prepare(`
      SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND (variation_id = ? OR (variation_id IS NULL AND ? IS NULL))
    `).get(cart.id, productId, variationId, variationId);

    if (existingItem) {
      // Update quantity
      db.prepare(`
        UPDATE cart_items SET quantity = quantity + ? WHERE id = ?
      `).run(quantity, existingItem.id);
    } else {
      // Add new item
      db.prepare(`
        INSERT INTO cart_items (cart_id, product_id, variation_id, quantity)
        VALUES (?, ?, ?, ?)
      `).run(cart.id, productId, variationId || null, quantity);
    }

    // Update cart timestamp
    db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);

    // Return updated cart
    const items = getCartItems(cart.id);
    const totals = calculateCartTotals(items);

    res.json({
      success: true,
      data: {
        id: cart.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          variationId: item.variation_id,
          name: item.name,
          slug: item.slug,
          price: item.sale_price || item.price,
          regularPrice: item.regular_price,
          quantity: item.quantity,
          total: (item.sale_price || item.price) * item.quantity,
        })),
        ...totals,
      },
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to add item to cart' });
  }
});

/**
 * PUT /api/cart/items/:itemId
 * Update cart item quantity
 */
router.put('/items/:itemId', optionalAuth, (req, res) => {
  const { itemId } = req.params;
  const { quantity } = req.body;

  if (quantity < 1) {
    return res.status(400).json({ success: false, error: 'Quantity must be at least 1' });
  }

  try {
    const sessionId = req.headers['x-session-id'];
    const cart = getOrCreateCart(req.user?.id, sessionId);

    const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?').get(itemId, cart.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Cart item not found' });
    }

    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, itemId);
    db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);

    const items = getCartItems(cart.id);
    const totals = calculateCartTotals(items);

    res.json({
      success: true,
      data: {
        id: cart.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          variationId: item.variation_id,
          name: item.name,
          slug: item.slug,
          price: item.sale_price || item.price,
          regularPrice: item.regular_price,
          quantity: item.quantity,
          total: (item.sale_price || item.price) * item.quantity,
        })),
        ...totals,
      },
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ success: false, error: 'Failed to update cart item' });
  }
});

/**
 * DELETE /api/cart/items/:itemId
 * Remove item from cart
 */
router.delete('/items/:itemId', optionalAuth, (req, res) => {
  const { itemId } = req.params;

  try {
    const sessionId = req.headers['x-session-id'];
    const cart = getOrCreateCart(req.user?.id, sessionId);

    const result = db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cart.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Cart item not found' });
    }

    db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);

    const items = getCartItems(cart.id);
    const totals = calculateCartTotals(items);

    res.json({
      success: true,
      data: {
        id: cart.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          variationId: item.variation_id,
          name: item.name,
          slug: item.slug,
          price: item.sale_price || item.price,
          regularPrice: item.regular_price,
          quantity: item.quantity,
          total: (item.sale_price || item.price) * item.quantity,
        })),
        ...totals,
      },
    });
  } catch (error) {
    console.error('Remove cart item error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove cart item' });
  }
});

/**
 * DELETE /api/cart
 * Clear entire cart
 */
router.delete('/', optionalAuth, (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const cart = getOrCreateCart(req.user?.id, sessionId);

    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    db.prepare('UPDATE carts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(cart.id);

    res.json({
      success: true,
      data: {
        id: cart.id,
        items: [],
        subtotal: 0,
        tax: 0,
        total: 0,
        itemCount: 0,
      },
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear cart' });
  }
});

/**
 * POST /api/cart/checkout
 * Process checkout (convert cart to order)
 */
router.post('/checkout', authenticate, (req, res) => {
  const { billingAddress, shippingAddress, paymentMethod, notes } = req.body;

  try {
    const cart = getOrCreateCart(req.user.id, null);
    const items = getCartItems(cart.id);

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty' });
    }

    const totals = calculateCartTotals(items);

    // Generate order number
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `GPX-${timestamp}-${random}`;

    // Create order
    const orderResult = db.prepare(`
      INSERT INTO orders (user_id, order_number, status, subtotal, tax, total, billing_address, shipping_address, payment_method, notes)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      orderNumber,
      totals.subtotal,
      totals.tax,
      totals.total,
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
      const price = item.sale_price || item.price;
      insertItem.run(orderId, item.product_id, item.variation_id, item.name, item.quantity, price, price * item.quantity);

      // Create estate plan if applicable
      const estatePlanTypes = [606, 614, 673, 676];
      if (estatePlanTypes.includes(item.product_id)) {
        db.prepare(`
          INSERT INTO estate_plans (user_id, order_id, name, type, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(
          req.user.id,
          orderId,
          item.name,
          item.product_id === 606 || item.product_id === 673 ? 'single' : 'married'
        );
      }
    });

    // Clear cart
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);

    res.status(201).json({
      success: true,
      data: {
        orderId,
        orderNumber,
        status: 'pending',
        ...totals,
      },
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ success: false, error: 'Failed to process checkout' });
  }
});

/**
 * POST /api/cart/merge
 * Merge guest cart with user cart after login
 */
router.post('/merge', authenticate, (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }

  try {
    const guestCart = db.prepare('SELECT * FROM carts WHERE session_id = ?').get(sessionId);
    if (!guestCart) {
      return res.json({ success: true, message: 'No guest cart to merge' });
    }

    const userCart = getOrCreateCart(req.user.id, null);
    const guestItems = getCartItems(guestCart.id);

    // Move items to user cart
    guestItems.forEach((item) => {
      const existingItem = db.prepare(`
        SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ? AND (variation_id = ? OR (variation_id IS NULL AND ? IS NULL))
      `).get(userCart.id, item.product_id, item.variation_id, item.variation_id);

      if (existingItem) {
        db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(item.quantity, existingItem.id);
      } else {
        db.prepare(`
          INSERT INTO cart_items (cart_id, product_id, variation_id, quantity)
          VALUES (?, ?, ?, ?)
        `).run(userCart.id, item.product_id, item.variation_id, item.quantity);
      }
    });

    // Delete guest cart
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(guestCart.id);
    db.prepare('DELETE FROM carts WHERE id = ?').run(guestCart.id);

    const items = getCartItems(userCart.id);
    const totals = calculateCartTotals(items);

    res.json({
      success: true,
      data: {
        id: userCart.id,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          variationId: item.variation_id,
          name: item.name,
          slug: item.slug,
          price: item.sale_price || item.price,
          regularPrice: item.regular_price,
          quantity: item.quantity,
          total: (item.sale_price || item.price) * item.quantity,
        })),
        ...totals,
      },
    });
  } catch (error) {
    console.error('Merge cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to merge carts' });
  }
});

module.exports = router;
