/**
 * Canonical Room Equipment, Amenities, Linen, Housekeeping, and Inventory Standards.
 * Defined in collaboration with Operations Management for ResortOS.
 *
 * Concepts:
 * 1. REQUIRED STANDARD: What should be present in a room (Couple vs Family).
 * 2. ACTUAL INVENTORY: What has been physically verified in each room.
 * 3. SHORTAGE / PURCHASE REQUIREMENT: Difference between required and verified available.
 */

export const EQUIPMENT_STANDARDS = {
  COUPLE: 'COUPLE',
  FAMILY: 'FAMILY',
  STAFF: 'STAFF',
  OFFICE: 'OFFICE',
  NEEDS_REVIEW: 'NEEDS_REVIEW'
};

export const EQUIPMENT_STATUS = {
  UNKNOWN: 'UNKNOWN',
  VERIFIED_PRESENT: 'VERIFIED_PRESENT',
  MISSING: 'MISSING',
  DAMAGED: 'DAMAGED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  ON_REQUEST: 'ON_REQUEST'
};

export const ITEM_CATEGORIES = {
  KITCHEN: 'kitchen',
  APPLIANCES: 'appliances',
  COFFEE_TEA: 'coffee_tea',
  BEDS_LINEN: 'beds_linen',
  TOWELS: 'towels',
  BATHROOM: 'bathroom',
  CLEANING_WASTE: 'cleaning_waste',
  CLIMATE: 'climate',
  ENTERTAINMENT: 'entertainment',
  PURCHASE_LIST: 'purchase_list'
};

export const CATEGORY_LABELS_HE = {
  kitchen: 'כלי מטבח ובישול',
  appliances: 'מוצרי חשמל',
  coffee_tea: 'עמדת קפה ותה',
  beds_linen: 'מיטות, כריות ומצעים',
  towels: 'מגבות',
  bathroom: 'אמבטיה וטואלטיקה',
  cleaning_waste: 'ניקיון, פחים ואשפה',
  climate: 'מיזוג אוויר',
  entertainment: 'טלוויזיה וממיר',
  purchase_list: 'דרישות רכש'
};

/**
 * Canonical catalog of standard items with Couple and Family baselines.
 */
