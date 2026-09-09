/** Area guide for the guest app — real places around מושב רמות, הכנרת ורמת הגולן. */

export const AREA_GUIDE_SOURCE = 'רמות · סובב כנרת ורמת הגולן';

function waze(query) {
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}

function wazeLl(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

function pic(file) {
  return `/guide/${file}`;
}

export function mapsUrlFromWaze(wazeUrl) {
  try {
    const params = new URL(wazeUrl).searchParams;
    const ll = params.get('ll');
    if (ll) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}&travelmode=driving`;
    }
    const query = params.get('q');
    if (!query) return wazeUrl;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`;
  } catch (_) {
    return wazeUrl;
  }
}

const TONE_PHOTO = {
  water: pic('spring.jpg'),
  beach: pic('beach.jpg'),
  view: pic('trail.jpg'),
  stone: pic('ruins.jpg'),
  meat: pic('steak.jpg'),
  fish: pic('fish.jpg'),
  beer: pic('beer.jpg'),
  wine: pic('wine.jpg'),
  shop: pic('super.jpg'),
  spa: pic('spa.jpg')
};

/** Photo above every guest card. Uses /guide/places when we have a dedicated shot. */
export function placePhoto(place) {
  return place?.photo || TONE_PHOTO[place?.tone] || pic('trail.jpg');
}

/** Travel-time groups: רמות vs גבעת יואב + נאות גולן. Demo (נורית) stays on ramot. */
export const GUIDE_CLUSTER = {
  ramot: { id: 'ramot', source: 'רמות · סובב כנרת ורמת הגולן' },
  givat: { id: 'givat', source: 'גבעת יואב ונאות גולן · סובב כנרת ורמת הגולן' }
};

export function guideClusterForUnit(unitId) {
  const id = String(unitId || '');
  if (/^hill-/.test(id) || /^dome-/.test(id) || id.startsWith('mialis') || id.startsWith('suite-')) {
    return 'givat';
  }
  if (id === 'k826' || id === 'k827') return 'givat';
  return 'ramot';
}

export function areaGuideSource(cluster = 'ramot') {
  return (GUIDE_CLUSTER[cluster] || GUIDE_CLUSTER.ramot).source;
}

/**
 * Approx drive minutes from each cluster. 0 = in the same village / area.
 * `pickup` = they collect you. Ramot numbers match the old static labels.
 */
const DRIVE = {
  trail_majrase: { ramot: 10, givat: 22 },
  trail_kanaf: { ramot: 10, givat: 5 },
  trail_kursi: { ramot: 10, givat: 15 },
  trail_susita: { ramot: 12, givat: 6 },
  trail_ofir: { ramot: 10, givat: 15 },
  trail_gamla: { ramot: 20, givat: 18 },
  trail_meshushim: { ramot: 25, givat: 22 },
  trail_zavitan: { ramot: 25, givat: 20 },
  trail_elal: { ramot: 25, givat: 8 },
  trail_keshatot: { ramot: 15, givat: 12 },
  trail_kinar: { ramot: 10, givat: 16 },
  trail_gofra: { ramot: 12, givat: 18 },
  trail_ein_shoko: { ramot: 15, givat: 12 },
  trail_ein_pik: { ramot: 20, givat: 10 },
  trail_eden: { ramot: 20, givat: 12 },
  food_moshbutz: { ramot: 0, givat: 15 },
  food_marinado: { ramot: 10, givat: 14 },
  food_fish: { ramot: 12, givat: 15 },
  food_bazelet: { ramot: 25, givat: 20 },
  food_moize: { ramot: 0, givat: 15 },
  food_bakata: { ramot: 0, givat: 15 },
  food_thai: { ramot: 0, givat: 15 },
  food_ohad: { ramot: 0, givat: 15 },
  food_breakfast_club: { ramot: 0, givat: 15 },
  food_hamitbach: { ramot: 0 },
  food_fullbar: { ramot: 15, givat: 0 },
  food_moulan: { ramot: 15, givat: 0 },
  food_amici: { ramot: 17, givat: 2 },
  food_nahtom: { ramot: 17, givat: 2 },
  food_tzitzus: { ramot: 17, givat: 2 },
  food_provence: { ramot: 17, givat: 2 },
  food_mazzeti: { ramot: 17, givat: 2 },
  shop_ramot_super: { ramot: 0, givat: 15 },
  shop_marinado: { ramot: 10, givat: 14 },
  shop_golan_winery: { ramot: 25, givat: 20 },
  shop_katzrin_mall: { ramot: 25, givat: 20 },
  shop_ramot_gas: { ramot: 5, givat: 15 },
  shop_moshbutz_butcher: { ramot: 0, givat: 15 },
  shop_nof_golan: { ramot: 17, givat: 2 },
  shop_bnei_yehuda_super: { ramot: 17, givat: 2 },
  shop_alon_haon: { ramot: 15, givat: 12 },
  shop_givat_gas: { ramot: 15, givat: 0 },
  attr_abukayak: { ramot: 20, givat: 25 },
  attr_hamat_gader: { ramot: 45, givat: 35 },
  attr_eingev_port: { ramot: 12, givat: 15 },
  attr_katzrin_park: { ramot: 25, givat: 20 },
  attr_golan_winery: { ramot: 25, givat: 20 },
  attr_arthur_kayak: { ramot: 35, givat: 28 },
  attr_lolart: { ramot: 0, givat: 15 },
  attr_ein_tana: { ramot: 15, givat: 0 },
  attr_terra_nova: { ramot: 12, givat: 5 },
  attr_jeeps: { ramot: 'pickup', givat: 'pickup' },
  attr_shulchan: { ramot: 12, givat: 5 }
};

