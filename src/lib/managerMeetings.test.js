import { describe, expect, it } from 'vitest';
import { formatManagerMeeting, meetingsOnHour, upcomingManagerMeetings } from './managerMeetings.js';

describe('manager meetings', () => {
  it('keeps the Nahi contract signing on 25/10 at 10:00', () => {
    const meeting = upcomingManagerMeetings('2026-10-18').find((row) => row.id === 'nahi-contract-2026-10-25');
    expect(meeting).toMatchObject({
      title: 'חתימת חוזה אצל נחי',
      date: '2026-10-25',
      time: '10:00',
      place: 'בבית של נחי, ליד מתחם טוסקנה',
      organizer: 'צוקי',
      participants: ['אדם', 'דניאל', 'צוקי', 'נחי'],
      status: 'confirmed'
    });
    expect(formatManagerMeeting(meeting)).toBe(
      'יום א׳ · 25/10 · 10:00 · חתימת חוזה אצל נחי · בבית של נחי, ליד מתחם טוסקנה · מארגן צוקי · אדם, דניאל, צוקי, נחי'
    );
    expect(meetingsOnHour(undefined, '2026-10-25', '10:00').map((row) => row.id)).toEqual(['nahi-contract-2026-10-25']);
    expect(meetingsOnHour(undefined, '2026-10-25', '11:00')).toEqual([]);
  });
});
