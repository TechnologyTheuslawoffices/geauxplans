-- Migration: Server-persisted shopping cart
-- Run this in Supabase SQL Editor
--
-- The cart has lived only in the browser's localStorage (key `gpx_cart`), so it
-- is tied to one device and one browser: a customer who builds a cart on their
-- phone and then opens checkout on their laptop arrives with nothing. This adds
-- a per-user cart row the backend reads and writes while they are logged in, so
-- the cart follows the account across devices. Guests still fall back to
-- localStorage; the two are reconciled on login (see /api/cart/merge).
--
-- One row per user. The whole cart (line items + any applied coupon) is stored
-- as JSONB rather than normalized line rows because the cart is always read and
-- written as a single blob — there are no server-side queries against an
-- individual line, and the pricing that actually gets charged is re-derived by
-- Stripe checkout, so this table is a convenience store, not a source of truth.

CREATE TABLE IF NOT EXISTS carts (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  coupon     JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE carts IS 'Server-persisted shopping cart, one row per user. items/coupon mirror the front-end cartService shape; display-only (Stripe re-prices at checkout).';

-- Defense in depth: the backend reaches this table with the service-role key
-- (which bypasses RLS) and always scopes every query to req.user.id, so these
-- policies are not what enforces isolation today. They are here so that if the
-- table is ever touched with an anon/user key, a user can still only see and
-- change their own cart.
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carts_self_access ON carts;
CREATE POLICY carts_self_access ON carts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
