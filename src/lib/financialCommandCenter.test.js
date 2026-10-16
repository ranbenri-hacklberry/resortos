import { describe, test, expect } from 'vitest';
import assert from 'node:assert/strict';
import {
  BANK_IDS,
  BANK_CONFIG,
  computeFinancialCommandCenter,
  findCheckDuplicates,
  buildBookingComPayoutEvents,
  formatChloeWhatsAppAlert,
  addDaysIso,
  formatMoney,
  formatCompactMoney,
  adjustToNextBusinessDay,
  isBankingBusinessDay
} from './financialCommandCenter.js';

describe('ResortOS — Financial Command Center Core Engine', () => {

  test('BANK_CONFIG contains Mizrahi, Discount, and First International Bank (FIBI)', () => {
    assert.deepEqual(BANK_IDS, ['mizrahi', 'discount', 'beinleumi']);
    assert.equal(BANK_CONFIG.mizrahi.accountNumber, '601997');
    assert.equal(BANK_CONFIG.discount.accountNumber, '253325996');
    assert.equal(BANK_CONFIG.beinleumi.accountNumber, '395140');
    assert.ok(BANK_CONFIG.mizrahi.linkedCards.includes('2221'));
    assert.ok(BANK_CONFIG.discount.linkedCards.includes('3174'));
    assert.ok(BANK_CONFIG.beinleumi.linkedCards.includes('8094'));
  });

  test('Duplicate check detection identifies identical check number and amount', () => {
    const existing = [
      { id: 'c1', check_number: '10045', amount: 5000, bank: 'מזרחי טפחות' },
      { id: 'c2', check_number: '10046', amount: 8200, bank: 'הבנק הבינלאומי' }
    ];

    const duplicateMatch = findCheckDuplicates({ check_number: '10045', amount: 5000, bank: 'mizrahi' }, existing);
    assert.equal(duplicateMatch.length, 1);
    assert.equal(duplicateMatch[0].id, 'c1');

    const diffAmount = findCheckDuplicates({ check_number: '10045', amount: 5200, bank: 'mizrahi' }, existing);
    assert.equal(diffAmount.length, 0);

    const diffNum = findCheckDuplicates({ check_number: '99999', amount: 5000, bank: 'mizrahi' }, existing);
    assert.equal(diffNum.length, 0);
  });

  test('Booking.com payouts aggregate confirmed bookings to 3rd of following month', () => {
    const bookings = [
      {
        id: 'b1',
        channel: 'booking_com',
        booking_status: 'CONFIRMED',
        check_out_date: '2026-10-20',
        total_price_agorot: 200000 // 2,000 ILS
      },
      {
        id: 'b2',
        channel: 'booking_com',
        booking_status: 'CONFIRMED',
        check_out_date: '2026-10-25',
        total_price_agorot: 300000 // 3,000 ILS
      }
    ];

    const events = buildBookingComPayoutEvents({
      bookings,
      today: '2026-10-16',
      horizonEnd: '2027-02-13',
      payoutDay: 3,
      targetBank: 'mizrahi'
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].date, '2026-11-03');
    // Total 5000 ILS * 0.85 (after 15% OTA commission) = 4250 ILS
    assert.equal(events[0].amount, 4250);
    assert.equal(events[0].bank, 'mizrahi');
    assert.equal(events[0].category, 'booking_payout');
  });

  test('Proactive utilization warnings trigger at 50% and 60% thresholds', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 20000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    // Mizrahi starting balance is 0. A check of 55,000 ILS causes balance = -55,000 (55% utilization -> warning)
    // A subsequent check of 10,000 ILS causes balance = -65,000 (65% utilization -> critical)
    const checks = [
      { id: 'chk1', check_number: '201', amount: 55000, due_date: '2026-10-20', bank: 'mizrahi', payee: 'ספק א' },
      { id: 'chk2', check_number: '202', amount: 10000, due_date: '2026-10-25', bank: 'mizrahi', payee: 'ספק ב' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 30,
      accounts: [
        { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: 0 } },
        { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 50000 } },
        { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 50000 } }
      ],
      settings,
      checks
    });

    // Check alerts
    const alert50 = result.alerts.find((a) => a.type === 'facility_utilization_50' && a.bank === 'mizrahi');
    assert.ok(alert50, 'Should trigger 50% utilization warning');
    assert.equal(alert50.date, '2026-10-20');
    assert.equal(alert50.severity, 'warning');

    const alert60 = result.alerts.find((a) => a.type === 'facility_utilization_60' && a.bank === 'mizrahi');
    assert.ok(alert60, 'Should trigger 60% critical alert');
    assert.equal(alert60.date, '2026-10-25');
    assert.equal(alert60.severity, 'critical');
  });

  test('Safety buffer breach triggers warning when projected balance falls below buffer', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 30000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    // Mizrahi starts at 35,000. An expense of 10,000 drops balance to 25,000, which is below 30,000 buffer
    const checks = [
      { id: 'chk3', check_number: '301', amount: 10000, due_date: '2026-10-18', bank: 'mizrahi', payee: 'ספק ג' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 30,
      accounts: [
        { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: 35000 } },
        { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 50000 } },
        { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 50000 } }
      ],
      settings,
      checks
    });

    const bufferAlert = result.alerts.find((a) => a.type === 'safety_buffer_breach' && a.bank === 'mizrahi');
    assert.ok(bufferAlert, 'Should detect safety buffer breach');
    assert.equal(bufferAlert.date, '2026-10-18');
    assert.equal(bufferAlert.shortfall, 5000); // 30000 - 25000 = 5000
  });

  test('External funding requirement identifies earliest shortage date and financing needed', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      banks: {
        mizrahi: { facility: 50000, safetyBuffer: 10000 },
        discount: { facility: 50000, safetyBuffer: 10000 },
        beinleumi: { facility: 50000, safetyBuffer: 10000 }
      }
    };
    // Total buffer = 30,000. Total starting cash = 15,000.
    // Deficit relative to buffer is 15,000 right now.
    // A check of 20,000 on 2026-10-22 drops cash to -5,000. Total buffer deficit = 35,000.
    const checks = [
      { id: 'chk4', check_number: '401', amount: 20000, due_date: '2026-10-22', bank: 'mizrahi', payee: 'ספק ד' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 30,
      accounts: [
        { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: 5000 } },
        { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 5000 } },
        { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 5000 } }
      ],
      settings,
      checks
    });

    assert.equal(result.fundingRequirement.hasRequirement, true);
    assert.equal(result.fundingRequirement.earliestShortageDate, '2026-10-16');
    assert.equal(result.fundingRequirement.financingAmountNeeded, 35000);
    assert.ok(result.fundingRequirement.seasonalityExplanation.length > 0);
  });

  test('Baseline vs Manual Assumptions are strictly separated', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 20000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    const manualEntries = [
      { id: 'm1', amount: 25000, date: '2026-10-24', bank: 'mizrahi', type: 'income', label: 'הכנסה ידנית לא מאומתת' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 30,
      accounts: [
        { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: 10000 } },
        { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 10000 } },
        { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 10000 } }
      ],
      settings,
      checks: [],
      manualEntries
    });

    // Baseline ending balance should NOT include the unconfirmed 25,000 manual entry
    assert.equal(result.kpis.baselineEndingCash, 30000);
    // Scenario ending balance DOES include the manual assumption
    assert.equal(result.kpis.scenarioEndingCash, 55000);
  });

  test('WhatsApp alert message format for Chloe contains required financial metrics', () => {
    const alert = {
      id: 'mizrahi-util60-2026-11-05',
      severity: 'critical',
      bank: 'mizrahi',
      bankName: 'מזרחי טפחות',
      date: '2026-11-05',
      type: 'facility_utilization_60',
      title: 'ניצול מסגרת קריטי: 64% במזרחי טפחות',
      description: 'יתרה חזויה של -₪96,000 מתוך מסגרת של ₪150,000.',
      balance: -96000,
      utilization: 64,
      shortfall: 96000,
      causingEvents: [
        { label: 'שיק מס׳ 5001', amount: -45000 },
        { label: 'חיוב כרטיסי אשראי', amount: -22000 }
      ]
    };

    const text = formatChloeWhatsAppAlert(alert);
    assert.ok(text.includes('🚨 *התראת תזרים מחמ״ל ResortOS*'));
    assert.ok(text.includes('בנק: *מזרחי טפחות*'));
    assert.ok(text.includes('2026-11-05'));
    assert.ok(text.includes('64%'));
    assert.ok(text.includes('שיק מס׳ 5001'));
  });

  test('Saturday check automatically rolls forward to Sunday and impacts Sunday balance only', () => {
    // 2026-10-16 is Friday, 2026-10-17 is Saturday, 2026-10-18 is Sunday
    assert.equal(isBankingBusinessDay('2026-10-17'), false, 'Saturday is not a banking business day');
    assert.equal(adjustToNextBusinessDay('2026-10-17'), '2026-10-18', 'Saturday rolls to Sunday');

    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 20000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    // Check with due_date on Saturday (2026-10-17)
    const checks = [
      { id: 'sat-chk', check_number: '9901', amount: 15000, due_date: '2026-10-17', bank: 'mizrahi', payee: 'ספק סופ״ש' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 7,
      accounts: [
        { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: 30000 } },
        { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 0 } },
        { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 0 } }
      ],
      settings,
      checks
    });

    // Verify event has rolled date
    const checkEvent = result.baseline.events.find((e) => e.checkNumber === '9901');
    assert.ok(checkEvent, 'Check event should exist');
    assert.equal(checkEvent.originalDate, '2026-10-17');
    assert.equal(checkEvent.date, '2026-10-18');

    // Day 2026-10-17 (Saturday): Balance should remain 30,000 (no check debit!)
    const satDay = result.baseline.days.find((d) => d.date === '2026-10-17');
    assert.ok(satDay);
    assert.equal(satDay.balances.mizrahi, 30000);
    assert.equal(satDay.events.length, 0);

    // Day 2026-10-18 (Sunday): Check debited, balance drops to 15,000
    const sunDay = result.baseline.days.find((d) => d.date === '2026-10-18');
    assert.ok(sunDay);
    assert.equal(sunDay.balances.mizrahi, 15000);
    assert.equal(sunDay.events.length, 1);
    assert.equal(sunDay.events[0].amount, -15000);
  });

  test('Cash collection increases CASH_DRAWER without altering bank checking balances or credit facility utilization', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      initialCashDrawer: 0,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 20000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    // Mizrahi checking balance is negative: -40,000 ILS (40% utilization)
    const accounts = [
      { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: -40000 } },
      { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 0 } },
      { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 0 } }
    ];

    // Guest pays 25,000 ILS in cash at check-in on 2026-10-16
    const collectionRows = [
      { id: 'col-1', stayDate: '2026-10-16', guestName: 'ישראל ישראלי', cash: 25000, status: 'checked_in' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 5,
      accounts,
      settings,
      collectionRows
    });

    const day0 = result.baseline.days[0];
    // Cash drawer must have the 25,000 ILS
    assert.equal(day0.cashDrawer, 25000);
    // Mizrahi checking balance MUST remain -40,000 (NOT changed to -15,000!)
    assert.equal(day0.balances.mizrahi, -40000);
    // Mizrahi credit facility utilization MUST remain 40% (NOT reduced!)
    assert.equal(day0.utilizations.mizrahi, 40);
    // Total bank checking balance remains -40,000
    assert.equal(day0.totalBalance, -40000);
    // Total liquid funds includes the cash drawer: -40,000 + 25,000 = -15,000
    assert.equal(day0.totalLiquidFunds, -15000);
    // Total liquidity includes liquid funds + facility: -15,000 + 300,000 = 285,000
    assert.equal(day0.totalLiquidity, 285000);
  });

  test('Cash deposit to bank decreases CASH_DRAWER and credits the target bank checking account', () => {
    const today = '2026-10-16';
    const settings = {
      bookingPayoutDay: 3,
      initialCashDrawer: 30000,
      banks: {
        mizrahi: { facility: 100000, safetyBuffer: 20000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 20000 }
      }
    };

    // Mizrahi starting balance is -50,000 (50% utilization)
    const accounts = [
      { accountType: 'CHECKING', providerId: 'mizrahi', displayBalance: { amount: -50000 } },
      { accountType: 'CHECKING', providerId: 'discount', displayBalance: { amount: 0 } },
      { accountType: 'CHECKING', providerId: 'beinleumi', displayBalance: { amount: 0 } }
    ];

    // Deposit 20,000 ILS from cash drawer into Mizrahi on 2026-10-18 (Sunday)
    const cashDeposits = [
      { id: 'dep-101', date: '2026-10-18', amount: 20000, bank: 'mizrahi' }
    ];

    const result = computeFinancialCommandCenter({
      today,
      horizonDays: 5,
      accounts,
      settings,
      cashDeposits
    });

    // Before deposit (2026-10-16):
    const dayFri = result.baseline.days.find((d) => d.date === '2026-10-16');
    assert.equal(dayFri.cashDrawer, 30000);
    assert.equal(dayFri.balances.mizrahi, -50000);
    assert.equal(dayFri.utilizations.mizrahi, 50);

    // On deposit day (2026-10-18 Sunday):
    const daySun = result.baseline.days.find((d) => d.date === '2026-10-18');
    // Cash drawer is reduced by 20,000 -> 10,000
    assert.equal(daySun.cashDrawer, 10000);
    // Mizrahi balance increased by 20,000 -> -30,000
    assert.equal(daySun.balances.mizrahi, -30000);
    // Mizrahi utilization drops from 50% to 30%
    assert.equal(daySun.utilizations.mizrahi, 30);
  });

});
