/** One yard per complex, and either one shared pool or a private pool beside its cabin. */

export const YARD_STATUSES = [
  { key: 'clean', label: 'נקי' },
  { key: 'inspect', label: 'לבדיקה' },
  { key: 'dirty', label: 'לניקיון' }
];

export const POOL_STATUSES = [
  { key: 'ok', label: 'תקינה' },
  { key: 'inspect', label: 'לבדיקה' },
  { key: 'treat', label: 'לטיפול' }
];

const FAMILY_LABELS = {
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
  mialees: 'מיאליס'
};

const PRIVATE_POOL_LABELS = {
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
  k827: 'קאסה נובה Bloom'
};

const SHARED_POOL = new Set(['nurit', 'taj', 'mool', 'toscana', 'musical', 'hill']);

const PRIVATE_POOL = new Set([
  'suite-1',
  'suite-2',
  'k685',
  'k686',
  'k693',
  'k695',
  'dome-blue',
  'dome-red',
  'dome-green',
  'k826',
  'k827'
]);

export function groundsFamily(unitId) {
  const id = String(unitId || '');
  if (id === 'mialis-villa' || id.startsWith('suite-')) return 'mialees';
  if (id.startsWith('hill-')) return 'hill';
  if (id.startsWith('dome-')) return 'kipat';
  if (/^k67[1-9]$/.test(id)) return 'nurit';
  if (/^k80[8-9]$/.test(id) || id === 'k810' || id === 'k811') return 'taj';
  if (/^k68[0-4]$/.test(id)) return 'mool';
  if (id === 'k685' || id === 'k686') return 'nofim';
  if (/^k68[7-9]$/.test(id)) return 'toscana';
  if (/^k69[0-2]$/.test(id)) return 'musical';
  if (/^k69[3-5]$/.test(id)) return 'maya';
  if (id === 'k826' || id === 'k827') return 'casa';
  return id || 'other';
}

export function unitHasPrivatePool(unitId) {
  return PRIVATE_POOL.has(String(unitId || ''));
}

/** Bands line up with the visible unit rows. A null cell is already covered by a rowspan above. */
export function groundsBands(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const bands = list.map(() => ({ yard: null, pool: null }));
  let index = 0;
  while (index < list.length) {
    const family = groundsFamily(list[index]?.id);
    let end = index + 1;
    while (end < list.length && groundsFamily(list[end]?.id) === family) end += 1;
    const span = end - index;
    bands[index].yard = { span, id: `yard:${family}` };
    if (SHARED_POOL.has(family)) {
      bands[index].pool = { span, kind: 'shared', id: `pool:${family}` };
    } else {
      for (let row = index; row < end; row += 1) {
        const unitId = String(list[row]?.id || '');
        const privatePool = unitHasPrivatePool(unitId);
        bands[row].pool = {
          span: 1,
          kind: privatePool ? 'private' : 'none',
          id: privatePool ? `pool:${unitId}` : ''
        };
      }
    }
    index = end;
  }
  return bands;
}

export function statusChoices(kind) {
  return kind === 'pool' ? POOL_STATUSES : YARD_STATUSES;
}

export function statusLabel(kind, key) {
  return statusChoices(kind).find((row) => row.key === key)?.label || '';
}

export function defaultGroundStatus(kind) {
  return kind === 'pool' ? 'ok' : 'clean';
}

export function groundsCatalog() {
  const families = Object.keys(FAMILY_LABELS);
  const assets = [];
  for (const family of families) {
    assets.push({
      id: `yard:${family}`,
      kind: 'yard',
      family,
      label: `חצר · ${FAMILY_LABELS[family]}`,
      scan: `START_YARD_${family}`
    });
    if (SHARED_POOL.has(family)) {
      assets.push({
        id: `pool:${family}`,
        kind: 'pool',
        family,
        label: `בריכה · ${FAMILY_LABELS[family]}`,
        scan: `START_POOL_${family}`
      });
    }
  }
  for (const unitId of PRIVATE_POOL) {
    assets.push({
      id: `pool:${unitId}`,
      kind: 'pool',
      family: groundsFamily(unitId),
      unitId,
      label: `בריכה · ${PRIVATE_POOL_LABELS[unitId] || unitId}`,
      scan: `START_POOL_${unitId}`
    });
  }
  return assets;
}

export function groundByScan(text) {
  const match = String(text || '').trim().match(/^START[_\s]+(POOL|YARD)[_\s]+([A-Za-z0-9-]+)$/i);
  if (!match) return null;
  const id = `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
  return groundsCatalog().find((asset) => asset.id === id) || null;
}

export function choiceByReply(kind, text) {
  const raw = String(text || '').trim();
  const choices = statusChoices(kind);
  const digit = raw.match(/^([1-3])\.?$/);
  if (digit) return choices[Number(digit[1]) - 1] || null;
  return choices.find((row) => row.label === raw) || null;
}

export function normalizeGrounds(data) {
  const stored = data?.assets && typeof data.assets === 'object' ? data.assets : {};
  const assets = {};
  for (const asset of groundsCatalog()) {
    const row = stored[asset.id] && typeof stored[asset.id] === 'object' ? stored[asset.id] : {};
    const known = statusChoices(asset.kind).some((choice) => choice.key === row.status);
    const log = Array.isArray(row.log)
      ? row.log.filter((entry) => entry && entry.at && entry.to).slice(-200)
      : [];
    assets[asset.id] = {
      id: asset.id,
      kind: asset.kind,
      label: asset.label,
      status: known ? row.status : defaultGroundStatus(asset.kind),
      updatedAt: row.updatedAt || '',
      updatedBy: row.updatedBy || '',
      log
    };
  }
  return assets;
}

export function withGroundStatus(assets, { id, status, by, at, note: rawNote }) {
  const current = assets?.[id];
  if (!current) {
    const error = new Error('UNKNOWN_GROUND');
    error.status = 404;
    throw error;
  }
  if (!statusChoices(current.kind).some((choice) => choice.key === status)) {
    const error = new Error('BAD_STATUS');
    error.status = 400;
    throw error;
  }
  const note = String(rawNote || '').trim().slice(0, 240);
  const entry = {
    at,
    by: String(by || 'צוות').slice(0, 80),
    from: current.status,
    to: status,
    ...(note ? { note } : {})
  };
  return {
    ...assets,
    [id]: {
      ...current,
      status,
      updatedAt: at,
      updatedBy: entry.by,
      log: [...current.log, entry].slice(-200)
    }
  };
}
