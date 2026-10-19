import type { RoomEntry } from '../config.js';
import { matchManagerRoomIntent } from '../manager/managerFuzzyMatcher.js';

export interface RackRate {
  label: string;
  unitIds: string[];
  occupancy: string;
  pool: string;
  weekday: number;
  weekend: number;
}

/** Printed price list: per night, weekend is Thursday and Friday. */
export const RACK_RATES: RackRate[] = [
  { label: 'מאיה 1 ו-3', unitIds: ['k693', 'k695'], occupancy: 'זוג', pool: 'פרטית · 28°', weekday: 750, weekend: 1300 },
  { label: 'מאיה · בקתה 2', unitIds: ['k694'], occupancy: 'זוג', pool: 'בלי בריכה', weekday: 600, weekend: 900 },
  { label: 'החצר המוסיקלית', unitIds: ['k690', 'k691', 'k692'], occupancy: 'זוג', pool: 'מרכזית · 28°', weekday: 600, weekend: 900 },
  { label: 'נופים בלבן', unitIds: ['k685', 'k686'], occupancy: 'זוג + 2', pool: 'פרטית · 28°', weekday: 750, weekend: 1200 },
  { label: 'טוסקנה 1 ו-2', unitIds: ['k687', 'k688'], occupancy: 'זוג + 2', pool: 'מרכזית · 28°', weekday: 600, weekend: 900 },
  { label: 'טוסקנה · שאטו', unitIds: ['k689'], occupancy: 'זוג + 5', pool: 'מרכזית · 28°', weekday: 850, weekend: 1500 },
  { label: 'בתי נורית · זוג (1, 4, 7, 8)', unitIds: ['k671', 'k675', 'k678', 'k679'], occupancy: 'זוג', pool: 'מרכזית · 28°', weekday: 500, weekend: 900 },
  { label: 'בתי נורית · זוג + 2 (2, 3, 5, 6)', unitIds: ['k673', 'k674', 'k676', 'k677'], occupancy: 'זוג + 2', pool: 'מרכזית · 28°', weekday: 800, weekend: 1300 },
  { label: 'טאג׳ מאהל', unitIds: ['k808', 'k809', 'k810', 'k811'], occupancy: 'זוג', pool: 'מרכזית · 28°', weekday: 800, weekend: 1200 },
  { label: 'מול הנוף · זוגי (1, 4, 5)', unitIds: ['k680', 'k683', 'k684'], occupancy: 'זוג', pool: 'מרכזית · 28°', weekday: 500, weekend: 900 },
  { label: 'מול הנוף · זוג + 2 (2, 3)', unitIds: ['k681', 'k682'], occupancy: 'זוג + 2', pool: 'מרכזית · 28°', weekday: 800, weekend: 1300 },
  { label: 'מיאליס · סוויטות', unitIds: ['suite-1', 'suite-2'], occupancy: 'זוג + 2', pool: 'פרטית · 28°', weekday: 800, weekend: 1200 },
  { label: 'מיאליס · וילה', unitIds: ['mialis-villa'], occupancy: 'וילה', pool: 'פרטית · 28°', weekday: 2800, weekend: 3800 },
  { label: 'צימר בגבעה', unitIds: ['hill-1', 'hill-2', 'hill-3', 'hill-4'], occupancy: 'זוג + 2', pool: 'מרכזית · 28°', weekday: 700, weekend: 1100 },
  { label: 'כיפת שמיים', unitIds: ['dome-blue', 'dome-red', 'dome-green'], occupancy: 'זוג', pool: 'פרטית · 28°', weekday: 1200, weekend: 1500 },
  { label: 'קאסה נובה', unitIds: ['k826', 'k827'], occupancy: 'זוג + 2', pool: 'פרטית', weekday: 800, weekend: 1200 },
];

export const MIALIS_CLOSE = {
  label: 'סגירת מיאליס (וילה + שתי סוויטות)',
  weekday: 4400,
  weekend: 6200,
};

const PAYMENT_WORDS = /שולם|שולמ|שילמ|תשלום|יתרה|חוב|מקדמה|חשבונית|קבלה/;
const RACK_WORDS = /מחירון|מה המחיר|כמה עולה|כמה ללילה|מחיר ללילה|מחיר של/;

const rateByUnit = new Map<string, RackRate>();
for (const rate of RACK_RATES) {
  for (const id of rate.unitIds) rateByUnit.set(id, rate);
}

function shekel(amount: number): string {
  return `₪${amount.toLocaleString('he-IL')}`;
}

