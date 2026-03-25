-- Migration: Add form access control (30-day edit expiry)
-- Run this in Supabase SQL Editor

-- 1. Add first_submitted_at column to track when form was first completed
ALTER TABLE poa_submissions
ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ;

-- 2. Backfill first_submitted_at for existing completed submissions
-- Uses created_at as the first submission date for existing records
UPDATE poa_submissions
SET first_submitted_at = created_at
WHERE submission_status = 'completed'
AND first_submitted_at IS NULL;

-- 3. Create user_subscriptions table for extended access
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create index for faster subscription lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_product
ON user_subscriptions(user_id, product_id, status);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires
ON user_subscriptions(expires_at);

-- 5. Create index on first_submitted_at for grace period queries
CREATE INDEX IF NOT EXISTS idx_poa_submissions_first_submitted
ON poa_submissions(first_submitted_at);

-- 6. Add RLS policies for user_subscriptions
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update subscriptions (via backend)
CREATE POLICY "Service role can manage subscriptions" ON user_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- 7. Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger for user_subscriptions updated_at
DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 9. View for easy access status checking (optional helper)
CREATE OR REPLACE VIEW submission_access_status AS
SELECT
  s.id,
  s.user_id,
  s.form_type,
  s.submission_status,
  s.first_submitted_at,
  s.created_at,
  -- Calculate days since first submission
  CASE
    WHEN s.first_submitted_at IS NULL THEN 30
    ELSE GREATEST(0, 30 - EXTRACT(DAY FROM (NOW() - s.first_submitted_at)))
  END AS days_remaining,
  -- Check if within grace period
  CASE
    WHEN s.first_submitted_at IS NULL THEN TRUE
    WHEN NOW() <= (s.first_submitted_at + INTERVAL '30 days') THEN TRUE
    ELSE FALSE
  END AS within_grace_period,
  -- Check for active subscription
  EXISTS (
    SELECT 1 FROM user_subscriptions sub
    WHERE sub.user_id = s.user_id
    AND sub.product_id = 1367
    AND sub.status = 'active'
    AND sub.expires_at > NOW()
  ) AS has_active_subscription
FROM poa_submissions s;

COMMENT ON TABLE user_subscriptions IS 'Tracks user subscriptions for extended form editing access';
COMMENT ON COLUMN poa_submissions.first_submitted_at IS 'Timestamp of first form submission - used for 30-day edit grace period';
