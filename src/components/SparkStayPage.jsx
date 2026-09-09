import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Menu,
  Moon,
  PlugZap,
  Wallet,
  X,
  Zap
} from 'lucide-react';

const CONTACT_PHONE = '972548076123';
const LANG_KEY = 'sparkstay-landing-lang';

const COPY = {
  he: {
    dir: 'rtl',
    htmlLang: 'he',
    title: 'SparkStay | טעינה לילית לצימרים',
    langSwitch: 'EN',
    langAria: 'Switch to English',
    nav: {
      how: 'איך זה עובד',
      why: 'יתרונות',
      who: 'למי זה',
      contact: 'השאירו פרטים'
    },
    cta: 'השאירו פרטים',
    ctaNav: 'השאירו פרטים',
    ctaSecondary: 'איך זה עובד',
    heroKicker: 'טעינה לילית בחניית הצימר · חיבור תלת-פאזי רגיל',
    heroTitle: 'האורחים מגיעים עם רכב חשמלי. הצימר שלכם מוכן?',
    heroLead:
      'האורח טוען בלילה בחניה — בלי לצאת מהמתחם ובלי להעמיס על רשת החשמל. מספיק חיבור תלת-פאזי רגיל. אתם לא משלמים כלום על העמדה. אחרי שמחזירים לכם את עלות החשמל, אתם נשארים עם 20% מהרווחים.',
    heroAlt: 'בקתה מול הכנרת בלילה, רכב חשמלי נטען בחניה וטבריה ממול',
    proof: [
      { value: '20%', title: 'מהרווחים', text: 'נשארים עם 20% מהרווחים, אחרי החזר עלות החשמל.' },
      { value: '₪0', title: 'לא משלמים כלום', text: 'לא על העמדה ולא על ההתקנה.' },
      { value: 'לילה', title: 'בלי עומס על הרשת', text: 'האורח טוען כשהמתחם שקט — הרשת לא נלחצת.' },
      { value: '3Ø', title: 'תלת-פאזי רגיל', text: 'בלי שדרוג מיוחד. רוב הצימרים כבר מחוברים.' }
    ],
    nightKicker: 'למה בלילה',
    nightTitle: 'טעינה לילית, לא עמדת דרך מהירה',
    nightText:
      'הרכב עומד בחניה כל הלילה. אין צורך בהספק קיצוני, אין קפיצה בחשמל של המתחם, ואין עומס על הרשת כמו בעמדות ציבוריות בצהריים.',
    stepsKicker: 'איך זה עובד',
    stepsTitle: 'שלושה שלבים. בלי כאב ראש תפעולי.',
    steps: [
      { n: '01', title: 'בודקים תלת-פאזי רגיל', text: 'רוב הצימרים כבר מחוברים. מאשרים הספק, חניה וגישה — בלי שדרוג רשת.' },
      { n: '02', title: 'התקנה מסודרת', text: 'יום עבודה אחד בדרך כלל. בלי לשבור את החוויה לאורחים שבבית.' },
      { n: '03', title: '20% מהרווחים — בלי לשלם כלום', text: 'האורח משלם. עלות החשמל חוזרת אליכם. אתם נשארים עם 20% מהרווחים, בלי עלות על העמדה.' }
    ],
    whyKicker: 'יתרונות',
    whyTitle: 'למה בעלי צימרים שמים עמדה בחניה',
    benefits: [
      { title: '20% מהרווחים, בלי לשלם', text: 'אתם לא משלמים כלום על העמדה. מחזירים לכם את עלות החשמל, ואתם נשארים עם 20% מהרווחים.' },
      { title: 'לא מעמיס על הרשת', text: 'טעינה לילית איטית בחניה. בלי שיא צהריים, בלי לקרוע את החיבור של המתחם.' },
      { title: 'חיבור תלת-פאזי רגיל', text: 'לא צריך תשתית של כביש מהיר. אם יש תלת-פאזי רגיל — אפשר להתקין.' },
      { title: 'יתרון בהזמנה', text: 'אורחים עם רכב חשמלי מסננים לפי טעינה בבוקינג ובגוגל. בלי עמדה — הם מדלגים.' }
    ],
    whoKicker: 'למי זה',
    whoTitle: 'נבנה לצימרים, לא לרשתות כביש מהיר',
    audiences: [
      { title: 'צימר / סוויטה', text: 'יחידה אחת או שתיים עם חניה פרטית.' },
      { title: 'מתחם בוטיק', text: '3–20 יחידות שרוצות עמדה משותפת או לכל חניה.' },
      { title: 'כפר נופש / גולן', text: 'אורחים שמגיעים ברכב לסופ״ש וצריכים לחזור טעונים.' }
    ],
    formKicker: 'השאירו פרטים',
    formTitle: 'נחזור אליכם עם הצעה למתחם',
    formLead: 'שם, טלפון ומספר יחידות. בלי עלות ובלי התחייבות — נבדוק אם יש תלת-פאזי רגיל.',
    namePh: 'שם מלא',
    propertyPh: 'שם הצימר / המתחם',
    phonePh: 'טלפון',
    unitsPh: 'מספר יחידות',
    notePh: 'הערה (אופציונלי)',
    send: 'שליחת פנייה בוואטסאפ',
    contactHint: '054-807-6123',
    waPrefill: 'היי, מתעניין בעמדת SparkStay לצימר.',
    footerNote: 'עמדות טעינה לילית לצימרים ומתחמי נופש.',
    rights: 'כל הזכויות שמורות'
  },
  en: {
    dir: 'ltr',
    htmlLang: 'en',
    title: 'SparkStay | Overnight charging for cabins',
    langSwitch: 'עב',
    langAria: 'מעבר לעברית',
    nav: {
      how: 'How it works',
      why: 'Benefits',
      who: 'Who it’s for',
      contact: 'Leave details'
    },
    cta: 'Leave details',
    ctaNav: 'Leave details',
    ctaSecondary: 'How it works',
    heroKicker: 'Overnight charging on the cabin lot · standard 3-phase',
    heroTitle: 'Guests arrive in an electric car. Is the cabin ready?',
    heroLead:
      'Guests charge overnight in the driveway — no trip off-site, no strain on the grid. A regular three-phase connection is enough. You pay nothing for the station. After we reimburse your electricity cost, you keep 20% of the profits.',
    heroAlt: 'Night cabin overlooking the Sea of Galilee and Tiberias, electric car charging beside it',
    proof: [
      { value: '20%', title: 'of the profits', text: 'You keep 20% of the profits, after electricity is reimbursed.' },
      { value: '₪0', title: 'You pay nothing', text: 'Not for the station, not for the install.' },
      { value: 'Night', title: 'No grid strain', text: 'The car charges while the property is quiet.' },
      { value: '3Ø', title: 'Regular 3-phase', text: 'No special upgrade. Most cabins already have it.' }
    ],
    nightKicker: 'Why overnight',
    nightTitle: 'Overnight charging, not a highway fast-charger',
    nightText:
      'The car sits in the bay all night. No extreme power, no jump in the property bill, no midday grid spike like public chargers.',
    stepsKicker: 'How it works',
    stepsTitle: 'Three steps. No ops headache.',
    steps: [
      { n: '01', title: 'Confirm standard 3-phase', text: 'Most cabins already have it. We check power, parking, and access — no grid upgrade.' },
      { n: '02', title: 'Clean install', text: 'Usually one work day. Guests already on site keep their stay.' },
      { n: '03', title: '20% of the profits — you pay nothing', text: 'The guest pays. Electricity cost comes back to you. You keep 20% of the profits, with no cost for the station.' }
    ],
    whyKicker: 'Benefits',
    whyTitle: 'Why cabin owners put a charger on the lot',
    benefits: [
      { title: '20% of profits, zero cost', text: 'You pay nothing for the station. We reimburse electricity; you keep 20% of the profits.' },
      { title: 'Doesn’t load the grid', text: 'Slow overnight charging in the bay. No midday peak, no tearing the property connection.' },
      { title: 'Regular three-phase', text: 'Not highway infrastructure. If you already have 3-phase, we can install.' },
      { title: 'Win the booking', text: 'Guests with an electric car filter for charging on Booking and Google. No charger — they skip you.' }
    ],
    whoKicker: 'Who it’s for',
    whoTitle: 'Built for cabins, not highway networks',
    audiences: [
      { title: 'Cabin / suite', text: 'One or two units with a private parking bay.' },
      { title: 'Boutique complex', text: '3–20 units that want a shared bay or one per unit.' },
      { title: 'Golan / village stay', text: 'Weekend drivers who need to leave charged.' }
    ],
    formKicker: 'Leave details',
    formTitle: 'We’ll come back with an offer for your site',
    formLead: 'Name, phone, and unit count. No cost, no commitment — we check for a regular three-phase line.',
    namePh: 'Full name',
    propertyPh: 'Property name',
    phonePh: 'Phone',
    unitsPh: 'Number of units',
    notePh: 'Note (optional)',
    send: 'Send on WhatsApp',
    contactHint: '054-807-6123',
    waPrefill: 'Hi, I am interested in a SparkStay charger for my cabin.',
    footerNote: 'Overnight chargers for cabins and holiday stays.',
    rights: 'All rights reserved'
  }
};

