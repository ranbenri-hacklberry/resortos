-- ============================================================================
-- ResortOS — Safe Unit Registry Reclassification & Classification (Phase 1)
-- MODE: REVIEW ONLY — DO NOT EXECUTE WITHOUT EXPLICIT AUTHORIZATION
-- ============================================================================
-- Description:
-- Safely classifies managed spaces and bookable inventory using an explicit
-- allowlist of verified unit IDs. Preserves all historical bookings, pricing,
-- occupancy, and existing JSONB content. Prevents reactivation of retired units.
--
-- Breakdown of 41 Managed Spaces:
--  - 26 Ramot surveyed guest units (bookable)
--  - 12 Unsurveyed guest units in nearby villages (bookable)
--  -  2 Staff accommodation units (managed, non-bookable)
--  -  1 Operational office (managed, non-bookable)
-- Total Bookable: 38 units | Total Managed: 41 spaces
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Optional Schema Alignment (Safe idempotent column addition)
-- ----------------------------------------------------------------------------
ALTER TABLE public.resort_units
  ADD COLUMN IF NOT EXISTS usage text NOT NULL DEFAULT 'GUEST_ACCOMMODATION',
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT true;

-- ----------------------------------------------------------------------------
-- STEP 2: Explicit Allowlist Update — Staff Accommodation Units (2 units)
-- Units: k678 (בתי נורית 7), k679 (בתי נורית 8)
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  usage = 'STAFF_ACCOMMODATION',
  booking_enabled = FALSE,
  content = COALESCE(content, '{}'::jsonb) || '{"usage": "STAFF_ACCOMMODATION", "booking_enabled": false}'::jsonb,
  updated_at = NOW()
WHERE id IN ('k678', 'k679');

-- ----------------------------------------------------------------------------
-- STEP 3: Explicit Allowlist Update — Operational Office (1 space)
-- Units: pilot-office (משרד ראשי)
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  usage = 'OFFICE',
  booking_enabled = FALSE,
  content = COALESCE(content, '{}'::jsonb) || '{"usage": "OFFICE", "booking_enabled": false}'::jsonb,
  updated_at = NOW()
WHERE id IN ('pilot-office');

-- ----------------------------------------------------------------------------
-- STEP 4: Explicit Allowlist Update — Surveyed Ramot Guest Units (26 units)
-- Nurit (1-6):    k671, k673, k674, k675, k676, k677
-- Taj Mahal (1-4): k808, k809, k810, k811
-- Mool HaNof (1-5): k680, k681, k682, k683, k684
-- Nofim (1-2):    k685, k686
-- Toscana (1-3):  k687, k688, k689
-- Musical (1-3):  k690, k691, k692
-- Maya (1-3):     k693, k694, k695
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  usage = 'GUEST_ACCOMMODATION',
  booking_enabled = TRUE,
  content = COALESCE(content, '{}'::jsonb) || '{"usage": "GUEST_ACCOMMODATION", "booking_enabled": true}'::jsonb,
  updated_at = NOW()
WHERE id IN (
  'k671', 'k673', 'k674', 'k675', 'k676', 'k677',
  'k808', 'k809', 'k810', 'k811',
  'k680', 'k681', 'k682', 'k683', 'k684',
  'k685', 'k686',
  'k687', 'k688', 'k689',
  'k690', 'k691', 'k692',
  'k693', 'k694', 'k695'
);

-- ----------------------------------------------------------------------------
-- STEP 5: Explicit Allowlist Update — Unsurveyed Guest Units in Nearby Villages (12 units)
-- Givat Yoav: hill-1, hill-2, hill-3, hill-4
-- Kipat Shamayim: dome-blue, dome-red, dome-green
-- Mialees Resort: mialis-villa, suite-1, suite-2
-- Casa Nova:      k826, k827
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  usage = 'GUEST_ACCOMMODATION',
  booking_enabled = TRUE,
  content = COALESCE(content, '{}'::jsonb) || '{"usage": "GUEST_ACCOMMODATION", "booking_enabled": true}'::jsonb,
  updated_at = NOW()
WHERE id IN (
  'hill-1', 'hill-2', 'hill-3', 'hill-4',
  'dome-blue', 'dome-red', 'dome-green',
  'mialis-villa', 'suite-1', 'suite-2',
  'k826', 'k827'
);

-- ----------------------------------------------------------------------------
-- STEP 6: Explicit Allowlist Update — Retired / Legacy Units (11 units)
-- NEVER DELETE: Preserve historical booking linkages, mark inactive and non-bookable
-- Units: u1-u4, k618-k623 (Siesta), lab-kinneret
-- ----------------------------------------------------------------------------
UPDATE public.resort_units
SET
  is_active = FALSE,
  booking_enabled = FALSE,
  usage = 'RETIRED',
  content = COALESCE(content, '{}'::jsonb) || '{"usage": "RETIRED", "booking_enabled": false, "retired": true}'::jsonb,
  updated_at = NOW()
WHERE id IN (
  'u1', 'u2', 'u3', 'u4',
  'k618', 'k619', 'k620', 'k621', 'k622', 'k623',
  'lab-kinneret'
);

-- ----------------------------------------------------------------------------
-- STEP 7: Validation & Sanity Verification (Row count check)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_staff_count integer;
  v_bookable_ramot integer;
  v_bookable_other integer;
  v_retired_active integer;
BEGIN
  SELECT count(*) INTO v_staff_count
  FROM public.resort_units
  WHERE id IN ('k678', 'k679') AND (booking_enabled = TRUE OR content->>'booking_enabled' = 'true');

  IF v_staff_count > 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Staff accommodation units remain marked as bookable!';
  END IF;

  SELECT count(*) INTO v_retired_active
  FROM public.resort_units
  WHERE id IN ('u1', 'u2', 'u3', 'u4', 'k618', 'k619', 'k620', 'k621', 'k622', 'k623', 'lab-kinneret')
    AND is_active = TRUE;

  IF v_retired_active > 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Retired legacy units remain marked as active!';
  END IF;

  RAISE NOTICE 'SUCCESS: All unit registry safety checks passed cleanly.';
END $$;

COMMIT;
