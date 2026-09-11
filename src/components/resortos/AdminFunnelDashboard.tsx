import React, { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  Download,
  ExternalLink,
  MessageCircle,
  Eye,
  EyeOff,
  Sparkles,
  Clock,
  Phone,
  ShieldCheck,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Send,
  XCircle,
  TrendingUp,
  SlidersHorizontal,
  Info,
  Building2,
  Check,
  KeyRound,
  Edit3,
  Save,
  X,
  User,
  MapPin,
  Globe
} from 'lucide-react';
import { ManagedProperty } from './HostPropertyEditor';

export interface AdminFunnelDashboardProps {
  properties: ManagedProperty[];
  onUpdateProperty: (updated: ManagedProperty) => void;
  onRefresh?: () => void;
  onOpenPreviewListing?: (slug: string) => void;
  onEditPropertyAsAdmin?: (propertyId: string) => void;
}

export const AdminFunnelDashboard: React.FC<AdminFunnelDashboardProps> = ({
  properties,
  onUpdateProperty,
  onRefresh,
  onOpenPreviewListing,
  onEditPropertyAsAdmin
}) => {
  // Filter States
  const [crmStatusFilter, setCrmStatusFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'hidden'>('all');
  const [hasWhatsAppFilter, setHasWhatsAppFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [firstTouchFilter, setFirstTouchFilter] = useState<'all' | 'touched' | 'untouched'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Selected Property for Reference Details Modal
  const [selectedPropertyForModal, setSelectedPropertyForModal] = useState<ManagedProperty | null>(null);

  // Selected Property for Business Details Edit Modal (Admin Editor)
  const [editingBusinessProperty, setEditingBusinessProperty] = useState<ManagedProperty | null>(null);
  const [businessFormData, setBusinessFormData] = useState<Partial<ManagedProperty>>({});

  const handleOpenEditBusinessModal = (prop: ManagedProperty) => {
    setEditingBusinessProperty(prop);
    setBusinessFormData({
      hebrew_name: prop.hebrew_name,
      name: prop.name,
      contact_name: prop.contact_name || '',
      phone: prop.phone || '',
      whatsapp_number: prop.whatsapp_number || '',
      slug: prop.slug || '',
      village: prop.village || '',
      region: prop.region || '',
      source_url: prop.source_url || '',
      crm_status: prop.crm_status || 'Lead_Identified',
      claimed_status: prop.claimed_status || 'unclaimed_seeded',
      is_public: Boolean(prop.is_public),
      admin_notes: prop.admin_notes || ''
    });
  };

  const handleSaveBusinessDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBusinessProperty) return;

    const newSlug = businessFormData.slug?.trim() || editingBusinessProperty.slug;
    const updated: ManagedProperty = {
      ...editingBusinessProperty,
      hebrew_name: businessFormData.hebrew_name?.trim() || editingBusinessProperty.hebrew_name,
      name: businessFormData.name?.trim() || editingBusinessProperty.name,
      contact_name: businessFormData.contact_name?.trim() || undefined,
      phone: businessFormData.phone?.trim() || editingBusinessProperty.phone,
      whatsapp_number: businessFormData.whatsapp_number?.trim() || editingBusinessProperty.whatsapp_number,
      slug: newSlug,
      village: businessFormData.village?.trim() || editingBusinessProperty.village,
      region: businessFormData.region?.trim() || editingBusinessProperty.region,
      source_url: businessFormData.source_url?.trim() || undefined,
      crm_status: businessFormData.crm_status as any,
      claimed_status: businessFormData.claimed_status as any,
      is_public: Boolean(businessFormData.is_public),
      admin_notes: businessFormData.admin_notes?.trim() || undefined,
      property_public_path: `/p/${newSlug || editingBusinessProperty.id}`
    };

    onUpdateProperty(updated);
    showToast(`פרטי העסק של "${updated.hebrew_name}" נשמרו בהצלחה! ✨`);
    setEditingBusinessProperty(null);
  };

  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Calculate KPI Metrics
  const kpis = useMemo(() => {
    const total = properties.length;
    let leadIdentified = 0;
    let touched = 0;
    let portalFreeActive = 0;
    let upsellPitchSent = 0;
    let verifiedSubscriber = 0;
    let optOut = 0;
    let publicCount = 0;

    for (const p of properties) {
      const status = p.crm_status || 'Lead_Identified';
      if (status === 'Lead_Identified') leadIdentified++;
      if (status === 'Portal_Free_Active') portalFreeActive++;
      if (status === 'Upsell_Pitch_Sent') upsellPitchSent++;
      if (status === 'Verified_Subscriber') verifiedSubscriber++;
      if (status === 'Opt_Out') optOut++;

      if (p.first_touch_sent_at) touched++;
      if (p.is_public) publicCount++;
    }

    const touchedBase = Math.max(touched, 1);
    const freeBase = Math.max(portalFreeActive, 1);
    const upsellBase = Math.max(upsellPitchSent, 1);

    return {
      total,
      leadIdentified,
      touched,
      portalFreeActive,
      upsellPitchSent,
      verifiedSubscriber,
      optOut,
      publicCount,
      conversionTouchedToFree: Math.min(100, Math.round((portalFreeActive / touchedBase) * 100)),
      conversionFreeToUpsell: Math.min(100, Math.round((upsellPitchSent / freeBase) * 100)),
      conversionUpsellToVerified: Math.min(100, Math.round((verifiedSubscriber / upsellBase) * 100))
    };
  }, [properties]);

  // 2. Filter & Sort Properties
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const status = p.crm_status || 'Lead_Identified';
      if (crmStatusFilter !== 'all' && status !== crmStatusFilter) return false;
      if (regionFilter !== 'all' && !p.region.includes(regionFilter)) return false;

      if (visibilityFilter === 'public' && !p.is_public) return false;
      if (visibilityFilter === 'hidden' && p.is_public) return false;

      const hasPhone = Boolean(p.whatsapp_number && p.whatsapp_number.replace(/\D/g, '').length >= 9);
      if (hasWhatsAppFilter === 'yes' && !hasPhone) return false;
      if (hasWhatsAppFilter === 'no' && hasPhone) return false;

      if (firstTouchFilter === 'touched' && !p.first_touch_sent_at) return false;
      if (firstTouchFilter === 'untouched' && p.first_touch_sent_at) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = (p.hebrew_name || '').toLowerCase().includes(query) || (p.name || '').toLowerCase().includes(query);
        const matchesVillage = (p.village || '').toLowerCase().includes(query);
        const matchesPhone = (p.whatsapp_number || '').includes(query);
        const matchesDirectPhone = (p.phone || '').includes(query);
        const matchesContact = (p.contact_name || '').toLowerCase().includes(query);
        const matchesSlug = (p.slug || '').toLowerCase().includes(query);
        const matchesNotes = (p.admin_notes || '').toLowerCase().includes(query);
        if (!matchesName && !matchesVillage && !matchesPhone && !matchesDirectPhone && !matchesContact && !matchesSlug && !matchesNotes) return false;
      }

      return true;
    });
  }, [properties, crmStatusFilter, regionFilter, visibilityFilter, hasWhatsAppFilter, firstTouchFilter, searchTerm]);

  // 3. Paginated Slice
  const totalPages = Math.ceil(filteredProperties.length / pageSize) || 1;
  const paginatedProperties = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProperties.slice(start, start + pageSize);
  }, [filteredProperties, currentPage, pageSize]);

  // 4. Critical Feature #4: Click-to-Update WhatsApp Action with Spam Law Compliance Text
  const handleSendWhatsAppOutreach = (prop: ManagedProperty) => {
    const cleanPhone = (prop.whatsapp_number || '').replace(/\D/g, '');
    if (!cleanPhone) {
      alert('למתחם זה אין מספר וואטסאפ רשום');
      return;
    }

    const internationalPhone = cleanPhone.startsWith('972') ? cleanPhone : '972' + cleanPhone.replace(/^0/, '');
    const previewUrl = `https://dist-resortos.vercel.app/p/${prop.slug || prop.id}`;
    
    // High-converting, friendly, spam-law compliant outreach copy
    const text = `היי, כאן צוות ResortOS ✨
הקמנו עבור ${prop.hebrew_name} ב${prop.village} דף פרופיל דיגיטלי יוקרתי ללא עלות במאגר מתחמי הנופש החדש שלנו.

תוכלו לראות את התצוגה המקדימה שהכנו עבורכם בקישור:
${previewUrl}

כל מה שנותר הוא להעלות 2-3 תמונות יפות שלכם כדי שנפתח את הדף להזמנות ישירות מולכם ב-0% עמלה!
(להסרה ממאגר העדכונים השיבו 'הסר')`;

    const waUrl = `https://wa.me/${internationalPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Simultaneously update first_touch_sent_at and last_outbound_at
    const nowIso = new Date().toISOString();
    const updated: ManagedProperty = {
      ...prop,
      first_touch_sent_at: prop.first_touch_sent_at || nowIso,
      last_outbound_at: nowIso
    };

    onUpdateProperty(updated);
    showToast(`✓ נשלחה פנייה ל-${prop.hebrew_name}. תאריך פנייה עודכן במערכת!`);
  };

  // 5. Toggle Public Visibility
  const handleTogglePublic = (prop: ManagedProperty) => {
    const nextPublic = !prop.is_public;
    const updated: ManagedProperty = {
      ...prop,
      is_public: nextPublic
    };
    onUpdateProperty(updated);
    showToast(nextPublic ? `✓ המתחם ${prop.hebrew_name} פורסם כעת במרקטפלייס` : `✓ המתחם ${prop.hebrew_name} הוסתר מהמרקטפלייס`);
  };

  // 5b. Approve Draft (אישור טיוטה יחידני של רן)
  const handleApproveProperty = (prop: ManagedProperty) => {
    const updated: ManagedProperty = {
      ...prop,
      is_public: true,
      crm_status: prop.crm_status === 'Lead_Identified' ? 'Portal_Free_Active' : prop.crm_status
    };
    onUpdateProperty(updated);
    showToast(`✓ המתחם "${prop.hebrew_name || prop.name}" אושר ופורסם בהצלחה במרקטפלייס! 🎉`);
  };

  // 6. Quick Status Change
  const handleChangeCrmStatus = (prop: ManagedProperty, newStatus: ManagedProperty['crm_status']) => {
    const updated: ManagedProperty = {
      ...prop,
      crm_status: newStatus,
      opted_out_at: newStatus === 'Opt_Out' ? new Date().toISOString() : prop.opted_out_at,
      is_public: newStatus === 'Opt_Out' ? false : (newStatus === 'Portal_Free_Active' ? true : prop.is_public)
    };
    onUpdateProperty(updated);
    showToast(`סטטוס של ${prop.hebrew_name} עודכן ל-${newStatus}`);
  };

  // 7. CSV Export with UTF-8 BOM
  const handleExportCsv = () => {
    const headers = [
      'ID',
      'שם עברי',
      'שם אנגלי',
      'יישוב',
      'אזור',
      'וואטסאפ',
      'סטטוס CRM',
      'אימות בעלות OTP',
      'ציבורי (מאושר)',
      'קישור מקור גרידה Weekend',
      'תמונות ייחוס',
      'פנייה ראשונה',
      'מקור'
    ];

    const rows = filteredProperties.map((p) => [
      p.id,
      `"${(p.hebrew_name || '').replace(/"/g, '""')}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.village || '').replace(/"/g, '""')}"`,
      `"${(p.region || '').replace(/"/g, '""')}"`,
      `"${p.whatsapp_number || ''}"`,
      p.crm_status || 'Lead_Identified',
      p.claimed_status || 'unclaimed_seeded',
      p.is_public ? 'מאושר' : 'טיוטה',
      `"${p.source_url || ''}"`,
      p.reference_image_urls?.length || 0,
      p.first_touch_sent_at ? new Date(p.first_touch_sent_at).toLocaleDateString('he-IL') : '',
      p.source || 'weekend_scrape'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `resortos_crm_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fadeIn text-[#26130F]" dir="rtl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#26130F] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-[#C5A880]/30 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-xs sm:text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
              ResortOS CRM & Lead Engine
            </span>
            <span className="text-xs font-semibold text-stone-500">
              ~600 מתחמי נופש מנוטרים
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#26130F] mt-1">פאנל המרות וגיוס מארחים (CRM Funnel)</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            ניהול לידים מ-Weekend, מעקב פניות וואטסאפ, אישורי כרטיס חינמי והמרות למנויי ₪99.
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition"
              title="רענן נתונים"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl border border-stone-200 shadow-sm transition flex items-center justify-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-stone-500" />
            <span>ייצוא CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Total */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
          <span className="text-[11px] font-bold text-stone-500 block">סה״כ במאגר</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-[#26130F]">{kpis.total}</span>
            <span className="text-[10px] text-stone-400">לידים</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold block mt-1">
            {kpis.publicCount} ציבוריים כרגע
          </span>
        </div>

        {/* 2. Lead Identified */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
          <span className="text-[11px] font-bold text-stone-500 block">זוהו במאגר (טיוטה)</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-stone-700">{kpis.leadIdentified}</span>
          </div>
          <span className="text-[10px] text-stone-400 block mt-1">ממתינים לפנייה</span>
        </div>

        {/* 3. Touched */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
          <span className="text-[11px] font-bold text-sky-700 block">נשלחה פנייה (Touched)</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-sky-900">{kpis.touched}</span>
          </div>
          <span className="text-[10px] text-sky-600 block mt-1">הודעת וואטסאפ</span>
        </div>

        {/* 4. Portal Free Active */}
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 shadow-sm">
          <span className="text-[11px] font-bold text-amber-900 block">אישור כרטיס חינם</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-amber-950">{kpis.portalFreeActive}</span>
          </div>
          <span className="text-[10px] text-amber-700 block mt-1">פעילים במרקטפלייס</span>
        </div>

        {/* 5. Upsell Pitch Sent */}
        <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 shadow-sm">
          <span className="text-[11px] font-bold text-purple-900 block">נשלח פיץ׳ ₪99</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-purple-950">{kpis.upsellPitchSent}</span>
          </div>
          <span className="text-[10px] text-purple-700 block mt-1">בהצעת שדרוג</span>
        </div>

        {/* 6. Verified Subscriber */}
        <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-300 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-900 block">⭐ מנוי משלם ₪99</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-emerald-950">{kpis.verifiedSubscriber}</span>
          </div>
          <span className="text-[10px] text-emerald-700 block mt-1">ResortOS Prime</span>
        </div>

        {/* 7. Opt Out */}
        <div className="bg-rose-50/60 p-4 rounded-2xl border border-rose-200 shadow-sm">
          <span className="text-[11px] font-bold text-rose-800 block">הסרה (Opt-Out)</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-rose-900">{kpis.optOut}</span>
          </div>
          <span className="text-[10px] text-rose-600 block mt-1">חסומים לפנייה</span>
        </div>
      </div>

      {/* Conversion Funnel Progression Bar */}
      <div className="bg-[#26130F] text-white p-5 rounded-3xl shadow-md border border-stone-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#C5A880]/20 flex items-center justify-center text-[#C5A880]">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white">יחסי המרה במשפך השיווקי</h3>
            <span className="text-xs text-stone-400">אחוזי הצלחה לפי שלבי הגיוס של קלואי ורן</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 w-full md:w-auto text-center">
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-[10px] text-stone-300 block">פנייה ➔ כרטיס חינם</span>
            <span className="text-lg font-black text-[#C5A880]">{kpis.conversionTouchedToFree}%</span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-[10px] text-stone-300 block">חינם ➔ פיץ׳ ₪99</span>
            <span className="text-lg font-black text-purple-300">{kpis.conversionFreeToUpsell}%</span>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/5">
            <span className="text-[10px] text-stone-300 block">פיץ׳ ➔ מנוי משלם</span>
            <span className="text-lg font-black text-emerald-400">{kpis.conversionUpsellToVerified}%</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
        {/* Quick Filter Presets */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-stone-100">
          <span className="text-[11px] font-bold text-stone-500">סינון מהיר:</span>
          <button
            type="button"
            onClick={() => {
              setVisibilityFilter('all');
              setCrmStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
              visibilityFilter === 'all' && crmStatusFilter === 'all'
                ? 'bg-[#26130F] text-[#C5A880]'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            כל המתחמים ({properties.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setVisibilityFilter('hidden');
              setCrmStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              visibilityFilter === 'hidden'
                ? 'bg-amber-800 text-white shadow-sm'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>טיוטות ממתינות לאישור רן ({properties.filter((p) => !p.is_public).length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setVisibilityFilter('all');
              setCrmStatusFilter('all');
              setCurrentPage(1);
            }}
            className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>מאומתי OTP ({properties.filter((p) => p.claimed_status === 'claimed_verified').length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setVisibilityFilter('public');
              setCrmStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
              visibilityFilter === 'public'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>מאושרים ציבוריים ({kpis.publicCount})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="חיפוש לפי שם מתחם, יישוב או טלפון..."
              className="w-full pl-3 pr-9 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#C5A880] transition"
            />
          </div>

          {/* CRM Status Filter */}
          <div className="flex items-center gap-1">
            <select
              value={crmStatusFilter}
              onChange={(e) => {
                setCrmStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C5A880]"
            >
              <option value="all">כל הסטטוסים (CRM)</option>
              <option value="Lead_Identified">טיוטה במאגר (Lead_Identified)</option>
              <option value="Portal_Free_Active">אישור חינם (Portal_Free_Active)</option>
              <option value="Upsell_Pitch_Sent">נשלח פיץ׳ (Upsell_Pitch_Sent)</option>
              <option value="Verified_Subscriber">מנוי משלם (Verified_Subscriber)</option>
              <option value="Opt_Out">הסרה (Opt_Out)</option>
            </select>
          </div>

          {/* Region Filter */}
          <div className="flex items-center gap-1">
            <select
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C5A880]"
            >
              <option value="all">כל האזורים</option>
              <option value="גולן">רמת הגולן</option>
              <option value="כנרת">סובב כנרת ועמק הירדן</option>
              <option value="עליון">גליל עליון</option>
              <option value="תחתון">גליל תחתון</option>
              <option value="מערבי">גליל מערבי</option>
            </select>
          </div>

          {/* Visibility Filter */}
          <div className="flex items-center gap-1">
            <select
              value={visibilityFilter}
              onChange={(e) => {
                setVisibilityFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C5A880]"
            >
              <option value="all">נראות: הכל</option>
              <option value="public">ציבורי בלבד (Live)</option>
              <option value="hidden">מוסתר בלבד (Hidden)</option>
            </select>
          </div>

          {/* First Touch Filter */}
          <div className="flex items-center gap-1">
            <select
              value={firstTouchFilter}
              onChange={(e) => {
                setFirstTouchFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-[#C5A880]"
            >
              <option value="all">פנייה: הכל</option>
              <option value="touched">נשלחה פנייה</option>
              <option value="untouched">טרם נשלחה</option>
            </select>
          </div>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center justify-between text-xs text-stone-500 pt-1 border-t border-stone-100">
          <span>
            נמצאו <strong className="text-stone-800">{filteredProperties.length}</strong> מתחמים
            {filteredProperties.length !== properties.length && ` (מתוך ${properties.length} במאגר)`}
          </span>
          <div className="flex items-center gap-2">
            <span>הצג בעמוד:</span>
            {[25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  pageSize === size ? 'bg-[#26130F] text-[#C5A880]' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Properties Data Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold select-none">
                <th className="py-3 px-4">מתחם ויישוב</th>
                <th className="py-3 px-3">אזור</th>
                <th className="py-3 px-2 text-center">יח׳</th>
                <th className="py-3 px-3">WhatsApp</th>
                <th className="py-3 px-3">סטטוס CRM</th>
                <th className="py-3 px-2 text-center">אימות</th>
                <th className="py-3 px-2 text-center">ציבורי</th>
                <th className="py-3 px-3">First Touch</th>
                <th className="py-3 px-4 text-center">פעולות מהירות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedProperties.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-stone-400">
                    <Building2 className="w-8 h-8 mx-auto mb-2 text-stone-300" />
                    <span>לא נמצאו מתחמים התואמים את הסינון.</span>
                  </td>
                </tr>
              ) : (
                paginatedProperties.map((prop) => {
                  const status = prop.crm_status || 'Lead_Identified';
                  const isOptOut = status === 'Opt_Out';

                  return (
                    <tr
                      key={prop.id}
                      className={`hover:bg-stone-50/70 transition-colors ${
                        isOptOut ? 'bg-rose-50/30 opacity-70' : ''
                      }`}
                    >
                      {/* 1. Name & Village + Scraped Weekend Source Link */}
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-[#26130F] flex items-center gap-1.5">
                          <span>{prop.hebrew_name || prop.name}</span>
                          {prop.reference_image_urls && prop.reference_image_urls.length > 0 && (
                            <span
                              onClick={() => setSelectedPropertyForModal(prop)}
                              className="cursor-pointer text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-600 px-1.5 py-0.2 rounded font-normal border border-stone-200"
                              title={`${prop.reference_image_urls.length} תמונות ייחוס מוגנות`}
                            >
                              📸 {prop.reference_image_urls.length}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-1">
                          <span>{prop.village}</span>
                          {prop.name && prop.name !== prop.hebrew_name && (
                            <span className="text-[10px] text-stone-400 hidden sm:inline">({prop.name})</span>
                          )}
                        </div>

                        {/* Contact Person Name */}
                        {prop.contact_name && (
                          <div className="text-[11px] text-amber-900 font-semibold flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3 text-amber-700 shrink-0" />
                            <span>איש קשר: <strong>{prop.contact_name}</strong></span>
                          </div>
                        )}

                        {/* Admin Notes Preview */}
                        {prop.admin_notes && (
                          <div className="text-[10px] text-stone-600 bg-amber-50/70 border border-amber-200/80 px-1.5 py-0.5 rounded mt-0.5 inline-block truncate max-w-[200px]" title={prop.admin_notes}>
                            📝 {prop.admin_notes}
                          </div>
                        )}

                        {/* Direct Scraped Source Link */}
                        {prop.source_url ? (
                          <div className="mt-1">
                            <a
                              href={prop.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 px-2 py-0.5 rounded-md transition shadow-xs group"
                              title={`פתיחת עמוד המקור ב-Weekend בחלון חדש: ${prop.source_url}`}
                            >
                              <ExternalLink className="w-3 h-3 text-sky-600 group-hover:scale-110 transition-transform shrink-0" />
                              <span>מקור Weekend 🔗</span>
                            </a>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-400 mt-0.5 block">ללא מקור חיצוני</span>
                        )}
                      </td>

                      {/* 2. Region */}
                      <td className="py-3 px-3">
                        <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-medium">
                          {prop.region}
                        </span>
                      </td>

                      {/* 3. Units Count */}
                      <td className="py-3 px-2 text-center font-bold text-stone-700">
                        {prop.units?.length || 1}
                      </td>

                      {/* 4. WhatsApp Number & Direct Phone */}
                      <td className="py-3 px-3">
                        {prop.whatsapp_number ? (
                          <span className="font-mono text-[11px] text-stone-700 dir-ltr text-right inline-block">
                            {prop.whatsapp_number}
                          </span>
                        ) : (
                          <span className="text-stone-300 text-[11px]">—</span>
                        )}
                        {prop.phone && prop.phone !== prop.whatsapp_number && (
                          <div className="text-[10px] text-stone-400 font-mono dir-ltr text-right mt-0.5">
                            📞 {prop.phone}
                          </div>
                        )}
                      </td>

                      {/* 5. CRM Status Dropdown */}
                      <td className="py-3 px-3">
                        <select
                          value={status}
                          onChange={(e) => handleChangeCrmStatus(prop, e.target.value as any)}
                          className={`text-[11px] font-bold px-2 py-1 rounded-lg border focus:outline-none transition ${
                            status === 'Verified_Subscriber'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                              : status === 'Upsell_Pitch_Sent'
                              ? 'bg-purple-50 text-purple-900 border-purple-200'
                              : status === 'Portal_Free_Active'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : status === 'Opt_Out'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : 'bg-stone-50 text-stone-700 border-stone-200'
                          }`}
                        >
                          <option value="Lead_Identified">טיוטה (Lead_Identified)</option>
                          <option value="Portal_Free_Active">אישור חינם (Portal_Free_Active)</option>
                          <option value="Upsell_Pitch_Sent">פיץ׳ ₪99 (Upsell_Pitch_Sent)</option>
                          <option value="Verified_Subscriber">⭐ מנוי משלם (Verified)</option>
                          <option value="Opt_Out">❌ הסרה (Opt_Out)</option>
                        </select>
                      </td>

                      {/* 6. Claim / OTP Verification Status Badge */}
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                            prop.claimed_status === 'claimed_verified'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : prop.claimed_status === 'claim_pending'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-stone-100 text-stone-500 border border-stone-200'
                          }`}
                        >
                          {prop.claimed_status === 'claimed_verified' ? (
                            <>
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>אומת ב-OTP</span>
                            </>
                          ) : (
                            <>
                              <KeyRound className="w-3 h-3 text-stone-400" />
                              <span>ממתין ל-OTP</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* 7. Public Visibility Switch */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleTogglePublic(prop)}
                          className={`p-1.5 rounded-lg border transition ${
                            prop.is_public
                              ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                              : 'bg-stone-100 text-stone-400 border-stone-200 hover:text-stone-700'
                          }`}
                          title={prop.is_public ? 'מתחם ציבורי במרקטפלייס (לחץ להסתרה)' : 'מתחם מוסתר (לחץ לפרסום)'}
                        >
                          {prop.is_public ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                      </td>

                      {/* 8. First Touch Timestamp */}
                      <td className="py-3 px-3 text-[11px]">
                        {prop.first_touch_sent_at ? (
                          <div className="flex items-center gap-1 text-sky-800">
                            <Check className="w-3 h-3 text-sky-600 shrink-0" />
                            <span>{new Date(prop.first_touch_sent_at).toLocaleDateString('he-IL')}</span>
                          </div>
                        ) : (
                          <span className="text-stone-400">טרם נשלחה</span>
                        )}
                      </td>

                      {/* 9. Quick Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 1-Click WhatsApp Button (Click-to-Update Feature #4) */}
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppOutreach(prop)}
                            disabled={isOptOut || !prop.whatsapp_number}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-sm transition ${
                              isOptOut || !prop.whatsapp_number
                                ? 'bg-stone-100 text-stone-300 cursor-not-allowed'
                                : 'bg-[#25D366] hover:bg-[#20bd5a] text-white active:scale-95'
                            }`}
                            title="פתיחת וואטסאפ עם נוסח מותאם + רישום פנייה אוטומטי"
                          >
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden xl:inline">וואטסאפ</span>
                          </button>

                          {/* 1-Click Approve Draft Button for Ran (אשר טיוטה לפרסום) */}
                          {!prop.is_public ? (
                            <button
                              type="button"
                              onClick={() => handleApproveProperty(prop)}
                              className="px-2.5 py-1.5 rounded-lg font-bold text-[11px] flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition active:scale-95"
                              title="אישור טיוטה ופרסום מיידי במרקטפלייס האורחים"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>אשר טיוטה</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 hidden xl:inline">
                              מאושר ✓
                            </span>
                          )}

                          {/* Direct Weekend Source Link Button */}
                          {prop.source_url && (
                            <a
                              href={prop.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-700 transition"
                              title={`פתיחת עמוד המקור ב-Weekend בחלון חדש: ${prop.source_url}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          {/* Preview Link */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onOpenPreviewListing) {
                                onOpenPreviewListing(prop.slug || prop.id);
                              } else {
                                window.open(`/p/${prop.slug || prop.id}`, '_blank');
                              }
                            }}
                            className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition"
                            title="תצוגה מקדימה של הכרטיס"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Admin Edit Business Details Modal Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditBusinessModal(prop)}
                            className="p-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 transition shadow-2xs"
                            title="עריכת פרטי עסק כ-Admin (טלפונים, שם, איש קשר, סלאג, הערות)"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-800" />
                          </button>

                          {/* Admin Direct Editor Access (Bypass OTP for Ran) */}
                          {onEditPropertyAsAdmin && (
                            <button
                              type="button"
                              onClick={() => onEditPropertyAsAdmin(prop.id)}
                              className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition"
                              title="עריכת מתחם זה כ-Admin (ללא צורך ב-OTP של המארח)"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Reference Info Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedPropertyForModal(prop)}
                            className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition"
                            title="צפה בפרטי ייחוס ומקור גרידה"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs">
          <span className="text-stone-500">
            עמוד <strong>{currentPage}</strong> מתוך <strong>{totalPages}</strong>
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-stone-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-stone-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reference Data Modal */}
      {selectedPropertyForModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-4 animate-scaleUp">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold bg-stone-100 text-stone-600 px-2 py-0.5 rounded uppercase">
                  פרטי ייחוס פנימיים (מוגן מזכויות יוצרים)
                </span>
                <h3 className="text-lg font-bold text-[#26130F] mt-1">
                  {selectedPropertyForModal.hebrew_name} ({selectedPropertyForModal.village})
                </h3>
              </div>
              <button
                onClick={() => setSelectedPropertyForModal(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            {/* Copyright Protection Warning */}
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-amber-900 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>הגנת זכויות יוצרים מוחלטת:</strong> תמונות הייחוס של Weekend מיועדות לאימות תפעולי פנימי של הצוות בלבד, ולעולם אינן מוגשות לציבור או ל-API האורחים.
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                <span className="text-stone-400 block text-[10px]">מקור גרידה:</span>
                <span className="font-semibold text-stone-800">{selectedPropertyForModal.source || 'weekend_scrape'}</span>
                {selectedPropertyForModal.source_url && (
                  <a
                    href={selectedPropertyForModal.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sky-700 underline text-[11px] mt-1 break-all"
                  >
                    {selectedPropertyForModal.source_url}
                  </a>
                )}
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                <span className="text-stone-400 block text-[10px]">תמונות ייחוס פנימיות:</span>
                <span className="font-bold text-stone-800">
                  {selectedPropertyForModal.reference_image_urls?.length || 0} תמונות מקושרות פנימית
                </span>
                {selectedPropertyForModal.reference_image_urls && selectedPropertyForModal.reference_image_urls.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {selectedPropertyForModal.reference_image_urls.slice(0, 4).map((url, idx) => (
                      <div key={idx} className="relative aspect-video rounded-lg overflow-hidden border border-stone-300 bg-stone-200">
                        <img src={url} alt={`ייחוס ${idx + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white text-[8px] px-1 rounded">
                          פנימי
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200">
                <span className="text-stone-400 block text-[10px]">קישור ציבורי עתידי:</span>
                <span className="font-mono text-stone-700">
                  {selectedPropertyForModal.property_public_path || `/p/${selectedPropertyForModal.slug || selectedPropertyForModal.id}`}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => {
                  const target = selectedPropertyForModal;
                  setSelectedPropertyForModal(null);
                  handleOpenEditBusinessModal(target);
                }}
                className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-800" />
                <span>עריכת פרטי עסק כ-Admin</span>
              </button>

              <button
                onClick={() => setSelectedPropertyForModal(null)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Business Details Editor Modal */}
      {editingBusinessProperty && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-stone-200 my-8 animate-scaleUp text-right">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#26130F] to-[#3F2C29] text-[#C5A880] flex items-center justify-center shadow">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-[#26130F]">
                      עריכת פרטי עסק (Admin)
                    </h3>
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                      ניהול ישיר
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 font-bold">
                    {editingBusinessProperty.hebrew_name} · {editingBusinessProperty.village}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBusinessProperty(null)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveBusinessDetails} className="space-y-4 pt-4 text-right">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Hebrew Name */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    שם המתחם (עברית) *
                  </label>
                  <input
                    type="text"
                    required
                    value={businessFormData.hebrew_name || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, hebrew_name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="לדוגמה: בוסתן גסט רומס"
                  />
                </div>

                {/* English / Alternative Name */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    שם באנגלית / ייחוס
                  </label>
                  <input
                    type="text"
                    value={businessFormData.name || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="Bustan Guest Rooms"
                  />
                </div>

                {/* Contact Person Name */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-amber-700" />
                    <span>שם איש קשר / בעל המתחם</span>
                  </label>
                  <input
                    type="text"
                    value={businessFormData.contact_name || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, contact_name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="לדוגמה: משה כהן"
                  />
                </div>

                {/* Primary Phone */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-sky-700" />
                    <span>טלפון ראשי לשיחות ו-SMS</span>
                  </label>
                  <input
                    type="tel"
                    value={businessFormData.phone || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="054-807-6123 או 04-685-1234"
                  />
                </div>

                {/* WhatsApp Number */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                    <span>מספר WhatsApp לאימות OTP והודעות</span>
                  </label>
                  <input
                    type="tel"
                    value={businessFormData.whatsapp_number || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, whatsapp_number: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="972548076123 או 054-807-6123"
                  />
                  <span className="text-[10px] text-stone-400 mt-0.5 block">
                    מספר זה משמש לאימות OTP בווטסאפ (WATI)
                  </span>
                </div>

                {/* Slug for /p/:slug */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-[#8C6239]" />
                    <span>כתובת URL ייחודית (Slug)</span>
                  </label>
                  <input
                    type="text"
                    value={businessFormData.slug || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, slug: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="bustan-guest-rooms"
                  />
                  <span className="text-[10px] text-stone-400 mt-0.5 block">
                    קישור ציבורי: /p/{businessFormData.slug || 'slug'}
                  </span>
                </div>

                {/* Village */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-stone-500" />
                    <span>יישוב / מושב</span>
                  </label>
                  <input
                    type="text"
                    value={businessFormData.village || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, village: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="רמות, חד נס, נוב..."
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    אזור גיאוגרפי
                  </label>
                  <input
                    type="text"
                    value={businessFormData.region || ''}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, region: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                    placeholder="רמת הגולן, סובב כנרת, גליל עליון..."
                  />
                </div>

                {/* CRM Status */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    שלב במשפך CRM
                  </label>
                  <select
                    value={businessFormData.crm_status || 'Lead_Identified'}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, crm_status: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  >
                    <option value="Lead_Identified">טיוטה ראשונית (Lead_Identified)</option>
                    <option value="Portal_Free_Active">אישור חינם (Portal_Free_Active)</option>
                    <option value="Upsell_Pitch_Sent">פיץ׳ ₪99 (Upsell_Pitch_Sent)</option>
                    <option value="Verified_Subscriber">⭐ מנוי משלם (Verified)</option>
                    <option value="Opt_Out">❌ הסרה מרשימת תפוצה (Opt_Out)</option>
                  </select>
                </div>

                {/* Claim / OTP Status */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>סטטוס אימות בעלות OTP</span>
                  </label>
                  <select
                    value={businessFormData.claimed_status || 'unclaimed_seeded'}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, claimed_status: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-bold bg-white focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  >
                    <option value="unclaimed_seeded">טרם אומת (חייב אימות OTP בכניסה)</option>
                    <option value="claim_pending">ממתין להזנת OTP</option>
                    <option value="claimed_verified">✅ מאומת כבעל מתחם (OTP אושר)</option>
                  </select>
                  <span className="text-[10px] text-stone-400 mt-0.5 block">
                    שינוי ל״טרם אומת״ מחזיר את שער ה-OTP עבור בדיקות
                  </span>
                </div>
              </div>

              {/* Source URL */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  קישור דף מקור חיצוני (Weekend / אתר רשמי)
                </label>
                <input
                  type="url"
                  value={businessFormData.source_url || ''}
                  onChange={(e) => setBusinessFormData({ ...businessFormData, source_url: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300 text-xs font-mono focus:ring-2 focus:ring-[#C5A880] focus:outline-none"
                  placeholder="https://www.weekend.co.il/..."
                />
              </div>

              {/* Public Visibility Toggle */}
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-stone-800 block">
                    חשיפה ציבורית בקטלוג ResortOS
                  </span>
                  <span className="text-[11px] text-stone-500">
                    האם להציג את כרטיס המתחם לכל הגולשים באתר ללא קישור ישיר?
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(businessFormData.is_public)}
                    onChange={(e) => setBusinessFormData({ ...businessFormData, is_public: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Internal Admin Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  הערות פנימיות של מנהל (Admin Notes)
                </label>
                <textarea
                  rows={3}
                  value={businessFormData.admin_notes || ''}
                  onChange={(e) => setBusinessFormData({ ...businessFormData, admin_notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-stone-300 text-xs focus:ring-2 focus:ring-[#C5A880] focus:outline-none resize-none leading-relaxed"
                  placeholder="הערות לגבי שיחות עם הבעלים, בקשות מיוחדות, זמני התקשרות..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <a
                  href={`/p/${businessFormData.slug || editingBusinessProperty.slug || editingBusinessProperty.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#8C6239] hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>פתיחת כרטיס תצוגה מקדימה (/p/{businessFormData.slug || editingBusinessProperty.slug})</span>
                </a>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingBusinessProperty(null)}
                    className="px-4 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-bold transition"
                  >
                    ביטול
                  </button>

                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-[#C5A880] text-xs font-bold flex items-center gap-1.5 shadow transition active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>שמור שינויים</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
