/** Ramot complexes for the public /ramot page. Keep lockboxes in sync with guestProfileSeed. */

export const RAMOT_PINS = ['4696', '2102', '4141'];
export const RAMOT_GATE_CODE = '#2464';

const LOCKBOX_BY_UNIT = {
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
  k691: '2610',
  k692: '2610',
  k687: '2710',
  k688: '2720',
  k689: '2730',
  k685: '2810',
  k686: '2810',
  k680: '2910',
  k681: '2920',
  k682: '2930',
  k683: '2940',
  k684: '2950'
};

const COMPLEXES = [
  {
    id: 'nurit',
    name: 'בתי נורית',
    query: 'בתי נורית מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gs4p2',
    wifi: [{ ssid: 'MIALEES RESORT', password: 'MIAL2026' }],
    units: [
      { id: 'k671', name: 'בתי נורית 1' },
      { id: 'k673', name: 'בתי נורית 2' },
      { id: 'k674', name: 'בתי נורית 3' },
      { id: 'k675', name: 'בתי נורית 4' },
      { id: 'k676', name: 'בתי נורית 5' },
      { id: 'k677', name: 'בתי נורית 6' },
      { id: 'k678', name: 'בתי נורית 7' },
      { id: 'k679', name: 'בתי נורית 8' }
    ]
  },
  {
    id: 'taj',
    name: 'טאג׳ מאהל',
    query: "טאג' מאהל מושב רמות",
    waze: 'https://waze.com/ul?q=Taj+Mahal+Ramot&navigate=yes',
    wifi: [{ ssid: 'LUTUS', password: '12345678' }],
    units: [
      { id: 'k808', name: "טאג' מאהל · בקתה 1" },
      { id: 'k809', name: "טאג' מאהל · בקתה 2" },
      { id: 'k810', name: "טאג' מאהל · בקתה 3" },
      { id: 'k811', name: "טאג' מאהל · בקתה 4" }
    ]
  },
  {
    id: 'mool',
    name: 'מול הנוף',
    query: 'מול הנוף ברמות',
    waze: 'https://waze.com/ul/hsvc6gtk3v',
    wifi: [{ ssid: 'Mol_hanof', password: '12345678' }],
    units: [
      { id: 'k680', name: 'מול הנוף · בקתה 1' },
      { id: 'k681', name: 'מול הנוף · בקתה 2' },
      { id: 'k682', name: 'מול הנוף · בקתה 3' },
      { id: 'k683', name: 'מול הנוף · בקתה 4' },
      { id: 'k684', name: 'מול הנוף · בקתה 5' }
    ]
  },
  {
    id: 'nofim',
    name: 'נופים בלבן',
    query: 'נופים בלבן מושב רמות',
    waze: 'https://waze.com/ul?q=Nofim+Belavan+Ramot&navigate=yes',
    wifi: [{ ssid: 'TP-LINK_FA30', password: '15107312' }],
    units: [
      { id: 'k685', name: 'נופים בלבן · בקתה 1' },
      { id: 'k686', name: 'נופים בלבן · בקתה 2', wifi: [] }
    ]
  },
  {
    id: 'toscana',
    name: 'בקתות טוסקנה',
    query: 'בקתות טוסקנה מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gsux5',
    wifi: [{ ssid: 'Toscana', password: '12345678' }],
    units: [
      { id: 'k687', name: 'טוסקנה · פירנצה 1' },
      { id: 'k688', name: 'טוסקנה · פירנצה 2' },
      { id: 'k689', name: 'טוסקנה · שאטו' }
    ]
  },
  {
    id: 'musical',
    name: 'החצר המוסיקלית',
    query: 'החצר המוסיקלית מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gsdq7',
    wifi: [{ ssid: 'Music yard', password: '12345678' }],
    units: [
      { id: 'k690', name: 'חצר מוסיקלית · חליל' },
      { id: 'k691', name: 'חצר מוסיקלית · מיתר' },
      { id: 'k692', name: 'חצר מוסיקלית · פעמון' }
    ]
  },
  {
    id: 'maya',
    name: 'בקתות מאיה',
    query: 'בקתות מאיה מושב רמות',
    waze: 'https://waze.com/ul/hsvc6gs4k0',
    wifi: [{ ssid: 'maya', password: '12345678' }],
    units: [
      { id: 'k693', name: 'בקתות מאיה · בקתה 1' },
      { id: 'k694', name: 'בקתות מאיה · בקתה 2' },
      { id: 'k695', name: 'בקתות מאיה · בקתה 3' }
    ]
  },
  {
    id: 'siesta',
    name: 'סייסטה',
    query: 'סייסטה ברמות',
    waze: 'https://waze.com/ul?q=Siesta+Ramot&navigate=yes',
    wifi: [],
    units: [
      { id: 'k618', name: 'סייסטה · משפחתית 1' },
      { id: 'k619', name: 'סייסטה · משפחתית 2' },
      { id: 'k620', name: 'סייסטה · רומנטית 3' },
      { id: 'k621', name: 'סייסטה · רומנטית 4' },
      { id: 'k622', name: 'סייסטה · בת הים 5' },
      { id: 'k623', name: 'סייסטה · בת הים 6' }
    ]
  }
];

export function googleMapsUrl(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`;
}

export function isRamotPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  return RAMOT_PINS.includes(digits);
}

export function ramotPublicList() {
  return COMPLEXES.map((row) => ({
    id: row.id,
    name: row.name,
    wazeUrl: row.waze,
    mapsUrl: googleMapsUrl(row.query)
  }));
}

function unitSecrets(complex, unit) {
  const wifi = Object.prototype.hasOwnProperty.call(unit, 'wifi')
    ? (unit.wifi || [])
    : (complex.wifi || []);
  return {
    id: unit.id,
    name: unit.name,
    lockbox: LOCKBOX_BY_UNIT[unit.id] || '',
    wifi
  };
}

export function ramotSecrets(propertyId) {
  const list = propertyId
    ? COMPLEXES.filter((row) => row.id === propertyId)
    : COMPLEXES;
  return {
    gate: RAMOT_GATE_CODE,
    complexes: list.map((row) => ({
      id: row.id,
      name: row.name,
      wifi: row.wifi || [],
      units: row.units.map((unit) => unitSecrets(row, unit))
    }))
  };
}
