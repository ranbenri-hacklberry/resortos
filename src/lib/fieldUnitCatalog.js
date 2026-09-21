/**
 * Field-ops catalog: property names, cabin aliases, Thai visual signs, nav links.
 * Used by voice task dictation + Field board cards.
 * Nav URLs come from guest PROPERTY_SEED via stayProperty (exact query / placeId / waze).
 */
import { googleMapsUrl, wazeUrl as unitWazeUrl } from './stayProperty';
import { PROPERTY_SEED, UNIT_PROPERTY as SEED_UNIT_PROPERTY } from './guestProfileSeed';

/** unitId → propertyId (same as guestProfileSeed) */
export const UNIT_PROPERTY = { ...SEED_UNIT_PROPERTY };

/** Thai site map legend: circled letter + plot number next to complex name. */
export const THAI_COMPLEX_LEGEND = {
  mool: { code: 29, letter: 'A', circled: 'Ⓐ' },
  nofim: { code: 28, letter: 'B', circled: 'Ⓑ' },
  toscana: { code: 27, letter: 'C', circled: 'Ⓒ' },
  musical: { code: 26, letter: 'D', circled: 'Ⓓ' },
  taj: { code: 27, letter: 'E', circled: 'Ⓔ' },
  maya: { code: 24, letter: 'F', circled: 'Ⓕ' },
  nurit: { code: 23, letter: 'G', circled: 'Ⓖ' }
};

const LEGEND_BADGE_RE = /^[ⒶⒷⒸⒹⒺⒻⒼ](?:\d{2})?\s+/;
const LEGEND_PLOT_RE = /([ⒶⒷⒸⒹⒺⒻⒼ])\d{2}/g;

export function legendForProperty(propertyId) {
  return THAI_COMPLEX_LEGEND[propertyId] || null;
}

/** Circled letter only — the plot number is not shown in ops titles. */
export function legendBadge(propertyId) {
  const row = legendForProperty(propertyId);
  if (!row) return '';
  return row.circled;
}

