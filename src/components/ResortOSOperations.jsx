import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useDynamicText, translateToAllLanguages, normalizeLang } from '../lib/translator';
import { 
  Sparkles, 
  Wrench, 
  Leaf, 
  Plus, 
  Check, 
  Play, 
  Star, 
  X, 
  Camera, 
  Crown
} from 'lucide-react';

const RATING_KEYS_BY_DOMAIN = {
  HOUSEKEEPING: ['clean', 'showerToilets', 'linens', 'orderLook'],
  MAINTENANCE: ['speed', 'prof', 'clean'],
  GARDENING: ['speed', 'prof', 'clean'],
  MANAGER: ['speed', 'prof', 'clean']
};

function ratingKeysForDomain(domain) {
  return RATING_KEYS_BY_DOMAIN[domain] || RATING_KEYS_BY_DOMAIN.MANAGER;
}

function failedRatingKeys(form, domain) {
  return ratingKeysForDomain(domain).filter((key) => {
    const value = Number(form?.[key]) || 0;
    return value >= 1 && value <= 3;
  });
}

function reopenStatusForDomain(domain) {
  if (domain === 'MAINTENANCE') return 'MAINTENANCE_ALERT';
  if (domain === 'GARDENING') return 'GARDENING';
  return 'DIRTY';
}

function mergeTaskOverlay(prev, next) {
  const prevAt = prev.lastInspection?.at || '';
  const nextAt = next.lastInspection?.at || '';
  const latest = nextAt >= prevAt ? next : prev;
  const other = latest === next ? prev : next;
  const lastInspection = latest.lastInspection || other.lastInspection;
  const qualityInspections = (next.qualityInspections?.length || 0) >= (prev.qualityInspections?.length || 0)
    ? (next.qualityInspections || prev.qualityInspections)
    : prev.qualityInspections;

  let status = latest.status;
  let urgency = latest.urgency;
  if (lastInspection?.reopened && latest.status === 'READY' && other.status && other.status !== 'READY') {
    status = other.status;
    urgency = other.urgency;
  }

  return {
    ...prev,
    ...next,
    status,
    urgency,
    lastInspection,
    qualityInspections,
    reworkCount: Math.max(prev.reworkCount || 0, next.reworkCount || 0),
    lastFailedFields: (latest.lastFailedFields && latest.lastFailedFields.length)
      ? latest.lastFailedFields
      : (other.lastFailedFields || []),
    startedAt: latest.startedAt || other.startedAt || null,
    sopProgress: (latest.sopProgress?.steps?.length ? latest.sopProgress : null)
      || other.sopProgress
      || latest.sopProgress,
    name_i18n: (next.name_i18n && Object.keys(next.name_i18n).length >= Object.keys(prev.name_i18n || {}).length)
      ? next.name_i18n
      : (prev.name_i18n || next.name_i18n),
    reason_i18n: (next.reason_i18n && Object.keys(next.reason_i18n).length >= Object.keys(prev.reason_i18n || {}).length)
      ? next.reason_i18n
      : (prev.reason_i18n || next.reason_i18n),
    text_source_lang: next.text_source_lang || prev.text_source_lang
  };
}

function DynamicText({ text, translations, sourceLang }) {
  const translated = useDynamicText(text, translations, sourceLang);
  return <>{translated}</>;
}
import { db, useLiveUnits, useLiveBookings } from '../lib/resortos-db';
import {
  pushUnitToCloud,
  subscribeToRealtimeCloudBookings,
  subscribeToRealtimeUnitOps,
  syncCloudBookingsToDexie,
  syncUnitOpsToDexie,
  ensureCanonicalUnits,
  retirePhantomUnits
} from '../lib/cloudDb';
import { ensureTurnoverCleaning, isManagerInspection, markCabinCleanedForInspection } from '../lib/housekeepingCycle';
import { unitAccessGroup, visibleInventory } from '../lib/units';
import { operationsViewRole } from '../lib/staffRoles';
import { israelToday } from '../lib/cabinAccess';
import { hideHousekeepingTaskWhileOccupied } from '../lib/unitStatus';
import {
  DEFAULT_SOP_TEMPLATES,
  ensureTaskSop,
  fetchSopTemplates,
  formatElapsed,
  normalizeSopProgress,
  stepLabel
} from '../lib/sop';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

