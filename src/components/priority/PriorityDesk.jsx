import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Filter, Printer, RefreshCw, Search, Table2 } from 'lucide-react';
import { formatIlsFromAgorot, normalizeClearingPayment, normalizeIsraeliId } from '../../lib/clearingPayments';
import { printCashDayReport } from '../../lib/cashDayReport';
import { calendarPartyLabel, dutyPrintAreaOf, dutyUnitGroup, printDailyDutyReport } from '../../lib/dailyDutyReport';
import { getUnitSign } from '../../lib/fieldUnitCatalog';
import { israelToday } from '../../lib/cabinAccess';
import { formatStayHourLabel, stayHoursFromBooking } from '../../lib/kinorotStayHours';
import { db, useLiveBookings, useLiveUnits } from '../../lib/resortos-db';
import { isInventoryUnit } from '../../lib/units';
import {
  CLEANING_CHOICES,
  LODGING_CHOICES,
  cleaningKey,
  cleaningLabel,
  lodgingKey,
  lodgingLabel,
  savePriorityStatusDrafts
} from '../../lib/priorityStatus';
import { recordedPaidAgorot } from '../../lib/bookingPaid';
import { ARRIVAL_TODAY_LABEL, priorityDayCell, priorityDeskGuests, priorityShowsGuest, selectPriorityStay } from '../../lib/priorityStay';
import { priorityRoomStatus, unitDisplayStatus } from '../../lib/unitStatus';
import { appendCashPaidNote, kinorotReservationId } from '../../lib/kinorotReservationNote';
import { coveringUnavailableHold, isUnavailableHoldBooking, unavailableHoldLabel } from '../../lib/unavailableHold';
import { printGuestFile } from '../../lib/guestFile';
import {
  PAYMENT_STATUSES,
  cashCollectedAgorot,
  collectPriorityCash,
  formatPriorityShekels,
  parsePriorityShekels,
  paymentDraftDirty,
  priorityMethodKey,
  priorityPayTone,
  priorityStatusKey,
  savePriorityPaymentDrafts
} from '../../lib/priorityPayment';
import { pushBookingToCloud, pushUnitToCloud, subscribeToOpsEdgeEvents, syncCloudBookingsToDexie, syncUnitOpsToDexie } from '../../lib/cloudDb';
import { getStoredToken, listAssignableStaff, staffDisplayName } from '../../lib/staffAuth';
import { toMicropayPhone } from '../../lib/micropaySms';
import { displayPhone, heStayDate } from '../command/liveCabins';
import PriorityCashflow from './PriorityCashflow';
import './priority.css';

const UNIT_TYPE = {
  cabin: 'בקתה',
  suite: 'סוויטה',
  villa: 'וילה',
  dome: 'כיפה',
  room: 'חדר'
};

const COLUMNS = [
  ['name', 'יחידה', 'col-name'],
  ['stay', 'סטטוס', 'col-stay'],
  ['outGuest', 'אורח יוצא', 'col-guest'],
  ['outParty', 'אנשים', 'col-party'],
  ['outPhone', 'טלפון', 'col-phone'],
  ['outTime', 'יציאה', 'col-when'],
  ['outCash', 'מזומן', 'col-paid'],
  ['inGuest', 'אורח נכנס', 'col-guest'],
  ['inParty', 'אנשים', 'col-party'],
  ['inPhone', 'טלפון', 'col-phone'],
  ['inTime', 'כניסה', 'col-when'],
  ['inCash', 'מזומן', 'col-paid'],
  ['clean', 'סטטוס ניקיון', 'col-clean'],
  ['staff', 'עובד', 'col-staff']
];

const WEEK_STATUSES = [
  { key: 'dirty', label: 'לניקוי', stay: 'VACANT', clean: 'DIRTY' },
  { key: 'inspect', label: 'ממתין לבדיקה', stay: 'VACANT', clean: 'READY' },
  { key: 'ready', label: 'מוכן', stay: 'VACANT', clean: 'READY' },
  { key: 'occupied', label: 'מאוכלס', stay: 'OCCUPIED', clean: '' },
  { key: 'unavailable', label: 'לא זמין', hold: true }
];

function bookerNationalId(booking) {
  if (!booking) return '';
  const stay = booking.stay && typeof booking.stay === 'object' ? booking.stay : {};
  const direct = [stay.booker_id, stay.national_id, stay.guestid, booking.guest_national_id]
    .map((value) => normalizeIsraeliId(value))
    .find(Boolean);
  if (direct) return direct;
  const fromNotes = String(booking.special_requests || '').match(/(?:^|\|)tz:(\d{5,9})(?:\||$)/);
  if (fromNotes) return normalizeIsraeliId(fromNotes[1]);
  const payments = Array.isArray(booking.clearing_payments) ? booking.clearing_payments : [];
  return payments.map((row) => normalizeIsraeliId(row?.payer_id)).find(Boolean) || '';
}

function liveWeekKey(stayKey, cleanKey, reason) {
  const key = priorityRoomStatus({
    staff_occupancy: stayKey,
    operational_status: cleanKey,
    custom_reason: reason
  }).key;
  return key === 'alert' ? '' : key;
}

function toneOf(label) {
  if (label === 'מאוכלס') return 'tone-occupied';
  if (label === 'בשהייה' || label === 'תפוס' || label === 'מוכן') return 'tone-ok';
  if (label === 'לניקוי' || label === 'בניקיון' || label === 'לא נקי') return 'tone-clean';
  if (label === 'ממתין לבדיקה' || label === 'השלמות') return 'tone-inspect';
  if (label === 'החלפה' || label === 'צ׳ק אאוט' || label === 'צ׳ק אין' || label === 'יציאה' || label === ARRIVAL_TODAY_LABEL) return 'tone-wait';
  if (label === 'תקלה') return 'tone-bad';
  if (label === 'לא זמין' || label === 'שיפוץ' || label === 'שיפוצים' || label === 'סגור' || label === 'לא נקי' || label === 'מקולקל') return 'tone-hold';
  return 'tone-idle';
}

