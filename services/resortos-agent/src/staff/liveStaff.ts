import { config, loadCleaners, type CleanerProfile, type Lang } from '../config.js';
import { normalizePhoneTail } from '../pipeline.js';

export interface LiveStaff {
  id: string;
  name: string;
  role: string;
  phones: string[];
  crew_lead_name?: string;
}

const BRIDGE = (process.env.HOTELOS_BRIDGE_URL || config.resortos.baseUrl || 'http://127.0.0.1:4038').replace(/\/$/, '');

let cache: CleanerProfile[] | null = null;

function digits(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = `972${d.slice(1)}`;
  return d;
}

/** File identities keep their language and WhatsApp LIDs. Role and name come from the employee row. */
export function applyLiveRoles(file: CleanerProfile[], live: LiveStaff[]): CleanerProfile[] {
  const byTail = new Map<string, LiveStaff>();
  const byName = new Map<string, LiveStaff>();
  for (const row of live) {
    if (!row?.name || !row.role) continue;
    byName.set(row.name.trim(), row);
    for (const phone of row.phones || []) {
      const international = digits(phone);
      const tail = normalizePhoneTail(international);
      if (international) byTail.set(international, row);
      if (tail) byTail.set(tail, row);
    }
  }
  const seen = new Set<string>();
  const merged = file.map((cleaner) => {
    const row = byTail.get(digits(cleaner.phone))
      || byTail.get(normalizePhoneTail(cleaner.phone))
      || byName.get(String(cleaner.name || '').trim());
    if (!row) return cleaner;
    seen.add(row.id);
    const recordsAs = String(row.crew_lead_name || '').trim();
    return {
      ...cleaner,
      name: row.name,
      role: row.role as CleanerProfile['role'],
      ...(recordsAs ? { recordsAs } : {}),
    };
  });
  for (const row of live) {
    if (!row?.id || seen.has(row.id) || !row.role || !row.name) continue;
    const phone = (row.phones || []).map(digits).find((value) => value.length >= 11);
    if (!phone) continue;
    seen.add(row.id);
    const recordsAs = String(row.crew_lead_name || '').trim();
    merged.push({
      phone,
      name: row.name,
      role: row.role as CleanerProfile['role'],
      language: 'he' as Lang,
      ...(recordsAs ? { recordsAs } : {}),
    });
  }
  return merged;
}

export function currentStaff(): CleanerProfile[] {
  return cache || loadCleaners();
}

/** Read employees from the studio bridge. A role change is visible on the next message. */
export async function refreshStaff(): Promise<CleanerProfile[]> {
  const file = loadCleaners();
  try {
    const response = await fetch(`${BRIDGE}/api/internal/staff`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as { staff?: LiveStaff[] };
    cache = applyLiveRoles(file, Array.isArray(data.staff) ? data.staff : []);
  } catch {
    cache = cache || file;
  }
  return cache;
}
