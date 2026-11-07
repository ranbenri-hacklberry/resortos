-- Cardcom Manual Terminal Charges: Seen Deals & Pending Matches
-- Terminal 184288 auto-link workflow with owner (Ran) approval via WhatsApp.

CREATE TABLE IF NOT EXISTS public.cardcom_seen_deals (
  deal_id text PRIMARY KEY,
  terminal_number text NOT NULL DEFAULT '184288',
  amount numeric NOT NULL,
  approval_number text,
  last4 text,
  card_owner_name text,
  entry_mode text DEFAULT 'Phone',
  deal_time timestamptz,
  linked_booking_id text REFERENCES public.hotelos_bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'seen', -- 'seen', 'linked', 'ignored'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cardcom_seen_deals_terminal
  ON public.cardcom_seen_deals (terminal_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cardcom_seen_deals_linked
  ON public.cardcom_seen_deals (linked_booking_id)
  WHERE linked_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cardcom_pending_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text NOT NULL UNIQUE REFERENCES public.cardcom_seen_deals(deal_id) ON DELETE CASCADE,
  terminal_number text NOT NULL DEFAULT '184288',
  amount numeric NOT NULL,
  last4 text,
  approval text,
  deal_time timestamptz,
  payer_name text,
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_candidate_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'ignored', 'manual_linked'
  selected_booking_id text REFERENCES public.hotelos_bookings(id) ON DELETE SET NULL,
  ran_prompted_at timestamptz,
  ran_prompt_message text,
  approved_at timestamptz,
  payment_recorded_at timestamptz,
  invoice_number text,
  invoice_url text,
  guest_notified_at timestamptz,
  guest_invoice_requested boolean NOT NULL DEFAULT false,
  guest_invoice_sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_status
  ON public.cardcom_pending_matches (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cardcom_pending_matches_booking
  ON public.cardcom_pending_matches (selected_booking_id)
  WHERE selected_booking_id IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.cardcom_seen_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_pending_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_cardcom_seen_deals_all" ON public.cardcom_seen_deals;
CREATE POLICY "lan_cardcom_seen_deals_all"
  ON public.cardcom_seen_deals
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "lan_cardcom_pending_matches_all" ON public.cardcom_pending_matches;
CREATE POLICY "lan_cardcom_pending_matches_all"
  ON public.cardcom_pending_matches
  FOR ALL
  TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardcom_seen_deals TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardcom_pending_matches TO anon, authenticated, service_role;
