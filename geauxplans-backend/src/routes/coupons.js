/**
 * Coupon validation.
 *
 * Deliberately has no database dependency beyond Supabase, so it can be mounted
 * from both entry points (src/server.js and api/index.js) — see the warning at
 * the top of api/index.js about those two files being separate copies.
 *
 * This endpoint is a PREVIEW only. It tells the cart what a code is worth so the
 * customer can see the discount before paying; it does not reserve or consume
 * anything. The binding calculation happens again inside
 * /api/stripe/create-checkout-session, because that is the request that decides
 * how much money changes hands.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { validateCoupon } = require('../services/coupons');

const router = express.Router();

router.post(
  '/validate',
  [
    body('code').isString().trim().isLength({ min: 1, max: 64 }).withMessage('Enter a coupon code.'),
    body('subtotalCents').isInt({ min: 1 }).withMessage('Cart subtotal is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    try {
      const result = await validateCoupon(req.body.code, parseInt(req.body.subtotalCents, 10));

      // 200 either way. An invalid code is a normal answer to a normal
      // question, and the client needs to read `valid` rather than branch on
      // the status; a 404 here would be indistinguishable from a routing bug,
      // which is precisely how the SOS lookup stayed broken for so long.
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Coupon validation error:', error);
      return res.status(500).json({ success: false, error: 'Failed to validate coupon' });
    }
  }
);

module.exports = router;