export default function ResortOSOperations({
  theme: parentTheme = 'dark',
  tenantId = DEMO_TENANT_ID,
  sessionRole = 'MANAGER',
  canSwitchRole = false,
  allowedUnitIds = []
}) {
  // Live Dexie IndexedDB Hooks
  const rawUnits = useLiveUnits(tenantId);
  const units = useMemo(() => visibleInventory(rawUnits, allowedUnitIds), [rawUnits, allowedUnitIds]);
  const rawBookings = useLiveBookings(tenantId);

  // Real-time Cloud Sync
  useEffect(() => {
    syncCloudBookingsToDexie(tenantId);
    syncUnitOpsToDexie(tenantId);
    ensureCanonicalUnits(tenantId).then(() => retirePhantomUnits(tenantId)).catch(() => {});
    const unsubscribeBookings = subscribeToRealtimeCloudBookings(tenantId);
    const unsubscribeOps = subscribeToRealtimeUnitOps(tenantId);
    const pollId = setInterval(() => {
      syncUnitOpsToDexie(tenantId);
    }, 4000);
    return () => {
      clearInterval(pollId);
      if (typeof unsubscribeBookings === 'function') unsubscribeBookings();
      if (typeof unsubscribeOps === 'function') unsubscribeOps();
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    fetchSopTemplates(tenantId).then(setSopTemplates).catch(() => {});
  }, [tenantId]);

  // Reactive Theme & i18n Language Sync from App.jsx & Settings.jsx
  const theme = parentTheme;
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'he';
  const isRTL = currentLang === 'he' || currentLang === 'ar';

  const fillTaskTranslations = async (taskId, title, reason) => {
    const sourceLang = normalizeLang(i18n.language);
    try {
      const [name_i18n, reason_i18n] = await Promise.all([
        translateToAllLanguages(title, sourceLang),
        translateToAllLanguages(reason, sourceLang)
      ]);
      setCustomTickets((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, name_i18n, reason_i18n, text_source_lang: sourceLang } : t
        )
      );
      await db.units.update(taskId, { name_i18n, reason_i18n, text_source_lang: sourceLang });
    } catch (err) {
      console.warn('[TASK I18N WARN]', err);
    }
  };

  // Component States — role comes from login; managers may still preview other views
  const [userRole, setUserRole] = useState(() => operationsViewRole(sessionRole));
  useEffect(() => {
    setUserRole(operationsViewRole(sessionRole));
  }, [sessionRole]);
  const [activeKPI, setActiveKPI] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');

  // Component Memory Custom Tasks array for 0ms instant reactivity
  const [customTickets, setCustomTickets] = useState([]);

  // Task Feedbacks State
  const [taskFeedbacks, setTaskFeedbacks] = useState({});

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showSopModal, setShowSopModal] = useState(false);
  const [selectedTaskForSop, setSelectedTaskForSop] = useState(null);
  const [sopTemplates, setSopTemplates] = useState(DEFAULT_SOP_TEMPLATES);
  const [nowTick, setNowTick] = useState(Date.now());

  // Selected Task States
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [selectedTaskForFeedback, setSelectedTaskForFeedback] = useState(null);
  const [detailDraft, setDetailDraft] = useState({ description: '', photos: [] });

  // New Ticket Form State (with photos attachment support)
  const [newTicket, setNewTicket] = useState({
    unitId: '',
    domain: 'HOUSEKEEPING',
    description: '',
    photos: []
  });

  // Quality Inspection Feedback Form State
  const [feedbackForm, setFeedbackForm] = useState({
    speed: 0,
    prof: 0,
    clean: 0,
    showerToilets: 0,
    linens: 0,
    orderLook: 0,
    note: ''
  });

  // Compute tasks list dynamically from live units & bookings + custom user tickets
  const tasks = useMemo(() => {
    const todayStr = israelToday();
    const unitTasks = (units || []).map(unit => {
      const unitBookings = (rawBookings || []).filter((b) => (
        b.unit_id === unit.id &&
        !b.deleted_at &&
        b.booking_status !== 'CANCELED'
      ));
      const checkoutToday = unitBookings.find((b) => b.check_out_date === todayStr);
      const checkinToday = unitBookings.find((b) => b.check_in_date === todayStr);
      const hasSameDayCheckin = Boolean(checkinToday);
      const stayLine = checkoutToday
        ? `יציאה היום${checkoutToday.guest_name ? ` · ${checkoutToday.guest_name}` : ''}`
        : (checkinToday
          ? `כניסה היום${checkinToday.guest_name ? ` · ${checkinToday.guest_name}` : ''}`
          : '');

      const status = unit.operational_status || (hasSameDayCheckin ? 'DIRTY' : 'READY');
      const domain = unit.operational_domain || (status === 'MAINTENANCE_ALERT' ? 'MAINTENANCE' : (status === 'GARDENING' ? 'GARDENING' : 'HOUSEKEEPING'));
      const urgency = unit.is_escalated ? 'CRITICAL' : (hasSameDayCheckin ? 'HIGH' : (status === 'READY' ? 'READY' : 'ROUTINE'));
      const inspections = Array.isArray(unit.quality_inspections) ? unit.quality_inspections : [];
      const lastInspection = inspections.length ? inspections[inspections.length - 1] : null;

      const computedReason = unit.custom_reason || unit.task_description || 
        (status === 'MAINTENANCE_ALERT' ? 'תקלת אחזקה פתוחה ביחידה - נדרש תיקון מיידי' : 
        (status === 'DIRTY' ? 'ניקוי לאחר יציאה והכנה לכניסה' :
        (status === 'READY' && !isManagerInspection(lastInspection) ? 'ממתין לביקורת מנהל' : 'היחידה נקייה ומוכנה לחלוטין')));

      if (hideHousekeepingTaskWhileOccupied(unit, rawBookings, todayStr)) return null;

      return {
        id: unit.id,
        titleKey: unit.name,
        customTitle: unit.name,
        domain: domain,
        status: status,
        urgency: urgency,
        assignedTo: unit.assigned_staff || 'צוות תפעול',
        reasonKey: computedReason,
        customReason: computedReason,
        photos: unit.image_urls || [],
        name_i18n: unit.name_i18n,
        reason_i18n: unit.reason_i18n,
        text_source_lang: unit.text_source_lang || 'he',
        reworkCount: unit.rework_count || 0,
        lastFailedFields: unit.last_failed_fields || lastInspection?.failed_fields || [],
        lastInspection,
        qualityInspections: inspections,
        startedAt: unit.cleaning_started_at || null,
        sopProgress: normalizeSopProgress(unit.sop_progress),
        complexName: unitAccessGroup(unit.id),
        stayLine,
        checkoutGuest: checkoutToday?.guest_name || '',
        checkinGuest: checkinToday?.guest_name || ''
      };
    }).filter(Boolean);

    // Merge customTickets created by user in real-time
    const mergedList = [...unitTasks, ...customTickets];
    const uniqueMap = new Map();
    mergedList.forEach((t) => {
      const prev = uniqueMap.get(t.id);
      if (!prev) {
        uniqueMap.set(t.id, t);
        return;
      }
      uniqueMap.set(t.id, mergeTaskOverlay(prev, t));
    });
    return Array.from(uniqueMap.values());
  }, [units, rawBookings, customTickets]);

  useEffect(() => {
    if (!newTicket.unitId && units[0]?.id) {
      setNewTicket((prev) => ({ ...prev, unitId: units[0].id }));
    }
  }, [units, newTicket.unitId]);

  useEffect(() => {
    if (!tenantId || !units.length) return;
    ensureTurnoverCleaning({
      tenantId,
      units,
      bookings: rawBookings,
      pushUnitToCloud
    }).catch(() => {});
  }, [tenantId, units, rawBookings]);

  useEffect(() => {
    const running = tasks.some((task) => task.status === 'IN_PROGRESS' && task.startedAt);
    if (!running) return undefined;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tasks]);

  // Submit New Operations Ticket to Dexie IndexedDB & Memory State & Cloud Sync
  const handleCreateTicketSubmit = async (e) => {
    e.preventDefault();
    const unit = units.find((row) => row.id === newTicket.unitId) || units[0];
    if (!unit) return;

    const nowIso = new Date().toISOString();
    const newStatus = newTicket.domain === 'MAINTENANCE' ? 'MAINTENANCE_ALERT' : 'DIRTY';
    const urgencyLevel = newTicket.domain === 'MAINTENANCE' ? 'CRITICAL' : 'HIGH';
    const taskReasonText = newTicket.description.trim() || (newStatus === 'MAINTENANCE_ALERT' ? 'תקלת אחזקה דחופה נפתחה' : 'ניקוי לאחר יציאה והכנה לכניסה');
    const ticketPhotos = [...newTicket.photos];
    const sourceLang = normalizeLang(i18n.language);
    const name_i18n = { ...(unit.name_i18n || {}), [sourceLang]: unit.name };
    const reason_i18n = { [sourceLang]: taskReasonText };

    const newTicketItem = {
      id: unit.id,
      titleKey: unit.name,
      customTitle: unit.name,
      domain: newTicket.domain,
      status: newStatus,
      urgency: urgencyLevel,
      assignedTo: unit.assigned_staff || 'צוות תפעול',
      reasonKey: taskReasonText,
      customReason: taskReasonText,
      photos: ticketPhotos.length ? ticketPhotos : (unit.image_urls || []),
      name_i18n,
      reason_i18n,
      text_source_lang: sourceLang
    };

    setCustomTickets((prev) => [newTicketItem, ...prev.filter((row) => row.id !== unit.id)]);

    try {
      await db.units.put({
        ...unit,
        operational_status: newStatus,
        operational_domain: newTicket.domain,
        custom_reason: taskReasonText,
        assigned_staff: unit.assigned_staff || 'צוות תפעול',
        is_escalated: newTicket.domain === 'MAINTENANCE',
        image_urls: ticketPhotos.length ? ticketPhotos : (unit.image_urls || []),
        name_i18n,
        reason_i18n,
        text_source_lang: sourceLang,
        updated_at: nowIso
      });
    } catch (err) {
      console.warn('[DEXIE TICKET PUT WARN]', err);
    }

    pushUnitToCloud({
      id: unit.id,
      tenant_id: tenantId,
      name: unit.name,
      operational_status: newStatus,
      operational_domain: newTicket.domain,
      custom_reason: taskReasonText,
      assigned_staff: unit.assigned_staff || 'צוות תפעול',
      is_escalated: newTicket.domain === 'MAINTENANCE',
      image_urls: ticketPhotos.length ? ticketPhotos : (unit.image_urls || []),
      name_i18n,
      reason_i18n,
      text_source_lang: sourceLang,
      updated_at: nowIso
    });

    setNewTicket({ unitId: unit.id, domain: 'HOUSEKEEPING', description: '', photos: [] });
    setShowAddModal(false);
    fillTaskTranslations(unit.id, unit.name, taskReasonText);
  };

  // Single-Tap Task Action Handlers
  const persistSopProgress = useCallback(async (task, sopProgress) => {
    const nowIso = new Date().toISOString();
    const next = normalizeSopProgress(sopProgress);
    setCustomTickets((prev) => {
      const overlay = { ...task, sopProgress: next };
      const exists = prev.some((row) => row.id === task.id);
      if (exists) return prev.map((row) => (row.id === task.id ? { ...row, ...overlay } : row));
      return [overlay, ...prev];
    });
    if (selectedTaskForSop?.id === task.id) {
      setSelectedTaskForSop((prev) => (prev ? { ...prev, sopProgress: next } : prev));
    }
    try {
      await db.units.update(task.id, { sop_progress: next, updated_at: nowIso });
    } catch (_) {}
    pushUnitToCloud({
      id: task.id,
      tenant_id: tenantId,
      sop_progress: next,
      updated_at: nowIso
    });
  }, [tenantId, selectedTaskForSop?.id]);

  const openSopForTask = useCallback((task) => {
    const sopProgress = ensureTaskSop(task, sopTemplates);
    setSelectedTaskForSop({ ...task, sopProgress });
    setShowSopModal(true);
    if (!task.sopProgress?.steps?.length) {
      persistSopProgress({ ...task, sopProgress }, sopProgress);
    }
  }, [sopTemplates, persistSopProgress]);

  const handleStartTask = useCallback(async (taskId) => {
    const nowIso = new Date().toISOString();
    const task = tasks.find((row) => row.id === taskId);
    const sopProgress = ensureTaskSop(task, sopTemplates);
    setCustomTickets((prev) => {
      const overlay = { ...(task || {}), id: taskId, status: 'IN_PROGRESS', startedAt: nowIso, sopProgress };
      const exists = prev.some((row) => row.id === taskId);
      if (exists) return prev.map((row) => (row.id === taskId ? { ...row, ...overlay } : row));
      return [overlay, ...prev];
    });

    try {
      await db.units.update(taskId, {
        operational_status: 'IN_PROGRESS',
        cleaning_started_at: nowIso,
        sop_progress: sopProgress,
        updated_at: nowIso
      });
    } catch (_) {}

    pushUnitToCloud({
      id: taskId,
      tenant_id: tenantId,
      operational_status: 'IN_PROGRESS',
      cleaning_started_at: nowIso,
      sop_progress: sopProgress,
      updated_at: nowIso
    });
  }, [tenantId, tasks, sopTemplates]);

  const handleFinishTask = useCallback(async (taskId) => {
    setShowSopModal(false);
    setSelectedTaskForSop(null);
    const unit = units.find((row) => row.id === taskId) || await db.units.get(taskId);
    const domain = unit?.operational_domain || (unit?.operational_status === 'MAINTENANCE_ALERT' ? 'MAINTENANCE' : 'HOUSEKEEPING');
    const waitingInspect = domain === 'HOUSEKEEPING';
    setCustomTickets(prev => prev.map(t => t.id === taskId ? {
      ...t,
      status: 'READY',
      urgency: 'READY',
      customReason: waitingInspect ? 'ממתין לביקורת מנהל' : 'טופל',
      reasonKey: waitingInspect ? 'ממתין לביקורת מנהל' : 'טופל'
    } : t));
    if (waitingInspect) {
      await markCabinCleanedForInspection({ tenantId, unit: unit || { id: taskId }, pushUnitToCloud });
      return;
    }
    const nowIso = new Date().toISOString();
    await pushUnitToCloud({
      id: taskId,
      tenant_id: tenantId,
      name: unit?.name,
      operational_status: 'READY',
      operational_domain: domain,
      custom_reason: 'טופל',
      is_escalated: false,
      cleaning_started_at: null,
      updated_at: nowIso
    });
  }, [tenantId, units]);

  const handleSaveFeedback = useCallback(async () => {
    if (!selectedTaskForFeedback) return;

    const task = selectedTaskForFeedback;
    const nowIso = new Date().toISOString();
    const keys = ratingKeysForDomain(task.domain);
    const ratings = {};
    keys.forEach((key) => {
      ratings[key] = Number(feedbackForm[key]) || 0;
    });
    const failedFields = failedRatingKeys(feedbackForm, task.domain);
    const reopened = failedFields.length > 0;
    const nextStatus = reopened ? reopenStatusForDomain(task.domain) : 'READY';
    const minScore = failedFields.reduce((min, key) => Math.min(min, Number(feedbackForm[key]) || 5), 5);
    const nextUrgency = reopened ? (minScore <= 2 ? 'CRITICAL' : 'HIGH') : 'READY';
    const nextReworkCount = (task.reworkCount || 0) + (reopened ? 1 : 0);
    const inspection = {
      at: nowIso,
      ratings,
      note: (feedbackForm.note || '').trim(),
      failed_fields: failedFields,
      reopened
    };

    let prevInspections = task.qualityInspections || [];
    try {
      const existing = await db.units.get(task.id);
      if (Array.isArray(existing?.quality_inspections) && existing.quality_inspections.length >= prevInspections.length) {
        prevInspections = existing.quality_inspections;
      }
    } catch (_) {}
    const qualityInspections = [...prevInspections, inspection];

    setTaskFeedbacks((prev) => ({ ...prev, [task.id]: { ...feedbackForm } }));
    setCustomTickets((prev) => {
      const next = {
        ...task,
        status: nextStatus,
        urgency: nextUrgency,
        reworkCount: nextReworkCount,
        lastFailedFields: reopened ? failedFields : [],
        lastInspection: inspection,
        qualityInspections
      };
      const exists = prev.some((item) => item.id === task.id);
      if (exists) return prev.map((item) => (item.id === task.id ? { ...item, ...next } : item));
      return [next, ...prev];
    });

    try {
      const existing = await db.units.get(task.id);
      const unitPatch = {
        operational_status: nextStatus,
        is_escalated: Boolean(reopened && minScore <= 2),
        quality_inspections: qualityInspections,
        rework_count: nextReworkCount,
        last_failed_fields: reopened ? failedFields : [],
        updated_at: nowIso
      };
      if (reopened) unitPatch.cleaning_started_at = null;
      if (existing) {
        await db.units.put({ ...existing, ...unitPatch });
      } else {
        await db.units.update(task.id, unitPatch);
      }
    } catch (err) {
      console.warn('[DEXIE INSPECT PUT WARN]', err);
    }

    pushUnitToCloud({
      id: task.id,
      tenant_id: tenantId,
      name: task.customTitle || task.titleKey,
      operational_status: nextStatus,
      operational_domain: task.domain,
      custom_reason: task.customReason || task.reasonKey,
      is_escalated: Boolean(reopened && minScore <= 2),
      cleaning_started_at: reopened ? null : undefined,
      quality_inspections: qualityInspections,
      rework_count: nextReworkCount,
      last_failed_fields: reopened ? failedFields : [],
      image_urls: task.photos || [],
      name_i18n: task.name_i18n,
      reason_i18n: task.reason_i18n,
      text_source_lang: task.text_source_lang,
      updated_at: nowIso
    });

    setShowFeedbackModal(false);
  }, [selectedTaskForFeedback, feedbackForm, tenantId]);

  const openTaskDetail = (room) => {
    setSelectedTaskForDetail(room);
    setDetailDraft({
      description: room.customReason || room.reasonKey || '',
      photos: Array.isArray(room.photos) ? [...room.photos] : []
    });
    setShowDetailModal(true);
  };

  const boardColumns = useMemo(() => ([
    { id: 'HOUSEKEEPING', label: t('FILTER_HOUSEKEEPING', '🧹 משק בית'), Icon: Sparkles, color: '#F59E0B' },
    { id: 'MAINTENANCE', label: t('FILTER_MAINTENANCE', '🔧 אחזקה'), Icon: Wrench, color: '#EF4444' },
    { id: 'GARDENING', label: t('FILTER_GARDENING', '🌱 חצרנות'), Icon: Leaf, color: '#10B981' },
    { id: 'MANAGER', label: t('FILTER_MANAGER', '👑 מנהלים'), Icon: Crown, color: '#F59E0B' }
  ]), [t]);

  const showOpsBoard = userRole === 'MANAGER' && domainFilter === 'ALL';

  const appendDetailPhotos = (fileList) => {
    Array.from(fileList || []).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        if (typeof base64 === 'string') {
          setDetailDraft((prev) => ({ ...prev, photos: [...prev.photos, base64] }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSaveTaskDetails = async () => {
    if (!selectedTaskForDetail || userRole !== 'MANAGER') {
      setShowDetailModal(false);
      return;
    }

    const description = detailDraft.description.trim() || selectedTaskForDetail.reasonKey;
    const photos = detailDraft.photos;
    const taskId = selectedTaskForDetail.id;
    const nowIso = new Date().toISOString();

    setCustomTickets((prev) => {
      const next = {
        ...selectedTaskForDetail,
        customReason: description,
        reasonKey: description,
        photos
      };
      const exists = prev.some((t) => t.id === taskId);
      if (exists) {
        return prev.map((t) => (t.id === taskId ? { ...t, ...next } : t));
      }
      return [next, ...prev];
    });

    try {
      await db.units.update(taskId, {
        custom_reason: description,
        image_urls: photos,
        updated_at: nowIso
      });
    } catch (_) {}

    pushUnitToCloud({
      id: taskId,
      tenant_id: tenantId,
      custom_reason: description,
      image_urls: photos,
      updated_at: nowIso
    });

    setShowDetailModal(false);
    fillTaskTranslations(
      taskId,
      selectedTaskForDetail.customTitle || selectedTaskForDetail.titleKey,
      description
    );
  };

  // Filter Tasks Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (userRole === 'HOUSEKEEPING' && task.domain !== 'HOUSEKEEPING') return false;
      if (userRole === 'MAINTENANCE' && task.domain !== 'MAINTENANCE') return false;
      if (userRole === 'GARDENING' && task.domain !== 'GARDENING') return false;

      if (userRole === 'MANAGER' && domainFilter !== 'ALL' && task.domain !== domainFilter) return false;

      if ((activeKPI === 'OPEN' || activeKPI === 'IN_PROGRESS') && task.status === 'READY') return false;
      if (activeKPI === 'READY' && task.status !== 'READY') return false;

      return true;
    }).sort((a, b) => {
      const priorityOrder = { CRITICAL: 1, HIGH: 2, ROUTINE: 3, READY: 4 };
      return (priorityOrder[a.urgency] || 99) - (priorityOrder[b.urgency] || 99);
    });
  }, [tasks, userRole, domainFilter, activeKPI]);

  // Theme Colors mapping
  const isDark = theme === 'dark';
  const colors = {
    bg: isDark ? '#090D16' : '#FAF8F3',
    panelBg: 'transparent',
    cardBg: isDark ? '#141416' : '#FFFFFF',
    cardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    textMain: isDark ? '#F8FAFC' : '#1C1917',
    textMuted: isDark ? '#94A3B8' : '#64748B',
    inputBg: isDark ? '#0F172A' : '#F1F5F9',
    inputBorder: isDark ? 'rgba(255,255,255,0.12)' : '#CBD5E1'
  };

  const renderTaskCard = (room) => {
            const isCritical = room.urgency === 'CRITICAL';
            const isHigh = room.urgency === 'HIGH';
            const isInProgress = room.status === 'IN_PROGRESS';
            const isReady = room.status === 'READY';

            const titleText = room.customTitle || room.titleKey;
            const reasonText = room.customReason || room.reasonKey;
            const lastInspection = room.lastInspection;
            const hasFeedback = Boolean(isReady && isManagerInspection(lastInspection));
            const fieldLabels = {
              clean: t('LABEL_CLEANLINESS', 'רמת ניקיון'),
              showerToilets: t('LABEL_SHOWER_TOILETS', 'מקלחת ושירותים'),
              linens: t('LABEL_LINENS', 'מצעים'),
              orderLook: t('LABEL_ORDER_LOOK', 'סדר ונראות'),
              speed: t('LABEL_EXECUTION_SPEED', 'זמן ביצוע'),
              prof: t('LABEL_PROFESSIONALISM', 'מקצועיות')
            };
            const failedLabels = (room.lastFailedFields || [])
              .map((key) => fieldLabels[key])
              .filter(Boolean)
              .join(', ');

            const hasPhotos = room.photos && room.photos.length > 0;
            const borderColor = isCritical ? '#EF4444' : (isHigh ? '#F59E0B' : (isReady ? '#10B981' : '#60A5FA'));
            const bgOverlay = isCritical ? (isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2') : (isHigh ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB') : (isReady ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5') : colors.cardBg));

            const openInspect = (event) => {
              event?.stopPropagation?.();
              setSelectedTaskForFeedback(room);
              setFeedbackForm({
                speed: 0,
                prof: 0,
                clean: 0,
                showerToilets: 0,
                linens: 0,
                orderLook: 0,
                note: '',
                ...(hasFeedback ? (taskFeedbacks[room.id] || lastInspection?.ratings || {}) : {})
              });
              setShowFeedbackModal(true);
            };

            return (
              <div
                key={room.id}
                className="hotelos-ops-card"
                onClick={() => openTaskDetail(room)}
                style={{
                  background: bgOverlay,
                  border: `2px solid ${borderColor}`,
                  borderRadius: '16px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {room.domain === 'MANAGER' && <Crown size={15} color="#F59E0B" />}
                    {room.domain === 'HOUSEKEEPING' && <Sparkles size={15} color="#F59E0B" />}
                    {room.domain === 'MAINTENANCE' && <Wrench size={15} color="#EF4444" />}
                    {room.domain === 'GARDENING' && <Leaf size={15} color="#10B981" />}
                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <DynamicText text={titleText} translations={room.name_i18n} sourceLang={room.text_source_lang} />
                    </h3>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <DynamicText text={reasonText} translations={room.reason_i18n} sourceLang={room.text_source_lang} />
                    </span>
                    {hasPhotos && (
                      <span style={{ color: '#6366F1', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <Camera size={12} />
                        <span>{room.photos.length}</span>
                      </span>
                    )}
                  </div>
                  {room.reworkCount > 0 ? (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: isReady ? '#059669' : '#DC2626',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {isReady
                        ? t('BADGE_REWORKED', 'תוקן אחרי ביקורת')
                        : `${t('BADGE_REOPENED', 'נפתח מחדש')}${failedLabels ? ` · ${failedLabels}` : ''}`}
                      {room.reworkCount > 1 ? ` ×${room.reworkCount}` : ''}
                    </div>
                  ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {!isReady ? (
                    <button
                      type="button"
                      title={t('BTN_COMPLETE', 'סמן כטופל')}
                      onClick={(e) => { e.stopPropagation(); handleFinishTask(room.id); }}
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'linear-gradient(135deg, #34D399, #059669)',
                        color: '#FFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)'
                      }}
                    >
                      <Check size={18} strokeWidth={3} />
                    </button>
                  ) : userRole === 'MANAGER' ? (
                    <button
                      type="button"
                      title={hasFeedback ? t('BTN_INSPECTED', 'נבדק ע״י מנהל') : t('BTN_INSPECT', 'בקרת איכות')}
                      onClick={openInspect}
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        border: hasFeedback ? '1px solid #F59E0B' : 'none',
                        background: hasFeedback ? 'rgba(245, 158, 11, 0.16)' : '#6366F1',
                        color: hasFeedback ? '#F59E0B' : '#FFF',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Star size={16} />
                    </button>
                  ) : (
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.16)',
                      color: '#10B981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Check size={18} />
                    </div>
                  )}
                </div>
              </div>
            );
  };

  return (
    <div 
      className="hotelos-ops-page"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{
        width: '100%',
        minHeight: '100%',
        background: colors.bg,
        color: colors.textMain,
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxSizing: 'border-box'
      }}
    >

      {/* Compact Top Header Bar: Role Selector on Right, + New Ticket on Left (Same 38px Height) */}
      <div className="hotelos-ops-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
        {canSwitchRole ? (
        <select
          value={userRole}
          onChange={(e) => {
            setUserRole(e.target.value);
            setDomainFilter('ALL');
          }}
          style={{
            height: '38px',
            padding: '0 0.85rem',
            borderRadius: '10px',
            background: isDark ? '#1E293B' : '#F1F5F9',
            border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}`,
            color: colors.textMain,
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        >
          <option value="MANAGER">{t('ROLE_MANAGER', '👑 מנהל')}</option>
          <option value="HOUSEKEEPING">{t('ROLE_HOUSEKEEPING', '🧹 משק בית')}</option>
          <option value="MAINTENANCE">{t('ROLE_MAINTENANCE', '🔧 אחזקה')}</option>
          <option value="GARDENING">{t('ROLE_GARDENING', '🌱 חצרנות')}</option>
        </select>
        ) : (
          <div style={{
            height: '38px',
            padding: '0 0.85rem',
            borderRadius: '10px',
            background: isDark ? '#1E293B' : '#F1F5F9',
            border: `1px solid ${isDark ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.2)'}`,
            color: colors.textMain,
            fontSize: '0.82rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            {userRole === 'HOUSEKEEPING' && t('ROLE_HOUSEKEEPING', '🧹 משק בית')}
            {userRole === 'MAINTENANCE' && t('ROLE_MAINTENANCE', '🔧 אחזקה')}
            {userRole === 'GARDENING' && t('ROLE_GARDENING', '🌱 חצרנות')}
            {userRole === 'MANAGER' && t('ROLE_MANAGER', '👑 מנהל')}
          </div>
        )}

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            height: '38px',
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            color: '#FFF',
            border: 'none',
            borderRadius: '10px',
            padding: '0 1rem',
            fontSize: '0.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            boxSizing: 'border-box',
            whiteSpace: 'nowrap'
          }}
        >
          <Plus size={16} />
          <span>{t('BTN_ADD_CALL', 'קריאה חדשה')}</span>
        </button>
      </div>

      {/* Manager KPI Summary Cards */}
      {userRole === 'MANAGER' && (
        <div className="hotelos-ops-toolbar" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveKPI(activeKPI === 'OPEN' || activeKPI === 'IN_PROGRESS' ? 'ALL' : 'OPEN')}
            style={{
              background: (activeKPI === 'OPEN' || activeKPI === 'IN_PROGRESS') ? 'rgba(99, 102, 241, 0.15)' : colors.cardBg,
              border: (activeKPI === 'OPEN' || activeKPI === 'IN_PROGRESS') ? '1.5px solid #6366F1' : `1px solid ${colors.cardBorder}`,
              borderRadius: '12px',
              padding: '0.6rem 0.4rem',
              cursor: 'pointer',
              color: colors.textMain,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              alignItems: 'center'
            }}
          >
            <div style={{ textAlign: 'center', borderInlineEnd: `1px solid ${colors.cardBorder}`, paddingInline: '0.35rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>{t('KPI_OPEN', '📂 פתוחות')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>
                {tasks.filter(t => t.status !== 'READY' && t.status !== 'IN_PROGRESS').length}
              </div>
            </div>
            <div style={{ textAlign: 'center', paddingInline: '0.35rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>{t('KPI_IN_PROGRESS', '⚡ בטיפול')}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366F1', marginTop: '2px' }}>
                {tasks.filter(t => t.status === 'IN_PROGRESS').length}
              </div>
            </div>
          </button>

          <button
            onClick={() => setActiveKPI(activeKPI === 'READY' ? 'ALL' : 'READY')}
            style={{
              background: activeKPI === 'READY' ? 'rgba(16, 185, 129, 0.15)' : colors.cardBg,
              border: activeKPI === 'READY' ? '1.5px solid #10B981' : `1px solid ${colors.cardBorder}`,
              borderRadius: '12px',
              padding: '0.6rem 0.4rem',
              textAlign: 'center',
              cursor: 'pointer',
              color: colors.textMain
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>{t('KPI_READY', '🟢 מוכנים')}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>
              {tasks.filter(t => t.status === 'READY').length}
            </div>
          </button>
        </div>
      )}

      {/* Manager Domain Filter Chips — phone only; desktop uses 4 columns */}
      {userRole === 'MANAGER' && (
        <div className="hotelos-ops-toolbar hotelos-ops-domain-chips" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.4rem', marginBottom: '1.25rem' }}>
          {[
            { id: 'ALL', label: t('FILTER_ALL', 'הכל') },
            { id: 'HOUSEKEEPING', label: t('FILTER_HOUSEKEEPING', '🧹 משק בית') },
            { id: 'MAINTENANCE', label: t('FILTER_MAINTENANCE', '🔧 אחזקה') },
            { id: 'GARDENING', label: t('FILTER_GARDENING', '🌱 חצרנות') },
            { id: 'MANAGER', label: t('FILTER_MANAGER', '👑 מנהלים') }
          ].map(chip => (
            <button
              key={chip.id}
              onClick={() => setDomainFilter(chip.id)}
              style={{
                background: domainFilter === chip.id ? '#6366F1' : colors.cardBg,
                color: domainFilter === chip.id ? '#FFF' : colors.textMuted,
                border: domainFilter === chip.id ? '1px solid #6366F1' : `1px solid ${colors.cardBorder}`,
                borderRadius: '10px',
                padding: '0.35rem 0.7rem',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Actionable Task Cards List / desktop department board */}
      {showOpsBoard ? (
        <div className="hotelos-ops-board">
          {boardColumns.map((col) => {
            const rows = filteredTasks.filter((task) => task.domain === col.id);
            const Icon = col.Icon;
            return (
              <section key={col.id} className="hotelos-ops-col">
                <header className="hotelos-ops-col-head">
                  <span className="hotelos-ops-col-title" style={{ color: col.color }}>
                    <Icon size={15} color={col.color} />
                    {col.label}
                  </span>
                  <span className="hotelos-ops-col-count">{rows.length}</span>
                </header>
                <div className="hotelos-ops-col-body">
                  {rows.length ? rows.map(renderTaskCard) : (
                    <div className="hotelos-ops-col-empty">{t('NO_TASKS_TITLE', 'אין משימות בקטגוריה זו')}</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', border: `1px dashed ${colors.cardBorder}`, borderRadius: '16px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMuted }}>{t('NO_TASKS_TITLE', 'אין משימות בקטגוריה זו')}</div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>{t('NO_TASKS_DESC', 'כל הקריאות והמשימות טופלו בהצלחה')}</div>
          </div>
        ) : (
          filteredTasks.map(renderTaskCard)
        )}
      </div>
      )}

      {/* New Ticket Modal (With Camera & Photo Attachments) */}
      <AnimatePresence>
        {showAddModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ width: '100%', maxWidth: '360px', background: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '20px', padding: '1.25rem', border: `1px solid ${colors.cardBorder}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', color: colors.textMain }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${colors.cardBorder}` }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>{t('MODAL_NEW_TICKET_TITLE', 'פתיחת קריאת תפעול חדשה')}</h3>
                <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted }}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>{t('MODAL_UNIT_TITLE', 'בחר יחידה / סוויטה *')}</label>
                  <select
                    value={newTicket.unitId}
                    onChange={(e) => setNewTicket({ ...newTicket, unitId: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, fontSize: '0.82rem', fontWeight: 800, boxSizing: 'border-box' }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>{t('MODAL_DOMAIN_TITLE', 'תחום טיפול *')}</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    {[
                      { id: 'MANAGER', label: t('FILTER_MANAGER', '👑 מנהלים'), icon: '👑' },
                      { id: 'HOUSEKEEPING', label: t('FILTER_HOUSEKEEPING', '🧹 משק בית'), icon: '🧹' },
                      { id: 'MAINTENANCE', label: t('FILTER_MAINTENANCE', '🔧 אחזקה'), icon: '🔧' },
                      { id: 'GARDENING', label: t('FILTER_GARDENING', '🌱 חצרנות'), icon: '🌱' }
                    ].map(tile => (
                      <button
                        key={tile.id}
                        type="button"
                        onClick={() => setNewTicket({ ...newTicket, domain: tile.id })}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '10px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          border: newTicket.domain === tile.id ? '1.5px solid #6366F1' : `1px solid ${colors.cardBorder}`,
                          background: newTicket.domain === tile.id ? '#6366F1' : colors.cardBg,
                          color: '#FFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span>{tile.icon}</span>
                        <span>{tile.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>{t('MODAL_DESC_TITLE', 'תיאור הקריאה והמשימה *')}</label>
                  <textarea
                    rows={3}
                    value={newTicket.description}
                    onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                    placeholder={t('MODAL_DESC_PLACEHOLDER', 'פרט בקצרה מה נדרש לבצע...')}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, fontSize: '0.82rem', resize: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Photo Attachment & Camera Capture */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>
                    {t('MODAL_ADD_PHOTOS', 'הוסף תמונות / מדיה')}
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem',
                    borderRadius: '10px',
                    background: colors.inputBg,
                    border: `1px dashed ${colors.inputBorder}`,
                    color: '#6366F1',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}>
                    <Camera size={16} />
                    <span>צלם תמונה במצלמה / העלה קובץ</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        for (const file of files) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const base64 = event.target.result;
                            setNewTicket(prev => ({ ...prev, photos: [...prev.photos, base64] }));
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>

                  {newTicket.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginTop: '0.5rem' }}>
                      {newTicket.photos.map((pSrc, pIdx) => (
                        <div key={pIdx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', aspectRatio: '1/1' }}>
                          <img src={pSrc} alt={`Upload ${pIdx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setNewTicket(prev => ({ ...prev, photos: prev.photos.filter((_, i) => i !== pIdx) }))}
                            style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.85)', color: '#FFF', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyRight: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${colors.cardBorder}` }}>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('BTN_CANCEL', 'ביטול')}
                  </button>
                  <button
                    type="submit"
                    style={{ background: '#6366F1', color: '#FFF', border: 'none', padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('BTN_SUBMIT_TICKET', 'פתח קריאה')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expanded Task Details Modal */}
      <AnimatePresence>
        {showDetailModal && selectedTaskForDetail && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ width: '100%', maxWidth: '360px', background: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '20px', padding: '1.25rem', border: `1px solid ${colors.cardBorder}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', color: colors.textMain }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${colors.cardBorder}` }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>
                    <DynamicText
                      text={selectedTaskForDetail.customTitle || selectedTaskForDetail.titleKey}
                      translations={selectedTaskForDetail.name_i18n}
                      sourceLang={selectedTaskForDetail.text_source_lang}
                    />
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{t('LABEL_ASSIGNED_TO', 'אחראי בצוות')}: {selectedTaskForDetail.assignedTo}</div>
                </div>
                <button onClick={() => setShowDetailModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '55vh', overflowY: 'auto' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>{t('LABEL_FULL_DESCRIPTION', 'תיאור הקריאה המלא')}</label>
                  {userRole === 'MANAGER' ? (
                    <textarea
                      rows={4}
                      value={detailDraft.description}
                      onChange={(e) => setDetailDraft((prev) => ({ ...prev, description: e.target.value }))}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, fontSize: '0.82rem', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <div style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, padding: '0.75rem', borderRadius: '12px', fontSize: '0.82rem', lineHeight: 1.5 }}>
                      <DynamicText
                        text={selectedTaskForDetail.customReason || selectedTaskForDetail.reasonKey}
                        translations={selectedTaskForDetail.reason_i18n}
                        sourceLang={selectedTaskForDetail.text_source_lang}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>
                    {t('LABEL_ATTACHED_PHOTOS', 'תמונות ומדיה מצורפת')}
                    {detailDraft.photos.length > 0 ? ` (${detailDraft.photos.length})` : ''}
                  </label>

                  {userRole === 'MANAGER' && (
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.6rem',
                      borderRadius: '10px',
                      background: colors.inputBg,
                      border: `1px dashed ${colors.inputBorder}`,
                      color: '#6366F1',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      marginBottom: detailDraft.photos.length > 0 ? '0.5rem' : 0
                    }}>
                      <Camera size={16} />
                      <span>{t('MODAL_ADD_PHOTOS', 'הוסף תמונות / מדיה')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          appendDetailPhotos(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}

                  {detailDraft.photos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      {detailDraft.photos.map((imgSrc, idx) => (
                        <div key={idx} style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9', border: `1px solid ${colors.cardBorder}` }}>
                          <img src={imgSrc} alt={`Detail ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {userRole === 'MANAGER' && (
                            <button
                              type="button"
                              onClick={() => setDetailDraft((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }))}
                              style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(239,68,68,0.85)', color: '#FFF', border: 'none', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {userRole === 'MANAGER' ? (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowDetailModal(false)}
                    style={{ flex: 1, background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, borderRadius: '10px', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('BTN_CANCEL', 'ביטול')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTaskDetails}
                    style={{ flex: 1, background: '#6366F1', color: '#FFF', border: 'none', borderRadius: '10px', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('BTN_SAVE', 'שמור')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDetailModal(false)}
                  style={{ width: '100%', marginTop: '1rem', background: '#6366F1', color: '#FFF', border: 'none', borderRadius: '10px', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                >
                  {t('BTN_CLOSE', 'סגור')}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSopModal && selectedTaskForSop ? (() => {
          const sop = ensureTaskSop(selectedTaskForSop, sopTemplates);
          const doneIds = sop.doneIds || [];
          const allDone = sop.steps.length > 0 && sop.steps.every((step) => doneIds.includes(step.id));
          const toggleStep = (stepId) => {
            const nextIds = doneIds.includes(stepId)
              ? doneIds.filter((id) => id !== stepId)
              : [...doneIds, stepId];
            persistSopProgress(selectedTaskForSop, { ...sop, doneIds: nextIds });
          };
          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{ width: '100%', maxWidth: '360px', maxHeight: '92%', overflowY: 'auto', background: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '20px', padding: '1.25rem', border: `1px solid ${colors.cardBorder}`, color: colors.textMain }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${colors.cardBorder}` }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>{t('SOP_TITLE', 'רשימת פעולות')}</h3>
                  <button onClick={() => setShowSopModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted }}>
                    <X size={18} />
                  </button>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '4px' }}>
                  <DynamicText text={selectedTaskForSop.customTitle || selectedTaskForSop.titleKey} translations={selectedTaskForSop.name_i18n} sourceLang={selectedTaskForSop.text_source_lang} />
                </div>
                <div style={{ fontSize: '0.82rem', color: colors.textMuted, marginBottom: '0.85rem' }}>
                  {t('SOP_HINT', 'כלי עזר — סמן אחד אחד, או את כולם')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sop.steps.map((step) => {
                    const checked = doneIds.includes(step.id);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => toggleStep(step.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          textAlign: 'start',
                          minHeight: '45px',
                          padding: '11px 10px',
                          borderRadius: '10px',
                          border: `1px solid ${checked ? '#6366F1' : colors.cardBorder}`,
                          background: checked ? (isDark ? 'rgba(99,102,241,0.16)' : '#EEF2FF') : colors.inputBg,
                          color: colors.textMain,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{
                          width: 22,
                          height: 22,
                          flexShrink: 0,
                          borderRadius: 6,
                          border: `2px solid ${checked ? '#6366F1' : colors.inputBorder}`,
                          background: checked ? '#6366F1' : 'transparent',
                          color: '#FFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 800
                        }}>
                          {checked ? '✓' : ''}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, lineHeight: 1.35 }}>
                          {stepLabel(step, currentLang)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => persistSopProgress(selectedTaskForSop, {
                      ...sop,
                      doneIds: allDone ? [] : sop.steps.map((step) => step.id)
                    })}
                    style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, padding: '10px 12px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {allDone ? t('SOP_CLEAR_ALL', 'נקה הכל') : t('SOP_MARK_ALL', 'סמן את כולם')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinishTask(selectedTaskForSop.id)}
                    style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '10px 12px', borderRadius: '10px', fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
                  >
                    {t('BTN_COMPLETE', 'סמן כטופל')}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })() : null}
      </AnimatePresence>

      {/* Quality Inspection Feedback Modal */}
      <AnimatePresence>
        {showFeedbackModal && selectedTaskForFeedback && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ width: '100%', maxWidth: '360px', background: isDark ? '#1E293B' : '#FFFFFF', borderRadius: '20px', padding: '1.25rem', border: `1px solid ${colors.cardBorder}`, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', color: colors.textMain }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${colors.cardBorder}` }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>{t('MODAL_FEEDBACK_TITLE', 'משוב ובקרת איכות מנהל')}</h3>
                  <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{selectedTaskForFeedback.customTitle || selectedTaskForFeedback.titleKey}</div>
                </div>
                <button onClick={() => setShowFeedbackModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: colors.textMuted, marginBottom: '0.75rem' }}>
                {t('FEEDBACK_REOPEN_HINT', 'ציון 3 ומטה באחד התחומים יפתח את המשימה מחדש')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '55vh', overflowY: 'auto' }}>
                {(selectedTaskForFeedback.domain === 'HOUSEKEEPING'
                  ? [
                      { id: 'clean', label: t('LABEL_CLEANLINESS', 'רמת ניקיון') },
                      { id: 'showerToilets', label: t('LABEL_SHOWER_TOILETS', 'מקלחת ושירותים') },
                      { id: 'linens', label: t('LABEL_LINENS', 'מצעים') },
                      { id: 'orderLook', label: t('LABEL_ORDER_LOOK', 'סדר ונראות') }
                    ]
                  : [
                      { id: 'speed', label: t('LABEL_EXECUTION_SPEED', 'זמן ביצוע') },
                      { id: 'prof', label: t('LABEL_PROFESSIONALISM', 'מקצועיות') },
                      { id: 'clean', label: t('LABEL_CLEANLINESS', 'רמת ניקיון') }
                    ]
                ).map(item => {
                  const value = Number(feedbackForm[item.id]) || 0;
                  const rateLabels = [
                    t('RATE_1', 'גרוע'),
                    t('RATE_2', 'חלש'),
                    t('RATE_3', 'בסדר'),
                    t('RATE_4', 'טוב'),
                    t('RATE_5', 'מעולה')
                  ];
                  const fill = value <= 1 ? '#EF4444' : value === 2 ? '#F59E0B' : value === 3 ? '#6366F1' : '#10B981';
                  return (
                    <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ fontWeight: 800 }}>{item.label}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: value > 0 ? fill : colors.textMuted }}>
                          {value > 0 ? rateLabels[value - 1] : ''}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.25rem' }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setFeedbackForm({ ...feedbackForm, [item.id]: n })}
                            style={{
                              height: '26px',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              background: n <= value && value > 0 ? fill : (isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0')
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{t('LABEL_FEEDBACK_NOTE', 'הערה')}</span>
                  <textarea
                    value={feedbackForm.note || ''}
                    onChange={(e) => setFeedbackForm({ ...feedbackForm, note: e.target.value })}
                    placeholder={t('PH_FEEDBACK_NOTE', 'הערה קצרה למשימה (אופציונלי)')}
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'none',
                      boxSizing: 'border-box',
                      borderRadius: '10px',
                      padding: '0.6rem 0.75rem',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                      background: colors.inputBg,
                      border: `1px solid ${colors.inputBorder}`,
                      color: colors.textMain,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveFeedback}
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  background: failedRatingKeys(feedbackForm, selectedTaskForFeedback.domain).length > 0 ? '#DC2626' : '#10B981',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.6rem',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {failedRatingKeys(feedbackForm, selectedTaskForFeedback.domain).length > 0
                  ? t('BTN_REOPEN_TASK', 'פתח משימה מחדש')
                  : t('BTN_SAVE_FEEDBACK', 'שמור משוב')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
