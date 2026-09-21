import { describe, expect, it } from 'vitest';
import { channelFromKinorotGuest, isBookingComBooking, isBookingComEmail } from './kinorotChannel.js';

describe('kinorot channel', () => {
  it('detects Booking.com from guest.booking.com mail', () => {
    expect(isBookingComEmail('anisel.430897@guest.booking.com')).toBe(true);
    expect(isBookingComEmail('guest@gmail.com')).toBe(false);
    expect(channelFromKinorotGuest({
      resid: '90874557',
      email: 'anisel.430897@guest.booking.com'
    })).toBe('booking_com');
    expect(isBookingComBooking({
      guest_email: 'anisel.430897@guest.booking.com',
      channel_source: 'kinorot'
    })).toBe(true);
  });

  it('keeps airbnb for long external resid and kinorot otherwise', () => {
    expect(channelFromKinorotGuest({ resid: '12345678901' })).toBe('airbnb');
    expect(channelFromKinorotGuest({ resid: '90874557' })).toBe('kinorot');
  });
});
