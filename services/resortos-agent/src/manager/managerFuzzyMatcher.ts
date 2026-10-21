import type { RoomEntry } from '../config.js';
import { formatRoomDisplay } from '../pipeline.js';
import { resolveRoomByAlias } from '../llm/client.js';

export interface ComplexDefinition {
  key: string;
  officialName: string;
  roomIds: string[];
  nicknames: string[];
}

export const COMPLEXES: ComplexDefinition[] = [
  {
    key: 'musical',
    officialName: 'חצר מוזיקלית',
    roomIds: ['k690', 'k691', 'k692'],
    nicknames: [
      'תזמורת', 'תזמורות', 'מוזיקלית', 'מוסיקלית', 'מוזיקה', 'מוסיקה',
      'לבונה', 'חליל', 'מיתר', 'כינור', 'נבל', 'קצב', 'מיוזיקל', 'מיוזיק',
    ],
  },
  {
    key: 'taj',
    officialName: 'טאג׳ מאהל',
    roomIds: ['k808', 'k809', 'k810', 'k811'],
    nicknames: [
      'טאג', "טאג'", 'טג', 'טאג׳', 'מאהל', 'מהאל', 'טאג׳י', 'טאגי', 'לוטוס', 'הודי', 'ארמון',
    ],
  },
  {
    key: 'nofim',
    officialName: 'נופים בלבן',
    roomIds: ['k685', 'k686'],
    nicknames: [
      'נופים', 'נופים בלבן', 'בלבן', 'נוף לבן', 'לבן',
    ],
  },
  {
    key: 'mool',
    officialName: 'מול הנוף',
    roomIds: ['k680', 'k681', 'k682', 'k683', 'k684'],
    nicknames: [
      'מול', 'מול הנוף', 'מול נוף',
    ],
  },
  {
    key: 'nurit',
    officialName: 'בתי נורית',
    roomIds: ['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679'],
    nicknames: [
      'נורית', 'בתי נורית', 'נוריות', 'נורית במושב',
    ],
  },
  {
    key: 'toscana',
    officialName: 'טוסקנה',
    roomIds: ['k687', 'k688', 'k689'],
    nicknames: [
      'טוסקנה', 'טוזקנה', 'טוסקאנה', 'טוסקני', 'איטלקי',
    ],
  },
  {
    key: 'maya',
    officialName: 'בקתות מאיה',
    roomIds: ['k693', 'k694', 'k695'],
    nicknames: [
      'מאיה', 'מיה', 'בקתות מאיה',
    ],
  },
  {
    key: 'hill',
    officialName: 'צימר בגבעה',
    roomIds: ['hill-1', 'hill-2', 'hill-3', 'hill-4'],
    nicknames: [
      'גבעה', 'בגבעה', 'צימר בגבעה', 'בגבע',
    ],
  },
  {
    key: 'casanova',
    officialName: 'קאסה נובה',
    roomIds: ['k826', 'k827'],
    nicknames: [
      'קאסה', 'נובה', 'קאסה נובה', 'אורה', 'בלום', 'קסה נובה',
    ],
  },
  {
    key: 'mialis',
    officialName: 'מיאליס',
    roomIds: ['mialis-villa', 'suite-1', 'suite-2'],
    nicknames: [
      'מיאליס', 'קאסה מיה', 'מיה ליס', 'קאסמיה',
    ],
  },
];

const HEBREW_NUMBERS: Record<string, number> = {
  'אחת': 1, 'אחד': 1, 'ראשונה': 1, 'ראשון': 1, '1': 1, '๑': 1,
  'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שנים': 2, 'שני': 2, 'שניה': 2, 'שנייה': 2, '2': 2, '๒': 2,
  'שלוש': 3, 'שלושה': 3, 'שלישי': 3, 'שלישית': 3, '3': 3, '๓': 3,
  'ארבע': 4, 'ארבעה': 4, 'רביעי': 4, 'רביעית': 4, '4': 4, '๔': 4,
  'חמש': 5, 'חמישה': 5, 'חמישי': 5, 'חמישית': 5, '5': 5, '๕': 5,
  'שש': 6, 'שישה': 6, 'שישי': 6, 'שישית': 6, '6': 6, '๖': 6,
  'שבע': 7, 'שבעה': 7, 'שביעי': 7, 'שביעית': 7, '7': 7, '๗': 7,
  'שמונה': 8, 'שמוני': 8, 'שמיני': 8, 'שמינית': 8, '8': 8, '๘': 8,
};

