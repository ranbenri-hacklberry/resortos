import { describe, expect, it } from 'vitest';
import { assignableStaffOptions, normalizeStaffPhone, staffPhoneLabel } from './staffPhones.js';

describe('staffPhones', () => {
  it('normalizes local, plus, and 972 numbers', () => {
    expect(normalizeStaffPhone('054-807-6123')).toBe('0548076123');
    expect(normalizeStaffPhone('+972 54-807-6123')).toBe('0548076123');
    expect(normalizeStaffPhone('0503934696')).toBe('0503934696');
    expect(normalizeStaffPhone('')).toBe('');
  });

  it('shows phone and WhatsApp separately when they differ', () => {
    expect(staffPhoneLabel({ phone: '0506102416', whatsapp_phone: '0548076123' }))
      .toBe('0506102416 · WA 0548076123');
    expect(staffPhoneLabel({ phone: '0503934696', whatsapp_phone: '0503934696' }))
      .toBe('0503934696');
  });

  it('builds unique assignee options from system users', () => {
    const options = assignableStaffOptions(
      [
        { id: '1', display_name: 'אוסנת', username: 'osnat' },
        { id: '2', display_name: 'ברק', username: 'barak' }
      ],
      { id: '3', display_name: 'רני', username: 'rani' },
      'צוות תפעול'
    );
    expect(options.map((row) => row.name)).toEqual(['צוות תפעול', 'אוסנת', 'ברק', 'רני']);
  });
});
