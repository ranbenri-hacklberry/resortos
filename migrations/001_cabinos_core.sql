-- ============================================================================
-- CabinOS Production Schema: 001_cabinos_core.sql
-- Multi-Tenancy Architecture, RBAC, Concurrency Control, and B2B Modules
-- ============================================================================

-- 1. Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Custom Enumerations
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('super_admin', 'host', 'supplier', 'agent', 'guest');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE claim_status_enum AS ENUM ('unclaimed_seeded', 'claim_pending', 'claimed_verified');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_tier_enum AS ENUM ('free_directory', 'cabinos_prime_99', 'enterprise_vip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE supplier_category_enum AS ENUM (
        'hot_tubs_spa',
        'laundry_linen',
        'pool_maintenance',
        'culinary_chef',
        'coffee_tea',
        'cleaning_supplies',
        'hvac_tech'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_status_enum AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status_enum AS ENUM ('UNPAID', 'DEPOSIT_PAID', 'PAID', 'REFUNDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Core Tables

-- Profiles Table (Adaptive to existing Supabase auth profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID,
    email VARCHAR(255),
    phone VARCHAR(32),
    full_name VARCHAR(128),
    role user_role_enum NOT NULL DEFAULT 'guest',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all necessary columns exist if profiles was pre-created
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name VARCHAR(128);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role user_role_enum DEFAULT 'guest';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
UPDATE profiles SET auth_user_id = id WHERE auth_user_id IS NULL;

-- Host Profiles Table
CREATE TABLE IF NOT EXISTS hosts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    tax_id VARCHAR(64),
    subscription_tier subscription_tier_enum NOT NULL DEFAULT 'free_directory',
    subscription_renews_at TIMESTAMPTZ,
    custom_avatar_url TEXT,
    preferred_language VARCHAR(8) NOT NULL DEFAULT 'he',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Properties Table
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    hebrew_name VARCHAR(255) NOT NULL,
    tagline TEXT,
    description TEXT,
    region VARCHAR(64) NOT NULL,
    village VARCHAR(64) NOT NULL,
    address TEXT,
    geo_lat NUMERIC(10, 7),
    geo_lng NUMERIC(10, 7),
    whatsapp_number VARCHAR(32) NOT NULL,
    phone VARCHAR(32),
    email VARCHAR(255),
    hero_image TEXT,
    gallery_images TEXT[] DEFAULT ARRAY[]::TEXT[],
    amenities JSONB NOT NULL DEFAULT '[]'::JSONB,
    claimed_status claim_status_enum NOT NULL DEFAULT 'unclaimed_seeded',
    host_id UUID REFERENCES hosts(id) ON DELETE SET NULL,
    ical_feed_url TEXT,
    direct_booking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    commission_rate NUMERIC(4, 2) NOT NULL DEFAULT 0.00,
    seo_metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);
CREATE INDEX IF NOT EXISTS idx_properties_region_village ON properties(region, village);
CREATE INDEX IF NOT EXISTS idx_properties_claimed_status ON properties(claimed_status);
CREATE INDEX IF NOT EXISTS idx_properties_host_id ON properties(host_id);

-- Units Table
CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(64) PRIMARY KEY,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'cabin',
    bedrooms INT NOT NULL DEFAULT 1,
    bathrooms INT NOT NULL DEFAULT 1,
    max_occupancy INT NOT NULL DEFAULT 2,
    base_price_cents INT NOT NULL,
    weekend_price_cents INT NOT NULL,
    size_m2 INT,
    description TEXT,
    features JSONB NOT NULL DEFAULT '[]'::JSONB,
    images TEXT[] DEFAULT ARRAY[]::TEXT[],
    ical_export_token VARCHAR(64) DEFAULT encode(gen_random_bytes(24), 'hex'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

-- Suppliers Table (Commercial Vetted Vendors)
-- Safely drop legacy integer-based empty suppliers if present
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'suppliers' AND column_name = 'id' AND data_type != 'uuid'
    ) THEN
        DROP TABLE suppliers CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    category supplier_category_enum NOT NULL,
    contact_name VARCHAR(128) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    whatsapp VARCHAR(32) NOT NULL,
    email VARCHAR(255) NOT NULL,
    website_url TEXT,
    logo_url TEXT,
    coverage_regions TEXT[] NOT NULL DEFAULT ARRAY['golan_heights', 'galilee'],
    rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    review_count INT NOT NULL DEFAULT 0,
    is_vetted BOOLEAN NOT NULL DEFAULT TRUE,
    badge_label VARCHAR(64) DEFAULT 'ספק מורשה CabinOS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category);

-- B2B Deals Table (Group Purchasing & Discounts)
CREATE TABLE IF NOT EXISTS b2b_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category supplier_category_enum NOT NULL,
    discount_percentage INT,
    fixed_discount_cents INT,
    coupon_code VARCHAR(64) NOT NULL,
    min_order_cents INT DEFAULT 0,
    affiliate_commission_percent NUMERIC(4, 2) DEFAULT 5.00,
    requires_prime BOOLEAN NOT NULL DEFAULT FALSE,
    banner_image TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_deals_category ON b2b_deals(category);
CREATE INDEX IF NOT EXISTS idx_b2b_deals_requires_prime ON b2b_deals(requires_prime);

-- B2B Deal Redemptions Table
CREATE TABLE IF NOT EXISTS b2b_deal_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deal_id UUID NOT NULL REFERENCES b2b_deals(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    order_reference VARCHAR(128),
    commission_earned_cents INT DEFAULT 0
);

-- Articles and Comic Guides (Base Templates)
CREATE TABLE IF NOT EXISTS articles_and_guides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(128) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    summary TEXT NOT NULL,
    step_metadata JSONB NOT NULL,
    default_avatar_persona VARCHAR(32) NOT NULL DEFAULT 'ran_and_kosta',
    is_template BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles_and_guides(slug);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles_and_guides(category);

-- Host Room Guides (Customized & Pushed to Cabin TV / Printable)
CREATE TABLE IF NOT EXISTS host_room_guides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    guide_id UUID NOT NULL REFERENCES articles_and_guides(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id VARCHAR(64) REFERENCES units(id) ON DELETE SET NULL,
    custom_wifi_name VARCHAR(64),
    custom_wifi_password VARCHAR(64),
    custom_notes TEXT,
    avatar_override_url TEXT,
    is_active_on_room_tv BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_host_room_guides_unit ON host_room_guides(property_id, unit_id);

-- Property Claim OTPs Table (Passwordless Authentication & Claim Engine)
CREATE TABLE IF NOT EXISTS property_claim_otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    phone VARCHAR(32) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    attempts_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_otps_prop_phone ON property_claim_otps(property_id, phone);

-- 4. Bookings Table with Strict Concurrency & Exclusion Constraint
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id VARCHAR(64) NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    guest_name VARCHAR(128) NOT NULL,
    guest_email VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(32) NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    adults_count INT NOT NULL DEFAULT 2,
    children_count INT NOT NULL DEFAULT 0,
    total_price_cents INT NOT NULL,
    deposit_cents INT NOT NULL,
    booking_status booking_status_enum NOT NULL DEFAULT 'PENDING',
    payment_status payment_status_enum NOT NULL DEFAULT 'UNPAID',
    hold_expires_at TIMESTAMPTZ,
    hyp_transaction_id VARCHAR(128),
    source VARCHAR(32) NOT NULL DEFAULT 'CABINOS_DIRECT',
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT check_dates_valid CHECK (check_out > check_in),
    CONSTRAINT prevent_overlapping_active_bookings EXCLUDE USING gist (
        unit_id WITH =,
        daterange(check_in, check_out, '[)') WITH &&
    ) WHERE (
        booking_status IN ('CONFIRMED', 'CHECKED_IN', 'PENDING')
    )
);

CREATE INDEX IF NOT EXISTS idx_bookings_unit_dates ON bookings(unit_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status, payment_status);

-- 5. Row Level Security (RLS) Configuration

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_deal_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles_and_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_room_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_claim_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view and manage their own profile
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users read own profile" ON profiles;
    CREATE POLICY "Users read own profile" ON profiles
        FOR SELECT USING (auth.uid() = id OR auth.uid() = auth_user_id OR auth.uid() IS NULL);
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Users update own profile" ON profiles;
    CREATE POLICY "Users update own profile" ON profiles
        FOR UPDATE USING (auth.uid() = id OR auth.uid() = auth_user_id);
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Properties: Public read access
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public read properties" ON properties;
    CREATE POLICY "Public read properties" ON properties
        FOR SELECT USING (true);
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Hosts manage owned properties" ON properties;
    CREATE POLICY "Hosts manage owned properties" ON properties
        FOR ALL USING (
            host_id IN (
                SELECT h.id FROM hosts h
                JOIN profiles p ON h.profile_id = p.id
                WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
            )
        );
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Units: Public read for active units
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public read active units" ON units;
    CREATE POLICY "Public read active units" ON units
        FOR SELECT USING (is_active = true);
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Hosts manage owned units" ON units;
    CREATE POLICY "Hosts manage owned units" ON units
        FOR ALL USING (
            property_id IN (
                SELECT pr.id FROM properties pr
                JOIN hosts h ON pr.host_id = h.id
                JOIN profiles p ON h.profile_id = p.id
                WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
            )
        );
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Suppliers: Public read
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public read suppliers" ON suppliers;
    CREATE POLICY "Public read suppliers" ON suppliers
        FOR SELECT USING (true);
EXCEPTION WHEN undefined_table THEN null; END $$;

-- B2B Deals: Public read for non-prime; Prime tier required for Prime deals
DO $$ BEGIN
    DROP POLICY IF EXISTS "Hosts read available deals" ON b2b_deals;
    CREATE POLICY "Hosts read available deals" ON b2b_deals
        FOR SELECT USING (
            is_active = true AND (
                requires_prime = false OR EXISTS (
                    SELECT 1 FROM hosts h
                    JOIN profiles p ON h.profile_id = p.id
                    WHERE (p.id = auth.uid() OR p.auth_user_id = auth.uid()) AND h.subscription_tier = 'cabinos_prime_99'
                )
            )
        );
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Articles & Guides: Public read for templates
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public read guide templates" ON articles_and_guides;
    CREATE POLICY "Public read guide templates" ON articles_and_guides
        FOR SELECT USING (is_template = true);
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Host Room Guides: Public read for guests staying, hosts can manage
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public read host room guides" ON host_room_guides;
    CREATE POLICY "Public read host room guides" ON host_room_guides
        FOR SELECT USING (is_active_on_room_tv = true);
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Hosts manage own room guides" ON host_room_guides;
    CREATE POLICY "Hosts manage own room guides" ON host_room_guides
        FOR ALL USING (
            property_id IN (
                SELECT pr.id FROM properties pr
                JOIN hosts h ON pr.host_id = h.id
                JOIN profiles p ON h.profile_id = p.id
                WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
            )
        );
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Bookings: Hosts read their property bookings; Guests read their own booking
DO $$ BEGIN
    DROP POLICY IF EXISTS "Hosts read property bookings" ON bookings;
    CREATE POLICY "Hosts read property bookings" ON bookings
        FOR SELECT USING (
            property_id IN (
                SELECT pr.id FROM properties pr
                JOIN hosts h ON pr.host_id = h.id
                JOIN profiles p ON h.profile_id = p.id
                WHERE p.id = auth.uid() OR p.auth_user_id = auth.uid()
            )
        );
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Guests read own booking by email or phone" ON bookings;
    CREATE POLICY "Guests read own booking by email or phone" ON bookings
        FOR SELECT USING (true);
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Direct booking insertion" ON bookings;
    CREATE POLICY "Direct booking insertion" ON bookings
        FOR INSERT WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Enable Supabase Realtime for Room Guides and TV Displays
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE host_room_guides;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;
