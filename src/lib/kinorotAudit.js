/** Pure Kinorot audit helpers — no I/O. */

const SECRET_KEY = /pass(word)?|token|secret|cookie|authorization|api[_-]?key|csrf|session|jar|credential/i;
const SNAPSHOT_KEYS = [
  "guestname",
  "checkin",
  "checkout",
  "unit[]",
  "price[]",
  "note",
  "res",
  "status",
  "adults",
  "childs",
  "phone",
  "email"
];

export function fieldsToObject(fields) {
  const out = {};
  for (const entry of fields || []) {
    const name = Array.isArray(entry) ? entry[0] : entry?.name;
    const value = Array.isArray(entry) ? entry[1] : entry?.value;
    if (!name) continue;
    if (Object.prototype.hasOwnProperty.call(out, name)) {
      const prev = out[name];
      out[name] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      out[name] = value;
    }
  }
  return out;
}

export function pickSnapshotFields(raw) {
  if (!raw || typeof raw !== "object") return {};
  const src = Array.isArray(raw) ? fieldsToObject(raw) : raw;
  const out = {};
  for (const key of SNAPSHOT_KEYS) {
    if (src[key] == null || src[key] === "") continue;
    out[key] = src[key];
  }
  // Also keep explicit booking-row style keys when present
  for (const key of ["guest_name", "check_in_date", "check_out_date", "unit_id", "total_price_agorot", "booking_status", "special_requests"]) {
    if (src[key] == null || src[key] === "") continue;
    out[key] = src[key];
  }
  return out;
}

export function stripSecrets(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (typeof value !== "object") return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = stripSecrets(nested);
  }
  return out;
}

export function fieldDiff(before, after) {
  const a = pickSnapshotFields(before || {});
  const b = pickSnapshotFields(after || {});
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = [];
  for (const key of [...keys].sort()) {
    const from = a[key] ?? null;
    const to = b[key] ?? null;
    const left = normalizeComparable(from);
    const right = normalizeComparable(to);
    if (left === right) continue;
    changes.push({ field: key, from, to });
  }
  return changes;
}

function normalizeComparable(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).join("|");
  return String(value).replace(/\s+/g, " ").trim();
}

export function kinorotResIdFromBookingId(bookingId) {
  const match = String(bookingId || "").match(/_(\d+)$/);
  return match ? match[1] : "";
}

export function classifySyncAction(changeKind, fields = []) {
  if (changeKind === "removed" || changeKind === "cancel") return "cancel";
  if (changeKind === "created") return "create";
  const names = new Set((fields || []).map((item) => item.field || item));
  if (names.has("unit") || names.has("unit_id") || names.has("unit[]")) return "move";
  if (names.has("check_in") || names.has("check_out") || names.has("checkin") || names.has("checkout")) {
    const cout = (fields || []).find((item) => item.field === "check_out" || item.field === "checkout");
    if (cout && String(cout.to || "").localeCompare(String(cout.from || "")) < 0) return "shorten";
    return "status";
  }
  if (names.has("note") || names.has("special_requests")) return "note";
  if (names.has("booking_status") || names.has("status")) return "status";
  return "status";
}

/**
 * Decide whether a sync-observed change should be logged as kinorot_external.
 * recentWrites: [{ kinorot_res_id, action, ts }] from our audit log.
 */
export function shouldLogExternalChange({
  change,
  changeKind,
  recentWrites = [],
  now = Date.now(),
  windowMs = 10 * 60 * 1000
} = {}) {
  if (!change) return false;
  const resId = String(change.kinorot_res_id || kinorotResIdFromBookingId(change.id) || "").trim();
  if (!resId && changeKind !== "created") return false;
  const cutoff = now - windowMs;
  const ours = (recentWrites || []).some((row) => {
    if (String(row.actor || "") === "kinorot_external") return false;
    const ts = Date.parse(row.ts || row.created_at || "");
    if (!Number.isFinite(ts) || ts < cutoff) return false;
    const rowRes = String(row.kinorot_res_id || kinorotResIdFromBookingId(row.booking_id) || "").trim();
    if (resId && rowRes && rowRes !== resId) return false;
    if (resId && !rowRes) return false;
    return true;
  });
  return !ours;
}

export function externalAuditRowsFromDiff({
  changes,
  recentWrites = [],
  now = new Date(),
  windowMs = 10 * 60 * 1000
} = {}) {
  const ts = now instanceof Date ? now.toISOString() : String(now);
  const epoch = Date.parse(ts);
  const rows = [];
  const push = (kind, item) => {
    const candidate = {
      ...item,
      kinorot_res_id: kinorotResIdFromBookingId(item.id)
    };
    if (!shouldLogExternalChange({
      change: candidate,
      changeKind: kind,
      recentWrites,
      now: epoch,
      windowMs
    })) return;
    const action = classifySyncAction(kind, item.fields);
    rows.push({
      ts,
      actor: "kinorot_external",
      source: "syncKinorotCalendar",
      kinorot_res_id: candidate.kinorot_res_id || null,
      booking_id: item.id || null,
      action,
      guest_name: item.guest_name || null,
      unit_id: item.unit_id || null,
      check_in_date: item.check_in_date || null,
      check_out_date: item.check_out_date || null,
      request_diff: stripSecrets({
        kind,
        fields: item.fields || (kind === "removed"
          ? [{ field: "booking_status", from: "CONFIRMED", to: "CANCELED" }]
          : [])
      }),
      response_status: null,
      response_location: null,
      success: true,
      error: null
    });
  };
  for (const item of changes?.created || []) push("created", item);
  for (const item of changes?.updated || []) push("updated", item);
  for (const item of changes?.removed || []) push("removed", item);
  return rows;
}

export function displayAuditRow(row, unitNameById = {}) {
  const guest = String(row?.guest_name || "").trim() || "אורח";
  const unit = unitNameById[row?.unit_id] || row?.unit_name || "";
  const cin = String(row?.check_in_date || "").slice(0, 10);
  const cout = String(row?.check_out_date || "").slice(0, 10);
  const dates = cin && cout ? `${cin} → ${cout}` : cin || cout || "";
  return {
    ts: row?.ts || row?.created_at || null,
    actor: row?.actor || "",
    action: row?.action || "",
    guest_name: guest,
    unit_name: unit,
    dates,
    success: row?.success !== false,
    error: row?.error || null,
    source: row?.source || null
  };
}
