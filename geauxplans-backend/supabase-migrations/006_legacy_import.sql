-- Migration: columns the WordPress import needs to be re-runnable
-- Run this in Supabase SQL Editor before scripts/migrate-legacy.js

-- The import has to be safe to run twice — a half-finished run that cannot be
-- resumed is worse than no import at all. Matching on email works for users,
-- but orders and submissions have no natural key in the destination schema, so
-- each row carries the id it had in WordPress and a unique index does the rest.
--
-- NULL for anything created natively in the new app, so the unique index costs
-- nothing there: Postgres does not consider two NULLs equal.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS legacy_wp_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_legacy_wp_id
  ON orders(legacy_wp_id) WHERE legacy_wp_id IS NOT NULL;

ALTER TABLE poa_submissions
  ADD COLUMN IF NOT EXISTS legacy_wp_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poa_submissions_legacy_wp_id
  ON poa_submissions(legacy_wp_id) WHERE legacy_wp_id IS NOT NULL;

-- Profiles are keyed by the auth user id, which the import looks up by email,
-- so no unique index is needed here. The WordPress id is kept anyway because it
-- is the only way to tie an imported account back to the old site when someone
-- asks why their order history looks the way it does.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS legacy_wp_id BIGINT;

COMMENT ON COLUMN orders.legacy_wp_id IS 'wp_wc_order_stats.order_id this row was imported from; NULL for orders placed in the new app';
COMMENT ON COLUMN poa_submissions.legacy_wp_id IS 'wp_poa_submissions.id this row was imported from; NULL for submissions made in the new app';
COMMENT ON COLUMN profiles.legacy_wp_id IS 'wp_users.ID this account was imported from; NULL for accounts registered in the new app';
