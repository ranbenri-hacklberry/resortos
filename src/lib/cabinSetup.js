function loc(he, en) {
  return { he, en, ar: he, th: he };
}

/** Cleaning first, then restock / verify. Used as the housekeeping SOP. */
export const CABIN_CLEAN_STEPS = [
  { id: 'linens', label: loc('החלפת מצעים ומגבות', 'Replace linens and towels') },
  { id: 'bath', label: loc('ניקוי מקלחת, כיור ושירותים', 'Clean shower, sink, and toilet') },
  { id: 'floors', label: loc('שאיבה ושטיפת רצפות', 'Vacuum and mop floors') },
  { id: 'surfaces', label: loc('ניגוב משטחים, זכוכית וריהוט', 'Wipe surfaces, glass, and furniture') },
  { id: 'trash', label: loc('ריקון פחים והחלפת שקיות', 'Empty bins and replace bags') },
  { id: 'coffee', label: loc('מילוי פינת קפה ושתייה', 'Restock coffee and drinks station') },
  { id: 'amenities', label: loc('השלמת מוצרי רחצה ונייר', 'Restock toiletries and paper') },
  { id: 'final', label: loc('בדיקת ריח, תאורה ונראות סופית', 'Final check: scent, lights, and look') }
];

export const CABIN_SETUP_ITEMS = [
  { id: 'setup_sheets', group: 'linens', label: loc('מצעים מלאים לכל מיטה — סדין, ציפה, ציפיות, שמיכה', 'Full linens per bed — sheet, duvet cover, pillowcases, blanket') },
  { id: 'setup_bath_towels', group: 'towels', label: loc('מגבות רחצה — 2 לאדם', 'Bath towels — 2 per guest') },
  { id: 'setup_pool_towels', group: 'towels', label: loc('מגבת בריכה — 1 לאדם', 'Pool towel — 1 per guest') },
  { id: 'setup_face_towels', group: 'towels', label: loc('מגבת פנים — 2 לבקתה', 'Face towels — 2 per cabin') },
  { id: 'setup_floor_towels', group: 'towels', label: loc('מגבת רצפה — 2 לבקתה', 'Floor towels — 2 per cabin') },
  { id: 'setup_bath_mat', group: 'towels', label: loc('שטיחון אמבטיה — 1 לבקתה', 'Bath mat — 1 per cabin') },
  { id: 'setup_dish_towel', group: 'towels', label: loc('מגבת כלים / מטלית מטבח נפרדת מהסמרטוט', 'Dish towel, separate from the floor rag') },
  { id: 'setup_soap_shampoo', group: 'bath', label: loc('סבון ושמפו — 1 לאדם ללילה', 'Soap and shampoo — 1 per guest per night') },
  { id: 'setup_hand_soap', group: 'bath', label: loc('סבון ידיים ליד הכיור', 'Hand soap at the sink') },
  { id: 'setup_toilet_paper', group: 'bath', label: loc('נייר טואלט — 2–3 גלילים', 'Toilet paper — 2–3 rolls') },
  { id: 'setup_toilet_brush', group: 'bath', label: loc('מברשת אסלה וגומי', 'Toilet brush and plunger') },
  { id: 'setup_bath_bin', group: 'bath', label: loc('פח אמבטיה עם שקית קטנה', 'Bathroom bin with a small bag') },
  { id: 'setup_hair_dryer', group: 'bath', label: loc('מייבש שיער', 'Hair dryer') },
  { id: 'setup_shower_curtain', group: 'bath', label: loc('ווילון מקלחת / פקק אמבטיה — אם יש אמבט', 'Shower curtain / bath plug if there is a tub') },
  { id: 'setup_coffee_station', group: 'pantry', label: loc('קפה, תה, נס קפה, סוכר לבן וחום, סוכרזית', 'Coffee, tea, instant coffee, white and brown sugar, sweetener') },
  { id: 'setup_capsules', group: 'pantry', label: loc('קפסולות אספרסו — 8–10 אם יש מכונה (או 2 לאדם ללילה)', 'Espresso capsules — 8–10 if there is a machine') },
  { id: 'setup_salt_pepper', group: 'pantry', label: loc('מלח ופלפל', 'Salt and pepper') },
  { id: 'setup_kitchen_paper', group: 'kitchen', label: loc('נייר מטבח', 'Kitchen paper') },
  { id: 'setup_dish_soap', group: 'kitchen', label: loc('סבון כלים', 'Dish soap') },
  { id: 'setup_kitchen_rag', group: 'kitchen', label: loc('סמרטוט למטבח', 'Kitchen rag') },
  { id: 'setup_scotch', group: 'kitchen', label: loc('סקוץ׳ למטבח', 'Kitchen scourer') },
  { id: 'setup_cups_disp', group: 'kitchen', label: loc('כוסות חד־פעמיות — מים / אספרסו / 8oz', 'Disposable cups — water / espresso / 8oz') },
  { id: 'setup_kitchen_bin', group: 'kitchen', label: loc('פח מטבח עם שקית גדולה', 'Kitchen bin with a large bag') },
  { id: 'setup_board_knife', group: 'cookware', label: loc('קרש חיתוך וסכין', 'Cutting board and knife') },
  { id: 'setup_wood_spoon', group: 'cookware', label: loc('כף בישול / כף עץ', 'Cooking spoon') },
  { id: 'setup_openers', group: 'cookware', label: loc('פותחן בקבוקים ופותחן שימורים', 'Bottle opener and can opener') },
  { id: 'setup_bowls', group: 'cookware', label: loc('קערות', 'Bowls') },
  { id: 'setup_pot_lid', group: 'cookware', label: loc('מכסה לסיר', 'Pot lid') },
  { id: 'setup_pitcher', group: 'cookware', label: loc('כד / פיצ׳ר למים', 'Water pitcher') },
  { id: 'setup_hotplate', group: 'appliances', label: loc('כירה חשמלית', 'Electric hotplate') },
  { id: 'setup_pot', group: 'appliances', label: loc('סיר אחד', 'One pot') },
  { id: 'setup_pan', group: 'appliances', label: loc('מחבת אחת', 'One pan') },
  { id: 'setup_plates_glasses', group: 'appliances', label: loc('צלחות וכוסות', 'Plates and glasses') },
  { id: 'setup_cutlery', group: 'appliances', label: loc('סכו״ם', 'Cutlery') },
  { id: 'setup_kettle', group: 'appliances', label: loc('קומקום', 'Kettle') },
  { id: 'setup_espresso', group: 'appliances', label: loc('מכונת אספרסו — אם יש ביחידה', 'Espresso machine if the unit has one') },
  { id: 'setup_ac_remote', group: 'remotes', label: loc('שלט מזגן — במקום ועובד', 'AC remote — present and working') },
  { id: 'setup_tv_remote', group: 'remotes', label: loc('שלט טלוויזיה — במקום ועובד', 'TV remote — present and working') },
  { id: 'setup_yes_remote', group: 'remotes', label: loc('שלט YES — במקום ועובד', 'YES remote — present and working') },
  { id: 'setup_remote_batteries', group: 'remotes', label: loc('סוללות לשלטים / בדיקה שהשלט נדלק', 'Remote batteries / remotes power on') },
  { id: 'setup_wifi_codes', group: 'guest', label: loc('דף Wi‑Fi + קוד כספת / ג׳קוזי', 'Wi‑Fi sheet and lockbox / jacuzzi code') },
  { id: 'setup_flashlight', group: 'guest', label: loc('פנס או תאורת חירום', 'Flashlight or emergency light') },
  { id: 'setup_if_jacuzzi', group: 'optional', label: loc('אם יש ג׳קוזי — נקי, הוראות במקום', 'If jacuzzi — clean, instructions in place') },
  { id: 'setup_if_dishwasher', group: 'optional', label: loc('אם יש מדיח — מלח / הוראות', 'If dishwasher — salt / instructions') },
  { id: 'setup_if_oven', group: 'optional', label: loc('אם יש תנור — נקי ותבנית במקום', 'If oven — clean, tray in place') },
  { id: 'setup_if_washer', group: 'optional', label: loc('אם יש מכונת כביסה — ריקה ונקייה', 'If washer — empty and clean') },
  { id: 'setup_if_pool', group: 'optional', label: loc('אם יש בריכה פרטית — מגבות ונראות', 'If private pool — towels and look') }
];

export function housekeepingSopSteps() {
  return [...CABIN_CLEAN_STEPS, ...CABIN_SETUP_ITEMS.map(({ id, label }) => ({ id, label }))];
}
