import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useDynamicText } from '../lib/translator';
import { 
  Sparkles, 
  Wrench, 
  Flower2, 
  Plus, 
  Check, 
  Play, 
  Star, 
  X, 
  Camera, 
  Crown
} from 'lucide-react';

function DynamicText({ text }) {
  const translated = useDynamicText(text);
  return <>{translated}</>;
}
import { db, useLiveUnits, useLiveBookings } from '../lib/hotelos-db';
import { pushBookingToCloud, subscribeToRealtimeCloudBookings, syncCloudBookingsToDexie } from '../lib/cloudDb';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

// 4-Language Translation Dictionary
const TRANSLATIONS = {
  he: {
    title: "HotelOS תפעול",
    subtitle: "ניהול משימות ותחזוקה בזמן אמת",
    settings: "הגדרות",
    theme: "ערכת נושא",
    light: "בהיר",
    dark: "כהה",
    language: "שפת ממשק",
    profileTitle: "👤 בחר פרופיל עובד:",
    roles: {
      MANAGER: "👑 מנהל",
      HOUSEKEEPING: "🧹 משק בית",
      MAINTENANCE: "🔧 אחזקה",
      GARDENING: "🌱 חצרנות"
    },
    filterLabel: "סינון:",
    filters: {
      ALL: "הכל",
      HOUSEKEEPING: "🧹 משק בית",
      MAINTENANCE: "🔧 אחזקה",
      GARDENING: "🌱 חצרנות",
      MANAGER: "👑 מנהלים"
    },
    kpi: {
      ALL: "כל המשימות",
      OPEN: "📂 פתוחות",
      IN_PROGRESS: "⚡ בטיפול",
      READY: "🟢 מוכנים"
    },
    urgency: {
      CRITICAL: "🔴 קריטי",
      HIGH: "🟧 גבוהה",
      ROUTINE: "🟦 שגרה",
      READY: "🟢 מוכן"
    },
    btn: {
      start: "התחל משימה",
      complete: "סמן כטופל",
      completed: "בוצע בהצלחה",
      addCall: "קריאה חדשה",
      close: "סגור",
      save: "שמור"
    },
    feedback: {
      title: "משוב ובקרת איכות מנהל",
      subTitle: "דירוג מהיר למשימה שהושלמה",
      housekeepingTitle: "בדיקת רכיבי ניקיון (משק בית)",
      generalTitle: "מדדי ביצוע ואחזקה",
      toilets: "שירותים",
      shower: "מקלחת",
      dust: "אבק",
      bedding: "מצעים",
      coffee: "פינת קפה",
      speed: "זמן ביצוע",
      prof: "מקצועיות",
      clean: "רמת ניקיון",
      good: "מעולה 👍",
      ok: "ככה ככה 😐",
      bad: "טעון שיפור 👎",
      save: "שמור משוב",
      inspected: "נבדק ע״י מנהל",
      inspectBtn: "בקרת איכות"
    },
    noTasksTitle: "אין משימות בקטגוריה זו",
    noTasksDesc: "כל הקריאות והמשימות טופלו בהצלחה",
    modal: {
      title: "פתיחת קריאת תפעול חדשה",
      unitTitle: "בחר יחידה / סוויטה *",
      selectUnitPlaceholder: "-- בחר יחידה מהרשימה --",
      domain: "תחום טיפול *",
      desc: "תיאור הקריאה והמשימה *",
      descPlaceholder: "פרט בקצרה מה נדרש לבצע...",
      addPhotos: "הוסף תמונות / מדיה",
      cancel: "ביטול",
      submit: "פתח קריאה"
    },
    detailModal: {
      title: "פרטי קריאה מורחבים",
      assignedTo: "אחראי בצוות",
      description: "תיאור הקריאה המלא",
      photos: "תמונות ומדיה מצורפת",
      close: "סגור"
    }
  },
  en: {
    title: "HotelOS Operations",
    subtitle: "Real-time Operations & Maintenance",
    settings: "Settings",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    language: "Language",
    profileTitle: "👤 Select Staff Profile:",
    roles: {
      MANAGER: "👑 Manager",
      HOUSEKEEPING: "🧹 Housekeeper",
      MAINTENANCE: "🔧 Maintenance",
      GARDENING: "🌱 Gardener"
    },
    filterLabel: "Filter:",
    filters: {
      ALL: "All",
      HOUSEKEEPING: "🧹 Housekeeping",
      MAINTENANCE: "🔧 Maintenance",
      GARDENING: "🌱 Gardening",
      MANAGER: "👑 Manager"
    },
    kpi: {
      ALL: "All Tasks",
      OPEN: "📂 Open",
      IN_PROGRESS: "⚡ In Progress",
      READY: "🟢 Ready"
    },
    urgency: {
      CRITICAL: "🔴 Critical",
      HIGH: "🟧 High Priority",
      ROUTINE: "🟦 Routine",
      READY: "🟢 Ready"
    },
    btn: {
      start: "Start Task",
      complete: "Mark Done",
      completed: "Completed",
      addCall: "New Task",
      close: "Close",
      save: "Save"
    },
    feedback: {
      title: "Quality Control & Feedback",
      subTitle: "Quick evaluation for completed task",
      housekeepingTitle: "Housekeeping Inspection Items",
      generalTitle: "Maintenance & Execution Metrics",
      toilets: "Toilets",
      shower: "Shower",
      dust: "Dusting",
      bedding: "Bedding",
      coffee: "Coffee Station",
      speed: "Execution Time",
      prof: "Professionalism",
      clean: "Cleanliness",
      good: "Great 👍",
      ok: "Fair 😐",
      bad: "Poor 👎",
      save: "Save Feedback",
      inspected: "Inspected by Manager",
      inspectBtn: "Quality Inspection"
    },
    noTasksTitle: "No tasks found",
    noTasksDesc: "All tasks in this section are completed",
    modal: {
      title: "Open New Operations Ticket",
      unitTitle: "Select Unit / Suite *",
      selectUnitPlaceholder: "-- Select unit from list --",
      domain: "Department *",
      desc: "Description *",
      descPlaceholder: "Briefly explain what needs to be done...",
      addPhotos: "Attach Photos / Media",
      cancel: "Cancel",
      submit: "Create Ticket"
    },
    detailModal: {
      title: "Expanded Task Details",
      assignedTo: "Assigned Staff",
      description: "Full Task Description",
      photos: "Attached Photos",
      close: "Close"
    }
  },
  ar: {
    title: "HotelOS Operations",
    subtitle: "إدارة العمليات والصيانة",
    settings: "الإعدادات",
    theme: "المظهر",
    light: "فاتح",
    dark: "داكن",
    language: "اللغة",
    profileTitle: "👤 اختر ملف الموظف:",
    roles: {
      MANAGER: "👑 مدير",
      HOUSEKEEPING: "🧹 تنظيف",
      MAINTENANCE: "🔧 صيانة",
      GARDENING: "🌱 بستنة"
    },
    filterLabel: "تصفية:",
    filters: {
      ALL: "الكل",
      HOUSEKEEPING: "🧹 تنظيف",
      MAINTENANCE: "🔧 صيانة",
      GARDENING: "🌱 بستنة",
      MANAGER: "👑 إدارة"
    },
    kpi: {
      ALL: "جميع المهام",
      OPEN: "📂 مفتوحة",
      IN_PROGRESS: "⚡ قيد التنفيذ",
      READY: "🟢 جاهز"
    },
    urgency: {
      CRITICAL: "🔴 حرج",
      HIGH: "🟧 عالي",
      ROUTINE: "🟦 روتيني",
      READY: "🟢 جاهز"
    },
    btn: {
      start: "بدء المهمة",
      complete: "تم الإنجاز",
      completed: "مكتمل",
      addCall: "طلب جديد",
      close: "إغلاق",
      save: "حفظ"
    },
    feedback: {
      title: "ضبط الجودة وتقييم المدير",
      subTitle: "تقييم سريع للمهمة المكتملة",
      housekeepingTitle: "عناصر التنظيف والترتيب",
      generalTitle: "معايير التنفيذ والصيانة",
      toilets: "المراحيض",
      shower: "الدش",
      dust: "الغبار",
      bedding: "الأغطية",
      coffee: "ركن القهوة",
      speed: "وقت التنفيذ",
      prof: "الاحترافية",
      clean: "النظافة",
      good: "ممتاز 👍",
      ok: "عادي 😐",
      bad: "ضعيف 👎",
      save: "حفظ التقييم",
      inspected: "تم الفحص بواسطة المدير",
      inspectBtn: "رقابة الجودة"
    },
    noTasksTitle: "لا توجد مهام",
    noTasksDesc: "تم التعامل مع جميع المهام بنجاح",
    modal: {
      title: "فتح بلاغ تشغيلي جديد",
      unitTitle: "اختر الوحدة / الجناح *",
      selectUnitPlaceholder: "-- اختر وحدة من القائمة --",
      domain: "القسم *",
      desc: "الوصف *",
      descPlaceholder: "اشرح باختصار ما يجب القيام به...",
      addPhotos: "إضافة صور / وسائط",
      cancel: "إلغاء",
      submit: "إنشاء الطلب"
    },
    detailModal: {
      title: "تفاصيل المهمة الموسعة",
      assignedTo: "المسؤول في الفريق",
      description: "الوصف الكامل والتفاصيل",
      photos: "الصور والمرفقات",
      close: "إغلاق"
    }
  },
  th: {
    title: "HotelOS Operations",
    subtitle: "การจัดการงานปฏิบัติการและบำรุงรักษา",
    settings: "การตั้งค่า",
    theme: "ธีม",
    light: "สว่าง",
    dark: "มืด",
    language: "ภาษา",
    profileTitle: "👤 เลือกโปรไฟล์พนักงาน:",
    roles: {
      MANAGER: "👑 ผู้จัดการ",
      HOUSEKEEPING: "🧹 แม่บ้าน",
      MAINTENANCE: "🔧 ช่างซ่อม",
      GARDENING: "🌱 คนสวน"
    },
    filterLabel: "ตัวกรอง:",
    filters: {
      ALL: "ทั้งหมด",
      HOUSEKEEPING: "<ctrl42> แม่บ้าน",
      MAINTENANCE: "🔧 ช่างซ่อม",
      GARDENING: "🌱 คนสวน",
      MANAGER: "👑 ผู้จัดการ"
    },
    kpi: {
      ALL: "งานทั้งหมด",
      OPEN: "📂 งานเปิด",
      IN_PROGRESS: "⚡ กำลังทำ",
      READY: "🟢 เสร็จสมบูรณ์"
    },
    urgency: {
      CRITICAL: "🔴 วิกฤต",
      HIGH: "🟧 ด่วน",
      ROUTINE: "🟦 ปกติ",
      READY: "🟢 พร้อม"
    },
    btn: {
      start: "เริ่มงาน",
      complete: "เสร็จสิ้น",
      completed: "เสร็จแล้ว",
      addCall: "เพิ่มงาน",
      close: "ปิด",
      save: "บันทึก"
    },
    feedback: {
      title: "การควบคุมคุณภาพและข้อเสนอแนะ",
      subTitle: "ให้คะแนนงานที่เสร็จสมบูรณ์อย่างรวดเร็ว",
      housekeepingTitle: "รายการทำความสะอาดแม่บ้าน",
      generalTitle: "ตัวชี้วัดการดำเนินการและบำรุงรักษา",
      toilets: "ห้องน้ำ",
      shower: "ห้องอาบน้ำ",
      dust: "การปัดฝุ่น",
      bedding: "เครื่องนอน",
      coffee: "มุมกาแฟ",
      speed: "ระยะเวลาดำเนินการ",
      prof: "ความมืออาชีพ",
      clean: "ความสะอาด",
      good: "ดีมาก 👍",
      ok: "พอใช้ 😐",
      bad: "ต้องปรับปรุง 👎",
      save: "บันทึกข้อเสนอแนะ",
      inspected: "ตรวจสอบแล้วโดยผู้จัดการ",
      inspectBtn: "ตรวจเช็คคุณภาพ"
    },
    noTasksTitle: "ไม่มีรายการงาน",
    noTasksDesc: "งานทั้งหมดได้รับการดูแลเรียบร้อยแล้ว",
    modal: {
      title: "เปิดรายการงานปฏิบัติการใหม่",
      unitTitle: "เลือกวิลล่า / ห้องพัก *",
      selectUnitPlaceholder: "-- เลือกวิลล่าจากรายการ --",
      domain: "แผนก *",
      desc: "รายละเอียดงาน *",
      descPlaceholder: "อธิบายรายละเอียดงานสั้นๆ...",
      addPhotos: "แนบรูปภาพ / สื่อ",
      cancel: "ยกเลิก",
      submit: "บันทึกรายการ"
    },
    detailModal: {
      title: "รายละเอียดงานอย่างละเอียด",
      assignedTo: "ผู้รับผิดชอบ",
      description: "รายละเอียดงานทั้งหมด",
      photos: "รูปภาพและสื่อแนบ",
      close: "ปิด"
    }
  }
};

