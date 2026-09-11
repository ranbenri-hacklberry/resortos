/**
 * scripts/seed_cabinos.ts
 * Production Seeding Script for CabinOS:
 * - 12 Canonical Golan & Galilee Luxury Resorts (Unclaimed Seeded)
 * - Units with Pricing in Agorot, Features & iCal Tokens
 * - 4 Verified Commercial Suppliers & Exclusive B2B Deals
 * - 2 Pre-baked Comic Guide Templates (Ran & Kosta Personas)
 *
 * Execution:
 * node --experimental-strip-types scripts/seed_cabinos.ts
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface PropertySeed {
  slug: string;
  name: string;
  hebrew_name: string;
  tagline: string;
  description: string;
  region: string;
  village: string;
  address: string;
  geo_lat: number;
  geo_lng: number;
  whatsapp_number: string;
  phone: string;
  email: string;
  hero_image: string;
  amenities: string[];
  units: Array<{
    id: string;
    name: string;
    type: string;
    bedrooms: number;
    bathrooms: number;
    max_occupancy: number;
    base_price_cents: number;
    weekend_price_cents: number;
    size_m2: number;
    features: string[];
  }>;
}

const CANONICAL_PROPERTIES: PropertySeed[] = [
  {
    slug: 'mialees',
    name: 'MIALEES RESORT',
    hebrew_name: 'מיאליס ריזורט',
    tagline: 'חוויית אירוח יוקרתית מול נוף הכנרת בנאות גולן',
    description: 'וילת יוקרה וסוויטות בוטיק פרטיות בדרום רמת הגולן מול נוף פנורמי עוצר נשימה לכנרת. בריכות פרטיות מחוממות וג׳קוזי ספא בכל יחידה.',
    region: 'golan_heights',
    village: 'נאות גולן',
    address: 'מושב נאות גולן, דרום רמת הגולן',
    geo_lat: 32.7844,
    geo_lng: 35.6983,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'info@mialees.co.il',
    hero_image: '/resorts/mialees.jpg',
    amenities: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא חיצוני', 'מכונת נספרסו', 'מנגל גז מקצועי', 'נוף ישיר לכנרת', 'Wi-Fi מהיר'],
    units: [
      {
        id: 'mialis-villa',
        name: 'וילה מיאליס ריזורט',
        type: 'villa',
        bedrooms: 4,
        bathrooms: 3,
        max_occupancy: 12,
        base_price_cents: 250000,
        weekend_price_cents: 320000,
        size_m2: 220,
        features: ['4 חדרי שינה קינג סייז', 'מטבח שף מאובזר', 'חצר פנורמית מול הכנרת', 'גריל גז מקצועי']
      },
      {
        id: 'suite-1',
        name: 'סוויטה 1 (הירוקה)',
        type: 'suite',
        bedrooms: 1,
        bathrooms: 1,
        max_occupancy: 5,
        base_price_cents: 130000,
        weekend_price_cents: 165000,
        size_m2: 55,
        features: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא זרמים', 'פרטיות מוחלטת', 'מטבחון מאובזר']
      },
      {
        id: 'suite-2',
        name: 'סוויטה 2 (הורודה)',
        type: 'suite',
        bedrooms: 1,
        bathrooms: 1,
        max_occupancy: 5,
        base_price_cents: 130000,
        weekend_price_cents: 165000,
        size_m2: 55,
        features: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא זרמים', 'חצר אינטימית', 'מכונת נספרסו']
      }
    ]
  },
  {
    slug: 'toscana',
    name: 'Toscana Ramot',
    hebrew_name: 'טוסקנה ברמות',
    tagline: 'חוויה טוסקנית רומנטית מול הכנרת במושב רמות',
    description: 'בקתות עץ אלגנטיות בסגנון כפרי-איטלקי מוקפות עצי זית ומדשאות ירוקות עם נוף ישיר לשקיעות הכנרת.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.8625,
    geo_lng: 35.6667,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'info@toscana-ramot.co.il',
    hero_image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1200&q=80',
    amenities: ['ג׳קוזי ספא ענק', 'נוף פנורמי לכנרת', 'מכונת קפה', 'מטבחון מאובזר', 'מנגל פרטי'],
    units: [
      { id: 'k687', name: 'טוסקנה · פירנצה 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 45, features: ['ג׳קוזי מול הנוף', 'מרפסת דק פרטית'] },
      { id: 'k688', name: 'טוסקנה · פירנצה 2', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 45, features: ['ג׳קוזי מול הנוף', 'מרפסת דק פרטית'] },
      { id: 'k689', name: 'טוסקנה · שאטו', type: 'cabin', bedrooms: 2, bathrooms: 1, max_occupancy: 6, base_price_cents: 120000, weekend_price_cents: 150000, size_m2: 65, features: ['בקתת עץ דו-קומתית', 'סלון מרווח', 'ג׳קוזי ספא'] }
    ]
  },
  {
    slug: 'nurit',
    name: 'Batei Nurit',
    hebrew_name: 'בתי נורית',
    tagline: '8 בקתות עץ שווייצריות כפריות עם מדשאות ענק ברמות',
    description: 'מתחם נופש כפרי ומטופח במושב רמות. 8 בקתות עץ מרווחות למשפחות ולזוגות עם בריכה מרכזית גדולה.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.8631,
    geo_lng: 35.6672,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'nurit@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכת שחייה גדולה', 'ג׳קוזי פנימי בכל בקתה', 'מדשאות ירוקות', 'מנגלים בנויים', 'מתקני משחקים'],
    units: [
      { id: 'k671', name: 'בתי נורית 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 5, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 42, features: ['ג׳קוזי זוגי', 'מרפסת דק מוצלת'] },
      { id: 'k673', name: 'בתי נורית 2', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 7, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 48, features: ['קומת גלריה לילדים', 'ג׳קוזי'] },
      { id: 'k674', name: 'בתי נורית 3', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 7, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 48, features: ['קומת גלריה לילדים', 'ג׳קוזי'] }
    ]
  },
  {
    slug: 'taj',
    name: 'Taj Mahal Cabins',
    hebrew_name: 'טאג׳ מאהל',
    tagline: 'בקתות עץ אוריינטליות מול נוף הכנרת במושב רמות',
    description: 'מתחם 4 בקתות עץ בעיצוב אוריינטלי יוקרתי עם בריכת שחייה מחוממת ונוף ישיר לקו המים של הכנרת.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'רחוב הברוש, מושב רמות',
    geo_lat: 32.864,
    geo_lng: 35.668,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'taj@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכה מחוממת ומקורה בחורף', 'ג׳קוזי ספא', 'עמדת גריל גז', 'נוף מלא לכנרת'],
    units: [
      { id: 'k808', name: 'טאג׳ מאהל 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 2, base_price_cents: 90000, weekend_price_cents: 115000, size_m2: 45, features: ['ג׳קוזי זוגי מפואר', 'מרפסת שקיעה'] },
      { id: 'k809', name: 'טאג׳ מאהל 2', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 90000, weekend_price_cents: 115000, size_m2: 48, features: ['ספה נפתחת לילדים', 'ג׳קוזי ספא'] }
    ]
  },
  {
    slug: 'mool',
    name: 'Mool Hanof',
    hebrew_name: 'מול הנוף',
    tagline: '5 בקתות עץ יוקרתיות על מצוק הנוף של רמות',
    description: 'מתחם מול הנוף ממוקם בנקודה הגבוהה ברמות, ומציע נוף ישיר לכנרת, צמחייה עשירה ובריכת שחייה ענקית.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'דרך הנוף, מושב רמות',
    geo_lat: 32.8615,
    geo_lng: 35.6655,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'mool@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכת שחייה מול המצוק', 'ג׳קוזי פנורמי', 'נוף עוצר נשימה', 'מטבחון שף'],
    units: [
      { id: 'k680', name: 'מול הנוף 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 5, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 46, features: ['נוף מצוק לכנרת', 'ג׳קוזי ספא'] }
    ]
  },
  {
    slug: 'nofim',
    name: 'Nofim BeLavan',
    hebrew_name: 'נופים בלבן',
    tagline: 'סוויטות יוקרה בלבן עם בריכות פרטיות מול הכנרת',
    description: 'מתחם סוויטות פרימיום מעוצבות בקווים מודרניים נקיים בצבע לבן. בריכה פרטית מחוממת לכל סוויטה.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.862,
    geo_lng: 35.666,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'nofim@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכה פרטית לכל סוויטה', 'ג׳קוזי ספא זרמים', 'עיצוב אדריכלי לבן', 'מכונת נספרסו'],
    units: [
      { id: 'k685', name: 'נופים בלבן 1', type: 'suite', bedrooms: 1, bathrooms: 1, max_occupancy: 7, base_price_cents: 130000, weekend_price_cents: 165000, size_m2: 60, features: ['בריכה פרטית מחוממת', 'נוף פנורמי לכנרת'] }
    ]
  },
  {
    slug: 'musical',
    name: 'Hatzer Musikalit',
    hebrew_name: 'חצר מוסיקלית',
    tagline: 'מתחם בקתות שלווה כפרי עם נשמה ומוזיקה',
    description: 'שלוש בקתות עץ אינטימיות ונעימות במושב רמות, הקרויות על שם כלי נגינה – חליל, מיתר ופעמון.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.8645,
    geo_lng: 35.6678,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'music@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1200&q=80',
    amenities: ['ג׳קוזי זוגי', 'מערכת שמע איכותית', 'חצר פסטורלית', 'מנגל פרטי'],
    units: [
      { id: 'k690', name: 'חצר מוסיקלית · חליל', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 80000, weekend_price_cents: 105000, size_m2: 40, features: ['ג׳קוזי זוגי', 'מרפסת עץ אינטימית'] }
    ]
  },
  {
    slug: 'maya',
    name: 'Biktot Maya',
    hebrew_name: 'בקתות מאיה',
    tagline: 'בקתות עץ מפנקות עם שתי בריכות שחייה נפרדות',
    description: 'מתחם 3 בקתות עץ יפהפיות ברמות, המציע 2 בריכות שחייה נפרדות לחופשה משפחתית מושלמת.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.8638,
    geo_lng: 35.6685,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'maya@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
    amenities: ['שתי בריכות שחייה', 'ג׳קוזי בכל בקתה', 'מדשאה גדולה', 'מתקני ברביקיו'],
    units: [
      { id: 'k693', name: 'בקתות מאיה 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 5, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 44, features: ['צמוד לבריכה 1', 'ג׳קוזי פנימי'] }
    ]
  },
  {
    slug: 'siesta',
    name: 'Siesta Cabins',
    hebrew_name: 'סייסטה',
    tagline: '6 בקתות עץ כפריות וסוויטות בת הים מול הכנרת',
    description: 'מתחם נופש ותיק ואהוב במושב רמות עם בריכה גדולה, בקתות משפחתיות מרווחות ובקתות בת הים הרומנטיות.',
    region: 'golan_heights',
    village: 'רמות',
    address: 'מושב רמות, רמת הגולן',
    geo_lat: 32.8628,
    geo_lng: 35.6662,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'siesta@ramot-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכת שחייה גדולה', 'ג׳קוזי ספא', 'מתחם ברביקיו מרכזי', 'חניה צמודה'],
    units: [
      { id: 'k618', name: 'סייסטה משפחתית 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 7, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 50, features: ['גלריה לילדים', 'ג׳קוזי ספא'] }
    ]
  },
  {
    slug: 'hill',
    name: 'Zimmer BaGiva',
    hebrew_name: 'צימר בגבעה',
    tagline: '4 בקתות עץ שלווה מול נוף מצוקי גבעת יואב',
    description: 'מתחם אירוח כפרי שקט במושב גבעת יואב, 5 דקות מנאות גולן והכנרת. בריכה מחוממת, ג׳קוזי ונוף ירוק פתוח.',
    region: 'golan_heights',
    village: 'גבעת יואב',
    address: 'מושב גבעת יואב, דרום רמת הגולן',
    geo_lat: 32.8025,
    geo_lng: 35.6942,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'hill@golan-resorts.co.il',
    hero_image: 'https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכה מחוממת', 'ג׳קוזי ספא ענק', 'נוף פתוח לגולן', 'מדשאות ופינות ישיבה'],
    units: [
      { id: 'hill-1', name: 'צימר בגבעה 1', type: 'cabin', bedrooms: 1, bathrooms: 1, max_occupancy: 7, base_price_cents: 85000, weekend_price_cents: 110000, size_m2: 45, features: ['ג׳קוזי ספא', 'מרפסת נוף'] }
    ]
  },
  {
    slug: 'kipat',
    name: 'Kipat Shamayim',
    hebrew_name: 'כיפת שמיים',
    tagline: '3 כיפות גאודזיות יוקרתיות לצפייה בכוכבי רמת הגולן בנוב',
    description: 'חוויית גלמפינג יוקרתית במושב נוב. כיפות גאודזיות ממוזגות ומאובזרות לחלוטין עם חלון תקרה שקוף לצפייה בשמי הלילה.',
    region: 'golan_heights',
    village: 'נוב',
    address: 'מושב נוב, דרום רמת הגולן',
    geo_lat: 32.8122,
    geo_lng: 35.7953,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'kipat@golan-glamping.co.il',
    hero_image: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1200&q=80',
    amenities: ['כיפה גאודזית ממוזגת', 'חלון תקרה פנורמי לכוכבים', 'ג׳קוזי פרטי תחת כיפת השמיים', 'מכונת אספרסו'],
    units: [
      { id: 'dome-blue', name: 'כיפת שמיים כחול', type: 'dome', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 95000, weekend_price_cents: 125000, size_m2: 40, features: ['חלון תקרה לכוכבים', 'ג׳קוזי פרטי'] }
    ]
  },
  {
    slug: 'casa-nova',
    name: 'Casa Nova Chad Nes',
    hebrew_name: 'קאסה נובה',
    tagline: 'סוויטות בוטיק אדריכליות בחד נס',
    description: 'מתחם יוקרתי ומעוצב במושב חד נס, צפונית לכנרת. סוויטות אורה ובלום עם בריכות שחייה פרטיות ופרטיות מושלמת.',
    region: 'galilee',
    village: 'חד נס',
    address: 'מושב חד נס, צפון מזרח הכנרת',
    geo_lat: 32.9031,
    geo_lng: 35.6481,
    whatsapp_number: '0548076123',
    phone: '054-807-6123',
    email: 'casanova@chadnes.co.il',
    hero_image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
    amenities: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא שקוע', 'מטבח שף מאובזר', 'עיצוב אדריכלי יוקרתי'],
    units: [
      { id: 'k826', name: 'קאסה נובה · Aura', type: 'suite', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 140000, weekend_price_cents: 180000, size_m2: 55, features: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא'] },
      { id: 'k827', name: 'קאסה נובה · Bloom', type: 'suite', bedrooms: 1, bathrooms: 1, max_occupancy: 4, base_price_cents: 140000, weekend_price_cents: 180000, size_m2: 55, features: ['בריכה פרטית מחוממת', 'ג׳קוזי ספא'] }
    ]
  }
];

const SUPPLIERS_AND_DEALS = [
  {
    company_name: 'גולן ספא & ג׳קוזי',
    category: 'hot_tubs_spa',
    contact_name: 'יוסי אלון',
    phone: '054-321-9876',
    whatsapp: '0543219876',
    email: 'service@golanspa.co.il',
    website_url: 'https://golanspa.co.il',
    coverage_regions: ['golan_heights', 'galilee'],
    rating_avg: 4.95,
    review_count: 42,
    badge_label: 'ספק מורשה ResortOS Spa',
    deal: {
      title: '20% הנחה על ערכות כלור וסינון + טיפול תקופתי שנתי',
      description: 'ערכת כימיקלים וסינון מלאה לשנה למערכות ספא ובריכות צימרים, כולל ביקורת טכנאי חצי-שנתית חינם.',
      discount_percentage: 20,
      coupon_code: 'GOLANSPA20',
      requires_prime: false
    }
  },
  {
    company_name: 'מכבסת הגליל והגולן',
    category: 'laundry_linen',
    contact_name: 'מיכל ברק',
    phone: '052-888-7766',
    whatsapp: '0528887766',
    email: 'orders@linen-galil.co.il',
    website_url: 'https://linen-galil.co.il',
    coverage_regions: ['golan_heights', 'galilee'],
    rating_avg: 4.88,
    review_count: 67,
    badge_label: 'ספק כביסה וטקסטיל פרימיום',
    deal: {
      title: '15% הנחת נפח על כביסת מצעים ומגבות פרימיום 500 גרם',
      description: 'שירות איסוף והחזרה יומי למתחמי אירוח ברמות, חד נס ונאות גולן. כולל גיהוץ ואריזה הרמטית.',
      discount_percentage: 15,
      coupon_code: 'LINENPRO15',
      requires_prime: true
    }
  },
  {
    company_name: 'מיזוג ומשאבות חום הצפון',
    category: 'hvac_tech',
    contact_name: 'אביב שליו',
    phone: '050-444-3322',
    whatsapp: '0504443322',
    email: 'service@hvac-north.co.il',
    website_url: 'https://hvac-north.co.il',
    coverage_regions: ['golan_heights', 'galilee'],
    rating_avg: 4.92,
    review_count: 31,
    badge_label: 'טכנאי מוסמך משאבות חום',
    deal: {
      title: '₪300 הנחה על טיפול הכנה לחורף למשאבות חום בריכה',
      description: 'בדיקת גז, ניקוי מחליף חום, כיול תרמוסטטים וביקורת חשמל מקיפה לפני עונת החורף.',
      fixed_discount_cents: 30000,
      coupon_code: 'HVACNORTH300',
      requires_prime: false
    }
  },
  {
    company_name: 'קפה בוטיק גולני',
    category: 'coffee_tea',
    contact_name: 'דן כרמל',
    phone: '053-999-1122',
    whatsapp: '0539991122',
    email: 'roastery@golani-coffee.co.il',
    website_url: 'https://golani-coffee.co.il',
    coverage_regions: ['golan_heights', 'galilee'],
    rating_avg: 5.0,
    review_count: 58,
    badge_label: 'קולה קפה מוסמך Specialty',
    deal: {
      title: '25% הנחה על קרטוני קפסולות אלומיניום תואמות נספרסו',
      description: 'תערובות אספרסו 100% ערביקה טרייה בקלייה מקומית ברמת הגולן. ממותג בסטנדרט מלונאי יוקרתי.',
      discount_percentage: 25,
      coupon_code: 'GOLANICOFFEE25',
      requires_prime: true
    }
  }
];

const COMIC_GUIDE_TEMPLATES = [
  {
    slug: 'hot-tub-operation',
    title: 'הפעלת ג׳קוזי ספא ובקרת טמפרטורה',
    category: 'hot_tubs_spa',
    summary: 'מדריך מצויר צעד-אחר-צעד לאורח להפעלה נכונה, הפעלת ג׳טים, שמירה על חום המים ומניעת תקלות.',
    default_avatar_persona: 'ran_and_kosta',
    step_metadata: [
      {
        step: 1,
        title: 'הסרת הכיסוי התרמי',
        illustrationUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
        instructions: 'שחררו את קליפסי הנעילה משני צידי הג׳קוזי וקפלו את הכיסוי התרמי לחצי לאחור בזהירות.',
        proTip: 'אל תמשכו את הכיסוי בכוח מרצועות הצד – אחיזה במרכז הכיסוי מאריכה את חיי התפרים.'
      },
      {
        step: 2,
        title: 'בדיקת טמפרטורה במסך הדיגיטלי',
        illustrationUrl: 'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=600&q=80',
        instructions: 'הטמפרטורה המומלצת מכוונת מראש ל-38°C. להעלאה או הורדה לחצו על חיצי הטמפרטורה (חכו 3 שניות לאישור).',
        proTip: 'המים שומרים על חום מושלם כל עוד הכיסוי מונח. חימום מלא של מעלה אחת לוקח כ-20 דקות.'
      },
      {
        step: 3,
        title: 'הפעלת ג׳טים וזרמי מסאז׳',
        illustrationUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
        instructions: 'לחצו פעם אחת על כפתור JETS 1 להפעלת זרם נעים, ופעם נוספת לעוצמת מסאז׳ מלאה.',
        proTip: 'המשאבה נכבית אוטומטית לאחר 20 דקות רצופות מטעמי בטיחות וחיסכון באנרגיה.'
      },
      {
        step: 4,
        title: 'יציאה והחזרת הכיסוי התרמי',
        illustrationUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
        instructions: 'בסיום הרחצה, כסו את הג׳קוזי בחזרה לחלוטין. שמירת הכיסוי מבטיחה מים רותחים וצלולים לטבילה הבאה.',
        proTip: 'כיסוי סגור מונע חדירת עלים ושומר על צלילות המים לכל אורך החופשה שלכם.'
      }
    ]
  },
  {
    slug: 'specialty-coffee-hotswap',
    title: 'תפעול מכונת נספרסו והחלפת קפסולות',
    category: 'coffee_tea',
    summary: 'מדריך מהיר להכנת אספרסו ולונגו מושלמים, מילוי מים מסוננים וריקון תא הקפסולות.',
    default_avatar_persona: 'ran_and_kosta',
    step_metadata: [
      {
        step: 1,
        title: 'עמדת קפה מוכנה ומים מסוננים',
        illustrationUrl: '/guides/nespresso_step1_water.jpg',
        instructions: 'צוות המתחם דואג למלא מראש מים מסוננים ורעננים במיכל עבורכם. המכונה מוכנה תמיד לחליטה מיידית.',
        proTip: 'מיכל המים מלא מראש. אם תרצו למלא שוב במהלך השהייה, מומלץ להשתמש במים מסוננים בלבד לשמירה על הטעם.'
      },
      {
        step: 2,
        title: 'הכנסת קפסולת הבוטיק',
        illustrationUrl: '/guides/nespresso_step2_capsule.jpg',
        instructions: 'הרימו את ידית הכרום כלפי מעלה, הניחו את קפסולת האלומיניום בתא המיועד והורידו את הידית חזרה בעדינות.',
        proTip: 'מבחר קפסולות עשיר ממתין לכם בתיבת העץ. הידית תינעל בקלות ללא הפעלת כוח.'
      },
      {
        step: 3,
        title: 'חליטת אספרסו חם עם קרמה',
        illustrationUrl: '/guides/nespresso_step3_brew.jpg',
        instructions: 'הניחו כוס תחת הפייה ולחצו על כפתור האספרסו הקצר או הארוך (לונגו). הקפה יימזג עם קרמה עשירה וניחוח משכר.',
        proTip: 'למאג או כוס גדולה, ניתן לקפל את מעמד הכוסות המתכתי כלפי מעלה בקלות.'
      },
      {
        step: 4,
        title: 'הרמת הידית ופליטת הקפסולה',
        illustrationUrl: '/guides/nespresso_step4_eject.jpg',
        instructions: 'בסיום המזיגה, הרימו את ידית הכרום פעם נוספת – הקפסולה המשומשת תיפול אוטומטית למגירת האיסוף הפנימית.',
        proTip: 'הקפידו להרים את הידית בסיום כדי שהמכונה תישאר נקייה ומוכנה תמיד לכוס הבאה.'
      }
    ]
  }
];

function runSql(sql: string) {
  const sanitized = sql.replace(/"/g, '\\"');
  return execSync(`psql -t -A postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "${sanitized}"`, {
    stdio: 'pipe',
    encoding: 'utf-8'
  }).trim();
}

export async function seedCabinOS() {
  console.log('🚀 Starting CabinOS Day 1 & Day 2 Database Seeding...\n');

  // 1. Seed Properties & Units
  console.log('📍 1. Seeding 12 Canonical Properties & Units...');
  for (const prop of CANONICAL_PROPERTIES) {
    const amenitiesJson = JSON.stringify(prop.amenities);
    const heroImage = prop.hero_image;
    
    // Upsert Property
    const propSql = `
      INSERT INTO properties (
        slug, name, hebrew_name, tagline, description,
        region, village, address, geo_lat, geo_lng,
        whatsapp_number, phone, email, hero_image, amenities,
        claimed_status, direct_booking_enabled, is_public, crm_status, source, property_public_path
      ) VALUES (
        '${prop.slug}',
        '${prop.name.replace(/'/g, "''")}',
        '${prop.hebrew_name.replace(/'/g, "''")}',
        '${prop.tagline.replace(/'/g, "''")}',
        '${prop.description.replace(/'/g, "''")}',
        '${prop.region}',
        '${prop.village}',
        '${prop.address.replace(/'/g, "''")}',
        ${prop.geo_lat},
        ${prop.geo_lng},
        '${prop.whatsapp_number}',
        '${prop.phone}',
        '${prop.email}',
        '${heroImage}',
        '${amenitiesJson}'::jsonb,
        '${prop.slug === 'mialees' ? 'claimed_verified' : 'unclaimed_seeded'}',
        true,
        true,
        '${prop.slug === 'mialees' ? 'Verified_Subscriber' : 'Portal_Free_Active'}',
        'flagship_canonical',
        '/p/${prop.slug}'
      )
      ON CONFLICT (slug) DO UPDATE SET
        hebrew_name = EXCLUDED.hebrew_name,
        tagline = EXCLUDED.tagline,
        description = EXCLUDED.description,
        geo_lat = EXCLUDED.geo_lat,
        geo_lng = EXCLUDED.geo_lng,
        amenities = EXCLUDED.amenities,
        is_public = true,
        crm_status = EXCLUDED.crm_status,
        claimed_status = EXCLUDED.claimed_status,
        updated_at = NOW()
      RETURNING id;
    `;
    
    runSql(propSql);
    const propId = runSql(`SELECT id FROM properties WHERE slug = '${prop.slug}';`).trim();

    if (!propId) {
      console.error(`Failed to get property ID for ${prop.slug}`);
      continue;
    }

    // Upsert Units
    for (const unit of prop.units) {
      const featuresJson = JSON.stringify(unit.features);
      const unitSql = `
        INSERT INTO units (
          id, property_id, name, type, bedrooms, bathrooms,
          max_occupancy, base_price_cents, weekend_price_cents,
          size_m2, features, is_active
        ) VALUES (
          '${unit.id}',
          '${propId}',
          '${unit.name.replace(/'/g, "''")}',
          '${unit.type}',
          ${unit.bedrooms},
          ${unit.bathrooms},
          ${unit.max_occupancy},
          ${unit.base_price_cents},
          ${unit.weekend_price_cents},
          ${unit.size_m2},
          '${featuresJson}'::jsonb,
          true
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          base_price_cents = EXCLUDED.base_price_cents,
          weekend_price_cents = EXCLUDED.weekend_price_cents,
          max_occupancy = EXCLUDED.max_occupancy,
          features = EXCLUDED.features,
          updated_at = NOW();
      `;
      runSql(unitSql);
    }
    console.log(`  ✓ ${prop.hebrew_name} (${prop.village}) with ${prop.units.length} units seeded.`);
  }

  // 2. Seed Suppliers & B2B Deals
  console.log('\n🤝 2. Seeding 4 Verified Suppliers & Exclusive B2B Deals...');
  for (const supp of SUPPLIERS_AND_DEALS) {
    const coverageJson = `ARRAY[${supp.coverage_regions.map((r) => `'${r}'`).join(',')}]::text[]`;
    let supplierId = runSql(`SELECT id FROM suppliers WHERE company_name = '${supp.company_name.replace(/'/g, "''")}' LIMIT 1;`).trim();
    
    if (!supplierId) {
      const suppSql = `
        INSERT INTO suppliers (
          company_name, category, contact_name, phone, whatsapp,
          email, website_url, coverage_regions, rating_avg, review_count,
          is_vetted, badge_label
        ) VALUES (
          '${supp.company_name.replace(/'/g, "''")}',
          '${supp.category}',
          '${supp.contact_name.replace(/'/g, "''")}',
          '${supp.phone}',
          '${supp.whatsapp}',
          '${supp.email}',
          '${supp.website_url}',
          ${coverageJson},
          ${supp.rating_avg},
          ${supp.review_count},
          true,
          '${supp.badge_label}'
        );
      `;
      runSql(suppSql);
      supplierId = runSql(`SELECT id FROM suppliers WHERE company_name = '${supp.company_name.replace(/'/g, "''")}' LIMIT 1;`).trim();
    }

    if (supplierId && supp.deal) {
      const deal = supp.deal;
      const discountPct = deal.discount_percentage || 'NULL';
      const fixedDiscount = deal.fixed_discount_cents || 'NULL';
      const existingDeal = runSql(`SELECT id FROM b2b_deals WHERE coupon_code = '${deal.coupon_code}' LIMIT 1;`).trim();
      
      if (!existingDeal) {
        const dealSql = `
          INSERT INTO b2b_deals (
            supplier_id, title, description, category,
            discount_percentage, fixed_discount_cents, coupon_code,
            requires_prime, is_active
          ) VALUES (
            '${supplierId}',
            '${deal.title.replace(/'/g, "''")}',
            '${deal.description.replace(/'/g, "''")}',
            '${supp.category}',
            ${discountPct},
            ${fixedDiscount},
            '${deal.coupon_code}',
            ${deal.requires_prime},
            true
          );
        `;
        runSql(dealSql);
      }
      console.log(`  ✓ ${supp.company_name} [${supp.category}] → Deal: "${deal.coupon_code}" (Prime: ${deal.requires_prime})`);
    }
  }

  // 3. Seed Comic Guide Templates
  console.log('\n🎨 3. Seeding Pre-baked Comic Guide Templates...');
  for (const guide of COMIC_GUIDE_TEMPLATES) {
    const stepsJson = JSON.stringify(guide.step_metadata);
    const guideSql = `
      INSERT INTO articles_and_guides (
        slug, title, category, summary, step_metadata,
        default_avatar_persona, is_template
      ) VALUES (
        '${guide.slug}',
        '${guide.title.replace(/'/g, "''")}',
        '${guide.category}',
        '${guide.summary.replace(/'/g, "''")}',
        '${stepsJson}'::jsonb,
        '${guide.default_avatar_persona}',
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        step_metadata = EXCLUDED.step_metadata;
    `;
    runSql(guideSql);
    console.log(`  ✓ Guide Template: "${guide.title}" (${guide.step_metadata.length} comic frames)`);
  }

  // 4. Seed Real Scraped Weekend Leads if available (693 leads)
  const weekendJsonPath = path.join(__dirname, '../data/resortos-seed-weekend.json');
  if (fs.existsSync(weekendJsonPath)) {
    try {
      const rawWeekendLeads = JSON.parse(fs.readFileSync(weekendJsonPath, 'utf-8'));
      const mapped = rawWeekendLeads.map((r: any) => ({
        slug: r.slug,
        name: r.slug ? r.slug.replace(/-/g, ' ').toUpperCase() : 'Resort',
        hebrew_name: r.hebrew_name,
        village: r.village,
        region: r.region,
        whatsapp_number: r.whatsapp_number || r.phone || '',
        phone: r.phone || '',
        reference_image_urls: r.reference_image_urls || [],
        source_url: r._source_url || r.source_url || ''
      }));
      await seedScrapedLeads(mapped);
    } catch (e) {
      console.warn('Could not seed real Weekend leads:', e);
    }
  }

  console.log('\n✨ ResortOS Flagship Seed Complete! All 12 properties, verified suppliers, and comic guides are live.\n');
}

/**
 * 4. Batch Seed Scraped Leads (Weekend Scrape ~600)
 * Strict Copyright & Visibility Rules:
 * - is_public = false (NEVER visible on public marketplace before host verification)
 * - hero_image = NULL (No unlicensed images)
 * - reference_image_urls = [...] (Internal reference strictly)
 * - Minimum 1 unit inserted per property
 */
