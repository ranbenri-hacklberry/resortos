import { describe, expect, it } from 'vitest';
import { applyLiveRoles } from './liveStaff.js';
import type { CleanerProfile } from '../config.js';

const file: CleanerProfile[] = [
  { phone: '972543387383', name: 'אדם', role: 'HOUSEKEEPING', language: 'he' },
  { phone: '249438949924982', name: 'אדם', role: 'HOUSEKEEPING', language: 'he' },
  { phone: '972525834355', name: 'אבו', role: 'HOUSEKEEPING', language: 'ar' },
];

describe('live staff roles', () => {
  it('uses the employee role for the phone and the WhatsApp identity', () => {
    const merged = applyLiveRoles(file, [
      { id: 'adam', name: 'אדם', role: 'MANAGER', phones: ['0543387383'] },
    ]);
    expect(merged.find((row) => row.phone === '972543387383')?.role).toBe('MANAGER');
    expect(merged.find((row) => row.phone === '249438949924982')?.role).toBe('MANAGER');
    expect(merged.find((row) => row.phone === '972525834355')).toMatchObject({ role: 'HOUSEKEEPING', language: 'ar' });
  });

  it('records a contractor crew member under the work lead', () => {
    const merged = applyLiveRoles(file, [
      { id: 'abu', name: 'אבו', role: 'WORK_LEAD', phones: ['0525834355'] },
      { id: 'worker', name: 'סאמר', role: 'HOUSEKEEPING', phones: ['0501112233'], crew_lead_name: 'אבו' },
    ]);
    expect(merged.find((row) => row.name === 'אבו')?.recordsAs).toBeUndefined();
    expect(merged.find((row) => row.name === 'סאמר')).toMatchObject({
      phone: '972501112233',
      role: 'HOUSEKEEPING',
      recordsAs: 'אבו',
    });
  });

  it('adds a manager who exists only in the employee table', () => {
    const merged = applyLiveRoles(file, [
      { id: 'daniel', name: 'דניאל', role: 'MANAGER', phones: ['0504717447'] },
    ]);
    expect(merged.find((row) => row.name === 'דניאל')).toMatchObject({
      phone: '972504717447',
      role: 'MANAGER',
      language: 'he',
    });
  });
});
