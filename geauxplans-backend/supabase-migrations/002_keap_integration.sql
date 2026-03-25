-- Migration: Keap Integration Tables
-- Run this in Supabase SQL Editor
-- Using Personal Access Token (PAT) - no OAuth token storage needed

-- 1. Keap interaction log (for debugging/auditing)
CREATE TABLE IF NOT EXISTS keap_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'form_submission', 'purchase', 'tag_applied', etc.
  contact_id TEXT, -- Keap contact ID
  request_data JSONB,
  response_data JSONB,
  status TEXT DEFAULT 'success', -- 'success', 'error'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index for querying logs
CREATE INDEX IF NOT EXISTS idx_keap_log_event_type ON keap_log(event_type);
CREATE INDEX IF NOT EXISTS idx_keap_log_created_at ON keap_log(created_at);
CREATE INDEX IF NOT EXISTS idx_keap_log_contact_id ON keap_log(contact_id);

-- 3. Add keap_contact_id to poa_submissions for tracking
ALTER TABLE poa_submissions
ADD COLUMN IF NOT EXISTS keap_contact_id TEXT;

-- 4. RLS policies
ALTER TABLE keap_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access keap_log
CREATE POLICY "Service role only for keap_log" ON keap_log
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE keap_log IS 'Logs all Keap API interactions for debugging';
