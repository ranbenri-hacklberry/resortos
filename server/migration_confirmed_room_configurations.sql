-- ============================================================================
-- ResortOS — Confirmed Room Configurations Migration (Phase 2)
-- Bed configurations, physical sleeping capacities, AC & TV counts, amenities
-- Source: Confirmed directly with Operations Management (26 Ramot guest units)
-- ============================================================================

BEGIN;

-- 1. Idempotent schema extension
ALTER TABLE public.resort_units
  ADD COLUMN IF NOT EXISTS bed_configuration text,
  ADD COLUMN IF NOT EXISTS physical_sleeping_capacity integer,
  ADD COLUMN IF NOT EXISTS beds jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ac_count integer,
  ADD COLUMN IF NOT EXISTS tv_count integer,
  ADD COLUMN IF NOT EXISTS required_yes_receivers integer,
  ADD COLUMN IF NOT EXISTS room_amenities jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Non-destructive updates for the 26 confirmed rooms across 7 properties

-- ----------------------------------------------------------------------------
-- PROPERTY: טאג' מהל (k808..k811) — 4 rooms
-- 2 sleeping places (1 regular double bed), 2 ACs, 1 TV, 1 YES receiver
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2',
  physical_sleeping_capacity = 2,
  beds = '[{"type": "double", "quantity": 1}]'::jsonb,
  ac_count = 2,
  tv_count = 1,
  required_yes_receivers = 1,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2',
    'physical_sleeping_capacity', 2,
    'beds', '[{"type": "double", "quantity": 1}]'::jsonb,
    'ac_count', 2,
    'tv_count', 1,
    'required_yes_receivers', 1
  ),
  updated_at = NOW()
WHERE id IN ('k808', 'k809', 'k810', 'k811');

-- ----------------------------------------------------------------------------
-- PROPERTY: בקתות מאיה (k693..k695) — 3 rooms
-- 4 sleeping places (1 double + 1 double sofa bed), 2 ACs, 2 TVs, 2 YES receivers
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+2',
  physical_sleeping_capacity = 4,
  beds = '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+2',
    'physical_sleeping_capacity', 4,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k693', 'k694', 'k695');

-- ----------------------------------------------------------------------------
-- PROPERTY: החצר המוזיקלית (k690..k692) — 3 rooms
-- 4 sleeping places (1 double + 1 double sofa bed), 2 ACs, 1 TV, 1 YES receiver
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+2',
  physical_sleeping_capacity = 4,
  beds = '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
  ac_count = 2,
  tv_count = 1,
  required_yes_receivers = 1,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+2',
    'physical_sleeping_capacity', 4,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
    'ac_count', 2,
    'tv_count', 1,
    'required_yes_receivers', 1
  ),
  updated_at = NOW()
WHERE id IN ('k690', 'k691', 'k692');

-- ----------------------------------------------------------------------------
-- PROPERTY: מול הנוף (k680..k684) — 5 rooms
-- Rooms 1, 4, 5: 2+2 (1 double + 1 double sofa bed), Cap: 4, 2 ACs, 2 TVs, 2 YES
-- Rooms 2, 3: 2+1+1+1+1 (1 double + 4 single beds), Cap: 6, 2 ACs, 2 TVs, 2 YES
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+2',
  physical_sleeping_capacity = 4,
  beds = '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+2',
    'physical_sleeping_capacity', 4,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k680', 'k683', 'k684');

UPDATE public.resort_units
SET
  bed_configuration = '2+1+1+1+1',
  physical_sleeping_capacity = 6,
  beds = '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 4}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+1+1+1+1',
    'physical_sleeping_capacity', 6,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 4}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k681', 'k682');

-- ----------------------------------------------------------------------------
-- PROPERTY: טוסקנה (k687..k689) — 3 rooms
-- Rooms 1, 2: 2+1+1 (1 double + 2 single beds), Cap: 4, 2 ACs, 2 TVs, 2 YES
-- Room 3: 2+1+1+1+1+1 (1 double + 5 single beds), Cap: 7, 2 ACs, 2 TVs, 2 YES + private_sauna = true
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+1+1',
  physical_sleeping_capacity = 4,
  beds = '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 2}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+1+1',
    'physical_sleeping_capacity', 4,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 2}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k687', 'k688');

UPDATE public.resort_units
SET
  bed_configuration = '2+1+1+1+1+1',
  physical_sleeping_capacity = 7,
  beds = '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 5}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  room_amenities = '{"private_sauna": true}'::jsonb,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+1+1+1+1+1',
    'physical_sleeping_capacity', 7,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 5}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2,
    'amenities', '{"private_sauna": true}'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'k689';

-- ----------------------------------------------------------------------------
-- PROPERTY: נופים בלבן (k685, k686) — 2 rooms
-- 2+1+1+1+2 (1 double + 3 singles + 1 double sofa bed), Cap: 7, 3 ACs, 2 TVs, 2 YES
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+1+1+1+2',
  physical_sleeping_capacity = 7,
  beds = '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 3}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
  ac_count = 3,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+1+1+1+2',
    'physical_sleeping_capacity', 7,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "single", "quantity": 3}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
    'ac_count', 3,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k685', 'k686');

-- ----------------------------------------------------------------------------
-- PROPERTY: בתי נורית (k671, k673..k677) — 6 rooms
-- Room 1: 2+2 (1 double + 1 double sofa bed), Cap: 4, 2 ACs, 2 TVs, 2 YES
-- Rooms 2-6: 2+2+1+1 (1 double + 1 double sofa bed + 2 singles), Cap: 6, 3 ACs, 2 TVs, 2 YES
-- (Note: k678 and k679 are staff accommodation units and remain untouched)
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  bed_configuration = '2+2',
  physical_sleeping_capacity = 4,
  beds = '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
  ac_count = 2,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+2',
    'physical_sleeping_capacity', 4,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}]'::jsonb,
    'ac_count', 2,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id = 'k671';

UPDATE public.resort_units
SET
  bed_configuration = '2+2+1+1',
  physical_sleeping_capacity = 6,
  beds = '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}, {"type": "single", "quantity": 2}]'::jsonb,
  ac_count = 3,
  tv_count = 2,
  required_yes_receivers = 2,
  content = COALESCE(content, '{}'::jsonb) || jsonb_build_object(
    'bed_configuration', '2+2+1+1',
    'physical_sleeping_capacity', 6,
    'beds', '[{"type": "double", "quantity": 1}, {"type": "double_sofa_bed", "quantity": 1}, {"type": "single", "quantity": 2}]'::jsonb,
    'ac_count', 3,
    'tv_count', 2,
    'required_yes_receivers', 2
  ),
  updated_at = NOW()
WHERE id IN ('k673', 'k674', 'k675', 'k676', 'k677');

COMMIT;
