export function normalizeStaffPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`;
  return digits;
}

export function staffPhoneLabel(person) {
  const phone = normalizeStaffPhone(person?.phone);
  const whatsapp = normalizeStaffPhone(person?.whatsapp_phone);
  const bits = [];
  if (phone) bits.push(phone);
  if (whatsapp && whatsapp !== phone) bits.push(`WA ${whatsapp}`);
  return bits.join(' · ');
}

export function staffOptionName(person) {
  return String(person?.display_name || person?.username || person?.name || '').trim();
}

export function assignableStaffOptions(staff, sessionUser, currentName) {
  const rows = [];
  const seen = new Set();
  for (const person of [...(staff || []), sessionUser].filter(Boolean)) {
    const name = staffOptionName(person);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    rows.push({ id: String(person.id || name), name });
  }
  const current = String(currentName || '').trim();
  if (current && !seen.has(current)) {
    rows.unshift({ id: 'current', name: current });
  }
  return rows;
}
