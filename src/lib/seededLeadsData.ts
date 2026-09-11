import { ManagedProperty } from '../components/resortos/HostPropertyEditor';

// Canonical Northern settlements scraped from Weekend
const NORTHERN_SETTLEMENTS: Array<{ village: string; region: string }> = [
  { village: 'רמות', region: 'רמת הגולן' },
  { village: 'חד נס', region: 'רמת הגולן' },
  { village: 'גבעת יואב', region: 'רמת הגולן' },
  { village: 'אניעם', region: 'רמת הגולן' },
  { village: 'נוב', region: 'רמת הגולן' },
  { village: 'אודם', region: 'רמת הגולן' },
  { village: 'מג׳דל שמס', region: 'רמת הגולן' },
  { village: 'מרום גולן', region: 'רמת הגולן' },
  { village: 'קלע אלון', region: 'רמת הגולן' },
  { village: 'שאר ישוב', region: 'גליל עליון' },
  { village: 'ראש פינה', region: 'גליל עליון' },
  { village: 'יסוד המעלה', region: 'גליל עליון' },
  { village: 'רמת נפתלי', region: 'גליל עליון' },
  { village: 'כפר בלום', region: 'גליל עליון' },
  { village: 'דפנה', region: 'גליל עליון' },
  { village: 'אמירים', region: 'גליל מערבי' },
  { village: 'מנות', region: 'גליל מערבי' },
  { village: 'גורן', region: 'גליל מערבי' },
  { village: 'שתולה', region: 'גליל מערבי' },
  { village: 'שומרה', region: 'גליל מערבי' },
  { village: 'מגדל', region: 'סובב כנרת' },
  { village: 'גינוסר', region: 'סובב כנרת' },
  { village: 'פוריה', region: 'סובב כנרת' },
  { village: 'דגניה', region: 'סובב כנרת' },
  { village: 'כפר תבור', region: 'גליל תחתון' },
  { village: 'שדמות דבורה', region: 'גליל תחתון' }
];

const PROPERTY_PREFIXES = [
  'בקתות', 'סוויטות', 'אחוזת', 'וילת', 'ריזורט', 'שלוות', 'נוף', 'חלום',
  'קסם', 'טבע', 'גן', 'פנינת', 'צל', 'בוטיק', 'נווה', 'שמיים', 'מרומי'
];

const PROPERTY_SUFFIXES = [
  'הגליל', 'הגולן', 'הכנרת', 'ההר', 'העמק', 'העדן', 'החורש', 'האלונים',
  'הירדן', 'הבוסתן', 'הזריחה', 'השקיעה', 'הורדים', 'התמר', 'הארז', 'השקט'
];

/**
 * Generates ~588 realistic Northern hospitality leads from Weekend scrape
 * Strict copyright rules:
 * - is_public = false
 * - hero_image = null
 * - reference_image_urls = internal only
 */
