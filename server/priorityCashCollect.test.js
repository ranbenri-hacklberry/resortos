import test from "node:test";
import assert from "node:assert/strict";
import { buildPriorityCashPatch, sessionCollectorName } from "./priorityCashCollect.js";

function stay(overrides = {}) {
  return {
    id: "kin_1_1",
    guest_name: "בדיקה",
    tenant_id: "tenant-a",
    total_price_agorot: 50000,
    payment_status: "UNPAID",
    payment_mode: "",
    clearing_payments: [],
    ...overrides
  };
}

test("sessionCollectorName uses authenticated staff display name", () => {
  assert.equal(sessionCollectorName({ display_name: "ברק", username: "barak" }), "ברק");
});

test("buildPriorityCashPatch records collector from staff session only", () => {
  const built = buildPriorityCashPatch(stay(), {
    today: "2026-11-09",
    staffUser: { display_name: "ברק" },
    collectedAgorot: 50000
  });
  assert.equal(built.collector, "ברק");
  assert.equal(built.patch.cash_collected_by, "ברק");
  assert.equal(built.patch.clearing_payments[0].collector, "ברק");
  assert.equal(built.patch.payment_status, "PAID");
});

test("buildPriorityCashPatch rejects a missing booking", () => {
  assert.throws(() => buildPriorityCashPatch(null, { staffUser: { name: "רני" } }), /BOOKING/);
});
