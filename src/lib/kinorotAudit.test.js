import { describe, expect, it } from "vitest";
import {
  classifySyncAction,
  displayAuditRow,
  externalAuditRowsFromDiff,
  fieldDiff,
  kinorotResIdFromBookingId,
  shouldLogExternalChange,
  stripSecrets
} from "./kinorotAudit.js";

describe("fieldDiff", () => {
  it("reports only changed snapshot fields", () => {
    const diff = fieldDiff(
      { guestname: "עומר", checkin: "07/11/2026", checkout: "09/11/2026", note: "שולם", password: "x" },
      { guestname: "עומר", checkin: "07/11/2026", checkout: "08/11/2026", note: "שולם + פיצוי", password: "y" }
    );
    expect(diff.map((row) => row.field).sort()).toEqual(["checkout", "note"]);
    expect(diff.find((row) => row.field === "checkout")).toEqual({
      field: "checkout",
      from: "09/11/2026",
      to: "08/11/2026"
    });
  });
});

describe("stripSecrets", () => {
  it("redacts password/token/cookie keys nested anywhere", () => {
    const cleaned = stripSecrets({
      guestname: "עומר",
      password: "secret",
      headers: { Authorization: "Bearer abc", Referer: "https://app.kinorotgo.co.il" },
      jar: { cookies: ["a=b"] },
      nested: { api_key: "k", note: "ok" }
    });
    expect(cleaned.guestname).toBe("עומר");
    expect(cleaned.password).toBe("[redacted]");
    expect(cleaned.headers.Authorization).toBe("[redacted]");
    expect(cleaned.headers.Referer).toBe("https://app.kinorotgo.co.il");
    expect(cleaned.jar).toBe("[redacted]");
    expect(cleaned.nested.api_key).toBe("[redacted]");
    expect(cleaned.nested.note).toBe("ok");
  });
});

describe("Omer external cancel detection", () => {
  const omer = {
    id: "kin_694_75962",
    unit_id: "k685",
    guest_name: "עומר שיבלי",
    check_in_date: "2026-11-07",
    check_out_date: "2026-11-09"
  };

  it("logs external cancel when booking present 14:11, gone 14:16, no our write", () => {
    const at1416 = Date.parse("2026-11-08T14:16:00+02:00");
    expect(shouldLogExternalChange({
      change: omer,
      changeKind: "removed",
      recentWrites: [],
      now: at1416
    })).toBe(true);

    const rows = externalAuditRowsFromDiff({
      changes: { created: [], updated: [], removed: [omer] },
      recentWrites: [],
      now: new Date("2026-11-08T14:16:00+02:00")
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: "kinorot_external",
      action: "cancel",
      kinorot_res_id: "75962",
      booking_id: "kin_694_75962",
      guest_name: "עומר שיבלי",
      success: true
    });
  });

  it("does not log external when we wrote within ~10 minutes", () => {
    const at1416 = Date.parse("2026-11-08T14:16:00+02:00");
    expect(shouldLogExternalChange({
      change: omer,
      changeKind: "removed",
      recentWrites: [{
        actor: "natasha",
        kinorot_res_id: "75962",
        action: "shorten",
        ts: "2026-11-08T14:12:00+02:00"
      }],
      now: at1416
    })).toBe(false);
  });

  it("still logs external when a write exists for a different reservation", () => {
    const at1416 = Date.parse("2026-11-08T14:16:00+02:00");
    expect(shouldLogExternalChange({
      change: omer,
      changeKind: "removed",
      recentWrites: [{
        actor: "natasha",
        kinorot_res_id: "11111",
        action: "note",
        ts: "2026-11-08T14:12:00+02:00"
      }],
      now: at1416
    })).toBe(true);
  });
});

describe("classify + display", () => {
  it("maps res id and hides internal ids in display", () => {
    expect(kinorotResIdFromBookingId("kin_694_75962")).toBe("75962");
    expect(classifySyncAction("removed")).toBe("cancel");
    expect(classifySyncAction("updated", [{ field: "unit", from: "k685", to: "k686" }])).toBe("move");
    const shown = displayAuditRow({
      actor: "kinorot_external",
      action: "cancel",
      guest_name: "עומר שיבלי",
      unit_id: "k685",
      check_in_date: "2026-11-07",
      check_out_date: "2026-11-09",
      booking_id: "kin_694_75962",
      ts: "2026-11-08T14:16:00+02:00"
    }, { k685: "Ⓑ28 נופים בלבן · בקתה 1" });
    expect(shown.guest_name).toBe("עומר שיבלי");
    expect(shown.unit_name).toContain("נופים בלבן");
    expect(JSON.stringify(shown)).not.toMatch(/kin_694/);
  });
});
