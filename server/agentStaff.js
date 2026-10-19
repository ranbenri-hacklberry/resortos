import { spawnSync } from 'node:child_process';

const QUERY = `
SELECT coalesce(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT id::text AS id,
         name,
         role,
         ARRAY_REMOVE(ARRAY[COALESCE(phone, ''), COALESCE(whatsapp_phone, '')], '') AS phones
  FROM public.employees
  WHERE COALESCE(is_active, true)
    AND role IS NOT NULL
    AND btrim(role) <> ''
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
  }));
}