/**
 * Normalizes voice-dictated numbers in Hebrew into digit tokens.
 * E.g. "תזמורת שתיים" -> "תזמורת 2", "נופים אחת" -> "נופים 1"
 */
export function normalizeSpokenHebrewNumbers(text: string): string {
  let normalized = text;
  for (const [word, num] of Object.entries(HEBREW_NUMBERS)) {
    // Replace standalone word
    const regex = new RegExp(`(^|\\s)${word}(\\s|$|[?!.,])`, 'gi');
    normalized = normalized.replace(regex, `$1${num}$2`);
  }
  return normalized.trim();
}

export type FuzzyMatchResult =
  | { type: 'RESOLVED'; roomId: string; roomLabel: string; confidence: 'HIGH' | 'MEDIUM'; complexName: string }
  | { type: 'AMBIGUOUS_COMPLEX'; complex: ComplexDefinition; candidateRooms: RoomEntry[] }
  | { type: 'AMBIGUOUS_NUMBER'; number: number; candidateRooms: RoomEntry[] }
  | { type: 'NONE' };

export interface RoomDialogContext {
  complexKey?: string;
  /** A unit number the manager typed, not the room already on screen. */
  statedUnit?: number;
}

export function complexOfRoom(roomId: string): ComplexDefinition | undefined {
  return COMPLEXES.find((complex) => complex.roomIds.includes(roomId));
}

export function unitNumberInComplex(complex: ComplexDefinition, roomId: string): number | null {
  const index = complex.roomIds.indexOf(roomId);
  return index >= 0 ? index + 1 : null;
}

export function bareUnitNumber(rawText: string): number | null {
  const text = normalizeSpokenHebrewNumbers(String(rawText || '')).trim();
  const match = text.match(/^(?:בקתה|חדר|יחידה|סוויטה)?\s*([1-8])\s*$/i);
  return match ? Number(match[1]) : null;
}

export function roomIdForUnit(complex: ComplexDefinition, unit: number, rooms: RoomEntry[]): string | null {
  if (unit < 1 || unit > complex.roomIds.length) return null;
  const roomId = complex.roomIds[unit - 1];
  return rooms.some((room) => room.id === roomId) ? roomId : null;
}

function resolvedRoom(roomId: string, rooms: RoomEntry[], complex: ComplexDefinition): FuzzyMatchResult {
  const room = rooms.find((item) => item.id === roomId);
  return {
    type: 'RESOLVED',
    roomId,
    roomLabel: room ? formatRoomDisplay(room.id, rooms) : `${complex.officialName} ${complex.roomIds.indexOf(roomId) + 1}`,
    confidence: 'HIGH',
    complexName: complex.officialName,
  };
}

/**
 * Fills a missing complex or a missing unit from the last couple of turns.
 * "2" after מאיה 1 is מאיה 2. "מאיה" after "2" is also מאיה 2.
 */
export function resolveRoomWithContext(rawText: string, rooms: RoomEntry[], context: RoomDialogContext = {}): FuzzyMatchResult {
  const direct = matchManagerRoomIntent(rawText, rooms);
  if (direct.type === 'RESOLVED') return direct;

  const unit = bareUnitNumber(rawText);
  const namedComplex = direct.type === 'AMBIGUOUS_COMPLEX' ? direct.complex : undefined;
  const rememberedComplex = context.complexKey
    ? COMPLEXES.find((complex) => complex.key === context.complexKey)
    : undefined;

  if (unit) {
    const complex = namedComplex || rememberedComplex;
    if (complex) {
      const roomId = roomIdForUnit(complex, unit, rooms);
      if (roomId) return resolvedRoom(roomId, rooms, complex);
    }
  }

  if (!unit && namedComplex && context.statedUnit) {
    const roomId = roomIdForUnit(namedComplex, context.statedUnit, rooms);
    if (roomId) return resolvedRoom(roomId, rooms, namedComplex);
  }

  return direct;
}

