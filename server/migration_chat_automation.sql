-- Migration: Chat automation state (Human Takeover) & Inbound Message Read Tracking
-- Supports multi-WhatsApp channels ('resortos', 'mialees')

-- 1. Inbound message read tracking in guest_communications
ALTER TABLE public.guest_communications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS guest_communications_unread_today_idx
  ON public.guest_communications (direction, read_at, created_at DESC)
  WHERE direction = 'inbound';

-- 2. Chat automation persistence table
CREATE TABLE IF NOT EXISTS public.chat_automation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id text NOT NULL DEFAULT 'resortos',
  chat_id text NOT NULL, -- normalized phone digits or remote JID
  booking_id text REFERENCES public.hotelos_bookings(id) ON DELETE SET NULL,
  bot_disabled boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'manual_reply', -- 'manual_reply' | 'manager_toggle' | 'checkout'
  CONSTRAINT chat_automation_channel_chat_uniq UNIQUE (channel_id, chat_id)
);

CREATE INDEX IF NOT EXISTS chat_automation_booking_idx
  ON public.chat_automation_state (booking_id);

CREATE INDEX IF NOT EXISTS chat_automation_disabled_idx
  ON public.chat_automation_state (channel_id, bot_disabled)
  WHERE bot_disabled = true;

-- 3. Security & Realtime
ALTER TABLE public.chat_automation_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lan_chat_automation_all" ON public.chat_automation_state;
CREATE POLICY "lan_chat_automation_all"
  ON public.chat_automation_state
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_automation_state TO anon, authenticated, service_role;

ALTER TABLE public.chat_automation_state REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_automation_state;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