function line(rate: RackRate): string {
  return `• *${rate.label}* — אמצ״ש ${shekel(rate.weekday)} · סופ״ש ${shekel(rate.weekend)} · ${rate.occupancy}`;
}

function unitLine(rate: RackRate, room?: RoomEntry): string {
  const name = room?.name || rate.label;
  return (
    `מחירון *${name}*\n` +
    `אמצ״ש: *${shekel(rate.weekday)}*\n` +
    `סופ״ש: *${shekel(rate.weekend)}*\n` +
    `תפוסה: ${rate.occupancy}`
  );
}

export function isRackRateQuestion(text: string): boolean {
  const q = text.trim();
  if (!q || PAYMENT_WORDS.test(q)) return false;
  return RACK_WORDS.test(q);
}

function mentionsMialisClose(text: string): boolean {
  return /מיאליס/.test(text) && /סגיר|וילה\s*\+|שתי הסוויטות|כל המתחם/.test(text);
}

function domeAsked(text: string): boolean {
  return /כיפ[תה]|כיפת שמיים|dome/i.test(text);
}

function ratesForUnits(ids: string[]): RackRate[] {
  const seen = new Set<string>();
  const rates: RackRate[] = [];
  for (const id of ids) {
    const rate = rateByUnit.get(id);
    if (!rate || seen.has(rate.label)) continue;
    seen.add(rate.label);
    rates.push(rate);
  }
  return rates;
}

function formatRates(title: string, rates: RackRate[], withClose = false): string {
  const body = rates.map(line).join('\n');
  const close = withClose
    ? `\n• *${MIALIS_CLOSE.label}* — אמצ״ש ${shekel(MIALIS_CLOSE.weekday)} · סופ״ש ${shekel(MIALIS_CLOSE.weekend)}`
    : '';
  return `מחירון *${title}*\nמחיר ללילה. סופ״ש: חמישי ושישי.\n${body}${close}`;
}

export function formatFullPriceList(): string {
  return (
    `מחירון מתחמים · מחיר ללילה\n` +
    `סופ״ש: חמישי ושישי.\n\n` +
    RACK_RATES.map(line).join('\n') +
    `\n• *${MIALIS_CLOSE.label}* — אמצ״ש ${shekel(MIALIS_CLOSE.weekday)} · סופ״ש ${shekel(MIALIS_CLOSE.weekend)}`
  );
}

/**
 * Rack-rate answer for staff. Returns null when the message is not a price-list question,
 * so payment questions keep the manager-only path.
 */
export function answerRackRate(text: string, rooms: RoomEntry[], contextRoomId?: string): string | null {
  if (!isRackRateQuestion(text)) return null;
  if (mentionsMialisClose(text)) {
    return (
      `*${MIALIS_CLOSE.label}*\n` +
      `אמצ״ש: *${shekel(MIALIS_CLOSE.weekday)}*\n` +
      `סופ״ש: *${shekel(MIALIS_CLOSE.weekend)}*`
    );
  }

  if (domeAsked(text) && matchManagerRoomIntent(text, rooms).type !== 'RESOLVED') {
    const dome = RACK_RATES.find((rate) => rate.unitIds.includes('dome-blue'));
    if (dome) return unitLine(dome);
  }

  const fuzzy = matchManagerRoomIntent(text, rooms);
  if (fuzzy.type === 'RESOLVED') {
    const rate = rateByUnit.get(fuzzy.roomId);
    const room = rooms.find((item) => item.id === fuzzy.roomId);
    if (rate) return unitLine(rate, room);
  }
  if (fuzzy.type === 'AMBIGUOUS_COMPLEX' || fuzzy.type === 'AMBIGUOUS_NUMBER') {
    const ids = fuzzy.candidateRooms.map((room) => room.id);
    const rates = ratesForUnits(ids);
    if (rates.length === 1) return unitLine(rates[0]);
    if (rates.length > 1) {
      const title = fuzzy.type === 'AMBIGUOUS_COMPLEX' ? fuzzy.complex.officialName : 'היחידות';
      const withClose = fuzzy.type === 'AMBIGUOUS_COMPLEX' && fuzzy.complex.key === 'mialis';
      return formatRates(title, rates, withClose);
    }
  }

  if (contextRoomId) {
    const rate = rateByUnit.get(contextRoomId);
    const room = rooms.find((item) => item.id === contextRoomId);
    if (rate) return unitLine(rate, room);
  }

  if (/מחירון|מה המחיר|כמה עולה/.test(text)) return formatFullPriceList();
  return null;
}