function formatDrive(mins, cluster) {
  if (mins === 'pickup') return 'איסוף באזור';
  if (typeof mins !== 'number') return '';
  if (mins <= 0) return cluster === 'givat' ? 'באזור' : 'בתוך המושב';
  return `כ־${mins} דק' נסיעה`;
}

export function placeDistance(place, cluster = 'ramot') {
  const key = cluster === 'givat' ? 'givat' : 'ramot';
  const mins = DRIVE[place?.id]?.[key];
  const label = formatDrive(mins, key);
  if (label) return label;
  return place?.dist || '';
}

/** Places with `clusters` only appear for those villages. No field = show everywhere. */
export function placesForCluster(places, cluster = 'ramot') {
  const key = cluster === 'givat' ? 'givat' : 'ramot';
  return (places || []).filter((place) => {
    if (!Array.isArray(place.clusters) || !place.clusters.length) return true;
    return place.clusters.includes(key);
  });
}

/**
 * Every place shares one shape so a single card renders all tabs.
 * `photo` is a `/guide/*.jpg` path shown above the card — reuse the closest
 * existing file if a dedicated shot is not ready yet. Never invent phones.
 */
export const TRAILS = [
  {
    id: 'trail_majrase',
    title: "שמורת מג'רסה (הבטיחה)",
    kind: 'מסלול מים רטוב',
    dist: "כ־10 דק' נסיעה",
    hours: 'קיץ 08:00–17:00 · ו׳ וערבי חג עד 16:00 · כניסה עד שעה לפני סגירה',
    price: 'בתשלום · רשות הטבע והגנים',
    desc: 'הליכה במים בנחל דליות, עם מסלול יבש, שירותים ומלתחות.',
    phone: '04-679-3410',
    wazeUrl: waze("שמורת מג'רסה"),
    tone: 'water',
    photo: pic('places/majrase-baticha-spring.jpg')
  },
  {
    id: 'trail_kanaf',
    title: 'עין כנף',
    kind: 'בריכות מעיין ותצפית',
    dist: "כ־10 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ באור יום',
    price: 'ללא תשלום',
    desc: 'שלוש בריכות מעיין עם תצפית לגולן ולכנרת. קל גם לילדים.',
    wazeUrl: waze('עין כנף'),
    tone: 'water',
    photo: pic('places/ein-kanaf-spring.jpg')
  },
  {
    id: 'trail_kursi',
    title: 'גן לאומי כורסי',
    kind: 'מנזר ביזנטי ופסיפסים',
    dist: "כ־10 דק' נסיעה",
    hours: 'קיץ 08:00–17:00 · ו׳ וערבי חג עד 16:00 · כניסה עד שעה לפני סגירה',
    price: 'בתשלום · רשות הטבע והגנים',
    desc: 'מנזר ביזנטי עם פסיפסים ושבילים מוצלים. ביקור קצר ונוח.',
    wazeUrl: waze('גן לאומי כורסי'),
    tone: 'stone',
    photo: pic('places/kursi-national-park-ruins.jpg')
  },
  {
    id: 'trail_susita',
    title: 'הר סוסיתא (היפוס)',
    kind: 'עתיקות ותצפית לכנרת',
    dist: "כ־12 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ בבוקר או לפנות ערב',
    price: 'ללא תשלום',
    desc: 'עיר עתיקה על הר מעל הכנרת. יפה במיוחד בשקיעה.',
    wazeUrl: waze('הר סוסיתא'),
    tone: 'stone',
    photo: pic('places/sussita-hippos-ruins.jpg')
  },
  {
    id: 'trail_ofir',
    title: 'מצפה אופיר ושביל הבונקרים',
    kind: 'תצפית ושביל מצוק',
    dist: "כ־10 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ בשקיעה',
    price: 'ללא תשלום',
    desc: 'תצפית לכנרת ושביל קצר בין בונקרים. מרשים בשקיעה.',
    wazeUrl: waze('מצפה אופיר'),
    tone: 'view',
    photo: pic('places/mizpe-ofir-bunkers-trail.jpg')
  },
  {
    id: 'trail_gamla',
    title: 'שמורת טבע גמלא',
    kind: 'מפל, נשרים ועתיקות',
    dist: "כ־20 דק' נסיעה",
    hours: 'קיץ 08:00–17:00 · ו׳ וערבי חג עד 16:00 · כניסה עד שעה לפני סגירה',
    price: 'בתשלום · רשות הטבע והגנים',
    desc: 'תצפית נשרים, המפל הגבוה בארץ וחורבות העיר העתיקה.',
    wazeUrl: waze('שמורת טבע גמלא'),
    tone: 'view',
    photo: pic('places/gamla-nature-reserve-trail.jpg')
  },
  {
    id: 'trail_meshushim',
    title: 'בריכת המשושים',
    kind: 'בריכה בין עמודי בזלת',
    dist: "כ־25 דק' נסיעה",
    hours: 'נפתח 08:00 · כניסה אחרונה 14:30 בקיץ, 13:30 בחורף · יציאה עד 17:00',
    price: 'בתשלום · הרשמה מראש',
    desc: 'בריכת בזלת מפורסמת. ירידה תלולה, לשחיינים בלבד.',
    wazeUrl: waze('חניון נחל המשושים'),
    tone: 'water',
    photo: pic('places/meshushim-pool-spring.jpg')
  },
  {
    id: 'trail_zavitan',
    title: 'נחל זוויתן · שמורת יהודיה',
    kind: 'קניון בזלת ובריכות טורקיז',
    dist: "כ־25 דק' נסיעה",
    hours: 'נפתח 08:00 · כניסה אחרונה 14:30 בקיץ, 13:30 בחורף · יציאה עד 17:00',
    price: 'בתשלום · הרשמה מראש',
    desc: 'בריכות טורקיז בקניון בזלת. כניסה אחרונה מוקדמת.',
    wazeUrl: waze('חניון יהודיה'),
    tone: 'water',
    photo: pic('places/zavitan-yehudiya-spring.jpg')
  },
  {
    id: 'trail_elal',
    title: 'נחל אל על · המפל השחור והלבן',
    kind: 'קניון ומפלים',
    dist: "כ־25 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ באור יום, במיוחד באביב',
    price: 'ללא תשלום',
    desc: 'שני מפלים בקניון — השחור והלבן. יפה באביב.',
    wazeUrl: waze('נחל אל על'),
    tone: 'water',
    photo: pic('places/al-al-black-white-falls-spring.jpg')
  },
  {
    id: 'trail_keshatot',
    title: 'עין קשתות (אום אל־קנאטר)',
    kind: 'ארכאולוגיה ומעיין',
    dist: "כ־15 דק' נסיעה",
    hours: 'א׳–ה׳ 09:00–16:00 · ו׳ 09:00–14:00 · מומלץ לבדוק לפני',
    price: 'בתשלום',
    desc: 'בית כנסת עתיק ומעיין מתוך קשתות אבן. שבילים נוחים.',
    wazeUrl: waze('עין קשתות'),
    tone: 'stone',
    photo: pic('places/um-el-kanatir-ein-keshatot-ruins.jpg')
  },
  {
    id: 'trail_kinar',
    title: 'חוף כינר',
    kind: 'חוף רחצה מוכרז · רחצה נפרדת',
    dist: "כ־10 דק' נסיעה",
    hours: 'רחצה 09:00–17:00 · גישה לחוף בכל שעה',
    price: 'כניסה חופשית · חניה בתשלום',
    desc: 'החוף הקרוב לבקתות, רחצה נפרדת, מלתחות ושמשיות.',
    wazeUrl: waze('חוף כינר'),
    tone: 'beach',
    photo: pic('places/hof-kinar-beach.jpg')
  },
  {
    id: 'trail_gofra',
    title: 'חוף גופרה',
    kind: 'חוף רחצה מוכרז',
    dist: "כ־12 דק' נסיעה",
    hours: 'רחצה 09:00–17:00 · גישה לחוף בכל שעה',
    price: 'כניסה חופשית · חניה בתשלום',
    desc: 'חוף רחב עם מזנון, מקלחות ותאורה. אפשר כלי שייט.',
    wazeUrl: waze('חוף גופרה'),
    tone: 'beach',
    photo: pic('places/hof-gofra-beach.jpg')
  },
  {
    id: 'trail_ein_shoko',
    title: 'עין שוקו',
    kind: 'מעיין קרוב',
    dist: "כ־15 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ באור יום',
    price: 'ללא תשלום',
    desc: 'מעיין קרוב וקל. עצירה נחמדה אחרי צ׳ק-אין.',
    wazeUrl: waze('עין שוקו'),
    tone: 'water',
    photo: pic('places/ein-shoko-spring.jpg')
  },
  {
    id: 'trail_ein_pik',
    title: 'עין פיק',
    kind: 'מעיין ובריכה קטנה',
    dist: "כ־20 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ באור יום',
    price: 'ללא תשלום',
    desc: 'מעיין שקט ליד רמות והגולן הדרומי.',
    wazeUrl: waze('עין פיק'),
    tone: 'water',
    photo: pic('places/ein-pik-spring.jpg')
  },
  {
    id: 'trail_eden',
    title: 'מעיינות עדן',
    kind: 'מעיינות וצל',
    dist: "כ־20 דק' נסיעה",
    hours: 'פתוח תמיד · מומלץ באור יום',
    price: 'ללא תשלום',
    desc: 'פינת מים מוצלת. כדאי לבדוק זרימה בקיץ.',
    wazeUrl: waze('מעיינות עדן רמת הגולן'),
    tone: 'water',
    photo: pic('places/eden-springs-spring.jpg')
  }
];