const LETTER_COMPLEX_MAP: Record<string, string[]> = {
  a: ['k680', 'k681', 'k682', 'k683', 'k684'], // מול הנוף 1-5
  b: ['k685', 'k686'],                         // נופים בלבן 1-2
  c: ['k687', 'k688', 'k689'],                 // טוסקנה 1-3
  d: ['k690', 'k691', 'k692'],                 // חצר מוסיקלית 1-3
  e: ['k808', 'k809', 'k810', 'k811'],         // טאג' מאהל 1-4
  f: ['k693', 'k694', 'k695'],                 // בקתות מאיה 1-3
  g: ['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679'], // בתי נורית 1-8
};

/**
 * Parses free-form text from a manager to detect unit references,
 * handling dictation typos, slang ("תזמורת"), letter codes (B1), and complex ambiguity.
 */
export function matchManagerRoomIntent(rawText: string, allRooms: RoomEntry[]): FuzzyMatchResult {
  if (!rawText?.trim()) return { type: 'NONE' };
  const text = normalizeSpokenHebrewNumbers(rawText);
  const lower = text.toLowerCase();

  // 0. Direct letter code match anywhere in text (e.g. "B2", "ל-B2", "מי נכנס ל-b1?", "d1")
  const letterCodeMatch = text.match(/(?:^|[\s.,?!למבכשל\-])([a-gA-G])\s*[-_]?\s*([1-8])(?=[\s.,?!]|$)/);
  if (letterCodeMatch) {
    const letter = letterCodeMatch[1].toLowerCase();
    const num = parseInt(letterCodeMatch[2], 10);
    const complexList = LETTER_COMPLEX_MAP[letter];
    if (complexList && num >= 1 && num <= complexList.length) {
      const roomId = complexList[num - 1];
      const roomObj = allRooms.find((r) => r.id === roomId);
      const roomLabel = roomObj ? formatRoomDisplay(roomObj.id, allRooms) : `${letter.toUpperCase()}${num}`;
      return {
        type: 'RESOLVED',
        roomId,
        roomLabel,
        confidence: 'HIGH',
        complexName: roomObj?.property || letter.toUpperCase(),
      };
    }
  }

  // 1. Check if any complex nickname matches (with support for Hebrew prefixes ב/ל/מ/ה/וכש)
  for (const comp of COMPLEXES) {
    for (const nick of [comp.officialName, ...comp.nicknames]) {
      const nickPattern = nick.replace(/['׳]/g, "['׳]?");

      // First check if nickname has an immediately adjacent or trailing digit
      const adjacentRegex = new RegExp(`(?:^|[\\s.,?!])(?:[בבללממההוכש]-?)?${nickPattern}\\s*[-_]?\\s*([1-8])(?=[\\s.,?!]|$)`, 'i');
      const adjMatch = lower.match(adjacentRegex);

      let unitNum: number | null = null;
      if (adjMatch) {
        unitNum = parseInt(adjMatch[1], 10);
      } else {
        // Check if nickname appears anywhere with a Hebrew prefix
        const baseRegex = new RegExp(`(?:^|[\\s.,?!])(?:[בבללממההוכש]-?)?${nickPattern}(?:\\s|[.,?!]|$)`, 'i');
        if (baseRegex.test(lower)) {
          // Look for any digit 1-8 in the sentence
          const digitMatch = lower.match(/\b([1-8])\b/);
          if (digitMatch) {
            unitNum = parseInt(digitMatch[1], 10);
          }
        } else {
          continue;
        }
      }

      if (unitNum !== null) {
        // High confidence: both complex name and unit number found!
        if (unitNum >= 1 && unitNum <= comp.roomIds.length) {
          const roomId = comp.roomIds[unitNum - 1];
          const roomObj = allRooms.find((r) => r.id === roomId);
          const roomLabel = roomObj ? formatRoomDisplay(roomObj.id, allRooms) : `${comp.officialName} ${unitNum}`;
          return {
            type: 'RESOLVED',
            roomId,
            roomLabel,
            confidence: 'HIGH',
            complexName: comp.officialName,
          };
        }
      }

      // Complex matched, but unit number is missing or out of range!
      const candidateRooms = comp.roomIds
        .map((id) => allRooms.find((r) => r.id === id))
        .filter((r): r is RoomEntry => Boolean(r));

      return {
        type: 'AMBIGUOUS_COMPLEX',
        complex: comp,
        candidateRooms,
      };
    }
  }

  // 2. Bare number without complex (e.g. "בקתה 1" or "חדר 2")
  const bareDigitMatch = lower.match(/\b([1-8])\b/);
  if (/^(?:בקתה|חדר|יחידה|סוויטה)?\s*([1-8])\s*$/i.test(text.trim()) && bareDigitMatch) {
    const unitNum = parseInt(bareDigitMatch[1], 10);
    // Find all cabins with this unit number across complexes
    const candidateRooms: RoomEntry[] = [];
    for (const comp of COMPLEXES) {
      if (unitNum <= comp.roomIds.length) {
        const id = comp.roomIds[unitNum - 1];
        const r = allRooms.find((x) => x.id === id);
        if (r) candidateRooms.push(r);
      }
    }
    if (candidateRooms.length > 1) {
      return {
        type: 'AMBIGUOUS_NUMBER',
        number: unitNum,
        candidateRooms,
      };
    }
  }

  // 3. Direct room alias or office match (e.g. "משרד", "המשרד", "מה קורה במשרד?")
  const directAliasId = resolveRoomByAlias(text, allRooms);
  if (directAliasId) {
    const roomObj = allRooms.find((r) => r.id === directAliasId);
    const roomLabel = roomObj ? formatRoomDisplay(roomObj.id, allRooms) : directAliasId;
    return {
      type: 'RESOLVED',
      roomId: directAliasId,
      roomLabel,
      confidence: 'HIGH',
      complexName: roomObj?.property || roomLabel,
    };
  }
  if (/(?:^|[\s.,?!])(?:[בבללממההוכש]-?)?משרד(?:\s|[.,?!]|$)/i.test(lower)) {
    const officeObj = allRooms.find((r) => r.id === 'pilot-office');
    if (officeObj) {
      return {
        type: 'RESOLVED',
        roomId: 'pilot-office',
        roomLabel: formatRoomDisplay('pilot-office', allRooms),
        confidence: 'HIGH',
        complexName: officeObj.property || 'משרד',
      };
    }
  }

  return { type: 'NONE' };
}

/**
 * Formats a clear interactive prompt when a manager specifies a complex without unit number.
 */
export function formatComplexClarificationPrompt(
  complexName: string,
  candidateRooms: RoomEntry[],
  allRooms: RoomEntry[],
  extras: { label: string }[] = [],
  /** Bug B (Ran 2026-10-20): current status per unit id, shown next to each unit; omitted when unknown. */
  statuses: Record<string, string> = {}
): string {
  let msg = `🤔 זיהיתי שהתכוונת למתחם *${complexName}*.\nבאיזו יחידה מדובר?\n\n`;
  candidateRooms.forEach((r, idx) => {
    const label = formatRoomDisplay(r.id, allRooms);
    const status = statuses[r.id] ? ` · ${statuses[r.id]}` : '';
    msg += `*${idx + 1}* - ${label}${status}\n`;
  });
  extras.forEach((row, idx) => {
    msg += `*${candidateRooms.length + idx + 1}* - ${row.label}\n`;
  });
  msg += `\nהשב במספר הבחירה (למשל: *1*, *2*...)`;
  return msg;
}

/**
 * Formats a clarification prompt when a number is provided without complex.
 */
export function formatNumberClarificationPrompt(
  unitNum: number,
  candidateRooms: RoomEntry[],
  allRooms: RoomEntry[]
): string {
  let msg = `ישנן מספר יחידות עם המספר *${unitNum}*.\nלאיזה מתחם התכוונת?\n\n`;
  candidateRooms.forEach((r, idx) => {
    const label = formatRoomDisplay(r.id, allRooms);
    msg += `*${idx + 1}* - ${label}\n`;
  });
  msg += `\nהשב במספר הבחירה`;
  return msg;
}
