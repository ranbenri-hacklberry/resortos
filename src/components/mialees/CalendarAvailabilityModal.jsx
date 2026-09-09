import React, { useState, useMemo, useEffect } from 'react';
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
  Clock
} from 'lucide-react';
import {
  buildWhatsAppReservationUrl,
  calculateStayPricing
} from '../../lib/multiPropertyCatalog';
import { fetchLiveAvailability, createLiveBooking, startCheckoutPayment } from '../../lib/mialeesApi';
import { addDaysIso } from '../../lib/mialeesBookingRestrictions';

export function CalendarAvailabilityModal({
  property,
  onClose,
  initialUnit
}) {
  const units = property?.units || [];
  const [selectedUnit, setSelectedUnit] = useState(() => initialUnit || units[0] || null);

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

  // Selected Date Range
  const [checkIn, setCheckIn] = useState(null);
  const [checkOut, setCheckOut] = useState(null);

  // Live availability
  const [blockedRanges, setBlockedRanges] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityOffline, setAvailabilityOffline] = useState(false);

  // Forward days page offset (0 = starting from today, 1 = +28 days, etc.)
  const [pageOffset, setPageOffset] = useState(0);
  const DAYS_PER_VIEW = 35; // 5 weeks forward

  // Direct Booking & Hyp Payment Step inside modal
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(null);
  const [paymentPayUrl, setPaymentPayUrl] = useState(null);
  const [bookingError, setBookingError] = useState(null);

  // Fetch live availability for selected unit / property
  useEffect(() => {
    let mounted = true;
    setIsLoadingAvailability(true);

    const fromDate = todayIso;
    const toDate = addDaysIso(todayIso, 180);

    fetchLiveAvailability({
      unitId: selectedUnit?.isFullBuyout ? undefined : selectedUnit?.id,
      propertyId: property?.id,
      from: fromDate,
      to: toDate
    }).then((res) => {
      if (!mounted) return;
      setIsLoadingAvailability(false);
      if (res.isOffline) {
        setAvailabilityOffline(true);
        setBlockedRanges([]);
      } else {
        setAvailabilityOffline(false);
        setBlockedRanges(res.blockedRanges || []);
      }
    });

    return () => {
      mounted = false;
    };
  }, [selectedUnit?.id, selectedUnit?.isFullBuyout, property?.id, todayIso]);

  const monthNamesHe = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];

  const weekdayNamesHe = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  // Generate continuous rolling calendar days starting from TODAY (and forward)
  const { viewDays, activeMonthsTitle } = useMemo(() => {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + (pageOffset * 28));

    const days = [];
    const weekdayBase = selectedUnit?.basePrice || 850;
    const weekendBase = selectedUnit?.weekendPrice || Math.round(weekdayBase * 1.3);

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

      // A day is blocked for check-in if an existing booking stays overnight on this date (checkIn <= dayIso < checkOut)
      const isBlockedForCheckIn = blockedRanges.some((r) => {
        if (selectedUnit?.isFullBuyout) {
          return r.checkIn <= dayIso && r.checkOut > dayIso;
        }
        return r.unitId === selectedUnit?.id && r.checkIn <= dayIso && r.checkOut > dayIso;
      });

      days.push({
        dayNumber: dateNum,
        monthName: monthNamesHe[m],
        monthIndex: m,
        year: y,
        dateIso: dayIso,
        isWeekend,
        nightlyPrice,
        isToday,
        isPast,
        isBlockedForCheckIn
      });
    }

    return {
      viewDays: days,
      activeMonthsTitle: Array.from(monthsEncountered).join(' – ')
    };
  }, [today, todayIso, pageOffset, selectedUnit, blockedRanges]);

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

      // Check if any existing booking overlaps with proposed range [checkIn, dayObj.dateIso)
      const hasConflict = blockedRanges.some((r) => {
        const matches = selectedUnit?.isFullBuyout ? true : r.unitId === selectedUnit?.id;
        return matches && r.checkIn < dayObj.dateIso && r.checkOut > checkIn;
      });

      if (hasConflict) {
        // There is an occupied night between checkIn and clicked date
        if (!dayObj.isBlockedForCheckIn) {
          setCheckIn(dayObj.dateIso);
          setCheckOut(null);
        }
      } else {
        // 100% Valid check-out date! (e.g. check-in on 26th, check-out on 27th morning)
        setCheckOut(dayObj.dateIso);
      }
    }
  }

  // Pricing (Prices in Shekels & 20% Deposit calculation)
  const pricing = useMemo(() => {
    const calc = calculateStayPricing({
      unit: selectedUnit,
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
  }, [selectedUnit, checkIn, checkOut, adults, children]);

  // WhatsApp Link
  const whatsappUrl = useMemo(() => {
    const paxString = `pax:${adults}+${children}+${babies}`;
    return buildWhatsAppReservationUrl({
      property,
      unit: selectedUnit,
      checkIn: checkIn || 'החל מהיום',
      checkOut: checkOut || 'לפי בחירה',
      nights: pricing.nights || 2,
      guests: adults + children,
      totalPrice: pricing.totalPrice || selectedUnit?.basePrice * 2,
      customNotes: paxString
    });
  }, [property, selectedUnit, checkIn, checkOut, pricing, adults, children, babies]);

  // Submit direct booking and proceed immediately to Hyp Deposit Checkout
  async function handleSubmitBooking(e) {
    e.preventDefault();
    if (!guestName || !guestPhone || !guestEmail || !checkIn || !checkOut) {
      setBookingError('אנא מלאו את כל שדות החובה כולל כתובת אימייל עבור החשבונית.');
      return;
    }

    if (pricing.totalPrice <= 0 || pricing.depositAmount <= 0) {
      setBookingError('סכום ההזמנה אינו תקין.');
      return;
    }

    setIsSubmitting(true);
    setBookingError(null);

    // Prepare payload in Agorot (₪1 = 100 agorot)
    const payload = {
      unit_id: String(selectedUnit.id).trim(),
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
      is_buyout: Boolean(selectedUnit.isFullBuyout),
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

    // If payment pay_url is returned directly from booking creation, redirect immediately to Hyp
    if (res.payment?.pay_url) {
      setPaymentPayUrl(res.payment.pay_url);
      setIsSubmitting(false);
      window.location.href = res.payment.pay_url;
      return;
    }

    // Otherwise start Hyp payment checkout via token
    if (booking.checkout_token) {
      const checkoutRes = await startCheckoutPayment({
        token: booking.checkout_token,
        guestName,
        guestEmail
      });

      setIsSubmitting(false);

      if (checkoutRes.success && checkoutRes.payUrl) {
        setPaymentPayUrl(checkoutRes.payUrl);
        // Seamless immediate redirect to Hyp secured deposit payment page
        window.location.href = checkoutRes.payUrl;
      } else {
        // Fallback: Show link to /stay/:token
        setPaymentPayUrl(`/stay/${booking.checkout_token}`);
      }
    } else {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-3xl w-full max-h-[96vh] flex flex-col shadow-2xl border border-stone-200 overflow-hidden my-auto">
        {/* Compact Modal Header */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 bg-[var(--brand-primary)] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {showBookingForm && !bookingConfirmed ? (
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-[#C5A880] transition-colors flex items-center gap-1 text-xs font-bold"
                title="חזרה ללוח השנה"
              >
                <ArrowRight className="w-4 h-4" />
                <span>חזרה ללוח</span>
              </button>
            ) : (
              <CalendarIcon className="w-4 h-4 text-[#C5A880] shrink-0" />
            )}
            <h3 className="text-sm sm:text-base font-bold truncate">
              {showBookingForm && !bookingConfirmed ? 'השלמת פרטי הזמנה וסליקה' : property?.name}
            </h3>
            <span className="text-[10px] text-white/60 bg-white/10 px-1.5 py-0.5 rounded hidden sm:inline">
              {property?.village}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 sm:p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: CALENDAR VIEW */}
        {!showBookingForm && !bookingConfirmed && (
          <>
            {/* Compact Unit & Guests Bar */}
            <div className="px-3 py-2 sm:px-5 sm:py-2.5 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Unit Selector */}
              <div className="flex-1 min-w-[150px]">
                <select
                  value={selectedUnit?.id || ''}
                  onChange={(e) => {
                    const u = units.find((unit) => unit.id === e.target.value);
                    if (u) {
                      setSelectedUnit(u);
                      setCheckIn(null);
                      setCheckOut(null);
                    }
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg border border-stone-300 bg-white text-xs font-bold text-[var(--brand-primary)] focus:outline-none"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} (עד {u.maxOccupancy})
                    </option>
                  ))}
                </select>
              </div>

              {/* Guests Counters */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200">
                  <span className="text-[11px] text-stone-500">מבוגרים:</span>
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.max(1, prev - 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700"
                  >
                    -
                  </button>
                  <span className="font-bold text-xs w-3 text-center">{adults}</span>
                  <button
                    type="button"
                    onClick={() => setAdults((prev) => Math.min(selectedUnit?.maxOccupancy || 10, prev + 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700"
                  >
                    +
                  </button>
                </div>

                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-stone-200">
                  <span className="text-[11px] text-stone-500">ילדים:</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => Math.max(0, prev - 1))}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700"
                  >
                    -
                  </button>
                  <span className="font-bold text-xs w-3 text-center">{children}</span>
                  <button
                    type="button"
                    onClick={() => setChildren((prev) => prev + 1)}
                    className="w-5 h-5 rounded bg-stone-100 flex items-center justify-center font-bold text-stone-700"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Calendar Body */}
            <div className="p-2 sm:p-4 overflow-y-auto flex-1 space-y-2 sm:space-y-3">
              {/* Forward Rolling Calendar Navigation */}
              <div className="flex items-center justify-between px-1 py-1">
                <button
                  type="button"
                  disabled={pageOffset <= 0}
                  onClick={() => setPageOffset((prev) => Math.max(0, prev - 1))}
                  className={`p-1.5 rounded-lg border flex items-center gap-1 text-[11px] font-bold transition-colors ${
                    pageOffset <= 0
                      ? 'border-stone-200 text-stone-300 cursor-not-allowed'
                      : 'border-stone-200 hover:bg-stone-100 text-stone-700'
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>הקודם</span>
                </button>

                <div className="text-center">
                  <h4 className="text-xs sm:text-sm font-bold text-[var(--brand-primary)]">
                    {activeMonthsTitle}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={() => setPageOffset((prev) => prev + 1)}
                  className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-700 transition-colors flex items-center gap-1 text-[11px] font-bold"
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
                    return <div key={`empty-${idx}`} className="h-12 sm:h-16 bg-transparent" />;
                  }

                  const isCheckInDay = checkIn === dayObj.dateIso;
                  const isCheckOutDay = checkOut === dayObj.dateIso;
                  const isInRange = checkIn && checkOut && dayObj.dateIso > checkIn && dayObj.dateIso < checkOut;

                  // Check if this date is clickable as a valid check-out date for current check-in
                  const isSelectableCheckOut = Boolean(
                    checkIn &&
                    !checkOut &&
                    dayObj.dateIso > checkIn &&
                    !blockedRanges.some((r) => {
                      const matches = selectedUnit?.isFullBuyout ? true : r.unitId === selectedUnit?.id;
                      return matches && r.checkIn < dayObj.dateIso && r.checkOut > checkIn;
                    })
                  );

                  const isClickable = !dayObj.isPast && (
                    isSelectableCheckOut ||
                    !dayObj.isBlockedForCheckIn ||
                    isCheckInDay
                  );

                  let tileStyle = 'bg-stone-50 hover:bg-stone-100 text-stone-900 border-stone-200';

                  if (dayObj.isPast) {
                    tileStyle = 'bg-stone-100/40 text-stone-300 border-transparent cursor-not-allowed opacity-30';
                  } else if (isCheckInDay || isCheckOutDay) {
                    tileStyle = 'bg-[var(--brand-primary)] text-white border-[var(--brand-accent)] shadow-md scale-[1.02] z-10 font-bold';
                  } else if (isInRange) {
                    tileStyle = 'bg-[#C5A880]/20 text-[var(--brand-primary)] border-[#C5A880] font-bold';
                  } else if (isSelectableCheckOut) {
                    tileStyle = 'bg-amber-50/70 hover:bg-amber-100 text-stone-900 border-amber-300 cursor-pointer ring-1 ring-amber-400/50';
                  } else if (dayObj.isBlockedForCheckIn) {
                    tileStyle = 'bg-red-50/70 text-red-500 border-red-200 cursor-not-allowed';
                  } else if (dayObj.isToday) {
                    tileStyle = 'bg-emerald-50 text-emerald-950 border-emerald-400 ring-1 ring-emerald-400';
                  } else if (dayObj.isWeekend) {
                    tileStyle = 'bg-amber-50/50 hover:bg-amber-100 text-amber-900 border-amber-200';
                  }

                  return (
                    <button
                      key={dayObj.dateIso}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => handleDayClick(dayObj)}
                      className={`h-12 sm:h-16 p-1 rounded-lg sm:rounded-xl border flex flex-col justify-between items-center transition-all relative overflow-hidden ${tileStyle}`}
                    >
                      {/* Top: Day Number + Tag */}
                      <div className="w-full flex items-center justify-between text-[11px] sm:text-xs leading-none">
                        <span className="font-bold">{dayObj.dayNumber}</span>

                        {/* Today Badge */}
                        {dayObj.isToday && !isCheckInDay && !isCheckOutDay && (
                          <span className="text-[8px] bg-emerald-600 text-white font-extrabold px-1 py-0.5 rounded leading-none">
                            היום
                          </span>
                        )}

                        {dayObj.isBlockedForCheckIn && !isSelectableCheckOut && !isCheckOutDay && (
                          <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-500" />
                        )}

                        {(isCheckInDay || isCheckOutDay) && (
                          <span className="text-[8px] bg-[#C5A880] text-[#26130F] font-bold px-1 rounded leading-none">
                            {isCheckInDay ? 'כניסה' : 'עזיבה'}
                          </span>
                        )}
                      </div>

                      {/* Nightly Price or Status on Cell */}
                      {!dayObj.isPast && (!dayObj.isBlockedForCheckIn || isSelectableCheckOut || isCheckOutDay) ? (
                        <div
                          className={`text-[9px] sm:text-[11px] font-semibold leading-none ${
                            isCheckInDay || isCheckOutDay ? 'text-[#C5A880]' : 'text-stone-700'
                          }`}
                        >
                          {isSelectableCheckOut && !isCheckOutDay ? (
                            <span className="text-amber-800 font-bold text-[9px]">עזיבה</span>
                          ) : (
                            `₪${dayObj.nightlyPrice.toLocaleString()}`
                          )}
                        </div>
                      ) : dayObj.isBlockedForCheckIn ? (
                        <div className="text-[8px] text-red-500 font-bold leading-none">תפוס</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Pricing & Deposit Summary Bar */}
              {checkIn && checkOut && (
                <div className="bg-stone-900 text-white p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                  <div className="text-right w-full sm:w-auto space-y-0.5">
                    <div className="text-xs text-[#C5A880] font-bold">
                      {checkIn} עד {checkOut} ({pricing.nights} לילות)
                    </div>
                    <div className="text-[11px] text-white/90">
                      סה״כ: ₪{pricing.totalPrice.toLocaleString()} · <span className="text-[#C5A880] font-bold">מקדמה כעת (20%): ₪{pricing.depositAmount.toLocaleString()}</span>
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
                      className="flex-1 sm:flex-none py-2 px-3.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>בירור בוואטסאפ</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setShowBookingForm(true)}
                      className="flex-1 sm:flex-none py-2.5 px-5 rounded-lg bg-[#C5A880] hover:bg-[#b8986c] text-[#26130F] font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg animate-pulse hover:animate-none"
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

        {/* STEP 2: GUEST DETAILS & HYP DEPOSIT CHECKOUT FORM */}
        {showBookingForm && !bookingConfirmed && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 animate-fadeIn">
            {/* Stay Summary Card */}
            <div className="bg-stone-50 p-3 sm:p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C5A880]">יחידת אירוח נבחרת</span>
                <h4 className="text-sm sm:text-base font-bold text-[var(--brand-primary)]">{selectedUnit?.name}</h4>
                <div className="text-xs text-stone-600 font-medium">
                  {checkIn} עד {checkOut} · <span className="text-[var(--brand-primary)] font-bold">{pricing.nights} לילות</span> · {adults} מבוגרים{children > 0 ? `, ${children} ילדים` : ''}
                </div>
              </div>

              <div className="text-right sm:text-left bg-white p-2.5 rounded-xl border border-stone-200 shrink-0 w-full sm:w-auto">
                <div className="text-[10px] text-stone-500">סה״כ לתשלום: ₪{pricing.totalPrice.toLocaleString()}</div>
                <div className="text-xs sm:text-sm font-extrabold text-emerald-800">
                  מקדמה כעת (20%): ₪{pricing.depositAmount.toLocaleString()}
                </div>
                <div className="text-[10px] text-stone-500">יתרה בצ'ק-אין: ₪{pricing.balanceAmount.toLocaleString()}</div>
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
                    className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
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
                    className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  כתובת אימייל * <span className="text-[10px] text-stone-500 font-normal">(חובה לקבלת חשבונית מס ואישור סליקה)</span>
                </label>
                <input
                  type="email"
                  required
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">בקשות מיוחדות (אופציונלי)</label>
                <input
                  type="text"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="הגעה מאוחרת, סידור מיטה וכו'"
                  className="w-full p-2.5 rounded-xl border border-stone-300 bg-white text-xs font-medium focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
                />
              </div>

              {/* Payment Security Note */}
              <div className="p-3 bg-stone-50 rounded-xl text-xs text-stone-600 flex items-center justify-between border border-stone-200">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>סליקה מאובטחת ע״י Hyp / מסוף מקדמות 4502315932</span>
                </div>
                <span className="font-extrabold text-[var(--brand-primary)]">מקדמה: ₪{pricing.depositAmount.toLocaleString()}</span>
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
                  className="py-2.5 px-4 rounded-xl border border-stone-300 text-stone-700 text-xs font-bold hover:bg-stone-100 flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>חזרה ללוח</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-3 px-6 rounded-xl bg-[#C5A880] hover:bg-[#b8986c] text-[#26130F] text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-lg disabled:opacity-50"
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

        {/* STEP 3: BOOKING PENDING DEPOSIT PAYMENT (UNPAID STATE) */}
        {bookingConfirmed && (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 animate-fadeIn">
            <div className="p-5 bg-amber-50/90 rounded-2xl border border-amber-200/80 text-stone-900 space-y-3 shadow-sm">
              <div className="flex items-center gap-2.5 text-amber-900 font-extrabold text-sm sm:text-base">
                <Clock className="w-5 h-5 text-amber-700 shrink-0" />
                <span>שלב אחרון: תשלום מקדמה לשריון סופי ביומן</span>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed">
                ההזמנה נרשמה זמנית ביומן וממתינה לתשלום מקדמה.
                <span className="font-semibold text-amber-950"> האישור הסופי ופתיחת כרטיס ניהול השהייה מתבצעים רק לאחר השלמת התשלום המאובטח ב-Hyp.</span>
              </p>

              <div className="bg-white p-3.5 rounded-xl border border-amber-200/60 text-xs text-stone-700 space-y-1.5 font-medium">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">מספר הזמנה:</span>
                  <span className="font-mono font-bold text-stone-900">{bookingConfirmed.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">יחידת אירוח:</span>
                  <span className="font-bold text-[var(--brand-primary)]">{selectedUnit?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">תאריכי שהייה:</span>
                  <span>{checkIn} עד {checkOut} ({pricing.nights} לילות)</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                  <span className="font-bold text-stone-900">מקדמה לתשלום כעת (20%):</span>
                  <span className="text-sm font-extrabold text-emerald-800">₪{pricing.depositAmount.toLocaleString()}</span>
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
                    <span>מעבר לתשלום מקדמה מאובטח (Hyp)</span>
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

