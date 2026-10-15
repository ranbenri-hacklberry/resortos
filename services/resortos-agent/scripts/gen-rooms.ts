/**
 * Generates data/rooms.json from the ResortOS catalog (src/lib/units.js + fieldUnitCatalog.js).
 * Run from the ResortOS repo root:  npx vite-node services/resortos-agent/scripts/gen-rooms.ts
 *
 * Bare numbers ("1", "בקתה 1") are deliberately NOT aliases: they exist in many complexes.
 * Aliases that end up shared by more than one unit are dropped for the same reason.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-ignore app libs are plain JS outside this package
import { DEFAULT_RESORT_UNITS } from '../../../src/lib/units.js';
// @ts-ignore
import { FIELD_UNIT_SIGNS, FIELD_PROPERTIES, UNIT_PROPERTY } from '../../../src/lib/fieldUnitCatalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const badge = /^[ⒶⒷⒸⒹⒺⒻⒼ]\d{2}\s*/;
const clean = (s: string) => s.replace(badge, '').replace(/\s+/g, ' ').trim();

const LOCKBOX_BY_UNIT: Record<string, string> = {
  k671: '2310',
  k673: '2320',
  k674: '2330',
  k675: '2340',
  k676: '2350',
  k677: '2360',
  k678: '2370',
  k679: '2380',
  k693: '2410',
  k694: '2420',
  k695: '2430',
  k808: '2510',
  k809: '2520',
  k810: '2530',
  k811: '2540',
  k690: '2610',
  k691: '2620',
  k692: '2630',
  k687: '2710',
  k688: '2720',
  k689: '2730',
  k685: '2810',
  k686: '2820',
  k680: '2910',
  k681: '2920',
  k682: '2930',
  k683: '2940',
  k684: '2950',
  'hill-1': '3041',
  'hill-2': '3042',
  'hill-3': '3043',
  'hill-4': '3044',
  'mialis-villa': '3050',
  'pilot-office': '1357#',
  office: '1357#',
};

interface Out {
  id: string;
  name: string;
  property: string | null;
  letterCode: string | null;
  lockbox: string | null;
  aliases: string[];
}
const out: Out[] = [];

for (const u of DEFAULT_RESORT_UNITS as Array<{ id: string; name: string }>) {
  const sign = FIELD_UNIT_SIGNS[u.id];
  const prop = FIELD_PROPERTIES[UNIT_PROPERTY[u.id]];
  const set = new Set<string>();
  const add = (s?: string | null) => { if (s && s.trim()) set.add(s.trim()); };

  add(clean(u.name));
  add(u.name);
  const THAI_LETTER_MAP: Record<string, string> = {
    A: 'เอ',
    B: 'บี',
    C: 'ซี',
    D: 'ดี',
    E: 'อี',
    F: 'เอฟ',
    G: 'จี',
  };

  let letterCode: string | null = null;
  if (sign) {
    add(sign.he); add(sign.th); add(sign.sign === sign.th ? null : sign.th);
    (sign.aliases ?? []).forEach(add);
    // property alias × local number: "מול 3", "נוף 3", "g5", "ทัช 2" ...
    if (prop && sign.localNum != null) {
      [prop.he, prop.th, ...(prop.aliases ?? [])].forEach((a: string) => add(`${a} ${sign.localNum}`));
      if (prop.circled) { add(`${prop.circled}${sign.localNum}`); add(`${prop.circled} ${sign.localNum}`); }
      
      const letter = prop.letter;
      if (letter) {
        const L = letter.toUpperCase();
        const l = letter.toLowerCase();
        const num = sign.localNum;
        letterCode = `${L}${num}`;
        add(`${L}${num}`);
        add(`${L} ${num}`);
        add(`${l}${num}`);
        add(`${l} ${num}`);
        add(`room ${L}${num}`);
        add(`room ${L} ${num}`);
        
        const thL = THAI_LETTER_MAP[L];
        if (thL) {
          add(`${thL}${num}`);
          add(`${thL} ${num}`);
          add(`ห้อง${thL}${num}`);
          add(`ห้อง ${thL} ${num}`);
          add(`ห้อง${L}${num}`);
          add(`ห้อง ${L} ${num}`);
        }
      }
    } else if (u.id.startsWith('hill-')) {
      const num = u.id.replace('hill-', '');
      letterCode = `Hill ${num}`;
    }
  }
  const lockbox = LOCKBOX_BY_UNIT[u.id] ?? null;
  out.push({ id: u.id, name: clean(u.name), property: prop?.he ?? null, letterCode, lockbox, aliases: [...set] });
}

// Office (משרד) - Operational node (matches database id: pilot-office)
out.push({
  id: 'pilot-office',
  name: 'משרד',
  property: 'משרד ראשי',
  letterCode: 'Office',
  lockbox: LOCKBOX_BY_UNIT['pilot-office'] ?? LOCKBOX_BY_UNIT['office'] ?? '1357#',
  aliases: ['משרד', 'המשרד', 'office', 'pilot-office', 'room office', 'חדר משרד', 'אופיס', 'הנהלה', 'สำนักงาน', 'ห้องสำนักงาน'],
});

// Drop aliases shared by >1 unit (ambiguous), and bare numbers / single characters.
const counts = new Map<string, number>();
const key = (a: string) => a.toLowerCase().replace(/[\s'׳"״\-_.,·]+/g, '');
for (const r of out) for (const a of new Set(r.aliases.map(key))) counts.set(a, (counts.get(a) ?? 0) + 1);
for (const r of out) {
  const seen = new Set<string>();
  r.aliases = r.aliases.filter((a) => {
    const k = key(a);
    if (counts.get(k)! > 1 || /^\d+$/.test(k) || k.length < 2 || seen.has(k)) return false;
    // generic "cabin N" (exists in every complex) and complex-wide plot codes like "29a" are ambiguous
    if (/^(בקתה|cabin|צימר)\d+$/.test(k) || /^\d{2}[a-z]$/.test(k)) return false;
    seen.add(k);
    return true;
  });
}

const target = path.join(here, '..', 'data', 'rooms.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${out.length} rooms -> ${target}`);
