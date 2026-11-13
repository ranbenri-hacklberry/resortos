import { fieldDiff, pickSnapshotFields, stripSecrets } from "../src/lib/kinorotAudit.js";
import { insertKinorotAudit } from "./kinorotAuditLog.js";

/**
 * Single entry for Kinorot writes.
 * Snapshots before/after, runs the write, inserts an audit row.
 * Audit failures never swallow or block the write result.
 */
export async function kinorotWrite({
  action,
  actor = "system",
  source = "kinorotWrite",
  kinorotResId = null,
  bookingId = null,
  guestName = null,
  unitId = null,
  checkInDate = null,
  checkOutDate = null,
  snapshotBefore = null,
  write,
  snapshotAfter = null
} = {}) {
  if (typeof write !== "function") throw new Error("kinorotWrite requires write()");

  let before = null;
  try {
    before = typeof snapshotBefore === "function" ? await snapshotBefore() : snapshotBefore;
  } catch (err) {
    console.warn("[kinorot-audit] before-snapshot failed:", err?.message || err);
  }

  let result;
  let writeError = null;
  try {
    result = await write({ before });
  } catch (err) {
    writeError = err;
  }

  let after = null;
  if (!writeError && snapshotAfter) {
    try {
      after = typeof snapshotAfter === "function" ? await snapshotAfter(result) : snapshotAfter;
    } catch (err) {
      console.warn("[kinorot-audit] after-snapshot failed:", err?.message || err);
    }
  }

  const responseStatus = result?.status ?? result?.response_status ?? (writeError ? (writeError.status || 500) : 200);
  const responseLocation = result?.location ?? result?.response_location ?? null;
  const resolvedResId = String(
    kinorotResId
    || result?.resId
    || result?.kinorot_res_id
    || pickSnapshotFields(after || {}).res
    || ""
  ).trim() || null;

  const auditPromise = insertKinorotAudit({
    actor,
    source,
    kinorot_res_id: resolvedResId,
    booking_id: bookingId || (resolvedResId ? null : null),
    action: action || "status",
    guest_name: guestName || pickSnapshotFields(after || before || {}).guestname || pickSnapshotFields(after || before || {}).guest_name || null,
    unit_id: unitId || null,
    check_in_date: checkInDate || null,
    check_out_date: checkOutDate || null,
    request_diff: stripSecrets({
      fields: fieldDiff(before, after),
      request: pickSnapshotFields(result?.requestFields || {})
    }),
    before_snapshot: pickSnapshotFields(before || {}),
    after_snapshot: pickSnapshotFields(after || {}),
    response_status: responseStatus,
    response_location: responseLocation,
    success: !writeError,
    error: writeError ? String(writeError.message || writeError) : null
  });
  // Fire-and-observe: never await-block the caller on audit latency beyond a short settle,
  // but still surface insert failures loudly inside insertKinorotAudit.
  auditPromise.catch((err) => console.error("[kinorot-audit] unexpected", err?.message || err));

  if (writeError) throw writeError;
  return result;
}
