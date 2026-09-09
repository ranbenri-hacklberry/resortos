import React from 'react';
import {
  MapPin,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { NorthStarIcon } from './MialeesBrandAssets';
import { listAllProperties } from '../../lib/multiPropertyCatalog';

export function AllResortsShowcase({ onOpenCalendarModal }) {
  const allProperties = listAllProperties();

  return (
    <section id="resorts-showcase" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="flex items-center justify-center gap-2 mb-3">
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--brand-secondary)] font-medium">
            הקולקציה המלאה של רמת הגולן והכנרת
          </span>
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--brand-primary)] mb-4">
          מתחמי הנופש והבקתות היוקרתיות
        </h2>
        <p className="text-[var(--brand-secondary)] text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
          12 מתחמי נופש ייחודיים במושב רמות, נאות גולן, גבעת יואב ונוב. בחרו מתחם לצפייה בלוח השנה המלא, מחירים יומיים וסגירה מיידית.
        </p>
      </div>

      {/* Grid of all 12 properties */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {allProperties.map((prop) => {
          const firstUnit = prop.units?.[0];
          const basePrice = firstUnit?.basePrice || 850;
          const unitsCount = prop.units?.filter((u) => !u.isFullBuyout).length || prop.units?.length || 3;

          return (
            <div
              key={prop.id}
              className="bg-white rounded-3xl overflow-hidden border border-stone-200 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group"
            >
              {/* Image Container */}
              <div className="relative h-64 overflow-hidden">
                <img
                  src={prop.heroImage}
                  alt={prop.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

                {/* Village Tag */}
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/20">
                  <MapPin className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>{prop.village}</span>
                </div>

                {/* Units Count Badge */}
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md text-[var(--brand-primary)] text-xs font-bold px-2.5 py-1 rounded-xl shadow-sm">
                  {unitsCount} בקתות / יחידות
                </div>

                {/* Name & Tagline at bottom of image */}
                <div className="absolute bottom-4 right-4 left-4 text-white">
                  <h3 className="text-xl font-bold mb-0.5">{prop.name}</h3>
                  <p className="text-xs text-white/80 line-clamp-1">{prop.tagline}</p>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
                {/* Amenity Pills - All property amenities */}
                <div className="flex flex-wrap gap-1.5">
                  {(prop.amenities || []).map((amenity, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-stone-100 text-stone-800 px-3 py-1.5 rounded-xl border border-stone-200/60 transition-colors hover:bg-stone-200/70"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#8C6239] shrink-0" />
                      <span>{amenity}</span>
                    </span>
                  ))}
                </div>

                {/* Pricing & Actions */}
                <div className="pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] text-stone-400">החל מ-</div>
                    <div className="text-lg font-bold text-[var(--brand-primary)] font-montserrat">
                      ₪{basePrice.toLocaleString()}{' '}
                      <span className="text-xs font-normal text-stone-500 font-sans">/ לילה</span>
                    </div>
                  </div>

                  {/* Open Calendar Popup Button */}
                  <button
                    type="button"
                    onClick={() => onOpenCalendarModal(prop)}
                    className="px-4 py-2.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-darkSoft)] text-white font-bold text-xs flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                  >
                    <Calendar className="w-4 h-4 text-[#C5A880]" />
                    <span>לוח שנה ומחירים</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
