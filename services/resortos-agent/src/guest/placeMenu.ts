import { kw, ATTRACTIONS_RE, COFFEE_RE, FOOD_MENU_RE, FUEL_RE, GROCERY_MENU_RE, MEAT_MEAL_RE, NATURE_RE } from './keywords.js';
/** Numbered area places. A follow-up number returns hours, phone and navigation. */

type GuidePlace = {
  id: string;
  title: string;
  kind?: string;
  dist?: string;
  hours?: string;
  desc?: string;
  phone?: string;
  wazeUrl?: string;
  mapsUrl?: string;
};

type GuideModule = {
  SHOPS: GuidePlace[];
  RESTAURANTS: GuidePlace[];
  TRAILS: GuidePlace[];
  ATTRACTIONS: GuidePlace[];
  mapsUrlFromWaze: (wazeUrl: string) => string;
};

type Range = { open: number; close: number; closeKnown: boolean };

const DAY_NAME = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const LETTER: Record<string, number> = { א: 0, ב: 1, ג: 2, ד: 3, ה: 4, ו: 5, ש: 6 };

let guidePromise: Promise<GuideModule> | null = null;

function loadGuide(): Promise<GuideModule> {
  if (!guidePromise) {
    const href = new URL('../../../../src/lib/areaGuide.js', import.meta.url).href;
    guidePromise = import(href) as Promise<GuideModule>;
  }
  return guidePromise;
}

function minutesOf(clock: string): number {
  const [hour, minute] = clock.split(':').map((part) => Number(part));
  return hour * 60 + minute;
}

