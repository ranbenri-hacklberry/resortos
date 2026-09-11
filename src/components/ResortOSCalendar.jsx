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
  MessageSquare,
  Phone,
  Clock,
  ExternalLink,
  Copy,
  Minus,
  CheckCircle2,
  Users,
  Baby,
  Ticket,
  Banknote,
  Sparkles,
  Info,
  Printer,
  CreditCard
} from 'lucide-react';
import { 
  db, 
  useLiveUnits, 
  useLiveBookings, 
  useLivePromotions,
  useResortOSSyncStatus
} from '../lib/resortos-db';
import { pushBookingToCloud, pushBookingsToCloud, syncCloudBookingsToDexie, subscribeToRealtimeCloudBookings, syncUnitOpsToDexie, subscribeToRealtimeUnitOps, pushUnitToCloud, ensureCanonicalUnits, refreshBookingFromGuestMailbox, hasPublicGuestMailbox } from '../lib/cloudDb';
import { createCheckoutToken } from '../lib/checkoutToken';
import { findOverlappingBooking, maxAvailableNights } from '../lib/bookingOverlap';
import { barsToDrawOnCell, isActiveStay, isPaintedStay, stayCardTone, spanBarPixels, stayYmd } from '../lib/calendarOccupancy';
import { agentLockLabel, agentLockOnNight, findOverlappingAgentLock, useAgentLocks } from '../lib/agentLocks';
import { publishGuestMailbox, startHostCardCharge } from '../lib/guestCheckoutApi';
import { guestStayOrigin, guestStayUrl } from '../lib/guestStayUrl';
import { guestStaySmsText } from '../lib/micropaySms';
import { sendStaffSms } from '../lib/staffSmsApi';
import { applyPaidArrivalCheckin, stayExpiresAt } from '../lib/stayAccess';
import { defaultHypTerminal, HYP_TERMINAL_A, HYP_TERMINAL_B, hypTerminalLabel, normalizeHypTerminal } from '../lib/hypTerminal';
import {
  applyAutoCheckout,
  bookingsNeedingCheckoutRollForward,
  canExtendStay,
  checkoutDutyRollKey,
  isCheckoutDutyDismissedToday,
  isOpenStay,
  listOverdueCheckouts,
  nowLineQuarter,
  nowLineTitle,
  setCheckoutDutyDismissedToday
} from '../lib/checkoutDuty';
import { israelToday } from '../lib/cabinAccess';
import { calendarInventory, unitCalendarLines, unitMaxOccupancy, whatsAppUnitName } from '../lib/units';
import { applyCalendarOccupancy, applyCalendarUnitStatus, ensureTurnoverCleaning, openTurnoverAfterCheckout } from '../lib/housekeepingCycle';
import { hideClosedOrRenovationUnit } from '../lib/unavailableHold';
import { bookingsMarkingNight, isCurrentlyInHouse, reviveVacatedArrival, staffOccupancyOf, unitDisplayStatus, unitNameFrame, vacateBookingOnDate } from '../lib/unitStatus';
import UnitOpsStatusSheet from './UnitOpsStatusSheet';
import { hypAccountOf, listClearingPayments, mergeClearingPayments } from '../lib/clearingPayments';
import { awaitingBankReview, awaitingCashCollection, dueAgorotOf, hasRecordedReceipt, isFullyPaid, kinorotSettlementKind, paidIlsOfBooking, paymentStatusAfterPaid, recordedPaidAgorot } from '../lib/bookingPaid';
import ClearingPaymentsList from './ClearingPaymentsList';
import { BOARD_AREA_FILTERS, bookingGuestHeadcount, bookingHasCrib, bookingPeopleLabel, dailyDutyCounts, defaultReportDate, DUTY_PRINT_AREAS, guestCardFirstName, hebrewDateLabel, printDailyDutyReport, unitMatchesBoardArea } from '../lib/dailyDutyReport';
import {
  evaluateStayRestrictions,
  listBookingRestrictions,
  propertyIdFromUnit,
  requiredMinNights,
  restrictionAlert,
  subscribeBookingRestrictions
} from '../lib/bookingRestrictions';
import { depositIlsFromTotal } from '../lib/deposit';
import { ilsToAgorot, nightlyFromTotalIls, nightlyIlsFromUnit, pricedStay } from '../lib/bookingPrice';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';
const UNIT_COL_PX = 112;
const CELL_PX = 86;
const UNIT_ROW_PX = 26;
const HEADER_H = 36;

/**
 * Put “today” flush against the sticky unit names. Past days stay on the board
 * (scroll back to see them). Never use scrollIntoView — it pans the whole page
 * on iOS. Avoid guessing scrollLeft sign; measure the today column instead.
 */
function scrollCalendarToToday(scroller) {
  if (!scroller) return;
  const todayCol = scroller.querySelector('[data-today-col]');
  const unitCol = scroller.querySelector('.hotelos-calendar-unit-col');
  if (!todayCol) return;

  if (typeof window !== 'undefined') {
    window.scrollTo(0, window.scrollY || 0);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  }

  const desiredRight = unitCol
    ? unitCol.getBoundingClientRect().left
    : scroller.getBoundingClientRect().right - UNIT_COL_PX;
  const before = todayCol.getBoundingClientRect().right;
  const visualDelta = before - desiredRight;
  if (Math.abs(visualDelta) < 2) return;

  const origin = scroller.scrollLeft;
  scroller.scrollBy({ left: visualDelta, top: 0, behavior: 'auto' });
  const afterBy = todayCol.getBoundingClientRect().right;
  if (Math.abs(afterBy - desiredRight) < 4) return;

  scroller.scrollLeft = origin;
  scroller.scrollBy({ left: -visualDelta, top: 0, behavior: 'auto' });
  const afterRev = todayCol.getBoundingClientRect().right;
  if (Math.abs(afterRev - desiredRight) < 4) return;

  scroller.scrollLeft = origin;
  const probe = 48;
  scroller.scrollLeft = origin + probe;
  const afterProbe = todayCol.getBoundingClientRect().right;
  scroller.scrollLeft = origin;
  const probeMoved = afterProbe - before;
  if (Math.abs(probeMoved) < 0.5) return;
  scroller.scrollLeft = origin + (visualDelta * probe) / probeMoved;
}

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

function parseDateStr(dateStr) {
  const [year, month, day] = String(dateStr || '').split('-').map(Number);
  const result = new Date(year, (month || 1) - 1, day || 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function toDialPhone(raw) {
  return String(raw || '').replace(/[^0-9+]/g, '');
}

function dispatchOccupancyCap(data) {
  return unitMaxOccupancy(data?.unit || data?.unit_id, 6);
}

function bumpDispatchPax(data, field, delta) {
  const max = dispatchOccupancyCap(data);
  const adults = Math.max(1, Number(data.adults_count) || 2);
  const children = Math.max(0, Number(data.children_count) || 0);
  if (field === 'adults') {
    const next = adults + delta;
    if (next < 1 || next + children > max) return data;
    return { ...data, adults_count: next };
  }
  const next = children + delta;
  if (next < 0 || adults + next > max) return data;
  return { ...data, children_count: next };
}

function DispatchQtyStepper({ label, value, onMinus, onPlus, themeStyles }) {
  return (
    <div>
      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: themeStyles.inputBg,
        border: `1px solid ${themeStyles.inputBorder}`,
        borderRadius: 12,
        padding: '0.2rem 0.45rem'
      }}>
        <button type="button" onClick={onMinus} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.35rem' }}>
          <Minus size={16} />
        </button>
        <span style={{ fontSize: '1rem', fontWeight: 900, minWidth: 18, textAlign: 'center' }}>{value}</span>
        <button type="button" onClick={onPlus} style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.35rem' }}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function toWhatsAppPhone(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? '972' + digits.slice(1) : digits;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = String(dateStr).split('-');
  if (!day) return dateStr;
  return `${day}/${month}/${year}`;
}

function initialGuestWhatsAppText({ unitName, checkInDate, checkoutUrl }) {
  return `שלום! להשלמת אישור ההזמנה ב-${unitName} לתאריך ${formatDisplayDate(checkInDate)}, לחץ על הקישור:\n\n${checkoutUrl}\n\nתודה!`;
}

function smsErrorText(err) {
  const code = err?.message || '';
  if (code === 'MICROPAY_TOKEN_MISSING' || code === 'MICROPAY_FROM_MISSING') {
    return 'סמס לא מוגדר בשרת — חסר טוקן או מספר שולח של מיקרופיי.';
  }
  if (code === 'SMS_PHONE_INVALID') return 'מספר הטלפון לא תקין לשליחת סמס.';
  if (code === 'NOT_ENOUGH_CREDIT') return 'אין יתרת סמס בחשבון מיקרופיי.';
  return 'שליחת הסמס נכשלה. נסו שוב.';
}

function openWhatsAppChat(phone, encodedText) {
  const appUrl = `whatsapp://send?phone=${phone}&text=${encodedText}`;
  const promptUrl = `https://api.whatsapp.com/send/?phone=${phone}&text=${encodedText}&type=phone_number&app_absent=0`;

  if (isMobileDevice()) {
    window.location.href = promptUrl;
    return;
  }

  let handedOff = false;
  const markHandedOff = () => { handedOff = true; };
  window.addEventListener('blur', markHandedOff, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handedOff = true;
  }, { once: true });

  window.location.href = appUrl;

  window.setTimeout(() => {
    if (handedOff || document.hidden || !document.hasFocus()) return;
    window.open(promptUrl, '_blank', 'noopener');
  }, 900);
}

