-- Migration 008: Add birthday, birthday_note, upsell_description, and upsell_price to hotelos_bookings
-- Pending Ran's approval before running on production database.

ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS is_birthday BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS birthday_note TEXT,
  ADD COLUMN IF NOT EXISTS upsell_description TEXT,
  ADD COLUMN IF NOT EXISTS upsell_price NUMERIC(10, 2);

COMMENT ON COLUMN public.hotelos_bookings.is_birthday IS 'Flag indicating if the guest is celebrating a birthday during the stay';
COMMENT ON COLUMN public.hotelos_bookings.birthday_note IS 'Optional note specifying birthday details, cake, balloons, or promised items';
COMMENT ON COLUMN public.hotelos_bookings.upsell_description IS 'Optional description of agreed upsell (e.g. breakfast, late checkout, romantic setup)';
COMMENT ON COLUMN public.hotelos_bookings.upsell_price IS 'Optional agreed upsell price in ILS (₪)';
