/** Ramot command-center model. 28 calendar units, grouped the way the site plan is drawn. */

export const STATUS_LABEL = {
  ready: 'מוכן',
  occupied: 'מאוכלס',
  dirty: 'ממתין לניקיון',
  cleaning: 'בנקיון',
  inspection: 'ממתין לבדיקה',
  alert: 'התראה',
  hold: 'סגור',
};

export const COMPOUNDS = {
  A: { id: 'A', name: 'מול הנוף', street: 'רחוב אל על', wing: 'east', cols: 5 },
  B: { id: 'B', name: 'נופים בלבן', street: 'רחוב גמלא', wing: 'west', cols: 2 },
  C: { id: 'C', name: 'טוסקנה', street: 'רחוב בטרה', wing: 'east', cols: 3 },
  D: { id: 'D', name: 'החצר המוסיקלית', street: 'רחוב דליות', wing: 'west', cols: 3 },
  E: { id: 'E', name: "טאג' מאהל", street: 'רחוב זוויתן', wing: 'east', cols: 4 },
  G: { id: 'G', name: 'בתי נורית', street: 'רחוב יהודיה', wing: 'west', cols: 8 },
  F: { id: 'F', name: 'בקתות מאיה', street: 'רחוב ירדן', wing: 'east', cols: 3, pool: true },
};

export const WEST_IDS = ['B', 'D', 'G'];
export const EAST_IDS = ['A', 'C', 'E', 'F'];
export const PRINT_ORDER = ['A', 'B', 'C', 'D', 'E', 'G', 'F'];

const telemetry = (patch) => ({
  doorLocked: true,
  presence: false,
  acPower: false,
  acTemp: 24,
  vocIndex: 42,
  ...patch,
});

function cabin(fields) {
  const guest = fields.guest || null;
  return {
    isRealHardware: false,
    cleanerName: '',
    vacatedAt: '',
    cleanedBy: '',
    inspectedBy: '',
    ...fields,
    guest,
    telemetry: telemetry(fields.telemetry),
  };
}

function guest(name, phone, checkIn, checkOut) {
  const digits = String(phone).replace(/\D/g, '');
  const maskedPhone = `${digits.slice(0, 3)}-***${digits.slice(-4)}`;
  return { name, phone: digits, maskedPhone, checkIn, checkOut };
}

