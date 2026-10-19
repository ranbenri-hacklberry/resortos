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
  Star
} from 'lucide-react';
import { NorthStarIcon } from '../mialees/MialeesBrandAssets';
import { fieldUnitDisplayName, stripLegendPlotNumber } from '../../lib/fieldUnitCatalog';
import { lockboxCodeForUnit } from '../../lib/guestProfileSeed';
import { israelToday } from '../../lib/cabinAccess';
import { isUnavailableHoldBooking } from '../../lib/unavailableHold';
import { completionsFromUnit, toggleCompletion, addCompletion } from '../../lib/roomCompletions';
import { db } from '../../lib/resortos-db';
import {
  getResortDefaultUnits,
  getResortDefaultBookings,
  getResortDefaultMaintenance,
  getResortDefaultSupplies
} from '../../lib/resortOperationalData';

const SHOPPING_STORAGE_KEY = 'hotelos-procurement-shopping-v1';

function readShoppingList() {
  try {
    const raw = localStorage.getItem(SHOPPING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return getResortDefaultSupplies();
  } catch {
    return getResortDefaultSupplies();
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

  // Miyalis Luxury Brand Tokens (sharp 4px-6px borders, strictly no bubbles)
  const brand = {
    bg: isDark ? '#26130F' : '#FDFBF7',
    cardBg: isDark ? '#341B16' : '#FFFFFF',
    text: isDark ? '#FDFBF7' : '#26130F',
    textMuted: isDark ? '#BFB3A8' : '#736055',
    wine: '#26130F',
    cream: '#FDFBF7',
    gold: '#C5A059',
    goldSoft: 'rgba(197, 160, 89, 0.16)',
    goldBorder: 'rgba(197, 160, 89, 0.38)',
    border: isDark ? 'rgba(191, 179, 168, 0.18)' : 'rgba(115, 96, 85, 0.16)',
    cardBorder: isDark ? 'rgba(197, 160, 89, 0.25)' : 'rgba(197, 160, 89, 0.22)',
    candy: '#F2D5DD',
    urgentBg: isDark ? 'rgba(197, 160, 89, 0.18)' : '#FFF9EE',
    urgentBorder: '#C5A059',
    urgentText: isDark ? '#F5D899' : '#8A5814',
    readyBg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#F0FDF4',
    readyBorder: 'rgba(16, 185, 129, 0.45)',
    readyText: isDark ? '#6EE7B7' : '#047857',
    alertBg: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2',
    alertBorder: 'rgba(239, 68, 68, 0.45)',
    alertText: isDark ? '#FCA5A5' : '#B91C1C',
    radius: '5px'
  };

  // Section Accordion State (all collapsed by default for executive bird's-eye view)
  const [sectionsOpen, setSectionsOpen] = useState({
    arriving: false,
    cleaning: false,
    occupied: false,
    vacant: false,
    maintenance: false,
    supplies: false
  });

  const toggleSection = (key) => {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fail-Safe Data Layer: ensure resort operational data is populated immediately
  const effectiveUnits = useMemo(() => {
    if (Array.isArray(units) && units.length > 0) return units;
    return getResortDefaultUnits(tenantId, todayStr);
  }, [units, tenantId, todayStr]);

  const effectiveBookings = useMemo(() => {
    if (Array.isArray(bookings) && bookings.length > 0) return bookings;
    return getResortDefaultBookings(tenantId, todayStr);
  }, [bookings, tenantId, todayStr]);

  const effectiveCustomTickets = useMemo(() => {
    if (Array.isArray(customTickets) && customTickets.length > 0) return customTickets;
    return getResortDefaultMaintenance();
  }, [customTickets]);

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
            isChloe: true,
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

  // 1. ARRIVING TODAY (חדרים נכנסים)
  const arrivingRooms = useMemo(() => {
    const arrivals = (effectiveBookings || []).filter((b) => (
      b.check_in_date === todayStr &&
      !b.deleted_at &&
      b.booking_status !== 'CANCELED' &&
      !isUnavailableHoldBooking(b)
    ));

    return arrivals.map((booking) => {
      const unit = (effectiveUnits || []).find((u) => u.id === booking.unit_id);
      const isReady = unit?.operational_status === 'READY';
      const lockbox = lockboxCodeForUnit(unit);
      const sameDayTurnover = (effectiveBookings || []).some((b) => (
        b.unit_id === booking.unit_id &&
        b.check_out_date === todayStr &&
        b.id !== booking.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b)
      ));

      return {
        id: unit?.id || booking.unit_id || booking.id,
        booking,
        unit,
        unitName: unit ? fieldUnitDisplayName(unit) : (booking.room_number || 'יחידה לא משובצת'),
        guestName: booking.guest_name || 'אורח',
        phone: booking.guest_phone || booking.phone || '',
        eta: booking.stay?.estimated_arrival_time || booking.eta || '15:00',
        adults: booking.adults_count ?? booking.adults ?? 2,
        kids: booking.children_count ?? booking.children ?? 0,
        specialRequests: booking.special_requests || booking.notes || booking.guest_notes || '',
        lockbox,
        status: unit?.operational_status || (sameDayTurnover ? 'DIRTY' : 'READY'),
        isReady,
        sameDayTurnover
      };
    });
  }, [effectiveBookings, effectiveUnits, todayStr]);

  const arrivingCleanCount = arrivingRooms.filter((r) => r.isReady).length;

  // 2. TURNOVER / CLEANING (חדרים לניקיון)
  const cleaningRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      const status = unit.operational_status;
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
      if (hasCheckoutToday && status !== 'READY') return true;
      if (hasCheckinToday && status !== 'READY') return true;
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
        checkinEta: checkinBooking?.stay?.estimated_arrival_time || checkinBooking?.eta || '15:00',
        completions: completionsFromUnit(unit),
        assignedStaff: unit.assigned_staff || 'צוות משק בית'
      };
    });
  }, [effectiveUnits, effectiveBookings, todayStr]);

  // Urgent Turnover Callout Units
  const urgentTurnovers = useMemo(() => {
    return cleaningRooms.filter((r) => r.isSameDayTurnover);
  }, [cleaningRooms]);

  // 3. OCCUPIED ROOMS (חדרים מאוכלסים)
  const occupiedRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      if (unit.staff_occupancy === 'OCCUPIED') return true;
      const hasInHouse = (effectiveBookings || []).some((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b) &&
        b.check_in_date <= todayStr &&
        b.check_out_date > todayStr
      ));
      if (hasInHouse && unit.staff_occupancy !== 'VACANT') return true;
      return false;
    }).map((unit) => {
      const activeBooking = (effectiveBookings || []).find((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED' &&
        !isUnavailableHoldBooking(b) &&
        b.check_in_date <= todayStr &&
        b.check_out_date >= todayStr
      ));

      return {
        unit,
        id: unit.id,
        unitName: fieldUnitDisplayName(unit),
        booking: activeBooking,
        guestName: activeBooking?.guest_name || 'אורח שוהה',
        phone: activeBooking?.guest_phone || activeBooking?.phone || '',
        checkoutDate: activeBooking?.check_out_date || '',
        lockbox: lockboxCodeForUnit(unit)
      };
    });
  }, [effectiveUnits, effectiveBookings, todayStr]);

  // 4. VACANT ROOMS (חדרים פנויים ומוכנים)
  const vacantRooms = useMemo(() => {
    return (effectiveUnits || []).filter((unit) => {
      const isArriving = arrivingRooms.some((r) => r.id === unit.id);
      const isOccupied = occupiedRooms.some((r) => r.id === unit.id);
      const isCleaning = cleaningRooms.some((r) => r.id === unit.id);
      const isMaintenance = unit.operational_status === 'MAINTENANCE_ALERT' || unit.operational_domain === 'MAINTENANCE';
      return !isArriving && !isOccupied && !isCleaning && !isMaintenance;
    }).map((unit) => ({
      unit,
      id: unit.id,
      unitName: fieldUnitDisplayName(unit),
      lockbox: lockboxCodeForUnit(unit),
      status: unit.operational_status || 'READY'
    }));
  }, [effectiveUnits, arrivingRooms, occupiedRooms, cleaningRooms]);

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
      reportedBy: u.assigned_staff || 'קלואי (סוכנת ווטסאפ)',
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
    } catch (err) {
      console.warn('[TOGGLE OCCUPY ERROR]', err);
    }
  };

  const handleResolveMaintenance = (ticketId) => {
    if (onFinishTask) {
      onFinishTask(ticketId);
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
      {/* Top Luxury Miyalis Brand Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.2rem 0.2rem',
          borderBottom: `1px solid ${brand.border}`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <NorthStarIcon className="w-5 h-5" color={brand.gold} />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 900, letterSpacing: '0.12em', color: brand.text }}>
              תפעול מיאליס
            </div>
            <div style={{ fontSize: '0.68rem', color: brand.textMuted, letterSpacing: '0.05em' }}>
              MIALEES LUXURY OPERATIONS
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: brand.radius,
              border: `1px solid ${brand.goldBorder}`,
              background: brand.goldSoft,
              color: brand.gold,
              fontSize: '0.72rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {todayStr}
          </div>
        </div>
      </div>

      {/* 1. חדרים נכנסים (Arriving Rooms) */}
      <section
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('arriving')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DoorOpen size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  חדרים נכנסים
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    background: arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyBg : brand.urgentBg,
                    border: `1px solid ${arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyBorder : brand.urgentBorder}`,
                    color: arrivingCleanCount === arrivingRooms.length && arrivingRooms.length > 0 ? brand.readyText : brand.urgentText
                  }}
                >
                  ({arrivingCleanCount} נקיים מתוך {arrivingRooms.length})
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {arrivingRooms.length > 0 ? `${arrivingCleanCount} מוכנים מתוך ${arrivingRooms.length} כניסות מתוכננות להיום` : 'אין כניסות מתוכננות להיום'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {arrivingRooms.length}
            </span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.arriving ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: brand.textMuted }}>
                      <div>
                        <strong style={{ color: brand.text }}>{room.guestName}</strong>
                        {room.kids > 0 ? ` · ${room.adults}+${room.kids} נפשות` : ` · ${room.adults} מבוגרים`}
                        {room.eta ? ` · שעה משוערת: ${room.eta}` : ''}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={(e) => e.stopPropagation()}>
                        {room.phone && (
                          <>
                            <a
                              href={waLink(room.phone, `שלום ${room.guestName}, ברוכים הבאים למיאליס!`)}
                              target="_blank"
                              rel="noreferrer"
                              title="וואטסאפ"
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
                              title="חייג"
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
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('cleaning')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Sparkles size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  חדרים לניקיון
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    background: cleaningRooms.length === 0 ? brand.readyBg : brand.urgentBg,
                    border: `1px solid ${cleaningRooms.length === 0 ? brand.readyBorder : brand.urgentBorder}`,
                    color: cleaningRooms.length === 0 ? brand.readyText : brand.urgentText
                  }}
                >
                  ({cleaningRooms.length} יחידות)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {cleaningRooms.length > 0
                  ? `${cleaningRooms.length} חדרים להכנה${urgentTurnovers.length > 0 ? ` · ⚡ ${urgentTurnovers.length} יציאה וכניסה היום` : ''}`
                  : '✓ כל החדרים נקיים ומסודרים'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {cleaningRooms.length}
            </span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.cleaning ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('occupied')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Home size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  חדרים מאוכלסים
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    background: 'rgba(139, 92, 246, 0.12)',
                    color: isDark ? '#DDD6FE' : '#6D28D9'
                  }}
                >
                  ({occupiedRooms.length} תפוסים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {occupiedRooms.length > 0 ? `${occupiedRooms.length} יחידות עם אורחים שוהים כרגע` : 'אין חדרים מאוכלסים כרגע'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {occupiedRooms.length}
            </span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.occupied ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('vacant')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ShieldCheck size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  חדרים פנויים ומוכנים
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    background: brand.readyBg,
                    border: `1px solid ${brand.readyBorder}`,
                    color: brand.readyText
                  }}
                >
                  ({vacantRooms.length} פנויים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {vacantRooms.length > 0 ? `${vacantRooms.length} יחידות מוכנות לאכלוס מיידי` : 'כל החדרים תפוסים או בהכנה'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: brand.readyText,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {vacantRooms.length}
            </span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.vacant ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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

      {/* 5. רשימת תקלות ותיקונים (Maintenance & Repairs - Synced with Chloe) */}
      <section
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('maintenance')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wrench size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  תקלות ותיקונים
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    background: maintenanceTickets.length > 0 ? brand.alertBg : brand.readyBg,
                    border: `1px solid ${maintenanceTickets.length > 0 ? brand.alertBorder : brand.readyBorder}`,
                    color: maintenanceTickets.length > 0 ? brand.alertText : brand.readyText
                  }}
                >
                  ({maintenanceTickets.length} פתוחות)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {maintenanceTickets.length > 0 ? `${maintenanceTickets.length} קריאות שירות · כולל דיווחי ווטסאפ (קלואי)` : '✓ אין תקלות פתוחות, הכל תקין'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowNewMaintenanceModal(true)}
              style={{
                border: `1px solid ${brand.goldBorder}`,
                borderRadius: brand.radius,
                background: brand.goldSoft,
                color: brand.gold,
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '0.3rem 0.55rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              <Plus size={12} />
              <span>תקלה</span>
            </button>
            <div
              onClick={() => toggleSection('maintenance')}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {sectionsOpen.maintenance ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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
        style={{
          border: `1px solid ${brand.cardBorder}`,
          borderRadius: brand.radius,
          background: brand.cardBg,
          overflow: 'hidden'
        }}
      >
        <header
          onClick={() => toggleSection('supplies')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.95rem 1rem',
            minHeight: '66px',
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
                width: '40px',
                height: '40px',
                minWidth: '40px',
                borderRadius: brand.radius,
                background: brand.goldSoft,
                border: `1px solid ${brand.goldBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ShoppingCart size={20} color={brand.gold} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.96rem', fontWeight: 900, color: brand.text }}>
                  רשימת קניות והשלמות ציוד
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.45rem',
                    borderRadius: brand.radius,
                    background: openProcurementCount > 0 ? brand.urgentBg : brand.readyBg,
                    border: `1px solid ${openProcurementCount > 0 ? brand.urgentBorder : brand.readyBorder}`,
                    color: openProcurementCount > 0 ? brand.urgentText : brand.readyText
                  }}
                >
                  ({openProcurementCount} חסרים)
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: brand.textMuted, marginTop: '2px', fontWeight: 600 }}>
                {openProcurementCount > 0 ? `${openProcurementCount} פריטים נדרשים לרכישה והשלמה ביחידות` : '✓ הרשימה הושלמה במלואה'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span
              style={{
                fontSize: '0.92rem',
                fontWeight: 900,
                color: brand.gold,
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {openProcurementCount}
            </span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: brand.radius,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {sectionsOpen.supplies ? <ChevronUp size={16} color={brand.textMuted} /> : <ChevronDown size={16} color={brand.textMuted} />}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <strong>טלפון:</strong> <span>{selectedRoomModal.phone}</span>
                  <a href={waLink(selectedRoomModal.phone)} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>
                    <MessageCircle size={16} />
                  </a>
                  <a href={`tel:${selectedRoomModal.phone}`} style={{ color: brand.gold }}>
                    <Phone size={16} />
                  </a>
                </div>
              )}
              <div><strong>הרכב:</strong> {selectedRoomModal.adults} מבוגרים {selectedRoomModal.kids > 0 ? `+ ${selectedRoomModal.kids} ילדים` : ''}</div>
              <div><strong>שעת הגעה משוערת:</strong> {selectedRoomModal.eta || '15:00'}</div>
              {selectedRoomModal.lockbox && (
                <div><strong>קוד כספת מפתח:</strong> <span style={{ color: brand.gold, fontWeight: 900 }}>{selectedRoomModal.lockbox}</span></div>
              )}
              {selectedRoomModal.specialRequests && (
                <div style={{ background: isDark ? '#1C0F0C' : '#F7F3EE', padding: '0.5rem', borderRadius: brand.radius, marginTop: '0.2rem' }}>
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