export const RESTAURANTS = [
  {
    id: 'food_moshbutz',
    title: 'מושבוץ · רמות',
    kind: 'בשרים ומטבח מקומי · Farm to Table',
    dist: 'בתוך המושב',
    hours: "א׳–ד׳ 13:00–21:00 · ה׳–ש׳ 12:00–22:00",
    desc: 'בשר מהמשק, ירקות מהגינה. השכן הקרוב — כדאי להזמין.',
    phone: '04-679-5095',
    wazeUrl: waze('מושבוץ רמות'),
    tone: 'meat',
    photo: pic('places/moshbutz-ramot-steak.jpg')
  },
  {
    id: 'food_marinado',
    title: 'מרינדו · עין גב',
    kind: 'מסעדת בשרים, קצביה ומעדנייה',
    dist: "כ־10 דק' נסיעה",
    hours: 'ב׳–ש׳ מ־12:00 · א׳ בדרך כלל סגור',
    desc: 'גריל בעין גב, עם קצביה ומעדנייה למי שצולה בבקתה.',
    phone: '04-665-8555',
    wazeUrl: waze('מרינדו עין גב'),
    tone: 'meat',
    photo: pic('places/marindo-ein-gev-steak.jpg')
  },
  {
    id: 'food_fish',
    title: 'מסעדת הדגים · נמל עין גב',
    kind: 'דגי כנרת ומטבח חלבי',
    dist: "כ־12 דק' נסיעה",
    hours: 'פתוח כל השבוע מ־12:00 · ו׳–ש׳ עד 22:00',
    desc: 'מרפסת על המים ואמנון כנרתי. טובה גם עם ילדים.',
    phone: '04-665-8136',
    wazeUrl: waze('מסעדת הדגים עין גב'),
    tone: 'fish',
    photo: pic('fish.jpg')
  },
  {
    id: 'food_bazelet',
    title: 'מבשלת בזלת · קצרין',
    kind: 'בירת בוטיק ואוכל קל',
    dist: "כ־25 דק' נסיעה",
    hours: 'א׳–ה׳ 09:00–17:00 · ו׳ 09:00–12:00 · מסעדה א׳–ה׳ 12:00–22:30',
    desc: 'מבשלה מקומית, טעימות בירה ואוכל בר אחרי טיול.',
    phone: '04-696-1111',
    wazeUrl: waze('מבשלת בזלת קצרין'),
    tone: 'beer',
    photo: pic('beer.jpg')
  },
  {
    id: 'food_moize',
    title: 'קפה מוייז · לול ארט',
    kind: 'עגלת קפה כשרה מהדרין',
    dist: 'בתוך המושב · רמות',
    hours: 'א׳–ו׳ 09:00–14:00 · שבת סגור',
    desc: 'כריכים, מאפים ונוף במתחם לול ארט. בוקר קצר לפני טיול.',
    wazeUrl: waze('לול ארט רמות'),
    tone: 'wine',
    photo: pic('cafe.jpg')
  },
  {
    id: 'food_bakata',
    title: 'מסעדת הבקתה · רמות',
    kind: 'בשרים כשרה',
    dist: 'בתוך המושב',
    hours: 'א׳–ה׳ 13:00–22:00 · ו׳ לעיתים 11:00–15:00 · ש׳ סגור · לוודא',
    desc: 'מסעדת בשרים במושב. כדאי לוודא שישי לפני שמגיעים.',
    phone: '04-679-4016',
    wazeUrl: waze('מסעדת הבקתה רמות'),
    tone: 'meat',
    photo: pic('places/habakta-ramot-steak.jpg')
  },
  {
    id: 'food_thai',
    title: 'טאי מרקט · רמות',
    kind: 'תאילנדי · ישיבה ו־TA',
    dist: 'בתוך המושב',
    hours: 'שישי–שבת בלבד · ו׳ ~16:00–21:00 · ש׳ 12:00–17:00',
    desc: 'תאילנדי מקומי, אחת האפשרויות בשבת. לוודא לפני.',
    phone: '053-731-5125',
    wazeUrl: waze('טאי מרקט רמות'),
    tone: 'fish',
    photo: pic('thai.jpg')
  },
  {
    id: 'food_ohad',
    title: 'אוהד ארז · מטבח איטלקי',
    kind: 'איטלקי כפרי · גם TA',
    dist: 'בתוך המושב',
    hours: 'א׳–ה׳ 12:00–21:00 · ו׳ 12:00–16:00 · ש׳ סגור',
    desc: 'מטבח איטלקי כפרי ברמות, גם לאיסוף לבקתה.',
    phone: '054-459-9537',
    wazeUrl: waze('אוהד ארז רמות'),
    tone: 'wine',
    photo: pic('pasta.jpg')
  },
  {
    id: 'food_breakfast_club',
    title: 'מועדון ארוחת הבוקר · רמות',
    kind: 'ארוחת בוקר כשרה',
    dist: 'בתוך המושב',
    hours: 'א׳–ו׳ 08:00–12:00',
    desc: 'ארוחת בוקר במקום. משלוח: עליזה, מעיין או יעל.',
    wazeUrl: waze('מועדון ארוחת הבוקר רמות'),
    tone: 'wine',
    photo: pic('places/breakfast-club-ramot-breakfast.jpg')
  },
  {
    id: 'food_hamitbach',
    title: 'המטבח · רמות',
    kind: 'משלוחי בוקר ופיצה · רמות בלבד',
    dist: 'משלוח במושב בלבד',
    hours: 'ארוחת בוקר כל השבוע · לתאם עד ערב לפני · פיצה ג׳–ה׳ 17:00–20:00 ובסופ״ש בערב',
    desc: 'משלוח עד הצימר במושב רמות בלבד (גם איסוף עצמי). ארוחות בוקר מפנקות כל השבוע — לתאם עד הערב שלפני. פיצות משפחתיות בעבודת יד בערבים: ג׳–ה׳ 17:00–20:00, ובסופי שבוע לפי הפרסום שלהם.',
    phone: '050-530-4972',
    wazeUrl: waze('המטבח רמות'),
    tone: 'wine',
    photo: pic('places/breakfast-club-ramot-breakfast.jpg'),
    clusters: ['ramot']
  },
  {
    id: 'food_fullbar',
    title: 'Full בר · גבעת יואב',
    kind: 'מסעדה בשרית ובר ערב',
    dist: "כ־15 דק' · גבעת יואב",
    hours: 'לוודא באותו יום · כשר רבנות מקומית',
    desc: 'מסעדה בשרית ובר ערב בגבעת יואב. קרוב למיאליס.',
    phone: '055-992-3125',
    wazeUrl: waze('Full בר גבעת יואב'),
    tone: 'beer',
    photo: pic('places/full-bar-givat-yoav-steak.jpg')
  },
  {
    id: 'food_moulan',
    title: 'מולאן פטיסרי · באיי גאלי',
    kind: 'בית קפה וקונדיטוריה',
    dist: "כ־15 דק' · גבעת יואב",
    hours: 'מדווח א׳–ש׳ שעות רחבות · לוודא',
    desc: 'ארוחות בוקר, קינוחים וקפה בגבעת יואב.',
    phone: '052-242-6808',
    wazeUrl: waze('מולאן פטיסרי גבעת יואב'),
    tone: 'wine',
    photo: pic('places/moulin-patisserie-bay-galilee-pastry.jpg')
  },
  {
    id: 'food_amici',
    title: "פיצה אמיצ'י · בני יהודה",
    kind: 'פיצה · גם משלוח · גם שבת',
    dist: "כ־2 דק' · קניון נוף גולן",
    hours: 'א׳–ה׳ 14:00–22:30 · ש׳ 18:00–22:30',
    desc: 'פיצה בקניון נוף גולן, גם בשבת.',
    phone: '050-903-0748',
    wazeUrl: waze("פיצה אמיצ'י בני יהודה"),
    tone: 'wine',
    photo: pic('pizza.jpg')
  },
  {
    id: 'food_nahtom',
    title: 'הנחתום · בני יהודה',
    kind: 'פיצה ומאפייה',
    dist: "כ־2 דק' · קניון נוף גולן",
    hours: 'ב׳–ה׳ 09:00–21:00 · ו׳ 08:00–14:00',
    desc: 'מאפייה ופיצה בקניון נוף גולן.',
    phone: '04-660-1222',
    wazeUrl: waze('הנחתום בני יהודה'),
    tone: 'wine',
    photo: pic('bakery.jpg')
  },
  {
    id: 'food_tzitzus',
    title: 'ציצוס · בני יהודה',
    kind: 'פיצוציה · גם שבת אחה״צ',
    dist: "כ־2 דק' · קניון נוף גולן",
    hours: 'א׳–ה׳ 10:00–14:00 ו־16:00–22:00 · ש׳ 16:00–22:30',
    desc: 'פיצוצים וחטיפים, פתוח גם בשבת אחר הצהריים.',
    phone: '052-570-6733',
    wazeUrl: waze('ציצוס בני יהודה'),
    tone: 'shop',
    photo: pic('places/tzitzus-bnei-yehuda-super.jpg')
  },
  {
    id: 'food_provence',
    title: 'פרובאנס בגולן',
    kind: 'קייטרינג חלבי · שישי וערבי חג',
    dist: "כ־2 דק' · בני יהודה",
    hours: 'ו׳ וערבי חג בלבד 08:30–13:30',
    desc: 'קייטרינג חלבי לשישי וערבי חג.',
    phone: '050-212-9912',
    wazeUrl: waze('פרובאנס בגולן בני יהודה'),
    tone: 'wine',
    photo: pic('places/provence-golan-pastry.jpg')
  },
  {
    id: 'food_mazzeti',
    title: 'מזטי · בני יהודה',
    kind: 'מעדנייה וכריכים',
    dist: "כ־2 דק' · ליד אמיצ'י",
    hours: 'לוודא שעות באותו יום',
    desc: 'מעדנייה וכריכים בקניון, ליד אמיצ׳י.',
    wazeUrl: waze('מזטי בני יהודה'),
    tone: 'shop',
    photo: pic('places/mezati-bnei-yehuda-breakfast.jpg')
  }
];

