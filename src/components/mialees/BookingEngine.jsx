import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Send,
  CreditCard,
  Sparkles,
  Coffee,
  Plus,
  Minus,
  QrCode,
  Check,
  MessageCircle,
  Clock,
  MapPin,
  Lock,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { NorthStarIcon } from './MialeesBrandAssets';
import {
  calculateStayPricing,
  buildWhatsAppReservationUrl,
  isFullBuyoutAvailable
} from '../../lib/multiPropertyCatalog';
import {
  evaluateStayRestrictions,
  restrictionAlert,
  addDaysIso,
  stayNights
} from '../../lib/mialeesBookingRestrictions';
import {
  fetchLiveAvailability,
  createLiveBooking
} from '../../lib/mialeesApi';

export function BookingEngine({
  property,
  selectedUnit,
  onSelectUnit,
  restrictions = []
}) {
  // Today's ISO date string
  const todayIso = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Dates: default tomorrow to +2 days
  const [checkIn, setCheckIn] = useState(() => addDaysIso(todayIso, 1));
  const [checkOut, setCheckOut] = useState(() => addDaysIso(todayIso, 3));

  // Guests count
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [babies, setBabies] = useState(0);

  // Optional Add-ons & Notes
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [customNotes, setCustomNotes] = useState('');

  // Live Availability State
  const [blockedRanges, setBlockedRanges] = useState([]);
  const [availabilityOffline, setAvailabilityOffline] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState('');
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  // Confirmation / Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [confirmedBookingData, setConfirmedBookingData] = useState(null);

  // Active unit
  const activeUnit = selectedUnit || property.units?.[0];

  // Fetch live availability from Edge API whenever active unit or dates change
  useEffect(() => {
    let mounted = true;
    setIsCheckingAvailability(true);
    fetchLiveAvailability({
      unitId: activeUnit?.isFullBuyout ? undefined : activeUnit?.id,
      propertyId: property?.id,
      from: todayIso,
      to: addDaysIso(todayIso, 120)
    }).then((res) => {
      if (!mounted) return;
      setIsCheckingAvailability(false);
      if (res.isOffline) {
        setAvailabilityOffline(true);
        setOfflineMessage(res.message);
        setBlockedRanges([]);
      } else {
        setAvailabilityOffline(false);
        setOfflineMessage('');
        setBlockedRanges(res.blockedRanges || []);
      }
    });

    return () => {
      mounted = false;
    };
  }, [activeUnit?.id, activeUnit?.isFullBuyout, property?.id, todayIso]);

  // Check if current selected date range is blocked
  const isDateRangeBlocked = useMemo(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return false;

    if (activeUnit?.isFullBuyout) {
      // For Full Buyout: ANY active booking in ANY unit of this property blocks the buyout
      return blockedRanges.some((r) => r.checkIn < checkOut && r.checkOut > checkIn);
    }

    // For single unit
    return blockedRanges.some(
      (r) => r.unitId === activeUnit?.id && r.checkIn < checkOut && r.checkOut > checkIn
    );
  }, [blockedRanges, activeUnit, checkIn, checkOut]);

  // Evaluate Stay Restrictions
  const restrictionEval = useMemo(() => {
    return evaluateStayRestrictions({
      restrictions,
      propertyId: property.id,
      checkIn,
      checkOut
    });
  }, [restrictions, property.id, checkIn, checkOut]);

  const restrictionError = useMemo(() => {
    return restrictionAlert(restrictionEval);
  }, [restrictionEval]);

  // Pricing calculation
  const pricing = useMemo(() => {
    return calculateStayPricing({
      unit: activeUnit,
      checkIn,
      checkOut,
      adultCount: adults,
      childCount: children,
      extraServices: selectedExtras
    });
  }, [activeUnit, checkIn, checkOut, adults, children, selectedExtras]);

  // Available extras
  const availableExtras = [
    { id: 'breakfast', name: 'ארוחת בוקר גלילית כפרית עשירה (לזוג)', price: 180, icon: Coffee },
    { id: 'wine', name: 'מארז יין פרימיום מיקבי רמת הגולן + שוקולד בוטיק', price: 160, icon: Sparkles },
    { id: 'late_checkout', name: 'צ׳ק-אאוט מאוחר במוצ״ש (בתיאום מראש)', price: 250, icon: Clock }
  ];

  function toggleExtra(extra) {
    setSelectedExtras((prev) =>
      prev.some((e) => e.id === extra.id) ? prev.filter((e) => e.id !== extra.id) : [...prev, extra]
    );
  }

  // Handle WhatsApp reservation link (Full URI encoding with exact pax format)
  const whatsappUrl = useMemo(() => {
    const paxString = `pax:${adults}+${children}+${babies}`;
    const notesWithPax = customNotes ? `${paxString} | ${customNotes}` : paxString;
    return buildWhatsAppReservationUrl({
      property,
      unit: activeUnit,
      checkIn,
      checkOut,
      nights: pricing.nights,
      guests: adults + children,
      totalPrice: pricing.totalPrice,
      customNotes: notesWithPax
    });
  }, [property, activeUnit, checkIn, checkOut, pricing, adults, children, babies, customNotes]);

  // Complete atomic booking submission
  async function handleCompleteDirectBooking(e) {
    e.preventDefault();
    if (!guestName || !guestPhone) return;

    setIsSubmittingBooking(true);
    setBookingError(null);

    const payload = {
      unit_id: activeUnit.id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      adults_count: adults,
      children_count: children,
      babies_count: babies,
      total_price_agorot: pricing.totalPrice * 100,
      deposit_agorot: pricing.depositAmount * 100,
      special_requests: customNotes,
      is_buyout: Boolean(activeUnit.isFullBuyout),
      property_id: property.id
    };

    const res = await createLiveBooking(payload);
    setIsSubmittingBooking(false);

    if (res.success && res.booking) {
      setConfirmedBookingData(res.booking);
    } else {
      setBookingError(res.message || 'שגיאה ביצירת ההזמנה');
    }
  }

  return (
    <section id="booking-engine" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="flex items-center justify-center gap-2 mb-3">
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
          <span className="text-xs uppercase tracking-[0.25em] text-[var(--brand-secondary)] font-medium">
            הזמנה אונליין וזמינות בזמן אמת
          </span>
          <NorthStarIcon className="w-5 h-5 text-[var(--brand-accent)]" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--brand-primary)] mb-3">
          מנוע הזמנות מחובר ליומן
        </h2>
        <p className="text-[var(--brand-secondary)] text-sm sm:text-base">
          בחרו תאריכים, סוג יחידה והרכב אורחים — וקבלו סנכרון ישיר ליומן ללא עמלות תיווך.
        </p>
      </div>

      {/* Offline / Calendar unreachable notice */}
      {availabilityOffline && (
        <div className="mb-8 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm flex items-start gap-3 shadow-sm animate-fadeIn">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold mb-0.5">בדיקת יומן ישירה בוואטסאפ:</div>
            <div>{offlineMessage}</div>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white font-bold text-xs shrink-0 flex items-center gap-1.5"
          >
            <MessageCircle className="w-4 h-4" />
            <span>סגירה בוואטסאפ</span>
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form & Date Pickers */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-[var(--brand-borderLight)] shadow-sm space-y-6">
          {/* Step 1: Unit Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--brand-secondary)] mb-3">
              1. בחירת יחידת אירוח
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(property.units || []).map((u) => {
                const isSelected = activeUnit?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onSelectUnit(u)}
                    className={`p-3.5 rounded-xl text-right transition-all flex items-start justify-between border ${
                      isSelected
                        ? 'border-[var(--brand-accent)] bg-[var(--brand-surfaceSoft)] ring-2 ring-[var(--brand-accent)]/20'
                        : 'border-[var(--brand-borderLight)] hover:border-[var(--brand-border)] bg-stone-50/50'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-[var(--brand-primary)]">{u.name}</div>
                      <div className="text-xs text-[var(--brand-secondary)] mt-0.5">
                        עד {u.maxOccupancy} אורחים · החל מ-₪{(u.basePrice || 0).toLocaleString()}
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-[var(--brand-accent)] shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-[var(--brand-secondary)]">
                2. בחירת תאריכי הגעה ועזיבה
              </label>
              {isCheckingAvailability && (
                <span className="text-[11px] text-[var(--brand-accent)] flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> בודק זמינות ביומן...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <span className="text-xs text-stone-500 font-medium mb-1 block">תאריך הגעה (צ׳ק-אין)</span>
                <div className="relative">
                  <input
                    type="date"
                    min={todayIso}
                    value={checkIn}
                    onChange={(e) => {
                      const newIn = e.target.value;
                      setCheckIn(newIn);
                      if (newIn >= checkOut) {
                        setCheckOut(addDaysIso(newIn, 2));
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl border border-[var(--brand-border)] bg-stone-50 text-stone-900 text-sm font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                  />
                  <CalendarIcon className="w-4 h-4 text-stone-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div className="relative">
                <span className="text-xs text-stone-500 font-medium mb-1 block">תאריך עזיבה (צ׳ק-אאוט)</span>
                <div className="relative">
                  <input
                    type="date"
                    min={addDaysIso(checkIn, 1)}
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full py-3 px-4 rounded-xl border border-[var(--brand-border)] bg-stone-50 text-stone-900 text-sm font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                  />
                  <CalendarIcon className="w-4 h-4 text-stone-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Overlap & Restriction Alerts */}
            {isDateRangeBlocked && (
              <div className="mt-3 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2 animate-fadeIn">
                <Lock className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">התאריכים שנבחרו תפוסים ביומן: </span>
                  אנא בחרו תאריכים אחרים או פנו ישירות בוואטסאפ לבדיקת יחידה חלופית.
                </div>
              </div>
            )}

            {restrictionError && !isDateRangeBlocked && (
              <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">הערת תאריכים: </span>
                  {restrictionError}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Guests Count with Babies */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--brand-secondary)] mb-3">
              3. הרכב אורחים
            </label>
            <div className="grid grid-cols-3 gap-3">
              {/* Adults */}
              <div className="p-3 rounded-xl border border-[var(--brand-borderLight)] bg-stone-50/50 flex flex-col items-center justify-between">
                <span className="text-xs text-stone-600 font-medium">מבוגרים</span>
                <div className="flex items-center gap-3 my-2">
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.max(1, prev - 1))}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-sm text-[var(--brand-primary)]">{adults}</span>
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.min(activeUnit?.maxOccupancy || 10, prev + 1))}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Children */}
              <div className="p-3 rounded-xl border border-[var(--brand-borderLight)] bg-stone-50/50 flex flex-col items-center justify-between">
                <span className="text-xs text-stone-600 font-medium">ילדים (2-12)</span>
                <div className="flex items-center gap-3 my-2">
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => Math.max(0, prev - 1))}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-sm text-[var(--brand-primary)]">{children}</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => prev + 1)}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Babies */}
              <div className="p-3 rounded-xl border border-[var(--brand-borderLight)] bg-stone-50/50 flex flex-col items-center justify-between">
                <span className="text-xs text-stone-600 font-medium">תינוקות (0-2)</span>
                <div className="flex items-center gap-3 my-2">
                  <button
                    type="button"
                    onClick={() => setBabies((prev) => Math.max(0, prev - 1))}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-bold text-sm text-[var(--brand-primary)]">{babies}</span>
                  <button
                    type="button"
                    onClick={() => setBabies((prev) => prev + 1)}
                    className="w-7 h-7 rounded-full bg-white border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Add-on Experiences */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--brand-secondary)] mb-3">
              4. שדרוגים ותוספות לחופשה (אופציונלי)
            </label>
            <div className="space-y-2">
              {availableExtras.map((extra) => {
                const isSelected = selectedExtras.some((e) => e.id === extra.id);
                const IconComp = extra.icon;
                return (
                  <button
                    key={extra.id}
                    type="button"
                    onClick={() => toggleExtra(extra)}
                    className={`w-full p-3 rounded-xl border text-right transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-[var(--brand-accent)] bg-[var(--brand-surfaceSoft)]'
                        : 'border-[var(--brand-borderLight)] bg-white hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--brand-surfaceSoft)] flex items-center justify-center text-[var(--brand-accent)]">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--brand-primary)]">{extra.name}</div>
                        <div className="text-[11px] text-stone-500">+ ₪{extra.price}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        isSelected ? 'bg-[var(--brand-accent)] border-[var(--brand-accent)] text-white' : 'border-stone-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--brand-secondary)] mb-1.5">
              הערות או בקשות מיוחדות
            </label>
            <input
              type="text"
              placeholder="לדוגמה: הגעה מאוחרת, מיטת תינוק, חגיגת יום הולדת..."
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="w-full py-2.5 px-4 rounded-xl border border-[var(--brand-borderLight)] bg-stone-50 text-sm focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
            />
          </div>
        </div>

        {/* Right Column: Price Summary & Live Actions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[var(--brand-primary)] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[var(--brand-borderLight)]">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-[#C5A880] font-semibold">סיכום הזמנה</span>
                <h3 className="text-xl font-bold text-white mt-0.5">{activeUnit?.name}</h3>
              </div>
              <NorthStarIcon className="w-7 h-7 text-[#C5A880]" />
            </div>

            {/* Stay details */}
            <div className="space-y-2.5 text-xs text-white/80 pb-4 border-b border-white/10 mb-4">
              <div className="flex justify-between">
                <span>תאריכי שהייה:</span>
                <span className="font-semibold text-white">
                  {checkIn} עד {checkOut} ({pricing.nights} לילות)
                </span>
              </div>
              <div className="flex justify-between">
                <span>הרכב אורחים:</span>
                <span className="font-semibold text-white">
                  {adults} מבוגרים {children > 0 ? `+ ${children} ילדים` : ''} {babies > 0 ? `+ ${babies} תינוקות` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span>חלוקת לילות:</span>
                <span>
                  {pricing.weekdayNights} אמצ״ש · {pricing.weekendNights} סופ״ש
                </span>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="space-y-2 text-xs text-white/80 pb-4 border-b border-white/10 mb-6">
              <div className="flex justify-between">
                <span>עלות לינה בסיסית:</span>
                <span className="text-white">₪{pricing.stayCost.toLocaleString()}</span>
              </div>
              {pricing.guestSurcharge > 0 && (
                <div className="flex justify-between text-[#C5A880]">
                  <span>תוספת אורחים מעל 2:</span>
                  <span>+ ₪{pricing.guestSurcharge.toLocaleString()}</span>
                </div>
              )}
              {pricing.extrasTotal > 0 && (
                <div className="flex justify-between text-[#C5A880]">
                  <span>תוספות ושדרוגים ({selectedExtras.length}):</span>
                  <span>+ ₪{pricing.extrasTotal.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Total Price */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-semibold text-white">סה״כ לתשלום:</span>
              <div className="text-right">
                <span className="text-3xl font-bold text-white font-montserrat">
                  ₪{pricing.totalPrice.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-xs text-white/60 mb-6">
              <span>מקדמה לשריין (20%):</span>
              <span className="text-[#C5A880] font-semibold">₪{pricing.depositAmount.toLocaleString()}</span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* WhatsApp Direct Reservation */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg"
              >
                <MessageCircle className="w-5 h-5" />
                <span>סגירת הזמנה מהירה בוואטסאפ</span>
              </a>

              {/* Direct Booking Modal Button */}
              <button
                type="button"
                disabled={isDateRangeBlocked}
                onClick={() => setShowCheckoutModal(true)}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 border ${
                  isDateRangeBlocked
                    ? 'bg-white/5 text-white/40 border-white/5 cursor-not-allowed'
                    : 'bg-white/15 hover:bg-white/25 text-white border-white/10'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>{isDateRangeBlocked ? 'תאריכים תפוסים' : 'הזמנה אונליין וקבלת שובר אירוח'}</span>
              </button>
            </div>

            <div className="mt-4 text-center">
              <span className="text-[11px] text-white/50 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C5A880]" />
                מחובר ישירות ליומן התפוסה · ללא עמלות תיווך
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Online Booking & Voucher Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 border border-[var(--brand-border)] shadow-2xl relative">
            {!confirmedBookingData ? (
              <form onSubmit={handleCompleteDirectBooking} className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                  <div>
                    <h4 className="text-xl font-bold text-[var(--brand-primary)]">השלמת פרטי הזמנה</h4>
                    <p className="text-xs text-stone-500">{activeUnit?.name} · {property.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCheckoutModal(false)}
                    className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-700"
                  >
                    ✕
                  </button>
                </div>

                {bookingError && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>{bookingError}</div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">שם מלא *</label>
                    <input
                      type="text"
                      required
                      placeholder="ישראל ישראלי"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">טלפון נייד בוואטסאפ *</label>
                    <input
                      type="tel"
                      required
                      placeholder="050-1234567"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">אימייל לאישור</label>
                    <input
                      type="email"
                      placeholder="israel@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-stone-300 text-sm focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--brand-surfaceSoft)] text-xs text-[var(--brand-secondary)] space-y-1">
                  <div className="flex justify-between font-medium">
                    <span>סה״כ לתשלום:</span>
                    <span className="font-bold text-[var(--brand-primary)]">₪{pricing.totalPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>מקדמה לנעילת התאריכים:</span>
                    <span>₪{pricing.depositAmount.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmittingBooking}
                    className="flex-1 py-3 rounded-xl bg-[var(--brand-primary)] text-white font-bold text-sm hover:bg-[var(--brand-darkSoft)] transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    {isSubmittingBooking ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>רושם ביומן התפוסה...</span>
                      </>
                    ) : (
                      <span>אשר הזמנה ונעל תאריכים ביומן</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h4 className="text-2xl font-bold text-[var(--brand-primary)]">ההזמנה נרשמה בהצלחה ביומן!</h4>
                <p className="text-sm text-stone-600 max-w-sm mx-auto">
                  שלום {guestName}, הזמנתך עבור <strong>{activeUnit?.name}</strong> ננעלה ביומן ResortOS.
                </p>

                {/* Digital Voucher with live IDs */}
                <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-right text-xs space-y-2">
                  <div className="flex justify-between font-bold text-[var(--brand-primary)] border-b pb-2">
                    <span>שובר אירוח דיגיטלי</span>
                    <span className="font-mono text-stone-600">{confirmedBookingData.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">מתחם:</span>
                    <span>{property.name} ({property.village})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">תאריכים:</span>
                    <span>{checkIn} - {checkOut} ({pricing.nights} לילות)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">הרכב אורחים:</span>
                    <span>{adults} מבוגרים, {children} ילדים, {babies} תינוקות</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">סה״כ לתשלום:</span>
                    <span className="font-bold">₪{pricing.totalPrice.toLocaleString()}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-xl bg-[#25D366] text-white font-bold text-sm flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    שלח שובר אישור למארח בוואטסאפ
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCheckoutModal(false);
                      setConfirmedBookingData(null);
                    }}
                    className="w-full py-2.5 text-xs text-stone-500 hover:text-stone-800"
                  >
                    סגור חלון
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar for Mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[var(--brand-borderLight)] p-3 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-stone-500">סה״כ ל-{pricing.nights} לילות</div>
            <div className="text-lg font-bold text-[var(--brand-primary)] font-montserrat">
              ₪{pricing.totalPrice.toLocaleString()}
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--brand-primary)] text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 shadow-md"
          >
            <MessageCircle className="w-4 h-4 text-[#25D366]" />
            <span>הזמן עכשיו בוואטסאפ</span>
          </a>
        </div>
      </div>
    </section>
  );
}