export async function seedScrapedLeads(leads: Array<{
  slug: string;
  name: string;
  hebrew_name: string;
  village: string;
  region: string;
  whatsapp_number: string;
  phone?: string;
  reference_image_urls?: string[];
  source_url?: string;
}>) {
  console.log(`\n📥 Seeding ${leads.length} Scraped Leads (Default Hidden, Zero Public Images)...`);
  let inserted = 0;

  for (const lead of leads) {
    const cleanPhone = (lead.whatsapp_number || '').replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('972') ? cleanPhone : '972' + cleanPhone.replace(/^0/, '');
    const refImages = lead.reference_image_urls && lead.reference_image_urls.length > 0
      ? `ARRAY[${lead.reference_image_urls.map((u) => `'${u.replace(/'/g, "''")}'`).join(',')}]::text[]`
      : `'{}'::text[]`;

    const propSql = `
      INSERT INTO properties (
        slug, name, hebrew_name, region, village,
        whatsapp_number, phone, hero_image,
        claimed_status, is_public, crm_status, reference_image_urls,
        source, source_url, property_public_path
      ) VALUES (
        '${lead.slug}',
        '${lead.name.replace(/'/g, "''")}',
        '${lead.hebrew_name.replace(/'/g, "''")}',
        '${lead.region}',
        '${lead.village}',
        '${intlPhone}',
        '${lead.phone || ''}',
        NULL,
        'unclaimed_seeded',
        false,
        'Lead_Identified',
        ${refImages},
        'weekend_scrape',
        '${(lead.source_url || '').replace(/'/g, "''")}',
        '/p/${lead.slug}'
      )
      ON CONFLICT (slug) DO UPDATE SET
        hebrew_name = EXCLUDED.hebrew_name,
        village = EXCLUDED.village,
        whatsapp_number = EXCLUDED.whatsapp_number,
        updated_at = NOW()
      RETURNING id;
    `;

    runSql(propSql);
    const propId = runSql(`SELECT id FROM properties WHERE slug = '${lead.slug}';`).trim();
    if (propId) {
      // Ensure minimum 1 unit exists
      const unitSql = `
        INSERT INTO units (
          id, property_id, name, type, bedrooms, bathrooms,
          max_occupancy, base_price_cents, weekend_price_cents, is_active
        ) VALUES (
          'u-${lead.slug}-1',
          '${propId}',
          'יחידת אירוח ראשית',
          'cabin',
          1, 1, 4, 80000, 105000, true
        )
        ON CONFLICT (id) DO NOTHING;
      `;
      runSql(unitSql);
      inserted++;
    }
  }

  console.log(`  ✓ Successfully seeded/updated ${inserted} leads with is_public=false and zero public images.`);
}

// Auto-execute if script run directly
seedCabinOS().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
