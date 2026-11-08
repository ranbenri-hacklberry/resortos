/**
 * Cardcom Match Candidates / Suggestions
 * Server-side suggestion generator for unassigned Cardcom terminal deals.
 *
 * Rule (server-side, in the suggestions endpoint):
 * - A deal at date D (Asia/Jerusalem) may be suggested only for bookings where:
 *   check_in <= D+1 day AND check_out >= D-1 day (stayed in or around the charge date, with one day of slack on each side).
 *   Example: stay 8->9, charge on 8 or 9 = shown.
 * - Plus a backwards search for older debts: bookings that checked out up to 14 days BEFORE D and are still unpaid or partially paid.
 * - Never bookings with check_in > D+1. No future bookings.
 * - Only bookings with balance > 0 (UNPAID/PARTIAL per the money record). Exclude cancelled ones.
 * - Rank: exact amount match to balance first, then name similarity, then date proximity. Max 10 candidates.
 * - Manual search (by name/phone) stays available as an explicit fallback, but the default list is limited by the rule above.
 */

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
  const totalIls = Math.round(totalAgorot / 100);
  const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];

  const verifiedAgorot = clearing
    .filter((p) => !isUnverifiedKinorotPayment(p))
    .reduce((sum, p) => {
      const val = Number(p.amount_agorot ? p.amount_agorot : (Number(p.amount_ils || p.amount || 0) * 100));
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

  const verifiedPaidIls = Math.round(verifiedAgorot / 100);

  const hasOnlyUnverifiedKinorot = clearing.length > 0 && clearing.every(isUnverifiedKinorotPayment);
  const isUnverifiedPaid = String(b.payment_status || '').toUpperCase() === 'PAID' && hasOnlyUnverifiedKinorot;

  const dueIls = isUnverifiedPaid && verifiedPaidIls === 0 ? totalIls : Math.max(0, totalIls - verifiedPaidIls);
  const depositIls = Math.round(Number(b.deposit_agorot ? b.deposit_agorot / 100 : b.deposit || 0));

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

/**
 * Computes calendar day distance between a stay [cin, cout] and deal date D.
 * 0 if stay overlaps D. Otherwise days between closest edge and D.
 */
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

/**
 * Checks if a booking falls within the allowed candidate window for deal date D.
 * - check_in <= D + 1 (never future bookings > D+1)
 * - check_out >= D - 14 (stayed around D with 1 day slack or checked out up to 14 days before D)
 */
export function isBookingInDateWindow(cin, cout, dealDate) {
  if (!cin || !cout || !dealDate) return false;
  const dCin = cin.slice(0, 10);
  const dCout = cout.slice(0, 10);
  const dTarget = dealDate.slice(0, 10);

  const dPlus1 = shiftDays(dTarget, 1);
  const dMinus14 = shiftDays(dTarget, -14);

  // Never bookings with check_in > D+1
  if (dCin > dPlus1) return false;

  // Bookings checked out up to 14 days before D (or stayed around D)
  if (dCout < dMinus14) return false;

  return true;
}

/**
 * Classifies a deal against a booking's balance for UI tags & descriptions.
 */
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
      description: `סוגר את מלוא היתרה (₪${due.toLocaleString('he-IL')})`
    };
  }

  if (due > 0 && dealAmount < due) {
    const rem = due - dealAmount;
    return {
      type: 'partial_payment',
      priority: 2,
      tag: 'תשלום חלקי',
      tagColor: '#2563eb',
      badgeBg: '#dbeafe',
      description: `יסגור ₪${dealAmount.toLocaleString('he-IL')} מתוך ₪${due.toLocaleString('he-IL')} (תישאר יתרה ₪${rem.toLocaleString('he-IL')})`
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
      description: `יסגור את כל היתרה ₪${due.toLocaleString('he-IL')} (עודף: ₪${surplus.toLocaleString('he-IL')})`
    };
  }

  return {
    type: 'open_balance',
    priority: 4,
    tag: 'יתרה פתוחה',
    tagColor: '#475569',
    badgeBg: '#f1f5f9',
    description: `יתרה: ₪${due.toLocaleString('he-IL')}`
  };
}

