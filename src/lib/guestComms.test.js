import { describe, expect, it } from 'vitest';
import {
  firstNameOnly,
  guestPresenceBadge,
  selfCheckoutWindow,
  shouldSkipCheckoutReminder
} from './guestComms.js';

describe('guestComms', () => {
  it('opens self-checkout only from 08:00 on departure day', () => {
    const booking = { check_out_date: '2026-09-12' };
    const before = new Date('2026-09-12T04:30:00Z'); // 07:30 IL (UTC+3)
    const after = new Date('2026-09-12T05:15:00Z'); // 08:15 IL
    expect(selfCheckoutWindow(booking, {}, before).open).toBe(false);
    expect(selfCheckoutWindow(booking, {}, before).reason).toBe('before_0800');
    expect(selfCheckoutWindow(booking, {}, after).open).toBe(true);
  });

  it('maps presence badges', () => {
    expect(guestPresenceBadge({
      booking_status: 'CHECKED_IN',
      stay: { self_checked_out_at: '2026-09-12T08:10:00Z' }
    }).tone).toBe('blue');
    expect(guestPresenceBadge({
      booking_status: 'CHECKED_IN',
      wifi_presence_status: 'disconnected'
    }).tone).toBe('orange');
    expect(guestPresenceBadge({
      booking_status: 'CHECKED_IN',
      check_out_date: '2026-09-01'
    }, new Date('2026-09-12T10:00:00Z')).tone).toBe('red');
  });

  it('skips reminder after quiet wifi leave', () => {
    expect(shouldSkipCheckoutReminder({
      wifi_presence_status: 'disconnected',
      stay: { wifi_disconnected_at: '2026-09-12T06:00:00Z' }
    }, new Date('2026-09-12T07:00:00Z'))).toBe(true);
    expect(shouldSkipCheckoutReminder({
      booking_status: 'CHECKED_IN',
      wifi_presence_status: 'active'
    })).toBe(false);
  });

  it('keeps first name only', () => {
    expect(firstNameOnly('עומר קרס')).toBe('עומר');
  });
});
