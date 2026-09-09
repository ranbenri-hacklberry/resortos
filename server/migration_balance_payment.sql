-- Balance preference + cash PIN (employees, not auth.users).

ALTER TABLE public.hotelos_bookings
  ADD COLUMN IF NOT EXISTS balance_payment_preference text NOT NULL DEFAULT 'CREDIT_CARD',
  ADD COLUMN IF NOT EXISTS balance_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_payment_method text,
  ADD COLUMN IF NOT EXISTS bank_transfer_receipt_url text,
  ADD COLUMN IF NOT EXISTS cash_collected_by uuid REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.hotelos_bookings
  DROP CONSTRAINT IF EXISTS hotelos_bookings_balance_pref_chk;
ALTER TABLE public.hotelos_bookings
  ADD CONSTRAINT hotelos_bookings_balance_pref_chk
  CHECK (balance_payment_preference IN ('CREDIT_CARD', 'BANK_TRANSFER', 'CASH'));

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS staff_pin_hash text;

CREATE OR REPLACE FUNCTION public.hotelos_verify_staff_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  digits text;
BEGIN
  digits := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  IF length(digits) <> 4 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO emp
  FROM public.employees
  WHERE coalesce(is_active, true)
    AND staff_pin_hash IS NOT NULL
    AND staff_pin_hash = crypt(digits, staff_pin_hash)
  ORDER BY name
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.hotelos_employee_public(emp);
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_verify_staff_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotelos_verify_staff_pin(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hotelos_set_staff_pin(p_token text, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp public.employees%ROWTYPE;
  digits text;
BEGIN
  emp := public._hotelos_employee_from_token(p_token);
  IF emp.id IS NULL THEN
    RETURN false;
  END IF;
  digits := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  IF length(digits) <> 4 THEN
    RETURN false;
  END IF;
  UPDATE public.employees
  SET staff_pin_hash = crypt(digits, gen_salt('bf'))
  WHERE id = emp.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.hotelos_set_staff_pin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hotelos_set_staff_pin(text, text) TO anon, authenticated, service_role;

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-receipts', 'payment-receipts', false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
