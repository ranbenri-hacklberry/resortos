import { db } from './resortos-db';
import { supabase } from './supabaseClient';
import {
  FALLBACK_JACUZZI,
  FALLBACK_TV,
  LOCK_STEPS,
  isFilledJson,
  parseGuestAccess,
  parseGuestContent
} from './guestProfile';

const DIAL_GATE = { mode: 'dial', code: '#2580', nightCall: true };
const RAMOT_GATE = { mode: 'code', code: '#2464' };
const NIGHT_CALL_GATE = { mode: 'call', nightCall: true };
const MAYA_WIFI = [{ ssid: 'maya', password: '12345678' }];

function property(id, name, village, cluster, sort_order, extra = {}) {
  return {
    id,
    name,
    village,
    cluster,
    sort_order,
    content: parseGuestContent({
      check_in: '15:00',
      check_out: '11:00',
      guides: { jacuzzi: FALLBACK_JACUZZI, tv: FALLBACK_TV, lock: LOCK_STEPS },
      ...extra.content
    }),
    access: parseGuestAccess({
      ...extra.access
    })
  };
}

/** Public + private defaults per complex. Unit rows only store overrides. */
export const PROPERTY_SEED = {
  hill: property('hill', 'צימר בגבעה', 'גבעת יואב', 'givat', 1, {
    content: { nav: { query: 'צימר בגבעה גבעת יואב', placeId: 'ChIJ19h0kHsRHBURwfbIlIF6slA' } },
    access: { gate: DIAL_GATE, wifi: [] }
  }),
  kipat: property('kipat', 'כיפת שמיים', 'גבעת יואב', 'givat', 2, {
    content: { nav: { query: 'כיפת השמיים גבעת יואב', placeId: 'ChIJowoxPLsRHBURo64q7zHS1pk' } },
    access: { gate: DIAL_GATE, wifi: [] }
  }),
  mialis: property('mialis', 'מיאליס ריזורט', 'גבעת יואב', 'givat', 3, {
    content: { nav: { query: 'מיאליס ריזורט גבעת יואב' } },
    access: { gate: DIAL_GATE, wifi: [{ ssid: 'CASAMIA', password: 'CASAMIA10' }] }
  }),
  nurit: property('nurit', 'בתי נורית', 'מושב רמות', 'ramot', 10, {
    content: { nav: { query: 'בתי נורית מושב רמות', waze: 'https://waze.com/ul/hsvc6gs4p2' } },
    access: { gate: RAMOT_GATE, wifi: [{ ssid: 'MIALEES RESORT', password: 'MIAL2026' }] }
  }),
  taj: property('taj', "טאג' מאהל", 'מושב רמות', 'ramot', 11, {
    content: { nav: { query: "טאג' מאהל מושב רמות" } },
    access: { gate: RAMOT_GATE, wifi: [{ ssid: 'LUTUS', password: '12345678' }] }
  }),
  mool: property('mool', 'מול הנוף', 'מושב רמות', 'ramot', 12, {
    content: { nav: { query: 'מול הנוף ברמות', waze: 'https://waze.com/ul/hsvc6gtk3v' } },
    access: { gate: RAMOT_GATE, wifi: [{ ssid: 'Mol_hanof', password: '12345678' }] }
  }),
  nofim: property('nofim', 'נופים בלבן', 'מושב רמות', 'ramot', 13, {
    content: { nav: { query: 'נופים בלבן מושב רמות' } },
    access: { gate: RAMOT_GATE, wifi: [{ ssid: 'TP-LINK_FA30', password: '15107312' }] }
  }),
  toscana: property('toscana', 'בקתות טוסקנה', 'מושב רמות', 'ramot', 14, {
    content: { nav: { query: 'בקתות טוסקנה מושב רמות', waze: 'https://waze.com/ul/hsvc6gsux5' } },
    access: {
      gate: RAMOT_GATE,
      wifi: [{ ssid: 'Toscana', password: '12345678' }]
    }
  }),
  musical: property('musical', 'החצר המוסיקלית', 'מושב רמות', 'ramot', 15, {
    content: { nav: { query: 'החצר המוסיקלית מושב רמות', waze: 'https://waze.com/ul/hsvc6gsdq7' } },
    access: { gate: RAMOT_GATE, wifi: [{ ssid: 'Music yard', password: '12345678' }] }
  }),
  maya: property('maya', 'בקתות מאיה', 'מושב רמות', 'ramot', 16, {
    content: { nav: { query: 'בקתות מאיה מושב רמות', waze: 'https://waze.com/ul/hsvc6gs4k0' } },
    access: { gate: RAMOT_GATE, wifi: MAYA_WIFI }
  }),
  siesta: property('siesta', 'סייסטה', 'מושב רמות', 'ramot', 17, {
    content: { nav: { query: 'סייסטה ברמות' } },
    access: { gate: RAMOT_GATE, wifi: [] }
  }),
  'casa-nova': property('casa-nova', 'קאסה נובה', 'מושב נוב', 'nov', 20, {
    content: { nav: { query: 'קאסה נובה נוב' } },
    access: { gate: NIGHT_CALL_GATE, wifi: [{ ssid: 'MIALEES', password: 'AD654321' }] }
  })
};