/**
 * Server-side suggestion engine for unassigned Cardcom terminal deals.
 *
 * @param {Object} deal { amount, dealTime, deal_time, payer_name, cardOwnerName, dealId, deal_id }
 * @param {Array} bookings List of bookings from DB / PostgREST
 * @param {Object} [options] { query, dealDate, limit = 10 }
 * @returns {Array} Top suggested candidates up to `limit` (default 10)
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

  const candidates = [];

  for (const b of bookings) {
    if (!b) continue;
    if (b.booking_status === 'CANCELED' || b.booking_status === 'DELETED' || b.deleted_at) {
      continue;
    }

    // Check if already linked
    const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];
    if (dealIdStr) {
      const alreadyLinked = clearing.some((row) => (
        String(row.deal_number || row.txn || '').trim() === dealIdStr
        || (deal.approval && String(row.approval || row.ref || '').trim() === String(deal.approval).trim())
      ));
      if (alreadyLinked) continue;
    }

    const { totalIls, dueIls, isPaid } = calculateBookingBalances(b);

    // Only bookings with balance > 0 (UNPAID/PARTIAL per money record). Exclude paid bookings.
    if (dueIls <= 0 || isPaid) {
      continue;
    }

    const cin = String(b.check_in_date || b.check_in || '').slice(0, 10);
    const cout = String(b.check_out_date || b.check_out || '').slice(0, 10);
    if (!cin || !cout) continue;

    const guestName = String(b.guest_name || b.invoice_name || '').trim();
    const guestPhone = String(b.guest_phone || b.phone || '').trim();
    const unitName = String(b.unit_name || b.unit_id || '').trim();
    const bookingId = String(b.id || '').trim();

    // If manual search query is provided: explicit fallback searching by name or phone
    if (query) {
      const matchesQuery =
        guestName.toLowerCase().includes(query) ||
        guestPhone.includes(query) ||
        unitName.toLowerCase().includes(query) ||
        bookingId.toLowerCase().includes(query);
      if (!matchesQuery) continue;
    } else {
      // Default list: strictly enforce date window rule
      if (!isBookingInDateWindow(cin, cout, dealDate)) {
        continue;
      }
    }

    const exactAmountMatch = Math.abs(dealAmount - dueIls) < 0.5;
    const nameSim = payerName ? nameSimilarity(payerName, guestName) : 0;
    const dateDist = computeDateDistance(cin, cout, dealDate);

    const deposit20Ils = Math.round(totalIls * 0.20);
    const depositIls = Math.round((Number(b.deposit_agorot) || 0) / 100);
    const isExact20Deposit = deposit20Ils > 0 && Math.abs(dealAmount - deposit20Ils) < 0.5;
    const isExactDeposit = depositIls > 0 && Math.abs(dealAmount - depositIls) < 0.5;

    // Compute heuristic score (0-100) and human-readable reasons
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

    const classification = classifyCandidate(dealAmount, dueIls, totalIls);

    candidates.push({
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
      paidIls: totalIls - dueIls,
      exactAmountMatch,
      nameSimilarity: nameSim,
      dateDistance: dateDist,
      score,
      reasons,
      ...classification
    });
  }

  // Rank: exact amount match to balance first, then name similarity, then date proximity.
  candidates.sort((a, b) => {
    // 1. Exact amount match to balance first
    const aExact = a.exactAmountMatch ? 1 : 0;
    const bExact = b.exactAmountMatch ? 1 : 0;
    if (aExact !== bExact) {
      return bExact - aExact;
    }

    // 2. Name similarity second
    if (Math.abs(b.nameSimilarity - a.nameSimilarity) > 0.05) {
      return b.nameSimilarity - a.nameSimilarity;
    }

    // 3. Date proximity third (smaller distance first)
    if (a.dateDistance !== b.dateDistance) {
      return a.dateDistance - b.dateDistance;
    }

    // Secondary stable sort: newer check-in date first, then ID
    const dateCmp = b.checkIn.localeCompare(a.checkIn);
    if (dateCmp !== 0) return dateCmp;
    return a.bookingId.localeCompare(b.bookingId);
  });

  return candidates.slice(0, limit);
}
