/**
 * Business endpoints that need no database.
 *
 * routes/business.js requires ../config/database, so server.js can only mount it
 * in SQLite mode. Everything in it is therefore missing from production, where
 * USE_SUPABASE is set — including the Louisiana SOS name check, which the LLC
 * purchase funnel starts with. This router carries the DB-free subset so it can
 * be mounted in both modes.
 */

const express = require('express');
const { checkLLCAvailability } = require('../services/laSos');

const router = express.Router();

/**
 * POST /api/business/check-availability
 *
 * Always 200 when the request itself is well-formed. A failed SOS lookup is a
 * result (`available: null`), not a transport error: the client has to render
 * "we couldn't verify this" differently from "this name is taken", and an HTTP
 * error status would collapse both into one catch block — which is how the
 * original bug silently reported every name as available.
 */
router.post('/check-availability', async (req, res) => {
  const { name, state = 'LA' } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'Business name is required' });
  }

  if (state !== 'LA') {
    return res.status(400).json({
      success: false,
      error: 'Name availability checks are only available for Louisiana at this time',
    });
  }

  const result = await checkLLCAvailability(String(name).trim());

  res.json({
    success: true,
    data: { name: String(name).trim(), state, ...result },
  });
});

module.exports = router;
