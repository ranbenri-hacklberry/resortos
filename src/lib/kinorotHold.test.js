import { describe, expect, it } from 'vitest';
import {
  holdThroughTomorrow,
  kinorotPlaceId,
  reservationIdFromLocation,
  unavailableHoldFields,
  unitOptionFromHtml
} from './kinorotHold';

describe('kinorot unavailable hold', () => {
  it('maps a cabin to its Kinorot place', () => {
    expect(kinorotPlaceId('k693')).toBe('693');
    expect(kinorotPlaceId('missing')).toBe('');
  });

  it('blocks tonight and releases the room tomorrow', () => {
    expect(holdThroughTomorrow('2026-10-14')).toEqual({
      checkIn: '2026-10-14',
      checkOut: '2026-10-15'
    });
  });

  it('reads the unit ids Kinorot expects on the reservation form', () => {
    const html = '<option value="693" data-realid="369" data-compid="351">בקתות מאיה</option>';
    const option = unitOptionFromHtml(html, '693');
    expect(unavailableHoldFields({
      option,
      checkIn: '2026-10-14',
      checkOut: '2026-10-15'
    })).toMatchObject({
      guestname: 'לא זמין',
      doctype: 'חדשה',
      'unit[]': '693',
      'realid[]': '369',
      'unit_compid[]': '351',
      'price[]': '0'
    });
  });

  it('reads the new reservation id from the save redirect', () => {
    expect(reservationIdFromLocation('resview.php?res=75139&compid=351&done=1')).toBe('75139');
  });
});