export const EQUIPMENT_CATALOG = {
  // Kitchen Equipment
  dinner_plates: {
    id: 'dinner_plates',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'צלחות עיקריות / גדולות',
    nameEn: 'Dinner plates',
    type: 'reusable',
    coupleQty: 2,
    familyQty: 6,
    notes: 'צלחות גדולות בלבד. אין צורך בצלחות קינוח/מנה ראשונה קטנות.'
  },
  drinking_glasses: {
    id: 'drinking_glasses',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'כוסות שתייה קרה (זכוכית)',
    nameEn: 'Drinking glasses',
    type: 'reusable',
    coupleQty: 2,
    familyQty: 6
  },
  coffee_mugs: {
    id: 'coffee_mugs',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'מאגים / ספלי קפה',
    nameEn: 'Coffee mugs',
    type: 'reusable',
    coupleQty: 2,
    familyQty: 6
  },
  wine_glasses: {
    id: 'wine_glasses',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'כוסות יין',
    nameEn: 'Wine glasses',
    type: 'reusable',
    coupleQty: 2,
    familyQty: 6
  },
  cutlery_sets: {
    id: 'cutlery_sets',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'סט סכו״ם שלם (מזלג, סכין, כף, כפית)',
    nameEn: 'Complete cutlery sets',
    type: 'reusable',
    coupleQty: 2,
    familyQty: 6,
    piecesPerSet: ['fork', 'knife', 'spoon', 'teaspoon']
  },
  small_bowls: {
    id: 'small_bowls',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'קעריות קטנות',
    nameEn: 'Small bowls',
    type: 'reusable',
    coupleQty: 0,
    familyQty: 4,
    notes: 'נדרש בבקתות משפחה בלבד'
  },
  cooking_pot: {
    id: 'cooking_pot',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'סיר בישול אחד',
    nameEn: 'Cooking pot',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  frying_pan: {
    id: 'frying_pan',
    category: ITEM_CATEGORIES.KITCHEN,
    nameHe: 'מחבת טיגון אחת',
    nameEn: 'Frying pan',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },

  // Purchase requirements (not confirmed present)
  kitchen_strainer: {
    id: 'kitchen_strainer',
    category: ITEM_CATEGORIES.PURCHASE_LIST,
    nameHe: 'מסננת מטבח',
    nameEn: 'Kitchen strainer',
    type: 'purchase_requirement',
    coupleQty: 1,
    familyQty: 1,
    quantityTbd: true,
    notes: 'דרישת רכש תפעולית - כמות מדויקת טרם נקבעה'
  },
  mixing_bowl: {
    id: 'mixing_bowl',
    category: ITEM_CATEGORIES.PURCHASE_LIST,
    nameHe: 'קערת ערבוב',
    nameEn: 'Mixing bowl',
    type: 'purchase_requirement',
    coupleQty: 1,
    familyQty: 1,
    quantityTbd: true,
    notes: 'דרישת רכש תפעולית - כמות מדויקת טרם נקבעה'
  },

  // Electrical Appliances
  refrigerator: {
    id: 'refrigerator',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'מקרר',
    nameEn: 'Refrigerator',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1,
    notes: 'גודל המקרר (קטן/מלא) יעודכן בהמשך'
  },
  microwave: {
    id: 'microwave',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'מיקרוגל',
    nameEn: 'Microwave',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  electric_kettle: {
    id: 'electric_kettle',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'קומקום חשמלי',
    nameEn: 'Electric kettle',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  electric_hotplate: {
    id: 'electric_hotplate',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'כירה חשמלית לבישול',
    nameEn: 'Electric cooking hotplate',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  espresso_machine: {
    id: 'espresso_machine',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'מכונת אספרסו',
    nameEn: 'Espresso machine',
    type: 'reusable',
    targetStandard: 1,
    coupleQty: 1,
    familyQty: 1,
    isTargetStandard: true,
    notes: 'יעד תקן: מכונה 1 בכל בקתה. נוכחות בפועל נדרשת אימות פרטני לכל חדר.'
  },
  shabbat_hotplate: {
    id: 'shabbat_hotplate',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'פלטת שבת (לפי דרישה בלבד)',
    nameEn: 'Shabbat hotplate (on request)',
    type: 'on_request',
    coupleQty: 0,
    familyQty: 0,
    notes: 'אספקה לפי תיאום מראש בלבד. אינה חלק מהציוד הקבוע בבקתה.'
  },
  hot_water_urn: {
    id: 'hot_water_urn',
    category: ITEM_CATEGORIES.APPLIANCES,
    nameHe: 'מיחם מים חמים (לפי דרישה בלבד)',
    nameEn: 'Hot water urn (on request)',
    type: 'on_request',
    coupleQty: 0,
    familyQty: 0,
    notes: 'אספקה לפי תיאום מראש בלבד. אינו חלק מהציוד הקבוע בבקתה.'
  },

  // Coffee and Tea Station (Consumables individually packaged)
  instant_coffee_sachets: {
    id: 'instant_coffee_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי נס קפה אישיים',
    nameEn: 'Instant coffee sachets',
    type: 'consumable',
    coupleQty: 4,
    familyQty: 6
  },
  black_coffee_sachets: {
    id: 'black_coffee_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי קפה שחור / טורקי אישיים',
    nameEn: 'Turkish/black coffee sachets',
    type: 'consumable',
    coupleQty: 4,
    familyQty: 6
  },
  regular_tea_sachets: {
    id: 'regular_tea_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי תה רגיל אישיים',
    nameEn: 'Regular tea sachets',
    type: 'consumable',
    coupleQty: 4,
    familyQty: 6
  },
  masala_tea_sachets: {
    id: 'masala_tea_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי תה מסאלה אישיים',
    nameEn: 'Masala tea sachets',
    type: 'consumable',
    coupleQty: 4,
    familyQty: 6
  },
  white_sugar_sachets: {
    id: 'white_sugar_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי סוכר לבן אישיים',
    nameEn: 'White sugar sachets',
    type: 'consumable',
    coupleQty: 8,
    familyQty: 12
  },
  brown_sugar_sachets: {
    id: 'brown_sugar_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי סוכר חום אישיים',
    nameEn: 'Brown sugar sachets',
    type: 'consumable',
    coupleQty: 8,
    familyQty: 12
  },
  sweetener_sachets: {
    id: 'sweetener_sachets',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'שקיקי ממתיק / סוכרזית אישיים',
    nameEn: 'Sweetener sachets',
    type: 'consumable',
    coupleQty: 8,
    familyQty: 12
  },
  espresso_capsules: {
    id: 'espresso_capsules',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'קפסולות אספרסו (מותנה במכונה מאומתת)',
    nameEn: 'Espresso capsules',
    type: 'consumable',
    coupleQty: 4,
    familyQty: 4,
    condition: 'espresso_machine_verified',
    notes: 'נדרש אך ורק בבקתות בהן מותקנת מכונת אספרסו מאומתת בפועל.'
  },
  salt_shaker: {
    id: 'salt_shaker',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'מלחייה רב-פעמית',
    nameEn: 'Salt shaker',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  pepper_shaker: {
    id: 'pepper_shaker',
    category: ITEM_CATEGORIES.COFFEE_TEA,
    nameHe: 'פלפלייה רב-פעמית',
    nameEn: 'Pepper shaker',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },

  // Cleaning and Waste Equipment
  japanese_sponge: {
    id: 'japanese_sponge',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'ספוגית ניקוי יפנית למטבח',
    nameEn: 'Japanese kitchen cleaning pad',
    type: 'consumable',
    coupleQty: 1,
    familyQty: 1
  },
  microfiber_cloth: {
    id: 'microfiber_cloth',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'מטלית ניקוי מיקרופייבר',
    nameEn: 'Microfiber cleaning cloth',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  dish_soap: {
    id: 'dish_soap',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'סבון כלים (בקבוק מלא)',
    nameEn: 'Dishwashing liquid',
    type: 'consumable',
    coupleQty: 1,
    familyQty: 1
  },
  kitchen_waste_bin: {
    id: 'kitchen_waste_bin',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'פח אשפה למטבח (מתחת לכיור)',
    nameEn: 'Kitchen waste bin under sink',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  bathroom_waste_bin: {
    id: 'bathroom_waste_bin',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'פח אשפה לחדר רחצה',
    nameEn: 'Bathroom waste bin',
    type: 'reusable',
    coupleQty: 1,
    familyQty: 1
  },
  installed_large_waste_bag: {
    id: 'installed_large_waste_bag',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'שקית אשפה גדולה מולבשת בפח מטבח',
    nameEn: 'Large bag installed in kitchen bin',
    type: 'consumable',
    coupleQty: 1,
    familyQty: 1
  },
  installed_small_waste_bag: {
    id: 'installed_small_waste_bag',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'שקית אשפה קטנה מולבשת בפח אמבטיה',
    nameEn: 'Small bag installed in bathroom bin',
    type: 'consumable',
    coupleQty: 1,
    familyQty: 1
  },
  spare_large_waste_bags: {
    id: 'spare_large_waste_bags',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'שקיות אשפה גדולות רזרבה (יעד תקן חדש)',
    nameEn: 'Spare large bags',
    type: 'consumable',
    isTargetStandard: true,
    coupleQty: 2,
    familyQty: 2,
    notes: 'יעד תקן חדש ושיפור תפעולי נדרש - טרם אומת כמלאי קיים בחדרים'
  },
  spare_small_waste_bags: {
    id: 'spare_small_waste_bags',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    nameHe: 'שקיות אשפה קטנות רזרבה (יעד תקן חדש)',
    nameEn: 'Spare small bags',
    type: 'consumable',
    isTargetStandard: true,
    coupleQty: 2,
    familyQty: 2,
    notes: 'יעד תקן חדש ושיפור תפעולי נדרש - טרם אומת כמלאי קיים בחדרים'
  },

  // Bathroom Equipment
  toilet_paper: {
    id: 'toilet_paper',
    category: ITEM_CATEGORIES.BATHROOM,
    nameHe: 'נייר טואלט (גלילים)',
    nameEn: 'Toilet paper rolls',
    type: 'consumable',
    coupleQty: 3,
    familyQty: 3,
    notes: 'מינימום 3 גלילים לכל בקתה'
  }
};

/**
 * Bed Notation Rules (Confirmed by Operations Manager):
 * - FIRST "2" = REGULAR DOUBLE BED ('double')
 * - ADDITIONAL "2" = DOUBLE SOFA BED ('double_sofa_bed')
 * - "1" = SINGLE BED ('single')
 *
 * Examples:
 *   "2"           => 1 double (2 places)
 *   "2+2"         => 1 double + 1 double sofa bed (4 places)
 *   "2+1+1"       => 1 double + 2 single beds (4 places)
 *   "2+1+1+1+1"   => 1 double + 4 single beds (6 places)
 *   "2+1+1+1+1+1" => 1 double + 5 single beds (7 places)
 *   "2+1+1+1+2"   => 1 double + 3 single beds + 1 double sofa bed (7 places)
 *   "2+2+1+1"     => 1 double + 1 double sofa bed + 2 single beds (6 places)
 */
export function parseBedNotation(notation) {
  if (!notation) return { notation: '', beds: [], capacity: 0 };
  const str = String(notation).trim();
  const parts = str.split('+').map((s) => s.trim().toLowerCase());
  let doubleCount = 0;
  let singleCount = 0;
  let sofaBedCount = 0;

  let seenFirstDouble = false;
  for (const part of parts) {
    if (part === 'sofa_2' || part === 'sofa' || part === 'double_sofa_bed' || part.includes('ספה')) {
      sofaBedCount++;
    } else if (part === '2' || part === 'double') {
      if (!seenFirstDouble) {
        doubleCount++;
        seenFirstDouble = true;
      } else {
        sofaBedCount++;
      }
    } else if (part === '1' || part === 'single') {
      singleCount++;
    } else if (part) {
      const count = parseInt(part, 10);
      if (count === 2) {
        if (!seenFirstDouble) {
          doubleCount++;
          seenFirstDouble = true;
        } else {
          sofaBedCount++;
        }
      } else if (count === 1) {
        singleCount++;
      }
    }
  }

  const beds = [];
  if (doubleCount > 0) beds.push({ type: 'double', quantity: doubleCount });
  if (singleCount > 0) beds.push({ type: 'single', quantity: singleCount });
  if (sofaBedCount > 0) beds.push({ type: 'double_sofa_bed', quantity: sofaBedCount });

  const capacity = (doubleCount * 2) + (sofaBedCount * 2) + (singleCount * 1);
  return { notation: str, beds, capacity, physicalSleepingCapacity: capacity };
}

/**
 * Standard Bed Linen Specifications:
 * - Regular Double Bed ('2'): 4 pillows, 4 pillowcases, 1 double duvet, 1 double duvet cover, 1 double sheet.
 * - Single Bed ('1'): 1 pillow, 1 pillowcase, 1 single duvet, 1 single duvet cover, 1 single sheet.
 * - Double Sofa Bed (additional '2' / 'sofa_2'): 2 pillows, 2 pillowcases, 1 double duvet, 1 double duvet cover, 1 double sheet.
 */
export function calculateLinenRequirements(bedConfigInput) {
  const result = {
    pillows: 0,
    pillowcases: 0,
    doubleDuvets: 0,
    singleDuvets: 0,
    doubleDuvetCovers: 0,
    singleDuvetCovers: 0,
    doubleSheets: 0,
    singleSheets: 0,
    totalSheets: 0,
    breakdown: []
  };

  if (!bedConfigInput) return result;

  let bedEntries = [];
  if (typeof bedConfigInput === 'string') {
    const parsed = parseBedNotation(bedConfigInput);
    for (const b of parsed.beds) {
      for (let i = 0; i < b.quantity; i++) {
        bedEntries.push({ type: b.type });
      }
    }
  } else if (Array.isArray(bedConfigInput)) {
    for (const item of bedConfigInput) {
      if (typeof item === 'string') {
        const lower = item.toLowerCase();
        if (lower.includes('sofa')) bedEntries.push({ type: 'double_sofa_bed' });
        else if (lower === '2' || lower === 'double') bedEntries.push({ type: 'double' });
        else bedEntries.push({ type: 'single' });
      } else if (item && typeof item === 'object') {
        const qty = Number(item.quantity || item.count || 1);
        const t = item.type || 'single';
        for (let i = 0; i < qty; i++) {
          bedEntries.push({ type: t });
        }
      }
    }
  }

  for (const bed of bedEntries) {
    const type = bed?.type || 'single';
    if (type === 'double' || type === 'regular_double') {
      result.pillows += 4;
      result.pillowcases += 4;
      result.doubleDuvets += 1;
      result.doubleDuvetCovers += 1;
      result.doubleSheets += 1;
      result.breakdown.push({
        type: 'מיטה זוגית רגילה',
        pillows: 4,
        pillowcases: 4,
        duvet: '1 זוגית',
        cover: '1 זוגי',
        sheet: '1 זוגי'
      });
    } else if (type === 'double_sofa_bed' || type === 'sofa_2' || type === 'sofa' || type === 'sofa_double') {
      result.pillows += 2;
      result.pillowcases += 2;
      result.doubleDuvets += 1;
      result.doubleDuvetCovers += 1;
      result.doubleSheets += 1;
      result.breakdown.push({
        type: 'ספה נפתחת זוגית',
        pillows: 2,
        pillowcases: 2,
        duvet: '1 זוגית',
        cover: '1 זוגי',
        sheet: '1 זוגי'
      });
    } else if (type === 'single') {
      result.pillows += 1;
      result.pillowcases += 1;
      result.singleDuvets += 1;
      result.singleDuvetCovers += 1;
      result.singleSheets += 1;
      result.breakdown.push({
        type: 'מיטת יחיד',
        pillows: 1,
        pillowcases: 1,
        duvet: '1 יחיד',
        cover: '1 יחיד',
        sheet: '1 יחיד'
      });
    }
  }

  result.totalSheets = result.doubleSheets + result.singleSheets;
  return result;
}

/**
 * Standard Towels Calculation:
 * - 2 body towels total per guest (independent of nights).
 * - 1 face towel per guest (independent of nights).
 * - Towel preference: prefer 1 regular body towel + 1 pool towel per guest.
 *   If pool towels unavailable, 2 regular body towels per guest.
 * - Total body/pool towels remains 2 per guest.
 */
export function calculateTowelRequirements(guestCount = 2, { preferPoolTowels = true, poolTowelsAvailable = true } = {}) {
  const guests = Math.max(0, Number(guestCount) || 0);
  const totalBodyTowels = guests * 2;
  const faceTowels = guests * 1;

  let regularBodyTowels = totalBodyTowels;
  let poolTowels = 0;

  if (preferPoolTowels && poolTowelsAvailable) {
    poolTowels = guests * 1;
    regularBodyTowels = guests * 1;
  }

  return {
    guests,
    totalBodyTowels,
    regularBodyTowels,
    poolTowels,
    faceTowels,
    summaryHe: `${totalBodyTowels} מגבות גוף/בריכה (${regularBodyTowels} גוף + ${poolTowels} בריכה) ו-${faceTowels} מגבות פנים`
  };
}

/**
 * Standard Bathroom Floor Mats Calculation:
 * - 2 mats per cabin if both shower and Jacuzzi exist (1 near shower, 1 near Jacuzzi).
 * - 1 mat per cabin if no Jacuzzi (shower mat only).
 */
export function calculateBathroomMats(hasJacuzzi = true) {
  const count = hasJacuzzi ? 2 : 1;
  return {
    count,
    showerMat: 1,
    jacuzziMat: hasJacuzzi ? 1 : 0,
    placementHe: hasJacuzzi
      ? '2 שטיחוני רצפה (1 ביציאה מהמקלחון, 1 ליד הג׳קוזי)'
      : 'שטיחון רצפה אחד ביציאה מהמקלחון'
  };
}

/**
 * Standard Personal Toiletries Calculation:
 * - 4 products: Shampoo, Body wash, Body lotion, Solid soap.
 * - Quantity = Number of guests × Number of nights.
 * - Calculated strictly from actual reservation data (not max occupancy, not multiplied for reusable items).
 */
export function calculateToiletriesRequirements(guestCount = 2, nightsCount = 1) {
  const guests = Math.max(1, Number(guestCount) || 1);
  const nights = Math.max(1, Number(nightsCount) || 1);
  const qtyPerProduct = guests * nights;

  return {
    guests,
    nights,
    shampoo: qtyPerProduct,
    bodyWash: qtyPerProduct,
    bodyLotion: qtyPerProduct,
    solidSoap: qtyPerProduct,
    totalItems: qtyPerProduct * 4,
    summaryHe: `${qtyPerProduct} שמפו, ${qtyPerProduct} תחליב רחצה, ${qtyPerProduct} קרם גוף, ${qtyPerProduct} סבון מוצק (${guests} אורחים × ${nights} לילות)`
  };
}

/**
 * Air Conditioning Specification per Room:
 * - acCount: number of units
 * - remoteCount: number of remotes (UNKNOWN until physically verified)
 * - remoteArrangement: 'individual' | 'shared' | 'unverified'
 * - status: 'ok' | 'issue' | 'defective' | 'missing'
 */
export function createAcConfig({ acCount = 1, remoteCount = 'UNKNOWN', remoteArrangement = 'unverified', status = 'ok', notes = '' } = {}) {
  return {
    acCount: Number(acCount) || 1,
    remoteCount, // UNKNOWN until physically verified
    remoteArrangement,
    status,
    notes
  };
}

/**
 * TV & YES Specification per Room:
 * - tvCount: number of TVs
 * - yesReceiverCount: equal to tvCount by standard
 * - yesRemoteCount: UNKNOWN until verified
 * - tvManufacturerRemoteCount: UNKNOWN until verified
 * - remoteArrangement: 'unverified' | 'yes_only' | 'dual_remote' | 'room_specific'
 */
export function createTvConfig({
  tvCount = 1,
  yesReceiverCount = null,
  yesRemoteCount = 'UNKNOWN',
  tvManufacturerRemoteCount = 'UNKNOWN',
  remoteArrangement = 'unverified',
  notes = ''
} = {}) {
  const tvs = Number(tvCount) || 1;
  return {
    tvCount: tvs,
    yesReceiverCount: yesReceiverCount != null ? Number(yesReceiverCount) : tvs,
    yesRemoteCount,
    tvManufacturerRemoteCount,
    remoteArrangement,
    notes
  };
}

/**
 * Canonical 26 Confirmed Room Configurations personally approved by Operations Management.
 * Grouped across 7 properties:
 * 1. טאג' מהל: 4
 * 2. בקתות מאיה: 3
 * 3. החצר המוזיקלית: 3
 * 4. מול הנוף: 5
 * 5. טוסקנה: 3
 * 6. נופים בלבן: 2
 * 7. בתי נורית: 6
 * TOTAL: 26 ROOMS
 */
export const CONFIRMED_ROOM_CONFIGURATIONS = {
  // 1. טאג' מהל (4 rooms)
  k808: {
    unitId: 'k808',
    propertyNameHe: "טאג' מהל",
    propertyId: 'taj',
    roomNumber: 1,
    name: "טאג' מאהל · בקתה 1",
    bedNotation: '2',
    ...parseBedNotation('2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },
  k809: {
    unitId: 'k809',
    propertyNameHe: "טאג' מהל",
    propertyId: 'taj',
    roomNumber: 2,
    name: "טאג' מאהל · בקתה 2",
    bedNotation: '2',
    ...parseBedNotation('2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },
  k810: {
    unitId: 'k810',
    propertyNameHe: "טאג' מהל",
    propertyId: 'taj',
    roomNumber: 3,
    name: "טאג' מאהל · בקתה 3",
    bedNotation: '2',
    ...parseBedNotation('2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },
  k811: {
    unitId: 'k811',
    propertyNameHe: "טאג' מהל",
    propertyId: 'taj',
    roomNumber: 4,
    name: "טאג' מאהל · בקתה 4",
    bedNotation: '2',
    ...parseBedNotation('2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },

  // 2. בקתות מאיה (3 rooms)
  k693: {
    unitId: 'k693',
    propertyNameHe: 'בקתות מאיה',
    propertyId: 'maya',
    roomNumber: 1,
    name: 'בקתות מאיה · בקתה 1',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k694: {
    unitId: 'k694',
    propertyNameHe: 'בקתות מאיה',
    propertyId: 'maya',
    roomNumber: 2,
    name: 'בקתות מאיה · בקתה 2',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k695: {
    unitId: 'k695',
    propertyNameHe: 'בקתות מאיה',
    propertyId: 'maya',
    roomNumber: 3,
    name: 'בקתות מאיה · בקתה 3',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },

  // 3. החצר המוזיקלית (3 rooms)
  k690: {
    unitId: 'k690',
    propertyNameHe: 'החצר המוזיקלית',
    propertyId: 'musical',
    roomNumber: 1,
    name: 'החצר המוסיקלית · בקתה 1',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },
  k691: {
    unitId: 'k691',
    propertyNameHe: 'החצר המוזיקלית',
    propertyId: 'musical',
    roomNumber: 2,
    name: 'החצר המוסיקלית · בקתה 2',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },
  k692: {
    unitId: 'k692',
    propertyNameHe: 'החצר המוזיקלית',
    propertyId: 'musical',
    roomNumber: 3,
    name: 'החצר המוסיקלית · בקתה 3',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 1,
    requiredYesReceivers: 1,
    specialAmenities: {}
  },

  // 4. מול הנוף (5 rooms)
  k680: {
    unitId: 'k680',
    propertyNameHe: 'מול הנוף',
    propertyId: 'mool',
    roomNumber: 1,
    name: 'מול הנוף · בקתה 1',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k681: {
    unitId: 'k681',
    propertyNameHe: 'מול הנוף',
    propertyId: 'mool',
    roomNumber: 2,
    name: 'מול הנוף · בקתה 2',
    bedNotation: '2+1+1+1+1',
    ...parseBedNotation('2+1+1+1+1'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k682: {
    unitId: 'k682',
    propertyNameHe: 'מול הנוף',
    propertyId: 'mool',
    roomNumber: 3,
    name: 'מול הנוף · בקתה 3',
    bedNotation: '2+1+1+1+1',
    ...parseBedNotation('2+1+1+1+1'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k683: {
    unitId: 'k683',
    propertyNameHe: 'מול הנוף',
    propertyId: 'mool',
    roomNumber: 4,
    name: 'מול הנוף · בקתה 4',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k684: {
    unitId: 'k684',
    propertyNameHe: 'מול הנוף',
    propertyId: 'mool',
    roomNumber: 5,
    name: 'מול הנוף · בקתה 5',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },

  // 5. טוסקנה (3 rooms)
  k687: {
    unitId: 'k687',
    propertyNameHe: 'טוסקנה',
    propertyId: 'toscana',
    roomNumber: 1,
    name: 'טוסקנה · 1',
    bedNotation: '2+1+1',
    ...parseBedNotation('2+1+1'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k688: {
    unitId: 'k688',
    propertyNameHe: 'טוסקנה',
    propertyId: 'toscana',
    roomNumber: 2,
    name: 'טוסקנה · 2',
    bedNotation: '2+1+1',
    ...parseBedNotation('2+1+1'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k689: {
    unitId: 'k689',
    propertyNameHe: 'טוסקנה',
    propertyId: 'toscana',
    roomNumber: 3,
    name: 'טוסקנה · 3',
    bedNotation: '2+1+1+1+1+1',
    ...parseBedNotation('2+1+1+1+1+1'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: { private_sauna: true }
  },

  // 6. נופים בלבן (2 rooms)
  k685: {
    unitId: 'k685',
    propertyNameHe: 'נופים בלבן',
    propertyId: 'nofim',
    roomNumber: 1,
    name: 'נופים בלבן · בקתה 1',
    bedNotation: '2+1+1+1+2',
    ...parseBedNotation('2+1+1+1+2'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k686: {
    unitId: 'k686',
    propertyNameHe: 'נופים בלבן',
    propertyId: 'nofim',
    roomNumber: 2,
    name: 'נופים בלבן · בקתה 2',
    bedNotation: '2+1+1+1+2',
    ...parseBedNotation('2+1+1+1+2'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },

  // 7. בתי נורית (6 rooms)
  k671: {
    unitId: 'k671',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 1,
    name: 'בתי נורית 1',
    bedNotation: '2+2',
    ...parseBedNotation('2+2'),
    airConditioners: 2,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k673: {
    unitId: 'k673',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 2,
    name: 'בתי נורית 2',
    bedNotation: '2+2+1+1',
    ...parseBedNotation('2+2+1+1'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k674: {
    unitId: 'k674',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 3,
    name: 'בתי נורית 3',
    bedNotation: '2+2+1+1',
    ...parseBedNotation('2+2+1+1'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k675: {
    unitId: 'k675',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 4,
    name: 'בתי נורית 4',
    bedNotation: '2+2+1+1',
    ...parseBedNotation('2+2+1+1'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k676: {
    unitId: 'k676',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 5,
    name: 'בתי נורית 5',
    bedNotation: '2+2+1+1',
    ...parseBedNotation('2+2+1+1'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  },
  k677: {
    unitId: 'k677',
    propertyNameHe: 'בתי נורית',
    propertyId: 'nurit',
    roomNumber: 6,
    name: 'בתי נורית 6',
    bedNotation: '2+2+1+1',
    ...parseBedNotation('2+2+1+1'),
    airConditioners: 3,
    televisions: 2,
    requiredYesReceivers: 2,
    specialAmenities: {}
  }
};

/**
 * Mapping of all 41 units to their equipment profile, confirmed bed config, Jacuzzi presence, and climate/TV specs.
 */
export const CANONICAL_UNIT_EQUIPMENT_PROFILES = {
  // --- 26 Confirmed Rooms ---
  // Taj Mahal (Couples standard, 2 guests max)
  k808: { propertyId: 'taj', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', physicalSleepingCapacity: 2, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  k809: { propertyId: 'taj', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', physicalSleepingCapacity: 2, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  k810: { propertyId: 'taj', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', physicalSleepingCapacity: 2, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  k811: { propertyId: 'taj', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', physicalSleepingCapacity: 2, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },

  // Batei Nurit (Couples & Family cabins, plus 2 staff units)
  k671: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k673: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k674: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k675: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k676: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k677: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k678: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.STAFF, isGuestCabin: false, notes: 'מגורי צוות ועובדים בלבד' },
  k679: { propertyId: 'nurit', standard: EQUIPMENT_STANDARDS.STAFF, isGuestCabin: false, notes: 'מגורי צוות ועובדים בלבד' },

  // Mool HaNof (Family standard)
  k680: { propertyId: 'mool', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k681: { propertyId: 'mool', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k682: { propertyId: 'mool', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1+1+1', physicalSleepingCapacity: 6, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k683: { propertyId: 'mool', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k684: { propertyId: 'mool', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // Nofim Belavan (Family standard)
  k685: { propertyId: 'nofim', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1+1+2', physicalSleepingCapacity: 7, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k686: { propertyId: 'nofim', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1+1+2', physicalSleepingCapacity: 7, hasJacuzzi: true, ac: createAcConfig({ acCount: 3 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // Toscana (Family standard)
  k687: { propertyId: 'toscana', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k688: { propertyId: 'toscana', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k689: { propertyId: 'toscana', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1+1+1+1', physicalSleepingCapacity: 7, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }), specialAmenities: { private_sauna: true } },

  // Musical Courtyard (Couples standard)
  k690: { propertyId: 'musical', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  k691: { propertyId: 'musical', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  k692: { propertyId: 'musical', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },

  // Maya Cabins (Couples standard)
  k693: { propertyId: 'maya', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k694: { propertyId: 'maya', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k695: { propertyId: 'maya', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2+2', physicalSleepingCapacity: 4, hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // --- Other Resort Units (outside the 26 confirmed Ramot surveyed rooms) ---
  // Sky Domes (Couples standard, without Jacuzzi inside dome)
  'dome-blue': { propertyId: 'kipat', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', hasJacuzzi: false, ac: createAcConfig({ acCount: 1 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  'dome-red': { propertyId: 'kipat', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', hasJacuzzi: false, ac: createAcConfig({ acCount: 1 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },
  'dome-green': { propertyId: 'kipat', standard: EQUIPMENT_STANDARDS.COUPLE, isGuestCabin: true, defaultBeds: '2', hasJacuzzi: false, ac: createAcConfig({ acCount: 1 }), tv: createTvConfig({ tvCount: 1, yesReceiverCount: 1 }) },

  // Zimmer BaGiva (Family standard)
  'hill-1': { propertyId: 'hill', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  'hill-2': { propertyId: 'hill', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  'hill-3': { propertyId: 'hill', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  'hill-4': { propertyId: 'hill', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // Casa Nova (Family standard)
  k826: { propertyId: 'casa-nova', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  k827: { propertyId: 'casa-nova', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+1+1', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // Mialees Suites (Family standard)
  'suite-1': { propertyId: 'mialees', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+sofa_2', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },
  'suite-2': { propertyId: 'mialees', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+sofa_2', hasJacuzzi: true, ac: createAcConfig({ acCount: 2 }), tv: createTvConfig({ tvCount: 2, yesReceiverCount: 2 }) },

  // Mialees Villa (Family standard)
  'mialis-villa': { propertyId: 'mialees', standard: EQUIPMENT_STANDARDS.FAMILY, isGuestCabin: true, defaultBeds: '2+2+2+2', hasJacuzzi: true, ac: createAcConfig({ acCount: 5 }), tv: createTvConfig({ tvCount: 5, yesReceiverCount: 5 }) },

  // Pilot Office (Operational Office)
  'pilot-office': { propertyId: 'office', standard: EQUIPMENT_STANDARDS.OFFICE, isGuestCabin: false, notes: 'משרד הנהלה ומוקד תפעולי' }
};

/**
 * Helper to identify units outside the 26 confirmed rooms.
 */
export function getUnmappedResortUnits(allUnitIds = Object.keys(CANONICAL_UNIT_EQUIPMENT_PROFILES)) {
  const confirmedIds = new Set(Object.keys(CONFIRMED_ROOM_CONFIGURATIONS));
  return allUnitIds.filter((id) => !confirmedIds.has(id));
}

/**
 * Generate comprehensive structured report for the confirmed 26 rooms.
 */
export function generateConfirmedRoomsReport() {
  const rooms = Object.values(CONFIRMED_ROOM_CONFIGURATIONS);
  const byProperty = {};

  for (const r of rooms) {
    if (!byProperty[r.propertyNameHe]) {
      byProperty[r.propertyNameHe] = [];
    }
    const linen = calculateLinenRequirements(r.bedNotation);
    byProperty[r.propertyNameHe].push({
      ...r,
      linenRequirements: {
        pillows: linen.pillows,
        pillowcases: linen.pillowcases,
        doubleSheets: linen.doubleSheets,
        singleSheets: linen.singleSheets,
        doubleDuvets: linen.doubleDuvets,
        singleDuvets: linen.singleDuvets
      }
    });
  }

  return {
    totalConfirmedRooms: rooms.length,
    propertyCounts: {
      "טאג' מהל": byProperty["טאג' מהל"]?.length || 0,
      'בקתות מאיה': byProperty['בקתות מאיה']?.length || 0,
      'החצר המוזיקלית': byProperty['החצר המוזיקלית']?.length || 0,
      'מול הנוף': byProperty['מול הנוף']?.length || 0,
      'טוסקנה': byProperty['טוסקנה']?.length || 0,
      'נופים בלבן': byProperty['נופים בלבן']?.length || 0,
      'בתי נורית': byProperty['בתי נורית']?.length || 0
    },
    rooms,
    byProperty,
    unmappedUnits: getUnmappedResortUnits()
  };
}

/**
 * Get the equipment profile for a unit. If unknown, returns NEEDS_REVIEW without modifying global state.
 */
export function getUnitEquipmentProfile(unitId) {
  if (!unitId) return { standard: EQUIPMENT_STANDARDS.NEEDS_REVIEW, isGuestCabin: false, status: EQUIPMENT_STANDARDS.NEEDS_REVIEW };
  const profile = CANONICAL_UNIT_EQUIPMENT_PROFILES[unitId];
  if (profile) return profile;
  return {
    unitId,
    standard: EQUIPMENT_STANDARDS.NEEDS_REVIEW,
    isGuestCabin: true,
    status: EQUIPMENT_STANDARDS.NEEDS_REVIEW,
    notes: 'יחידה לא מזוהה - דורשת בדיקה ידנית'
  };
}

/**
 * Dynamic calculation of room preparation requirements for a specific stay.
 * Combines standard baseline with reservation parameters (guests, nights, bed setup, verified equipment).
 */
export function calculateRoomRequirements({
  unitId,
  profileType = null,
  guests = 2,
  nights = 1,
  bedConfig = null,
  hasJacuzzi = null,
  hasVerifiedEspresso = false,
  customOverrides = {}
} = {}) {
  const profile = getUnitEquipmentProfile(unitId);
  const effectiveStandard = profileType || profile.standard || EQUIPMENT_STANDARDS.COUPLE;
  const isFamily = effectiveStandard === EQUIPMENT_STANDARDS.FAMILY;

  // Resolve Jacuzzi
  const actualHasJacuzzi = hasJacuzzi != null ? Boolean(hasJacuzzi) : (profile.hasJacuzzi !== false);

  // 1. Kitchen Requirements
  const kitchen = {
    dinnerPlates: isFamily ? EQUIPMENT_CATALOG.dinner_plates.familyQty : EQUIPMENT_CATALOG.dinner_plates.coupleQty,
    drinkingGlasses: isFamily ? EQUIPMENT_CATALOG.drinking_glasses.familyQty : EQUIPMENT_CATALOG.drinking_glasses.coupleQty,
    coffeeMugs: isFamily ? EQUIPMENT_CATALOG.coffee_mugs.familyQty : EQUIPMENT_CATALOG.coffee_mugs.coupleQty,
    wineGlasses: isFamily ? EQUIPMENT_CATALOG.wine_glasses.familyQty : EQUIPMENT_CATALOG.wine_glasses.coupleQty,
    cutlerySets: isFamily ? EQUIPMENT_CATALOG.cutlery_sets.familyQty : EQUIPMENT_CATALOG.cutlery_sets.coupleQty,
    smallBowls: isFamily ? EQUIPMENT_CATALOG.small_bowls.familyQty : EQUIPMENT_CATALOG.small_bowls.coupleQty,
    cookingPot: 1,
    fryingPan: 1,
    dessertPlates: 0 // No small dessert plates required by standard
  };

  // 2. Appliances
  const appliances = {
    refrigerator: 1,
    microwave: 1,
    electricKettle: 1,
    electricHotplate: 1,
    espressoMachineTarget: 1,
    espressoMachineVerified: Boolean(hasVerifiedEspresso),
    shabbatHotplate: 'ON_REQUEST_ONLY',
    hotWaterUrn: 'ON_REQUEST_ONLY'
  };

  // 3. Coffee & Tea Station
  const coffeeStation = {
    instantCoffee: isFamily ? 6 : 4,
    blackCoffee: isFamily ? 6 : 4,
    regularTea: isFamily ? 6 : 4,
    masalaTea: isFamily ? 6 : 4,
    whiteSugar: isFamily ? 12 : 8,
    brownSugar: isFamily ? 12 : 8,
    sweetener: isFamily ? 12 : 8,
    // Espresso capsules required ONLY if espresso machine is verified installed!
    espressoCapsules: hasVerifiedEspresso ? 4 : 0,
    saltShaker: 1,
    pepperShaker: 1
  };

  // 4. Linen & Bedding (dynamic based on bed config)
  const effectiveBedConfig = bedConfig || profile.defaultBeds || (isFamily ? '2+1+1' : '2');
  const linen = calculateLinenRequirements(effectiveBedConfig);

  // 5. Towels (2 body/pool + 1 face per guest, not multiplied by nights)
  const towels = calculateTowelRequirements(guests);

  // 6. Bathroom Equipment & Toiletries
  const floorMats = calculateBathroomMats(actualHasJacuzzi);
  const toiletries = calculateToiletriesRequirements(guests, nights);
  const bathroom = {
    toiletPaperRolls: 3,
    floorMats: floorMats.count,
    showerMat: floorMats.showerMat,
    jacuzziMat: floorMats.jacuzziMat,
    toiletries
  };

  // 7. Cleaning & Waste
  const cleaning = {
    japaneseSponge: 1,
    microfiberCloth: 1,
    dishSoap: 1,
    kitchenBin: 1,
    bathroomBin: 1,
    installedLargeBag: 1,
    installedSmallBag: 1,
    targetSpareLargeBags: 2,
    targetSpareSmallBags: 2
  };

  // 8. Climate & Entertainment
  const ac = profile.ac || createAcConfig();
  const tv = profile.tv || createTvConfig();

  // Excluded items reminder
  const excludedItems = {
    clothesHangers: false, // NOT part of standard
    dessertPlates: false   // NOT part of standard
  };

  return {
    unitId,
    standard: effectiveStandard,
    isGuestCabin: profile.isGuestCabin !== false,
    guests: Number(guests) || 2,
    nights: Number(nights) || 1,
    bedConfig: effectiveBedConfig,
    hasJacuzzi: actualHasJacuzzi,
    hasVerifiedEspresso: Boolean(hasVerifiedEspresso),
    kitchen,
    appliances,
    coffeeStation,
    linen,
    towels,
    bathroom,
    cleaning,
    ac,
    tv,
    excludedItems,
    ...customOverrides
  };
}

/**
 * Generate a comprehensive Housekeeping preparation checklist for staff.
 */
export function generateHousekeepingChecklist({
  unitId,
  booking = {},
  unitInfo = {},
  verifiedInventory = {}
} = {}) {
  const guests = Math.max(1, Number(booking?.adults || booking?.guests || 2) + Number(booking?.children || 0));
  const nights = Math.max(1, Number(booking?.nights) || 1);
  const unitVerified = verifiedInventory[unitId] || {};
  const hasVerifiedEspresso = unitVerified.espresso_machine === EQUIPMENT_STATUS.VERIFIED_PRESENT;

  const req = calculateRoomRequirements({
    unitId,
    guests,
    nights,
    bedConfig: booking?.bed_setup || unitInfo?.bed_setup,
    hasJacuzzi: unitInfo?.hasJacuzzi,
    hasVerifiedEspresso
  });

  const sections = [
    {
      id: 'linen',
      title: '1. מצעים וכריות (לפי תצורת שינה מאושרת)',
      items: [
        { label: `כריות: ${req.linen.pillows} יח׳`, done: false },
        { label: `ציפיות לכריות: ${req.linen.pillowcases} יח׳`, done: false },
        ...(req.linen.doubleDuvets ? [{ label: `שמיכות פוך זוגיות: ${req.linen.doubleDuvets} יח׳`, done: false }] : []),
        ...(req.linen.singleDuvets ? [{ label: `שמיכות פוך יחיד: ${req.linen.singleDuvets} יח׳`, done: false }] : []),
        ...(req.linen.doubleDuvetCovers ? [{ label: `ציפות לשמיכה זוגית: ${req.linen.doubleDuvetCovers} יח׳`, done: false }] : []),
        ...(req.linen.singleDuvetCovers ? [{ label: `ציפות לשמיכת יחיד: ${req.linen.singleDuvetCovers} יח׳`, done: false }] : []),
        ...(req.linen.doubleSheets ? [{ label: `סדינים זוגיים: ${req.linen.doubleSheets} יח׳`, done: false }] : []),
        ...(req.linen.singleSheets ? [{ label: `סדיני יחיד: ${req.linen.singleSheets} יח׳`, done: false }] : [])
      ]
    },
    {
      id: 'towels',
      title: '2. מגבות (לפי כמות אורחים בהזמנה)',
      items: [
        { label: `מגבות גוף/בריכה סה״כ: ${req.towels.totalBodyTowels} יח׳ (${req.towels.regularBodyTowels} גוף + ${req.towels.poolTowels} בריכה)`, done: false },
        { label: `מגבות פנים/ידיים: ${req.towels.faceTowels} יח׳`, done: false },
        { label: `שטיחוני רצפה לאמבט: ${req.bathroom.floorMats} (${req.bathroom.jacuzziMat ? '1 מקלחון + 1 ג׳קוזי' : 'מקלחון בלבד'})`, done: false }
      ]
    },
    {
      id: 'toiletries',
      title: `3. מוצרי טואלטיקה (${guests} אורחים × ${nights} לילות)`,
      items: [
        { label: `שמפו: ${req.bathroom.toiletries.shampoo} בקבוקונים`, done: false },
        { label: `תחליב רחצה: ${req.bathroom.toiletries.bodyWash} בקבוקונים`, done: false },
        { label: `קרם גוף: ${req.bathroom.toiletries.bodyLotion} בקבוקונים`, done: false },
        { label: `סבון מוצק: ${req.bathroom.toiletries.solidSoap} יח׳`, done: false },
        { label: `נייר טואלט: מינימום ${req.bathroom.toiletPaperRolls} גלילים`, done: false }
      ]
    },
    {
      id: 'coffee_tea',
      title: '4. עמדת שתייה חמה וקפה',
      items: [
        { label: `שקיקי נס קפה אישיים: ${req.coffeeStation.instantCoffee} יח׳`, done: false },
        { label: `שקיקי קפה שחור אישיים: ${req.coffeeStation.blackCoffee} יח׳`, done: false },
        { label: `שקיקי תה רגיל אישיים: ${req.coffeeStation.regularTea} יח׳`, done: false },
        { label: `שקיקי תה מסאלה אישיים: ${req.coffeeStation.masalaTea} יח׳`, done: false },
        { label: `סוכר לבן (${req.coffeeStation.whiteSugar}), סוכר חום (${req.coffeeStation.brownSugar}), ממתיק (${req.coffeeStation.sweetener})`, done: false },
        ...(req.appliances.espressoMachineVerified
          ? [{ label: `קפסולות אספרסו: ${req.coffeeStation.espressoCapsules} יח׳ (מכונה מאומתת בחדר)`, done: false }]
          : [{ label: 'קפסולות אספרסו: אין לספק (אין מכונת אספרסו מאומתת בחדר)', done: true }]),
        { label: 'מלחייה ופלפלייה רב-פעמיות במקום', done: false }
      ]
    },
    {
      id: 'kitchen_clean',
      title: '5. מטבחון, ניקיון ופחים',
      items: [
        { label: `צלחות עיקריות (${req.kitchen.dinnerPlates}), כוסות שתייה (${req.kitchen.drinkingGlasses}), מאגים (${req.kitchen.coffeeMugs}), כוסות יין (${req.kitchen.wineGlasses})`, done: false },
        { label: `סט סכו״ם שלם: ${req.kitchen.cutlerySets} סטים מלאים (מזלג, סכין, כף, כפית)`, done: false },
        ...(req.kitchen.smallBowls > 0 ? [{ label: `קעריות קטנות: ${req.kitchen.smallBowls} יח׳`, done: false }] : []),
        { label: `סיר בישול (${req.kitchen.cookingPot}) ומחבת טיגון (${req.kitchen.fryingPan})`, done: false },
        { label: 'ספוגית יפנית חדשה, מטלית מיקרופייבר נקייה ונוזל כלים מלא', done: false },
        { label: 'שקית גדולה בפח מטבח + שקית קטנה בפח אמבטיה', done: false },
        { label: 'שקיות רזרבה (יעד תקן): 2 גדולות + 2 קטנות', done: false }
      ]
    },
    {
      id: 'climate_tv',
      title: '6. מיזוג וטלוויזיה',
      items: [
        { label: `מזגנים: ${req.ac.acCount} יח׳, שלטים: ${req.ac.remoteCount} (${req.ac.remoteArrangement === 'shared' ? 'שלט משותף' : 'שלט לכל חלל'})`, done: false },
        { label: `טלוויזיה וממיר YES: ${req.tv.tvCount} יח׳, שלט YES: ${req.tv.yesRemoteCount}`, done: false }
      ]
    }
  ];

  return {
    unitId,
    guestCount: guests,
    nights,
    standard: req.standard,
    sections
  };
}

/**
 * Generate a management shortage and purchasing report across rooms.
 * Compares Required Standard with Actual Verified Inventory.
 *
 * Rules:
 * - UNKNOWN status is NEVER treated as MISSING.
 * - Missing espresso machines are highlighted per cabin.
 * - Purchase requirements (Kitchen strainers, mixing bowls) are tracked as TBD.
 * - Spare waste bags are flagged as required operational improvements.
 */
export function generateManagementShortageReport({
  units = Object.keys(CANONICAL_UNIT_EQUIPMENT_PROFILES),
  verifiedInventory = {},
  purchaseCatalogOverrides = {}
} = {}) {
  const report = {
    summary: {
      totalUnitsAudited: 0,
      totalShortages: 0,
      missingEspressoCount: 0,
      unverifiedEspressoCount: 0,
      verifiedEspressoCount: 0,
      strainersNeeded: 0,
      mixingBowlsNeeded: 0,
      spareBagsCabinDeficits: 0
    },
    shortagesByProperty: {},
    detailedShortageRows: [],
    operationalImprovements: []
  };

  for (const unitId of units) {
    const profile = getUnitEquipmentProfile(unitId);
    if (!profile.isGuestCabin) continue; // Skip staff accommodation and office

    report.summary.totalUnitsAudited++;
    const propId = profile.propertyId || 'other';
    if (!report.shortagesByProperty[propId]) {
      report.shortagesByProperty[propId] = {
        propertyId: propId,
        unitsCount: 0,
        shortageCount: 0,
        items: []
      };
    }
    report.shortagesByProperty[propId].unitsCount++;

    const unitVerified = verifiedInventory[unitId] || {};

    // 1. Audit Espresso Machine (Target: 1 per cabin)
    const espressoStatus = unitVerified.espresso_machine || EQUIPMENT_STATUS.UNKNOWN;
    if (espressoStatus === EQUIPMENT_STATUS.VERIFIED_PRESENT) {
      report.summary.verifiedEspressoCount++;
    } else if (espressoStatus === EQUIPMENT_STATUS.MISSING) {
      report.summary.missingEspressoCount++;
      report.summary.totalShortages++;
      report.shortagesByProperty[propId].shortageCount++;
      const row = {
        property: propId,
        room: unitId,
        category: ITEM_CATEGORIES.APPLIANCES,
        item: 'מכונת אספרסו',
        requiredQty: 1,
        verifiedQty: 0,
        shortageQty: 1,
        status: EQUIPMENT_STATUS.MISSING,
        purchaseStatus: 'REQUIRED_PURCHASE',
        notes: 'בקתה חסרה מכונת אספרסו (יעד תקן: 1 לבקתה)'
      };
      report.detailedShortageRows.push(row);
      report.shortagesByProperty[propId].items.push(row);
    } else if (espressoStatus === EQUIPMENT_STATUS.UNKNOWN) {
      report.summary.unverifiedEspressoCount++;
      // NOT reported as missing, but noted for inspection!
      report.detailedShortageRows.push({
        property: propId,
        room: unitId,
        category: ITEM_CATEGORIES.APPLIANCES,
        item: 'מכונת אספרסו',
        requiredQty: 1,
        verifiedQty: 0,
        shortageQty: 0,
        status: EQUIPMENT_STATUS.UNKNOWN,
        purchaseStatus: 'PENDING_PHYSICAL_VERIFICATION',
        notes: 'סטטוס טרם אומת פיזית בחדר - אין לדווח כחסר!'
      });
    }

    // 2. Audit Reusable Kitchen Equipment against standard
    const isFamily = profile.standard === EQUIPMENT_STANDARDS.FAMILY;
    const kitchenChecks = [
      { key: 'dinner_plates', name: 'צלחות עיקריות', required: isFamily ? 6 : 2 },
      { key: 'drinking_glasses', name: 'כוסות שתייה', required: isFamily ? 6 : 2 },
      { key: 'coffee_mugs', name: 'ספלי קפה', required: isFamily ? 6 : 2 },
      { key: 'wine_glasses', name: 'כוסות יין', required: isFamily ? 6 : 2 },
      { key: 'cutlery_sets', name: 'סט סכו״ם שלם', required: isFamily ? 6 : 2 },
      ...(isFamily ? [{ key: 'small_bowls', name: 'קעריות קטנות', required: 4 }] : []),
      { key: 'cooking_pot', name: 'סיר בישול', required: 1 },
      { key: 'frying_pan', name: 'מחבת טיגון', required: 1 }
    ];

    for (const check of kitchenChecks) {
      const verifiedVal = unitVerified[check.key];
      if (verifiedVal === undefined || verifiedVal === null || verifiedVal === EQUIPMENT_STATUS.UNKNOWN) {
        // Unknown is preserved, not treated as missing
        continue;
      }
      const verifiedNum = typeof verifiedVal === 'number' ? verifiedVal : 0;
      if (verifiedNum < check.required) {
        const shortage = check.required - verifiedNum;
        report.summary.totalShortages += shortage;
        report.shortagesByProperty[propId].shortageCount += shortage;
        const row = {
          property: propId,
          room: unitId,
          category: ITEM_CATEGORIES.KITCHEN,
          item: check.name,
          requiredQty: check.required,
          verifiedQty: verifiedNum,
          shortageQty: shortage,
          status: EQUIPMENT_STATUS.MISSING,
          purchaseStatus: 'REQUIRED_PURCHASE',
          notes: `חוסר של ${shortage} יח׳ לפי תקן ${profile.standard}`
        };
        report.detailedShortageRows.push(row);
        report.shortagesByProperty[propId].items.push(row);
      }
    }

    // 3. Purchase List Items: Strainers & Mixing Bowls (TBD Quantities)
    report.summary.strainersNeeded++;
    report.summary.mixingBowlsNeeded++;

    // 4. Spare bags operational improvement
    report.summary.spareBagsCabinDeficits++;
  }

  // Add global purchase requirements rows
  report.operationalImprovements.push({
    item: 'מסננת מטבח',
    category: ITEM_CATEGORIES.PURCHASE_LIST,
    targetCount: report.summary.totalUnitsAudited,
    status: 'PURCHASE_PLANNING_TBD',
    notes: 'רשימת רכש תפעולית - כמות מדויקת תקבע בריכוז ההזמנות'
  });
  report.operationalImprovements.push({
    item: 'קערת ערבוב',
    category: ITEM_CATEGORIES.PURCHASE_LIST,
    targetCount: report.summary.totalUnitsAudited,
    status: 'PURCHASE_PLANNING_TBD',
    notes: 'רשימת רכש תפעולית - כמות מדויקת תקבע בריכוז ההזמנות'
  });
  report.operationalImprovements.push({
    item: 'שקיות אשפה רזרבה (2 גדולות + 2 קטנות)',
    category: ITEM_CATEGORIES.CLEANING_WASTE,
    targetCount: report.summary.totalUnitsAudited,
    status: 'OPERATIONAL_IMPROVEMENT_ROLLOUT',
    notes: 'יעד תקן חדש: כרגע לא מושארות שקיות רזרבה. נדרש יישום מבצעי בכלל הבקתות'
  });

  return report;
}

/**
 * Chloe WhatsApp AI Assistant Query Helper.
 * Strictly separates REQUIRED STANDARD from ACTUAL VERIFIED INVENTORY.
 * Never claims an item exists if UNKNOWN, MISSING, or ON_REQUEST.
 */
export function queryChloeRoomEquipment({
  unitId,
  itemQuery = '',
  verifiedInventory = {},
  userRole = 'guest' // 'guest' | 'staff' | 'manager'
} = {}) {
  const profile = getUnitEquipmentProfile(unitId);
  const q = String(itemQuery || '').toLowerCase().trim();
  const unitVerified = verifiedInventory[unitId] || {};

  // Shabbat items (hotplate, water urn)
  if (/פלטת שבת|פלטה|מיחם|מים חמים לשבת|שבת/i.test(q)) {
    return {
      available: false,
      onDemand: true,
      messageHe: 'פלטת שבת ומיחם מים חמים ניתנים לאספקה בתיאום מראש בלבד, ואינם מותקנים באופן קבוע בבקתה. נשמח לתאם זאת עבורכם! 🕯️'
    };
  }

  // Clothes hangers
  if (/קולב|קולבים|מתלה בגדים/i.test(q)) {
    return {
      available: false,
      onDemand: false,
      messageHe: 'קולבים אינם חלק מהציוד התקני בבקתות האירוח כרגע.'
    };
  }

  // Espresso machine & capsules
  if (/אספרסו|נספרסו|קפסול|קפסולות|קפה/i.test(q)) {
    const espressoStatus = unitVerified.espresso_machine || EQUIPMENT_STATUS.UNKNOWN;
    if (espressoStatus === EQUIPMENT_STATUS.VERIFIED_PRESENT) {
      return {
        available: true,
        verified: true,
        capsulesProvided: 4,
        messageHe: 'בבקתה קיימת מכונת אספרסו תקינה ומסופקות 4 קפסולות אספרסו איכותיות, לצד ערכת קפה ותה עשירה. ☕'
      };
    }
    if (espressoStatus === EQUIPMENT_STATUS.MISSING) {
      return {
        available: false,
        verified: true,
        messageHe: 'בבקתה זו לא מותקנת כרגע מכונת אספרסו. בעמדת הקפה ממתינים לכם שקיקי נס קפה אישיים, קפה שחור איכותי, תה רגיל ותה מסאלה. ☕'
      };
    }
    // UNKNOWN: Never claim it is present!
    if (userRole === 'manager' || userRole === 'staff') {
      return {
        available: false,
        verified: false,
        status: EQUIPMENT_STATUS.UNKNOWN,
        messageHe: `סטטוס מכונת האספרסו בחדר ${unitId} מוגדר כ-UNKNOWN (טרם אומת פיזית). אין לדווח עליה כחסרה או כקיימת לפני אימות.`
      };
    }
    return {
      available: false,
      verified: false,
      messageHe: 'בעמדת הקפה בבקתה ממתינים לכם שקיקי נס קפה אישיים, קפה שחור, תה רגיל ומסאלה, וסוכרים. (לגבי מכונת אספרסו נשמח לבדוק את התאמת הבקתה עבורכם מול צוות השירות).'
    };
  }

  // Towels query
  if (/מגבת|מגבות|בריכה|פנים/i.test(q)) {
    return {
      standard: '2 body towels per guest + 1 face towel',
      messageHe: 'תקן המגבות בבקתה הוא 2 מגבות גוף/בריכה ומגבת פנים לכל אורח בהזמנה. 🛁'
    };
  }

  // General inside cabin query
  const isFamily = profile.standard === EQUIPMENT_STANDARDS.FAMILY;
  const hasJacuzzi = profile.hasJacuzzi !== false;
  let reply = `בתוך הבקתה (תקן ${isFamily ? 'משפחתי' : 'זוגי'}):\n` +
    `• מטבחון: מקרר, מיקרוגל, קומקום חשמלי, כיריים חשמליות, סיר, מחבת, כלי אוכל וסכו״ם מלא ל-${isFamily ? 6 : 2} סועדים.\n` +
    `• שתייה חמה: נס קפה אישי, קפה שחור, תה רגיל, תה מסאלה, סוכר לבן, חום וממתיקים.\n` +
    `• טקסטיל ורחצה: 2 מגבות ומגבת פנים לאדם, שמפו, סבון גוף, קרם גוף וסבון מוצק.\n` +
    (hasJacuzzi ? `• ג׳קוזי ספא פנימי/מרפסת מפנק.\n` : '') +
    `• מיזוג אוויר וטלוויזיה עם ממיר YES ו-Wi-Fi.`;

  return {
    available: true,
    messageHe: reply
  };
}
