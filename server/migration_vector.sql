-- ============================================
-- Zoe Vector Search — pgvector Migration (FINAL)
-- Correct table names from actual schema
-- ============================================

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding columns to ALL domain tables
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. HNSW Indexes
CREATE INDEX IF NOT EXISTS idx_menu_embedding ON menu_items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_inventory_embedding ON inventory_items USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_tasks_embedding ON tasks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_embedding ON recurring_tasks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_recipes_embedding ON recipes USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 4. RPC: Search Menu Items
CREATE OR REPLACE FUNCTION search_menu(
    query_embedding vector(384), match_threshold float DEFAULT 0.45,
    match_count int DEFAULT 5, filter_business_id uuid DEFAULT NULL
) RETURNS TABLE (id int, name text, english_name text, category text, price numeric, description text, image_url text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT m.id, m.name, m.english_name, m.category, m.price, m.description, m.image_url,
           1 - (m.embedding <=> query_embedding) AS similarity
    FROM menu_items m
    WHERE m.embedding IS NOT NULL
        AND (filter_business_id IS NULL OR m.business_id = filter_business_id)
        AND 1 - (m.embedding <=> query_embedding) > match_threshold
    ORDER BY m.embedding <=> query_embedding LIMIT match_count;
END; $$;

-- 5. RPC: Search Inventory
CREATE OR REPLACE FUNCTION search_inventory(
    query_embedding vector(384), match_threshold float DEFAULT 0.45,
    match_count int DEFAULT 5, filter_business_id uuid DEFAULT NULL
) RETURNS TABLE (id bigint, item_name text, stock_level numeric, unit text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT i.id, i.item_name, i.stock_level, i.unit,
           1 - (i.embedding <=> query_embedding) AS similarity
    FROM inventory_items i
    WHERE i.embedding IS NOT NULL
        AND (filter_business_id IS NULL OR i.business_id = filter_business_id)
        AND 1 - (i.embedding <=> query_embedding) > match_threshold
    ORDER BY i.embedding <=> query_embedding LIMIT match_count;
END; $$;

-- 6. RPC: Search Tasks
CREATE OR REPLACE FUNCTION search_tasks(
    query_embedding vector(384), match_threshold float DEFAULT 0.45,
    match_count int DEFAULT 5, filter_business_id uuid DEFAULT NULL
) RETURNS TABLE (id bigint, title text, description text, status text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.title, t.description, t.status,
           1 - (t.embedding <=> query_embedding) AS similarity
    FROM tasks t
    WHERE t.embedding IS NOT NULL
        AND (filter_business_id IS NULL OR t.business_id = filter_business_id)
        AND 1 - (t.embedding <=> query_embedding) > match_threshold
    ORDER BY t.embedding <=> query_embedding LIMIT match_count;
END; $$;

-- 7. RPC: Search Recurring Tasks
CREATE OR REPLACE FUNCTION search_recurring_tasks(
    query_embedding vector(384), match_threshold float DEFAULT 0.45,
    match_count int DEFAULT 5, filter_business_id uuid DEFAULT NULL
) RETURNS TABLE (id bigint, name text, description text, category text, frequency text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, r.name, r.description, r.category, r.frequency,
           1 - (r.embedding <=> query_embedding) AS similarity
    FROM recurring_tasks r
    WHERE r.embedding IS NOT NULL
        AND (filter_business_id IS NULL OR r.business_id = filter_business_id)
        AND 1 - (r.embedding <=> query_embedding) > match_threshold
    ORDER BY r.embedding <=> query_embedding LIMIT match_count;
END; $$;

-- 8. RPC: Search Recipes
CREATE OR REPLACE FUNCTION search_recipes(
    query_embedding vector(384), match_threshold float DEFAULT 0.45,
    match_count int DEFAULT 5, filter_business_id uuid DEFAULT NULL
) RETURNS TABLE (id bigint, title text, description text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, r.title, r.description,
           1 - (r.embedding <=> query_embedding) AS similarity
    FROM recipes r
    WHERE r.embedding IS NOT NULL
        AND (filter_business_id IS NULL OR r.business_id = filter_business_id)
        AND 1 - (r.embedding <=> query_embedding) > match_threshold
    ORDER BY r.embedding <=> query_embedding LIMIT match_count;
END; $$;
