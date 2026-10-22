/**
 * Guest reply templates by language (S17 + RU/AR, 2026-10-19).
 * Hebrew stays the default. Language is picked by the script of the guest's message.
 * Keep wording short and simple; policies must match the Hebrew text exactly
 * (check-out answers never mention check-in; codes/prices come from the callers).
 */
export type GuestLang = 'he' | 'en' | 'ru' | 'ar' | 'th';

/** Script-based detection: any Hebrew letter → he; else Cyrillic → ru; Arabic script → ar; Latin → en. */
export function detectGuestLang(text?: string | null): GuestLang {
  const t = String(text || '');
  if (/[\u0E00-\u0E7F]/.test(t)) return 'th';
  if (/[\u0590-\u05FF]/.test(t)) return 'he';
  const cyr = (t.match(/[\u0400-\u04FF]/g) || []).length;
  const arb = (t.match(/[\u0600-\u06FF\u0750-\u077F]/g) || []).length;
  const lat = (t.match(/[A-Za-z]/g) || []).length;
  if (cyr >= 2 && cyr >= arb && cyr >= lat) return 'ru';
  if (arb >= 2 && arb >= lat) return 'ar';
  if (lat >= 2) return 'en';
  return 'he';
}

type L = Partial<Record<GuestLang, string>> & Record<'he', string>;
const pick = (l: L, lang: GuestLang) => (l as any)[lang] ?? l.he;

export const CALL_OFFERS: L = {
  he: `תרצו שנתקשר אליכם? (השיבו *כן* ונחזור אליכם בהקדם 📞)`,
  en: `Would you like us to call you? (Reply *yes* and we'll get back to you soon 📞)`,
  ru: `Хотите, чтобы мы вам перезвонили? (Ответьте *да*, и мы скоро свяжемся с вами 📞)`,
  ar: `هل تريدون أن نتصل بكم؟ (أجيبوا *نعم* وسنعود إليكم قريبًا 📞)`,
  th: `ต้องการให้เราโทรกลับหาคุณไหม? (ตอบ *ใช่* แล้วเราจะติดต่อกลับโดยเร็ว 📞)`,
};
export const callOffer = (lang: GuestLang) => pick(CALL_OFFERS, lang);

/** True when a reply ends with a call-back offer (the pipeline then waits for "yes"). */
export function replyOffersCall(reply?: string | null): boolean {
  const r = String(reply || '');
  return Object.values(CALL_OFFERS).some((o) => r.includes(o)) || r.includes('השיבו *כן*');
}

const ddmm = (ymd: string) => { const [, m, d] = ymd.split('-'); return `${d}/${m}`; };
export const guestLink = (url: string | undefined, lang: GuestLang): string => link(url, lang);
const link = (url: string | undefined, lang: GuestLang) => url ? `\n\n📱 ${pick({ he: 'דף האורח שלכם', en: 'Your guest page', ru: 'Ваша страница гостя', ar: 'صفحة الضيف الخاصة بكم', th: 'หน้าผู้เข้าพักของคุณ' }, lang)}:\n${url}` : '';
const hi = (name: string | null | undefined, lang: GuestLang) => {
  const first = String(name || '').trim().split(/\s+/)[0];
  if (!first) return '';
  // A Hebrew-script name inside a Russian/Arabic/English reply reads oddly; skip it there.
  if (lang !== 'he' && /[\u0590-\u05FF]/.test(first)) return '';
  return `${first}, `;
};

