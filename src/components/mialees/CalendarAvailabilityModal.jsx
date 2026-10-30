import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Plus,
  Minus,
  CheckCircle2,
  Lock,
  MessageCircle,
  CreditCard,
  Calendar as CalendarIcon,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  Clock,
  Sparkles,
  Home,
  Check,
  Info
} from 'lucide-react';
import {
  buildWhatsAppReservationUrl,
  calculateStayPricing
} from '../../lib/multiPropertyCatalog';
import { fetchLiveAvailability, createLiveBooking } from '../../lib/mialeesApi';
import { addDaysIso } from '../../lib/mialeesBookingRestrictions';

export function CalendarAvailabilityModal({
  property,
  onClose,
  initialUnit
}) {
  const units = useMemo(() => property?.units || [], [property]);
  const singleUnits = useMemo(() => units.filter((u) => !u.isFullBuyout), [units]);
  const buyoutUnit = useMemo(() => units.find((u) => u.isFullBuyout), [units]);
  const hasMultipleCabins = singleUnits.length > 1;

  // Selected Unit ID: 'all' (Overview of all cabins) OR specific unit id
  const [selectedUnitId, setSelectedUnitId] = useState(() => {
    if (initialUnit) return initialUnit.id;
    if (hasMultipleCabins) return 'all';
    return singleUnits[0]?.id || units[0]?.id || 'all';
  });

  const isAllCabinsView = selectedUnitId === 'all';
  const selectedUnit = useMemo(() => {
    if (isAllCabinsView) return null;
    return units.find((u) => u.id === selectedUnitId) || null;
  }, [units, selectedUnitId, isAllCabinsView]);

  // Guests
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [babies, setBabies] = useState(0);

  // Today
  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Selected Date Range [checkIn, checkOut)
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);

  // Live availability & 15-minute sync state
  const [blockedRanges, setBlockedRanges] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [availabilityOffline, setAvailabilityOffline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [wasFromCache, setWasFromCache] = useState(false);

  // Forward days page offset (0 = starting from today, 1 = +28 days, etc.)
  const [pageOffset, setPageOffset] = useState(0);
  const DAYS_PER_VIEW = 35; // 5 weeks forward

  // Direct Booking & Payment Step inside modal
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(null);
  const [paymentPayUrl, setPaymentPayUrl] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  // Fetch live availability (property-level covers all units in the complex)
  const loadAvailability = useCallback(
    async (force = true) => {
      if (!property?.id) return;
      setIsLoadingAvailability(true);
      if (force) setIsRefreshing(true);

      const fromDate = todayIso;
      const toDate = addDaysIso(todayIso, 180);

      try {
        const res = await fetchLiveAvailability({
          propertyId: property.id,
          from: fromDate,
          to: toDate,
          forceRefresh: force
        });

        if (res.isOffline) {
          setAvailabilityOffline(true);
          setBlockedRanges([]);
        } else {
          setAvailabilityOffline(false);
          setBlockedRanges(res.blockedRanges || []);
          setLastSyncedAt(res.lastSyncedAt || Date.now());
          setWasFromCache(Boolean(res.fromCache));
        }
      } catch (err) {
        setAvailabilityOffline(true);
      } finally {
        setIsLoadingAvailability(false);
        setIsRefreshing(false);
      }
    },
    [property?.id, todayIso]
  );

  useEffect(() => {
    loadAvailability(true);
  }, [loadAvailability]);

  const monthNamesHe = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

  const weekdayNamesHe = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  // Formatted last synced time string (e.g. "לפני 2 דק׳" or "14:25")
  const syncTimeFormatted = useMemo(() => {
    if (!lastSyncedAt) return 'יומן פעיל';
    const d = new Date(lastSyncedAt);
    const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    return timeStr;
  }, [lastSyncedAt]);

  // Generate continuous rolling calendar days starting from TODAY (and forward)
  const { viewDays, activeMonthsTitle } = useMemo(() => {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + pageOffset * 28);

    const days = [];
    const weekdayBase = selectedUnit?.basePrice || property?.min_price || 650;
    const weekendBase = selectedUnit?.weekendPrice || property?.weekend_price || Math.round(weekdayBase * 1.3);

    // Padding empty slots before the start day's weekday so columns match Sun–Sat correctly
    const startWeekday = startDate.getDay(); // 0 = Sun
    for (let i = 0; i < startWeekday; i++) {
      days.push(null);
    }

    const monthsEncountered = new Set();

    for (let i = 0; i < DAYS_PER_VIEW; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);

      const y = d.getFullYear();
      const m = d.getMonth();
      const dateNum = d.getDate();
      const dayIso = `${y}-${String(m + 1).padStart(2, '0')}-${String(dateNum).padStart(2, '0')}`;
      const dayOfWeek = d.getDay(); // 0 = Sun, 4 = Thu, 5 = Fri, 6 = Sat
      const isWeekend = dayOfWeek === 4 || dayOfWeek === 5;
      const nightlyPrice = isWeekend ? weekendBase : weekdayBase;
      const isToday = dayIso === todayIso;
      const isPast = dayIso < todayIso;

      monthsEncountered.add(`${monthNamesHe[m]} ${y}`);

      // MULTI-CABIN vs SINGLE-UNIT availability calculation
      let isBlockedForCheckIn = false;
      let availableCabinsCount = singleUnits.length;
      let totalCabinsCount = singleUnits.length;
      let minAvailablePrice = nightlyPrice;

      if (isAllCabinsView) {
        // In All Cabins view, check how many cabins are blocked for this night
        const occupiedUnitIds = new Set(
          blockedRanges
            .filter((r) => r.checkIn <= dayIso && r.checkOut > dayIso)
            .map((r) => r.unitId)
        );

        const freeCabins = singleUnits.filter((u) => !occupiedUnitIds.has(u.id));
        availableCabinsCount = freeCabins.length;
        isBlockedForCheckIn = availableCabinsCount === 0;

        if (freeCabins.length > 0) {
          minAvailablePrice = Math.min(
            ...freeCabins.map((u) => (isWeekend ? (u.weekendPrice || u.basePrice) : u.basePrice))
          );
        }
      } else {
        // Single Unit View
        isBlockedForCheckIn = blockedRanges.some((r) => {
          if (selectedUnit?.isFullBuyout) {
            return r.checkIn <= dayIso && r.checkOut > dayIso;
          }
          return r.unitId === selectedUnit?.id && r.checkIn <= dayIso && r.checkOut > dayIso;
        });
      }

      days.push({
        dayNumber: dateNum,
        monthName: monthNamesHe[m],
        monthIndex: m,
        year: y,
        dateIso: dayIso,
        isWeekend,
        nightlyPrice: minAvailablePrice,
        isToday,
        isPast,
        isBlockedForCheckIn,
        availableCabinsCount,
        totalCabinsCount
      });
    }

    return {
      viewDays: days,
      activeMonthsTitle: Array.from(monthsEncountered).join(' – ')
    };
  }, [today, todayIso, pageOffset, selectedUnit, property, blockedRanges, isAllCabinsView, singleUnits]);

  // Handle day click with accurate half-open stay intervals [checkIn, checkOut)
  function handleDayClick(dayObj) {
    if (!dayObj || dayObj.isPast) return;

    // 1. If starting fresh (no check-in selected yet, or already have full range)
    if (!checkIn || (checkIn && checkOut)) {
      if (dayObj.isBlockedForCheckIn) return;
      setCheckIn(dayObj.dateIso);
      setCheckOut(null);
      return;
    }

    // 2. If checkIn is selected and selecting checkOut
    if (checkIn && !checkOut) {
      if (dayObj.dateIso === checkIn) {
        // Clicking same date resets selection
        setCheckIn(null);
        setCheckOut(null);
        return;
      }

      if (dayObj.dateIso < checkIn) {
        // Clicking earlier date changes check-in if that date is available
        if (!dayObj.isBlockedForCheckIn) {
          setCheckIn(dayObj.dateIso);
          setCheckOut(null);
        }
        return;
      }

      // Check if proposed range [checkIn, dayObj.dateIso) has conflict
      let hasConflict = false;
      if (isAllCabinsView) {
        // Conflict in All Cabins view only if NO cabins are free for the ENTIRE duration
        const hasAtLeastOneFreeCabin = singleUnits.some((u) => {
          return !blockedRanges.some(
            (r) => r.unitId === u.id && r.checkIn < dayObj.dateIso && r.checkOut > checkIn
          );
        });
        hasConflict = !hasAtLeastOneFreeCabin;
      } else {
        hasConflict = blockedRanges.some((r) => {
          const matches = selectedUnit?.isFullBuyout ? true : r.unitId === selectedUnit?.id;
          return matches && r.checkIn < dayObj.dateIso && r.checkOut > checkIn;
        });
      }

      if (hasConflict) {
        // No cabin or this cabin is blocked in this window
        if (!dayObj.isBlockedForCheckIn) {
          setCheckIn(dayObj.dateIso);
          setCheckOut(null);
        }
      } else {
        // Valid check-out date!
        setCheckOut(dayObj.dateIso);
      }
    }
  }

  // Calculate cabins breakdown for the chosen dates in "All Cabins" view
  const cabinsBreakdownForDates = useMemo(() => {
    if (!checkIn || !checkOut || !isAllCabinsView) return [];

    return singleUnits.map((u) => {
      // A cabin is available if NO blocked range intersects with [checkIn, checkOut)
      const isOccupied = blockedRanges.some(
        (r) => r.unitId === u.id && r.checkIn < checkOut && r.checkOut > checkIn
      );

      const pricing = calculateStayPricing({
        unit: u,
        checkIn,
        checkOut,
        adultCount: adults,
        childCount: children
      });

      const deposit = Math.round((pricing.totalPrice || 0) * 0.2);

      return {
        unit: u,
        isAvailable: !isOccupied,
        pricing,
        deposit
      };
    });
  }, [checkIn, checkOut, isAllCabinsView, singleUnits, blockedRanges, adults, children]);

  // Pricing (Prices in Shekels & 20% Deposit calculation for single selected unit)
  const pricing = useMemo(() => {
    const targetUnit = selectedUnit || singleUnits[0] || null;
    const calc = calculateStayPricing({
      unit: targetUnit,
      checkIn,
      checkOut,
      adultCount: adults,
      childCount: children
    });
    const totalPrice = calc.totalPrice || 0;
    const depositAmount = Math.round(totalPrice * 0.2); // Exact 20% deposit
    const balanceAmount = Math.max(0, totalPrice - depositAmount); // 80% at check-in
    return {
      ...calc,
      totalPrice,
      depositAmount,
      balanceAmount
    };
  }, [selectedUnit, singleUnits, checkIn, checkOut, adults, children]);

  // WhatsApp Link
  const whatsappUrl = useMemo(() => {
    const paxString = `pax:${adults}+${children}+${babies}`;
    const targetUnit = selectedUnit || {
      name: isAllCabinsView ? `מתחם ${property?.name} (בירור בקתות פנויות)` : property?.name,
      basePrice: property?.min_price || 650
    };
    return buildWhatsAppReservationUrl({
      property,
      unit: targetUnit,
      checkIn: checkIn || 'החל מהיום',
      checkOut: checkOut || 'לפי בחירה',
      nights: pricing.nights || 2,
      guests: adults + children,
      totalPrice: pricing.totalPrice || (property?.min_price || 700) * 2,
      customNotes: paxString
    });
  }, [property, selectedUnit, isAllCabinsView, checkIn, checkOut, pricing, adults, children, babies]);

  // Handle cabin selection from the All Cabins breakdown list
  function handleSelectCabinFromList(unit) {
    setSelectedUnitId(unit.id);
    // User already chose dates, so transition directly to booking form or single view
    setShowBookingForm(true);
  }

  // Submit direct booking and proceed to Hyp Deposit Checkout
  async function handleSubmitBooking(e) {
    e.preventDefault();
    const effectiveUnit = selectedUnit || singleUnits[0];
    if (!guestName || !guestPhone || !guestEmail || !checkIn || !checkOut || !effectiveUnit) {
      setBookingError('אנא מלאו את כל שדות החובה כולל כתובת אימייל עבור החשבונית.');
      return;
    }

    if (pricing.totalPrice <= 0 || pricing.depositAmount <= 0) {
      setBookingError('סכום ההזמנה אינו תקין.');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);

    const payload = {
      unit_id: String(effectiveUnit.id).trim(),
      check_in_date: checkIn,
      check_out_date: checkOut,
      guest_name: String(guestName).trim(),
      guest_phone: String(guestPhone).trim(),
      guest_email: String(guestEmail).trim(),
      adults_count: adults,
      children_count: children,
      babies_count: babies,
      total_price_agorot: Math.round(pricing.totalPrice * 100),
      deposit_agorot: Math.round(pricing.depositAmount * 100),
      special_requests: String(specialRequests || '').trim(),
      is_buyout: Boolean(effectiveUnit.isFullBuyout),
      property_id: property.id
    };

    const res = await createLiveBooking(payload);

    if (!res.success || !res.booking) {
      setIsSubmitting(false);
      setBookingError(res.message || 'שגיאה ביצירת ההזמנה ביומן');
      return;
    }

    const booking = res.booking;
    setBookingConfirmed(booking);
    setIsSubmitting(false);
    if (booking.checkout_token) {
      setPaymentPayUrl(`/stay/${booking.checkout_token}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-4xl w-full max-h-[96vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden my-auto">
        {/* Compact Modal Header */}
        <div className="px-3.5 py-3 sm:px-5 sm:py-3.5 bg-[#26130F] text-white flex items-center justify-between shrink-0 border-b border-[#3F2C29]">
          <div className="flex items-center gap-2.5">
            {showBookingForm && !bookingConfirmed ? (
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#C5A880] transition-colors flex items-center gap-1 text-xs font-bold"
                title="חזרה ללוח השנה"
              >
                <ArrowRight className="w-4 h-4" />
                <span>חזרה ללוח</span>
              </button>
            ) : (
              <CalendarIcon className="w-4 h-4 text-[#C5A880] shrink-0" />
            )}

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  {showBookingForm && !bookingConfirmed
                    ? 'השלמת פרטי הזמנה וסליקה'
                    : property?.name}
                </h3>
                <span className="text-[10px] text-[#C5A880] bg-white/10 px-2 py-0.5 rounded-full hidden sm:inline font-semibold">
                  {property?.village}
                </span>
                {hasMultipleCabins && (
                  <span className="text-[10px] bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/30 px-2 py-0.5 rounded-full font-bold">
                    {singleUnits.length} בקתות במתחם
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 15-Minute Sync Status Pill & Refresh Button */}
            {!showBookingForm && (
              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full text-[11px] text-stone-200">
                <span
                  className={`w-2 h-2 rounded-full ${
                    availabilityOffline ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'
                  }`}
                  title={availabilityOffline ? 'יומן מקומי ממתין לחיבור' : 'סנכרון יומן פעיל (כל 15 דקות)'}
                />
                <span className="hidden sm:inline text-[10px] text-stone-300">
                  {availabilityOffline
                    ? 'חיבור ישיר'
                    : `סונכרן: ${syncTimeFormatted}`}
                </span>
                <button
                  type="button"
                  onClick={() => loadAvailability(true)}
                  disabled={isRefreshing || isLoadingAvailability}
                  title="רענן זמינות כעת מול היומן (אינטרוול 15 דקות)"
                  className="p-1 rounded-full hover:bg-white/20 text-[#C5A880] transition cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${isRefreshing || isLoadingAvailability ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STEP 1: CALENDAR VIEW */}
        {!showBookingForm && !bookingConfirmed && (
          <>
            {/* CABIN SELECTION TABS FOR MULTI-CABIN COMPLEXES */}
            {hasMultipleCabins && (
              <div className="bg-stone-100 border-b border-stone-200 px-3 py-2 sm:px-5 sm:py-2.5">
                <div className="text-[11px] font-bold text-stone-600 mb-1.5 flex items-center justify-between">
                  <span>בחר בקתה ספציפית או צפה בזמינות כל הבקתות:</span>
                  {isAllCabinsView && (
                    <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      מצב פעיל: מבט כולל על {singleUnits.length} בקתות
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {/* Tab: All Cabins (מבט כולל) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnitId('all');
                      setCheckIn(null);
                      setCheckOut(null);
                    }}
                    className={`py-1.5 px-3 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isAllCabinsView
                        ? 'bg-[#26130F] text-[#C5A880] shadow-sm ring-1 ring-[#C5A880]/50'
                        : 'bg-white text-stone-700 hover:bg-stone-200/80 border border-stone-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#C5A880]" />
                    <span>⭐ כל הבקתות (מבט כולל)</span>
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full">
                      {singleUnits.length}
                    </span>
                  </button>

                  {/* Individual Cabin Tabs */}
                  {singleUnits.map((u) => {
                    const isSelected = selectedUnitId === u.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUnitId(u.id);
                          setCheckIn(null);
                          setCheckOut(null);
                        }}
                        className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-[#26130F] text-white shadow-sm ring-1 ring-[#C5A880]'
                            : 'bg-white text-stone-700 hover:bg-stone-200/80 border border-stone-200'
                        }`}
                      >
                        <Home className="w-3 h-3 text-[#C5A880]" />
                        <span>{u.name}</span>
                        <span className="text-[10px] text-stone-500">
                          (עד {u.maxOccupancy})
                        </span>
                      </button>
                    );
                  })}

                  {/* Full Buyout Tab (if configured) */}
                  {buyoutUnit && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUnitId(buyoutUnit.id);
                        setCheckIn(null);
                        setCheckOut(null);
                      }}
                      className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        selectedUnitId === buyoutUnit.id
                          ? 'bg-[#26130F] text-[#C5A880] shadow-sm ring-1 ring-[#C5A880]'
                          : 'bg-white text-amber-900 hover:bg-amber-50 border border-amber-200'
                      }`}
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>מתחם בבלעדיות (Buyout)</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Compact Guests Bar */}
            <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-xs text-stone-700 font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-[#8C6239]" />
                <span>
                  {isAllCabinsView
                    ? `בחירת תאריכים לבדיקת זמינות בכל ${singleUnits.length} הבקתות`
                    : `בקתה נבחרת: ${selectedUnit?.name}`}
                </span>
              </div>

              {/* Guests Counters */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200 shadow-xs">
                  <span className="text-[11px] text-stone-500">מבוגרים:</span>
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.max(1, prev - 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-200"
                  >
                    -
                  </button>
                  <span className="font-bold text-xs w-3 text-center">{adults}</span>
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.min(selectedUnit?.maxOccupancy || 16, prev + 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-200"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200 shadow-xs">
                  <span className="text-[11px] text-stone-500">ילדים:</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => Math.max(0, prev - 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-200"
                  >
                    -
                  </button>
                  <span className="font-bold text-xs w-3 text-center">{children}</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => prev + 1)}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700 hover:bg-stone-200"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar Body */}
            <div className="p-2 sm:p-4 overflow-y-auto flex-1 space-y-2 sm:space-y-3 relative min-h-[380px]">
              {/* Live Studio Sync Loading Overlay */}
              {isLoadingAvailability && (
                <div className="absolute inset-0 bg-white/92 backdrop-blur-[2px] z-30 flex flex-col items-center justify-center p-6 text-center transition-opacity duration-300">
                  <div className="relative mb-3.5">
                    {/* Outer smooth spinning circle */}
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-3 border-stone-200 border-t-[#C5A880] animate-spin" />
                    {/* Inner glowing sparkles icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-[#8C6239] animate-pulse" />
                    </div>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-[#26130F] mb-1">
                    בודק זמינות עדכנית מול יומן המתחם...
                  </h4>
                  <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                    מתחבר ישירות ליומן ההזמנות בסטודיו לקבלת תמונת מצב מדויקת בזמן אמת
                  </p>
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#8C6239] font-bold bg-[#FAF6F0] px-3 py-1 rounded-full border border-[#C5A880]/30 shadow-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    <span>סנכרון יומן חי ישירות מהסטודיו</span>
                  </div>
                </div>
              )}

              {/* Forward Rolling Calendar Navigation */}
              <div className="flex items-center justify-between px-1 py-1">
                <button
                  type="button"
                  disabled={pageOffset <= 0}
                  onClick={() => setPageOffset((prev) => Math.max(0, prev - 1))}
                  className={`p-1.5 rounded-lg border flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    pageOffset <= 0
                      ? 'border-stone-200 text-stone-300 cursor-not-allowed'
                      : 'border-stone-200 hover:bg-stone-100 text-stone-700'
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>הקודם</span>
                </button>

                <div className="text-center">
                  <h4 className="text-xs sm:text-sm font-bold text-[#26130F]">
                    {activeMonthsTitle}
                  </h4>
                  <div className="text-[10px] text-stone-500">
                    {isAllCabinsView
                      ? 'מספר הבקתות הפנויות מוצג בכל תאריך (ירוק = פנוי, כתום = חלקי, אדום = תפוס)'
                      : 'לחצו על תאריך כניסה ולאחריו תאריך עזיבה'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPageOffset((prev) => prev + 1)}
                  className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-700 transition-colors flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                >
                  <span>קדימה 4 שבועות</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Calendar Weekday Names */}
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-stone-500 py-0.5 border-b border-stone-200">
                {weekdayNamesHe.map((name, i) => (
                  <div key={i} className={i >= 5 ? 'text-amber-800' : ''}>
                    {name}
                  </div>
                ))}
              </div>

              {/* Calendar Days Matrix */}
              <div className="grid grid-cols-7 gap-1">
                {viewDays.map((dayObj, idx) => {
                  if (!dayObj) {
                    return <div key={`empty-${idx}`} className="h-14 sm:h-16 bg-transparent" />;
                  }

                  const isCheckInDay = checkIn === dayObj.dateIso;
                  const isCheckOutDay = checkOut === dayObj.dateIso;
                  const isInRange =
                    checkIn && checkOut && dayObj.dateIso > checkIn && dayObj.dateIso < checkOut;

                  // Check if selectable as checkout
                  let isSelectableCheckOut = false;
                  if (checkIn && !checkOut && dayObj.dateIso > checkIn) {
                    if (isAllCabinsView) {
                      // Selectable if at least one cabin is free for the full range
                      isSelectableCheckOut = singleUnits.some((u) => {
                        return !blockedRanges.some(
                          (r) =>
                            r.unitId === u.id &&
                            r.checkIn < dayObj.dateIso &&
                            r.checkOut > checkIn
                        );
                      });
                    } else {
                      isSelectableCheckOut = !blockedRanges.some((r) => {
                        const matches = selectedUnit?.isFullBuyout
                          ? true
                          : r.unitId === selectedUnit?.id;
                        return matches && r.checkIn < dayObj.dateIso && r.checkOut > checkIn;
                      });
                    }
                  }

                  const isClickable =
                    !dayObj.isPast &&
                    (isSelectableCheckOut || !dayObj.isBlockedForCheckIn || isCheckInDay);

                  let tileStyle = 'bg-stone-50 hover:bg-stone-100 text-stone-900 border-stone-200';

                  if (dayObj.isPast) {
                    tileStyle =
                      'bg-stone-100/40 text-stone-300 border-transparent cursor-not-allowed opacity-30';
                  } else if (isCheckInDay || isCheckOutDay) {
                    tileStyle =
                      'bg-[#26130F] text-white border-[#C5A880] shadow-md scale-[1.02] z-10 font-bold';
                  } else if (isInRange) {
                    tileStyle = 'bg-[#C5A880]/20 text-[#26130F] border-[#C5A880] font-bold';
                  } else if (isSelectableCheckOut) {
                    tileStyle =
                      'bg-amber-50/80 hover:bg-amber-100 text-stone-900 border-amber-300 cursor-pointer ring-1 ring-amber-400/50';
                  } else if (dayObj.isBlockedForCheckIn) {
                    tileStyle = 'bg-red-50/70 text-red-500 border-red-200 cursor-not-allowed';
                  } else if (dayObj.isToday) {
                    tileStyle =
                      'bg-emerald-50 text-emerald-950 border-emerald-400 ring-1 ring-emerald-400';
                  } else if (isAllCabinsView && dayObj.availableCabinsCount < dayObj.totalCabinsCount) {
                    // Partially booked complex day
                    tileStyle = 'bg-amber-50/60 hover:bg-amber-100 text-amber-900 border-amber-200';
                  } else if (dayObj.isWeekend) {
                    tileStyle = 'bg-stone-50 hover:bg-stone-100 text-stone-900 border-stone-200';
                  }

                  return (
                    <button
                      key={dayObj.dateIso}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => handleDayClick(dayObj)}
                      className={`h-14 sm:h-16 p-1 rounded-lg sm:rounded-xl border flex flex-col justify-between items-center transition-all relative overflow-hidden cursor-pointer ${tileStyle}`}
                    >
                      {/* Top: Day Number + Badges */}
                      <div className="w-full flex items-center justify-between text-[11px] sm:text-xs leading-none">
                        <span className="font-bold">{dayObj.dayNumber}</span>

                        {dayObj.isToday && !isCheckInDay && !isCheckOutDay && (
                          <span className="text-[8px] bg-emerald-600 text-white font-extrabold px-1 py-0.5 rounded leading-none">
                            היום
                          </span>
                        )}

                        {dayObj.isBlockedForCheckIn &&
                          !isSelectableCheckOut &&
                          !isCheckOutDay && (
                            <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-500" />
                          )}

                        {(isCheckInDay || isCheckOutDay) && (
                          <span className="text-[8px] bg-[#C5A880] text-[#26130F] font-bold px-1 rounded leading-none">
                            {isCheckInDay ? 'כניסה' : 'עזיבה'}
                          </span>
                        )}
                      </div>

                      {/* Content: In All-Cabins mode vs Single Cabin */}
                      {!dayObj.isPast &&
                      (!dayObj.isBlockedForCheckIn || isSelectableCheckOut || isCheckOutDay) ? (
                        <div className="text-center w-full space-y-0.5">
                          {isAllCabinsView ? (
                            <>
                              <div
                                className={`text-[9px] font-black leading-none ${
                                  isCheckInDay || isCheckOutDay
                                    ? 'text-[#C5A880]'
                                    : dayObj.availableCabinsCount === dayObj.totalCabinsCount
                                    ? 'text-emerald-700'
                                    : 'text-amber-800'
                                }`}
                              >
                                {isSelectableCheckOut && !isCheckOutDay
                                  ? 'עזיבה'
                                  : `${dayObj.availableCabinsCount}/${dayObj.totalCabinsCount} פנויות`}
                              </div>
                              <div
                                className={`text-[8px] leading-none ${
                                  isCheckInDay || isCheckOutDay
                                    ? 'text-white/80'
                                    : 'text-stone-500'
                                }`}
                              >
                                {`מ-₪${dayObj.nightlyPrice}`}
                              </div>
                            </>
                          ) : (
                            <div
                              className={`text-[9px] sm:text-[11px] font-semibold leading-none ${
                                isCheckInDay || isCheckOutDay
                                  ? 'text-[#C5A880]'
                                  : 'text-stone-700'
                              }`}
                            >
                              {isSelectableCheckOut && !isCheckOutDay ? (
                                <span className="text-amber-800 font-bold text-[9px]">עזיבה</span>
                              ) : (
                                `₪${dayObj.nightlyPrice.toLocaleString()}`
                              )}
                            </div>
                          )}
                        </div>
                      ) : dayObj.isBlockedForCheckIn ? (
                        <div className="text-[8px] text-red-500 font-bold leading-none">תפוס</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* MULTI-CABIN BREAKDOWN SECTION: Appears in All-Cabins mode when dates are chosen */}
              {isAllCabinsView && checkIn && checkOut && (
                <div className="mt-3 p-3 sm:p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-stone-200 pb-2">
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-[#26130F] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#C5A880]" />
                        <span>זמינות כל הבקתות במתחם לתאריכים: {checkIn} עד {checkOut} ({pricing.nights} לילות)</span>
                      </h4>
                      <p className="text-[11px] text-stone-600">
                        בחרו את הבקתה הרצויה לסגירה ישירה, או פנו בוואטסאפ להזמנת כמה בקתות יחד
                      </p>
                    </div>

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>הזמנת כמה בקתות יחד בוואטסאפ</span>
                    </a>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {cabinsBreakdownForDates.map(({ unit, isAvailable, pricing: unitPricing, deposit }) => (
                      <div
                        key={unit.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                          isAvailable
                            ? 'bg-white border-emerald-200/90 shadow-xs hover:border-emerald-400'
                            : 'bg-stone-100/60 border-stone-200 opacity-60'
                        }`}
                      >
                        <div className="space-y-0.5 text-right">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-[#26130F]">{unit.name}</span>
                            {isAvailable ? (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" />
                                <span>פנויה</span>
                              </span>
                            ) : (
                              <span className="text-[9px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" />
                                <span>תפוסה</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-stone-500">
                            עד {unit.maxOccupancy} אורחים · {unit.features?.[0] || 'ג׳קוזי ספא ונוף'}
                          </div>

                          {isAvailable && (
                            <div className="text-[11px] text-stone-700 font-semibold pt-0.5">
                              סה״כ: <span className="font-bold text-[#26130F]">₪{unitPricing.totalPrice?.toLocaleString()}</span> · מקדמה (20%): <span className="text-emerald-800 font-bold">₪{deposit.toLocaleString()}</span>
                            </div>
                          )}
                        </div>

                        <div>
                          {isAvailable ? (
                            <button
                              type="button"
                              onClick={() => handleSelectCabinFromList(unit)}
                              className="py-2 px-3 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] text-xs font-black flex items-center gap-1 shadow-xs transition cursor-pointer"
                            >
                              <span>בחר בקתה</span>
                              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-stone-400 font-bold px-2 py-1">
                              לא זמין
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SINGLE-CABIN PRICING & DEPOSIT SUMMARY BAR */}
              {!isAllCabinsView && checkIn && checkOut && (
                <div className="bg-[#26130F] text-white p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                  <div className="text-right w-full sm:w-auto space-y-0.5">
                    <div className="text-xs text-[#C5A880] font-bold">
                      {selectedUnit?.name} · {checkIn} עד {checkOut} ({pricing.nights} לילות)
                    </div>
                    <div className="text-[11px] text-white/90">
                      סה״כ: ₪{pricing.totalPrice.toLocaleString()} ·{' '}
                      <span className="text-[#C5A880] font-bold">
                        מקדמה כעת (20%): ₪{pricing.depositAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-white/50">
                      יתרה בצ׳ק-אין (80%): ₪{pricing.balanceAmount.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-none py-2 px-3.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>בירור בוואטסאפ</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setShowBookingForm(true)}
                      className="flex-1 sm:flex-none py-2.5 px-5 rounded-lg bg-[#C5A880] hover:bg-[#b8986c] text-[#26130F] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg animate-pulse hover:animate-none cursor-pointer"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>לתשלום מקדמה מאובטח</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* STEP 2: GUEST DETAILS & PAYMENT FORM */}
        {showBookingForm && !bookingConfirmed && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 animate-fadeIn">
            {/* Stay Summary Card */}
            <div className="bg-stone-50 p-3 sm:p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C5A880]">
                  יחידת אירוח נבחרת
                </span>
                <h4 className="text-sm sm:text-base font-bold text-[#26130F]">
                  {selectedUnit?.name || property?.name}
                </h4>
                <div className="text-xs text-stone-600 font-medium">
                  {checkIn} עד {checkOut} ·{' '}
                  <span className="text-[#26130F] font-bold">{pricing.nights} לילות</span> · {adults}{' '}
                  מבוגרים{children > 0 ? `, ${children} ילדים` : ''}
                </div>
              </div>

              <div className="text-right sm:text-left bg-white p-2.5 rounded-xl border border-stone-200 shrink-0 w-full sm:w-auto">
                <div className="text-[10px] text-stone-500">
                  סה״כ לתשלום: ₪{pricing.totalPrice.toLocaleString()}
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-emerald-800">
                  מקדמה כעת (20%): ₪{pricing.depositAmount.toLocaleString()}
                </div>
                <div className="text-[10px] text-stone-500">
                  יתרה בצ'ק-אין: ₪{pricing.balanceAmount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Direct Booking Form */}
            <form onSubmit={handleSubmitBooking} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">שם מלא *</label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="ישראל ישראלי"
                    className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">טלפון נייד *</label>
                  <input
                    type="tel"
                    required
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  כתובת אימייל *{' '}
                  <span className="text-[10px] text-stone-500 font-normal">
                    (חובה לקבלת חשבונית מס ואישור סליקה)
                  </span>
                </label>
                <input
                  type="email"
                  required
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  בקשות מיוחדות (אופציונלי)
                </label>
                <input
                  type="text"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="הגעה מאוחרת, סידור מיטה וכו'"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                />
              </div>

              {/* Payment Security Note */}
              <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-600 flex items-center justify-between border border-stone-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>סליקה מאובטחת ע״י Cardcom</span>
                </div>
                <span className="font-extrabold text-[#26130F]">
                  מקדמה: ₪{pricing.depositAmount.toLocaleString()}
                </span>
              </div>

              {bookingError && (
                <div className="p-2.5 bg-red-50 rounded-xl text-red-600 text-xs border border-red-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowBookingForm(false)}
                  className="py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>חזרה ללוח</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-3 px-6 rounded-xl bg-[#C5A880] hover:bg-[#b8986c] text-[#26130F] text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>מעביר לדף סליקה...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>מעבר לתשלום מקדמה (₪{pricing.depositAmount.toLocaleString()})</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: BOOKING PENDING DEPOSIT PAYMENT */}
        {bookingConfirmed && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 animate-fadeIn">
            <div className="p-5 bg-amber-50/90 rounded-2xl border border-amber-200/80 text-stone-900 space-y-3 shadow-sm">
              <div className="flex items-center gap-2.5 text-amber-900 font-extrabold text-sm sm:text-base">
                <Clock className="w-5 h-5 text-amber-700 shrink-0" />
                <span>שלב אחרון: תשלום מקדמה לשריון סופי ביומן</span>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed">
                ההזמנה נרשמה זמנית ביומן וממתינה לתשלום מקדמה.
                <span className="font-semibold text-amber-950">
                  {' '}
                  האישור הסופי ופתיחת כרטיס ניהול השהייה מתבצעים רק לאחר השלמת התשלום המאובטח.
                </span>
              </p>

              <div className="bg-white p-3.5 rounded-xl border border-amber-200/60 text-xs text-stone-700 space-y-1.5 font-medium">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">מספר הזמנה:</span>
                  <span className="font-mono font-bold text-stone-900">{bookingConfirmed.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">יחידת אירוח:</span>
                  <span className="font-bold text-[#26130F]">{selectedUnit?.name || property?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">תאריכי שהייה:</span>
                  <span>
                    {checkIn} עד {checkOut} ({pricing.nights} לילות)
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                  <span className="font-bold text-stone-900">מקדמה לתשלום כעת (20%):</span>
                  <span className="text-sm font-extrabold text-emerald-800">
                    ₪{pricing.depositAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-stone-500">
                  <span>יתרה לתשלום בצ'ק-אין (80%):</span>
                  <span>₪{pricing.balanceAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
                {paymentPayUrl && (
                  <a
                    href={paymentPayUrl}
                    className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-[#C5A880] hover:bg-[#b8986c] text-[#26130F] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-transform hover:scale-[1.02]"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>לדף השהות והסליקה</span>
                  </a>
                )}

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto py-3 px-4 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>סיוע ושאלות בוואטסאפ</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
