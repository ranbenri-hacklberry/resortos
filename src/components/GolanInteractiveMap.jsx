import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Phone,
  MessageSquare,
  Search,
  Filter,
  ExternalLink,
  Utensils,
  Coffee,
  Compass,
  Wine,
  Trees,
  Layers,
  X,
  Share2,
  Check
} from 'lucide-react';

export const SOUTH_GOLAN_PLACES = [
  {
    id: 'dudis',
    name: "דודיס ביסטרו בר (Dudi's)",
    category: 'dining',
    categoryName: 'מסעדות ובשרים',
    settlement: 'גבעת יואב',
    lat: 32.7985,
    lng: 35.6980,
    phone: '077-3228050',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7985,35.6980&navigate=yes',
    description: 'ביסטרו כפרי כשר: בשרים, המבורגרים ופסטות באווירה חמה.'
  },
  {
    id: 'paul_bar',
    name: 'פול בר (Paul Bar)',
    category: 'dining',
    categoryName: 'מסעדות ובשרים',
    settlement: 'גבעת יואב',
    lat: 32.7972,
    lng: 35.6965,
    phone: '055-9923125',
    whatsapp: '972559923125',
    wazeUrl: 'https://waze.com/ul?ll=32.7972,35.6965&navigate=yes',
    description: 'מסעדת בשרים וגריל ים-תיכוני (כשר למהדרין).'
  },
  {
    id: 'limoneto',
    name: 'לימונטו (Limoneto)',
    category: 'cafe',
    categoryName: 'בתי קפה ועגלות',
    settlement: 'גבעת יואב',
    lat: 32.7960,
    lng: 35.6950,
    phone: '052-2258418',
    whatsapp: '972522258418',
    wazeUrl: 'https://waze.com/ul?ll=32.7960,35.6950&navigate=yes',
    description: 'בית קפה ומרכז מבקרים מבוסס לימונים, לימונצ\'לו ומאפים טריים.'
  },
  {
    id: 'yoava',
    name: 'עגלת יואבה (חוות הפיטאיה)',
    category: 'cafe',
    categoryName: 'בתי קפה ועגלות',
    settlement: 'גבעת יואב',
    lat: 32.7937,
    lng: 35.6882,
    phone: '052-6499565',
    whatsapp: '972526499565',
    wazeUrl: 'https://waze.com/ul?ll=32.7937,35.6882&navigate=yes',
    description: 'שייקים טרופיים, קערות אסאי ומאפים בחוות הפיטאיה מול הנוף.'
  },
  {
    id: 'go_golan',
    name: 'Go Golan (גו גולן)',
    category: 'attractions',
    categoryName: 'אטרקציות ושטח',
    settlement: 'גבעת יואב',
    lat: 32.7970,
    lng: 35.6975,
    phone: '052-6499565',
    whatsapp: '972526499565',
    wazeUrl: 'https://waze.com/ul?ll=32.7970,35.6975&navigate=yes',
    description: 'טיולי רייזרים ורכבי שטח עצמאיים ומודרכים במצוקי האון.'
  },
  {
    id: 'twister',
    name: 'משק טויסטר',
    category: 'attractions',
    categoryName: 'אטרקציות וחקלאות',
    settlement: 'גבעת יואב',
    lat: 32.7955,
    lng: 35.6960,
    phone: '052-8700553',
    whatsapp: '972528700553',
    wazeUrl: 'https://waze.com/ul?ll=32.7955,35.6960&navigate=yes',
    description: 'בית בד בוטיק לשמן זית גולני – סיורים מודרכים וטעימות.'
  },
  {
    id: 'kol_shofar',
    name: 'קול שופר',
    category: 'attractions',
    categoryName: 'מרכזי מבקרים וסדנאות',
    settlement: 'גבעת יואב',
    lat: 32.7980,
    lng: 35.6970,
    phone: '052-8008485',
    whatsapp: '972528008485',
    wazeUrl: 'https://waze.com/ul?ll=32.7980,35.6970&navigate=yes',
    description: 'מרכז מבקרים וסדנה בינלאומית לייצור שופרות מקרני איל.'
  },
  {
    id: 'alin_bee',
    name: 'מכוורת אלין',
    category: 'attractions',
    categoryName: 'מרכזי מבקרים וחקלאות',
    settlement: 'גבעת יואב',
    lat: 32.7968,
    lng: 35.6958,
    phone: '054-4815055',
    whatsapp: '972544815055',
    wazeUrl: 'https://waze.com/ul?ll=32.7968,35.6958&navigate=yes',
    description: 'מרכז מבקרים לחקר עולם הדבורים ורדיית דבש טהור.'
  },
  {
    id: 'mitzpe_ofir',
    name: 'מצפה אופיר',
    category: 'nature',
    categoryName: 'תצפיות וטבע',
    settlement: 'גבעת יואב',
    lat: 32.7937,
    lng: 35.6882,
    phone: '',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7937,35.6882&navigate=yes',
    description: 'נקודת התצפית הפנורמית המרהיבה ביותר על כל הכנרת, הארבל והגליל.'
  },
  {
    id: 'shimmys',
    name: "שימי'ס בר & גריל (Shimmy's)",
    category: 'dining',
    categoryName: 'מסעדות ובשרים',
    settlement: 'בני יהודה',
    lat: 32.7988,
    lng: 35.7060,
    phone: '058-5000352',
    whatsapp: '972585000352',
    wazeUrl: 'https://waze.com/ul?ll=32.7988,35.7060&navigate=yes',
    description: 'מסעדת בשרים, המבורגרים איכותיים ובר באזור התעשייה בני יהודה.'
  },
  {
    id: 'nakhtom',
    name: 'הנחתום',
    category: 'dining',
    categoryName: 'מאפיות ופיצות',
    settlement: 'בני יהודה',
    lat: 32.7995,
    lng: 35.7045,
    phone: '04-6601222',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7995,35.7045&navigate=yes',
    description: 'מאפייה ופיצה גורמה בטאבון בקניון נוף גולן.'
  },
  {
    id: 'pizza_amici',
    name: 'פיצה אמיצ\'י (Amici)',
    category: 'dining',
    categoryName: 'מאפיות ופיצות',
    settlement: 'בני יהודה',
    lat: 32.7992,
    lng: 35.7050,
    phone: '04-8626748',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7992,35.7050&navigate=yes',
    description: 'פיצרייה איטלקית ומאפים טריים בבני יהודה.'
  },
  {
    id: 'mika_winery',
    name: 'יקב מיקה',
    category: 'winery',
    categoryName: 'יקבים ומבשלות',
    settlement: 'בני יהודה',
    lat: 32.7980,
    lng: 35.7070,
    phone: '052-2761026',
    whatsapp: '972522761026',
    wazeUrl: 'https://waze.com/ul?ll=32.7980,35.7070&navigate=yes',
    description: 'יקב בוטיק כשר ומרכז טעימות יין באזור התעשייה.'
  },
  {
    id: 'nof_golan_mall',
    name: 'קניון נוף גולן ומרכז מסחרי',
    category: 'services',
    categoryName: 'קניות ושירותים',
    settlement: 'בני יהודה',
    lat: 32.7995,
    lng: 35.7045,
    phone: '04-6763484',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7995,35.7045&navigate=yes',
    description: 'סופרמרקט גדול, בנק הפועלים, בית מרקחת, כספומטים וחנויות.'
  },
  {
    id: 'neot_flavors',
    name: 'טעמים בטבע הגולן',
    category: 'dining',
    categoryName: 'מארזים וארוחות בוקר',
    settlement: 'נאות גולן',
    lat: 32.7665,
    lng: 35.7020,
    phone: '050-2429375',
    whatsapp: '972502429375',
    wazeUrl: 'https://waze.com/ul?ll=32.7665,35.7020&navigate=yes',
    description: 'מארזי ארוחות בוקר, בראנץ\' ופיקניק עשירים לצימרים ולשטח.'
  },
  {
    id: 'azizo',
    name: 'חוות עזיזו (Azizo - לבנדר)',
    category: 'attractions',
    categoryName: 'אטרקציות וחקלאות',
    settlement: 'מושב כנף',
    lat: 32.8465,
    lng: 35.7140,
    phone: '050-5891515',
    whatsapp: '972505891515',
    wazeUrl: 'https://waze.com/ul?ll=32.8465,35.7140&navigate=yes',
    description: 'חוות הלבנדר המפורסמת: בית קפה, גלידת לבנדר ומוצרי טיפוח טבעיים.'
  },
  {
    id: 'cafe_rico',
    name: 'קפה ריקו (Rico)',
    category: 'cafe',
    categoryName: 'בתי קפה ועגלות',
    settlement: 'מושב כנף',
    lat: 32.8450,
    lng: 35.7130,
    phone: '050-4004889',
    whatsapp: '972504004889',
    wazeUrl: 'https://waze.com/ul?ll=32.8450,35.7130&navigate=yes',
    description: 'עגלת קפה, פיצות מעולות בטאבון, כריכים ומאפים במושב כנף.'
  },
  {
    id: 'terra_nova',
    name: 'יקב טרה נובה',
    category: 'winery',
    categoryName: 'יקבים ומבשלות',
    settlement: 'מושב כנף',
    lat: 32.8475,
    lng: 35.7150,
    phone: '054-3993514',
    whatsapp: '972543993514',
    wazeUrl: 'https://waze.com/ul?ll=32.8475,35.7150&navigate=yes',
    description: 'יין בוטיק, ליקרי פירות יער ותותים מול נוף פנורמי מרהיב.'
  },
  {
    id: 'scoria',
    name: 'יקב סקוריה (Scoria)',
    category: 'winery',
    categoryName: 'יקבים ומבשלות',
    settlement: 'מושב כנף',
    lat: 32.8440,
    lng: 35.7120,
    phone: '050-4265276',
    whatsapp: '972504265276',
    wazeUrl: 'https://waze.com/ul?ll=32.8440,35.7120&navigate=yes',
    description: 'יין בוטיק איכותי ופלטות גבינות עשירות באווירה אינטימית.'
  },
  {
    id: 'ein_kanaf',
    name: 'מעיין כנף (דיר עזיז)',
    category: 'nature',
    categoryName: 'מעיינות וטבע',
    settlement: 'מושב כנף',
    lat: 32.8420,
    lng: 35.7080,
    phone: '',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8420,35.7080&navigate=yes',
    description: 'בריכות מים צלולות מוצלות לצד שרידי בית כנסת עתיק – חופשי.'
  },
  {
    id: 'moshbutz',
    name: 'מושבוצ',
    category: 'dining',
    categoryName: 'מסעדות ובשרים',
    settlement: 'מושב רמות',
    lat: 32.8625,
    lng: 35.6705,
    phone: '04-6795095',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8625,35.6705&navigate=yes',
    description: 'מסעדת בשרים וקולינריה גולנית Farm to Table מהמובילות בארץ.'
  },
  {
    id: 'habikta',
    name: 'הבקתה',
    category: 'dining',
    categoryName: 'מסעדות ובשרים',
    settlement: 'מושב רמות',
    lat: 32.8610,
    lng: 35.6690,
    phone: '04-6794016',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8610,35.6690&navigate=yes',
    description: 'מסעדת בשרים כשרה מול נוף פנורמי לכנרת.'
  },
  {
    id: 'cafe_moyz',
    name: 'קפה מוייז (Moyz)',
    category: 'cafe',
    categoryName: 'בתי קפה ועגלות',
    settlement: 'מושב רמות',
    lat: 32.8635,
    lng: 35.6720,
    phone: '052-3301222',
    whatsapp: '972523301222',
    wazeUrl: 'https://waze.com/ul?ll=32.8635,35.6720&navigate=yes',
    description: 'עגלת קפה, מאפים מיוחדים וכריכים מול נוף הכנרת.'
  },
  {
    id: 'ramot_ranch',
    name: 'חוות רמות',
    category: 'attractions',
    categoryName: 'אטרקציות ושטח',
    settlement: 'מושב רמות',
    lat: 32.8640,
    lng: 35.6730,
    phone: '053-7364750',
    whatsapp: '972537364750',
    wazeUrl: 'https://waze.com/ul?ll=32.8640,35.6730&navigate=yes',
    description: 'טיולי רכיבה על סוסים מול נופי השקיעה של הכנרת.'
  },
  {
    id: 'lol_art',
    name: 'לול ארט (Lol Art)',
    category: 'attractions',
    categoryName: 'מרכזי מבקרים וסדנאות',
    settlement: 'מושב רמות',
    lat: 32.8630,
    lng: 35.6715,
    phone: '052-3301222',
    whatsapp: '972523301222',
    wazeUrl: 'https://waze.com/ul?ll=32.8630,35.6715&navigate=yes',
    description: 'סדנאות נגרות, עיצוב בעץ ויצירה לכל המשפחה.'
  },
  {
    id: 'majrase',
    name: 'שמורת המג\'רסה (נחל דליות)',
    category: 'nature',
    categoryName: 'מעיינות וטבע',
    settlement: 'בקעת בית צידה (רמות)',
    lat: 32.8790,
    lng: 35.6600,
    phone: '04-6793410',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8790,35.6600&navigate=yes',
    description: 'מסלול הליכה רטוב במים זורמים מושלם למשפחות (רט"ג).'
  },
  {
    id: 'chateau_golan',
    name: 'יקב שאטו גולן',
    category: 'winery',
    categoryName: 'יקבים ומבשלות',
    settlement: 'מושב אלי-עד',
    lat: 32.8090,
    lng: 35.7380,
    phone: '04-6600026',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8090,35.7380&navigate=yes',
    description: 'מבנה טירה אירופי מרשים, מדשאות ויינות פרימיום מובחרים.'
  },
  {
    id: 'truckafe',
    name: 'טראקפה (Truckafe)',
    category: 'cafe',
    categoryName: 'בתי קפה ועגלות',
    settlement: 'מושב אלי-עד',
    lat: 32.8090,
    lng: 35.7380,
    phone: '054-3993514',
    whatsapp: '972543993514',
    wazeUrl: 'https://waze.com/ul?ll=32.8090,35.7380&navigate=yes',
    description: 'עגלת קפה ופטיסרי של רעות ריבק ציפר ביקב שאטו גולן.'
  },
  {
    id: 'fass_brewery',
    name: 'מבשלת בירה פאס (Fass)',
    category: 'winery',
    categoryName: 'יקבים ומבשלות',
    settlement: 'קיבוץ גשור',
    lat: 32.7840,
    lng: 35.7360,
    phone: '052-4576109',
    whatsapp: '972524576109',
    wazeUrl: 'https://waze.com/ul?ll=32.7840,35.7360&navigate=yes',
    description: 'מבשלת בירת בוטיק מקומית, בר ואוכל פאב גולני.'
  },
  {
    id: 'natour_dairy',
    name: 'מחלבת נטור',
    category: 'dining',
    categoryName: 'מחלבות ומסעדות',
    settlement: 'מושב נטור',
    lat: 32.8360,
    lng: 35.7580,
    phone: '04-6600325',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8360,35.7580&navigate=yes',
    description: 'גבינות עיזים בעבודת יד, בראנץ\' גולני וסדנאות גבינה.'
  },
  {
    id: 'mandarina',
    name: 'סטודיו מנדרינה',
    category: 'attractions',
    categoryName: 'מרכזי מבקרים וסדנאות',
    settlement: 'מושב נטור',
    lat: 32.8350,
    lng: 35.7570,
    phone: '079-5805531',
    whatsapp: '972795805531',
    wazeUrl: 'https://waze.com/ul?ll=32.8350,35.7570&navigate=yes',
    description: 'סדנאות ניפוח ופיסול בזכוכית לכל הגילאים.'
  },
  {
    id: 'ein_keshatot',
    name: 'עין קשתות (אום אל קנאטיר)',
    category: 'nature',
    categoryName: 'אתרי מורשת וטבע',
    settlement: 'ליד נטור',
    lat: 32.8490,
    lng: 35.7390,
    phone: '04-6851002',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.8490,35.7390&navigate=yes',
    description: 'אתר מורשת לאומי, בית כנסת עתיק משוחזר ומעיין קסום.'
  },
  {
    id: 'meitzar_stream',
    name: 'נחל ומפל מיצר',
    category: 'nature',
    categoryName: 'מעיינות וטבע',
    settlement: 'מושב מיצר',
    lat: 32.7380,
    lng: 35.7480,
    phone: '',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7380,35.7480&navigate=yes',
    description: 'מסלול טבע ומפל מרהיב בדרום הגולן מול עמק הירמוך.'
  },
  {
    id: 'ein_shoko',
    name: 'עין שוקו ומצפה השלום',
    category: 'nature',
    categoryName: 'מעיינות וטבע',
    settlement: 'כפר חרוב / מבוא חמה',
    lat: 32.7480,
    lng: 35.6600,
    phone: '',
    whatsapp: '',
    wazeUrl: 'https://waze.com/ul?ll=32.7480,35.6600&navigate=yes',
    description: 'בריכת שכשוך קסומה על שפת המצוק מול הכנרת.'
  }
];

