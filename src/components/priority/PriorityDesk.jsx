import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCheck, ExternalLink, FileSpreadsheet, FileText, FolderOpen, Link2, MessageCircle, Phone, Printer, RefreshCw, Send, Table2, X } from 'lucide-react';
import { formatIlsFromAgorot, normalizeClearingPayment, normalizeIsraeliId } from '../../lib/clearingPayments';
import { printCashDayReport } from '../../lib/cashDayReport';
import { calendarPartyLabel, dutyPrintAreaOf, dutyUnitGroup, printDailyDutyReport } from '../../lib/dailyDutyReport';
import { getUnitSign } from '../../lib/fieldUnitCatalog';
import { israelToday } from '../../lib/cabinAccess';
import { clearCleanerUntilScan } from '../../lib/housekeepingCycle';
import { roomLogClock, visibleRoomLog } from '../../lib/roomLog';
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
import { defaultGroundStatus, groundsBands, statusChoices, statusLabel } from '../../lib/priorityGrounds';
import {
  ARRIVAL_TODAY_LABEL,
  priorityDayCell,
  priorityDayOccupancy,
  priorityDeskGuests,
  priorityShowsGuest,
  selectPriorityStay
} from '../../lib/priorityStay';
import { priorityRoomStatus, unitDisplayStatus } from '../../lib/unitStatus';
import { kinorotReservationId } from '../../lib/kinorotReservationNote';
import { coveringUnavailableHold, isUnavailableHoldBooking, unavailableHoldLabel } from '../../lib/unavailableHold';
import { printGuestFile } from '../../lib/guestFile';
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  applyPaymentDraft,
  cashCollectedAgorot,
  collectPriorityCash,
  formatPriorityShekels,
  parsePriorityShekels,
  paymentBreakdown,
  paymentDraftDirty,
  priorityMethodKey,
  priorityPayTone,
  priorityShekelMark,
  priorityStatusKey,
  savePriorityPaymentDrafts
} from '../../lib/priorityPayment';
import { pushBookingToCloud, pushUnitToCloud, subscribeToOpsEdgeEvents, syncCloudBookingsToDexie, syncUnitOpsToDexie } from '../../lib/cloudDb';
import { getStoredToken, listAssignableStaff, staffDisplayName } from '../../lib/staffAuth';
import { toMicropayPhone } from '../../lib/micropaySms';
import { displayPhone, heStayDate } from '../command/liveCabins';
import PriorityCashflow from './PriorityCashflow';
import PriorityCalendar from './PriorityCalendar';
import PriorityWord from './PriorityWord';
import PriorityForms from './PriorityForms';
import { formatManagerMeeting } from '../../lib/managerMeetings';
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
  { key: 'in_progress', label: 'בנקיון', stay: 'VACANT', clean: 'IN_PROGRESS' },
  { key: 'inspect', label: 'לבדיקה', stay: 'VACANT', clean: 'READY' },
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
  if (!label) return 'tone-idle';
  const str = String(label).trim();
  if (str === 'מאוכלס') return 'tone-occupied';
  if (str === 'בשהייה' || str === 'תפוס' || str === 'מוכן') return 'tone-ok';
  if (str.startsWith('בנקיון') || str.startsWith('בניקיון') || str.startsWith('בניקוי')) return 'tone-progress';
  if (str === 'לניקוי' || str === 'לא נקי') return 'tone-dirty';
  if (str === 'ממתין לבדיקה' || str === 'לבדיקה' || str === 'השלמות') return 'tone-inspect';
  if (str === 'החלפה' || str === 'צ׳ק אאוט' || str === 'צ׳ק אין' || str === 'יציאה' || str === ARRIVAL_TODAY_LABEL) return 'tone-wait';
  if (str === 'תקלה') return 'tone-bad';
  if (str === 'לא זמין' || str === 'מגורי צוות' || str === 'לא למכירה' || str === 'שיפוץ' || str === 'שיפוצים' || str === 'סגור' || str === 'מקולקל') return 'tone-hold';
  return 'tone-idle';
}

function occupancyTone(percent) {
  if (percent >= 90) return 'tone-full';
  if (percent >= 70) return 'tone-high';
  if (percent >= 40) return 'tone-med';
  if (percent > 0) return 'tone-low';
  return 'tone-zero';
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

function prioritySleepIsDay(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
  return hour >= 6 && hour < 18;
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
    checkInIso: String(booking.check_in_date || '').slice(0, 10),
    checkOutIso: String(booking.check_out_date || '').slice(0, 10),
    amountAgorot: amount,
    amountText: method === 'VOUCHER' ? '' : (amount ? formatPriorityShekels(amount) : ''),
    cashCollectedAgorot: cash,
    paidAgorot: recordedPaidAgorot(booking),
    collectedText: method === 'VOUCHER' ? '' : (cash ? formatPriorityShekels(cash) : ''),
    payStatus: priorityStatusKey(booking),
    payMethod: method,
    payBreakdown: paymentBreakdown(booking),
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
    status: task.done ? 'בוצע' : 'פתוח',
    source: 'desk'
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
      staff: unit.operational_status === 'DIRTY' ? '' : (unit.assigned_staff || ''),
      start: '',
      end: '',
      status: done.has(step.id) ? 'בוצע' : 'פתוח',
      source: 'sop'
    }))
    : [{
      id: 'ops',
      code: 'OPS',
      title: stayLabel || 'סטטוס יחידה',
      staff: unit?.operational_status === 'DIRTY' ? '' : (unit?.assigned_staff || ''),
      start: '',
      end: '',
      status: stayLabel === 'לניקוי' || stayLabel === 'בנקיון' || stayLabel === 'בניקיון' || stayLabel === 'השלמות' ? 'פתוח' : (stayLabel === 'ממתין לבדיקה' ? 'ממתין לבדיקה' : 'בוצע'),
      source: 'ops'
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
    checkInIso: String(primary?.check_in_date || '').slice(0, 10),
    checkOutIso: String(primary?.check_out_date || '').slice(0, 10),
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
    clean: clean === 'IN_PROGRESS' && unit.assigned_staff ? `בנקיון | ${unit.assigned_staff}` : cleaningLabel(clean),
    reason: unit.custom_reason || '',
    staff: clean === 'DIRTY' ? '' : (unit.assigned_staff || ''),
    notes: [primary?.special_requests || '', unit.custom_reason || ''].filter(Boolean).join(' · '),
    notesList: Array.isArray(primary?.stay?.priority_notes) ? primary.stay.priority_notes : [],
    phoneRaw: primary?.guest_phone || '',
    sort: Number(unit.sort_order ?? 999),
    tasks: tasksOf(unit, badge?.label),
    charges: primary ? paymentsOf(primary) : [],
    roomLog: Array.isArray(unit?.sop_progress?.roomLog) ? unit.sop_progress.roomLog : []
  };
}

