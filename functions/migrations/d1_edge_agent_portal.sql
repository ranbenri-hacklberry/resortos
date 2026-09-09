-- Edge-first agent portal (hotelos-stay). Studio Postgres stays outbound-only.

CREATE TABLE IF NOT EXISTS edge_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  commission_rate REAL DEFAULT 0.10,
  is_active INTEGER DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_agents_phone
  ON edge_agents(phone);

CREATE TABLE IF NOT EXISTS edge_soft_locks (
  id TEXT PRIMARY KEY,
  cabin_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_soft_locks_lookup
  ON edge_soft_locks(cabin_id, start_date, end_date, expires_at);
