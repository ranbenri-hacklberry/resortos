-- ============================================================================
-- ResortOS Migration: 002_crm_funnel_and_visibility.sql
-- Lead Seeding, Strict Visibility Rules, CRM Funnel & Zero-Leakage Public View
-- ============================================================================

-- 1. Create crm_status_enum
DO $$ BEGIN
    CREATE TYPE crm_status_enum AS ENUM (
        'Lead_Identified',      -- Initial scraped lead, not yet contacted
        'Portal_Free_Active',   -- Host approved free directory listing
        'Upsell_Pitch_Sent',    -- Sent 99₪ ResortOS Prime pitch
        'Verified_Subscriber',  -- Paying subscriber
        'Opt_Out'               -- Requested removal - do not contact
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Alter properties table with CRM and Visibility columns
ALTER TABLE properties
    ADD COLUMN IF NOT EXISTS crm_status crm_status_enum NOT NULL DEFAULT 'Lead_Identified',
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reference_image_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'weekend_scrape',
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS first_touch_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS property_public_path TEXT;

-- 3. Make hero_image nullable for unverified / seeded properties without licensed photos
ALTER TABLE properties ALTER COLUMN hero_image DROP NOT NULL;

-- 4. High-Performance Partial Composite Index
-- Only indexes public & non-opt-out records to keep marketplace queries blazing fast
CREATE INDEX IF NOT EXISTS idx_properties_public_active
    ON properties (region, village)
    WHERE is_public = TRUE AND crm_status != 'Opt_Out';

CREATE INDEX IF NOT EXISTS idx_properties_crm_status
    ON properties (crm_status);

CREATE INDEX IF NOT EXISTS idx_properties_source
    ON properties (source);

-- 5. Zero-Leakage Secure Public View
-- Guarantees reference_image_urls and internal CRM tracking columns are NEVER exposed
CREATE OR REPLACE VIEW public_properties AS
SELECT
    p.id,
    p.slug,
    p.name,
    p.hebrew_name,
    p.tagline,
    p.description,
    p.region,
    p.village,
    p.address,
    p.geo_lat,
    p.geo_lng,
    p.whatsapp_number,
    p.phone,
    p.email,
    p.hero_image,
    p.gallery_images,
    p.amenities,
    p.claimed_status,
    p.direct_booking_enabled,
    p.property_public_path,
    p.created_at,
    p.updated_at
FROM properties p
WHERE p.is_public = TRUE
  AND p.crm_status != 'Opt_Out';

-- Grant access to public view
GRANT SELECT ON public_properties TO anon, authenticated, service_role;

-- 6. Ensure existing 12 flagship demo resorts remain public and active
UPDATE properties
SET
    is_public = TRUE,
    crm_status = CASE
        WHEN claimed_status = 'claimed_verified' THEN 'Verified_Subscriber'::crm_status_enum
        ELSE 'Portal_Free_Active'::crm_status_enum
    END
WHERE slug IN (
    'mialees', 'toscana', 'nurit', 'taj', 'sagiv', 'halom',
    'peleg', 'kinorot', 'beahava', 'adanim', 'pina', 'view'
);
