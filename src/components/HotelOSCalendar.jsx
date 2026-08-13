import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  X, 
  Edit3,
  Zap,
  Send,
  Phone,
  Clock,
  ExternalLink,
  Copy,
  Minus,
  CheckCircle2,
  Users,
  DollarSign,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  db, 
  useLiveUnits, 
  useLiveBookings, 
  useLivePromotions,
  useHotelOSSyncStatus, 
  startHotelOSSyncEngine 
} from '../lib/hotelos-db';
import { pushBookingToCloud, syncCloudBookingsToDexie, subscribeToRealtimeCloudBookings } from '../lib/cloudDb';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

// Utility: Format Date to YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Utility: Add Days
function addDays(d, days) {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Utility: Calculate difference in days
function getDaysDiff(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = Math.abs(end - start);
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export default function HotelOSCalendar({ tenantId = DEMO_TENANT_ID, theme = 'dark' }) {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef(null);
  
  const [currentStartDate, setCurrentStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [daysCount] = useState(60); // 60 Days / 2 Months scrollable frame
  
  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [dispatchModalData, setDispatchModalData] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [daySummaryModalData, setDaySummaryModalData] = useState(null);

  // Mouse Drag to Scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // New Reservation Form State
  const [newFormData, setNewFormData] = useState({
    unit_id: '',
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    check_in_date: formatDate(new Date()),
    check_out_date: formatDate(addDays(new Date(), 2)),
    adults_count: 2,
    children_count: 0,
    total_price_ils: 1200,
    deposit_ils: 300,
    channel_source: 'DIRECT'
  });

  // Edit Reservation Form State
  const [editFormData, setEditFormData] = useState(null);

  // 0ms Live Reactive Data Hooks from IndexedDB
  const rawUnits = useLiveUnits(tenantId);
  const rawBookings = useLiveBookings(tenantId);
  const rawPromotions = useLivePromotions(tenantId);
  const syncStatus = useHotelOSSyncStatus(tenantId);

  // Auto-sync real-time guest checkout confirmations & cross-device cloud bookings
  useEffect(() => {
    syncCloudBookingsToDexie(tenantId);
    const unsubscribe = subscribeToRealtimeCloudBookings(tenantId);
    const interval = setInterval(() => {
      syncCloudBookingsToDexie(tenantId);
    }, 4000);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      clearInterval(interval);
    };
  }, [tenantId]);

  // Theme Styling Token Definitions
  const isLight = theme === 'light';
  const themeStyles = {
    wrapperBg: isLight ? '#FAF8F3' : '#0F172A',
    cardBg: isLight ? '#FFFFFF' : '#1E293B',
    gridHeaderBg: isLight ? '#F6F3EC' : '#141416',
    stickyColBg: isLight ? '#FFFFFF' : '#111827',
    cellBorder: isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    textPrimary: isLight ? '#1C1917' : '#F8FAFC',
    textMuted: isLight ? '#57534E' : '#94A3B8',
    inputBg: isLight ? '#FFFFFF' : '#1E293B',
    inputBorder: isLight ? '#EAE5DD' : 'rgba(255, 255, 255, 0.12)',
    shadow: isLight ? '0 10px 30px rgba(0,0,0,0.06)' : '0 20px 40px rgba(0,0,0,0.3)',
    headerBorder: isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)'
  };

  // Seed initial demo data into IndexedDB if empty
  useEffect(() => {
    async function seedDemoDataIfEmpty() {
      try {
        const unitCount = await db.units.count();
        if (unitCount === 0) {
          const initialUnits = [
            { id: 'unit_1', tenant_id: tenantId, name: 'אורנית', base_price_agorot: 85000, is_active: true },
            { id: 'unit_2', tenant_id: tenantId, name: 'אלונים', base_price_agorot: 120000, is_active: true },
            { id: 'unit_3', tenant_id: tenantId, name: 'כרמים', base_price_agorot: 250000, is_active: true },
            { id: 'unit_4', tenant_id: tenantId, name: 'סלע', base_price_agorot: 90000, is_active: true }
          ];

          const today = new Date();
          const d = (offset) => formatDate(addDays(today, offset));

          const initialBookings = [
            {
              id: 'b1',
              tenant_id: tenantId,
              unit_id: 'unit_1',
              guest_name: 'דניאל כהן',
              guest_phone: '0548076123',
              check_in_date: d(0),
              check_out_date: d(3),
              total_price_agorot: 255000,
              deposit_agorot: 50000,
              booking_status: 'CONFIRMED',
              payment_status: 'PAID',
              channel_source: 'DIRECT'
            },
            {
              id: 'b2',
              tenant_id: tenantId,
              unit_id: 'unit_2',
              guest_name: 'אביב לוי',
              guest_phone: '0549876543',
              check_in_date: d(2),
              check_out_date: d(6),
              total_price_agorot: 480000,
              deposit_agorot: 100000,
              booking_status: 'CONFIRMED',
              payment_status: 'PARTIAL',
              channel_source: 'AIRBNB'
            },
            {
              id: 'b3',
              tenant_id: tenantId,
              unit_id: 'unit_3',
              guest_name: 'מיכל אברהמי',
              guest_phone: '0525554433',
              check_in_date: d(5),
              check_out_date: d(7),
              total_price_agorot: 500000,
              deposit_agorot: 0,
              booking_status: 'CONFIRMED',
              payment_status: 'UNPAID',
              channel_source: 'BOOKING_COM'
            }
          ];

          await db.units.bulkPut(initialUnits);
          await db.bookings.bulkPut(initialBookings);
        }
      } catch (err) {
        console.error('[HOTELOS SEED ERROR]', err);
      }
    }
    seedDemoDataIfEmpty();
  }, [tenantId]);

  // Generate date columns array
  const dateColumns = useMemo(() => {
    const dates = [];
    const todayStr = formatDate(new Date());
    const currentLng = i18n.language || 'he';

    for (let i = 0; i < daysCount; i++) {
      const d = addDays(currentStartDate, i);
      const dateStr = formatDate(d);
      const dayNameLocalized = t('day_' + d.getDay());

      let formattedDate;
      if (currentLng === 'ar') {
        formattedDate = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' });
      } else {
        formattedDate = `${d.getDate()}/${d.getMonth() + 1}`;
      }

      dates.push({
        dateStr,
        dayName: dayNameLocalized,
        formattedDate,
        isToday: dateStr === todayStr,
        isWeekend: d.getDay() === 5 || d.getDay() === 6
      });
    }
    return dates;
  }, [currentStartDate, daysCount, t, i18n.language]);

  // Mouse Wheel & Drag to Scroll Handlers for Desktop
  const handleWheel = (e) => {
    if (scrollContainerRef.current) {
      if (e.deltaY !== 0) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const handleMouseDown = (e) => {
    if (!scrollContainerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  // 1. EMPTY CELL CLICK -> Open WhatsApp Dispatch & Flash Deal Modal
  const handleCellClick = (unit, dateStr) => {
    setDispatchModalData({
      unit,
      unit_id: unit.id,
      check_in_date: dateStr,
      nights_count: 1,
      guest_phone: '0548076123',
      payment_mode: 'CREDIT_DEPOSIT',
      modalTab: 'dispatch'
    });
  };

  // 2. EXISTING BOOKING CLICK -> Open Existing Booking Details & Edit Modal
  const handleBookingClick = (booking, e) => {
    e.stopPropagation();
    setEditingBooking(booking);
    setEditFormData({
      id: booking.id,
      unit_id: booking.unit_id,
      guest_name: booking.guest_name || '',
      guest_phone: booking.guest_phone || '0548076123',
      guest_email: booking.guest_email || '',
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      adults_count: booking.adults_count || 2,
      children_count: booking.children_count || 0,
      total_price_ils: Math.round((booking.total_price_agorot || 0) / 100),
      deposit_ils: Math.round((booking.deposit_agorot || 0) / 100),
      payment_status: booking.payment_status || 'UNPAID',
      channel_source: booking.channel_source || 'DIRECT'
    });
  };

  // 3. DATE HEADER CLICK -> Open Daily Summary Modal
  const openDaySummaryModal = (dateStr) => {
    const activeUnitsCount = rawUnits.length || 4;
    let occupiedCount = 0;
    let checkIns = [];
    let checkOuts = [];

    rawBookings.forEach(b => {
      if (b.deleted_at || b.booking_status === 'CANCELED') return;

      if (dateStr >= b.check_in_date && dateStr < b.check_out_date) {
        occupiedCount++;
      }

      if (b.check_in_date === dateStr) {
        checkIns.push(b);
      }

      if (b.check_out_date === dateStr) {
        checkOuts.push(b);
      }
    });

    const occupancyPercent = Math.round((occupiedCount / activeUnitsCount) * 100);
    const estimatedDailyRevenue = occupiedCount * 950;

    setDaySummaryModalData({
      dateStr,
      occupiedCount,
      totalUnits: activeUnitsCount,
      occupancyPercent,
      estimatedDailyRevenue,
      checkIns,
      checkOuts
    });
  };

  // WhatsApp Dispatch Submission
  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!dispatchModalData) return;

    const unit = rawUnits.find(u => u.id === dispatchModalData.unit_id);
    const unitName = unit ? t(unit.id + '_short', unit.name) : t('UNIT');

    const checkOutDate = formatDate(addDays(new Date(dispatchModalData.check_in_date), dispatchModalData.nights_count));
    const basePriceIls = Math.round((unit?.base_price_agorot || 85000) / 100);
    const totalPriceIls = basePriceIls * dispatchModalData.nights_count;
    const depositIls = Math.round(totalPriceIls * 0.25);

    const now = new Date();
    const expiresAtMs = now.getTime() + 24 * 60 * 60 * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();

    const payload = {
      t: tenantId,
      u: dispatchModalData.unit_id,
      d: dispatchModalData.check_in_date,
      n: dispatchModalData.nights_count,
      p: dispatchModalData.guest_phone,
      m: dispatchModalData.payment_mode,
      exp: expiresAtMs,
      rand: Math.random().toString(36).substring(2, 6)
    };
    
    const token = 'v1_' + btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const pendingBooking = {
      id: 'b_' + Date.now(),
      tenant_id: tenantId,
      unit_id: dispatchModalData.unit_id,
      guest_name: 'הזמנה בטיפול (WhatsApp)',
      guest_phone: dispatchModalData.guest_phone,
      check_in_date: dispatchModalData.check_in_date,
      check_out_date: checkOutDate,
      adults_count: 2,
      children_count: 0,
      total_price_agorot: totalPriceIls * 100,
      deposit_agorot: depositIls * 100,
      booking_status: 'PENDING',
      payment_status: 'UNPAID',
      payment_mode: dispatchModalData.payment_mode,
      channel_source: 'DIRECT',
      checkout_token: token,
      expires_at: expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      version: 1
    };

    await db.bookings.put(pendingBooking);
    await pushBookingToCloud(pendingBooking);

    const customDomain = localStorage.getItem('hotelos-custom-domain');
    let baseUrl = 'https://hotelos-9gg.pages.dev';
    if (customDomain && customDomain.startsWith('http') && !customDomain.includes(':3001')) {
      baseUrl = customDomain.replace(/\/$/, '');
    }
    const checkoutUrl = `${baseUrl}/?token=${token}`;
    
    const cleanPhone = dispatchModalData.guest_phone.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;
    
    const messageText = encodeURIComponent(`שלום! להשלמת אישור ההזמנה ב-${unitName} לתאריך ${dispatchModalData.check_in_date}, לחץ על הקישור המאובטח:\n\n${checkoutUrl}\n\nתודה!`);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${messageText}`;

    window.open(whatsappUrl, '_blank');
    setDispatchModalData(null);
  };

  // Submit New Reservation
  const handleNewReservationSubmit = async (e) => {
    e.preventDefault();
    const totalPriceAgorot = Math.round(Number(newFormData.total_price_ils) * 100);
    const depositAgorot = Math.round(Number(newFormData.deposit_ils) * 100);
    const newBookingRecord = {
      id: 'b_' + Date.now(),
      tenant_id: tenantId,
      unit_id: newFormData.unit_id,
      guest_name: newFormData.guest_name,
      guest_phone: newFormData.guest_phone,
      guest_email: newFormData.guest_email,
      check_in_date: newFormData.check_in_date,
      check_out_date: newFormData.check_out_date,
      adults_count: Number(newFormData.adults_count),
      children_count: Number(newFormData.children_count),
      total_price_agorot: totalPriceAgorot,
      deposit_agorot: depositAgorot,
      booking_status: 'CONFIRMED',
      payment_status: depositAgorot > 0 ? (depositAgorot >= totalPriceAgorot ? 'PAID' : 'PARTIAL') : 'UNPAID',
      channel_source: newFormData.channel_source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    };

    await db.bookings.put(newBookingRecord);
    await pushBookingToCloud(newBookingRecord);
    setIsNewModalOpen(false);
  };

  // Submit Edit Reservation
  const handleEditReservationSubmit = async (e) => {
    e.preventDefault();
    if (!editFormData) return;

    const totalPriceAgorot = Math.round(Number(editFormData.total_price_ils) * 100);
    const depositAgorot = Math.round(Number(editFormData.deposit_ils) * 100);

    const updatedBooking = {
      ...editingBooking,
      unit_id: editFormData.unit_id,
      guest_name: editFormData.guest_name,
      guest_phone: editFormData.guest_phone,
      guest_email: editFormData.guest_email,
      check_in_date: editFormData.check_in_date,
      check_out_date: editFormData.check_out_date,
      adults_count: Number(editFormData.adults_count),
      children_count: Number(editFormData.children_count),
      total_price_agorot: totalPriceAgorot,
      deposit_agorot: depositAgorot,
      payment_status: editFormData.payment_status,
      channel_source: editFormData.channel_source,
      updated_at: new Date().toISOString()
    };

    await db.bookings.put(updatedBooking);
    await pushBookingToCloud(updatedBooking);
    setEditingBooking(null);
    setEditFormData(null);
  };

  // Cancel/Delete Reservation
  const handleCancelBooking = async () => {
    if (!editingBooking) return;
    if (window.confirm(t('CONFIRM_DELETE', 'האם אתה בטוח שברצונך לבטל הזמנה זו?'))) {
      const canceledBooking = {
        ...editingBooking,
        booking_status: 'CANCELED',
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await db.bookings.put(canceledBooking);
      await pushBookingToCloud(canceledBooking);
      setEditingBooking(null);
      setEditFormData(null);
    }
  };

  // Payment Status Badge Styling
  const getPaymentBadge = (status, bookingStatus) => {
    if (bookingStatus === 'PENDING') {
      return { label: 'ממתין לתשלום', bg: 'rgba(245, 158, 11, 0.18)', color: '#F59E0B', border: '#F59E0B' };
    }
    switch (status) {
      case 'PAID':
        return { label: 'שולם מלא', bg: 'rgba(16, 185, 129, 0.18)', color: '#10B981', border: '#10B981' };
      case 'PARTIAL':
        return { label: 'מקדמה', bg: 'rgba(245, 158, 11, 0.18)', color: '#F59E0B', border: '#F59E0B' };
      default:
        return { label: 'לא שולם', bg: 'rgba(239, 68, 68, 0.18)', color: '#EF4444', border: '#EF4444' };
    }
  };

  const buttonStyle = {
    background: isLight ? '#EAE5DD' : '#1E293B',
    color: themeStyles.textPrimary,
    border: `1px solid ${themeStyles.inputBorder}`,
    borderRadius: '10px',
    padding: '0.45rem 0.8rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.4rem',
    fontWeight: 600,
    fontSize: '0.85rem',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap'
  };

  return (
    <div 
      className="hotelos-calendar-wrapper"
      dir="rtl" 
      style={{
        background: themeStyles.wrapperBg,
        color: themeStyles.textPrimary,
        padding: '1.25rem 0.5rem 0.5rem 0.5rem',
        marginTop: '0.75rem',
        borderRadius: '16px',
        boxShadow: themeStyles.shadow,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >


      {/* MAIN GRID DASHBOARD - 60 DAYS SCROLL FRAME */}
      <div 
        ref={scrollContainerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeaveOrUp}
        onMouseUp={handleMouseLeaveOrUp}
        onMouseMove={handleMouseMove}
        style={{ 
          overflowX: 'auto', 
          borderRadius: '12px', 
          border: `1px solid ${themeStyles.cellBorder}`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: `80px repeat(${daysCount}, minmax(65px, 1fr))`, 
          minWidth: `${80 + daysCount * 65}px` 
        }}>
          
          {/* STICKY TOP RIGHT CORNER HEADER */}
          <div style={{
            position: 'sticky',
            right: 0,
            zIndex: 25,
            background: themeStyles.gridHeaderBg,
            padding: '0.4rem 0.2rem',
            fontWeight: 800,
            fontSize: '0.72rem',
            borderBottom: `1px solid ${themeStyles.cellBorder}`,
            borderLeft: `1.5px solid ${themeStyles.cellBorder}`,
            boxShadow: isLight ? '-2px 0 6px rgba(0,0,0,0.05)' : '-2px 0 8px rgba(0,0,0,0.3)',
            color: themeStyles.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'nowrap'
          }}>
            יחידות ({rawUnits.length})
          </div>

          {/* DATE COLUMNS HEADER (CLICKABLE FOR DAILY SUMMARY) */}
          {dateColumns.map(col => (
            <div
              key={col.dateStr}
              onClick={() => openDaySummaryModal(col.dateStr)}
              title="לחץ לסיכום נתוני יום"
              style={{
                background: col.isToday 
                  ? (isLight ? '#EEF2FF' : '#312E81') 
                  : themeStyles.gridHeaderBg,
                padding: '0.6rem 0.3rem',
                textAlign: 'center',
                borderBottom: `1px solid ${themeStyles.cellBorder}`,
                borderLeft: `1px solid ${themeStyles.cellBorder}`,
                color: col.isToday ? '#818CF8' : (col.isWeekend ? '#F59E0B' : themeStyles.textPrimary),
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, opacity: 0.8 }}>{col.dayName}</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>{col.formattedDate}</div>
            </div>
          ))}

          {/* UNIT ROWS & BOOKING CARDS */}
          {rawUnits.map(unit => {
            const unitBookings = rawBookings.filter(b => b.unit_id === unit.id && !b.deleted_at && b.booking_status !== 'CANCELED');
            const singleWordUnitName = t(unit.id + '_short', unit.name);

            return (
              <React.Fragment key={unit.id}>
                {/* STICKY UNIT NAME CELL - ULTRA COMPACT 80px FLUSH RIGHT */}
                <div style={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 20,
                  background: themeStyles.stickyColBg,
                  padding: '0.4rem 0.2rem',
                  borderBottom: `1px solid ${themeStyles.cellBorder}`,
                  borderLeft: `1.5px solid ${themeStyles.cellBorder}`,
                  boxShadow: isLight ? '-2px 0 6px rgba(0,0,0,0.05)' : '-2px 0 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  width: '80px',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ fontWeight: 800, fontSize: '0.8rem', color: themeStyles.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '76px' }}>
                    {singleWordUnitName}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: themeStyles.textMuted, marginTop: '1px' }}>
                    ₪{Math.round((unit.base_price_agorot || 85000) / 100)}
                  </div>
                </div>

                {/* DAY CELLS GRID */}
                {dateColumns.map((col, colIndex) => {
                  const activeBooking = unitBookings.find(b => {
                    return col.dateStr >= b.check_in_date && col.dateStr < b.check_out_date;
                  });

                  // Check if this cell is the start of the booking, or the first visible cell for an ongoing past booking
                  const isStartOfBooking = activeBooking && (
                    activeBooking.check_in_date === col.dateStr || 
                    (colIndex === 0 && activeBooking.check_in_date < col.dateStr)
                  );

                  return (
                    <div
                      key={col.dateStr}
                      onClick={() => !activeBooking && handleCellClick(unit, col.dateStr)}
                      style={{
                        background: col.isToday 
                          ? (isLight ? 'rgba(245, 158, 11, 0.04)' : 'rgba(245, 158, 11, 0.08)') 
                          : (colIndex % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)')),
                        borderBottom: `1px solid ${themeStyles.cellBorder}`,
                        borderLeft: col.isToday ? '1.5px solid rgba(245, 158, 11, 0.5)' : `1px solid ${themeStyles.cellBorder}`,
                        position: 'relative',
                        height: '65px',
                        cursor: activeBooking ? 'default' : 'pointer'
                      }}
                    >

                      {/* Render Booking Block Card on Start Cell (Starts at left 50% of Check-In Day, Ends at right 50% of Check-Out Day) */}
                      {isStartOfBooking && (() => {
                        const startsToday = activeBooking.check_in_date === col.dateStr;
                        const nights = getDaysDiff(activeBooking.check_in_date, activeBooking.check_out_date);
                        const visibleNights = startsToday 
                          ? nights 
                          : getDaysDiff(col.dateStr, activeBooking.check_out_date);

                        const badge = getPaymentBadge(activeBooking.payment_status, activeBooking.booking_status);
                        const localizedGuestName = activeBooking.guest_name || 'אורח';

                        // RTL Alignment: Check-in starts at 50% (left half) of Check-in day
                        const rightOffset = startsToday ? '50%' : '2px';
                        const barWidth = startsToday 
                          ? `calc(${visibleNights * 100}% - 4px)` 
                          : `calc(${visibleNights * 100 - 50}% - 4px)`;

                        return (
                          <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            onClick={(e) => handleBookingClick(activeBooking, e)}
                            style={{
                              position: 'absolute',
                              top: '6px',
                              right: rightOffset,
                              width: barWidth,
                              height: '52px',
                              zIndex: 10,
                              background: activeBooking.booking_status === 'PENDING'
                                ? 'linear-gradient(135deg, #FFFBEB, #FEF3C7)'
                                : (isLight ? '#FFFFFF' : 'linear-gradient(135deg, #1E293B, #0F172A)'),
                              border: `1.5px solid ${badge.border}`,
                              borderRadius: '8px',
                              padding: '0.4rem 0.6rem',
                              boxShadow: isLight 
                                ? '0 4px 12px rgba(0,0,0,0.08)' 
                                : '0 4px 12px rgba(0,0,0,0.25)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              overflow: 'hidden'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                              <span style={{ 
                                fontWeight: 700, 
                                fontSize: '0.8rem', 
                                color: activeBooking.booking_status === 'PENDING' ? '#92400E' : (isLight ? '#0F172A' : '#FFFFFF'), 
                                whiteSpace: 'nowrap', 
                                textOverflow: 'ellipsis', 
                                overflow: 'hidden' 
                              }}>
                                {localizedGuestName}
                              </span>
                              <span style={{
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                whiteSpace: 'nowrap'
                              }}>
                                {badge.label}
                              </span>
                            </div>

                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between', 
                              fontSize: '0.7rem', 
                              color: activeBooking.booking_status === 'PENDING' ? '#B45309' : (isLight ? '#64748B' : '#94A3B8') 
                            }}>
                              <span>{nights} לילות</span>
                              <span>₪{Math.round((activeBooking.total_price_agorot || 0) / 100)}</span>
                            </div>
                          </motion.div>
                        );
                      })()}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* CONTEXT MODAL 1: EMPTY CELL CLICK -> WHATSAPP DISPATCH & 30% FLASH DEAL */}
      <AnimatePresence>
        {dispatchModalData && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: themeStyles.wrapperBg,
                border: `1.5px solid ${themeStyles.inputBorder}`,
                borderRadius: '20px',
                width: '100%',
                maxWidth: '420px',
                padding: '1.5rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              {/* Modal Header & Tabs Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', background: isLight ? '#EAE5DD' : '#0F172A', padding: '0.25rem', borderRadius: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setDispatchModalData({ ...dispatchModalData, modalTab: 'dispatch' })}
                    style={{
                      background: (dispatchModalData.modalTab || 'dispatch') === 'dispatch' ? 'linear-gradient(135deg, #6366F1, #4F46E5)' : 'transparent',
                      color: (dispatchModalData.modalTab || 'dispatch') === 'dispatch' ? '#FFF' : themeStyles.textMuted,
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Send size={14} />
                    <span>הזמנה מהירה</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchModalData({ ...dispatchModalData, modalTab: 'flash' })}
                    style={{
                      background: dispatchModalData.modalTab === 'flash' ? 'linear-gradient(135deg, #F59E0B, #D97706)' : 'transparent',
                      color: dispatchModalData.modalTab === 'flash' ? '#FFF' : themeStyles.textMuted,
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Zap size={14} />
                    <span>⚡ מבצע בזק</span>
                  </button>
                </div>

                <button onClick={() => setDispatchModalData(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textMuted }}>
                  <X size={20} />
                </button>
              </div>

              {/* TAB CONTENT: DISPATCH vs FLASH DEAL */}
              {dispatchModalData.modalTab === 'flash' ? (
                <div style={{ textAlign: 'center', padding: '1.25rem 0.5rem' }}>
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1rem'
                  }}>
                    <Zap size={36} color="#F59E0B" />
                  </div>

                  <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0 0 0.75rem 0', color: '#F59E0B' }}>
                    פרסום מבצע בזק (30% הנחה) - בקרוב מאוד! 🚀
                  </h2>

                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: themeStyles.textMuted, marginBottom: '1.5rem' }}>
                    ברגעים אלו ממש אנחנו יוצרים את החיבורים והממשקים למנועי ההפצה של מבצעי הבזק.
                  </p>

                  <button
                    type="button"
                    onClick={() => setDispatchModalData(null)}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0.85rem',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    הבנתי, תודה! 👍
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDispatchSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Nights Stepper */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
                      כמות לילות (תאריך כניסה: {dispatchModalData.check_in_date})
                    </label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: themeStyles.inputBg,
                      border: `1px solid ${themeStyles.inputBorder}`,
                      borderRadius: '12px',
                      padding: '0.4rem 0.8rem'
                    }}>
                      <button
                        type="button"
                        onClick={() => setDispatchModalData({ ...dispatchModalData, nights_count: Math.max(1, dispatchModalData.nights_count - 1) })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.4rem' }}
                      >
                        <Minus size={18} />
                      </button>

                      <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>
                        {dispatchModalData.nights_count} לילות
                      </span>

                      <button
                        type="button"
                        onClick={() => setDispatchModalData({ ...dispatchModalData, nights_count: dispatchModalData.nights_count + 1 })}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.4rem' }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Guest Phone Input */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
                      טלפון אורח (WhatsApp)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="tel"
                        required
                        placeholder="0548076123"
                        value={dispatchModalData.guest_phone}
                        onChange={(e) => setDispatchModalData({ ...dispatchModalData, guest_phone: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.7rem 0.8rem 0.7rem 2.5rem',
                          borderRadius: '12px',
                          background: themeStyles.inputBg,
                          border: `1px solid ${themeStyles.inputBorder}`,
                          color: themeStyles.textPrimary,
                          fontSize: '1rem',
                          fontWeight: 700
                        }}
                      />
                      <Phone size={18} color="#6366F1" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                  </div>

                  {/* Payment Mode Selector */}
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
                      אופן גביית תשלום
                    </label>
                    <select
                      value={dispatchModalData.payment_mode}
                      onChange={(e) => setDispatchModalData({ ...dispatchModalData, payment_mode: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.7rem',
                        borderRadius: '12px',
                        background: themeStyles.inputBg,
                        border: `1px solid ${themeStyles.inputBorder}`,
                        color: themeStyles.textPrimary,
                        fontSize: '0.85rem',
                        fontWeight: 700
                      }}
                    >
                      <option value="CREDIT_DEPOSIT">תשלום מקדמה (25%) באשראי</option>
                      <option value="CREDIT_FULL">תשלום מלא (100%) באשראי</option>
                      <option value="CASH_TRUST">תשלום במזומן בצימר</option>
                    </select>
                  </div>

                  {/* Submit Action Button */}
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #25D366, #128C7E)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      fontSize: '1rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      marginTop: '0.5rem',
                      boxShadow: '0 4px 16px rgba(37, 211, 102, 0.4)'
                    }}
                  >
                    <Send size={18} />
                    <span>שלח קישור ב-WhatsApp</span>
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONTEXT MODAL 2: EXISTING BOOKING CLICK -> EDIT / CANCEL / CONFIRM */}
      <AnimatePresence>
        {editingBooking && editFormData && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: themeStyles.wrapperBg,
                border: `1px solid ${themeStyles.inputBorder}`,
                borderRadius: '20px',
                width: '100%',
                maxWidth: '480px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '1.5rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Edit3 size={18} color="#6366F1" />
                  <span>עריכת הזמנה מפורטת</span>
                </h3>
                <button onClick={() => setEditingBooking(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textMuted }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleEditReservationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>יחידת אירוח</label>
                  <select
                    value={editFormData.unit_id}
                    onChange={(e) => setEditFormData({ ...editFormData, unit_id: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                  >
                    {rawUnits.map(u => (
                      <option key={u.id} value={u.id}>{t(u.id + '_short', u.name)}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>שם האורח</label>
                    <input
                      type="text"
                      required
                      value={editFormData.guest_name}
                      onChange={(e) => setEditFormData({ ...editFormData, guest_name: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>טלפון אורח (WhatsApp)</label>
                    <input
                      type="text"
                      required
                      value={editFormData.guest_phone}
                      onChange={(e) => setEditFormData({ ...editFormData, guest_phone: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אין</label>
                    <input
                      type="date"
                      required
                      value={editFormData.check_in_date}
                      onChange={(e) => setEditFormData({ ...editFormData, check_in_date: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אאוט</label>
                    <input
                      type="date"
                      required
                      value={editFormData.check_out_date}
                      onChange={(e) => setEditFormData({ ...editFormData, check_out_date: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>מחיר כולל (₪)</label>
                    <input
                      type="number"
                      required
                      value={editFormData.total_price_ils}
                      onChange={(e) => setEditFormData({ ...editFormData, total_price_ils: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>סטטוס תשלום</label>
                    <select
                      value={editFormData.payment_status}
                      onChange={(e) => setEditFormData({ ...editFormData, payment_status: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    >
                      <option value="PAID">שולם מלא</option>
                      <option value="PARTIAL">מקדמה בלבד</option>
                      <option value="UNPAID">לא שולם</option>
                    </select>
                  </div>
                </div>

                {editingBooking?.booking_status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmedBooking = {
                        ...editingBooking,
                        guest_name: editFormData.guest_name || 'אורח (WhatsApp)',
                        guest_phone: editFormData.guest_phone,
                        check_in_date: editFormData.check_in_date,
                        check_out_date: editFormData.check_out_date,
                        total_price_agorot: Math.round(parseFloat(editFormData.total_price_ils || '0') * 100),
                        booking_status: 'CONFIRMED',
                        payment_status: editFormData.payment_status === 'UNPAID' ? 'PAID' : editFormData.payment_status,
                        updated_at: new Date().toISOString()
                      };
                      await db.bookings.put(confirmedBooking);
                      await pushBookingToCloud(confirmedBooking);
                      setEditingBooking(null);
                    }}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.8rem',
                      fontSize: '0.95rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    <span>✅ אישור הזמנה סופי ביומן (התקבל תשלום)</span>
                  </button>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '0.8rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                    }}
                  >
                    שמור שינויים
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelBooking}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#EF4444',
                      border: '1px solid #EF4444',
                      borderRadius: '10px',
                      padding: '0.8rem 1rem',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <Trash2 size={16} />
                    <span>ביטול הזמנה</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONTEXT MODAL 3: DATE HEADER CLICK -> DAILY SUMMARY MODAL */}
      <AnimatePresence>
        {daySummaryModalData && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 130,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: themeStyles.wrapperBg,
                border: `1.5px solid ${themeStyles.inputBorder}`,
                borderRadius: '20px',
                width: '100%',
                maxWidth: '440px',
                padding: '1.5rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6366F1' }}>
                  <CalendarIcon size={20} />
                  <span>📅 סיכום נתוני יום: {daySummaryModalData.dateStr}</span>
                </h3>
                <button onClick={() => setDaySummaryModalData(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textMuted }}>
                  <X size={20} />
                </button>
              </div>

              {/* Occupancy & Revenue Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.25)', padding: '0.9rem', borderRadius: '12px', border: `1px solid ${themeStyles.cellBorder}` }}>
                  <div style={{ fontSize: '0.75rem', color: themeStyles.textMuted, marginBottom: '2px' }}>תפוסה יומית</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#6366F1' }}>
                    {daySummaryModalData.occupiedCount} מתוך {daySummaryModalData.totalUnits}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6366F1', fontWeight: 700, marginTop: '2px' }}>
                    {daySummaryModalData.occupancyPercent}% תפוסה כללית
                  </div>
                </div>

                <div style={{ background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.25)', padding: '0.9rem', borderRadius: '12px', border: `1px solid ${themeStyles.cellBorder}` }}>
                  <div style={{ fontSize: '0.75rem', color: themeStyles.textMuted, marginBottom: '2px' }}>הכנסה משוערת</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10B981' }}>
                    ₪{daySummaryModalData.estimatedDailyRevenue.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700, marginTop: '2px' }}>
                    לפי תעריף ממוצע
                  </div>
                </div>
              </div>

              {/* Check-Ins Section */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: themeStyles.textPrimary, marginBottom: '0.5rem' }}>
                  📥 צ'ק-אינים ליום זה ({daySummaryModalData.checkIns.length}):
                </div>
                {daySummaryModalData.checkIns.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {daySummaryModalData.checkIns.map(b => {
                      const u = rawUnits.find(unit => unit.id === b.unit_id);
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.3)', borderRadius: '10px', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 700 }}>👤 {b.guest_name}</span>
                          <span style={{ color: '#10B981', fontWeight: 800 }}>{u?.name || b.unit_id}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: themeStyles.textMuted, background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', textAlign: 'center' }}>
                    אין צ'ק-אינים מתוכננים להיום
                  </div>
                )}
              </div>

              {/* Check-Outs Section */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: themeStyles.textPrimary, marginBottom: '0.5rem' }}>
                  📤 צ'ק-אאוטים ליום זה ({daySummaryModalData.checkOuts.length}):
                </div>
                {daySummaryModalData.checkOuts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {daySummaryModalData.checkOuts.map(b => {
                      const u = rawUnits.find(unit => unit.id === b.unit_id);
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.75rem', background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.3)', borderRadius: '10px', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 700 }}>🚪 {b.guest_name}</span>
                          <span style={{ color: '#F59E0B', fontWeight: 800 }}>{u?.name || b.unit_id}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: themeStyles.textMuted, background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', textAlign: 'center' }}>
                    אין צ'ק-אאוטים מתוכננים להיום
                  </div>
                )}
              </div>

              {/* Housekeeping Notice */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '12px',
                padding: '0.7rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                marginBottom: '1.25rem'
              }}>
                <span style={{ color: '#818CF8', fontWeight: 600 }}>🧹 מטלות ניקיון נדרשות (עקב צ'ק-אאוט):</span>
                <span style={{ fontWeight: 900, color: themeStyles.textPrimary }}>{daySummaryModalData.checkOuts.length} חדרים</span>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setDaySummaryModalData(null)}
                style={{
                  width: '100%',
                  background: '#6366F1',
                  color: 'white',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                }}
              >
                סגור
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NEW RESERVATION MODAL */}
      <AnimatePresence>
        {isNewModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: themeStyles.wrapperBg,
                border: `1px solid ${themeStyles.inputBorder}`,
                borderRadius: '16px',
                width: '100%',
                maxWidth: '480px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '1.5rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>הזמנה חדשה</h3>
                <button onClick={() => setIsNewModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textMuted }}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleNewReservationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>יחידת אירוח</label>
                  <select
                    value={newFormData.unit_id}
                    onChange={(e) => setNewFormData({ ...newFormData, unit_id: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                  >
                    {rawUnits.map(u => (
                      <option key={u.id} value={u.id}>{t(u.id + '_short', u.name)}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>שם האורח</label>
                    <input
                      type="text"
                      required
                      value={newFormData.guest_name}
                      onChange={(e) => setNewFormData({ ...newFormData, guest_name: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>טלפון אורח</label>
                    <input
                      type="text"
                      required
                      value={newFormData.guest_phone}
                      onChange={(e) => setNewFormData({ ...newFormData, guest_phone: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אין</label>
                    <input
                      type="date"
                      required
                      value={newFormData.check_in_date}
                      onChange={(e) => setNewFormData({ ...newFormData, check_in_date: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אאוט</label>
                    <input
                      type="date"
                      required
                      value={newFormData.check_out_date}
                      onChange={(e) => setNewFormData({ ...newFormData, check_out_date: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>מחיר כולל (₪)</label>
                    <input
                      type="number"
                      required
                      value={newFormData.total_price_ils}
                      onChange={(e) => setNewFormData({ ...newFormData, total_price_ils: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>מקדמה (₪)</label>
                    <input
                      type="number"
                      required
                      value={newFormData.deposit_ils}
                      onChange={(e) => setNewFormData({ ...newFormData, deposit_ils: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.8rem',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: '0.5rem',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  הקם הזמנה
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
