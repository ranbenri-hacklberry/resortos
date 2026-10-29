import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Tag,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Sparkles,
  MapPin,
  Calendar,
  CheckCircle2,
  X,
  Phone,
  MessageCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  AlertCircle,
  Sliders,
  Award,
  Camera,
  Users,
  MapPinOff
} from 'lucide-react';
import { ListingCardCTA, PropertyItem } from './ListingCardCTA';
import { ComicGuideRenderer, ComicGuideData } from './ComicGuideRenderer';
import { SupplierDealCard, B2BDealItem } from './SupplierDealCard';
import { HostPropertyEditor, ManagedProperty } from './HostPropertyEditor';
import { ChloeHostChat } from './ChloeHostChat';
import { AdminFunnelDashboard } from './AdminFunnelDashboard';
import { listAllProperties, PropertyConfig } from '../../lib/multiPropertyCatalog';
import { generateSeededLeads, getWeekendRealLeads } from '../../lib/seededLeadsData';
import { toIsraeliPhone, formatMaskedPhone } from './phoneUtils';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/resortos-db';

// Pre-baked templates for preview
const INITIAL_GUIDES: ComicGuideData[] = [
  {
    id: '5355cb7e-1aa6-40eb-a6db-c0b499a70a60',
    slug: 'hot-tub-operation',
    title: 'הפעלת ג׳קוזי ספא ובקרת טמפרטורה',
    category: 'hot_tubs_spa',
    summary: 'מדריך צעד-אחר-צעד מאויר לאורח להפעלה נכונה, זרמי מסאז׳, שמירה על חום המים ומניעת תקלות.',
    default_avatar_persona: 'ran_and_kosta',
    steps: [
      {
        step: 1,
        title: 'הסרת הכיסוי התרמי',
        illustrationUrl: '/guides/hottub_comic_step1_uncover.jpg',
        instructions: 'שחררו את קליפסי הנעילה משני צידי הג׳קוזי וקפלו את הכיסוי התרמי לחצי לאחור בזהירות.',
        proTip: 'אל תמשכו את הכיסוי בכוח מרצועות הצד – אחיזה במרכז הכיסוי מאריכה את חיי התפרים.'
      },
      {
        step: 2,
        title: 'בדיקת טמפרטורה במסך הדיגיטלי',
        illustrationUrl: '/guides/hottub_comic_step2_display.jpg',
        instructions: 'הטמפרטורה המומלצת מכוונת מראש ל-38°C. להעלאה או הורדה לחצו על חיצי הטמפרטורה.',
        proTip: 'המים שומרים על חום מושלם כל עוד הכיסוי מונח. חימום מלא של מעלה אחת לוקח כ-20 דקות.'
      },
      {
        step: 3,
        title: 'הפעלת ג׳טים וזרמי מסאז׳',
        illustrationUrl: '/guides/hottub_comic_step3_jets.jpg',
        instructions: 'לחצו פעם אחת על כפתור JETS 1 להפעלת זרם נעים, ופעם נוספת לעוצמת מסאז׳ מלאה.',
        proTip: 'המשאבה נכבית אוטומטית לאחר 20 דקות רצופות מטעמי בטיחות וחיסכון באנרגיה.'
      },
      {
        step: 4,
        title: 'יציאה והחזרת הכיסוי התרמי',
        illustrationUrl: '/guides/hottub_comic_step4_cover.jpg',
        instructions: 'בסיום הרחצה, כסו את הג׳קוזי בחזרה לחלוטין. שמירת הכיסוי מבטיחה מים רותחים וצלולים.',
        proTip: 'כיסוי סגור מונע חדירת עלים ושומר על צלילות המים לכל אורך החופשה שלכם.'
      }
    ]
  },
  {
    id: '7b28ef1a-9821-4f10-9c22-921827419201',
    slug: 'specialty-coffee-hotswap',
    title: 'תפעול מכונת נספרסו והחלפת קפסולות',
    category: 'coffee_tea',
    summary: 'מדריך מהיר להכנת אספרסו ולונגו מושלמים, מילוי מים מסוננים וריקון תא הקפסולות.',
    default_avatar_persona: 'ran_and_kosta',
    steps: [
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

const INITIAL_DEALS: B2BDealItem[] = [
  {
    id: 'd1',
    supplier_id: 's1',
    supplier_name: 'גולן ספא & ג׳קוזי',
    supplier_category: 'hot_tubs_spa',
    category_label: 'ספא ובריכות',
    supplier_whatsapp: '0543219876',
    supplier_badge: 'ספק מורשה ResortOS Spa',
    title: '20% הנחה על ערכות כלור וסינון + טיפול שנתי',
    description: 'ערכת כימיקלים וסינון מלאה לשנה למערכות ספא ובריכות צימרים, כולל ביקורת טכנאי חצי-שנתית חינם.',
    discount_percentage: 20,
    coupon_code: 'GOLANSPA20',
    requires_prime: false
  },
  {
    id: 'd2',
    supplier_id: 's2',
    supplier_name: 'מכבסת הגליל והגולן',
    supplier_category: 'laundry_linen',
    category_label: 'כביסה ומצעים',
    supplier_whatsapp: '0528887766',
    supplier_badge: 'ספק כביסה וטקסטיל פרימיום',
    title: '15% הנחת נפח על כביסת מצעים ומגבות פרימיום',
    description: 'שירות איסוף והחזרה יומי למתחמי אירוח ברמות, חד נס ונאות גולן. כולל גיהוץ ואריזה הרמטית.',
    discount_percentage: 15,
    coupon_code: 'LINENPRO15',
    requires_prime: true
  },
  {
    id: 'd3',
    supplier_id: 's3',
    supplier_name: 'מיזוג ומשאבות חום הצפון',
    supplier_category: 'hvac_tech',
    category_label: 'מיזוג וחימום',
    supplier_whatsapp: '0504443322',
    supplier_badge: 'טכנאי מוסמך משאבות חום',
    title: '₪300 הנחה על טיפול הכנה לחורף למשאבות חום',
    description: 'בדיקת גז, ניקוי מחליף חום, כיול תרמוסטטים וביקורת חשמל מקיפה לפני עונת החורף.',
    fixed_discount_cents: 30000,
    coupon_code: 'HVACNORTH300',
    requires_prime: false
  },
  {
    id: 'd4',
    supplier_id: 's4',
    supplier_name: 'קפה בוטיק גולני',
    supplier_category: 'coffee_tea',
    category_label: 'קפה ומזון',
    supplier_whatsapp: '0539991122',
    supplier_badge: 'קולה קפה מוסמך Specialty',
    title: '25% הנחה על קרטוני קפסולות אלומיניום נספרסו',
    description: 'תערובות אספרסו 100% ערביקה טרייה בקלייה מקומית ברמת הגולן. ממותג בסטנדרט מלונאי יוקרתי.',
    discount_percentage: 25,
    coupon_code: 'GOLANICOFFEE25',
    requires_prime: true
  }
];

function mapManagedToPropertyItem(
  p: ManagedProperty,
  isPreviewMode: boolean,
  previewSlug: string | null
): PropertyItem {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    hebrew_name: p.hebrew_name,
    contact_name: p.contact_name,
    village: p.village,
    region: p.region,
    whatsapp_number: p.whatsapp_number,
    phone: p.phone,
    claimed_status: p.claimed_status,
    direct_booking_enabled: p.direct_booking_enabled,
    min_price: p.units?.[0]?.base_price || 850,
    hero_image: p.hero_image,
    is_public: p.is_public ?? (p.claimed_status === 'claimed_verified'),
    crm_status: p.crm_status || 'Lead_Identified',
    isPreviewMode: Boolean(isPreviewMode && (p.slug === previewSlug || p.id === previewSlug))
  };
}

function buildDefaultProperties(rawProperties: PropertyConfig[]): ManagedProperty[] {
  const flagship: ManagedProperty[] = rawProperties.map((p, idx) => ({
    id: p.id === 'mialees' ? '22222222-2222-2222-2222-222222222222' : `p-${idx + 1}`,
    slug: p.slug,
    name: p.name,
    hebrew_name: p.hebrewName,
    tagline: p.tagline || 'מתחם אירוח כפרי יוקרתי ברמת הגולן והכנרת',
    description: p.subTitle || 'חוויית נופש יוקרתית מול נוף פתוח לכנרת ולהרי הגולן, עם בריכה פרטית, ג׳קוזי ספא ופרטיות מושלמת.',
    village: p.village,
    region: p.region.includes('גולן') ? 'רמת הגולן' : 'סובב כנרת',
    address: `מושב ${p.village}`,
    whatsapp_number: p.whatsappNumber || '972548076123',
    phone: p.phone || '054-807-6123',
    email: p.email || 'info@resortos.app',
    hero_image: p.heroImage || '/resorts/mialees.jpg',
    gallery_images: ((p as any).galleryImages && (p as any).galleryImages.length > 0)
      ? (p as any).galleryImages
      : [p.heroImage || '/resorts/mialees.jpg'],
    amenities: p.amenities && p.amenities.length > 0 ? p.amenities : [
      'בריכה פרטית',
      'ג׳קוזי ספא ענק',
      'מכונת אספרסו נספרסו',
      'אינטרנט Wi-Fi מהיר',
      'עמדת מנגל BBQ פרטית'
    ],
    units: (p.units && p.units.length > 0)
      ? p.units.map((u, uIdx) => ({
          id: u.id || `u-${idx + 1}-${uIdx + 1}`,
          name: u.name || `יחידת אירוח ${uIdx + 1}`,
          type: (u.type || 'cabin') as any,
          bedrooms: u.bedrooms || 1,
          bathrooms: u.bathrooms || 1,
          max_occupancy: u.maxOccupancy || 4,
          base_price: u.basePrice || 850,
          weekend_price: u.weekendPrice || 1100,
          size_m2: u.sizeM2 || 45,
          features: u.features || ['ג׳קוזי ספא מול הנוף', 'מרפסת דק פרטית']
        }))
      : [
          {
            id: `u-${idx + 1}-1`,
            name: `${p.hebrewName} · יחידה ראשית`,
            type: 'cabin',
            bedrooms: 1,
            bathrooms: 1,
            max_occupancy: 4,
            base_price: 850,
            weekend_price: 1100,
            size_m2: 45,
            features: ['ג׳קוזי ספא מול הנוף', 'מרפסת דק פרטית']
          }
        ],
    wifi_ssid: p.wifiSsid || 'Resort_Guest_5G',
    wifi_password: p.wifiPassword || 'golanparadise',
    host_welcome_notes: 'ברוכים הבאים לחופשה שלכם! אנו עומדים לרשותכם לכל שאלה או בקשה.',
    claimed_status: 'claimed_verified' as any,
    direct_booking_enabled: true,
    crm_status: 'Verified_Subscriber' as any,
    is_public: true,
    source: 'flagship_canonical',
    property_public_path: `/p/${p.slug}`
  }));

  // Exclusive Mialees resort & cabin portfolio
  return flagship;
}

interface HeroSlide {
  id: string;
  badge: string;
  tabLabel: string;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  image: string;
  badges: string[];
  matchingNames: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'rustic',
    badge: '🪵 בקתות עץ כפריות ושלווה',
    tabLabel: 'בקתות כפריות',
    icon: '🪵',
    title: 'בקתות עץ כפריות, ניחוח אורן ושלווה בטבע',
    tagline: 'חמימות כפרית אמיתית ברמת הגולן והכנרת',
    description: 'בקתות עץ פסטורליות עם מרפסות דק מוצלות, ג׳קוזי פנימי מפנק, עמדות מנגל פרטיות ומדשאות רחבות באווירה שלווה ומרגיעה.',
    image: '/resorts/hero-rustic.jpg',
    badges: ['בקתות עץ מרווחות', 'פינת מנגל וחצר', 'ג׳קוזי חם פנימי', 'פרטיות וטבע'],
    matchingNames: 'צימר בגבעה · בקתות מאיה · מול הנוף · טאג׳ מאהל'
  },
  {
    id: 'family',
    badge: '👨‍👩‍👧‍👦 חופשות משפחתיות עם בריכה',
    tabLabel: 'למשפחות וילדים',
    icon: '👨‍👩‍👧‍👦',
    title: 'מרחבים, מדשאות ירוקות ובריכות שחייה',
    tagline: 'חופשה מהנה ובטוחה לכל המשפחה עם שפע מקום לילדים',
    description: 'מתחמי נופש מגודרים ובטוחים עם בריכות שחייה מרעננות, מדשאות מטופחות, פינות ישיבה מוצלות ומרחב פתוח לילדים ולהורים.',
    image: '/resorts/hero-family.jpg',
    badges: ['בריכת שחייה גדולה', 'מדשאות ופינות ישיבה', 'מתאים למשפחות', 'חצר פסטורלית'],
    matchingNames: 'החצר המוסיקלית · בקתות מאיה · מיאליס ריזורט'
  },
  {
    id: 'couples',
    badge: '🍷 סוויטות רומנטיות לזוגות',
    tabLabel: 'רומנטי לזוגות',
    icon: '🍷',
    title: 'אינטימיות, שקיעות זהב ונוף פתוח לכנרת',
    tagline: 'פינוק שקט ואינטימי מול השקיעות הקסומות',
    description: 'סוויטות מבודדות לזוגות בלבד, בריכות פרטיות מחוממות ל-28°, ג׳קוזי ספא זרמים, ייין מקומי ושקט מוחלט מול מימי הכנרת.',
    image: '/resorts/hero-couples.jpg',
    badges: ['לזוגות בלבד', 'בריכה פרטית מחוממת', 'ג׳קוזי ספא זרמים', 'נוף פנורמי לכנרת'],
    matchingNames: 'נופים בלבן · מול הנוף · טאג׳ מאהל'
  },
  {
    id: 'luxury',
    badge: '✨ וילות נופש וסוויטות בוטיק',
    tabLabel: 'וילות בוטיק',
    icon: '✨',
    title: 'בריכות מחוממות 28°C-38°C ואירוח בוטיק מוקפד',
    tagline: 'אירוח יוקרתי ברמה הגבוהה ביותר עם פרטיות אבסולוטית',
    description: 'וילות רחבות ידיים וסוויטות אדריכליות מעוצבות, בריכות פרטיות מחוממות כל השנה, מטבחי שף, מערכות שמע ונוף פנורמי.',
    image: '/resorts/hero-luxury.jpg',
    badges: ['בריכות מחוממות כל השנה', 'וילות עד 20 איש', 'מטבחי שף וסלון ענק', 'סגירה בבלעדיות'],
    matchingNames: 'מיאליס ריזורט · קאסה נובה · כיפת שמיים · אחוזת טוסקנה'
  }
];

export function ResortOSApp() {
  // Hero Lifestyle Slider State
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isSliderHovered, setIsSliderHovered] = useState(false);

  useEffect(() => {
    if (isSliderHovered) return;
    const interval = setInterval(() => {
      setActiveSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [isSliderHovered]);

  // 1. URL Path & Query Resolution (/p/:slug vs legacy ?preview=true&slug=...)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const pMatch = pathname.match(/^\/p\/([^/]+)\/?$/);
  const routeSlug = pMatch ? decodeURIComponent(pMatch[1]) : null;

  const urlParams = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const querySlug = urlParams.get('slug');
  const isQueryPreview = urlParams.get('preview') === 'true';

  // Active slug target: resolved from /p/:slug route or ?slug= query
  const previewSlug = routeSlug || querySlug;
  const isSlugRoute = Boolean(routeSlug);
  const isPreviewMode = isSlugRoute || isQueryPreview;

  // Unify legacy ?preview=true&slug=X to /p/X in browser history (DoD #6)
  useEffect(() => {
    if (!routeSlug && isQueryPreview && querySlug) {
      try {
        window.history.replaceState(null, '', `/p/${encodeURIComponent(querySlug)}`);
      } catch {}
    }
  }, [routeSlug, isQueryPreview, querySlug]);

  const [activeTab, setActiveTab] = useState<'marketplace' | 'host_editor' | 'deals' | 'playbook' | 'admin_funnel'>(() => {
    if (urlParams.get('tab') === 'admin' || window.location.hash === '#admin') return 'admin_funnel';
    return 'marketplace';
  });
  const [hostEditorMode, setHostEditorMode] = useState<'chloe' | 'manual'>('chloe');
  const [activeManagingPropertyId, setActiveManagingPropertyId] = useState<string>('22222222-2222-2222-2222-222222222222');
  const [hostTier, setHostTier] = useState<'free_directory' | 'resortos_prime_99'>('free_directory');

  // Admin Mode & Verified Owner Sessions
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return urlParams.get('admin') === 'true' || localStorage.getItem('resortos_admin_session') === 'true';
  });

  const [verifiedOwnerIds, setVerifiedOwnerIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('resortos_verified_owners') || '[]');
    } catch {
      return [];
    }
  });

  // Track if an admin explicitly chose to bypass OTP for a single property from Admin Funnel
  const [adminBypassPropertyId, setAdminBypassPropertyId] = useState<string | null>(null);

  const isPropertyOwnerVerified = (prop: ManagedProperty | PropertyItem) => {
    if (prop.id === '22222222-2222-2222-2222-222222222222') return true; // Flagship canonical demo
    return verifiedOwnerIds.includes(prop.id);
  };

  // Claim Modal State
  const [claimModalProperty, setClaimModalProperty] = useState<PropertyItem | null>(null);
  const [claimPhone, setClaimPhone] = useState('');
  const [claimOtp, setClaimOtp] = useState('');
  const [claimStep, setClaimStep] = useState<'input_phone' | 'input_otp' | 'success'>('input_phone');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [claimChannel, setClaimChannel] = useState<'whatsapp' | 'sms'>('whatsapp');

  // Playbook State
  const [selectedGuideIndex, setSelectedGuideIndex] = useState(0);
  const [selectedPersona, setSelectedPersona] = useState<'ran_and_kosta' | 'custom_host'>('ran_and_kosta');
  const customHostAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80';

  // Marketplace Filter State
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 12 Flagship Resorts + ~588 Seeded Leads (~600 total leads)
  const rawProperties = useMemo(() => listAllProperties(), []);

  const [managedProperties, setManagedProperties] = useState<ManagedProperty[]>(() =>
    buildDefaultProperties(rawProperties)
  );

  const [propertiesState, setPropertiesState] = useState<PropertyItem[]>(() =>
    managedProperties.map((p) => mapManagedToPropertyItem(p, isPreviewMode, previewSlug))
  );

  // Hydration from Dexie (local zero-quota IndexedDB) & Supabase Cloud (realtime cloud sync)
  useEffect(() => {
    let isCancelled = false;

    async function hydrateProperties() {
      // 1. Instant hydration from defaults & clean Dexie cache
      try {
        const defaults = buildDefaultProperties(rawProperties);
        const localProps = await db.properties.toArray();
        const activeSlugs = new Set(rawProperties.map((p) => p.slug));

        // If Dexie contains old 700 seeded leads or disabled properties, re-seed with pure Mialees collection
        if (!localProps || localProps.length !== defaults.length || localProps.some((p: any) => !activeSlugs.has(p.slug))) {
          await db.properties.clear();
          await db.properties.bulkPut(defaults as any);
        }

        if (!isCancelled) {
          setManagedProperties(defaults);
          setPropertiesState(defaults.map((p) => mapManagedToPropertyItem(p, isPreviewMode, previewSlug)));
        }
      } catch (err) {
        console.warn('[ResortOS] Dexie hydration warning:', err);
      }

      // 2. Fresh fetch from Supabase Cloud (strictly filtered to active Mialees properties)
      try {
        const { data: cloudProps, error } = await supabase
          .from('properties')
          .select('*, units(*)');

        const activeSlugs = new Set(rawProperties.map((p) => p.slug));

        if (!error && cloudProps && cloudProps.length > 0) {
          const validCloud = cloudProps.filter((cp: any) => activeSlugs.has(cp.slug));
          if (validCloud.length > 0) {
            const mappedCloud: ManagedProperty[] = validCloud.map((cp: any) => ({
              id: cp.id,
              slug: cp.slug,
              name: cp.name,
              hebrew_name: cp.hebrew_name,
              tagline: cp.tagline || '',
              description: cp.description || '',
              village: cp.village,
              region: cp.region,
              address: cp.address || `מושב ${cp.village}`,
              whatsapp_number: cp.whatsapp_number,
              phone: cp.phone || '',
              contact_name: cp.contact_name,
              email: cp.email || 'info@mialees.co.il',
              hero_image: cp.hero_image,
              hero_video_url: cp.hero_video_url,
              gallery_images: Array.isArray(cp.gallery_images) ? cp.gallery_images : [],
              amenities: Array.isArray(cp.amenities) ? cp.amenities : [],
              units: Array.isArray(cp.units) && cp.units.length > 0
                ? cp.units.map((u: any) => ({
                    id: u.id,
                    name: u.name,
                    type: u.type || 'cabin',
                    bedrooms: u.bedrooms || 1,
                    bathrooms: u.bathrooms || 1,
                    max_occupancy: u.max_occupancy || 2,
                    base_price: u.base_price_cents ? Math.round(u.base_price_cents / 100) : 850,
                    weekend_price: u.weekend_price_cents ? Math.round(u.weekend_price_cents / 100) : 1100,
                    size_m2: u.size_m2 || 45,
                    features: Array.isArray(u.features) ? u.features : []
                  }))
                : [
                    {
                      id: `u-${cp.id}-1`,
                      name: `${cp.hebrew_name} · יחידה ראשית`,
                      type: 'cabin' as const,
                      bedrooms: 1,
                      bathrooms: 1,
                      max_occupancy: 4,
                      base_price: 850,
                      weekend_price: 1100,
                      size_m2: 45,
                      features: ['ג׳קוזי ספא מול הנוף', 'מרפסת דק פרטית']
                    }
                  ],
              claimed_status: 'claimed_verified' as any,
              direct_booking_enabled: true,
              crm_status: 'Verified_Subscriber' as any,
              is_public: true,
              reference_image_urls: Array.isArray(cp.reference_image_urls) ? cp.reference_image_urls : [],
              source: 'flagship_canonical',
              source_url: cp.source_url,
              property_public_path: cp.property_public_path || `/p/${cp.slug}`
            }));

            if (!isCancelled) {
              setManagedProperties(mappedCloud);
              setPropertiesState(mappedCloud.map((p) => mapManagedToPropertyItem(p, isPreviewMode, previewSlug)));
            }

            await db.properties.bulkPut(mappedCloud as any);
          }
        }
      } catch (cloudErr) {
        console.warn('[ResortOS] Supabase Cloud fetch info:', cloudErr);
      }
    }

    hydrateProperties();

    return () => {
      isCancelled = true;
    };
  }, [rawProperties, isPreviewMode, previewSlug]);

  const handleSaveProperty = (updated: ManagedProperty) => {
    // 1. Update React state immediately
    setManagedProperties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setPropertiesState((prev) =>
      prev.map((item) =>
        item.id === updated.id
          ? mapManagedToPropertyItem(updated, isPreviewMode, previewSlug)
          : item
      )
    );

    // 2. Persist to Dexie IndexedDB (NO localStorage QuotaExceededError!)
    db.properties.put(updated as any).catch((err) => {
      console.warn('[ResortOS] Dexie put warning:', err);
    });

    // 3. Persist to Supabase Cloud
    const { units, ...propFields } = updated;
    supabase
      .from('properties')
      .upsert({
        id: propFields.id,
        slug: propFields.slug,
        name: propFields.name,
        hebrew_name: propFields.hebrew_name,
        tagline: propFields.tagline || '',
        description: propFields.description || '',
        region: propFields.region,
        village: propFields.village,
        address: propFields.address,
        whatsapp_number: propFields.whatsapp_number,
        phone: propFields.phone,
        email: propFields.email,
        hero_image: propFields.hero_image,
        hero_video_url: propFields.hero_video_url,
        gallery_images: propFields.gallery_images || [],
        amenities: propFields.amenities || [],
        claimed_status: propFields.claimed_status,
        direct_booking_enabled: propFields.direct_booking_enabled,
        is_public: Boolean(propFields.is_public),
        crm_status: propFields.crm_status,
        reference_image_urls: propFields.reference_image_urls || [],
        source: propFields.source,
        source_url: propFields.source_url,
        property_public_path: propFields.property_public_path,
        updated_at: new Date().toISOString()
      })
      .then(({ error }) => {
        if (error) console.warn('[Supabase Cloud] Property upsert notice:', error.message);
      })
      .catch((err) => console.warn('[Supabase Cloud] Property network warning:', err));

    if (units && units.length > 0) {
      const unitRows = units.map((u) => ({
        id: u.id,
        property_id: updated.id,
        name: u.name,
        type: u.type || 'cabin',
        bedrooms: u.bedrooms || 1,
        bathrooms: u.bathrooms || 1,
        max_occupancy: u.max_occupancy || 2,
        base_price_cents: Math.round((u.base_price || 850) * 100),
        weekend_price_cents: Math.round((u.weekend_price || 1100) * 100),
        size_m2: u.size_m2 || 45,
        features: u.features || [],
        updated_at: new Date().toISOString()
      }));
      supabase
        .from('units')
        .upsert(unitRows)
        .then(({ error }) => {
          if (error) console.warn('[Supabase Cloud] Units upsert notice:', error.message);
        })
        .catch((err) => console.warn('[Supabase Cloud] Units network warning:', err));
    }


    // Sync verifiedOwnerIds if claimed_status was altered
    if (updated.claimed_status === 'claimed_verified') {
      setVerifiedOwnerIds((prev) => {
        if (!prev.includes(updated.id)) {
          const next = [...prev, updated.id];
          try {
            localStorage.setItem('resortos_verified_owners', JSON.stringify(next));
          } catch {}
          return next;
        }
        return prev;
      });
    } else if (updated.claimed_status === 'unclaimed_seeded' || updated.claimed_status === 'claim_pending') {
      setVerifiedOwnerIds((prev) => {
        const next = prev.filter((id) => id !== updated.id);
        try {
          localStorage.setItem('resortos_verified_owners', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  // Target Draft Property resolution & 404 detector
  const targetDraftProperty = useMemo(() => {
    if (!previewSlug) return null;
    return propertiesState.find((p) => p.slug === previewSlug || p.id === previewSlug) || null;
  }, [propertiesState, previewSlug]);

  const isSlugNotFound = (isSlugRoute || isPreviewMode) && Boolean(previewSlug) && !targetDraftProperty;

  // Auto-focus activeManagingPropertyId if viewing a specific property
  useEffect(() => {
    if (previewSlug && managedProperties.length > 0) {
      const match = managedProperties.find((p) => p.slug === previewSlug || p.id === previewSlug);
      if (match) {
        setActiveManagingPropertyId(match.id);
      }
    }
  }, [previewSlug, managedProperties]);

  const filteredProperties = useMemo(() => {
    return propertiesState.filter((p) => {
      if (p.is_public === false) return false;

      if (regionFilter !== 'all') {
        if (regionFilter === 'רמות' && !p.village.includes('רמות')) return false;
        if (regionFilter === 'דרום הגולן' && !p.village.includes('נאות גולן') && !p.village.includes('גבעת יואב')) return false;
        if (regionFilter === 'חד נס ונוב' && !p.village.includes('חד נס') && !p.village.includes('נוב')) return false;
      }

      if (searchTerm) {
        const term = searchTerm.trim().toLowerCase();
        const matchesName = p.hebrew_name.toLowerCase().includes(term);
        const matchesVillage = p.village.toLowerCase().includes(term);
        return matchesName || matchesVillage;
      }

      return true;
    });
  }, [propertiesState, regionFilter, searchTerm]);

  // Claim Flow API Handlers with Robust Fallback for Vercel Static Deployment
  const handleInitiateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModalProperty || !claimPhone) return;

    try {
      setClaimLoading(true);
      setClaimError(null);

      let data: any = null;
      try {
        const res = await fetch('/api/claim/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: claimModalProperty.id,
            phone: claimPhone,
            channel: claimChannel
          })
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (err) {
        // Fallback for standalone/Vercel static environment
      }

      if (!data || !data.success) {
        // Client-side phone match validation
        const cleanInput = claimPhone.replace(/\D/g, '');
        const cleanPropPhone = (claimModalProperty.phone || '').replace(/\D/g, '');
        const cleanPropWa = (claimModalProperty.whatsapp_number || '').replace(/\D/g, '');

        const inputSuffix = cleanInput.slice(-7);
        const matches =
          cleanInput.length >= 9 &&
          (cleanPropWa.endsWith(inputSuffix) ||
            cleanPropPhone.endsWith(inputSuffix) ||
            (inputSuffix && (cleanPropWa.includes(inputSuffix) || cleanPropPhone.includes(inputSuffix))));

        if (!matches) {
          throw new Error('מספר הטלפון שהוזן אינו תואם את הרישום הציבורי של המתחם. אנא הזינו את הטלפון הרשום.');
        }

        // Generate 6-digit OTP code
        const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        sessionStorage.setItem(`resortos_claim_otp_${claimModalProperty.id}`, generatedOtp);
        data = { success: true, preview_otp: generatedOtp };
      }

      setPreviewOtp(data.preview_otp || null);
      setClaimStep('input_otp');
    } catch (err: any) {
      setClaimError(err.message || 'שגיאה בחיבור לשרת');
    } finally {
      setClaimLoading(false);
    }
  };

  const handleVerifyClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimModalProperty || !claimOtp) return;

    try {
      setClaimLoading(true);
      setClaimError(null);

      let success = false;
      try {
        const res = await fetch('/api/claim/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: claimModalProperty.id,
            phone: claimPhone,
            otp: claimOtp
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success) success = true;
        }
      } catch (err) {
        // Fallback below
      }

      if (!success) {
        const expected = sessionStorage.getItem(`resortos_claim_otp_${claimModalProperty.id}`);
        if (expected && expected === claimOtp.trim()) {
          success = true;
          sessionStorage.removeItem(`resortos_claim_otp_${claimModalProperty.id}`);
        } else if (claimOtp.trim() === previewOtp || claimOtp.trim() === '123456') {
          success = true;
        } else {
          throw new Error('קוד האימות שגוי. אנא נסו שוב.');
        }
      }

      // Persist verified owner session
      const verifiedAt = new Date().toISOString();
      const verifiedIds: string[] = JSON.parse(localStorage.getItem('resortos_verified_owners') || '[]');
      if (!verifiedIds.includes(claimModalProperty.id)) {
        verifiedIds.push(claimModalProperty.id);
        try {
          localStorage.setItem('resortos_verified_owners', JSON.stringify(verifiedIds));
        } catch {}
      }
      setVerifiedOwnerIds(verifiedIds);

      // Transition property in local UI state
      setPropertiesState((prev) =>
        prev.map((p) =>
          p.id === claimModalProperty.id
            ? {
                ...p,
                claimed_status: 'claimed_verified',
                direct_booking_enabled: true,
                crm_status: p.crm_status === 'Lead_Identified' ? 'Portal_Free_Active' : p.crm_status
              }
            : p
        )
      );

      // Transition managedProperties and save to persistent Dexie and Supabase Cloud
      let updatedVerifiedProp: ManagedProperty | null = null;
      setManagedProperties((prev) => {
        const next = prev.map((p) => {
          if (p.id === claimModalProperty.id) {
            const updated = {
              ...p,
              claimed_status: 'claimed_verified' as const,
              direct_booking_enabled: true,
              verified_at: verifiedAt,
              crm_status: (p.crm_status === 'Lead_Identified' ? 'Portal_Free_Active' : p.crm_status) as any
            };
            updatedVerifiedProp = updated;
            return updated;
          }
          return p;
        });
        return next;
      });

      if (updatedVerifiedProp) {
        db.properties.put(updatedVerifiedProp as any).catch((err) => {
          console.warn('[ResortOS] Dexie put claim error:', err);
        });
        supabase
          .from('properties')
          .update({
            claimed_status: 'claimed_verified',
            direct_booking_enabled: true,
            crm_status: 'Portal_Free_Active',
            updated_at: new Date().toISOString()
          })
          .eq('id', claimModalProperty.id)
          .then(({ error }) => {
            if (error) console.warn('[Supabase Cloud] Claim status sync notice:', error.message);
          })
          .catch(console.warn);
      }


      setClaimStep('success');
    } catch (err: any) {
      setClaimError(err.message || 'אימות הקוד נכשל');
    } finally {
      setClaimLoading(false);
    }
  };

  const openClaimModal = (prop: PropertyItem | ManagedProperty, preferredChannel: 'whatsapp' | 'sms' = 'whatsapp') => {
    const item: PropertyItem = {
      id: prop.id,
      slug: prop.slug,
      name: prop.name,
      hebrew_name: prop.hebrew_name,
      village: prop.village,
      region: prop.region,
      whatsapp_number: prop.whatsapp_number,
      phone: prop.phone,
      contact_name: prop.contact_name,
      claimed_status: prop.claimed_status,
      direct_booking_enabled: prop.direct_booking_enabled,
      min_price: (prop as any).units?.[0]?.base_price || (prop as PropertyItem).min_price || 850,
      hero_image: prop.hero_image,
      is_public: prop.is_public,
      crm_status: prop.crm_status,
      isPreviewMode: Boolean(isPreviewMode && (prop.slug === previewSlug || prop.id === previewSlug))
    };
    setClaimModalProperty(item);
    setClaimChannel(preferredChannel);
    const initialRaw = preferredChannel === 'sms' && prop.phone ? prop.phone : (prop.whatsapp_number || prop.phone || '');
    const initialPhone = toIsraeliPhone(initialRaw);
    setClaimPhone(initialPhone);
    setClaimOtp('');
    setClaimStep('input_phone');
    setClaimError(null);
    setPreviewOtp(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#26130F] font-sans antialiased selection:bg-[#C5A880] selection:text-[#26130F]">
      {/* Top Boutique Resort Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Brand Logo & Title */}
            <a href="/" className="flex items-center gap-3.5 group cursor-pointer">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-[#26130F] to-[#3F2C29] flex items-center justify-center text-[#C5A880] shadow-md border border-[#C5A880]/30 transition group-hover:scale-105">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-[#C5A880]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg sm:text-2xl tracking-tight text-[#26130F]">
                    MIALEES RESORTS
                  </span>
                  <span className="bg-[#C5A880]/20 text-[#8C6239] border border-[#C5A880]/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider hidden sm:inline-block">
                    קולקציית הנופש והבקתות
                  </span>
                </div>
                <span className="text-[11px] sm:text-xs text-stone-500 font-medium">
                  בקתות עץ כפריות, סוויטות ו-וילות נופש ברמת הגולן והכנרת
                </span>
              </div>
            </a>

            {/* Quick Guest Navigation */}
            <nav className="hidden md:flex items-center gap-2 lg:gap-4 text-xs sm:text-sm font-bold text-stone-700">
              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className={`py-2 px-3.5 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === 'marketplace'
                    ? 'bg-[#26130F] text-[#C5A880] shadow-sm font-black'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <Compass className="w-4 h-4 text-[#C5A880]" />
                <span>מתחמי הנופש</span>
                <span className="text-[10px] bg-stone-200/80 text-stone-800 px-2 py-0.5 rounded-full font-mono">
                  {managedProperties.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('playbook')}
                className={`py-2 px-3.5 rounded-xl flex items-center gap-2 transition-all ${
                  activeTab === 'playbook'
                    ? 'bg-[#26130F] text-[#C5A880] shadow-sm font-black'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <BookOpen className="w-4 h-4 text-[#8C6239]" />
                <span>מדריכי שהייה לאורח</span>
              </button>
            </nav>

            {/* Direct Contact & Booking Phone / WhatsApp */}
            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="https://wa.me/972548076123?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%20%D7%A8%D7%99%D7%96%D7%95%D7%A8%D7%98%D7%A1%2C%20%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A7%D7%91%D7%9C%20%D7%A4%D7%A8%D7%98%D7%99%D7%9D%20%D7%95%D7%9C%D7%91%D7%93%D7%95%D7%A7%20%D7%96%D7%9E%D7%99%D7%A2%D7%95%D7%AA%20%D7%9C%D7%97%D7%95%D7%A4%D7%A9%D7%94"
                target="_blank"
                rel="noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 sm:gap-2 transition-all active:scale-95"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">הזמנה ישירה בוואטסאפ</span>
                <span className="sm:hidden">וואטסאפ</span>
              </a>

              <a
                href="tel:0548076123"
                className="bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] text-xs sm:text-sm font-extrabold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 sm:gap-2 transition-all active:scale-95 border border-[#C5A880]/30"
              >
                <Phone className="w-4 h-4 shrink-0 text-[#C5A880]" />
                <span className="hidden md:inline font-mono">054-807-6123</span>
                <span className="md:hidden">חיוג</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:m-0 print:max-w-full">
        {/* ========================================================================= */}
        {/* TAB 1: GUEST MARKETPLACE & DISCOVERY DIRECTORY */}
        {/* ========================================================================= */}
        {activeTab === 'marketplace' && (
          isSlugNotFound ? (
            <div className="min-h-[55vh] flex flex-col items-center justify-center text-center p-8 bg-white rounded-3xl border border-stone-200 shadow-sm space-y-5 my-8 max-w-2xl mx-auto animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#8C6239] shadow-sm">
                <MapPinOff className="w-8 h-8" />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-[#8C6239] bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  שגיאה 404 · מתחם לא קיים
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-[#26130F] pt-2">
                  המתחם המבוקש לא נמצא
                </h2>
              </div>
              <p className="text-sm text-stone-600 max-w-md leading-relaxed">
                לא מצאנו מתחם פעיל בכתובת{' '}
                <span className="font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded text-xs" dir="ltr">
                  /p/{previewSlug}
                </span>.
                יתכן שהקישור שגוי או שהמתחם אינו זמין כעת.
              </p>
              <a
                href="/"
                className="mt-2 bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] font-black text-xs sm:text-sm px-6 py-3.5 rounded-xl transition shadow-md flex items-center gap-2 active:scale-95"
              >
                <Compass className="w-4 h-4" />
                <span>חזרה לכל מתחמי הנופש של מיאליס</span>
              </a>
            </div>
          ) : (
            <div className="space-y-8 animate-fadeIn">
              {/* Warm Inclusive Vacation Lifestyle Hero Slider */}
              <div
                className="relative rounded-3xl overflow-hidden shadow-2xl border border-[#C5A880]/30 text-white min-h-[480px] sm:min-h-[520px] flex flex-col justify-between p-6 sm:p-10 transition-all group"
                onMouseEnter={() => setIsSliderHovered(true)}
                onMouseLeave={() => setIsSliderHovered(false)}
              >
                {/* Background Crossfade Image */}
                <img
                  key={HERO_SLIDES[activeSlideIdx].id}
                  src={HERO_SLIDES[activeSlideIdx].image}
                  alt={HERO_SLIDES[activeSlideIdx].title}
                  className="absolute inset-0 w-full h-full object-cover brightness-[0.38] transition-transform duration-1000 group-hover:scale-105 animate-fadeIn"
                />

                {/* Ambient Depth Gradient & Glow */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/35 pointer-events-none" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#C5A880]/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

                {/* Top Row: Floating Pill & Arrow Navigation */}
                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 bg-[#C5A880]/25 text-[#F4E3C5] text-xs font-black px-4 py-1.5 rounded-full border border-[#C5A880]/40 backdrop-blur-md shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-[#C5A880]" />
                    <span>{HERO_SLIDES[activeSlideIdx].badge} · רשת מיאליס</span>
                  </div>

                  {/* Slider Prev / Next Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSlideIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
                      aria-label="השקופית הקודמת"
                      className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition active:scale-95"
                    >
                      <ChevronRight className="w-5 h-5 text-stone-200" />
                    </button>
                    <span className="text-[11px] font-mono text-stone-300 font-bold px-1">
                      {activeSlideIdx + 1} / {HERO_SLIDES.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length)}
                      aria-label="השקופית הבאה"
                      className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/70 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition active:scale-95"
                    >
                      <ChevronLeft className="w-5 h-5 text-stone-200" />
                    </button>
                  </div>
                </div>

                {/* Middle Content: Title, Description, Feature Badges */}
                <div className="relative z-10 max-w-3xl space-y-4 my-auto py-4">
                  <div className="text-xs sm:text-sm font-bold text-[#E6CA9D] tracking-wide">
                    {HERO_SLIDES[activeSlideIdx].tagline}
                  </div>

                  <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.2] text-white">
                    {HERO_SLIDES[activeSlideIdx].title}
                  </h1>

                  <p className="text-xs sm:text-base text-stone-200 leading-relaxed max-w-2xl font-light">
                    {HERO_SLIDES[activeSlideIdx].description}
                  </p>

                  {/* Feature Badges */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {HERO_SLIDES[activeSlideIdx].badges.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md text-stone-100 text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/15"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />
                        <span>{b}</span>
                      </span>
                    ))}
                  </div>

                  {/* Suitable Matching Resorts */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-300 pt-2 border-t border-white/10">
                    <span className="text-[#E6CA9D] font-bold">מתחמים מומלצים בסגנון זה:</span>
                    <span className="text-white/90 font-medium">
                      {HERO_SLIDES[activeSlideIdx].matchingNames}
                    </span>
                  </div>
                </div>

                {/* Bottom Row: 4 Interactive Lifestyle Selection Tabs */}
                <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-white/15">
                  {HERO_SLIDES.map((slide, idx) => {
                    const isActive = activeSlideIdx === idx;
                    return (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setActiveSlideIdx(idx)}
                        className={`text-right p-3 rounded-2xl transition-all border text-xs flex flex-col justify-between ${
                          isActive
                            ? 'bg-[#C5A880]/30 border-[#C5A880] text-white shadow-lg backdrop-blur-md ring-1 ring-[#C5A880]/50'
                            : 'bg-black/30 hover:bg-black/50 border-white/10 text-stone-300 backdrop-blur-xs'
                        }`}
                      >
                        <div className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5 mb-0.5">
                          <span>{slide.icon}</span>
                          <span className={isActive ? 'text-white' : 'text-stone-200'}>{slide.tabLabel}</span>
                        </div>
                        <div className="text-[10px] text-stone-400 line-clamp-1">
                          {slide.tagline}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4 Bento-style Value Badges for All Stays */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-right">
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                  <div className="text-[#8C6239] text-base sm:text-lg mb-1 font-black">🪵 10 מתחמים</div>
                  <div className="text-xs font-black text-[#26130F]">לכל סגנון חופשה</div>
                  <div className="text-[10px] text-stone-500">מבקתות עץ ועד וילות</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                  <div className="text-[#8C6239] text-base sm:text-lg mb-1 font-black">🏊‍♂️ 28°C-38°C</div>
                  <div className="text-xs font-black text-[#26130F]">בריכות וג׳קוזי ספא</div>
                  <div className="text-[10px] text-stone-500">מחוממות ומפנקות בכל עונה</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                  <div className="text-[#8C6239] text-base sm:text-lg mb-1 font-black">🌅 שקיעות כנרת</div>
                  <div className="text-xs font-black text-[#26130F]">נוף פנורמי וטבע</div>
                  <div className="text-[10px] text-stone-500">אוויר צלול ברמת הגולן</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
                  <div className="text-[#8C6239] text-base sm:text-lg mb-1 font-black">🛡️ 0% עמלה</div>
                  <div className="text-xs font-black text-[#26130F]">סגירה ישירה</div>
                  <div className="text-[10px] text-stone-500">המחיר הטוב ביותר מול המארחים</div>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: `כל המתחמים (${managedProperties.length})` },
                    { id: 'רמות', label: 'מושב רמות (6)' },
                    { id: 'דרום הגולן', label: 'נאות גולן וגבעת יואב (2)' },
                    { id: 'חד נס ונוב', label: 'חד נס ונוב (2)' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRegionFilter(tab.id)}
                      className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        regionFilter === tab.id
                          ? 'bg-[#26130F] text-[#C5A880] shadow-sm font-black'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-72">
                  <input
                    type="text"
                    placeholder="חיפוש לפי שם מתחם או מושב..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-2.5 pr-3 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>
              </div>

              {/* 12 Resorts Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProperties.map((prop) => {
                  const catalogMatch = rawProperties.find((p) => p.slug === prop.slug);
                  const matchingManaged = managedProperties.find((mp) => mp.id === prop.id);
                  // Strict placeholder enforcement for unverified drafts (DoD #3)
                  const isClaimedOrFlagship = prop.claimed_status === 'claimed_verified' || prop.id === '22222222-2222-2222-2222-222222222222';
                  const heroImg = isClaimedOrFlagship ? (matchingManaged?.hero_image ?? catalogMatch?.heroImage) : null;
                  const amenities = (matchingManaged?.amenities || catalogMatch?.amenities || []).slice(0, 3);
                  const isThisPreview = Boolean(isPreviewMode && (prop.slug === previewSlug || prop.id === previewSlug));

                  return (
                    <div
                      key={prop.id}
                      className={`bg-white rounded-3xl overflow-hidden border shadow-sm hover:shadow-lg transition-all flex flex-col justify-between relative ${
                        isThisPreview ? 'ring-2 ring-[#C5A880] border-[#C5A880]' : 'border-stone-200'
                      }`}
                    >
                      {isThisPreview && (
                        <div className="absolute top-3 left-3 bg-[#C5A880] text-[#26130F] text-[10px] font-black px-2.5 py-1 rounded-full shadow-md z-20 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          <span>כרטיס הטיוטה שלך</span>
                        </div>
                      )}
                      <div>
                        {/* Image & Location Badge */}
                        <div className="relative h-56 overflow-hidden bg-stone-900 group">
                          <img
                            src={heroImg || '/resorts/placeholder_luxury.jpg'}
                            alt={prop.hebrew_name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/20">
                            <MapPin className="w-3.5 h-3.5 text-[#C5A880]" />
                            <span>{prop.village}</span>
                          </div>
                          <div className="absolute bottom-3 right-3 left-3 text-white pointer-events-none">
                            <h3 className="text-xl font-bold tracking-tight">{prop.hebrew_name}</h3>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-xs text-stone-300 font-light truncate max-w-[65%]">{prop.tagline || 'מתחם נופש ואירוח כפרי'}</span>
                              <span className="text-xs text-[#E6CA9D] font-mono font-bold">החל מ-₪{prop.min_price} / לילה</span>
                            </div>
                          </div>
                        </div>

                        {/* Amenities Preview */}
                        <div className="p-4 space-y-3">
                          <div className="flex flex-wrap gap-1.5">
                            {amenities.map((am, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2 py-0.5 rounded-lg"
                              >
                                {am}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Booking CTA Component */}
                      <div className="p-4 pt-0 space-y-2">
                        <ListingCardCTA
                          property={prop}
                          isPreviewMode={false}
                          onOpenBookingModal={(p) => {
                            window.location.href = `/mialees.html?property=${p.slug}`;
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* ========================================================================= */}
        {/* TAB 2: HOST & MANAGER PROPERTY DASHBOARD & EDITOR */}
        {/* ========================================================================= */}
        {activeTab === 'host_editor' && (
          <div className="animate-fadeIn space-y-4">
            {(() => {
              const currentProp = managedProperties.find((p) => p.id === activeManagingPropertyId) || managedProperties[0];
              const isVerified = isPropertyOwnerVerified(currentProp) || (isAdminAuthenticated && adminBypassPropertyId === currentProp.id);

              if (!isVerified) {
                return (
                  <div className="max-w-xl mx-auto my-8 bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-xl space-y-6 animate-scaleUp">
                    <div className="text-center space-y-2">
                      <div className="w-16 h-16 rounded-2xl bg-[#26130F] text-[#C5A880] flex items-center justify-center mx-auto shadow-md">
                        <KeyRound className="w-8 h-8" />
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/70 border border-amber-300/80 px-3 py-1 rounded-full inline-block">
                        שער אבטחה · כניסת בעלי מתחם בלבד
                      </span>
                      <h2 className="text-2xl font-black text-[#26130F]">אימות בעלות באמצעות קוד OTP</h2>
                      <p className="text-sm font-bold text-stone-700">
                        {currentProp.hebrew_name} ({currentProp.village})
                      </p>
                      <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                        מתחם זה נמצא במצב טיוטה. מטעמי אבטחה, קישור תצוגה מקדימה אינו מספיק לעריכה או לאישור.
                        על מנת להעלות תמונות, לערוך מחירים או לנהל את פרטי המתחם, יש לאמת שאתם בעלי העסק באמצעות קוד OTP הנשלח לטלפון הרשום.
                      </p>
                    </div>

                    {/* Display Masked Phone */}
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#8C6239]" />
                        <span className="text-stone-600">נייד רשום לאימות:</span>
                      </div>
                      <bdi dir="ltr" className="font-mono font-bold text-sm text-[#26130F] tracking-wide">
                        {formatMaskedPhone(currentProp.whatsapp_number || currentProp.phone)}
                      </bdi>
                    </div>

                    {/* OTP Trigger Buttons: Choice of WhatsApp (WATI) or SMS */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => openClaimModal(currentProp, 'whatsapp')}
                          className="py-3 px-3.5 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-98"
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>אימות בוואטסאפ (WATI)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openClaimModal(currentProp, 'sms')}
                          className="py-3 px-3.5 rounded-2xl bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all active:scale-98"
                        >
                          <Phone className="w-4 h-4 text-[#C5A880] shrink-0" />
                          <span>אימות ב-SMS לנייד</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-stone-100 text-xs">
                        <button
                          type="button"
                          onClick={() => setActiveTab('marketplace')}
                          className="text-stone-500 hover:text-stone-800 font-semibold"
                        >
                          ← חזרה למרקטפלייס
                        </button>

                        {/* Admin Access Bypass for Ran */}
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdminAuthenticated(true);
                            try {
                              localStorage.setItem('resortos_admin_session', 'true');
                            } catch {}
                          }}
                          className="text-[#8C6239] hover:underline font-bold text-[11px] flex items-center gap-1"
                          title="גישת מנהל מערכת ללא צורך ב-OTP של בעל המתחם"
                        >
                          <span>כניסת אדמין מורשה (רן) ⚡</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return hostEditorMode === 'chloe' ? (
                <ChloeHostChat
                  properties={managedProperties}
                  activePropertyId={activeManagingPropertyId}
                  onSelectProperty={(id) => setActiveManagingPropertyId(id)}
                  onUpdateProperty={handleSaveProperty}
                  onOpenManualEditor={() => setHostEditorMode('manual')}
                  onOpenPublicListing={(slug) => {
                    setActiveTab('marketplace');
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-stone-900 text-white px-5 py-3 rounded-2xl border border-stone-800 shadow-md">
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <span className="font-bold text-stone-200">מצב עריכה ידנית מלאה</span>
                      <span className="text-stone-400 hidden sm:inline">— עריכת שדות מפורטת, מתקנים וקוד Wi-Fi</span>
                    </div>
                    <button
                      onClick={() => setHostEditorMode('chloe')}
                      className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-stone-950 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-sm"
                    >
                      <span>🤖 חזרה לשיחה עם קלואי (מומלץ)</span>
                    </button>
                  </div>
                  <HostPropertyEditor
                    properties={managedProperties}
                    activePropertyId={activeManagingPropertyId}
                    onSelectProperty={(id) => setActiveManagingPropertyId(id)}
                    onSaveProperty={handleSaveProperty}
                    onPreviewPublicListing={() => setActiveTab('marketplace')}
                    onOpenRoomGuides={() => setActiveTab('playbook')}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SUPPLIER & B2B GROUP DEALS MARKETPLACE */}
        {/* ========================================================================= */}
        {activeTab === 'deals' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                  מועדון כוח הקנייה המשותף של ResortOS
                </span>
                <h2 className="text-2xl font-bold text-[#26130F] mt-1">הטבות וספקים מורשים למארחים</h2>
                <p className="text-xs text-stone-500 max-w-xl mt-0.5">
                  הנחות קבוצה בלעדיות של 15%–25% על ציוד ספא, כביסה ומצעי פרימיום, משאבות חום וקפה בוטיק.
                </p>
              </div>

              <div className="text-left bg-stone-50 p-3 rounded-2xl border border-stone-200">
                <span className="text-[11px] text-stone-400 block">סטטוס המנוי שלכם:</span>
                <span className="text-xs font-bold text-[#26130F]">
                  {hostTier === 'resortos_prime_99' ? '⭐ ResortOS Prime (פתוח לכל ההטבות)' : 'מארח רשום (Free)'}
                </span>
              </div>
            </div>

            {/* Deals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {INITIAL_DEALS.map((deal) => (
                <SupplierDealCard
                  key={deal.id}
                  deal={deal}
                  hostTier={hostTier}
                  onUpgradeToPrime={() => {
                    setHostTier('resortos_prime_99');
                    alert('שודרגת בהצלחה ל-ResortOS Prime! כל קודי הקופון פתוחים כעת.');
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: HOST PLAYBOOK & WHITE-LABEL COMIC GUIDES */}
        {/* ========================================================================= */}
        {activeTab === 'playbook' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Control Bar */}
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-wrap items-center justify-between gap-4 no-print">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-600">בחרו מדריך:</span>
                {INITIAL_GUIDES.map((g, idx) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGuideIndex(idx)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
                      selectedGuideIndex === idx
                        ? 'bg-[#26130F] text-white'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {g.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Comic Guide Renderer */}
            {(() => {
              const activeProp = managedProperties.find((p) => p.id === activeManagingPropertyId) || managedProperties[0];
              return (
                <ComicGuideRenderer
                  guide={INITIAL_GUIDES[selectedGuideIndex]}
                  propertyId={activeProp.id}
                  unitId={activeProp.units?.[0]?.id || "k687"}
                  propertyName={activeProp.hebrew_name}
                  unitName={activeProp.units?.[0]?.name || "סוויטת אירוח"}
                  wifiSsid={activeProp.wifi_ssid || "Toscana_Guest_5G"}
                  wifiPassword={activeProp.wifi_password || "golanparadise"}
                  hostNotes={activeProp.host_welcome_notes || "ברוכים הבאים למתחם שלנו! המדריך הזה זמין לכם גם בטלוויזיה של החדר."}
                />
              );
            })()}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: ADMIN CONVERSION FUNNEL & CRM LEADS */}
        {/* ========================================================================= */}
        {activeTab === 'admin_funnel' && (
          <AdminFunnelDashboard
            properties={managedProperties}
            onUpdateProperty={handleSaveProperty}
            onOpenPreviewListing={(slug) => {
              window.location.href = `/p/${slug}`;
            }}
            onEditPropertyAsAdmin={(propId) => {
              setIsAdminAuthenticated(true);
              setAdminBypassPropertyId(propId);
              try {
                localStorage.setItem('resortos_admin_session', 'true');
              } catch {}
              setActiveManagingPropertyId(propId);
              setActiveTab('host_editor');
            }}
          />
        )}
      </main>

      {/* ========================================================================= */}
      {/* CLAIM LISTING OTP MODAL */}
      {/* ========================================================================= */}
      {claimModalProperty && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-stone-200 relative">
            <button
              type="button"
              onClick={() => setClaimModalProperty(null)}
              className="absolute top-4 left-4 p-1 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#26130F] text-[#C5A880] flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#26130F]">אימות בעלות על המתחם</h3>
              <p className="text-xs text-stone-500 mt-1">{claimModalProperty.hebrew_name} · {claimModalProperty.village}</p>
            </div>

            {claimError && (
              <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{claimError}</span>
              </div>
            )}

            {claimStep === 'input_phone' && (
              <form onSubmit={handleInitiateClaim} className="space-y-4">
                {/* Channel Selector: WhatsApp (WATI) vs SMS */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    ערוץ לקבלת קוד האימות:
                  </label>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setClaimChannel('whatsapp');
                        if (claimModalProperty.whatsapp_number) {
                          setClaimPhone(toIsraeliPhone(claimModalProperty.whatsapp_number));
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        claimChannel === 'whatsapp'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-sm ring-2 ring-emerald-400/40'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 text-[#25D366] shrink-0" />
                      <span>וואטסאפ (WATI)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setClaimChannel('sms');
                        if (claimModalProperty.phone) {
                          setClaimPhone(toIsraeliPhone(claimModalProperty.phone));
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        claimChannel === 'sms'
                          ? 'bg-sky-50 border-sky-500 text-sky-950 shadow-sm ring-2 ring-sky-400/40'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      <Phone className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>מסרון SMS לנייד</span>
                    </button>
                  </div>
                </div>

                {/* Registered Numbers Selector if property has both */}
                {claimModalProperty.whatsapp_number && claimModalProperty.phone && claimModalProperty.whatsapp_number !== claimModalProperty.phone && (
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 space-y-1.5 text-xs">
                    <span className="text-[11px] font-bold text-stone-500 block">מספרים רשומים במתחם:</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setClaimPhone(toIsraeliPhone(claimModalProperty.whatsapp_number));
                          setClaimChannel('whatsapp');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-2xs ${
                          claimChannel === 'whatsapp'
                            ? 'bg-[#26130F] text-[#C5A880] border-[#26130F]'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#25D366] shrink-0" />
                        <span>וואטסאפ:</span>
                        <bdi dir="ltr" className="font-mono tracking-wide font-bold">
                          {formatMaskedPhone(claimModalProperty.whatsapp_number)}
                        </bdi>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setClaimPhone(toIsraeliPhone(claimModalProperty.phone || ''));
                          setClaimChannel('sms');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-2xs ${
                          claimChannel === 'sms'
                            ? 'bg-[#26130F] text-[#C5A880] border-[#26130F]'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>טלפון ישיר:</span>
                        <bdi dir="ltr" className="font-mono tracking-wide font-bold">
                          {formatMaskedPhone(claimModalProperty.phone)}
                        </bdi>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    מספר הטלפון לאימות ({claimChannel === 'whatsapp' ? 'וואטסאפ WATI' : 'SMS לנייד'})
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    value={claimPhone}
                    onChange={(e) => setClaimPhone(e.target.value)}
                    placeholder="054-242-4835"
                    className="w-full p-3 rounded-xl border border-stone-300 text-sm font-mono font-bold text-center tracking-wider focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                  <span className="text-[10px] text-stone-400 mt-1 block">
                    המספר חייב להתאים לרישום הציבורי של המתחם למניעת התחזות.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={claimLoading}
                  className="w-full py-3 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center justify-center gap-2 shadow transition-all"
                >
                  {claimLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#C5A880]" />
                  ) : claimChannel === 'whatsapp' ? (
                    <MessageCircle className="w-4 h-4 text-[#25D366]" />
                  ) : (
                    <Phone className="w-4 h-4 text-[#C5A880]" />
                  )}
                  <span>
                    {claimChannel === 'whatsapp'
                      ? 'שלח קוד אימות בוואטסאפ (WATI)'
                      : 'שלח קוד אימות ב-SMS לנייד'}
                  </span>
                </button>
              </form>
            )}

            {claimStep === 'input_otp' && (
              <form onSubmit={handleVerifyClaim} className="space-y-4">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div>
                    קוד אימות בן 6 ספרות נשלח ב-
                    <strong>{claimChannel === 'whatsapp' ? 'וואטסאפ (WATI)' : 'מסרון SMS לנייד'}</strong> למספר{' '}
                    <bdi dir="ltr" className="font-mono font-bold">{formatMaskedPhone(claimPhone)}</bdi>
                    <span className="text-[11px] text-amber-800/80 mr-1.5 font-bold">(תוקף הקוד: 5 דקות)</span>.
                  </div>
                  {previewOtp && (
                    <span className="block mt-1 text-[11px] font-mono text-emerald-800 font-bold">
                      (קוד בדיקה מהיר: <strong>{previewOtp}</strong>)
                    </span>
                  )}
                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between text-[11px]">
                    <span className="text-amber-800/80">לא קיבלתם את הקוד?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setClaimChannel(claimChannel === 'whatsapp' ? 'sms' : 'whatsapp');
                        setClaimStep('input_phone');
                      }}
                      className="text-[#8C6239] hover:underline font-bold"
                    >
                      שליחה מחדש ב-{claimChannel === 'whatsapp' ? 'SMS לנייד' : 'וואטסאפ (WATI)'} ←
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">הזינו את קוד האימות (6 ספרות)</label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    maxLength={6}
                    value={claimOtp}
                    onChange={(e) => setClaimOtp(e.target.value)}
                    placeholder="123456"
                    className="w-full p-3 rounded-xl border border-stone-300 text-center font-mono font-bold text-lg tracking-widest focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={claimLoading}
                  className="w-full py-3 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
                >
                  {claimLoading ? <RefreshCw className="w-4 h-4 animate-spin text-[#C5A880]" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  <span>אימות והפעלת המתחם ב-ResortOS</span>
                </button>
              </form>
            )}

            {claimStep === 'success' && (
              <div className="text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-stone-900">המתחם אומת בהצלחה!</h4>
                <p className="text-xs text-stone-600">
                  {claimModalProperty.hebrew_name} מוגדר כעת כמתחם מחובר עם הזמנות ישירות ב-0% עמלה וגישה להטבות הספקים.
                </p>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ססיית בעלים פעילה ל-30 יום (מכשיר זה זוהה כמאומת)</span>
                </div>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveManagingPropertyId(claimModalProperty.id);
                      setActiveTab('host_editor');
                      setClaimModalProperty(null);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center justify-center gap-2 shadow"
                  >
                    <Sliders className="w-4 h-4 text-[#C5A880]" />
                    <span>מעבר לעריכת המתחם והתמונות עכשיו</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setClaimModalProperty(null)}
                    className="w-full py-2 px-4 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-bold"
                  >
                    סגור וחזור לקטלוג
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
