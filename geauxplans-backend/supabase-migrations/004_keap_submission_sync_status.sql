-- Migration: record the outcome of the Keap sync on each submission
-- Run this in Supabase SQL Editor

-- Migration 002 added `keap_contact_id`, which only records the success case.
-- When the sync failed there was nothing left on the row to say so, and the
-- sync itself was fire-and-forget, so a submission could reach 'completed' with
-- no contact in the CRM and no trace of why.
--
-- These two columns mirror the ones on `leads` so both paths can be inspected
-- and replayed the same way.
ALTER TABLE poa_submissions
  ADD COLUMN IF NOT EXISTS keap_sync_status TEXT,  -- 'synced', 'failed', 'skipped'
  ADD COLUMN IF NOT EXISTS keap_error TEXT,
  -- Trigger tags already applied for this submission.
  --
  -- A client can resubmit a completed form, and the update path regenerates
  -- documents every time. Keap campaigns typically remove their own trigger
  -- tag when they finish so it can fire again, so reapplying 1354 'Completed
  -- Interview' on each resubmit would put that client through the same
  -- sequence repeatedly. Recording what has been applied lets the backend send
  -- only the tags that are genuinely new.
  ADD COLUMN IF NOT EXISTS keap_tags_applied INTEGER[] DEFAULT '{}';

-- Supports finding submissions whose contact never reached Keap. NULL covers
-- rows written before this migration and drafts that were never completed.
CREATE INDEX IF NOT EXISTS idx_poa_submissions_keap_sync_status
  ON poa_submissions(keap_sync_status)
  WHERE keap_sync_status IS DISTINCT FROM 'synced';

COMMENT ON COLUMN poa_submissions.keap_sync_status IS
  'Outcome of the Keap contact sync: synced, failed, or skipped (Keap not configured)';
COMMENT ON COLUMN poa_submissions.keap_error IS
  'Error returned by Keap when keap_sync_status = failed';
