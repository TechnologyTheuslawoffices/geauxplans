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

/**
 * Stripe, or null when STRIPE_SECRET_KEY is not configured.
 *
 * The constructor throws on a missing key. Calling it at module load meant that
 * an unset key took the whole router down at `require` time — and api/index.js
 * catches that and merely warns, so every /api/stripe/* route answered 404 with
 * nothing to say why. Checkout was dead in production for exactly this reason
 * and it looked like a routing problem, which is the same trap the SOS name
 * check fell into.
 *
 * Constructing lazily lets the router mount and answer honestly instead.
 */
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

if (!stripe) {
  console.error('STRIPE_SECRET_KEY is not set — payment routes will return 503');
}

router.use((req, res, next) => {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      error: 'Payments are temporarily unavailable. Please try again shortly.',
      detail: 'STRIPE_SECRET_KEY is not configured on the server',
    });
  }
  next();
});

/**
 * Where Stripe sends the customer back to.
 *
 * FRONTEND_URL is not set in the Vercel production environment, which would
 * have produced `undefined/checkout/success` — a URL Stripe rejects, failing
 * session creation for every order. Defaulting to the live site is correct for
 * production and harmless in dev, where FRONTEND_URL is set to localhost.
 */
const SITE_URL = process.env.FRONTEND_URL || 'https://geauxplans.com';

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

// Predefined Stripe Price IDs, keyed by internal product id + form type.
// Checkout references these directly instead of building price_data inline, so
// no throwaway products are created in Stripe on every session. PRODUCTS above
// stays the source of truth for names and amounts (used by the webhook, coupon
// subtotal math, etc.); the amounts here must match the Prices in Stripe.
// Legal Edge is a single monthly price shared by both form types.
const STRIPE_PRICES = {
  606: { solo: 'price_1SpvwaHQjfjZ1dW7FrJg2qyG', '2person': 'price_1UIrqYHQjfjZ1dW7ZhBmuKkj' },
  614: { solo: 'price_1SpvvgHQjfjZ1dW79YusgiZ0', '2person': 'price_1UIrrQHQjfjZ1dW76jjn3jdO' },
  673: { solo: 'price_1Spvw4HQjfjZ1dW77WCMvu4X', '2person': 'price_1UIrryHQjfjZ1dW78nLHmdLb' },
  676: { solo: 'price_1SpvwvHQjfjZ1dW7bH18jVZX', '2person': 'price_1UIrpiHQjfjZ1dW72czaM6eg' },
  1367: { solo: 'price_1UIrvdHQjfjZ1dW7DOECJHcK', '2person': 'price_1UIrvdHQjfjZ1dW7DOECJHcK' },
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
 * Mixing one-time + subscription products is supported by putting all Prices
 * in line_items: in subscription mode the one-time lines bill on the first
 * invoice and the subscription recurs thereafter.
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
    const priceId = STRIPE_PRICES[pid]?.[formType];
    if (!priceId) {
      return res.status(400).json({ success: false, error: `No price configured for product ${pid} (${formType})` });
    }
    resolved.push({ productId: pid, product, formType, unitAmount, priceId });
  }

  const hasSubscription = resolved.some(r => r.product.type === 'subscription');
  const mode = hasSubscription ? 'subscription' : 'payment';

  try {
    // Reference predefined Stripe Prices. Checkout accepts one-time and
    // recurring prices in the same session: in subscription mode the one-time
    // lines are billed on the first invoice and the recurring line recurs, so a
    // mixed cart needs nothing special. (The old subscription_data.add_invoice_items
    // path is gone — the current Stripe API version rejects it.)
    const lineItems = resolved.map(r => ({ price: r.priceId, quantity: 1 }));

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
      success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/checkout/cancelled`,
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
          // Stack onto existing time instead of resetting to now: re-buying the
          // Legal Edge Plan while a paid month is still active should ADD an
          // interval on top of the remaining time, not throw it away.
          const { data: existingSub } = await supabase
            .from('user_subscriptions')
            .select('expires_at')
            .eq('user_id', userId)
            .eq('product_id', r.productId)
            .eq('status', 'active')
            .gte('expires_at', new Date().toISOString())
            .order('expires_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const expiresAt = existingSub && existingSub.expires_at
            ? new Date(existingSub.expires_at)
            : new Date();
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

    // Re-purchasing an estate plan reopens that plan's 30-day editing window.
    // Each plan type is gated individually (accessControl.canEditForm keys off
    // the submission's first_submitted_at), so resetting it to now restarts the
    // 30-day clock for every submission of the matching form type. The Legal
    // Edge Plan is a subscription and is handled above — it never lands here.
    if (userId && supabase) {
      const { FORM_TYPE_PRODUCTS } = require('../config/constants');
      for (const r of resolved) {
        if (r.product.type === 'subscription') continue;
        const formTypes = Object.keys(FORM_TYPE_PRODUCTS)
          .filter((ft) => FORM_TYPE_PRODUCTS[ft].productId === r.productId);
        if (formTypes.length === 0) continue;
        try {
          const { error: reopenError } = await supabase
            .from('poa_submissions')
            .update({ first_submitted_at: new Date().toISOString() })
            .eq('user_id', userId)
            .in('form_type', formTypes)
            .not('first_submitted_at', 'is', null);
          if (reopenError) {
            console.error('Error reopening edit window:', reopenError);
          } else {
            console.log(`Edit window reopened for user ${userId}, form types ${formTypes.join(', ')}`);
          }
        } catch (reopenErr) {
          console.error('Failed to reopen edit window:', reopenErr);
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