export const T = {
  checkout: (lang: GuestLang, url?: string) => pick({
    he: `ℹ️ *צ׳ק-אאוט:*\n• שעת צ׳ק-אאוט רשמית: עד 11:00 בבוקר.\n• החל מהשעה 08:00 בבוקר ניתן לבצע צ׳ק-אאוט עצמי בלחיצה אחת דרך דף האורח הדיגיטלי שלכם.`,
    en: `ℹ️ *Check-out:*\n• Check-out is by 11:00 AM.\n• From 08:00 AM you can do a one-tap self check-out on your digital guest page.`,
    ru: `ℹ️ *Выезд:*\n• Выезд до 11:00.\n• С 08:00 можно оформить выезд самостоятельно в одно нажатие на вашей странице гостя.`,
    ar: `ℹ️ *تسجيل الخروج:*\n• تسجيل الخروج حتى الساعة 11:00 صباحًا.\n• من الساعة 08:00 صباحًا يمكنكم تسجيل الخروج الذاتي بضغطة واحدة في صفحة الضيف الرقمية.`,
  }, lang) + link(url, lang),

  /** checkInDate (YYYY-MM-DD) only when the guest's check-in is today or later. */
  /** ongoing = the guest is already mid-stay: state the time only, no "we'll send entry details". */
  checkin: (lang: GuestLang, checkInDate?: string, url?: string, ongoing = false) => {
    const d = checkInDate ? ddmm(checkInDate) : '';
    const time = pick({
      he: `🕒 *צ׳ק-אין:* החל מ־15:00${d ? ` (ההגעה שלכם: ${d})` : ''}.`,
      en: `🕒 *Check-in:* from 3:00 PM${d ? ` (your arrival: ${d})` : ''}.`,
      ru: `🕒 *Заезд:* с 15:00${d ? ` (ваш заезд: ${d})` : ''}.`,
      ar: `🕒 *تسجيل الدخول:* من الساعة 15:00${d ? ` (موعد وصولكم: ${d})` : ''}.`,
    }, lang);
    const entry = ongoing ? '' : '\n' + pick({
      he: `ברגע שהחדר מוכן נשלח לכם כאן את פרטי הכניסה.`,
      en: `As soon as the room is ready we'll send your entry details here.`,
      ru: `Как только номер будет готов, мы пришлём сюда данные для входа.`,
      ar: `عندما تصبح الغرفة جاهزة سنرسل لكم هنا تفاصيل الدخول.`,
    }, lang);
    return time + entry + link(url, lang);
  },

  /** Late check-out (Ran 2026-10-19 13:35): manager approval + room availability; first hour free, from the 2nd hour `fee` ₪/hour; the free hour also needs approval. */
  lateCheckoutPolicy: (lang: GuestLang, fee: number) => pick({
    he: `צ׳ק-אאוט מאוחר אפשרי רק באישור מנהל המתחם ובכפוף לזמינות: השעה הראשונה ללא חיוב, ומהשעה השנייה ${fee} ₪ לשעה. גם השעה הראשונה וגם כל זמן נוסף מחייבים אישור של המנהל.`,
    en: `Late check-out is possible only with the site manager's approval and subject to availability: the first hour is free of charge, and from the second hour it's ₪${fee} per hour. Both the free first hour and any extra paid time need the manager's approval.`,
    ru: `Поздний выезд возможен только с согласия менеджера комплекса и при наличии свободного номера: первый час бесплатно, со второго часа — ${fee} ₪ в час. И бесплатный первый час, и любое дополнительное время требуют согласия менеджера.`,
    ar: `تسجيل الخروج المتأخر ممكن فقط بموافقة مدير المجمع وحسب التوفر: الساعة الأولى بدون رسوم، ومن الساعة الثانية ${fee} ₪ للساعة. الساعة الأولى المجانية وأي وقت إضافي مدفوع يحتاجان موافقة المدير.`,
  }, lang),
  lateCheckoutNeedBooking: (lang: GuestLang, policy: string) => `🕚 ${policy}\n\n` + pick({
    he: `כדי שנוכל לבדוק עבורכם, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה 🙏`,
    en: `So we can check for you, please send me the phone number the booking was made with 🙏`,
    ru: `Чтобы мы могли проверить, пришлите номер телефона, на который оформлено бронирование 🙏`,
    ar: `لكي نفحص لكم، أرسلوا لي رقم الهاتف الذي تم الحجز به 🙏`,
  }, lang),
  lateCheckoutDateNote: (lang: GuestLang, checkout: string, asked: string) => pick({
    he: `לפי ההזמנה שלכם, הצ׳ק-אאוט הוא ב־${ddmm(checkout)} (ולא ב־${ddmm(asked)}).`,
    en: `According to your booking, check-out is on ${ddmm(checkout)} (not ${ddmm(asked)}).`,
    ru: `По вашему бронированию выезд ${ddmm(checkout)} (а не ${ddmm(asked)}).`,
    ar: `حسب حجزكم، تسجيل الخروج في ${ddmm(checkout)} (وليس ${ddmm(asked)}).`,
  }, lang) + '\n',
  lateCheckoutTaken: (lang: GuestLang, room: string, checkout: string) => pick({
    he: `מצטערים 🙏 ביום הצ׳ק-אאוט שלכם (${ddmm(checkout)}) ${room} כבר מוזמן לאורחים הבאים, ולכן לא נוכל להציע צ׳ק-אאוט מאוחר באותו יום. שעת הצ׳ק-אאוט היא עד 11:00.`,
    en: `Sorry 🙏 on your check-out day (${ddmm(checkout)}) ${room} is already booked by the next guests, so we can't offer a late check-out that day. Check-out is by 11:00.`,
    ru: `Извините 🙏 в день вашего выезда (${ddmm(checkout)}) ${room} уже забронирован следующими гостями, поэтому поздний выезд в этот день невозможен. Выезд до 11:00.`,
    ar: `نأسف 🙏 في يوم خروجكم (${ddmm(checkout)}) ${room} محجوز للضيوف التاليين، لذلك لا يمكننا تقديم خروج متأخر في ذلك اليوم. تسجيل الخروج حتى الساعة 11:00.`,
  }, lang),
  lateCheckoutFree: (lang: GuestLang, policy: string) => pick({
    he: `בשמחה נבדוק עבורכם! 🌿\n${policy}\nנבדוק מול מנהל המתחם ונחזור אליכם בהקדם. עד לקבלת אישור, שעת הצ׳ק-אאוט נשארת עד 11:00.`,
    en: `Happy to check for you! 🌿\n${policy}\nWe'll check with the site manager and get back to you soon. Until it's approved, check-out stays at 11:00.`,
    ru: `С радостью проверим! 🌿\n${policy}\nМы уточним у менеджера комплекса и скоро ответим. До подтверждения выезд остаётся до 11:00.`,
    ar: `يسعدنا أن نفحص لكم! 🌿\n${policy}\nسنتحقق مع مدير المجمع ونعود إليكم قريبًا. حتى الموافقة، يبقى تسجيل الخروج حتى الساعة 11:00.`,
  }, lang),

  wifiNeedBooking: (lang: GuestLang) => pick({
    he: `📶 אשמח לשלוח לכם את פרטי ה-WiFi של היחידה שלכם!\nכדי שאוכל לאתר את ההזמנה, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה 🙏`,
    en: `📶 Happy to send you the Wi-Fi details for your unit!\nTo find your booking, please send me the phone number the booking was made with 🙏`,
    ru: `📶 С радостью пришлю данные Wi-Fi для вашего номера!\nЧтобы найти бронирование, пришлите, пожалуйста, номер телефона, на который оно оформлено 🙏`,
    ar: `📶 يسعدني إرسال تفاصيل الواي فاي لوحدتكم!\nلكي أجد الحجز، أرسلوا لي من فضلكم رقم الهاتف الذي تم الحجز به 🙏`,
  }, lang),
  wifi: (lang: GuestLang, room: string, ssid: string, pw: string, url?: string) => pick({
    he: `📶 *פרטי ה-WiFi עבור ${room}:*\n• *שם רשת (SSID):* ${ssid}\n• *סיסמה:* ${pw}\n\nגלישה נעימה!`,
    en: `📶 *Wi-Fi for ${room}:*\n• *Network (SSID):* ${ssid}\n• *Password:* ${pw}\n\nEnjoy!`,
    ru: `📶 *Wi-Fi для ${room}:*\n• *Сеть (SSID):* ${ssid}\n• *Пароль:* ${pw}\n\nПриятного пользования!`,
    ar: `📶 *الواي فاي في ${room}:*\n• *اسم الشبكة (SSID):* ${ssid}\n• *كلمة السر:* ${pw}\n\nتصفحًا ممتعًا!`,
  }, lang) + link(url, lang),

  gate: (lang: GuestLang, code: string, url?: string) => pick({
    he: `🚪 *קוד השער למושב רמות:*\nהקוד לפתיחת שער הרכב הוא: *${code}* (כולל סולמית בהתחלה).`,
    en: `🚪 *Ramot village gate code:*\nThe car gate code is *${code}* (including the # at the start).`,
    ru: `🚪 *Код ворот посёлка Рамот:*\nКод автомобильных ворот: *${code}* (вместе с # в начале).`,
    ar: `🚪 *رمز بوابة موشاف رموت:*\nرمز بوابة السيارات هو *${code}* (مع علامة # في البداية).`,
  }, lang) + link(url, lang),
  gateNeedBooking: (lang: GuestLang) => pick({
    he: `🚪 את קוד השער אנחנו שולחים לאורחים רשומים בלבד.\nאם יש לכם הזמנה, כתבו לנו מהטלפון שאיתו בוצעה ההזמנה, או היכנסו לדף האורח מהקישור שקיבלתם באישור ההזמנה 🙏`,
    en: `🚪 We share the gate code with registered guests only.\nIf you have a booking, please message us from the phone number used for the booking, or open the guest page link from your booking confirmation 🙏`,
    ru: `🚪 Код ворот мы отправляем только зарегистрированным гостям.\nЕсли у вас есть бронь, напишите нам с номера, на который она оформлена, или откройте страницу гостя по ссылке из подтверждения 🙏`,
    ar: `🚪 نرسل رمز البوابة للضيوف المسجلين فقط.\nإذا كان لديكم حجز، راسلونا من رقم الهاتف الذي تم الحجز به، أو افتحوا صفحة الضيف من الرابط في تأكيد الحجز 🙏`,
  }, lang),

  lockbox: (lang: GuestLang, room: string, code: string, url?: string) => pick({
    he: `🔑 *קוד כספת המפתח של ${room}:* *${code}*\n\n*הוראות פתיחה:*\n1. הזינו את הקוד: *${code}* בגלגלות.\n2. לחצו על מתג הפתיחה ומשכו את מכסה הכספת כלפי מטה.\n3. הוציאו את המפתח.\n4. ערבלו את הגלגלות וסגרו את המכסה.`,
    en: `🔑 *Key box code for ${room}:* *${code}*\n\n*How to open:*\n1. Set the code *${code}* on the dials.\n2. Press the release and pull the cover down.\n3. Take the key.\n4. Scramble the dials and close the cover.`,
    ru: `🔑 *Код сейфа с ключом (${room}):* *${code}*\n\n*Как открыть:*\n1. Наберите код *${code}* на колёсиках.\n2. Нажмите кнопку и потяните крышку вниз.\n3. Возьмите ключ.\n4. Сбейте код и закройте крышку.`,
    ar: `🔑 *رمز صندوق المفتاح لـ ${room}:* *${code}*\n\n*طريقة الفتح:*\n1. أدخلوا الرمز *${code}* على العجلات.\n2. اضغطوا زر الفتح واسحبوا الغطاء للأسفل.\n3. خذوا المفتاح.\n4. غيّروا الأرقام وأغلقوا الغطاء.`,
  }, lang) + link(url, lang),
  lockboxOperational: (lang: GuestLang, room: string, hasBooking: boolean) => {
    if (lang === 'he') {
      return hasBooking
        ? `מרחב זה (${room}) הינו אזור תפעולי ואינו יחידת אירוח אורחים. כדי שנסדר לכם את פרטי הכניסה, כתבו כאן "תתקשרו אליי" ונחזור אליכם בהקדם 📞`
        : `מרחב זה (${room}) הינו אזור תפעולי ואינו יחידת אירוח אורחים. לקבלת פרטי הכניסה לבקתת האירוח שלכם, אנא כתבו לנו את שם המזמין המלא.`;
    }
    return pick({
      he: '',
      en: `${room} is an operational area, not a guest unit. To get the entry details for your unit, please send us the full name of the person who booked.`,
      ru: `${room} — служебное помещение, а не номер для гостей. Чтобы получить данные для входа в ваш номер, пришлите полное имя того, кто бронировал.`,
      ar: `${room} منطقة تشغيلية وليست وحدة ضيافة. للحصول على تفاصيل الدخول إلى وحدتكم، أرسلوا لنا الاسم الكامل لصاحب الحجز.`,
    }, lang);
  },

  payment: (lang: GuestLang, p: { room: string; paid: boolean; totalIls?: number; depositIls?: number; balanceIls?: number; url?: string }) => {
    const n = (v: number) => `₪${v.toLocaleString('he-IL')}`;
    const L: Record<GuestLang, { head: string; status: string; paid: string; due: string; total: string; deposit: string; balance: string; link: string }> = {
      he: { head: `💳 *פרטי תשלום עבור הזמנתכם (${p.room}):*`, status: 'סטטוס תשלום', paid: 'ההזמנה שלכם שולמה במלואה ✅', due: 'קיימת יתרה לתשלום עבור שהותכם ⏳', total: 'סה״כ להזמנה', deposit: 'שולם / מקדמה', balance: 'יתרה לתשלום', link: 'לצפייה בחשבונית, קבלה או ביצוע תשלום מאובטח בדף האורח האישי שלכם:' },
      en: { head: `💳 *Payment details for your booking (${p.room}):*`, status: 'Payment status', paid: 'Your booking is fully paid ✅', due: 'There is a balance to pay for your stay ⏳', total: 'Booking total', deposit: 'Paid / deposit', balance: 'Balance due', link: 'Invoice, receipt or secure payment on your guest page:' },
      ru: { head: `💳 *Оплата вашего бронирования (${p.room}):*`, status: 'Статус оплаты', paid: 'Бронирование полностью оплачено ✅', due: 'Есть остаток к оплате за проживание ⏳', total: 'Сумма бронирования', deposit: 'Оплачено / депозит', balance: 'Остаток к оплате', link: 'Счёт, квитанция или безопасная оплата на вашей странице гостя:' },
            th: { head: `💳 *รายละเอียดการชำระเงินสำหรับการจองของคุณ (${p.room}):*`, status: 'สถานะการชำระเงิน', paid: 'การจองของคุณชำระเงินครบถ้วนแล้ว ✅', due: 'มียอดคงเหลือที่ต้องชำระสำหรับที่พักของคุณ ⏳', total: 'ยอดรวมการจอง', deposit: 'ชำระแล้ว / มัดจำ', balance: 'ยอดคงเหลือที่ต้องชำระ', link: 'ดูใบแจ้งหนี้ ใบเสร็จ หรือชำระเงินอย่างปลอดภัยในหน้าผู้เข้าพักของคุณ:' },
      ar: { head: `💳 *تفاصيل الدفع لحجزكم (${p.room}):*`, status: 'حالة الدفع', paid: 'تم دفع الحجز بالكامل ✅', due: 'يوجد مبلغ متبقٍ للدفع عن إقامتكم ⏳', total: 'مجموع الحجز', deposit: 'المدفوع / العربون', balance: 'المتبقي للدفع', link: 'الفاتورة أو الإيصال أو الدفع الآمن في صفحة الضيف الخاصة بكم:' },
    };
    const l = L[lang] || L.he;
    let r = `${l.head}\n• ${l.status}: *${p.paid ? l.paid : l.due}*`;
    if (p.totalIls) {
      r += `\n• ${l.total}: *${n(p.totalIls)}*`;
      if (p.depositIls !== undefined) {
        r += `\n• ${l.deposit}: *${n(p.depositIls)}*`;
        if (!p.paid && (p.balanceIls || 0) > 0) r += `\n• ${l.balance}: *${n(p.balanceIls!)}*`;
      }
    }
    if (p.url) r += `\n\n📱 ${l.link}\n${p.url}`;
    return r;
  },
  paymentOtherGuest: (lang: GuestLang) => pick({
    he: '🔒 פרטי הזמנות, תשלומים ומחירים של אורחים אחרים הינם חסויים לחלוטין ואינם ניתנים לשיתוף.',
    en: '🔒 Bookings, payments and prices of other guests are strictly confidential.',
    ru: '🔒 Данные о бронированиях, оплатах и ценах других гостей строго конфиденциальны.',
    ar: '🔒 بيانات الحجوزات والمدفوعات والأسعار الخاصة بضيوف آخرين سرية تمامًا.',
  }, lang),
  paymentNoBooking: (lang: GuestLang) => pick({
    he: 'לבירור פרטי תשלום, עלויות או קבלות, אנא פנו למנהל המתחם או בדקו בקישור שנשלח אליכם בהודעת אישור ההזמנה.',
    en: 'For payment details, costs or receipts, please contact the site manager or check the link in your booking confirmation.',
    ru: 'По вопросам оплаты, стоимости или квитанций обратитесь к менеджеру комплекса или откройте ссылку из подтверждения бронирования.',
    ar: 'للاستفسار عن الدفع أو التكاليف أو الإيصالات، تواصلوا مع مدير المجمع أو افتحوا الرابط في رسالة تأكيد الحجز.',
  }, lang),

  /** Ran 2026-10-19: every complex has parking adjacent to the complex. */
  parking: (lang: GuestLang, url?: string) => pick({
    he: `🚗 בכל המתחמים שלנו יש חניה צמודה למתחם, אפשר לחנות ממש ליד.`,
    en: `🚗 Every one of our complexes has parking right next to the complex.`,
    ru: `🚗 У каждого нашего комплекса есть парковка рядом с комплексом.`,
    ar: `🚗 في كل مجمعاتنا يوجد موقف سيارات ملاصق للمجمع.`,
  }, lang) + link(url, lang),

  /** Ran 2026-10-19: dogs allowed in all complexes, +100 ₪ per dog per night. */
  pets: (lang: GuestLang, feeIls: number, nights?: number) => {
    const total = nights && nights > 0 ? feeIls * nights : 0;
    return pick({
      he: `🐶 כלבים מתקבלים בברכה בכל המתחמים!\nהתוספת היא ${feeIls} ₪ לכל כלב ללילה.` + (total ? `\nלשהות שלכם (${nights} לילות): ${total} ₪ לכל כלב.` : ''),
      en: `🐶 Dogs are welcome in all our complexes!\nThe extra charge is ₪${feeIls} per dog per night.` + (total ? `\nFor your stay (${nights} nights): ₪${total} per dog.` : ''),
      ru: `🐶 Собаки приветствуются во всех наших комплексах!\nДоплата — ${feeIls} ₪ за собаку за ночь.` + (total ? `\nЗа ваше проживание (${nights} ноч.): ${total} ₪ за собаку.` : ''),
      ar: `🐶 الكلاب مرحب بها في كل مجمعاتنا!\nالرسوم الإضافية ${feeIls} ₪ لكل كلب في الليلة.` + (total ? `\nلإقامتكم (${nights} ليالٍ): ${total} ₪ لكل كلب.` : ''),
    }, lang);
  },

  /** Ran 2026-10-19 12:47: mid-stay cleaning is free for every stay. No staff dispatch; the call-back offer handles timing. */
  cleaning: (lang: GuestLang) => pick({
    he: `🧹 בשמחה! ניקיון באמצע השהות ניתן ללא עלות, והצוות יתאם איתכם שעה נוחה.\nכדי שנתאם, ` + CALL_OFFERS.he,
    en: `🧹 Of course! A mid-stay cleaning is free, and the team will arrange a convenient time with you.\nTo arrange it: ` + CALL_OFFERS.en,
    ru: `🧹 Конечно! Уборка во время проживания бесплатна, команда согласует с вами удобное время.\nЧтобы договориться: ` + CALL_OFFERS.ru,
    ar: `🧹 بكل سرور! التنظيف خلال الإقامة مجاني، وسينسق الفريق معكم وقتًا مناسبًا.\nللتنسيق: ` + CALL_OFFERS.ar,
  }, lang),

  extensionNeedBooking: (lang: GuestLang) => pick({
    he: `🌙 נשמח לבדוק הארכה! כדי שאוכל לאתר את ההזמנה, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה 🙏`,
    en: `🌙 Happy to check an extension! To find your booking, please send me the phone number the booking was made with 🙏`,
    ru: `🌙 С радостью проверим продление! Чтобы найти бронирование, пришлите номер телефона, на который оно оформлено 🙏`,
    ar: `🌙 يسعدنا فحص التمديد! لكي أجد الحجز، أرسلوا لي رقم الهاتف الذي تم الحجز به 🙏`,
  }, lang),
  extensionTaken: (lang: GuestLang, room: string, night: string) => pick({
    he: `🌙 בדקתי: מצטערים, ${room} כבר מוזמן בלילה של ${ddmm(night)}, ולכן אי אפשר להאריך באותה יחידה.\n` + CALL_OFFERS.he,
    en: `🌙 I checked: sorry, ${room} is already booked for the night of ${ddmm(night)}, so we can't extend in the same unit.\n` + CALL_OFFERS.en,
    ru: `🌙 Я проверила: к сожалению, ${room} уже забронирован на ночь ${ddmm(night)}, поэтому продлить в этом же номере нельзя.\n` + CALL_OFFERS.ru,
    ar: `🌙 فحصت: نأسف، ${room} محجوز في ليلة ${ddmm(night)}، لذلك لا يمكن التمديد في نفس الوحدة.\n` + CALL_OFFERS.ar,
  }, lang),
  /** price: nightly rack rate from src/pricing/priceList.ts (null → no rate for this unit). */
  extensionFree: (lang: GuestLang, room: string, night: string, price: { ils: number; weekend: boolean } | null) => {
    const he = price ? `לפי המחירון: *₪${price.ils.toLocaleString('he-IL')}* ללילה (${price.weekend ? 'מחיר סופ״ש' : 'מחיר אמצ״ש'}).` : `המחיר לפי המחירון של היחידה.`;
    const en = price ? `Per our price list: *₪${price.ils.toLocaleString('he-IL')}* per night (${price.weekend ? 'weekend rate' : 'weekday rate'}).` : `The price is per the unit's price list.`;
    const ru = price ? `По прайс-листу: *₪${price.ils.toLocaleString('he-IL')}* за ночь (${price.weekend ? 'тариф выходных' : 'тариф будних дней'}).` : `Цена — по прайс-листу номера.`;
    const ar = price ? `حسب قائمة الأسعار: *₪${price.ils.toLocaleString('he-IL')}* لليلة (${price.weekend ? 'سعر نهاية الأسبوع' : 'سعر وسط الأسبوع'}).` : `السعر حسب قائمة أسعار الوحدة.`;
    return pick({
      he: `🌙 בדקתי: ${room} פנוי בלילה של ${ddmm(night)} (הלילה שאחרי סיום ההזמנה שלכם).\n${he}\nההארכה טעונה אישור של מנהל המתחם, וההזמנה לא שונתה עדיין.\n` + CALL_OFFERS.he,
      en: `🌙 I checked: ${room} is free on the night of ${ddmm(night)} (the night after your booking ends).\n${en}\nThe extension needs the site manager's approval; your booking hasn't been changed yet.\n` + CALL_OFFERS.en,
      ru: `🌙 Я проверила: ${room} свободен в ночь на ${ddmm(night)} (ночь после окончания вашей брони).\n${ru}\nПродление подтверждает менеджер комплекса, бронирование пока не изменено.\n` + CALL_OFFERS.ru,
      ar: `🌙 فحصت: ${room} متاح في ليلة ${ddmm(night)} (الليلة التي تلي نهاية حجزكم).\n${ar}\nالتمديد يحتاج موافقة مدير المجمع، ولم يتم تغيير الحجز بعد.\n` + CALL_OFFERS.ar,
    }, lang);
  },

  faultNeedBooking: (lang: GuestLang) => pick({
    he: `מצטערים על התקלה 🙏 כדי שנוכל לעזור, שלחו לי בבקשה את מספר הטלפון שאיתו בוצעה ההזמנה.`,
    en: `Sorry about the problem 🙏 So we can help, please send me the phone number the booking was made with.`,
    ru: `Извините за неполадку 🙏 Чтобы мы могли помочь, пришлите номер телефона, на который оформлено бронирование.`,
    ar: `نأسف على العطل 🙏 لكي نساعدكم، أرسلوا لي رقم الهاتف الذي تم الحجز به.`,
  }, lang),
  fault: (lang: GuestLang) => pick({
    he: `מצטערים על התקלה ותודה שעדכנתם 🙏\n` + CALL_OFFERS.he,
    en: `Sorry about the problem, and thanks for letting us know 🙏\n` + CALL_OFFERS.en,
    ru: `Извините за неполадку и спасибо, что сообщили 🙏\n` + CALL_OFFERS.ru,
    ar: `نأسف على العطل وشكرًا لأنكم أبلغتمونا 🙏\n` + CALL_OFFERS.ar,
  }, lang),
  complaint: (lang: GuestLang, name?: string | null) => pick({
    he: `${hi(name, 'he')}אני מאוד מצטערת לשמוע 🙏 זה ממש לא מה שרצינו שתרגישו אצלנו.\nתרצו שמנהל המתחם יחזור אליכם כדי לטפל בזה? (השיבו *כן* ונחזור אליכם בהקדם 📞)`,
    en: `${hi(name, 'en')}I'm really sorry to hear that 🙏 This is not the experience we want you to have.\nWould you like the site manager to call you to sort it out? (Reply *yes* and we'll get back to you soon 📞)`,
    ru: `${hi(name, 'ru')}Мне очень жаль это слышать 🙏 Мы совсем не хотели, чтобы у вас было такое впечатление.\nХотите, чтобы менеджер комплекса перезвонил вам и всё решил? (Ответьте *да*, и мы скоро свяжемся с вами 📞)`,
    ar: `${hi(name, 'ar')}يؤسفني جدًا سماع ذلك 🙏 هذا ليس ما نريده لكم عندنا.\nهل تريدون أن يتصل بكم مدير المجمع لمعالجة الأمر؟ (أجيبوا *نعم* وسنعود إليكم قريبًا 📞)`,
  }, lang),
  vagueProblem: (lang: GuestLang, name?: string | null) => pick({
    he: `${hi(name, 'he')}אוי, מצטערת 🙏 מה קרה? כתבו לי במה מדובר (למשל מזגן, מים חמים, ניקיון או משהו אחר) ואעזור.`,
    en: `${hi(name, 'en')}Oh, sorry about that 🙏 What happened? Tell me what it's about (for example A/C, hot water, cleaning or something else) and I'll help.`,
    ru: `${hi(name, 'ru')}Ой, извините 🙏 Что случилось? Напишите, в чём дело (например, кондиционер, горячая вода, уборка или другое), и я помогу.`,
    ar: `${hi(name, 'ar')}نأسف لذلك 🙏 ماذا حدث؟ اكتبوا لي ما المشكلة (مثلًا المكيف، الماء الساخن، التنظيف أو شيء آخر) وسأساعدكم.`,
  }, lang),
  thanks: (lang: GuestLang, name?: string | null) => pick({
    he: `${hi(name, 'he')}תודה רבה, משמח לשמוע! 🌿 אנחנו כאן אם תצטרכו משהו.`,
    en: `${hi(name, 'en')}Thank you so much, glad to hear it! 🌿 We're here if you need anything.`,
    ru: `${hi(name, 'ru')}Большое спасибо, очень приятно! 🌿 Мы на связи, если что-то понадобится.`,
    ar: `${hi(name, 'ar')}شكرًا جزيلًا، يسعدنا سماع ذلك! 🌿 نحن هنا إذا احتجتم أي شيء.`,
  }, lang),
  callConfirmed: (lang: GuestLang) => pick({
    he: `בשמחה! העברנו את הבקשה לצוות המתחם ונחזור אליכם טלפונית בהקדם. 📞`,
    en: `Sure! We've passed your request to the team and will call you back soon. 📞`,
    ru: `Конечно! Мы передали вашу просьбу команде и скоро вам перезвоним. 📞`,
    ar: `بكل سرور! نقلنا طلبكم إلى الفريق وسنتصل بكم قريبًا. 📞`,
  }, lang),
  fallback: (lang: GuestLang, room: string, url?: string) => pick({
    he: `אין לי תשובה מדויקת לשאלה הזו כרגע — ${CALL_OFFERS.he}\n\nבינתיים, כל המידע על שהותכם ב${room} (קוד WiFi, שער הישוב, הוראות ג'קוזי, מסעדות, אטרקציות וצ'ק-אאוט) זמין תמיד בדף האורח שלכם:\n` + (url ? `📱 ${url}\n\n` : '') + `מאחלים לכם שהות נעימה ושלווה!`,
    en: `I don't have an exact answer to that right now. ${CALL_OFFERS.en}\n\nMeanwhile, everything about your stay in ${room} (Wi-Fi, gate code, jacuzzi, restaurants, activities and check-out) is on your guest page:\n` + (url ? `📱 ${url}` : ''),
    ru: `У меня пока нет точного ответа на этот вопрос. ${CALL_OFFERS.ru}\n\nА пока вся информация о проживании в ${room} (Wi-Fi, код ворот, джакузи, рестораны, развлечения и выезд) есть на вашей странице гостя:\n` + (url ? `📱 ${url}` : ''),
    ar: `ليس لدي جواب دقيق على هذا السؤال حاليًا. ${CALL_OFFERS.ar}\n\nفي هذه الأثناء، كل المعلومات عن إقامتكم في ${room} (الواي فاي، رمز البوابة، الجاكوزي، المطاعم، الأنشطة وتسجيل الخروج) موجودة في صفحة الضيف:\n` + (url ? `📱 ${url}` : ''),
  }, lang).trim(),
};

/** Guest "yes" to a call-back offer, in the guest languages. */
export const GUEST_YES_RE = /^(?:да|ага|конечно|давайте|пожалуйста|نعم|اي|إي|ايوه|أيوه|اكيد|أكيد|طيب|yes|yeah|yep|sure|please)[!.\s]*$/iu;