export const UNIT_PROPERTY = {
  'lab-kinneret': 'hill',
  'hill-1': 'hill', 'hill-2': 'hill', 'hill-3': 'hill', 'hill-4': 'hill',
  'dome-blue': 'kipat', 'dome-red': 'kipat', 'dome-green': 'kipat',
  'mialis-villa': 'mialis', 'suite-1': 'mialis', 'suite-2': 'mialis',
  k671: 'nurit', k673: 'nurit', k674: 'nurit', k675: 'nurit', k676: 'nurit', k677: 'nurit', k678: 'nurit', k679: 'nurit',
  k808: 'taj', k809: 'taj', k810: 'taj', k811: 'taj',
  k680: 'mool', k681: 'mool', k682: 'mool', k683: 'mool', k684: 'mool',
  k685: 'nofim', k686: 'nofim',
  k687: 'toscana', k688: 'toscana', k689: 'toscana',
  k690: 'musical', k691: 'musical', k692: 'musical',
  k693: 'maya', k694: 'maya', k695: 'maya',
  k618: 'siesta', k619: 'siesta', k620: 'siesta', k621: 'siesta', k622: 'siesta', k623: 'siesta',
  k826: 'casa-nova', k827: 'casa-nova'
};

const TAJ_TV = [
  'מדליקים את הטלוויזיה בכפתור מצד שמאל.',
  'בשלט YES לוחצים על הכפתור השני העליון משמאל (ריבוע עם חץ) כדי לעבור ל־HDMI.',
  'לוחצים על כפתור YES+ הלבן באמצע השלט להדלקת הממיר.'
];

const MOOL_TV = [
  'סלון וחדר הורים: מדליקים את הטלוויזיה בכפתור בטלוויזיה עצמה.',
  'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
];

const TOSCANA_TV = [
  'סלון: בשלט YES לוחצים על הכפתור הכחול למעלה מימין (TV) להדלקת הטלוויזיה.',
  'בשלט YES לוחצים על הכפתור YES להדלקת הממיר.'
];