/** Drop plot numbers glued to Thai map letters: Ⓐ29 → Ⓐ */
export function stripLegendPlotNumber(name) {
  return String(name || '').replace(LEGEND_PLOT_RE, '$1').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Strip a previously applied Thai map badge from a unit/property label. */
export function stripLegendBadge(name) {
  return stripLegendPlotNumber(String(name || '').replace(LEGEND_BADGE_RE, '')).trim();
}

/**
 * Field / Thai-staff display name: Ⓐ מול הנוף · בקתה 1
 */
const MUSICAL_CABIN_NUM = { k690: 1, k691: 2, k692: 3 };

const MUSICAL_INSTRUMENT_NUM = [
  [/חליל|Khalil|خاليل|คาลีล/gi, 1],
  [/מיתר|Meitar|ميتار|เมตาร์/gi, 2],
  [/פעמון|Paamon|باعمون|พาอามอน/gi, 3]
];

function withMusicalCabinNumber(unitId, name) {
  const fromId = MUSICAL_CABIN_NUM[String(unitId || '')];
  let raw = String(name || '');
  if (!raw) return name;
  let num = fromId;
  for (const [re, n] of MUSICAL_INSTRUMENT_NUM) {
    re.lastIndex = 0;
    if (!re.test(raw)) continue;
    re.lastIndex = 0;
    if (!num) num = n;
    raw = raw.replace(re, `בקתה ${num}`);
  }
  if (!num) return raw;
  const cabin = `בקתה ${num}`;
  if (raw.includes(cabin)) return raw;
  if (fromId && raw.includes('·')) return raw.replace(/·\s*.+$/, `· ${cabin}`);
  return raw;
}

export function fieldUnitDisplayName(unitOrId, fallback = '') {
  const id = typeof unitOrId === 'object' ? unitOrId?.id : unitOrId;
  const raw = typeof unitOrId === 'object'
    ? (unitOrId?.name || fallback || String(id || ''))
    : (fallback || String(unitOrId || ''));
  const propertyId = propertyIdForUnit(id)
    || (/מוסיקלית|מוזיקלית|Musikalit/i.test(String(raw || '')) ? 'musical' : '');
  const badge = legendBadge(propertyId);
  const base = withMusicalCabinNumber(id, stripLegendBadge(raw));
  if (!badge) return base || stripLegendPlotNumber(raw);
  if (base.startsWith(badge)) return base;
  return `${badge} ${base}`.trim();
}

export function fieldPropertyDisplayName(propertyId, heName = '') {
  const meta = getPropertyMeta(propertyId);
  const badge = legendBadge(propertyId);
  const base = stripLegendBadge(heName || meta?.he || propertyId || '');
  if (!badge) return base;
  return `${badge} ${base}`.trim();
}

export const FIELD_PROPERTIES = {
  mialis: {
    id: 'mialis',
    he: 'מיאליס ריזורט',
    th: 'มีอาลีส',
    aliases: ['מיאליס', 'מיהליס', 'mialees', 'mialis', 'וילה']
  },
  hill: {
    id: 'hill',
    he: 'צימר בגבעה',
    th: 'เนินเขา',
    aliases: ['בגבעה', 'גבעה', 'צימר בגבעה', 'bagiva', 'hill']
  },
  kipat: {
    id: 'kipat',
    he: 'כיפת שמיים',
    th: 'โดม',
    aliases: ['כיפה', 'כיפת שמיים', 'kipat', 'dome', 'דום']
  },
  nurit: {
    id: 'nurit',
    he: 'בתי נורית',
    th: 'นูริต',
    code: 23,
    letter: 'G',
    circled: 'Ⓖ',
    aliases: ['נורית', 'בתי נורית', 'nurit', 'g', 'Ⓖ', '23', '23g', 'g23']
  },
  taj: {
    id: 'taj',
    he: "טאג' מאהל",
    th: 'ทัชมาฮาล',
    code: 27,
    letter: 'E',
    circled: 'Ⓔ',
    aliases: ['טאג', "טאג'", 'טאג׳', 'טאג מאהל', "טאג' מאהל", 'taj', 'taj mahal', 'e', 'Ⓔ', '27e', 'e27']
  },
  mool: {
    id: 'mool',
    he: 'מול הנוף',
    th: 'มูลฮานอฟ',
    code: 29,
    letter: 'A',
    circled: 'Ⓐ',
    aliases: ['מול הנוף', 'מול נוף', 'מולהנוף', 'mool', 'mul hanof', 'a', 'Ⓐ', '29', '29a', 'a29']
  },
  nofim: {
    id: 'nofim',
    he: 'נופים בלבן',
    th: 'โนฟิม',
    code: 28,
    letter: 'B',
    circled: 'Ⓑ',
    aliases: ['נופים', 'נופים בלבן', 'nofim', 'b', 'Ⓑ', '28', '28b', 'b28']
  },
  toscana: {
    id: 'toscana',
    he: 'טוסקנה',
    th: 'ทอสคานา',
    code: 27,
    letter: 'C',
    circled: 'Ⓒ',
    aliases: ['טוסקנה', 'טוסקאנה', 'toscana', 'tuscany', 'c', 'Ⓒ', '27c', 'c27']
  },
  musical: {
    id: 'musical',
    he: 'חצר מוסיקלית',
    th: 'ลานดนตรี',
    code: 26,
    letter: 'D',
    circled: 'Ⓓ',
    aliases: ['מוסיקלית', 'מוזיקלית', 'חצר מוסיקלית', 'musical', 'd', 'Ⓓ', '26', '26d', 'd26']
  },
  maya: {
    id: 'maya',
    he: 'בקתות מאיה',
    th: 'มายา',
    code: 24,
    letter: 'F',
    circled: 'Ⓕ',
    aliases: ['מאיה', 'בקתות מאיה', 'maya', 'f', 'Ⓕ', '24', '24f', 'f24']
  },
  siesta: {
    id: 'siesta',
    he: 'סייסטה',
    th: 'ซิเอสตา',
    aliases: ['סייסטה', 'סייסטא', 'siesta']
  },
  'casa-nova': {
    id: 'casa-nova',
    he: 'קאסה נובה',
    th: 'คาซาโนวา',
    aliases: ['קאסה', 'קאסה נובה', 'casa', 'casa nova', 'casanova']
  }
};

/** Visual / Thai signs Thai housekeepers already use on site. */
export const FIELD_UNIT_SIGNS = {
  'lab-kinneret': { sign: '🌊', th: 'คินเนเรต', he: 'כנרת', localNum: null, aliases: ['כנרת', 'lab'] },
  'hill-1': { sign: '1️⃣', th: 'เนิน 1', he: 'גבעה 1', localNum: 1, aliases: ['גבעה 1', 'בגבעה 1'] },
  'hill-2': { sign: '2️⃣', th: 'เนิน 2', he: 'גבעה 2', localNum: 2, aliases: ['גבעה 2', 'בגבעה 2'] },
  'hill-3': { sign: '3️⃣', th: 'เนิน 3', he: 'גבעה 3', localNum: 3, aliases: ['גבעה 3', 'בגבעה 3'] },
  'hill-4': { sign: '4️⃣', th: 'เนิน 4', he: 'גבעה 4', localNum: 4, aliases: ['גבעה 4', 'בגבעה 4'] },
  'dome-blue': { sign: '🔵', th: 'โดมสีน้ำเงิน', he: 'כיפה כחול', localNum: null, aliases: ['כחול', 'כיפה כחול', 'dome blue'] },
  'dome-red': { sign: '🔴', th: 'โดมสีแดง', he: 'כיפה אדום', localNum: null, aliases: ['אדום', 'כיפה אדום', 'dome red'] },
  'dome-green': { sign: '🟢', th: 'โดมสีเขียว', he: 'כיפה ירוק', localNum: null, aliases: ['ירוק', 'כיפה ירוק', 'dome green'] },
  'mialis-villa': { sign: '🏡', th: 'วิลล่ามีอาลีส', he: 'וילה', localNum: null, aliases: ['וילה', 'וילה מיאליס', 'villa'] },
  'suite-1': { sign: '🟢', th: 'สวีทสีเขียว', he: 'סוויטה ירוקה', localNum: 1, aliases: ['סוויטה 1', 'ירוקה', 'הירוקה', 'suite 1'] },
  'suite-2': { sign: '🩷', th: 'สวีทสีชมพู', he: 'סוויטה ורודה', localNum: 2, aliases: ['סוויטה 2', 'ורודה', 'הורודה', 'suite 2'] },
  k671: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 1', he: 'נורית 1', localNum: 1, aliases: ['נורית 1', 'g1', '23g'] },
  k673: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 2', he: 'נורית 2', localNum: 2, aliases: ['נורית 2', 'g2'] },
  k674: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 3', he: 'נורית 3', localNum: 3, aliases: ['נורית 3', 'g3'] },
  k675: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 4', he: 'נורית 4', localNum: 4, aliases: ['נורית 4', 'g4'] },
  k676: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 5', he: 'נורית 5', localNum: 5, aliases: ['נורית 5', 'g5'] },
  k677: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 6', he: 'נורית 6', localNum: 6, aliases: ['נורית 6', 'g6'] },
  k678: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 7', he: 'נורית 7', localNum: 7, aliases: ['נורית 7', 'g7'] },
  k679: { sign: 'Ⓖ', th: 'Ⓖ23 นูริต 8', he: 'נורית 8', localNum: 8, aliases: ['נורית 8', 'g8'] },
  k808: { sign: 'Ⓔ', th: 'Ⓔ27 ทัช 1', he: "טאג' 1", localNum: 1, aliases: ['טאג 1', "טאג' 1", 'e1'] },
  k809: { sign: 'Ⓔ', th: 'Ⓔ27 ทัช 2', he: "טאג' 2", localNum: 2, aliases: ['טאג 2', "טאג' 2", 'e2'] },
  k810: { sign: 'Ⓔ', th: 'Ⓔ27 ทัช 3', he: "טאג' 3", localNum: 3, aliases: ['טאג 3', "טאג' 3", 'e3'] },
  k811: { sign: 'Ⓔ', th: 'Ⓔ27 ทัช 4', he: "טאג' 4", localNum: 4, aliases: ['טאג 4', "טאג' 4", 'e4'] },
  k680: { sign: 'Ⓐ', th: 'Ⓐ29 มูล 1', he: 'מול הנוף 1', localNum: 1, aliases: ['מול הנוף 1', 'מול 1', 'a1', '29a'] },
  k681: { sign: 'Ⓐ', th: 'Ⓐ29 มูล 2', he: 'מול הנוף 2', localNum: 2, aliases: ['מול הנוף 2', 'מול 2', 'a2'] },
  k682: { sign: 'Ⓐ', th: 'Ⓐ29 มูล 3', he: 'מול הנוף 3', localNum: 3, aliases: ['מול הנוף 3', 'מול 3', 'a3'] },
  k683: { sign: 'Ⓐ', th: 'Ⓐ29 มูล 4', he: 'מול הנוף 4', localNum: 4, aliases: ['מול הנוף 4', 'מול 4', 'a4'] },
  k684: { sign: 'Ⓐ', th: 'Ⓐ29 มูล 5', he: 'מול הנוף 5', localNum: 5, aliases: ['מול הנוף 5', 'מול 5', 'a5'] },
  k685: { sign: 'Ⓑ', th: 'Ⓑ28 โนฟิม 1', he: 'נופים 1', localNum: 1, aliases: ['נופים 1', 'נופים בלבן 1', 'b1', '28b'] },
  k686: { sign: 'Ⓑ', th: 'Ⓑ28 โนฟิม 2', he: 'נופים 2', localNum: 2, aliases: ['נופים 2', 'נופים בלבן 2', 'b2'] },
  k687: { sign: 'Ⓒ', th: 'Ⓒ27 ฟิเรนเซ 1', he: 'פירנצה 1', localNum: 1, aliases: ['פירנצה 1', 'פירנצה', 'c1', '27c'] },
  k688: { sign: 'Ⓒ', th: 'Ⓒ27 ฟิเรนเซ 2', he: 'פירנצה 2', localNum: 2, aliases: ['פירנצה 2', 'c2'] },
  k689: { sign: 'Ⓒ', th: 'Ⓒ27 ชาโต', he: 'שאטו', localNum: 3, aliases: ['שאטו', 'chateau', 'castle', 'c3'] },
  k690: { sign: 'Ⓓ', th: 'Ⓓ 1', he: 'מוסיקלית 1', localNum: 1, aliases: ['חליל', 'flute', 'd1', '26d', 'בקתה 1', '690'] },
  k691: { sign: 'Ⓓ', th: 'Ⓓ 2', he: 'מוסיקלית 2', localNum: 2, aliases: ['מיתר', 'string', 'd2', 'בקתה 2', '691'] },
  k692: { sign: 'Ⓓ', th: 'Ⓓ 3', he: 'מוסיקלית 3', localNum: 3, aliases: ['פעמון', 'bell', 'd3', 'בקתה 3', '692'] },
  k693: { sign: 'Ⓕ', th: 'Ⓕ24 มายา 1', he: 'מאיה 1', localNum: 1, aliases: ['מאיה 1', 'f1', '24f'] },
  k694: { sign: 'Ⓕ', th: 'Ⓕ24 มายา 2', he: 'מאיה 2', localNum: 2, aliases: ['מאיה 2', 'f2'] },
  k695: { sign: 'Ⓕ', th: 'Ⓕ24 มายา 3', he: 'מאיה 3', localNum: 3, aliases: ['מאיה 3', 'f3'] },
  k618: { sign: '👨‍👩‍👧', th: 'ครอบครัว 1', he: 'משפחתית 1', localNum: 1, aliases: ['משפחתית 1', 'סייסטה 1'] },
  k619: { sign: '👨‍👩‍👧', th: 'ครอบครัว 2', he: 'משפחתית 2', localNum: 2, aliases: ['משפחתית 2', 'סייסטה 2'] },
  k620: { sign: '💕', th: 'โรแมนติก 3', he: 'רומנטית 3', localNum: 3, aliases: ['רומנטית 3', 'סייסטה 3'] },
  k621: { sign: '💕', th: 'โรแมนติก 4', he: 'רומנטית 4', localNum: 4, aliases: ['רומנטית 4', 'סייסטה 4'] },
  k622: { sign: '🧜‍♀️', th: 'นางเงือก 5', he: 'בת הים 5', localNum: 5, aliases: ['בת הים 5', 'סייסטה 5'] },
  k623: { sign: '🧜‍♀️', th: 'นางเงือก 6', he: 'בת הים 6', localNum: 6, aliases: ['בת הים 6', 'סייסטה 6'] },
  k826: { sign: '✨', th: 'Aura', he: 'Aura', localNum: 1, aliases: ['aura', 'אורה'] },
  k827: { sign: '🌸', th: 'Bloom', he: 'Bloom', localNum: 2, aliases: ['bloom', 'בלום'] }
};

function normalizeSpeech(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['׳"״]/g, '')
    .replace(/[־–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function propertyIdForUnit(unitId) {
  return UNIT_PROPERTY[String(unitId || '')] || null;
}

export function getPropertyMeta(propertyId) {
  return FIELD_PROPERTIES[propertyId] || null;
}

export function listFieldComplexes() {
  return Object.values(FIELD_PROPERTIES).map((row) => ({
    id: row.id,
    label: fieldPropertyDisplayName(row.id, row.he)
  }));
}

export function getUnitSign(unitId) {
  return FIELD_UNIT_SIGNS[String(unitId || '')] || null;
}

export function navLinksForUnit(unitId) {
  const id = String(unitId || '');
  if (!id) return null;
  const propertyId = propertyIdForUnit(id);
  const property = getPropertyMeta(propertyId);
  const waze = unitWazeUrl(id);
  const maps = googleMapsUrl(id);
  if (!waze && !maps) return null;
  const seedQuery = PROPERTY_SEED[propertyId]?.content?.nav?.query || '';
  return {
    propertyId,
    propertyHe: property?.he || seedQuery || id,
    propertyTh: property?.th || '',
    wazeUrl: waze,
    mapsUrl: maps
  };
}

export function catalogPromptBlock() {
  const lines = [];
  for (const prop of Object.values(FIELD_PROPERTIES)) {
    const unitIds = Object.entries(UNIT_PROPERTY)
      .filter(([, pid]) => pid === prop.id)
      .map(([uid]) => uid);
    const unitBits = unitIds.map((uid) => {
      const sign = FIELD_UNIT_SIGNS[uid];
      if (!sign) return uid;
      return `${uid}=${sign.he}/${sign.th}/${sign.sign}`;
    });
    lines.push(
      `${prop.id}: ${prop.he} (${prop.th}) aliases=[${prop.aliases.join(', ')}] units=[${unitBits.join('; ')}]`
    );
  }
  return lines.join('\n');
}

/**
 * Resolve a spoken / AI-hinted cabin against live inventory.
 */
export function resolveFieldUnit(units, hints = {}, spokenText = '') {
  const list = Array.isArray(units) ? units.filter((u) => u?.id) : [];
  const byId = new Map(list.map((u) => [u.id, u]));

  if (hints.unit_id && byId.has(hints.unit_id)) {
    return enrichResolved(byId.get(hints.unit_id));
  }

  const hay = normalizeSpeech([
    spokenText,
    hints.property_name,
    hints.unit_label,
    hints.unit_name,
    hints.task_he,
    hints.task_translated
  ].filter(Boolean).join(' · '));

  let propertyId = hints.property_id || null;
  if (!propertyId && hay) {
    let best = null;
    let bestLen = 0;
    for (const prop of Object.values(FIELD_PROPERTIES)) {
      for (const alias of [prop.he, prop.th, ...prop.aliases]) {
        const needle = normalizeSpeech(alias);
        if (needle.length >= 2 && hay.includes(needle) && needle.length > bestLen) {
          best = prop.id;
          bestLen = needle.length;
        }
      }
    }
    propertyId = best;
  }

  // Distinctive unit aliases / signs (flute, pink suite, red dome…)
  const aliasHits = [];
  for (const [unitId, sign] of Object.entries(FIELD_UNIT_SIGNS)) {
    if (!byId.has(unitId)) continue;
    if (propertyId && propertyIdForUnit(unitId) !== propertyId) continue;
    for (const alias of sign.aliases || []) {
      const needle = normalizeSpeech(alias);
      if (needle.length >= 2 && hay.includes(needle)) {
        aliasHits.push({ unitId, score: needle.length });
      }
    }
    if (sign.th && hay.includes(normalizeSpeech(sign.th))) {
      aliasHits.push({ unitId, score: normalizeSpeech(sign.th).length + 2 });
    }
  }
  if (aliasHits.length) {
    aliasHits.sort((a, b) => b.score - a.score);
    const top = aliasHits[0];
    const uniqueTop = aliasHits.filter((h) => h.score === top.score);
    if (uniqueTop.length === 1 || new Set(uniqueTop.map((h) => h.unitId)).size === 1) {
      return enrichResolved(byId.get(top.unitId));
    }
  }

  const num = hints.unit_number == null || hints.unit_number === ''
    ? null
    : Number(hints.unit_number);
  const spokenNum = (() => {
    if (Number.isFinite(num)) return num;
    const m = hay.match(/(?:בקתה|cabin|צימר|סוויטה|suite|חדר|นูริต|ทัช|มายา|มูล)?\s*([0-9]{1,2})\b/);
    return m ? Number(m[1]) : null;
  })();

  if (Number.isFinite(spokenNum)) {
    const candidates = list.filter((unit) => {
      if (propertyId && propertyIdForUnit(unit.id) !== propertyId) return false;
      const sign = FIELD_UNIT_SIGNS[unit.id];
      if (sign?.localNum === spokenNum) return true;
      const name = String(unit.name || '');
      return new RegExp(`(?:בקתה|cabin|צימר|suite|סוויטה|נורית)?\\s*${spokenNum}\\b`, 'i').test(name)
        || new RegExp(`(?:^|[^0-9])${spokenNum}(?:$|[^0-9])`).test(name);
    });
    // Bare number without property is always ambiguous across complexes.
    if (!propertyId) return null;
    if (candidates.length === 1) return enrichResolved(candidates[0]);
    if (candidates.length > 1) {
      const inProp = candidates.filter((u) => propertyIdForUnit(u.id) === propertyId);
      if (inProp.length === 1) return enrichResolved(inProp[0]);
      if (inProp.length) return enrichResolved(inProp[0]);
    }
  }

  // Property-only mention with a single obvious unit is rare — leave unresolved.
  return null;
}

function enrichResolved(unit) {
  if (!unit) return null;
  const sign = getUnitSign(unit.id);
  const nav = navLinksForUnit(unit.id);
  const property = getPropertyMeta(propertyIdForUnit(unit.id));
  const legend = legendForProperty(property?.id);
  return {
    unit,
    unit_id: unit.id,
    unit_name: fieldUnitDisplayName(unit),
    property_id: property?.id || null,
    property_he: property ? fieldPropertyDisplayName(property.id, property.he) : null,
    property_th: property?.th || null,
    legend_letter: legend?.letter || '',
    legend_code: legend?.code ?? null,
    legend_circled: legend?.circled || '',
    thai_sign: sign?.sign || legend?.circled || '',
    thai_label: sign?.th || '',
    sign_he: sign?.he || '',
    local_num: sign?.localNum ?? null,
    wazeUrl: nav?.wazeUrl || '',
    mapsUrl: nav?.mapsUrl || ''
  };
}

export function extractUnitNumber(hints = {}, spokenText = '') {
  const num = hints.unit_number == null || hints.unit_number === ''
    ? null
    : Number(hints.unit_number);
  if (Number.isFinite(num)) return num;
  const hay = normalizeSpeech([spokenText, hints.task_he, hints.unit_label].filter(Boolean).join(' '));
  const m = hay.match(/(?:בקתה|cabin|צימר|סוויטה|suite|חדר)\s*([0-9]{1,2})\b/)
    || hay.match(/\b([0-9]{1,2})\b/);
  return m ? Number(m[1]) : null;
}

export function unitsMatchingNumber(units, unitNumber) {
  const num = Number(unitNumber);
  if (!Number.isFinite(num)) return [];
  const list = Array.isArray(units) ? units.filter((u) => u?.id) : [];
  return list.filter((unit) => {
    const sign = FIELD_UNIT_SIGNS[unit.id];
    if (sign?.localNum === num) return true;
    const name = String(unit.name || '');
    return new RegExp(`(?:בקתה|cabin|צימר|suite|סוויטה|נורית)?\\s*${num}\\b`, 'i').test(name)
      || new RegExp(`(?:^|[^0-9])${num}(?:$|[^0-9])`).test(name);
  });
}

export function candidatePropertiesForNumber(units, unitNumber) {
  const matches = unitsMatchingNumber(units, unitNumber);
  const seen = new Set();
  const out = [];
  for (const unit of matches) {
    const pid = propertyIdForUnit(unit.id);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    const meta = getPropertyMeta(pid);
    if (meta) out.push(meta);
  }
  return out;
}

/** Clarifying / meta speech that must not become a new board task. */
export function isClarificationUtterance(text) {
  const hay = normalizeSpeech(text);
  if (!hay) return false;
  return (
    /באיזה\s*מתחם/.test(hay)
    || /איזה\s*מתחם/.test(hay)
    || /באיזה\s*(חדר|בקתה|צימר)/.test(hay)
    || /which\s*(complex|property|area|cabin|room)/.test(hay)
    || /where\s*(is|was)\s*(this|that|it)/.test(hay)
    || /לא\s*הבנתי\s*מתחם/.test(hay)
    || /תגיד\s*מתחם/.test(hay)
  );
}

/**
 * Merge AI task_data with client-side catalog resolution.
 * Never accepts a bare cabin number without an explicit property.
 */
export function enrichTaskData(taskData, { units = [], spokenText = '', property_id = null } = {}) {
  const base = taskData && typeof taskData === 'object' ? { ...taskData } : {};
  if (property_id) base.property_id = property_id;

  const resolved = resolveFieldUnit(units, base, spokenText || base.task_he || '');
  if (resolved?.unit_id && resolved.property_id) {
    return {
      ...base,
      unit_id: resolved.unit_id,
      unit_number: base.unit_number ?? resolved.local_num,
      unit_name: resolved.unit_name,
      property_id: resolved.property_id,
      property_he: resolved.property_he,
      property_th: resolved.property_th,
      legend_letter: resolved.legend_letter || '',
      legend_code: resolved.legend_code ?? null,
      legend_circled: resolved.legend_circled || '',
      thai_sign: resolved.thai_sign,
      thai_label: resolved.thai_label,
      sign_he: resolved.sign_he,
      wazeUrl: resolved.wazeUrl,
      mapsUrl: resolved.mapsUrl,
      resolved: true,
      needs_property: false,
      candidate_properties: []
    };
  }

  const unitNumber = extractUnitNumber(base, spokenText || base.task_he || '');
  const candidates = Number.isFinite(unitNumber)
    ? candidatePropertiesForNumber(units, unitNumber)
    : Object.values(FIELD_PROPERTIES);

  return {
    ...base,
    unit_number: Number.isFinite(unitNumber) ? unitNumber : (base.unit_number ?? null),
    unit_id: null,
    unit_name: null,
    property_id: null,
    property_he: null,
    property_th: null,
    thai_sign: '',
    thai_label: '',
    sign_he: '',
    wazeUrl: '',
    mapsUrl: '',
    resolved: false,
    needs_property: true,
    candidate_properties: candidates.map((p) => ({
      id: p.id,
      he: fieldPropertyDisplayName(p.id, p.he),
      th: p.th,
      letter: p.letter || legendForProperty(p.id)?.letter || '',
      code: p.code ?? legendForProperty(p.id)?.code ?? null,
      circled: p.circled || legendForProperty(p.id)?.circled || ''
    }))
  };
}
