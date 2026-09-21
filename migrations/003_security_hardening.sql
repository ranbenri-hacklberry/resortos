-- ============================================================================
-- ResortOS Security Hardening: 003_security_hardening.sql
-- Critical: remove anonymous read policies that expose tenant/stay data.
-- Run after 001_cabinos_core.sql (and 002_crm_funnel_and_visibility.sql if present).
-- ============================================================================

-- profiles must never be readable by an anonymous PostgREST request.
-- The previous policy included auth.uid() IS NULL, which made the whole table
-- readable with the anon role.
DROP POLICY IF EXISTS "Users read own profile" ON profiles;

CREATE POLICY "Users read own profile"
ON profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (auth.uid() = id OR auth.uid() = auth_user_id)
);

-- A booking is private operational data. The previous policy used USING (true),
-- which exposed every booking to anonymous SELECT requests.
DROP POLICY IF EXISTS "Guests read own booking by email or phone" ON bookings;

-- Hosts may continue to read bookings belonging to their own properties via
-- the existing "Hosts read property bookings" policy.
-- Guest checkout must go through the server-side checkout/token boundary,
-- not anonymous PostgREST table access.

-- Keep public booking INSERT behavior for the moment because the current
-- booking flow still relies on it. It is tracked as a separate hardening item:
-- move public booking creation behind a validated server/RPC endpoint with
-- rate limiting and server-side field validation.
