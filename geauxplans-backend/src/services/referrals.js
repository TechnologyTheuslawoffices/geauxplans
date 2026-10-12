/**
 * Referral code lookup, discount calculation, and redemption recording.
 *
 * Mirrors services/coupons.js. A referral code is a GeauxCounsel member's code:
 * when a client redeems it the client gets a discount AND the member accrues a
 * commission toward their GeauxCounsel bill. This file owns both numbers; the
 * cross-project credit is settled from the /api/referrals/report ledger (the
 * two apps are separate Supabase projects, so nothing here calls GeauxCounsel).
 *
 * As with coupons:
 *  1. The discount is computed here, in cents, from the database — never from a
 *     number the browser sent.
 *  2. A code that cannot be validated is rejected (the client just pays list
 *     price, which is correct and recoverable).
 */

const { supabase } = require('../config/supabase');

function invalid(message) {
  return { valid: false, message, refereeDiscountCents: 0 };
}

/**
 * Look up a referral code and work out the client's discount against a subtotal.
 *
 * @param {string} rawCode
 * @param {number} subtotalCents  Cart subtotal in cents.
 * @returns {Promise<{valid: boolean, message: string, refereeDiscountCents: number,
 *   code?: string, refereeDiscountPercent?: number, commissionPercent?: number}>}
 */
async function validateReferral(rawCode, subtotalCents) {
  const code = String(rawCode || '').trim().toLowerCase();

  if (!code) {
    return invalid('Enter a referral code.');
  }

  if (!supabase) {
    console.error('Referral validation attempted with no Supabase client configured');
    return invalid('Referral codes are unavailable right now.');
  }

  if (!Number.isInteger(subtotalCents) || subtotalCents <= 0) {
    return invalid('Add something to your cart before applying a referral code.');
  }

  let row;
  try {
    const { data, error } = await supabase
      .from('referral_codes')
      .select('code, active, expires_at, referee_discount_percent, commission_percent')
      .eq('code', code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    row = data;
  } catch (error) {
    // The most likely cause is that migration 010 has not been applied yet.
    // Degrade to a clean rejection so checkout still works (client pays list
    // price) rather than erroring.
    console.error(`Referral lookup failed for "${code}": ${error.message}`);
    return invalid('We could not check that referral code right now.');
  }

  // One message for every rejection: distinguishing "no such code" from
  // "expired" turns the endpoint into an oracle for guessing valid codes.
  const REJECTED = 'That referral code is not valid.';

  if (!row || !row.active) {
    return invalid(REJECTED);
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return invalid(REJECTED);
  }

  const refereeDiscountPercent = Number(row.referee_discount_percent);
  let refereeDiscountCents = Math.round(subtotalCents * (refereeDiscountPercent / 100));
  refereeDiscountCents = Math.min(refereeDiscountCents, subtotalCents);

  if (refereeDiscountCents <= 0) {
    // A 0% code still "applies" (the member earns commission) but there is no
    // client discount to show — allow it with a zero discount.
    refereeDiscountCents = 0;
  }

  return {
    valid: true,
    message: 'Referral code applied.',
    code: row.code,
    refereeDiscountPercent,
    commissionPercent: Number(row.commission_percent),
    refereeDiscountCents,
  };
}

/**
 * Record a redemption once payment has completed (called from the Stripe
 * webhook). Idempotent via the unique constraint on stripe_session_id.
 *
 * The member's commission is computed here from what the client actually paid
 * and the code's commission_percent, so it cannot be influenced by the client.
 */
async function recordReferral({
  code,
  stripeSessionId,
  refereeUserId,
  refereeEmail,
  amountPaidCents,
  refereeDiscountCents,
  commissionPercent,
}) {
  if (!supabase || !code) return;

  const paid = Number.isFinite(amountPaidCents) ? Math.max(0, Math.round(amountPaidCents)) : 0;
  const pct = Number.isFinite(commissionPercent) ? commissionPercent : 0;
  const commissionCents = Math.round(paid * (pct / 100));

  const { error } = await supabase
    .from('referral_redemptions')
    .insert({
      code: String(code).toLowerCase(),
      stripe_session_id: stripeSessionId,
      referee_user_id: refereeUserId || null,
      referee_email: refereeEmail || null,
      amount_paid_cents: paid,
      referee_discount_cents: refereeDiscountCents || 0,
      commission_cents: commissionCents,
    });

  if (error) {
    // 23505 unique_violation: a replayed webhook we already recorded.
    if (error.code === '23505') return;
    console.error(`Failed to record referral redemption of "${code}": ${error.message}`);
  }
}

/**
 * Per-member ledger for GeauxCounsel to apply waivers from. Groups redemptions
 * by the member who owns the code and sums the commission.
 *
 * @param {{ status?: string, since?: string }} [opts]
 * @returns {Promise<{ members: Array, redemptions: Array }>}
 */
async function getReferralReport(opts = {}) {
  if (!supabase) return { members: [], redemptions: [] };

  let query = supabase
    .from('referral_redemptions')
    .select('code, referee_email, amount_paid_cents, referee_discount_cents, commission_cents, status, created_at, referral_codes!inner(member_ref, member_name, member_email, tenant_ref)')
    .order('created_at', { ascending: false });

  if (opts.status) query = query.eq('status', opts.status);
  if (opts.since) query = query.gte('created_at', opts.since);

  const { data, error } = await query;
  if (error) {
    console.error(`Referral report query failed: ${error.message}`);
    throw new Error('Failed to build referral report');
  }

  const rows = data || [];

  // Roll up by member.
  const byMember = new Map();
  for (const r of rows) {
    const c = r.referral_codes || {};
    const key = c.member_ref || r.code;
    const existing = byMember.get(key) || {
      memberRef: c.member_ref || null,
      memberName: c.member_name || null,
      memberEmail: c.member_email || null,
      tenantRef: c.tenant_ref || null,
      redemptions: 0,
      commissionCents: 0,
      accruedCents: 0,
    };
    existing.redemptions += 1;
    existing.commissionCents += r.commission_cents || 0;
    if (r.status === 'accrued') existing.accruedCents += r.commission_cents || 0;
    byMember.set(key, existing);
  }

  return {
    members: Array.from(byMember.values()),
    redemptions: rows.map((r) => ({
      code: r.code,
      memberRef: r.referral_codes?.member_ref || null,
      refereeEmail: r.referee_email,
      amountPaidCents: r.amount_paid_cents,
      refereeDiscountCents: r.referee_discount_cents,
      commissionCents: r.commission_cents,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

module.exports = { validateReferral, recordReferral, getReferralReport };
