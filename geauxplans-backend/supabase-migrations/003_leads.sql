-- Migration: Lead capture (contact form, webinar RSVP/registration)
-- Run this in Supabase SQL Editor

-- Leads are captured from public, unauthenticated marketing forms. They are
-- stored here FIRST and pushed to Keap best-effort, so a Keap outage or a
-- missing KEAP_ACCESS_TOKEN loses nothing: `keap_sync_status = 'pending'` rows
-- can be replayed.
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,            -- 'contact', 'webinar_rsvp', 'webinar_registration'
  name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  -- Source-specific fields: contact -> {subject, message};
  -- webinar_registration -> {eventDate, eventTime, zipCode}
  details JSONB DEFAULT '{}'::jsonb,
  keap_contact_id TEXT,
  keap_sync_status TEXT DEFAULT 'pending',  -- 'pending', 'synced', 'failed', 'skipped'
  keap_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
-- Supports replaying unsynced leads.
CREATE INDEX IF NOT EXISTS idx_leads_sync_status ON leads(keap_sync_status)
  WHERE keap_sync_status <> 'synced';

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Writes come from the backend service role only; the anon key must never be
-- able to read harvested contact details.
CREATE POLICY "Service role only for leads" ON leads
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE leads IS 'Public marketing form captures, synced to Keap best-effort';
