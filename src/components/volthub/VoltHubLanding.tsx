import React, { useState, useMemo } from 'react';
import {
  Zap,
  BatteryCharging,
  Clock,
  TrendingUp,
  ShieldCheck,
  Sun,
  Layers,
  Cpu,
  QrCode,
  Wifi,
  CheckCircle2,
  ArrowLeft,
  Copy,
  Check,
  Coffee,
  Moon,
  Home,
  DollarSign,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  Server,
  FileCheck
} from 'lucide-react';

export function VoltHubLanding() {
  // Simulator State
  const [dcCars, setDcCars] = useState<number>(4); // Range 1-10, default 4
  const [acCars, setAcCars] = useState<number>(3); // Range 0-8, default 3
  const [systemMode, setSystemMode] = useState<'grid' | 'solar'>('grid');
  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Financial Constants
  const isSolar = systemMode === 'solar';
  const CAPEX = isSolar ? 110000 : 58000; // 58,000 ₪ hub or 110,000 ₪ with 15kWp solar
  const GRID_COST_PER_KWH = 0.55; // ₪ / kWh base TOU

  // DC Fast Charging Metrics (25 kWh avg per vehicle, 1.90 ₪ / kWh sale price)
  const DC_KWH_PER_CAR = 25;
  const DC_SALE_PRICE = 1.90;
  const totalDcKwh = dcCars * DC_KWH_PER_CAR;

  // Solar generation: 15kWp produces ~70 kWh/day of free energy (cost = 0.00 ₪)
  const solarDcKwh = isSolar ? Math.min(totalDcKwh, 70) : 0;
  const gridDcKwh = totalDcKwh - solarDcKwh;

  // DC Profit calculation:
  // - In Grid mode: totalDcKwh * (1.90 - 0.55) = totalDcKwh * 1.35 ₪
  // - In Solar mode: (solarDcKwh * 1.90) + (gridDcKwh * 1.35)
  const dcDailyProfit = isSolar
    ? (solarDcKwh * DC_SALE_PRICE) + (gridDcKwh * (DC_SALE_PRICE - GRID_COST_PER_KWH))
    : totalDcKwh * (DC_SALE_PRICE - GRID_COST_PER_KWH);

  const dcDailyElectricityCost = isSolar
    ? gridDcKwh * GRID_COST_PER_KWH
    : totalDcKwh * GRID_COST_PER_KWH;

  const dcDailySavingsVsGrid = isSolar
    ? (totalDcKwh * GRID_COST_PER_KWH) - dcDailyElectricityCost
    : 0;

  // AC Overnight Charging Metrics (night charging from grid: 35 kWh avg, 1.30 ₪ sale, 0.55 ₪ cost)
  const AC_KWH_PER_CAR = 35;
  const AC_SALE_PRICE = 1.30;
  const totalAcKwh = acCars * AC_KWH_PER_CAR;
  const acProfitPerKwh = AC_SALE_PRICE - GRID_COST_PER_KWH; // 0.75 ₪
  const acDailyProfit = totalAcKwh * acProfitPerKwh; // 78.75 ₪ for 3 cars

  // Aggregated Outputs
  const dailyNetProfit = useMemo(() => {
    return dcDailyProfit + acDailyProfit;
  }, [dcDailyProfit, acDailyProfit]);

  const monthlyNetProfit = useMemo(() => {
    return dailyNetProfit * 30;
  }, [dailyNetProfit]);

  const annualNetProfit = useMemo(() => {
    return monthlyNetProfit * 12;
  }, [monthlyNetProfit]);

  const paybackMonths = useMemo(() => {
    if (monthlyNetProfit <= 0) return 0;
    return CAPEX / monthlyNetProfit;
  }, [monthlyNetProfit, CAPEX]);

  const annualRoiPercentage = useMemo(() => {
    if (CAPEX <= 0) return 0;
    return (annualNetProfit / CAPEX) * 100;
  }, [annualNetProfit, CAPEX]);

  // Presets
  const setPreset = (type: 'conservative' | 'realistic' | 'peak') => {
    if (type === 'conservative') {
      setDcCars(2);
      setAcCars(2);
    } else if (type === 'realistic') {
      setDcCars(4);
      setAcCars(3);
    } else if (type === 'peak') {
      setDcCars(7);
      setAcCars(5);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* ─── STICKY HEADER ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo & Status Badge */}
          <div className="flex items-center gap-3">
            <a href="#" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <Zap className="w-6 h-6 text-slate-950 fill-slate-950" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                  VoltHub
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Smart CPO
                  </span>
                </span>
                <span className="text-[11px] text-slate-400 font-medium">רשת טעינה חכמה וניהול עומס</span>
              </div>
            </a>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-300">
            <a href="#synergy" className="hover:text-emerald-400 transition-colors">סינרגיית שטח</a>
            <a href="#simulator" className="hover:text-emerald-400 transition-colors">סימולטור תשואה</a>
            <a href="#dlm-tech" className="hover:text-emerald-400 transition-colors">מנוע DLM וחשמל</a>
            <a href="#partnership" className="hover:text-emerald-400 transition-colors">חלוקת שותפות</a>
            <a href="#cloudflare" className="hover:text-emerald-400 transition-colors">מדריך פריסה</a>
          </nav>

          {/* Header Action Button */}
          <div className="flex items-center gap-3">
            <a
              href="#simulator"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all"
            >
              <span>פתח סימולטור רווח</span>
              <ArrowLeft className="w-4 h-4" />
            </a>
          </div>

        </div>
      </header>

      <main className="flex-1">

        {/* ─── HERO SECTION ─── */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden bg-grid-pattern">
          {/* Ambient Glows */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            
            {/* Strategic Location Live Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/30 shadow-lg shadow-emerald-500/5 mb-8">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-xs sm:text-sm font-semibold text-slate-200">
                📍 מיקום אסטרטגי: 500 מ' מבית הקפה ו-70 צימרים
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.18] sm:leading-[1.15] mb-6">
              להפוך שטח חניה פנוי ל<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">תחנת אנרגיה מניבה</span> בעידן הרכב החשמלי
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg lg:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed mb-10 font-normal">
              הקמת מתחם של <strong className="text-white font-bold">5 נקודות טעינה חכמות</strong> (1x 30kW DC מהיר + 4x 11kW AC לילה) בניהול עומסים דינמי (DLM) מבוסס CT על חיבור 3x63A קיים — ללא שדרוג חח״י יקר, ללא סכנת נפילת חשמל לבית, ובהחזר השקעה מואץ.
            </p>

            {/* Hero Quick Action Buttons */}
            <div className="flex flex-wrap justify-center items-center gap-4 mb-16">
              <a
                href="#simulator"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all flex items-center gap-2.5"
              >
                <span>התחל בסימולטור התשואה החי</span>
                <TrendingUp className="w-5 h-5 text-slate-950" />
              </a>
              <a
                href="#dlm-tech"
                className="px-7 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-bold text-base hover:text-white transition-all flex items-center gap-2"
              >
                <span>למה עמדת מדף טיפשה תקפיץ את הפיוז?</span>
                <Info className="w-5 h-5 text-slate-400" />
              </a>
            </div>

            {/* 4 Bento-Style Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-right">
              
              {/* Card 1: Stations Config */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400 group-hover:scale-110 transition-transform">
                  <BatteryCharging className="w-6 h-6" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mb-1">5 עמדות</div>
                <div className="text-sm font-bold text-emerald-400 mb-2">1x DC 30kW + 4x AC 11kW</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  עמדת DC מהירה עם CCS2 וטעינת ביניים ביום, לצד 4 שקעי Type 2 לטעינת לילה רגועה.
                </p>
              </div>

              {/* Card 2: Payback Period */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4 text-cyan-400 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mb-1">~9 חודשים</div>
                <div className="text-sm font-bold text-cyan-400 mb-2">החזר השקעה משוער (ROI)</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  הודות ל-CapEx מופחת של 58,000 ₪ בלבד וסינרגיית תפוסה מלאה יום ולילה.
                </p>
              </div>

              {/* Card 3: Zero Grid Upgrades (DLM) */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-400 group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mb-1">Zero Grid Upgrades</div>
                <div className="text-sm font-bold text-amber-400 mb-2">DLM על חיבור 3x63A קיים</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  בקר CT דוגם את הלוח בכל מילישנייה ומעניק עדיפות ראשונה לבית. אפס תשלום לחח"י.
                </p>
              </div>

              {/* Card 4: Solar Ready */}
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400 group-hover:scale-110 transition-transform">
                  <Sun className="w-6 h-6" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white mb-1">Solar Ready</div>
                <div className="text-sm font-bold text-indigo-400 mb-2">סנכרון מלא לייצור סולארי</div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  מוכן מובנה להזרקת עודפי חשמל סולארי מהגג ישירות לרכבים בצהריים באפס עלות אנרגיה.
                </p>
              </div>

            </div>

          </div>
        </section>

        {/* ─── DUAL SYNERGY SECTION ─── */}
        <section id="synergy" className="py-20 bg-slate-900/40 border-y border-slate-800/80 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold mb-3">
                <span>The Core Concept</span>
                <Layers className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
                סינרגיית יום ולילה מושלמת: אפס התנגשות, 100% תפוקה
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">
                המיקום הייחודי של המגרש (בין בית קפה סואן לבין 70 צימרים) מייצר שני קהלי יעד שונים לחלוטין שאינם חופפים בשעות. התוצאה: תשתית החשמל מנוצלת מסביב לשעון ברווחיות מרבית.
              </p>
            </div>

            {/* 2 Big Cards: Day vs Night */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
              
              {/* Day Block: Cafe & Transient Visitors */}
              <div className="p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-amber-500/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl" />
                
                <div className="flex items-center justify-between mb-6">
                  <span className="px-3.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black tracking-wide flex items-center gap-1.5 border border-amber-500/40">
                    <Coffee className="w-4 h-4" />
                    <span>08:00 – 18:00 | שעות יום</span>
                  </span>
                  <span className="text-xs font-bold text-slate-400">עמדת DC מהירה</span>
                </div>

                <h3 className="text-2xl font-black text-white mb-3">
                  מבקרי בית הקפה ועוברי אורח בציר
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                  אורחים שעוצרים לקפה וארוחה קלה יושבים בממוצע 40 עד 60 דקות. בדיוק הזמן הנדרש לעמדת ה-30kW DC למלא כ-25 קוט"ש (תוספת של ~150 ק"מ טווח נסיעה).
                </p>

                <div className="space-y-3.5 mb-8">
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <span><strong>1x 30kW DC מהיר:</strong> טעינת בזק נוחה ללא צורך בהמתנה ארוכה</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <span><strong>מרווח פרימיום:</strong> מכירה ב-1.90 ₪/קוט"ש מייצרת כ-33.75 ₪ רווח נקי לכל רכב</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <span><strong>הפניית זרם אוטומטית:</strong> ה-DLM מפנה את מלוא העוצמה ל-DC בזמן שחניות הצימרים ריקות</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-slate-400">רווח נקי משוער לרכב:</span>
                  <span className="text-xl font-black text-amber-400 font-mono">~33.75 ₪</span>
                </div>
              </div>

              {/* Night Block: 70 Vacation Cabins / Tzimerim */}
              <div className="p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-indigo-500/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl" />

                <div className="flex items-center justify-between mb-6">
                  <span className="px-3.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-black tracking-wide flex items-center gap-1.5 border border-indigo-500/40">
                    <Moon className="w-4 h-4" />
                    <span>20:00 – 08:00 | שעות לילה</span>
                  </span>
                  <span className="text-xs font-bold text-slate-400">4 עמדות AC לילה</span>
                </div>

                <h3 className="text-2xl font-black text-white mb-3">
                  אורחי 70 הצימרים בסביבה הקרובה
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                  נופשים שמגיעים לצימר מחנים את הרכב ללילה שלם (6 עד 8 שעות). במקום להסתבך עם שקעים פיראטיים בצימר, הם טוענים בנוחות ומתעוררים עם 100% סוללה.
                </p>

                <div className="space-y-3.5 mb-8">
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span><strong>4x 11kW AC:</strong> טעינה לילית רגועה ובטוחה השומרת על בריאות הסוללה</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span><strong>ערך מוסף אדיר לצימרים:</strong> פתרון טעינה איכותי המהווה מגנט להזמנות</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                    <span><strong>חלוקת עומס לילית שווה:</strong> צריכת זרם מתונה לאורך הלילה ללא עומס על הרשת המקומית</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-slate-400">רווח נקי משוער לרכב:</span>
                  <span className="text-xl font-black text-indigo-400 font-mono">~26.25 ₪</span>
                </div>
              </div>

            </div>

            {/* 24h Timeline Visualization */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-sm">פרופיל עומס 24 שעות ללא חפיפה</h4>
                  <p className="text-xs text-slate-400">התוכנה מסיטה את קיבולת הזרם אוטומטית בין היום ללילה</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  צהריים: 100% DC (בית קפה)
                </span>
                <span className="text-slate-600">→</span>
                <span className="px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                  לילה: 100% AC (צימרים)
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* ─── INTERACTIVE SIMULATOR (THE CORE FEATURE) ─── */}
        <section id="simulator" className="py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold mb-3">
                <DollarSign className="w-3.5 h-3.5" />
                <span>ROI & Financial Simulator</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
                סימולטור תשואה אינטראקטיבי
              </h2>
              <p className="text-slate-300 text-base sm:text-lg mb-6">
                בחן את המודל הכלכלי במסלול <strong>רשת בלבד (שלב א׳)</strong> או במסלול <strong>משולב סולארי 15kWp (שלב ב׳)</strong> וצפה בתזרים החי.
              </p>

              {/* Mode Switch: Grid Only vs Solar Integrated (15kWp) */}
              <div className="flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800 max-w-xl mx-auto mb-6 shadow-xl">
                <button
                  type="button"
                  onClick={() => setSystemMode('grid')}
                  className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    systemMode === 'grid'
                      ? 'bg-slate-800 text-white shadow-md border border-slate-700/80'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>⚡ רשת בלבד (58,000 ₪)</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setSystemMode('solar')}
                  className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    systemMode === 'solar'
                      ? 'bg-gradient-to-r from-amber-500/25 to-emerald-500/25 text-white shadow-md border border-amber-500/50'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>☀️ משולב סולארי 15kWp (110,000 ₪)</span>
                </button>
              </div>

              {/* 2-Stage Comparison Pills */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto mb-6">
                <div
                  onClick={() => setSystemMode('grid')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all text-right ${
                    systemMode === 'grid'
                      ? 'bg-slate-900/90 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                      : 'bg-slate-900/40 border-slate-800/80 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className="text-emerald-400">שלב א׳: כניסה מיידית</span>
                    <span className="text-slate-300">CapEx 58,000 ₪</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    החזר השקעה מהיר ב-~9 חודשים, רווח חודשי של 6,412 ₪ ומינימום סיכון.
                  </p>
                </div>

                <div
                  onClick={() => setSystemMode('solar')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all text-right ${
                    systemMode === 'solar'
                      ? 'bg-slate-900/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                      : 'bg-slate-900/40 border-slate-800/80 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className="text-amber-400">שלב ב׳: שדרוג סולארי 15kWp</span>
                    <span className="text-slate-300">CapEx 110,000 ₪</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    רווח חודשי מזנק ל-7,567 ₪ (+1,155 ₪ תוספת נטו/חודש), אפס עלות אנרגיה בצהריים והחזר ב-~14.5 חודשים.
                  </p>
                </div>
              </div>

              {/* Solar Highlight Banner when Active */}
              {isSolar && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-transparent border border-amber-500/30 mb-6 max-w-2xl mx-auto flex items-center gap-3 text-right">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Sun className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed">
                    <strong className="text-amber-300 font-bold block">70% מהטעינה המהירה בשעות היום מופקת ישירות מהגג ללא עלות חשמל!</strong>
                    מערכת 15kWp מייצרת כ-70 קוט"ש חינמיים ביום (בשעות 10:00–16:00). אפס עלות חשמל בשיא הצהריים + הגנה מלאה על תשתית החשמל של הבית באמצעות ייצור מקומי.
                  </div>
                </div>
              )}

              {/* Scenario Preset Buttons */}
              <div className="flex items-center justify-center gap-2 sm:gap-3 mt-4">
                <button
                  onClick={() => setPreset('conservative')}
                  className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    dcCars === 2 && acCars === 2
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  תרחיש שמרני (2 DC + 2 AC)
                </button>
                <button
                  onClick={() => setPreset('realistic')}
                  className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    dcCars === 4 && acCars === 3
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  ★ תרחיש ריאלי (4 DC + 3 AC)
                </button>
                <button
                  onClick={() => setPreset('peak')}
                  className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                    dcCars === 7 && acCars === 5
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  תרחיש שיא / סופ״ש (7 DC + 5 AC)
                </button>
              </div>
            </div>

            {/* Simulator Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left/Main Column: Sliders & Controls (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Slider 1: DC Fast Day */}
                <div className={`p-6 sm:p-7 rounded-3xl bg-slate-900/90 border shadow-xl transition-all ${
                  isSolar ? 'border-amber-500/40' : 'border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <Coffee className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base flex items-center gap-2">
                          <span>עמדת DC מהירה — יום (מבקרי בית קפה)</span>
                          {isSolar && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                              משולב סולארי
                            </span>
                          )}
                        </h4>
                        <span className="text-xs text-slate-400">
                          ממוצע 25 קוט"ש לרכב ({totalDcKwh} קוט"ש ליום) | מכירה ב-1.90 ₪/קוט"ש
                        </span>
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-2xl font-black text-amber-400">{dcCars}</span>
                      <span className="text-xs text-slate-400 font-sans mr-1">רכבים/יום</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={dcCars}
                    onChange={(e) => setDcCars(parseInt(e.target.value))}
                    className="w-full slider-amber h-2 rounded-lg"
                  />

                  <div className="flex justify-between items-center text-xs text-slate-500 mt-2 font-mono">
                    <span>1 רכב (מינימום)</span>
                    <span>5 רכבים</span>
                    <span>10 רכבים (מקסימום)</span>
                  </div>

                  {/* Solar Breakdown Badge inside DC card */}
                  {isSolar && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-slate-300 space-y-1">
                      <div className="flex justify-between font-medium">
                        <span>סולארי חינם מהגג (0.00 ₪):</span>
                        <span className="text-amber-300 font-bold">{solarDcKwh} קוט"ש</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>חשמל רשת חח"י (0.55 ₪):</span>
                        <span className="text-slate-300">{gridDcKwh} קוט"ש</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-amber-500/20 text-emerald-400 font-bold">
                        <span>עלות חשמל יומית: {dcDailyElectricityCost.toFixed(2)} ₪ (במקום {(totalDcKwh * GRID_COST_PER_KWH).toFixed(2)} ₪)</span>
                        <span>חיסכון: +{dcDailySavingsVsGrid.toFixed(2)} ₪/יום</span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                    <span>רווח יומי מ-DC ({dcCars} רכבים):</span>
                    <span className="font-bold text-amber-300 font-mono text-sm">
                      {dcDailyProfit.toFixed(2)} ₪
                    </span>
                  </div>
                </div>

                {/* Slider 2: AC Overnight */}
                <div className="p-6 sm:p-7 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-base">עמדות AC לילה — צימרים</h4>
                        <span className="text-xs text-slate-400">
                          ממוצע 35 קוט"ש לרכב ({totalAcKwh} קוט"ש) | מכירה ב-1.30 ₪/קוט"ש (מתוך 70 צימרים)
                        </span>
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <span className="text-2xl font-black text-indigo-400">{acCars}</span>
                      <span className="text-xs text-slate-400 font-sans mr-1">רכבים/לילה</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="1"
                    value={acCars}
                    onChange={(e) => setAcCars(parseInt(e.target.value))}
                    className="w-full slider-indigo h-2 rounded-lg"
                  />

                  <div className="flex justify-between items-center text-xs text-slate-500 mt-2 font-mono">
                    <span>0 רכבים</span>
                    <span>4 רכבים</span>
                    <span>8 רכבים (תפוסת לילה מלאה)</span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
                    <span>רווח יומי מ-AC (טעינת לילה רגועה):</span>
                    <span className="font-bold text-indigo-300 font-mono text-sm">
                      {acDailyProfit.toFixed(2)} ₪
                    </span>
                  </div>
                </div>

              </div>

              {/* Right Column: Live Output Cards (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Payback & Monthly Net Highlight Card */}
                <div className={`p-7 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 shadow-2xl relative overflow-hidden transition-all ${
                  isSolar ? 'border-amber-500/50 shadow-amber-500/10' : 'border-emerald-500/40 shadow-emerald-500/10'
                }`}>
                  <div className={`absolute top-0 left-0 w-40 h-40 rounded-full blur-3xl pointer-events-none ${
                    isSolar ? 'bg-amber-500/15' : 'bg-emerald-500/10'
                  }`} />

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      החזר השקעה משוער (CapEx: {CAPEX.toLocaleString('he-IL')} ₪)
                    </span>
                    <span className={`px-2.5 py-1 rounded-full font-black text-xs ${
                      isSolar ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {isSolar ? 'ROI סולארי מורחב' : 'ROI מהיר'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 mb-6">
                    <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${
                      isSolar ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {paybackMonths > 0 ? paybackMonths.toFixed(1) : '—'}
                    </span>
                    <span className="text-lg font-bold text-slate-300">חודשים!</span>
                  </div>

                  {/* 3 Metric Rows */}
                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-slate-300">רווח תפעולי חודשי נטו:</span>
                      <span className="text-xl font-black text-white font-mono">
                        {monthlyNetProfit.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-slate-300">רווח שנתי מצטבר נטו:</span>
                      <span className={`text-xl font-black font-mono ${
                        isSolar ? 'text-amber-300' : 'text-emerald-300'
                      }`}>
                        {annualNetProfit.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs sm:text-sm text-slate-400">תשואה שנתית על ההון (CapEx ROI):</span>
                      <span className="text-sm font-bold text-cyan-400 font-mono">
                        {annualRoiPercentage.toFixed(1)}% בשנה
                      </span>
                    </div>
                  </div>

                  {/* Extra Solar Boost Callout */}
                  {isSolar && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
                      ★ <strong>תוספת רווח נטו:</strong> +1,155 ₪ לחודש (+13,860 ₪ לשנה) הודות לייצור סולארי עצמי מהגג.
                    </div>
                  )}

                  {/* Profit Flow Visual Bar */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80">
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
                      <span>חלוקת רווח שוטפת</span>
                      <span>תזרים נקי: {(dailyNetProfit).toFixed(0)} ₪ ליום</span>
                    </div>
                    <div className="w-full h-3 rounded-full bg-slate-800 flex overflow-hidden">
                      <div
                        className="bg-amber-500 h-full transition-all duration-300"
                        style={{
                          width: `${((dcDailyProfit) / (dailyNetProfit || 1)) * 100}%`
                        }}
                        title="רווחי DC יום"
                      />
                      <div
                        className="bg-indigo-500 h-full transition-all duration-300"
                        style={{
                          width: `${((acDailyProfit) / (dailyNetProfit || 1)) * 100}%`
                        }}
                        title="רווחי AC לילה"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                      <span className="text-amber-400 font-bold">● עמדת DC ({(((dcDailyProfit) / (dailyNetProfit || 1)) * 100).toFixed(0)}%)</span>
                      <span className="text-indigo-400 font-bold">● עמדות AC ({(((acDailyProfit) / (dailyNetProfit || 1)) * 100).toFixed(0)}%)</span>
                    </div>
                  </div>

                </div>

                {/* Transparent Formulas Accordion */}
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden">
                  <button
                    onClick={() => setShowFormulaDetails(!showFormulaDetails)}
                    className="w-full p-4 flex items-center justify-between text-right text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                      <span>שקיפות מלאה: פירוט הנוסחאות במסלול {isSolar ? 'משולב סולארי' : 'רשת בלבד'}</span>
                    </span>
                    {showFormulaDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showFormulaDetails && (
                    <div className="p-4 pt-0 text-xs text-slate-300 space-y-2.5 border-t border-slate-800/60 bg-slate-950/40">
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">תעריף חשמל תעו"ז בסיסי:</span>
                        <span className="font-mono text-white">0.55 ₪ לקוט"ש</span>
                      </div>

                      {isSolar ? (
                        <>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400">ייצור סולארי יומי (15kWp):</span>
                            <span className="font-mono text-amber-300 font-bold">70 קוט"ש בעלות 0.00 ₪</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400">רווח DC (סולארי + רשת):</span>
                            <span className="font-mono text-amber-300">(70 קו"ש × 1.90) + (30 קו"ש × 1.35) = 173.50 ₪</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400">עלות הקמה כוללת (מתחם + סולארי):</span>
                            <span className="font-mono text-amber-400 font-bold">110,000 ₪ (58K + 52K)</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400">מכירה ב-DC (ממוצע 25 קוט"ש לרכב):</span>
                            <span className="font-mono text-amber-300">1.90 ₪ לקוט"ש (רווח 1.35 ₪ / ~33.75 ₪ לרכב)</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400">עלות הקמה כוללת (CapEx):</span>
                            <span className="font-mono text-emerald-400 font-bold">58,000 ₪</span>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-slate-400">מכירה ב-AC לילה (ממוצע 35 קוט"ש לרכב):</span>
                        <span className="font-mono text-indigo-300">1.30 ₪ לקוט"ש (רווח 0.75 ₪ / ~26.25 ₪ לרכב)</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>

          </div>
        </section>

        {/* ─── TECHNICAL ARCHITECTURE & DLM SECTION ─── */}
        <section id="dlm-tech" className="py-20 bg-slate-900/60 border-y border-slate-800 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mb-3">
                <Cpu className="w-3.5 h-3.5" />
                <span>The Engineering Secret</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
                מדוע בעל הקרקע חייב את פתרון התוכנה שלנו?
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">
                האילוץ המרכזי בשטח: המתחם ובית המגורים הצמוד חולקים חיבור קיים של <strong>3x63A</strong> בלבד. עמדות "טיפשות" מהמדף יקפיצו את הפיוז של הבית תוך דקות. הנה איך מנוע ה-DLM שלנו פותר זאת הרמטית:
              </p>
            </div>

            {/* DLM CT Engine Highlight Block */}
            <div className="p-8 sm:p-10 rounded-3xl bg-slate-950 border border-emerald-500/30 shadow-2xl mb-12 relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                
                <div className="lg:col-span-7 space-y-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Active CT Clamps Dynamic Load Balancing</span>
                  </div>

                  <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                    ויסות זרמים בזמן אמת עם עדיפות מוחלטת לבית המגורים
                  </h3>

                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                    במקום להשקיע <strong>40,000–60,000 ₪</strong> בהגדלת חיבור מול חח״י ולהמתין שנה שלמה, אנחנו מתקינים מדי זרם דיגיטליים (CT) על הלוח הראשי.
                  </p>

                  {/* Formula Box */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 font-mono text-xs sm:text-sm text-emerald-300 flex items-center justify-between">
                    <span>זרם פנוי לעמדות = 63A − צריכת בית (+ ייצור סולארי)</span>
                    <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                      דגימה בכל מילישנייה
                    </span>
                  </div>

                  <ul className="space-y-3 text-sm text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>אפס נפילות חשמל:</strong> כשהבית מפעיל תנור או מזגן, עמדות הטעינה מורידות זרם תוך חלקיק שנייה.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>טעינה סולארית חכמה:</strong> כשפאנלים על הגג מייצרים חשמל, הזרם מוזרק ישירות למכוניות בעלות אפסית.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>אפס תלות ב-WiFi ביתי:</strong> עמדת ה-DC כוללת מודם 4G LTE עצמאי עם סים תעשייתי.</span>
                    </li>
                  </ul>
                </div>

                {/* Right Visual Card: Real-time Live Panel Simulation */}
                <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/90 border border-slate-800 font-mono text-xs text-slate-300 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 font-sans">
                    <span className="font-bold text-white flex items-center gap-2">
                      <Server className="w-4 h-4 text-cyan-400" />
                      <span>סטטוס חיבור ראשי (3x63A)</span>
                    </span>
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      פעיל ומנוטר
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>עומס בית מגורים (עדיפות 1):</span>
                      <span className="text-white font-bold">18A / 63A</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="bg-amber-400 h-full w-[28%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>הקצאת זרם לעמדת DC (עדיפות 2):</span>
                      <span className="text-emerald-400 font-bold">38A (טעינה מהירה)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[60%]" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>מרווח ביטחון פנוי (Buffer):</span>
                      <span className="text-cyan-400 font-bold">7A</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="bg-cyan-500 h-full w-[12%]" />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-sans">
                    <span>פרוטוקול תקשורת: OCPP 1.6J/2.0.1</span>
                    <span className="text-emerald-400 font-bold">0% סיכון עומס יתר</span>
                  </div>
                </div>

              </div>

            </div>

            {/* 3 Tech Architecture Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
                  <Wifi className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">פרוטוקול פתוח OCPP 1.6J</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  עצמאות מלאה מחומרה בודדת. המערכת תומכת בכל יצרן עמדות מוביל, עם חיבור ענן ועדכוני קושחה שוטפים (OTA).
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                  <QrCode className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">סליקה באפס חיכוך (QR)</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  הנהג סורק QR ומשלם בתוך 5 שניות ב-Apple Pay או אשראי. ללא צורך בהורדת אפליקציה כבדה או הרשמה מסורבלת.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-4">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h4 className="text-lg font-bold text-white mb-2">דשבורד שקיפות 24/7</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  דשבורד חי ומאובטח המציג לבעל הקרקע ולשותפים את ההכנסות בכל שעה, צריכת החשמל המדויקת וחלוקת הרווחים.
                </p>
              </div>

            </div>

          </div>
        </section>

        {/* ─── ROLES & PARTNERSHIP BREAKDOWN ─── */}
        <section id="partnership" className="py-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold mb-3">
                <FileCheck className="w-3.5 h-3.5" />
                <span>חלוקת תפקידים ושותפות</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
                מבנה השותפות: שילוב מנצח של שטח, ביצוע ותוכנה
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">
                כל צד מתמקד בליבת המומחיות שלו. המשקיע נהנה מרווח פסיבי ללא עבודה שוטפת, קוסטה מספק את התשתית הפיזית, ואנחנו מספקים את המוח התוכנתי והסליקה.
              </p>
            </div>

            {/* 3 Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Partner 1: The Investor / Landowner */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border-2 border-emerald-500/40 relative flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-6 font-black text-lg">
                    01
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">המשקיע (בעל הקרקע)</h3>
                  <div className="text-xs font-bold text-emerald-400 mb-6">קרקע אסטרטגית + 100% CapEx (58,000 ₪)</div>

                  <ul className="space-y-3.5 text-sm text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                      <span><strong>העמדת השטח:</strong> הקצאת שטח החניה המרכזי במושב (סמוך לבית הקפה ולצימרים).</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                      <span><strong>מימון הקמה מופחת:</strong> העמדת 58,000 ₪ להקמת כל המתחם (כולל חומרה ועבודות).</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                      <span><strong>הכנסה פסיבית שוטפת:</strong> קבלת חלקו ברווחים ישירות לחשבון הבנק בכל 1 לחודש.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                      <span><strong>השבחת הנכס:</strong> הפיכת המגרש למוקד עניין ומשיכה מודרני המעלה את ערך המקום.</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-400">
                  אפס התעסקות טכנית או תפעולית שוטפת.
                </div>
              </div>

              {/* Partner 2: Kosta */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 relative flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-6 font-black text-lg">
                    02
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">קוסטה (ביצוע והנדסה)</h3>
                  <div className="text-xs font-bold text-amber-400 mb-6">תשתיות פיזיות, כבילה ובטיחות חשמל</div>

                  <ul className="space-y-3.5 text-sm text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                      <span><strong>עבודות עפר ופיתוח:</strong> חפירת תעלות תקניות, הנחת צנרת שרשורית ושילוט.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                      <span><strong>יציקות בטון:</strong> יציקת יסודות ועוגנים לעמדת ה-DC ולעמדות ה-AC.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                      <span><strong>לוח חשמל מנוהל:</strong> שילוב מפסקים, מגיני ברקים ומדדי זרם CT תקניים.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-1" />
                      <span><strong>רישוי ובדיקה:</strong> ליווי בודק חשמל מוסמך לקבלת אישור תקינות מלא.</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-400">
                  ביצוע הנדסי מוקפד בתקני הבטיחות המחמירים ביותר.
                </div>
              </div>

              {/* Partner 3: Systems & Software Architect */}
              <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 relative flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-6 font-black text-lg">
                    03
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">ארכיטקט מערכות ותוכנה</h3>
                  <div className="text-xs font-bold text-cyan-400 mb-6">אלגוריתם DLM, סליקה, ניטור ודוחות</div>

                  <ul className="space-y-3.5 text-sm text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-1" />
                      <span><strong>מוח ניהול העומסים:</strong> פיתוח וכיול אלגוריתם ה-DLM לשמירה על מגבלת ה-63A.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-1" />
                      <span><strong>תשתית ענן וסליקה:</strong> חיבור שרתי OCPP, סליקת Apple Pay והפקת חשבוניות אוטומטית.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-1" />
                      <span><strong>ניטור טלמטריה 24/7:</strong> זיהוי תקלות מרחוק, תחזוקה מונעת ועדכוני אבטחה.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-1" />
                      <span><strong>דשבורד שקיפות:</strong> דוח חודשי שקוף ומפורט עם חלוקת ההכנסות המדויקת.</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800 text-xs text-slate-400">
                  הערך הטכנולוגי שמאפשר למתחם לפעול בבטחה וברווחיות.
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ─── CLOUDFLARE DEPLOYMENT SECTION ─── */}
        <section id="cloudflare" className="py-20 bg-slate-900/40 border-t border-slate-800 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold mb-3">
                <Server className="w-3.5 h-3.5" />
                <span>DevOps & Production Deployment</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-4">
                הנחיות פריסה ב-Cloudflare Pages תחת סאב-דומיין
              </h2>
              <p className="text-slate-300 text-base sm:text-lg">
                האתר נבנה כ-Static / JAMstack קליל עם אינטראקטיביות צד-לקוח מלאה. להלן השלבים המדויקים להעלאתו לאוויר:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              
              {/* Step 1 */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-black text-emerald-400 mb-2 font-mono">שלב 1</div>
                <h4 className="font-bold text-white text-base mb-2">בנייה והעלאה עם Wrangler</h4>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  הפרויקט מוגדר עם סקריפט ייעודי המייצר את תיקיית <code>dist-volthub</code> ומעלה ישירות ל-Cloudflare Pages.
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-300 flex items-center justify-between">
                  <span>npm run deploy:volthub</span>
                  <button
                    onClick={() => copyToClipboard('npm run deploy:volthub', 'build')}
                    className="p-1 hover:text-white transition-colors"
                    title="העתק פקודה"
                  >
                    {copiedCmd === 'build' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-black text-cyan-400 mb-2 font-mono">שלב 2</div>
                <h4 className="font-bold text-white text-base mb-2">הגדרת רשומת CNAME ב-DNS</h4>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  באזור ה-DNS של הדומיין שלך ב-Cloudflare, הוסף רשומת CNAME עבור הסאב-דומיין המבוקש (למשל <code>ev</code>):
                </p>
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px]">
                  <div className="text-slate-400">Type: <span className="text-white">CNAME</span></div>
                  <div className="text-slate-400">Name: <span className="text-amber-300">ev</span></div>
                  <div className="text-slate-400">Target: <span className="text-cyan-300">volthub.pages.dev</span></div>
                  <div className="text-slate-400">Proxy: <span className="text-emerald-400">Proxied (Orange Cloud ☁️)</span></div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-black text-indigo-400 mb-2 font-mono">שלב 3</div>
                <h4 className="font-bold text-white text-base mb-2">אימות תעודת SSL/TLS</h4>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  בממשק Pages &rarr; Custom Domains, הוסף את <code>ev.yourdomain.com</code>. Cloudflare ינפיק אוטומטית תעודת SSL מאובטחת.
                </p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300">
                  <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SSL/TLS Mode: Full (Strict)</span>
                  </div>
                  <span className="text-slate-400 text-[10px]">הצפנה מלאה מקצה לקצה וטעינה מהירה מ-Edge בישראל</span>
                </div>
              </div>

            </div>

          </div>
        </section>

      </main>

      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-950 border-t border-slate-800/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Zap className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">VoltHub Smart CPO</span>
              <span className="text-xs text-slate-500 block">הצעת השקעה ומתחם טעינה חכם לרכב חשמלי</span>
            </div>
          </div>

          <div className="text-xs text-slate-400 text-center sm:text-left">
            © {new Date().getFullYear()} VoltHub Infrastructure & Software. כל הזכויות שמורות.
          </div>
        </div>
      </footer>

    </div>
  );
}