export const SHOPS = [
  {
    id: 'shop_ramot_super',
    title: 'סופרמרקט וגלריה · רמות',
    kind: 'סופר, פארם ומוצרי בסיס',
    dist: 'בתוך המושב',
    hours: 'א׳–ה׳ 07:30–20:00 · ו׳ 07:30–17:00 · שבת 09:00–14:00',
    desc: 'הסופר של המושב, דקה מהבקתה. להשלמות בוקר ופחמים.',
    phone: '04-673-1408',
    mapsUrl: 'https://maps.app.goo.gl/LRgGDQ84S35eznUJ8?g_st=ac',
    wazeUrl: wazeLl(32.854173, 35.667415),
    tone: 'shop',
    photo: pic('places/supermarket-gallery-ramot-super.jpg')
  },
  {
    id: 'shop_marinado',
    title: 'קצביית מרינדו · עין גב',
    kind: 'בשר, יין ומעדני משק',
    dist: "כ־10 דק' נסיעה",
    hours: 'ב׳–ש׳ מ־10:00',
    desc: 'נתחים למנגל, יינות ותוספות ממסעדת מרינדו.',
    phone: '04-665-8555',
    wazeUrl: waze('מרינדו עין גב'),
    tone: 'meat',
    photo: pic('places/marindo-butcher-ein-gev-steak.jpg')
  },
  {
    id: 'shop_golan_winery',
    title: 'יקבי רמת הגולן · חנות היקב',
    kind: 'יין, מתנות וטעימות',
    dist: "כ־25 דק' נסיעה",
    hours: 'א׳–ה׳ 08:30–16:30 · ו׳ 08:30–13:30',
    desc: 'חנות היקב בקצרין — יינות, טעימות ומארזים.',
    phone: '04-696-8435',
    wazeUrl: waze('יקב רמת הגולן קצרין'),
    tone: 'wine',
    photo: pic('places/golan-heights-winery-shop-wine.jpg')
  },
  {
    id: 'shop_katzrin_mall',
    title: 'קניון לב קצרין',
    kind: 'סופר, פארם, בגדים וקפה',
    dist: "כ־25 דק' נסיעה",
    hours: 'א׳–ה׳ בדרך כלל 09:00–21:00 · ו׳ עד ~14:00 · שבת סגור',
    desc: 'הקניון הגדול באזור: סופר, קפה וחנויות.',
    wazeUrl: waze('קניון לב קצרין'),
    tone: 'shop',
    photo: pic('places/lev-katzrin-mall.jpg')
  },
  {
    id: 'shop_ramot_gas',
    title: 'תחנת דלק · צומת רמות',
    kind: 'דלק · קיוסק קטן',
    dist: "כ־5 דק' · צומת רמות",
    hours: 'דלק מדווח 24/7 · החנות לא תמיד פתוחה כל הלילה',
    desc: 'התחנה הקרובה. קיוסק קטן, לא תמיד חנות מלאה.',
    phone: '04-673-1828',
    wazeUrl: waze('תחנת דלק צומת רמות'),
    tone: 'shop',
    photo: pic('places/ramot-junction-gas.jpg')
  },
  {
    id: 'shop_moshbutz_butcher',
    title: 'קצביית מושבוץ · רמות',
    kind: 'קצבייה פרימיום למנגל',
    dist: 'בתוך המושב',
    hours: 'לפי שעות המסעדה · פתוח שבת לפי מדריכים',
    desc: 'קניות בשר למנגל בבקתה, מאותו משק של המסעדה.',
    phone: '04-679-5095',
    wazeUrl: waze('מושבוץ רמות'),
    tone: 'meat',
    photo: pic('places/moshbutz-butcher-ramot-steak.jpg')
  },
  {
    id: 'shop_nof_golan',
    title: 'קניון נוף גולן · בני יהודה',
    kind: 'קניון · סופר, פיצה, שירותים',
    dist: "כ־15 דק' נסיעה",
    hours: 'א׳–ה׳ 09:00–21:00 · ו׳ 09:00–15:00 · שבת סגור',
    desc: 'קניון קרוב: סופר, אמיצ׳י, הנחתום וציצוס.',
    wazeUrl: waze('קניון נוף גולן בני יהודה'),
    tone: 'shop',
    photo: pic('places/nof-golan-mall-bnei-yehuda-mall.jpg')
  },
  {
    id: 'shop_bnei_yehuda_super',
    title: 'סופר מרקט · קניון נוף גולן',
    kind: 'סופר בבני יהודה',
    dist: "כ־15 דק' נסיעה",
    hours: 'א׳–ה׳ 07:00–20:00 · ו׳ 07:00–16:00',
    desc: 'הסופר שבקניון, כשצריך יותר מברמות.',
    phone: '04-676-3794',
    wazeUrl: waze('קניון נוף גולן בני יהודה'),
    tone: 'shop',
    photo: pic('places/nof-golan-supermarket-super.jpg')
  },
  {
    id: 'shop_alon_haon',
    title: 'דור אלון האון · אלונית',
    kind: 'דלק + מיני-סופר 24/7 כולל שבת',
    dist: "כ־15 דק' · כביש 92",
    hours: '24/7 כולל שבת',
    desc: 'דלק ומיני-סופר 24/7, כולל שבת.',
    phone: '054-543-8043',
    wazeUrl: waze('דור אלון האון אלונית'),
    tone: 'shop',
    photo: pic('places/dor-alon-haon-alonit-gas.jpg')
  },
  {
    id: 'shop_givat_gas',
    title: 'תחנת דלק · גבעת יואב',
    kind: 'דלק · בלי חנות גדולה',
    dist: "כ־15 דק' · גבעת יואב",
    hours: 'לוודא באותו יום',
    desc: 'תחנה קרובה למיאליס. לרוב בלי חנות גדולה.',
    wazeUrl: waze('תחנת דלק גבעת יואב'),
    tone: 'shop',
    photo: pic('places/givat-yoav-gas.jpg')
  }
];

