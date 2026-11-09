/**
 * Cardcom Match Candidates / Suggestions
 * Server-side suggestion generator for unassigned Cardcom terminal deals.
 *
 * Rule (server-side, in the suggestions endpoint):
 * - A deal at date D (Asia/Jerusalem) may be suggested only for bookings where the guest
 *   was physically on site that day: check_in <= D <= check_out.
 * - Older debts (checked out up to 14 days BEFORE D) are NOT mixed into the default list:
 *   they are returned only with options.includeOlderDebts (separate `older_debts`) or via manual search.
 * - Never bookings with check_in > D. No future bookings.
 * - Only bookings with balance > 0 (UNPAID/PARTIAL per the money record).
 * - CANCELED with open balance + strong name and/or exact amount: keep as flagged
 *   ("מבוטלת – יתרה פתוחה") — Kinorot "shortened" stays sometimes sync as CANCELED.
 * - Strong name match outside the on-site window: separate flagged side list
 *   ("התאמת שם מחוץ לחלון"), never mixed into the default list.
 * - Rank (default list): strong name match first, then exact amount to balance, then date proximity. Max 10.
 * - Manual search (by name/phone/notes) stays available as an explicit fallback.
 */

import { unitFullName } from '../../src/lib/units.js';

/** Remaining after a charge: due - this deal (no deposit/VAT/fees). */
export function remainingIlsAfterCharge(dueIls, dealAmount) {
  const due = Number(dueIls) || 0;
  const deal = Number(dealAmount) || 0;
  return Math.max(0, due - deal);
}

const HE_EN_PAIRS = [
  ['דושיין', 'dushein'],
  ['דושן', 'dushen'],
  ['יורה', 'yura'],
  ['יורי', 'yuri'],
  ['עומר', 'omer'],
  ['אור', 'or'],
  ['כהן', 'cohen'],
  ['כהן', 'kohen'],
  ['דניאל', 'daniel'],
  ['מיכאל', 'michael'],
  ['דוד', 'david'],
  ['אבי', 'avi'],
  ['יוסי', 'yossi'],
  ['שיבלי', 'shibli'],
  ['צוקרמן', 'zuckerman']
];

export function nameSimilarity(strA, strB) {
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-zא-ת0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const a = clean(strA);
  const b = clean(strB);
  if (!a || !b) return 0;
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const wordsA = a.split(/\s+/).filter((w) => w.length > 1);
  const wordsB = b.split(/\s+/).filter((w) => w.length > 1);
  const overlap = wordsA.filter((w) => wordsB.includes(w));
  if (overlap.length > 0) {
    return 0.5 + 0.35 * (overlap.length / Math.max(wordsA.length, wordsB.length));
  }

  for (const [he, en] of HE_EN_PAIRS) {
    if ((a.includes(he) && b.includes(en)) || (a.includes(en) && b.includes(he))) {
      return 0.85;
    }
  }

  return 0;
}

/** Best fuzzy match of cardholder name against guest_name, invoice_name, and notes. */
export function nameSimilarityToBooking(payerName, booking) {
  if (!payerName) return 0;
  const fields = [
    booking?.guest_name,
    booking?.invoice_name,
    booking?.notes,
    booking?.note,
    booking?.booking_notes,
    booking?.internal_notes,
    booking?.guest_notes
  ];
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    best = Math.max(best, nameSimilarity(payerName, field));
    if (best >= 1) break;
  }
  return best;
}

export function getIsraelDateString(dealTime) {
  if (!dealTime) return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  if (typeof dealTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dealTime.trim())) {
    return dealTime.trim();
  }
  const d = new Date(dealTime);
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

export function shiftDays(dateStr, days) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isUnverifiedKinorotPayment(p) {
  if (!p) return false;
  const meth = String(p.method || p.source || '').toUpperCase();
  const hasTxn = Boolean(p.deal_number || p.txn || p.approval || p.deal_id);
  return (meth === 'KINOROT' || meth.startsWith('KINOROT_')) && !hasTxn;
}

