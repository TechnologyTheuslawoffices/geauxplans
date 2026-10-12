-- Migration: GeauxCounsel referral codes
-- Run this in Supabase SQL Editor
--
-- A GeauxCounsel member (an attorney/firm) hands a client a referral code. The
-- client buys a plan on GeauxPlans and enters the code at checkout: the client
-- gets a discount, and the member accrues a credit toward their GeauxCounsel
-- bill ("your referrals can pay your GeauxCounsel fee").
--
-- GeauxPlans and GeauxCounsel are SEPARATE Supabase projects, so this side only
-- TRACKS the credit. GeauxCounsel reads the /api/referrals/report ledger and
-- applies the waiver there. Nothing here calls GeauxCounsel.
--
-- Modeled on 005_coupons.sql (coupons / coupon_redemptions). Differences:
--   * a code is tied to a GeauxCounsel member (member_ref = their
--     tenant_users.id, stored as an opaque string since it lives in the other
--     project's database);
--   * codes are reusable (no usage limit) — a member shares one code with many
--     clients;
--   * each redemption records both the client discount and the member's
--     commission so the report is a straight sum.

CREATE TABLE IF NOT EXISTS referral_codes (
  -- Compared case-insensitively; stored folded so the primary key dedupes.
  code TEXT PRIMARY KEY CHECK (code = lower(code)),

  -- Who earns the credit. member_ref is the GeauxCounsel tenant_users.id (a
  -- uuid in that project); kept as TEXT because there is no cross-project FK.
  -- tenant_ref is their firm (tenants.id), for firm-level roll-ups.
  member_ref TEXT NOT NULL,
  member_name TEXT,
  member_email TEXT,
  tenant_ref TEXT,

  -- The client's discount and the member's commission, as percentages.
  referee_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 10
    CHECK (referee_discount_percent >= 0 AND referee_discount_percent <= 100),
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 10
    CHECK (commission_percent >= 0 AND commission_percent <= 100),

  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- Backend service role only. The anon key must not be able to enumerate codes.
DROP POLICY IF EXISTS "Service role only for referral_codes" ON referral_codes;
CREATE POLICY "Service role only for referral_codes" ON referral_codes
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE referral_codes IS 'GeauxCounsel member referral codes; member_ref is the member tenant_users.id in the GeauxCounsel project.';

-- Redemptions, written when a Stripe checkout session completes (not at session
-- creation — a client who abandons the payment page has not redeemed). Unique
-- on the session id so a replayed webhook is a no-op.
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL REFERENCES referral_codes(code),
  stripe_session_id TEXT NOT NULL UNIQUE,
  referee_user_id TEXT,
  referee_email TEXT,
  -- What the client actually paid (post-discount) and the two derived figures.
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  referee_discount_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  -- 'accrued' until GeauxCounsel applies the waiver from the report, then
  -- 'applied'. Lets the report show what is still outstanding.
  status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'applied', 'void')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_redemptions_code ON referral_redemptions(code);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_status ON referral_redemptions(status);

ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only for referral_redemptions" ON referral_redemptions;
CREATE POLICY "Service role only for referral_redemptions" ON referral_redemptions
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Seed: one example so the shape is clear. Replace member_ref/name/email with a
-- real GeauxCounsel member, or delete this row. Provision real codes the same
-- way (one per member) until the self-serve mint endpoint exists.
-- ---------------------------------------------------------------------------
INSERT INTO referral_codes (code, member_ref, member_name, member_email, referee_discount_percent, commission_percent, active)
VALUES
  ('demoattorney', '00000000-0000-0000-0000-000000000000', 'Demo Attorney', 'demo@example.com', 10, 10, FALSE)
ON CONFLICT (code) DO NOTHING;
