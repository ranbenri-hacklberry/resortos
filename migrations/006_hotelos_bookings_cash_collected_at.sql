-- Add cash collection timestamp to bookings.
ALTER TABLE public.hotelos_bookings ADD COLUMN IF NOT EXISTS cash_collected_at timestamptz;
