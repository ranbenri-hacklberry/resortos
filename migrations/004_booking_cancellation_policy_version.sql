-- DRAFT ONLY — DO NOT RUN without Ran's explicit approval (DB migration).
-- Pins each NEW booking to the cancellation policy version it was booked under.
-- Existing rows stay NULL = no retroactive policy; handled manually.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_policy_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_policy_version text;
-- rollback:
-- ALTER TABLE bookings DROP COLUMN IF EXISTS cancellation_policy_version;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS cancellation_policy_id;
