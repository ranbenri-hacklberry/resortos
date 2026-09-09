import React, { useState } from 'react';
import {
  Users,
  Bed,
  Bath,
  Maximize2,
  Sparkles,
  CheckCircle2,
  Calendar,
  Lock,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Waves,
  Coffee,
  Tv,
  Wifi,
  Flame,
  ShieldCheck
} from 'lucide-react';
import { BrandBadge, NorthStarIcon } from './MialeesBrandAssets';

export function PropertyUnits({
  property,
  selectedUnit,
  onSelectUnit,
  checkIn,
  checkOut,
  blockedUnitIds = [],
  onOpenBooking
}) {
  const [activePhotoModal, setActivePhotoModal] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);

  const units = property.units || [];
  const individualUnits = units.filter(u => !u.isFullBuyout);
  const buyoutUnit = units.find(u => u.isFullBuyout);

  // Full Buyout Availability check: Available ONLY IF 0 individual units are blocked in the range
  const anyIndividualBlocked = individualUnits.some(u => blockedUnitIds.includes(u.id));
  const isBuyoutAvailable = !anyIndividualBlocked;

  function openGallery(unit, idx = 0) {
    setActivePhotoModal(unit);
    setPhotoIndex(idx);
  }

  return (
    <section id="units-section" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="h-[1px] w-8 bg-[var(--brand-border)]" />
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--brand-secondary)] font-medium">
            יחידות האירוח והמתחם
          </span>
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
          <div className="h-[1px] w-8 bg-[var(--brand-border)]" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--brand-primary)] mb-4">
          בחרו את חוויית השהייה המושלמת עבורכם
        </h2>
        <p className="text-[var(--brand-secondary)] text-base sm:text-lg leading-relaxed">
          מגוון אפשרויות אירוח יוקרתיות: מווילה מרווחת בת 4 חדרים למשפחות ועד סוויטות בוטיק רומנטיות עם בריכה וג׳קוזי פרטיים מול הכנרת.
        </p>
      </div>

      {/* Individual Units Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {individualUnits.map((unit) => {
          const isSelected = selectedUnit?.id === unit.id;
          const isBlocked = blockedUnitIds.includes(unit.id);
          const images = unit.images || [property.heroImage];

          return (
            <div
              key={unit.id}
              className={`group flex flex-col rounded-2xl overflow-hidden bg-white border transition-all duration-300 shadow-sm hover:shadow-xl ${
                isSelected
                  ? 'border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)]/30 transform -translate-y-1'
                  : 'border-[var(--brand-borderLight)] hover:border-[var(--brand-border)]'
              }`}
            >
              {/* Image Carousel Preview */}
              <div className="relative aspect-[16/10] overflow-hidden bg-stone-100">
                <img
                  src={images[0]}
                  alt={unit.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                {/* Top Badges */}
                <div className="absolute top-3 right-3 flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/95 text-[var(--brand-dark)] backdrop-blur shadow-sm">
                    {unit.type === 'villa' ? 'וילת יוקרה' : unit.type === 'suite' ? 'סוויטת בוטיק' : 'בקתת עץ'}
                  </span>
                  {unit.bedrooms && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-black/40 text-white backdrop-blur">
                      {unit.bedrooms} חדרים
                    </span>
                  )}
                </div>

                {/* Open Full Gallery Button */}
                <button
                  type="button"
                  onClick={() => openGallery(unit, 0)}
                  className="absolute top-3 left-3 p-2 rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur transition-colors"
                  title="צפה בכל התמונות"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {/* Bottom Overlay Title on Image */}
                <div className="absolute bottom-3 right-3 left-3 text-white">
                  <h3 className="text-xl font-bold leading-tight drop-shadow-sm">{unit.name}</h3>
                  {unit.englishName && (
                    <p className="text-xs text-white/80 tracking-wider font-light uppercase font-montserrat">{unit.englishName}</p>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  {/* Occupancy and specs bar */}
                  <div className="flex items-center gap-4 text-xs text-[var(--brand-secondary)] pb-4 mb-4 border-b border-[var(--brand-borderLight)]">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-[var(--brand-accent)]" />
                      <span>עד {unit.maxOccupancy} אורחים</span>
                    </div>
                    {unit.sizeM2 && (
                      <div className="flex items-center gap-1">
                        <Maximize2 className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                        <span>{unit.sizeM2} מ״ר</span>
                      </div>
                    )}
                    {unit.bathrooms && (
                      <div className="flex items-center gap-1">
                        <Bath className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
                        <span>{unit.bathrooms} מקלחות</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-[var(--brand-secondary)] leading-relaxed mb-4 line-clamp-3">
                    {unit.description}
                  </p>

                  {/* Features / Highlights */}
                  <div className="space-y-2 mb-6">
                    {(unit.features || []).slice(0, 4).map((feat, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-stone-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--brand-accent)] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                    {(unit.features || []).length > 4 && (
                      <button
                        type="button"
                        onClick={() => openGallery(unit, 0)}
                        className="text-xs text-[var(--brand-accent)] font-medium hover:underline pt-1"
                      >
                        + עוד {(unit.features || []).length - 4} פינוקים ומתקנים
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Footer: Pricing & Action */}
                <div className="pt-4 border-t border-[var(--brand-borderLight)]">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <div className="text-xs text-stone-500">מחיר ללילה החל מ-</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-[var(--brand-primary)]">
                          ₪{(unit.basePrice || 0).toLocaleString()}
                        </span>
                        <span className="text-xs text-stone-500">/ אמצ״ש</span>
                      </div>
                      <div className="text-[11px] text-stone-400">
                        סופ״ש: ₪{(unit.weekendPrice || Math.round(unit.basePrice * 1.3)).toLocaleString()} ללילה
                      </div>
                    </div>

                    {isBlocked ? (
                      <span className="px-3 py-1 rounded bg-stone-100 text-stone-400 text-xs font-medium flex items-center gap-1">
                        <Lock className="w-3 h-3" /> תפוס בתאריכים אלו
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectUnit(unit);
                      if (onOpenBooking) onOpenBooking();
                    }}
                    className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                      isSelected
                        ? 'bg-[var(--brand-primary)] text-white shadow-md'
                        : 'bg-[var(--brand-surfaceSoft)] text-[var(--brand-primary)] hover:bg-[var(--brand-primary)] hover:text-white border border-[var(--brand-borderLight)]'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>{isSelected ? 'נבחר להזמנה ✓' : 'בחר יחידה זו והמשך להזמנה'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Buyout Featured Card */}
      {buyoutUnit && (
        <div
          className={`relative rounded-3xl overflow-hidden border p-6 sm:p-10 transition-all duration-300 ${
            selectedUnit?.id === buyoutUnit.id
              ? 'bg-[var(--brand-primary)] text-white border-[var(--brand-accent)] ring-4 ring-[var(--brand-accent)]/20 shadow-2xl'
              : 'bg-gradient-to-br from-[var(--brand-primary)] via-[#321C18] to-[var(--brand-darkSoft)] text-white border-[var(--brand-borderLight)] shadow-xl'
          }`}
        >
          {/* Subtle Star Overlay Pattern */}
          <div className="absolute top-6 left-6 opacity-10 pointer-events-none">
            <NorthStarIcon className="w-48 h-48" color="#FFFFFF" />
          </div>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#C5A880] text-[#26130F] tracking-wide uppercase shadow-sm flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  המתחם כולו בבלעדיות (Full Buyout)
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/90 backdrop-blur">
                  עד {buyoutUnit.maxOccupancy} אורחים
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/90 backdrop-blur">
                  {buyoutUnit.bedrooms} חדרי שינה
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
                {buyoutUnit.name}
              </h3>
              <p className="text-white/80 text-sm sm:text-base leading-relaxed mb-6 max-w-2xl">
                {buyoutUnit.description}
              </p>

              {/* Included Units Badges */}
              <div className="mb-6">
                <div className="text-xs text-[#C5A880] font-semibold mb-2 tracking-wider">
                  המתחם כולל נעילה בלעדית של:
                </div>
                <div className="flex flex-wrap gap-2">
                  {individualUnits.map((u) => (
                    <span key={u.id} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/15 text-white flex items-center gap-1.5 border border-white/10">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#C5A880]" />
                      {u.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Features List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/90">
                {(buyoutUnit.features || []).map((feat, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#C5A880] shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price & Buyout CTA */}
            <div className="lg:col-span-4 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/15 text-center flex flex-col justify-between">
              <div>
                <div className="text-xs text-white/70 mb-1">מחיר לסגירת כל המתחם</div>
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-3xl sm:text-4xl font-bold text-white">
                    ₪{(buyoutUnit.basePrice || 4800).toLocaleString()}
                  </span>
                  <span className="text-xs text-white/70">/ לילה באמצ״ש</span>
                </div>
                <div className="text-xs text-white/60 mb-6">
                  סופ״ש: ₪{(buyoutUnit.weekendPrice || 6200).toLocaleString()} ללילה
                </div>
              </div>

              {isBuyoutAvailable ? (
                <button
                  type="button"
                  onClick={() => {
                    onSelectUnit(buyoutUnit);
                    if (onOpenBooking) onOpenBooking();
                  }}
                  className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all duration-200 shadow-lg ${
                    selectedUnit?.id === buyoutUnit.id
                      ? 'bg-[#C5A880] text-[#26130F] ring-2 ring-white'
                      : 'bg-white text-[var(--brand-primary)] hover:bg-[#C5A880] hover:text-[#26130F]'
                  }`}
                >
                  {selectedUnit?.id === buyoutUnit.id
                    ? 'המתחם כולו נבחר להזמנה ✓'
                    : 'שריין את כל המתחם בבלעדיות'}
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-xs text-red-200 flex items-center justify-center gap-1.5">
                  <Lock className="w-4 h-4" />
                  חלק מהיחידות תפוסות בתאריכים אלו — המתחם המלא אינו זמין
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Photo Gallery Modal */}
      {activePhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col bg-stone-900 rounded-2xl overflow-hidden border border-stone-800">
            {/* Modal Header */}
            <div className="p-4 flex items-center justify-between border-b border-stone-800 text-white">
              <div>
                <h4 className="font-bold text-lg">{activePhotoModal.name}</h4>
                <p className="text-xs text-stone-400">תמונה {photoIndex + 1} מתוך {(activePhotoModal.images || []).length}</p>
              </div>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Image Preview with Arrows */}
            <div className="relative flex-1 min-h-[350px] sm:min-h-[500px] flex items-center justify-center bg-black">
              <img
                src={(activePhotoModal.images || [])[photoIndex]}
                alt={activePhotoModal.name}
                className="max-h-[70vh] max-w-full object-contain"
              />

              {(activePhotoModal.images || []).length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((prev) => (prev > 0 ? prev - 1 : activePhotoModal.images.length - 1))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((prev) => (prev < activePhotoModal.images.length - 1 ? prev + 1 : 0))}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails Row */}
            <div className="p-3 bg-stone-950 flex gap-2 overflow-x-auto">
              {(activePhotoModal.images || []).map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhotoIndex(i)}
                  className={`w-16 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                    photoIndex === i ? 'border-[var(--brand-accent)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
