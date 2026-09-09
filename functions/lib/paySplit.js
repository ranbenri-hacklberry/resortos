export function normalizePaySplit(value, cabinCount) {
  if (Number(cabinCount) < 2) return 'together';
  if (value === 'per_cabin' || value === 'together') return value;
  return '';
}

export function stayCabinIds(booking) {
  return [...new Set([].concat(
    booking?.stay?.cabin_ids || booking?.cabin_ids || booking?.unit_id
  ).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function bookerCabinId(booking) {
  const stay = booking?.stay || {};
  return String(stay.booker_cabin_id || stayCabinIds(booking)[0] || booking?.unit_id || '');
}

export function cabinQuotesOrEqual(cabinIds, totalAgorot, quotes) {
  const ids = (cabinIds || []).map((id) => String(id || '').trim()).filter(Boolean);
  const total = Math.max(0, Math.round(Number(totalAgorot) || 0));
  const incoming = Array.isArray(quotes) ? quotes : [];
  const mapped = ids.map((id) => {
    const found = incoming.find((row) => String(row.cabin_id) === id);
    return {
      cabin_id: id,
      total_agorot: Math.max(0, Math.round(Number(found?.total_agorot) || 0)),
      deposit_agorot: Math.max(0, Math.round(Number(found?.deposit_agorot) || 0))
    };
  });
  const sum = mapped.reduce((acc, row) => acc + row.total_agorot, 0);
  if (ids.length && sum > 0 && Math.abs(sum - total) <= ids.length) return mapped;
  const n = Math.max(1, ids.length);
  const each = Math.floor(total / n);
  return ids.map((id, index) => ({
    cabin_id: id,
    total_agorot: index === n - 1 ? total - each * (n - 1) : each,
    deposit_agorot: 0
  }));
}

export function splitRemainders(quotes, paySplit, bookerId, groupDepositAgorot) {
  const deposit = Math.max(0, Math.round(Number(groupDepositAgorot) || 0));
  return (quotes || []).map((row) => {
    const credit = paySplit === 'per_cabin' && row.cabin_id === bookerId ? deposit : 0;
    return {
      ...row,
      remainder_agorot: Math.max(0, Number(row.total_agorot || 0) - credit)
    };
  });
}

export function allCabinsPaid(stay) {
  const ids = stayCabinIds({ stay });
  if (!ids.length) return Boolean(stay?.balance_paid);
  return ids.every((id) => Boolean(stay?.cabin_paid?.[id]?.paid));
}

export function markCabinPaid(stay, cabinId, extra = {}) {
  const id = String(cabinId || '');
  return {
    ...stay,
    cabin_paid: {
      ...(stay?.cabin_paid || {}),
      [id]: { paid: true, at: extra.at || new Date().toISOString(), ...extra }
    }
  };
}

export function resolveStayUnitId(booking, raw) {
  const ids = stayCabinIds(booking);
  const wanted = String(raw || '').trim();
  if (wanted && ids.includes(wanted)) return wanted;
  return String(booking?.unit_id || ids[0] || '');
}

export function applyPaySplitView(booking, unitId) {
  if (!booking) return booking;
  const stay = booking.stay || {};
  const viewId = resolveStayUnitId(booking, unitId);
  const party = (stay.cabin_parties || []).find((row) => row.cabin_id === viewId);
  const next = {
    ...booking,
    unit_id: viewId || booking.unit_id,
    guest_name: party?.occupant_name || booking.guest_name,
    guest_phone: party?.occupant_phone || booking.guest_phone
  };
  if (stay.pay_split !== 'per_cabin') return next;

  const quotes = stay.cabin_quotes || [];
  const quote = quotes.find((row) => row.cabin_id === viewId);
  const bookerId = bookerCabinId(booking);
  const groupDeposit = Number(booking.deposit_agorot) || 0;
  const cabinPaid = Boolean(stay.cabin_paid?.[viewId]?.paid);
  const depositPaid = Boolean(stay.hyp_deposit?.paid)
    || booking.payment_status === 'DEPOSIT_PAID'
    || booking.payment_status === 'PAID'
    || booking.payment_status === 'PARTIAL';

  if (quote) {
    next.total_price_agorot = Number(quote.total_agorot) || 0;
    next.deposit_agorot = viewId === bookerId ? groupDeposit : 0;
  }
  next.clearing_payments = [];

  if (cabinPaid) {
    next.payment_status = 'PAID';
    next.balance_paid = true;
    next.stay = { ...stay, hyp: { ...(stay.hyp || {}), paid: true } };
    return next;
  }

  if (viewId === bookerId && depositPaid) {
    next.payment_status = 'DEPOSIT_PAID';
    next.stay = { ...stay, hyp: stay.hyp?.paid && allCabinsPaid(stay) ? stay.hyp : { ...(stay.hyp || {}), paid: false } };
    return next;
  }

  next.payment_status = 'UNPAID';
  next.balance_paid = false;
  next.stay = {
    ...stay,
    hyp: { ...(stay.hyp || {}), paid: false },
    hyp_deposit: null
  };
  return next;
}