/** Key-safe codes from the printed welcome sheets (קוד לכספת-מפתח). */
const LOCKBOX_BY_UNIT = {
  'hill-1': '3041',
  'hill-2': '3042',
  'hill-3': '3043',
  'hill-4': '3044',
  'mialis-villa': '3050',
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

/** Per-cabin overrides only. Missing keys inherit from the property. */
export const UNIT_OVERRIDES = {
  'dome-blue': {
    content: {
      guides: {
        tv: [
          'מדליקים את הטלוויזיה בכפתור בצד הטלוויזיה ומעבירים את הקלט ל־HDMI1.',
          'מדליקים את הממיר בשלט או בלחיצה על הכפתור בממיר עצמו.'
        ]
      }
    }
  },
  k680: {
    content: {
      arrival: 'עוברים את השער הצהוב השני ומיד פונים שמאלה לרחוב בזלת, פונים מיד ימינה לשביל כורכר, בקתה מספר 1 היא האחרונה מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את הפקק בג׳קוזי וממלאים מים עד מעל הסילונים.',
          'לוחצים על הכפתור האדום להפעלת המנועים.',
          'לוחצים על הכפתורים בג׳קוזי להפעלת הסילונים.'
        ],
        tv: MOOL_TV
      }
    }
  },
  k681: {
    content: {
      arrival: 'עוברים את השער הצהוב השני ומיד פונים שמאלה לרחוב בזלת, פונים מיד ימינה לשביל כורכר, בקתה מספר 2 היא הרביעית מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את הג׳קוזי עם מכסה אוניברסלי וממלאים מים עד מעל הסילונים.',
          'לוחצים על הכפתור האדום להפעלת המנועים.',
          'לוחצים על הכפתור בצד שמאל בג׳קוזי להפעלת הסילונים.'
        ],
        tv: MOOL_TV
      }
    }
  },
  k682: {
    content: {
      arrival: 'עוברים את השער הצהוב השני ומיד פונים שמאלה לרחוב בזלת, פונים מיד ימינה לשביל כורכר, בקתה מספר 3 היא השלישית מימין.'
    }
  },
  k683: {
    content: {
      arrival: 'עוברים את השער הצהוב השני ומיד פונים שמאלה לרחוב בזלת, פונים מיד ימינה לשביל כורכר, בקתה מספר 4 היא השנייה מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את הפקק המובנה וממלאים מים עד מעל הסילונים.',
          'לוחצים על הכפתור האדום בכניסה לחדר להפעלת המנועים.',
          'לוחצים על הכפתורים בדפנות הג׳קוזי להפעלת הסילונים.'
        ],
        tv: MOOL_TV
      }
    }
  },
  k684: {
    content: {
      arrival: 'עוברים את השער הצהוב השני ומיד פונים שמאלה לרחוב בזלת, פונים מיד ימינה לשביל כורכר, בקתה מספר 5 היא הראשונה מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את הפקק המובנה וממלאים מים עד מעל הסילונים.',
          'לוחצים על הכפתור האדום בכניסה לחדר להפעלת המנועים.',
          'לוחצים על הכפתורים בדפנות הג׳קוזי להפעלת הסילונים.'
        ],
        tv: MOOL_TV
      }
    }
  },
  k686: {
    access: { wifi: [] },
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים ימינה לרחוב גמלא, פונים שמאלה לבקתות הלבנות, בקתה ראשונה מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את המכסה וממלאים מים עד מעבר לסילונים.',
          'לוחצים על הכפתורים מצד ימין להפעלה.'
        ],
        tv: [
          'חדר שינה הורים: מדליקים בכפתור בטלוויזיה עצמה.',
          'לוחצים על כפתור YES בשלט להפעלת הממיר.'
        ]
      }
    }
  },
  k685: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים ימינה לרחוב גמלא, שמאלה לבקתות הלבנות, בקתה שניה מימין.'
    }
  },
  k687: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב בתרא, בפנייה השניה פונים ימינה לשביל כורכר ומיד שוב ימינה. הבקתה הראשונה מימין.',
      guides: {
        jacuzzi: [
          'סוגרים את הג׳קוזי עם פקק אוניברסלי וממלאים מים חמים עד מעל הסילונים.',
          'מפעילים בלחיצה על הכפתור מצד שמאל שבתוך הג׳קוזי.'
        ],
        tv: TOSCANA_TV
      }
    }
  },
  k688: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב בתרא, בפנייה השניה פונים ימינה לשביל כורכר ומיד שוב ימינה. הבקתה השנייה מימין.',
      guides: { tv: TOSCANA_TV }
    }
  },
  k689: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב בתרא, בפנייה השניה פונים ימינה לשביל כורכר ומיד שוב ימינה. הבקתה האחרונה בצמוד לבריכה — מדרגות למעלה.',
      guides: {
        jacuzzi: [
          'ממלאים את הג׳קוזי — זה לוקח קצת זמן בגלל הגודל.',
          'כשהמים עוברים את הסילונים מרימים את המתג ״ג׳קוזי״ בארון החשמל הלבן ליד דלת הכניסה.'
        ],
        tv: [
          'סלון ומול המיטה הזוגית: בשלט YES לוחצים על הכפתור הכחול למעלה מימין (TV) להדלקת הטלוויזיה.',
          'בשלט YES לוחצים על הכפתור YES להדלקת הממיר.'
        ]
      }
    }
  },
  k690: { content: { arrival: 'עוברים את השער הצהוב השני, פונים ימינה לרחוב דליות, עוברים את הרפת משמאל. הבקתה הראשונה משמאל.' } },
  k691: { content: { arrival: 'עוברים את השער הצהוב השני, פונים ימינה לרחוב דליות, עוברים את הרפת משמאל. הבקתה השנייה משמאל.' } },
  k692: { content: { arrival: 'עוברים את השער הצהוב השני, פונים ימינה לרחוב דליות, עוברים את הרפת משמאל. הבקתה האחרונה משמאל.' } },
  k808: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב זוויתן, ממשיכים עד סוף הכביש ופונים שמאלה. בקתה 1 בפנים ימינה, הכי קיצונית צמודה לבריכה.',
      guides: { tv: TAJ_TV }
    }
  },
  k809: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב זוויתן, ממשיכים עד סוף הכביש ופונים שמאלה. בקתה 2 הראשונה מימין בפנים.',
      guides: { tv: TAJ_TV }
    }
  },
  k810: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב זוויתן, ממשיכים עד סוף הכביש ופונים שמאלה. בקתה 3 שניה מימין בפנים.',
      guides: { tv: TAJ_TV }
    }
  },
  k811: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, פונים שמאלה לרחוב זוויתן, ממשיכים עד סוף הכביש ופונים שמאלה. בקתה 4 הראשונה בכניסה משמאל.',
      guides: { tv: TAJ_TV }
    }
  },
  k693: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה, חניה משמאל. הבקתה הראשונה מימין.' } },
  k694: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה, חניה משמאל. הבקתה השנייה מימין (האמצעית).',
      guides: {
        jacuzzi: [
          'מדליקים את המתג האדום ליד הג׳קוזי.',
          'סוגרים את הפקק וממלאים מים עד מעל הסילונים.',
          'לוחצים על הכפתור בג׳קוזי מצד שמאל להפעלת הסילונים.'
        ],
        tv: [
          'טלוויזיה סלון: כיבוי והדלקה בכפתור הדלקה, בוחרים קלט HDMI1, ומדליקים את הממיר בכפתור מימין בשלט YES.',
          'טלוויזיה חדר שינה: כיבוי והדלקה בכפתור (אפשר גם מהטלוויזיה), ומדליקים את הממיר בכפתור מימין בשלט YES.'
        ]
      }
    }
  },
  k695: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה, חניה משמאל. הבקתה האחרונה מימין.' } },
  k671: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. ממשיכים עד הסוף, הבקתה האחרונה משמאל.',
      guides: {
        jacuzzi: [
          'ממלאים מים עד מעל הסילונים.',
          'מדליקים את המתג מצד שמאל ליד המיטה להפעלת מנועי הג׳קוזי.',
          'לוחצים על הכפתור מצד ימין להפעלת הסילונים.'
        ],
        tv: [
          'בשלט הטלוויזיה לוחצים על כפתור ההדלקה.',
          'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
        ]
      }
    }
  },
  k673: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. ממשיכים עד הסוף, אחת לפני האחרונה משמאל.',
      guides: {
        jacuzzi: [
          'ממלאים מים חמים עד מעל הסילונים ומפעילים בלחיצה על הכפתור מצד שמאל.',
          'סוגרים את הג׳קוזי עם פקק אוניברסלי.'
        ],
        tv: [
          'סלון וחדר הורים: בשלט YES לוחצים על הכפתור הכחול למעלה מימין (TV) להדלקת הטלוויזיה.',
          'בשלט YES לוחצים על הכפתור YES להדלקת הממיר.'
        ]
      }
    }
  },
  k674: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה שישית משמאל בפנים.',
      guides: {
        jacuzzi: [
          'סוגרים את הג׳קוזי עם פקק אוניברסלי וממלאים מים עד מעל הסילונים.',
          'מפעילים בכפתורים מצד שמאל ליד ברז המילוי.'
        ],
        tv: [
          'חדר הורים: בשלט YES לוחצים על הכפתור הכחול למעלה מימין (TV) להדלקת הטלוויזיה.',
          'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
        ]
      }
    }
  },
  k675: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה חמישית משמאל.',
      guides: {
        jacuzzi: [
          'סוגרים את הג׳קוזי עם פקק אוניברסלי וממלאים מים חמים עד מעל הסילונים.',
          'מפעילים בלחיצה על הכפתור האדום מצד ימין על הקיר, על הכפתור מצד שמאל, וגם בג׳קוזי עצמו.'
        ],
        tv: [
          'חדר הורים: בשלט YES לוחצים על הכפתור הכחול למעלה מימין (TV) להדלקת הטלוויזיה.',
          'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
        ]
      }
    }
  },
  k676: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה שלישית משמאל.',
      guides: {
        jacuzzi: [
          'ממלאים מים חמים עד מעל הסילונים.',
          'מפעילים בלחיצה על הכפתור on/off מצד שמאל בג׳קוזי.',
          'סוגרים את הג׳קוזי עם פקק אוניברסלי.'
        ],
        tv: [
          'בשלט הטלוויזיה לוחצים על הכפתור הלבן (בין NETFLIX ל־PRIME VIDEO) ומעבירים ל־HDMI 1.',
          'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
        ]
      }
    }
  },
  k677: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה רביעית משמאל בפנים.',
      guides: {
        jacuzzi: [
          'סוגרים את הג׳קוזי עם פקק אוניברסלי וממלאים מים עד מעל הסילונים.',
          'מפעילים בכפתורים מצד שמאל ליד ברז המילוי.'
        ],
        tv: [
          'בשלט הטלוויזיה לוחצים על הכפתור הלבן (בין NETFLIX ל־PRIME VIDEO) ומעבירים ל־HDMI 1.',
          'בשלט YES לוחצים על הכפתור הלבן YES להדלקת הממיר.'
        ]
      }
    }
  },
  k678: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה הראשונה משמאל.',
      guides: {
        jacuzzi: [
          'ממלאים מים חמים עד מעל הסילונים.',
          'מפעילים בלחיצה על הכפתור מצד ימין.',
          'סוגרים את הג׳קוזי עם פקק אוניברסלי.'
        ],
        tv: [
          'סלון: בשלט הטלוויזיה לוחצים על הכפתור הלבן (בין NETFLIX ל־PRIME VIDEO) ומעבירים ל־HDMI 3, ואז YES להדלקת הממיר.',
          'חדר שינה: בשלט הטלוויזיה לוחצים על הכפתור הלבן ומעבירים ל־HDMI 1, ואז YES להדלקת הממיר.'
        ]
      }
    }
  },
  k679: {
    content: {
      arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, ימינה לרחוב יהודיה ואז ימינה בפנייה הראשונה. הבקתה השנייה משמאל.',
      guides: {
        jacuzzi: [
          'ממלאים מים חמים עד מעל הסילונים.',
          'מפעילים בלחיצה על הכפתור מצד ימין.',
          'סוגרים את הג׳קוזי עם פקק אוניברסלי.'
        ],
        tv: [
          'בשלט הטלוויזיה לוחצים על הכפתור הלבן (בין NETFLIX ל־PRIME VIDEO) ומעבירים ל־HDMI 1.',
          'בשלט YES לוחצים על הכפתור YES להדלקת הממיר.'
        ]
      }
    }
  },
  k618: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן. אחרי השטח הפתוח שלט סייסטה מעץ. הבקתה הראשונה משמאל.' } },
  k619: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן. אחרי השטח הפתוח שלט סייסטה מעץ. הבקתה הראשונה מימין.' } },
  k620: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן, ימינה בשלט בקתות עץ. הבקתה הראשונה מימין.' } },
  k621: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן, ימינה בשלט בקתות עץ. הבקתה למטה בשביל ממול.' } },
  k622: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן, ימינה בשלט בקתות עץ. הבקתה משמאל (חוצים לצד השני).' } },
  k623: { content: { arrival: 'עוברים את השער הצהוב השני, ישר דרך הכיכר, שמאלה לרחוב ירדן, ימינה בשלט בקתות עץ. יורדים למטה ושמאלה, האחרונה מימין.' } }
};

