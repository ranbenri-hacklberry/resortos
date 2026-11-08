/**
 * Managed Storage for Cardcom Manual Terminal (184288) Deals and Matches.
 *
 * Replaces manual JSON files (data/cardcom-seen-deals.json, data/cardcom-pending-matches.json).
 * Automatically migrates existing items from those files if present on disk.
 *
 * Stores in Supabase PostgREST tables:
 * - cardcom_seen_deals
 * - cardcom_pending_matches
 * With fallback to hotelos_runtime_settings and managed local backup.
 *
 * Rule: Secrets must NEVER be printed to logs.
 * Rule: Dry-run must write nothing, including the local cache.
 * Rule: When Supabase is unavailable, load local backup instead of overwriting it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const LEGACY_SEEN_FILE = path.join(DATA_DIR, 'cardcom-seen-deals.json');
const LEGACY_PENDING_FILE = path.join(DATA_DIR, 'cardcom-pending-matches.json');
const MANAGED_CACHE_FILE = path.join(DATA_DIR, 'cardcom-terminal-storage.json');

export class CardcomStorage {
  constructor({ supabaseUrl, supabaseKey, fetchImpl = fetch, dryRun = false, readOnly = false, enableDiskCache = true, cacheFilePath = MANAGED_CACHE_FILE } = {}) {
    this.supabaseUrl = (supabaseUrl || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    this.supabaseKey = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    this.fetchImpl = fetchImpl;
    this.dryRun = Boolean(dryRun || readOnly);
    this.readOnly = this.dryRun;
    this.enableDiskCache = Boolean(enableDiskCache);
    this.cacheFilePath = cacheFilePath || MANAGED_CACHE_FILE;
    this.seenDeals = new Map(); // deal_id -> dealObj
    this.pendingMatches = new Map(); // deal_id -> matchObj
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // 1. Ingest legacy files if present (in memory)
    if (this.enableDiskCache) {
      this._migrateLegacyFiles();
    }

    // 2. Load from Supabase if configured, with graceful fallback to local cache
    let remoteLoaded = false;
    if (this.supabaseUrl && this.supabaseKey) {
      remoteLoaded = await this._loadFromSupabase();
    }

    if (!remoteLoaded) {
      this._loadFromLocalCache();
    } else if (!this.dryRun) {
      // Remote load succeeded, update local backup
      this._saveToLocalCache();
    }

    this.initialized = true;
  }

  _migrateLegacyFiles() {
    try {
      if (fs.existsSync(LEGACY_SEEN_FILE)) {
        const raw = fs.readFileSync(LEGACY_SEEN_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            const id = String(item.deal_id || item.dealId || '').trim();
            if (id) this.seenDeals.set(id, { ...item, deal_id: id });
          }
        }
      }
    } catch (err) {
      console.warn('[CardcomStorage] Notice: Legacy seen deals ingest skipped:', err?.message || 'unknown');
    }

    try {
      if (fs.existsSync(LEGACY_PENDING_FILE)) {
        const raw = fs.readFileSync(LEGACY_PENDING_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            const id = String(item.deal_id || item.dealId || '').trim();
            if (id) this.pendingMatches.set(id, { ...item, deal_id: id });
          }
        }
      }
    } catch (err) {
      console.warn('[CardcomStorage] Notice: Legacy pending matches ingest skipped:', err?.message || 'unknown');
    }
  }

  _loadFromLocalCache() {
    if (!this.enableDiskCache) return false;
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.seenDeals)) {
          for (const d of data.seenDeals) {
            if (d?.deal_id) this.seenDeals.set(String(d.deal_id), d);
          }
        }
        if (Array.isArray(data.pendingMatches)) {
          for (const m of data.pendingMatches) {
            if (m?.deal_id) this.pendingMatches.set(String(m.deal_id), m);
          }
        }
        return true;
      }
    } catch (_) {}
    return false;
  }

  _saveToLocalCache() {
    if (this.dryRun || this.readOnly || !this.enableDiskCache) return;
    try {
      const dir = path.dirname(this.cacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        updatedAt: new Date().toISOString(),
        seenDeals: Array.from(this.seenDeals.values()),
        pendingMatches: Array.from(this.pendingMatches.values())
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[CardcomStorage] Cache write warning:', err?.message || 'unknown');
    }
  }

  async _loadFromSupabase() {
    const headers = {
      apikey: this.supabaseKey,
      authorization: `Bearer ${this.supabaseKey}`
    };

    let dedicatedLoaded = false;
    try {
      const [seenRes, pendingRes] = await Promise.all([
        this.fetchImpl(`${this.supabaseUrl}/rest/v1/cardcom_seen_deals?select=*`, { headers }),
        this.fetchImpl(`${this.supabaseUrl}/rest/v1/cardcom_pending_matches?select=*`, { headers })
      ]);

      if (seenRes.ok && pendingRes.ok) {
        const seenRows = await seenRes.json();
        const pendingRows = await pendingRes.json();
        if (Array.isArray(seenRows)) {
          for (const row of seenRows) {
            if (row?.deal_id) this.seenDeals.set(String(row.deal_id), row);
          }
        }
        if (Array.isArray(pendingRows)) {
          for (const row of pendingRows) {
            if (row?.deal_id) this.pendingMatches.set(String(row.deal_id), row);
          }
        }
        dedicatedLoaded = true;
      }
    } catch (_) {}

    // Fallback to runtime settings if dedicated tables not yet loaded
    if (!dedicatedLoaded) {
      try {
        const setRes = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/hotelos_runtime_settings?key=in.(cardcom_seen_deals,cardcom_pending_matches)&select=*`, { headers });
        if (setRes.ok) {
          const rows = await setRes.json();
          if (Array.isArray(rows) && rows.length > 0) {
            for (const r of rows) {
              if (r.key === 'cardcom_seen_deals' && r.value) {
                const list = JSON.parse(r.value);
                if (Array.isArray(list)) list.forEach((d) => d?.deal_id && this.seenDeals.set(String(d.deal_id), d));
              }
              if (r.key === 'cardcom_pending_matches' && r.value) {
                const list = JSON.parse(r.value);
                if (Array.isArray(list)) list.forEach((m) => m?.deal_id && this.pendingMatches.set(String(m.deal_id), m));
              }
            }
            return true;
          }
        }
      } catch (_) {}
    }

    return dedicatedLoaded;
  }

  hasSeenDeal(dealId) {
    return this.seenDeals.has(String(dealId));
  }

  getSeenDeals() {
    return Array.from(this.seenDeals.values());
  }

  getPendingMatches() {
    return Array.from(this.pendingMatches.values());
  }

  getActivePendingMatches() {
    return Array.from(this.pendingMatches.values()).filter((m) => m.status === 'pending');
  }

  addSeenDeal(dealObj) {
    const id = String(dealObj.deal_id || dealObj.dealId);
    this.seenDeals.set(id, {
      ...dealObj,
      deal_id: id,
      updated_at: new Date().toISOString()
    });
  }

  addPendingMatch(matchObj) {
    const id = String(matchObj.deal_id || matchObj.dealId);
    this.pendingMatches.set(id, {
      ...matchObj,
      deal_id: id,
      updated_at: new Date().toISOString()
    });
  }

  updateMatchStatus(dealId, status, extra = {}) {
    const id = String(dealId);
    const existing = this.pendingMatches.get(id);
    if (existing) {
      this.pendingMatches.set(id, {
        ...existing,
        ...extra,
        status,
        updated_at: new Date().toISOString()
      });
    }
    const seen = this.seenDeals.get(id);
    if (seen) {
      this.seenDeals.set(id, {
        ...seen,
        status,
        updated_at: new Date().toISOString()
      });
    }
  }

  async persist() {
    if (this.dryRun || this.readOnly) return;

    this._saveToLocalCache();

    if (!this.supabaseUrl || !this.supabaseKey) return;

    const headers = {
      apikey: this.supabaseKey,
      authorization: `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    };

    const seenList = Array.from(this.seenDeals.values());
    const pendingList = Array.from(this.pendingMatches.values());

    const writeErrors = [];

    // 1. Persist to dedicated tables (BOTH seen and pending)
    try {
      if (seenList.length > 0) {
        const sRes = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/cardcom_seen_deals`, {
          method: 'POST',
          headers,
          body: JSON.stringify(seenList)
        });
        if (!sRes.ok) {
          writeErrors.push(`cardcom_seen_deals returned ${sRes.status}`);
        }
      }
    } catch (err) {
      writeErrors.push(`cardcom_seen_deals exception: ${err?.message || 'unknown'}`);
    }

    try {
      if (pendingList.length > 0) {
        const pRes = await this.fetchImpl(`${this.supabaseUrl}/rest/v1/cardcom_pending_matches`, {
          method: 'POST',
          headers,
          body: JSON.stringify(pendingList)
        });
        if (!pRes.ok) {
          writeErrors.push(`cardcom_pending_matches returned ${pRes.status}`);
        }
      }
    } catch (err) {
      writeErrors.push(`cardcom_pending_matches exception: ${err?.message || 'unknown'}`);
    }

    // 2. Always maintain runtime settings sync for edge API consistency
    try {
      const [rsSeen, rsPending] = await Promise.all([
        this.fetchImpl(`${this.supabaseUrl}/rest/v1/hotelos_runtime_settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            key: 'cardcom_seen_deals',
            value: JSON.stringify(seenList),
            updated_at: new Date().toISOString()
          })
        }),
        this.fetchImpl(`${this.supabaseUrl}/rest/v1/hotelos_runtime_settings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            key: 'cardcom_pending_matches',
            value: JSON.stringify(pendingList),
            updated_at: new Date().toISOString()
          })
        })
      ]);
      if (!rsSeen.ok) writeErrors.push(`runtime_settings cardcom_seen_deals returned ${rsSeen.status}`);
      if (!rsPending.ok) writeErrors.push(`runtime_settings cardcom_pending_matches returned ${rsPending.status}`);
    } catch (err) {
      writeErrors.push(`runtime_settings exception: ${err?.message || 'unknown'}`);
    }

    if (writeErrors.length > 0) {
      const msg = `CardcomStorage.persist failed: ${writeErrors.join('; ')}`;
      console.error('[CardcomStorage]', msg);
      throw new Error(msg);
    }
  }
}
