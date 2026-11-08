/**
 * Cardcom Match Candidates Helper
 *
 * Evaluates bookings against a Cardcom transaction amount,
 * highlighting exact full payments, deposit payments, and partial payments
 * that close part of an unpaid balance.
 */

export function isUnverifiedKinorotPayment(p) {
  if (!p) return false;
  const meth = String(p.method || p.source || '').toUpperCase();
  const hasTxn = Boolean(p.deal_number || p.txn || p.approval || p.deal_id);
  return (meth === 'KINOROT' || meth.startsWith('KINOROT_')) && !hasTxn;
}

export function calculateBookingBalances(b) {
  if (!b) return { totalIls: 0, paidIls: 0, dueIls: 0, depositIls: 0, isUnpaid: false, isUnverifiedPaid: false };

  const totalIls = Math.round(Number(b.total_price_agorot ? b.total_price_agorot / 100 : b.total_price || 0));
  const clearing = Array.isArray(b.clearing_payments) ? b.clearing_payments : [];

  const verifiedPaidIls = clearing
    .filter((p) => !isUnverifiedKinorotPayment(p))
    .reduce((sum, p) => {
      const val = Number(p.amount_agorot ? p.amount_agorot / 100 : p.amount_ils || 0);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

  const hasOnlyUnverifiedKinorot = clearing.length > 0 && clearing.every(isUnverifiedKinorotPayment);
  const isUnverifiedPaid = String(b.payment_status || '').toUpperCase() === 'PAID' && hasOnlyUnverifiedKinorot;

  const dueIls = isUnverifiedPaid && verifiedPaidIls === 0 ? totalIls : Math.max(0, Math.round(totalIls - verifiedPaidIls));
  const depositIls = Math.round(Number(b.deposit_agorot ? b.deposit_agorot / 100 : b.deposit || 0));
  const isPaid = !isUnverifiedPaid && (String(b.payment_status || '').toUpperCase() === 'PAID' || (totalIls > 0 && dueIls <= 0));
  const isUnpaid = isUnverifiedPaid || (!isPaid && (dueIls > 0 || totalIls === 0));

  return {
    totalIls,
    paidIls: Math.round(verifiedPaidIls),
    dueIls,
    depositIls,
    isPaid,
    isUnpaid,
    isUnverifiedPaid
  };
}

export function classifyDealToBooking(dealAmountNum, booking) {
  const dealAmount = Math.round(Number(dealAmountNum || 0));
  const { totalIls, dueIls, depositIls, isUnpaid, isUnverifiedPaid } = calculateBookingBalances(booking);

  if (!isUnpaid && dueIls <= 0) {
    return {
      type: 'already_paid',
      priority: 99,
      tag: 'שולמה במלואה',
      tagColor: '#64748b',
      description: 'ההזמנה כבר שולמה במלואה',
      remainingAfterPayment: 0,
      dueIls,
      totalIls
    };
  }

  // 1. Exact balance match (Full close)
  if (dueIls > 0 && Math.abs(dealAmount - dueIls) < 1) {
    return {
      type: 'exact_due',
      priority: 1,
      tag: isUnverifiedPaid ? 'אימות תשלום קינורות' : 'סגירה מלאה',
      tagColor: '#16a34a',
      badgeBg: '#dcfce7',
      description: isUnverifiedPaid
        ? `מאמת תשלום קינורות וסוגר את מלוא היתרה (₪${dueIls.toLocaleString('he-IL')})`
        : `סוגר את מלוא היתרה (₪${dueIls.toLocaleString('he-IL')})`,
      remainingAfterPayment: 0,
      dueIls,
      totalIls
    };
  }

  // 2. Exact configured deposit match
  if (depositIls > 0 && Math.abs(dealAmount - depositIls) < 1) {
    const rem = Math.max(0, dueIls - dealAmount);
    return {
      type: 'exact_deposit',
      priority: 2,
      tag: 'מקדמה מדויקת',
      tagColor: '#0d9488',
      badgeBg: '#ccfbf1',
      description: `סוגר מקדמה ₪${depositIls.toLocaleString('he-IL')} (תישאר יתרה ₪${rem.toLocaleString('he-IL')})`,
      remainingAfterPayment: rem,
      dueIls,
      totalIls
    };
  }

  // 3. Exact 20% deposit match
  const deposit20Ils = Math.round(totalIls * 0.20);
  if (deposit20Ils > 0 && Math.abs(dealAmount - deposit20Ils) < 1) {
    const rem = Math.max(0, dueIls - dealAmount);
    return {
      type: 'exact_20_deposit',
      priority: 2,
      tag: 'מקדמה 20%',
      tagColor: '#0d9488',
      badgeBg: '#ccfbf1',
      description: `סוגר מקדמת 20% (₪${deposit20Ils.toLocaleString('he-IL')}) מתוך ₪${totalIls.toLocaleString('he-IL')} (תישאר יתרה ₪${rem.toLocaleString('he-IL')})`,
      remainingAfterPayment: rem,
      dueIls,
      totalIls
    };
  }

  // 3. Partial payment (Closes part of due balance)
  if (dueIls > 0 && dealAmount < dueIls) {
    const rem = dueIls - dealAmount;
    return {
      type: 'partial_payment',
      priority: 3,
      tag: 'תשלום חלקי',
      tagColor: '#2563eb',
      badgeBg: '#dbeafe',
      description: `יסגור ₪${dealAmount.toLocaleString('he-IL')} מתוך ₪${dueIls.toLocaleString('he-IL')} (תישאר יתרה ₪${rem.toLocaleString('he-IL')})`,
      remainingAfterPayment: rem,
      dueIls,
      totalIls
    };
  }

  // 4. Overpayment (Covers entire balance with surplus)
  if (dueIls > 0 && dealAmount > dueIls) {
    const surplus = dealAmount - dueIls;
    return {
      type: 'overpayment',
      priority: 4,
      tag: 'סגירת יתרה + עודף',
      tagColor: '#d97706',
      badgeBg: '#fef3c7',
      description: `יסגור את כל היתרה ₪${dueIls.toLocaleString('he-IL')} (עודף: ₪${surplus.toLocaleString('he-IL')})`,
      remainingAfterPayment: 0,
      dueIls,
      totalIls
    };
  }

  return {
    type: 'open_balance',
    priority: 5,
    tag: 'יתרה פתוחה',
    tagColor: '#475569',
    badgeBg: '#f1f5f9',
    description: `יתרה: ₪${dueIls.toLocaleString('he-IL')}`,
    remainingAfterPayment: Math.max(0, dueIls - dealAmount),
    dueIls,
    totalIls
  };
}

/**
 * Returns candidate unpaid bookings evaluated against a deal amount.
 */
export function getCandidateUnpaidBookings(dealAmountNum, bookings = [], query = '') {
  const dealAmount = Number(dealAmountNum || 0);
  const q = String(query || '').toLowerCase().trim();

  const candidates = [];

  for (const b of bookings) {
    if (!b || b.deleted_at || b.booking_status === 'CANCELED' || b.booking_status === 'DELETED') {
      continue;
    }

    const { isUnpaid, dueIls, totalIls } = calculateBookingBalances(b);
    if (!isUnpaid && dueIls <= 0) continue;

    const guestName = String(b.guest_name || b.invoice_name || 'אורח').trim();
    const unitName = String(b.unit_name || b.unit_id || '').trim();
    const guestPhone = String(b.guest_phone || b.phone || '').trim();
    const cin = String(b.check_in_date || '').slice(0, 10);
    const cout = String(b.check_out_date || '').slice(0, 10);

    // Search query match
    if (q) {
      const matchQuery = guestName.toLowerCase().includes(q)
        || unitName.toLowerCase().includes(q)
        || guestPhone.includes(q)
        || cin.includes(q)
        || cout.includes(q);
      if (!matchQuery) continue;
    }

    const classification = classifyDealToBooking(dealAmount, b);

    candidates.push({
      bookingId: b.id,
      guestName,
      unitName,
      guestPhone,
      checkIn: cin,
      checkOut: cout,
      totalIls,
      dueIls,
      ...classification
    });
  }

  // Sort by priority (exact full first, then exact deposit, then partial payment, then overpayment, then by date)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.checkIn || '').localeCompare(a.checkIn || '');
  });

  return candidates;
}
