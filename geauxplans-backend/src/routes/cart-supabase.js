/**
 * Server-persisted cart (Supabase)
 *
 * One `carts` row per user holds the whole cart as JSONB (line items + any
 * applied coupon). This is the account-bound counterpart to the browser's
 * localStorage cart: while a user is logged in the front-end mirrors every cart
 * change up here, so the cart follows them across devices, and merges the
 * guest localStorage cart into it on login.
 *
 * This is display/convenience storage only — Stripe checkout re-derives and
 * re-validates the real prices, so nothing here is trusted for what is charged.
 *
 * Mounted only in Supabase mode (see server.js). If the `carts` table has not
 * been created yet (migration 009 not applied), every query fails and the route
 * returns a benign empty result so the client silently keeps using localStorage.
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');

/**
 * Verify the Supabase JWT and attach { id, email } as req.user.
 *
 * Kept as its own copy (rather than imported from submissions-supabase) so the
 * cart route stands alone; it is the same contract the rest of the Supabase API
 * uses.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.',
    });
  }

  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Auth unavailable.' });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const isExpired = error?.message?.includes('expired');
      return res.status(401).json({
        success: false,
        error: isExpired ? 'Your session has expired. Please log in again.' : 'Please log in to continue.',
        code: isExpired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED',
      });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    console.error('Cart auth error:', err);
    return res.status(401).json({ success: false, error: 'Invalid token.' });
  }
}

/**
 * Normalize a stored row into the { items, coupon } shape the front-end cart
 * service expects. A missing row (new user) reads as an empty cart.
 */
function rowToCart(row) {
  if (!row) return { items: [], coupon: null };
  return {
    items: Array.isArray(row.items) ? row.items : [],
    coupon: row.coupon || null,
  };
}

/**
 * GET /api/cart
 * Return the logged-in user's stored cart.
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('carts')
      .select('items, coupon')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      // Most likely the table does not exist yet. Degrade to empty so the
      // client falls back to localStorage instead of surfacing an error.
      console.error('Cart fetch error:', error.message);
      return res.json({ success: true, data: { items: [], coupon: null } });
    }

    return res.json({ success: true, data: rowToCart(data) });
  } catch (err) {
    console.error('Cart GET error:', err);
    return res.json({ success: true, data: { items: [], coupon: null } });
  }
});

/**
 * PUT /api/cart
 * Replace the user's stored cart with the posted { items, coupon }.
 * Upsert on user_id so the first save creates the row.
 */
router.put('/', authenticate, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const coupon = req.body?.coupon ?? null;

  try {
    const { data, error } = await supabase
      .from('carts')
      .upsert(
        {
          user_id: req.user.id,
          items,
          coupon,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('items, coupon')
      .single();

    if (error) {
      console.error('Cart upsert error:', error.message);
      // Non-fatal: the client keeps its localStorage copy.
      return res.json({ success: true, data: { items, coupon } });
    }

    return res.json({ success: true, data: rowToCart(data) });
  } catch (err) {
    console.error('Cart PUT error:', err);
    return res.json({ success: true, data: { items, coupon } });
  }
});

/**
 * DELETE /api/cart
 * Empty the user's stored cart.
 */
router.delete('/', authenticate, async (req, res) => {
  try {
    const { error } = await supabase
      .from('carts')
      .delete()
      .eq('user_id', req.user.id);

    if (error) {
      console.error('Cart delete error:', error.message);
    }
    return res.json({ success: true, data: { items: [], coupon: null } });
  } catch (err) {
    console.error('Cart DELETE error:', err);
    return res.json({ success: true, data: { items: [], coupon: null } });
  }
});

/**
 * POST /api/cart/merge
 * Reconcile a guest localStorage cart into the user's stored cart on login.
 *
 * Union by item id: an id in both carts keeps the larger quantity (not the sum)
 * so the merge is idempotent — a login effect that re-fires on refresh will not
 * keep doubling quantities. The incoming coupon wins if present, otherwise the
 * stored one is kept.
 */
router.post('/merge', authenticate, async (req, res) => {
  const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const incomingCoupon = req.body?.coupon ?? null;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('carts')
      .select('items, coupon')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Cart merge fetch error:', fetchError.message);
      // Table missing / unreadable: hand back what the client sent so it keeps
      // using its own cart.
      return res.json({ success: true, data: { items: incomingItems, coupon: incomingCoupon } });
    }

    const storedItems = existing && Array.isArray(existing.items) ? existing.items : [];
    const storedCoupon = existing ? existing.coupon || null : null;

    const byId = new Map();
    for (const item of storedItems) {
      if (item && item.id != null) byId.set(item.id, { ...item });
    }
    for (const item of incomingItems) {
      if (!item || item.id == null) continue;
      const prev = byId.get(item.id);
      if (prev) {
        byId.set(item.id, {
          ...prev,
          ...item,
          quantity: Math.max(prev.quantity || 0, item.quantity || 0),
        });
      } else {
        byId.set(item.id, { ...item });
      }
    }

    const mergedItems = Array.from(byId.values());
    const mergedCoupon = incomingCoupon || storedCoupon;

    const { data, error } = await supabase
      .from('carts')
      .upsert(
        {
          user_id: req.user.id,
          items: mergedItems,
          coupon: mergedCoupon,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('items, coupon')
      .single();

    if (error) {
      console.error('Cart merge upsert error:', error.message);
      return res.json({ success: true, data: { items: mergedItems, coupon: mergedCoupon } });
    }

    return res.json({ success: true, data: rowToCart(data) });
  } catch (err) {
    console.error('Cart MERGE error:', err);
    return res.json({ success: true, data: { items: incomingItems, coupon: incomingCoupon } });
  }
});

module.exports = router;