function clockOf(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayToken(raw: string): number | null {
  const token = raw.replace(/['׳״"]/g, '');
  if (token.startsWith('שבת')) return 6;
  if (token.startsWith('שישי')) return 5;
  if (token.startsWith('ראשון')) return 0;
  return LETTER[token[0]] ?? null;
}

function spanDays(start: number, end: number): number[] {
  const days: number[] = [];
  let cursor = start;
  for (let step = 0; step < 7; step += 1) {
    days.push(cursor);
    if (cursor === end) break;
    cursor = (cursor + 1) % 7;
  }
  return days;
}

function daysIn(segment: string): number[] {
  const found = new Set<number>();
  const pattern = /שבת|שישי|ראשון|([אבגדהוש])['׳]?/g;
  const tokens: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(segment))) tokens.push(dayToken(match[0]) ?? -1);
  const ranges = segment.split(/ו־|ו-|,\s*/);
  if (tokens.length >= 2 && /[-–]/.test(segment)) {
    const pair = segment.match(/(שבת|שישי|ראשון|[אבגדהוש]['׳]?)\s*[-–]\s*(שבת|שישי|ראשון|[אבגדהוש]['׳]?)/);
    if (pair) {
      const start = dayToken(pair[1]);
      const end = dayToken(pair[2]);
      if (start != null && end != null) return spanDays(start, end);
    }
  }
  for (const token of tokens) if (token >= 0) found.add(token);
  for (const part of ranges) {
    const pair = part.match(/(שבת|שישי|ראשון|[אבגדהוש]['׳]?)\s*[-–]\s*(שבת|שישי|ראשון|[אבגדהוש]['׳]?)/);
    if (!pair) continue;
    const start = dayToken(pair[1]);
    const end = dayToken(pair[2]);
    if (start == null || end == null) continue;
    spanDays(start, end).forEach((day) => found.add(day));
  }
  return [...found];
}

/** Weekly ranges. Null when the hours sentence cannot be read as a clock. */
export function parseHours(hours: string): Range[][] | null {
  const text = String(hours || '').trim();
  if (!text) return null;
  if (/24\s*\/\s*7|24 שעות|פתוח תמיד|כל היממה|כל השעות/.test(text)) {
    return Array.from({ length: 7 }, () => [{ open: 0, close: 24 * 60, closeKnown: true }]);
  }
  const week: Range[][] = Array.from({ length: 7 }, () => []);
  let saw = false;
  for (const segment of text.split('·')) {
    const days = daysIn(segment);
    const ranges: Range[] = [];
    const pairs = segment.matchAll(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/g);
    for (const pair of pairs) ranges.push({ open: minutesOf(pair[1]), close: minutesOf(pair[2]), closeKnown: true });
    const fromOnly = segment.match(/מ[-־]?\s*(\d{1,2}:\d{2})/);
    if (!ranges.length && fromOnly) ranges.push({ open: minutesOf(fromOnly[1]), close: 24 * 60, closeKnown: false });
    const untilOnly = segment.match(/עד\s*(\d{1,2}:\d{2})/);
    if (/סגור/.test(segment) && days.length) {
      saw = true;
      continue;
    }
    if (!ranges.length) continue;
    saw = true;
    const targets = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
    for (const day of targets) {
      if (untilOnly && week[day].length && !segment.match(/(\d{1,2}:\d{2})\s*[-–]/)) {
        week[day] = week[day].map((range) => ({ ...range, close: minutesOf(untilOnly[1]), closeKnown: true }));
      } else if (days.length || !week[day].length) {
        week[day] = ranges.map((range) => ({ ...range }));
      }
    }
  }
  return saw ? week : null;
}

export function jerusalemClock(now: Date): { day: number; minutes: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const week: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(parts.hour);
  return { day: week[parts.weekday] ?? 0, minutes: (hour === 24 ? 0 : hour) * 60 + Number(parts.minute) };
}

export function openStatus(hours: string | undefined, now: Date): string {
  const week = parseHours(hours || '');
  if (!week) return hours ? `שעות: ${hours}` : '';
  const { day, minutes } = jerusalemClock(now);
  const today = week[day] || [];
  const current = today.find((range) => minutes >= range.open && minutes < range.close);
  if (current) {
    if (current.open === 0 && current.close >= 24 * 60) return 'פתוח עכשיו, כל היממה.';
    if (!current.closeKnown) return `פתוח עכשיו, משעה ${clockOf(current.open)}.`;
    return `פתוח עכשיו. נסגר ב-${clockOf(current.close)}.`;
  }
  const later = today.find((range) => range.open > minutes);
  if (later) return `סגור עכשיו. נפתח היום ב-${clockOf(later.open)}.`;
  for (let step = 1; step <= 7; step += 1) {
    const nextDay = (day + step) % 7;
    const next = week[nextDay]?.[0];
    if (!next) continue;
    const when = step === 1 ? 'מחר' : `ביום ${DAY_NAME[nextDay]}`;
    return `סגור עכשיו. נפתח ${when} ב-${clockOf(next.open)}.`;
  }
  return hours ? `סגור. ${hours}` : 'סגור.';
}

const GROCERY = ['shop_ramot_super', 'shop_bnei_yehuda_super', 'shop_alon_haon', 'shop_ramot_gas', 'shop_katzrin_mall'];
const GAS = ['shop_ramot_gas', 'shop_alon_haon', 'shop_givat_gas'];
const COFFEE = ['food_hamitbach', 'food_breakfast_club', 'food_moize', 'food_moulan', 'food_nahtom'];
const FOOD = ['food_moshbutz', 'food_bakata', 'food_ohad', 'food_thai', 'food_marinado', 'food_fish', 'food_bazelet', 'food_hamitbach'];
const NATURE = ['trail_majrase', 'trail_kanaf', 'trail_meshushim', 'trail_ofir', 'trail_susita', 'trail_kinar', 'trail_gofra'];
const BREAKFAST_ONLY = new Set(['food_hamitbach']);
const DINNER_RE = kw(['ארוחת ערב', 'ארוחות ערב', 'לארוחת ערב', 'dinner', 'supper']);
export const PLACE_MENU_FOOTER = 'השיבו במספר מהרשימה (למשל 1) לקבלת טלפון, שעות וניווט.';
const ATTRACTION = ['attr_abukayak', 'attr_hamat_gader', 'attr_golan_winery', 'attr_jeeps'];

async function byIds(list: GuidePlace[], ids: string[]): Promise<GuidePlace[]> {
  const map = new Map(list.map((place) => [place.id, place]));
  return ids.map((id) => map.get(id)).filter((place): place is GuidePlace => Boolean(place));
}

export async function placeMenuFor(question: string): Promise<{ text: string; ids: string[] } | null> {
  const q = String(question || '');
  const guide = await loadGuide();
  let places: GuidePlace[] = [];
  let heading = '';
  if (FUEL_RE.test(q) && !GROCERY_MENU_RE.test(q)) {
    places = await byIds(guide.SHOPS, GAS);
    heading = 'איפה מתדלקים';
  } else if (GROCERY_MENU_RE.test(q)) {
    places = await byIds(guide.SHOPS, GROCERY);
    heading = 'איפה קונים';
  } else if (COFFEE_RE.test(q) && !MEAT_MEAL_RE.test(q)) {
    places = await byIds(guide.RESTAURANTS, COFFEE);
    heading = 'איפה שותים קפה';
  } else if (FOOD_MENU_RE.test(q)) {
    // S14: a dinner question drops the breakfast/pizza-delivery-only place.
    const ids = DINNER_RE.test(q) ? FOOD.filter((id) => !BREAKFAST_ONLY.has(id)) : FOOD;
    places = await byIds(guide.RESTAURANTS, ids);
    heading = 'איפה אוכלים';
  } else if (NATURE_RE.test(q)) {
    places = await byIds(guide.TRAILS, NATURE);
    heading = 'לאן יוצאים';
  } else if (ATTRACTIONS_RE.test(q)) {
    places = await byIds(guide.ATTRACTIONS, ATTRACTION);
    heading = 'אטרקציות';
  }
  if (!places.length) return null;
  const lines = places.map((place, index) => {
    const what = [place.kind, place.dist].filter(Boolean).join(' · ');
    return `${index + 1}. *${place.title}*${what ? `\n${what}` : ''}`;
  });
  return {
    ids: places.map((place) => place.id),
    text: `${heading}:\n${lines.join('\n')}\n\n${PLACE_MENU_FOOTER}`,
  };
}

async function findPlace(id: string): Promise<GuidePlace | null> {
  const guide = await loadGuide();
  return [...guide.SHOPS, ...guide.RESTAURANTS, ...guide.TRAILS, ...guide.ATTRACTIONS].find((place) => place.id === id) || null;
}

export async function placeDetail(id: string, now = new Date()): Promise<string> {
  const place = await findPlace(id);
  if (!place) return '';
  const guide = await loadGuide();
  const maps = place.mapsUrl || (place.wazeUrl ? guide.mapsUrlFromWaze(place.wazeUrl) : '');
  const lines = [
    `*${place.title}*`,
    [place.dist, place.desc].filter(Boolean).join('. '),
    openStatus(place.hours, now),
    /לא תמיד|לוודא|בדרך כלל|לעיתים/.test(place.hours || '') ? place.hours || '' : '',
    place.phone ? `טלפון: ${place.phone}` : '',
    place.wazeUrl ? `וויז: ${place.wazeUrl}` : '',
    maps ? `גוגל מפות: ${maps}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
