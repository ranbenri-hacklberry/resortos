/**
 * Compact Israel Sukkot markers for the occupancy calendar header.
 * Dates from Hebcal Israel (i=on): ערב סוכות → חג א׳ → חוה״מ → ערב חג ב׳ (הושענא רבה) → חג ב׳ (שמיני עצרת).
 */

const SHORT = {
  erev_sukkot: 'ערב סוכ׳',
  sukkot: 'חג סוכ׳',
  chol_hamoed: 'חוה״מ',
  erev_second: 'ערב חג ב׳',
  second: 'חג ב׳'
};

const TITLE = {
  erev_sukkot: 'ערב סוכות',
  sukkot: 'חג סוכות',
  chol_hamoed: 'חול המועד',
  erev_second: 'ערב חג שני (הושענא רבה)',
  second: 'חג שני (שמיני עצרת / שמחת תורה)'
};

/** First day of Sukkot (ט״ו תשרי) per Gregorian year — Israel calendar. */
const SUKKOT_I_BY_YEAR = {
  2024: '2024-10-17',
  2025: '2025-10-07',
  2026: '2026-09-26',
  2027: '2027-10-16',
  2028: '2028-10-05',
  2029: '2029-09-24',
  2030: '2030-10-12',
  2031: '2031-10-02',
  2032: '2032-09-20'
};

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mark(id) {
  return {
    id,
    short: SHORT[id],
    label: TITLE[id],
    title: TITLE[id]
  };
}

/** Build date → marker map covering every Sukkot season we know. */
function buildSukkotMap() {
  const map = Object.create(null);
  for (const sukkotI of Object.values(SUKKOT_I_BY_YEAR)) {
    map[addDaysIso(sukkotI, -1)] = mark('erev_sukkot');
    map[sukkotI] = mark('sukkot');
    for (let offset = 1; offset <= 5; offset += 1) {
      map[addDaysIso(sukkotI, offset)] = mark('chol_hamoed');
    }
    map[addDaysIso(sukkotI, 6)] = mark('erev_second'); // הושענא רבה
    map[addDaysIso(sukkotI, 7)] = mark('second'); // שמיני עצרת
  }
  return map;
}

const SUKKOT_MARKERS = buildSukkotMap();

export function jewishHolidayMarker(dateStr) {
  const day = String(dateStr || '').slice(0, 10);
  return SUKKOT_MARKERS[day] || null;
}

export function jewishHolidayShort(dateStr) {
  return jewishHolidayMarker(dateStr)?.short || '';
}
