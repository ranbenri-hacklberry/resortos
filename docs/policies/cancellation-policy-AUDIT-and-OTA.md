# Cancellation policy — audit + OTA (written for v1.0.0-draft; v1.1.0-draft: final tiers approved, calendar days 15:00 Asia/Jerusalem, no gap, no-show 100%; legal review REQUIRED)

## Audit (2026-10-21)
- No existing cancellation-policy table, setting, or versioning anywhere (src, server, functions, migrations, supabase, Chloe services/resortos-agent incl. guestKnowledge.ts, public/price-list.html).
- Only existing guest-facing wording: i18n `GUEST_TERMS_5` ("שינוי או ביטול נעשים בטלפון מול המלון...") — procedural, no fee tiers. Not changed.
- bookings has `booking_status='CANCELED'` + `cancellation_reason` only; no policy reference.
- Check-in hour: per booking via `stayHoursFromBooking`, default 15:00; `israelDateTime()` in src/lib/stayAccess.js handles Asia/Jerusalem DST.
- Document library: the only existing one is Priority "Word" docs — `GET/PUT /api/priority/docs` (requireManagerStaff) backed by `data/priority-docs.json` (flat list, HTML, max 40, no categories/files). `src/components/Documents.jsx` is only a text->PDF generator.

## Gaps needing approval
1. 24–48h window: proposal A = 70%, proposal B = 100%. Code returns REQUIRES_MANAGER_APPROVAL, never charges.
2. Day counting: draft uses elapsed 24h blocks before decisive arrival (15 days = 360h). Alternative: calendar days. Across DST, wall-clock "2 days" can be 47h/49h.
3. Decisive arrival: booking check-in hour, default 15:00 Asia/Jerusalem.
4. Boundaries (draft): exactly 15d → 0%; exactly 8d → 20%; between 7–8d → 70%; exactly 48h → 70%; exactly 24h → 100%.
5. No-show / cancellation after arrival time: undefined.
6. War/pandemic: legal wording pending; always manual.
7. Non-refundable −10%: disabled, separate approval.
8. Legacy bookings: no pinned version → no automatic policy. Pinning needs migration 004 (NOT run).

## OTA fit
Booking.com: standard policies = free cancellation until X days/hours, then ONE penalty (first night, 50% or 100% of total); non-refundable rate plan separate. Deadline counted to 00:00 of arrival day (not 15:00). → 4 tiers (0/20/70/100) CANNOT be represented exactly. Closest: free until 15 days then 100%/50%; free until 8 days then 50%; free until 2 days then 100%. All differ from the 20%/70% steps.
Airbnb (stays <28 nights): Flexible (24h), Moderate (5d), Limited (full refund ≥14d, 50% 7–14d, 100% <7d), Firm (full ≥30d, 50% 7–30d, 100% <7d); Strict retired/invite only; plus 24h-after-booking free window if ≥7 days before; optional non-refundable (~10% off). → CANNOT be represented exactly. Closest: Limited (differs: free from 14 not 15 days; 50% instead of 20% at 8–14; 100% instead of 70% at 2–7).
No option was selected.
