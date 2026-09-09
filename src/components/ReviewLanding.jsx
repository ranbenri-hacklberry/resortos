import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Coffee,
  Compass,
  Home,
  MessageCircle,
  Printer,
  QrCode,
  Search,
  Sparkles,
  Star,
  Utensils,
  Wrench
} from '../lib/lucide-reviews.js';
import { APP_NAME } from '../lib/reviewBrand.js';
import { fetchReviewPlaceAudit, searchReviewPlacesPublic } from '../lib/reviewAuth.js';
import { writeDemoPlace } from '../lib/reviewLead.js';
import ReviewAuditCard from './ReviewAuditCard.jsx';
import '../whastar.css';

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Cta({ children, onClick, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#15803d] bg-[#25d366] px-5 py-2.5 text-[14px] font-extrabold text-[#052e16] shadow-none transition hover:bg-[#2be36f] hover:border-[#166534] active:scale-[0.98] ${className}`}
    >
      {children}
      <ArrowLeft size={16} strokeWidth={2.5} />
    </button>
  );
}

function HeroSearch({ onStart, ctaLabel }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (audit || auditing || q.length < 2) {
      setRows([]);
      setBusy(false);
      return undefined;
    }
    const id = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchReviewPlacesPublic(q);
        if (seq.current !== id) return;
        setError('');
        setRows(data.suggestions || []);
      } catch (_) {
        if (seq.current !== id) return;
        setRows([]);
        setError('החיפוש לא זמין כרגע. אפשר להמשיך להרשמה.');
      } finally {
        if (seq.current === id) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, audit, auditing]);

  async function pick(row) {
    setQuery('');
    setRows([]);
    setError('');
    setAuditing(true);
    writeDemoPlace(row);
    try {
      const next = await fetchReviewPlaceAudit(row.placeId);
      setAudit(next);
      writeDemoPlace({
        placeId: next.placeId || row.placeId,
        name: next.name || row.name,
        address: next.address || row.address,
        label: next.name || row.name
      });
    } catch (_) {
      setAudit({
        placeId: row.placeId,
        name: row.name,
        address: row.address || '',
        photoUrl: '',
        rating: 0,
        reviewCount: 0,
        lastReviewLabel: '',
        score: 42,
        scoreLabel: 'חלקי',
        checks: [
          {
            id: 'direct_link',
            title: 'קישור ישיר לדירוג',
            status: 'fail',
            detail: 'אין קישור שמקפיץ ללקוח ישר את חלונית 5 הכוכבים. זה הפער ש-WhaStar סוגר.'
          }
        ]
      });
    } finally {
      setAuditing(false);
    }
  }

  function reset() {
    setAudit(null);
    setAuditing(false);
    setQuery('');
    setRows([]);
    setError('');
    writeDemoPlace(null);
  }

  if (audit) {
    return <ReviewAuditCard audit={audit} onStart={onStart} onReset={reset} ctaLabel={ctaLabel} />;
  }

  return (
    <div id="create" className="rounded-[28px] border border-ws-line bg-ws-card p-5 shadow-[0_18px_40px_rgba(87,64,40,0.10)]">
      <label className="mb-2 block text-[12px] font-bold text-ws-muted">חפשו את העסק — אבחון חינם לכרטיס גוגל</label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ws-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="קפה בנחל, סוויטות נוף, שם הצימר…"
          autoComplete="off"
          className="w-full rounded-2xl border border-ws-line bg-white py-3.5 pr-11 pl-4 text-[15px] text-ws-ink outline-none placeholder:text-ws-muted/80 focus:border-[#25d366]"
        />
      </div>
      {auditing ? <div className="mt-3 text-[12px] font-bold text-ws-gold">בודקים את בריאות הכרטיס…</div> : null}
      {busy && !auditing ? <div className="mt-3 text-[12px] text-ws-muted">מחפש…</div> : null}
      {error ? <div className="mt-3 text-[12px] font-bold text-red-700">{error}</div> : null}
      {rows.length && !auditing ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-ws-line bg-white">
          {rows.map((row) => (
            <button
              key={row.placeId}
              type="button"
              onClick={() => pick(row)}
              className="block w-full border-b border-ws-line px-4 py-3 text-right last:border-b-0 hover:bg-ws-well"
            >
              <div className="text-[14px] font-extrabold text-ws-ink">{row.name}</div>
              {row.address ? <div className="mt-0.5 text-[12px] text-ws-muted">{row.address}</div> : null}
            </button>
          ))}
        </div>
      ) : !auditing ? (
        <p className="mt-3 text-[12px] leading-5 text-ws-muted">
          מקבלים ציון, תמונה, ומה פוגע בדירוג. קישור וואטסאפ ו-QR — אחרי הרשמה.
        </p>
      ) : null}
    </div>
  );
}

