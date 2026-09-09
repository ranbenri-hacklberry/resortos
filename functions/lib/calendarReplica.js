export async function loadCalendarReplica(env) {
  if (!env?.STAY_DB) return null;
  try {
    const row = await env.STAY_DB.prepare('SELECT payload FROM guest_context WHERE id = ?1').bind('all').first();
    if (!row?.payload) return null;
    const packed = JSON.parse(row.payload);
    return packed && typeof packed === 'object' ? packed : null;
  } catch (_) {
    return null;
  }
}