function shiftDay(ymd, days) {
  const date = new Date(`${ymd}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const SHORT_UNITS = {
  'hill-1': 'גבעה 1',
  'hill-2': 'גבעה 2',
  'hill-3': 'גבעה 3',
  'hill-4': 'גבעה 4',
  'dome-blue': 'כחול',
  'dome-red': 'אדום',
  'dome-green': 'ירוק',
  'mialis-villa': 'וילה',
  'suite-1': 'ירוקה 1',
  'suite-2': 'ורודה 2',
  k671: 'נורית 1',
  k673: 'נורית 2',
  k674: 'נורית 3',
  k675: 'נורית 4',
  k676: 'נורית 5',
  k677: 'נורית 6',
  k678: 'נורית 7',
  k679: 'נורית 8',
  k808: "טאג' 1",
  k809: "טאג' 2",
  k810: "טאג' 3",
  k811: "טאג' 4",
  k680: 'מול הנוף 1',
  k681: 'מול הנוף 2',
  k682: 'מול הנוף 3',
  k683: 'מול הנוף 4',
  k684: 'מול הנוף 5',
  k685: 'נופים בלבן 1',
  k686: 'נופים בלבן 2',
  k687: 'טוסקנה 1',
  k688: 'טוסקנה 2',
  k689: 'טוסקנה שאטו',
  k690: 'מוסיקלית 1',
  k691: 'מוסיקלית 2',
  k692: 'מוסיקלית 3',
  k693: 'מאיה 1',
  k694: 'מאיה 2',
  k695: 'מאיה 3',
  k826: 'Aura',
  k827: 'Bloom',
  'pilot-office': 'משרד'
};

function priorityUnitName(unit) {
  const id = String(unit?.id || '');
  const short = SHORT_UNITS[id] || fallbackUnitName(unit?.name || id);
  const mark = String(unit?.name || '').match(/[ⒶⒷⒸⒹⒺⒻⒼ]\d{2}/);
  return mark ? `${mark[0]} ${short}` : short;
}

function fallbackUnitName(name) {
  const text = String(name || '')
    .replace(/[ⒶⒷⒸⒹⒺⒻⒼ]\d*/g, ' ')
    .replace(/[()·]/g, ' ')
    .replace(/בגבעה/g, 'גבעה')
    .replace(/\s+/g, ' ')
    .trim();
  const drop = new Set(['בקתה', 'בקתות', 'חצר', 'בתי', 'צימר', 'כיפת', 'שמיים', 'וילה', 'ריזורט', 'מאהל', 'נובה', 'קאסה', 'מול', 'בלבן', 'טוסקנה', 'סוויטה']);
  const parts = text.split(' ').filter(Boolean);
  const number = [...parts].reverse().find((part) => /^\d+$/.test(part));
  const words = parts.filter((part) => !/^\d+$/.test(part) && !drop.has(part.replace(/^ה/, '')) && !drop.has(part));
  const word = (words[words.length - 1] || '').replace(/^ה/, '');
  if (word && number) return `${word} ${number}`;
  return word || text;
}

function guestFirstName(name) {
  const word = String(name || '').trim().split(/[\s,]+/)[0] || '';
  return word.replace(/[-–—]+$/, '') || 'אורח';
}

function whenLabel(date, hour) {
  const day = heStayDate(date);
  if (!day) return '';
  return hour ? `${day}\u00a0\u00a0\u00a0${hour}` : day;
}

function nightsLabel(checkIn, checkOut) {
  const start = String(checkIn || '').slice(0, 10);
  const end = String(checkOut || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return '';
  const nights = Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000);
  if (nights <= 0) return '';
  return nights === 1 ? 'לילה 1' : `${nights} לילות`;
}

function cashMark(booking) {
  if (!booking || priorityMethodKey(booking) === 'VOUCHER') return { text: '', tone: '' };
  const total = Number(booking.total_price_agorot) || 0;
  const paid = recordedPaidAgorot(booking);
  const cash = cashCollectedAgorot(booking);
  const remaining = Math.max(0, total - paid);
  const settled = priorityStatusKey(booking) === 'PAID' || (total > 0 && remaining === 0);
  if (settled) {
    if (cash > 0) return { text: formatPriorityShekels(cash), tone: 'pay-ok' };
    if (priorityMethodKey(booking) === 'CASH' && total > 0) return { text: formatPriorityShekels(total), tone: 'pay-ok' };
    return { text: '', tone: '' };
  }
  if (remaining > 0) return { text: formatPriorityShekels(remaining), tone: 'pay-bad' };
  return { text: '', tone: '' };
}

function sideClock(booking, today, kind) {
  const hours = stayHoursFromBooking(booking);
  const hour = formatStayHourLabel(kind === 'out' ? hours?.checkout : hours?.checkin);
  const ymd = String((kind === 'out' ? booking.check_out_date : booking.check_in_date) || '').slice(0, 10);
  if (ymd === today) return hour || heStayDate(ymd);
  return whenLabel(ymd, hour);
}

const HEB_DAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const HORIZON_DAYS = 7;

function horizonLabel(ymd, today) {
  const date = new Date(`${ymd}T12:00:00`);
  const mark = `${HEB_DAY[date.getDay()]}׳ ${date.getDate()}.${date.getMonth() + 1}`;
  return ymd === today ? `היום - ${mark}` : mark;
}

function balanceAgorot(booking) {
  if (!booking || priorityMethodKey(booking) === 'VOUCHER') return 0;
  if (priorityStatusKey(booking) === 'PAID') return 0;
  const total = Number(booking.total_price_agorot) || 0;
  return Math.max(0, total - recordedPaidAgorot(booking));
}

function guestSide(booking, today, kind) {
  if (!booking) {
    return { guest: '', party: '', phone: '', time: '', cash: '', cashTone: '', bookingId: '' };
  }
  const money = cashMark(booking);
  return {
    guest: booking.guest_name || '',
    party: calendarPartyLabel(booking),
    phone: displayPhone(booking.guest_phone || ''),
    time: sideClock(booking, today, kind),
    cash: money.text,
    cashTone: money.tone,
    bookingId: booking.id || ''
  };
}

function paymentsOf(booking) {
  const stored = Array.isArray(booking?.clearing_payments) ? booking.clearing_payments : [];
  return stored.map(normalizeClearingPayment).filter((row) => row.amount_agorot > 0);
}

function cardFromBooking(row, booking) {
  if (!booking) return row;
  const hours = stayHoursFromBooking(booking);
  const amount = Number(booking.total_price_agorot) || 0;
  const cash = cashCollectedAgorot(booking);
  const method = priorityMethodKey(booking);
  return {
    ...row,
    guest: booking.guest_name || '',
    phone: displayPhone(booking.guest_phone || ''),
    nationalId: bookerNationalId(booking),
    party: calendarPartyLabel(booking),
    checkIn: whenLabel(booking.check_in_date, formatStayHourLabel(hours?.checkin)),
    checkOut: whenLabel(booking.check_out_date, formatStayHourLabel(hours?.checkout)),
    nights: nightsLabel(booking.check_in_date, booking.check_out_date),
    bookingId: booking.id,
    amountAgorot: amount,
    amountText: method === 'VOUCHER' ? '' : (amount ? formatPriorityShekels(amount) : ''),
    cashCollectedAgorot: cash,
    collectedText: method === 'VOUCHER' ? '' : (cash ? formatPriorityShekels(cash) : ''),
    payStatus: priorityStatusKey(booking),
    payMethod: method,
    charges: paymentsOf(booking),
    notes: booking.special_requests || '',
    notesList: Array.isArray(booking.stay?.priority_notes) ? booking.stay.priority_notes : [],
    phoneRaw: booking.guest_phone || ''
  };
}

function deskTaskRows(unit) {
  const list = Array.isArray(unit?.sop_progress?.deskTasks) ? unit.sop_progress.deskTasks : [];
  return list.map((task) => ({
    id: task.id,
    code: task.kind === 'maintenance' ? 'תחזוקה' : 'ניקיון',
    title: task.title || '',
    staff: task.by || '',
    start: '',
    end: '',
    status: 'פתוח'
  }));
}

function tasksOf(unit, stayLabel) {
  const added = deskTaskRows(unit);
  const steps = Array.isArray(unit?.sop_progress?.steps) ? unit.sop_progress.steps : [];
  const done = new Set(unit?.sop_progress?.doneIds || []);
  const base = steps.length
    ? steps.map((step, index) => ({
      id: step.id || String(index),
      code: String(index + 1).padStart(2, '0'),
      title: step.label?.he || step.label?.en || step.id || 'שלב',
      staff: unit.assigned_staff || '',
      start: '',
      end: '',
      status: done.has(step.id) ? 'בוצע' : 'פתוח'
    }))
    : [{
      id: 'ops',
      code: 'OPS',
      title: stayLabel || 'סטטוס יחידה',
      staff: unit?.assigned_staff || '',
      start: '',
      end: '',
      status: stayLabel === 'לניקוי' || stayLabel === 'בניקיון' || stayLabel === 'השלמות' ? 'פתוח' : 'בוצע'
    }];
  return [...added, ...base];
}

function priorityAreaLabel(area) {
  if (area === 'ramot') return 'רמות';
  if (area === 'givat') return 'גבעת יואב / נאות גולן / נוב';
  if (area === 'pilot') return 'פיילוט';
  return 'יחידות נוספות';
}

function areaRank(area) {
  if (area === 'ramot') return 0;
  if (area === 'givat') return 1;
  return 2;
}

const RAMOT_LETTERS = 'ⒶⒷⒸⒹⒺⒻⒼ';

function ramotLetterRank(unitId, name) {
  const sign = getUnitSign(unitId)?.sign || '';
  const fromSign = RAMOT_LETTERS.indexOf(sign);
  if (fromSign >= 0) return fromSign;
  const match = String(name || '').match(/[ⒶⒷⒸⒹⒺⒻⒼ]/);
  return match ? RAMOT_LETTERS.indexOf(match[0]) : 99;
}

function rowFromUnit(unit, bookings, today) {
  const { booking, arrivalToday, nextStay, hold, holdLabel } = selectPriorityStay(bookings, unit.id, today);
  const desk = priorityDeskGuests(bookings, unit.id, today);
  const current = desk.departing || desk.staying;
  const incoming = desk.arriving;
  const primary = current || incoming || booking;
  const out = guestSide(current, today, 'out');
  const inn = guestSide(incoming, today, 'in');
  const badge = unitDisplayStatus(unit, bookings, today);
  const stay = lodgingKey(unit);
  const clean = cleaningKey(unit);
  const dated = primary || hold;
  const hours = dated ? stayHoursFromBooking(dated) : null;
  const checkIn = dated ? whenLabel(dated.check_in_date, formatStayHourLabel(hours?.checkin)) : '';
  const checkOut = dated ? whenLabel(dated.check_out_date, formatStayHourLabel(hours?.checkout)) : '';
  const nights = dated ? nightsLabel(dated.check_in_date, dated.check_out_date) : '';
  const amount = Number(primary?.total_price_agorot || 0);
  const payStatus = priorityStatusKey(primary);
  const payMethod = priorityMethodKey(primary);
  return {
    id: unit.id,
    code: unit.unit_code || unit.id,
    name: priorityUnitName(unit),
    fullName: unit.name || unit.id,
    complex: dutyUnitGroup(unit.id, unit.name),
    area: dutyPrintAreaOf(unit.id, unit.name),
    letter: ramotLetterRank(unit.id, unit.name),
    unitType: UNIT_TYPE[unit.unit_type] || unit.unit_type || 'יחידה',
    stayKey: stay,
    arrivalToday,
    holdLabel: holdLabel || '',
    roomStatus: desk.roomStatus,
    stay: holdLabel || desk.roomStatus || (arrivalToday ? ARRIVAL_TODAY_LABEL : lodgingLabel(stay)),
    guest: primary?.guest_name || '',
    phone: primary ? displayPhone(primary.guest_phone || '') : '',
    nationalId: bookerNationalId(primary),
    checkIn,
    checkOut,
    nights,
    nextStay,
    party: primary ? calendarPartyLabel(primary) : '',
    bookingId: primary?.id || '',
    outGuest: out.guest,
    outParty: out.party,
    outPhone: out.phone,
    outTime: out.time,
    outCash: out.cash,
    outCashTone: out.cashTone,
    outBookingId: out.bookingId,
    inGuest: inn.guest,
    inParty: inn.party,
    inPhone: inn.phone,
    inTime: inn.time,
    inCash: inn.cash,
    inCashTone: inn.cashTone,
    inBookingId: inn.bookingId,
    payStatus,
    payMethod,
    amountAgorot: primary ? amount : 0,
    cashCollectedAgorot: primary ? cashCollectedAgorot(primary) : 0,
    paidAgorot: primary ? recordedPaidAgorot(primary) : 0,
    due: primary ? formatPriorityShekels(amount) : '',
    paid: primary ? formatPriorityShekels(recordedPaidAgorot(primary)) : '',
    payTone: priorityPayTone(payStatus),
    amount: primary && amount ? formatIlsFromAgorot(amount) : '',
    cleanKey: clean,
    clean: cleaningLabel(clean),
    reason: unit.custom_reason || '',
    staff: unit.assigned_staff || '',
    notes: [primary?.special_requests || '', unit.custom_reason || ''].filter(Boolean).join(' · '),
    notesList: Array.isArray(primary?.stay?.priority_notes) ? primary.stay.priority_notes : [],
    phoneRaw: primary?.guest_phone || '',
    sort: Number(unit.sort_order ?? 999),
    tasks: tasksOf(unit, badge?.label),
    charges: primary ? paymentsOf(primary) : []
  };
}

function choicesFor(field, housekeepers, currentName) {
  if (field === 'week') return WEEK_STATUSES;
  if (field === 'stay') return LODGING_CHOICES;
  if (field === 'clean') return CLEANING_CHOICES;
  const names = [...new Set([...(housekeepers || []), currentName].map((name) => String(name || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'he'));
  return [{ key: '', label: '—' }, ...names.map((name) => ({ key: name, label: name }))];
}

function draftHas(draft) {
  return Boolean(draft && (draft.stay || draft.clean || draft.weekMark || draft.payStatus || draft.payMethod || draft.amountText != null || draft.collectedText != null || draft.staff != null));
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function HoldPill({ label }) {
  return (
    <span className="stay-pill is-hold is-swap" title={label}>
      <span className="no-entry" aria-hidden="true" />
      <b>{label}</b>
    </span>
  );
}

function GuestPill({ kind, booking, swap = false, onOpen }) {
  const full = booking?.guest_name || '';
  const name = swap ? guestFirstName(full) : (full || 'אורח');
  const owes = kind === 'in' && balanceAgorot(booking) > 0;
  return (
    <button
      type="button"
      className={`stay-pill is-${kind}${swap ? ' is-swap' : ''}`}
      title={full || name}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {kind === 'in' ? <span className="pill-arrow" dir="ltr">←</span> : null}
      <b>{name}</b>
      {kind === 'out' ? <span className="pill-arrow" dir="ltr">←</span> : null}
      {owes ? <em className="owe">₪</em> : null}
    </button>
  );
}

export default function PriorityDesk({ tenantId = '', canEdit = false, active = true, session = null, operatorName = '', showCashflow = false }) {
  const units = useLiveUnits(tenantId);
  const bookings = useLiveBookings(tenantId);
  const today = israelToday();
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState('grid');
  const [pinnedBookingId, setPinnedBookingId] = useState('');
  const [tab, setTab] = useState('tasks');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('הנתונים חיים מהיומן');
  const [drafts, setDrafts] = useState({});
  const [editor, setEditor] = useState(null);
  const [menuBox, setMenuBox] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [kinorotNote, setKinorotNote] = useState({ resId: '', saved: '', draft: '', loading: false });
  const [housekeepers, setHousekeepers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [calendarNote, setCalendarNote] = useState('');
  const [view, setView] = useState('desk');
  const [horizonStart, setHorizonStart] = useState(today);
  const queryRef = useRef(null);
  const viewRef = useRef('desk');
  viewRef.current = view;
  const selectedRef = useRef(null);
  const moveRef = useRef(() => {});
  const editorRef = useRef(null);
  const chooseRef = useRef(() => {});
  const collectRef = useRef(() => {});
  const housekeepersRef = useRef([]);

  const rows = useMemo(() => (
    units
      .filter(isInventoryUnit)
      .map((unit) => rowFromUnit(unit, bookings, today))
      .sort((a, b) => {
        const area = areaRank(a.area) - areaRank(b.area);
        if (area) return area;
        if (a.area === 'ramot' && a.letter !== b.letter) return a.letter - b.letter;
        return a.complex.localeCompare(b.complex, 'he') || a.sort - b.sort || a.name.localeCompare(b.name, 'he');
      })
  ), [units, bookings, today]);

  const shown = useMemo(() => rows.map((row) => {
    const draft = drafts[row.id] || {};
    const clean = draft.clean || row.cleanKey;
    const payStatus = draft.payStatus || row.payStatus;
    const payMethod = draft.payMethod || row.payMethod;
    const parsedAmount = draft.amountText != null ? parsePriorityShekels(draft.amountText) : null;
    const amountAgorot = parsedAmount == null ? row.amountAgorot : parsedAmount;
    const parsedCollected = draft.collectedText != null ? parsePriorityShekels(draft.collectedText) : null;
    const collectedAgorot = parsedCollected == null ? row.cashCollectedAgorot : parsedCollected;
    const paidAgorot = parsedCollected == null
      ? row.paidAgorot
      : Math.max(0, (Number(row.paidAgorot) || 0) - (Number(row.cashCollectedAgorot) || 0) + collectedAgorot);
    const showGuest = priorityShowsGuest({
      stayKey: row.stayKey,
      arrivalToday: row.arrivalToday,
      holdLabel: row.holdLabel,
      stayDraft: draft.stay
    });
    const held = Boolean(row.holdLabel && !draft.stay);
    const blankSide = held ? {
      outGuest: '', outParty: '', outPhone: '', outTime: '', outCash: '', outCashTone: '', outBookingId: '',
      inGuest: '', inParty: '', inPhone: '', inTime: '', inCash: '', inCashTone: '', inBookingId: ''
    } : {};
    return {
      ...row,
      ...blankSide,
      held,
      stay: draft.stay ? lodgingLabel(draft.stay) : row.stay,
      guest: showGuest ? row.guest : '',
      party: showGuest ? row.party : '',
      phone: showGuest ? row.phone : '',
      phoneRaw: showGuest ? row.phoneRaw : '',
      nationalId: showGuest ? row.nationalId : '',
      nights: showGuest ? row.nights : '',
      checkIn: showGuest ? row.checkIn : '',
      checkOut: showGuest ? row.checkOut : '',
      nextStay: held ? '' : row.nextStay,
      notes: showGuest ? row.notes : '',
      bookingId: showGuest ? row.bookingId : '',
      clean: cleaningLabel(clean),
      payStatus,
      payMethod,
      amountAgorot,
      cashCollectedAgorot: collectedAgorot,
      paidAgorot,
      due: showGuest && row.bookingId && payMethod !== 'VOUCHER' ? formatPriorityShekels(amountAgorot) : '',
      paid: showGuest && row.bookingId && payMethod !== 'VOUCHER' && collectedAgorot > 0 ? formatPriorityShekels(collectedAgorot) : '',
      amountText: showGuest && payMethod !== 'VOUCHER' && draft.amountText != null
        ? draft.amountText
        : (showGuest && payMethod !== 'VOUCHER' && row.amountAgorot ? formatPriorityShekels(row.amountAgorot) : ''),
      collectedText: showGuest && payMethod !== 'VOUCHER' && draft.collectedText != null
        ? draft.collectedText
        : (showGuest && payMethod !== 'VOUCHER' && row.cashCollectedAgorot ? formatPriorityShekels(row.cashCollectedAgorot) : ''),
      payTone: showGuest && row.bookingId ? priorityPayTone(payStatus) : '',
      staff: draft.staff != null ? draft.staff : row.staff,
      weekLabel: (WEEK_STATUSES.find((choice) => choice.key === (draft.weekMark || liveWeekKey(draft.stay || row.stayKey, clean, row.reason))) || {}).label || row.clean,
      weekDirty: Boolean(draft.weekMark),
      stayDirty: Boolean(draft.stay && draft.stay !== row.stayKey),
      cleanDirty: Boolean(draft.clean && draft.clean !== row.cleanKey),
      staffDirty: draft.staff != null && draft.staff !== (row.staff || ''),
      payDirty: paymentDraftDirty(row, draft)
    };
  }), [rows, drafts]);

  const horizon = useMemo(() => (
    Array.from({ length: HORIZON_DAYS }, (_, index) => shiftDay(horizonStart, index))
  ), [horizonStart]);

  const visible = useMemo(() => {
    const needle = query.trim();
    if (!needle) return shown;
    return shown.filter((row) => {
      const names = horizon.flatMap((day) => {
        const cell = priorityDayCell(bookings, row.id, day);
        return [cell.guest?.guest_name, cell.out?.guest_name, cell.inn?.guest_name];
      });
      const hay = [row.name, row.fullName, row.complex, row.weekLabel, ...names].join(' ');
      return hay.includes(needle);
    });
  }, [shown, query, horizon, bookings]);

  const selected = visible.find((row) => row.id === selectedId) || shown.find((row) => row.id === selectedId) || visible[0] || null;
  const pinnedBooking = pinnedBookingId ? bookings.find((item) => item.id === pinnedBookingId) : null;
  const card = pinnedBooking && selected && pinnedBooking.unit_id === selected.id
    ? cardFromBooking(selected, pinnedBooking)
    : selected;
  const visibleIndex = selected ? visible.findIndex((row) => row.id === selected.id) : -1;

  const move = (delta) => {
    if (!visible.length) {
      setMessage('אין יחידות להצגה');
      return;
    }
    const index = visible.findIndex((row) => row.id === selected?.id);
    const start = index < 0 ? 0 : index;
    const next = visible[Math.max(0, Math.min(visible.length - 1, start + delta))];
    setSelectedId(next.id);
    setMessage(`${next.name} · ${start + delta + 1} מתוך ${visible.length}`);
  };
  moveRef.current = move;
  editorRef.current = editor;
  housekeepersRef.current = housekeepers;

  const dirtyCount = shown.filter((row) => row.stayDirty || row.cleanDirty || row.weekDirty || row.staffDirty || row.payDirty).length;
  const operator = operatorName || session?.name || 'משרד';

  const chooseStatus = (unitId, field, key) => {
    const row = rows.find((item) => item.id === unitId);
    if (field === 'week') {
      const live = liveWeekKey(row?.stayKey, row?.cleanKey, row?.reason);
      const choice = WEEK_STATUSES.find((item) => item.key === key);
      setDrafts((current) => {
        const prev = { ...(current[unitId] || {}) };
        if (!choice || key === live) {
          delete prev.weekMark;
          delete prev.stay;
          delete prev.clean;
        } else if (choice.hold) {
          prev.weekMark = key;
          delete prev.stay;
          delete prev.clean;
        } else {
          prev.weekMark = key;
          prev.stay = choice.stay;
          if (choice.clean) prev.clean = choice.clean;
          else delete prev.clean;
        }
        const next = { ...current };
        if (!draftHas(prev)) delete next[unitId];
        else next[unitId] = prev;
        return next;
      });
      setEditor(null);
      setMenuBox(null);
      setSaveError('');
      setMessage(!choice || key === live
        ? ''
        : choice.hold
          ? 'לא זמין עד מחר בכינורות. יש שינויים שטרם נשמרו'
          : 'יש שינויים שטרם נשמרו');
      return;
    }
    const liveKey = field === 'stay' ? row?.stayKey : field === 'clean' ? row?.cleanKey : (row?.staff || '');
    setDrafts((current) => {
      const prev = { ...(current[unitId] || {}) };
      const same = field === 'staff' ? (key || '') === (liveKey || '') : (!key || key === liveKey);
      if (same) delete prev[field];
      else prev[field] = field === 'staff' ? (key || '') : key;
      if (field === 'staff' && key && !same && (prev.clean || row?.cleanKey) === 'READY') {
        prev.clean = 'DIRTY';
      }
      const next = { ...current };
      if (!draftHas(prev)) delete next[unitId];
      else next[unitId] = prev;
      return next;
    });
    setEditor(null);
    setMenuBox(null);
    setSaveError('');
    const assigningCleaner = field === 'staff' && key && (key || '') !== (row?.staff || '');
    const cleanNow = (drafts[unitId]?.clean || row?.cleanKey);
    setMessage(assigningCleaner && cleanNow === 'READY'
      ? 'השיבוץ מסמן את היחידה לניקוי'
      : 'יש שינויים שטרם נשמרו');
  };
  chooseRef.current = chooseStatus;

  const openEditor = (event, row, field) => {
    if (!canEdit || saving) return;
    event.stopPropagation();
    const choices = choicesFor(field, housekeepersRef.current, row.staff);
    const currentKey = field === 'week'
      ? (drafts[row.id]?.weekMark || liveWeekKey(row.stayKey, row.cleanKey, row.reason))
      : field === 'stay'
      ? (drafts[row.id]?.stay || row.stayKey)
      : field === 'clean'
        ? (drafts[row.id]?.clean || row.cleanKey)
        : (drafts[row.id]?.staff != null ? drafts[row.id].staff : row.staff);
    const index = Math.max(0, choices.findIndex((choice) => choice.key === (currentKey || '')));
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = Math.min(choices.length * 24, 240);
    const top = rect.bottom + menuHeight > window.innerHeight ? Math.max(4, rect.top - menuHeight) : rect.bottom;
    setSelectedId(row.id);
    setEditor({ unitId: row.id, field, index });
    setMenuBox({
      top,
      right: Math.max(4, window.innerWidth - rect.right),
      width: Math.max(rect.width, field === 'week' ? 148 : 128)
    });
  };

  const patchDraft = (unitId, patch) => {
    setDrafts((current) => {
      const prev = { ...(current[unitId] || {}), ...patch };
      const next = { ...current };
      if (!draftHas(prev)) delete next[unitId];
      else next[unitId] = prev;
      return next;
    });
    setSaveError('');
    setMessage('יש שינויים שטרם נשמרו');
  };

  const clearPaymentDraft = (unitId) => {
    setDrafts((current) => {
      const prev = { ...(current[unitId] || {}) };
      delete prev.amountText;
      delete prev.collectedText;
      delete prev.payStatus;
      delete prev.payMethod;
      const next = { ...current };
      if (!draftHas(prev)) delete next[unitId];
      else next[unitId] = prev;
      return next;
    });
  };

  const collectCash = async (row, bookingId = row?.bookingId) => {
    if (!canEdit || saving) return;
    if (!bookingId) {
      setMessage('אין אורח לחיוב');
      return;
    }
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) {
      setMessage('אין אורח לחיוב');
      return;
    }
    const draft = bookingId === row.bookingId ? (drafts[row.id] || {}) : {};
    const totalAgorot = draft.amountText != null
      ? parsePriorityShekels(draft.amountText)
      : Number(booking.total_price_agorot) || 0;
    const collectedRaw = draft.collectedText != null ? String(draft.collectedText).trim() : '';
    const collectedAgorot = collectedRaw ? parsePriorityShekels(collectedRaw) : null;
    if (totalAgorot == null || (collectedRaw && collectedAgorot == null)) {
      setSaveError('הסכום לא תקין');
      setMessage('הסכום לא תקין');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const { booking: next, collectedAgorot: recorded } = collectPriorityCash(booking, {
        today,
        collector: operator,
        totalAgorot,
        collectedAgorot: collectedAgorot == null ? undefined : collectedAgorot
      });
      await db.bookings.put(next);
      await pushBookingToCloud(next, { allowOverlap: true });
      clearPaymentDraft(row.id);
      const money = recorded > 0 ? formatPriorityShekels(recorded) : formatPriorityShekels(totalAgorot);
      const noted = recorded > 0 ? recorded : totalAgorot;
      try {
        if (noted > 0) await syncCashNote(next, noted);
        setMessage(recorded > 0 ? `${row.name}: נגבה מזומן ${money} ונרשם בכינורות` : `${row.name}: המזומן כבר רשום`);
      } catch (err) {
        setMessage(`${row.name}: נגבה מזומן ${money}. ההערה בכינורות לא נשמרה`);
      }
    } catch (err) {
      const text = `הגבייה נכשלה ולא נרשמה: ${err?.message || 'שגיאה'}`;
      setSaveError(text);
      setMessage(text);
    } finally {
      setSaving(false);
    }
  };
  collectRef.current = collectCash;

  const openGuest = (unitId, booking) => {
    setSelectedId(unitId);
    setPinnedBookingId(booking?.id || '');
    setTaskTitle('');
    setNoteText('');
    setMode('form');
  };

  const addDeskTask = async (kind) => {
    const title = taskTitle.trim();
    const unit = units.find((item) => item.id === selected?.id);
    if (!canEdit || saving || !title || !unit) return;
    setSaving(true);
    setSaveError('');
    try {
      const prev = unit.sop_progress && typeof unit.sop_progress === 'object' ? unit.sop_progress : {};
      const deskTasks = Array.isArray(prev.deskTasks) ? prev.deskTasks : [];
      await pushUnitToCloud({
        id: unit.id,
        tenant_id: tenantId || unit.tenant_id,
        name: unit.name,
        sop_progress: {
          ...prev,
          deskTasks: [...deskTasks, {
            id: `desk_${Date.now()}`,
            kind,
            title,
            at: new Date().toISOString(),
            by: operator
          }]
        }
      }, { viaEdge: true, waitRemote: true });
      setTaskTitle('');
      setMessage(kind === 'maintenance' ? `${selected.name}: נוספה משימת תחזוקה` : `${selected.name}: נוספה משימת ניקיון`);
    } catch (err) {
      const text = `המשימה לא נשמרה: ${err?.message || 'שגיאה'}`;
      setSaveError(text);
      setMessage(text);
    } finally {
      setSaving(false);
    }
  };

  const addRoomNote = async () => {
    const text = noteText.trim();
    const booking = bookings.find((item) => item.id === card?.bookingId);
    if (!canEdit || saving || !text || !booking) {
      if (!booking) setMessage('אין אורח לרשום לו הערה');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const notes = Array.isArray(booking.stay?.priority_notes) ? booking.stay.priority_notes : [];
      const next = {
        ...booking,
        stay: {
          ...(booking.stay || {}),
          priority_notes: [...notes, {
            id: `note_${Date.now()}`,
            text,
            at: new Date().toISOString(),
            by: operator
          }]
        },
        updated_at: new Date().toISOString()
      };
      await db.bookings.put(next);
      await pushBookingToCloud(next, { allowOverlap: true });
      setNoteText('');
      setMessage('ההערה נשמרה');
    } catch (err) {
      const textError = `ההערה לא נשמרה: ${err?.message || 'שגיאה'}`;
      setSaveError(textError);
      setMessage(textError);
    } finally {
      setSaving(false);
    }
  };

  const staffJson = async (path, body, method = 'POST') => {
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'השמירה בכינורות נכשלה');
    return data;
  };

  const waitForKinorotSync = async (startedAt) => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await staffJson('/api/kinorot/sync', undefined, 'GET');
      if (status.running) continue;
      if (status.lastError) throw new Error(status.lastError);
      if (status.lastOkAt && status.lastOkAt >= startedAt) return status;
    }
    throw new Error('היומן עוד מתעדכן');
  };

  const saveKinorotNote = async (note = kinorotNote.draft, resId = kinorotNote.resId) => {
    if (!resId) return null;
    const saved = await staffJson('/api/kinorot/note', { res_id: resId, note });
    const text = String(saved?.note ?? note);
    setKinorotNote({ resId, saved: text, draft: text, loading: false });
    return text;
  };

  const syncCashNote = async (booking, agorot) => {
    const resId = kinorotReservationId(booking);
    if (!resId || !(Number(agorot) > 0)) return;
    const loaded = kinorotNote.resId === resId && !kinorotNote.loading;
    const current = loaded
      ? kinorotNote.draft
      : String((await staffJson(`/api/kinorot/note?res=${encodeURIComponent(resId)}`, undefined, 'GET')).note || '');
    const next = appendCashPaidNote(current, agorot, { by: operator });
    if (next === current.trim()) return;
    await saveKinorotNote(next, resId);
  };

  useEffect(() => {
    const resId = kinorotReservationId({ id: card?.bookingId });
    if (!resId) {
      setKinorotNote({ resId: '', saved: '', draft: '', loading: false });
      return undefined;
    }
    let cancel = false;
    setKinorotNote({ resId, saved: '', draft: '', loading: true });
    staffJson(`/api/kinorot/note?res=${encodeURIComponent(resId)}`, undefined, 'GET')
      .then((data) => {
        if (cancel) return;
        const text = String(data?.note || '');
        setKinorotNote({ resId, saved: text, draft: text, loading: false });
      })
      .catch(() => {
        if (!cancel) setKinorotNote({ resId, saved: '', draft: '', loading: false });
      });
    return () => { cancel = true; };
  }, [card?.bookingId]);

  const saveChanges = async () => {
    if (!canEdit || saving || !dirtyCount) return;
    setSaving(true);
    setSaveError('');
    try {
      const holdIds = Object.entries(drafts)
        .filter(([, draft]) => draft?.weekMark === 'unavailable')
        .map(([unitId]) => unitId);
      const restDrafts = Object.fromEntries(
        Object.entries(drafts).filter(([unitId]) => !holdIds.includes(unitId))
      );
      const payment = await savePriorityPaymentDrafts({
        rows,
        bookings,
        drafts,
        today,
        collector: operator
      });
      const result = await savePriorityStatusDrafts({
        tenantId,
        units,
        drafts: restDrafts,
        pushUnitToCloud
      });
      const held = [];
      const holdFailed = [];
      for (const unitId of holdIds) {
        try {
          held.push(await staffJson('/api/kinorot/hold', { unit_id: unitId }));
        } catch (err) {
          holdFailed.push({
            unitId,
            name: rows.find((row) => row.id === unitId)?.name || unitId,
            error: err?.message || 'החסימה בכינורות נכשלה'
          });
        }
      }
      setDrafts((current) => {
        const next = { ...current };
        const drop = (id, keys) => {
          if (!next[id]) return;
          const prev = { ...next[id] };
          keys.forEach((key) => { delete prev[key]; });
          if (!draftHas(prev)) delete next[id];
          else next[id] = prev;
        };
        result.saved.forEach((id) => drop(id, ['stay', 'clean', 'staff', 'weekMark']));
        payment.saved.forEach((id) => drop(id, ['amountText', 'collectedText', 'payStatus', 'payMethod']));
        held.forEach((row) => drop(row.unitId, ['weekMark', 'stay', 'clean']));
        result.failed.forEach((fail) => {
          const prev = { ...(next[fail.unitId] || {}) };
          if (fail.remain?.stay) prev.stay = fail.remain.stay;
          if (fail.remain?.clean) prev.clean = fail.remain.clean;
          if (fail.remain?.weekMark) prev.weekMark = fail.remain.weekMark;
          if (fail.remain?.staff != null) prev.staff = fail.remain.staff;
          if (draftHas(prev)) next[fail.unitId] = prev;
        });
        return next;
      });
      const failed = [...result.failed, ...payment.failed, ...holdFailed];
      if (held.length) {
        const startedAt = new Date().toISOString();
        const running = await staffJson('/api/kinorot/sync', undefined, 'GET').catch(() => ({}));
        if (running.running) await waitForKinorotSync(running.lastAttemptAt || startedAt).catch(() => {});
        const syncFrom = new Date().toISOString();
        await staffJson('/api/kinorot/sync', {});
        setSaving(false);
        const waitingNote = failed.length
          ? 'חלק מהחסימות נשמרו. מחכה שהיומן יתעדכן'
          : 'נחסם בכינורות עד מחר. מחכה שהיומן יתעדכן';
        setCalendarNote(waitingNote);
        setMessage(waitingNote);
        waitForKinorotSync(syncFrom)
          .then(() => pullBoard())
          .then(() => {
            if (!failed.length) {
              const caught = 'היומן עודכן והחסימה נקלטת';
              setCalendarNote(caught);
              setMessage(caught);
            }
          })
          .catch(() => {
            if (!failed.length) {
              const delayed = 'החסימה נשמרה בכינורות. רענון היומן מתעכב';
              setCalendarNote(delayed);
              setMessage(delayed);
            }
          });
      }
      if (failed.length) {
        const names = failed.map((fail) => fail.name || fail.unitId).join(', ');
        const text = `השמירה נכשלה ולא נרשמה: ${names}`;
        setSaveError(text);
        setCalendarNote(text);
        setMessage(text);
      } else if (!held.length) {
        setMessage('השינויים נשמרו');
      }
    } catch (err) {
      const text = `השמירה נכשלה ולא נרשמה: ${err?.message || 'שגיאה'}`;
      setSaveError(text);
      setCalendarNote(text);
      setMessage(text);
    } finally {
      setSaving(false);
      setEditor(null);
      setMenuBox(null);
    }
  };

  useEffect(() => {
    if (!selectedId && rows[0]) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  useEffect(() => {
    let cancel = false;
    listAssignableStaff()
      .then((people) => {
        if (cancel) return;
        const names = (people || [])
          .filter((person) => person?.role === 'HOUSEKEEPING' && person.is_active !== false)
          .map(staffDisplayName)
          .filter(Boolean);
        setHousekeepers([...new Set(names)].sort((a, b) => a.localeCompare(b, 'he')));
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  const pullBoard = async () => {
    if (!tenantId) return { ok: false };
    const day = israelToday();
    const pulled = await syncCloudBookingsToDexie(tenantId, {
      from: shiftDay(day, -21),
      to: shiftDay(day, 120),
      viaEdge: true
    });
    await syncUnitOpsToDexie(tenantId, { viaEdge: true });
    if (pulled?.ok !== false) setRefreshedAt(new Date());
    return pulled || { ok: true };
  };

  const refreshBoard = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const pulled = await pullBoard();
      const clock = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      setMessage(pulled?.ok === false ? 'הרענון נכשל' : `רוענן ${clock}`);
    } catch {
      setMessage('הרענון נכשל');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!active || !tenantId) return undefined;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      pullBoard().catch(() => {});
    };
    pull();
    const unsubscribe = subscribeToOpsEdgeEvents();
    const interval = setInterval(pull, 30000);
    document.addEventListener('visibilitychange', pull);
    window.addEventListener('focus', pull);
    return () => {
      clearInterval(interval);
      unsubscribe();
      document.removeEventListener('visibilitychange', pull);
      window.removeEventListener('focus', pull);
    };
  }, [active, tenantId]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (viewRef.current === 'cashflow') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('desk');
        }
        return;
      }
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const open = editorRef.current;
      const openRow = open ? shown.find((item) => item.id === open.unitId) : null;
      const choices = open ? choicesFor(open.field, housekeepersRef.current, openRow?.staff) : [];
      if (event.key === 'Escape') {
        event.preventDefault();
        if (open) {
          setEditor(null);
          setMenuBox(null);
          return;
        }
        setQuery('');
        setMessage('הסינון נוקה');
        return;
      }
      if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        setEditor((current) => {
          if (!current) return current;
          const list = choicesFor(current.field, housekeepersRef.current, shown.find((item) => item.id === current.unitId)?.staff);
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const index = Math.max(0, Math.min(list.length - 1, current.index + delta));
          return { ...current, index };
        });
        return;
      }
      if (open && event.key === 'Enter') {
        event.preventDefault();
        const choice = choices[open.index];
        if (choice) chooseRef.current(open.unitId, open.field, choice.key);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveRef.current(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        setMode((current) => (current === 'form' ? 'grid' : 'form'));
      } else if (event.key === 'F11') {
        event.preventDefault();
        setMode('grid');
        setMessage('סינון');
        requestAnimationFrame(() => queryRef.current?.focus());
      } else if (event.key === 'F2' && !open && !typing) {
        event.preventDefault();
        const row = shown.find((item) => item.id === selectedId) || shown[0];
        if (row) collectRef.current(row);
      } else if (event.key === 'Enter' && !typing) {
        event.preventDefault();
        setMessage(`מוצגות ${visible.length} יחידות`);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, visible.length, shown, selectedId]);

  useEffect(() => {
    if (!active || editor) return;
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, mode, editor]);

  const exportExcel = () => {
    const header = COLUMNS.map(([, label]) => label);
    const lines = visible.map((row) => COLUMNS.map(([key]) => row[key]));
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'resortos-priority.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(`יוצאו ${visible.length} יחידות`);
  };

  const editorChoices = editor ? choicesFor(editor.field, housekeepers, shown.find((row) => row.id === editor.unitId)?.staff) : [];

  return (
    <div className="priority-root" dir="rtl">
      {session ? (
        <div className="priority-session">
          <span>{session.name}</span>
          <button type="button" onClick={session.onLogout}>התנתקות</button>
        </div>
      ) : null}
      <div className="priority-title">
        <span className="priority-brand">
          <span>פריוריטי</span>
          <small>
            <b>Priority</b>
            <span>powered by ResortOS</span>
          </small>
        </span>
        <em>חיצים בין יחידות · F2 גביית מזומן · F8 טבלה/טופס · F11 סינון · Esc {editor ? 'סוגר עריכה' : 'מנקה סינון'}</em>
      </div>
      <div className="priority-toolbar">
        <span className="tb-refresh-note">
          {refreshedAt ? `רענון אחרון ${refreshedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'עדיין לא רוענן'}
          {calendarNote ? ` · ${calendarNote}` : ''}
        </span>
        <button type="button" className="tb-btn" disabled={refreshing} onClick={refreshBoard}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> {refreshing ? 'מרענן…' : 'רענון'}
        </button>
        <button type="button" className="tb-btn" onClick={() => move(-1)}>יחידה קודמת</button>
        <button type="button" className="tb-btn" onClick={() => move(1)}>יחידה הבאה</button>
        <button type="button" className="tb-btn" onClick={() => { setMode('grid'); queryRef.current?.focus(); }}><Filter size={14} /> שאילתא <kbd>F11</kbd></button>
        <button type="button" className="tb-btn" onClick={() => setMessage(`מוצגות ${visible.length} יחידות`)}><Search size={14} /> הרץ חיפוש <kbd>Enter</kbd></button>
        <button type="button" className={`tb-btn${mode === 'grid' ? ' is-on' : ''}`} onClick={() => setMode((current) => (current === 'form' ? 'grid' : 'form'))}><Table2 size={14} /> טבלה <kbd>F8</kbd></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={exportExcel}><FileSpreadsheet size={14} /> ייצא לאקסל</button>
        {canEdit ? (
          <button type="button" className={`tb-btn${dirtyCount ? ' is-dirty' : ''}`} disabled={!dirtyCount || saving} onClick={saveChanges}>
            {saving ? 'שומר…' : `שמירה${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        ) : null}
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={() => window.open('/price-list.html', '_blank', 'noopener')}><Printer size={14} /> מחירון</button>
        <button type="button" className="tb-btn" onClick={() => printDailyDutyReport({ dateStr: today, kind: 'both', area: 'all', bookings, units })}><Printer size={14} /> דוח יומי מלא</button>
        <button type="button" className="tb-btn" onClick={() => printCashDayReport(bookings, units, today)}><Printer size={14} /> דוח מזומנים</button>
        <button type="button" className="tb-btn" onClick={() => printDailyDutyReport({ dateStr: today, kind: 'morning', area: 'all', bookings, units })}><Printer size={14} /> תחילת יום</button>
        {showCashflow ? (
          <button type="button" className={`tb-btn tb-end${view === 'cashflow' ? ' is-on' : ''}`} onClick={() => setView((current) => (current === 'cashflow' ? 'desk' : 'cashflow'))}>
            הוצאות חודשיות
          </button>
        ) : null}
      </div>
      {view === 'cashflow' && showCashflow ? (
        <div className="priority-body">
          <PriorityCashflow />
        </div>
      ) : (
      <>
      <div className="priority-nav">
        <div className="nav-group nav-back">
          <button type="button" className="tb-btn" onClick={() => setHorizonStart((day) => shiftDay(day, -7))}>« שבוע</button>
          <button type="button" className="tb-btn" onClick={() => setHorizonStart((day) => shiftDay(day, -1))}>‹ יום</button>
        </div>
        <button type="button" className={`tb-btn nav-today${horizonStart === today ? ' is-on' : ''}`} onClick={() => setHorizonStart(today)}>היום</button>
        <div className="nav-group nav-fwd">
          <button type="button" className="tb-btn" onClick={() => setHorizonStart((day) => shiftDay(day, 1))}>יום ›</button>
          <button type="button" className="tb-btn" onClick={() => setHorizonStart((day) => shiftDay(day, 7))}>שבוע »</button>
        </div>
      </div>
      <div className="priority-body">
        {mode === 'form' && card ? (
          <>
            <div className="master">
              <div className="master-col">
                <Field label="שם אורח" value={card.guest} />
                <Field label="תעודת זהות" value={card.nationalId} />
                <PhoneField label="טלפון" phone={card.phone} raw={card.phoneRaw} />
                <Field label="הרכב אורחים" value={card.party} />
              </div>
              <div className="master-col">
                <Field label="יחידה" value={card.name} />
                <Field label="צ׳ק-אין" value={card.checkIn} />
                <Field label="צ׳ק-אאוט" value={card.checkOut} />
                <Field label="מספר לילות" value={card.nights} />
              </div>
              <div className="master-col">
                <Field label="סטטוס אירוח" value={card.stay} className={card.holdLabel ? 'tone-hold' : toneOf(card.stay)} />
                <Field label="סטטוס ניקיון" value={card.clean} className={toneOf(card.clean)} />
                <label className="field">
                  <span>עובד משובץ</span>
                  <select
                    disabled={!canEdit}
                    value={card.staff || ''}
                    onChange={(event) => chooseStatus(card.id, 'staff', event.target.value)}
                  >
                    <option value="">—</option>
                    {choicesFor('staff', housekeepers, card.staff).filter((choice) => choice.key).map((choice) => (
                      <option key={choice.key} value={choice.key}>{choice.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="master-col">
                <label className="field">
                  <span>סה״כ לתשלום</span>
                  <input
                    inputMode="decimal"
                    disabled={!canEdit || !card.bookingId}
                    value={card.bookingId ? card.amountText : ''}
                    placeholder={card.bookingId ? '0 ₪' : ''}
                    onChange={(event) => patchDraft(card.id, { amountText: event.target.value })}
                  />
                </label>
                <Field
                  label="יתרה לתשלום"
                  className="is-due"
                  value={card.bookingId ? formatPriorityShekels(Math.max(0, (Number(card.amountAgorot) || 0) - (Number(card.paidAgorot) || 0))) : ''}
                />
                <label className="field">
                  <span>גביית מזומן (F2)</span>
                  <span className="pay-line">
                    <input
                      className="cash-amount"
                      inputMode="decimal"
                      aria-label="גביית מזומן"
                      placeholder="סכום"
                      disabled={!canEdit || !card.bookingId}
                      value={card.collectedText || ''}
                      onChange={(event) => patchDraft(card.id, { collectedText: event.target.value })}
                    />
                    <button
                      type="button"
                      className="cash-btn"
                      disabled={!canEdit || !card.bookingId || saving}
                      onClick={() => collectCash(card)}
                    >
                      גבייה
                    </button>
                  </span>
                </label>
                <label className="field">
                  <span>סטטוס תשלום</span>
                  <select
                    className={priorityPayTone(card.payStatus)}
                    disabled={!canEdit || !card.bookingId}
                    value={card.bookingId ? (card.payStatus || 'UNPAID') : ''}
                    onChange={(event) => patchDraft(card.id, { payStatus: event.target.value })}
                  >
                    {card.bookingId ? null : <option value="" />}
                    {PAYMENT_STATUSES.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="field master-note">
                <span>הערה בכינורות</span>
                <textarea
                  className="kinorot-note"
                  disabled={!canEdit || !kinorotNote.resId || kinorotNote.loading || saving}
                  value={kinorotNote.draft}
                  placeholder={kinorotNote.loading ? 'טוען את ההערה' : kinorotNote.resId ? 'הערה שתופיע בכינורות' : 'אין הזמנת כינורות'}
                  onChange={(event) => setKinorotNote((current) => ({ ...current, draft: event.target.value }))}
                />
                <button
                  type="button"
                  className="tb-btn note-save"
                  disabled={!canEdit || saving || !kinorotNote.resId || kinorotNote.loading || kinorotNote.draft === kinorotNote.saved}
                  onClick={async () => {
                    setSaving(true);
                    setSaveError('');
                    try {
                      await saveKinorotNote();
                      setMessage('ההערה נשמרה בכינורות');
                    } catch (err) {
                      const text = `ההערה לא נשמרה: ${err?.message || 'שגיאה'}`;
                      setSaveError(text);
                      setMessage(text);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  שמור הערה
                </button>
              </label>
            </div>
            <div className="tab-strip">
              <button type="button" className={`tab-btn${tab === 'tasks' ? ' is-on' : ''}`} onClick={() => setTab('tasks')}>משימות</button>
              <button type="button" className={`tab-btn${tab === 'notes' ? ' is-on' : ''}`} onClick={() => setTab('notes')}>הערות</button>
              <button type="button" className={`tab-btn${tab === 'comms' ? ' is-on' : ''}`} onClick={() => setTab('comms')}>תקשורת</button>
              <button type="button" className={`tab-btn${tab === 'bill' ? ' is-on' : ''}`} onClick={() => setTab('bill')}>חיובים</button>
              <button
                type="button"
                className="tab-btn guest-file-btn"
                disabled={!card.bookingId}
                onClick={() => {
                  const booking = (pinnedBooking && pinnedBooking.id === card.bookingId)
                    ? pinnedBooking
                    : bookings.find((item) => item.id === card.bookingId);
                  if (!booking || isUnavailableHoldBooking(booking) || booking.booking_status === 'CANCELED') return;
                  printGuestFile(booking, { units, bookings });
                }}
              >
                דף אורח
              </button>
            </div>
            <div className="child-pane">
              <div className="grid-wrap">
                {tab === 'tasks' ? (
                  <>
                    <div className="room-add">
                      <input
                        value={taskTitle}
                        disabled={!canEdit || saving}
                        placeholder="תיאור משימה"
                        onChange={(event) => setTaskTitle(event.target.value)}
                      />
                      <button type="button" disabled={!canEdit || saving || !taskTitle.trim()} onClick={() => addDeskTask('cleaning')}>ניקיון</button>
                      <button type="button" disabled={!canEdit || saving || !taskTitle.trim()} onClick={() => addDeskTask('maintenance')}>תחזוקה</button>
                    </div>
                    <table className="erp-table">
                      <thead>
                        <tr>
                          <th>קוד</th><th>תיאור</th><th>עובד</th><th>סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.tasks.map((task) => (
                          <tr key={task.id}>
                            <td>{task.code}</td>
                            <td>{task.title}</td>
                            <td>{task.staff}</td>
                            <td className={task.status === 'פתוח' ? 'tone-wait' : 'tone-ok'}>{task.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : tab === 'notes' ? (
                  <div className="room-panel">
                    <div className="room-add">
                      <input
                        value={noteText}
                        disabled={!canEdit || saving || !card.bookingId}
                        placeholder={card.bookingId ? 'הערה חופשית' : 'אין אורח על היחידה'}
                        onChange={(event) => setNoteText(event.target.value)}
                      />
                      <button type="button" disabled={!canEdit || saving || !card.bookingId || !noteText.trim()} onClick={addRoomNote}>הוסף</button>
                    </div>
                    {(card.notesList || []).length ? (card.notesList || []).slice().reverse().map((note) => (
                      <div key={note.id} className="room-line">
                        <b>{note.by || 'משרד'} · {note.at ? new Date(note.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</b>
                        <span>{note.text}</span>
                      </div>
                    )) : <div className="room-empty">אין הערות חופשיות</div>}
                  </div>
                ) : tab === 'comms' ? (
                  <RoomComms bookingId={card.bookingId} phone={card.phoneRaw} canEdit={canEdit} />
                ) : (
                  <table className="erp-table">
                    <thead>
                      <tr><th>פריט</th><th>תאריך</th><th>אסמכתה</th><th>סכום</th><th>משלם</th></tr>
                    </thead>
                    <tbody>
                      {card.charges.length ? card.charges.map((charge, index) => (
                        <tr key={charge.txn || charge.ref || index}>
                          <td>{charge.accountLabel}</td>
                          <td>{charge.date || String(charge.collected_at || '').slice(0, 10)}</td>
                          <td>{charge.ref}</td>
                          <td>{formatIlsFromAgorot(charge.amount_agorot)}</td>
                          <td>{[charge.payer_name, charge.payer_id].filter(Boolean).join(' · ')}</td>
                        </tr>
                      )) : <tr><td className="empty-row" colSpan={5}>אין חיובים רשומים ליחידה הזו</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="grid-wrap">
            <table className="erp-table week-table">
              <thead>
                <tr className="label-row">
                  <th className="unit-cell">יחידה</th>
                  {horizon.map((day) => (
                    <th key={day} className={day === today ? 'is-today' : ''}>{horizonLabel(day, today)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {index === 0 || visible[index - 1].area !== row.area ? (
                      <tr className="area-break">
                        <td colSpan={horizon.length + 1}>{priorityAreaLabel(row.area)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="unit-cell">
                        <button
                          type="button"
                          className="unit-status"
                          disabled={!canEdit || saving}
                          onClick={(event) => openEditor(event, row, 'week')}
                        >
                          <span className="unit-name">{row.name}</span>
                          {row.weekLabel ? <em className={`clean-badge ${toneOf(row.weekLabel)}`}>{row.weekLabel}{row.weekDirty ? ' *' : ''}</em> : null}
                        </button>
                      </td>
                      {horizon.map((day) => {
                        const cell = priorityDayCell(bookings, row.id, day);
                        const hold = cell.kind === 'empty' ? coveringUnavailableHold(bookings, row.id, day) : null;
                        const holdText = hold ? (unavailableHoldLabel(hold.guest_name) || 'לא זמין') : '';
                        return (
                          <td key={day} className={`week-cell${day === today ? ' is-today' : ''}`}>
                            {cell.kind === 'swap' ? (
                              <div className="swap-cell">
                                <GuestPill swap kind="out" booking={cell.out} onOpen={() => openGuest(row.id, cell.out)} />
                                <GuestPill swap kind="in" booking={cell.inn} onOpen={() => openGuest(row.id, cell.inn)} />
                              </div>
                            ) : cell.kind === 'swap-hold' ? (
                              <div className="swap-cell">
                                <GuestPill swap kind="out" booking={cell.out} onOpen={() => openGuest(row.id, cell.out)} />
                                <HoldPill label={cell.holdLabel} />
                              </div>
                            ) : cell.kind === 'empty' ? (
                              holdText
                                ? <span className="week-hold">{holdText}</span>
                                : <span className="week-empty">+ שריין / לאסט מיניט</span>
                            ) : (
                              <GuestPill kind={cell.kind} booking={cell.guest} onOpen={() => openGuest(row.id, cell.guest)} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
                {!visible.length ? <tr><td className="empty-row" colSpan={horizon.length + 1}>אין יחידות לסינון</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={`priority-status${saveError ? ' is-error' : ''}`}>
        <span>{message}</span>
        <b>{selected ? `${selected.name} · ${visibleIndex + 1} / ${visible.length}` : 'אין יחידה'}</b>
      </div>
      {editor && menuBox ? (
        <div className="cell-menu" style={{ top: menuBox.top, right: menuBox.right, minWidth: menuBox.width }} role="listbox">
          {editorChoices.map((choice, index) => (
            <button
              key={choice.key}
              type="button"
              role="option"
              className={index === editor.index ? 'is-on' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseStatus(editor.unitId, editor.field, choice.key)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}

function RoomComms({ bookingId, phone, canEdit }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState('');
  const [callNote, setCallNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!bookingId) {
      setRows([]);
      return;
    }
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/guest-comms?booking_id=${encodeURIComponent(bookingId)}`, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'COMMS_LIST_FAILED');
    setRows(Array.isArray(data.rows) ? data.rows : []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'שגיאה'));
  }, [bookingId]);

  async function post(body) {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/guest-comms/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({ booking_id: bookingId, ...body })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'COMMS_SEND_FAILED');
  }

  async function sendSms() {
    const message = draft.trim();
    if (!bookingId || !message || busy) return;
    setBusy(true);
    setError('');
    try {
      await post({ message, channel: 'sms', kind: 'manual' });
      setDraft('');
      await load();
    } catch (err) {
      setError(err.message || 'השליחה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  async function logCall() {
    const message = callNote.trim() || 'שיחה אל האורח';
    if (!bookingId || busy) return;
    setBusy(true);
    setError('');
    try {
      await post({ message, channel: 'phone', kind: 'call' });
      setCallNote('');
      if (phone) {
        const anchor = document.createElement('a');
        anchor.href = `tel:${String(phone).replace(/\s/g, '')}`;
        anchor.click();
      }
      await load();
    } catch (err) {
      setError(err.message || 'השיחה לא נרשמה');
    } finally {
      setBusy(false);
    }
  }

  function label(row) {
    if (row.channel === 'phone' || row.metadata?.kind === 'call') return 'שיחה';
    return 'הודעה';
  }

  if (!bookingId) return <div className="room-empty">אין אורח על היחידה</div>;

  return (
    <div className="room-comms">
      <div className="room-add">
        <textarea value={draft} disabled={!canEdit || busy} placeholder="הודעה לאורח" onChange={(event) => setDraft(event.target.value)} />
        <button type="button" disabled={!canEdit || busy || !draft.trim()} onClick={sendSms}>שלח סמס</button>
      </div>
      <div className="room-add">
        <input value={callNote} disabled={!canEdit || busy} placeholder="מה נאמר בשיחה" onChange={(event) => setCallNote(event.target.value)} />
        <button type="button" disabled={!canEdit || busy} onClick={logCall}>{phone ? 'חייג ורשום' : 'רשום שיחה'}</button>
      </div>
      {error ? <div className="room-empty">{error}</div> : null}
      {rows.length ? rows.slice().reverse().map((row) => (
        <div key={row.id} className="room-line">
          <b>
            {label(row)}
            {' · '}
            {row.sent_at || row.created_at
              ? new Date(row.sent_at || row.created_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
              : ''}
          </b>
          <span>{row.content}</span>
        </div>
      )) : <div className="room-empty">אין עדיין הודעות או שיחות</div>}
    </div>
  );
}

function Field({ label, value, className = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className={`ro ${className}`.trim()} value={value || ''} readOnly />
    </label>
  );
}

function PhoneField({ label, phone, raw }) {
  const local = toMicropayPhone(raw || phone);
  const whatsapp = local ? `972${local.slice(1)}` : '';
  return (
    <label className="field">
      <span>{label}</span>
      <input className="ro" dir="ltr" value={phone || ''} readOnly />
      {local ? (
        <span className="phone-links">
          <a href={`tel:${local}`}>חיוג</a>
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">וואטסאפ</a>
        </span>
      ) : null}
    </label>
  );
}