export function propertyIdForUnit(unitId) {
  return UNIT_PROPERTY[String(unitId || '')] || null;
}

export function seedProperty(propertyId) {
  return PROPERTY_SEED[propertyId] || null;
}

export function seedUnitOverride(unitId) {
  const id = String(unitId || '');
  const prev = UNIT_OVERRIDES[id] || {};
  const lockbox = LOCKBOX_BY_UNIT[id];
  if (!lockbox) return prev;
  return {
    ...prev,
    access: { ...prev.access, lockbox }
  };
}

/** Key-safe code for field staff — unit override, then printed welcome-sheet list. */
export function lockboxCodeForUnit(unit) {
  const fromUnit = String(unit?.access?.lockbox || '').trim();
  if (fromUnit && fromUnit !== '0000') return fromUnit;
  return LOCKBOX_BY_UNIT[String(unit?.id || '')] || '';
}

export function propertyRows(tenantId, now = new Date().toISOString()) {
  return Object.values(PROPERTY_SEED).map((row, index) => ({
    tenant_id: tenantId,
    id: row.id,
    name: row.name,
    village: row.village,
    cluster: row.cluster,
    sort_order: row.sort_order || index + 1,
    content: row.content,
    access: row.access,
    created_at: now,
    updated_at: now
  }));
}

