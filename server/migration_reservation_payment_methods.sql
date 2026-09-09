-- Card tokens from the first Hyp deposit. Booking ids are text (b_… / kin_… / web_…),
-- not UUID reservations.

CREATE TABLE IF NOT EXISTS public.reservation_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text REFERENCES public.hotelos_bookings(id) ON DELETE CASCADE,
  checkout_token text,
  gateway varchar(50) NOT NULL DEFAULT 'hyp',
  token varchar(255) NOT NULL,
  last_4 varchar(4) NOT NULL DEFAULT '',
  card_brand varchar(50),
  exp_month varchar(2),
  exp_year varchar(2),
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_res_id
  ON public.reservation_payment_methods (booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS reservation_payment_methods_booking_token_uidx
  ON public.reservation_payment_methods (booking_id, token);

ALTER TABLE public.reservation_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_reservation_payment_methods_all" ON public.reservation_payment_methods;
CREATE POLICY "lan_reservation_payment_methods_all"
  ON public.reservation_payment_methods
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_payment_methods TO anon, authenticated, service_role;