const PRESET_UNITS = [
  "סוויטת דלוקס 201",
  "סוויטת פרימיום 304",
  "וילה פסטורלית 102",
  "סוויטה נשיאותית 501",
  "סוויטת גן 105",
  "פנטהאוז רויאל 602",
  "סוויטת ספא 108"
];

export default function HotelOSOperations({ theme: parentTheme = 'dark', tenantId = DEMO_TENANT_ID }) {
  // Live Dexie IndexedDB Hooks
  const rawUnits = useLiveUnits(tenantId);
  const rawBookings = useLiveBookings(tenantId);

  // Real-time Cloud Sync
  useEffect(() => {
    syncCloudBookingsToDexie(tenantId);
    const unsubscribe = subscribeToRealtimeCloudBookings(tenantId);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [tenantId]);

  // Reactive Theme & i18n Language Sync from App.jsx & Settings.jsx
  const theme = parentTheme;
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'he';
  const isRTL = currentLang === 'he' || currentLang === 'ar';

  // Component States
  const [userRole, setUserRole] = useState('MANAGER');
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

  // Selected Task States
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);
  const [selectedTaskForFeedback, setSelectedTaskForFeedback] = useState(null);

  // New Ticket Form State (with photos attachment support)
  const [newTicket, setNewTicket] = useState({
    unitName: PRESET_UNITS[0],
    domain: 'HOUSEKEEPING',
    description: '',
    photos: []
  });

  // Quality Inspection Feedback Form State
  const [feedbackForm, setFeedbackForm] = useState({
    toilets: 'good',
    shower: 'good',
    dust: 'good',
    bedding: 'good',
    coffee: 'good',
    speed: 'good',
    prof: 'good',
    clean: 'good'
  });

  // Compute tasks list dynamically from live units & bookings + custom user tickets
  const tasks = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const unitTasks = (rawUnits || []).map(unit => {
      const activeBooking = (rawBookings || []).find(b => 
        b.unit_id === unit.id && 
        !b.deleted_at && 
        b.booking_status !== 'CANCELED' &&
        todayStr >= b.check_in_date && 
        todayStr < b.check_out_date
      );

      const hasSameDayCheckin = (rawBookings || []).some(b => 
        b.unit_id === unit.id && 
        !b.deleted_at && 
        b.booking_status !== 'CANCELED' &&
        b.check_in_date === todayStr
      );

      const status = unit.operational_status || (hasSameDayCheckin ? 'DIRTY' : (unit.id === 'u3' ? 'MAINTENANCE_ALERT' : 'READY'));
      const domain = unit.operational_domain || (status === 'MAINTENANCE_ALERT' ? 'MAINTENANCE' : (status === 'GARDENING' ? 'GARDENING' : 'HOUSEKEEPING'));
      const urgency = unit.is_escalated ? 'CRITICAL' : (hasSameDayCheckin ? 'HIGH' : (status === 'READY' ? 'READY' : 'ROUTINE'));

      const computedReason = unit.custom_reason || unit.task_description || 
        (status === 'MAINTENANCE_ALERT' ? 'תקלת אחזקה פתוחה ביחידה - נדרש תיקון מיידי' : 
        (status === 'DIRTY' ? 'ניקוי יסודי והכנה לקבלת אורחים' : 'היחידה נקייה ומוכנה לחלוטין'));

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
        photos: unit.image_urls || []
      };
    });

    // Merge customTickets created by user in real-time
    const mergedList = [...customTickets, ...unitTasks];
    
    // Deduplicate by ID
    const uniqueMap = new Map();
    mergedList.forEach(t => uniqueMap.set(t.id, t));
    return Array.from(uniqueMap.values());
  }, [rawUnits, rawBookings, customTickets]);

  // Submit New Operations Ticket to Dexie IndexedDB & Memory State & Cloud Sync
  const handleCreateTicketSubmit = async (e) => {
    e.preventDefault();
    
    const nowIso = new Date().toISOString();
    const newStatus = newTicket.domain === 'MAINTENANCE' ? 'MAINTENANCE_ALERT' : 'DIRTY';
    const urgencyLevel = newTicket.domain === 'MAINTENANCE' ? 'CRITICAL' : 'HIGH';

    // Create a distinct unique ticket ID for each new ticket
    const targetUnitId = 'u_t_' + Date.now();
    const taskReasonText = newTicket.description.trim() || (newStatus === 'MAINTENANCE_ALERT' ? 'תקלת אחזקה דחופה נפתחה' : 'ניקוי יסודי נדרש לקבלת אורחים');
    const ticketPhotos = [...newTicket.photos];

    const newTicketItem = {
      id: targetUnitId,
      titleKey: newTicket.unitName,
      customTitle: newTicket.unitName,
      domain: newTicket.domain,
      status: newStatus,
      urgency: urgencyLevel,
      assignedTo: 'צוות תפעול',
      reasonKey: taskReasonText,
      customReason: taskReasonText,
      photos: ticketPhotos
    };

    // 1. Immediately update component state for 0ms reactivity (preventing photo leaks)
    setCustomTickets(prev => [newTicketItem, ...prev]);

    // 2. Persist cleanly to Dexie IndexedDB
    try {
      await db.units.put({
        id: targetUnitId,
        tenant_id: tenantId,
        name: newTicket.unitName,
        unit_type: 'suite',
        max_occupancy: 2,
        base_price_agorot: 85000,
        cleaning_fee_agorot: 10000,
        is_active: true,
        operational_status: newStatus,
        operational_domain: newTicket.domain,
        custom_reason: taskReasonText,
        assigned_staff: 'צוות תפעול',
        is_escalated: newTicket.domain === 'MAINTENANCE',
        image_urls: ticketPhotos,
        created_at: nowIso,
        updated_at: nowIso,
        version: 1
      });
    } catch (err) {
      console.warn('[DEXIE TICKET PUT WARN]', err);
    }

    // 3. Broadcast to Cloud
    pushBookingToCloud({
      id: 'op_new_ticket_' + targetUnitId + '_' + Date.now(),
      unit_id: targetUnitId,
      status: newStatus,
      domain: newTicket.domain,
      name: newTicket.unitName,
      custom_reason: taskReasonText,
      image_urls: ticketPhotos,
      updated_at: nowIso
    });

    setNewTicket({ unitName: PRESET_UNITS[0], domain: 'HOUSEKEEPING', description: '', photos: [] });
    setShowAddModal(false);
  };

  // Single-Tap Task Action Handlers
  const handleStartTask = useCallback(async (taskId) => {
    const nowIso = new Date().toISOString();
    setCustomTickets(prev => prev.map(t => t.id === taskId ? { ...t, status: 'IN_PROGRESS' } : t));

    try {
      await db.units.update(taskId, {
        operational_status: 'IN_PROGRESS',
        cleaning_started_at: nowIso,
        updated_at: nowIso
      });
    } catch (_) {}

    pushBookingToCloud({ id: 'op_start_' + taskId, unit_id: taskId, status: 'IN_PROGRESS', updated_at: nowIso });
  }, []);

  const handleFinishTask = useCallback(async (taskId) => {
    const nowIso = new Date().toISOString();
    setCustomTickets(prev => prev.map(t => t.id === taskId ? { ...t, status: 'READY', urgency: 'READY' } : t));

    try {
      await db.units.update(taskId, {
        operational_status: 'READY',
        cleaning_started_at: null,
        is_escalated: false,
        updated_at: nowIso
      });
    } catch (_) {}

    pushBookingToCloud({ id: 'op_finish_' + taskId, unit_id: taskId, status: 'READY', updated_at: nowIso });
  }, []);

  // Filter Tasks Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (userRole === 'HOUSEKEEPING' && task.domain !== 'HOUSEKEEPING') return false;
      if (userRole === 'MAINTENANCE' && task.domain !== 'MAINTENANCE') return false;
      if (userRole === 'GARDENING' && task.domain !== 'GARDENING') return false;

      if (userRole === 'MANAGER' && domainFilter !== 'ALL' && task.domain !== domainFilter) return false;

      if (activeKPI === 'OPEN' && task.status === 'READY') return false;
      if (activeKPI === 'IN_PROGRESS' && task.status !== 'IN_PROGRESS') return false;
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

  return (
    <div 
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setActiveKPI(activeKPI === 'OPEN' ? 'ALL' : 'OPEN')}
            style={{
              background: activeKPI === 'OPEN' ? 'rgba(99, 102, 241, 0.15)' : colors.cardBg,
              border: activeKPI === 'OPEN' ? '1.5px solid #6366F1' : `1px solid ${colors.cardBorder}`,
              borderRadius: '12px',
              padding: '0.6rem 0.4rem',
              textAlign: 'center',
              cursor: 'pointer',
              color: colors.textMain
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>{t('KPI_OPEN', '📂 פתוחות')}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>
              {tasks.filter(t => t.status !== 'READY').length}
            </div>
          </button>

          <button
            onClick={() => setActiveKPI(activeKPI === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
            style={{
              background: activeKPI === 'IN_PROGRESS' ? 'rgba(99, 102, 241, 0.15)' : colors.cardBg,
              border: activeKPI === 'IN_PROGRESS' ? '1.5px solid #6366F1' : `1px solid ${colors.cardBorder}`,
              borderRadius: '12px',
              padding: '0.6rem 0.4rem',
              textAlign: 'center',
              cursor: 'pointer',
              color: colors.textMain
            }}
          >
            <div style={{ fontSize: '0.75rem', fontWeight: 900 }}>{t('KPI_IN_PROGRESS', '⚡ בטיפול')}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#6366F1', marginTop: '2px' }}>
              {tasks.filter(t => t.status === 'IN_PROGRESS').length}
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

      {/* Manager Domain Filter Chips */}
      {userRole === 'MANAGER' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.4rem', marginBottom: '1.25rem' }}>
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

      {/* Actionable Task Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredTasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', border: `1px dashed ${colors.cardBorder}`, borderRadius: '16px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: colors.textMuted }}>{t('NO_TASKS_TITLE', 'אין משימות בקטגוריה זו')}</div>
            <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '4px' }}>{t('NO_TASKS_DESC', 'כל הקריאות והמשימות טופלו בהצלחה')}</div>
          </div>
        ) : (
          filteredTasks.map(room => {
            const isCritical = room.urgency === 'CRITICAL';
            const isHigh = room.urgency === 'HIGH';
            const isInProgress = room.status === 'IN_PROGRESS';
            const isReady = room.status === 'READY';

            const titleText = room.customTitle || room.titleKey;
            const reasonText = room.customReason || room.reasonKey;
            const hasFeedback = taskFeedbacks[room.id];

            const hasPhotos = room.photos && room.photos.length > 0;
            const isLongText = Boolean(reasonText && reasonText.length > 28);
            const hasDetails = hasPhotos || isLongText;

            const borderColor = isCritical ? '#EF4444' : (isHigh ? '#F59E0B' : (isInProgress ? '#6366F1' : (isReady ? '#10B981' : '#60A5FA')));
            const bgOverlay = isCritical ? (isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2') : (isHigh ? (isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB') : (isInProgress ? (isDark ? 'rgba(99, 102, 241, 0.12)' : '#EEF2FF') : (isReady ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5') : colors.cardBg)));

            return (
              <div
                key={room.id}
                onClick={() => {
                  if (hasDetails) {
                    setSelectedTaskForDetail(room);
                    setShowDetailModal(true);
                  }
                }}
                style={{
                  background: bgOverlay,
                  border: `2px solid ${borderColor}`,
                  borderRadius: '16px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  cursor: hasDetails ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Task Header & Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {room.domain === 'MANAGER' && <Crown size={15} color="#F59E0B" />}
                    {room.domain === 'HOUSEKEEPING' && <Sparkles size={15} color="#F59E0B" />}
                    {room.domain === 'MAINTENANCE' && <Wrench size={15} color="#EF4444" />}
                    {room.domain === 'GARDENING' && <Flower2 size={15} color="#10B981" />}

                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <DynamicText text={titleText} />
                    </h3>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>{room.assignedTo}</span>
                    <span>•</span>
                    <span style={{ opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <DynamicText text={reasonText} />
                    </span>
                    {hasPhotos && (
                      <span style={{ color: '#6366F1', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                        <Camera size={12} />
                        <span>{room.photos.length}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Contextual Single-Tap Action Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  {!isReady ? (
                    isInProgress ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFinishTask(room.id); }}
                        style={{
                          background: 'linear-gradient(135deg, #10B981, #059669)',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}
                      >
                        <Check size={14} />
                        <span>{t('BTN_COMPLETE', 'סמן כטופל')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartTask(room.id); }}
                        style={{
                          background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                          color: '#FFF',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                        }}
                      >
                        <Play size={13} />
                        <span>{t('BTN_START', 'התחל משימה')}</span>
                      </button>
                    )
                  ) : (
                    userRole === 'MANAGER' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskForFeedback(room);
                          setShowFeedbackModal(true);
                        }}
                        style={{
                          background: hasFeedback ? 'rgba(245, 158, 11, 0.15)' : '#6366F1',
                          color: hasFeedback ? '#F59E0B' : '#FFF',
                          border: hasFeedback ? '1px solid #F59E0B' : 'none',
                          borderRadius: '10px',
                          padding: '0.45rem 0.75rem',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <Star size={13} />
                        <span>{hasFeedback ? t('BTN_INSPECTED', 'נבדק ע״י מנהל') : t('BTN_INSPECT', 'בקרת איכות')}</span>
                      </button>
                    ) : (
                      <div style={{ color: '#10B981', fontWeight: 800, fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Check size={14} />
                        <span>{t('STATUS_CLEAN', 'נקי')}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

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
                    value={newTicket.unitName}
                    onChange={(e) => setNewTicket({ ...newTicket, unitName: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '10px', background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textMain, fontSize: '0.82rem', fontWeight: 800, boxSizing: 'border-box' }}
                  >
                    {PRESET_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
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
                    <DynamicText text={selectedTaskForDetail.customTitle || selectedTaskForDetail.titleKey} />
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
                  <div style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, padding: '0.75rem', borderRadius: '12px', fontSize: '0.82rem', lineHeight: 1.5 }}>
                    <DynamicText text={selectedTaskForDetail.customReason || selectedTaskForDetail.reasonKey} />
                  </div>
                </div>

                {selectedTaskForDetail.photos && selectedTaskForDetail.photos.length > 0 && (
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.textMuted, display: 'block', marginBottom: '0.3rem' }}>{t('LABEL_ATTACHED_PHOTOS', 'תמונות ומדיה מצורפת')} ({selectedTaskForDetail.photos.length})</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      {selectedTaskForDetail.photos.map((imgSrc, idx) => (
                        <div key={idx} style={{ borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9', border: `1px solid ${colors.cardBorder}` }}>
                          <img src={imgSrc} alt={`Detail ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowDetailModal(false)}
                style={{ width: '100%', marginTop: '1rem', background: '#6366F1', color: '#FFF', border: 'none', borderRadius: '10px', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
              >
                {t('BTN_CLOSE', 'סגור')}
              </button>
            </motion.div>
          </div>
        )}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '50vh', overflowY: 'auto' }}>
                {[
                  { id: 'speed', label: t('LABEL_EXECUTION_SPEED', 'זמן ביצוע') },
                  { id: 'prof', label: t('LABEL_PROFESSIONALISM', 'מקצועיות') },
                  { id: 'clean', label: t('LABEL_CLEANLINESS', 'רמת ניקיון') }
                ].map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: colors.cardBg, borderRadius: '10px', fontSize: '0.78rem' }}>
                    <span style={{ fontWeight: 800 }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {[
                        { key: 'good', label: t('RATE_GREAT', 'מעולה 👍') },
                        { key: 'ok', label: t('RATE_FAIR', 'ככה ככה 😐') },
                        { key: 'bad', label: t('RATE_POOR', 'טעון שיפור 👎') }
                      ].map(rate => (
                        <button
                          key={rate.key}
                          type="button"
                          onClick={() => setFeedbackForm({ ...feedbackForm, [item.id]: rate.key })}
                          style={{
                            padding: '0.25rem 0.45rem',
                            borderRadius: '6px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            border: feedbackForm[item.id] === rate.key ? '1px solid #6366F1' : `1px solid ${colors.cardBorder}`,
                            background: feedbackForm[item.id] === rate.key ? '#6366F1' : 'transparent',
                            color: feedbackForm[item.id] === rate.key ? '#FFF' : colors.textMuted,
                            cursor: 'pointer'
                          }}
                        >
                          {rate.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setTaskFeedbacks(prev => ({ ...prev, [selectedTaskForFeedback.id]: { ...feedbackForm } }));
                  setShowFeedbackModal(false);
                }}
                style={{ width: '100%', marginTop: '1rem', background: '#10B981', color: '#FFF', border: 'none', borderRadius: '10px', padding: '0.6rem', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
              >
                {t('BTN_SAVE_FEEDBACK', 'שמור משוב')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
