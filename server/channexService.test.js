import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAvailabilityRanges,
  getChannexConfig,
  getIsraelTodayIso,
  mapChannexBookingToRow,
  shiftDateIso,
} from './channexService.js';

describe('Channex Service - configuration and dates', () => {
  it('loads configuration with expected defaults', () => {
    const cfg = getChannexConfig();
    assert.ok(cfg.officeUnitId === 'pilot-office');
    assert.ok(cfg.officeRoomTypeId);
    assert.ok(cfg.officeRatePlanId);
    assert.ok(cfg.propertyId);
  });

  it('shifts ISO dates correctly across month boundaries', () => {
    assert.equal(shiftDateIso('2026-10-31', 1), '2026-11-01');
    assert.equal(shiftDateIso('2026-11-01', -1), '2026-10-31');
    assert.equal(shiftDateIso('2026-11-10', 5), '2026-11-15');
  });

  it('returns valid Israel today date format YYYY-MM-DD', () => {
    const today = getIsraelTodayIso();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Channex Service - booking mapping', () => {
  const cfg = {
    tenantId: '22222222-2222-2222-2222-222222222222',
    officeUnitId: 'pilot-office',
  };

  it('maps an active Channex booking to hotelos_bookings row', () => {
    const rawBooking = {
      id: 'book-1234',
      attributes: {
        id: 'book-1234',
        status: 'confirmed',
        ota_name: 'Booking.com',
        amount: '450.00',
        arrival_date: '2026-11-10',
        departure_date: '2026-11-12',
        customer: {
          name: 'ישראל',
          surname: 'ישראלי',
          mail: 'israel@example.com',
          phone: '0501234567',
        },
        occupancy: {
          adults: 2,
          children: 1,
        },
        notes: 'Late check-in requested',
      },
    };

    const row = mapChannexBookingToRow(rawBooking, cfg);

    assert.equal(row.id, 'channex_book-1234');
    assert.equal(row.unit_id, 'pilot-office');
    assert.equal(row.tenant_id, '22222222-2222-2222-2222-222222222222');
    assert.equal(row.guest_name, 'ישראל ישראלי');
    assert.equal(row.guest_email, 'israel@example.com');
    assert.equal(row.guest_phone, '0501234567');
    assert.equal(row.check_in_date, '2026-11-10');
    assert.equal(row.check_out_date, '2026-11-12');
    assert.equal(row.adults_count, 2);
    assert.equal(row.children_count, 1);
    assert.equal(row.total_price_agorot, 45000);
    assert.equal(row.booking_status, 'CONFIRMED');
    assert.equal(row.channel_source, 'channex:Booking.com');
    assert.equal(row.special_requests, 'Late check-in requested');
  });

  it('maps a cancelled booking to CANCELED status', () => {
    const rawBooking = {
      id: 'book-999',
      attributes: {
        id: 'book-999',
        status: 'cancelled',
        ota_name: 'Offline',
        amount: '100.00',
        arrival_date: '2026-11-15',
        departure_date: '2026-11-16',
        customer: { name: 'Test' },
      },
    };

    const row = mapChannexBookingToRow(rawBooking, cfg);
    assert.equal(row.booking_status, 'CANCELED');
    assert.equal(row.payment_status, 'UNPAID');
    assert.ok(row.cancellation_reason);
  });
});

describe('Channex Service - availability range calculation', () => {
  it('creates single available range when no bookings exist', () => {
    const { daily, ranges } = buildAvailabilityRanges('2026-11-01', 5, []);
    assert.equal(daily.length, 5);
    assert.ok(daily.every((d) => d.availability === 1));

    assert.equal(ranges.length, 1);
    assert.deepEqual(ranges[0], {
      date_from: '2026-11-01',
      date_to: '2026-11-05',
      availability: 1,
    });
  });

  it('splits ranges properly when a booking occupies middle dates', () => {
    // 5-day window: 2026-11-01 to 2026-11-05
    // Booking: check_in=2026-11-02, check_out=2026-11-04 (nights 02 and 03 booked)
    const bookings = [
      {
        check_in_date: '2026-11-02',
        check_out_date: '2026-11-04',
      },
    ];

    const { daily, ranges } = buildAvailabilityRanges('2026-11-01', 5, bookings);
    assert.equal(daily.length, 5);
    assert.equal(daily[0].date, '2026-11-01');
    assert.equal(daily[0].availability, 1);
    assert.equal(daily[1].date, '2026-11-02');
    assert.equal(daily[1].availability, 0);
    assert.equal(daily[2].date, '2026-11-03');
    assert.equal(daily[2].availability, 0);
    assert.equal(daily[3].date, '2026-11-04');
    assert.equal(daily[3].availability, 1);
    assert.equal(daily[4].date, '2026-11-05');
    assert.equal(daily[4].availability, 1);

    assert.equal(ranges.length, 3);
    assert.deepEqual(ranges[0], {
      date_from: '2026-11-01',
      date_to: '2026-11-01',
      availability: 1,
    });
    assert.deepEqual(ranges[1], {
      date_from: '2026-11-02',
      date_to: '2026-11-03',
      availability: 0,
    });
    assert.deepEqual(ranges[2], {
      date_from: '2026-11-04',
      date_to: '2026-11-05',
      availability: 1,
    });
  });
});
