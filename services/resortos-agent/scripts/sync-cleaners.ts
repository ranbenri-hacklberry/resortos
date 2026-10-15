/**
 * Pulls field staff from the live ResortOS directory into data/cleaners.json.
 *
 *   RESORTOS_MANAGER_TOKEN=<manager session token> npm run sync-cleaners
 *
 * Source: GET /api/auth/staff-directory  (public.hotelos_staff_directory → employees.phone / whatsapp_phone)
 * Only HOUSEKEEPING / MAINTENANCE / GARDENING roles with a phone are imported.
 * Language is NOT stored in ResortOS: existing entries keep their language; new ones default to LANG_DEFAULT (he).
 * Review the result, in particular `language`, before starting the agent.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'data', 'cleaners.json');
const base = process.env.RESORTOS_URL ?? 'http://127.0.0.1:4038';
const token = process.env.RESORTOS_MANAGER_TOKEN;
const defLang = (process.env.LANG_DEFAULT ?? 'he') as 'he' | 'th' | 'ar';
const ROLES = new Set(['HOUSEKEEPING', 'MAINTENANCE', 'GARDENING']);

if (!token) throw new Error('Set RESORTOS_MANAGER_TOKEN (login via POST /api/auth/login)');

/** Israeli local numbers (05x…) → 9725x…; anything already international is kept as digits. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

const res = await fetch(`${base}/api/auth/staff-directory`, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`staff-directory -> HTTP ${res.status}`);
const { staff } = (await res.json()) as { staff: Array<{ id: string; display_name: string; role: string; phone: string; whatsapp_phone: string }> };

const existing: Array<{ phone: string; language: string }> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const langByPhone = new Map(existing.map((c) => [c.phone, c.language]));

const out = staff
  .filter((s) => ROLES.has(s.role))
  .map((s) => ({ phone: normalizePhone(s.whatsapp_phone || s.phone || ''), name: s.display_name, role: s.role, staff_id: s.id }))
  .filter((s) => s.phone.length >= 10)
  .map((s) => ({ ...s, language: langByPhone.get(s.phone) ?? defLang }));

writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${out.length} cleaners -> ${file} (skipped ${staff.length - out.length} without role/phone)`);
