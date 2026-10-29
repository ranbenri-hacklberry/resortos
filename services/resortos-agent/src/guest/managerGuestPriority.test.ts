import { describe, it, expect, vi } from 'vitest';
import { createPipeline, hasGuestBooking, type PipelineDeps } from '../pipeline.js';

const guestJid = '972521234567@s.whatsapp.net';
const manager = { phone: '972521234567', name: 'רני', role: 'MANAGER', language: 'he' as const };

function depsFor(bookings: any[]) {
  const sent: string[] = [];
  const extractIntent = vi.fn(async () => ({
    action: 'QUERY_STATUS',
    room_id: null,
    room_raw: '',
    issue_description_hebrew: null,
    acknowledgement_reply_cleaner_language: 'תפריט מנהל',
  }));
  const deps: PipelineDeps = {
    send: vi.fn(async (_jid: string, text: string) => void sent.push(text)),
    isAudio: () => false,
    extractText: (m: any) => m.message?.conversation ?? null,
    transcribe: vi.fn() as any,
    llm: { extractIntent, translateTask: vi.fn() } as any,
    resortos: {
      listBookings: vi.fn(async () => bookings),
      listUnits: vi.fn(async () => []),
    } as any,
    cleaners: () => [manager],
    rooms: () => [],
    log: { info() {}, warn() {}, error() {} },
  };
  return { deps, sent, extractIntent };
}

const msg = (text: string) => ({ key: { remoteJid: guestJid, fromMe: false }, message: { conversation: text } } as any);

describe('manager who is also a guest', () => {
  it('answers as the guest when the same phone has a booking', async () => {
    const { deps, sent, extractIntent } = depsFor([{
      id: 'b1', unit_id: 'k811', guest_name: 'דני כהן', guest_phone: '0521234567',
      check_in_date: '2026-10-23', check_out_date: '2026-10-26', booking_status: 'CHECKED_IN',
    }]);
    await createPipeline(deps).handleInbound(msg('היי'));
    expect(sent.join('\n')).toContain('היי דני, במה אוכל לעזור לך היום?');
    expect(extractIntent).not.toHaveBeenCalled();
  });

  it('keeps the manager path when that phone has no guest booking', async () => {
    const { deps, sent } = depsFor([]);
    await createPipeline(deps).handleInbound(msg('היי'));
    const reply = sent.join('\n');
    expect(reply).toContain('היי רני');
    expect(reply).not.toContain('דני');
  });

  it('ignores a canceled booking', () => {
    expect(hasGuestBooking([{ guest_phone: '0521234567', booking_status: 'CANCELED' }], '972521234567')).toBe(false);
    expect(hasGuestBooking([{ guest_phone: '0521234567', booking_status: 'CONFIRMED' }], '972521234567')).toBe(true);
  });
});