export function calculateBookingBalances(b) {
  if (!b) return { totalIls: 0, paidIls: 0, dueIls: 0, depositIls: 0, isUnpaid: false, isUnverifiedPaid: false };

  const totalAgorot = Number(b.total_price_agorot) || (Number(b.total_price || b.total_ils || b.price || 0) * 100);
  const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];

  const verifiedAgorot = clearing
    .filter((p) => !isUnverifiedKinorotPayment(p))
    .reduce((sum, p) => {
      const val = Number(p.amount_agorot ? p.amount_agorot : (Number(p.amount_ils || p.amount || 0) * 100));
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

  const hasOnlyUnverifiedKinorot = clearing.length > 0 && clearing.every(isUnverifiedKinorotPayment);
  const isUnverifiedPaid = String(b.payment_status || '').toUpperCase() === 'PAID' && hasOnlyUnverifiedKinorot;

  const dueAgorot = isUnverifiedPaid && verifiedAgorot === 0
    ? totalAgorot
    : Math.max(0, totalAgorot - verifiedAgorot);

  const totalIls = totalAgorot / 100;
  const verifiedPaidIls = verifiedAgorot / 100;
  const dueIls = dueAgorot / 100;
  const depositIls = (Number(b.deposit_agorot) || Number(b.deposit || 0) * 100) / 100;

  const isPaid = !isUnverifiedPaid && (String(b.payment_status || '').toUpperCase() === 'PAID' || (totalIls > 0 && dueIls <= 0));
  const isUnpaid = isUnverifiedPaid || (!isPaid && dueIls > 0);

  return {
    totalIls,
    paidIls: verifiedPaidIls,
    dueIls,
    depositIls,
    isPaid,
    isUnpaid,
    isUnverifiedPaid
  };
}

export function computeDateDistance(cin, cout, dealDate) {
  const dCin = cin ? cin.slice(0, 10) : '';
  const dCout = cout ? cout.slice(0, 10) : '';
  const dTarget = dealDate.slice(0, 10);

  if (dCin && dCout && dTarget >= dCin && dTarget <= dCout) {
    return 0;
  }

  const msPerDay = 86400000;
  const tTarget = new Date(dTarget + 'T12:00:00Z').getTime();

  let minDiff = 999;
  if (dCin) {
    const tCin = new Date(dCin + 'T12:00:00Z').getTime();
    minDiff = Math.min(minDiff, Math.abs(Math.round((tTarget - tCin) / msPerDay)));
  }
  if (dCout) {
    const tCout = new Date(dCout + 'T12:00:00Z').getTime();
    minDiff = Math.min(minDiff, Math.abs(Math.round((tTarget - tCout) / msPerDay)));
  }

  return minDiff;
}

export function isBookingInDateWindow(cin, cout, dealDate) {
  if (!cin || !cout || !dealDate) return false;
  const dCin = cin.slice(0, 10);
  const dCout = cout.slice(0, 10);
  const dTarget = dealDate.slice(0, 10);
  if (dCin > dTarget) return false;
  if (dCout < dTarget) return false;
  return true;
}

export function isBookingInOlderDebtWindow(cin, cout, dealDate) {
  if (!cin || !cout || !dealDate) return false;
  const dCin = cin.slice(0, 10);
  const dCout = cout.slice(0, 10);
  const dTarget = dealDate.slice(0, 10);
  if (dCin > shiftDays(dTarget, 1)) return false;
  return dCout < shiftDays(dTarget, -1) && dCout >= shiftDays(dTarget, -14);
}

export function isCanceledBooking(b) {
  if (!b) return false;
  if (b.deleted_at) return true;
  if (b.canceled === true) return true;
  const status = String(b.booking_status || '').toUpperCase();
  return status === 'CANCELED' || status === 'CANCELLED' || status === 'DELETED';
}

export function classifyCandidate(dealAmountNum, dueIls, totalIls) {
  const dealAmount = Math.round(Number(dealAmountNum || 0));
  const due = Math.round(Number(dueIls || 0));

  if (due > 0 && Math.abs(dealAmount - due) < 0.5) {
    return {
      type: 'exact_due',
      priority: 1,
      tag: 'סגירה מלאה',
      tagColor: '#16a34a',
      badgeBg: '#dcfce7',
      description: `סוגר את מלוא היתרה (₪${due.toLocaleString('he-IL')})`,
      amountLine: `יתרה ₪${due.toLocaleString('he-IL')} · סוגר מלא`,
      remainingAfterPayment: 0
    };
  }

  if (due > 0 && dealAmount < due) {
    const rem = remainingIlsAfterCharge(due, dealAmount);
    return {
      type: 'partial_payment',
      priority: 2,
      tag: 'תשלום חלקי',
      tagColor: '#2563eb',
      badgeBg: '#dbeafe',
      description: `יסגור ₪${dealAmount.toLocaleString('he-IL')} מתוך ₪${due.toLocaleString('he-IL')} (תישאר יתרה ₪${rem.toLocaleString('he-IL')})`,
      amountLine: `יתרה ₪${due.toLocaleString('he-IL')} · אחרי שיוך ₪${rem.toLocaleString('he-IL')}`,
      remainingAfterPayment: rem
    };
  }

  if (due > 0 && dealAmount > due) {
    const surplus = dealAmount - due;
    return {
      type: 'overpayment',
      priority: 3,
      tag: 'סגירת יתרה + עודף',
      tagColor: '#d97706',
      badgeBg: '#fef3c7',
      description: `יסגור את כל היתרה ₪${due.toLocaleString('he-IL')} (עודף: ₪${surplus.toLocaleString('he-IL')})`,
      amountLine: `יתרה ₪${due.toLocaleString('he-IL')} · עודף ₪${surplus.toLocaleString('he-IL')}`,
      remainingAfterPayment: 0
    };
  }

  return {
    type: 'open_balance',
    priority: 4,
    tag: 'יתרה פתוחה',
    tagColor: '#475569',
    badgeBg: '#f1f5f9',
    description: `יתרה: ₪${due.toLocaleString('he-IL')}`,
    amountLine: `יתרה ₪${due.toLocaleString('he-IL')}`,
    remainingAfterPayment: due
  };
}

const FLAG_CANCELED = {
  flagged: true,
  flagKind: 'canceled_unpaid',
  flagLabel: 'מבוטלת – יתרה פתוחה'
};

const FLAG_OUTSIDE_NAME = {
  flagged: true,
  flagKind: 'name_outside_window',
  flagLabel: 'התאמת שם מחוץ לחלון'
};

function rankCandidates(candidates) {
  candidates.sort((a, b) => {
    const aStrong = a.nameSimilarity >= 0.85 ? 1 : 0;
    const bStrong = b.nameSimilarity >= 0.85 ? 1 : 0;
    if (aStrong !== bStrong) return bStrong - aStrong;

    if (Math.abs(b.nameSimilarity - a.nameSimilarity) > 0.05) {
      return b.nameSimilarity - a.nameSimilarity;
    }

    const aExact = a.exactAmountMatch ? 1 : 0;
    const bExact = b.exactAmountMatch ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    if (a.dateDistance !== b.dateDistance) {
      return a.dateDistance - b.dateDistance;
    }

    const dateCmp = b.checkIn.localeCompare(a.checkIn);
    if (dateCmp !== 0) return dateCmp;
    return a.bookingId.localeCompare(b.bookingId);
  });
  return candidates;
}

function buildCandidate(b, {
  dealAmount,
  dealIdStr,
  deal,
  payerName,
  dealDate,
  flag = null
}) {
  const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];
  if (dealIdStr) {
    const alreadyLinked = clearing.some((row) => (
      String(row.deal_number || row.txn || '').trim() === dealIdStr
      || (deal.approval && String(row.approval || row.ref || '').trim() === String(deal.approval).trim())
    ));
    if (alreadyLinked) return null;
  }

  const { totalIls, dueIls, paidIls, isPaid } = calculateBookingBalances(b);
  if (dueIls <= 0 || isPaid) return null;

  const cin = String(b.check_in_date || b.check_in || '').slice(0, 10);
  const cout = String(b.check_out_date || b.check_out || '').slice(0, 10);
  if (!cin || !cout) return null;

  const guestName = String(b.guest_name || b.invoice_name || '').trim();
  const guestPhone = String(b.guest_phone || b.phone || '').trim();
  const unitIdRaw = String(b.unit_id || '').trim();
  const unitName = unitFullName(unitIdRaw, String(b.unit_name || b.unit_id || '').trim());
  const bookingId = String(b.id || '').trim();

  const exactAmountMatch = Math.abs(dealAmount - dueIls) < 0.5;
  const nameSim = payerName ? nameSimilarityToBooking(payerName, b) : 0;
  const dateDist = computeDateDistance(cin, cout, dealDate);
  const canceled = isCanceledBooking(b);

  const deposit20Ils = Math.round(totalIls * 0.20);
  const depositIls = Math.round((Number(b.deposit_agorot) || 0) / 100);
  const isExact20Deposit = deposit20Ils > 0 && Math.abs(dealAmount - deposit20Ils) < 0.5;
  const isExactDeposit = depositIls > 0 && Math.abs(dealAmount - depositIls) < 0.5;

  let score = 0;
  const reasons = [];

  if (exactAmountMatch) {
    score += 50;
    reasons.push('exact_due_balance');
  } else if (isExact20Deposit) {
    score += 48;
    reasons.push('exact_20_percent_deposit');
  } else if (isExactDeposit) {
    score += 45;
    reasons.push('exact_deposit');
  } else if (dealAmount < dueIls) {
    score += 25;
    reasons.push('partial_balance');
  } else {
    score += 15;
    reasons.push('overpayment');
  }

  if (nameSim >= 0.85) {
    score += 35;
    reasons.push('strong_name_match');
  } else if (nameSim >= 0.4) {
    score += 20;
    reasons.push('partial_name_match');
  }

  const bLast4 = String(b.card_last4 || b.last4 || b.credit_card_last4 || (b.stay?.hyp?.last4) || '').replace(/\D/g, '').slice(-4);
  if (deal.last4 && bLast4 && deal.last4 === bLast4) {
    score += 30;
    reasons.push('card_last4_match');
  }

  if (b.isUnverifiedPaid || calculateBookingBalances(b).isUnverifiedPaid) {
    reasons.push('unverified_kinorot_payment');
  }

  if (dateDist === 0) {
    score += 15;
    reasons.push('in_house_or_today');
  } else if (dateDist <= 1) {
    score += 12;
    reasons.push('slack_boundary');
  } else if (dateDist <= 5) {
    score += 8;
    reasons.push('recent_checkout');
  } else {
    score += 4;
    reasons.push('older_debt');
  }

  if (canceled) reasons.push('canceled_open_balance');

  const classification = classifyCandidate(dealAmount, dueIls, totalIls);
  const flagFields = flag || (canceled
    ? { ...FLAG_CANCELED }
    : { flagged: false, flagKind: null, flagLabel: null });

  const tag = flagFields.flagged && flagFields.flagLabel
    ? flagFields.flagLabel
    : classification.tag;
  const tagColor = flagFields.flagged ? '#b45309' : classification.tagColor;
  const badgeBg = flagFields.flagged ? '#ffedd5' : classification.badgeBg;

  return {
    bookingId,
    id: bookingId,
    checkoutToken: b.checkout_token || '',
    guestName,
    guestPhone,
    guestEmail: b.guest_email || b.email || '',
    unitId: b.unit_id || '',
    unitName: unitName || 'יחידה',
    checkIn: cin,
    checkOut: cout,
    totalIls,
    dueIls,
    paidIls,
    exactAmountMatch,
    nameSimilarity: nameSim,
    dateDistance: dateDist,
    score,
    reasons,
    canceled,
    ...classification,
    tag,
    tagColor,
    badgeBg,
    ...flagFields
  };
}