/** Paid attractions nearby — navigation and phone only, no in-app purchase. */
export const ATTRACTIONS = [
  {
    id: 'attr_abukayak',
    title: 'אבוקייק · קיאקים בפארק הירדן',
    kind: 'שייט משפחתי בירדן',
    dist: "כ־20 דק' נסיעה",
    hours: 'מרץ–אוקטובר · א׳–ה׳ 09:00–17:00 · סגור בשבת',
    desc: 'שייט משפחתי של כשעה וחצי בפארק הירדן, עם הסעה חזרה.',
    phone: '050-288-8963',
    wazeUrl: waze('אבוקייק פארק הירדן'),
    tone: 'water',
    photo: pic('places/abu-kayak-jordan-park-kayak.jpg')
  },
  {
    id: 'attr_hamat_gader',
    title: 'חמת גדר · פארק המעיינות',
    kind: 'מעיינות חמים, ספא וחוות תנינים',
    dist: "כ־45 דק' נסיעה",
    hours: 'ב׳, ד׳–ו׳ 09:00–22:00 · ג׳ ושבת 09:00–17:00',
    desc: 'מעיינות חמים, ג׳קוזי וחוות תנינים. יום שלם למשפחה.',
    phone: '*6393',
    wazeUrl: waze('חמת גדר'),
    tone: 'spa',
    photo: pic('spa.jpg')
  },
  {
    id: 'attr_eingev_port',
    title: 'נמל עין גב · שייט בכנרת',
    kind: 'הפלגות וכפר נופש',
    dist: "כ־12 דק' נסיעה",
    hours: 'א׳–ש׳ 08:00–18:00 · הפלגות בתיאום מראש',
    desc: 'הפלגות בכנרת מנמל עין גב. כדאי לתאם בעונה.',
    phone: '04-665-9800',
    wazeUrl: waze('נמל עין גב'),
    tone: 'beach',
    photo: pic('places/ein-gev-port-sailing-beach.jpg')
  },
  {
    id: 'attr_katzrin_park',
    title: 'פארק קצרין העתיקה',
    kind: 'כפר תלמודי משוחזר',
    dist: "כ־25 דק' נסיעה",
    hours: 'א׳–ה׳ 09:00–16:00 · ו׳ 09:00–14:00 · שבת סגור',
    desc: 'כפר תלמודי משוחזר. ביקור של שעה וחצי, טוב עם ילדים.',
    phone: '04-696-2412',
    wazeUrl: waze('פארק קצרין העתיקה'),
    tone: 'stone',
    photo: pic('places/ancient-katzrin-park-ruins.jpg')
  },
  {
    id: 'attr_golan_winery',
    title: 'יקב רמת הגולן · מרכז מבקרים',
    kind: 'סיור יין וטעימות',
    dist: "כ־25 דק' נסיעה",
    hours: 'א׳–ה׳ 08:30–16:30 · ו׳ 08:30–13:30 · בתיאום מראש',
    desc: 'סיור של שעה עם טעימת שלושה יינות. בתיאום.',
    phone: '04-696-8435',
    wazeUrl: waze('יקב רמת הגולן קצרין'),
    tone: 'wine',
    photo: pic('places/golan-heights-winery-visitor-center-wine.jpg')
  },
  {
    id: 'attr_arthur_kayak',
    title: 'ארתור קיאקים · מושבה כנרת',
    kind: 'שייט קיאקים במפגש הירדן והכנרת',
    dist: "כ־35 דק' נסיעה",
    hours: 'בהזמנה מראש · יציאות בבוקר ואחה״צ',
    desc: 'שייט של כשעתיים וחצי לחופים נסתרים. מגיל 3, בהזמנה.',
    phone: '053-366-6066',
    wazeUrl: waze('ארתור קיאקים מושבה כנרת'),
    tone: 'water',
    photo: pic('places/arthur-kayaks-moshava-kinneret-kayak.jpg')
  },
  {
    id: 'attr_lolart',
    title: 'לול ארט · רמות',
    kind: 'גלריה, סדנאות וקפה מוייז',
    dist: 'בתוך המושב',
    hours: 'לפי הגלריה וקפה מוייז · א׳–ו׳ בבוקר',
    desc: 'גלריה וסדנאות ליד הבית, עם עגלת הקפה של מוייז באותו מתחם.',
    wazeUrl: waze('לול ארט רמות'),
    tone: 'stone',
    photo: pic('gallery.jpg')
  },
  {
    id: 'attr_ein_tana',
    title: 'יקב עין תאנה · גבעת יואב',
    kind: 'יקב בוטיק · בתיאום',
    dist: "כ־15 דק' · גבעת יואב",
    hours: 'בתיאום מראש',
    desc: 'יקב קטן בגבעת יואב. טעימות וביקור רק בתיאום.',
    wazeUrl: waze('יקב עין תאנה גבעת יואב'),
    tone: 'wine',
    photo: pic('places/ein-teena-winery-givat-yoav-wine.jpg')
  },
  {
    id: 'attr_terra_nova',
    title: 'יקב טרה נובה · כנף',
    kind: 'יקב קרוב',
    dist: "כ־12 דק' · כנף",
    hours: 'בתיאום מראש',
    desc: 'יקב קרוב לכנף, נוח אחרי טיול בעין כנף או בסוסיתא.',
    wazeUrl: waze('יקב טרה נובה כנף'),
    tone: 'wine',
    photo: pic('places/terra-nova-winery-kanaf-wine.jpg')
  },
  {
    id: 'attr_jeeps',
    title: 'טיולי ג׳יפים וריינג׳רים',
    kind: 'סיור שטח בגולן',
    dist: 'איסוף באזור',
    hours: 'בתיאום · איתן 052-879-9333 · גלעד 050-782-6073',
    desc: 'טיולי שטח מודרכים לקבוצה או משפחה.',
    phone: '052-879-9333',
    wazeUrl: waze('רמות גולן'),
    tone: 'view',
    photo: pic('jeep.jpg')
  },
  {
    id: 'attr_shulchan',
    title: 'שולחן האוכל · כנף',
    kind: 'סדנאות וארוחות בתיאום',
    dist: "כ־12 דק' · כנף",
    hours: 'בתיאום מראש',
    desc: 'סדנאות בישול וארוחות מודרכות בכנף.',
    phone: '052-678-8828',
    wazeUrl: waze('שולחן האוכל כנף'),
    tone: 'wine',
    photo: pic('places/shulchan-haochel-kanaf-breakfast.jpg')
  }
];

