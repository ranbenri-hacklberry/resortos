import React, { useState } from 'react';
import {
  MapPin,
  Utensils,
  Compass,
  Star,
  ChevronDown,
  ExternalLink,
  Sparkles,
  Waves,
  HeartHandshake,
  Shield,
  Coffee
} from 'lucide-react';
import { RESTAURANTS, TRAILS } from '../../lib/areaGuide';
import { NorthStarIcon, BrandBadge } from './MialeesBrandAssets';

export function AttractionsGuide({ property }) {
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const faqs = property.faqs || [];
  const reviews = property.reviews || [];
  const amenities = property.amenities || [];

  return (
    <div className="space-y-24 py-16">
      {/* Amenities & Luxury Brand Touchpoints Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="flex items-center justify-center gap-2 mb-3">
            <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
            <span className="text-xs uppercase tracking-[0.25em] text-[var(--brand-secondary)] font-medium">
              סטנדרט האירוח והפינוקים
            </span>
            <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--brand-primary)] mb-3">
            החוויה והפרטים הקטנים
          </h2>
          <p className="text-[var(--brand-secondary)] text-sm sm:text-base">
            כל פרט במתחם תוכנן בקפידה כדי להעניק לכם חוויית חופשה מושלמת ובלתי נשכחת.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {amenities.map((item, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-white border border-[var(--brand-borderLight)] hover:border-[var(--brand-border)] transition-all hover:shadow-md flex flex-col justify-between"
            >
              <div className="w-12 h-12 rounded-xl bg-[var(--brand-surfaceSoft)] flex items-center justify-center text-[var(--brand-accent)] mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--brand-primary)] mb-1">{item.title}</h3>
                <p className="text-xs text-[var(--brand-secondary)] leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Local Attractions & Dining in the Golan */}
      <section className="bg-[var(--brand-surfaceSoft)] py-20 border-y border-[var(--brand-borderLight)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Compass className="w-5 h-5 text-[var(--brand-accent)]" />
              <span className="text-xs uppercase tracking-[0.25em] text-[var(--brand-secondary)] font-medium">
                אטרקציות וקולינריה בסביבה
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--brand-primary)] mb-3">
              לגלות את קסם רמת הגולן והכנרת
            </h2>
            <p className="text-[var(--brand-secondary)] text-sm sm:text-base">
              המתחם ממוקם במיקום אסטרטגי קרוב למסלולי מים, חופי כנרת, יקבי בוטיק ומסעדות שף מעולות.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Nature & Springs */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[var(--brand-borderLight)] shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--brand-borderLight)]">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Waves className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[var(--brand-primary)]">טבע, מעיינות ומסלולים</h3>
                  <p className="text-xs text-stone-500">מסלולי טיול במרחק דקות נסיעה</p>
                </div>
              </div>

              <div className="space-y-4">
                {TRAILS.slice(0, 3).map((attr) => (
                  <div key={attr.id} className="p-4 rounded-xl bg-stone-50 border border-stone-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm text-[var(--brand-primary)]">{attr.title}</h4>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100/60 text-blue-800 font-medium">
                        {attr.kind}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mb-1">{attr.desc}</p>
                    {attr.hours ? (
                      <div className="text-[11px] text-stone-500 mb-3">שעות פתיחה: {attr.hours}</div>
                    ) : null}
                    <a
                      href={attr.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--brand-accent)] hover:underline flex items-center gap-1 self-start"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>נווט בוויז</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Restaurants & Wineries */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[var(--brand-borderLight)] shadow-sm">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--brand-borderLight)]">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-[var(--brand-primary)]">מסעדות שף ויקבים מומלצים</h3>
                  <p className="text-xs text-stone-500">טעמים מקומיים וחוויות קולינריות</p>
                </div>
              </div>

              <div className="space-y-4">
                {RESTAURANTS.slice(0, 3).map((rest) => (
                  <div key={rest.id} className="p-4 rounded-xl bg-stone-50 border border-stone-100 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm text-[var(--brand-primary)]">{rest.title}</h4>
                      <span className="text-[11px] text-stone-500">{rest.dist}</span>
                    </div>
                    <div className="text-xs text-stone-600 mb-1">{rest.kind}</div>
                    <div className="text-[11px] text-stone-400 mb-3">
                      {rest.hours ? `שעות פתיחה: ${rest.hours} · ` : ''}טלפון: {rest.phone}
                    </div>
                    <a
                      href={rest.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--brand-accent)] hover:underline flex items-center gap-1 self-start"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>נווט בוויז</span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Guest Reviews (5 Stars) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="flex items-center justify-center gap-1 text-amber-400 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-current" />
            ))}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--brand-primary)] mb-3">
            אורחים מספרים על החוויה
          </h2>
          <p className="text-[var(--brand-secondary)] text-sm sm:text-base">
            אירוח 5 כוכבים שמשאיר טעם של עוד
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {reviews.map((rev, i) => (
            <div
              key={i}
              className="p-8 rounded-3xl bg-white border border-[var(--brand-borderLight)] shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-1 text-amber-400 mb-4">
                  {[...Array(rev.rating || 5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-[var(--brand-primary)] leading-relaxed italic mb-6">
                  "{rev.text}"
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-[var(--brand-borderLight)] text-xs text-[var(--brand-secondary)]">
                <span className="font-bold text-[var(--brand-primary)]">{rev.name}</span>
                <span>{rev.date}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-[var(--brand-primary)] mb-3">
            שאלות נפוצות
          </h2>
          <p className="text-sm text-[var(--brand-secondary)]">
            כל מה שחשוב לדעת לקראת השהייה שלכם
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-[var(--brand-borderLight)] bg-white overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? -1 : idx)}
                  className="w-full p-5 text-right font-bold text-sm sm:text-base text-[var(--brand-primary)] flex items-center justify-between hover:bg-stone-50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[var(--brand-secondary)] transition-transform duration-200 shrink-0 mr-4 ${
                      isOpen ? 'rotate-180 text-[var(--brand-accent)]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[var(--brand-secondary)] leading-relaxed border-t border-stone-100 bg-stone-50/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
