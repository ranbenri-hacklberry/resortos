import { stripSecrets } from "../src/lib/kinorotAudit.js";

function supabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const key = serviceKey();
  if (!key) {
    const err = new Error("KINOROT_AUDIT_NO_SERVICE_KEY");
    err.code = "KINOROT_AUDIT_NO_SERVICE_KEY";
    throw err;
  }
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation"
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const err = new Error(`KINOROT_AUDIT_HTTP_${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

export function normalizeAuditRow(row = {}) {
  return {
    ts: row.ts || row.created_at || new Date().toISOString(),
    actor: String(row.actor || "system").slice(0, 120),
    source: String(row.source || "").slice(0, 200) || null,
    kinorot_res_id: row.kinorot_res_id ? String(row.kinorot_res_id).slice(0, 40) : null,
    booking_id: row.booking_id ? String(row.booking_id).slice(0, 80) : null,
    action: String(row.action || "status").slice(0, 40),
    guest_name: row.guest_name ? String(row.guest_name).slice(0, 200) : null,
    unit_id: row.unit_id ? String(row.unit_id).slice(0, 40) : null,
    check_in_date: row.check_in_date ? String(row.check_in_date).slice(0, 10) : null,
    check_out_date: row.check_out_date ? String(row.check_out_date).slice(0, 10) : null,
    request_diff: stripSecrets(row.request_diff || row.diff || {}),
    before_snapshot: stripSecrets(row.before_snapshot || null),
    after_snapshot: stripSecrets(row.after_snapshot || null),
    response_status: row.response_status == null ? null : Number(row.response_status) || null,
    response_location: row.response_location ? String(row.response_location).slice(0, 500) : null,
    success: row.success !== false,
    error: row.error ? String(row.error).slice(0, 1000) : null
  };
}

/** Insert one or many audit rows. Never throws to caller — logs loudly instead. */
export async function insertKinorotAudit(rows) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(normalizeAuditRow);
  if (!list.length) return { ok: true, inserted: 0 };
  try {
    const data = await rest("kinorot_audit_log", { method: "POST", body: list, prefer: "return=minimal" });
    return { ok: true, inserted: list.length, data };
  } catch (err) {
    console.error("[kinorot-audit] INSERT FAILED", err?.message || err, JSON.stringify(list.map((row) => ({
      actor: row.actor,
      action: row.action,
      kinorot_res_id: row.kinorot_res_id,
      booking_id: row.booking_id
    }))));
    return { ok: false, inserted: 0, error: String(err?.message || err) };
  }
}

export async function listKinorotAudit({ resId, bookingId, guestName, limit = 50 } = {}) {
  const caps = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const filters = ["select=*", "order=ts.desc", `limit=${caps}`];
  if (resId) filters.push(`kinorot_res_id=eq.${encodeURIComponent(String(resId))}`);
  if (bookingId) filters.push(`booking_id=eq.${encodeURIComponent(String(bookingId))}`);
  if (guestName) filters.push(`guest_name=ilike.${encodeURIComponent(`*${String(guestName).trim()}*`)}`);
  return rest(`kinorot_audit_log?${filters.join("&")}`);
}

export async function recentOurWrites({ sinceIso, resIds = [] } = {}) {
  const since = sinceIso || new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const filters = [
    "select=ts,actor,action,kinorot_res_id,booking_id",
    `ts=gte.${encodeURIComponent(since)}`,
    "actor=neq.kinorot_external",
    "order=ts.desc",
    "limit=200"
  ];
  let rows = await rest(`kinorot_audit_log?${filters.join("&")}`);
  if (!Array.isArray(rows)) rows = [];
  if (resIds.length) {
    const wanted = new Set(resIds.map(String));
    rows = rows.filter((row) => wanted.has(String(row.kinorot_res_id || "")));
  }
  return rows;
}
