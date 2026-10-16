import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Calendar,
  CreditCard,
  Wallet,
  Send,
  Plus,
  Trash2,
  Camera,
  FileText,
  Settings,
  ShieldAlert,
  Layers,
  Eye,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sparkles,
  ArrowDownLeft,
  Sun,
  Moon,
  LogOut,
  Monitor,
  Smartphone
} from 'lucide-react';
import {
  BANK_IDS,
  BANK_CONFIG,
  computeFinancialCommandCenter,
  formatMoney,
  formatCompactMoney,
  findCheckDuplicates,
  formatChloeWhatsAppAlert,
  addDaysIso,
  adjustToNextBusinessDay,
  isBankingBusinessDay
} from '../../lib/financialCommandCenter';
import { israelToday } from '../../lib/cabinAccess';
import { GUEST_BRAND } from '../../lib/guestTheme';

const DEFAULT_FALLBACK_ACCOUNTS = [
  {
    id: 'acc-mizrahi',
    providerId: 'mizrahi',
    accountType: 'CHECKING',
    displayName: 'מזרחי טפחות 462-601997 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: -81478.86, currency: 'ILS', balanceType: 'interimAvailable', referenceDate: '2026-10-15' }
  },
  {
    id: 'acc-discount',
    providerId: 'discount',
    accountType: 'CHECKING',
    displayName: 'דיסקונט 176-253325996 (מיאליס ריזורט בע״מ)',
    displayBalance: { amount: -46254.84, currency: 'ILS', balanceType: 'closingBooked', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-beinleumi',
    providerId: 'beinleumi',
    accountType: 'CHECKING',
    displayName: 'הבינלאומי 31-92-395140 (חח״ד עסקי)',
    displayBalance: { amount: -40450.39, currency: 'ILS', balanceType: 'closingBooked', referenceDate: '2026-10-15' }
  },
  {
    id: 'acc-card-amex',
    providerId: 'mizrahi',
    accountType: 'CARD',
    displayName: 'אמקס פלטינום (2221)',
    displayBalance: { amount: 15025.65, currency: 'ILS', referenceDate: '2026-11-10' }
  },
  {
    id: 'acc-card-mizrahi-adam',
    providerId: 'mizrahi',
    accountType: 'CARD',
    displayName: 'ויזה מקס זהב (2490 - אדם)',
    displayBalance: { amount: 2795.87, currency: 'ILS', referenceDate: '2026-11-10' }
  },
  {
    id: 'acc-card-fibi-max',
    providerId: 'beinleumi',
    accountType: 'CARD',
    displayName: 'MAX עיסקי זהב (8094)',
    displayBalance: { amount: 6019.78, currency: 'ILS', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-card-fibi-diners',
    providerId: 'beinleumi',
    accountType: 'CARD',
    displayName: 'דיינרס פלטיניום (2592)',
    displayBalance: { amount: 8386.00, currency: 'ILS', referenceDate: '2026-10-16' }
  },
  {
    id: 'acc-card-discount-flyall',
    providerId: 'discount',
    accountType: 'CARD',
    displayName: 'FlyAll דיסקונט (3174)',
    displayBalance: { amount: 34884.40, currency: 'ILS', referenceDate: '2026-10-15' }
  }
];

const DEFAULT_FALLBACK_CHECKS = [
  { id: 'vat-2026-2026-10-30', check_number: '', amount: 57000, due_date: '2026-10-30', bank: 'mizrahi', payee: 'מע״מ', description: 'אוקטובר 2026', confirmed: true },
  { id: '3650133', check_number: '3650133', amount: 82600, due_date: '2026-11-01', bank: 'mizrahi', payee: 'כינורות', description: 'שכירות / תשלום חודשי', confirmed: true },
  { id: 'booking-monthly-2026-11-01', check_number: '', amount: 5900, due_date: '2026-11-01', bank: 'mizrahi', payee: 'בוקינג', description: 'נובמבר 2026', confirmed: true },
  { id: 'fuel-delek-monthly-2026-11-01', check_number: '', amount: 2700, due_date: '2026-11-01', bank: 'mizrahi', payee: 'דלקן', description: 'נובמבר 2026', confirmed: true },
  { id: 'alex-calendar-monthly-2026-11-01', check_number: '', amount: 8500, due_date: '2026-11-01', bank: 'mizrahi', payee: 'יומן אלכס', description: 'נובמבר 2026', confirmed: true },
  { id: 'zimmer-ads-monthly-2026-11-01', check_number: '', amount: 2832, due_date: '2026-11-01', bank: 'mizrahi', payee: 'צימר — פרסום', description: 'נובמבר 2026', confirmed: true },
  { id: 'fuel-shukrun-monthly-2026-11-01', check_number: '', amount: 1500, due_date: '2026-11-01', bank: 'mizrahi', payee: 'שוקרון', description: 'נובמבר 2026', confirmed: true },
  { id: 'mas-hachnasa-monthly-2026-11-04', check_number: '', amount: 10000, due_date: '2026-11-04', bank: 'mizrahi', payee: 'מס הכנסה עובדים', description: 'נובמבר 2026', confirmed: true },
  { id: 'bituach-leumi-monthly-2026-11-05', check_number: '', amount: 12000, due_date: '2026-11-05', bank: 'mizrahi', payee: 'ביטוח לאומי עובדים', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-jacoo-monthly-2026-11-05', check_number: '', amount: 3900, due_date: '2026-11-05', bank: 'mizrahi', payee: 'רכב ג׳אקו', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-chery-monthly-2026-11-05', check_number: '', amount: 2900, due_date: '2026-11-05', bank: 'mizrahi', payee: 'רכב צ׳רי', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-chery-costa-monthly-2026-11-08', check_number: '', amount: 2600, due_date: '2026-11-08', bank: 'mizrahi', payee: 'צ׳רי קוסטה', description: 'נובמבר 2026', confirmed: true },
  { id: 'salaries-monthly-2026-11-09', check_number: '', amount: 110000, due_date: '2026-11-09', bank: 'mizrahi', payee: 'משכורות', description: 'נובמבר 2026', confirmed: true },
  { id: '3650110', check_number: '3650110', amount: 14160, due_date: '2026-11-10', bank: 'mizrahi', payee: 'ג\'ימי ג\'יפ', description: 'שכירות נובמבר 2026', confirmed: true },
  { id: 'nurit-2026-11-10', check_number: '', amount: 29390, due_date: '2026-11-10', bank: 'mizrahi', payee: 'בתי נורית', description: 'שכירות נובמבר 2026', confirmed: true },
  { id: 'maya-monthly-2026-11-10', check_number: '', amount: 15270, due_date: '2026-11-10', bank: 'mizrahi', payee: 'בקתות מאיה', description: 'נובמבר 2026', confirmed: true },
  { id: 'bagiva-staff-monthly-2026-11-10', check_number: '', amount: 3245, due_date: '2026-11-10', bank: 'mizrahi', payee: 'דירת עובדים צימר בגבעה', description: 'נובמבר 2026', confirmed: true },
  { id: 'musical-monthly-2026-11-10', check_number: '', amount: 15370, due_date: '2026-11-10', bank: 'mizrahi', payee: 'החצר המוסיקלית', description: 'נובמבר 2026', confirmed: true },
  { id: 'taj-monthly-2026-11-10', check_number: '', amount: 19160, due_date: '2026-11-10', bank: 'mizrahi', payee: 'טאג׳ מאהל', description: 'נובמבר 2026', confirmed: true },
  { id: 'toscana-monthly-2026-11-10', check_number: '', amount: 15000, due_date: '2026-11-10', bank: 'mizrahi', payee: 'טוסקנה', description: 'נובמבר 2026', confirmed: true },
  { id: 'kipat-monthly-2026-11-10', check_number: '', amount: 14440, due_date: '2026-11-10', bank: 'mizrahi', payee: 'כיפת שמיים', description: 'נובמבר 2026', confirmed: true },
  { id: 'car-mercedes-monthly-2026-11-10', check_number: '', amount: 4600, due_date: '2026-11-10', bank: 'mizrahi', payee: 'מרצדס', description: 'נובמבר 2026', confirmed: true },
  { id: 'nofim-monthly-2026-11-10', check_number: '', amount: 12670, due_date: '2026-11-10', bank: 'mizrahi', payee: 'נופים בלבן', description: 'נובמבר 2026', confirmed: true },
  { id: 'bagiva-util-monthly-2026-11-10', check_number: '', amount: 5000, due_date: '2026-11-10', bank: 'mizrahi', payee: 'צימר בגבעה', description: 'נובמבר 2026', confirmed: true },
  { id: '3650131', check_number: '3650131', amount: 2445, due_date: '2026-11-11', bank: 'mizrahi', payee: 'יהושוע סליטרניק', description: 'ביטוח בתי נורית', confirmed: true }
];

export default function FinancialCommandCenter({
  theme = 'dark',
  setTheme = null,
  session = null,
  financeOnly = false,
  styles: parentStyles = null,
  overview = null,
  beinleumiStatement = null,
  maxCredits = [],
  hypPayments = [],
  collectionRows = [],
  bookings = []
}) {
  const isLight = theme === 'light';
  const today = israelToday();

  // Screen responsiveness (Stationary Desktop vs Mobile)
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isDesktop = windowWidth >= 1024;
  const isWide = windowWidth >= 1440;

  // Miyalis Brand Theme Palette (From Mialees Brand Book 2025)
  const mBrand = useMemo(() => {
    if (isLight) {
      return {
        bg: GUEST_BRAND.cream,                   // #FDFBF7
        containerBg: '#FFFFFF',
        cardBg: '#FCFBF9',
        cardBgAlt: '#FAF6F0',
        cardBorder: 'rgba(191, 179, 168, 0.45)', // cloudy #BFB3A8
        cardBorderSubtle: 'rgba(191, 179, 168, 0.25)',
        text: GUEST_BRAND.wine,                  // #26130F
        textMuted: GUEST_BRAND.mocha,            // #736055
        textCloudy: GUEST_BRAND.cloudy,          // #BFB3A8
        accentWine: GUEST_BRAND.wine,
        accentCandy: GUEST_BRAND.candy,          // #F2D5DD
        accentPinkDream: GUEST_BRAND.pinkDream,  // #F2E4E9
        accentDeepPink: GUEST_BRAND.deepPink,    // #59454A
        gold: '#C5A059',
        goldBg: 'rgba(197, 160, 89, 0.12)',
        primaryBtn: `linear-gradient(135deg, ${GUEST_BRAND.wine}, #3E2019)`,
        primaryBtnText: GUEST_BRAND.cream,
        badgeBg: GUEST_BRAND.pinkDream,
        badgeText: GUEST_BRAND.wine,
        shadow: '0 4px 20px rgba(38, 19, 15, 0.05)',
        shadowLg: '0 12px 32px rgba(38, 19, 15, 0.08)'
      };
    }
    return {
      bg: '#180B08',
      containerBg: '#210F0B',
      cardBg: GUEST_BRAND.wine,                  // #26130F
      cardBgAlt: '#301610',
      cardBorder: 'rgba(242, 228, 233, 0.14)',
      cardBorderSubtle: 'rgba(242, 228, 233, 0.08)',
      text: GUEST_BRAND.cream,                   // #FDFBF7
      textMuted: GUEST_BRAND.cloudy,             // #BFB3A8
      textCloudy: '#8E7D72',
      accentWine: GUEST_BRAND.candy,
      accentCandy: GUEST_BRAND.candy,            // #F2D5DD
      accentPinkDream: GUEST_BRAND.pinkDream,    // #F2E4E9
      accentDeepPink: GUEST_BRAND.deepPink,
      gold: '#E5C158',
      goldBg: 'rgba(229, 193, 88, 0.16)',
      primaryBtn: `linear-gradient(135deg, ${GUEST_BRAND.candy}, #E4B8C4)`,
      primaryBtnText: GUEST_BRAND.wine,
      badgeBg: 'rgba(242, 213, 221, 0.15)',
      badgeText: GUEST_BRAND.candy,
      shadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
      shadowLg: '0 16px 40px rgba(0, 0, 0, 0.65)'
    };
  }, [isLight]);

  // Control state
  const [horizonDays, setHorizonDays] = useState(120);
  const [scenarioMode, setScenarioMode] = useState('baseline'); // 'baseline' | 'scenario'
  const [selectedBankFilter, setSelectedBankFilter] = useState('all'); // 'all' | 'mizrahi' | 'discount' | 'beinleumi'
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'events' | 'alerts' | 'capture'

  // Backend state
  const [serverData, setServerData] = useState({
    accounts: DEFAULT_FALLBACK_ACCOUNTS,
    checks: DEFAULT_FALLBACK_CHECKS,
    settings: {
      bookingPayoutDay: 3,
      initialCashDrawer: 14850,
      banks: {
        mizrahi: { facility: 150000, safetyBuffer: 25000 },
        discount: { facility: 100000, safetyBuffer: 20000 },
        beinleumi: { facility: 100000, safetyBuffer: 30000 }
      }
    },
    manualEntries: [],
    auditHistory: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: '' });

  // Modals & Drawers
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [showDrilldownDrawer, setShowDrilldownDrawer] = useState(false);
  const [whatsappAlertModal, setWhatsappAlertModal] = useState(null); // alert object if open
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [whatsappSentSuccess, setWhatsappSentSuccess] = useState(false);

  // Cash deposit modal form state
  const [depositForm, setDepositForm] = useState({
    amount: '',
    bank: 'mizrahi',
    date: today,
    notes: ''
  });

  // Manual entry form state
  const [manualForm, setManualForm] = useState({
    amount: '',
    date: addDaysIso(today, 7),
    bank: 'mizrahi',
    type: 'expense',
    label: '',
    notes: ''
  });

  // Settings form state
  const [tempSettings, setTempSettings] = useState(serverData.settings);

  // Check capture state
  const [captureForm, setCaptureForm] = useState({
    check_number: '',
    amount: '',
    due_date: addDaysIso(today, 14),
    payee: '',
    bank: 'מזרחי טפחות',
    description: '',
    is_outgoing: true,
    imagePreview: null
  });
  const [capturePending, setCapturePending] = useState(null);
  const fileInputRef = useRef(null);

  // Load backend command center data
  async function fetchServerData() {
    setIsLoading(true);
    try {
      const [resp, checksResp] = await Promise.all([
        fetch('/api/finance/command-center').catch(() => null),
        fetch('/checks.json').catch(() => null)
      ]);
      let realChecks = null;
      if (checksResp && checksResp.ok) {
        const cData = await checksResp.json().catch(() => null);
        if (Array.isArray(cData?.checks) && cData.checks.length > 0) {
          realChecks = cData.checks;
        } else if (Array.isArray(cData) && cData.length > 0) {
          realChecks = cData;
        }
      }
      if (resp && resp.ok) {
        const data = await resp.json();
        setServerData((prev) => ({
          ...prev,
          ...data,
          accounts: (data.accounts && data.accounts.length > 0) ? data.accounts : prev.accounts,
          checks: realChecks || ((data.checks && data.checks.length > 0) ? data.checks : prev.checks),
          settings: data.settings || prev.settings
        }));
        if (data.settings) {
          setTempSettings(data.settings);
        }
      } else if (realChecks) {
        setServerData((prev) => ({
          ...prev,
          checks: realChecks
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch financial command center data:', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchServerData();
  }, []);

  const effectiveAccounts = useMemo(() => {
    if (overview?.accounts && overview.accounts.length > 0) return overview.accounts;
    if (serverData?.accounts && serverData.accounts.length > 0) return serverData.accounts;
    return DEFAULT_FALLBACK_ACCOUNTS;
  }, [overview?.accounts, serverData?.accounts]);

  const effectiveChecks = useMemo(() => {
    if (serverData?.checks && serverData.checks.length > 0) return serverData.checks;
    return DEFAULT_FALLBACK_CHECKS;
  }, [serverData?.checks]);

  // Compute 120-Day Financial Engine Simulation
  const calculation = useMemo(() => {
    return computeFinancialCommandCenter({
      today,
      horizonDays,
      accounts: effectiveAccounts,
      settings: serverData.settings,
      checks: effectiveChecks,
      maxCredits: maxCredits || [],
      hypPayments: hypPayments || [],
      collectionRows: collectionRows || [],
      bookings: bookings || [],
      beinleumiStatement,
      manualEntries: serverData.manualEntries || []
    });
  }, [
    today,
    horizonDays,
    effectiveAccounts,
    serverData.settings,
    effectiveChecks,
    maxCredits,
    hypPayments,
    collectionRows,
    bookings,
    beinleumiStatement,
    serverData.manualEntries
  ]);

  // Selected day info for drill-down
  const activeDaysList = scenarioMode === 'baseline' ? calculation.baseline.days : calculation.scenario.days;
  const currentDayInfo = useMemo(() => {
    return activeDaysList.find((d) => d.date === selectedDate) || activeDaysList[0];
  }, [activeDaysList, selectedDate]);

  // Save Settings
  async function handleSaveSettings() {
    try {
      const resp = await fetch('/api/finance/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tempSettings)
      });
      if (resp.ok) {
        const saved = await resp.json();
        setServerData((prev) => ({ ...prev, settings: saved }));
        setShowSettingsModal(false);
      }
    } catch (e) {
      alert('שגיאה בשמירת הגדרות');
    }
  }

  // Add Manual Entry
  async function handleAddManualEntry(e) {
    e.preventDefault();
    if (!manualForm.amount || !manualForm.date) return;
    try {
      const resp = await fetch('/api/finance/manual-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualForm)
      });
      if (resp.ok) {
        const newEntry = await resp.json();
        setServerData((prev) => ({
          ...prev,
          manualEntries: [...prev.manualEntries, newEntry]
        }));
        setShowManualModal(false);
        setManualForm({
          amount: '',
          date: addDaysIso(today, 7),
          bank: 'mizrahi',
          type: 'expense',
          label: '',
          notes: ''
        });
      }
    } catch (e) {
      alert('שגיאה בהוספת רשומה ידנית');
    }
  }

  // Handle Cash Deposit from Local Drawer to Bank Checking
  async function handleCashDepositSubmit(e) {
    e.preventDefault();
    const amountNum = parseFloat(depositForm.amount);
    if (!amountNum || amountNum <= 0) {
      alert('נא להזין סכום חוקי להפקדה');
      return;
    }
    const currentDrawer = calculation.kpis.currentCashDrawer || 0;
    if (amountNum > currentDrawer) {
      const proceed = confirm(`שים לב: הסכום המבוקש (${formatMoney(amountNum)}) עולה על יתרת המזומן הזמינה בקופה (${formatMoney(currentDrawer)}). האם להמשיך ברישום ההפקדה?`);
      if (!proceed) return;
    }

    try {
      const resp = await fetch('/api/finance/manual-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          date: depositForm.date,
          bank: depositForm.bank,
          type: 'cash_deposit',
          label: `הפקדת מזומן מקופה לחשבון ${BANK_CONFIG[depositForm.bank]?.name || depositForm.bank}`,
          notes: depositForm.notes || '',
          isConfirmed: true
        })
      });

      if (resp.ok) {
        const newEntry = await resp.json();
        setServerData((prev) => ({
          ...prev,
          manualEntries: [...prev.manualEntries, newEntry]
        }));
        setShowDepositModal(false);
        setDepositForm({
          amount: '',
          bank: 'mizrahi',
          date: today,
          notes: ''
        });
      } else {
        alert('שגיאה ברישום ההפקדה בשרת');
      }
    } catch (err) {
      console.error('Error submitting cash deposit:', err);
      alert('שגיאה בתקשורת עם השרת');
    }
  }

  // Delete Manual Entry
  async function handleDeleteManualEntry(id) {
    if (!confirm('האם למחוק רשומה ידנית זו?')) return;
    try {
      const resp = await fetch(`/api/finance/manual-entries/${id}`, { method: 'DELETE' });
      if (resp.ok) {
        setServerData((prev) => ({
          ...prev,
          manualEntries: prev.manualEntries.filter((e) => e.id !== id)
        }));
      }
    } catch (e) {
      alert('שגיאה במחיקת רשומה');
    }
  }

  // Handle Photo Upload for Check Capture
  function handleImageSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCaptureForm((prev) => ({
        ...prev,
        imagePreview: reader.result,
        check_number: prev.check_number || `${Math.floor(1000000 + Math.random() * 9000000)}`,
        amount: prev.amount || '4500',
        payee: prev.payee || 'ספק חומרי גלם / שירותים'
      }));
    };
    reader.readAsDataURL(file);
  }

  // Submit check to backend capture & duplicate check
  async function handleCaptureSubmit(e) {
    e.preventDefault();
    try {
      const resp = await fetch('/api/finance/checks/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: captureForm.imagePreview,
          imageName: 'check_upload.jpg',
          fields: {
            check_number: captureForm.check_number,
            amount: captureForm.amount,
            due_date: captureForm.due_date,
            payee: captureForm.payee,
            bank: captureForm.bank,
            description: captureForm.description,
            is_outgoing: captureForm.is_outgoing
          }
        })
      });
      if (resp.ok) {
        const record = await resp.json();
        setCapturePending(record);
      }
    } catch (e) {
      alert('שגיאה בקליטת השיק');
    }
  }

  // Explicit confirmation before adding to forecast
  async function handleExplicitConfirm(captureId) {
    try {
      const resp = await fetch('/api/finance/checks/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureId })
      });
      if (resp.ok) {
        alert('השיק אושר בהצלחה ונוסף לתחזית התזרים!');
        setCapturePending(null);
        setShowCaptureModal(false);
        fetchServerData();
      }
    } catch (e) {
      alert('שגיאה באישור השיק');
    }
  }

  // Send Proactive WhatsApp Alert to Owner
  async function handleSendWhatsappAlert(alertObj) {
    setWhatsappSending(true);
    setWhatsappSentSuccess(false);
    try {
      const msg = formatChloeWhatsAppAlert(alertObj);
      const resp = await fetch('/api/finance/alerts/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: '972506983399',
          message: msg
        })
      });
      if (resp.ok) {
        setWhatsappSentSuccess(true);
        setTimeout(() => {
          setWhatsappAlertModal(null);
          setWhatsappSentSuccess(false);
        }, 1800);
      }
    } catch (e) {
      alert('שגיאה בשליחת ווטסאפ דרך הסוכן');
    } finally {
      setWhatsappSending(false);
    }
  }

  // SVG Bizibox-style Cash Flow Chart Calculations
  const chartDays = activeDaysList;
  const chartHeight = isDesktop ? 300 : 220;
  const chartWidth = isWide ? 880 : (isDesktop ? 700 : Math.min(Math.max(windowWidth - 48, 320), 660));
  const paddingX = 40;
  const paddingY = 25;

  const minVal = useMemo(() => {
    let min = 0;
    for (const d of chartDays) {
      const val = selectedBankFilter === 'all' ? d.totalBalance : d.balances[selectedBankFilter];
      if (val < min) min = val;
    }
    const maxFacility = selectedBankFilter === 'all'
      ? serverData.settings.banks.mizrahi.facility + serverData.settings.banks.discount.facility + serverData.settings.banks.beinleumi.facility
      : serverData.settings.banks[selectedBankFilter]?.facility || 100000;
    return Math.min(min, -maxFacility * 1.05);
  }, [chartDays, selectedBankFilter, serverData.settings]);

  const maxVal = useMemo(() => {
    let max = 50000;
    for (const d of chartDays) {
      const val = selectedBankFilter === 'all' ? d.totalBalance : d.balances[selectedBankFilter];
      if (val > max) max = val;
    }
    return Math.max(max * 1.15, 100000);
  }, [chartDays, selectedBankFilter]);

  const scaleY = (val) => {
    const range = maxVal - minVal;
    if (range <= 0) return chartHeight / 2;
    return chartHeight - paddingY - ((val - minVal) / range) * (chartHeight - 2 * paddingY);
  };

  const scaleX = (idx) => {
    const count = chartDays.length;
    if (count <= 1) return paddingX;
    return paddingX + (idx / (count - 1)) * (chartWidth - 2 * paddingX);
  };

  const zeroY = scaleY(0);

  // Line paths
  const balancePoints = chartDays.map((d, idx) => {
    const val = selectedBankFilter === 'all' ? d.totalBalance : d.balances[selectedBankFilter];
    return `${scaleX(idx)},${scaleY(val)}`;
  }).join(' ');

  const currentBufferY = useMemo(() => {
    const buf = selectedBankFilter === 'all'
      ? serverData.settings.banks.mizrahi.safetyBuffer + serverData.settings.banks.discount.safetyBuffer + serverData.settings.banks.beinleumi.safetyBuffer
      : serverData.settings.banks[selectedBankFilter]?.safetyBuffer || 25000;
    return scaleY(buf);
  }, [selectedBankFilter, serverData.settings, scaleY]);

  const currentFacilityY = useMemo(() => {
    const fac = selectedBankFilter === 'all'
      ? serverData.settings.banks.mizrahi.facility + serverData.settings.banks.discount.facility + serverData.settings.banks.beinleumi.facility
      : serverData.settings.banks[selectedBankFilter]?.facility || 100000;
    return scaleY(-fac);
  }, [selectedBankFilter, serverData.settings, scaleY]);

  // Risk points on chart (where utilization >= 50% or buffer breach)
  const riskChartPoints = useMemo(() => {
    return chartDays.map((d, idx) => {
      const util = selectedBankFilter === 'all'
        ? Math.max(d.utilizations.mizrahi, d.utilizations.discount, d.utilizations.beinleumi)
        : d.utilizations[selectedBankFilter];
      const bal = selectedBankFilter === 'all' ? d.totalBalance : d.balances[selectedBankFilter];
      const buffer = selectedBankFilter === 'all'
        ? serverData.settings.banks.mizrahi.safetyBuffer + serverData.settings.banks.discount.safetyBuffer + serverData.settings.banks.beinleumi.safetyBuffer
        : serverData.settings.banks[selectedBankFilter]?.safetyBuffer || 25000;

      if (util >= 60 || bal < 0) {
        return { idx, x: scaleX(idx), y: scaleY(bal), severity: 'critical', date: d.date, util, bal };
      }
      if (util >= 50 || bal < buffer) {
        return { idx, x: scaleX(idx), y: scaleY(bal), severity: 'warning', date: d.date, util, bal };
      }
      return null;
    }).filter(Boolean);
  }, [chartDays, selectedBankFilter, serverData.settings, scaleX, scaleY]);

  return (
    <div
      dir="rtl"
      style={{
        background: mBrand.containerBg,
        color: mBrand.text,
        padding: isDesktop ? '1.25rem 1.5rem' : '0.75rem',
        borderRadius: '24px',
        border: `1px solid ${mBrand.cardBorder}`,
        fontFamily: GUEST_BRAND.fontBody,
        maxWidth: isDesktop ? '1580px' : '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        boxShadow: mBrand.shadowLg
      }}
    >
      {/* 1. TOP HEADER & BRAND COMMAND BAR */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.85rem',
          paddingBottom: '0.85rem',
          borderBottom: `1px solid ${mBrand.cardBorder}`,
          marginBottom: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {/* Miyalis Crest / Monogram Badge */}
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: `linear-gradient(135deg, ${GUEST_BRAND.wine}, #3E1E18)`,
              border: `1.5px solid ${mBrand.gold}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 16px ${mBrand.gold}33`,
              flexShrink: 0
            }}
          >
            <span
              style={{
                fontFamily: GUEST_BRAND.fontMark,
                fontSize: '1.4rem',
                fontWeight: 700,
                color: mBrand.gold,
                lineHeight: 1
              }}
            >
              M
            </span>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: GUEST_BRAND.fontMark,
                  fontSize: '0.72rem',
                  letterSpacing: '0.14em',
                  fontWeight: 700,
                  color: mBrand.gold,
                  textTransform: 'uppercase'
                }}
              >
                MIALEES RESORT
              </span>
              <span style={{ fontSize: '0.7rem', color: mBrand.textCloudy }}>•</span>
              <h1 style={{ margin: 0, fontSize: isDesktop ? '1.35rem' : '1.15rem', fontWeight: 900, letterSpacing: '-0.02em', color: mBrand.text }}>
                חמ״ל פיננסי ותזרים 120 יום
              </h1>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '20px',
                  background: mBrand.badgeBg,
                  color: mBrand.badgeText,
                  fontWeight: 800,
                  border: `1px solid ${mBrand.cardBorderSubtle}`
                }}
              >
                {financeOnly ? 'דניאל · מנהל כספים' : 'קריאה בלבד'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: mBrand.textMuted, marginTop: '0.2rem' }}>
              מזרחי טפחות · בנק דיסקונט · הבנק הבינלאומי (FIBI) · קופת מזומנים מקומית · סליקה והתראות מוקדמות
            </div>
          </div>
        </div>

        {/* Action Controls & Responsiveness indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Screen indicator pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              padding: '0.35rem 0.65rem',
              borderRadius: '10px',
              background: mBrand.cardBgAlt,
              color: mBrand.textMuted,
              border: `1px solid ${mBrand.cardBorderSubtle}`
            }}
            title={isDesktop ? 'תצוגה מותאמת למסך נייח (Desktop)' : 'תצוגה מותאמת למסך נייד (Mobile)'}
          >
            {isDesktop ? <Monitor size={14} color={mBrand.gold} /> : <Smartphone size={14} color={mBrand.gold} />}
            <span>{isDesktop ? 'מסך נייח' : 'מובייל'}</span>
          </div>

          {/* Theme switcher */}
          {setTheme && (
            <button
              type="button"
              onClick={() => setTheme(isLight ? 'dark' : 'light')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.42rem 0.65rem',
                borderRadius: '10px',
                border: `1px solid ${mBrand.cardBorder}`,
                background: mBrand.cardBg,
                color: mBrand.text,
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
              title={isLight ? 'מעבר למצב לילה' : 'מעבר למצב יום'}
            >
              {isLight ? <Moon size={14} /> : <Sun size={14} color={mBrand.gold} />}
              <span style={{ fontSize: '0.72rem' }}>{isLight ? 'לילה' : 'יום'}</span>
            </button>
          )}

          {/* WhatsApp / Check Capture */}
          <button
            type="button"
            onClick={() => setShowCaptureModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              color: '#FFFFFF',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)'
            }}
          >
            <Camera size={14} />
            קליטת שיק (Chloe)
          </button>

          {/* Manual Assumption */}
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.8rem',
              borderRadius: '10px',
              border: `1px solid ${mBrand.cardBorder}`,
              background: mBrand.cardBg,
              color: mBrand.text,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            הנחה ידנית
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.65rem',
              borderRadius: '10px',
              border: `1px solid ${mBrand.cardBorder}`,
              background: mBrand.cardBg,
              color: mBrand.text,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
            title="הגדרות מסגרות וכריות ביטחון"
          >
            <Settings size={15} />
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={fetchServerData}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.45rem 0.65rem',
              borderRadius: '10px',
              border: `1px solid ${mBrand.cardBorder}`,
              background: mBrand.cardBg,
              color: mBrand.text,
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
            title="רענן נתונים"
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
          </button>

          {/* Logout if in session */}
          {session?.onLogout && (
            <button
              type="button"
              onClick={session.onLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.45rem 0.75rem',
                borderRadius: '10px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#EF4444',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="התנתק"
            >
              <LogOut size={13} />
              התנתק
            </button>
          )}
        </div>
      </div>

      {/* 2. THREE PROMINENT BANK CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem'
        }}
      >
        {BANK_IDS.map((bankId) => {
          const cfg = BANK_CONFIG[bankId];
          const balance = calculation.balances[bankId];
          const facility = serverData.settings.banks[bankId]?.facility || cfg.defaultFacility;
          const safetyBuffer = serverData.settings.banks[bankId]?.safetyBuffer || cfg.defaultSafetyBuffer;
          const utilPct = balance < 0 ? Math.min(100, Math.round((Math.abs(balance) / facility) * 100)) : 0;
          const isWarning = utilPct >= 50 && utilPct < 60;
          const isCritical = utilPct >= 60 || balance < 0;
          const isBufferBreached = balance < safetyBuffer;
          const isSelected = selectedBankFilter === bankId;

          return (
            <div
              key={bankId}
              onClick={() => setSelectedBankFilter(isSelected ? 'all' : bankId)}
              style={{
                background: mBrand.cardBg,
                border: isSelected
                  ? `2px solid ${cfg.color}`
                  : `1px solid ${mBrand.cardBorder}`,
                borderRadius: '18px',
                padding: '1.1rem',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: isSelected
                  ? `0 8px 24px ${cfg.color}33`
                  : mBrand.shadow,
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: cfg.color,
                      boxShadow: `0 0 10px ${cfg.color}88`
                    }}
                  />
                  <span style={{ fontWeight: 800, fontSize: '0.98rem', color: mBrand.text }}>{cfg.name}</span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: '8px',
                    background: isCritical
                      ? 'rgba(239, 68, 68, 0.15)'
                      : isWarning
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(16, 185, 129, 0.15)',
                    color: isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981',
                    fontWeight: 800
                  }}
                >
                  {isCritical ? 'ניצול גבוה 🚨' : isWarning ? 'אזהרה 50% ⚠️' : 'תקין ✅'}
                </span>
              </div>

              <div style={{ fontSize: '0.74rem', color: mBrand.textMuted, marginBottom: '0.75rem' }}>
                חשבון: {cfg.accountLabel}
              </div>

              {/* Balance & Utilization */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: mBrand.textMuted }}>יתרה נוכחית</div>
                  <div
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 900,
                      fontFamily: GUEST_BRAND.fontMark,
                      color: balance < 0 ? '#EF4444' : balance < safetyBuffer ? '#F59E0B' : '#10B981'
                    }}
                  >
                    {formatMoney(balance)}
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.7rem', color: mBrand.textMuted }}>ניצול מסגרת</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: utilPct >= 60 ? '#EF4444' : utilPct >= 50 ? '#F59E0B' : mBrand.text }}>
                    {utilPct}%
                  </div>
                </div>
              </div>

              {/* Utilization Progress Bar */}
              <div
                style={{
                  height: '7px',
                  borderRadius: '4px',
                  background: isLight ? '#E8DFD5' : 'rgba(255,255,255,0.1)',
                  overflow: 'hidden',
                  marginBottom: '0.65rem',
                  position: 'relative'
                }}
              >
                {/* 50% marker line */}
                <div
                  style={{
                    position: 'absolute',
                    right: '50%',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#F59E0B',
                    zIndex: 2
                  }}
                  title="סף אזהרה מוקדמת 50%"
                />
                {/* 60% marker line */}
                <div
                  style={{
                    position: 'absolute',
                    right: '60%',
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#EF4444',
                    zIndex: 2
                  }}
                  title="סף קריטי 60%"
                />
                <div
                  style={{
                    width: `${Math.min(100, utilPct)}%`,
                    height: '100%',
                    background: utilPct >= 60 ? '#EF4444' : utilPct >= 50 ? '#F59E0B' : '#10B981',
                    transition: 'width 0.4s ease'
                  }}
                />
              </div>

              {/* Facility & Buffer details */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.74rem',
                  color: mBrand.textMuted,
                  borderTop: `1px dashed ${mBrand.cardBorderSubtle}`,
                  paddingTop: '0.5rem'
                }}
              >
                <span>מסגרת: <b style={{ color: mBrand.text }}>{formatCompactMoney(facility)}</b></span>
                <span>כרית ביטחון: <b style={{ color: mBrand.text }}>{formatCompactMoney(safetyBuffer)}</b></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. CONSOLIDATED LIQUIDITY & EXTERNAL FUNDING GAP BANNER */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? '1.25fr 1fr' : 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '0.85rem',
          marginBottom: '1.25rem'
        }}
      >
        {/* Consolidated Liquidity Summary Card */}
        <div
          style={{
            background: mBrand.cardBg,
            border: `1px solid ${mBrand.cardBorder}`,
            borderRadius: '18px',
            padding: '1.1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: mBrand.shadow
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: mBrand.goldBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Wallet size={17} color={mBrand.gold} />
              </div>
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.98rem', color: mBrand.text }}>נזילות מאוחדת וקופת מזומנים</span>
                <div style={{ fontSize: '0.7rem', color: mBrand.textMuted }}>3 בנקים + קופת מתחם (F2)</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setDepositForm({
                    amount: calculation.kpis.currentCashDrawer > 0 ? String(calculation.kpis.currentCashDrawer) : '',
                    bank: 'mizrahi',
                    date: today,
                    notes: ''
                  });
                  setShowDepositModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  background: mBrand.primaryBtn,
                  color: mBrand.primaryBtnText,
                  border: 'none',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
                title="העבר מזומן מהקופה המקומית לעו״ש בנקאי"
              >
                <ArrowDownLeft size={13} />
                הפקדת מזומן לבנק
              </button>
            </div>
          </div>

          {/* 4-part Liquidity Metrics Breakdown */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
              gap: '0.65rem',
              marginBottom: '0.85rem'
            }}
          >
            {/* 1. Liquid Bank Checking */}
            <div
              style={{
                background: mBrand.cardBgAlt,
                padding: '0.75rem',
                borderRadius: '14px',
                border: `1px solid ${mBrand.cardBorderSubtle}`
              }}
            >
              <div style={{ fontSize: '0.7rem', color: mBrand.textMuted, marginBottom: '0.25rem' }}>
                סך עו״ש בנקים נזיל
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: GUEST_BRAND.fontMark,
                  color: calculation.kpis.currentTotalCash < 0 ? '#EF4444' : '#10B981'
                }}
              >
                {formatMoney(calculation.kpis.currentTotalCash)}
              </div>
              <div style={{ fontSize: '0.66rem', color: mBrand.textCloudy, marginTop: '0.2rem' }}>
                3 חשבונות פעילים
              </div>
            </div>

            {/* 2. Cash on Hand (Local Cash Drawer) */}
            <div
              style={{
                background: isLight ? '#F2FAF5' : 'rgba(16, 185, 129, 0.08)',
                padding: '0.75rem',
                borderRadius: '14px',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10B981' }}>
                  מזומן בקופה (F2)
                </span>
                <span
                  style={{
                    fontSize: '0.6rem',
                    padding: '0.1rem 0.35rem',
                    borderRadius: '4px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#10B981',
                    fontWeight: 800
                  }}
                >
                  במתחם
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: GUEST_BRAND.fontMark,
                  color: '#10B981'
                }}
              >
                {formatMoney(calculation.kpis.currentCashDrawer)}
              </div>
              <div style={{ fontSize: '0.66rem', color: isLight ? '#059669' : '#34D399', marginTop: '0.2rem' }}>
                לא מקטין ניצול עד להפקדה
              </div>
            </div>

            {/* 3. Available Credit Headroom */}
            <div
              style={{
                background: mBrand.cardBgAlt,
                padding: '0.75rem',
                borderRadius: '14px',
                border: `1px solid ${mBrand.cardBorderSubtle}`
              }}
            >
              <div style={{ fontSize: '0.7rem', color: mBrand.textMuted, marginBottom: '0.25rem' }}>
                סך מסגרות פנויות
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: GUEST_BRAND.fontMark,
                  color: '#3B82F6'
                }}
              >
                {formatMoney(calculation.kpis.currentAvailableHeadroom)}
              </div>
              <div style={{ fontSize: '0.66rem', color: mBrand.textCloudy, marginTop: '0.2rem' }}>
                מרווח משיכה בנקאי
              </div>
            </div>

            {/* 4. Total Combined Liquidity */}
            <div
              style={{
                background: isLight ? '#FAF5F8' : 'rgba(242, 213, 221, 0.08)',
                padding: '0.75rem',
                borderRadius: '14px',
                border: `1px solid ${mBrand.accentCandy}44`
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: mBrand.accentDeepPink, marginBottom: '0.25rem' }}>
                סך נזילות כוללת
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 900,
                  fontFamily: GUEST_BRAND.fontMark,
                  color: mBrand.accentCandy
                }}
              >
                {formatMoney(calculation.kpis.currentTotalLiquidity)}
              </div>
              <div style={{ fontSize: '0.66rem', color: mBrand.textMuted, marginTop: '0.2rem' }}>
                עו״ש + קופה + מסגרות
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.74rem',
              color: mBrand.textMuted,
              marginTop: '0.45rem',
              paddingTop: '0.5rem',
              borderTop: `1px solid ${mBrand.cardBorderSubtle}`
            }}
          >
            <span>סה״כ מסגרות: <b style={{ color: mBrand.text }}>{formatCompactMoney(calculation.kpis.currentTotalFacility)}</b></span>
            <span>כריות ביטחון: <b style={{ color: mBrand.text }}>{formatCompactMoney(calculation.kpis.currentTotalBuffer)}</b></span>
          </div>
        </div>

        {/* External Funding Requirement Card */}
        <div
          style={{
            background: calculation.fundingRequirement.hasRequirement
              ? isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)'
              : mBrand.cardBg,
            border: calculation.fundingRequirement.hasRequirement
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : `1px solid ${mBrand.cardBorder}`,
            borderRadius: '18px',
            padding: '1.1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: mBrand.shadow
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                {calculation.fundingRequirement.hasRequirement ? (
                  <AlertTriangle size={18} color="#EF4444" />
                ) : (
                  <CheckCircle2 size={18} color={mBrand.gold} />
                )}
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: mBrand.text }}>
                  {calculation.fundingRequirement.hasRequirement ? 'צורך במימון חיצוני מזוהה' : 'אין צורך במימון חיצוני'}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  background: calculation.fundingRequirement.gapType === 'timing_gap'
                    ? '#F59E0B22'
                    : calculation.fundingRequirement.gapType === 'sustained_shortage'
                    ? '#EF444422'
                    : `${mBrand.gold}22`,
                  color: calculation.fundingRequirement.gapType === 'timing_gap'
                    ? '#F59E0B'
                    : calculation.fundingRequirement.gapType === 'sustained_shortage'
                    ? '#EF4444'
                    : mBrand.gold,
                  fontWeight: 800
                }}
              >
                {calculation.fundingRequirement.gapType === 'timing_gap'
                  ? 'פער תזמון נקודתי (Temporary)'
                  : calculation.fundingRequirement.gapType === 'sustained_shortage'
                  ? 'גירעון מתמשך (Sustained)'
                  : 'תזרים מאוזן'}
              </span>
            </div>

            {calculation.fundingRequirement.hasRequirement ? (
              <div style={{ marginTop: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: mBrand.textMuted }}>
                  סכום מימון נדרש לכיסוי התחייבויות וכריות ביטחון:
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#EF4444', margin: '0.2rem 0', fontFamily: GUEST_BRAND.fontMark }}>
                  {formatMoney(calculation.fundingRequirement.financingAmountNeeded)}
                </div>
                <div style={{ fontSize: '0.75rem', color: mBrand.textMuted }}>
                  נדרש עד תאריך: <b style={{ color: mBrand.text }}>{calculation.fundingRequirement.earliestShortageDate}</b> (שיא הפער ב־{calculation.fundingRequirement.peakDate})
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: mBrand.textMuted, marginTop: '0.5rem' }}>
                כל ההתחייבויות המאושרות, השיקים הדחויים וכריות הביטחון של 3 הבנקים מכוסים במלואם לאורך {horizonDays} ימים.
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: '0.72rem',
              color: mBrand.textMuted,
              marginTop: '0.65rem',
              paddingTop: '0.45rem',
              borderTop: `1px dashed ${mBrand.cardBorderSubtle}`
            }}
          >
            💡 {calculation.fundingRequirement.seasonalityExplanation}
          </div>
        </div>
      </div>

      {/* 4. SCENARIO TOGGLE & HORIZON SELECTOR */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          background: mBrand.cardBg,
          border: `1px solid ${mBrand.cardBorder}`,
          borderRadius: '16px',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          boxShadow: mBrand.shadow
        }}
      >
        {/* Horizon selector: 30 / 60 / 90 / 120 days */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: mBrand.textMuted, marginLeft: '0.35rem', fontWeight: 700 }}>
            אופק תחזית:
          </span>
          {[30, 60, 90, 120].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setHorizonDays(days)}
              style={{
                border: 'none',
                borderRadius: '8px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.76rem',
                fontWeight: horizonDays === days ? 900 : 600,
                background: horizonDays === days ? mBrand.primaryBtn : mBrand.cardBgAlt,
                color: horizonDays === days ? mBrand.primaryBtnText : mBrand.textMuted,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {days} יום
            </button>
          ))}
        </div>

        {/* Baseline vs Scenario Mode Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            onClick={() => setScenarioMode('baseline')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '8px',
              border: scenarioMode === 'baseline' ? `1px solid ${mBrand.gold}` : `1px solid ${mBrand.cardBorderSubtle}`,
              background: scenarioMode === 'baseline' ? mBrand.goldBg : 'transparent',
              color: scenarioMode === 'baseline' ? mBrand.gold : mBrand.textMuted,
              fontWeight: 800,
              fontSize: '0.76rem',
              cursor: 'pointer'
            }}
          >
            <CheckCircle2 size={13} color={scenarioMode === 'baseline' ? mBrand.gold : undefined} />
            תחזית בסיס (נתונים מאומתים)
          </button>
          <button
            type="button"
            onClick={() => setScenarioMode('scenario')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '8px',
              border: scenarioMode === 'scenario' ? '1px solid #10B981' : `1px solid ${mBrand.cardBorderSubtle}`,
              background: scenarioMode === 'scenario' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: scenarioMode === 'scenario' ? '#10B981' : mBrand.textMuted,
              fontWeight: 800,
              fontSize: '0.76rem',
              cursor: 'pointer'
            }}
          >
            <Layers size={13} />
            בסיס + הנחות ידניות ({serverData.manualEntries.length})
          </button>
        </div>
      </div>

      {/* 5. INTERACTIVE DAILY CASH-FLOW CHART (BIZIBOX-STYLE) & DESKTOP DAY INSPECTOR */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? '1fr 380px' : '1fr',
          gap: '1rem',
          marginBottom: '1.25rem',
          alignItems: 'start'
        }}
      >
        {/* Left: Daily Cash-Flow Chart Card */}
        <div
          style={{
            background: mBrand.cardBg,
            border: `1px solid ${mBrand.cardBorder}`,
            borderRadius: '18px',
            padding: '1.1rem',
            position: 'relative',
            boxShadow: mBrand.shadow
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.98rem', color: mBrand.text }}>
                גרף יתרות יומי — {selectedBankFilter === 'all' ? 'שלושת הבנקים במאוחד' : BANK_CONFIG[selectedBankFilter]?.name}
              </div>
              <div style={{ fontSize: '0.72rem', color: mBrand.textMuted }}>
                קו אדום מקווקו: גבול מסגרת · קו כתום מקווקו: כרית ביטחון · נקודות צבעוניות: חריגות 50%/60%
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.72rem', color: mBrand.textMuted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} /> ניצול 60%
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} /> ניצול 50%
              </span>
            </div>
          </div>

          {/* SVG Chart */}
          <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: '100%', minWidth: '580px', height: 'auto', display: 'block' }}
            >
              <defs>
                <linearGradient id="chartGradientMiyalis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={mBrand.gold} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={mBrand.gold} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Zero line */}
              <line
                x1={paddingX}
                y1={zeroY}
                x2={chartWidth - paddingX}
                y2={zeroY}
                stroke={mBrand.textCloudy}
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <text x={paddingX - 5} y={zeroY + 4} fill={mBrand.textMuted} fontSize="9" textAnchor="end" fontFamily={GUEST_BRAND.fontBody}>
                ₪0
              </text>

              {/* Facility Line (Red dashed) */}
              <line
                x1={paddingX}
                y1={currentFacilityY}
                x2={chartWidth - paddingX}
                y2={currentFacilityY}
                stroke="#EF4444"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text x={chartWidth - paddingX + 5} y={currentFacilityY + 3} fill="#EF4444" fontSize="9" textAnchor="start" fontWeight="700">
                מסגרת
              </text>

              {/* Safety Buffer Line (Amber dashed) */}
              <line
                x1={paddingX}
                y1={currentBufferY}
                x2={chartWidth - paddingX}
                y2={currentBufferY}
                stroke="#F59E0B"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <text x={chartWidth - paddingX + 5} y={currentBufferY + 3} fill="#F59E0B" fontSize="9" textAnchor="start" fontWeight="700">
                כרית ביטחון
              </text>

              {/* Main balance curve in Miyalis Champagne Gold */}
              <polyline
                fill="none"
                stroke={mBrand.gold}
                strokeWidth="2.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={balancePoints}
              />

              {/* Risk Markers (50% and 60% triggers) */}
              {riskChartPoints.map((pt) => (
                <circle
                  key={pt.idx}
                  cx={pt.x}
                  cy={pt.y}
                  r="5"
                  fill={pt.severity === 'critical' ? '#EF4444' : '#F59E0B'}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedDate(pt.date);
                    if (!isDesktop) setShowDrilldownDrawer(true);
                  }}
                />
              ))}

              {/* Selected Date Indicator Line */}
              {(() => {
                const selIdx = chartDays.findIndex((d) => d.date === selectedDate);
                if (selIdx < 0) return null;
                const xPos = scaleX(selIdx);
                return (
                  <line
                    x1={xPos}
                    y1={paddingY}
                    x2={xPos}
                    y2={chartHeight - paddingY}
                    stroke={mBrand.gold}
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                );
              })()}
            </svg>
          </div>

          {/* Date Selector Scrubber Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginTop: '0.75rem',
              paddingTop: '0.65rem',
              borderTop: `1px solid ${mBrand.cardBorderSubtle}`
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: mBrand.text }}>
              יום נבחר: <span style={{ color: mBrand.gold, fontFamily: GUEST_BRAND.fontMark }}>{selectedDate}</span>
              {currentDayInfo && (
                <span style={{ marginRight: '0.75rem', color: currentDayInfo.totalBalance < 0 ? '#EF4444' : '#10B981', fontFamily: GUEST_BRAND.fontMark }}>
                  יתרה: {formatMoney(selectedBankFilter === 'all' ? currentDayInfo.totalBalance : currentDayInfo.balances[selectedBankFilter])}
                </span>
              )}
            </div>

            {!isDesktop ? (
              <button
                type="button"
                onClick={() => setShowDrilldownDrawer(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  border: `1px solid ${mBrand.cardBorder}`,
                  background: mBrand.cardBgAlt,
                  color: mBrand.text,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Eye size={13} /> פירוט תנועות ({currentDayInfo?.events?.length || 0})
              </button>
            ) : (
              <span style={{ fontSize: '0.72rem', color: mBrand.textMuted }}>
                לחץ על נקודה בגרף לצפייה בפירוט בפאנל הנייח משמאל ⬅️
              </span>
            )}
          </div>
        </div>

        {/* Right: Stationary Desktop Day Inspector (Exclusive layout for wide monitors) */}
        {isDesktop && (
          <div
            style={{
              background: mBrand.cardBg,
              border: `1px solid ${mBrand.cardBorder}`,
              borderRadius: '18px',
              padding: '1.1rem',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: mBrand.shadow,
              minHeight: `${chartHeight + 90}px`,
              maxHeight: `${chartHeight + 140}px`,
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={16} color={mBrand.gold} />
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: mBrand.text }}>
                  פירוט יומי: {selectedDate}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '6px',
                  background: mBrand.goldBg,
                  color: mBrand.gold,
                  fontWeight: 800
                }}
              >
                {currentDayInfo?.events?.length || 0} תנועות
              </span>
            </div>

            {/* Balances summary on selected day */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.4rem',
                background: mBrand.cardBgAlt,
                padding: '0.55rem',
                borderRadius: '10px',
                marginBottom: '0.65rem',
                fontSize: '0.68rem',
                textAlign: 'center'
              }}
            >
              <div>
                <div style={{ color: mBrand.textMuted }}>מזרחי</div>
                <b style={{ color: (currentDayInfo?.balances?.mizrahi || 0) < 0 ? '#EF4444' : mBrand.text }}>
                  {formatCompactMoney(currentDayInfo?.balances?.mizrahi || 0)}
                </b>
              </div>
              <div>
                <div style={{ color: mBrand.textMuted }}>דיסקונט</div>
                <b style={{ color: (currentDayInfo?.balances?.discount || 0) < 0 ? '#EF4444' : mBrand.text }}>
                  {formatCompactMoney(currentDayInfo?.balances?.discount || 0)}
                </b>
              </div>
              <div>
                <div style={{ color: mBrand.textMuted }}>בינלאומי</div>
                <b style={{ color: (currentDayInfo?.balances?.beinleumi || 0) < 0 ? '#EF4444' : mBrand.text }}>
                  {formatCompactMoney(currentDayInfo?.balances?.beinleumi || 0)}
                </b>
              </div>
            </div>

            {/* Scrollable events list on selected day */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingRight: '0.2rem' }}>
              {(!currentDayInfo?.events || currentDayInfo.events.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: mBrand.textMuted, fontSize: '0.78rem' }}>
                  אין תנועות תזרים מתוזמנות ביום זה.
                </div>
              ) : (
                currentDayInfo.events.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: mBrand.cardBgAlt,
                      border: `1px solid ${mBrand.cardBorderSubtle}`,
                      borderRadius: '10px',
                      padding: '0.55rem 0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.8rem', color: mBrand.text }}>{e.label}</span>
                      <span
                        style={{
                          fontWeight: 900,
                          fontSize: '0.86rem',
                          fontFamily: GUEST_BRAND.fontMark,
                          color: e.amount < 0 ? '#EF4444' : '#10B981'
                        }}
                      >
                        {formatMoney(e.amount)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: mBrand.textMuted, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {e.originalDate && e.originalDate !== e.date && (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#F59E0B',
                            fontWeight: 800
                          }}
                        >
                          נדחה מסופ״ש/חג ({e.originalDate})
                        </span>
                      )}
                      <span>בנק: <b style={{ color: mBrand.text }}>{BANK_CONFIG[e.bank]?.name || e.bank}</b></span>
                      <span>· {e.category}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. TAB NAVIGATION (EVENTS, ALERTS, AUDIT) */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: `1px solid ${mBrand.cardBorderSubtle}`,
          marginBottom: '1rem',
          overflowX: 'auto'
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('chart')}
          style={{
            padding: '0.65rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'chart' ? `3px solid ${mBrand.gold}` : '3px solid transparent',
            color: activeTab === 'chart' ? mBrand.gold : mBrand.textMuted,
            fontWeight: activeTab === 'chart' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          תנועות והתחייבויות קרובות
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          style={{
            padding: '0.65rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'alerts' ? '3px solid #EF4444' : '3px solid transparent',
            color: activeTab === 'alerts' ? '#EF4444' : mBrand.textMuted,
            fontWeight: activeTab === 'alerts' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}
        >
          התראות מוקדמות ({calculation.alerts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('capture')}
          style={{
            padding: '0.65rem 1rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'capture' ? '3px solid #10B981' : '3px solid transparent',
            color: activeTab === 'capture' ? '#10B981' : mBrand.textMuted,
            fontWeight: activeTab === 'capture' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          תיעוד שיקים ו-Chloe ({serverData.auditHistory?.length || 0})
        </button>
      </div>

      {/* 7. TAB CONTENT */}
      {activeTab === 'chart' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: mBrand.text }}>
              תנועות קרובות לאורך {horizonDays} הימים הבאים (ממוין לפי תאריך)
            </span>
            <span style={{ fontSize: '0.72rem', color: mBrand.textMuted }}>
              כולל שיקים עתידיים, חיובי כרטיסים, זיכויי בוקינג והנחות
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {calculation.baseline.events
              .filter((e) => selectedBankFilter === 'all' || e.bank === selectedBankFilter)
              .slice(0, 25)
              .map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '14px',
                    background: mBrand.cardBg,
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    boxShadow: mBrand.shadow
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: evt.amount < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {evt.amount < 0 ? (
                        <TrendingDown size={16} color="#EF4444" />
                      ) : (
                        <TrendingUp size={16} color="#10B981" />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: mBrand.text }}>{evt.label}</div>
                      <div style={{ fontSize: '0.72rem', color: mBrand.textMuted, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span>{evt.date}</span>
                        {evt.originalDate && evt.originalDate !== evt.date && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#F59E0B',
                              fontWeight: 700
                            }}
                          >
                            נדחה מסופ״ש/חג ({evt.originalDate})
                          </span>
                        )}
                        <span>· בנק: <b>{BANK_CONFIG[evt.bank]?.name || evt.bank}</b></span>
                        {evt.source ? <span>· מקור: {evt.source}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      fontFamily: GUEST_BRAND.fontMark,
                      color: evt.amount < 0 ? '#EF4444' : '#10B981'
                    }}
                  >
                    {formatMoney(evt.amount)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {calculation.alerts.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: '#10B981',
                background: isLight ? '#F0FDF4' : 'rgba(16, 185, 129, 0.08)',
                borderRadius: '16px',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}
            >
              <CheckCircle2 size={32} style={{ marginBottom: '0.5rem' }} />
              <div style={{ fontWeight: 800 }}>אין התראות חריגה באופק של {horizonDays} ימים!</div>
              <div style={{ fontSize: '0.78rem', marginTop: '0.25rem', opacity: 0.85 }}>
                כל יתרות הבנקים צפויות להישאר מעל כריות הביטחון ומתחת לרף ה־50% של מסגרות האשראי.
              </div>
            </div>
          ) : (
            calculation.alerts.map((al) => (
              <div
                key={al.id}
                style={{
                  background: al.severity === 'critical'
                    ? isLight ? '#FEF2F2' : 'rgba(239, 68, 68, 0.1)'
                    : isLight ? '#FFFBEB' : 'rgba(245, 158, 11, 0.1)',
                  border: al.severity === 'critical'
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '16px',
                  padding: '0.85rem 1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {al.severity === 'critical' ? (
                      <AlertCircle size={18} color="#EF4444" />
                    ) : (
                      <AlertTriangle size={18} color="#F59E0B" />
                    )}
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: mBrand.text }}>{al.title}</span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '6px',
                      background: al.severity === 'critical' ? '#EF444422' : '#F59E0B22',
                      color: al.severity === 'critical' ? '#EF4444' : '#F59E0B'
                    }}
                  >
                    תאריך יעד: {al.date}
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: mBrand.text, marginBottom: '0.5rem' }}>
                  {al.description}
                </div>

                {al.causingEvents && al.causingEvents.length > 0 && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      background: mBrand.cardBgAlt,
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      marginBottom: '0.65rem'
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: '0.2rem', color: mBrand.text }}>תנועות גורמות עיקריות ביום זה:</div>
                    {al.causingEvents.slice(0, 3).map((ce) => (
                      <div key={ce.id} style={{ display: 'flex', justifyContent: 'space-between', color: mBrand.textMuted }}>
                        <span>• {ce.label}</span>
                        <b style={{ color: mBrand.text }}>{formatMoney(ce.amount)}</b>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setWhatsappAlertModal(al)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10B981',
                      color: '#FFFFFF',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    <Send size={13} /> שלח התראה לווטסאפ (Chloe)
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'capture' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: mBrand.text }}>
            תיעוד קליטת שיקים דרך Chloe בווטסאפ (כולל אישור בעלים ומניעת כפילויות)
          </div>

          {serverData.auditHistory.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: mBrand.textMuted,
                background: mBrand.cardBg,
                borderRadius: '16px',
                border: `1px solid ${mBrand.cardBorder}`
              }}
            >
              <Clock size={28} style={{ marginBottom: '0.45rem', opacity: 0.6 }} />
              <div>טרם נקלטו שיקים דרך WhatsApp. צלם שיק ושלח ל-Chloe לקליטה מיידית.</div>
            </div>
          ) : (
            serverData.auditHistory.map((audit) => (
              <div
                key={audit.captureId}
                style={{
                  background: mBrand.cardBg,
                  border: `1px solid ${mBrand.cardBorder}`,
                  borderRadius: '14px',
                  padding: '0.75rem 1rem',
                  boxShadow: mBrand.shadow
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <FileText size={16} color={mBrand.gold} />
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: mBrand.text }}>
                      שיק מס׳ {audit.extracted?.check_number} · ₪{Number(audit.extracted?.amount || 0).toLocaleString('he-IL')}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '6px',
                      background: audit.confirmed ? '#10B98122' : '#F59E0B22',
                      color: audit.confirmed ? '#10B981' : '#F59E0B'
                    }}
                  >
                    {audit.confirmed ? 'מאושר בתחזית ✅' : 'ממתין לאישור בעלים ⏳'}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: mBrand.textMuted }}>
                  תאריך פירעון: <b style={{ color: mBrand.text }}>{audit.extracted?.due_date}</b> · לפקודת: <b style={{ color: mBrand.text }}>{audit.extracted?.payee}</b> · חשבון: {audit.extracted?.bank}
                </div>
                {audit.duplicatesFound && (
                  <div style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: '0.25rem' }}>
                    ⚠️ זוהה שיק דומה קודם במערכת בעת הצילום.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 8. DRILL-DOWN DRAWER BY SELECTED DATE */}
      {showDrilldownDrawer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-start'
          }}
          onClick={() => setShowDrilldownDrawer(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              height: '100%',
              background: mBrand.cardBg,
              color: mBrand.text,
              padding: '1.25rem',
              overflowY: 'auto',
              boxShadow: mBrand.shadowLg,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: `1px solid ${mBrand.cardBorder}`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: mBrand.text }}>פירוט יום: {selectedDate}</h3>
                <div style={{ fontSize: '0.75rem', color: mBrand.textMuted }}>
                  יתרה כוללת בסוף יום: <b style={{ color: (currentDayInfo?.totalBalance || 0) < 0 ? '#EF4444' : '#10B981', fontFamily: GUEST_BRAND.fontMark }}>{formatMoney(currentDayInfo?.totalBalance)}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDrilldownDrawer(false)}
                style={{
                  border: `1px solid ${mBrand.cardBorderSubtle}`,
                  background: mBrand.cardBgAlt,
                  color: mBrand.text,
                  padding: '0.35rem 0.65rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                ✕ סגור
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1 }}>
              {currentDayInfo?.events?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: mBrand.textMuted }}>
                  אין תנועות תזרים מתוזמנות ביום זה.
                </div>
              ) : (
                currentDayInfo?.events?.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: mBrand.cardBgAlt,
                      border: `1px solid ${mBrand.cardBorderSubtle}`,
                      borderRadius: '12px',
                      padding: '0.75rem 0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem', color: mBrand.text }}>{e.label}</span>
                      <span style={{ fontWeight: 900, fontFamily: GUEST_BRAND.fontMark, color: e.amount < 0 ? '#EF4444' : '#10B981' }}>
                        {formatMoney(e.amount)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: mBrand.textMuted, display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {e.originalDate && e.originalDate !== e.date && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#F59E0B',
                            fontWeight: 700
                          }}
                        >
                          נדחה מסופ״ש/חג ({e.originalDate})
                        </span>
                      )}
                      <span>בנק: <b style={{ color: mBrand.text }}>{BANK_CONFIG[e.bank]?.name || e.bank}</b></span>
                      <span>· {e.category}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. MANUAL ENTRY MODAL */}
      {showManualModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowManualModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              background: mBrand.cardBg,
              color: mBrand.text,
              borderRadius: '20px',
              padding: '1.35rem',
              boxShadow: mBrand.shadowLg,
              border: `1px solid ${mBrand.cardBorder}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Plus size={18} color={mBrand.gold} />
                <h3 style={{ margin: 0, fontWeight: 900, color: mBrand.text }}>הוספת הנחת תזרים ידנית</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                style={{ border: 'none', background: 'none', color: mBrand.textMuted, cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManualEntry}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  סוג תנועה
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setManualForm((p) => ({ ...p, type: 'expense' }))}
                    style={{
                      padding: '0.55rem',
                      borderRadius: '8px',
                      border: manualForm.type === 'expense' ? '2px solid #EF4444' : `1px solid ${mBrand.cardBorderSubtle}`,
                      background: manualForm.type === 'expense' ? 'rgba(239, 68, 68, 0.15)' : mBrand.cardBgAlt,
                      color: manualForm.type === 'expense' ? '#EF4444' : mBrand.textMuted,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    הוצאה צפויה
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm((p) => ({ ...p, type: 'income' }))}
                    style={{
                      padding: '0.55rem',
                      borderRadius: '8px',
                      border: manualForm.type === 'income' ? '2px solid #10B981' : `1px solid ${mBrand.cardBorderSubtle}`,
                      background: manualForm.type === 'income' ? 'rgba(16, 185, 129, 0.15)' : mBrand.cardBgAlt,
                      color: manualForm.type === 'income' ? '#10B981' : mBrand.textMuted,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    הכנסה צפויה
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  סכום מדויק (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="לדוגמה: 15000"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  תאריך יעד
                </label>
                <input
                  type="date"
                  required
                  value={manualForm.date}
                  onChange={(e) => setManualForm((p) => ({ ...p, date: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  בנק יעד / מקור
                </label>
                <select
                  value={manualForm.bank}
                  onChange={(e) => setManualForm((p) => ({ ...p, bank: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="mizrahi">מזרחי טפחות (462-601997)</option>
                  <option value="discount">בנק דיסקונט (176-253325996)</option>
                  <option value="beinleumi">הבנק הבינלאומי (31-92-395140)</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  תיאור והערות
                </label>
                <input
                  type="text"
                  placeholder="לדוגמה: שכירות מתחם או תקבול קבוצה"
                  value={manualForm.label}
                  onChange={(e) => setManualForm((p) => ({ ...p, label: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: 'transparent',
                    color: mBrand.textMuted,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: mBrand.primaryBtn,
                    color: mBrand.primaryBtnText,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  הוסף לתחזית
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9b. CASH DEPOSIT MODAL */}
      {showDepositModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowDepositModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              background: mBrand.cardBg,
              color: mBrand.text,
              borderRadius: '20px',
              padding: '1.35rem',
              boxShadow: mBrand.shadowLg,
              border: `1px solid ${mBrand.cardBorder}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: mBrand.goldBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ArrowDownLeft size={18} color={mBrand.gold} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem', color: mBrand.text }}>הפקדת מזומן לבנק</h3>
                  <div style={{ fontSize: '0.72rem', color: mBrand.textMuted }}>
                    העברת מזומן מקופת המתחם (F2) ישירות לעו״ש בנקאי
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDepositModal(false)}
                style={{ border: 'none', background: 'none', color: mBrand.textMuted, cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>

            {/* Cash Drawer Available Status Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.85rem',
                borderRadius: '12px',
                background: isLight ? '#F2FAF5' : 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                marginBottom: '1rem'
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700 }}>יתרה זמינה בקופת המתחם</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10B981', fontFamily: GUEST_BRAND.fontMark }}>
                  {formatMoney(calculation.kpis.currentCashDrawer)}
                </div>
              </div>
              {calculation.kpis.currentCashDrawer > 0 && (
                <button
                  type="button"
                  onClick={() => setDepositForm((p) => ({ ...p, amount: String(calculation.kpis.currentCashDrawer) }))}
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.3rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #10B981',
                    background: 'transparent',
                    color: '#10B981',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  הפקד הכל
                </button>
              )}
            </div>

            <form onSubmit={handleCashDepositSubmit}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  סכום להפקדה (₪)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm((p) => ({ ...p, amount: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box',
                    fontSize: '1rem',
                    fontWeight: 700
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  בנק יעד להפקדה
                </label>
                <select
                  value={depositForm.bank}
                  onChange={(e) => setDepositForm((p) => ({ ...p, bank: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="mizrahi">מזרחי טפחות (462-601997) — יתרה: {formatCompactMoney(calculation.balances.mizrahi)}</option>
                  <option value="discount">בנק דיסקונט (176-253325996) — יתרה: {formatCompactMoney(calculation.balances.discount)}</option>
                  <option value="beinleumi">הבנק הבינלאומי (31-92-395140) — יתרה: {formatCompactMoney(calculation.balances.beinleumi)}</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  תאריך ערך בנקאי
                </label>
                <input
                  type="date"
                  required
                  value={depositForm.date}
                  onChange={(e) => setDepositForm((p) => ({ ...p, date: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
                {!isBankingBusinessDay(depositForm.date) && (
                  <div style={{ fontSize: '0.7rem', color: '#F59E0B', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Info size={12} />
                    יום זה אינו יום עסקים בנקאי. הפעולה תירשם בפועל ביום: <b>{adjustToNextBusinessDay(depositForm.date)}</b>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.25rem', color: mBrand.textMuted }}>
                  הערות / אסמכתא (אופציונלי)
                </label>
                <input
                  type="text"
                  placeholder="מספר מעטפת הפקדה, סניף, או שם המפקיד"
                  value={depositForm.notes}
                  onChange={(e) => setDepositForm((p) => ({ ...p, notes: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBgAlt,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDepositModal(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: 'transparent',
                    color: mBrand.textMuted,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  בצע הפקדה לחשבון
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. CHECK CAPTURE MODAL (CHLOE) */}
      {showCaptureModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowCaptureModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              background: mBrand.cardBg,
              color: mBrand.text,
              borderRadius: '20px',
              padding: '1.35rem',
              boxShadow: mBrand.shadowLg,
              border: `1px solid ${mBrand.cardBorder}`,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Camera size={20} color="#10B981" />
                <h3 style={{ margin: 0, fontWeight: 900, color: mBrand.text }}>קליטת שיק דרך Chloe</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCaptureModal(false)}
                style={{ border: 'none', background: 'none', color: mBrand.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            {!capturePending ? (
              <form onSubmit={handleCaptureSubmit}>
                <div
                  style={{
                    border: '2px dashed #10B981',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    textAlign: 'center',
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    background: isLight ? '#F0FDF4' : 'rgba(16, 185, 129, 0.05)'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageSelected}
                    style={{ display: 'none' }}
                  />
                  {captureForm.imagePreview ? (
                    <div>
                      <img
                        src={captureForm.imagePreview}
                        alt="שיק"
                        style={{ maxHeight: '140px', borderRadius: '8px', marginBottom: '0.5rem' }}
                      />
                      <div style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 800 }}>
                        תמונה נטענה בהצלחה! לחץ להחלפה
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Camera size={32} color="#10B981" style={{ marginBottom: '0.45rem' }} />
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: mBrand.text }}>לחץ להעלאת צילום שיק או צילום מהנייד</div>
                      <div style={{ fontSize: '0.72rem', color: mBrand.textMuted, marginTop: '0.25rem' }}>
                        Chloe תפענח את מספר השיק, הסכום ותאריך הפירעון ותבקש אישור לפני הוספה
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem', color: mBrand.textMuted }}>
                      מספר שיק
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="1234567"
                      value={captureForm.check_number}
                      onChange={(e) => setCaptureForm((p) => ({ ...p, check_number: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: `1px solid ${mBrand.cardBorderSubtle}`,
                        background: mBrand.cardBgAlt,
                        color: mBrand.text,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem', color: mBrand.textMuted }}>
                      סכום (₪)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="5000"
                      value={captureForm.amount}
                      onChange={(e) => setCaptureForm((p) => ({ ...p, amount: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: `1px solid ${mBrand.cardBorderSubtle}`,
                        background: mBrand.cardBgAlt,
                        color: mBrand.text,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.65rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem', color: mBrand.textMuted }}>
                      תאריך פירעון
                    </label>
                    <input
                      type="date"
                      required
                      value={captureForm.due_date}
                      onChange={(e) => setCaptureForm((p) => ({ ...p, due_date: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: `1px solid ${mBrand.cardBorderSubtle}`,
                        background: mBrand.cardBgAlt,
                        color: mBrand.text,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.2rem', color: mBrand.textMuted }}>
                      לפקודת (מוטב)
                    </label>
                    <input
                      type="text"
                      placeholder="שם הספק"
                      value={captureForm.payee}
                      onChange={(e) => setCaptureForm((p) => ({ ...p, payee: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: `1px solid ${mBrand.cardBorderSubtle}`,
                        background: mBrand.cardBgAlt,
                        color: mBrand.text,
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10B981',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    בדוק כפילויות ושלח לאישור
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div
                  style={{
                    background: capturePending.duplicatesFound ? '#FEF2F2' : '#F0FDF4',
                    border: capturePending.duplicatesFound ? '1px solid #EF4444' : '1px solid #10B981',
                    borderRadius: '12px',
                    padding: '1rem',
                    marginBottom: '1rem',
                    color: capturePending.duplicatesFound ? '#991B1B' : '#065F46'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                    {capturePending.duplicatesFound ? '⚠️ אזהרה: זוהה שיק כפול במערכת!' : '✅ לא נמצאו שיקים כפולים במערכת'}
                  </div>
                  <div style={{ fontSize: '0.8rem' }}>
                    מס׳ שיק: <b>{capturePending.extracted?.check_number}</b> · סכום: <b>₪{Number(capturePending.extracted?.amount).toLocaleString('he-IL')}</b>
                    <br />
                    תאריך פירעון: <b>{capturePending.extracted?.due_date}</b> · לפקודת: <b>{capturePending.extracted?.payee}</b>
                  </div>
                  {capturePending.duplicatesFound && (
                    <div style={{ fontSize: '0.75rem', marginTop: '0.45rem', fontWeight: 700 }}>
                      קיים שיק קודם עם אותו מספר וסכום ברישומי הבנק.
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setCapturePending(null)}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: `1px solid ${mBrand.cardBorderSubtle}`,
                      background: 'transparent',
                      color: mBrand.textMuted,
                      cursor: 'pointer'
                    }}
                  >
                    חזור לעריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExplicitConfirm(capturePending.captureId)}
                    style={{
                      flex: 1,
                      padding: '0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10B981',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    אישור סופי להוספה לתחזית
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 11. SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              background: mBrand.cardBg,
              color: mBrand.text,
              borderRadius: '20px',
              padding: '1.35rem',
              boxShadow: mBrand.shadowLg,
              border: `1px solid ${mBrand.cardBorder}`,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Settings size={18} color={mBrand.gold} />
                <h3 style={{ margin: 0, fontWeight: 900, color: mBrand.text }}>הגדרות מסגרות וכריות ביטחון</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{ border: 'none', background: 'none', color: mBrand.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
              {BANK_IDS.map((bankId) => (
                <div
                  key={bankId}
                  style={{
                    background: mBrand.cardBgAlt,
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    borderRadius: '12px',
                    padding: '0.85rem'
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: '0.45rem', color: mBrand.text }}>
                    {BANK_CONFIG[bankId]?.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: mBrand.textMuted }}>
                        מסגרת אשראי (₪)
                      </label>
                      <input
                        type="number"
                        value={tempSettings.banks?.[bankId]?.facility || 100000}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTempSettings((p) => ({
                            ...p,
                            banks: {
                              ...p.banks,
                              [bankId]: { ...p.banks[bankId], facility: val }
                            }
                          }));
                        }}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: `1px solid ${mBrand.cardBorderSubtle}`,
                          background: mBrand.cardBg,
                          color: mBrand.text,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: mBrand.textMuted }}>
                        כרית ביטחון מינימלית (₪)
                      </label>
                      <input
                        type="number"
                        value={tempSettings.banks?.[bankId]?.safetyBuffer || 25000}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setTempSettings((p) => ({
                            ...p,
                            banks: {
                              ...p.banks,
                              [bankId]: { ...p.banks[bankId], safetyBuffer: val }
                            }
                          }));
                        }}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          border: `1px solid ${mBrand.cardBorderSubtle}`,
                          background: mBrand.cardBg,
                          color: mBrand.text,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div
                style={{
                  background: mBrand.cardBgAlt,
                  border: `1px solid ${mBrand.cardBorderSubtle}`,
                  borderRadius: '12px',
                  padding: '0.85rem'
                }}
              >
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.25rem', color: mBrand.text }}>
                  יום קבוע בחודש לזיכוי בוקינג (Booking.com)
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={tempSettings.bookingPayoutDay || 3}
                  onChange={(e) => setTempSettings((p) => ({ ...p, bookingPayoutDay: Number(e.target.value) }))}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: `1px solid ${mBrand.cardBorderSubtle}`,
                    background: mBrand.cardBg,
                    color: mBrand.text,
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.7rem', color: mBrand.textMuted, marginTop: '0.25rem' }}>
                  ברירת המחדל מוגדרת ל־3 בכל חודש (או ביום הבא).
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: `1px solid ${mBrand.cardBorderSubtle}`,
                  background: 'transparent',
                  color: mBrand.textMuted,
                  cursor: 'pointer'
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: mBrand.primaryBtn,
                  color: mBrand.primaryBtnText,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                שמור הגדרות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. WHATSAPP ALERT MODAL */}
      {whatsappAlertModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setWhatsappAlertModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              background: mBrand.cardBg,
              color: mBrand.text,
              borderRadius: '20px',
              padding: '1.35rem',
              boxShadow: mBrand.shadowLg,
              border: `1px solid ${mBrand.cardBorder}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: `1px solid ${mBrand.cardBorderSubtle}`, paddingBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Send size={18} color="#10B981" />
                <h3 style={{ margin: 0, fontWeight: 900, color: mBrand.text }}>תצוגה מקדימה — התראה לווטסאפ של מקס</h3>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappAlertModal(null)}
                style={{ border: 'none', background: 'none', color: mBrand.textMuted, cursor: 'pointer', fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: isLight ? '#F0FDF4' : 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '1rem',
                fontSize: '0.8rem',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                marginBottom: '1rem',
                maxHeight: '260px',
                overflowY: 'auto',
                color: mBrand.text
              }}
            >
              {formatChloeWhatsAppAlert(whatsappAlertModal)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setWhatsappAlertModal(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '8px',
                  border: `1px solid ${mBrand.cardBorderSubtle}`,
                  background: 'transparent',
                  color: mBrand.textMuted,
                  cursor: 'pointer'
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={whatsappSending || whatsappSentSuccess}
                onClick={() => handleSendWhatsappAlert(whatsappAlertModal)}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: whatsappSentSuccess ? '#10B981' : '#25D366',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {whatsappSending ? 'שולח דרך Chloe...' : whatsappSentSuccess ? 'ההתראה נשלחה! ✅' : 'שלח עכשיו לווטסאפ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
