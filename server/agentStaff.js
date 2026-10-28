import { spawnSync } from 'node:child_process';

const QUERY = `
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT e.id::text AS id,
         e.name,
         e.role,
         ARRAY_REMOVE(ARRAY[COALESCE(e.phone, ''), COALESCE(e.whatsapp_phone, '')], '') AS phones,
         COALESCE(lead.name, '') AS crew_lead_name,
         COALESCE(e.allowed_units, '[]'::jsonb) AS allowed_units
  FROM public.employees e
  LEFT JOIN public.employees lead ON lead.id = e.crew_lead_id
  WHERE COALESCE(e.is_active, true)
    AND e.role IS NOT NULL
    AND btrim(e.role) <> ''
) t;
`;

/** Active employees, including the role the agent should honor. */
export function listAgentStaff() {
  const env = {
    ...process.env,
    PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin'}`,
    PGPASSWORD: process.env.PGPASSWORD || 'postgres',
  };
  const result = spawnSync(
    '/opt/homebrew/bin/psql',
    ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54322', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', QUERY],
    { env, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    const error = new Error(String(result.stderr || 'staff query failed').trim());
    error.status = 503;
    throw error;
  }
  const rows = JSON.parse(String(result.stdout || '[]').trim() || '[]');
  return rows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    role: String(row.role || ''),
    phones: Array.isArray(row.phones) ? row.phones.map((phone) => String(phone || '')).filter(Boolean) : [],
    crew_lead_name: String(row.crew_lead_name || ''),
    // Ran 2026-10-28: per-user visible units (read-only). [] = sees everything.
    allowed_units: Array.isArray(row.allowed_units) ? row.allowed_units.map((u) => String(u || '')).filter(Boolean) : [],
  }));
}
