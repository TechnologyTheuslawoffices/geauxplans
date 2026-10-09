-- Migration: Discount coupons
-- Run this in Supabase SQL Editor

-- Ported from the WooCommerce `shop_coupon` posts on the WordPress site. The
-- rewrite shipped an applyCoupon() that returned success for every string and
-- discounted nothing, so the checkout accepted "FREEMONEY" as readily as a real
-- code and then charged full price. Validation now happens here.
--
-- Amounts are stored the way WooCommerce stored them:
--   discount_type = 'percent'      -> amount is a percentage (10 = 10% off)
--   discount_type = 'fixed_cart'   -> amount is whole dollars off the cart
CREATE TABLE IF NOT EXISTS coupons (
  -- Codes are compared case-insensitively; store them folded so the primary key
  -- does the deduplication for us.
  code TEXT PRIMARY KEY CHECK (code = lower(code)),
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cart')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  -- Percent coupons above 100 would produce a negative total.
  CONSTRAINT percent_within_range CHECK (discount_type <> 'percent' OR amount <= 100),

  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  -- 0 means unlimited, matching WooCommerce's usage_limit semantics.
  usage_limit INTEGER NOT NULL DEFAULT 0 CHECK (usage_limit >= 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  -- Minimum cart subtotal in whole dollars, 0 for no minimum.
  minimum_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (minimum_amount >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Read and write go through the backend service role only. The anon key must
-- not be able to list codes: the table is a directory of ways to pay less.
-- Dropped first because Postgres has no CREATE POLICY IF NOT EXISTS, and this
-- file should survive being run twice.
DROP POLICY IF EXISTS "Service role only for coupons" ON coupons;
CREATE POLICY "Service role only for coupons" ON coupons
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE coupons IS 'Discount codes ported from WooCommerce shop_coupon posts';

-- Redemptions, written when a Stripe checkout session completes. Kept separate
-- from usage_count so we can tell who redeemed what, and so a replayed webhook
-- is a no-op rather than a double decrement.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL REFERENCES coupons(code),
  -- Stripe checkout session id. Unique so webhook retries cannot double-count;
  -- Stripe delivers at-least-once and will resend on any non-2xx.
  stripe_session_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  email TEXT,
  discount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_code ON coupon_redemptions(code);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for coupon_redemptions" ON coupon_redemptions;
CREATE POLICY "Service role only for coupon_redemptions" ON coupon_redemptions
  FOR ALL USING (auth.role() = 'service_role');

-- Atomic increment. A read-modify-write from the application would lose counts
-- when two people redeem a limited-use code at the same moment, which is
-- exactly when the count matters.
CREATE OR REPLACE FUNCTION increment_coupon_usage(coupon_code TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE coupons SET usage_count = usage_count + 1 WHERE code = coupon_code;
$$;

-- ---------------------------------------------------------------------------
-- Seed: the three coupons that existed in WordPress
-- ---------------------------------------------------------------------------

INSERT INTO coupons (code, discount_type, amount, description, active, expires_at, usage_limit, usage_count)
VALUES
  -- 10% off, no limit, never redeemed on the old site.
  ('geaux10', 'percent', 10, 'General 10% discount', TRUE, NULL, 0, 0),

  -- $50 off, created for a named customer. Its WooCommerce date_expires was
  -- 1780790400 = 2026-06-07, which has already passed, so it is seeded expired
  -- rather than silently revived. Change expires_at to reissue it.
  ('geauxgertie50', 'fixed_cart', 50, 'Discount for Gertie Toups', TRUE, '2026-06-07T00:00:00Z', 0, 0),

  -- 100% off. This was an internal test code on WordPress with NO usage limit
  -- and 147 redemptions. Seeded INACTIVE deliberately: anyone who learned the
  -- code could take every product on the site for free, and it is not possible
  -- to tell from the dump whether those 147 uses were staff or the public.
  -- Set active = TRUE only if you intend to reopen that.
  ('tdntest100', 'percent', 100, 'Internal 100% test code — disabled on port', FALSE, NULL, 0, 147)
ON CONFLICT (code) DO NOTHING;
