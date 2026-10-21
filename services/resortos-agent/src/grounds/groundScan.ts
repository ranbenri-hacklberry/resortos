/** Keep ids aligned with src/lib/priorityGrounds.js. Chloe reads the same scan text the QR prints. */

export type GroundKind = 'pool' | 'yard';

export interface GroundAsset {
  id: string;
  kind: GroundKind;
  family: string;
  unitId?: string;
  label: string;
  scan: string;
}

const YARD = [
  { key: 'clean', label: 'נקי' },
  { key: 'inspect', label: 'לבדיקה' },
  { key: 'dirty', label: 'לניקיון' },
];

const POOL = [
  { key: 'ok', label: 'תקינה' },
  { key: 'inspect', label: 'לבדיקה' },
  { key: 'treat', label: 'לטיפול' },
];

const FAMILIES: Record<string, string> = {
  nurit: 'בתי נורית',
  taj: 'טאג׳ מאהל',
  mool: 'מול הנוף',
  nofim: 'נופים בלבן',
  toscana: 'טוסקנה',
  musical: 'החצר המוסיקלית',
  maya: 'בקתות מאיה',
  hill: 'צימר בגבעה',
  kipat: 'כיפת שמיים',
  casa: 'קאסה נובה',
  mialees: 'מיאליס',
};

const SHARED = new Set(['nurit', 'taj', 'mool', 'toscana', 'musical', 'hill']);

const PRIVATE: Record<string, string> = {
  'suite-1': 'סוויטה 1',
  'suite-2': 'סוויטה 2',
  k685: 'נופים בלבן 1',
  k686: 'נופים בלבן 2',
  k693: 'מאיה 1',
  k695: 'מאיה 3',
  'dome-blue': 'כיפת שמיים כחול',
  'dome-red': 'כיפת שמיים אדום',
  'dome-green': 'כיפת שמיים ירוק',
  k826: 'קאסה נובה Aura',
  k827: 'קאסה נובה Bloom',
};

const FAMILY_ROOMS: Record<string, string[]> = {
  nurit: ['k671', 'k673', 'k674', 'k675', 'k676', 'k677', 'k678', 'k679'],
  taj: ['k808', 'k809', 'k810', 'k811'],
  mool: ['k680', 'k681', 'k682', 'k683', 'k684'],
  nofim: ['k685', 'k686'],
  toscana: ['k687', 'k688', 'k689'],
  musical: ['k690', 'k691', 'k692'],
  maya: ['k693', 'k694', 'k695'],
  hill: ['hill-1', 'hill-2', 'hill-3', 'hill-4'],
  kipat: ['dome-blue', 'dome-red', 'dome-green'],
  casa: ['k826', 'k827'],
  mialees: ['mialis-villa', 'suite-1', 'suite-2'],
};

function catalog(): GroundAsset[] {
  const assets: GroundAsset[] = [];
  for (const [family, name] of Object.entries(FAMILIES)) {
    assets.push({ id: `yard:${family}`, kind: 'yard', family, label: `חצר · ${name}`, scan: `START_YARD_${family}` });
    if (SHARED.has(family)) {
      assets.push({ id: `pool:${family}`, kind: 'pool', family, label: `בריכה · ${name}`, scan: `START_POOL_${family}` });
    }
  }
  for (const [unitId, name] of Object.entries(PRIVATE)) {
    const family = Object.entries(FAMILY_ROOMS).find(([, ids]) => ids.includes(unitId))?.[0] || '';
    assets.push({ id: `pool:${unitId}`, kind: 'pool', family, unitId, label: `בריכה · ${name}`, scan: `START_POOL_${unitId}` });
  }
  return assets;
}

const COMPLEX_FAMILY: Record<string, string> = {
  casanova: 'casa',
  mialis: 'mialees',
};

export function roomsForFamily(family: string): string[] {
  return FAMILY_ROOMS[family] || [];
}

export function groundsForComplex(complexKey: string): GroundAsset[] {
  const family = COMPLEX_FAMILY[complexKey] || complexKey;
  return catalog().filter((asset) => asset.family === family);
}

export function groundById(id: string): GroundAsset | null {
  return catalog().find((asset) => asset.id === id) || null;
}

export function groundOptionLabel(asset: GroundAsset): string {
  if (asset.kind === 'yard') return 'חצר';
  if (!asset.unitId) return 'בריכה';
  return asset.label;
}

export function groundByScan(text: string): GroundAsset | null {
  const match = String(text || '').trim().match(/^START[_\s]+(POOL|YARD)[_\s]+([A-Za-z0-9-]+)$/i);
  if (!match) return null;
  const id = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
  return catalog().find((asset) => asset.id === id) || null;
}

export function groundChoices(kind: GroundKind) {
  return kind === 'pool' ? POOL : YARD;
}

export function groundChoice(kind: GroundKind, text: string) {
  const raw = String(text || '').trim();
  const choices = groundChoices(kind);
  const digit = raw.match(/^([1-3])\.?$/);
  if (digit) return choices[Number(digit[1]) - 1] || null;
  return choices.find((row) => row.label === raw) || null;
}

export function groundStatusLabel(kind: GroundKind, key: string) {
  return groundChoices(kind).find((row) => row.key === key)?.label || '';
}

export function housekeepingMenu(asset: GroundAsset) {
  return `${asset.label}\n1. התחלת ניקיון\n2. דיווח על תקלה`;
}

export function workerGroundChoice(text: string): 'start' | 'fault' | null {
  const raw = String(text || '').trim();
  if (/^1\.?$/.test(raw) || raw === 'התחלת ניקיון') return 'start';
  if (/^2\.?$/.test(raw) || /דיווח על תקלה|^תקלה$/.test(raw)) return 'fault';
  return null;
}

export function poolGuestReply(asset: { unitId?: string; label: string }, stayUrl?: string) {
  const body = asset.unitId
    ? 'זו הבריכה הפרטית של הבקתה ומחוממת. הצוות מטפל במים. לפני הכניסה מתקלחים, ובלי אוכל או זכוכית בתוך המים.'
    : 'הבריכה משותפת לכל הבקתות במתחם ומחוממת. הצוות מטפל במים. לפני הכניסה מתקלחים, ובלי אוכל או זכוכית בתוך המים.';
  const link = stayUrl
    ? `\n\nדף האורח:\n${stayUrl}`
    : '\n\nלא מצאתי דף אורח למספר הזה. כתבו את השם שעל ההזמנה.';
  return `${asset.label}\n${body}${link}`;
}
