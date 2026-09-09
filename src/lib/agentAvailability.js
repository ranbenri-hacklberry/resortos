export function datesOverlap(aIn, aOut, bIn, bOut) {
  return Boolean(aIn && aOut && bIn && bOut && aIn < bOut && bIn < aOut);
}

export function isCabinDateBlocked(blocked, cabinId, dateIso) {
  const next = addDays(dateIso, 1);
  return (blocked || []).some((row) => (
    row.cabin_id === cabinId && datesOverlap(dateIso, next, row.start_date, row.end_date)
  ));
}

export function stayBlocked(blocked, cabinId, checkIn, checkOut) {
  return (blocked || []).some((row) => (
    row.cabin_id === cabinId && datesOverlap(checkIn, checkOut, row.start_date, row.end_date)
  ));
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    cells.push(`${year}-${m}-${d}`);
  }
  return cells;
}

export function commissionIls(totalIls, rate = 0.1) {
  return Math.round(Number(totalIls || 0) * Number(rate || 0));
}

export function nextStayRange(prev, iso, { today, blocked, cabinId } = {}) {
  const day = String(iso || '');
  if (!day || (today && day < today)) return { ...prev, error: 'PAST' };
  const pickingOut = Boolean(prev?.pickingOut && prev.checkIn && day > prev.checkIn);
  if (pickingOut) {
    if (cabinId && stayBlocked(blocked, cabinId, prev.checkIn, day)) {
      return { ...prev, error: 'DATES_OVERLAP' };
    }
    return { checkIn: prev.checkIn, checkOut: day, pickingOut: false, error: '' };
  }
  if (cabinId && isCabinDateBlocked(blocked, cabinId, day)) {
    return { ...prev, error: 'NIGHT_TAKEN' };
  }
  return { checkIn: day, checkOut: addDays(day, 1), pickingOut: true, error: '' };
}

export function dateStrip(fromIso, count = 14) {
  const start = fromIso || new Date().toISOString().slice(0, 10);
  const weekdays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  return Array.from({ length: Number(count) || 14 }, (_, index) => {
    const iso = addDays(start, index);
    const date = new Date(`${iso}T12:00:00`);
    return {
      iso,
      day: date.getDate(),
      weekday: weekdays[date.getDay()],
      month: date.getMonth() + 1
    };
  });
}

export function cabinIdsBlocked(blocked, cabinIds, checkIn, checkOut) {
  return (cabinIds || []).filter((id) => stayBlocked(blocked, id, checkIn, checkOut));
}
