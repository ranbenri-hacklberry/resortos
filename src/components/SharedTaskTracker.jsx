import React, { useState, useEffect } from 'react';
import GolanInteractiveMap from './GolanInteractiveMap';
import {
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trash2,
  Edit3,
  User,
  ShoppingBag,
  Phone,
  Share2,
  Download,
  Upload,
  Filter,
  AlertCircle,
  Calendar,
  Tag,
  MessageSquare,
  Check,
  MapPin,
  X,
  DollarSign,
  UserPlus,
  Users,
  CheckSquare,
  ListTodo,
  TrendingUp,
  RefreshCw,
  Link2
} from 'lucide-react';
import { listStaff } from '../lib/staffAuth';
import { fetchSharedTracker, saveSharedTracker } from '../lib/sharedTrackerApi.js';

const STORAGE_KEY = 'hotelos_shared_tracker_data_v3';

const FAKE_PERSON_IDS = new Set(['p1', 'p2', 'p3']);
const FAKE_PERSON_NAMES = new Set(['דניאל כהן', 'משה ראובני', 'שירה לוי']);

const ROLE_HE = {
  MANAGER: 'ניהול',
  OPS_MANAGER: 'תפעול',
  HOUSEKEEPING: 'משק בית',
  MAINTENANCE: 'תחזוקה',
  GARDENING: 'גינון'
};

const SHOPPING_CATEGORIES = [
  'משק וניקיון',
  'ציוד ואלקטרוניקה',
  'תקשורת ותוכנה',
  'מצרכים ומזון',
  'גינון ותחזוקה',
  'ריהוט וטקסטיל',
  'אחר'
];

function isDemoPerson(person) {
  if (!person) return true;
  return FAKE_PERSON_IDS.has(person.id) || FAKE_PERSON_NAMES.has(person.name);
}

function staffToPerson(user) {
  if (!user?.id) return null;
  return {
    id: String(user.id),
    name: user.display_name || user.username || 'חבר צוות',
    role: ROLE_HE[user.role] || user.role || 'צוות',
    phone: user.phone || '',
    fromStaff: true
  };
}

const DEFAULT_PEOPLE = [];

function extraPeopleFrom(people) {
  return (people || []).filter((person) => person && !person.fromStaff && !isDemoPerson(person));
}

function itemScore(item) {
  if (!item || typeof item !== 'object') return 0;
  let score = 0;
  for (const key of ['link', 'notes', 'store', 'neededBy', 'description', 'title', 'name', 'quantity']) {
    if (item[key]) score += 1;
  }
  if (Number(item.estimatedPrice) > 0) score += 1;
  if (Array.isArray(item.logs)) score += item.logs.length;
  return score;
}

function mergeById(left, right) {
  const map = new Map();
  for (const item of [...(left || []), ...(right || [])]) {
    if (!item?.id) continue;
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, itemScore(item) >= itemScore(prev) ? { ...prev, ...item } : { ...item, ...prev });
  }
  return [...map.values()];
}

function trackerPayload(data) {
  return {
    errands: data.errands || [],
    shopping: data.shopping || [],
    extraPeople: extraPeopleFrom(data.people)
  };
}

const DEFAULT_ERRANDS = [
  {
    id: 'e0',
    title: 'מערכת פתיחת שערים צהובים במושבים (מספר וירטואלי)',
    description: 'הגדרת מספר נייד וירטואלי, רישומו במזכירויות המושבים וחיוג אוטומטי לפתיחה',
    assigneeId: 'p1',
    priority: 'high',
    status: 'in_progress',
    dueDate: '2026-08-22',
    logs: [
      { id: 'l0_1', date: '2026-08-18 11:45', text: 'הוגדרה תוכנית עבודה: רכישת קו וירטואלי -> מיפוי מספרי שערים -> רישום במזכירויות' }
    ]
  },
  {
    id: 'e_partner',
    title: 'פנייה לעסקים מקומיים (בני יהודה, גבעת יואב, רמות, כנף, נאות גולן, מיצר)',
    description: 'פנייה בוואטסאפ ל-25+ מסעדות, עגלות קפה, רייזרים, סוסים, יקבים, בית בד וסדנאות לשיתוף פעולה והטבות לאורחים',
    assigneeId: 'p3',
    priority: 'medium',
    status: 'in_progress',
    dueDate: '2026-08-25',
    logs: [
      { id: 'l_p1', date: '2026-08-19 08:05', text: 'רוכז מאגר מקיף של 25+ עסקים מקומיים עם מספרי סלולרי וקישורי WhatsApp ישירים (בני יהודה, גבעת יואב, נאות גולן, כנף, רמות, מיצר, גשור, אלי-עד ונטור)' }
    ]
  }
];

const DEFAULT_SHOPPING = [
  {
    id: 's1',
    name: 'מזגנים ניידים (Portable Air Conditioners)',
    category: 'ציוד ואלקטרוניקה',
    quantity: '2-4 יחידות',
    estimatedPrice: 1500,
    actualPrice: 0,
    store: 'מחסני חשמל / KSP / LastPrice',
    assigneeId: 'p1',
    status: 'to_buy'
  },
  {
    id: 's0',
    name: 'מנוי חודשי לקו וירטואלי / SIP לחיוג לשערים',
    category: 'תקשורת ותוכנה',
    quantity: '1 קו',
    estimatedPrice: 49,
    actualPrice: 0,
    store: 'ספק תקשורת (019 / ימות המשיח / Twilio)',
    assigneeId: 'p1',
    status: 'to_buy'
  }
];

