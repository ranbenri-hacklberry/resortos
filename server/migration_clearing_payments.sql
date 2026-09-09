ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS clearing_payments jsonb NOT NULL DEFAULT '[]'::jsonb;