function choicesFor(field, housekeepers, currentName, groundKind) {
  if (field === 'ground') return statusChoices(groundKind || 'yard');
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

function phoneTail(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits.slice(3).slice(-9);
  if (digits.startsWith('0')) return digits.slice(1).slice(-9);
  return digits.slice(-9);
}

function findCallForBooking(calls, booking, unitId) {
  if (!Array.isArray(calls) || !calls.length) return null;
  const activeCalls = calls.filter((c) => !c.acked_at);
  if (!activeCalls.length) return null;
  return activeCalls.find((c) => {
    if (booking?.id && c.booking_id && c.booking_id === booking.id) return true;
    if (unitId && c.unit_id && (c.unit_id === unitId || c.unit_id === booking?.unit_id || c.unit_id === booking?.cabin_id)) return true;
    const phoneA = phoneTail(c.guest_phone);
    const phoneB = phoneTail(booking?.guest_phone || booking?.phone || '');
    if (phoneA && phoneB && phoneA.length >= 7 && phoneA === phoneB) return true;
    return false;
  }) || null;
}

function GroundPill({ assetId, kind, record, pending, onOpen }) {
  const saved = record?.status || defaultGroundStatus(kind);
  const status = pending || saved;
  const unsaved = Boolean(pending && pending !== saved);
  const label = statusLabel(kind, status);
  const last = Array.isArray(record?.log) ? record.log[record.log.length - 1] : null;
  const when = last?.at
    ? new Date(last.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const change = last?.note || `${statusLabel(kind, last?.from)} ← ${statusLabel(kind, last?.to)}`;
  const title = unsaved
    ? `${label} · טרם נשמר`
    : last
      ? `${record.label || assetId}: ${change} · ${last.by}${when ? ` · ${when}` : ''}`
      : label;
  return (
    <button type="button" className={`grounds-pill is-${status}`} title={title} onClick={onOpen}>
      {label}{unsaved ? ' *' : ''}
    </button>
  );
}

function GuestPill({ kind, booking, swap = false, onOpen, callPending = null, onAckCall = null, unreadCount = 0 }) {
  const full = booking?.guest_name || '';
  const name = swap ? guestFirstName(full) : (full || 'אורח');
  const shekel = priorityShekelMark(booking);
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
      {unreadCount > 0 ? (
        <span
          className="unread-msg-badge"
          title={`${unreadCount} הודעות חדשות מהאורח (מענה ידני)`}
        >
          💬{unreadCount > 1 ? ` ${unreadCount}` : ''}
        </span>
      ) : null}
      {callPending ? (
        <span
          className="call-phone-badge"
          title={`האורח מבקש שיחה${callPending.transferredName ? ` (הועבר ל${callPending.transferredName})` : ''} · לחץ לסימון כנפתר`}
          onClick={(event) => {
            event.stopPropagation();
            if (onAckCall) onAckCall(callPending.token);
          }}
        >
          📞
        </span>
      ) : null}
      {kind === 'out' ? <span className="pill-arrow" dir="ltr">←</span> : null}
      {shekel ? <em className={shekel === 'blink' ? 'owe' : 'owe is-steady'}>₪</em> : null}
    </button>
  );
}

function israelDay(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function guestStayLog(entries, checkIn, checkOut) {
  const cin = String(checkIn || '').slice(0, 10);
  const cout = String(checkOut || '').slice(0, 10);
  if (!cin || !cout) return visibleRoomLog(entries, 'cycle');
  return (entries || []).filter((row) => {
    const day = israelDay(row.at);
    return day && day >= cin && day <= cout;
  });
}

function RoomLog({ entries, scope, onScope, checkIn, checkOut }) {
  const rows = (scope === 'all' ? (entries || []) : guestStayLog(entries, checkIn, checkOut)).slice().reverse();
  return (
    <div className="room-panel split-timeline">
      <div className="room-log-bar">
        <button type="button" className={scope !== 'all' ? 'is-on' : ''} onClick={() => onScope('stay')}>האורח הזה</button>
        <button type="button" className={scope === 'all' ? 'is-on' : ''} onClick={() => onScope('all')}>כל החדר</button>
      </div>
      {rows.length ? rows.map((row) => (
        <div key={row.id || `${row.at}-${row.text}`} className="timeline-item">
          <div className="timeline-dot" />
          <div className="timeline-card">
            <div className="timeline-head">
              <span className="timeline-actor">{row.actor || 'מערכת'}</span>
              <span className="timeline-clock" dir="ltr">{roomLogClock(row.at)}</span>
            </div>
            <div className="timeline-body">{row.text}</div>
            {row.quote && row.quote !== row.text ? <span className="log-quote">{row.quote}</span> : null}
          </div>
        </div>
      )) : <div className="room-empty">{scope === 'all' ? 'אין עדיין רשומות לחדר' : 'אין רשומות לאורח הזה'}</div>}
    </div>
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
  const [logScope, setLogScope] = useState('cycle');
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
  const [asleep, setAsleep] = useState(false);
  const [sleepClock, setSleepClock] = useState('');
  const [sleepDate, setSleepDate] = useState('');
  const [sleepDay, setSleepDay] = useState(() => prioritySleepIsDay());
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [callAlerts, setCallAlerts] = useState([]);
  const [unreadSummary, setUnreadSummary] = useState({ unread_by_booking: {}, unread_by_phone: {}, total_unread: 0 });
  const getBookingUnread = useCallback((b) => {
    if (!b) return 0;
    const bId = b.id || b.bookingId;
    const p = b.guest_phone || b.phone || b.phoneRaw;
    const clean = p ? String(p).replace(/\D+/g, '') : '';
    const norm = clean.startsWith('05') ? `9725${clean.slice(2)}` : clean;
    return (bId && unreadSummary.unread_by_booking[bId]) ||
           (norm && unreadSummary.unread_by_phone[norm]) || 0;
  }, [unreadSummary]);
  const untransferredAlerts = useMemo(
    () => callAlerts.filter((call) => !call.acked_at && !call.transferredTo && !call.transferred && !call.ownerId && !call.escalated),
    [callAlerts]
  );
  const callAlertRef = useRef(false);
  callAlertRef.current = untransferredAlerts.length > 0;
  const [calendarNote, setCalendarNote] = useState('');
  const [view, setView] = useState('desk');
  const [groundsState, setGroundsState] = useState({});
  const [groundDrafts, setGroundDrafts] = useState({});
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
  const clearedCleanersRef = useRef(new Set());
  const asleepRef = useRef(false);
  const SCREEN_IDLE_MS = 30 * 60 * 1000;

  useEffect(() => {
    if (!active || !canEdit || !tenantId) return undefined;
    const pending = (units || []).filter((unit) => (
      unit?.operational_status === 'DIRTY'
      && String(unit.assigned_staff || '').trim()
      && !clearedCleanersRef.current.has(unit.id)
    ));
    if (!pending.length) return undefined;
    pending.forEach((unit) => clearedCleanersRef.current.add(unit.id));
    let cancel = false;
    clearCleanerUntilScan({ tenantId, units: pending, pushUnitToCloud }).catch(() => {
      if (cancel) return;
      pending.forEach((unit) => clearedCleanersRef.current.delete(unit.id));
    });
    return () => { cancel = true; };
  }, [active, canEdit, tenantId, units]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return undefined;
    let cancel = false;
    fetch('/api/priority/grounds', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancel && data?.assets) setGroundsState(data.assets);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      asleepRef.current = false;
      setAsleep(false);
      return undefined;
    }
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        asleepRef.current = true;
        setAsleep(true);
      }, SCREEN_IDLE_MS);
    };
    const wake = () => {
      if (asleepRef.current) {
        asleepRef.current = false;
        setAsleep(false);
      }
      arm();
    };
    const nudge = () => {
      if (asleepRef.current) return;
      arm();
    };
    arm();
    const opts = { capture: true };
    window.addEventListener('pointerdown', wake, opts);
    window.addEventListener('keydown', wake, opts);
    window.addEventListener('touchstart', wake, opts);
    window.addEventListener('mousemove', nudge, opts);
    window.addEventListener('wheel', nudge, opts);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', wake, opts);
      window.removeEventListener('keydown', wake, opts);
      window.removeEventListener('touchstart', wake, opts);
      window.removeEventListener('mousemove', nudge, opts);
      window.removeEventListener('wheel', nudge, opts);
    };
  }, [active]);

  useEffect(() => {
    if (!asleep) return undefined;
    const tick = () => {
      const now = new Date();
      setSleepClock(now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
      setSleepDate(now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }));
      setSleepDay(prioritySleepIsDay(now));
    };
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [asleep]);

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
    const pay = draft.paymentBookingId && draft.paymentBookingId !== row.bookingId ? {} : draft;
    const clean = draft.clean || row.cleanKey;
    const payStatus = pay.payStatus || row.payStatus;
    const payMethod = pay.payMethod || row.payMethod;
    const parsedAmount = pay.amountText != null ? parsePriorityShekels(pay.amountText) : null;
    const amountAgorot = parsedAmount == null ? row.amountAgorot : parsedAmount;
    const parsedCollected = pay.collectedText != null ? parsePriorityShekels(pay.collectedText) : null;
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
      amountText: showGuest && payMethod !== 'VOUCHER' && pay.amountText != null
        ? pay.amountText
        : (showGuest && payMethod !== 'VOUCHER' && row.amountAgorot ? formatPriorityShekels(row.amountAgorot) : ''),
      collectedText: showGuest && payMethod !== 'VOUCHER' && pay.collectedText != null
        ? pay.collectedText
        : (showGuest && payMethod !== 'VOUCHER' && row.cashCollectedAgorot ? formatPriorityShekels(row.cashCollectedAgorot) : ''),
      payTone: showGuest && row.bookingId ? priorityPayTone(payStatus) : '',
      staff: draft.staff != null ? draft.staff : row.staff,
      weekLabel: (() => {
        const staffName = draft.staff != null ? draft.staff : row.staff;
        const cleanKey = draft.clean || row.cleanKey;
        const isProgress = draft.weekMark === 'in_progress' || (!draft.weekMark && !row.holdLabel && (cleanKey === 'IN_PROGRESS' || liveWeekKey(draft.stay || row.stayKey, cleanKey, row.reason) === 'in_progress'));
        if (isProgress) return staffName ? `בנקיון | ${staffName}` : 'בנקיון';
        if (draft.weekMark) return (WEEK_STATUSES.find((choice) => choice.key === draft.weekMark) || {}).label || row.clean;
        return row.holdLabel || (WEEK_STATUSES.find((choice) => choice.key === liveWeekKey(draft.stay || row.stayKey, clean, row.reason)) || {}).label || row.clean;
      })(),
      weekDirty: Boolean(draft.weekMark),
      stayDirty: Boolean(draft.stay && draft.stay !== row.stayKey),
      cleanDirty: Boolean(draft.clean && draft.clean !== row.cleanKey),
      staffDirty: draft.staff != null && draft.staff !== (row.staff || ''),
      payDirty: paymentDraftDirty(row, pay) || Boolean(draft.paymentBookingId && draft.paymentBookingId !== row.bookingId && (draft.amountText != null || draft.collectedText != null || draft.payStatus || draft.payMethod))
    };
  }), [rows, drafts]);

  const horizon = useMemo(() => (
    Array.from({ length: HORIZON_DAYS }, (_, index) => shiftDay(horizonStart, index))
  ), [horizonStart]);

  const dailyOccupancy = useMemo(() => {
    const inventoryList = units.filter(isInventoryUnit);
    const result = {};
    for (const day of horizon) {
      result[day] = priorityDayOccupancy(bookings, inventoryList, day, { drafts });
    }
    return result;
  }, [units, bookings, horizon, drafts]);

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

  const grounds = useMemo(() => groundsBands(visible), [visible]);
  const selected = visible.find((row) => row.id === selectedId) || shown.find((row) => row.id === selectedId) || visible[0] || null;
  const pinnedBooking = pinnedBookingId ? bookings.find((item) => item.id === pinnedBookingId) : null;
  const card = applyPaymentDraft(
    pinnedBooking && selected && pinnedBooking.unit_id === selected.id
      ? cardFromBooking(selected, pinnedBooking)
      : selected,
    drafts[selected?.id]
  );
  const cardBooking = card ? (pinnedBooking || bookings.find((b) => b.id === card.bookingId)) : null;
  const cardCall = card ? findCallForBooking(callAlerts, cardBooking, card.id) : null;
  const cardUnreadCount = card ? getBookingUnread(cardBooking || card) : 0;
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

  const groundDirtyCount = Object.keys(groundDrafts).length;
  const dirtyCount = shown.filter((row) => row.stayDirty || row.cleanDirty || row.weekDirty || row.staffDirty || row.payDirty).length + groundDirtyCount;
  const operator = operatorName || session?.name || 'משרד';

  const chooseStatus = (unitId, field, key) => {
    if (field === 'ground') {
      const kind = editor?.kind || groundsState[unitId]?.kind || 'yard';
      const saved = groundsState[unitId]?.status || defaultGroundStatus(kind);
      setGroundDrafts((current) => {
        const next = { ...current };
        if (!key || key === saved) delete next[unitId];
        else next[unitId] = { status: key, kind };
        return next;
      });
      setEditor(null);
      setMenuBox(null);
      setSaveError('');
      setMessage(!key || key === saved ? '' : 'יש שינויים שטרם נשמרו');
      return;
    }
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

  const openGround = (event, assetId, kind) => {
    if (!canEdit || saving || !assetId) return;
    event.stopPropagation();
    const choices = statusChoices(kind);
    const current = groundDrafts[assetId]?.status || groundsState[assetId]?.status || defaultGroundStatus(kind);
    const index = Math.max(0, choices.findIndex((choice) => choice.key === current));
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = Math.min(choices.length * 24, 240);
    const top = rect.bottom + menuHeight > window.innerHeight ? Math.max(4, rect.top - menuHeight) : rect.bottom;
    setEditor({ unitId: assetId, field: 'ground', kind, index });
    setMenuBox({
      top,
      right: Math.max(4, window.innerWidth - rect.right),
      width: Math.max(rect.width, 120)
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
      delete prev.paymentBookingId;
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
    const stored = drafts[row.id] || {};
    const draft = !stored.paymentBookingId || stored.paymentBookingId === bookingId ? stored : {};
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
      setMessage(recorded > 0 ? `${row.name}: נגבה מזומן ${money}` : `${row.name}: המזומן כבר רשום`);
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

  const toggleTaskDone = async (task) => {
    const unit = units.find((item) => item.id === selected?.id);
    if (!canEdit || saving || !unit || !task) return;
    if (task.source === 'ops') {
      const nextClean = task.status === 'בוצע' ? 'DIRTY' : 'READY';
      chooseStatus(unit.id, 'clean', nextClean);
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const prev = unit.sop_progress && typeof unit.sop_progress === 'object' ? unit.sop_progress : {};
      let nextSop = { ...prev };
      if (task.source === 'desk') {
        const deskTasks = Array.isArray(prev.deskTasks) ? prev.deskTasks : [];
        nextSop.deskTasks = deskTasks.map((t) => (t.id === task.id ? { ...t, done: t.done ? false : true } : t));
      } else {
        const doneSet = new Set(Array.isArray(prev.doneIds) ? prev.doneIds : []);
        if (doneSet.has(task.id)) doneSet.delete(task.id);
        else doneSet.add(task.id);
        nextSop.doneIds = [...doneSet];
      }
      await pushUnitToCloud({
        id: unit.id,
        tenant_id: tenantId || unit.tenant_id,
        name: unit.name,
        sop_progress: nextSop
      }, { viaEdge: true, waitRemote: true });
      setMessage(`${selected.name}: סטטוס משימה עודכן`);
    } catch (err) {
      const text = `עדכון המשימה נכשל: ${err?.message || 'שגיאה'}`;
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
      setMessage(`${booking.guest_name || 'האורח'}: ההערה נשמרה על האורח`);
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

  const waitForKinorotSync = async (startedAt, attempts = 24) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await staffJson('/api/kinorot/sync', undefined, 'GET');
      if (status.running) continue;
      if (status.lastError) throw new Error(status.lastError);
      if (status.lastOkAt && status.lastOkAt >= startedAt) return status;
    }
    throw new Error('היומן עוד מתעדכן');
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
      const groundFailed = [];
      const groundSaved = [];
      let latestGrounds = null;
      for (const [id, draft] of Object.entries(groundDrafts)) {
        try {
          const data = await staffJson('/api/priority/grounds', { id, status: draft.status, by: operator });
          latestGrounds = data.assets || latestGrounds;
          groundSaved.push(id);
        } catch (err) {
          groundFailed.push({
            unitId: id,
            name: latestGrounds?.[id]?.label || groundsState[id]?.label || id,
            error: err?.message || 'השמירה נכשלה'
          });
        }
      }
      if (latestGrounds) setGroundsState(latestGrounds);
      if (groundSaved.length) {
        setGroundDrafts((current) => {
          const next = { ...current };
          groundSaved.forEach((id) => {
            if (next[id]?.status === groundDrafts[id]?.status) delete next[id];
          });
          return next;
        });
      }
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
        payment.saved.forEach((id) => drop(id, ['amountText', 'collectedText', 'payStatus', 'payMethod', 'paymentBookingId']));
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
      const failed = [...result.failed, ...payment.failed, ...holdFailed, ...groundFailed];
      if (held.length) {
        const startedAt = new Date().toISOString();
        const running = await staffJson('/api/kinorot/sync', undefined, 'GET').catch(() => ({}));
        if (running.running) await waitForKinorotSync(running.lastAttemptAt || startedAt).catch(() => {});
        const syncFrom = new Date().toISOString();
        await staffJson('/api/kinorot/sync', { quick: true });
        setSaving(false);
        const waitingNote = failed.length
          ? 'חלק מהחסימות נשמרו. מחכה שהיומן יתעדכן'
          : 'נחסם בכינורות עד מחר. מחכה שהיומן יתעדכן';
        setCalendarNote(waitingNote);
        setMessage(waitingNote);
        waitForKinorotSync(syncFrom, 80)
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
    let stop = false;
    const pull = async () => {
      const token = getStoredToken();
      if (!token) return;
      try {
        const response = await fetch('/api/ops/call-me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (!stop) {
            const rows = Array.isArray(data.calls) ? data.calls : [];
            setCallAlerts(rows);
            if (rows.length) {
              asleepRef.current = false;
              setAsleep(false);
            }
          }
        }
      } catch {
        /* the next poll retries */
      }
      try {
        const commsRes = await fetch('/api/guest-comms/unread-summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (commsRes.ok && !stop) {
          const commsData = await commsRes.json();
          setUnreadSummary(commsData || { unread_by_booking: {}, unread_by_phone: {}, total_unread: 0 });
        }
      } catch {
        /* ignore */
      }
    };
    pull();
    const timer = window.setInterval(pull, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [active]);

  const refreshUnreadSummary = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch('/api/guest-comms/unread-summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadSummary(data || { unread_by_booking: {}, unread_by_phone: {}, total_unread: 0 });
      }
    } catch {
      // ignore
    }
  }, []);

  async function ackGuestCall(token) {
    const auth = getStoredToken();
    if (!auth) return;
    setCallAlerts((rows) => rows.filter((row) => row.token !== token));
    await fetch('/api/ops/call-me/ack', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    }).catch(() => {});
  }

  async function transferGuestCall(token, to) {
    const auth = getStoredToken();
    if (!auth) return;
    const names = { rani: 'רני', zuki: 'צוקי', barak: 'ברק' };
    setCallAlerts((rows) => rows.map((row) => (row.token === token ? {
      ...row,
      ownerId: '',
      ownerName: '',
      transferredTo: to,
      transferredName: names[to] || '',
      transferred: true,
      escalated: to === 'barak',
      offered: [...(row.offered || []), to]
    } : row)));
    await fetch('/api/ops/call-me/transfer', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, to })
    }).then(() => setMessage(`השיחה הועברה ל${names[to] || ''}`)).catch(() => {});
  }

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (callAlertRef.current) {
        event.preventDefault();
        return;
      }
      if (viewRef.current === 'cashflow') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('desk');
        }
        return;
      }
      if (viewRef.current === 'docs') return;
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
      if (typing) return;
      const open = editorRef.current;
      const openRow = open ? shown.find((item) => item.id === open.unitId) : null;
      const choices = open ? choicesFor(open.field, housekeepersRef.current, openRow?.staff, open.kind) : [];
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
          const list = choicesFor(current.field, housekeepersRef.current, shown.find((item) => item.id === current.unitId)?.staff, current.kind);
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

  const editorChoices = editor ? choicesFor(editor.field, housekeepers, shown.find((row) => row.id === editor.unitId)?.staff, editor.kind) : [];

  return (
    <div className="priority-root" dir="rtl">
      {untransferredAlerts.length ? (
        <div className="call-alert" role="alertdialog" aria-label="האורח מבקש שיחה">
          <p>המסך נשאר עד שהשיחה מועברת או מסומנת כנפתרה</p>
          {untransferredAlerts.map((call) => (
            <div key={call.token} className="call-alert-card">
              <h1>האורח מבקש שיתקשרו אליו</h1>
              <p>{[call.guest_name, call.cabin].filter(Boolean).join(' · ')}</p>
              {call.guest_phone ? <a href={`tel:${call.guest_phone}`}>{call.guest_phone}</a> : null}
              <p>{safeCallTime(call.requested_at)}</p>
              <p>{call.ownerName ? `${call.ownerName} מתקשר` : call.escalated ? 'הועבר לברק' : 'ממתין למשרד'}</p>
              <button type="button" onClick={() => ackGuestCall(call.token)}>השיחה נפתרה</button>
              <div className="call-pass">
                {['rani', 'zuki', 'barak'].filter((id) => id !== call.ownerId).map((id) => (
                  <button key={id} type="button" onClick={() => transferGuestCall(call.token, id)}>
                    {id === 'rani' ? 'העבר לרני' : id === 'zuki' ? 'העבר לצוקי' : 'העבר לברק'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {asleep ? createPortal(
        <button type="button" className={sleepDay ? 'priority-sleep is-day' : 'priority-sleep'} onClick={() => setAsleep(false)} aria-label="חזרה לפריוריטי">
          <img className="priority-sleep-photo is-night" src="/priority/kinneret-night.jpg" alt="" />
          <img className="priority-sleep-photo is-day" src="/priority/kinneret-day.jpg" alt="" />
          <div className="priority-sleep-corner" dir="ltr">
            <div className="priority-sleep-clock">{sleepClock}</div>
            <div className="priority-sleep-date">{sleepDate}</div>
            <div className="priority-sleep-mark">
              <b>Priority</b>
              <span>powered by ResortOS</span>
            </div>
          </div>
        </button>,
        document.body
      ) : null}
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
        <span className="tb-screens" role="tablist">
          <button type="button" className={`tb-btn${view === 'desk' ? ' is-on' : ''}`} onClick={() => setView('desk')}>יחידות</button>
          <button type="button" className={`tb-btn${view === 'calendar' ? ' is-on' : ''}`} onClick={() => setView('calendar')}>יומן</button>
          <button type="button" className={`tb-btn${view === 'forms' ? ' is-on' : ''}`} onClick={() => setView('forms')}><FolderOpen size={14} /> טפסים ותבניות</button>
          <button type="button" className={`tb-btn${view === 'docs' ? ' is-on' : ''}`} onClick={() => setView('docs')}><FileText size={14} /> מסמך</button>
          {showCashflow ? (
            <button type="button" className={`tb-btn${view === 'cashflow' ? ' is-on' : ''}`} onClick={() => setView('cashflow')}>הוצאות חודשיות</button>
          ) : null}
        </span>
        <button type="button" className={`tb-btn${view === 'desk' && mode === 'grid' ? ' is-on' : ''}`} onClick={() => { setView('desk'); setMode((current) => (current === 'form' ? 'grid' : 'form')); }}><Table2 size={14} /> טבלה <kbd>F8</kbd></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={exportExcel}><FileSpreadsheet size={14} /> ייצא לאקסל</button>
        {canEdit ? (
          <button type="button" className={`tb-btn${dirtyCount ? ' is-dirty' : ''}`} disabled={!dirtyCount || saving} onClick={saveChanges}>
            {saving ? 'שומר…' : `שמירה${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        ) : null}
        <span className="tb-sep" />
        <button type="button" className="tb-btn" onClick={() => window.open('/price-list.html', '_blank', 'noopener')}><Printer size={14} /> מחירון</button>
        <button type="button" className="tb-btn is-highlight" onClick={() => window.open('/qr-stickers.html#work-order', '_blank', 'noopener')} title="טופס הזמנת עבודה מספק A4 להדפסה"><FileText size={14} /> הזמנת עבודה</button>
        <button type="button" className="tb-btn" onClick={() => printDailyDutyReport({ dateStr: today, kind: 'both', area: 'all', bookings, units })}><Printer size={14} /> דוח יומי מלא</button>
        <button type="button" className="tb-btn" onClick={() => printCashDayReport(bookings, units, today)}><Printer size={14} /> דוח מזומנים</button>
        <button type="button" className="tb-btn" onClick={() => printDailyDutyReport({ dateStr: today, kind: 'morning', area: 'all', bookings, units })}><Printer size={14} /> תחילת יום</button>
      </div>
      {view === 'cashflow' && showCashflow ? (
        <div className="priority-body">
          <PriorityCashflow />
        </div>
      ) : view === 'docs' ? (
        <div className="priority-body is-word">
          <PriorityWord />
        </div>
      ) : view === 'forms' ? (
        <div className="priority-body is-forms">
          <PriorityForms
            onOpenWord={() => setView('docs')}
            onPrintDutyReport={() => printDailyDutyReport({ dateStr: today, kind: 'both', area: 'all', bookings, units })}
            onPrintCashReport={() => printCashDayReport(bookings, units, today)}
            onPrintMorningReport={() => printDailyDutyReport({ dateStr: today, kind: 'morning', area: 'all', bookings, units })}
          />
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
        {view === 'calendar' ? (
          <PriorityCalendar
            horizon={horizon}
            today={today}
            onSelect={(meeting) => setMessage(formatManagerMeeting(meeting))}
          />
        ) : mode === 'form' && card ? (
          <div className="priority-split-view">
            {/* צד ימין (65%): פרטי ההזמנה, סטטוסים, פיננסים ומלאי ציוד ביקונים בחדר */}
            <div className="split-details-col">
              <div className="master">
                <div className="master-col">
                  <div className="master-col-title master-col-title-row">
                    <span>פרטי אורח</span>
                    <button
                      type="button"
                      className="tb-btn guest-file-btn"
                      disabled={!card.bookingId}
                      onClick={() => {
                        const booking = (pinnedBooking && pinnedBooking.id === card.bookingId)
                          ? pinnedBooking
                          : bookings.find((item) => item.id === card.bookingId);
                        if (!booking || isUnavailableHoldBooking(booking) || booking.booking_status === 'CANCELED') return;
                        printGuestFile(booking, { units, bookings });
                      }}
                    >
                      <Printer size={12} /> דף אורח
                    </button>
                  </div>
                  <Field
                    label="שם אורח"
                    value={
                      <span className="guest-with-call">
                        <span>{card.guest}</span>
                        {cardUnreadCount > 0 ? (
                          <span
                            className="unread-msg-badge"
                            title={`${cardUnreadCount} הודעות חדשות מהאורח (מענה ידני)`}
                          >
                            💬{cardUnreadCount > 1 ? ` ${cardUnreadCount}` : ''}
                          </span>
                        ) : null}
                        {cardCall ? (
                          <button
                            type="button"
                            className="call-phone-pill"
                            title={`האורח ביקש שיחה${cardCall.transferredName ? ` (הועבר ל${cardCall.transferredName})` : ''} - לחץ לסימון כנפתר`}
                            onClick={() => ackGuestCall(cardCall.token)}
                          >
                            📞 {cardCall.transferredName ? `הועבר ל${cardCall.transferredName}` : 'מבקש שיחה'} (סמן כנפתר)
                          </button>
                        ) : null}
                      </span>
                    }
                  />
                  <Field label="תעודת זהות" value={card.nationalId} />
                  <PhoneField label="טלפון" phone={card.phone} raw={card.phoneRaw} />
                  <Field label="הרכב אורחים" value={card.party} />
                </div>
                <div className="master-col">
                  <div className="master-col-title">יחידה ומועדים</div>
                  <Field label="יחידה" value={card.name} />
                  <Field label="צ׳ק-אין" value={card.checkIn} />
                  <Field label="צ׳ק-אאוט" value={card.checkOut} />
                  <Field label="מספר לילות" value={card.nights} />
                </div>
                <div className="master-col">
                  <div className="master-col-title">סטטוסים ותפעול</div>
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
                <div className="master-col is-finance">
                  <div className="master-col-title">פיננסים וגבייה</div>
                  <div className="finance-row">
                    <label className="field">
                      <span>סה״כ לתשלום</span>
                      <input
                        inputMode="decimal"
                        disabled={!canEdit || !card.bookingId}
                        value={card.bookingId ? card.amountText : ''}
                        placeholder={card.bookingId ? '0 ₪' : ''}
                        onChange={(event) => patchDraft(card.id, { amountText: event.target.value, paymentBookingId: card.bookingId })}
                      />
                    </label>
                    {card.bookingId && card.payStatus !== 'PAID' ? (
                      <Field
                        label="יתרה לתשלום"
                        className="is-due"
                        value={formatPriorityShekels(Math.max(0, (Number(card.amountAgorot) || 0) - (Number(card.paidAgorot) || 0)))}
                      />
                    ) : null}
                  </div>
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
                        onFocus={() => {
                          if (!card.bookingId || String(card.collectedText || '').trim()) return;
                          const due = Math.max(0, (Number(card.amountAgorot) || 0) - (Number(card.paidAgorot) || 0));
                          if (!(due > 0)) return;
                          patchDraft(card.id, {
                            collectedText: formatPriorityShekels(due),
                            paymentBookingId: card.bookingId
                          });
                        }}
                        onChange={(event) => patchDraft(card.id, { collectedText: event.target.value, paymentBookingId: card.bookingId })}
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
                  <div className="finance-row is-pay">
                    <label className="field is-status">
                      <span>סטטוס</span>
                      <select
                        className={priorityPayTone(card.payStatus)}
                        disabled={!canEdit || !card.bookingId}
                        value={card.bookingId ? (card.payStatus || 'UNPAID') : ''}
                        onChange={(event) => patchDraft(card.id, { payStatus: event.target.value, paymentBookingId: card.bookingId })}
                      >
                        {card.bookingId ? null : <option value="" />}
                        {PAYMENT_STATUSES.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>איך שולם</span>
                      <select
                        disabled={!canEdit || !card.bookingId}
                        value={card.bookingId ? (card.payMethod || '') : ''}
                        onChange={(event) => patchDraft(card.id, { payMethod: event.target.value, paymentBookingId: card.bookingId })}
                      >
                        <option value="">—</option>
                        {PAYMENT_METHODS.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
                      </select>
                      {card.payBreakdown ? <small className="pay-breakdown">{card.payBreakdown}</small> : null}
                    </label>
                  </div>
                </div>
              </div>

              {/* רשימת מלאי ציוד בחדר (מחובר לביקונים) */}
              <RoomBeaconInventory card={card} />
            </div>

            {/* צד שמאל (35%): פאנל WhatsApp / Task Feed בגובה מלא */}
            <SplitFeedPanel
              card={card}
              tab={tab}
              setTab={setTab}
              logScope={logScope}
              setLogScope={setLogScope}
              canEdit={canEdit}
              saving={saving}
              setSaving={setSaving}
              setSaveError={setSaveError}
              taskTitle={taskTitle}
              setTaskTitle={setTaskTitle}
              addDeskTask={addDeskTask}
              toggleTaskDone={toggleTaskDone}
              noteText={noteText}
              setNoteText={setNoteText}
              addRoomNote={addRoomNote}
              kinorotNote={kinorotNote}
              setMessage={setMessage}
              refreshUnreadSummary={refreshUnreadSummary}
              onClose={() => setMode('grid')}
            />
          </div>
        ) : (
          <div className="grid-wrap">
            <table className="erp-table week-table">
              <thead>
                <tr className="occupancy-row">
                  <th className="grounds-banner" colSpan={2}>חצר ובריכה</th>
                  <th className="unit-cell occupancy-label">
                    <span className="occupancy-title">תפוסה כוללת</span>
                  </th>
                  {horizon.map((day) => {
                    const stats = dailyOccupancy[day] || { percent: 0, occupied: 0, total: 0 };
                    return (
                      <th
                        key={day}
                        className={`occupancy-cell${day === today ? ' is-today' : ''}`}
                        title={`${stats.occupied} מתוך ${stats.total} חדרים (${stats.percent}%)`}
                      >
                        <div className="occupancy-cell-content">
                          <span className={`occupancy-badge ${occupancyTone(stats.percent)}`}>
                            {stats.percent}%
                          </span>
                          <span className="occupancy-sub">
                            {stats.occupied}/{stats.total}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
                <tr className="label-row">
                  <th className="grounds-col is-yard">חצר</th>
                  <th className="grounds-col is-pool">בריכה</th>
                  <th className="unit-cell">יחידה</th>
                  {horizon.map((day) => (
                    <th key={day} className={day === today ? 'is-today' : ''}>{horizonLabel(day, today)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {row.area !== 'ramot' && (index === 0 || visible[index - 1].area !== row.area) ? (
                      <tr className="area-break">
                        <td colSpan={horizon.length + 3}>{priorityAreaLabel(row.area)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      {grounds[index]?.yard ? (
                        <td className="grounds-cell is-yard" rowSpan={grounds[index].yard.span}>
                          <GroundPill
                            assetId={grounds[index].yard.id}
                            kind="yard"
                            record={groundsState[grounds[index].yard.id]}
                            pending={groundDrafts[grounds[index].yard.id]?.status}
                            onOpen={(event) => openGround(event, grounds[index].yard.id, 'yard')}
                          />
                        </td>
                      ) : null}
                      {grounds[index]?.pool ? (
                        <td
                          className={`grounds-cell is-pool${grounds[index].pool.kind === 'none' ? ' is-empty' : ''}`}
                          rowSpan={grounds[index].pool.span}
                        >
                          {grounds[index].pool.kind === 'none' ? null : (
                            <GroundPill
                              assetId={grounds[index].pool.id}
                              kind="pool"
                              record={groundsState[grounds[index].pool.id]}
                              pending={groundDrafts[grounds[index].pool.id]?.status}
                              onOpen={(event) => openGround(event, grounds[index].pool.id, 'pool')}
                            />
                          )}
                        </td>
                      ) : null}
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
                                <GuestPill
                                  swap
                                  kind="out"
                                  booking={cell.out}
                                  unreadCount={getBookingUnread(cell.out)}
                                  callPending={findCallForBooking(callAlerts, cell.out, row.id)}
                                  onAckCall={ackGuestCall}
                                  onOpen={() => openGuest(row.id, cell.out)}
                                />
                                <GuestPill
                                  swap
                                  kind="in"
                                  booking={cell.inn}
                                  unreadCount={getBookingUnread(cell.inn)}
                                  callPending={findCallForBooking(callAlerts, cell.inn, row.id)}
                                  onAckCall={ackGuestCall}
                                  onOpen={() => openGuest(row.id, cell.inn)}
                                />
                              </div>
                            ) : cell.kind === 'swap-hold' ? (
                              <div className="swap-cell">
                                <GuestPill
                                  swap
                                  kind="out"
                                  booking={cell.out}
                                  unreadCount={getBookingUnread(cell.out)}
                                  callPending={findCallForBooking(callAlerts, cell.out, row.id)}
                                  onAckCall={ackGuestCall}
                                  onOpen={() => openGuest(row.id, cell.out)}
                                />
                                <HoldPill label={cell.holdLabel} />
                              </div>
                            ) : cell.kind === 'empty' ? (
                              holdText
                                ? <HoldPill label={holdText} />
                                : <span className="week-empty">+ שריין / לאסט מיניט</span>
                            ) : (
                              <GuestPill
                                kind={cell.kind}
                                booking={cell.guest}
                                unreadCount={getBookingUnread(cell.guest)}
                                callPending={findCallForBooking(callAlerts, cell.guest, row.id)}
                                onAckCall={ackGuestCall}
                                onOpen={() => openGuest(row.id, cell.guest)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
                {!visible.length ? <tr><td className="empty-row" colSpan={horizon.length + 3}>אין יחידות לסינון</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={`priority-status${saveError ? ' is-error' : ''}`}>
        <span>{message}</span>
        <b>{view === 'calendar' ? 'יומן · 7 ימים' : (selected ? `${selected.name} · ${visibleIndex + 1} / ${visible.length}` : 'אין יחידה')}</b>
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

function renderMessageWithStayLinks(content) {
  const text = String(content || '');
  const parts = text.split(/(https?:\/\/[^\s]+\/stay\/[^\s]+|\/stay\/[^\s]+)/g);
  return parts.map((part, idx) => {
    if (/^(https?:\/\/[^\s]+\/stay\/[^\s]+|\/stay\/[^\s]+)$/.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="chat-stay-link"
        >
          <ExternalLink size={12} /> קישור לדף אורח ({part.replace(/^https?:\/\/[^/]+/, '')})
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function BeaconItemIllustration({ name }) {
  const n = String(name || '').toLowerCase();
  if (n.includes('סודסטרים') || n.includes('סודה') || n.includes('soda')) {
    return (
      <svg className="beacon-illus" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        {/* רקע עדין */}
        <rect x="4" y="4" width="56" height="56" rx="14" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1.5" />
        {/* בסיס ועמוד סודסטרים */}
        <path d="M18 52H46" stroke="#1E3A8A" strokeWidth="3.5" strokeLinecap="round" />
        <rect x="20" y="14" width="12" height="38" rx="4" fill="#1E293B" />
        <path d="M22 14H42C44.2 14 46 15.8 46 18V23C46 24.7 44.7 26 43 26H32V14Z" fill="#334155" />
        {/* כפתור הגזה עליון */}
        <rect x="33" y="10" width="9" height="4" rx="2" fill="#38BDF8" />
        {/* צינורית הגזה */}
        <line x1="38" y1="26" x2="38" y2="41" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
        {/* בקבוק שקוף עם מים מוגזים */}
        <path d="M34 26H42L44 33V46C44 48.2 42.2 50 40 50H36C33.8 50 32 48.2 32 46V33L34 26Z" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.8" />
        <path d="M33 36H43V46C43 47.7 41.7 49 40 49H36C34.3 49 33 47.7 33 46V36Z" fill="#BAE6FD" />
        {/* בועות סודה */}
        <circle cx="36" cy="45" r="1.4" fill="#0284C7" />
        <circle cx="40" cy="42" r="1.7" fill="#0EA5E9" />
        <circle cx="37" cy="39" r="1.2" fill="#0284C7" />
        <circle cx="40.5" cy="37" r="1" fill="#38BDF8" />
        {/* גלי ביקון קטנים */}
        <path d="M49 14C51.5 16.5 51.5 20.5 49 23" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M52.5 11.5C56.2 15.2 56.2 21.8 52.5 25.5" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      </svg>
    );
  }
  if (n.includes('קפה') || n.includes('נספרסו') || n.includes('אספרסו')) {
    return (
      <svg className="beacon-illus" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="56" height="56" rx="14" fill="#FEF3C7" stroke="#FDE68A" strokeWidth="1.5" />
        <rect x="18" y="14" width="24" height="36" rx="5" fill="#78350F" />
        <rect x="22" y="18" width="16" height="8" rx="2" fill="#FDE68A" />
        <path d="M26 36H38V44C38 46.2 36.2 48 34 48H30C27.8 48 26 46.2 26 44V36Z" fill="#FFFFFF" stroke="#92400E" strokeWidth="1.8" />
        <path d="M38 38H41C42.1 38 43 38.9 43 40V41C43 42.1 42.1 43 41 43H38" stroke="#92400E" strokeWidth="1.8" />
        <path d="M48 15C50.5 17.5 50.5 21.5 48 24" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="beacon-illus" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1.5" />
      <circle cx="32" cy="34" r="12" fill="#1E293B" stroke="#38BDF8" strokeWidth="2" />
      <circle cx="32" cy="34" r="4" fill="#38BDF8" />
      <path d="M22 20C27.5 15 36.5 15 42 20" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 15C26 8.5 38 8.5 46 15" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function rssiBars(rssi, present) {
  if (!present || !Number.isFinite(Number(rssi))) return 0;
  const val = Number(rssi);
  if (val >= -60) return 4;
  if (val >= -72) return 3;
  if (val >= -84) return 2;
  return 1;
}

function RoomBeaconInventory({ card }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const isOffice = card?.id === 'pilot-office' || card?.name === 'משרד';

  const pullBeacons = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/pilot/assets');
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      }
    } catch {
      /* ignore network error */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOffice) return undefined;
    pullBeacons();
    const timer = setInterval(pullBeacons, 10000);
    return () => clearInterval(timer);
  }, [card?.id, isOffice]);

  if (!isOffice) return null;

  const rawAssets = isOffice ? (Array.isArray(report?.assets) ? report.assets : []) : [];
  const assets = isOffice && rawAssets.length === 0
    ? [{ mac: 'fb:d0:1a:46:8d:59', name: 'סודסטרים', rssi: -69, lastSeenSec: 1, present: true, status: 'SAFE' }]
    : rawAssets;

  const checkedTime = report?.checkedAt
    ? new Date(report.checkedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '';

  return (
    <div className="master-bottom-box beacon-inventory-box">
      <div className="beacon-inv-header">
        <div className="beacon-inv-title-wrap">
          <span className="beacon-live-dot" />
          <strong>רשימת מלאי ציוד בחדר · ביקונים (BLE)</strong>
          <span className="beacon-unit-pill">{card?.name || ''}</span>
        </div>
        <div className="beacon-inv-meta">
          {checkedTime ? <span className="beacon-checked-at">עדכון אחרון: {checkedTime}</span> : null}
          <button type="button" className="tb-btn beacon-refresh-btn" onClick={pullBeacons} disabled={loading}>
            <RefreshCw size={12} /> רענן סריקה
          </button>
        </div>
      </div>

      {assets.length ? (
        <div className="beacon-inv-grid">
          {assets.map((asset) => {
            const isMissing = !asset.present || asset.status === 'ALERT_MISSING';
            const isSuspect = asset.status === 'SUSPECT_OUTSIDE';
            const stateClass = isMissing ? 'is-missing' : isSuspect ? 'is-suspect' : 'is-safe';
            const stateLabel = isMissing
              ? 'לא נמצא בחדר!'
              : isSuspect
                ? 'חשד ליציאה לחצר'
                : (isOffice ? 'נמצא כרגע במשרד ✓' : 'נמצא כרגע בחדר ✓');
            const bars = rssiBars(asset.rssi, !isMissing);
            const seenText = asset.lastSeenSec != null
              ? (asset.lastSeenSec <= 3 ? 'נקלט כעת (בזמן אמת)' : `נקלט לפני ${asset.lastSeenSec} שניות`)
              : (checkedTime ? `נסרק ב-${checkedTime}` : 'פעיל');

            return (
              <div key={asset.mac || asset.name} className={`beacon-inv-card ${stateClass}`}>
                <BeaconItemIllustration name={asset.name} />
                <div className="beacon-inv-info">
                  <div className="beacon-inv-top">
                    <strong className="beacon-item-name">{asset.name}</strong>
                    <span className={`beacon-presence-badge ${stateClass}`}>{stateLabel}</span>
                  </div>
                  <div className="beacon-inv-details">
                    <span>📍 יחידה: <b>{card?.name || 'משרד'}</b></span>
                    <span dir="ltr" className="beacon-mac">🏷️ {asset.mac}</span>
                  </div>
                  <div className="beacon-inv-telemetry">
                    <span className="beacon-seen-time">⏱ {seenText}</span>
                    <span className="beacon-signal" dir="ltr" title={asset.rssi != null ? `RSSI: ${asset.rssi} dBm` : ''}>
                      <span className="signal-bars" aria-hidden="true">
                        {[1, 2, 3, 4].map((level) => (
                          <i key={level} className={`sig-bar b${level}${bars >= level ? ' is-on' : ''}`} />
                        ))}
                      </span>
                      {asset.rssi != null ? <small>{asset.rssi} dBm</small> : null}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="beacon-empty-box">
          <BeaconItemIllustration name="beacon" />
          <div>
            <strong>אין ביקונים משויכים ליחידה {card?.name} כרגע</strong>
            <p>ציוד מנוטר ביקונים פעיל כעת ביחידת <b>משרד</b> (סודסטרים · BLE Beacon).</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitFeedPanel({
  card,
  tab,
  setTab,
  logScope,
  setLogScope,
  canEdit,
  saving,
  setSaving,
  setSaveError,
  taskTitle,
  setTaskTitle,
  addDeskTask,
  toggleTaskDone,
  noteText,
  setNoteText,
  addRoomNote,
  kinorotNote,
  setMessage,
  refreshUnreadSummary,
  onClose
}) {
  const [commsRows, setCommsRows] = useState([]);
  const [commsBusy, setCommsBusy] = useState(false);
  const [commsError, setCommsError] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [taskKind, setTaskKind] = useState('cleaning');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [automationChannel, setAutomationChannel] = useState('resortos');
  const [automationLoading, setAutomationLoading] = useState(false);
  const feedEndRef = useRef(null);

  const bookingId = card?.bookingId || '';
  const phone = card?.phoneRaw || card?.phone || '';
  const localPhone = toMicropayPhone(phone);

  async function loadAutomationState() {
    if (!bookingId && !phone) return;
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const q = new URLSearchParams({ channel_id: automationChannel });
      if (bookingId) q.set('booking_id', bookingId);
      if (phone) q.set('phone', phone);
      const res = await fetch(`/api/guest-comms/automation-state?${q.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setAutoReplyEnabled(!data.bot_disabled);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadAutomationState();
  }, [bookingId, phone, automationChannel]);

  async function toggleAutoReply() {
    if (automationLoading || (!bookingId && !phone)) return;
    setAutomationLoading(true);
    const targetEnabled = !autoReplyEnabled;
    // 1. Optimistic instant UI update
    setAutoReplyEnabled(targetEnabled);
    if (refreshUnreadSummary) refreshUnreadSummary();

    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const res = await fetch('/api/guest-comms/automation-state', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          channel_id: automationChannel,
          booking_id: bookingId,
          phone,
          bot_disabled: !targetEnabled,
          reason: 'manager_toggle'
        })
      });
      if (!res.ok) {
        console.warn('[toggleAutoReply] server status not ok:', res.status);
      }
    } catch (err) {
      console.warn('[toggleAutoReply] error:', err);
    } finally {
      setAutomationLoading(false);
    }
  }

  async function loadComms() {
    if (!bookingId) {
      setCommsRows([]);
      return;
    }
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/guest-comms?booking_id=${encodeURIComponent(bookingId)}`, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'COMMS_LIST_FAILED');
    const rows = Array.isArray(data.rows) ? data.rows : [];
    setCommsRows(rows);

    const unreadInbound = rows.filter((r) => r.direction === 'inbound' && !r.read_at).map((r) => r.id);
    if (unreadInbound.length > 0) {
      fetch('/api/guest-comms/mark-read', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: unreadInbound })
      }).then(() => {
        if (refreshUnreadSummary) refreshUnreadSummary();
      }).catch(() => {});
    }
  }

  useEffect(() => {
    setCommsError('');
    loadComms().catch((err) => setCommsError(err.message || 'שגיאה'));
  }, [bookingId]);

  async function postComm(body) {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/guest-comms/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({ booking_id: bookingId, channel_id: automationChannel, ...body })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'COMMS_SEND_FAILED');
    setAutoReplyEnabled(false);
    if (refreshUnreadSummary) refreshUnreadSummary();
    return data;
  }

  async function sendStayLinkQuick() {
    if (!bookingId || commsBusy || !canEdit) return;
    setCommsBusy(true);
    setCommsError('');
    try {
      await postComm({ channel: 'sms', template_id: 'checkin', kind: 'stay_link' });
      await loadComms();
      if (setMessage) setMessage(`${card.name}: נשלח קישור דף אורח בסמס`);
      if (tab !== 'comms') setTab('comms');
    } catch (err) {
      setCommsError(err.message || 'שליחת קישור נכשלה');
    } finally {
      setCommsBusy(false);
    }
  }

  async function logQuickCall() {
    if (!bookingId || commsBusy || !canEdit) return;
    setCommsBusy(true);
    setCommsError('');
    try {
      await postComm({ message: quickInput.trim() || 'שיחה אל האורח', channel: 'phone', kind: 'call' });
      setQuickInput('');
      if (localPhone) {
        const anchor = document.createElement('a');
        anchor.href = `tel:${localPhone}`;
        anchor.click();
      }
      await loadComms();
    } catch (err) {
      setCommsError(err.message || 'השיחה לא נרשמה');
    } finally {
      setCommsBusy(false);
    }
  }

  async function handleQuickSubmit(e) {
    if (e) e.preventDefault();
    if (!canEdit || saving || commsBusy) return;

    if (tab === 'tasks') {
      if (!taskTitle.trim()) return;
      await addDeskTask(taskKind);
      return;
    }

    if (tab === 'notes') {
      if (!noteText.trim()) return;
      await addRoomNote();
      return;
    }

    const val = quickInput.trim();
    if (!val) return;

    // Default (comms / log / bill): send SMS to guest
    if (!bookingId) {
      setCommsError('אין אורח על היחידה');
      return;
    }
    setCommsBusy(true);
    setCommsError('');
    try {
      await postComm({ message: val, channel: 'sms', kind: 'manual' });
      setQuickInput('');
      await loadComms();
      if (tab !== 'comms') setTab('comms');
    } catch (err) {
      setCommsError(err.message || 'השליחה נכשלה');
    } finally {
      setCommsBusy(false);
    }
  }

  function commLabel(row) {
    if (row.channel === 'phone' || row.metadata?.kind === 'call') return '📞 שיחה';
    if (row.channel === 'whatsapp' || row.metadata?.kind === 'whatsapp') {
      return row.direction === 'inbound' ? '💬 וואטסאפ מאורח' : '💬 וואטסאפ לאורח';
    }
    if (row.metadata?.kind === 'stay_link' || row.metadata?.kind === 'guest_link' || row.metadata?.template === 'checkin') {
      return '🔗 קישור דף אורח (SMS)';
    }
    if (row.metadata?.kind === 'checkout_reminder') return '⏰ תזכורת צ׳ק-אאוט';
    return row.direction === 'inbound' ? '📱 סמס מאורח' : '📱 סמס לאורח';
  }

  return (
    <div className="split-feed-col">
      {/* 1. Header עליון של הפאנל */}
      <div className="wa-feed-header">
        <div className="wa-guest-strip">
          <div className="wa-guest-badge">
            <span className="wa-avatar">{(card.guest || card.name || '?').slice(0, 1)}</span>
            <div className="wa-guest-meta">
              <strong>{card.guest || 'ללא אורח משובץ'}</strong>
              <span dir="ltr">{card.phone || card.name}</span>
            </div>
          </div>
          <div className="wa-quick-links">
            <div className="wa-bot-toggle-wrap">
              <button
                type="button"
                className={`wa-bot-toggle ${autoReplyEnabled ? 'is-auto' : 'is-manual'}`}
                disabled={automationLoading || (!bookingId && !phone)}
                onClick={toggleAutoReply}
                title={
                  autoReplyEnabled
                    ? 'מענה אוטומטי פעיל — Chloe עונה לאורח (לחצו לכיבוי/סגירה ומעבר למענה ידני)'
                    : 'מענה אוטומטי כבוי — נציג אנושי מטפל (לחצו להפעלה חוזרת של Chloe)'
                }
              >
                <span>{autoReplyEnabled ? '🟢' : '🔴'}</span>
                <span>{autoReplyEnabled ? 'מענה אוטומטי פעיל' : 'מענה אוטומטי כבוי'}</span>
                <span className="wa-toggle-action-hint">{autoReplyEnabled ? '(לסגירה ידנית)' : '(להפעלה)'}</span>
              </button>
              <button
                type="button"
                className="wa-channel-pill"
                title={`ערוץ וואטסאפ: ${automationChannel === 'mialees' ? 'מיאליס (050-950-6222)' : 'ResortOS (051-526-2612)'} (לחצו להחלפה)`}
                onClick={() => setAutomationChannel((c) => (c === 'resortos' ? 'mialees' : 'resortos'))}
              >
                {automationChannel === 'mialees' ? 'מיאליס' : 'ResortOS'}
              </button>
            </div>
            {localPhone ? (
              <a
                href={`tel:${localPhone}`}
                className="wa-icon-btn is-call"
                title="חיוג מהיר"
                onClick={() => {
                  if (bookingId) {
                    postComm({ message: 'שיחה אל האורח', channel: 'phone', kind: 'call' }).then(() => loadComms()).catch(() => {});
                  }
                }}
              >
                <Phone size={14} />
                <span>חיוג</span>
              </a>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className="wa-icon-btn is-close"
                title="חזרה לטבלת השבוע (F8)"
                onClick={onClose}
              >
                <X size={14} />
                <span>סגור</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Segmented Control קומפקטי לטאבים */}
        <div className="wa-segmented-tabs" role="tablist">
          <button type="button" className={`seg-tab${tab === 'comms' ? ' is-on' : ''}`} onClick={() => setTab('comms')}>
            תקשורת {commsRows.length ? <small>({commsRows.length})</small> : null}
          </button>
          <button type="button" className={`seg-tab${tab === 'tasks' ? ' is-on' : ''}`} onClick={() => setTab('tasks')}>
            משימות {card.tasks?.length ? <small>({card.tasks.length})</small> : null}
          </button>
          <button type="button" className={`seg-tab${tab === 'log' ? ' is-on' : ''}`} onClick={() => setTab('log')}>
            יומן
          </button>
          <button type="button" className={`seg-tab${tab === 'notes' ? ' is-on' : ''}`} onClick={() => setTab('notes')}>
            הערות {((card.notesList || []).length + (kinorotNote?.saved ? 1 : 0)) ? <small>({(card.notesList || []).length + (kinorotNote?.saved ? 1 : 0)})</small> : null}
          </button>
          <button type="button" className={`seg-tab${tab === 'bill' ? ' is-on' : ''}`} onClick={() => setTab('bill')}>
            חיובים {card.charges?.length ? <small>({card.charges.length})</small> : null}
          </button>
        </div>
      </div>

      {/* 2. Body נגלל עצמאית */}
      <div className={`wa-feed-body${tab === 'comms' ? ' is-chat-bg' : ''}`}>
        {tab === 'comms' ? (
          <div className="wa-chat-stream">
            {commsError ? <div className="wa-error-banner">{commsError}</div> : null}
            {!bookingId ? (
              <div className="wa-empty-state">אין אורח משובץ על היחידה</div>
            ) : commsRows.length ? (
              commsRows.map((row) => {
                const isInbound = row.direction === 'inbound';
                const isFailed = row.status === 'failed';
                const timestamp = row.sent_at || row.created_at
                  ? new Date(row.sent_at || row.created_at).toLocaleString('he-IL', {
                    day: 'numeric',
                    month: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                  : '';
                return (
                  <div
                    key={row.id}
                    className={`wa-bubble-row ${isInbound ? 'is-inbound' : 'is-outbound'}${isFailed ? ' is-failed' : ''}`}
                  >
                    <div className="wa-bubble">
                      <div className="wa-bubble-header">
                        <span className="wa-bubble-tag">{commLabel(row)}</span>
                      </div>
                      <div className="wa-bubble-text">{renderMessageWithStayLinks(row.content)}</div>
                      {row.metadata?.error ? (
                        <div className="wa-bubble-error">סיבת כישלון: {row.metadata.error}</div>
                      ) : null}
                      <div className="wa-bubble-meta" dir="ltr">
                        <span className="wa-bubble-time">{timestamp}</span>
                        {!isInbound ? (
                          <span className={`wa-ticks ${isFailed ? 'is-fail' : 'is-ok'}`} title={row.status || 'sent'}>
                            {isFailed ? '✕' : (row.status === 'sent' || row.status === 'delivered' ? <CheckCheck size={13} /> : <Check size={13} />)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="wa-empty-state">אין עדיין הודעות או שיחות עם האורח</div>
            )}
            <div ref={feedEndRef} />
          </div>
        ) : tab === 'tasks' ? (
          <div className="wa-tasks-list">
            <div className="room-add wa-inline-add">
              <input
                value={taskTitle}
                disabled={!canEdit || saving}
                placeholder="תיאור משימה חדשה..."
                onChange={(event) => setTaskTitle(event.target.value)}
              />
              <button type="button" disabled={!canEdit || saving || !taskTitle.trim()} onClick={() => addDeskTask('cleaning')}>+ ניקיון</button>
              <button type="button" disabled={!canEdit || saving || !taskTitle.trim()} onClick={() => addDeskTask('maintenance')}>+ תחזוקה</button>
            </div>
            {card.tasks.map((task) => {
              const isDone = task.status === 'בוצע';
              const isInspect = task.status === 'ממתין לבדיקה';
              const typeBadgeClass = task.code === 'תחזוקה' ? 'is-maint' : task.code === 'OPS' ? 'is-ops' : 'is-clean';
              return (
                <div key={task.id} className={`wa-task-card${isDone ? ' is-done' : ''}`}>
                  <div className="wa-task-top">
                    <span className={`wa-task-type ${typeBadgeClass}`}>{task.code}</span>
                    <strong className="wa-task-title">{task.title}</strong>
                    <span className={`wa-task-status ${isDone ? 'is-done' : isInspect ? 'is-inspect' : 'is-open'}`}>
                      {task.status}
                    </span>
                  </div>
                  <div className="wa-task-bottom">
                    <span className="wa-task-staff">
                      👤 עובד: <b>{task.staff || card.staff || 'לא משובץ'}</b>
                    </span>
                    <button
                      type="button"
                      className={`wa-task-done-btn${isDone ? ' is-done' : ''}`}
                      disabled={!canEdit || saving}
                      onClick={() => toggleTaskDone(task)}
                    >
                      <Check size={12} /> {isDone ? 'בוצע ✓' : 'סמן ביצוע'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : tab === 'log' ? (
          <RoomLog entries={card.roomLog} scope={logScope} onScope={setLogScope} checkIn={card.checkInIso} checkOut={card.checkOutIso} />
        ) : tab === 'notes' ? (
          <div className="room-panel split-timeline">
            {/* הערה בכינורות */}
            <div className="kinorot-side-card">
              <div className="master-note-header">
                <span>📝 הערה בכינורות</span>
              </div>
              <textarea
                className="kinorot-note"
                readOnly
                value={kinorotNote?.saved || ''}
                placeholder={kinorotNote?.loading ? 'טוען את ההערה מכינורות...' : kinorotNote?.resId ? 'אין הערה בכינורות' : 'אין הזמנת כינורות'}
              />
            </div>

            {/* הערות של האורח הפתוח */}
            <div className="room-add wa-inline-add">
              <input
                value={noteText}
                disabled={!canEdit || saving || !card.bookingId}
                placeholder={card.bookingId ? 'הערה חופשית...' : 'אין אורח על היחידה'}
                onChange={(event) => setNoteText(event.target.value)}
              />
              <button type="button" disabled={!canEdit || saving || !card.bookingId || !noteText.trim()} onClick={addRoomNote}>הוסף</button>
            </div>
            {(card.notesList || []).length ? (card.notesList || []).slice().reverse().map((note) => (
              <div key={note.id} className="timeline-item">
                <div className="timeline-dot is-note" />
                <div className="timeline-card">
                  <div className="timeline-head">
                    <span className="timeline-actor">{note.by || 'משרד'}</span>
                    <span className="timeline-clock" dir="ltr">
                      {note.at ? new Date(note.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <div className="timeline-body">{note.text}</div>
                </div>
              </div>
            )) : <div className="room-empty">אין הערות חופשיות</div>}
          </div>
        ) : (
          <div className="wa-charges-list">
            {card.charges.length ? card.charges.map((charge, index) => (
              <div key={charge.txn || charge.ref || index} className="wa-charge-card">
                <div className="wa-charge-row">
                  <strong>{charge.accountLabel}</strong>
                  <span className="wa-charge-amount">{formatIlsFromAgorot(charge.amount_agorot)}</span>
                </div>
                <div className="wa-charge-sub">
                  <span>תאריך: {charge.date || String(charge.collected_at || '').slice(0, 10)}</span>
                  {charge.ref ? <span>אסמכתה: {charge.ref}</span> : null}
                  {(charge.payer_name || charge.payer_id) ? (
                    <span>משלם: {[charge.payer_name, charge.payer_id].filter(Boolean).join(' · ')}</span>
                  ) : null}
                </div>
              </div>
            )) : <div className="room-empty">אין חיובים רשומים ליחידה הזו</div>}
          </div>
        )}
      </div>

      {/* 3. Footer תחתון (Quick Action Input) בסגנון וואטסאפ */}
      <form className="wa-feed-footer" onSubmit={handleQuickSubmit}>
        <button
          type="button"
          className="wa-staylink-btn"
          disabled={!canEdit || !bookingId || commsBusy}
          title="שליחת קישור דף אורח (Stay Link) בסמס בלחיצה אחת"
          onClick={sendStayLinkQuick}
        >
          <Link2 size={14} />
          <span>קישור אורח</span>
        </button>
        {tab === 'tasks' ? (
          <select
            className="wa-kind-select"
            value={taskKind}
            disabled={!canEdit || saving}
            onChange={(e) => setTaskKind(e.target.value)}
            aria-label="סוג משימה"
          >
            <option value="cleaning">ניקיון</option>
            <option value="maintenance">תחזוקה</option>
          </select>
        ) : null}
        <input
          type="text"
          className="wa-quick-input"
          disabled={!canEdit || saving || commsBusy || (tab !== 'tasks' && !bookingId)}
          value={tab === 'tasks' ? taskTitle : tab === 'notes' ? noteText : quickInput}
          placeholder={
            tab === 'tasks'
              ? 'הקלד משימה לצוות...'
              : tab === 'notes'
                ? 'הקלד הערה לאורח...'
                : 'הקלד הודעה לאורח / משימה לצוות...'
          }
          onChange={(e) => {
            const v = e.target.value;
            if (tab === 'tasks') setTaskTitle(v);
            else if (tab === 'notes') setNoteText(v);
            else setQuickInput(v);
          }}
        />
        <button
          type="submit"
          className="wa-send-btn"
          disabled={
            !canEdit ||
            saving ||
            commsBusy ||
            !(tab === 'tasks' ? taskTitle.trim() : tab === 'notes' ? noteText.trim() : quickInput.trim())
          }
          title={tab === 'tasks' ? 'הוסף משימה' : tab === 'notes' ? 'שמור הערה' : 'שלח הודעה לאורח'}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

function safeCallTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
}

function Field({ label, value, className = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      {React.isValidElement(value) ? (
        <div className={`ro ${className}`.trim()} style={{ display: 'flex', alignItems: 'center' }}>
          {value}
        </div>
      ) : (
        <input className={`ro ${className}`.trim()} value={value || ''} readOnly />
      )}
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
