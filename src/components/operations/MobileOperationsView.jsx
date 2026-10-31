import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  Wrench, 
  Check, 
  Play, 
  Phone, 
  MessageCircle, 
  ChevronDown, 
  ChevronUp, 
  DoorOpen, 
  Home, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  X, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Camera,
  Star,
  RefreshCw,
  Lock
} from 'lucide-react';
import { NorthStarIcon } from '../mialees/MialeesBrandAssets';
import { fieldUnitDisplayName, stripLegendPlotNumber } from '../../lib/fieldUnitCatalog';
import { lockboxCodeForUnit } from '../../lib/guestProfileSeed';
import { israelToday } from '../../lib/cabinAccess';
import { isUnavailableHoldBooking, coveringUnavailableHold, unavailableHoldLabel } from '../../lib/unavailableHold';
import { isBookingEligible, isRetiredUnitId, unitUsage } from '../../lib/units';
import { priorityIncomingToday } from '../../lib/priorityStay';
import { completionsFromUnit, toggleCompletion, addCompletion } from '../../lib/roomCompletions';
import { db } from '../../lib/resortos-db';
const SHOPPING_STORAGE_KEY = 'hotelos-procurement-shopping-v1';

function readShoppingList() {
  try {
    const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeShoppingList(items) {
  try {
    localStorage.setItem(SHOPPING_STORAGE_KEY, JSON.stringify(items || []));
  } catch (_) {}
}

export default function MobileOperationsView({
  units = [],
  bookings = [],
  customTickets = [],
  syncState = null,
  onRetrySync,
  onStartTask,
  onFinishTask,
  onOpenTaskDetail,
  onOpenNewTicket,
  onOpenFeedback,
  tenantId,
  pushUnitToCloud,
  theme = 'light',
  isRTL = true,
  t = (k, f) => f
}) {
  const todayStr = useMemo(() => israelToday(), []);
  const isDark = theme === 'dark';

  // Luxury Brand Tokens: Authentic Wine & Champagne Gold with modern soft radii and elegant depth
  const brand = {
    bg: isDark ? '#26130F' : '#FAF8F3',
    cardBg: isDark ? '#311813' : '#FFFFFF',
    text: isDark ? '#FDFBF7' : '#26130F',
    textMuted: isDark ? '#C7B9AD' : '#736055',
    wine: '#26130F',
    cream: '#FDFBF7',
    gold: '#C5A059',
    goldSoft: 'rgba(197, 160, 89, 0.14)',
    goldBorder: 'rgba(197, 160, 89, 0.32)',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(38, 19, 15, 0.08)',
    cardBorder: isDark ? 'rgba(197, 160, 89, 0.22)' : 'rgba(197, 160, 89, 0.2)',
    cardShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.32)' : '0 4px 20px rgba(38, 19, 15, 0.06)',
    candy: '#F2D5DD',
    urgentBg: isDark ? 'rgba(197, 160, 89, 0.14)' : '#FFF9EE',
    urgentBorder: 'rgba(197, 160, 89, 0.55)',
    urgentText: isDark ? '#F5D899' : '#8A5814',
    readyBg: isDark ? 'rgba(16, 185, 129, 0.14)' : '#F0FDF4',
    readyBorder: 'rgba(16, 185, 129, 0.4)',
    readyText: isDark ? '#6EE7B7' : '#047857',
    alertBg: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
    alertBorder: 'rgba(239, 68, 68, 0.4)',
    alertText: isDark ? '#FCA5A5' : '#B91C1C',
    radius: '16px',
    radiusMd: '12px',
    radiusSm: '8px',
    radiusPill: '9999px'
  };

  const formattedHebrewDate = useMemo(() => {
    try {
      const d = new Date(todayStr + 'T12:00:00');
      return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
    } catch {
      return todayStr;
    }
  }, [todayStr]);

  // Section Accordion State — all sections closed by default on initial load
  const [sectionsOpen, setSectionsOpen] = useState({
    arriving: false,
    cleaning: false,
    occupied: false,
    held: false,
    vacant: false,
    maintenance: false,
    supplies: false
  });

  const toggleSection = (key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Action Undo Toast State
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, onUndo = null) => {
    const id = Date.now();
    setToast({ id, message, onUndo });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 5000);
  }, []);

  // Real operational data only — no invented demo guests or fake units
  const effectiveUnits = Array.isArray(units) ? units : [];
  const effectiveBookings = Array.isArray(bookings) ? bookings : [];
  const effectiveCustomTickets = Array.isArray(customTickets) ? customTickets : [];

  // Selected Room Details Modal State
  const [selectedRoomModal, setSelectedRoomModal] = useState(null);

  // New Maintenance Ticket inline modal trigger
  const [showNewMaintenanceModal, setShowNewMaintenanceModal] = useState(false);
  const [newFaultUnitId, setNewFaultUnitId] = useState('');
  const [newFaultDesc, setNewFaultDesc] = useState('');

  // Shopping / Procurement State
  const [shoppingItems, setShoppingItems] = useState(() => readShoppingList());
  const [newShoppingText, setNewShoppingText] = useState('');

  useEffect(() => {
    writeShoppingList(shoppingItems);
  }, [shoppingItems]);

  // Sourced Unit Shortages from Chloe ('חוסר: ...') or unit completions
  const chloeUnitShortages = useMemo(() => {
    const list = [];
    (effectiveUnits || []).forEach((u) => {
      const reason = String(u.custom_reason || '');
      if (reason.startsWith('חוסר:') || reason.includes('חוסר ציוד')) {
        const text = reason.replace(/^חוסר:\s*/, '').trim();
        if (text) {
          list.push({
            id: `chloe-${u.id}`,
            unitId: u.id,
            unitName: fieldUnitDisplayName(u),
            text,
            isChloe: Boolean(u.assigned_staff && u.assigned_staff.includes('קלואי')),
            done: false
          });
        }
      }
      const completions = completionsFromUnit(u) || [];
      completions.forEach((c) => {
        if (!c.done) {
          list.push({
            id: `comp-${u.id}-${c.id}`,
            unitId: u.id,
            unitName: fieldUnitDisplayName(u),
            text: c.text,
            isCompletion: true,
            done: false
          });
        }
      });
    });
    return list;
  }, [effectiveUnits]);

  // Combined Procurement Items
  const allProcurementItems = useMemo(() => {
    return [...chloeUnitShortages, ...shoppingItems];
  }, [chloeUnitShortages, shoppingItems]);

  const openProcurementCount = allProcurementItems.filter((i) => !i.done).length;

  // 1. ARRIVING TODAY (חדרים נכנסים) — same incoming guest Priority shows.
  const arrivingRooms = useMemo(() => {
    return priorityIncomingToday(effectiveUnits, effectiveBookings, todayStr).map(({ unit, booking, sameDayTurnover }) => {
      const isReady = unit?.operational_status === 'READY';
      const isOccupied = unit?.staff_occupancy === 'OCCUPIED';
      return {
        id: unit.id,
        booking,
        unit,
        unitName: fieldUnitDisplayName(unit),
        guestName: booking.guest_name || 'אורח',
        phone: booking.guest_phone || booking.phone || '',
        eta: booking.stay?.estimated_arrival_time || booking.eta || null,
        adults: booking.adults_count ?? booking.adults ?? null,
        kids: booking.children_count ?? booking.children ?? 0,
        specialRequests: booking.special_requests || booking.notes || booking.guest_notes || '',
        lockbox: lockboxCodeForUnit(unit),
        status: unit?.operational_status || (sameDayTurnover ? 'DIRTY' : 'READY'),
        isReady,
        isOccupied,
        sameDayTurnover
      };
    });
  }, [effectiveBookings, effectiveUnits, todayStr]);

  const arrivingCleanCount = arrivingRooms.filter((r) => r.isReady).length;

  // 2. TURNOVER / CLEANING (חדרים לניקיון)
  const cleaningRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      const status = unit.operational_status;
      // If the unit is already marked READY, it has been cleaned and is not waiting for cleaning
      if (status === 'READY') return false;

      const isDirtyOrProgress = status === 'DIRTY' || status === 'IN_PROGRESS' || status === 'NEEDS_COMPLETIONS';
      const hasCheckoutToday = (effectiveBookings || []).some((b) => (
        b.unit_id === unit.id &&
        b.check_out_date === todayStr &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b)
      ));
      const hasCheckinToday = (effectiveBookings || []).some((b) => (
        b.unit_id === unit.id &&
        b.check_in_date === todayStr &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b)
      ));

      if (isDirtyOrProgress) return true;
      if (hasCheckoutToday) return true;
      if (hasCheckinToday) return true;
      return false;
    }).map((unit) => {
      const checkoutBooking = (effectiveBookings || []).find((b) => (
        b.unit_id === unit.id &&
        b.check_out_date === todayStr &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b)
      ));
      const checkinBooking = (effectiveBookings || []).find((b) => (
        b.unit_id === unit.id &&
        b.check_in_date === todayStr &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b)
      ));
      const isSameDayTurnover = Boolean(checkoutBooking && checkinBooking);

      return {
        unit,
        id: unit.id,
        unitName: fieldUnitDisplayName(unit),
        status: unit.operational_status || 'DIRTY',
        lockbox: lockboxCodeForUnit(unit),
        isSameDayTurnover,
        checkoutGuest: checkoutBooking?.guest_name,
        checkinGuest: checkinBooking?.guest_name,
        checkinEta: checkinBooking?.stay?.estimated_arrival_time || checkinBooking?.eta || null,
        completions: completionsFromUnit(unit),
        assignedStaff: unit.assigned_staff || 'צוות משק בית'
      };
    });
  }, [effectiveUnits, effectiveBookings, todayStr]);

  // Urgent Turnover Callout Units
  const urgentTurnovers = useMemo(() => {
    return cleaningRooms.filter((r) => r.isSameDayTurnover);
  }, [cleaningRooms]);

  // 3. OCCUPIED ROOMS (חדרים מאוכלסים - מסונכרן מלא עם פריוריטי והדאטה)
  const occupiedRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      // 1. Explicitly marked OCCUPIED in database / Priority
      if (unit.staff_occupancy === 'OCCUPIED') return true;
      // 2. Active in-house reservation covering today
      const hasInHouse = (effectiveBookings || []).some((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        b.booking_status !== 'CHECKED_OUT' &&
        !isUnavailableHoldBooking(b) &&
        b.check_in_date <= todayStr &&
        b.check_out_date > todayStr
      ));
      return hasInHouse;
    }).map((unit) => {
      const activeBooking = (effectiveBookings || []).find((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        b.booking_status !== 'CHECKED_OUT' &&
        !isUnavailableHoldBooking(b) &&
        b.check_in_date <= todayStr &&
        b.check_out_date > todayStr
      )) || (effectiveBookings || []).find((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b) &&
        b.check_in_date <= todayStr &&
        b.check_out_date >= todayStr
      ));

      const hold = coveringUnavailableHold(effectiveBookings, unit.id, todayStr);
      const holdLabel = hold ? (unavailableHoldLabel(hold.guest_name) || unavailableHoldLabel(hold.special_requests) || 'לא זמין') : '';

      return {
        unit,
        id: unit.id,
        unitName: fieldUnitDisplayName(unit),
        booking: activeBooking,
        guestName: activeBooking?.guest_name || holdLabel || (unit.custom_reason ? `תפוס: ${unit.custom_reason}` : 'תפוס ידנית (ללא פרטי אורח)'),
        phone: activeBooking?.guest_phone || activeBooking?.phone || '',
        checkoutDate: activeBooking?.check_out_date || '',
        lockbox: lockboxCodeForUnit(unit),
        status: unit.operational_status || 'READY'
      };
    });
  }, [effectiveUnits, effectiveBookings, todayStr]);

  // 4. HELD / UNAVAILABLE ROOMS (חדרים חסומים ולא זמינים - מתחם סגור, מגורי צוות, שיפוצים)
  const heldRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      if (occupiedRooms.some((r) => r.id === unit.id)) return false;
      const hold = coveringUnavailableHold(effectiveBookings, unit.id, todayStr);
      if (hold) return true;
      const reason = String(unit.custom_reason || '');
      if (/מתחם סגור|לא זמין|מושבת|שיפוץ|בריכה לא תקינה|סגור/.test(reason)) return true;
      if (!isBookingEligible(unit) && !isRetiredUnitId(unit.id)) return true;
      return false;
    }).map((unit) => {
      const hold = coveringUnavailableHold(effectiveBookings, unit.id, todayStr);
      const reason = String(unit.custom_reason || '');
      const label = hold
        ? (unavailableHoldLabel(hold.guest_name) || unavailableHoldLabel(hold.special_requests) || 'לא זמין')
        : (reason || (unitUsage(unit) === 'STAFF_ACCOMMODATION' ? 'מגורי צוות' : 'חסום / לא זמין'));
      return {
        unit,
        id: unit.id,
        unitName: fieldUnitDisplayName(unit),
        label,
        lockbox: lockboxCodeForUnit(unit),
        status: unit.operational_status || 'READY'
      };
    });
  }, [effectiveUnits, effectiveBookings, occupiedRooms, todayStr]);

  // 5. VACANT ROOMS (חדרים פנויים ומוכנים לאכלוס מיידי בלבד)
  const vacantRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      if (isRetiredUnitId(unit.id)) return false;
      if (!isBookingEligible(unit)) return false;
      const isArriving = arrivingRooms.some((r) => r.id === unit.id);
      const isOccupied = occupiedRooms.some((r) => r.id === unit.id);
      const isCleaning = cleaningRooms.some((r) => r.id === unit.id);
      const isHeld = heldRooms.some((r) => r.id === unit.id);
      const isMaintenance = unit.operational_status === 'MAINTENANCE_ALERT' || unit.operational_domain === 'MAINTENANCE';
      return !isArriving && !isOccupied && !isCleaning && !isHeld && !isMaintenance;
    }).map((unit) => ({
      unit,
      id: unit.id,
      unitName: fieldUnitDisplayName(unit),
      lockbox: lockboxCodeForUnit(unit),
      status: unit.operational_status || 'READY'
    }));
  }, [effectiveUnits, arrivingRooms, occupiedRooms, cleaningRooms, heldRooms]);

  // 5. MAINTENANCE & REPAIRS (תקלות ותיקונים - מסונכרן עם קלואי)
  const maintenanceTickets = useMemo(() => {
    const unitAlerts = (effectiveUnits || []).filter((u) => (
      u.operational_status === 'MAINTENANCE_ALERT' ||
      u.operational_domain === 'MAINTENANCE' ||
      (u.custom_reason && /תקל|שבור|מקולקל|נוזל|מזגן|מים|חשמל/.test(u.custom_reason))
    )).map((u) => ({
      id: u.id,
      unitId: u.id,
      title: fieldUnitDisplayName(u),
      description: u.custom_reason || 'תקלת אחזקה פתוחה ביחידה',
      urgency: u.is_escalated ? 'CRITICAL' : 'HIGH',
      reportedBy: u.assigned_staff || 'צוות תפעול',
      photos: u.image_urls || [],
      isUnit: true
    }));

    const ticketAlerts = (effectiveCustomTickets || []).filter((t) => (
      t.domain === 'MAINTENANCE' && t.status !== 'READY'
    )).map((t) => ({
      id: t.id,
      unitId: t.unitId || t.id,
      title: t.customTitle || t.titleKey || 'תקלת אחזקה',
      description: t.customReason || t.reasonKey || '',
      urgency: t.urgency || 'HIGH',
      reportedBy: t.assignedTo || 'צוות תפעול',
      photos: t.photos || [],
      isUnit: false
    }));

    // Deduplicate by ID
    const map = new Map();
    [...unitAlerts, ...ticketAlerts].forEach((item) => {
      map.set(item.id, item);
    });
    return Array.from(map.values());
  }, [effectiveUnits, effectiveCustomTickets]);

  // Actions
  const handleToggleOccupy = async (unitId, targetStatus) => {
    const nowIso = new Date().toISOString();
    const unit = effectiveUnits.find((u) => u.id === unitId);
    const prevStatus = unit?.staff_occupancy || (targetStatus === 'OCCUPIED' ? 'VACANT' : 'OCCUPIED');
    const uName = unit ? fieldUnitDisplayName(unit) : unitId;
    try {
      await db.units.update(unitId, {
        staff_occupancy: targetStatus,
        updated_at: nowIso
      });
      if (pushUnitToCloud) {
        pushUnitToCloud({
          id: unitId,
          tenant_id: tenantId,
          staff_occupancy: targetStatus,
          updated_at: nowIso
        });
      }
      showToast(
        targetStatus === 'OCCUPIED' ? `${uName} סומן כמאוכלס` : `${uName} סומן כפנוי`,
        () => handleToggleOccupy(unitId, prevStatus)
      );
    } catch (err) {
      console.warn('[TOGGLE OCCUPY ERROR]', err);
    }
  };

  const handleResolveMaintenance = (ticketId) => {
    if (onFinishTask) {
      onFinishTask(ticketId);
      showToast('תקלה סומנה כטופלה בהצלחה ✓');
    }
  };

  const handleAddCustomFault = async (e) => {
    e.preventDefault();
    if (!newFaultUnitId || !newFaultDesc.trim()) return;

    const unit = effectiveUnits.find((u) => u.id === newFaultUnitId);
    const nowIso = new Date().toISOString();
    try {
      await db.units.update(newFaultUnitId, {
        operational_status: 'MAINTENANCE_ALERT',
        operational_domain: 'MAINTENANCE',
        custom_reason: newFaultDesc.trim(),
        is_escalated: true,
        updated_at: nowIso
      });
      if (pushUnitToCloud) {
        pushUnitToCloud({
          id: newFaultUnitId,
          tenant_id: tenantId,
          name: unit?.name,
          operational_status: 'MAINTENANCE_ALERT',
          operational_domain: 'MAINTENANCE',
          custom_reason: newFaultDesc.trim(),
          is_escalated: true,
          updated_at: nowIso
        });
      }
      setNewFaultDesc('');
      setNewFaultUnitId('');
      setShowNewMaintenanceModal(false);
    } catch (err) {
      console.warn('[ADD FAULT ERROR]', err);
    }
  };

  const handleAddShoppingItem = (e) => {
    e.preventDefault();
    const text = newShoppingText.trim();
    if (!text) return;
    const newItem = {
      id: `shop-${Date.now()}`,
      text,
      unitName: 'כללי',
      done: false,
      createdAt: new Date().toISOString()
    };
    setShoppingItems((prev) => [newItem, ...prev]);
    setNewShoppingText('');
  };

  const handleToggleShopping = (itemId) => {
    setShoppingItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, done: !item.done } : item
    )));
  };

  const handleDeleteShopping = (itemId) => {
    setShoppingItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Safe WhatsApp & Phone links
  const waLink = (phone, text = '') => {
    const raw = String(phone || '').replace(/[^0-9]/g, '');
    const clean = raw.startsWith('0') ? `972${raw.slice(1)}` : raw;
    return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  };

  return (
    <div
      className="mobile-ops-view"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        background: brand.bg,
        color: brand.text,
        fontFamily: "'Montserrat', 'Heebo', system-ui, sans-serif",
        padding: '0.6rem 0.65rem 4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem'
      }}
    >
      {/* Top Luxury Executive Brand Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.2rem 0.6rem',
          borderBottom: `1px solid ${brand.border}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: brand.radiusMd,
              background: brand.goldSoft,
              border: `1px solid ${brand.goldBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
            }}
          >
            <NorthStarIcon className="w-5 h-5" color={brand.gold} />
          </div>
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 900, letterSpacing: '0.04em', color: brand.text }}>
              תפעול מיאליס
            </div>
            <div style={{ fontSize: '0.68rem', color: brand.textMuted, fontWeight: 700 }}>
              {formattedHebrewDate}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {syncState && (
            <button
              type="button"
              onClick={() => onRetrySync && onRetrySync()}
              title="סנכרון נתונים חי"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.25rem 0.55rem',
                borderRadius: brand.radiusPill,
                border: `1px solid ${syncState.status === 'error' ? brand.alertBorder : (syncState.status === 'loading' ? brand.urgentBorder : brand.border)}`,
                background: syncState.status === 'error' ? brand.alertBg : (syncState.status === 'loading' ? brand.urgentBg : brand.cardBg),
                color: syncState.status === 'error' ? brand.alertText : (syncState.status === 'loading' ? brand.urgentText : brand.textMuted),
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={syncState.status === 'loading' ? 'animate-spin' : ''} />
              <span>{syncState.status === 'loading' ? 'מסנכרן...' : (syncState.status === 'error' ? 'שגיאה · נסה שוב' : 'מעודכן')}</span>
            </button>
          )}

          <div
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: brand.radiusPill,
              border: `1px solid ${brand.goldBorder}`,
              background: brand.goldSoft,
              color: brand.gold,
              fontSize: '0.74rem',
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {todayStr}
          </div>
        </div>
      </div>



      {/* Floating Undo Feedback Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '16px',
            right: '16px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.8rem 1.1rem',
            borderRadius: brand.radius,
            background: '#1A0C0A',
            color: '#FFFFFF',
            border: `1px solid ${brand.gold}`,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
            animation: 'fadeIn 0.25s ease'
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => {
                toast.onUndo();
                setToast(null);
              }}
              style={{
                background: brand.goldSoft,
                color: brand.gold,
                border: `1px solid ${brand.gold}`,
                borderRadius: brand.radiusPill,
                padding: '0.35rem 0.85rem',
                fontSize: '0.82rem',
                fontWeight: 900,
                cursor: 'pointer'
              }}
            >
              בטל פעולה ↩
            </button>
          )}
        </div>
      )}

      {/* Empty State / Loading State */}
      {effectiveUnits.length === 0 && (
        <div
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            borderRadius: brand.radius,
            background: brand.cardBg,
            border: `1px solid ${brand.cardBorder}`,
            boxShadow: brand.cardShadow,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.8rem'
          }}
        >
          <div style={{ fontSize: '2rem' }}>
            {syncState?.status === 'loading' ? '⏳' : '📡'}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
            {syncState?.status === 'loading' ? 'טוען נתוני תפעול מהשרת...' : 'לא נמצאו נתוני יחידות ותפעול'}
          </div>
          <div style={{ fontSize: '0.8rem', color: brand.textMuted, maxWidth: '280px', lineHeight: 1.5 }}>
            {syncState?.status === 'loading'
              ? 'מסנכרן בזמן אמת מול מערכת המלון, מיד נציג את הנתונים.'
              : 'בדוק את החיבור לרשת או נסה לרענן את הנתונים ישירות מהענן.'}
          </div>
          {onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              style={{
                marginTop: '0.5rem',
                padding: '0.65rem 1.3rem',
                borderRadius: brand.radiusPill,
                background: 'linear-gradient(135deg, #C5A059, #99742B)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 900,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(197, 160, 89, 0.35)'
              }}
            >
              רענן נתונים 🔄
            </button>
          )}
        </div>
      )}

      {/* 1. חדרים נכנסים (Arriving Rooms) */}
      <section
        id="sec-arriving"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('arriving')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.arriving ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.arriving ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.arriving ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <DoorOpen size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  חדרים נכנסים
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    background: arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyBg : brand.urgentBg,
                    border: `1px solid ${arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyBorder : brand.urgentBorder}`,
                    color: arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyText : brand.urgentText
                  }}
                >
                  ({arrivingCleanCount} נקיים מתוך {arrivingRooms.length})
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {arrivingRooms.length > 0 ? `${arrivingCleanCount} מוכנים מתוך ${arrivingRooms.length} כניסות מתוכננות להיום` : 'אין כניסות מתוכננות להיום'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {arrivingRooms.length}
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.arriving ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {/* Progress bar of clean arriving rooms */}
        {arrivingRooms.length > 0 && (
          <div style={{ width: '100%', height: '3px', background: 'rgba(0,0,0,0.06)' }}>
            <div
              style={{
                width: `${(arrivingCleanCount / arrivingRooms.length) * 100}%`,
                height: '100%',
                background: brand.gold,
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        )}

        {sectionsOpen.arriving && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {arrivingRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.textMuted, fontSize: '0.8rem' }}>
                אין כניסות מתוכננות להיום
              </div>
            ) : (
              arrivingRooms.map((room) => {
                const isClean = room.isReady;
                return (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoomModal(room)}
                    style={{
                      border: `1px solid ${isClean ? brand.readyBorder : brand.border}`,
                      borderRadius: brand.radius,
                      padding: '0.65rem 0.75rem',
                      background: isClean ? brand.readyBg : (isDark ? '#2B1612' : '#FFFFFF'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: brand.text }}>
                          {room.unitName}
                        </span>
                        {room.lockbox && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 900,
                              color: brand.gold,
                              letterSpacing: '0.04em'
                            }}
                          >
                            · כספת {room.lockbox}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {room.isOccupied && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '0.12rem 0.45rem',
                              borderRadius: brand.radius,
                              border: '1px solid rgba(139, 92, 246, 0.4)',
                              background: 'rgba(139, 92, 246, 0.12)',
                              color: isDark ? '#DDD6FE' : '#6D28D9'
                            }}
                          >
                            מאוכלס
                          </span>
                        )}
                        <div
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '0.15rem 0.5rem',
                            borderRadius: brand.radius,
                            border: isClean
                              ? `1px solid ${brand.readyBorder}`
                              : (room.status === 'IN_PROGRESS' ? '1px solid #F59E0B' : '1px solid #EF4444'),
                            background: isClean
                              ? brand.readyBg
                              : (room.status === 'IN_PROGRESS'
                                ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
                                : (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')),
                            color: isClean
                              ? brand.readyText
                              : (room.status === 'IN_PROGRESS' ? '#D97706' : '#DC2626')
                          }}
                        >
                          {isClean ? '✓ מוכן לאורח' : (room.status === 'IN_PROGRESS' ? `בנקיון${room.staff ? ` | ${room.staff}` : ''}` : 'לניקוי')}
                        </div>
                      </div>

                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: brand.textMuted }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <div>
                          <strong style={{ color: brand.text, fontSize: '0.86rem' }}>{room.guestName}</strong>
                          {room.adults != null ? (room.kids > 0 ? ` · ${room.adults}+${room.kids} נפשות` : ` · ${room.adults} מבוגרים`) : ''}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: room.eta ? brand.gold : brand.textMuted }}>
                          {room.eta ? `🕒 הגעה משוערת: ${room.eta}` : 'לא צוינה שעת הגעה'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                        {room.phone && (
                          <>
                            <a
                              href={waLink(room.phone, `שלום ${room.guestName}, ברוכים הבאים!`)}
                              target="_blank"
                              rel="noreferrer"
                              title="וואטסאפ"
                              style={{
                                width: '38px',
                                height: '38px',
                                minWidth: '38px',
                                borderRadius: brand.radiusMd,
                                background: '#25D366',
                                color: '#FFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textDecoration: 'none',
                                boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)'
                              }}
                            >
                              <MessageCircle size={18} />
                            </a>
                            <a
                              href={`tel:${room.phone}`}
                              title="חייג"
                              style={{
                                width: '38px',
                                height: '38px',
                                minWidth: '38px',
                                borderRadius: brand.radiusMd,
                                background: isDark ? 'rgba(255,255,255,0.08)' : '#ECE5DF',
                                color: brand.text,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textDecoration: 'none',
                                border: `1px solid ${brand.border}`
                              }}
                            >
                              <Phone size={18} />
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {room.sameDayTurnover && (
                      <div
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          color: brand.urgentText,
                          background: brand.urgentBg,
                          border: `1px solid ${brand.urgentBorder}`,
                          padding: '0.2rem 0.4rem',
                          borderRadius: brand.radius,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <Clock size={11} />
                        <span>חפיפת יציאה וכניסה באותו יום · לוודא מוכנות עד {room.eta || '15:00'}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* 2. חדרים לניקיון (Rooms for Cleaning / Turnover) */}
      <section
        id="sec-cleaning"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('cleaning')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.cleaning ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.cleaning ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.cleaning ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <Sparkles size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  חדרים לניקיון
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    background: cleaningRooms.length === 0 ? brand.readyBg : brand.urgentBg,
                    border: `1px solid ${cleaningRooms.length === 0 ? brand.readyBorder : brand.urgentBorder}`,
                    color: cleaningRooms.length === 0 ? brand.readyText : brand.urgentText
                  }}
                >
                  ({cleaningRooms.length} יחידות)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {cleaningRooms.length > 0
                  ? `${cleaningRooms.length} חדרים להכנה${urgentTurnovers.length > 0 ? ` · ⚡ ${urgentTurnovers.length} יציאה וכניסה היום` : ''}`
                  : '✓ כל החדרים נקיים ומסודרים'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {cleaningRooms.length}
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.cleaning ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {sectionsOpen.cleaning && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {/* URGENT TURNOVER BANNER */}
            {urgentTurnovers.length > 0 && (
              <div
                style={{
                  border: `1.5px solid ${brand.urgentBorder}`,
                  borderRadius: brand.radius,
                  background: brand.urgentBg,
                  padding: '0.65rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: brand.urgentText, fontWeight: 900, fontSize: '0.82rem' }}>
                  <AlertTriangle size={15} color={brand.gold} />
                  <span>⚡ Turnover דחוף · חפיפת יציאה וכניסה באותו יום ({urgentTurnovers.length})</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: brand.text, lineHeight: 1.4 }}>
                  חדרים הדורשים תעדוף עליון! האורח היוצא מפנה בבוקר והאורח החדש נכנס היום בצהריים.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                  {urgentTurnovers.map((u) => (
                    <span
                      key={u.id}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        background: brand.cardBg,
                        border: `1px solid ${brand.urgentBorder}`,
                        padding: '0.15rem 0.45rem',
                        borderRadius: brand.radius,
                        color: brand.urgentText
                      }}
                    >
                      {u.unitName} (יציאה: {u.checkoutGuest || 'אורח'} ➔ כניסה: {u.checkinGuest || 'אורח'})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {cleaningRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.readyText, fontSize: '0.8rem', fontWeight: 800 }}>
                ✓ כל החדרים נקיים ומסודרים לחלוטין!
              </div>
            ) : (
              cleaningRooms.map((room) => {
                const isInProgress = room.status === 'IN_PROGRESS';
                const isCompletions = room.status === 'NEEDS_COMPLETIONS';

                return (
                  <div
                    key={room.id}
                    style={{
                      border: `1px solid ${room.isSameDayTurnover ? brand.urgentBorder : brand.border}`,
                      borderRadius: brand.radius,
                      padding: '0.65rem 0.75rem',
                      background: room.isSameDayTurnover ? (isDark ? 'rgba(197, 160, 89, 0.08)' : '#FFFDF7') : (isDark ? '#2B1612' : '#FFFFFF'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: brand.text }}>
                          {room.unitName}
                        </span>
                        {room.lockbox && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 900, color: brand.gold }}>
                            · כספת {room.lockbox}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.45rem',
                          borderRadius: brand.radius,
                          border: `1px solid ${isInProgress ? '#F59E0B' : (isCompletions ? '#0D9488' : '#EF4444')}`,
                          background: isInProgress
                            ? (isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7')
                            : (isCompletions ? 'rgba(13, 148, 136, 0.12)' : (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')),
                          color: isInProgress ? '#D97706' : (isCompletions ? '#0D9488' : '#DC2626')
                        }}
                      >
                        {isInProgress ? `בנקיון${room.staff ? ` | ${room.staff}` : ''}` : (isCompletions ? '📦 חסרות השלמות' : 'לניקוי')}
                      </div>
                    </div>


                    {/* Guest Turnover Context */}
                    <div style={{ fontSize: '0.74rem', color: brand.textMuted }}>
                      {room.checkoutGuest ? `יציאה היום: ${room.checkoutGuest}` : 'ניקוי והכנה'}
                      {room.checkinGuest ? ` ➔ כניסה היום: ${room.checkinGuest} (משוער: ${room.checkinEta})` : ''}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                      {!isInProgress ? (
                        <button
                          type="button"
                          onClick={() => onStartTask && onStartTask(room.id)}
                          style={{
                            flex: 1,
                            padding: '0.45rem',
                            borderRadius: brand.radius,
                            border: `1px solid ${brand.goldBorder}`,
                            background: brand.goldSoft,
                            color: brand.gold,
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Play size={13} />
                          <span>התחל ניקיון</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onFinishTask && onFinishTask(room.id)}
                          style={{
                            flex: 1,
                            padding: '0.45rem',
                            borderRadius: brand.radius,
                            border: `1px solid ${brand.readyBorder}`,
                            background: brand.readyBg,
                            color: brand.readyText,
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Check size={14} />
                          <span>סמן כנקי ומוכן</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenTaskDetail && onOpenTaskDetail(room.unit)}
                        style={{
                          padding: '0.45rem 0.65rem',
                          borderRadius: brand.radius,
                          border: `1px solid ${brand.border}`,
                          background: isDark ? '#3D221C' : '#FFFFFF',
                          color: brand.textMuted,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        פרטים
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* 3. חדרים מאוכלסים (Occupied / In-House) */}
      <section
        id="sec-occupied"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('occupied')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.occupied ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.occupied ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.occupied ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <Home size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  חדרים מאוכלסים
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    background: 'rgba(139, 92, 246, 0.12)',
                    color: isDark ? '#DDD6FE' : '#6D28D9'
                  }}
                >
                  ({occupiedRooms.length} תפוסים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {occupiedRooms.length > 0 ? `${occupiedRooms.length} יחידות עם אורחים שוהים כרגע` : 'אין חדרים מאוכלסים כרגע'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {occupiedRooms.length}
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.occupied ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {sectionsOpen.occupied && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {occupiedRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.textMuted, fontSize: '0.8rem' }}>
                אין חדרים מאוכלסים כרגע
              </div>
            ) : (
              occupiedRooms.map((room) => (
                <div
                  key={room.id}
                  style={{
                    border: `1px solid ${brand.border}`,
                    borderRadius: brand.radius,
                    padding: '0.65rem 0.75rem',
                    background: isDark ? '#2B1612' : '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 900, color: brand.text }}>
                        {room.unitName}
                      </span>
                      {room.lockbox && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 900, color: brand.gold }}>
                          · כספת {room.lockbox}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '0.15rem 0.5rem',
                        borderRadius: brand.radius,
                        border: `1px solid rgba(139, 92, 246, 0.4)`,
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: isDark ? '#DDD6FE' : '#6D28D9'
                      }}
                    >
                      מאוכלס
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: brand.textMuted }}>
                    <div>
                      <strong style={{ color: brand.text }}>{room.guestName}</strong>
                      {room.checkoutDate ? ` · עזיבה: ${room.checkoutDate}` : ''}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {room.phone && (
                        <>
                          <a
                            href={waLink(room.phone, `שלום ${room.guestName}, צוות מיאליס לשירותכם:`)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: brand.radius,
                              background: '#25D366',
                              color: '#FFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none'
                            }}
                          >
                            <MessageCircle size={14} />
                          </a>
                          <a
                            href={`tel:${room.phone}`}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: brand.radius,
                              background: isDark ? '#3A201A' : '#ECE5DF',
                              color: brand.text,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textDecoration: 'none'
                            }}
                          >
                            <Phone size={14} />
                          </a>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleOccupy(room.id, 'VACANT')}
                        title="צ'ק-אאוט ופינוי חדר"
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.3rem 0.55rem',
                          borderRadius: brand.radius,
                          border: `1px solid ${brand.border}`,
                          background: isDark ? '#3D221C' : '#F5EFEB',
                          color: brand.text,
                          cursor: 'pointer'
                        }}
                      >
                        פנה חדר
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* 4. חדרים פנויים (Vacant & Ready) */}
      <section
        id="sec-vacant"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('vacant')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.vacant ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.vacant ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.vacant ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <ShieldCheck size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  חדרים פנויים ומוכנים
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    background: brand.readyBg,
                    border: `1px solid ${brand.readyBorder}`,
                    color: brand.readyText
                  }}
                >
                  ({vacantRooms.length} פנויים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {vacantRooms.length > 0 ? `${vacantRooms.length} יחידות מוכנות לאכלוס מיידי` : 'כל החדרים תפוסים או בהכנה'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: brand.readyText,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {vacantRooms.length}
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.vacant ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {sectionsOpen.vacant && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {vacantRooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.textMuted, fontSize: '0.8rem' }}>
                כל החדרים מאוכלסים או בתהליך ניקיון וכניסה
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
                {vacantRooms.map((room) => (
                  <div
                    key={room.id}
                    style={{
                      border: `1px solid ${brand.readyBorder}`,
                      borderRadius: brand.radius,
                      padding: '0.6rem 0.65rem',
                      background: brand.readyBg,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 900, color: brand.text }}>
                      {room.unitName}
                    </div>
                    {room.lockbox && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 900, color: brand.gold }}>
                        כספת {room.lockbox}
                      </div>
                    )}
                    <div style={{ fontSize: '0.68rem', color: brand.readyText, fontWeight: 800, marginTop: '2px' }}>
                      ✓ פנוי לאורח
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* חדרים חסומים / לא זמינים (Held / Blocked) */}
      {heldRooms.length > 0 && (
        <section
          id="sec-held"
          style={{
            border: `1px solid ${brand.cardBorder}`,
            borderRadius: brand.radius,
            background: brand.cardBg,
            boxShadow: brand.cardShadow,
            overflow: 'hidden'
          }}
        >
          <header
            onClick={() => toggleSection('held')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.1rem',
              minHeight: '68px',
              background: isDark
                ? (sectionsOpen.held ? 'rgba(100, 116, 139, 0.16)' : 'rgba(100, 116, 139, 0.08)')
                : (sectionsOpen.held ? 'rgba(100, 116, 139, 0.12)' : 'rgba(100, 116, 139, 0.05)'),
              cursor: 'pointer',
              borderBottom: sectionsOpen.held ? `1px solid ${brand.border}` : 'none',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  minWidth: '42px',
                  borderRadius: brand.radiusMd,
                  background: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)',
                  border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(100, 116, 139, 0.25)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Lock size={22} color={isDark ? '#94A3B8' : '#64748B'} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                    חסומים / לא זמינים
                  </span>
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.6rem',
                      borderRadius: brand.radiusPill,
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      background: 'rgba(148, 163, 184, 0.12)',
                      color: isDark ? '#CBD5E1' : '#475569'
                    }}
                  >
                    ({heldRooms.length} חסומים)
                  </span>
                </div>
                <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                  יחידות סגורות, שיפוצים או מגורי צוות
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 900,
                  color: isDark ? '#94A3B8' : '#64748B',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {heldRooms.length}
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: brand.radiusMd,
                  background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {sectionsOpen.held ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
              </div>
            </div>
          </header>

          {sectionsOpen.held && (
            <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
                {heldRooms.map((room) => (
                  <div
                    key={room.id}
                    style={{
                      border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                      borderRadius: brand.radius,
                      padding: '0.6rem 0.65rem',
                      background: isDark ? 'rgba(30, 41, 59, 0.4)' : '#F1F5F9',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 900, color: brand.text }}>
                      {room.unitName}
                    </div>
                    {room.lockbox && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 900, color: brand.gold }}>
                        כספת {room.lockbox}
                      </div>
                    )}
                    <div style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B', fontWeight: 800, marginTop: '2px' }}>
                      🔒 {room.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. רשימת תקלות ותיקונים (Maintenance & Repairs - Synced with Chloe) */}
      <section
        id="sec-maintenance"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('maintenance')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.maintenance ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.maintenance ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.maintenance ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <Wrench size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  תקלות ותיקונים
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    background: maintenanceTickets.length > 0 ? brand.alertBg : brand.readyBg,
                    border: `1px solid ${maintenanceTickets.length > 0 ? brand.alertBorder : brand.readyBorder}`,
                    color: maintenanceTickets.length > 0 ? brand.alertText : brand.readyText
                  }}
                >
                  ({maintenanceTickets.length} פתוחות)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {maintenanceTickets.length > 0 ? `${maintenanceTickets.length} קריאות שירות בטיפול` : '✓ אין תקלות פתוחות, הכל תקין'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowNewMaintenanceModal(true)}
              style={{
                border: `1px solid ${brand.goldBorder}`,
                borderRadius: brand.radiusPill,
                background: brand.goldSoft,
                color: brand.gold,
                fontSize: '0.76rem',
                fontWeight: 800,
                padding: '0.35rem 0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <Plus size={14} />
              <span>תקלה +</span>
            </button>
            <div
              onClick={() => toggleSection('maintenance')}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {sectionsOpen.maintenance ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {sectionsOpen.maintenance && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {maintenanceTickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.readyText, fontSize: '0.8rem', fontWeight: 800 }}>
                ✓ אין תקלות פתוחות! כל המערכות תקינות
              </div>
            ) : (
              maintenanceTickets.map((ticket) => {
                const isCrit = ticket.urgency === 'CRITICAL';
                return (
                  <div
                    key={ticket.id}
                    style={{
                      border: `1.5px solid ${isCrit ? brand.alertBorder : brand.goldBorder}`,
                      borderRadius: brand.radius,
                      padding: '0.65rem 0.75rem',
                      background: isCrit ? brand.alertBg : (isDark ? '#2B1612' : '#FFFFFF'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Wrench size={14} color={isCrit ? '#EF4444' : brand.gold} />
                        <span style={{ fontSize: '0.88rem', fontWeight: 900, color: brand.text }}>
                          {ticket.title}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.45rem',
                          borderRadius: brand.radius,
                          border: `1px solid ${isCrit ? brand.alertBorder : brand.goldBorder}`,
                          background: isCrit ? brand.alertBg : brand.goldSoft,
                          color: isCrit ? brand.alertText : brand.gold
                        }}
                      >
                        {isCrit ? 'דחוף ביותר' : 'בטיפול'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: brand.text, lineHeight: 1.4 }}>
                      {ticket.description}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: brand.textMuted, marginTop: '0.2rem' }}>
                      <span>דיווח: {ticket.reportedBy}</span>

                      <button
                        type="button"
                        onClick={() => handleResolveMaintenance(ticket.id)}
                        style={{
                          border: `1px solid ${brand.readyBorder}`,
                          borderRadius: brand.radius,
                          background: brand.readyBg,
                          color: brand.readyText,
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          padding: '0.3rem 0.65rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <Check size={13} />
                        <span>סמן כטופל / תוקן</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>

      {/* 6. רשימת קניות והשלמות ציוד (Procurement & Supplies) */}
      <section
        id="sec-supplies"
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          boxShadow: brand.cardShadow,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('supplies')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.1rem',
            minHeight: '68px',
            background: isDark
              ? (sectionsOpen.supplies ? 'rgba(197, 160, 89, 0.16)' : 'rgba(197, 160, 89, 0.08)')
              : (sectionsOpen.supplies ? 'rgba(197, 160, 89, 0.12)' : 'rgba(197, 160, 89, 0.05)'),
            cursor: 'pointer',
            borderBottom: sectionsOpen.supplies ? `1px solid ${brand.border}` : 'none',
            transition: 'background 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                minWidth: '42px',
                borderRadius: brand.radiusMd,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(197, 160, 89, 0.15)'
              }}
            >
              <ShoppingCart size={22} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  רשימת קניות והשלמות ציוד
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    padding: '0.15rem 0.6rem',
                    borderRadius: brand.radiusPill,
                    background: openProcurementCount > 0 ? brand.urgentBg : brand.readyBg,
                    border: `1px solid ${openProcurementCount > 0 ? brand.urgentBorder : brand.readyBorder}`,
                    color: openProcurementCount > 0 ? brand.urgentText : brand.readyText
                  }}
                >
                  ({openProcurementCount} חסרים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 700 }}>
                {openProcurementCount > 0 ? `${openProcurementCount} פריטים נדרשים לרכישה והשלמה ביחידות` : '✓ הרשימה הושלמה במלואה'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {openProcurementCount}
            </span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: brand.radiusMd,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.supplies ? <ChevronUp size={18} color={brand.textMuted} /> : <ChevronDown size={18} color={brand.textMuted} />}
            </div>
          </div>
        </header>

        {sectionsOpen.supplies && (
          <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {/* Quick Add Procurement Item Form */}
            <form onSubmit={handleAddShoppingItem} style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                placeholder="הוסף פריט לקנייה או השלמה..."
                value={newShoppingText}
                onChange={(e) => setNewShoppingText(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.45rem 0.65rem',
                  borderRadius: brand.radius,
                  border: `1px solid ${brand.border}`,
                  background: isDark ? '#1C0F0C' : '#FFFFFF',
                  color: brand.text,
                  fontSize: '0.8rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  border: `1px solid ${brand.goldBorder}`,
                  borderRadius: brand.radius,
                  background: brand.gold,
                  color: brand.wine,
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  padding: '0 0.75rem',
                  cursor: 'pointer'
                }}
              >
                + הוסף
              </button>
            </form>

            {/* Procurement Checklist Items */}
            {allProcurementItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem', color: brand.textMuted, fontSize: '0.8rem' }}>
                אין פריטים חסרים ברשימה
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {allProcurementItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: `1px solid ${brand.border}`,
                      borderRadius: brand.radius,
                      padding: '0.45rem 0.65rem',
                      background: item.done ? (isDark ? 'rgba(0,0,0,0.2)' : '#F9F7F4') : (isDark ? '#2B1612' : '#FFFFFF'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: item.done ? 0.6 : 1
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => {
                          if (item.isChloe || item.isCompletion) {
                            // Chloe or completion toggle
                            const unit = effectiveUnits.find((u) => u.id === item.unitId);
                            if (unit) {
                              const updatedCompletions = (completionsFromUnit(unit) || []).map((c) => (
                                c.text === item.text ? { ...c, done: !c.done } : c
                              ));
                              db.units.update(unit.id, {
                                completions: updatedCompletions,
                                custom_reason: updatedCompletions.every((c) => c.done) ? 'טופל' : unit.custom_reason,
                                updated_at: new Date().toISOString()
                              });
                            }
                          } else {
                            handleToggleShopping(item.id);
                          }
                        }}
                        style={{ width: '16px', height: '16px', accentColor: brand.gold, cursor: 'pointer' }}
                      />
                      <span
                        style={{
                          fontSize: '0.8rem',
                          color: brand.text,
                          textDecoration: item.done ? 'line-through' : 'none'
                        }}
                      >
                        {item.text}
                      </span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {item.unitName && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '0.1rem 0.35rem',
                            borderRadius: brand.radius,
                            background: brand.goldSoft,
                            color: brand.gold
                          }}
                        >
                          {item.unitName}
                        </span>
                      )}

                      {item.isChloe && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '0.1rem 0.35rem',
                            borderRadius: brand.radius,
                            background: 'rgba(37, 211, 102, 0.15)',
                            color: '#25D366'
                          }}
                        >
                          קלואי
                        </span>
                      )}

                      {!item.isChloe && !item.isCompletion && (
                        <button
                          type="button"
                          onClick={() => handleDeleteShopping(item.id)}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: brand.textMuted,
                            cursor: 'pointer',
                            padding: '0.2rem'
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ROOM DETAIL MODAL (Opens on clicking an arriving or occupied room) */}
      {selectedRoomModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setSelectedRoomModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '380px',
              background: brand.cardBg,
              border: `1.5px solid ${brand.goldBorder}`,
              borderRadius: brand.radius,
              padding: '1.25rem',
              color: brand.text,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              boxShadow: '0 15px 30px rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${brand.border}`, paddingBottom: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: brand.text }}>
                  {selectedRoomModal.unitName}
                </div>
                <div style={{ fontSize: '0.75rem', color: brand.gold }}>
                  פרטי הזמנה וכניסה
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoomModal(null)}
                style={{ border: 'none', background: 'none', color: brand.textMuted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
              <div><strong>אורח:</strong> {selectedRoomModal.guestName}</div>
              {selectedRoomModal.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <strong>טלפון:</strong> <span>{selectedRoomModal.phone}</span>
                  <a href={waLink(selectedRoomModal.phone)} target="_blank" rel="noreferrer" style={{ color: '#25D366' }} title="וואטסאפ">
                    <MessageCircle size={18} />
                  </a>
                  <a href={`tel:${selectedRoomModal.phone}`} style={{ color: brand.gold }} title="חייג">
                    <Phone size={18} />
                  </a>
                </div>
              )}
              <div>
                <strong>הרכב:</strong> {selectedRoomModal.adults != null ? `${selectedRoomModal.adults} מבוגרים ${selectedRoomModal.kids > 0 ? `+ ${selectedRoomModal.kids} ילדים` : ''}` : 'לא צוין'}
              </div>
              <div>
                <strong>שעת הגעה משוערת:</strong> {selectedRoomModal.eta ? selectedRoomModal.eta : 'לא צוינה'}
              </div>
              {selectedRoomModal.lockbox && (
                <div><strong>קוד כספת מפתח:</strong> <span style={{ color: brand.gold, fontWeight: 900 }}>{selectedRoomModal.lockbox}</span></div>
              )}
              {selectedRoomModal.specialRequests && (
                <div style={{ background: isDark ? '#1C0F0C' : '#F7F3EE', padding: '0.6rem', borderRadius: brand.radiusMd, marginTop: '0.2rem' }}>
                  <strong>בקשות מיוחדות:</strong> {selectedRoomModal.specialRequests}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  handleToggleOccupy(selectedRoomModal.id, 'OCCUPIED');
                  setSelectedRoomModal(null);
                }}
                style={{
                  flex: 1,
                  padding: '0.55rem',
                  borderRadius: brand.radius,
                  border: `1px solid ${brand.readyBorder}`,
                  background: brand.readyBg,
                  color: brand.readyText,
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                סמן כניסת אורח (מאוכלס)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW MAINTENANCE TICKET MODAL */}
      {showNewMaintenanceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowNewMaintenanceModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '360px',
              background: brand.cardBg,
              border: `1.5px solid ${brand.goldBorder}`,
              borderRadius: brand.radius,
              padding: '1.25rem',
              color: brand.text,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              boxShadow: '0 15px 30px rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${brand.border}`, paddingBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, color: brand.text }}>
                פתיחת קריאת תקלה / אחזקה
              </div>
              <button
                type="button"
                onClick={() => setShowNewMaintenanceModal(false)}
                style={{ border: 'none', background: 'none', color: brand.textMuted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCustomFault} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem', color: brand.textMuted }}>
                  בחר יחידה *
                </label>
                <select
                  required
                  value={newFaultUnitId}
                  onChange={(e) => setNewFaultUnitId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: brand.radius,
                    border: `1px solid ${brand.border}`,
                    background: isDark ? '#1C0F0C' : '#FFFFFF',
                    color: brand.text,
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                >
                  <option value="">-- בחר יחידה --</option>
                  {(effectiveUnits || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {fieldUnitDisplayName(u)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem', color: brand.textMuted }}>
                  תיאור התקלה / התיקון הנדרש *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="פירוט התקלה (למשל: נזילה במקלחת, מזגן לא מקרר...)"
                  value={newFaultDesc}
                  onChange={(e) => setNewFaultDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: brand.radius,
                    border: `1px solid ${brand.border}`,
                    background: isDark ? '#1C0F0C' : '#FFFFFF',
                    color: brand.text,
                    fontSize: '0.82rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: brand.radius,
                  border: `1px solid ${brand.goldBorder}`,
                  background: brand.gold,
                  color: brand.wine,
                  fontWeight: 900,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  marginTop: '0.25rem'
                }}
              >
                פתח תקלה בטיפול מיידי
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
