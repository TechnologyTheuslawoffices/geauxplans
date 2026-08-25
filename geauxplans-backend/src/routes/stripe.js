/**
 * Stripe Payment Routes
 * Handles one-time purchases and subscriptions for extended form access
 */

const express = require('express');
const { db } = require('../config/database');
const { supabase } = require('../config/supabase');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { keapService } = require('../services/keap');
const { validateCoupon, recordRedemption } = require('../services/coupons');
const upsell = require('../services/upsell');

const router = express.Router();

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Product configuration - matches frontend PRODUCTS (prices in cents)
const PRODUCTS = {
  606: { name: 'Minor Child-Centered Estate Plan', price: 19900, price2person: 29900, type: 'one_time' },
  614: { name: 'Power of Attorney Supplement', price: 9900, price2person: 14900, type: 'one_time' },
  673: { name: 'Will-Based Estate Plan', price: 19900, price2person: 29900, type: 'one_time' },
  676: { name: 'Trust-Based Estate Plan', price: 39900, price2person: 59900, type: 'one_time' },
  // Legal Edge Plan — monthly subscription that grants Forever Revisions and
  // Advanced Estate Plan upgrade credit. Cancel anytime.
  1367: { name: 'Legal Edge Plan', price: 999, price2person: 999, type: 'subscription', interval: 'month' },
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
 *
 * Create a Stripe checkout session for one or more products.
 *
 * Request body (new): { items: [{ productId, formType }, ...] }
 * Request body (legacy, still supported): { productId, formType }
 *
 * Mixing one-time + subscription products is supported via Stripe's
 * `subscription_data.add_invoice_items` pattern: any one-time line items
 * are charged on the first invoice, and the subscription recurs thereafter.
 */
router.post('/create-checkout-session', optionalAuth, async (req, res) => {
  // Accept either { items: [...] } or { productId, formType } (back-compat)
  let items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) {
    const { productId, formType } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, error: 'No items in cart' });
    }
    items = [{ productId, formType: formType || 'solo' }];
  }

  // Validate and resolve each item
  const resolved = [];
  for (const it of items) {
    const pid = parseInt(it.productId, 10);
    if (!pid || !PRODUCTS[pid]) {
      return res.status(400).json({ success: false, error: `Invalid product: ${it.productId}` });
    }
    const product = PRODUCTS[pid];
    const formType = it.formType === '2person' ? '2person' : 'solo';
    const unitAmount = formType === '2person' ? product.price2person : product.price;
    const planLabel = formType === '2person' ? ' (2 Person)' : '';
    resolved.push({ productId: pid, product, formType, unitAmount, planLabel });
  }

  const hasSubscription = resolved.some(r => r.product.type === 'subscription');
  const mode = hasSubscription ? 'subscription' : 'payment';

  try {
    let lineItems;
    let subscriptionData;

    if (hasSubscription) {
      // Subscriptions require recurring price_data. One-time items go under
      // subscription_data.add_invoice_items so they bill on the first invoice.
      lineItems = [];
      const addInvoiceItems = [];

      for (const r of resolved) {
        if (r.product.type === 'subscription') {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: r.product.name + r.planLabel,
                description: `GeauxPlans ${r.product.name}${r.planLabel}`,
              },
              unit_amount: r.unitAmount,
              recurring: { interval: r.product.interval || 'month' },
            },
            quantity: 1,
          });
        } else {
          addInvoiceItems.push({
            price_data: {
              currency: 'usd',
              product: undefined, // ad-hoc product
              product_data: undefined,
              unit_amount: r.unitAmount,
            },
            quantity: 1,
          });
        }
      }

      // Stripe's add_invoice_items requires an existing Stripe Product.
      // For ad-hoc one-time items in subscription mode we must create products
      // on the fly. Create them here, then reference price_data with `product`.
      const builtAddInvoiceItems = [];
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];
        if (r.product.type === 'subscription') continue;
        const stripeProduct = await stripe.products.create({
          name: r.product.name + r.planLabel,
          description: `GeauxPlans ${r.product.name}${r.planLabel}`,
        });
        builtAddInvoiceItems.push({
          price_data: {
            currency: 'usd',
            product: stripeProduct.id,
            unit_amount: r.unitAmount,
          },
          quantity: 1,
        });
      }

      subscriptionData = builtAddInvoiceItems.length > 0
        ? { add_invoice_items: builtAddInvoiceItems }
        : undefined;
    } else {
      // All one-time products — use plain payment mode with price_data
      lineItems = resolved.map(r => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: r.product.name + r.planLabel,
            description: `GeauxPlans ${r.product.name}${r.planLabel}`,
          },
          unit_amount: r.unitAmount,
        },
        quantity: 1,
      }));
    }

    // Metadata: stringify the items array, plus first-item legacy fields
    const metadataItems = JSON.stringify(
      resolved.map(r => ({ productId: r.productId, formType: r.formType }))
    );

    // Re-validate the coupon here rather than trusting anything the cart sent.
    // /api/coupons/validate is only a preview for display; this is the request
    // that determines the amount charged, so the discount is recomputed from
    // the database against a subtotal we derived ourselves from PRODUCTS.
    let appliedCoupon = null;
    if (req.body.couponCode) {
      const subtotalCents = resolved.reduce((sum, r) => sum + r.unitAmount, 0);
      const result = await validateCoupon(req.body.couponCode, subtotalCents);
      if (result.valid) {
        appliedCoupon = result;
      } else {
        // Fail the checkout instead of quietly dropping the discount. The
        // customer is looking at a total that includes it; charging more than
        // the page promised is worse than making them try again.
        return res.status(400).json({ success: false, error: result.message });
      }
    }

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode,
      success_url: `${process.env.FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/checkout/cancelled`,
      metadata: {
        items: metadataItems,
        // Legacy single-item fields for back-compat with success page + webhook
        productId: resolved[0].productId.toString(),
        formType: resolved[0].formType,
        userId: req.user?.id?.toString() || '',
        // Carried so the webhook can record the redemption after payment
        // succeeds, rather than counting a code the customer never used.
        couponCode: appliedCoupon?.code || '',
        couponDiscountCents: appliedCoupon ? String(appliedCoupon.discountCents) : '',
      },
      customer_email: req.user?.email || undefined,
    };

    if (subscriptionData) {
      sessionParams.subscription_data = subscriptionData;
    }

    if (mode === 'payment') {
      // Keep the card on file so the post-purchase Legal Edge Plan offer can be
      // accepted in one click, the way the WooFunnels upsell worked. Stripe
      // Checkout tells the customer their details will be saved when
      // setup_future_usage is set, so this is not done behind their back.
      //
      // Subscription mode does both of these implicitly, and rejects
      // customer_creation outright.
      sessionParams.customer_creation = 'always';
      sessionParams.payment_intent_data = { setup_future_usage: 'off_session' };
    }

    if (appliedCoupon) {
      // A one-shot Stripe coupon per session. Stripe needs its own coupon
      // object to show the discount on the payment page and the receipt;
      // `duration: 'once'` keeps it from recurring on the Legal Edge Plan
      // subscription, where the discount is meant to apply to this purchase
      // and not to every future month.
      const stripeCoupon = await stripe.coupons.create(
        appliedCoupon.discountType === 'percent'
          ? { percent_off: appliedCoupon.amount, duration: 'once', name: appliedCoupon.code.toUpperCase() }
          : { amount_off: appliedCoupon.discountCents, currency: 'usd', duration: 'once', name: appliedCoupon.code.toUpperCase() }
      );
      sessionParams.discounts = [{ coupon: stripeCoupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

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
 *
 * Supports both the legacy single-item path and the new multi-item path
 * (driven by `metadata.items` JSON array).
 */
async function handleSuccessfulPayment(session) {
  const { userId } = session.metadata;

  // Count the coupon only now that money has actually moved. Doing it at
  // session creation would let anyone burn down a limited-use code by opening
  // checkout pages and walking away. Idempotent on the session id, since
  // Stripe redelivers this event until it gets a 2xx.
  if (session.metadata.couponCode) {
    await recordRedemption({
      code: session.metadata.couponCode,
      stripeSessionId: session.id,
      userId,
      email: session.customer_email || session.customer_details?.email,
      discountCents: parseInt(session.metadata.couponDiscountCents, 10) || 0,
    });
  }

  // Resolve list of items: prefer metadata.items, fall back to legacy fields
  let items = [];
  if (session.metadata.items) {
    try {
      const parsed = JSON.parse(session.metadata.items);
      if (Array.isArray(parsed)) items = parsed;
    } catch (e) {
      console.error('Failed to parse metadata.items:', e);
    }
  }
  if (items.length === 0 && session.metadata.productId) {
    items = [{
      productId: parseInt(session.metadata.productId, 10),
      formType: session.metadata.formType || 'solo',
    }];
  }

  if (items.length === 0) {
    console.error('No items in successful payment:', session.id);
    return;
  }

  // Validate items
  const resolved = [];
  for (const it of items) {
    const pid = parseInt(it.productId, 10);
    const product = PRODUCTS[pid];
    if (!product) {
      console.error('Invalid product in payment:', it.productId);
      continue;
    }
    const formType = it.formType === '2person' ? '2person' : 'solo';
    const priceInCents = formType === '2person' ? product.price2person : product.price;
    resolved.push({ productId: pid, product, formType, priceInCents });
  }

  if (resolved.length === 0) return;

  try {
    const orderNumber = generateOrderNumber();
    const subtotal = resolved.reduce((sum, r) => sum + r.priceInCents, 0) / 100;
    const tax = 0;
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

      // Add one order_item per resolved product
      for (const r of resolved) {
        const lineSubtotal = r.priceInCents / 100;
        db.prepare(`
          INSERT INTO order_items (order_id, product_id, name, quantity, price, total)
          VALUES (?, ?, ?, 1, ?, ?)
        `).run(orderId, r.productId, r.product.name, lineSubtotal, lineSubtotal);
      }
    }

    // Handle subscription products — create user_subscriptions row(s)
    if (userId && supabase) {
      for (const r of resolved) {
        if (r.product.type !== 'subscription') continue;
        try {
          const expiresAt = new Date();
          if (r.product.interval === 'year') {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          } else {
            expiresAt.setMonth(expiresAt.getMonth() + 1);
          }

          const { error: subError } = await supabase
            .from('user_subscriptions')
            .insert({
              user_id: userId,
              product_id: r.productId,
              stripe_subscription_id: session.subscription || session.id,
              status: 'active',
              started_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
            });

          if (subError) {
            console.error('Error creating subscription:', subError);
          } else {
            console.log(`Subscription created for user ${userId}, product ${r.productId}, expires ${expiresAt.toISOString()}`);
          }
        } catch (subErr) {
          console.error('Failed to create subscription record:', subErr);
        }
      }
    }

    // Create estate_plans entries for one-time estate plan products
    if (userId && db) {
      const estatePlanTypes = [606, 614, 673, 676];
      for (const r of resolved) {
        if (r.product.type === 'subscription') continue;
        if (!estatePlanTypes.includes(r.productId)) continue;
        db.prepare(`
          INSERT INTO estate_plans (user_id, order_id, name, type, status)
          VALUES (?, ?, ?, ?, 'pending')
        `).run(
          userId,
          orderId,
          r.product.name,
          r.formType === '2person' ? 'married' : 'single'
        );
      }
    }

    console.log(`Order ${orderNumber} created for session ${session.id}`);

    // Sync to Keap CRM — sync first product for back-compat.
    //
    // Awaited, not fire-and-forget: the webhook handler is awaited before the
    // 200 is sent, and on Vercel the lambda can be frozen as soon as that
    // response is flushed, which would kill a still-running sync.
    //
    // Failures are swallowed on purpose. The order and any subscription rows
    // are already written above; throwing here would only make Stripe retry the
    // webhook and create a duplicate order.
    const customerEmail = session.customer_details?.email || session.customer_email;
    const customerName = session.customer_details?.name || '';
    const nameParts = customerName.split(' ');

    if (customerEmail && resolved.length > 0) {
      try {
        const keapResult = await keapService.handlePurchase({
          email: customerEmail,
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          phone: session.customer_details?.phone || '',
        }, resolved[0].productId);

        if (keapResult.success) {
          console.log(`Keap contact synced for purchase ${orderNumber}: ${keapResult.contactId}`);
        } else {
          console.error(`Keap purchase sync failed for order ${orderNumber}: ${keapResult.error}`);
        }
      } catch (err) {
        console.error(`Keap purchase sync threw for order ${orderNumber}:`, err);
      }
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
 * GET /api/stripe/upsell/:sessionId
 *
 * Should the thank-you page show the Legal Edge Plan offer, and on what terms?
 *
 * Answering 200 with `eligible: false` rather than 404, so the success page can
 * tell "no offer for this order" from "the request failed" and does not flash
 * an error at a customer who has just paid successfully.
 */
router.get('/upsell/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
      expand: ['payment_intent'],
    });

    const { eligible } = await upsell.isEligible(session);

    if (!eligible) {
      return res.json({ success: true, data: { eligible: false } });
    }

    // Already taken up on a page the customer reloaded or navigated back to.
    if (await findUpsellSubscription(session)) {
      return res.json({ success: true, data: { eligible: false } });
    }

    res.json({
      success: true,
      data: {
        eligible: true,
        productName: upsell.OFFER.name,
        regularPrice: upsell.OFFER.regularPriceCents / 100,
        offerPrice: upsell.OFFER.offerPriceCents / 100,
        interval: upsell.OFFER.interval,
      },
    });
  } catch (error) {
    console.error('Upsell eligibility error:', error);
    // Not a 500. Failing to work out whether to advertise something is not a
    // reason to show an error on a successful order.
    res.json({ success: true, data: { eligible: false } });
  }
});

/**
 * An existing subscription created by this session's upsell, if any.
 *
 * The subscription is tagged with the originating session id so a reloaded or
 * revisited thank-you page can recognise its own work. Stripe idempotency keys
 * only last 24 hours, which is not long enough to rely on for a page a customer
 * might come back to from an emailed receipt.
 */
async function findUpsellSubscription(session) {
  if (!session.customer) return null;
  const subs = await stripe.subscriptions.list({
    customer: typeof session.customer === 'string' ? session.customer : session.customer.id,
    status: 'all',
    limit: 100,
  });
  return subs.data.find(s => s.metadata?.upsellSessionId === session.id) || null;
}

/**
 * POST /api/stripe/upsell/:sessionId/accept
 *
 * Charge the card already on file for the Legal Edge Plan. This is the whole
 * point of the feature: the customer clicks once and is not asked to re-enter
 * anything.
 *
 * Eligibility is decided here rather than trusted from the client. The GET
 * above only decides what to render; this decides what to charge, and a request
 * can arrive without the GET ever having happened.
 */
router.post('/upsell/:sessionId/accept', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const { eligible, reason } = await upsell.isEligible(session);
    if (!eligible) {
      return res.status(400).json({
        success: false,
        error: reason === 'already_subscribed'
          ? 'You already have the Legal Edge Plan.'
          : 'This offer is no longer available.',
      });
    }

    // Double-submit and back-button protection. Without this a customer who
    // clicks twice buys two subscriptions and has to ask for one back.
    const existing = await findUpsellSubscription(session);
    if (existing) {
      return res.json({ success: true, data: { subscriptionId: existing.id, alreadyActive: true } });
    }

    const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
    const paymentMethodId = upsell.savedPaymentMethodId(session);

    // Make the card they just used the default for invoices, otherwise Stripe
    // has a saved method it will not reach for.
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscription = await stripe.subscriptions.create(
      {
        customer: customerId,
        default_payment_method: paymentMethodId,
        items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: upsell.OFFER.name },
            unit_amount: upsell.OFFER.offerPriceCents,
            recurring: { interval: upsell.OFFER.interval },
          },
        }],
        // The customer is on the thank-you page watching, but they are not
        // completing a card form, so from Stripe's point of view this is an
        // off-session charge against a stored method.
        off_session: true,
        payment_behavior: 'error_if_incomplete',
        metadata: {
          upsellSessionId: session.id,
          productId: String(upsell.LEP_PRODUCT_ID),
          userId: session.metadata?.userId || '',
        },
      },
      // Belt and braces alongside the lookup above: two clicks landing within
      // the same second would both pass the check before either subscription
      // exists to be found.
      { idempotencyKey: `upsell_${session.id}` }
    );

    await recordUpsellSubscription(session, subscription);

    res.json({ success: true, data: { subscriptionId: subscription.id, alreadyActive: false } });
  } catch (error) {
    // A stored card can be declined, or the issuer can demand authentication
    // that cannot be given off-session. Say so, instead of reporting a generic
    // failure on a page where the customer has just been charged for something
    // else and is entitled to know exactly what did and did not happen.
    if (error.type === 'StripeCardError') {
      console.error(`Upsell card declined for session ${sessionId}: ${error.message}`);
      return res.status(402).json({
        success: false,
        error: 'Your card was declined for this add-on. Your original order was not affected.',
      });
    }
    console.error(`Upsell accept failed for session ${sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'We could not add the Legal Edge Plan. Your original order was not affected.',
    });
  }
});

/**
 * Mirror the Stripe subscription into user_subscriptions.
 *
 * Best-effort: the money has already moved by the time this runs, so a failure
 * here must not turn into an error the customer sees. It is logged loudly
 * because the row is what My Account reads to decide whether the plan is active.
 */
async function recordUpsellSubscription(session, subscription) {
  const userId = session.metadata?.userId;
  if (!userId || !supabase) return;

  try {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const { error } = await supabase.from('user_subscriptions').insert({
      user_id: userId,
      product_id: upsell.LEP_PRODUCT_ID,
      stripe_subscription_id: subscription.id,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      console.error(`Upsell subscription ${subscription.id} charged but not recorded: ${error.message}`);
    }
  } catch (err) {
    console.error(`Upsell subscription ${subscription.id} charged but not recorded:`, err);
  }
}

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
      description: 'Legal Edge Plan — Forever Revisions and Advanced Estate Plan upgrade credit. Cancel anytime.',
    },
  });
});

module.exports = router;