/**
 * @param {Object} deal
 * @param {Array} bookings
 * @param {Object} [options] { query, dealDate, limit = 10, includeOlderDebts, mode }
 *   mode: 'default' | 'outside_name'
 */
export function suggestBookingsForDeal(deal, bookings = [], options = {}) {
  const dealAmount = Number(deal?.amount || 0);
  if (!Number.isFinite(dealAmount) || dealAmount <= 0) return [];

  const dealTime = deal?.dealTime || deal?.deal_time || deal?.date;
  const dealDate = options.dealDate || getIsraelDateString(dealTime);
  const query = String(options.query || options.q || '').toLowerCase().trim();
  const limit = Math.max(1, Math.min(Number(options.limit) || 10, 50));
  const payerName = String(deal?.payer_name || deal?.cardOwnerName || '').trim();
  const dealIdStr = String(deal?.dealId || deal?.deal_id || '').trim();
  const mode = options.mode || 'default';

  const candidates = [];

  for (const b of bookings) {
    if (!b) continue;

    const canceled = isCanceledBooking(b);
    if (String(b.booking_status || '').toUpperCase() === 'DELETED' || b.deleted_at) {
      continue;
    }

    const cin = String(b.check_in_date || b.check_in || '').slice(0, 10);
    const cout = String(b.check_out_date || b.check_out || '').slice(0, 10);
    if (!cin || !cout) continue;

    const guestName = String(b.guest_name || b.invoice_name || '').trim();
    const guestPhone = String(b.guest_phone || b.phone || '').trim();
    const unitIdRaw = String(b.unit_id || '').trim();
    const unitName = unitFullName(unitIdRaw, String(b.unit_name || b.unit_id || '').trim());
    const bookingId = String(b.id || '').trim();

    const nameSimPreview = payerName ? nameSimilarityToBooking(payerName, b) : 0;
    const { dueIls, isPaid } = calculateBookingBalances(b);
    if (dueIls <= 0 || isPaid) continue;
    const exactPreview = Math.abs(dealAmount - dueIls) < 0.5;
    const strongName = nameSimPreview >= 0.85;

    if (query) {
      const matchesQuery =
        guestName.toLowerCase().includes(query) ||
        guestPhone.includes(query) ||
        unitName.toLowerCase().includes(query) ||
        String(b.notes || b.note || b.booking_notes || '').toLowerCase().includes(query) ||
        bookingId.toLowerCase().includes(query);
      if (!matchesQuery) continue;
      if (canceled && !(strongName || exactPreview)) continue;

      const built = buildCandidate(b, {
        dealAmount,
        dealIdStr,
        deal,
        payerName,
        dealDate,
        flag: canceled ? FLAG_CANCELED : null
      });
      if (built) candidates.push(built);
      continue;
    }

    if (mode === 'outside_name') {
      if (!strongName) continue;
      if (isBookingInDateWindow(cin, cout, dealDate)) continue;
      if (cin > dealDate) continue;
      if (canceled && !(strongName || exactPreview)) continue;
      const built = buildCandidate(b, {
        dealAmount,
        dealIdStr,
        deal,
        payerName,
        dealDate,
        flag: canceled ? FLAG_CANCELED : FLAG_OUTSIDE_NAME
      });
      if (built) {
        if (canceled) {
          built.flagKind = 'canceled_unpaid';
          built.flagLabel = FLAG_CANCELED.flagLabel;
          built.tag = FLAG_CANCELED.flagLabel;
        } else {
          built.flagKind = 'name_outside_window';
          built.flagLabel = FLAG_OUTSIDE_NAME.flagLabel;
          built.tag = FLAG_OUTSIDE_NAME.flagLabel;
        }
        built.flagged = true;
        candidates.push(built);
      }
      continue;
    }

    const inStay = isBookingInDateWindow(cin, cout, dealDate);
    const inOlderDebt = !inStay && options.includeOlderDebts && isBookingInOlderDebtWindow(cin, cout, dealDate);
    if (!inStay && !inOlderDebt) continue;
    if (cin > dealDate) continue;

    if (canceled) {
      if (!(strongName || exactPreview)) continue;
      const built = buildCandidate(b, {
        dealAmount,
        dealIdStr,
        deal,
        payerName,
        dealDate,
        flag: FLAG_CANCELED
      });
      if (built) candidates.push(built);
      continue;
    }

    const built = buildCandidate(b, {
      dealAmount,
      dealIdStr,
      deal,
      payerName,
      dealDate,
      flag: null
    });
    if (built) candidates.push(built);
  }

  rankCandidates(candidates);
  return candidates.slice(0, limit);
}
