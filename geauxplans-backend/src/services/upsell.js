/**
 * Post-purchase one-click upsell.
 *
 * Ported from the WooFunnels/UpStroke funnels on the WordPress site. Three
 * funnels and three offers existed there, but they collapse to one live offer:
 *
 *   funnel 1493 -> offer 1575  "Legal Edge Plan", $2.00 off the $9.99 regular
 *                               price, subscription_discount = true, i.e. $7.99
 *                               a month for as long as it runs.
 *   funnel 1640 -> offer 1641  A copy of the same offer, differing only in
 *                               skip_if_purchased and subscription_discount.
 *   funnel 1628 -> offer 1629  An unconfigured sample with no products at all.
 *
 * Only 1493/1575 has recorded sessions, so that is the one reproduced here. The
 * targeting rules from both real funnels agree in substance and are implemented
 * in `isEligible` below: show it when the order did not already include the
 * Legal Edge Plan.
 *
 * "One click" means the customer is not asked for card details again. That is
 * only possible because the original checkout session saved the payment method
 * off-session — see `setup_future_usage` in routes/stripe.js. Without a saved
 * method there is nothing to charge, and the offer is not shown at all rather
 * than shown and then failing.
 */

const { supabase } = require('../config/supabase');

/** The Legal Edge Plan product id, as used by PRODUCTS in routes/stripe.js. */
const LEP_PRODUCT_ID = 1367;

const OFFER = {
  productId: LEP_PRODUCT_ID,
  name: 'Legal Edge Plan',
  /** Cents. The list price the customer would pay buying it separately. */
  regularPriceCents: 999,
  /** Cents. $2.00 off, matching the WooCommerce offer's fixed_on_reg discount. */
  offerPriceCents: 799,
  interval: 'month',
};

/**
 * Read the product ids out of a checkout session's metadata.
 *
 * Falls back to the legacy single-product field, which older sessions still in
 * flight will be carrying.
 */
function productIdsFromSession(session) {
  const meta = session.metadata || {};
  if (meta.items) {
    try {
      return JSON.parse(meta.items).map(i => parseInt(i.productId, 10));
    } catch (e) {
      console.error(`Could not parse items metadata on session ${session.id}: ${e.message}`);
    }
  }
  const legacy = parseInt(meta.productId, 10);
  return legacy ? [legacy] : [];
}

/**
 * Decide whether to show the offer for a completed checkout session.
 *
 * Returns `{ eligible: false, reason }` rather than throwing, because every
 * "no" here is an ordinary outcome — most orders will not qualify — and the
 * caller renders a page either way.
 *
 * @param {object} session  A Stripe Checkout Session, with payment_intent expanded.
 */
async function isEligible(session) {
  if (session.payment_status !== 'paid') {
    return { eligible: false, reason: 'unpaid' };
  }

  // Subscription-mode sessions already contain the Legal Edge Plan; that is the
  // only subscription sold. Offering it again would sell a second copy.
  if (session.mode !== 'payment') {
    return { eligible: false, reason: 'already_subscribed' };
  }

  if (productIdsFromSession(session).includes(LEP_PRODUCT_ID)) {
    return { eligible: false, reason: 'already_subscribed' };
  }

  if (!session.customer) {
    // No Customer means no stored card, so the one click would have to become
    // a full checkout. Sessions created before setup_future_usage was added
    // land here.
    return { eligible: false, reason: 'no_saved_payment_method' };
  }

  const paymentMethodId = savedPaymentMethodId(session);
  if (!paymentMethodId) {
    return { eligible: false, reason: 'no_saved_payment_method' };
  }

  // Ported from the offer's skip_if_purchased flag: someone who already holds
  // the plan should not be sold it a second time.
  const userId = session.metadata?.userId;
  if (userId && supabase) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('product_id', LEP_PRODUCT_ID)
      .eq('status', 'active')
      .limit(1);

    if (error) {
      // Do not sell on a failed check. A duplicate subscription is a refund
      // request and a support ticket; a missed upsell is neither.
      console.error(`Upsell eligibility check failed for user ${userId}: ${error.message}`);
      return { eligible: false, reason: 'check_failed' };
    }
    if (data && data.length > 0) {
      return { eligible: false, reason: 'already_subscribed' };
    }
  }

  return { eligible: true, reason: null };
}

/**
 * The payment method the customer just paid with, if it was stored for reuse.
 */
function savedPaymentMethodId(session) {
  const pi = session.payment_intent;
  if (!pi || typeof pi === 'string') return null;
  return pi.payment_method || null;
}

module.exports = {
  OFFER,
  LEP_PRODUCT_ID,
  isEligible,
  savedPaymentMethodId,
  productIdsFromSession,
};