function emptyJson(value) {
  return !isFilledJson(value);
}

function withoutStaleLockbox(access) {
  if (!access || typeof access !== 'object') return {};
  const next = { ...access };
  if (next.lockbox === '0000') delete next.lockbox;
  return next;
}

async function syncCasaNovaVillage(tenantId, now) {
  const seeded = PROPERTY_SEED['casa-nova'];
  const local = await db.properties.get('casa-nova');
  if (local) {
    await db.properties.put({
      ...local,
      village: 'מושב נוב',
      cluster: 'nov',
      access: { ...local.access, ...seeded.access },
      updated_at: now
    });
  }
  if (!tenantId) return;
  await supabase
    .from('resort_properties')
    .update({
      village: 'מושב נוב',
      cluster: 'nov',
      access: seeded.access,
      updated_at: now
    })
    .eq('tenant_id', tenantId)
    .eq('id', 'casa-nova');
}

export async function ensureGuestProfiles(tenantId) {
  if (!tenantId) return;
  const now = new Date().toISOString();
  const properties = propertyRows(tenantId, now);

  const { data: remoteProps, error: propPullErr } = await supabase
    .from('resort_properties')
    .select('*')
    .eq('tenant_id', tenantId);

  if (propPullErr) {
    console.warn('[RESORT PROPERTIES PULL]', propPullErr.message);
    const localCount = await db.properties.count().catch(() => 0);
    if (!localCount) {
      for (const row of properties) await db.properties.put(row);
    }
  } else {
    const have = new Set((remoteProps || []).map((row) => row.id));
    const missing = properties.filter((row) => !have.has(row.id));
    if (missing.length) {
      const { error: insertErr } = await supabase.from('resort_properties').upsert(missing);
      if (insertErr) console.warn('[RESORT PROPERTIES SEED]', insertErr.message);
    }
    const { data: latest } = await supabase.from('resort_properties').select('*').eq('tenant_id', tenantId);
    for (const row of latest || remoteProps || []) await db.properties.put(row);
  }

  for (const seeded of properties) {
    const local = await db.properties.get(seeded.id);
    if (!local) continue;
    const access = withoutStaleLockbox({
      ...(local.access && typeof local.access === 'object' ? local.access : {}),
      ...seeded.access
    });
    await db.properties.put({ ...local, name: seeded.name, access, updated_at: now });
    if (!propPullErr) {
      const { error: accessErr } = await supabase
        .from('resort_properties')
        .update({ name: seeded.name, access, updated_at: now })
        .eq('tenant_id', tenantId)
        .eq('id', seeded.id);
      if (accessErr) console.warn('[RESORT PROPERTY ACCESS]', seeded.id, accessErr.message);
    }
  }

  for (const [unitId, propertyId] of Object.entries(UNIT_PROPERTY)) {
    const existing = await db.units.get(unitId);
    if (!existing) continue;
    const override = seedUnitOverride(unitId);
    const nextAccess = { ...(existing.access && typeof existing.access === 'object' ? existing.access : {}), ...(override.access || {}) };
    if (!override.access?.lockbox && nextAccess.lockbox === '0000') delete nextAccess.lockbox;
    await db.units.put({
      ...existing,
      property_id: existing.property_id || propertyId,
      content: emptyJson(existing.content) ? (override.content || {}) : existing.content,
      access: nextAccess
    });
  }

  await syncCasaNovaVillage(tenantId, now);

  if (propPullErr) return;

  for (const [unitId, propertyId] of Object.entries(UNIT_PROPERTY)) {
    const override = seedUnitOverride(unitId);
    const { data: remote } = await supabase
      .from('resort_units')
      .select('id, property_id, content, access')
      .eq('tenant_id', tenantId)
      .eq('id', unitId)
      .maybeSingle();
    if (!remote) continue;
    const patch = { updated_at: now };
    if (!remote.property_id) patch.property_id = propertyId;
    if (emptyJson(remote.content)) patch.content = override.content || {};
    const nextAccess = { ...(remote.access && typeof remote.access === 'object' ? remote.access : {}), ...(override.access || {}) };
    if (!override.access?.lockbox && nextAccess.lockbox === '0000') delete nextAccess.lockbox;
    if (override.access?.lockbox || override.access?.wifi || nextAccess.lockbox !== remote.access?.lockbox) {
      patch.access = nextAccess;
    }
    if (Object.keys(patch).length === 1) continue;
    const { error: unitErr } = await supabase
      .from('resort_units')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('id', unitId);
    if (unitErr) {
      console.warn('[RESORT UNIT PROFILES SEED]', unitId, unitErr.message);
      return;
    }
  }
}
