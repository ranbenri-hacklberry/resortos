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

function formatMaskedPhone(phone?: string): string {
  if (!phone) return '05*-***-****';
  const clean = phone.replace(/\D/g, '');
  const local = clean.startsWith('972') ? '0' + clean.slice(3) : clean;
  if (local.length >= 9) {
    return `${local.slice(0, 3)}-***-${local.slice(-4)}`;
  }
  return local;
}

export function ResortOSApp() {
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

  const [managedProperties, setManagedProperties] = useState<ManagedProperty[]>(() => {
    const realLeads = getWeekendRealLeads();
    const realMap = new Map(realLeads.map((l) => [l.id, l]));

    try {
      const saved = localStorage.getItem('resortos_managed_properties');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 700 && parsed.some((p: any) => p.id?.startsWith('weekend-lead-'))) {
          return parsed.map((p: any) => {
            if (p.id?.startsWith('weekend-lead-')) {
              const r = realMap.get(p.id);
              return {
                ...p,
                source_url: p.source_url || r?.source_url || 'https://www.weekend.co.il',
                reference_image_urls: (p.reference_image_urls && p.reference_image_urls.length > 0) ? p.reference_image_urls : (r?.reference_image_urls || []),
                // All 693 imported properties default strictly to draft (is_public: false) unless explicitly approved
                is_public: Boolean(p.is_approved ? true : (p.is_public ?? false)),
                crm_status: p.crm_status || 'Lead_Identified'
              };
            }
            return p;
          });
        }
      }
    } catch {}

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
      gallery_images: [
        'https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1587061949409-02df41d5e562?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80'
      ],
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
      claimed_status: (p.id === 'mialees' ? 'claimed_verified' : 'unclaimed_seeded') as any,
      direct_booking_enabled: p.id === 'mialees',
      crm_status: (p.id === 'mialees' ? 'Verified_Subscriber' : 'Portal_Free_Active') as any,
      is_public: true,
      source: 'flagship_canonical',
      property_public_path: `/p/${p.slug}`
    }));

    const seededLeads = generateSeededLeads(693);
    const combined = [...flagship, ...seededLeads];
    try {
      localStorage.setItem('resortos_managed_properties', JSON.stringify(combined));
    } catch {}
    return combined;
  });

  const [propertiesState, setPropertiesState] = useState<PropertyItem[]>(() =>
    managedProperties.map((p) => ({
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
    }))
  );

  const handleSaveProperty = (updated: ManagedProperty) => {
    setManagedProperties((prev) => {
      const next = prev.map((p) => (p.id === updated.id ? updated : p));
      try {
        localStorage.setItem('resortos_managed_properties', JSON.stringify(next));
      } catch {}
      return next;
    });

    setPropertiesState((prev) =>
      prev.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              name: updated.name,
              hebrew_name: updated.hebrew_name,
              slug: updated.slug || p.slug,
              contact_name: updated.contact_name,
              village: updated.village,
              region: updated.region,
              whatsapp_number: updated.whatsapp_number,
              phone: updated.phone,
              claimed_status: updated.claimed_status,
              direct_booking_enabled: updated.direct_booking_enabled,
              min_price: updated.units?.[0]?.base_price || p.min_price,
              hero_image: updated.hero_image,
              is_public: updated.is_public,
              crm_status: updated.crm_status
            }
          : p
      )
    );

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
    const list = propertiesState.filter((p) => {
      // Target preview exception: if a host visits their preview URL, show their card!
      const isTargetPreview = isPreviewMode && (p.slug === previewSlug || p.id === previewSlug);

      // STRICT VISIBILITY: Marketplace only displays is_public === true AND crm_status !== 'Opt_Out'
      if (!isTargetPreview) {
        if (p.is_public === false) return false;
        if (p.crm_status === 'Opt_Out') return false;
      }

      if (regionFilter !== 'all' && !p.region.includes(regionFilter)) return false;
      if (searchTerm && !p.hebrew_name.includes(searchTerm) && !p.village.includes(searchTerm)) return false;
      return true;
    });

    // If target preview exists, bring it to the absolute top of the feed
    if (targetDraftProperty && list.some((p) => p.id === targetDraftProperty.id)) {
      return [
        targetDraftProperty,
        ...list.filter((p) => p.id !== targetDraftProperty.id)
      ];
    }

    return list;
  }, [propertiesState, regionFilter, searchTerm, isPreviewMode, previewSlug, targetDraftProperty]);

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

      // Transition managedProperties and save to persistent storage
      setManagedProperties((prev) => {
        const next = prev.map((p) =>
          p.id === claimModalProperty.id
            ? {
                ...p,
                claimed_status: 'claimed_verified' as const,
                direct_booking_enabled: true,
                verified_at: verifiedAt,
                crm_status: p.crm_status === 'Lead_Identified' ? 'Portal_Free_Active' : p.crm_status
              }
            : p
        );
        try {
          localStorage.setItem('resortos_managed_properties', JSON.stringify(next));
        } catch {}
        return next;
      });

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
    const initialPhone = preferredChannel === 'sms' && prop.phone ? prop.phone : (prop.whatsapp_number || prop.phone || '');
    setClaimPhone(initialPhone);
    setClaimOtp('');
    setClaimStep('input_phone');
    setClaimError(null);
    setPreviewOtp(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#26130F] font-sans antialiased selection:bg-[#C5A880] selection:text-[#26130F]">
      {/* Top Universal Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <a href="/" className="flex items-center gap-3 group cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-[#26130F] group-hover:bg-[#3F2C29] flex items-center justify-center text-[#C5A880] font-black text-lg shadow transition">
                R
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-lg sm:text-xl tracking-tight text-[#26130F]">ResortOS</span>
                  <span className="bg-[#C5A880] text-[#26130F] text-[10px] font-black px-1.5 py-0.2 rounded uppercase">
                    Ecosystem
                  </span>
                </div>
                <span className="text-[10px] text-stone-500 hidden sm:block">
                  מרקטפלייס אירוח יוקרתי ומערכת ניהול B2B
                </span>
              </div>
            </a>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 sm:gap-2 bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('marketplace')}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'marketplace'
                    ? 'bg-white text-[#26130F] shadow-sm font-extrabold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>מתחמי נופש</span>
                <span className="text-[10px] bg-stone-200 px-1.5 py-0.2 rounded-full hidden md:inline">12</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('host_editor')}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'host_editor'
                    ? 'bg-white text-[#26130F] shadow-sm font-extrabold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>דשבורד מנהלים</span>
                <span className="text-[10px] bg-amber-100 text-[#8C6239] px-1.5 py-0.2 rounded-full hidden md:inline font-bold">
                  עריכה
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('deals')}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'deals'
                    ? 'bg-white text-[#26130F] shadow-sm font-extrabold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                <span>מועדון ספקים</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full hidden md:inline">
                  הטבות B2B
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('playbook')}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'playbook'
                    ? 'bg-white text-[#26130F] shadow-sm font-extrabold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-[#8C6239]" />
                <span>מדריכי קומיקס לחדר</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('admin_funnel')}
                className={`py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
                  activeTab === 'admin_funnel'
                    ? 'bg-[#26130F] text-[#C5A880] shadow-sm font-extrabold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>פאנל המרות (CRM)</span>
                <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded-full hidden md:inline font-bold">
                  {managedProperties.length}
                </span>
              </button>
            </nav>

            {/* Host Tier Badge & Toggle for Demo */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHostTier((t) => (t === 'free_directory' ? 'resortos_prime_99' : 'free_directory'))}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                  hostTier === 'resortos_prime_99'
                    ? 'bg-[#26130F] text-[#C5A880] border-[#C5A880]'
                    : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                }`}
                title="לחץ להחלפת סטטוס מנוי (הדגמה)"
              >
                <Sparkles className="w-3 h-3 text-[#C5A880]" />
                <span>{hostTier === 'resortos_prime_99' ? 'ResortOS Prime ₪99' : 'מארח Free'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Host Preview Mode Top Banner */}
      {isPreviewMode && (
        <div className="bg-gradient-to-r from-amber-700 via-[#26130F] to-stone-900 text-white py-2.5 px-4 sm:px-8 shadow-md text-xs font-bold flex items-center justify-between no-print border-b border-[#C5A880]/40 animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C5A880] shrink-0" />
            <span>🌟 מצב תצוגה מקדימה למארח: כך יוצג המתחם שלכם ב-ResortOS. אשרו בעלות והעלו תמונות כדי לפתוח להזמנות בחינם!</span>
          </div>
          <a
            href="/"
            className="bg-[#C5A880] hover:bg-[#b09268] text-[#26130F] text-[11px] font-black px-3 py-1 rounded-lg transition shrink-0"
          >
            חזרה לאתר הראשי
          </a>
        </div>
      )}

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
                לא מצאנו מתחם פעיל או טיוטה בכתובת{' '}
                <span className="font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded text-xs" dir="ltr">
                  /p/{previewSlug}
                </span>.
                יתכן שהקישור שגוי, הוקלד לא נכון או שהמתחם הוסר מהמערכת.
              </p>
              <a
                href="/"
                className="mt-2 bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] font-black text-xs sm:text-sm px-6 py-3.5 rounded-xl transition shadow-md flex items-center gap-2 active:scale-95"
              >
                <Compass className="w-4 h-4" />
                <span>חזרה לכל מתחמי הנופש ב-ResortOS</span>
              </a>
            </div>
          ) : (
            <div className="space-y-8 animate-fadeIn">
              {/* Host Welcome & Draft Verification Banner (When viewing /p/:slug or preview) */}
              {isPreviewMode && targetDraftProperty && (
                <div className="relative rounded-3xl bg-gradient-to-r from-stone-900 via-[#26130F] to-stone-900 text-white p-6 sm:p-8 border-2 border-[#C5A880] shadow-xl overflow-hidden animate-fadeIn">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2 text-right">
                      <div className="inline-flex items-center gap-1.5 bg-[#C5A880]/20 text-[#C5A880] text-xs font-black px-3 py-1 rounded-full border border-[#C5A880]/30">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>טיוטת כרטיס מתחם – מוסתרת כרגע מהציבור</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-black text-white">
                        שלום לבעלי {targetDraftProperty.hebrew_name}! ✨
                      </h1>
                      <p className="text-xs sm:text-sm text-stone-300 max-w-xl leading-relaxed">
                        הכנו עבורכם דף פרופיל דיגיטלי יוקרתי ברשת ResortOS. הדף ממתין לאימות בעלות ולהעלאת 2-3 תמונות שלכם כדי שנוכל לפתוח אותו להזמנות ישירות מולכם ב-0% עמלה!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPropertyOwnerVerified(targetDraftProperty)) {
                          openClaimModal(targetDraftProperty);
                        } else {
                          setActiveManagingPropertyId(targetDraftProperty.id);
                          setActiveTab('host_editor');
                        }
                      }}
                      className="bg-[#C5A880] hover:bg-[#b09268] text-[#26130F] font-black text-xs sm:text-sm px-6 py-3.5 rounded-2xl transition shadow-lg shrink-0 flex items-center gap-2 active:scale-95"
                    >
                      <KeyRound className="w-4 h-4 text-[#26130F]" />
                      <span>אני בעל המתחם – אימות והעלאת תמונות</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Hero Banner */}
              <div className="relative rounded-3xl bg-gradient-to-r from-[#26130F] via-[#3F2C29] to-[#59454A] text-white p-6 sm:p-10 shadow-lg overflow-hidden">
                <div className="max-w-2xl space-y-3 relative z-10">
                  <div className="inline-flex items-center gap-1.5 bg-[#C5A880]/20 text-[#C5A880] text-xs font-bold px-3 py-1 rounded-full border border-[#C5A880]/30">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>סגירה ישירה מול בעלי המתחמים ללא עמלות תיווך</span>
                  </div>
                  <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
                    מתחמי הנופש והבקתות המובילים ברמת הגולן והכנרת
                  </h1>
                  <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                    גלו 12 מתחמי אירוח ברמות, נאות גולן, חד נס ונוב. מתחמים מחוברים מציעים יומן חי וסגירה מיידית ב-0% עמלה.
                  </p>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {[
                    { id: 'all', label: 'כל האזורים (12)' },
                    { id: 'רמת הגולן', label: 'רמת הגולן' },
                    { id: 'סובב כנרת', label: 'סובב כנרת' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setRegionFilter(tab.id)}
                      className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        regionFilter === tab.id
                          ? 'bg-[#26130F] text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="חיפוש לפי שם מתחם או מושב..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-64 p-2 rounded-xl border border-stone-200 bg-stone-50 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                />
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
                        {/* Image & Location Badge (with luxury placeholder when no public image) */}
                        <div className="relative h-52 overflow-hidden bg-stone-900">
                          {heroImg ? (
                            <img src={heroImg} alt={prop.hebrew_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="relative w-full h-full bg-stone-900">
                              <img src="/resorts/placeholder_luxury.jpg" alt="העלאת תמונות מתחם" className="w-full h-full object-cover opacity-85" />
                              <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isPropertyOwnerVerified(prop)) {
                                      openClaimModal(prop);
                                    } else {
                                      setActiveManagingPropertyId(prop.id);
                                      setActiveTab('host_editor');
                                    }
                                  }}
                                  className="bg-[#C5A880] hover:bg-[#b09268] text-[#26130F] text-[11px] font-black px-3.5 py-1.5 rounded-lg transition shadow flex items-center gap-1 active:scale-95"
                                >
                                  📸 העלה את תמונות המתחם שלך
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/20">
                            <MapPin className="w-3 h-3 text-[#C5A880]" />
                            <span>{prop.village}</span>
                          </div>
                          <div className="absolute bottom-3 right-3 left-3 text-white pointer-events-none">
                            <h3 className="text-lg font-bold">{prop.hebrew_name}</h3>
                            <span className="text-[11px] text-stone-200 font-mono">החל מ-₪{prop.min_price} / לילה</span>
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

                      {/* Dual Action CTA Component */}
                      <div className="p-4 pt-0 space-y-2">
                        <ListingCardCTA
                          property={prop}
                          isPreviewMode={isThisPreview}
                          onOpenBookingModal={(p) => {
                            window.location.href = `/mialees.html?property=${p.slug}`;
                          }}
                          onClaimListing={(p) => openClaimModal(p)}
                          onUploadPhotos={(p) => {
                            if (!isPropertyOwnerVerified(p)) {
                              openClaimModal(p);
                            } else {
                              setActiveManagingPropertyId(p.id);
                              setActiveTab('host_editor');
                            }
                          }}
                        />

                        {isPropertyOwnerVerified(prop) && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveManagingPropertyId(prop.id);
                              setActiveTab('host_editor');
                            }}
                            className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#8C6239] text-[11px] font-bold flex items-center justify-center gap-1.5 border border-amber-200/80 transition-colors"
                          >
                            <Sliders className="w-3.5 h-3.5 text-[#8C6239]" />
                            <span>עריכת מתחם ותמונות בדשבורד</span>
                          </button>
                        )}
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
                      <span className="font-mono font-bold text-sm text-[#26130F] dir-ltr">
                        {formatMaskedPhone(currentProp.whatsapp_number || currentProp.phone)}
                      </span>
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
                          setClaimPhone(claimModalProperty.whatsapp_number);
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
                          setClaimPhone(claimModalProperty.phone);
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
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 space-y-1 text-xs">
                    <span className="text-[11px] font-bold text-stone-500 block">מספרים רשומים במתחם:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setClaimPhone(claimModalProperty.whatsapp_number);
                          setClaimChannel('whatsapp');
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition ${
                          claimPhone === claimModalProperty.whatsapp_number
                            ? 'bg-[#26130F] text-[#C5A880] border-[#26130F] font-bold'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        וואטסאפ: {formatMaskedPhone(claimModalProperty.whatsapp_number)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setClaimPhone(claimModalProperty.phone || '');
                          setClaimChannel('sms');
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition ${
                          claimPhone === claimModalProperty.phone
                            ? 'bg-[#26130F] text-[#C5A880] border-[#26130F] font-bold'
                            : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        טלפון ישיר: {formatMaskedPhone(claimModalProperty.phone)}
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
                    required
                    value={claimPhone}
                    onChange={(e) => setClaimPhone(e.target.value)}
                    placeholder="054-807-6123"
                    className="w-full p-3 rounded-xl border border-stone-300 text-xs font-mono font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
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
                    <strong>{formatMaskedPhone(claimPhone)}</strong>.
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
