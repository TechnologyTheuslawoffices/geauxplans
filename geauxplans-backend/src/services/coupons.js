/**
 * Coupon lookup and discount calculation.
 *
 * The rewrite shipped a client-side `applyCoupon` that returned success for any
 * string and changed no totals, so the checkout looked like it accepted codes
 * and then charged full price. Two rules follow from fixing that:
 *
 *  1. The discount is computed here, from the database, in cents. A discount
 *     the browser sends is a number chosen by whoever is using the browser.
 *  2. A code that cannot be validated is rejected. Unlike the SOS name check —
 *     where failing closed would block a sale over an outage we caused — a
 *     coupon that will not validate simply means the customer pays list price,
 *     which is the correct outcome and always recoverable.
 */

const { supabase } = require('../config/supabase');

/** Rejection shape. `valid: false` always carries a reason fit to show a user. */
function invalid(message) {
  return { valid: false, message, discountCents: 0 };
}

/**
 * Look up a code and work out what it is worth against a given subtotal.
 *
 * @param {string} rawCode  Code as typed by the customer.
 * @param {number} subtotalCents  Cart subtotal in cents.
 * @returns {Promise<{valid: boolean, message: string, discountCents: number,
 *                    code?: string, discountType?: string, amount?: number}>}
 */
async function validateCoupon(rawCode, subtotalCents) {
  const code = String(rawCode || '').trim().toLowerCase();

  if (!code) {
    return invalid('Enter a coupon code.');
  }

  if (!supabase) {
    // No database means no way to tell a real code from a made-up one, and
    // guessing "valid" would give away product.
    console.error('Coupon validation attempted with no Supabase client configured');
    return invalid('Coupon codes are unavailable right now.');
  }

  if (!Number.isInteger(subtotalCents) || subtotalCents <= 0) {
    return invalid('Add something to your cart before applying a coupon.');
  }

  let row;
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('code, discount_type, amount, active, expires_at, usage_limit, usage_count, minimum_amount')
      .eq('code', code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    row = data;
  } catch (error) {
    console.error(`Coupon lookup failed for "${code}": ${error.message}`);
    return invalid('We could not check that coupon code right now.');
  }

  // Every rejection below returns the same message on purpose. Distinguishing
  // "no such code" from "that code is expired" confirms which codes exist and
  // turns the endpoint into an oracle for guessing them.
  const REJECTED = 'That coupon code is not valid.';

  if (!row || !row.active) {
    return invalid(REJECTED);
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return invalid(REJECTED);
  }

  if (row.usage_limit > 0 && row.usage_count >= row.usage_limit) {
    return invalid(REJECTED);
  }

  const minimumCents = Math.round(Number(row.minimum_amount || 0) * 100);
  if (minimumCents > 0 && subtotalCents < minimumCents) {
    return invalid(`This code requires a subtotal of at least $${(minimumCents / 100).toFixed(2)}.`);
  }

  const amount = Number(row.amount);
  let discountCents;

  if (row.discount_type === 'percent') {
    discountCents = Math.round(subtotalCents * (amount / 100));
  } else {
    discountCents = Math.round(amount * 100);
  }

  // A fixed-cart discount larger than the cart must not produce a negative
  // total, and must not silently become store credit.
  discountCents = Math.min(discountCents, subtotalCents);

  if (discountCents <= 0) {
    return invalid(REJECTED);
  }

  return {
    valid: true,
    message: 'Coupon applied.',
    code: row.code,
    discountType: row.discount_type,
    amount,
    discountCents,
  };
}

/**
 * Record a redemption once payment has actually completed.
 *
 * Called from the Stripe webhook, not from session creation: a customer who
 * reaches the payment page and abandons it has not used their coupon, and on a
 * limited-use code that difference decides whether the next person can redeem.
 *
 * Idempotent via the unique constraint on stripe_session_id, because Stripe
 * redelivers webhooks on any non-2xx response.
 */
async function recordRedemption({ code, stripeSessionId, userId, email, discountCents }) {
  if (!supabase || !code) return;

  const { error } = await supabase
    .from('coupon_redemptions')
    .insert({
      code: String(code).toLowerCase(),
      stripe_session_id: stripeSessionId,
      user_id: userId || null,
      email: email || null,
      discount_cents: discountCents || 0,
    });

  if (error) {
    // 23505 is unique_violation: this webhook is a retry of one we already
    // handled, which is the expected path, not a failure.
    if (error.code === '23505') return;
    console.error(`Failed to record redemption of "${code}": ${error.message}`);
    return;
  }

  const { error: rpcError } = await supabase.rpc('increment_coupon_usage', { coupon_code: String(code).toLowerCase() });
  if (rpcError) {
    console.error(`Failed to increment usage for "${code}": ${rpcError.message}`);
  }
}

module.exports = { validateCoupon, recordRedemption };