export default function ReviewLanding({ onStart, onLogin, signedIn = false }) {
  const startLabel = signedIn ? 'כניסה למערכת' : 'התחל בחינם';
  const signupLabel = signedIn ? 'כניסה למערכת' : 'הרשמה חינם';

  return (
    <div dir="rtl" className="ws-page min-h-dvh bg-ws font-sans text-ws-ink antialiased">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(900px_420px_at_80%_-10%,rgba(194,65,12,0.10),transparent),radial-gradient(700px_280px_at_0%_0%,rgba(37,211,102,0.08),transparent)]" />

      <header className="sticky top-0 z-20 border-b border-ws-line bg-ws/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight text-ws-ink">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ws-gold/15 text-ws-gold">
              <Sparkles size={16} />
            </span>
            {APP_NAME}
          </div>
          <Cta onClick={onStart} className="px-4 py-2 text-[13px]">{startLabel}</Cta>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-24 pt-12 sm:pt-20">
        <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <p className="mb-4 text-[12px] font-bold tracking-[0.14em] text-ws-gold">אבחון חינמי לכרטיס גוגל</p>
            <h1 className="max-w-[18ch] text-[2.15rem] font-extrabold leading-[1.15] tracking-tight text-ws-ink sm:text-[2.75rem]">
              מה ציון הכרטיס שלכם במפות — ומה פוגע בדירוג
            </h1>
            <p className="mt-5 max-w-[40ch] text-[16px] leading-7 text-ws-muted">
              חפשו את העסק, קבלו ציון בריאות עם תמונה ומדדים אמיתיים מגוגל, ואז הפיקו קישור וואטסאפ ו-QR שמקפיצים ישר ל־5 כוכבים.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Cta onClick={() => scrollToId('create')}>בדקו את העסק</Cta>
              {signedIn ? (
                <button type="button" onClick={onStart} className="text-[14px] font-bold text-ws-muted hover:text-ws-ink">
                  כניסה למערכת
                </button>
              ) : (
                <button type="button" onClick={onLogin} className="text-[14px] font-bold text-ws-muted hover:text-ws-ink">
                  כבר רשומים? כניסה
                </button>
              )}
            </div>
          </div>
          <HeroSearch onStart={onStart} ctaLabel={signedIn ? 'כניסה למערכת' : undefined} />
        </section>

        <section id="why" className="mt-24 scroll-mt-24 sm:mt-32">
          <p className="text-[12px] font-bold tracking-[0.14em] text-ws-gold">למה זה עובד</p>
          <h2 className="mt-3 max-w-[20ch] text-[1.7rem] font-extrabold tracking-tight text-ws-ink">קודם רואים את הפער. אחר כך סוגרים אותו בחינם.</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-[28px] border border-ws-line bg-ws-line sm:grid-cols-3">
            {[
              { icon: Star, title: 'אבחון כרטיס', text: 'ציון, תמונה, ביקורות ושעות — לפי הנתונים שגוגל באמת מחזיר על העסק.' },
              { icon: MessageCircle, title: 'שליחה בוואטסאפ', text: 'הודעה מוכנה עם קישור שמקפיץ ישר את חלונית 5 הכוכבים.' },
              { icon: QrCode, title: 'QR לשולחן', text: 'שלט לדלפק. סורקים ומדרגים, בלי לחפש את העסק במפות.' }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-ws-card px-6 py-7">
                  <Icon size={18} className="text-ws-gold" />
                  <div className="mt-4 text-[16px] font-extrabold">{item.title}</div>
                  <p className="mt-2 text-[14px] leading-6 text-ws-muted">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-20 grid gap-8 sm:grid-cols-2 sm:gap-16">
          <div>
            <h3 className="text-[13px] font-bold text-ws-muted">בלי WhaStar</h3>
            <ul className="mt-4 space-y-3 text-[15px] leading-6 text-ws-muted">
              <li>מחפשים את העסק בגוגל ומפספסים את כפתור הדירוג</li>
              <li>מעתיקים לינק ארוך שהאורח נתקע איתו במפות</li>
              <li>מבקשים בעל פה — ואז זה נשכח</li>
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ws-gold">עם חשבון WhaStar</h3>
            <ul className="mt-4 space-y-3 text-[15px] leading-6 text-ws-ink">
              <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#15803d]" /> לחיצה אחת לחלונית 5 כוכבים</li>
              <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#15803d]" /> הודעת וואטסאפ מוכנה, מספר מפורמט</li>
              <li className="flex gap-2"><Check size={16} className="mt-1 shrink-0 text-[#15803d]" /> QR קבוע על השולחן או בדלפק</li>
            </ul>
          </div>
        </section>

        <section className="mt-20 flex flex-wrap gap-2">
          {[
            [Utensils, 'מסעדות ועגלות קפה'],
            [Home, 'צימרים ומתחמים'],
            [Compass, 'מדריכי סיורים'],
            [Wrench, 'בעלי מקצוע'],
            [Coffee, 'עסקים שכונתיים'],
            [Printer, 'דלפק ושולחן']
          ].map(([Icon, label]) => (
            <span key={label} className="inline-flex items-center gap-2 rounded-full border border-ws-line bg-ws-card px-3.5 py-1.5 text-[13px] font-bold text-ws-muted">
              <Icon size={13} className="text-ws-gold" />
              {label}
            </span>
          ))}
        </section>

        <section className="mt-24 rounded-[32px] border border-ws-line bg-ws-card px-6 py-12 text-center shadow-[0_18px_40px_rgba(87,64,40,0.08)] sm:px-12">
          <Star size={18} className="mx-auto text-ws-gold" />
          <h2 className="mt-4 text-[1.8rem] font-extrabold tracking-tight text-ws-ink">מוכנים לתקן את הציון?</h2>
          <p className="mx-auto mt-3 max-w-[36ch] text-[15px] leading-6 text-ws-muted">
            {signedIn
              ? 'החשבון פעיל. אפשר להיכנס ולהפיק קישור ו-QR לעסק שאבחנתם.'
              : 'האבחון חינם. אחרי הרשמה מקבלים קישור וואטסאפ ושלט QR לאותו עסק.'}
          </p>
          <Cta onClick={onStart} className="mt-7">{signupLabel}</Cta>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-ws-line px-5 py-8 text-[12px] font-bold text-ws-muted">
        <span>© {APP_NAME}</span>
        <a href="#/privacy" className="hover:text-ws-ink">מדיניות פרטיות</a>
      </footer>
    </div>
  );
}