export default function GolanInteractiveMap({ theme = 'dark' }) {
  const isLight = theme === 'light';
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [settlementFilter, setSettlementFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'

  const categories = [
    { id: 'all', label: 'הכל', icon: Layers },
    { id: 'dining', label: '🍽️ מסעדות ואוכל', icon: Utensils },
    { id: 'cafe', label: '☕ עגלות קפה', icon: Coffee },
    { id: 'attractions', label: '🚜 אטרקציות ושטח', icon: Compass },
    { id: 'winery', label: '🍷 יקבים ובירה', icon: Wine },
    { id: 'nature', label: '🌲 מעיינות וטבע', icon: Trees }
  ];

  const settlements = [
    'all',
    'גבעת יואב',
    'בני יהודה',
    'מושב רמות',
    'מושב כנף',
    'נאות גולן',
    'מושב אלי-עד',
    'מושב נטור',
    'קיבוץ גשור',
    'מושב מיצר'
  ];

  const filteredPlaces = SOUTH_GOLAN_PLACES.filter((place) => {
    const matchesCategory = categoryFilter === 'all' || place.category === categoryFilter;
    const matchesSettlement = settlementFilter === 'all' || place.settlement.includes(settlementFilter);
    const matchesSearch =
      place.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      place.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      place.settlement.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSettlement && matchesSearch;
  });

  // Load Leaflet dynamically and initialize map
  useEffect(() => {
    let isCancelled = false;

    const initializeLeafletMap = () => {
      if (!window.L || !mapRef.current || isCancelled) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Center around Givat Yoav & Ramot
      const map = window.L.map(mapRef.current, {
        center: [32.8050, 35.7050],
        zoom: 12,
        zoomControl: true
      });

      // Tile Layer (OpenStreetMap)
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(map);

      mapInstanceRef.current = map;
      updateMarkers(map);
    };

    // Load Leaflet CSS & JS if not already loaded
    if (!window.L) {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
          if (!isCancelled) initializeLeafletMap();
        };
        document.head.appendChild(script);
      }
    } else {
      initializeLeafletMap();
    }

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'dining': return '#EF4444'; // Red
      case 'cafe': return '#F59E0B'; // Amber
      case 'attractions': return '#3B82F6'; // Blue
      case 'winery': return '#8B5CF6'; // Purple
      case 'nature': return '#10B981'; // Green
      default: return '#6366F1';
    }
  };

  const getCategoryEmoji = (cat) => {
    switch (cat) {
      case 'dining': return '🍽️';
      case 'cafe': return '☕';
      case 'attractions': return '🚜';
      case 'winery': return '🍷';
      case 'nature': return '🌲';
      default: return '📍';
    }
  };

  const updateMarkers = (map) => {
    if (!map || !window.L) return;

    // Clear old markers
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    filteredPlaces.forEach((place) => {
      const color = getCategoryColor(place.category);
      const emoji = getCategoryEmoji(place.category);

      const customIcon = window.L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div style="
            background: ${color};
            color: #FFF;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.35);
            border: 2px solid #FFFFFF;
            font-size: 14px;
            cursor: pointer;
            transition: transform 0.2s ease;
          ">
            ${emoji}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = window.L.marker([place.lat, place.lng], { icon: customIcon }).addTo(map);

      marker.on('click', () => {
        setSelectedPlace(place);
        map.panTo([place.lat, place.lng], { animate: true, duration: 0.5 });
      });

      markersRef.current.push(marker);
    });
  };

  // Re-run marker updates on filter changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      updateMarkers(mapInstanceRef.current);
    }
  }, [categoryFilter, settlementFilter, searchQuery]);

  const bgCard = isLight ? '#FFFFFF' : '#141418';
  const borderCard = isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  const textPrimary = isLight ? '#1C1917' : '#F8FAFC';
  const textSecondary = isLight ? '#78716C' : '#94A3B8';
  const bgSubtle = isLight ? '#F6F3EC' : '#1E1E24';

  return (
    <div style={{ padding: '0.5rem 0', fontFamily: 'system-ui, -apple-system, sans-serif' }} dir="rtl">
      {/* HEADER & CONTROLS */}
      <div
        style={{
          background: bgCard,
          border: `1px solid ${borderCard}`,
          borderRadius: '16px',
          padding: '1.25rem',
          marginBottom: '1rem',
          boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 4px 20px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                  color: '#FFF',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <MapPin size={20} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: textPrimary }}>
                מפה אינטראקטיבית: אטרקציות, קולינריה וניווט Waze
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: textSecondary }}>
              מיקומים מדויקים, כפתורי ניווט Waze ישירים, טלפונים וקישורי WhatsApp עבור רמות, גבעת יואב ודרום הגולן ({filteredPlaces.length} מקומות).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
              style={{
                background: bgSubtle,
                border: `1px solid ${borderCard}`,
                color: textPrimary,
                padding: '0.5rem 0.95rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {viewMode === 'map' ? <Layers size={16} /> : <MapPin size={16} />}
              <span>{viewMode === 'map' ? 'תצוגת רשימה' : 'תצוגת מפה'}</span>
            </button>
          </div>
        </div>

        {/* SEARCH & FILTERS ROW */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
              <Search
                size={16}
                color={textSecondary}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="חפש מסעדה, אטרקציה, יקב, מעיין או יישוב..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 2.4rem 0.55rem 0.85rem',
                  borderRadius: '10px',
                  border: `1px solid ${borderCard}`,
                  background: bgSubtle,
                  color: textPrimary,
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <select
              value={settlementFilter}
              onChange={(e) => setSettlementFilter(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '10px',
                border: `1px solid ${borderCard}`,
                background: bgSubtle,
                color: textPrimary,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <option value="all">כל היישובים</option>
              {settlements.filter((s) => s !== 'all').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* CATEGORY PILLS */}
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '4px' }}>
            {categories.map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    border: `1px solid ${active ? '#3B82F6' : borderCard}`,
                    background: active ? '#3B82F6' : bgSubtle,
                    color: active ? '#FFFFFF' : textSecondary,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: MAP OR LIST */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedPlace ? '1fr 340px' : '1fr', gap: '1rem' }}>
        {viewMode === 'map' ? (
          <div
            style={{
              position: 'relative',
              height: '560px',
              borderRadius: '16px',
              overflow: 'hidden',
              border: `1px solid ${borderCard}`,
              boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {/* Quick legend on top left */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                background: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,24,0.9)',
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: textPrimary,
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                backdropFilter: 'blur(4px)'
              }}
            >
              📍 לחץ על סיכה במפה לפתיחת Waze, WhatsApp וטלפון
            </div>
          </div>
        ) : (
          /* LIST VIEW */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {filteredPlaces.map((place) => {
              const color = getCategoryColor(place.category);
              const emoji = getCategoryEmoji(place.category);

              return (
                <div
                  key={place.id}
                  style={{
                    background: bgCard,
                    border: `1px solid ${borderCard}`,
                    borderRadius: '14px',
                    padding: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.02)' : 'none'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: `${color}20`,
                          color: color
                        }}
                      >
                        {emoji} {place.categoryName}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: textSecondary }}>
                        📍 {place.settlement}
                      </span>
                    </div>

                    <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.05rem', fontWeight: 800, color: textPrimary }}>
                      {place.name}
                    </h3>
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.82rem', color: textSecondary, lineHeight: 1.45 }}>
                      {place.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: `1px solid ${borderCard}`, paddingTop: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      <a
                        href={place.wazeUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: '#33CCFF',
                          color: '#000000',
                          padding: '0.45rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px'
                        }}
                      >
                        <Navigation size={13} />
                        <span>נווט ב-Waze</span>
                      </a>

                      {place.whatsapp ? (
                        <a
                          href={`https://wa.me/${place.whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: '#25D366',
                            color: '#FFFFFF',
                            padding: '0.45rem',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <MessageSquare size={13} />
                          <span>WhatsApp</span>
                        </a>
                      ) : place.phone ? (
                        <a
                          href={`tel:${place.phone}`}
                          style={{
                            background: bgSubtle,
                            color: textPrimary,
                            border: `1px solid ${borderCard}`,
                            padding: '0.45rem',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Phone size={13} />
                          <span>חייג עכשיו</span>
                        </a>
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          כניסה חופשית
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SELECTED PLACE DETAILS DRAWER / CARD */}
        {selectedPlace && (
          <div
            style={{
              background: bgCard,
              border: `1px solid ${borderCard}`,
              borderRadius: '16px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '3px 9px',
                    borderRadius: '6px',
                    background: `${getCategoryColor(selectedPlace.category)}20`,
                    color: getCategoryColor(selectedPlace.category)
                  }}
                >
                  {getCategoryEmoji(selectedPlace.category)} {selectedPlace.categoryName}
                </span>

                <button
                  onClick={() => setSelectedPlace(null)}
                  style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', fontWeight: 800, color: textPrimary }}>
                {selectedPlace.name}
              </h3>

              <div style={{ fontSize: '0.8rem', color: textSecondary, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin size={14} color="#3B82F6" />
                <span>יישוב: <strong>{selectedPlace.settlement}</strong></span>
              </div>

              <p style={{ fontSize: '0.88rem', color: textPrimary, lineHeight: 1.55, margin: '0 0 1rem 0' }}>
                {selectedPlace.description}
              </p>

              {selectedPlace.phone && (
                <div style={{ background: bgSubtle, borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
                  <div style={{ color: textSecondary, marginBottom: '2px' }}>טלפון ישיר / הזמנות:</div>
                  <a href={`tel:${selectedPlace.phone}`} style={{ color: textPrimary, fontWeight: 800, textDecoration: 'none', fontSize: '0.95rem' }}>
                    📞 {selectedPlace.phone}
                  </a>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              <a
                href={selectedPlace.wazeUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'linear-gradient(135deg, #33CCFF, #0099FF)',
                  color: '#FFFFFF',
                  padding: '0.7rem',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(0, 153, 255, 0.3)'
                }}
              >
                <Navigation size={18} />
                <span>נווט עכשיו עם Waze 🚙</span>
              </a>

              {selectedPlace.whatsapp && (
                <a
                  href={`https://wa.me/${selectedPlace.whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    color: '#FFFFFF',
                    padding: '0.7rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  <MessageSquare size={18} />
                  <span>פנייה ישירה ב-WhatsApp 💬</span>
                </a>
              )}

              <a
                href={`https://maps.google.com/?q=${selectedPlace.lat},${selectedPlace.lng}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: bgSubtle,
                  color: textSecondary,
                  border: `1px solid ${borderCard}`,
                  padding: '0.55rem',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <ExternalLink size={14} />
                <span>פתח ב-Google Maps</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