/** Invented ticketed attractions for the demo purchase flow — not real venues. On hold. */
export const TICKET_ATTRACTIONS = [
  {
    id: 'tix_water',
    title: 'פארק המים «גל כנרת»',
    type: 'פארק מים משפחתי',
    dist: '12 דקות נסיעה',
    desc: 'בריכות גלים, מגלשות ונהר עצלן. כרטיס יומי כולל כניסה לכל המתקנים.',
    adultGate: 129,
    adultSite: 99,
    childGate: 89,
    childSite: 69,
    phone: '04-670-1190',
    wazeUrl: 'https://waze.com/ul?q=Gal+Kinneret+Water+Park+Ramot&navigate=yes'
  },
  {
    id: 'tix_cable',
    title: 'רכבל התצפית «אופק רמות»',
    type: 'רכבל ותצפית',
    dist: '8 דקות נסיעה',
    desc: 'עלייה לרכבל עד מרפסת תצפית על הכנרת. הכרטיס כולל הלוך ושוב.',
    adultGate: 79,
    adultSite: 59,
    childGate: 49,
    childSite: 35,
    phone: '04-673-2288',
    wazeUrl: 'https://waze.com/ul?q=Ofek+Ramot+Cable+Car&navigate=yes'
  },
  {
    id: 'tix_sail',
    title: 'שייט שקיעה «מפרש הזהב»',
    type: 'שייט זוגי / משפחתי',
    dist: 'מרינה עין גב · 10 דקות',
    desc: 'הפלגה של שעה בשקיעה עם הסבר קצר על הכנרת. יציאות ב־17:30 וב־18:30.',
    adultGate: 159,
    adultSite: 119,
    childGate: 90,
    childSite: 70,
    phone: '04-665-3311',
    wazeUrl: 'https://waze.com/ul?q=Ein+Gev+Marina&navigate=yes'
  },
  {
    id: 'tix_farm',
    title: 'חוות האלפקות «גבעת הרוח»',
    type: 'חווה ופינת ליטוף',
    dist: '18 דקות נסיעה',
    desc: 'סיור מודרך, האכלה ופינת ליטוף. מתאים במיוחד לילדים.',
    adultGate: 75,
    adultSite: 55,
    childGate: 45,
    childSite: 32,
    phone: '04-696-4410',
    wazeUrl: 'https://waze.com/ul?q=Givat+HaRuach+Alpaca+Farm+Golan&navigate=yes'
  },
  {
    id: 'tix_choco',
    title: 'מוזיאון השוקולד «קקאו גולן»',
    type: 'סדנה וטעימות',
    dist: '22 דקות נסיעה',
    desc: 'סיור קצר, טעימות וסדנת פיסול שוקולד. ילדים מקבלים ערכת יצירה לקחת הביתה.',
    adultGate: 85,
    adultSite: 65,
    childGate: 55,
    childSite: 42,
    phone: '04-696-5520',
    wazeUrl: 'https://waze.com/ul?q=Cacao+Golan+Chocolate+Museum&navigate=yes'
  }
];
