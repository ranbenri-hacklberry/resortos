import React, { useState, useEffect, useMemo } from 'react';
import {
  Menu,
  X,
  Phone,
  MessageCircle,
  MapPin,
  Calendar,
  Sparkles,
  Globe,
  Instagram,
  ArrowDown,
  CheckCircle2,
  ShieldCheck,
  Compass
} from 'lucide-react';
import {
  getPropertyConfig,
  listAllProperties
} from '../../lib/multiPropertyCatalog';
import { NorthStarIcon, MialeesLogo, BrandBadge } from './MialeesBrandAssets';
import { AttractionsGuide } from './AttractionsGuide';
import { AllResortsShowcase } from './AllResortsShowcase';
import { CalendarAvailabilityModal } from './CalendarAvailabilityModal';

export function MialeesResortApp() {
  const allProperties = useMemo(() => listAllProperties(), []);

  // Determine active property from URL parameter or default to 'mialees'
  const [selectedPropertyId, setSelectedPropertyId] = useState(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const param = url.searchParams.get('property');
      if (param) return param;
    }
    return 'mialees';
  });

  const property = useMemo(() => {
    return getPropertyConfig(selectedPropertyId);
  }, [selectedPropertyId]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Large Interactive Calendar Availability Popup Modal state
  const [activeCalendarModalProperty, setActiveCalendarModalProperty] = useState(null);

  // Handle scroll detection for sticky header refinement
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 30);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const theme = property.theme;

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      className="min-h-screen text-[var(--brand-dark)] bg-[var(--brand-bg)] font-sans antialiased selection:bg-[var(--brand-accent)] selection:text-white transition-colors duration-300"
      style={{
        '--brand-primary': theme.primary,
        '--brand-secondary': theme.secondary,
        '--brand-accent': theme.accent,
        '--brand-bg': theme.background,
        '--brand-bgSoft': theme.bgSoft || '#F4ECE7',
        '--brand-surface': theme.surface,
        '--brand-surfaceSoft': theme.surfaceSoft || '#F8F3F0',
        '--brand-border': theme.border,
        '--brand-borderLight': theme.borderLight || '#E8DED8',
        '--brand-brandPink': theme.brandPink || '#F2D5DD',
        '--brand-dark': theme.dark,
        '--brand-darkSoft': theme.darkSoft || '#3F2C29',
        '--brand-gold': theme.gold || '#C5A880'
      }}
    >
      {/* Main Brand Navigation Header */}
      <header className={`sticky top-0 z-40 bg-[var(--brand-bg)]/95 backdrop-blur-md border-b border-[var(--brand-borderLight)] transition-all duration-300 ${scrolled ? 'shadow-md py-1.5' : 'py-2.5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            {/* Brand Logo with comfortable top margin */}
            <div className="flex items-center py-1">
              <MialeesLogo variant="dark" size="sm" />
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--brand-primary)]">
              <button
                type="button"
                onClick={() => scrollToSection('resorts-showcase')}
                className="hover:text-[var(--brand-accent)] transition-colors font-semibold"
              >
                כל המתחמים
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('attractions')}
                className="hover:text-[var(--brand-accent)] transition-colors font-semibold"
              >
                אטרקציות וחוויות
              </button>
              <a
                href="/resortos.html"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#26130F] text-[#C5A880] text-xs font-bold shadow hover:bg-[#3F2C29] transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>זירת ResortOS & ספקים</span>
              </a>
            </nav>

            {/* Direct Contact & CTA Button */}
            <div className="hidden sm:flex items-center gap-4">
              <a
                href={`tel:${property.phone || '050-0000000'}`}
                className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-primary)] hover:text-[var(--brand-accent)] transition-colors"
              >
                <Phone className="w-4 h-4 text-[var(--brand-accent)]" />
                <span>{property.phone || 'חיוג ישיר'}</span>
              </a>

              <button
                type="button"
                onClick={() => scrollToSection('resorts-showcase')}
                className="py-2 px-5 rounded-full bg-[var(--brand-primary)] hover:bg-[var(--brand-darkSoft)] text-white text-xs font-bold transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <Calendar className="w-4 h-4 text-[#C5A880]" />
                <span>לוחות שנה ומחירים</span>
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-[var(--brand-primary)] hover:bg-[var(--brand-surfaceSoft)]"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-stone-200 px-4 pt-2 pb-6 space-y-3 shadow-xl animate-fadeIn">
            <button
              type="button"
              onClick={() => scrollToSection('resorts-showcase')}
              className="block w-full text-right py-2 text-sm font-bold text-[var(--brand-primary)]"
            >
              כל המתחמים
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('attractions')}
              className="block w-full text-right py-2 text-sm font-bold text-[var(--brand-primary)]"
            >
              אטרקציות וחוויות בגולן
            </button>
            <div className="pt-4 border-t border-stone-100 flex flex-col gap-2">
              <a
                href={property.whatsappDirect || `https://wa.me/972507597944`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl bg-[#25D366] text-white text-xs font-bold text-center flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>וואטסאפ ישיר</span>
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section: Panoramic pool view from Moshav Ramot cliff */}
      {/* Hero Section: Panoramic pool view from Moshav Ramot cliff */}
      <section className="relative min-h-[60vh] sm:min-h-[85vh] flex items-center justify-center px-3 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/resorts/hero-ramot.jpg"
            alt="נוף הכנרת הפנורמי ממושב רמות והגולן"
            className="w-full h-full object-cover object-center scale-105 animate-fadeIn"
          />
          {/* Subtle contrast overlay */}
          <div className="absolute inset-0 bg-black/25" />
        </div>

        {/* Hero Content positioned completely inside the pool water area */}
        <div className="relative z-10 max-w-xl sm:max-w-3xl mx-auto text-center px-2 sm:px-4 py-2 flex flex-col items-center justify-center">
          {/* Top Block: Above the Swimmer inside pool - Shifted 10px UP */}
          <div className="flex flex-col items-center transform -translate-y-1 sm:-translate-y-2.5">
            {/* Brand Tag */}
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-[#26130F]/90 text-white backdrop-blur-md border border-[#C5A880]/50 mb-1.5 sm:mb-2.5 shadow-lg animate-fadeIn">
              <NorthStarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#C5A880]" />
              <span className="text-[10px] sm:text-sm font-medium tracking-wide text-[#FDFBF7]">
                מתחמי נופש וסוויטות יוקרה מול נוף הכנרת
              </span>
              <NorthStarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#C5A880]" />
            </div>

            {/* Main Title */}
            <h1 className="text-lg sm:text-4xl lg:text-[44px] font-extrabold tracking-tight leading-tight font-montserrat text-[#1A0E0B] drop-shadow-[0_2px_12px_rgba(255,255,255,0.95)]">
              MIALEES RESORTS & CABINS
            </h1>
          </div>

          {/* Visual Open Gap directly over the Swimmer */}
          <div className="h-4 sm:h-10 lg:h-12 w-full pointer-events-none" />

          {/* Bottom Block: Below the Swimmer inside pool - Shifted 10px DOWN */}
          <div className="flex flex-col items-center max-w-xl transform translate-y-1 sm:translate-y-2.5 px-2">
            {/* Subtitle */}
            <p className="text-[11px] sm:text-base lg:text-[17px] text-[#26130F] font-bold leading-relaxed mb-2 sm:mb-3.5 drop-shadow-[0_2px_10px_rgba(255,255,255,0.95)]">
              חוויית אירוח יוקרתית ברמת הגולן והסובב כנרת – מושב רמות, נאות גולן, גבעת יואב ונוב.
              בריכות שחייה, מתחמי ג'קוזי ספא, מרחבים ירוקים ושלווה גלילית מושלמת.
            </p>

            {/* Scroll Down Indicator */}
            <div>
              <button
                type="button"
                onClick={() => scrollToSection('resorts-showcase')}
                className="bg-white/95 hover:bg-white text-[#26130F] px-4 sm:px-6 py-1.5 sm:py-2 rounded-full shadow-lg backdrop-blur-md transition-all duration-300 animate-bounce inline-flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-sm font-bold border border-white/80"
              >
                <span>גלול לגילוי כל המתחמים</span>
                <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8C6239]" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 1. All Resorts Showcase Grid (12 Complexes with daily prices & calendar popup) */}
      <AllResortsShowcase
        onOpenCalendarModal={(prop) => setActiveCalendarModalProperty(prop)}
      />

      {/* 2. Golan & Ramot Attractions Guide */}
      <AttractionsGuide property={property} />

      {/* Large Visual Calendar Popup Modal */}
      {activeCalendarModalProperty && (
        <CalendarAvailabilityModal
          property={activeCalendarModalProperty}
          onClose={() => setActiveCalendarModalProperty(null)}
        />
      )}

      {/* Footer */}
      <footer className="bg-[var(--brand-dark)] text-white/80 py-16 px-4 sm:px-6 lg:px-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2 space-y-4">
            <MialeesLogo variant="light" size="sm" />
            <p className="text-xs sm:text-sm text-white/60 max-w-md leading-relaxed">
              רשת מתחמי אירוח יוקרתיים ברמת הגולן והסובב כנרת – מושב רמות, נאות גולן, גבעת יואב ונוב.
              מנוע הזמנות ישיר מחובר ליומן התפוסה של ResortOS ללא עמלות תיווך.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-xs text-white/40">זמינים בוואטסאפ ובטלפון 7 ימים בשבוע</span>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-[#C5A880] font-bold">קישורים מהירים</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button type="button" onClick={() => scrollToSection('resorts-showcase')} className="hover:text-white">
                  כל מתחמי הנופש
                </button>
              </li>
              <li>
                <button type="button" onClick={() => scrollToSection('attractions')} className="hover:text-white">
                  אטרקציות וחוויות בגולן
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase tracking-widest text-[#C5A880] font-bold">יצירת קשר</h4>
            <p className="text-xs text-white/60">רמת הגולן והכנרת, ישראל</p>
            <p className="text-xs text-white/60">טלפון: {property.phone || '050-759-7944'}</p>
            <div className="pt-2">
              <a
                href={property.whatsappDirect || `https://wa.me/972507597944`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold shadow-md"
              >
                <MessageCircle className="w-4 h-4" />
                <span>פנייה ישירה בוואטסאפ</span>
              </a>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/10 text-center text-[11px] text-white/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} MIALEES RESORT & LUXURY CABINS. כל הזכויות שמורות.</div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#C5A880]" />
            <span>מופעל ע״י מערכת ResortOS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
