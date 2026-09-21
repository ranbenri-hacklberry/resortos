-- Guest digital checkout status + communications log (hotelos_bookings).

ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_status text NOT NULL DEFAULT 'staying',
  ADD COLUMN IF NOT EXISTS wifi_presence_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

COMMENT ON COLUMN public.hotelos_bookings.checkout_status IS
  'staying | self_departed | auto_departed | overdue';
COMMENT ON COLUMN public.hotelos_bookings.wifi_presence_status IS
  'active | idle | disconnected — optional router signal';

UPDATE public.hotelos_bookings
SET token_expires_at = COALESCE(token_expires_at, expires_at)
WHERE token_expires_at IS NULL AND expires_at IS NOT NULL;

UPDATE public.hotelos_bookings
SET checkout_status = 'self_departed',
    checked_out_at = COALESCE(checked_out_at, updated_at)
WHERE booking_status = 'CHECKED_OUT'
  AND checkout_status = 'staying';

CREATE TABLE IF NOT EXISTS public.guest_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL REFERENCES public.hotelos_bookings(id) ON DELETE CASCADE,
  tenant_id uuid,
  channel text NOT NULL DEFAULT 'sms',
  direction text NOT NULL DEFAULT 'outbound',
  recipient_phone text,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_communications_booking_idx
  ON public.guest_communications (booking_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_communications_tenant_idx
  ON public.guest_communications (tenant_id, created_at DESC);

ALTER TABLE public.guest_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_guest_communications_all" ON public.guest_communications;
CREATE POLICY "lan_guest_communications_all"
  ON public.guest_communications
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_communications TO anon, authenticated, service_role;

ALTER TABLE public.guest_communications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.guest_communications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
