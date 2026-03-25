/**
 * Stripe Payment Routes
 * Handles one-time purchases and subscriptions for extended form access
 */

const express = require('express');
const { db } = require('../config/database');
const { supabase } = require('../config/supabase');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { keapService } = require('../services/keap');

const router = express.Router();

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Product configuration - matches frontend PRODUCTS (prices in cents)
const PRODUCTS = {
  606: { name: 'Minor Child-Centered Estate Plan', price: 19900, price2person: 29900, type: 'one_time' },
  614: { name: 'Power of Attorney Supplement', price: 9900, price2person: 14900, type: 'one_time' },
  673: { name: 'Will-Based Estate Plan', price: 19900, price2person: 29900, type: 'one_time' },
  676: { name: 'Trust-Based Estate Plan', price: 39900, price2person: 59900, type: 'one_time' },
  // Subscription product for extended form editing access (annual)
  1367: { name: 'Form Editing Subscription', price: 4900, price2person: 4900, type: 'subscription', interval: 'year' },
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
  // Use 2-person price if formType is '2person', otherwise use solo price
  const unitAmount = formType === '2person' ? product.price2person : product.price;
  const planLabel = formType === '2person' ? ' (2 Person)' : '';

  try {
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name + planLabel,
              description: `GeauxPlans ${product.name}${planLabel}`,
            },
            unit_amount: unitAmount,
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
 * Handle successful payment - create order and/or subscription
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
    // Use correct price based on formType
    const priceInCents = formType === '2person' ? product.price2person : product.price;
    const subtotal = priceInCents / 100; // Convert from cents
    const tax = 0; // No tax for now, or calculate if needed
    const total = subtotal + tax;

    // Create order in SQLite (if db is configured)
    let orderId = null;
    if (db) {
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

      orderId = orderResult.lastInsertRowid;

      // Add order item
      db.prepare(`
        INSERT INTO order_items (order_id, product_id, name, quantity, price, total)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(orderId, productId, product.name, subtotal, subtotal);
    }

    // Handle subscription product - create subscription in Supabase
    if (product.type === 'subscription' && userId && supabase) {
      try {
        // Calculate expiration date (1 year from now for annual subscription)
        const expiresAt = new Date();
        if (product.interval === 'year') {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        } else if (product.interval === 'month') {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        // Create subscription record
        const { error: subError } = await supabase
          .from('user_subscriptions')
          .insert({
            user_id: userId,
            product_id: parseInt(productId),
            stripe_subscription_id: session.subscription || session.id,
            status: 'active',
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString(),
          });

        if (subError) {
          console.error('Error creating subscription:', subError);
        } else {
          console.log(`Subscription created for user ${userId}, expires ${expiresAt.toISOString()}`);
        }
      } catch (subErr) {
        console.error('Failed to create subscription record:', subErr);
      }
    }

    // Create estate plan entry if user exists (for one-time products)
    if (userId && db && product.type !== 'subscription') {
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

    // Sync to Keap CRM (non-blocking)
    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || '';
    const nameParts = customerName.split(' ');

    if (customerEmail) {
      keapService.handlePurchase({
        email: customerEmail,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        phone: session.customer_details?.phone || '',
      }, productId)
        .then(keapResult => {
          if (keapResult.success) {
            console.log(`Keap contact synced for purchase: ${keapResult.contactId}`);
          }
        })
        .catch(err => console.error('Keap purchase sync error:', err));
    }
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

/**
 * Supabase auth middleware for subscription endpoints
 */
async function authenticateSupabase(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token.',
    });
  }
}

/**
 * GET /api/stripe/subscription-status
 * Check user's subscription status for extended form editing
 */
router.get('/subscription-status', authenticateSupabase, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('id, product_id, status, started_at, expires_at')
      .eq('user_id', req.user.id)
      .eq('product_id', 1367) // Form editing subscription
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !subscription) {
      return res.json({
        success: true,
        data: {
          hasActiveSubscription: false,
          subscription: null,
        },
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveSubscription: true,
        subscription: {
          id: subscription.id,
          productId: subscription.product_id,
          status: subscription.status,
          startedAt: subscription.started_at,
          expiresAt: subscription.expires_at,
        },
      },
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get subscription status' });
  }
});

/**
 * GET /api/stripe/subscription-product
 * Get details about the subscription product for purchase
 */
router.get('/subscription-product', async (req, res) => {
  const product = PRODUCTS[1367];

  res.json({
    success: true,
    data: {
      productId: 1367,
      name: product.name,
      price: product.price / 100, // Convert to dollars
      interval: product.interval,
      description: 'Extend your form editing access indefinitely. Edit your estate planning forms anytime after the 30-day grace period.',
    },
  });
});

module.exports = router;