export default function SharedTaskTracker({ theme = 'dark', sessionUser = null }) {
  const isLight = theme === 'light';

  // Load Initial State from LocalStorage or Defaults
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          people: Array.isArray(parsed.people) ? parsed.people.filter((p) => !isDemoPerson(p)) : []
        };
      }
    } catch (err) {
      console.error('Failed to load shared tracker state:', err);
    }
    return {
      errands: DEFAULT_ERRANDS,
      shopping: DEFAULT_SHOPPING,
      people: DEFAULT_PEOPLE
    };
  });

  const [activeTab, setActiveTab] = useState('errands'); // 'errands' | 'shopping' | 'people'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');

  // Modals & Form State
  const [showErrandModal, setShowErrandModal] = useState(false);
  const [editingErrand, setEditingErrand] = useState(null);
  const [errandForm, setErrandForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    priority: 'medium',
    status: 'todo',
    dueDate: ''
  });

  const [showShoppingModal, setShowShoppingModal] = useState(false);
  const [editingShopping, setEditingShopping] = useState(null);
  const [shoppingForm, setShoppingForm] = useState({
    name: '',
    category: 'משק וניקיון',
    quantity: '1',
    estimatedPrice: '',
    actualPrice: '',
    store: '',
    link: '',
    notes: '',
    neededBy: '',
    urgent: false,
    assigneeId: '',
    status: 'to_buy'
  });

  const [showPersonModal, setShowPersonModal] = useState(false);
  const [personForm, setPersonForm] = useState({ name: '', role: '', phone: '' });

  // Log Entry Modal
  const [activeLogErrandId, setActiveLogErrandId] = useState(null);
  const [newLogText, setNewLogText] = useState('');
  const [trackerReady, setTrackerReady] = useState(false);
  const lastSentTracker = React.useRef('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to persist shared tracker state:', err);
    }
    if (!trackerReady) return undefined;
    const payload = trackerPayload(data);
    const encoded = JSON.stringify(payload);
    if (encoded === lastSentTracker.current) return undefined;
    const timer = setTimeout(() => {
      saveSharedTracker(payload)
        .then((saved) => {
          if (saved) lastSentTracker.current = encoded;
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [data, trackerReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await fetchSharedTracker().catch(() => null);
      if (cancelled) return;
      setData((prev) => {
        const next = {
          ...prev,
          errands: mergeById(prev.errands, remote?.errands),
          shopping: mergeById(prev.shopping, remote?.shopping),
          people: [
            ...(prev.people || []).filter((person) => person.fromStaff),
            ...mergeById(extraPeopleFrom(prev.people), remote?.extraPeople)
          ]
        };
        const encoded = JSON.stringify(trackerPayload(next));
        const remoteCount = (remote?.shopping || []).length + (remote?.errands || []).length;
        const nextCount = next.shopping.length + next.errands.length;
        lastSentTracker.current = nextCount > remoteCount ? '' : encoded;
        return next;
      });
      setTrackerReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!trackerReady) return undefined;
    const tick = async () => {
      const remote = await fetchSharedTracker().catch(() => null);
      if (!remote) return;
      setData((prev) => {
        const shopping = mergeById(prev.shopping, remote.shopping);
        const errands = mergeById(prev.errands, remote.errands);
        const extras = mergeById(extraPeopleFrom(prev.people), remote.extraPeople);
        if (
          shopping.length === (prev.shopping || []).length
          && errands.length === (prev.errands || []).length
          && extras.length === extraPeopleFrom(prev.people).length
          && JSON.stringify(shopping) === JSON.stringify(prev.shopping)
          && JSON.stringify(errands) === JSON.stringify(prev.errands)
        ) {
          return prev;
        }
        return {
          ...prev,
          shopping,
          errands,
          people: [...(prev.people || []).filter((person) => person.fromStaff), ...extras]
        };
      });
    };
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, [trackerReady]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let staffPeople = [];
      try {
        const staff = await listStaff();
        staffPeople = (Array.isArray(staff) ? staff : [])
          .filter((row) => row?.is_active !== false)
          .map(staffToPerson)
          .filter(Boolean);
      } catch {
        /* HOUSEKEEPING / others cannot list the directory */
      }
      if (!staffPeople.length && sessionUser?.id) {
        staffPeople = [staffToPerson(sessionUser)].filter(Boolean);
      }
      if (cancelled || !staffPeople.length) return;
      setData((prev) => {
        const extras = (prev.people || []).filter((p) => !p.fromStaff && !isDemoPerson(p));
        const nextPeople = [...staffPeople, ...extras];
        const known = new Set(nextPeople.map((p) => p.id));
        const remapAssignee = (id) => (id && known.has(id) ? id : '');
        return {
          ...prev,
          people: nextPeople,
          errands: (prev.errands || []).map((item) => ({
            ...item,
            assigneeId: remapAssignee(item.assigneeId)
          })),
          shopping: (prev.shopping || []).map((item) => ({
            ...item,
            assigneeId: remapAssignee(item.assigneeId)
          }))
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.id, sessionUser?.display_name, sessionUser?.username, sessionUser?.role]);

  // ERRAND HANDLERS
  const handleOpenErrandModal = (errand = null) => {
    if (errand) {
      setEditingErrand(errand);
      setErrandForm({
        title: errand.title,
        description: errand.description || '',
        assigneeId: errand.assigneeId || '',
        priority: errand.priority || 'medium',
        status: errand.status || 'todo',
        dueDate: errand.dueDate || ''
      });
    } else {
      setEditingErrand(null);
      setErrandForm({
        title: '',
        description: '',
        assigneeId: sessionUser?.id || data.people[0]?.id || '',
        priority: 'medium',
        status: 'todo',
        dueDate: new Date().toISOString().split('T')[0]
      });
    }
    setShowErrandModal(true);
  };

  const handleSaveErrand = (e) => {
    e.preventDefault();
    if (!errandForm.title.trim()) return;

    if (editingErrand) {
      setData((prev) => ({
        ...prev,
        errands: prev.errands.map((item) =>
          item.id === editingErrand.id
            ? { ...item, ...errandForm }
            : item
        )
      }));
    } else {
      const newErrand = {
        id: 'e_' + Date.now(),
        ...errandForm,
        logs: []
      };
      setData((prev) => ({
        ...prev,
        errands: [newErrand, ...prev.errands]
      }));
    }
    setShowErrandModal(false);
  };

  const handleDeleteErrand = (id) => {
    if (window.confirm('האם למחוק סידור זה?')) {
      setData((prev) => ({
        ...prev,
        errands: prev.errands.filter((e) => e.id !== id)
      }));
    }
  };

  const handleStatusChange = (errandId, newStatus) => {
    setData((prev) => ({
      ...prev,
      errands: prev.errands.map((e) =>
        e.id === errandId ? { ...e, status: newStatus } : e
      )
    }));
  };

  const handleAddLog = (errandId) => {
    if (!newLogText.trim()) return;
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const newEntry = {
      id: 'l_' + Date.now(),
      date: formattedDate,
      text: newLogText.trim()
    };

    setData((prev) => ({
      ...prev,
      errands: prev.errands.map((e) =>
        e.id === errandId ? { ...e, logs: [newEntry, ...(e.logs || [])] } : e
      )
    }));

    setNewLogText('');
    setActiveLogErrandId(null);
  };

  // SHOPPING HANDLERS
  const handleOpenShoppingModal = (item = null) => {
    const defaultAssignee = sessionUser?.id || data.people[0]?.id || '';
    if (item) {
      setEditingShopping(item);
      setShoppingForm({
        name: item.name,
        category: item.category || 'משק וניקיון',
        quantity: item.quantity || '1',
        estimatedPrice: item.estimatedPrice || '',
        actualPrice: item.actualPrice || '',
        store: item.store || '',
        link: item.link || '',
        notes: item.notes || '',
        neededBy: item.neededBy || '',
        urgent: Boolean(item.urgent),
        assigneeId: item.assigneeId || '',
        status: item.status || 'to_buy'
      });
    } else {
      setEditingShopping(null);
      setShoppingForm({
        name: '',
        category: 'משק וניקיון',
        quantity: '1',
        estimatedPrice: '',
        actualPrice: '',
        store: '',
        link: '',
        notes: '',
        neededBy: '',
        urgent: false,
        assigneeId: defaultAssignee,
        status: 'to_buy'
      });
    }
    setShowShoppingModal(true);
  };

  const handleSaveShopping = (e) => {
    e.preventDefault();
    if (!shoppingForm.name.trim()) return;

    const formattedItem = {
      ...shoppingForm,
      estimatedPrice: Number(shoppingForm.estimatedPrice) || 0,
      actualPrice: Number(shoppingForm.actualPrice) || 0,
      link: String(shoppingForm.link || '').trim(),
      notes: String(shoppingForm.notes || '').trim(),
      neededBy: shoppingForm.neededBy || '',
      urgent: Boolean(shoppingForm.urgent)
    };

    if (editingShopping) {
      setData((prev) => ({
        ...prev,
        shopping: prev.shopping.map((item) =>
          item.id === editingShopping.id ? { ...item, ...formattedItem } : item
        )
      }));
    } else {
      const newItem = {
        id: 's_' + Date.now(),
        ...formattedItem
      };
      setData((prev) => ({
        ...prev,
        shopping: [newItem, ...prev.shopping]
      }));
    }
    setShowShoppingModal(false);
  };

  const handleDeleteShopping = (id) => {
    if (window.confirm('האם למחוק פריט זה מרשימת הקניות?')) {
      setData((prev) => ({
        ...prev,
        shopping: prev.shopping.filter((s) => s.id !== id)
      }));
    }
  };

  const handleToggleShoppingStatus = (id) => {
    setData((prev) => ({
      ...prev,
      shopping: prev.shopping.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'to_buy' ? 'bought' : 'to_buy' }
          : item
      )
    }));
  };

  // PEOPLE HANDLERS
  const handleSavePerson = (e) => {
    e.preventDefault();
    if (!personForm.name.trim()) return;
    const newPerson = {
      id: 'p_' + Date.now(),
      name: personForm.name.trim(),
      role: personForm.role.trim() || 'חבר צוות',
      fromStaff: false
    };
    setData((prev) => ({
      ...prev,
      people: [...prev.people, newPerson]
    }));
    setPersonForm({ name: '', role: '', phone: '' });
    setShowPersonModal(false);
  };

  const handleDeletePerson = (id) => {
    const person = data.people.find((p) => p.id === id);
    if (person?.fromStaff) return;
    if (window.confirm('האם למחוק איש קשר זה?')) {
      setData((prev) => ({
        ...prev,
        people: prev.people.filter((p) => p.id !== id)
      }));
    }
  };

  // EXPORT & IMPORT
  const handleExportJSON = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resortos_errands_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.errands && parsed.shopping && parsed.people) {
          setData(parsed);
          alert('הנתונים יובאו בהצלחה!');
        } else {
          alert('קובץ לא תקין. הקובץ חייב להכיל משימות, קניות ואנשים.');
        }
      } catch (err) {
        alert('שגיאה בקריאת הקובץ JSON');
      }
    };
    reader.readAsText(file);
  };

  // WHATSAPP SHARE
  const handleShareShoppingWhatsApp = () => {
    const toBuyItems = data.shopping.filter((s) => s.status === 'to_buy');
    if (toBuyItems.length === 0) {
      alert('אין פריטים להקנות כרגע ברשימה!');
      return;
    }
    let text = `🛒 *רשימת קניות וציוד משותפת - ResortOS*\n`;
    text += `תאריך: ${new Date().toLocaleDateString('he-IL')}\n\n`;

    toBuyItems.forEach((item, idx) => {
      const person = data.people.find((p) => p.id === item.assigneeId);
      text += `${idx + 1}. *${item.name}* (${item.quantity})\n`;
      if (item.store) text += `   📍 מקום/חנות: ${item.store}\n`;
      if (item.link) text += `   🔗 ${item.link}\n`;
      if (item.estimatedPrice) text += `   💰 מחיר משוער: ₪${item.estimatedPrice}\n`;
      if (item.neededBy) text += `   📅 עד: ${item.neededBy}\n`;
      if (item.notes) text += `   📝 ${item.notes}\n`;
      if (person) text += `   👤 אחראי: ${person.name}\n`;
      text += `\n`;
    });

    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  // FILTERING LOGIC
  const getFilteredErrands = () => {
    return data.errands.filter((e) => {
      const matchesSearch =
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      const matchesPerson = personFilter === 'all' || e.assigneeId === personFilter;
      return matchesSearch && matchesStatus && matchesPerson;
    });
  };

  const getFilteredShopping = () => {
    return data.shopping.filter((s) => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.store && s.store.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.notes && s.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.category && s.category.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'to_buy'
          ? s.status === 'to_buy'
          : statusFilter === 'bought'
          ? s.status === 'bought'
          : true;
      const matchesPerson = personFilter === 'all' || s.assigneeId === personFilter;
      return matchesSearch && matchesStatus && matchesPerson;
    });
  };

  // STATS CALCULATIONS
  const totalErrands = data.errands.length;
  const doneErrands = data.errands.filter((e) => e.status === 'done').length;
  const inProgressErrands = data.errands.filter((e) => e.status === 'in_progress').length;
  const waitingErrands = data.errands.filter((e) => e.status === 'waiting').length;

  const totalShoppingToBuy = data.shopping.filter((s) => s.status === 'to_buy').length;
  const estimatedShoppingTotal = data.shopping
    .filter((s) => s.status === 'to_buy')
    .reduce((sum, s) => sum + (s.estimatedPrice || 0), 0);
  const actualShoppingTotal = data.shopping
    .filter((s) => s.status === 'bought')
    .reduce((sum, s) => sum + (s.actualPrice || s.estimatedPrice || 0), 0);

  // COLOR STYLES ACCORDING TO THEME
  const bgCard = isLight ? '#FFFFFF' : '#141418';
  const borderCard = isLight ? 'rgba(28, 25, 23, 0.08)' : 'rgba(255, 255, 255, 0.08)';
  const textPrimary = isLight ? '#1C1917' : '#F8FAFC';
  const textSecondary = isLight ? '#78716C' : '#94A3B8';
  const bgSubtle = isLight ? '#F6F3EC' : '#1E1E24';

  return (
    <div style={{ padding: '0.5rem 0', fontFamily: 'system-ui, -apple-system, sans-serif' }} dir="rtl">
      {/* TOP SUMMARY & DASHBOARD HEADER */}
      <div
        style={{
          background: bgCard,
          border: `1px solid ${borderCard}`,
          borderRadius: '16px',
          padding: '1.25rem',
          marginBottom: '1.25rem',
          boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.03)' : '0 4px 20px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#FFF',
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ListTodo size={20} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: textPrimary }}>
                סידורים, קניות ומעקב משותף
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: textSecondary }}>
              ניהול משימות ורכש בצוות, שיוך אחראים, מעקב היסטוריית טיפול ושיתוף ב-WhatsApp.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleExportJSON}
              style={{
                background: bgSubtle,
                border: `1px solid ${borderCard}`,
                color: textPrimary,
                padding: '0.5rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Download size={15} />
              <span>ייצוא JSON</span>
            </button>

            <label
              style={{
                background: bgSubtle,
                border: `1px solid ${borderCard}`,
                color: textPrimary,
                padding: '0.5rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Upload size={15} />
              <span>ייבוא</span>
              <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
            </label>

            {activeTab === 'shopping' && (
              <button
                onClick={handleShareShoppingWhatsApp}
                style={{
                  background: 'linear-gradient(135deg, #25D366, #128C7E)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '0.5rem 0.95rem',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                }}
              >
                <Share2 size={15} />
                <span>שתף קניות ב-WhatsApp</span>
              </button>
            )}
          </div>
        </div>

        {/* METRICS CARDS ROW */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
            marginTop: '1.25rem'
          }}
        >
          <div
            style={{
              background: bgSubtle,
              border: `1px solid ${borderCard}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: textSecondary, fontWeight: 600 }}>סידורים פתוחים</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#3B82F6', marginTop: '2px' }}>
                {totalErrands - doneErrands} / {totalErrands}
              </div>
            </div>
            <Clock size={24} color="#3B82F6" style={{ opacity: 0.8 }} />
          </div>

          <div
            style={{
              background: bgSubtle,
              border: `1px solid ${borderCard}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: textSecondary, fontWeight: 600 }}>ממתינים לגורם חיצוני</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#F59E0B', marginTop: '2px' }}>
                {waitingErrands}
              </div>
            </div>
            <AlertCircle size={24} color="#F59E0B" style={{ opacity: 0.8 }} />
          </div>

          <div
            style={{
              background: bgSubtle,
              border: `1px solid ${borderCard}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: textSecondary, fontWeight: 600 }}>פריטי קנייה שנותרו</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10B981', marginTop: '2px' }}>
                {totalShoppingToBuy}
              </div>
            </div>
            <ShoppingBag size={24} color="#10B981" style={{ opacity: 0.8 }} />
          </div>

          <div
            style={{
              background: bgSubtle,
              border: `1px solid ${borderCard}`,
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: textSecondary, fontWeight: 600 }}>תקציב קניות משוער</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#8B5CF6', marginTop: '2px' }}>
                ₪{estimatedShoppingTotal}
              </div>
            </div>
            <DollarSign size={24} color="#8B5CF6" style={{ opacity: 0.8 }} />
          </div>
        </div>
      </div>

      {/* SEGMENTED NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('errands')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: activeTab === 'errands' ? '#3B82F6' : bgCard,
            color: activeTab === 'errands' ? '#FFFFFF' : textSecondary,
            boxShadow: activeTab === 'errands' ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
            border: `1px solid ${activeTab === 'errands' ? '#3B82F6' : borderCard}`
          }}
        >
          <ListTodo size={18} />
          <span>סידורים ומשימות ({data.errands.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('shopping')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: activeTab === 'shopping' ? '#10B981' : bgCard,
            color: activeTab === 'shopping' ? '#FFFFFF' : textSecondary,
            boxShadow: activeTab === 'shopping' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
            border: `1px solid ${activeTab === 'shopping' ? '#10B981' : borderCard}`
          }}
        >
          <ShoppingBag size={18} />
          <span>רשימת קניות וציוד ({data.shopping.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: activeTab === 'map' ? '#F59E0B' : bgCard,
            color: activeTab === 'map' ? '#FFFFFF' : textSecondary,
            boxShadow: activeTab === 'map' ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
            border: `1px solid ${activeTab === 'map' ? '#F59E0B' : borderCard}`
          }}
        >
          <MapPin size={18} />
          <span>מפת אטרקציות ו-Waze</span>
        </button>

        <button
          onClick={() => setActiveTab('people')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: activeTab === 'people' ? '#8B5CF6' : bgCard,
            color: activeTab === 'people' ? '#FFFFFF' : textSecondary,
            boxShadow: activeTab === 'people' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none',
            border: `1px solid ${activeTab === 'people' ? '#8B5CF6' : borderCard}`
          }}
        >
          <Users size={18} />
          <span>אנשי קשר וצוות ({data.people.length})</span>
        </button>
      </div>

      {/* FILTER & SEARCH BAR */}
      {activeTab !== 'people' && activeTab !== 'map' && (
        <div
          style={{
            background: bgCard,
            border: `1px solid ${borderCard}`,
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search
              size={16}
              color={textSecondary}
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder={activeTab === 'errands' ? 'חפש סידור, תיאור...' : 'חפש פריט, חנות, קטגוריה...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 2.4rem 0.55rem 0.85rem',
                borderRadius: '10px',
                border: `1px solid ${borderCard}`,
                background: bgSubtle,
                color: textPrimary,
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '10px',
                border: `1px solid ${borderCard}`,
                background: bgSubtle,
                color: textPrimary,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <option value="all">כל הסטטוסים</option>
              {activeTab === 'errands' ? (
                <>
                  <option value="todo">לביצוע</option>
                  <option value="in_progress">בטיפול / בתהליך</option>
                  <option value="waiting">ממתין לגורם חיצוני</option>
                  <option value="done">הושלם</option>
                </>
              ) : (
                <>
                  <option value="to_buy">לקנות</option>
                  <option value="bought">נרכש</option>
                </>
              )}
            </select>

            <select
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value)}
              style={{
                padding: '0.55rem 0.85rem',
                borderRadius: '10px',
                border: `1px solid ${borderCard}`,
                background: bgSubtle,
                color: textPrimary,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <option value="all">כל האחראים</option>
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                if (activeTab === 'errands') handleOpenErrandModal();
                else handleOpenShoppingModal();
              }}
              style={{
                background: activeTab === 'errands' ? '#3B82F6' : '#10B981',
                color: '#FFF',
                border: 'none',
                padding: '0.55rem 1rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <Plus size={16} />
              <span>{activeTab === 'errands' ? 'הוסף סידור חדש' : 'הוסף פריט לקנייה'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: ERRANDS & TASKS LIST */}
      {activeTab === 'errands' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {getFilteredErrands().length === 0 ? (
            <div
              style={{
                background: bgCard,
                border: `1px solid ${borderCard}`,
                borderRadius: '14px',
                padding: '2.5rem',
                textAlign: 'center',
                color: textSecondary
              }}
            >
              לא נמצאו סידורים המתאימים לסינון שברשותך.
            </div>
          ) : (
            getFilteredErrands().map((errand) => {
              const assignee = data.people.find((p) => p.id === errand.assigneeId);
              const isDone = errand.status === 'done';

              const priorityColor =
                errand.priority === 'high'
                  ? '#EF4444'
                  : errand.priority === 'medium'
                  ? '#F59E0B'
                  : '#10B981';

              const statusBadge =
                errand.status === 'done'
                  ? { label: 'הושלם', bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }
                  : errand.status === 'in_progress'
                  ? { label: 'בטיפול', bg: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6' }
                  : errand.status === 'waiting'
                  ? { label: 'ממתין לגורם חיצוני', bg: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }
                  : { label: 'לביצוע', bg: 'rgba(107, 114, 128, 0.15)', color: textSecondary };

              return (
                <div
                  key={errand.id}
                  style={{
                    background: bgCard,
                    border: `1px solid ${borderCard}`,
                    borderRadius: '14px',
                    padding: '1.1rem',
                    opacity: isDone ? 0.75 : 1,
                    transition: 'all 0.2s ease',
                    boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.02)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: statusBadge.bg,
                            color: statusBadge.color
                          }}
                        >
                          {statusBadge.label}
                        </span>

                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            border: `1px solid ${priorityColor}`,
                            color: priorityColor
                          }}
                        >
                          עדיפות {errand.priority === 'high' ? 'גבוהה' : errand.priority === 'medium' ? 'בינונית' : 'נמוכה'}
                        </span>

                        {errand.dueDate && (
                          <span style={{ fontSize: '0.75rem', color: textSecondary, display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Calendar size={13} />
                            יעד: {errand.dueDate}
                          </span>
                        )}
                      </div>

                      <h3
                        style={{
                          margin: '0 0 0.35rem 0',
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          color: textPrimary,
                          textDecoration: isDone ? 'line-through' : 'none'
                        }}
                      >
                        {errand.title}
                      </h3>

                      {errand.description && (
                        <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', color: textSecondary, lineHeight: 1.5 }}>
                          {errand.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: textSecondary }}>
                        {assignee && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <User size={14} color="#3B82F6" />
                            <span>אחראי: {assignee.name} ({assignee.role})</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select
                        value={errand.status}
                        onChange={(e) => handleStatusChange(errand.id, e.target.value)}
                        style={{
                          padding: '0.45rem 0.7rem',
                          borderRadius: '8px',
                          border: `1px solid ${borderCard}`,
                          background: bgSubtle,
                          color: textPrimary,
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="todo">לביצוע</option>
                        <option value="in_progress">בטיפול</option>
                        <option value="waiting">ממתין לאדם אחר</option>
                        <option value="done">הושלם 👍</option>
                      </select>

                      <button
                        onClick={() => setActiveLogErrandId(activeLogErrandId === errand.id ? null : errand.id)}
                        style={{
                          background: bgSubtle,
                          border: `1px solid ${borderCard}`,
                          color: textPrimary,
                          padding: '0.45rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <MessageSquare size={14} />
                        <span>מעקב ({errand.logs?.length || 0})</span>
                      </button>

                      <button
                        onClick={() => handleOpenErrandModal(errand)}
                        style={{
                          background: bgSubtle,
                          border: `1px solid ${borderCard}`,
                          color: textPrimary,
                          padding: '0.45rem',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        onClick={() => handleDeleteErrand(errand.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#EF4444',
                          padding: '0.45rem',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* LOGS & FOLLOW-UP SECTION */}
                  {(activeLogErrandId === errand.id || (errand.logs && errand.logs.length > 0)) && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        paddingTop: '0.85rem',
                        borderTop: `1px solid ${borderCard}`,
                        background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                        borderRadius: '10px',
                        padding: '0.75rem'
                      }}
                    >
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: textPrimary, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} />
                        <span>היסטוריית מעקב ועדכונים:</span>
                      </div>

                      {errand.logs && errand.logs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          {errand.logs.map((log) => (
                            <div
                              key={log.id}
                              style={{
                                fontSize: '0.8rem',
                                background: bgCard,
                                border: `1px solid ${borderCard}`,
                                borderRadius: '8px',
                                padding: '0.45rem 0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem'
                              }}
                            >
                              <span style={{ color: textPrimary }}>{log.text}</span>
                              <span style={{ fontSize: '0.7rem', color: textSecondary, dir: 'ltr' }}>{log.date}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: textSecondary, marginBottom: '0.5rem' }}>אין עדכוני מעקב עדיין.</div>
                      )}

                      {activeLogErrandId === errand.id && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="הוסף עדכון מעקב חדש (לדוגמה: דיברתי בטלפון, יישלח מחר...)..."
                            value={newLogText}
                            onChange={(e) => setNewLogText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddLog(errand.id);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.45rem 0.75rem',
                              borderRadius: '8px',
                              border: `1px solid ${borderCard}`,
                              background: bgCard,
                              color: textPrimary,
                              fontSize: '0.8rem',
                              outline: 'none'
                            }}
                          />
                          <button
                            onClick={() => handleAddLog(errand.id)}
                            style={{
                              background: '#3B82F6',
                              color: '#FFF',
                              border: 'none',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            שמור עדכון
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: SHOPPING LIST */}
      {activeTab === 'shopping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {getFilteredShopping().length === 0 ? (
            <div
              style={{
                background: bgCard,
                border: `1px solid ${borderCard}`,
                borderRadius: '14px',
                padding: '2.5rem',
                textAlign: 'center',
                color: textSecondary
              }}
            >
              אין פריטים ברשימת הקניות שמתאימים לסינון.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
              {getFilteredShopping().map((item) => {
                const isBought = item.status === 'bought';
                const assignee = data.people.find((p) => p.id === item.assigneeId);

                return (
                  <div
                    key={item.id}
                    style={{
                      background: bgCard,
                      border: `1px solid ${isBought ? 'rgba(16, 185, 129, 0.3)' : borderCard}`,
                      borderRadius: '14px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: isBought ? 0.75 : 1,
                      boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.02)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: isBought
                              ? 'rgba(16, 185, 129, 0.15)'
                              : item.urgent
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(59, 130, 246, 0.15)',
                            color: isBought ? '#10B981' : item.urgent ? '#EF4444' : '#3B82F6'
                          }}
                        >
                          {isBought ? 'נרכש 👍' : item.urgent ? 'דחוף' : 'לקנות'}
                        </span>

                        <span style={{ fontSize: '0.75rem', color: textSecondary, fontWeight: 600 }}>
                          {item.category}
                        </span>
                      </div>

                      <h4
                        style={{
                          margin: '0 0 0.4rem 0',
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: textPrimary,
                          textDecoration: isBought ? 'line-through' : 'none'
                        }}
                      >
                        {item.name}
                      </h4>

                      <div style={{ fontSize: '0.82rem', color: textSecondary, display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
                        <div>📦 <strong>כמות:</strong> {item.quantity}</div>
                        {item.store && <div>📍 <strong>חנות/ספק:</strong> {item.store}</div>}
                        {item.link && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Link2 size={13} />
                            <a
                              href={/^https?:\/\//i.test(item.link) ? item.link : `https://${item.link}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#3B82F6', fontWeight: 700 }}
                            >
                              קישור למוצר
                            </a>
                          </div>
                        )}
                        {item.neededBy && <div>📅 <strong>נדרש עד:</strong> {item.neededBy}</div>}
                        {item.notes && <div>📝 {item.notes}</div>}
                        {item.estimatedPrice > 0 && (
                          <div>💰 <strong>מחיר משוער:</strong> ₪{item.estimatedPrice}</div>
                        )}
                        {isBought && item.actualPrice > 0 && (
                          <div style={{ color: '#10B981', fontWeight: 700 }}>
                            ✅ <strong>מחיר בפועל:</strong> ₪{item.actualPrice}
                          </div>
                        )}
                        {assignee && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                            <User size={13} color="#8B5CF6" />
                            <span>אחראי קנייה: {assignee.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${borderCard}`, paddingTop: '0.65rem' }}>
                      <button
                        onClick={() => handleToggleShoppingStatus(item.id)}
                        style={{
                          background: isBought ? 'rgba(16, 185, 129, 0.15)' : '#10B981',
                          color: isBought ? '#10B981' : '#FFFFFF',
                          border: 'none',
                          padding: '0.4rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {isBought ? <Check size={14} /> : <ShoppingBag size={14} />}
                        <span>{isBought ? 'סמן כלהקנות' : 'סמן כנרכש'}</span>
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleOpenShoppingModal(item)}
                          style={{
                            background: bgSubtle,
                            border: `1px solid ${borderCard}`,
                            color: textPrimary,
                            padding: '0.4rem',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteShopping(item.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                            padding: '0.4rem',
                            borderRadius: '8px',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PEOPLE & CONTACTS */}
      {activeTab === 'people' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: textPrimary }}>
                צוות ממערכת ההתחברות
              </h3>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: textSecondary }}>
                השמות מגיעים מחשבונות הצוות. אפשר להוסיף כאן רק ספק או איש קשר חיצוני.
              </p>
            </div>
            <button
              onClick={() => setShowPersonModal(true)}
              style={{
                background: '#8B5CF6',
                color: '#FFF',
                border: 'none',
                padding: '0.5rem 0.95rem',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <UserPlus size={16} />
              <span>הוסף איש קשר</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.85rem' }}>
            {data.people.map((person) => {
              const assignedErrands = data.errands.filter((e) => e.assigneeId === person.id);
              const assignedShopping = data.shopping.filter((s) => s.assigneeId === person.id);

              return (
                <div
                  key={person.id}
                  style={{
                    background: bgCard,
                    border: `1px solid ${borderCard}`,
                    borderRadius: '14px',
                    padding: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: '#8B5CF6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.1rem'
                        }}
                      >
                        {person.name.charAt(0)}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: textPrimary }}>
                          {person.name}
                        </h4>
                        <span style={{ fontSize: '0.78rem', color: textSecondary }}>
                          {person.fromStaff ? person.role : (person.role || 'איש קשר')}
                          {person.fromStaff ? ' · צוות' : ''}
                        </span>
                      </div>
                    </div>

                    {person.phone && (
                      <div style={{ fontSize: '0.82rem', color: textSecondary, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
                        <Phone size={14} color="#10B981" />
                        <a href={`tel:${person.phone}`} style={{ color: textPrimary, textDecoration: 'none', fontWeight: 600 }}>
                          {person.phone}
                        </a>
                      </div>
                    )}

                    <div style={{ background: bgSubtle, borderRadius: '10px', padding: '0.65rem', fontSize: '0.78rem', color: textSecondary }}>
                      <div>• סידורים משויכים: <strong>{assignedErrands.length}</strong></div>
                      <div>• פריטי קנייה משויכים: <strong>{assignedShopping.length}</strong></div>
                    </div>
                  </div>

                  {!person.fromStaff && (
                  <div style={{ marginTop: '0.85rem', textAlign: 'left' }}>
                    <button
                      onClick={() => handleDeletePerson(person.id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#EF4444',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      מחק איש קשר
                    </button>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: INTERACTIVE MAP & WAZE */}
      {activeTab === 'map' && (
        <GolanInteractiveMap theme={theme} />
      )}

      {/* MODAL: ADD / EDIT ERRAND */}
      {showErrandModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: bgCard,
              border: `1px solid ${borderCard}`,
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: textPrimary
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {editingErrand ? 'עריכת סידור' : 'הוספת סידור חדש'}
              </h3>
              <button onClick={() => setShowErrandModal(false)} style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveErrand} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  שם הסידור / המשימה *
                </label>
                <input
                  type="text"
                  required
                  value={errandForm.title}
                  onChange={(e) => setErrandForm({ ...errandForm, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  תיאור מפורט / הנחיות
                </label>
                <textarea
                  rows={3}
                  value={errandForm.description}
                  onChange={(e) => setErrandForm({ ...errandForm, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary,
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    אחראי לביצוע
                  </label>
                  <select
                    value={errandForm.assigneeId}
                    onChange={(e) => setErrandForm({ ...errandForm, assigneeId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  >
                    <option value="">ללא שיוך</option>
                    {data.people.filter((p) => p.fromStaff).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {data.people.filter((p) => !p.fromStaff).map((p) => (
                      <option key={`c-${p.id}`} value={p.id}>
                        {p.name} (קשר)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    עדיפות
                  </label>
                  <select
                    value={errandForm.priority}
                    onChange={(e) => setErrandForm({ ...errandForm, priority: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  >
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה / דחוף</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    סטטוס
                  </label>
                  <select
                    value={errandForm.status}
                    onChange={(e) => setErrandForm({ ...errandForm, status: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  >
                    <option value="todo">לביצוע</option>
                    <option value="in_progress">בטיפול</option>
                    <option value="waiting">ממתין לגורם חיצוני</option>
                    <option value="done">הושלם</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    תאריך יעד
                  </label>
                  <input
                    type="date"
                    value={errandForm.dueDate}
                    onChange={(e) => setErrandForm({ ...errandForm, dueDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: '#3B82F6',
                    color: '#FFF',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {editingErrand ? 'עדכן סידור' : 'צור סידור חדש'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowErrandModal(false)}
                  style={{
                    background: bgSubtle,
                    color: textSecondary,
                    border: `1px solid ${borderCard}`,
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SHOPPING ITEM */}
      {showShoppingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: bgCard,
              border: `1px solid ${borderCard}`,
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: textPrimary
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {editingShopping ? 'עריכת פריט קנייה' : 'הוספת פריט חדש לקנייה'}
              </h3>
              <button onClick={() => setShowShoppingModal(false)} style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveShopping} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  שם הפריט / המוצר *
                </label>
                <input
                  type="text"
                  required
                  value={shoppingForm.name}
                  onChange={(e) => setShoppingForm({ ...shoppingForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary,
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    קטגוריה
                  </label>
                  <input
                    list="shopping-categories"
                    value={shoppingForm.category}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                  <datalist id="shopping-categories">
                    {SHOPPING_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    כמות
                  </label>
                  <input
                    type="text"
                    value={shoppingForm.quantity}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, quantity: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    חנות / מקום רכישה
                  </label>
                  <input
                    type="text"
                    value={shoppingForm.store}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, store: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    אחראי קנייה
                  </label>
                  <select
                    value={shoppingForm.assigneeId}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, assigneeId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  >
                    <option value="">ללא שיוך</option>
                    {data.people.filter((p) => p.fromStaff).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {data.people.filter((p) => !p.fromStaff).map((p) => (
                      <option key={`c-${p.id}`} value={p.id}>
                        {p.name} (קשר)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  קישור למוצר / הזמנה
                </label>
                <input
                  type="url"
                  placeholder="https://"
                  value={shoppingForm.link}
                  onChange={(e) => setShoppingForm({ ...shoppingForm, link: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: editingShopping ? '1fr 1fr' : '1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    מחיר משוער (₪)
                  </label>
                  <input
                    type="number"
                    value={shoppingForm.estimatedPrice}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, estimatedPrice: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>

                {editingShopping && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    מחיר בפועל (₪)
                  </label>
                  <input
                    type="number"
                    value={shoppingForm.actualPrice}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, actualPrice: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    נדרש עד
                  </label>
                  <input
                    type="date"
                    value={shoppingForm.neededBy}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, neededBy: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${borderCard}`,
                      background: bgSubtle,
                      color: textPrimary
                    }}
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.6rem', fontSize: '0.85rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(shoppingForm.urgent)}
                    onChange={(e) => setShoppingForm({ ...shoppingForm, urgent: e.target.checked })}
                  />
                  דחוף
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  הערה / דגם / מידה
                </label>
                <textarea
                  rows={2}
                  value={shoppingForm.notes}
                  onChange={(e) => setShoppingForm({ ...shoppingForm, notes: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: '#10B981',
                    color: '#FFF',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {editingShopping ? 'עדכן פריט קנייה' : 'הוסף לקנייה'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowShoppingModal(false)}
                  style={{
                    background: bgSubtle,
                    color: textSecondary,
                    border: `1px solid ${borderCard}`,
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PERSON */}
      {showPersonModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: bgCard,
              border: `1px solid ${borderCard}`,
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: textPrimary
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>הוספת איש קשר חדש</h3>
              <button onClick={() => setShowPersonModal(false)} style={{ background: 'none', border: 'none', color: textSecondary, cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePerson} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  שם מלא *
                </label>
                <input
                  type="text"
                  required
                  value={personForm.name}
                  onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  תפקיד / קשר
                </label>
                <input
                  type="text"
                  value={personForm.role}
                  onChange={(e) => setPersonForm({ ...personForm, role: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                  מספר טלפון (עבור WhatsApp)
                </label>
                <input
                  type="tel"
                  value={personForm.phone}
                  onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    border: `1px solid ${borderCard}`,
                    background: bgSubtle,
                    color: textPrimary
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: '#8B5CF6',
                    color: '#FFF',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  שמור איש קשר
                </button>
                <button
                  type="button"
                  onClick={() => setShowPersonModal(false)}
                  style={{
                    background: bgSubtle,
                    color: textSecondary,
                    border: `1px solid ${borderCard}`,
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
