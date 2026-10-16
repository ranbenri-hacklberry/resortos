-- Add Adam as Manager with full permissions (Owner level)
-- Phone: 0543387383 / 972543387383

DO $$
DECLARE
  v_business_id uuid;
BEGIN
  -- Grab default business/tenant id
  SELECT business_id INTO v_business_id FROM public.employees WHERE business_id IS NOT NULL LIMIT 1;
  IF v_business_id IS NULL THEN
    v_business_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(username) = 'adam' OR phone = '0543387383' OR whatsapp_phone LIKE '%543387383') THEN
    UPDATE public.employees
    SET
      name = 'אדם',
      username = 'adam',
      role = 'MANAGER',
      is_admin = true,
      access_level = 'owner',
      phone = '0543387383',
      whatsapp_phone = '972543387383',
      is_active = true,
      allow_remote_attendance = true,
      visible_apps = CASE
        WHEN COALESCE(visible_apps, '[]'::jsonb) @> '["hotelos"]'::jsonb THEN visible_apps
        ELSE COALESCE(visible_apps, '[]'::jsonb) || '["hotelos"]'::jsonb
      END
    WHERE lower(username) = 'adam' OR phone = '0543387383' OR whatsapp_phone LIKE '%543387383';
  ELSE
    INSERT INTO public.employees (
      name,
      business_id,
      username,
      password_hash,
      role,
      is_admin,
      access_level,
      phone,
      whatsapp_phone,
      allow_remote_attendance,
      is_active,
      visible_apps
    ) VALUES (
      'אדם',
      v_business_id,
      'adam',
      crypt('123456', gen_salt('bf')),
      'MANAGER',
      true,
      'owner',
      '0543387383',
      '972543387383',
      true,
      true,
      '["hotelos"]'::jsonb
    );
  END IF;

  -- Ensure Max / Ran has updated mobile (0506102416) and WhatsApp (972548317887)
  IF EXISTS (SELECT 1 FROM public.employees WHERE lower(username) = 'max' OR lower(username) = 'ran' OR name LIKE '%רני%' OR name LIKE '%מקס%') THEN
    UPDATE public.employees
    SET
      phone = '0506102416',
      whatsapp_phone = '972548317887',
      role = 'MANAGER',
      is_admin = true,
      access_level = 'owner',
      is_active = true
    WHERE lower(username) = 'max' OR lower(username) = 'ran' OR name LIKE '%רני%' OR name LIKE '%מקס%';
  END IF;
END $$;
