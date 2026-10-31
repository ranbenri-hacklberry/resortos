import { describe, expect, it } from 'vitest';
import { answerManagerRoomQuestion, formatManagerInitialCard, getRoomOccupancy, isComplexCheckinsQuestion, answerComplexCheckinsQuestion } from './managerQuestions.js';

const room = { id: 'k693', name: 'בקתות מאיה 1', lockbox: '2410' };

describe('manager room card', () => {
  it('drops the cleaning line when a guest leaves today and says there is no arrival', () => {
    const occupancy = getRoomOccupancy('k693', [
      {
        id: 'b1',
        unit_id: 'k693',
        guest_name: 'חאטיב פלאח',
        check_in_date: '2026-10-16',
        check_out_date: '2026-10-17',
        booking_status: 'CONFIRMED',
      },
    ], '2026-10-17');
    const card = formatManagerInitialCard('בקתות מאיה 1', '2410', {
      id: 'k693',
      operational_status: 'READY',
      custom_reason: 'מוכן לאורח',
    }, occupancy, room as any);
    expect(card).toContain('🔑 קוד כספת: *2410*');
    expect(card).toContain('🟠 צ׳ק אאוט היום (חאטיב פלאח)');
    expect(card).toContain('אין כניסה היום');
    expect(card).not.toContain('סטטוס ניקיון');
    expect(card).not.toContain('מוכן לאורח');
  });

  it('keeps the cleaning line when the room is empty', () => {
    const occupancy = getRoomOccupancy('k693', [], '2026-10-17');
    const card = formatManagerInitialCard('בקתות מאיה 1', '2410', {
      id: 'k693',
      operational_status: 'READY',
    }, occupancy, room as any);
    expect(card).toContain('סטטוס: מוכן לאורח 🟢');
    expect(card).not.toContain('סטטוס תפוסה');
  });

  it('answers פרטי לקוח with the guest on the room, including a turnover', () => {
    const occupancy = getRoomOccupancy('k693', [
      {
        id: 'out',
        unit_id: 'k693',
        guest_name: 'חאטיב פלאח',
        guest_phone: '972501112233',
        check_in_date: '2026-10-16',
        check_out_date: '2026-10-17',
        booking_status: 'CONFIRMED',
        adults_count: 2,
        total_price_agorot: 120000,
        payment_status: 'PAID',
        clearing_payments: [{ amount_agorot: 120000 }],
      },
      {
        id: 'in',
        unit_id: 'k693',
        guest_name: 'נועה לוי',
        guest_phone: '0523334455',
        check_in_date: '2026-10-17',
        check_out_date: '2026-10-18',
        booking_status: 'CONFIRMED',
        adults_count: 2,
        children_count: 1,
        total_price_agorot: 90000,
        payment_status: 'UNPAID',
        clearing_payments: [],
      },
    ], '2026-10-17');
    const reply = answerManagerRoomQuestion('פרטי לקוח', 'בקתות מאיה 1', '2410', undefined, occupancy, room as any);
    expect(reply).toContain('פרטי לקוח · בקתות מאיה 1');
    expect(reply).toContain('יוצא היום');
    expect(reply).toContain('חאטיב פלאח');
    expect(reply).toContain('0501112233');
    expect(reply).toContain('16/10 → 17/10');
    expect(reply).toContain('שולם');
    expect(reply).toContain('נכנס היום');
    expect(reply).toContain('נועה לוי');
    expect(reply).toContain('יתרה');
  });
});

describe('Bug 9: complex weekend check-ins query', () => {
  const rooms = [
    { id: 'k671', name: 'בתי נורית 1', property: 'בתי נורית' },
    { id: 'k673', name: 'בתי נורית 2', property: 'בתי נורית' },
    { id: 'k674', name: 'בתי נורית 3', property: 'בתי נורית' },
    { id: 'k675', name: 'בתי נורית 4', property: 'בתי נורית' },
    { id: 'k676', name: 'בתי נורית 5', property: 'בתי נורית' },
    { id: 'k677', name: 'בתי נורית 6', property: 'בתי נורית' },
  ];

  it('answers weekend check-ins with one line per unit and never attaches guest link', () => {
    const question = 'מה הכניסות בבתי נורית בסופ״ש (23-24/10)? לכל חדר כמה אורחים';
    expect(isComplexCheckinsQuestion(question)).toBe(true);

    const bookings = [
      {
        id: 'b1',
        unit_id: 'k671',
        check_in_date: '2026-10-23',
        check_out_date: '2026-10-25',
        booking_status: 'CONFIRMED',
        adults_count: 2,
        children_count: 2,
      },
      {
        id: 'b2',
        unit_id: 'k674',
        check_in_date: '2026-10-24',
        check_out_date: '2026-10-25',
        booking_status: 'CONFIRMED',
        // no headcount given
      },
    ];

    const reply = answerComplexCheckinsQuestion(question, rooms as any, bookings as any, '2026-10-20');
    expect(reply).toBeTruthy();
    expect(reply).toContain('📋 *כניסות בבתי נורית (23-24/10):*');
    expect(reply).toContain('• בתי נורית 1: כניסה 23/10, 2 לילות, 4 אורחים');
    expect(reply).toContain('• בתי נורית 3: כניסה 24/10, לילה, לא ידוע');
    // Ran 2026-10-28: rooms without arrivals are omitted.
    expect(reply).not.toContain('אין כניסה');
    // Must NOT contain any guest/demo links
    expect(reply).not.toContain('resortos.app/stay');
    expect(reply).not.toContain('stay/');
  });
});

