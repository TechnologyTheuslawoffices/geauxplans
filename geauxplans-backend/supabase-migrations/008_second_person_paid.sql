-- Migration: Track whether a solo plan has paid to add a second person
-- Run this in Supabase SQL Editor
--
-- The "1 vs 2 people" choice moved out of checkout: everyone buys the solo
-- plan, and adding a second person is now a paid, in-interview add-on that
-- charges the exact price delta through Stripe. This column records that the
-- delta has been paid so the interview may flip form_type to the 2Person
-- variant. Without it, a client could self-upgrade for free by editing the
-- URL's ?type= param, which PUT /api/submissions/:id would otherwise trust.

-- 1. Add the flag, defaulting to false for solo plans
ALTER TABLE poa_submissions
  ADD COLUMN IF NOT EXISTS second_person_paid BOOLEAN NOT NULL DEFAULT false;

-- 2. Backfill: any existing 2Person plan was paid for as a couple at checkout,
--    so it is already entitled to its spouse pages.
UPDATE poa_submissions
SET second_person_paid = true
WHERE form_type LIKE '%2Person';

COMMENT ON COLUMN poa_submissions.second_person_paid IS 'True once the second-person price delta has been paid, permitting the solo->2Person form_type upgrade';