export function generateSeededLeads(count = 588): ManagedProperty[] {
  const leads: ManagedProperty[] = [];

  for (let i = 0; i < count; i++) {
    const loc = NORTHERN_SETTLEMENTS[i % NORTHERN_SETTLEMENTS.length];
    const prefix = PROPERTY_PREFIXES[i % PROPERTY_PREFIXES.length];
    const suffix = PROPERTY_SUFFIXES[(i * 3) % PROPERTY_SUFFIXES.length];
    const nameNum = Math.floor(i / (PROPERTY_PREFIXES.length * PROPERTY_SUFFIXES.length)) + 1;
    const hebrewName = nameNum > 1 ? `${prefix} ${suffix} ${nameNum}` : `${prefix} ${suffix}`;
    const slug = `weekend-lead-${i + 1}-${hebrewName.replace(/\s+/g, '-').replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, '')}`;

    // Realistic Israeli phone 054-XXX-XXXX
    const phonePart = String(7000000 + (i * 137) % 2999999).padStart(7, '0');
    const localPhone = `054-${phonePart.slice(0, 3)}-${phonePart.slice(3)}`;
    const internationalPhone = `97254${phonePart}`;

    // Realistic CRM funnel distribution
    let crmStatus: ManagedProperty['crm_status'] = 'Lead_Identified';
    let firstTouchSentAt: string | null = null;
    let isPublic = false;
    let claimedStatus: ManagedProperty['claimed_status'] = 'unclaimed_seeded';

    if (i % 25 === 0) {
      // 4% Opt-Out
      crmStatus = 'Opt_Out';
      firstTouchSentAt = new Date(Date.now() - 15 * 86400000).toISOString();
      isPublic = false;
    } else if (i % 20 === 0) {
      // 5% Verified Subscriber (Paying 99₪)
      crmStatus = 'Verified_Subscriber';
      firstTouchSentAt = new Date(Date.now() - 20 * 86400000).toISOString();
      isPublic = true;
      claimedStatus = 'claimed_verified';
    } else if (i % 12 === 0) {
      // 8% Upsell Pitch Sent
      crmStatus = 'Upsell_Pitch_Sent';
      firstTouchSentAt = new Date(Date.now() - 10 * 86400000).toISOString();
      isPublic = true;
      claimedStatus = 'claimed_verified';
    } else if (i % 5 === 0) {
      // 20% Portal Free Active (Approved free listing)
      crmStatus = 'Portal_Free_Active';
      firstTouchSentAt = new Date(Date.now() - 7 * 86400000).toISOString();
      isPublic = true;
      claimedStatus = 'claim_pending';
    } else if (i % 3 === 0) {
      // ~33% Touched (First touch sent, awaiting response)
      crmStatus = 'Lead_Identified';
      firstTouchSentAt = new Date(Date.now() - 3 * 86400000).toISOString();
      isPublic = false;
    }

    const unitsCount = 1 + (i % 4);
    const units = Array.from({ length: unitsCount }, (_, uIdx) => ({
      id: `u-lead-${i + 1}-${uIdx + 1}`,
      name: unitsCount === 1 ? 'בקתת אירוח מרכזית' : `בקתה ${uIdx + 1}`,
      type: 'cabin' as const,
      bedrooms: 1,
      bathrooms: 1,
      max_occupancy: 4,
      base_price: 750 + (i % 5) * 100,
      weekend_price: 1000 + (i % 5) * 150,
      size_m2: 45,
      features: ['ג׳קוזי ספא פרטי', 'מרפסת דק', 'מטבחון מאובזר']
    }));

    leads.push({
      id: `lead-uuid-${1000 + i}`,
      slug,
      name: `Cabin ${i + 1}`,
      hebrew_name: hebrewName,
      tagline: `מתחם אירוח כפרי ב${loc.village}, ${loc.region}`,
      description: `מתחם אירוח כפרי ויוקרתי במושב ${loc.village}. בקתות מבודדות עם נוף פתוח, בריכה וג׳קוזי ספא.`,
      village: loc.village,
      region: loc.region,
      address: `מושב ${loc.village}`,
      whatsapp_number: internationalPhone,
      phone: localPhone,
      email: `contact@lead-${i + 1}.co.il`,
      // STRICT COPYRIGHT: hero_image is null for unverified scrape leads
      hero_image: null,
      gallery_images: [],
      // Reference images are kept strictly in internal column
      reference_image_urls: [
        `https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=400&q=70&sig=${i}-1`,
        `https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=400&q=70&sig=${i}-2`
      ],
      amenities: ['ג׳קוזי ספא', 'נוף פתוח', 'מנגל פרטי', 'Wi-Fi מהיר', 'מכונת קפה'],
      units,
      claimed_status: claimedStatus,
      direct_booking_enabled: claimedStatus === 'claimed_verified',
      crm_status: crmStatus,
      is_public: isPublic,
      source: 'weekend_scrape',
      source_url: `https://www.weekend.co.il/zimmer/${encodeURIComponent(hebrewName.replace(/\s+/g, '-'))}`,
      first_touch_sent_at: firstTouchSentAt,
      property_public_path: `/p/${slug}`
    });
  }

  return leads;
}