function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="12" fill="#12141c" stroke="#34d399" strokeWidth="1.5" />
      <path d="M24 10 L20 22 H27 L22 38 L30 24 H23 Z" fill="#fbbf24" stroke="#f4efe4" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function SparkStayPage() {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'he';
    } catch {
      return 'he';
    }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState('');
  const [property, setProperty] = useState('');
  const [phone, setPhone] = useState('');
  const [units, setUnits] = useState('');
  const [note, setNote] = useState('');
  const t = COPY[lang];
  const isRTL = t.dir === 'rtl';
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const heroSrc = `${import.meta.env.BASE_URL}sparkstay-hero.jpg`;

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.documentElement.dir = t.dir;
    document.title = t.title;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, [lang, t.dir, t.htmlLang, t.title]);

  const waHref = useMemo(() => {
    const lines = [t.waPrefill];
    if (name) lines.push(`${lang === 'he' ? 'שם' : 'Name'}: ${name}`);
    if (property) lines.push(`${lang === 'he' ? 'מתחם' : 'Property'}: ${property}`);
    if (phone) lines.push(`${lang === 'he' ? 'טלפון' : 'Phone'}: ${phone}`);
    if (units) lines.push(`${lang === 'he' ? 'יחידות' : 'Units'}: ${units}`);
    if (note) lines.push(note);
    return `https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [t.waPrefill, name, property, phone, units, note, lang]);

  const go = (id) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="ss" dir={t.dir}>
      <div className="ss-glow" />
      <header className="ss-nav">
        <a
          className="ss-brand"
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Logo />
          <span>SparkStay</span>
        </a>
        <nav className={`ss-links ${menuOpen ? 'open' : ''}`}>
          <button type="button" onClick={() => go('how')}>{t.nav.how}</button>
          <button type="button" onClick={() => go('why')}>{t.nav.why}</button>
          <button type="button" onClick={() => go('who')}>{t.nav.who}</button>
          <button type="button" onClick={() => go('contact')}>{t.nav.contact}</button>
        </nav>
        <div className="ss-nav-actions">
          <button type="button" className="ss-lang" onClick={() => setLang((prev) => (prev === 'he' ? 'en' : 'he'))} aria-label={t.langAria}>
            <Globe size={15} />
            {t.langSwitch}
          </button>
          <a className="ss-btn ss-btn-primary ss-nav-cta" href={waHref} target="_blank" rel="noopener noreferrer">
            {t.ctaNav}
          </a>
          <button type="button" className="ss-menu" onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="ss-hero" id="top">
          <div>
            <p className="ss-kicker">{t.heroKicker}</p>
            <h1>{t.heroTitle}</h1>
            <p className="ss-lead">{t.heroLead}</p>
            <div className="ss-actions">
              <a className="ss-btn ss-btn-primary" href="#contact" onClick={(e) => { e.preventDefault(); go('contact'); }}>
                {t.cta} <Arrow size={16} />
              </a>
              <button type="button" className="ss-btn ss-btn-ghost" onClick={() => go('how')}>
                {t.ctaSecondary}
              </button>
            </div>
          </div>
          <div className="ss-hero-visual">
            <img className="ss-hero-photo" src={heroSrc} alt={t.heroAlt} />
          </div>
        </section>

        <section className="ss-proof">
          {t.proof.map((item) => (
            <div key={item.value}>
              <b>{item.value}</b>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </div>
          ))}
        </section>

        <section className="ss-night">
          <div className="ss-night-inner">
            <Moon size={22} />
            <div>
              <p className="ss-kicker">{t.nightKicker}</p>
              <h2>{t.nightTitle}</h2>
              <p className="ss-lead">{t.nightText}</p>
            </div>
          </div>
        </section>

        <section className="ss-section" id="how">
          <p className="ss-kicker">{t.stepsKicker}</p>
          <h2>{t.stepsTitle}</h2>
          <div className="ss-steps">
            {t.steps.map((step) => (
              <article key={step.n}>
                <em>{step.n}</em>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ss-section" id="why">
          <p className="ss-kicker">{t.whyKicker}</p>
          <h2>{t.whyTitle}</h2>
          <div className="ss-why">
            {t.benefits.map((item, index) => (
              <article key={item.title}>
                <span className="ss-icon">
                  {index === 0 ? <Wallet size={18} /> : index === 1 ? <Moon size={18} /> : index === 2 ? <PlugZap size={18} /> : <Zap size={18} />}
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ss-section" id="who">
          <p className="ss-kicker">{t.whoKicker}</p>
          <h2>{t.whoTitle}</h2>
          <div className="ss-who">
            {t.audiences.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ss-contact" id="contact">
          <div>
            <p className="ss-kicker">{t.formKicker}</p>
            <h2>{t.formTitle}</h2>
            <p className="ss-lead">{t.formLead}</p>
          </div>
          <form
            className="ss-form"
            onSubmit={(e) => {
              e.preventDefault();
              window.open(waHref, '_blank', 'noopener,noreferrer');
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePh} required />
            <input value={property} onChange={(e) => setProperty(e.target.value)} placeholder={t.propertyPh} required />
            <div className="ss-form-row">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.phonePh} required />
              <input value={units} onChange={(e) => setUnits(e.target.value)} placeholder={t.unitsPh} />
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} rows={3} />
            <button type="submit" className="ss-btn ss-btn-primary">
              {t.send} <Arrow size={16} />
            </button>
            <p className="ss-hint" dir="ltr">{t.contactHint}</p>
          </form>
        </section>
      </main>

      <footer className="ss-footer">
        <div className="ss-brand">
          <Logo size={28} />
          <span>SparkStay</span>
        </div>
        <p>{t.footerNote}</p>
        <small>© {new Date().getFullYear()} SparkStay. {t.rights}.</small>
      </footer>
    </div>
  );
}

export default SparkStayPage;