/** Frozen presentation snapshot. Demo mode is the only thing that moves these. */
export function createSeedCabins() {
  return [
    cabin({ id: 'k680', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'A', status: 'occupied', vacatedAt: '', guest: guest('משפחת אור', '0541001840', '8.10', '11.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 22, vocIndex: 96 } }),
    cabin({ id: 'k681', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'A', status: 'ready', vacatedAt: '08:20', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 38 } }),
    cabin({ id: 'k682', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'A', status: 'cleaning', cleanerName: 'נואי', vacatedAt: '08:40', cleanedBy: 'נואי', telemetry: { doorLocked: false, presence: true, acPower: false, vocIndex: 168 } }),
    cabin({ id: 'k683', cabinNumber: 4, displayName: 'בקתה 4', compoundId: 'A', status: 'occupied', guest: guest('יוסי חדד', '0522004412', '9.10', '12.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 23, vocIndex: 110 } }),
    cabin({ id: 'k684', cabinNumber: 5, displayName: 'בקתה 5', compoundId: 'A', status: 'ready', vacatedAt: '09:05', cleanedBy: 'רינה', inspectedBy: 'צוקי', telemetry: { vocIndex: 44 } }),

    cabin({ id: 'k685', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'B', status: 'occupied', guest: guest('רונית מזרחי', '0533007781', '7.10', '10.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 24, vocIndex: 88 } }),
    cabin({ id: 'k686', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'B', status: 'inspection', vacatedAt: '08:10', cleanedBy: 'רינה', telemetry: { doorLocked: true, presence: false, vocIndex: 91 } }),

    cabin({ id: 'k687', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'C', status: 'ready', vacatedAt: '10:15', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 36 } }),
    cabin({ id: 'k688', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'C', status: 'occupied', guest: guest('משפחת ביטון', '0544002290', '9.10', '13.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 22, vocIndex: 102 } }),
    cabin({ id: 'k689', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'C', status: 'cleaning', cleanerName: 'רינה', vacatedAt: '09:15', cleanedBy: 'רינה', telemetry: { doorLocked: false, presence: true, vocIndex: 154 } }),

    cabin({ id: 'k690', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'D', status: 'ready', vacatedAt: '07:55', cleanedBy: 'רינה', inspectedBy: 'צוקי', telemetry: { vocIndex: 40 } }),
    cabin({ id: 'k691', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'D', status: 'ready', vacatedAt: '08:30', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 33 } }),
    cabin({ id: 'k692', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'D', status: 'occupied', guest: guest('עמית שמש', '0507006615', '8.10', '11.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 21, vocIndex: 77 } }),

    cabin({ id: 'k808', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'E', status: 'occupied', guest: guest('נועה פרץ', '0528009134', '9.10', '12.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 23, vocIndex: 84 } }),
    cabin({ id: 'k809', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'E', status: 'cleaning', cleanerName: 'נואי', vacatedAt: '10:05', cleanedBy: 'נואי', telemetry: { doorLocked: false, presence: true, vocIndex: 176 } }),
    cabin({ id: 'k810', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'E', status: 'ready', vacatedAt: '09:25', cleanedBy: 'רינה', inspectedBy: 'צוקי', telemetry: { vocIndex: 41 } }),
    cabin({ id: 'k811', cabinNumber: 4, displayName: 'בקתה 4', compoundId: 'E', status: 'inspection', vacatedAt: '09:40', cleanedBy: 'נואי', telemetry: { vocIndex: 86 } }),

    cabin({ id: 'k671', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'G', status: 'occupied', guest: guest('משפחת דהן', '0545003321', '6.10', '10.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 22, vocIndex: 119 } }),
    cabin({ id: 'k673', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'G', status: 'ready', vacatedAt: '08:00', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 29 } }),
    cabin({ id: 'k674', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'G', status: 'cleaning', cleanerName: 'נואי', vacatedAt: '07:50', cleanedBy: 'נואי', telemetry: { doorLocked: false, presence: true, vocIndex: 149 } }),
    cabin({ id: 'k675', cabinNumber: 4, displayName: 'בקתה 4', compoundId: 'G', status: 'occupied', guest: guest('אילן כהן', '0532001478', '9.10', '11.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 24, vocIndex: 93 } }),
    cabin({ id: 'k676', cabinNumber: 5, displayName: 'בקתה 5', compoundId: 'G', status: 'ready', vacatedAt: '10:40', cleanedBy: 'רינה', inspectedBy: 'צוקי', telemetry: { vocIndex: 47 } }),
    cabin({ id: 'k677', cabinNumber: 6, displayName: 'בקתה 6', compoundId: 'G', status: 'inspection', vacatedAt: '11:20', cleanedBy: 'רינה', telemetry: { vocIndex: 72 } }),
    cabin({ id: 'k678', cabinNumber: 7, displayName: 'בקתה 7', compoundId: 'G', status: 'occupied', guest: guest('הילה שרון', '0526008804', '8.10', '12.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 22, vocIndex: 101 } }),
    cabin({ id: 'k679', cabinNumber: 8, displayName: 'בקתה 8', compoundId: 'G', status: 'ready', vacatedAt: '09:50', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 35 } }),

    cabin({ id: 'k693', cabinNumber: 1, displayName: 'בקתה 1', compoundId: 'F', status: 'occupied', guest: guest('דניאל עוז', '0508002256', '9.10', '12.10'), telemetry: { doorLocked: true, presence: true, acPower: true, acTemp: 23, vocIndex: 90 } }),
    cabin({ id: 'k694', cabinNumber: 2, displayName: 'בקתה 2', compoundId: 'F', status: 'ready', vacatedAt: '08:45', cleanedBy: 'רינה', inspectedBy: 'צוקי', telemetry: { vocIndex: 39 } }),
    cabin({ id: 'k695', cabinNumber: 3, displayName: 'בקתה 3', compoundId: 'F', status: 'ready', vacatedAt: '09:30', cleanedBy: 'נואי', inspectedBy: 'צוקי', telemetry: { vocIndex: 37 } }),
  ];
}

export function countsOf(cabins) {
  const counts = { ready: 0, occupied: 0, dirty: 0, cleaning: 0, inspection: 0, alert: 0 };
  for (const cabin of cabins) counts[cabin.status] += 1;
  return counts;
}

/** One demo beat: next cabin leaves cleaning for inspection, Maya 3 raises a smoke alert. */
export function applyDemoTick(cabins) {
  let promoted = false;
  return cabins.map((cabin) => {
    if (cabin.id === 'k695') {
      return {
        ...cabin,
        status: 'alert',
        telemetry: { ...cabin.telemetry, vocIndex: 480, presence: false, doorLocked: true, acPower: false },
      };
    }
    if (!promoted && cabin.status === 'cleaning') {
      promoted = true;
      return {
        ...cabin,
        status: 'inspection',
        cleanerName: '',
        telemetry: { ...cabin.telemetry, presence: false, doorLocked: true, acPower: false },
      };
    }
    return cabin;
  });
}

export function cabinsForPrint(cabins) {
  const rank = new Map(PRINT_ORDER.map((id, index) => [id, index]));
  return [...cabins].sort((a, b) => {
    const wing = (rank.get(a.compoundId) ?? 9) - (rank.get(b.compoundId) ?? 9);
    if (wing) return wing;
    return a.cabinNumber - b.cabinNumber;
  });
}

export function vocLabel(index) {
  const value = Number(index) || 0;
  if (value > 400) return `${value} · עשן / VOC גבוה`;
  if (value < 150) return `${value} · מצוין`;
  return `${value} · בינוני`;
}
