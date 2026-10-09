-- Migration: Add a human-readable, sequential submission number
-- Run this in Supabase SQL Editor
--
-- Submissions are otherwise identified only by an opaque UUID that is never
-- shown to the user, so two plans of the same type are indistinguishable on the
-- dashboard. This adds a friendly running number (e.g. GP-000123) that the UI
-- can display and that customers/support can quote.

-- 1. Sequence that hands out the running numbers
CREATE SEQUENCE IF NOT EXISTS poa_submission_number_seq;

-- 2. Add the column (nullable for now so the backfill can populate it)
ALTER TABLE poa_submissions
  ADD COLUMN IF NOT EXISTS submission_number BIGINT;

-- 3. Backfill existing rows in creation order, so older plans get lower numbers
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM poa_submissions
  WHERE submission_number IS NULL
)
UPDATE poa_submissions s
SET submission_number = ordered.rn
FROM ordered
WHERE s.id = ordered.id;

-- 4. Advance the sequence past the highest backfilled value so new rows never
--    collide with an existing number
SELECT setval(
  'poa_submission_number_seq',
  COALESCE((SELECT MAX(submission_number) FROM poa_submissions), 0)
);

-- 5. New rows auto-assign the next number (covers both the first-save insert and
--    the Stripe webhook insert — neither has to set it explicitly)
ALTER TABLE poa_submissions
  ALTER COLUMN submission_number SET DEFAULT nextval('poa_submission_number_seq');

-- 6. Enforce uniqueness and speed up lookups by number
CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_submissions_number
  ON poa_submissions(submission_number);

COMMENT ON COLUMN poa_submissions.submission_number IS 'Sequential, human-readable submission number shown to users (formatted as GP-000123)';