// Utility: Calculate difference in days
function getDaysDiff(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

function restrictionBlock(restrictions, unit, checkIn, checkOut) {
  const result = evaluateStayRestrictions({
    restrictions,
    propertyId: propertyIdFromUnit(unit),
    checkIn,
    checkOut
  });
  const message = restrictionAlert(result);
  if (message) {
    window.alert(message);
    return null;
  }
  return result;
}

function depositActuallyPaid(booking) {
  if (booking?.stay?.hyp_deposit?.paid) return true;
  if (!hasRecordedReceipt(booking)) return false;
  const status = booking?.payment_status;
  return status === 'PARTIAL' || status === 'DEPOSIT_PAID';
}

function paidIlsOf(booking, totalIls, depositIls) {
  return paidIlsOfBooking(booking, totalIls, depositIls);
}

function paidMethodLabel(booking) {
  const settlement = kinorotSettlementKind(booking);
  if (settlement === 'voucher') return 'שובר';
  if (settlement === 'comp') return 'ללא תשלום';
  const last = listClearingPayments(booking).at(-1) || {};
  const key = String(last.accountKey || '').toUpperCase();
  const source = String(last.source || '').toUpperCase();
  if (source === 'CASH' || key === 'CASH') return 'מזומן';
  if (source === 'BANK' || key === 'BANK') return 'העברה';
  if (source === 'HYP' || key.startsWith('HYP') || key === 'MAX_HYP' || key === 'MAX') return 'אשראי';
  if (source === 'DESK' || source === 'CARD') return 'אשראי';
  const mode = String(booking?.payment_mode || '');
  if (mode === 'CASH' || mode === 'CASH_TRUST') return 'מזומן';
  if (mode === 'BANK_TRANSFER') return 'העברה';
  if (mode === 'CARD' || mode === 'CREDIT_FULL' || mode === 'CREDIT_DEPOSIT') return 'אשראי';
  if (mode === 'VOUCHER') return 'שובר';
  if (String(last.accountLabel || '').includes('מזומן')) return 'מזומן';
  return 'תשלום';
}

function localDateTimeValue(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyGhostArrivalRevert(booking, today = israelToday()) {
  if (!booking || booking.deleted_at) return null;
  if (booking.booking_status !== 'CHECKED_IN') return null;
  if (hasRecordedReceipt(booking)) return null;
  if (booking.check_in_date !== today) return null;
  const stay = booking.stay && typeof booking.stay === 'object' ? { ...booking.stay } : {};
  delete stay.guest_checked_in_at;
  return {
    ...booking,
    booking_status: 'CONFIRMED',
    payment_status: 'UNPAID',
    stay,
    updated_at: new Date().toISOString()
  };
}

function applyAutoCheckin(booking) {
  if (!booking || booking.deleted_at) return null;
  if (booking.booking_status === 'CANCELED' || booking.booking_status === 'CHECKED_OUT') return null;
  if (!isFullyPaid(booking) || !hasRecordedReceipt(booking)) return null;
  if (booking.payment_status === 'PAID') return null;
  return {
    ...booking,
    payment_status: 'PAID',
    updated_at: new Date().toISOString()
  };
}

function HypTerminalField({ locked, value, onChange, themeStyles }) {
  return (
    <div>
      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
        מסוף Hyp לחיוב
      </label>
      {locked ? (
        <div style={{
          padding: '0.7rem',
          borderRadius: '12px',
          background: themeStyles.inputBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          fontSize: '0.85rem',
          fontWeight: 700
        }}>
          {hypTerminalLabel(value)} · ננעל בשליחה הראשונה
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
          <option value="B">{hypTerminalLabel('B')}</option>
          <option value="A">{hypTerminalLabel('A')}</option>
        </select>
      )}
    </div>
  );
}

function PriceOverrideFields({ themeStyles, nightly, total, deposit, nights, onNightly, onTotal, onDeposit }) {
  const inputStyle = {
    width: '100%',
    padding: '0.6rem',
    borderRadius: '8px',
    background: themeStyles.inputBg,
    border: `1px solid ${themeStyles.inputBorder}`,
    color: themeStyles.textPrimary,
    fontWeight: 700
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
      <div>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>מחיר ללילה (₪)</label>
        <input
          type="number"
          min="0"
          step="1"
          required
          value={nightly}
          onChange={(e) => onNightly(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>סה״כ שהייה (₪)</label>
        <input
          type="number"
          min="0"
          step="1"
          required
          value={total}
          onChange={(e) => onTotal(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>לתשלום עכשיו (₪)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={deposit}
          onChange={(e) => onDeposit?.(e.target.value)}
          style={inputStyle}
        />
        <div style={{ marginTop: 4, fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted }}>
          {nights} לילות · ברירת מחדל 20% · זה הסכום בקישור ובחיוב אשראי
        </div>
      </div>
    </div>
  );
}

function dispatchStayPrice(data, restrictions) {
  const nights = Math.max(1, Number(data?.nights_count) || 1);
  const checkOut = formatDate(addDays(new Date(`${data.check_in_date}T00:00:00`), nights));
  const restriction = evaluateStayRestrictions({
    restrictions,
    propertyId: propertyIdFromUnit(data.unit || data.unit_id),
    checkIn: data.check_in_date,
    checkOut
  });
  const nightly = Number(data.custom_nightly_rate ?? nightlyIlsFromUnit(data.unit));
  return { ...pricedStay(nightly, nights, restriction.multiplier), multiplier: restriction.multiplier };
}

function withDispatchNights(data, nights, restrictions) {
  const next = { ...data, nights_count: nights };
  const priced = dispatchStayPrice(next, restrictions);
  return {
    ...next,
    custom_nightly_rate: priced.nightlyIls,
    total_price_ils: priced.totalIls,
    deposit_ils: priced.depositIls
  };
}

export default function ResortOSCalendar({
  tenantId = DEMO_TENANT_ID,
  theme = 'dark',
  allowedUnitIds = [],
  canSeePayments = true,
  sessionUser = null
}) {
  const { t, i18n } = useTranslation();
  const scrollContainerRef = useRef(null);
  const todayStr = useMemo(() => israelToday(), []);
  const { locks: agentLocks, error: agentLocksError } = useAgentLocks();
  const PAST_DAYS = 2;
  const FORWARD_DAYS = 21;
  // Modals state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [dispatchModalData, setDispatchModalData] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [payDetailsOpen, setPayDetailsOpen] = useState(false);
  const [isEditingBookingDetails, setIsEditingBookingDetails] = useState(false);
  const [daySummaryModalData, setDaySummaryModalData] = useState(null);
  const [sendingGuestLink, setSendingGuestLink] = useState(false);
  const [chargingCard, setChargingCard] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [linkHypTerminal, setLinkHypTerminal] = useState('B');
  const [dutyNow, setDutyNow] = useState(() => new Date());
  const [dutyOpen, setDutyOpen] = useState(false);
  const [dutyDismissed, setDutyDismissed] = useState(() => isCheckoutDutyDismissedToday());
  const [dutyBusyId, setDutyBusyId] = useState(null);
  const [dutySelectedIds, setDutySelectedIds] = useState(() => new Set());
  const [dutyReportOpen, setDutyReportOpen] = useState(false);
  const [dutyReportDate, setDutyReportDate] = useState(() => defaultReportDate());
  const [dutyReportArea, setDutyReportArea] = useState('all');
  const [opsUnitId, setOpsUnitId] = useState(null);
  const [opsStatusBusy, setOpsStatusBusy] = useState(false);
  const opsReopenGuard = useRef(0);
  const [restrictions, setRestrictions] = useState([]);
  const rollForwardRef = useRef(false);
  const dutyDayRef = useRef(israelToday());

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
    custom_nightly_rate: 850,
    total_price_ils: 1700,
    deposit_ils: 340,
    channel_source: 'DIRECT'
  });

  // Edit Reservation Form State
  const [editFormData, setEditFormData] = useState(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState('');
  const [paymentProofBusy, setPaymentProofBusy] = useState(false);
  const [cashForm, setCashForm] = useState({
    method: 'CASH',
    amount: '',
    collector: '',
    ref: '',
    terminal: 'B',
    at: israelToday()
  });
  const [cashBusy, setCashBusy] = useState(false);
  const [boardSync, setBoardSync] = useState({ ok: true, count: null });
  const [boardArea, setBoardArea] = useState(() => {
    try {
      const stored = localStorage.getItem('resortos-board-area');
      if (stored === 'ramot' || stored === 'givat' || stored === 'all') return stored;
    } catch (_) {}
    return 'all';
  });

  // 0ms Live Reactive Data Hooks from IndexedDB
  const rawUnits = useLiveUnits(tenantId);
  const units = useMemo(
    () => calendarInventory(rawUnits, allowedUnitIds, tenantId),
    [rawUnits, allowedUnitIds, tenantId]
  );
  const areaUnits = useMemo(
    () => units.filter((unit) => unitMatchesBoardArea(unit, boardArea)),
    [units, boardArea]
  );
  const visibleUnitIds = useMemo(() => new Set(areaUnits.map((unit) => unit.id)), [areaUnits]);
  const rawBookings = useLiveBookings(tenantId);
  const bookingsRef = useRef(rawBookings);
  bookingsRef.current = rawBookings;
  const mailboxWatchKey = useMemo(() => {
    const from = formatDate(addDays(parseDateStr(todayStr), -1));
    const to = formatDate(addDays(parseDateStr(todayStr), 3));
    return (rawBookings || [])
      .filter((booking) => (
        booking?.checkout_token
        && hasPublicGuestMailbox(booking)
        && booking.booking_status !== 'CANCELED'
        && booking.booking_status !== 'CHECKED_OUT'
        && !isFullyPaid(booking)
        && booking.check_in_date
        && booking.check_in_date >= from
        && booking.check_in_date <= to
      ))
      .map((booking) => booking.checkout_token)
      .sort()
      .join(',');
  }, [rawBookings, todayStr]);
  const rawPromotions = useLivePromotions(tenantId);
  const syncStatus = useResortOSSyncStatus(tenantId);

  const calendarStartStr = useMemo(
    () => formatDate(addDays(parseDateStr(todayStr), -PAST_DAYS)),
    [todayStr, PAST_DAYS]
  );
  const daysCount = PAST_DAYS + FORWARD_DAYS;
  const calendarEndStr = useMemo(
    () => formatDate(addDays(parseDateStr(calendarStartStr), daysCount)),
    [calendarStartStr, daysCount]
  );
  const boardUnits = useMemo(
    () => areaUnits.filter((unit) => !hideClosedOrRenovationUnit(unit, rawBookings, {
      today: todayStr,
      rangeStart: calendarStartStr,
      rangeEnd: calendarEndStr
    })),
    [areaUnits, rawBookings, todayStr, calendarStartStr, calendarEndStr]
  );

  const overdueCheckouts = useMemo(
    () => listOverdueCheckouts(rawBookings, dutyNow).filter((booking) => visibleUnitIds.has(booking.unit_id)),
    [rawBookings, dutyNow, visibleUnitIds]
  );
  const overdueIds = useMemo(
    () => new Set(overdueCheckouts.map((booking) => booking.id)),
    [overdueCheckouts]
  );
  const bookingsByUnit = useMemo(() => {
    const map = new Map();
    for (const booking of rawBookings || []) {
      if (!isPaintedStay(booking)) continue;
      const cin = stayYmd(booking.check_in_date);
      const cout = stayYmd(booking.check_out_date);
      // Keep any stay that overlaps the visible calendar window (incl. recent checkouts).
      if (cout <= calendarStartStr || cin >= calendarEndStr) continue;
      const list = map.get(booking.unit_id);
      if (list) list.push(booking);
      else map.set(booking.unit_id, [booking]);
    }
    return map;
  }, [rawBookings, calendarStartStr, calendarEndStr]);

  const nowQuarter = nowLineQuarter(dutyNow);
  const nowLineRight = `${Math.round(nowQuarter * 100)}%`;
  const nowLineLabel = nowLineTitle(dutyNow);
  const autoCheckinRef = useRef(false);
  const autoCheckoutRef = useRef(false);

  useEffect(() => {
    if (autoCheckinRef.current) return;
    const today = israelToday();
    const nexts = (rawBookings || []).map((booking) => (
      applyGhostArrivalRevert(booking, today) || applyPaidArrivalCheckin(booking) || applyAutoCheckin(booking)
    )).filter(Boolean);
    if (!nexts.length) return;
    autoCheckinRef.current = true;
    (async () => {
      try {
        await db.bookings.bulkPut(nexts);
        await pushBookingsToCloud(nexts, { allowOverlap: true });
        await Promise.all(nexts
          .filter((row) => row.checkout_token && row.booking_status === 'CHECKED_IN')
          .map((row) => publishGuestMailbox(row).catch(() => {})));
      } catch (_) {
        /* next live query can retry */
      } finally {
        autoCheckinRef.current = false;
      }
    })();
  }, [rawBookings]);

  const reviveArrivalsRef = useRef(false);
  useEffect(() => {
    if (reviveArrivalsRef.current) return;
    const nexts = (rawBookings || []).map((row) => reviveVacatedArrival(row, todayStr)).filter(Boolean);
    if (!nexts.length) return;
    reviveArrivalsRef.current = true;
    (async () => {
      try {
        await db.bookings.bulkPut(nexts);
        await pushBookingsToCloud(nexts, { allowOverlap: true });
      } finally {
        reviveArrivalsRef.current = false;
      }
    })();
  }, [rawBookings, todayStr]);

  useEffect(() => {
    if (!mailboxWatchKey) return undefined;
    let stop = false;
    const tokens = mailboxWatchKey.split(',').filter(Boolean);
    async function pullMailbox() {
      for (const token of tokens) {
        if (stop) return;
        const booking = (bookingsRef.current || []).find((row) => row.checkout_token === token);
        if (!booking) continue;
        await refreshBookingFromGuestMailbox(booking);
      }
    }
    pullMailbox();
    const id = setInterval(pullMailbox, 40000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [mailboxWatchKey]);

  useEffect(() => {
    if (autoCheckoutRef.current || !tenantId) return;
    const due = listOverdueCheckouts(rawBookings, dutyNow);
    if (!due.length) return;
    const nexts = due.map((booking) => applyAutoCheckout(booking, dutyNow)).filter(Boolean);
    if (!nexts.length) return;
    autoCheckoutRef.current = true;
    (async () => {
      try {
        await db.bookings.bulkPut(nexts);
        await pushBookingsToCloud(nexts, { allowOverlap: true });
        const unitIds = [...new Set(nexts.map((booking) => booking.unit_id).filter(Boolean))];
        await Promise.all(unitIds.map(async (unitId) => {
          const unit = rawUnits.find((row) => row.id === unitId) || await db.units.get(unitId);
          await openTurnoverAfterCheckout({ tenantId, unit, pushUnitToCloud, skipStayPublish: true });
        }));
      } catch (_) {
        /* next tick can retry */
      } finally {
        autoCheckoutRef.current = false;
      }
    })();
  }, [rawBookings, dutyNow, tenantId, rawUnits]);

  useEffect(() => {
    const timer = setInterval(() => setDutyNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const day = israelToday(dutyNow);
    if (day === dutyDayRef.current) return;
    dutyDayRef.current = day;
    setDutyDismissed(isCheckoutDutyDismissedToday(day));
  }, [dutyNow]);

  useEffect(() => {
    if (overdueCheckouts.length && !dutyDismissed) setDutyOpen(true);
    if (!overdueCheckouts.length) {
      setDutyOpen(false);
    }
  }, [overdueCheckouts.length, dutyDismissed]);

  const dutySelectInitRef = useRef(false);
  useEffect(() => {
    if (!dutyOpen) {
      dutySelectInitRef.current = false;
      return;
    }
    setDutySelectedIds((prev) => {
      const liveIds = overdueCheckouts.map((booking) => booking.id);
      if (!dutySelectInitRef.current) {
        dutySelectInitRef.current = true;
        return new Set(liveIds);
      }
      const live = new Set(liveIds);
      const next = new Set();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
      }
      return next;
    });
  }, [dutyOpen, overdueCheckouts]);

  useEffect(() => {
    if (rollForwardRef.current || !rawBookings?.length) return;
    if (localStorage.getItem(checkoutDutyRollKey())) return;
    const today = israelToday();
    const open = bookingsNeedingCheckoutRollForward(rawBookings, today);
    rollForwardRef.current = true;
    (async () => {
      for (const booking of open) {
        const next = {
          ...booking,
          check_out_date: today,
          expires_at: stayExpiresAt({ ...booking, check_out_date: today }),
          updated_at: new Date().toISOString()
        };
        await db.bookings.put(next);
        await pushBookingToCloud(next);
      }
      localStorage.setItem(checkoutDutyRollKey(), today);
    })().catch(() => {
      rollForwardRef.current = false;
    });
  }, [rawBookings]);

  const modalOpen = Boolean(isNewModalOpen || dispatchModalData || editingBooking || daySummaryModalData || dutyOpen || dutyReportOpen || opsUnitId);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (modalOpen) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = String(event.target?.tagName || '');
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
      const scroller = scrollContainerRef.current;
      if (!scroller) return;
      const dayPx = event.shiftKey ? 65 * 7 : 80;
      const rowPx = event.shiftKey ? 65 * 5 : 65;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scroller.scrollBy(dayPx, 0);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scroller.scrollBy(-dayPx, 0);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        scroller.scrollBy(0, rowPx);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        scroller.scrollBy(0, -rowPx);
      } else if (event.key === 'Home') {
        event.preventDefault();
        scrollCalendarToToday(scroller);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen]);

  // Fast windowed pull for the visible board — not the full 1000+ booking ledger.
  useEffect(() => {
    let cancelled = false;
    async function syncAll() {
      try {
        const pulled = await syncCloudBookingsToDexie(tenantId, {
          from: calendarStartStr,
          to: calendarEndStr
        });
        if (cancelled) return;
        if (pulled && typeof pulled === 'object') {
          setBoardSync({ ok: pulled.ok !== false, count: Number(pulled.count) || 0 });
        }
        await syncUnitOpsToDexie(tenantId);
      } catch (_) {}
    }
    syncAll();
    const unsubscribe = subscribeToRealtimeCloudBookings(tenantId);
    const unsubscribeOps = subscribeToRealtimeUnitOps(tenantId);
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      syncAll();
    }, 30000);
    const onKinorotSynced = () => {
      if (document.visibilityState === 'hidden') return;
      syncAll();
    };
    window.addEventListener('hotelos-kinorot-synced', onKinorotSynced);
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      syncAll();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof unsubscribeOps === 'function') unsubscribeOps();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('hotelos-kinorot-synced', onKinorotSynced);
    };
  }, [tenantId, calendarStartStr, calendarEndStr]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listBookingRestrictions(tenantId)
        .then((rows) => { if (!cancelled) setRestrictions(rows); })
        .catch(() => { if (!cancelled) setRestrictions([]); });
    };
    load();
    const unsubscribe = subscribeBookingRestrictions(tenantId, load);
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
      document.removeEventListener('visibilitychange', onVis);
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

  useEffect(() => {
    let cancelled = false;
    async function seedInventory() {
      try {
        await ensureCanonicalUnits(tenantId, { pullOnly: true, skipPurge: true });
      } catch (err) {
        console.error('[HOTELOS SEED ERROR]', err);
      }
      if (!cancelled) {
        syncUnitOpsToDexie(tenantId);
      }
    }
    seedInventory();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !units.length) return undefined;
    const timer = window.setTimeout(() => {
      ensureTurnoverCleaning({
        tenantId,
        units,
        bookings: rawBookings,
        pushUnitToCloud
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [tenantId, units, rawBookings]);

  // Generate date columns array
  const dateColumns = useMemo(() => {
    const dates = [];
    const currentLng = i18n.language || 'he';
    const startDate = parseDateStr(calendarStartStr);

    for (let i = 0; i < daysCount; i++) {
      const d = addDays(startDate, i);
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
        isPast: dateStr < todayStr,
        isWeekend: d.getDay() === 5 || d.getDay() === 6
      });
    }
    return dates;
  }, [calendarStartStr, daysCount, t, i18n.language, todayStr]);

  const alignedTodayRef = useRef(false);
  useEffect(() => {
    alignedTodayRef.current = false;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    let tries = 0;
    const align = () => {
      const todayCol = scroller.querySelector('[data-today-col]');
      const ready = todayCol && scroller.scrollWidth > scroller.clientWidth;
      if (!ready && tries < 24) {
        tries += 1;
        requestAnimationFrame(align);
        return;
      }
      if (!todayCol) return;
      scrollCalendarToToday(scroller);
      alignedTodayRef.current = true;
    };
    requestAnimationFrame(align);
  }, [dateColumns.length, calendarStartStr]);
  const handleCellClick = (unit, dateStr) => {
    if (dateStr < todayStr) return;
    if (staffOccupancyOf(unit) === 'OCCUPIED') {
      window.alert('היחידה מסומנת תפוסה. שחרר אותה לפנוי לפני הזמנה חדשה.');
      return;
    }
    const occupied = findOverlappingBooking(rawBookings, unit.id, dateStr, formatDate(addDays(new Date(`${dateStr}T00:00:00`), 1)));
    if (occupied) {
      window.alert('היחידה כבר תפוסה בתאריך הזה.');
      return;
    }
    const hold = agentLockOnNight(agentLocks, unit.id, dateStr);
    if (hold) {
      window.alert(agentLockLabel(hold));
      return;
    }
    const propertyId = propertyIdFromUnit(unit);
    const ctaCheck = evaluateStayRestrictions({
      restrictions,
      propertyId,
      checkIn: dateStr,
      checkOut: formatDate(addDays(new Date(`${dateStr}T00:00:00`), 1))
    });
    if (ctaCheck.cta.length) {
      window.alert(restrictionAlert(ctaCheck));
      return;
    }
    const nights = requiredMinNights(restrictions, propertyId, dateStr);
    const nightly = nightlyIlsFromUnit(unit);
    const checkOut = formatDate(addDays(new Date(`${dateStr}T00:00:00`), nights));
    const restriction = evaluateStayRestrictions({
      restrictions,
      propertyId,
      checkIn: dateStr,
      checkOut
    });
    const priced = pricedStay(nightly, nights, restriction.multiplier);
    setDispatchModalData({
      unit,
      unit_id: unit.id,
      check_in_date: dateStr,
      nights_count: nights,
      guest_phone: '0548076123',
      adults_count: 2,
      children_count: 0,
      baby_cot_required: false,
      payment_mode: 'CREDIT_DEPOSIT',
      hyp_terminal: 'B',
      modalTab: 'dispatch',
      custom_nightly_rate: priced.nightlyIls,
      total_price_ils: priced.totalIls,
      deposit_ils: priced.depositIls
    });
  };

  const buildEditFormData = (booking) => ({
    id: booking.id,
    unit_id: booking.unit_id,
    guest_name: booking.guest_name || '',
    guest_phone: booking.guest_phone || '',
    guest_email: booking.guest_email || '',
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    adults_count: booking.adults_count || 2,
    children_count: booking.children_count || 0,
    total_price_ils: Math.round((booking.total_price_agorot || 0) / 100),
    deposit_ils: Math.round((booking.deposit_agorot || 0) / 100),
    custom_nightly_rate: booking.stay?.custom_nightly_rate_ils
      || nightlyFromTotalIls(
        Math.round((booking.total_price_agorot || 0) / 100),
        getDaysDiff(booking.check_in_date, booking.check_out_date)
      ),
    payment_status: booking.payment_status || 'UNPAID',
    channel_source: booking.channel_source || 'DIRECT'
  });

  // 2. EXISTING BOOKING CLICK -> Open Existing Booking Details & Edit Modal
  const handleBookingClick = (booking, e) => {
    e.stopPropagation();
    setIsEditingBookingDetails(false);
    setPayDetailsOpen(false);
    setEditingBooking(booking);
    setEditFormData(buildEditFormData(booking));
    setLinkHypTerminal(
      normalizeHypTerminal(booking.hyp_terminal || booking.stay?.hyp_terminal, booking.payment_mode)
    );
    const existingProof = booking?.stay?.payment_proof || '';
    setPaymentProofUrl(existingProof.startsWith('data:image/') ? existingProof : '');
    setCashForm({
      method: 'CASH',
      amount: '',
      collector: sessionUser?.display_name || sessionUser?.username || '',
      ref: '',
      terminal: normalizeHypTerminal(booking.hyp_terminal || booking.stay?.hyp_terminal, booking.payment_mode),
      at: israelToday()
    });
    const needsGuestPull = hasPublicGuestMailbox(booking)
      && booking.booking_status !== 'CANCELED';
    if (needsGuestPull) {
      setPaymentProofBusy(true);
      refreshBookingFromGuestMailbox(booking)
        .then((next) => {
          if (!next?.id) return;
          setEditingBooking(next);
          setEditFormData(buildEditFormData(next));
          const proof = next?.stay?.payment_proof || '';
          if (proof.startsWith('data:image/')) setPaymentProofUrl(proof);
        })
        .catch(() => {})
        .finally(() => setPaymentProofBusy(false));
    }
  };

  // 3. DATE HEADER CLICK -> Open Daily Summary Modal
  const openDaySummaryModal = (dateStr) => {
    const activeUnitsCount = units.length || 4;
    let occupiedCount = 0;
    let checkIns = [];
    let checkOuts = [];

    rawBookings.forEach(b => {
      if (b.deleted_at || b.booking_status === 'CANCELED') return;

      if (dateStr >= b.check_in_date && dateStr < b.check_out_date && b.booking_status !== 'CHECKED_OUT') {
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

  const openDutyReport = (dateStr = defaultReportDate()) => {
    setDutyReportDate(dateStr);
    setDutyReportOpen(true);
  };

  const runDutyReport = (kind) => {
    printDailyDutyReport({
      dateStr: dutyReportDate,
      kind,
      area: dutyReportArea,
      bookings: rawBookings,
      units
    });
  };

  const dutyReportCounts = useMemo(
    () => (dutyReportOpen ? dailyDutyCounts(rawBookings, units, dutyReportDate, dutyReportArea) : { checkouts: 0, checkins: 0, occupying: 0 }),
    [dutyReportOpen, rawBookings, units, dutyReportDate, dutyReportArea]
  );

  // WhatsApp Dispatch Submission
  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    const channel = e.nativeEvent?.submitter?.value || 'whatsapp';
    if (!dispatchModalData) return;
    if (dispatchModalData.check_in_date < todayStr) return;

    const unit = rawUnits.find(u => u.id === dispatchModalData.unit_id);
    const unitName = unit ? whatsAppUnitName(unit, t) : t('UNIT');

    const checkOutDate = formatDate(addDays(new Date(`${dispatchModalData.check_in_date}T00:00:00`), dispatchModalData.nights_count));
    const restriction = restrictionBlock(restrictions, unit, dispatchModalData.check_in_date, checkOutDate);
    if (!restriction) return;
    const nightly = Number(dispatchModalData.custom_nightly_rate ?? nightlyIlsFromUnit(unit));
    const totalPriceIls = canSeePayments
      ? Number(dispatchModalData.total_price_ils ?? pricedStay(nightly, dispatchModalData.nights_count, restriction.multiplier).totalIls)
      : pricedStay(nightlyIlsFromUnit(unit), dispatchModalData.nights_count, restriction.multiplier).totalIls;
    const depositIls = Number(dispatchModalData.deposit_ils || depositIlsFromTotal(totalPriceIls));

    const conflict = findOverlappingBooking(
      rawBookings,
      dispatchModalData.unit_id,
      dispatchModalData.check_in_date,
      checkOutDate
    );
    if (conflict) {
      window.alert('היחידה כבר תפוסה בתאריכים האלה. אי אפשר לפתוח הזמנה כפולה.');
      return;
    }
    const hold = findOverlappingAgentLock(agentLocks, dispatchModalData.unit_id, dispatchModalData.check_in_date, checkOutDate);
    if (hold) {
      window.alert(agentLockLabel(hold));
      return;
    }

    const now = new Date();
    const token = createCheckoutToken();
    const sentAt = now.toISOString();
    const adultsCount = Math.max(1, Number(dispatchModalData.adults_count) || 2);
    const childrenCount = Math.max(0, Number(dispatchModalData.children_count) || 0);

    const pendingBooking = {
      id: 'b_' + Date.now(),
      tenant_id: tenantId,
      unit_id: dispatchModalData.unit_id,
      guest_name: 'הזמנה בטיפול (WhatsApp)',
      guest_phone: dispatchModalData.guest_phone,
      check_in_date: dispatchModalData.check_in_date,
      check_out_date: checkOutDate,
      adults_count: adultsCount,
      children_count: childrenCount,
      total_price_agorot: ilsToAgorot(totalPriceIls),
      deposit_agorot: ilsToAgorot(depositIls),
      booking_status: 'PENDING',
      payment_status: 'UNPAID',
      payment_mode: dispatchModalData.payment_mode,
      hyp_terminal: dispatchModalData.payment_mode === 'CASH_TRUST'
        ? null
        : normalizeHypTerminal(dispatchModalData.hyp_terminal, dispatchModalData.payment_mode),
      channel_source: 'DIRECT',
      checkout_token: token,
      created_at: sentAt,
      updated_at: sentAt,
      version: 1,
      stay: {
        cabin_ready: false,
        folio: [],
        checkout_time: '11:00',
        custom_nightly_rate_ils: nightly,
        baby_cot_required: Boolean(dispatchModalData.baby_cot_required),
        link_sent_at: sentAt,
        hyp_terminal: dispatchModalData.payment_mode === 'CASH_TRUST'
          ? null
          : normalizeHypTerminal(dispatchModalData.hyp_terminal, dispatchModalData.payment_mode)
      }
    };
    pendingBooking.expires_at = stayExpiresAt(pendingBooking);

    await db.bookings.put(pendingBooking);
    await pushBookingToCloud(pendingBooking);
    try {
      await publishGuestMailbox(pendingBooking);
    } catch (_) {
      window.alert('ההזמנה נשמרה אצלנו, אבל קישור האורח לא עלה לשרת. לא נשלח וואטסאפ — נסו שוב בעוד רגע.');
      return;
    }

    const checkoutUrl = guestStayUrl(token);
    const stayText = initialGuestWhatsAppText({
      unitName,
      checkInDate: dispatchModalData.check_in_date,
      checkoutUrl
    });
    if (channel === 'sms') {
      try {
        await sendStaffSms({
          phone: dispatchModalData.guest_phone,
          message: guestStaySmsText({
            unitName,
            checkInDate: dispatchModalData.check_in_date,
            checkoutUrl
          })
        });
      } catch (err) {
        window.alert(smsErrorText(err));
        return;
      }
    } else {
      const formattedPhone = toWhatsAppPhone(dispatchModalData.guest_phone);
      openWhatsAppChat(formattedPhone, encodeURIComponent(stayText));
    }
    setDispatchModalData(null);
  };

  // Submit New Reservation
  const handleNewReservationSubmit = async (e) => {
    e.preventDefault();
    if (newFormData.check_out_date <= newFormData.check_in_date) {
      window.alert('תאריך יציאה חייב להיות אחרי תאריך כניסה.');
      return;
    }
    const newUnit = rawUnits.find((row) => row.id === newFormData.unit_id);
    if (!restrictionBlock(restrictions, newUnit || newFormData.unit_id, newFormData.check_in_date, newFormData.check_out_date)) {
      return;
    }
    const conflict = findOverlappingBooking(
      rawBookings,
      newFormData.unit_id,
      newFormData.check_in_date,
      newFormData.check_out_date
    );
    if (conflict) {
      window.alert('היחידה כבר תפוסה בתאריכים האלה. אי אפשר לפתוח הזמנה כפולה.');
      return;
    }
    const hold = findOverlappingAgentLock(agentLocks, newFormData.unit_id, newFormData.check_in_date, newFormData.check_out_date);
    if (hold) {
      window.alert(agentLockLabel(hold));
      return;
    }
    const totalPriceAgorot = ilsToAgorot(newFormData.total_price_ils);
    const depositAgorot = ilsToAgorot(newFormData.deposit_ils);
    const token = createCheckoutToken();
    const nowIso = new Date().toISOString();
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
      checkout_token: token,
      stay: {
        custom_nightly_rate_ils: Number(newFormData.custom_nightly_rate || 0)
      },
      created_at: nowIso,
      updated_at: nowIso,
      version: 1
    };
    newBookingRecord.expires_at = stayExpiresAt(newBookingRecord);

    await db.bookings.put(newBookingRecord);
    await pushBookingToCloud(newBookingRecord);
    try {
      await publishGuestMailbox(newBookingRecord);
    } catch (_) {
      window.alert('ההזמנה נשמרה ביומן, אבל קישור האורח לא עלה לשרת. שלחו שוב את הקישור מהכרטיס.');
    }
    setIsNewModalOpen(false);
  };

  // Submit Edit Reservation
  const handleEditReservationSubmit = async (e) => {
    e.preventDefault();
    if (!editFormData) return;

    if (editFormData.check_out_date <= editFormData.check_in_date) {
      window.alert('תאריך יציאה חייב להיות אחרי תאריך כניסה.');
      return;
    }
    const editUnit = rawUnits.find((row) => row.id === editFormData.unit_id);
    if (!restrictionBlock(restrictions, editUnit || editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date)) {
      return;
    }
    const conflict = findOverlappingBooking(
      rawBookings,
      editFormData.unit_id,
      editFormData.check_in_date,
      editFormData.check_out_date,
      editingBooking.id
    );
    if (conflict) {
      window.alert('היחידה כבר תפוסה בתאריכים האלה. אי אפשר לשמור הזמנה כפולה.');
      return;
    }
    const hold = findOverlappingAgentLock(agentLocks, editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date);
    if (hold) {
      window.alert(agentLockLabel(hold));
      return;
    }

    const totalPriceAgorot = ilsToAgorot(editFormData.total_price_ils);
    const depositAgorot = ilsToAgorot(editFormData.deposit_ils);

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
      stay: {
        ...(editingBooking.stay || {}),
        custom_nightly_rate_ils: Number(editFormData.custom_nightly_rate || 0)
      },
      updated_at: new Date().toISOString()
    };

    await db.bookings.put(updatedBooking);
    await pushBookingToCloud(updatedBooking);
    await publishGuestMailbox(updatedBooking).catch(() => {});
    setIsEditingBookingDetails(false);
    setEditingBooking(null);
    setEditFormData(null);
  };

  const sendInitialGuestLink = async (channel = 'whatsapp') => {
    if (!editingBooking || sendingGuestLink) return;
    const rawPhone = editFormData?.guest_phone || editingBooking.guest_phone;
    const phone = toWhatsAppPhone(rawPhone);
    if (channel !== 'sms' && !phone) {
      window.alert('חסר מספר WhatsApp לאורח.');
      return;
    }
    if (channel === 'sms' && !rawPhone) {
      window.alert('חסר מספר טלפון לאורח.');
      return;
    }
    if (editingBooking.booking_status === 'CANCELED') {
      window.alert('אי אפשר לשלוח קישור להזמנה מבוטלת.');
      return;
    }

    const unitId = editFormData?.unit_id || editingBooking.unit_id;
    const unit = rawUnits.find((u) => u.id === unitId);
    const unitName = unit ? whatsAppUnitName(unit, t) : t('UNIT');
    const checkInDate = editFormData?.check_in_date || editingBooking.check_in_date;

    setSendingGuestLink(true);
    try {
      const token = editingBooking.checkout_token || createCheckoutToken();
      const lockedTerminal = normalizeHypTerminal(
        editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal,
        editingBooking.payment_mode
      );
      const chosenTerminal = editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal
        ? lockedTerminal
        : normalizeHypTerminal(linkHypTerminal, editingBooking.payment_mode);
      const nextBooking = {
        ...editingBooking,
        guest_name: editFormData?.guest_name || editingBooking.guest_name,
        guest_phone: editFormData?.guest_phone || editingBooking.guest_phone,
        unit_id: unitId,
        check_in_date: checkInDate,
        check_out_date: editFormData?.check_out_date || editingBooking.check_out_date,
        total_price_agorot: Number(editFormData?.total_price_ils || 0) > 0
          ? ilsToAgorot(editFormData.total_price_ils)
          : editingBooking.total_price_agorot,
        deposit_agorot: Number(editFormData?.deposit_ils || 0) >= 0 && editFormData?.deposit_ils !== '' && editFormData?.deposit_ils != null
          ? ilsToAgorot(editFormData.deposit_ils)
          : editingBooking.deposit_agorot,
        hyp_terminal: editingBooking.payment_mode === 'CASH_TRUST' ? null : chosenTerminal,
        stay: {
          ...(editingBooking.stay || {}),
          hyp_terminal: editingBooking.payment_mode === 'CASH_TRUST' ? null : chosenTerminal
        },
        checkout_token: token,
        expires_at: stayExpiresAt({
          ...editingBooking,
          check_out_date: editFormData?.check_out_date || editingBooking.check_out_date
        }),
        updated_at: new Date().toISOString()
      };
      await db.bookings.put(nextBooking);
      await pushBookingToCloud(nextBooking);
      await publishGuestMailbox(nextBooking);
      setEditingBooking(nextBooking);
      const checkoutUrl = guestStayUrl(token);
      if (channel === 'sms') {
        await sendStaffSms({
          phone: rawPhone,
          message: guestStaySmsText({ unitName, checkInDate, checkoutUrl })
        });
        window.alert('הסמס נשלח.');
      } else {
        openWhatsAppChat(
          phone,
          encodeURIComponent(
            initialGuestWhatsAppText({
              unitName,
              checkInDate,
              checkoutUrl
            })
          )
        );
      }
    } catch (err) {
      window.alert(channel === 'sms'
        ? smsErrorText(err)
        : 'לא הצלחנו להעלות את קישור האורח לשרת. לא נשלח וואטסאפ — נסו שוב.');
    } finally {
      setSendingGuestLink(false);
    }
  };

  const startEditCardCharge = async () => {
    if (!editingBooking || chargingCard || sendingGuestLink) return;
    if (editingBooking.booking_status === 'CANCELED') {
      window.alert('אי אפשר לחייב הזמנה מבוטלת.');
      return;
    }
    const unitId = editFormData?.unit_id || editingBooking.unit_id;
    const token = editingBooking.checkout_token || createCheckoutToken();
    const lockedTerminal = normalizeHypTerminal(
      editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal,
      editingBooking.payment_mode
    );
    const chosenTerminal = editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal
      ? lockedTerminal
      : normalizeHypTerminal(linkHypTerminal, editingBooking.payment_mode);
    const nextBooking = {
      ...editingBooking,
      guest_name: editFormData?.guest_name || editingBooking.guest_name,
      guest_phone: editFormData?.guest_phone || editingBooking.guest_phone,
      guest_email: editFormData?.guest_email || editingBooking.guest_email,
      unit_id: unitId,
      check_in_date: editFormData?.check_in_date || editingBooking.check_in_date,
      check_out_date: editFormData?.check_out_date || editingBooking.check_out_date,
      total_price_agorot: Number(editFormData?.total_price_ils || 0) > 0
        ? ilsToAgorot(editFormData.total_price_ils)
        : editingBooking.total_price_agorot,
      deposit_agorot: Number(editFormData?.deposit_ils || 0) > 0
        ? ilsToAgorot(editFormData.deposit_ils)
        : editingBooking.deposit_agorot,
      hyp_terminal: editingBooking.payment_mode === 'CASH_TRUST' ? null : chosenTerminal,
      stay: {
        ...(editingBooking.stay || {}),
        hyp_terminal: editingBooking.payment_mode === 'CASH_TRUST' ? null : chosenTerminal
      },
      checkout_token: token,
      expires_at: stayExpiresAt({
        ...editingBooking,
        check_out_date: editFormData?.check_out_date || editingBooking.check_out_date
      }),
      updated_at: new Date().toISOString()
    };
    setChargingCard(true);
    try {
      await db.bookings.put(nextBooking);
      await pushBookingToCloud(nextBooking);
      const started = await startHostCardCharge(nextBooking);
      setEditingBooking({ ...nextBooking, ...(started.booking || {}) });
      window.open(started.payUrl, '_blank', 'noopener');
    } catch (_) {
      window.alert('לא הצלחנו לפתוח חיוב אשראי. בדקו שהקישור עלה לשרת ונסו שוב.');
    } finally {
      setChargingCard(false);
    }
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
      await persistBooking(canceledBooking);
      setIsEditingBookingDetails(false);
      setEditingBooking(null);
      setEditFormData(null);
    }
  };

  const persistBooking = async (next) => {
    await db.bookings.put(next);
    if (editingBooking?.id === next.id) {
      setEditingBooking(next);
      setEditFormData(buildEditFormData(next));
    }
    void pushBookingToCloud(next, { allowOverlap: true }).catch(() => {});
    void publishGuestMailbox(next).catch(() => {});
  };

  const recordManualPayment = async () => {
    if (!editingBooking || cashBusy) return;
    const method = cashForm.method === 'CARD' || cashForm.method === 'BANK' ? cashForm.method : 'CASH';
    const amountIls = Number(cashForm.amount);
    if (!Number.isFinite(amountIls) || amountIls <= 0) {
      window.alert('הזינו סכום שהתקבל.');
      return;
    }
    const collector = String(cashForm.collector || '').trim();
    const ref = String(cashForm.ref || '').trim();
    if (method === 'CASH' && !collector) {
      window.alert('מי גבה את המזומן?');
      return;
    }
    if (method !== 'CASH' && !ref) {
      window.alert(method === 'CARD' ? 'הזינו אסמכתת סליקה / מספר אישור.' : 'הזינו אסמכתת העברה.');
      return;
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(cashForm.at) ? cashForm.at : israelToday();
    const collectedAt = `${date}T12:00:00`;
    const hyp = method === 'CARD'
      ? hypAccountOf(cashForm.terminal === 'A' ? HYP_TERMINAL_A : HYP_TERMINAL_B)
      : null;
    const payment = method === 'CARD'
      ? {
          source: 'HYP',
          accountKey: hyp.key,
          accountLabel: hyp.label,
          terminalId: hyp.terminalId,
          amount_agorot: Math.round(amountIls * 100),
          date,
          ref,
          collector,
          collected_at: collectedAt,
          txn: `manual_hyp_${Date.now()}`
        }
      : method === 'BANK'
        ? {
            source: 'BANK',
            accountKey: 'BANK',
            amount_agorot: Math.round(amountIls * 100),
            date,
            ref,
            collector,
            collected_at: collectedAt,
            txn: `manual_bank_${Date.now()}`
          }
        : {
            source: 'CASH',
            accountKey: 'CASH',
            amount_agorot: Math.round(amountIls * 100),
            date,
            collector,
            collected_at: collectedAt,
            txn: `cash_${Date.now()}`
          };
    const nextPayments = mergeClearingPayments(editingBooking.clearing_payments, payment);
    const nextMode = editingBooking.payment_mode
      || (method === 'CARD' ? 'CARD' : method === 'BANK' ? 'BANK_TRANSFER' : 'CASH');
    const next = {
      ...editingBooking,
      clearing_payments: nextPayments,
      payment_mode: nextMode,
      updated_at: new Date().toISOString()
    };
    next.payment_status = paymentStatusAfterPaid(next.total_price_agorot, recordedPaidAgorot(next));
    const checkedIn = applyAutoCheckin(next) || next;
    setCashBusy(true);
    try {
      await persistBooking(checkedIn);
      setCashForm((prev) => ({ ...prev, amount: '', ref: '' }));
    } finally {
      setCashBusy(false);
    }
  };

  const approveBankTransfer = async () => {
    if (!editingBooking || cashBusy) return;
    const dueIls = Math.max(1, Math.round(dueAgorotOf(editingBooking) / 100));
    const date = israelToday();
    const payment = {
      source: 'BANK',
      accountKey: 'BANK',
      amount_agorot: Math.round(dueIls * 100),
      date,
      ref: 'צילום אורח',
      collector: sessionUser?.display_name || sessionUser?.username || '',
      collected_at: `${date}T12:00:00`,
      txn: `manual_bank_${Date.now()}`
    };
    const nextPayments = mergeClearingPayments(editingBooking.clearing_payments, payment);
    const next = {
      ...editingBooking,
      clearing_payments: nextPayments,
      payment_mode: editingBooking.payment_mode || 'BANK_TRANSFER',
      updated_at: new Date().toISOString()
    };
    next.payment_status = paymentStatusAfterPaid(next.total_price_agorot, recordedPaidAgorot(next));
    const checkedIn = applyAutoCheckin(next) || next;
    setCashBusy(true);
    try {
      await persistBooking(checkedIn);
    } finally {
      setCashBusy(false);
    }
  };

  const handleStaffCheckin = async () => {
    if (!editingBooking) return;
    if (!isFullyPaid(editingBooking)) {
      const due = Math.round(dueAgorotOf(editingBooking) / 100);
      window.alert(due > 0
        ? `אי אפשר לאשר כניסה לחדר. יתרה לתשלום ₪${due.toLocaleString('he-IL')}.`
        : 'אי אפשר לאשר כניסה לחדר לפני שכל הסכום שולם.');
      return;
    }
    await persistBooking({
      ...editingBooking,
      booking_status: 'CHECKED_IN',
      payment_status: 'PAID',
      stay: {
        ...(editingBooking.stay || {}),
        guest_checked_in_at: editingBooking.stay?.guest_checked_in_at || new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    });
  };

  const markCheckedOut = (booking, nowIso = new Date().toISOString()) => {
    const stay = booking.stay && typeof booking.stay === 'object' ? booking.stay : {};
    return {
      ...booking,
      booking_status: 'CHECKED_OUT',
      stay: { ...stay, manager_checked_out_at: nowIso },
      updated_at: nowIso
    };
  };

  const markUnitsDirty = async (bookings, { skipStayPublish = true } = {}) => {
    const unitIds = [...new Set((bookings || []).map((booking) => booking.unit_id).filter(Boolean))];
    await Promise.all(unitIds.map(async (unitId) => {
      const unit = rawUnits.find((row) => row.id === unitId) || await db.units.get(unitId);
      await openTurnoverAfterCheckout({ tenantId, unit, pushUnitToCloud, skipStayPublish });
    }));
  };

  const closeOpsSheet = () => {
    opsReopenGuard.current = Date.now() + 1200;
    setOpsUnitId(null);
    setOpsStatusBusy(false);
  };

  const openOpsSheet = (unitId) => {
    if (Date.now() < opsReopenGuard.current) return;
    setOpsUnitId(unitId);
  };

  const pushOpsQuiet = (patch, options) => pushUnitToCloud(patch, { ...options, skipStayPublish: true });

  const applyUnitOpsFromSheet = async (status) => {
    const unit = units.find((row) => row.id === opsUnitId) || rawUnits.find((row) => row.id === opsUnitId);
    if (!unit || opsStatusBusy) return;
    closeOpsSheet();
    await applyCalendarUnitStatus({ tenantId, unit, status, pushUnitToCloud: pushOpsQuiet });
  };

  const applyOccupancyFromSheet = async (occupancy) => {
    const unit = units.find((row) => row.id === opsUnitId) || rawUnits.find((row) => row.id === opsUnitId);
    if (!unit || opsStatusBusy) return;
    closeOpsSheet();
    await applyCalendarOccupancy({ tenantId, unit, occupancy, pushUnitToCloud: pushOpsQuiet });
    if (occupancy !== 'VACANT') return;
    const covering = bookingsMarkingNight(rawBookings, unit.id, todayStr);
    await Promise.all(covering.map(async (booking) => {
      const vacated = vacateBookingOnDate(booking, todayStr);
      const next = {
        ...vacated,
        expires_at: stayExpiresAt(vacated)
      };
      await db.bookings.put(next);
      void pushBookingToCloud(next, { allowOverlap: true }).catch(() => {});
      void publishGuestMailbox(next).catch(() => {});
    }));
  };

  const checkoutBooking = async (booking) => {
    if (!booking) return;
    const next = markCheckedOut(booking);
    await persistBooking(next);
    await markUnitsDirty([next]);
  };

  const handleManagerCheckout = async (booking) => {
    if (!booking || dutyBusyId) return;
    if (!window.confirm(`לבצע צ׳ק־אאוט ל${booking.guest_name || 'אורח'}? היחידה תעבור לניקיון.`)) return;
    setDutyBusyId(booking.id);
    try {
      await checkoutBooking(booking);
    } finally {
      setDutyBusyId(null);
    }
  };

  const toggleDutySelected = (bookingId) => {
    setDutySelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  };

  const selectAllDuty = () => {
    setDutySelectedIds(new Set(overdueCheckouts.map((booking) => booking.id)));
  };

  const handleBulkCheckout = async () => {
    if (dutyBusyId) return;
    const chosen = overdueCheckouts.filter((booking) => dutySelectedIds.has(booking.id));
    if (!chosen.length) return;
    const label = chosen.length === 1
      ? `לבצע צ׳ק־אאוט ל${chosen[0].guest_name || 'אורח'}? היחידה תעבור לניקיון.`
      : `לסמן שכולם יצאו? יבוצע צ׳ק־אאוט ל־${chosen.length} יחידות, וכולן יעברו לניקיון.`;
    if (!window.confirm(label)) return;
    setDutyBusyId('__all__');
    const nexts = chosen.map((booking) => markCheckedOut(booking));
    try {
      await db.bookings.bulkPut(nexts);
      await pushBookingsToCloud(nexts);
      await markUnitsDirty(nexts);
    } finally {
      setDutyBusyId(null);
    }
  };

  const handleExtendStay = async (booking) => {
    if (!booking || dutyBusyId) return;
    const result = canExtendStay(rawBookings, booking);
    if (!result.ok) {
      window.alert(result.reason);
      return;
    }
    setDutyBusyId(booking.id);
    try {
      await persistBooking({
        ...booking,
        check_out_date: result.checkOut,
        expires_at: stayExpiresAt({ ...booking, check_out_date: result.checkOut }),
        updated_at: new Date().toISOString()
      });
    } finally {
      setDutyBusyId(null);
    }
  };

  // Payment Status Badge Styling (edit modal only — cards use a tiny corner icon)
  const getPaymentBadge = (booking) => {
    const status = booking?.payment_status;
    const mode = booking?.payment_mode;
    const settlement = kinorotSettlementKind(booking);
    if (settlement === 'voucher') {
      return { label: 'שובר נפדה', bg: 'rgba(16, 185, 129, 0.18)', color: '#10B981', border: '#10B981' };
    }
    if (settlement === 'comp') {
      return { label: 'ללא תשלום', bg: 'rgba(14, 165, 233, 0.16)', color: '#0284C7', border: '#0EA5E9' };
    }
    if (isFullyPaid(booking)) {
      const modeLabel = mode === 'CASH' ? ' · מזומן' : mode === 'BANK_TRANSFER' ? ' · העברה' : mode === 'CARD' ? ' · אשראי' : '';
      return { label: `שולם מלא${modeLabel}`, bg: 'rgba(16, 185, 129, 0.18)', color: '#10B981', border: '#10B981' };
    }
    if (depositActuallyPaid(booking) || status === 'DEPOSIT_PAID') {
      return { label: 'מקדמה שולמה', bg: 'rgba(16, 185, 129, 0.16)', color: '#059669', border: '#10B981' };
    }
    if (booking?.booking_status === 'PENDING') {
      return { label: 'ממתין לתשלום', bg: 'rgba(245, 158, 11, 0.18)', color: '#F59E0B', border: '#F59E0B' };
    }
    if (status === 'PENDING_CASH') {
      return { label: 'ממתין למזומן', bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: '#10B981' };
    }
    if (status === 'PENDING_BANK' || awaitingBankReview(booking)) {
      return { label: 'ממתין לבדיקת העברה', bg: 'rgba(249, 115, 22, 0.18)', color: '#EA580C', border: '#F97316' };
    }
    return { label: 'לא שולם', bg: 'rgba(239, 68, 68, 0.18)', color: '#EF4444', border: '#EF4444' };
  };

  const stayFrameColor = (booking) => {
    const tone = stayCardTone(booking, { today: todayStr });
    if (tone === 'inhouse') return '#8B5CF6';
    if (tone === 'paid') return '#22C55E';
    if (tone === 'bank') return '#F97316';
    return '#EF4444';
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
        padding: '0.75rem 0.5rem 0.5rem 0.5rem',
        marginTop: 0,
        borderRadius: '16px',
        boxShadow: themeStyles.shadow,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: opsUnitId ? 'none' : 'auto'
      }}
    >


      {overdueCheckouts.length > 0 && !dutyOpen ? (
        <button
          type="button"
          onClick={() => { setCheckoutDutyDismissedToday(false); setDutyDismissed(false); setDutyOpen(true); }}
          style={{
            width: '100%',
            marginBottom: '0.75rem',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#FBBF24',
            borderRadius: '12px',
            padding: '0.65rem 0.8rem',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer'
          }}
        >
          <Clock size={16} />
          {overdueCheckouts.length} אורחים לא ביצעו צ׳ק־אאוט — לטיפול
        </button>
      ) : null}

      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '0.5rem',
        marginBottom: '0.55rem',
        flexWrap: 'wrap'
      }}>
        <div style={{
          display: 'flex',
          flex: 1,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '0.35rem'
        }}>
          {BOARD_AREA_FILTERS.map((area) => {
            const active = boardArea === area.id;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  setBoardArea(area.id);
                  try { localStorage.setItem('resortos-board-area', area.id); } catch (_) {}
                }}
                style={{
                  ...buttonStyle,
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.78rem',
                  fontWeight: active ? 800 : 600,
                  background: active
                    ? (isLight ? '#312E81' : '#4F46E5')
                    : (isLight ? '#FFFFFF' : '#1E293B'),
                  color: active ? '#F8FAFC' : themeStyles.textPrimary,
                  border: active
                    ? '1px solid transparent'
                    : `1px solid ${themeStyles.inputBorder}`
                }}
              >
                {area.label}
              </button>
            );
          })}
        </div>
        {agentLocksError ? (
          <div
            title="הלוח המקומי לא מצליח למשוך נעילות סוכן מהענן. אל תניחו שחדר פנוי בטלפון בלי לבדוק."
            style={{
              ...buttonStyle,
              cursor: 'default',
              background: isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.16)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: isLight ? '#B91C1C' : '#FCA5A5'
            }}
          >
            נעילות סוכן לא זמינות
          </div>
        ) : agentLocks.length ? (
          <div
            title="חדר שנעול אצל סוכן במסך תשלום — לא לפתוח הזמנה בטלפון"
            style={{
              ...buttonStyle,
              cursor: 'default',
              background: isLight ? 'rgba(249, 115, 22, 0.12)' : 'rgba(249, 115, 22, 0.18)',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              color: isLight ? '#C2410C' : '#FDBA74'
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: '#F97316',
              boxShadow: '0 0 0 3px rgba(249, 115, 22, 0.25)'
            }} />
            נעול ע״י סוכן · ממתין לתשלום
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => openDutyReport()}
          style={{
            ...buttonStyle,
            background: isLight ? '#FFFFFF' : '#1E293B',
            border: `1px solid ${themeStyles.inputBorder}`
          }}
        >
          <Printer size={15} />
          דוח יומי
        </button>
        {boardSync.ok === false || (boardSync.count === 0 && !(rawBookings || []).some(isPaintedStay)) ? (
          <button
            type="button"
            onClick={() => {
              syncCloudBookingsToDexie(tenantId, { from: calendarStartStr, to: calendarEndStr })
                .then((pulled) => setBoardSync({ ok: pulled?.ok !== false, count: Number(pulled?.count) || 0 }))
                .catch(() => setBoardSync({ ok: false, count: 0 }));
            }}
            style={{
              ...buttonStyle,
              background: '#FEE2E2',
              color: '#991B1B',
              border: '1px solid #FECACA'
            }}
          >
            היומן לא נטען · נסו שוב
          </button>
        ) : null}
      </div>

      {/* MAIN GRID DASHBOARD - native 2D scroll (trackpad / mouse) */}
      <div 
        ref={scrollContainerRef}
        className="hotelos-calendar-scroll"
        tabIndex={0}
        onMouseDown={(event) => {
          if (event.target.closest('button, input, textarea, select, a')) return;
          scrollContainerRef.current?.focus({ preventScroll: true });
        }}
        style={{ 
          borderRadius: '12px', 
          border: `1px solid ${themeStyles.cellBorder}`
        }}
      >
        <div
          className="hotelos-calendar-board"
          style={{
            position: 'relative',
            width: `${UNIT_COL_PX + daysCount * CELL_PX}px`,
            minWidth: `${UNIT_COL_PX + daysCount * CELL_PX}px`
          }}
        >
          <div
            className="hotelos-calendar-header"
            style={{
              display: 'grid',
              gridTemplateColumns: `${UNIT_COL_PX}px repeat(${daysCount}, ${CELL_PX}px)`,
              width: '100%',
              height: HEADER_H,
              position: 'sticky',
              top: 0,
              zIndex: 40
            }}
          >
          {/* STICKY TOP RIGHT CORNER HEADER */}
          <div className="hotelos-calendar-unit-col" style={{
            position: 'sticky',
            insetInlineStart: 0,
            zIndex: 40,
            height: HEADER_H,
            background: themeStyles.gridHeaderBg,
            padding: '0.1rem 0.2rem',
            fontWeight: 800,
            fontSize: '0.62rem',
            borderBottom: `1px solid ${themeStyles.cellBorder}`,
            borderLeft: `1.5px solid ${themeStyles.cellBorder}`,
            boxShadow: isLight ? '-1px 0 0 rgba(0,0,0,0.08)' : '-1px 0 0 rgba(255,255,255,0.08)',
            color: themeStyles.textMuted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'nowrap'
          }}>
            יחידות ({boardUnits.length})
          </div>

          {/* DATE COLUMNS HEADER (CLICKABLE FOR DAILY SUMMARY) */}
          {dateColumns.map(col => (
            <div
              key={col.dateStr}
              data-today-col={col.isToday ? 'true' : undefined}
              onClick={() => openDaySummaryModal(col.dateStr)}
              title="לחץ לסיכום נתוני יום"
              style={{
                height: HEADER_H,
                boxSizing: 'border-box',
                background: col.isToday 
                  ? (isLight ? '#EEF2FF' : '#312E81') 
                  : themeStyles.gridHeaderBg,
                padding: '0.15rem 0.2rem',
                textAlign: 'center',
                borderBottom: `1px solid ${themeStyles.cellBorder}`,
                borderLeft: `1px solid ${themeStyles.cellBorder}`,
                color: col.isToday ? '#818CF8' : (col.isPast ? themeStyles.textMuted : (col.isWeekend ? '#F59E0B' : themeStyles.textPrimary)),
                cursor: 'pointer',
                opacity: col.isPast ? 0.72 : 1
              }}
            >
              {col.isToday ? (
                <span
                  className="hotelos-now-tick"
                  style={{ right: nowLineRight }}
                  title={nowLineLabel}
                />
              ) : null}
              <div style={{ fontSize: '0.62rem', fontWeight: 600, opacity: 0.8, lineHeight: 1.1 }}>{col.dayName}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.1 }}>{col.formattedDate}</div>
            </div>
          ))}
          </div>

          {/* UNIT ROWS & BOOKING CARDS */}
          {boardUnits.map(unit => {
            const fullUnitName = t(unit.id + '_name', unit.name);
            const { primary: unitPrefix, secondary: unitDetail } = unitCalendarLines(fullUnitName);
            const ops = unitDisplayStatus(unit, rawBookings, todayStr, dutyNow);
            const cube = unitNameFrame(ops.key, isLight);

            return (
              <div
                key={unit.id}
                className="hotelos-calendar-unit-row"
                style={{
                  position: 'relative',
                  overflow: 'visible',
                  width: `${UNIT_COL_PX + daysCount * CELL_PX}px`,
                  minHeight: `${UNIT_ROW_PX}px`
                }}
              >
                <div
                  className="hotelos-calendar-unit-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${UNIT_COL_PX}px repeat(${daysCount}, ${CELL_PX}px)`,
                    width: '100%',
                    minHeight: `${UNIT_ROW_PX}px`
                  }}
                >
                {/* STICKY UNIT NAME CELL - ULTRA COMPACT 80px FLUSH RIGHT */}
                <div
                  role="button"
                  tabIndex={0}
                  title="לחץ לשינוי סטטוס תפעול"
                  onClick={(event) => {
                    event.stopPropagation();
                    openOpsSheet(unit.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openOpsSheet(unit.id);
                    }
                  }}
                  className="hotelos-calendar-unit-col"
                  style={{
                  backgroundColor: cube.bg,
                  background: cube.bg,
                  opacity: 1,
                  zIndex: 80,
                  padding: '0.1rem 0.12rem',
                  borderBottom: `1px solid ${cube.border}`,
                  borderLeft: `1.5px solid ${cube.border}`,
                  boxShadow: `-12px 0 0 ${cube.bg}, 8px 0 0 ${cube.bg}, -1px 0 0 ${cube.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  width: `${UNIT_COL_PX}px`,
                  height: `${UNIT_ROW_PX}px`,
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  pointerEvents: 'auto'
                }}>
                  {unitPrefix ? (
                    <div style={{
                      fontWeight: 800,
                      fontSize: '0.62rem',
                      lineHeight: 1,
                      color: cube?.prefix || themeStyles.textPrimary,
                      opacity: 1,
                      maxWidth: `${UNIT_COL_PX - 8}px`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {unitPrefix}
                    </div>
                  ) : null}
                  {unitDetail ? (
                  <div style={{
                    fontWeight: 800,
                    fontSize: '0.58rem',
                    lineHeight: 1,
                    color: cube?.name || themeStyles.textPrimary,
                    opacity: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: `${UNIT_COL_PX - 8}px`
                  }}>
                    {unitDetail}
                  </div>
                  ) : null}
                </div>

                {/* DAY CELLS GRID */}
                {dateColumns.map((col, colIndex) => {
                  const unitStays = bookingsByUnit.get(unit.id) || [];
                  const { occupying } = barsToDrawOnCell(unitStays, col.dateStr, todayStr, {
                    isFirstColumn: colIndex === 0,
                    isToday: Boolean(col.isToday)
                  });
                  const blockingStay = occupying && stayYmd(occupying.check_in_date) <= col.dateStr
                    && col.dateStr < stayYmd(occupying.check_out_date)
                    ? occupying
                    : null;
                  const agentHold = !blockingStay && !col.isPast
                    ? agentLockOnNight(agentLocks, unit.id, col.dateStr)
                    : null;

                  return (
                    <div
                      key={col.dateStr}
                      onClick={() => !blockingStay && !col.isPast && handleCellClick(unit, col.dateStr)}
                      title={
                        agentHold
                          ? agentLockLabel(agentHold)
                          : (col.isPast && !blockingStay ? 'לא ניתן לפתוח הזמנה חדשה על יום שעבר' : undefined)
                      }
                      style={{
                        background: agentHold
                          ? (isLight ? 'rgba(249, 115, 22, 0.16)' : 'rgba(249, 115, 22, 0.22)')
                          : (col.isToday
                          ? (isLight ? 'rgba(245, 158, 11, 0.04)' : 'rgba(245, 158, 11, 0.08)') 
                          : (col.isPast && !blockingStay
                            ? (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)')
                            : (colIndex % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)')))),
                        borderBottom: `1px solid ${themeStyles.cellBorder}`,
                        borderLeft: agentHold
                          ? '1px solid rgba(249, 115, 22, 0.45)'
                          : `1px solid ${themeStyles.cellBorder}`,
                        position: 'relative',
                        overflow: 'visible',
                        height: `${UNIT_ROW_PX}px`,
                        cursor: blockingStay ? 'default' : (col.isPast || agentHold ? 'not-allowed' : 'pointer')
                      }}
                    >
                      {agentHold ? (
                        <div style={{
                          position: 'absolute',
                          inset: '2px 2px',
                          borderRadius: 4,
                          border: '1px dashed rgba(234, 88, 12, 0.55)',
                          background: isLight ? 'rgba(255, 247, 237, 0.72)' : 'rgba(124, 45, 18, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 4px',
                          pointerEvents: 'none',
                          zIndex: 1
                        }}>
                          <span style={{
                            fontSize: '0.5rem',
                            fontWeight: 800,
                            color: isLight ? '#C2410C' : '#FDBA74',
                            lineHeight: 1.25,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                          }}>
                            נעול · תשלום
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
          <div
            className="hotelos-calendar-stay-layer"
            style={{
              top: HEADER_H,
              height: boardUnits.length * UNIT_ROW_PX
            }}
          >
            {boardUnits.flatMap((unit, rowIndex) => (
              (bookingsByUnit.get(unit.id) || []).map((booking) => {
                const pix = spanBarPixels(booking, calendarStartStr, daysCount, CELL_PX, UNIT_COL_PX);
                if (!pix) return null;
                const departed = booking.booking_status === 'CHECKED_OUT'
                  && stayYmd(booking.check_in_date) < todayStr;
                const frameColor = departed ? '#94A3B8' : stayFrameColor(booking);
                const tone = stayCardTone(booking, { today: todayStr });
                const bankWait = !departed && awaitingBankReview(booking);
                return (
                  <div
                    key={booking.id}
                    onClick={(e) => handleBookingClick(booking, e)}
                    className={bankWait ? 'hotelos-bank-wait' : undefined}
                    title={`${booking.guest_name || 'אורח'} · ${bookingPeopleLabel(booking)}`}
                    style={{
                      position: 'absolute',
                      top: rowIndex * UNIT_ROW_PX + 2,
                      height: UNIT_ROW_PX - 4,
                      right: pix.right,
                      width: pix.width,
                      zIndex: 12,
                      pointerEvents: 'auto',
                      borderRadius: 4,
                      border: departed ? `1.5px dashed ${frameColor}` : `2px solid ${frameColor}`,
                      background: departed
                        ? (isLight ? 'rgba(241, 245, 249, 0.95)' : 'rgba(30, 41, 59, 0.55)')
                        : tone === 'unpaid'
                        ? (isLight ? 'rgba(254, 226, 226, 0.96)' : 'rgba(127, 29, 29, 0.55)')
                        : tone === 'inhouse'
                        ? (isLight ? 'rgba(237, 233, 254, 0.96)' : 'rgba(76, 29, 149, 0.5)')
                        : tone === 'paid'
                        ? (isLight ? 'rgba(220, 252, 231, 0.96)' : 'rgba(20, 83, 45, 0.45)')
                        : tone === 'bank'
                        ? (isLight ? 'rgba(255, 247, 237, 0.98)' : 'rgba(67, 20, 7, 0.72)')
                        : (isLight ? '#FFFFFF' : '#1E293B'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingInline: 4,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      gap: 4
                    }}
                  >
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.62rem',
                      color: departed ? '#94A3B8' : (isLight ? '#0F172A' : '#FFFFFF'),
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none'
                    }}>
                      {guestCardFirstName(booking.guest_name || 'אורח')}
                    </span>
                    {bookingGuestHeadcount(booking) > 0 ? (
                      <span
                        aria-label={`${bookingGuestHeadcount(booking)} אורחים`}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: '999px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 800,
                          flexShrink: 0,
                          background: departed
                            ? (isLight ? '#E2E8F0' : '#334155')
                            : (isLight ? '#0F172A' : '#F8FAFC'),
                          color: departed
                            ? (isLight ? '#475569' : '#CBD5E1')
                            : (isLight ? '#FFFFFF' : '#0F172A')
                        }}
                      >
                        {bookingGuestHeadcount(booking)}
                      </span>
                    ) : null}
                    {kinorotSettlementKind(booking) === 'voucher' ? (
                      <Ticket size={11} strokeWidth={2.4} aria-label="שובר" />
                    ) : null}
                    {!departed && awaitingCashCollection(booking) ? (
                      <Banknote size={11} strokeWidth={2.4} aria-label="מזומן בהגעה" />
                    ) : null}
                    {bookingHasCrib(booking) ? <Baby size={11} strokeWidth={2.4} aria-label="מיטת תינוק" /> : null}
                  </div>
                );
              })
            ))}
          </div>
          {(() => {
            const todayColIndex = dateColumns.findIndex((col) => col.isToday);
            if (todayColIndex < 0) return null;
            const quarter = nowQuarter;
            return (
              <div
                className="hotelos-now-line"
                aria-hidden="true"
                title={nowLineLabel}
                style={{
                  right: UNIT_COL_PX + (todayColIndex + quarter) * CELL_PX
                }}
              />
            );
          })()}
        </div>
      </div>

      {/* CHECKOUT DUTY: guests who did not leave by 11:00 */}
      <AnimatePresence>
        {dutyOpen && overdueCheckouts.length > 0 ? (
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
                border: '1.5px solid rgba(245, 158, 11, 0.45)',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '460px',
                maxHeight: '92vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.4rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div>
                  <div style={{ color: '#FBBF24', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em' }}>שעת צ׳ק־אאוט עברה</div>
                  <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.2rem' }}>אורחים שעדיין לא יצאו</h3>
                </div>
                <button
                  type="button"
                  onClick={() => { setCheckoutDutyDismissedToday(true); setDutyDismissed(true); setDutyOpen(false); }}
                  style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', padding: 4 }}
                  aria-label="סגור"
                >
                  <X size={20} />
                </button>
              </div>
              <p style={{ color: themeStyles.textMuted, fontSize: '0.88rem', lineHeight: 1.55, margin: '0.7rem 0 0.85rem' }}>
                האורחים עדיין לא מקבלים קישור יציאה. סמן מי שיצא, ואפשר לסגור את כולם בבת אחת.
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  disabled={Boolean(dutyBusyId) || !overdueCheckouts.length}
                  onClick={selectAllDuty}
                  style={{
                    flex: 1,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    background: isLight ? '#EAE5DD' : '#1E293B',
                    color: themeStyles.textPrimary,
                    borderRadius: '10px',
                    padding: '0.6rem',
                    fontWeight: 800,
                    cursor: dutyBusyId ? 'wait' : 'pointer'
                  }}
                >
                  סמן הכל
                </button>
                <button
                  type="button"
                  disabled={Boolean(dutyBusyId) || dutySelectedIds.size === 0}
                  onClick={handleBulkCheckout}
                  style={{
                    flex: 2,
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                    color: '#FFF',
                    borderRadius: '10px',
                    padding: '0.6rem',
                    fontWeight: 800,
                    cursor: dutyBusyId || dutySelectedIds.size === 0 ? 'wait' : 'pointer'
                  }}
                >
                  {dutyBusyId === '__all__' ? 'סוגר יציאות…' : `כולם יצאו (${dutySelectedIds.size})`}
                </button>
              </div>
              <div style={{ display: 'grid', gap: '0.7rem', flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: '2px' }}>
                {overdueCheckouts.map((booking) => {
                  const unit = rawUnits.find((row) => row.id === booking.unit_id);
                  const unitName = unit ? whatsAppUnitName(unit, t) : '';
                  const busy = dutyBusyId === booking.id || dutyBusyId === '__all__';
                  const selected = dutySelectedIds.has(booking.id);
                  return (
                    <div
                      key={booking.id}
                      style={{
                        border: `1px solid ${selected ? 'rgba(99, 102, 241, 0.45)' : themeStyles.inputBorder}`,
                        borderRadius: '14px',
                        padding: '0.85rem',
                        background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: busy ? 'wait' : 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={busy}
                          onChange={() => toggleDutySelected(booking.id)}
                          style={{ marginTop: '0.2rem', width: 18, height: 18, accentColor: '#6366F1' }}
                        />
                        <span>
                          <span style={{ fontWeight: 800, display: 'block' }}>{booking.guest_name || 'אורח'}</span>
                          <span style={{ fontSize: '0.8rem', color: themeStyles.textMuted }}>
                            {unitName} · יציאה {formatDisplayDate(booking.check_out_date)}
                          </span>
                        </span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.7rem' }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleManagerCheckout(booking)}
                          style={{
                            border: 'none',
                            cursor: busy ? 'wait' : 'pointer',
                            borderRadius: '10px',
                            padding: '0.65rem',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            color: '#FFF'
                          }}
                        >
                          צ׳ק־אאוט
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleExtendStay(booking)}
                          style={{
                            border: `1px solid ${themeStyles.inputBorder}`,
                            cursor: busy ? 'wait' : 'pointer',
                            borderRadius: '10px',
                            padding: '0.65rem',
                            fontWeight: 800,
                            background: isLight ? '#EAE5DD' : '#1E293B',
                            color: themeStyles.textPrimary
                          }}
                        >
                          הארך לילה
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

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
                maxHeight: '90vh',
                overflowY: 'auto',
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
                        onClick={() => {
                          const propertyId = propertyIdFromUnit(dispatchModalData.unit || dispatchModalData.unit_id);
                          const minNights = requiredMinNights(restrictions, propertyId, dispatchModalData.check_in_date);
                          if (dispatchModalData.nights_count <= minNights) {
                            window.alert(`מינימום ${minNights} לילות לתקופה הזו.`);
                            return;
                          }
                          setDispatchModalData(withDispatchNights(dispatchModalData, dispatchModalData.nights_count - 1, restrictions));
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.4rem' }}
                      >
                        <Minus size={18} />
                      </button>

                      <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>
                        {dispatchModalData.nights_count} לילות
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          const maxNights = maxAvailableNights(rawBookings, dispatchModalData.unit_id, dispatchModalData.check_in_date);
                          if (dispatchModalData.nights_count >= maxNights) {
                            window.alert('היחידה תפוסה בלילות הבאים. אי אפשר להאריך את ההזמנה מעבר לזה.');
                            return;
                          }
                          setDispatchModalData(withDispatchNights(dispatchModalData, dispatchModalData.nights_count + 1, restrictions));
                        }}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textPrimary, padding: '0.4rem' }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    {(() => {
                      const propertyId = propertyIdFromUnit(dispatchModalData.unit || dispatchModalData.unit_id);
                      const minNights = requiredMinNights(restrictions, propertyId, dispatchModalData.check_in_date);
                      const preview = evaluateStayRestrictions({
                        restrictions,
                        propertyId,
                        checkIn: dispatchModalData.check_in_date,
                        checkOut: formatDate(addDays(new Date(`${dispatchModalData.check_in_date}T00:00:00`), dispatchModalData.nights_count))
                      });
                      if (minNights <= 1 && preview.multiplier === 1) return null;
                      return (
                        <p style={{ fontSize: '0.72rem', color: themeStyles.textMuted, margin: '6px 0 0', fontWeight: 700 }}>
                          {minNights > 1 ? `מינימום ${minNights} לילות` : null}
                          {minNights > 1 && preview.multiplier !== 1 ? ' · ' : null}
                          {preview.multiplier !== 1 ? `מקדם מחיר ×${preview.multiplier}` : null}
                        </p>
                      );
                    })()}
                  </div>

                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <DispatchQtyStepper
                        label="מבוגרים"
                        value={Math.max(1, Number(dispatchModalData.adults_count) || 2)}
                        themeStyles={themeStyles}
                        onMinus={() => setDispatchModalData(bumpDispatchPax(dispatchModalData, 'adults', -1))}
                        onPlus={() => setDispatchModalData(bumpDispatchPax(dispatchModalData, 'adults', 1))}
                      />
                      <DispatchQtyStepper
                        label="ילדים"
                        value={Math.max(0, Number(dispatchModalData.children_count) || 0)}
                        themeStyles={themeStyles}
                        onMinus={() => setDispatchModalData(bumpDispatchPax(dispatchModalData, 'children', -1))}
                        onPlus={() => setDispatchModalData(bumpDispatchPax(dispatchModalData, 'children', 1))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setDispatchModalData({
                        ...dispatchModalData,
                        baby_cot_required: !dispatchModalData.baby_cot_required
                      })}
                      style={{
                        marginTop: 8,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '0.55rem 0.75rem',
                        borderRadius: 12,
                        border: `1px solid ${dispatchModalData.baby_cot_required ? '#6366F1' : themeStyles.inputBorder}`,
                        background: dispatchModalData.baby_cot_required ? 'rgba(99, 102, 241, 0.12)' : themeStyles.inputBg,
                        color: themeStyles.textPrimary,
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer'
                      }}
                    >
                      <span>לול תינוק</span>
                      <span style={{ fontSize: '0.72rem', color: themeStyles.textMuted }}>
                        {dispatchModalData.baby_cot_required ? 'נדרש' : 'לא נדרש'}
                      </span>
                    </button>
                    <p style={{ fontSize: '0.68rem', color: themeStyles.textMuted, margin: '6px 0 0', fontWeight: 700 }}>
                      עד {dispatchOccupancyCap(dispatchModalData)} אורחים ביחידה · לול לא תופס מיטה
                    </p>
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

                  {canSeePayments ? (
                    <PriceOverrideFields
                      themeStyles={themeStyles}
                      nights={dispatchModalData.nights_count}
                      nightly={dispatchModalData.custom_nightly_rate}
                      total={dispatchModalData.total_price_ils}
                      deposit={dispatchModalData.deposit_ils}
                      onNightly={(value) => {
                        const nightly = Number(value || 0);
                        const priced = pricedStay(
                          nightly,
                          dispatchModalData.nights_count,
                          dispatchStayPrice(dispatchModalData, restrictions).multiplier
                        );
                        setDispatchModalData({
                          ...dispatchModalData,
                          custom_nightly_rate: value,
                          total_price_ils: priced.totalIls,
                          deposit_ils: priced.depositIls
                        });
                      }}
                      onTotal={(value) => {
                        const total = Number(value || 0);
                        setDispatchModalData({
                          ...dispatchModalData,
                          total_price_ils: value,
                          custom_nightly_rate: nightlyFromTotalIls(total, dispatchModalData.nights_count),
                          deposit_ils: depositIlsFromTotal(total)
                        });
                      }}
                      onDeposit={(value) => setDispatchModalData({ ...dispatchModalData, deposit_ils: value })}
                    />
                  ) : null}

                  {canSeePayments ? (
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
                      אופן גביית תשלום
                    </label>
                    <select
                      value={dispatchModalData.payment_mode}
                      onChange={(e) => {
                        const payment_mode = e.target.value;
                        setDispatchModalData({
                          ...dispatchModalData,
                          payment_mode,
                          hyp_terminal: payment_mode === 'CASH_TRUST' ? '' : defaultHypTerminal(payment_mode)
                        });
                      }}
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
                      <option value="CREDIT_DEPOSIT">תשלום מקדמה (20%) באשראי</option>
                      <option value="CREDIT_FULL">תשלום מלא (100%) באשראי</option>
                      <option value="CASH_TRUST">תשלום במזומן בצימר</option>
                    </select>
                  </div>
                  ) : null}

                  {canSeePayments && dispatchModalData.payment_mode !== 'CASH_TRUST' ? (
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'block', marginBottom: '4px' }}>
                      מסוף Hyp לחיוב
                    </label>
                    <select
                      value={normalizeHypTerminal(dispatchModalData.hyp_terminal, dispatchModalData.payment_mode)}
                      onChange={(e) => setDispatchModalData({ ...dispatchModalData, hyp_terminal: e.target.value })}
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
                      <option value="B">{hypTerminalLabel('B')}</option>
                      <option value="A">{hypTerminalLabel('A')}</option>
                    </select>
                    <div style={{ fontSize: '0.72rem', color: themeStyles.textMuted, marginTop: '6px' }}>
                      ננעל בשליחה הראשונה של טופס המקדמה. B למקדמות, A ליתרות.
                    </div>
                  </div>
                  ) : null}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    name="channel"
                    value="whatsapp"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #25D366, #128C7E)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      fontSize: '0.88rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 4px 16px rgba(37, 211, 102, 0.4)'
                    }}
                  >
                    <Send size={16} />
                    <span>{t('SEND_WHATSAPP_LINK')}</span>
                  </button>
                  <button
                    type="submit"
                    name="channel"
                    value="sms"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      fontSize: '0.88rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 4px 16px rgba(14, 165, 233, 0.35)'
                    }}
                  >
                    <MessageSquare size={16} />
                    <span>{t('SEND_SMS_LINK')}</span>
                  </button>
                  </div>
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
                border: `2px solid ${canSeePayments ? getPaymentBadge({
                  ...editingBooking,
                  ...editFormData,
                  deposit_agorot: Number(editFormData.deposit_ils || 0) * 100
                }).border : themeStyles.inputBorder}`,
                borderRadius: '16px',
                width: '100%',
                maxWidth: '400px',
                maxHeight: '86vh',
                overflowY: 'auto',
                padding: '0.95rem 1rem 1.05rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                  {isEditingBookingDetails ? <Edit3 size={18} color="#6366F1" /> : <Info size={18} color="#6366F1" />}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const unit = rawUnits.find((u) => u.id === editFormData.unit_id);
                      const cabin = unit ? t(unit.id + '_short', unit.name) : '';
                      if (isEditingBookingDetails) return cabin ? `עריכה · ${cabin}` : 'עריכת הזמנה';
                      return cabin || 'פרטי הזמנה';
                    })()}
                  </span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {!isEditingBookingDetails && (
                    <button
                      type="button"
                      onClick={() => setIsEditingBookingDetails(true)}
                      style={{
                        border: `1px solid ${themeStyles.inputBorder}`,
                        background: isLight ? '#EAE5DD' : '#1E293B',
                        color: themeStyles.textPrimary,
                        cursor: 'pointer',
                        borderRadius: '10px',
                        padding: '0.4rem 0.7rem',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Edit3 size={14} />
                      עריכה
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsEditingBookingDetails(false);
                      setEditingBooking(null);
                    }}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: themeStyles.textMuted }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {!isEditingBookingDetails ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <div>
                    <div style={{ fontSize: '1.12rem', fontWeight: 900, lineHeight: 1.25 }}>
                      {editFormData.guest_name || '—'}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, marginTop: '0.12rem', letterSpacing: '0.02em', unicodeBidi: 'isolate', color: themeStyles.textMuted }} dir="ltr">
                      {editFormData.guest_phone || '—'}
                    </div>
                    <div style={{ marginTop: '0.28rem', fontSize: '0.84rem', fontWeight: 800 }}>
                      {formatDisplayDate(editFormData.check_in_date)} → {formatDisplayDate(editFormData.check_out_date)}
                      <span style={{ color: themeStyles.textMuted, fontWeight: 700 }}>
                        {` · ${getDaysDiff(editFormData.check_in_date, editFormData.check_out_date)} לילות`}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.12rem', fontSize: '0.82rem', fontWeight: 700, color: themeStyles.textMuted }}>
                      {bookingPeopleLabel({
                        ...editingBooking,
                        ...editFormData,
                        special_requests: editingBooking.special_requests
                      })}
                    </div>
                  </div>

                  {editFormData.guest_phone ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.45rem' }}>
                      <a
                        href={`tel:${toDialPhone(editFormData.guest_phone)}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          textDecoration: 'none',
                          background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                          color: '#FFF',
                          borderRadius: '10px',
                          padding: '0.55rem',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                        }}
                      >
                        <Phone size={15} />
                        התקשר
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          const phone = toWhatsAppPhone(editFormData.guest_phone);
                          if (!phone) return;
                          const unit = rawUnits.find((u) => u.id === editFormData.unit_id);
                          const unitName = unit ? whatsAppUnitName(unit, t) : '';
                          const text = encodeURIComponent(
                            `שלום ${editFormData.guest_name || ''}, כאן לגבי ההזמנה ב-${unitName} (${formatDisplayDate(editFormData.check_in_date)}–${formatDisplayDate(editFormData.check_out_date)})`
                          );
                          openWhatsAppChat(phone, text);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          border: 'none',
                          cursor: 'pointer',
                          background: 'linear-gradient(135deg, #25D366, #128C7E)',
                          color: '#FFF',
                          borderRadius: '10px',
                          padding: '0.55rem',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)'
                        }}
                      >
                        <Send size={15} />
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        disabled={sendingSms}
                        onClick={async () => {
                          if (sendingSms) return;
                          const unit = rawUnits.find((u) => u.id === editFormData.unit_id);
                          const unitName = unit ? whatsAppUnitName(unit, t) : '';
                          setSendingSms(true);
                          try {
                            await sendStaffSms({
                              phone: editFormData.guest_phone,
                              message: `שלום ${editFormData.guest_name || ''}, כאן לגבי ההזמנה ב-${unitName} (${formatDisplayDate(editFormData.check_in_date)}–${formatDisplayDate(editFormData.check_out_date)})`
                            });
                            window.alert('הסמס נשלח.');
                          } catch (err) {
                            window.alert(smsErrorText(err));
                          } finally {
                            setSendingSms(false);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem',
                          border: 'none',
                          cursor: sendingSms ? 'wait' : 'pointer',
                          background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                          color: '#FFF',
                          borderRadius: '10px',
                          padding: '0.55rem',
                          fontWeight: 800,
                          fontSize: '0.78rem',
                          boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                          opacity: sendingSms ? 0.75 : 1
                        }}
                      >
                        <MessageSquare size={15} />
                        סמס
                      </button>
                    </div>
                  ) : null}

                  {canSeePayments && editingBooking?.booking_status !== 'CANCELED' && editingBooking?.payment_mode !== 'CASH_TRUST' && !isFullyPaid(editingBooking) ? (
                    <HypTerminalField
                      locked={Boolean(editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal)}
                      value={linkHypTerminal}
                      onChange={setLinkHypTerminal}
                      themeStyles={themeStyles}
                    />
                  ) : null}

                  {editingBooking?.booking_status !== 'CANCELED' && !isFullyPaid(editingBooking) ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => sendInitialGuestLink('whatsapp')}
                      disabled={sendingGuestLink}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        border: 'none',
                        cursor: sendingGuestLink ? 'wait' : 'pointer',
                        background: 'linear-gradient(135deg, #25D366, #128C7E)',
                        color: '#FFF',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)',
                        opacity: sendingGuestLink ? 0.75 : 1
                      }}
                    >
                      <ExternalLink size={16} />
                      {sendingGuestLink ? 'מכין קישור…' : t('SEND_WHATSAPP_LINK')}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendInitialGuestLink('sms')}
                      disabled={sendingGuestLink}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        border: 'none',
                        cursor: sendingGuestLink ? 'wait' : 'pointer',
                        background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                        color: '#FFF',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)',
                        opacity: sendingGuestLink ? 0.75 : 1
                      }}
                    >
                      <MessageSquare size={16} />
                      {sendingGuestLink ? 'מכין קישור…' : t('SEND_SMS_LINK')}
                    </button>
                    </div>
                  ) : null}

                  {canSeePayments && editingBooking?.booking_status !== 'CANCELED' && editingBooking?.payment_mode !== 'CASH_TRUST' && !isFullyPaid(editingBooking) ? (
                    <button
                      type="button"
                      onClick={startEditCardCharge}
                      disabled={chargingCard || sendingGuestLink}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        border: 'none',
                        cursor: chargingCard ? 'wait' : 'pointer',
                        background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                        color: '#FFF',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                        opacity: chargingCard ? 0.75 : 1
                      }}
                    >
                      <CreditCard size={16} />
                      {chargingCard ? 'פותח סליקה…' : 'חיוב אשראי עכשיו'}
                    </button>
                  ) : null}

                  {canSeePayments && isFullyPaid(editingBooking) && editingBooking?.booking_status !== 'CANCELED' && !payDetailsOpen ? (
                    <button
                      type="button"
                      onClick={() => setPayDetailsOpen(true)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.7rem 0.85rem',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        textAlign: 'start',
                        background: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.12)',
                        border: '2px solid #10B981',
                        color: themeStyles.textPrimary
                      }}
                    >
                      <span style={{ fontSize: '1.02rem', fontWeight: 800 }}>
                        {(() => {
                          const totalIls = Number(editFormData.total_price_ils || 0);
                          const depositIls = Number(editFormData.deposit_ils || 0);
                          const paidIls = paidIlsOf({
                            ...editingBooking,
                            total_price_agorot: totalIls * 100,
                            deposit_agorot: depositIls * 100
                          }, totalIls, depositIls);
                          return `שולם ₪${paidIls.toLocaleString('he-IL')} · ${paidMethodLabel(editingBooking)}`;
                        })()}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: themeStyles.textMuted, flexShrink: 0 }}>פרטים</span>
                    </button>
                  ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.38rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: '12px',
                    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                    border: `2px solid ${canSeePayments ? getPaymentBadge(editingBooking).border : themeStyles.inputBorder}`
                  }}>
                    {canSeePayments && isFullyPaid(editingBooking) && editingBooking?.booking_status !== 'CANCELED' ? (
                      <button
                        type="button"
                        onClick={() => setPayDetailsOpen(false)}
                        style={{
                          alignSelf: 'start',
                          border: 'none',
                          background: 'transparent',
                          color: themeStyles.textMuted,
                          fontWeight: 800,
                          fontSize: '0.74rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        הסתר פרטים
                      </button>
                    ) : null}
                    {[
                      ...(canSeePayments
                        ? (() => {
                          const totalIls = Number(editFormData.total_price_ils || 0);
                          const depositIls = Number(editFormData.deposit_ils || 0);
                          const badgeBooking = {
                            ...editingBooking,
                            total_price_agorot: totalIls * 100,
                            deposit_agorot: depositIls * 100
                          };
                          const paidIls = paidIlsOf(badgeBooking, totalIls, depositIls);
                          const dueIls = Math.max(0, totalIls - paidIls);
                          return [
                            ['מחיר', `₪${totalIls.toLocaleString('he-IL')}`],
                            ['מקדמה נדרשת', `₪${depositIls.toLocaleString('he-IL')}`],
                            ['שולם', `₪${paidIls.toLocaleString('he-IL')}`],
                            ['יתרה', `₪${dueIls.toLocaleString('he-IL')}`]
                          ];
                        })()
                        : [])
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: themeStyles.textMuted }}>{label}</span>
                        <span style={{ fontSize: '1.02rem', fontWeight: 800 }}>{value}</span>
                      </div>
                    ))}
                    {canSeePayments ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: themeStyles.textMuted }}>תשלום</span>
                      {(() => {
                        const badge = getPaymentBadge({
                          ...editingBooking,
                          deposit_agorot: Number(editFormData.deposit_ils || 0) * 100,
                          total_price_agorot: Number(editFormData.total_price_ils || 0) * 100
                        });
                        return (
                          <span style={{
                            fontSize: '0.82rem',
                            fontWeight: 800,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`
                          }}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>
                    ) : null}
                    {canSeePayments && (paymentProofUrl || paymentProofBusy || awaitingBankReview(editingBooking)) ? (
                      <div style={{
                        padding: '0.75rem',
                        borderRadius: 12,
                        border: `1px solid ${awaitingBankReview(editingBooking) ? '#F97316' : themeStyles.inputBorder}`,
                        background: isLight ? 'rgba(249, 115, 22, 0.06)' : 'rgba(249, 115, 22, 0.08)'
                      }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#EA580C', marginBottom: 8 }}>
                          {paymentProofBusy ? 'טוען צילום העברה…' : 'צילום העברה מהאורח'}
                        </div>
                        {paymentProofUrl ? (
                          <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={paymentProofUrl}
                              alt="צילום העברה"
                              style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 10, display: 'block', background: isLight ? '#FFF' : '#0F172A' }}
                            />
                          </a>
                        ) : null}
                        {awaitingBankReview(editingBooking) ? (
                          <button
                            type="button"
                            disabled={cashBusy || !paymentProofUrl}
                            onClick={approveBankTransfer}
                            style={{
                              width: '100%',
                              marginTop: 10,
                              border: 'none',
                              borderRadius: 10,
                              padding: '0.7rem',
                              fontWeight: 800,
                              background: '#EA580C',
                              color: '#FFF',
                              cursor: 'pointer'
                            }}
                          >
                            {cashBusy ? 'מעדכן…' : `אשר העברה · ₪${Math.max(1, Math.round(dueAgorotOf(editingBooking) / 100)).toLocaleString('he-IL')}`}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {canSeePayments && listClearingPayments(editingBooking).length ? (
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: themeStyles.textMuted, marginBottom: 4 }}>סליקה ואסמכתאות</div>
                        <ClearingPaymentsList
                          booking={editingBooking}
                          isLight={isLight}
                          muted={themeStyles.textMuted}
                          compact
                        />
                      </div>
                    ) : null}
                    {canSeePayments && editingBooking?.booking_status !== 'CANCELED' && isFullyPaid(editingBooking) ? (
                      <div style={{
                        marginTop: '0.35rem',
                        paddingTop: '0.7rem',
                        borderTop: `1px solid ${themeStyles.cellBorder || themeStyles.inputBorder}`,
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        color: '#22C55E'
                      }}>
                        שולם במלואו · הכניסה לחדר מאושרת אוטומטית
                      </div>
                    ) : null}
                    {canSeePayments && editingBooking?.booking_status !== 'CANCELED' ? (
                      <div style={{
                        marginTop: '0.2rem',
                        paddingTop: '0.55rem',
                        borderTop: `1px solid ${themeStyles.cellBorder || themeStyles.inputBorder}`
                      }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 800, color: themeStyles.textMuted, marginBottom: 6 }}>
                          {isFullyPaid(editingBooking) ? 'תשלום נוסף שהתקבל' : 'תשלום שהתקבל ידנית'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 6 }}>
                          {[
                            ['CASH', 'מזומן'],
                            ['CARD', 'סליקה'],
                            ['BANK', 'העברה']
                          ].map(([id, label]) => {
                            const on = cashForm.method === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setCashForm({ ...cashForm, method: id })}
                                style={{
                                  border: `1px solid ${on ? '#6366F1' : themeStyles.inputBorder}`,
                                  background: on ? 'rgba(99, 102, 241, 0.16)' : themeStyles.inputBg,
                                  color: on ? '#A5B4FC' : themeStyles.textPrimary,
                                  borderRadius: 8,
                                  padding: '0.38rem 0.2rem',
                                  fontWeight: 800,
                                  fontSize: '0.74rem',
                                  cursor: 'pointer'
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="סכום ₪"
                            value={cashForm.amount}
                            onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
                            style={{ padding: '0.45rem', borderRadius: 8, background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary, fontWeight: 700 }}
                          />
                          <input
                            type="date"
                            value={cashForm.at}
                            onChange={(e) => setCashForm({ ...cashForm, at: e.target.value })}
                            style={{ padding: '0.45rem', borderRadius: 8, background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary, fontWeight: 700 }}
                          />
                        </div>
                        {cashForm.method === 'CASH' ? (
                          <input
                            type="text"
                            placeholder="מי גבה"
                            value={cashForm.collector}
                            onChange={(e) => setCashForm({ ...cashForm, collector: e.target.value })}
                            style={{ width: '100%', marginTop: 6, padding: '0.45rem', borderRadius: 8, background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary, fontWeight: 700, boxSizing: 'border-box' }}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder={cashForm.method === 'CARD' ? 'אסמכתה / מספר אישור' : 'אסמכתת העברה'}
                            value={cashForm.ref}
                            onChange={(e) => setCashForm({ ...cashForm, ref: e.target.value })}
                            style={{ width: '100%', marginTop: 6, padding: '0.45rem', borderRadius: 8, background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary, fontWeight: 700, boxSizing: 'border-box' }}
                          />
                        )}
                        {cashForm.method === 'CARD' ? (
                          <select
                            value={cashForm.terminal}
                            onChange={(e) => setCashForm({ ...cashForm, terminal: e.target.value })}
                            style={{ width: '100%', marginTop: 6, padding: '0.45rem', borderRadius: 8, background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary, fontWeight: 700 }}
                          >
                            <option value="B">{hypTerminalLabel('B')}</option>
                            <option value="A">{hypTerminalLabel('A')}</option>
                          </select>
                        ) : null}
                        <button
                          type="button"
                          disabled={cashBusy}
                          onClick={recordManualPayment}
                          style={{
                            width: '100%',
                            marginTop: 7,
                            border: 'none',
                            borderRadius: 9,
                            padding: '0.55rem',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            cursor: cashBusy ? 'wait' : 'pointer',
                            background: cashForm.method === 'BANK'
                              ? 'linear-gradient(135deg, #2563EB, #1D4ED8)'
                              : cashForm.method === 'CARD'
                                ? 'linear-gradient(135deg, #7C3AED, #6D28D9)'
                                : 'linear-gradient(135deg, #059669, #047857)',
                            color: '#FFF'
                          }}
                        >
                          {cashBusy
                            ? 'רושם…'
                            : cashForm.method === 'CARD'
                              ? 'רשום סליקה'
                              : cashForm.method === 'BANK'
                                ? 'רשום העברה'
                                : 'רשום מזומן'}
                        </button>
                        {!isFullyPaid(editingBooking) ? (
                          <div style={{ marginTop: 6, fontSize: '0.74rem', fontWeight: 800, color: '#EF4444' }}>
                            כניסה לחדר אחרי תשלום מלא
                            {dueAgorotOf({
                              ...editingBooking,
                              total_price_agorot: Number(editFormData.total_price_ils || 0) * 100
                            }) > 0
                              ? ` · יתרה ₪${Math.round(dueAgorotOf({
                                ...editingBooking,
                                total_price_agorot: Number(editFormData.total_price_ils || 0) * 100
                              }) / 100).toLocaleString('he-IL')}`
                              : ''}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  )}

                  {editingBooking?.booking_status === 'PENDING' && !depositActuallyPaid(editingBooking) && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (editFormData.check_out_date <= editFormData.check_in_date) {
                          window.alert('תאריך יציאה חייב להיות אחרי תאריך כניסה.');
                          return;
                        }
                        const pendingUnit = rawUnits.find((row) => row.id === editFormData.unit_id);
                        if (!restrictionBlock(restrictions, pendingUnit || editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date)) {
                          return;
                        }
                        const conflict = findOverlappingBooking(
                          rawBookings,
                          editFormData.unit_id,
                          editFormData.check_in_date,
                          editFormData.check_out_date,
                          editingBooking.id
                        );
                        if (conflict) {
                          window.alert('היחידה כבר תפוסה בתאריכים האלה. אי אפשר לאשר הזמנה כפולה.');
                          return;
                        }
                        const hold = findOverlappingAgentLock(agentLocks, editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date);
                        if (hold) {
                          window.alert(agentLockLabel(hold));
                          return;
                        }
                        const confirmedBooking = {
                          ...editingBooking,
                          guest_name: editFormData.guest_name || 'אורח (WhatsApp)',
                          guest_phone: editFormData.guest_phone,
                          check_in_date: editFormData.check_in_date,
                          check_out_date: editFormData.check_out_date,
                          total_price_agorot: Math.round(parseFloat(editFormData.total_price_ils || '0') * 100),
                          booking_status: 'CONFIRMED',
                          payment_status: editFormData.payment_status || 'UNPAID',
                          updated_at: new Date().toISOString()
                        };
                        await db.bookings.put(confirmedBooking);
                        await pushBookingToCloud(confirmedBooking);
                        setIsEditingBookingDetails(false);
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
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <CheckCircle2 size={18} />
                      <span>אישור הזמנה ביומן</span>
                    </button>
                  )}

                  {editingBooking?.booking_status !== 'CANCELED' ? (
                    <button
                      type="button"
                      onClick={handleCancelBooking}
                      style={{
                        width: '100%',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#EF4444',
                        border: '1px solid #EF4444',
                        borderRadius: '10px',
                        padding: '0.55rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem'
                      }}
                    >
                      <Trash2 size={14} />
                      ביטול הזמנה
                    </button>
                  ) : null}
                </div>
              ) : (
              <form onSubmit={handleEditReservationSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>יחידת אירוח</label>
                  <select
                    value={editFormData.unit_id}
                    onChange={(e) => setEditFormData({ ...editFormData, unit_id: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                  >
                    {units.map(u => (
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

                {canSeePayments && editingBooking?.booking_status !== 'CANCELED' && editingBooking?.payment_mode !== 'CASH_TRUST' ? (
                  <HypTerminalField
                    locked={Boolean(editingBooking.hyp_terminal || editingBooking.stay?.hyp_terminal)}
                    value={linkHypTerminal}
                    onChange={setLinkHypTerminal}
                    themeStyles={themeStyles}
                  />
                ) : null}

                {editingBooking?.booking_status !== 'CANCELED' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => sendInitialGuestLink('whatsapp')}
                    disabled={sendingGuestLink}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      border: 'none',
                      cursor: sendingGuestLink ? 'wait' : 'pointer',
                      background: 'linear-gradient(135deg, #25D366, #128C7E)',
                      color: '#FFF',
                      borderRadius: '12px',
                      padding: '0.75rem',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      boxShadow: '0 4px 14px rgba(37, 211, 102, 0.28)',
                      opacity: sendingGuestLink ? 0.75 : 1
                    }}
                  >
                    <ExternalLink size={16} />
                    {sendingGuestLink ? 'מכין קישור…' : t('SEND_WHATSAPP_LINK')}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendInitialGuestLink('sms')}
                    disabled={sendingGuestLink}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      border: 'none',
                      cursor: sendingGuestLink ? 'wait' : 'pointer',
                      background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
                      color: '#FFF',
                      borderRadius: '12px',
                      padding: '0.75rem',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      boxShadow: '0 4px 14px rgba(14, 165, 233, 0.28)',
                      opacity: sendingGuestLink ? 0.75 : 1
                    }}
                  >
                    <MessageSquare size={16} />
                    {sendingGuestLink ? 'מכין קישור…' : t('SEND_SMS_LINK')}
                  </button>
                  </div>
                ) : null}

                {canSeePayments && editingBooking?.booking_status !== 'CANCELED' && editingBooking?.payment_mode !== 'CASH_TRUST' && !isFullyPaid(editingBooking) ? (
                  <button
                    type="button"
                    onClick={startEditCardCharge}
                    disabled={chargingCard || sendingGuestLink}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      border: 'none',
                      cursor: chargingCard ? 'wait' : 'pointer',
                      background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                      color: '#FFF',
                      borderRadius: '12px',
                      padding: '0.75rem',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      boxShadow: '0 4px 14px rgba(124, 58, 237, 0.28)',
                      opacity: chargingCard ? 0.75 : 1
                    }}
                  >
                    <CreditCard size={16} />
                    {chargingCard ? 'פותח סליקה…' : 'חיוב אשראי עכשיו'}
                  </button>
                ) : null}

                {isOpenStay(editingBooking) ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      disabled={dutyBusyId === editingBooking.id}
                      onClick={() => handleManagerCheckout(editingBooking)}
                      style={{
                        border: 'none',
                        cursor: dutyBusyId === editingBooking.id ? 'wait' : 'pointer',
                        borderRadius: '10px',
                        padding: '0.65rem',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        background: overdueIds.has(editingBooking.id)
                          ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                          : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        color: '#FFF'
                      }}
                    >
                      צ׳ק־אאוט
                    </button>
                    <button
                      type="button"
                      disabled={dutyBusyId === editingBooking.id}
                      onClick={() => handleExtendStay(editingBooking)}
                      style={{
                        border: `1px solid ${themeStyles.inputBorder}`,
                        cursor: dutyBusyId === editingBooking.id ? 'wait' : 'pointer',
                        borderRadius: '10px',
                        padding: '0.65rem',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        background: isLight ? '#EAE5DD' : '#1E293B',
                        color: themeStyles.textPrimary
                      }}
                    >
                      הארך לילה
                    </button>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אין</label>
                    <input
                      type="date"
                      required
                      value={editFormData.check_in_date}
                      onChange={(e) => {
                        const check_in_date = e.target.value;
                        const nights = getDaysDiff(check_in_date, editFormData.check_out_date);
                        const priced = pricedStay(Number(editFormData.custom_nightly_rate || 0), nights);
                        setEditFormData({
                          ...editFormData,
                          check_in_date,
                          total_price_ils: priced.totalIls,
                          deposit_ils: priced.depositIls
                        });
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אאוט</label>
                    <input
                      type="date"
                      required
                      value={editFormData.check_out_date}
                      onChange={(e) => {
                        const check_out_date = e.target.value;
                        const nights = getDaysDiff(editFormData.check_in_date, check_out_date);
                        const priced = pricedStay(Number(editFormData.custom_nightly_rate || 0), nights);
                        setEditFormData({
                          ...editFormData,
                          check_out_date,
                          total_price_ils: priced.totalIls,
                          deposit_ils: priced.depositIls
                        });
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                {canSeePayments ? (
                <PriceOverrideFields
                  themeStyles={themeStyles}
                  nights={getDaysDiff(editFormData.check_in_date, editFormData.check_out_date)}
                  nightly={editFormData.custom_nightly_rate}
                  total={editFormData.total_price_ils}
                  deposit={editFormData.deposit_ils}
                  onNightly={(value) => {
                    const nights = getDaysDiff(editFormData.check_in_date, editFormData.check_out_date);
                    const priced = pricedStay(Number(value || 0), nights);
                    setEditFormData({
                      ...editFormData,
                      custom_nightly_rate: value,
                      total_price_ils: priced.totalIls,
                      deposit_ils: priced.depositIls
                    });
                  }}
                  onTotal={(value) => {
                    const nights = getDaysDiff(editFormData.check_in_date, editFormData.check_out_date);
                    const total = Number(value || 0);
                    setEditFormData({
                      ...editFormData,
                      total_price_ils: value,
                      custom_nightly_rate: nightlyFromTotalIls(total, nights),
                      deposit_ils: depositIlsFromTotal(total)
                    });
                  }}
                  onDeposit={(value) => setEditFormData({ ...editFormData, deposit_ils: value })}
                />
                ) : null}

                {canSeePayments ? (
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>סטטוס תשלום</label>
                  <select
                    value={editFormData.payment_status}
                    onChange={(e) => setEditFormData({ ...editFormData, payment_status: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                  >
                    <option value="PAID">שולם מלא</option>
                    <option value="PARTIAL">מקדמה בלבד</option>
                    <option value="PENDING_CASH">ממתין למזומן</option>
                    <option value="PENDING_BANK">ממתין להעברה</option>
                    <option value="UNPAID">לא שולם</option>
                  </select>
                </div>
                ) : null}

                {canSeePayments && (editingBooking?.payment_mode || paymentProofUrl || paymentProofBusy) ? (
                  <div style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, marginBottom: 6 }}>
                      אמצעי תשלום: {
                        editingBooking?.payment_mode === 'CASH' ? 'מזומן'
                          : editingBooking?.payment_mode === 'BANK_TRANSFER' ? 'העברה בנקאית'
                            : editingBooking?.payment_mode === 'CARD' ? 'אשראי'
                              : editingBooking?.payment_mode === 'VOUCHER' ? 'שובר'
                                : editingBooking?.payment_mode === 'COMP' ? 'ללא תשלום'
                              : (editingBooking?.payment_mode || '—')
                      }
                    </div>
                    {paymentProofBusy ? (
                      <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted }}>טוען אסמכתא…</div>
                    ) : null}
                    {paymentProofUrl ? (
                      <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={paymentProofUrl}
                          alt="אסמכתא"
                          style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 10, display: `1px solid ${themeStyles.inputBorder}` }}
                        />
                      </a>
                    ) : null}
                    {listClearingPayments(editingBooking).length ? (
                      <ClearingPaymentsList
                        booking={editingBooking}
                        isLight={isLight}
                        muted={themeStyles.textMuted}
                        compact
                      />
                    ) : null}
                  </div>
                ) : null}
                {canSeePayments && !editingBooking?.payment_mode && !paymentProofUrl && !paymentProofBusy && listClearingPayments(editingBooking).length ? (
                  <div style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 12,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'
                  }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, marginBottom: 6 }}>
                      סליקה ואסמכתאות
                    </div>
                    <ClearingPaymentsList
                      booking={editingBooking}
                      isLight={isLight}
                      muted={themeStyles.textMuted}
                      compact
                    />
                  </div>
                ) : null}

                {editingBooking?.booking_status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (editFormData.check_out_date <= editFormData.check_in_date) {
                        window.alert('תאריך יציאה חייב להיות אחרי תאריך כניסה.');
                        return;
                      }
                      const pendingUnit = rawUnits.find((row) => row.id === editFormData.unit_id);
                      if (!restrictionBlock(restrictions, pendingUnit || editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date)) {
                        return;
                      }
                      const conflict = findOverlappingBooking(
                        rawBookings,
                        editFormData.unit_id,
                        editFormData.check_in_date,
                        editFormData.check_out_date,
                        editingBooking.id
                      );
                      if (conflict) {
                        window.alert('היחידה כבר תפוסה בתאריכים האלה. אי אפשר לאשר הזמנה כפולה.');
                        return;
                      }
                      const hold = findOverlappingAgentLock(agentLocks, editFormData.unit_id, editFormData.check_in_date, editFormData.check_out_date);
                      if (hold) {
                        window.alert(agentLockLabel(hold));
                        return;
                      }
                      const confirmedBooking = {
                        ...editingBooking,
                        guest_name: editFormData.guest_name || 'אורח (WhatsApp)',
                        guest_phone: editFormData.guest_phone,
                        check_in_date: editFormData.check_in_date,
                        check_out_date: editFormData.check_out_date,
                        total_price_agorot: Math.round(parseFloat(editFormData.total_price_ils || '0') * 100),
                        booking_status: 'CONFIRMED',
                        payment_status: editFormData.payment_status || 'UNPAID',
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
                <button
                  type="button"
                    onClick={() => {
                      if (editingBooking) setEditFormData(buildEditFormData(editingBooking));
                      setIsEditingBookingDetails(false);
                    }}
                  style={{
                    width: '100%',
                    marginTop: '0.35rem',
                    background: 'transparent',
                    color: themeStyles.textMuted,
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.55rem',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  חזרה לפרטים
                </button>
              </form>
              )}
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
              <div style={{ display: 'grid', gridTemplateColumns: canSeePayments ? '1fr 1fr' : '1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.25)', padding: '0.9rem', borderRadius: '12px', border: `1px solid ${themeStyles.cellBorder}` }}>
                  <div style={{ fontSize: '0.75rem', color: themeStyles.textMuted, marginBottom: '2px' }}>תפוסה יומית</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#6366F1' }}>
                    {daySummaryModalData.occupiedCount} מתוך {daySummaryModalData.totalUnits}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6366F1', fontWeight: 700, marginTop: '2px' }}>
                    {daySummaryModalData.occupancyPercent}% תפוסה כללית
                  </div>
                </div>

                {canSeePayments ? (
                <div style={{ background: isLight ? '#FAF8F3' : 'rgba(0,0,0,0.25)', padding: '0.9rem', borderRadius: '12px', border: `1px solid ${themeStyles.cellBorder}` }}>
                  <div style={{ fontSize: '0.75rem', color: themeStyles.textMuted, marginBottom: '2px' }}>הכנסה משוערת</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10B981' }}>
                    ₪{daySummaryModalData.estimatedDailyRevenue.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700, marginTop: '2px' }}>
                    לפי תעריף ממוצע
                  </div>
                </div>
                ) : null}
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
                marginBottom: '0.85rem'
              }}>
                <span style={{ color: '#818CF8', fontWeight: 600 }}>מטלות ניקיון נדרשות (עקב צ'ק-אאוט):</span>
                <span style={{ fontWeight: 900, color: themeStyles.textPrimary }}>{daySummaryModalData.checkOuts.length} חדרים</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const dateStr = daySummaryModalData.dateStr;
                  setDaySummaryModalData(null);
                  openDutyReport(dateStr);
                }}
                style={{
                  width: '100%',
                  marginBottom: '0.55rem',
                  background: isLight ? '#EAE5DD' : '#1E293B',
                  color: themeStyles.textPrimary,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem'
                }}
              >
                <Printer size={16} />
                דוח להדפסה ליום הזה
              </button>

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

      <AnimatePresence>
        {dutyReportOpen ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 140,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setDutyReportOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              style={{
                background: themeStyles.wrapperBg,
                border: `1px solid ${themeStyles.inputBorder}`,
                borderRadius: '20px',
                width: '100%',
                maxWidth: '460px',
                padding: '1.35rem',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
                color: themeStyles.textPrimary
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div>
                  <div style={{ color: themeStyles.textMuted, fontSize: '0.75rem', fontWeight: 800 }}>הדפסה לצוות</div>
                  <h3 style={{ margin: '0.3rem 0 0', fontSize: '1.15rem' }}>דוח יומי</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDutyReportOpen(false)}
                  style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', padding: 4 }}
                  aria-label="סגור"
                >
                  <X size={20} />
                </button>
              </div>

              <label style={{ display: 'block', margin: '1rem 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
                אזור
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem' }}>
                {DUTY_PRINT_AREAS.map((area) => {
                  const selected = dutyReportArea === area.id;
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() => setDutyReportArea(area.id)}
                      title={area.hint}
                      style={{
                        border: selected ? 'none' : `1px solid ${themeStyles.inputBorder}`,
                        borderRadius: '12px',
                        padding: '0.65rem 0.55rem',
                        background: selected ? '#6366F1' : themeStyles.inputBg,
                        color: selected ? '#fff' : themeStyles.textPrimary,
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                    >
                      {area.label}
                    </button>
                  );
                })}
              </div>

              <label style={{ display: 'block', margin: '1rem 0 0.4rem', fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
                תאריך
              </label>
              <input
                type="date"
                value={dutyReportDate}
                onChange={(event) => setDutyReportDate(event.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: '10px',
                  background: themeStyles.inputBg,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  color: themeStyles.textPrimary,
                  fontWeight: 700
                }}
              />
              <div style={{ marginTop: '0.45rem', fontSize: '0.82rem', color: themeStyles.textMuted }}>
                {hebrewDateLabel(dutyReportDate)} · {dutyReportCounts.checkouts} יציאות · {dutyReportCounts.checkins} כניסות · {dutyReportCounts.occupying} ביומן
              </div>

              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1.1rem' }}>
                <button type="button" onClick={() => runDutyReport('checkouts')} style={{ ...buttonStyle, width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
                  <Printer size={15} />
                  יציאות
                </button>
                <button type="button" onClick={() => runDutyReport('checkins')} style={{ ...buttonStyle, width: '100%', padding: '0.75rem', justifyContent: 'center' }}>
                  <Printer size={15} />
                  כניסות
                </button>
                <button
                  type="button"
                  onClick={() => runDutyReport('both')}
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    padding: '0.75rem',
                    justifyContent: 'center',
                    background: '#6366F1',
                    color: '#fff',
                    border: 'none'
                  }}
                >
                  <Printer size={15} />
                  שניהם
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
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
                    onChange={(e) => {
                      const unit_id = e.target.value;
                      const unit = rawUnits.find((row) => row.id === unit_id);
                      const nights = getDaysDiff(newFormData.check_in_date, newFormData.check_out_date);
                      const priced = pricedStay(nightlyIlsFromUnit(unit), nights);
                      setNewFormData({
                        ...newFormData,
                        unit_id,
                        custom_nightly_rate: priced.nightlyIls,
                        total_price_ils: priced.totalIls,
                        deposit_ils: priced.depositIls
                      });
                    }}
                    required
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                  >
                    {units.map(u => (
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
                      onChange={(e) => {
                        const check_in_date = e.target.value;
                        const nights = getDaysDiff(check_in_date, newFormData.check_out_date);
                        const priced = pricedStay(Number(newFormData.custom_nightly_rate || 0), nights);
                        setNewFormData({
                          ...newFormData,
                          check_in_date,
                          total_price_ils: priced.totalIls,
                          deposit_ils: priced.depositIls
                        });
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: themeStyles.textMuted }}>תאריך צ'ק-אאוט</label>
                    <input
                      type="date"
                      required
                      value={newFormData.check_out_date}
                      onChange={(e) => {
                        const check_out_date = e.target.value;
                        const nights = getDaysDiff(newFormData.check_in_date, check_out_date);
                        const priced = pricedStay(Number(newFormData.custom_nightly_rate || 0), nights);
                        setNewFormData({
                          ...newFormData,
                          check_out_date,
                          total_price_ils: priced.totalIls,
                          deposit_ils: priced.depositIls
                        });
                      }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}`, color: themeStyles.textPrimary }}
                    />
                  </div>
                </div>

                {canSeePayments ? (
                <PriceOverrideFields
                  themeStyles={themeStyles}
                  nights={getDaysDiff(newFormData.check_in_date, newFormData.check_out_date)}
                  nightly={newFormData.custom_nightly_rate}
                  total={newFormData.total_price_ils}
                  deposit={newFormData.deposit_ils}
                  onNightly={(value) => {
                    const nights = getDaysDiff(newFormData.check_in_date, newFormData.check_out_date);
                    const priced = pricedStay(Number(value || 0), nights);
                    setNewFormData({
                      ...newFormData,
                      custom_nightly_rate: value,
                      total_price_ils: priced.totalIls,
                      deposit_ils: priced.depositIls
                    });
                  }}
                  onTotal={(value) => {
                    const nights = getDaysDiff(newFormData.check_in_date, newFormData.check_out_date);
                    const total = Number(value || 0);
                    setNewFormData({
                      ...newFormData,
                      total_price_ils: value,
                      custom_nightly_rate: nightlyFromTotalIls(total, nights),
                      deposit_ils: depositIlsFromTotal(total)
                    });
                  }}
                  onDeposit={(value) => setNewFormData({ ...newFormData, deposit_ils: value })}
                />
                ) : null}

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

      {opsUnitId ? (
        <UnitOpsStatusSheet
          key={opsUnitId}
          unit={units.find((row) => row.id === opsUnitId) || rawUnits.find((row) => row.id === opsUnitId)}
          bookings={rawBookings}
          unitName={(() => {
            const unit = units.find((row) => row.id === opsUnitId) || rawUnits.find((row) => row.id === opsUnitId);
            return unit ? t(unit.id + '_name', unit.name) : '';
          })()}
          isLight={isLight}
          themeStyles={themeStyles}
          onClose={closeOpsSheet}
          onPick={applyUnitOpsFromSheet}
          onOccupancy={applyOccupancyFromSheet}
        />
      ) : null}
    </div>
  );
}
