/**
 * Referral codes.
 *
 * Like routes/coupons.js, this has no dependency beyond Supabase, so it mounts
 * from both entry points (src/server.js and api/index.js — see the warning at
 * the top of api/index.js about those being separate copies).
 *
 *   POST /validate  — PREVIEW ONLY. Tells the cart what a code is worth so the
 *                     client sees the discount before paying. The binding
 *                     calculation happens again in create-checkout-session.
 *   GET  /report    — the per-member credit ledger GeauxCounsel reads to apply
 *                     waivers. Guarded by a shared admin token, since it exposes
 *                     member identities and earnings.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { validateReferral, getReferralReport } = require('../services/referrals');

const router = express.Router();

router.post(
  '/validate',
  [
    body('code').isString().trim().isLength({ min: 1, max: 64 }).withMessage('Enter a referral code.'),
    body('subtotalCents').isInt({ min: 1 }).withMessage('Cart subtotal is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
      const result = await validateReferral(req.body.code, parseInt(req.body.subtotalCents, 10));
      // 200 either way; the client reads `valid` (same contract as coupons).
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Referral validation error:', error);
      return res.status(500).json({ success: false, error: 'Failed to validate referral code' });
    }
  }
);

/**
 * Admin-only ledger. Protected by a bearer token (REFERRAL_ADMIN_TOKEN); if the
 * env var is unset the endpoint is closed rather than open, because it discloses
 * who referred whom and how much they have earned.
 */
router.get('/report', async (req, res) => {
  const expected = process.env.REFERRAL_ADMIN_TOKEN;
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const report = await getReferralReport({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      since: typeof req.query.since === 'string' ? req.query.since : undefined,
    });
    return res.json({ success: true, data: report });
  } catch (error) {
    console.error('Referral report error:', error);
    return res.status(500).json({ success: false, error: 'Failed to build referral report' });
  }
});

module.exports = router;
