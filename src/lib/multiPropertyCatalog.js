/**
 * 12 Property Brand Themes & Complete Real Data Configurations
 * Source: amenities-summary-2026-08-24.md (Ran & Dib, verified occupancy & amenities)
 * MIALEES RESORT + 11 Golan & Ramot Luxury Complexes (46 Canonical Units)
 */

export const PROPERTY_THEMES = {
  mialees: {
    id: 'mialees',
    slug: 'mialees',
    name: 'MIALEES RESORT',
    hebrewName: 'מיאליס ריזורט',
    tagline: 'חוויית אירוח יוקרתית מול נוף הכנרת',
    subTitle: 'וילת יוקרה וסוויטות בוטיק פרטיות במושב נאות גולן',
    village: 'מושב נאות גולן',
    region: 'דרום רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    email: 'info@mialees.co.il',
    wazeUrl: 'https://waze.com/ul?q=Mialees+Resort&navigate=yes',
    mapsUrl: 'https://maps.google.com/?q=Neot+Golan',
    instagram: 'mialees.resort',
    theme: {
      primary: '#26130F',       // Dark Wine Brown
      secondary: '#736055',     // Soft Brown
      accent: '#59454A',        // Deep Pink / Wine
      background: '#FDFBF7',    // Light warm background
      bgSoft: '#F2E4E9',        // Pink Dream
      surface: '#FFFFFF',
      surfaceSoft: '#F8F3F0',
      border: '#BFB3A8',        // Cloudy Moca
      borderLight: '#E8DED8',
      brandPink: '#F2D5DD',     // Candy Pink
      dark: '#26130F',
      darkSoft: '#3F2C29',
      gold: '#C5A880',
      badgeBg: '#59454A',
      badgeText: '#FFFFFF'
    },
    heroImage: '/resorts/mialees.jpg',
    galleryImages: [
      '/resorts/mialees.jpg',
      '/resorts/hero-luxury.jpg',
      '/resorts/hero-couples.jpg',
      '/hero-resort.jpg'
    ],
    amenities: [
      'בריכה פרטית מחוממת ל-28° לכל יחידה',
      'ג׳קוזי ספא חיצוני',
      'מכונת אספרסו נספרסו',
      'מיקרוגל ומקרר',
      'מטבחון מאובזר וכלי אוכל',
      'מנגל פרטי בחצר',
      'טלוויזיה עם יס (yes)',
      'אינטרנט Wi-Fi מהיר (CASAMIA)'
    ],
    units: [
      {
        id: 'mialis-villa',
        propertyId: 'mialees',
        name: 'וילה מיאליס ריזורט',
        englishName: 'Villa Mialees Resort',
        type: 'villa',
        bedrooms: 4,
        bathrooms: 3,
        maxOccupancy: 12,
        basePrice: 2800,
        weekendPrice: 3800,
        sizeM2: 220,
        description: 'וילת יוקרה רחבת ידיים בת 4 חדרי שינה, מטבח שף מאובזר, סלון ענק, חצר מטופחת עם פינות ישיבה ומנגל מקצועי, ומרפסת פנורמית מול נוף הכנרת.',
        features: [
          '4 חדרי שינה מרווחים עם מיטות קינג סייז',
          'מרפסת נוף פנורמית לכנרת',
          'סלון יוקרתי ומערכת שמע',
          'מטבח שף מאובזר קומפלט + פינת אוכל ל-12 סועדים',
          'מכונת נספרסו, מקרר ומיקרוגל',
          'חצר ענקית עם עמדת גריל גז',
          'טלוויזיות עם יס בכל החדרים',
          'Wi-Fi מהיר ומוצרי טיפוח ממותגים MIALEES'
        ],
        images: [
          '/resorts/hero-luxury.jpg',
          '/resorts/mialees.jpg',
          '/resorts/hero-couples.jpg'
        ]
      },
      {
        id: 'suite-1',
        propertyId: 'mialees',
        name: 'סוויטה 1 (הירוקה)',
        englishName: 'Suite 1 (Green)',
        type: 'suite',
        bedrooms: 1,
        bathrooms: 1,
        maxOccupancy: 4,
        basePrice: 800,
        weekendPrice: 1200,
        sizeM2: 55,
        description: 'סוויטת בוטיק פרטית ואינטימית עם בריכה פרטית מחוממת וג׳קוזי ספא חיצוני ענק, מטבחון מאובזר ופרטיות מוחלטת.',
        features: [
          'זוג + 2', 'בריכה פרטית מחוממת ל-28°',
          'ג׳קוזי ספא זרמים מפנק בחצר',
          'מיטת קינג סייז מצעי פרימיום',
          'מטבחון מאובזר, מכונת נספרסו, מיקרו ומקרר',
          'מנגל בחצר הפרטית',
          'טלוויזיה עם יס ו-Wi-Fi מהיר',
          'חלוקי רחצה ומוצרי אמבט ממותגים'
        ],
        images: [
          '/resorts/hero-couples.jpg',
          '/resorts/mialees.jpg'
        ]
      },
      {
        id: 'suite-2',
        propertyId: 'mialees',
        name: 'סוויטה 2 (הורודה)',
        englishName: 'Suite 2 (Pink)',
        type: 'suite',
        bedrooms: 1,
        bathrooms: 1,
        maxOccupancy: 4,
        basePrice: 800,
        weekendPrice: 1200,
        sizeM2: 55,
        description: 'סוויטת בוטיק מעוצבת בגווני מוקה וחום יין, עם בריכה פרטית וג׳קוזי ספא מול שקיעות הזהב הקסומות של הכנרת.',
        features: [
          'זוג + 2', 'בריכה פרטית מחוממת ל-28° מול נוף השקיעה',
          'ג׳קוזי ספא חיצוני מפואר',
          'מטבחון מאובזר, נספרסו, מיקרוגל ומקרר',
          'מנגל בחצר הפרטית',
          'טלוויזיה עם יס ו-Wi-Fi מהיר',
          'מוצרי טיפוח ממותגי יוקרה MIALEES'
        ],
        images: [
          '/resorts/mialees.jpg',
          '/resorts/hero-couples.jpg'
        ]
      },
      {
        id: 'mialees-buyout',
        propertyId: 'mialees',
        name: 'המתחם כולו בבלעדיות (Full Buyout)',
        englishName: 'Full Resort Buyout',
        type: 'buyout',
        isFullBuyout: true,
        bedrooms: 6,
        bathrooms: 5,
        maxOccupancy: 20,
        basePrice: 4400,
        weekendPrice: 6200,
        sizeM2: 330,
        description: 'סגירה בלעדית של כל ריזורט מיאליס: וילת הנוף + 2 סוויטות הבוטיק. 2 בריכות פרטיות, 2 מתחמי ג׳קוזי ספא ופרטיות אבסולוטית.',
        features: [
          'נעילה בלעדית של וילת הנוף ו-2 סוויטות הבוטיק',
          'בריכות פרטיות מחוממות ל-28°',
          '2 מתחמי ג׳קוזי ספא נפרדים',
          'עד 20 אורחים בפרטיות מושלמת'
        ],
        images: [
          '/resorts/hero-luxury.jpg',
          '/resorts/hero-couples.jpg',
          '/resorts/mialees.jpg'
        ]
      }
    ]
  },

  toscana: {
    id: 'toscana',
    slug: 'toscana',
    name: 'בקתות טוסקנה',
    hebrewName: 'בקתות טוסקנה',
    tagline: 'אווירה טוסקנית קסומה בלב רמות',
    subTitle: 'בקתות עץ איטלקיות מרווחות, בריכת שחייה, ג׳קוזי ספא וסאונה בשאטו',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Toscana+Cabins+Ramot&navigate=yes',
    theme: {
      primary: '#1E3A2F',
      secondary: '#4D6A5A',
      accent: '#8C6239',
      background: '#FAF8F5',
      bgSoft: '#EDE6DD',
      surface: '#FFFFFF',
      surfaceSoft: '#F2ECE4',
      border: '#D9CFC4',
      borderLight: '#E8E1D7',
      dark: '#1E3A2F',
      darkSoft: '#2D4A3E',
      gold: '#C5A880'
    },
    heroImage: '/resorts/toscana.jpg',
    galleryImages: [
      '/resorts/toscana.jpg'
    ],
    amenities: [
      'בריכה מרכזית מחוממת ל-28° לכל המתחם',
      'ג׳קוזי ספא ענק',
      'נוף פנורמי לכנרת',
      'מכונת קפה נספרסו',
      'מטבחון מאובזר',
      'מנגל פרטי לכל בקתה',
      'סאונה יבשה (בשאטו)',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      {
        id: 'k687',
        propertyId: 'toscana',
        name: 'טוסקנה · 1',
        type: 'cabin',
        maxOccupancy: 4,
        basePrice: 600,
        weekendPrice: 900,
        description: 'בקתת עץ איטלקית כפרית ורחבת ידיים עם ג׳קוזי ספא פנימי, מרפסת דק מעץ ומטבחון מאובזר.',
        features: ['זוג + 2', 'ג׳קוזי ספא פנימי', 'מטבחון, נספרסו, מיקרוגל, מקרר ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'],
        images: ['/resorts/toscana.jpg']
      },
      {
        id: 'k688',
        propertyId: 'toscana',
        name: 'טוסקנה · 2',
        type: 'cabin',
        maxOccupancy: 4,
        basePrice: 600,
        weekendPrice: 900,
        description: 'בקתת עץ משפחתית חמימה מול מדשאות ירוקות ובריכת השחייה של המתחם.',
        features: ['זוג + 2', 'ג׳קוזי ספא מפנק', 'מטבחון מאובזר, נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'],
        images: ['/resorts/toscana.jpg']
      },
      {
        id: 'k689',
        propertyId: 'toscana',
        name: 'טוסקנה · שאטו',
        type: 'villa',
        maxOccupancy: 7,
        basePrice: 850,
        weekendPrice: 1500,
        description: 'בקתת שאטו ענקית ומפוארת למשפחות וקבוצות, כוללת סאונה יבשה פרטית, ג׳קוזי ספא ומטבח רחב.',
        features: ['זוג + 5', 'סאונה יבשה פרטית', 'ג׳קוזי ספא', 'מטבחון מאובזר, נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'],
        images: ['/resorts/toscana.jpg']
      }
    ]
  },

  nurit: {
    id: 'nurit',
    slug: 'nurit',
    name: 'בתי נורית',
    hebrewName: 'בתי נורית',
    isTemporarilyDisabled: true,
    isActive: false,
    tagline: '8 בקתות עץ כפריות במושב רמות',
    subTitle: 'מתחם נופש פסטורלי עם בריכת שחייה, סאונה יבשה, מטבח מרכזי וג׳קוזי',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Batey+Nurit+Ramot&navigate=yes',
    theme: {
      primary: '#3B2F2F',
      secondary: '#6E5D53',
      accent: '#B8860B',
      background: '#FDFCF7',
      bgSoft: '#F4EFE6',
      surface: '#FFFFFF',
      surfaceSoft: '#F7F3EB',
      border: '#DFD7CA',
      borderLight: '#EBE5DA',
      dark: '#3B2F2F',
      darkSoft: '#4A3D3D',
      gold: '#C5A880'
    },
    heroImage: '/resorts/nurit.jpg',
    amenities: [
      'מטבח מרכזי משותף ענק',
      'סאונה יבשה במתחם',
      'בריכה מרכזית מחוממת ל-28° לכל המתחם',
      'ג׳קוזי ספא בכל בקתה',
      'מכונת נספרסו ומיקרוגל',
      'מקרר ומטבחון בכל יחידה',
      'מנגל פרטי לכל בקתה',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k671', propertyId: 'nurit', name: 'בתי נורית 1', type: 'cabin', maxOccupancy: 2, basePrice: 500, weekendPrice: 900, description: 'בקתת עץ כפרית ומטופחת עם ג׳קוזי פנימי ומטבחון.', features: ['זוג', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k673', propertyId: 'nurit', name: 'בתי נורית 2', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ משפחתית מרווחת מול המדשאות.', features: ['זוג + 2', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k674', propertyId: 'nurit', name: 'בתי נורית 3', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ משפחתית מרווחת.', features: ['זוג + 2', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k675', propertyId: 'nurit', name: 'בתי נורית 4', type: 'cabin', maxOccupancy: 2, basePrice: 500, weekendPrice: 900, description: 'בקתת עץ כפרית ושקטה.', features: ['זוג', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k676', propertyId: 'nurit', name: 'בתי נורית 5', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ משפחתית גדולה.', features: ['זוג + 2', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k677', propertyId: 'nurit', name: 'בתי נורית 6', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ משפחתית גדולה.', features: ['זוג + 2', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k678', propertyId: 'nurit', name: 'בתי נורית 7', type: 'cabin', maxOccupancy: 2, basePrice: 500, weekendPrice: 900, usage: 'STAFF_ACCOMMODATION', booking_enabled: false, description: 'מגורי צוות ועובדים.', features: ['מגורי עובדים', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k679', propertyId: 'nurit', name: 'בתי נורית 8', type: 'cabin', maxOccupancy: 2, basePrice: 500, weekendPrice: 900, usage: 'STAFF_ACCOMMODATION', booking_enabled: false, description: 'מגורי צוות ועובדים.', features: ['מגורי עובדים', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] }
    ]
  },

  taj: {
    id: 'taj',
    slug: 'taj',
    name: 'טאג׳ מאהל',
    hebrewName: 'טאג׳ מאהל',
    tagline: 'בקתות עץ אוריינטליות מול נוף הכנרת במושב רמות',
    subTitle: 'מתחם 4 בקתות עץ בעיצוב אוריינטלי יוקרתי עם בריכת שחייה מחוממת ונוף ישיר לקו המים של הכנרת',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Taj+Mahal+Ramot&navigate=yes',
    theme: {
      primary: '#2B261F',
      secondary: '#5C5449',
      accent: '#9E723D',
      background: '#FCFBF7',
      bgSoft: '#F2EDE4',
      surface: '#FFFFFF',
      surfaceSoft: '#F5F1E8',
      border: '#DDD6C9',
      borderLight: '#EBE5DA',
      dark: '#2B261F',
      darkSoft: '#3D362C',
      gold: '#C5A880'
    },
    heroImage: '/resorts/taj.jpg',
    amenities: [
      'בריכה מרכזית מחוממת ל-28°',
      'ג׳קוזי ספא בכל בקתה',
      'עמדת גריל גז ומנגל',
      'נוף מלא לכנרת',
      'מכונת נספרסו ומיקרוגל',
      'מקרר ומטבחון בכל יחידה',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k808', propertyId: 'taj', name: 'טאג׳ מאהל · בקתה 1', type: 'cabin', maxOccupancy: 2, basePrice: 800, weekendPrice: 1200, description: 'בקתת עץ רומנטית לזוגות עם ג׳קוזי ספא ומרפסת דק.', features: ['זוג (2 אורחים)', 'ג׳קוזי ספא', 'נספרסו, מיקרו, מקרר, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k809', propertyId: 'taj', name: 'טאג׳ מאהל · בקתה 2', type: 'cabin', maxOccupancy: 2, basePrice: 800, weekendPrice: 1200, description: 'בקתת עץ רומנטית לזוגות עם ג׳קוזי ספא.', features: ['לזוגות בלבד', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k810', propertyId: 'taj', name: 'טאג׳ מאהל · בקתה 3', type: 'cabin', maxOccupancy: 2, basePrice: 800, weekendPrice: 1200, description: 'בקתת עץ רומנטית ואינטימית לזוגות.', features: ['זוג (2 אורחים)', 'ג׳קוזי ספא', 'נספרסו, מיקרו, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k811', propertyId: 'taj', name: 'טאג׳ מאהל · בקתה 4', type: 'cabin', maxOccupancy: 2, basePrice: 800, weekendPrice: 1200, description: 'בקתת עץ שלווה צמודה לבריכה.', features: ['זוג (2 אורחים)', 'ג׳קוזי ספא', 'נספרסו, מיקרו, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'] }
    ]
  },

  mool: {
    id: 'mool',
    slug: 'mool',
    name: 'מול הנוף',
    hebrewName: 'מול הנוף',
    tagline: '5 בקתות עץ יוקרתיות על מצוק הנוף של רמות',
    subTitle: 'מתחם מול הנוף ממוקם בנקודה הגבוהה ברמות, ומציע נוף ישיר לכנרת, צמחייה עשירה ובריכת שחייה',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Mool+Hanof+Ramot&navigate=yes',
    theme: {
      primary: '#1A3344',
      secondary: '#436174',
      accent: '#2A7B9B',
      background: '#F8FBFC',
      bgSoft: '#E6EFF4',
      surface: '#FFFFFF',
      surfaceSoft: '#EDF5F8',
      border: '#C8D9E3',
      borderLight: '#DCE7EE',
      dark: '#1A3344',
      darkSoft: '#28465C',
      gold: '#C5A880'
    },
    heroImage: '/resorts/mool.jpg',
    galleryImages: [
      '/resorts/mool.jpg',
      '/resorts/gallery/mool/mool-dining.jpg',
      '/resorts/gallery/mool/mool-jacuzzi.jpg',
      '/resorts/gallery/mool/mool-cabin-view.jpg',
      '/resorts/gallery/mool/mool-bedroom.jpg'
    ],
    amenities: [
      'בריכה מרכזית מחוממת ל-28°',
      'ג׳קוזי פנורמי',
      'נוף עוצר נשימה לכנרת',
      'מטבחון שף בכל יחידה',
      'מכונת נספרסו ומיקרוגל',
      'מקרר ומטבחון',
      'מנגל פרטי',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k680', propertyId: 'mool', name: 'מול הנוף · בקתה 1', type: 'cabin', maxOccupancy: 5, basePrice: 500, weekendPrice: 900, description: 'בקתת עץ עם מרפסת נוף פתוחה וישירה לכנרת.', features: ['עד 5 אורחים', 'נוף פנורמי לכנרת', 'ג׳קוזי', 'נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/mool.jpg', '/resorts/gallery/mool/mool-dining.jpg'] },
      { id: 'k681', propertyId: 'mool', name: 'מול הנוף · בקתה 2', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ מרווחת מול השקיעות.', features: ['זוג + 2', 'ג׳קוזי ספא מול הנוף', 'נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/mool/mool-jacuzzi.jpg', '/resorts/mool.jpg'] },
      { id: 'k682', propertyId: 'mool', name: 'מול הנוף · בקתה 3', type: 'cabin', maxOccupancy: 4, basePrice: 800, weekendPrice: 1300, description: 'בקתת עץ מרווחת מול הנוף.', features: ['זוג + 2', 'ג׳קוזי ספא מול הנוף', 'נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/mool/mool-cabin-view.jpg', '/resorts/mool.jpg'] },
      { id: 'k683', propertyId: 'mool', name: 'מול הנוף · בקתה 4', type: 'cabin', maxOccupancy: 5, basePrice: 500, weekendPrice: 900, description: 'בקתת עץ נעימה ושקטה מול הכנרת.', features: ['עד 5 אורחים', 'מרפסת נוף', 'ג׳קוזי', 'נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/mool/mool-bedroom.jpg', '/resorts/mool.jpg'] },
      { id: 'k684', propertyId: 'mool', name: 'מול הנוף · בקתה 5', type: 'cabin', maxOccupancy: 5, basePrice: 500, weekendPrice: 900, description: 'בקתת עץ פסטורלית עם נוף מרהיב.', features: ['עד 5 אורחים', 'מרפסת נוף', 'ג׳קוזי', 'נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/mool.jpg', '/resorts/gallery/mool/mool-dining.jpg'] }
    ]
  },

  nofim: {
    id: 'nofim',
    slug: 'nofim',
    name: 'נופים בלבן',
    hebrewName: 'נופים בלבן',
    tagline: 'סוויטות יוקרה בלבן עם בריכות פרטיות מול הכנרת',
    subTitle: '2 בקתות עץ רומנטיות, בריכה פרטית מחוממת ל-28° ונוף פתוח לכנרת',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Nofim+Belavan+Ramot&navigate=yes',
    theme: {
      primary: '#2E353B',
      secondary: '#5A6570',
      accent: '#6B8E9E',
      background: '#F9FAFC',
      bgSoft: '#E9EEF2',
      surface: '#FFFFFF',
      surfaceSoft: '#F0F4F7',
      border: '#D1DCE3',
      borderLight: '#E2EAF0',
      dark: '#2E353B',
      darkSoft: '#3C454D',
      gold: '#C5A880'
    },
    heroImage: '/resorts/nofim.jpg',
    galleryImages: [
      '/resorts/nofim.jpg',
      '/resorts/gallery/nofim/nofim-suite-jacuzzi.jpg',
      '/resorts/gallery/nofim/nofim-terrace-lake.jpg',
      '/resorts/gallery/nofim/nofim-pool-wide.jpg',
      '/resorts/gallery/nofim/nofim-bedroom.jpg'
    ],
    amenities: [
      'בריכה פרטית מחוממת ל-28° לכל צימר',
      'ג׳קוזי ספא זרמים',
      'עיצוב אדריכלי לבן',
      'נוף פתוח לכנרת',
      'מכונת נספרסו ומיקרוגל',
      'מקרר ומטבחון פרטי',
      'מנגל פרטי בחצר',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k685', propertyId: 'nofim', name: 'נופים בלבן · בקתה 1', type: 'cabin', maxOccupancy: 4, basePrice: 750, weekendPrice: 1200, description: 'בקתת עץ מעוצבת ומרווחת בלבן עם קומת גלריית שינה, בריכה פרטית וג׳קוזי מול הכנרת.', features: ['זוג + 2', 'קומת גלריה מרווחת', 'בריכה פרטית מחוממת ל-28°', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/nofim.jpg', '/resorts/gallery/nofim/nofim-suite-jacuzzi.jpg'] },
      { id: 'k686', propertyId: 'nofim', name: 'נופים בלבן · בקתה 2', type: 'cabin', maxOccupancy: 4, basePrice: 750, weekendPrice: 1200, description: 'בקתת עץ יוקרתית בלבן עם קומת גלריה, בריכה פרטית ונוף פנורמי.', features: ['זוג + 2', 'קומת גלריה מרווחת', 'בריכה פרטית מחוממת ל-28°', 'ג׳קוזי ספא', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/nofim.jpg', '/resorts/gallery/nofim/nofim-terrace-lake.jpg'] }
    ]
  },

  musical: {
    id: 'musical',
    slug: 'musical',
    name: 'החצר המוסיקלית',
    hebrewName: 'החצר המוסיקלית',
    tagline: 'מתחם נופש אינטימי עם חצר מרכזית',
    subTitle: 'שלוש בקתות עץ אינטימיות סביב חצר מרכזית פסטורלית במושב רמות – חליל, מיתר ופעמון',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Musical+Yard+Ramot&navigate=yes',
    theme: {
      primary: '#332724',
      secondary: '#66524C',
      accent: '#A06E58',
      background: '#FCFBF8',
      bgSoft: '#F4ECE7',
      surface: '#FFFFFF',
      surfaceSoft: '#F6EFEB',
      border: '#DFD2CA',
      borderLight: '#ECE2DB',
      dark: '#332724',
      darkSoft: '#453531',
      gold: '#C5A880'
    },
    heroImage: '/resorts/musical.jpg',
    galleryImages: [
      '/resorts/musical.jpg',
      '/resorts/gallery/musical/musical-suite.jpg',
      '/resorts/gallery/musical/musical-jacuzzi.jpg',
      '/resorts/gallery/musical/musical-courtyard.jpg',
      '/resorts/gallery/musical/musical-bedroom.jpg'
    ],
    amenities: [
      'מתחם נופש אינטימי עם חצר מרכזית',
      'לזוגות בלבד',
      'בריכה מרכזית מרעננת',
      'ג׳קוזי זוגי בכל בקתה',
      'חצר מרכזית פסטורלית (המתחם אינו מגודר)',
      'מנגל פרטי לכל בקתה',
      'מכונת נספרסו ומיקרוגל',
      'ללא אפשרות לבשל בבקתה (מקרר, מיקרוגל ופינת קפה בלבד)',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k690', propertyId: 'musical', name: 'חצר מוסיקלית · חליל', type: 'cabin', maxOccupancy: 2, basePrice: 600, weekendPrice: 900, description: 'מתחם נופש אינטימי עם חצר מרכזית · בקתת עץ כפרית ונעימה עם ג׳קוזי זוגי (ללא אפשרות לבשל בבקתה).', features: ['מתחם נופש אינטימי עם חצר מרכזית', 'לזוגות בלבד', 'ג׳קוזי זוגי', 'ללא אפשרות לבשל בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/musical.jpg', '/resorts/gallery/musical/musical-suite.jpg'] },
      { id: 'k691', propertyId: 'musical', name: 'חצר מוסיקלית · מיתר', type: 'cabin', maxOccupancy: 2, basePrice: 600, weekendPrice: 900, description: 'מתחם נופש אינטימי עם חצר מרכזית · בקתת עץ פסטורלית ושקטה (ללא אפשרות לבשל בבקתה).', features: ['מתחם נופש אינטימי עם חצר מרכזית', 'לזוגות בלבד', 'ג׳קוזי זוגי', 'ללא אפשרות לבשל בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/musical/musical-courtyard.jpg', '/resorts/gallery/musical/musical-jacuzzi.jpg'] },
      { id: 'k692', propertyId: 'musical', name: 'חצר מוסיקלית · פעמון', type: 'cabin', maxOccupancy: 2, basePrice: 600, weekendPrice: 900, description: 'מתחם נופש אינטימי עם חצר מרכזית · בקתת עץ שלווה מול החצר (ללא אפשרות לבשל בבקתה).', features: ['מתחם נופש אינטימי עם חצר מרכזית', 'לזוגות בלבד', 'ג׳קוזי זוגי', 'ללא אפשרות לבשל בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/musical/musical-bedroom.jpg', '/resorts/musical.jpg'] }
    ]
  },

  maya: {
    id: 'maya',
    slug: 'maya',
    name: 'בקתות מאיה',
    hebrewName: 'בקתות מאיה',
    tagline: 'בקתות עץ מפנקות עם שתי בריכות שחייה נפרדות',
    subTitle: 'מתחם 3 בקתות עץ יפהפיות ברמות, המציע 2 בריכות שחייה נפרדות לחופשה מושלמת',
    village: 'מושב רמות',
    region: 'רמת הגולן והכנרת',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Maya+Cabins+Ramot&navigate=yes',
    theme: {
      primary: '#2C3527',
      secondary: '#53624D',
      accent: '#7A8F70',
      background: '#F9FAF7',
      bgSoft: '#EAEFE7',
      surface: '#FFFFFF',
      surfaceSoft: '#F1F5EE',
      border: '#D2DDCF',
      borderLight: '#E3EAE0',
      dark: '#2C3527',
      darkSoft: '#3A4634',
      gold: '#C5A880'
    },
    heroImage: '/resorts/maya.jpg',
    galleryImages: [
      '/resorts/maya.jpg',
      '/resorts/gallery/maya/maya-living.jpg',
      '/resorts/gallery/maya/maya-bath.jpg',
      '/resorts/gallery/maya/maya-garden.jpg',
      '/resorts/gallery/maya/maya-jacuzzi.jpg'
    ],
    amenities: [
      'לזוגות בלבד. בריכה פרטית מחוממת ל-28° לבקתות 1 ו-3. בקתה 2 בלי בריכה',
      'ג׳קוזי בכל בקתה',
      'מדשאה גדולה ומרחבים ירוקים',
      'מתקני ברביקיו ומנגל פרטי',
      'מכונת נספרסו ומיקרוגל',
      'ללא אפשרות בישול בתוך הבקתה (מקרר, מיקרוגל ופינת קפה בלבד)',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'k693', propertyId: 'maya', name: 'בקתות מאיה · בקתה 1', type: 'cabin', maxOccupancy: 2, basePrice: 750, weekendPrice: 1300, description: 'בקתת עץ מפנקת צמודה לבריכת השחייה הראשונה עם ג׳קוזי פנימי (ללא אפשרות בישול בבקתה).', features: ['לזוגות בלבד', 'בריכה פרטית מחוממת ל-28°', 'ג׳קוזי פנימי', 'ללא אפשרות בישול בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/maya.jpg', '/resorts/gallery/maya/maya-living.jpg'] },
      { id: 'k694', propertyId: 'maya', name: 'בקתות מאיה · בקתה 2', type: 'cabin', maxOccupancy: 2, basePrice: 600, weekendPrice: 900, description: 'בקתת עץ כפרית ושקטה עם ג׳קוזי פנימי (ללא אפשרות בישול בבקתה).', features: ['לזוגות בלבד', 'בלי בריכה', 'ג׳קוזי פנימי', 'ללא אפשרות בישול בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/gallery/maya/maya-garden.jpg', '/resorts/gallery/maya/maya-bath.jpg'] },
      { id: 'k695', propertyId: 'maya', name: 'בקתות מאיה · בקתה 3', type: 'cabin', maxOccupancy: 2, basePrice: 750, weekendPrice: 1300, description: 'בקתת עץ מפנקת צמודה לבריכת השחייה השנייה עם ג׳קוזי פנימי (ללא אפשרות בישול בבקתה).', features: ['לזוגות בלבד', 'בריכה פרטית מחוממת ל-28°', 'ג׳קוזי פנימי', 'ללא אפשרות בישול בבקתה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס ו-Wi-Fi'], images: ['/resorts/maya.jpg', '/resorts/gallery/maya/maya-jacuzzi.jpg'] }
    ]
  },

  hill: {
    id: 'hill',
    slug: 'hill',
    name: 'צימר בגבעה',
    hebrewName: 'צימר בגבעה',
    tagline: '4 בקתות עץ שלווה מול נוף מצוקי גבעת יואב',
    subTitle: 'מתחם אירוח כפרי שקט במושב גבעת יואב, 5 דקות מנאות גולן והכנרת',
    village: 'מושב גבעת יואב',
    region: 'דרום רמת הגולן',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Zimmer+Bagiva+Givat+Yoav&navigate=yes',
    theme: {
      primary: '#2F382B',
      secondary: '#5E6B56',
      accent: '#839678',
      background: '#FAFBF8',
      bgSoft: '#EDF1E8',
      surface: '#FFFFFF',
      surfaceSoft: '#F2F6ED',
      border: '#D5DFCE',
      borderLight: '#E4ECE0',
      dark: '#2F382B',
      darkSoft: '#3E4939',
      gold: '#C5A880'
    },
    heroImage: '/resorts/hill.jpg',
    galleryImages: [
      '/resorts/hill.jpg',
      '/resorts/gallery/hill/hill-night.jpg',
      '/resorts/gallery/hill/hill-loft.jpg',
      '/resorts/gallery/hill/hill-living.jpg',
      '/resorts/gallery/hill/hill-jacuzzi.jpg'
    ],
    amenities: [
      'בריכה מרכזית מחוממת ל-28° לכל המתחם',
      'ג׳קוזי ספא ענק בכל בקתה',
      'נוף פתוח לגולן',
      'מדשאות ופינות ישיבה',
      'מכונת נספרסו ומיקרוגל',
      'מקרר ומטבחון בכל יחידה',
      'מנגל פרטי לכל בקתה',
      'טלוויזיה עם יס ו-Wi-Fi'
    ],
    units: [
      { id: 'hill-1', propertyId: 'hill', name: 'צימר בגבעה 1', type: 'cabin', maxOccupancy: 4, basePrice: 700, weekendPrice: 1100, description: 'בקתת עץ כפרית ושלווה עם ג׳קוזי ספא, גלריית שינה ומטבחון.', features: ['זוג + 2', 'ג׳קוזי ספא', 'גלריית שינה', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/hill.jpg', '/resorts/gallery/hill/hill-living.jpg'] },
      { id: 'hill-2', propertyId: 'hill', name: 'צימר בגבעה 2', type: 'cabin', maxOccupancy: 4, basePrice: 700, weekendPrice: 1100, description: 'בקתת עץ כפרית מרווחת מול החצר והמדשאה.', features: ['זוג + 2', 'ג׳קוזי ספא', 'חצר פסטורלית', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/gallery/hill/hill-night.jpg', '/resorts/gallery/hill/hill-jacuzzi.jpg'] },
      { id: 'hill-3', propertyId: 'hill', name: 'צימר בגבעה 3', type: 'cabin', maxOccupancy: 4, basePrice: 700, weekendPrice: 1100, description: 'בקתת עץ כפרית שקטה ופסטורלית עם גלריה לילדים.', features: ['זוג + 2', 'ג׳קוזי ספא', 'גלריית עץ', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/gallery/hill/hill-loft.jpg', '/resorts/gallery/hill/hill-living.jpg'] },
      { id: 'hill-4', propertyId: 'hill', name: 'צימר בגבעה 4', type: 'cabin', maxOccupancy: 4, basePrice: 700, weekendPrice: 1100, description: 'בקתת עץ כפרית מרווחת עם ג׳קוזי ספא פרטי.', features: ['זוג + 2', 'ג׳קוזי ספא', 'מרפסת דק', 'נספרסו, מיקרוגל, מנגל', 'טלוויזיה עם יס'], images: ['/resorts/hill.jpg', '/resorts/gallery/hill/hill-night.jpg'] }
    ]
  },

  kipat: {
    id: 'kipat',
    slug: 'kipat',
    name: 'כיפת השמיים',
    hebrewName: 'כיפת השמיים',
    tagline: 'גלמפינג כיפות יוקרתיות עם תצפית כוכבים בגבעת יואב',
    subTitle: 'חוויית גלמפינג ייחודית ממוזגת עם ג׳קוזי ספא ושמיים זרועי כוכבים',
    village: 'מושב גבעת יואב',
    region: 'דרום רמת הגולן',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=Kipat+Hashamayim+Givat+Yoav&navigate=yes',
    theme: {
      primary: '#1B263B',
      secondary: '#415A77',
      accent: '#778DA9',
      background: '#FAFBFD',
      bgSoft: '#E8EDF5',
      surface: '#FFFFFF',
      surfaceSoft: '#EFF3F9',
      border: '#CBD6E2',
      borderLight: '#DDE5EF',
      dark: '#1B263B',
      darkSoft: '#293852',
      gold: '#C5A880'
    },
    heroImage: '/resorts/kipat.jpg',
    amenities: [
      'כיפות גלמפינג יוקרתיות ממוזגות',
      'בריכה פרטית מחוממת ל-28° לכל צימר',
      'ג׳קוזי ספא מפנק',
      'תצפית כוכבים פנורמית',
      'מטבחון מאובזר וכלי אוכל',
      'מכונת קפה / קומקום',
      'מקרר',
      'מנגל פרטי בחצר',
      'טלוויזיה עם יס'
    ],
    units: [
      { id: 'dome-blue', propertyId: 'kipat', name: 'כיפת שמיים כחול', type: 'dome', maxOccupancy: 2, basePrice: 1200, weekendPrice: 1500, description: 'כיפת גלמפינג יוקרתית ממוזגת בגווני כחול עמוק עם ג׳קוזי ספא ותצפית כוכבים.', features: ['לזוגות בלבד', 'בריכה פרטית מחוממת ל-28°', 'תקרת כוכבים פנורמית', 'ג׳קוזי ספא', 'מטבחון, מקרר, מנגל', 'טלוויזיה עם יס'] },
      { id: 'dome-red', propertyId: 'kipat', name: 'כיפת שמיים אדום', type: 'dome', maxOccupancy: 2, basePrice: 1200, weekendPrice: 1500, description: 'כיפת גלמפינג רומנטית ממוזגת בגווני ארגמן חמימים.', features: ['לזוגות בלבד', 'בריכה פרטית מחוממת ל-28°', 'תקרת כוכבים פנורמית', 'ג׳קוזי ספא', 'מטבחון, מקרר, מנגל', 'טלוויזיה עם יס'] },
      { id: 'dome-green', propertyId: 'kipat', name: 'כיפת שמיים ירוק', type: 'dome', maxOccupancy: 2, basePrice: 1200, weekendPrice: 1500, description: 'כיפת גלמפינג פסטורלית ממוזגת באווירה טבעית ושלווה.', features: ['לזוגות בלבד', 'בריכה פרטית מחוממת ל-28°', 'תקרת כוכבים פנורמית', 'ג׳קוזי ספא', 'מטבחון, מקרר, מנגל', 'טלוויזיה עם יס'] }
    ]
  },

  'casa-nova': {
    id: 'casa-nova',
    slug: 'casa-nova',
    name: 'קאסה נובה',
    hebrewName: 'קאסה נובה (CasaNov)',
    tagline: 'סוויטות בוטיק יוקרתיות עם בריכה פרטית במושב נוב',
    subTitle: 'סוויטות Aura ו-Bloom ברמת הגולן (יישוב שומר שבת)',
    village: 'מושב נוב',
    region: 'דרום רמת הגולן',
    whatsappNumber: '972515262612',
    phone: '051-526-2612',
    wazeUrl: 'https://waze.com/ul?q=CasaNov+Nov&navigate=yes',
    theme: {
      primary: '#242B28',
      secondary: '#4E5A54',
      accent: '#6E857B',
      background: '#F9FAF9',
      bgSoft: '#EBF0ED',
      surface: '#FFFFFF',
      surfaceSoft: '#F0F4F2',
      border: '#CFD9D4',
      borderLight: '#DFE7E3',
      dark: '#242B28',
      darkSoft: '#353F3B',
      gold: '#C5A880'
    },
    heroImage: '/resorts/casa-nova.jpg',
    amenities: [
      'בריכה פרטית לכל סוויטה (לא מחוממת ל-28°)',
      'מטבחון פרטי מאובזר לכל יחידה',
      'ג׳קוזי ספא מפנק',
      'מכונת נספרסו ומיקרוגל',
      'מקרר וכלי אוכל',
      'מנגל פרטי (למעט שבת)',
      'טלוויזיה עם יס ו-Wi-Fi',
      'מתאים לשומרי שבת ומסורת'
    ],
    units: [
      { id: 'k826', propertyId: 'casa-nova', name: 'קאסה נובה · Aura', type: 'suite', maxOccupancy: 4, basePrice: 800, weekendPrice: 1200, description: 'סוויטת בוטיק יוקרתית עם בריכה פרטית רחבה (לא מחוממת ל-28°), ג׳קוזי ומטבחון מאובזר בפרטיות מלאה.', features: ['זוג + 2', 'בריכה פרטית רחבה', 'ג׳קוזי ספא', 'מטבחון, נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'] },
      { id: 'k827', propertyId: 'casa-nova', name: 'קאסה נובה · Bloom', type: 'suite', maxOccupancy: 4, basePrice: 800, weekendPrice: 1200, description: 'סוויטת בוטיק רומנטית ומעוצבת עם בריכה פרטית וג׳קוזי.', features: ['זוג + 2', 'בריכה פרטית (לא מחוממת ל-28°)', 'ג׳קוזי ספא', 'מטבחון, נספרסו ומנגל', 'טלוויזיה עם יס ו-Wi-Fi'] }
    ]
  }
};

/**
 * Helper to get property config by slug or id
 */
export function getPropertyConfig(propertyId = 'mialees') {
  const norm = String(propertyId).toLowerCase();
  const found = PROPERTY_THEMES[norm];
  if (found && !found.isTemporarilyDisabled && found.isActive !== false) {
    return found;
  }
  return PROPERTY_THEMES.mialees;
}

/**
 * List all active Mialees properties for catalog display
 */
export function listAllProperties() {
  return Object.values(PROPERTY_THEMES).filter(
    (p) => !p.isTemporarilyDisabled && p.isActive !== false
  );
}

/**
 * Check atomic buyout availability across units
 */
export function isFullBuyoutAvailable(propertyUnits = [], blockedUnitIds = []) {
  if (!propertyUnits || !propertyUnits.length) return false;
  const singleUnits = propertyUnits.filter((u) => !u.isFullBuyout && u.booking_enabled !== false && u.usage !== 'STAFF_ACCOMMODATION');
  if (!singleUnits.length) return false;
  const blockedSet = new Set(blockedUnitIds);
  return singleUnits.every((u) => !blockedSet.has(u.id));
}

/**
 * Stay pricing calculator (weekday vs weekend rates + extra guests + extra services)
 */
export function calculateStayPricing({
  unit,
  checkIn,
  checkOut,
  adultCount = 2,
  childCount = 0,
  extraServices = []
}) {
  if (!unit || !checkIn || !checkOut) {
    return {
      nights: 0,
      weekdayNights: 0,
      weekendNights: 0,
      stayCost: 0,
      guestSurcharge: 0,
      extrasTotal: 0,
      totalPrice: 0,
      depositAmount: 0
    };
  }

  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = end.getTime() - start.getTime();
  const nights = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)));

  let weekdayNights = 0;
  let weekendNights = 0;
  let current = new Date(start);

  for (let i = 0; i < nights; i++) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 4 = Thu, 5 = Fri, 6 = Sat
    if (dayOfWeek === 4 || dayOfWeek === 5) {
      weekendNights++;
    } else {
      weekdayNights++;
    }
    current.setDate(current.getDate() + 1);
  }

  const baseWeekday = unit.basePrice || 850;
  const baseWeekend = unit.weekendPrice || Math.round(baseWeekday * 1.3);

  const stayCost = weekdayNights * baseWeekday + weekendNights * baseWeekend;

  // Extra guest surcharge (over 2 guests: +150 NIS per extra person per night for cabins, +200 for villa)
  const totalGuests = (Number(adultCount) || 2) + (Number(childCount) || 0);
  const extraGuests = Math.max(0, totalGuests - 2);
  const ratePerExtraGuest = unit.type === 'villa' ? 200 : 150;
  const guestSurcharge = extraGuests * ratePerExtraGuest * nights;

  // Extra services sum
  const extrasTotal = (extraServices || []).reduce((sum, item) => sum + (item.price || 0), 0);

  const totalPrice = stayCost + guestSurcharge + extrasTotal;
  const depositAmount = Math.round(totalPrice * 0.25); // 25% deposit

  return {
    nights,
    weekdayNights,
    weekendNights,
    stayCost,
    guestSurcharge,
    extrasTotal,
    totalPrice,
    depositAmount
  };
}

/**
 * Build WhatsApp booking link with full URI encoding
 */
export function buildWhatsAppReservationUrl({
  property,
  unit,
  checkIn,
  checkOut,
  nights,
  guests,
  totalPrice,
  customNotes = ''
}) {
  const number = property?.whatsappNumber || '972515262612';
  const propName = property?.name || 'MIALEES RESORT';
  const unitName = unit?.name || 'יחידת אירוח';

  const lines = [
    `שלום ${propName},`,
    `ברצוני לבצע הזמנה עבור:`,
    `🏡 מתחם: ${propName} (${property?.village || 'רמת הגולן'})`,
    `🚪 יחידה: ${unitName}`,
    `📅 תאריכים: ${checkIn} עד ${checkOut} (${nights} לילות)`,
    `👥 הרכב אורחים: ${guests} אורחים`,
    `💰 סה״כ לתשלום: ₪${(totalPrice || 0).toLocaleString()}`
  ];

  if (customNotes) {
    lines.push(`📝 בקשות: ${customNotes}`);
  }

  lines.push('', 'אשמח לאישור סופי ולפרטי מקדמה. תודה!');

  const text = lines.join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
