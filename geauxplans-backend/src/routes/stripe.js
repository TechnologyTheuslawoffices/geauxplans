/**
 * Stripe Payment Routes
 */

const express = require('express');
const { db } = require('../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Product configuration - matches frontend PRODUCTS
const PRODUCTS = {
  606: { name: 'Minor Child-Centered Estate Plan', price: 59900 }, // in cents
  614: { name: 'Power of Attorney Supplement', price: 29900 },
  673: { name: 'Will-Based Estate Plan', price: 39900 },
  676: { name: 'Trust-Based Estate Plan', price: 89900 },
};

/**
 * Generate unique order number
 */
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GPX-${timestamp}-${random}`;
}

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe checkout session for a product
 */
router.post('/create-checkout-session', optionalAuth, async (req, res) => {
  const { productId, formType } = req.body;

  if (!productId || !PRODUCTS[productId]) {
    return res.status(400).json({ success: false, error: 'Invalid product' });
  }

  const product = PRODUCTS[productId];

  try {
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: `GeauxPlans ${product.name}`,
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout/cancelled`,
      metadata: {
        productId: productId.toString(),
        formType: formType || 'solo',
        userId: req.user?.id?.toString() || '',
      },
      customer_email: req.user?.email || undefined,
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Stripe checkout session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      await handleSuccessfulPayment(session);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

/**
 * Handle successful payment - create order
 */
async function handleSuccessfulPayment(session) {
  const { productId, formType, userId } = session.metadata;
  const product = PRODUCTS[productId];

  if (!product) {
    console.error('Invalid product in payment:', productId);
    return;
  }

  try {
    const orderNumber = generateOrderNumber();
    const subtotal = product.price / 100; // Convert from cents
    const tax = 0; // No tax for now, or calculate if needed
    const total = subtotal + tax;

    // Create order
    const orderResult = db.prepare(`
      INSERT INTO orders (user_id, order_number, status, subtotal, tax, total, payment_method, stripe_session_id)
      VALUES (?, ?, 'completed', ?, ?, ?, 'stripe', ?)
    `).run(
      userId || null,
      orderNumber,
      subtotal,
      tax,
      total,
      session.id
    );

    const orderId = orderResult.lastInsertRowid;

    // Add order item
    db.prepare(`
      INSERT INTO order_items (order_id, product_id, name, quantity, price, total)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(orderId, productId, product.name, subtotal, subtotal);

    // Create estate plan entry if user exists
    if (userId) {
      const estatePlanTypes = [606, 614, 673, 676];
      if (estatePlanTypes.includes(parseInt(productId))) {
        db.prepare(`
          INSERT INTO estate_plans (user_id, order_id, name, type, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(
          userId,
          orderId,
          product.name,
          formType === '2person' ? 'married' : 'single'
        );
      }
    }

    console.log(`Order ${orderNumber} created for session ${session.id}`);
  } catch (error) {
    console.error('Error creating order from payment:', error);
  }
}

/**
 * GET /api/stripe/session/:sessionId
 * Get checkout session details (for success page)
 */
router.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const product = PRODUCTS[session.metadata.productId];

    res.json({
      success: true,
      data: {
        productId: session.metadata.productId,
        productName: product?.name || 'Unknown Product',
        formType: session.metadata.formType,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total / 100,
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ success: false, error: 'Failed to get session details' });
  }
});

module.exports = router;
