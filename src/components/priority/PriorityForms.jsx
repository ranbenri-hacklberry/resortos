import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Briefcase,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Landmark,
  Layers,
  Maximize2,
  Printer,
  QrCode,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Wrench,
  X
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'כל הטפסים והמסמכים', icon: FolderOpen },
  { id: 'finance_banking', label: 'חשבונות בנק ועו״ש', icon: Landmark },
  { id: 'finance_loans', label: 'הלוואות ולוחות סילוקין', icon: Banknote },
  { id: 'finance_cpa', label: 'רואה חשבון ורווח/הפסד', icon: FileSpreadsheet },
  { id: 'finance_vat', label: 'דיווחי מע״מ 2026', icon: Receipt },
  { id: 'finance_corporate', label: 'תאגיד, בעלים ומשפטי', icon: Briefcase },
  { id: 'contracts', label: 'הסכמים וחוזים אישיים', icon: ShieldCheck },
  { id: 'procurement', label: 'רכש ומלאי ספקים', icon: Wrench },
  { id: 'qr', label: 'מדבקות ושלטי QR', icon: QrCode },
  { id: 'hospitality', label: 'תפעול אירוח וחדרים', icon: Building2 },
  { id: 'reports', label: 'דוחות תפעול וכספים חיים', icon: FileSpreadsheet },
  { id: 'word', label: 'עורך מסמכים חופשי', icon: FileText }
];

const AUTO_DL_KEY = 'hotelos.autoDownloadFiles';

// עזר להורדת קובץ אוטומטית למחשב (Downloads folder)
export async function triggerFileDownload(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || url.split('/').pop() || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (err) {
    // Fallback: ניווט ישיר להורדה
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return false;
  }
}

export default function PriorityForms({
  onOpenWord,
  onPrintDutyReport,
  onPrintCashReport,
  onPrintMorningReport
}) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');

  // הגדרה: האם להוריד אוטומטית קבצים חדשים למחשב
  const [autoDownload, setAutoDownload] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTO_DL_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleAutoDownload = () => {
    const next = !autoDownload;
    setAutoDownload(next);
    try {
      localStorage.setItem(AUTO_DL_KEY, String(next));
    } catch { /* ignore */ }
  };

  const items = useMemo(() => [
    // =========================================================================
    // 1. חשבונות בנק ועו״ש
    // =========================================================================
    {
      id: 'bank-beinleumi-os-3m',
      category: 'finance_banking',
      title: 'עובר ושב 3 חודשים - הבנק הבינלאומי',
      subtitle: 'חשבון מיאליס ריזורט בע״מ · הבנק הבינלאומי',
      description: 'דוח תנועות עו״ש רשמי ומפורט של 3 חודשים מרוכזים, תקבולים, העברות בנקאיות והוצאות שוטפות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'blue',
      url: '/finance/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%A2%D7%95%D7%91%D7%A8%20%D7%95%D7%A9%D7%91%203%20%D7%97%D7%95%D7%93%D7%A9%D7%99%D7%9D%20%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99.pdf',
      downloadName: 'עובר_ושב_3_חודשים_הבנק_הבינלאומי_מיאליס.pdf',
      isHtml: false,
      isPdf: true,
      updatedAt: '2026',
      parties: 'הבנק הבינלאומי · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-beinleumi-tx-3m',
      category: 'finance_banking',
      title: 'תנועות חשבון 3 חודשים - הבנק הבינלאומי',
      subtitle: 'פירוט תנועות חשבון מלא',
      description: 'פירוט מלא של פעילות החשבון העסקי, חיובים, זיכויים ויתרות סגירה יומיות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'blue',
      url: '/finance/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%AA%D7%A0%D7%95%D7%A2%D7%95%D7%AA%20%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%203%20%D7%97%D7%95%D7%93%D7%A9%D7%99%D7%9D.pdf',
      downloadName: 'תנועות_בינלאומי_מיאליס_3_חודשים.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'הבנק הבינלאומי · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-beinleumi-balances-june',
      category: 'finance_banking',
      title: 'ריכוז יתרות יוני - הבנק הבינלאומי',
      subtitle: 'אישור יתרות ופיקדונות תקופתי',
      description: 'ריכוז יתרות חודשי רשמי מהבנק הבינלאומי עבור חודש יוני 2026, פיקדונות ויתרות זכות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'blue',
      url: '/finance/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%A8%D7%99%D7%9B%D7%95%D7%96%20%D7%99%D7%AA%D7%A8%D7%95%D7%AA%20%D7%99%D7%95%D7%A0%D7%99%20%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99.pdf',
      downloadName: 'ריכוז_יתרות_יוני_הבנק_הבינלאומי.pdf',
      isPdf: true,
      updatedAt: 'יוני 2026',
      parties: 'הבנק הבינלאומי',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-beinleumi-valuation',
      category: 'finance_banking',
      title: 'שערוך כללי - הבנק הבינלאומי',
      subtitle: 'שערוך נכסים, תיקים וערבויות',
      description: 'דוח שערוך כללי אינטראקטיבי של תיק הלקוח, פקדונות וביטחונות בבנק הבינלאומי.',
      formatBadge: 'HTML דוח',
      tagColor: 'blue',
      url: '/finance/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%A9%D7%A2%D7%A8%D7%95%D7%9A%20%D7%9B%D7%9C%D7%9C%D7%99%20%D7%91%D7%99%D7%A0%D7%9C%D7%95%D7%90%D7%9E%D7%99.html',
      downloadName: 'שערוך_כללי_הבנק_הבינלאומי.html',
      isHtml: true,
      updatedAt: '2026',
      parties: 'הבנק הבינלאומי',
      sheetPreviewType: 'table'
    },
    {
      id: 'bank-discount-balances',
      category: 'finance_banking',
      title: 'אישור יתרות - בנק דיסקונט',
      subtitle: 'אישור יתרות רשמי לחשבון מיאליס ריזורט',
      description: 'אישור יתרות רשמי מבנק דיסקונט לידי רואה חשבון / גופים פיננסיים, יתרות זכות והתחייבויות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'emerald',
      url: '/finance/%D7%93%D7%99%D7%A1%D7%A7%D7%95%D7%A0%D7%98/%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%99%D7%AA%D7%A8%D7%95%D7%AA%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%20%D7%93%D7%99%D7%A1%D7%A7%D7%95%D7%A0%D7%98.pdf',
      downloadName: 'אישור_יתרות_בנק_דיסקונט_מיאליס.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק דיסקונט · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-discount-tx-3m',
      category: 'finance_banking',
      title: 'תנועות חשבון 3 חודשים - בנק דיסקונט',
      subtitle: 'תדפיס עו״ש רשמי של בנק דיסקונט',
      description: 'דוח תנועות מלא לתקופה של שלושה חודשים, פירוט זיכויים מפעולות סליקה והעברות ספקים.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'emerald',
      url: '/finance/%D7%93%D7%99%D7%A1%D7%A7%D7%95%D7%A0%D7%98/%D7%AA%D7%A0%D7%95%D7%A2%D7%95%D7%AA%20%D7%93%D7%A1%D7%A7%D7%95%D7%A0%D7%98%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%203%20%D7%97%D7%95%D7%93%D7%A9%D7%99%D7%9D.pdf',
      downloadName: 'תנועות_בנק_דיסקונט_מיאליס_3_חודשים.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק דיסקונט · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-mizrahi-account',
      category: 'finance_banking',
      title: 'מסמך חשבון - בנק מזרחי טפחות',
      subtitle: 'דוח חשבון מיאליס ריזורט במזרחי טפחות',
      description: 'מסמך ריכוז נתוני חשבון בנקאי, פרטי סניף, מסגרות אשראי והתקשרויות שוטפות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%98%D7%A4%D7%97%D7%95%D7%AA/%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%98%D7%A4%D7%97%D7%95%D7%AA%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1.pdf',
      downloadName: 'בנק_מזרחי_טפחות_מיאליס.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק מזרחי טפחות · מיאליס',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-mizrahi-tx-3m',
      category: 'finance_banking',
      title: 'תנועות 3 חודשים - בנק מזרחי טפחות',
      subtitle: 'תדפיס עו״ש רשמי של בנק מזרחי טפחות',
      description: 'דוח תנועות חשבון עו״ש מפורט ל-3 חודשים, פירוט פעולות והתאמות בנקאיות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%98%D7%A4%D7%97%D7%95%D7%AA/%D7%AA%D7%A0%D7%95%D7%A2%D7%95%D7%AA%20%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%203%D7%97%D7%95%D7%93%D7%A9%D7%99%D7%9D.pdf',
      downloadName: 'תנועות_מזרחי_מיאליס_3_חודשים.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק מזרחי טפחות',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-mizrahi-balances-1',
      category: 'finance_banking',
      title: 'אישור יתרות (חלק 1) - בנק מזרחי טפחות',
      subtitle: 'אישור יתרות חשבון רשמי',
      description: 'אישור יתרות רשמי חתום ע״י בנק מזרחי טפחות, יתרות זכות והתחייבויות בחשבון.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%98%D7%A4%D7%97%D7%95%D7%AA/%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%99%D7%AA%D7%A8%D7%95%D7%AA%20%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%201.pdf',
      downloadName: 'אישור_יתרות_מזרחי_מיאליס_1.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק מזרחי טפחות',
      sheetPreviewType: 'report'
    },
    {
      id: 'bank-mizrahi-balances-2',
      category: 'finance_banking',
      title: 'אישור יתרות (חלק 2) - בנק מזרחי טפחות',
      subtitle: 'השלמת אישור יתרות ופיקדונות',
      description: 'המשך אישור יתרות רשמי, פיקדונות וריכוז התחייבויות בחשבון העסקי.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%98%D7%A4%D7%97%D7%95%D7%AA/%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%99%D7%AA%D7%A8%D7%95%D7%AA%20%D7%9E%D7%96%D7%A8%D7%97%D7%99%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%202.pdf',
      downloadName: 'אישור_יתרות_מזרחי_מיאליס_2.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק מזרחי טפחות',
      sheetPreviewType: 'report'
    },

    // =========================================================================
    // 2. הלוואות ולוחות סילוקין
    // =========================================================================
    {
      id: 'loan-schedule-428k',
      category: 'finance_loans',
      title: 'לוח סילוקין - מיאליס ריזורט (428,320 ש״ח)',
      subtitle: 'לוח סילוקין מלא לתקופת ההלוואה',
      description: 'לוח סילוקין רשמי ומפורט על סך 428,320 ש״ח: פירוט קרן, ריבית, הצמדה, תאריכי פירעון ויתרות לסוף תקופה.',
      formatBadge: 'לוח סילוקין PDF',
      tagColor: 'purple',
      url: '/finance/%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA/%D7%9C%D7%95%D7%97%20%D7%A1%D7%99%D7%9C%D7%95%D7%A7%D7%99%D7%9F%20-%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%20%D7%A8%D7%99%D7%96%D7%95%D7%A8%D7%98%20428%2C320.pdf',
      downloadName: 'לוח_סילוקין_מיאליס_ריזורט_428320.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'מיאליס ריזורט · מימון',
      sheetPreviewType: 'table'
    },
    {
      id: 'loan-btb-balance',
      category: 'finance_loans',
      title: 'אישור יתרות הלוואה - BTB (מעודכן ל-20.10.2026)',
      subtitle: 'אישור יתרות רשמי מקרן BTB',
      description: 'אישור יתרות חוב עדכני ליום 20.10.2026 מקרן BTB עבור הלוואת העסק, קרן לסילוק ושיעורי ריבית.',
      formatBadge: 'אישור BTB PDF',
      tagColor: 'purple',
      url: '/finance/%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA/BTB%20%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%99%D7%AA%D7%A8%D7%95%D7%AA%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%94%2020.10.2026.pdf',
      downloadName: 'BTB_אישור_יתרות_הלוואה_20.10.2026.pdf',
      isPdf: true,
      updatedAt: '20.10.2026',
      parties: 'BTB · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'loan-btb-payments',
      category: 'finance_loans',
      title: 'פירוט תשלומים בהלוואה - BTB (20.10.2026)',
      subtitle: 'דוח פירעונות והיסטוריית תשלומים',
      description: 'פירוט כל התשלומים ששולמו עד כה בהלוואת BTB, חלוקת תשלומים קרן/ריבית, ויתרת לוח התשלומים העתידי.',
      formatBadge: 'דוח תשלומים PDF',
      tagColor: 'purple',
      url: '/finance/%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA/BTB%20%D7%A4%D7%99%D7%A8%D7%95%D7%98%20%D7%AA%D7%A9%D7%9C%D7%95%D7%9E%D7%99%D7%9D%20%D7%91%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%94%2020.10.2026.pdf',
      downloadName: 'BTB_פירוט_תשלומים_בהלוואה_20.10.2026.pdf',
      isPdf: true,
      updatedAt: '20.10.2026',
      parties: 'BTB ישראל',
      sheetPreviewType: 'table'
    },
    {
      id: 'loan-discount-details',
      category: 'finance_loans',
      title: 'פירוט הלוואת דיסקונט',
      subtitle: 'דוח תנאי הלוואה מבנק דיסקונט',
      description: 'דוח רשמי המפרט את תנאי ההלוואה העסקית בבנק דיסקונט: תקופה, מסלול ריבית, תשלום חודשי וביטחונות.',
      formatBadge: 'PDF בנקאי',
      tagColor: 'emerald',
      url: '/finance/%D7%93%D7%99%D7%A1%D7%A7%D7%95%D7%A0%D7%98/%D7%A4%D7%99%D7%A8%D7%95%D7%98%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%AA%20%D7%93%D7%99%D7%A1%D7%A7%D7%95%D7%A0%D7%98.pdf',
      downloadName: 'פירוט_הלוואת_דיסקונט_מיאליס.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'בנק דיסקונט',
      sheetPreviewType: 'report'
    },
    {
      id: 'loan-beinleumi-details',
      category: 'finance_loans',
      title: 'פירוט הלוואות - הבנק הבינלאומי',
      subtitle: 'מערך ההלוואות בבנק הבינלאומי',
      description: 'דוח מפורט של כל מסלולי ההלוואות, פירעונות חודשיים ושיעורי ריבית בבנק הבינלאומי.',
      formatBadge: 'HTML דוח',
      tagColor: 'blue',
      url: '/finance/%D7%91%D7%99%D7%A0%D7%9C%D7%90%D7%95%D7%9E%D7%99/%D7%A4%D7%99%D7%A8%D7%95%D7%98%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA%20%D7%91%D7%99%D7%A0%D7%9C%D7%95%D7%90%D7%9E%D7%99.html',
      downloadName: 'פירוט_הלוואות_הבנק_הבינלאומי.html',
      isHtml: true,
      updatedAt: '2026',
      parties: 'הבנק הבינלאומי',
      sheetPreviewType: 'table'
    },
    {
      id: 'loan-owners-protocol',
      category: 'finance_loans',
      title: 'פרוטוקול חברה - הלוואת בעלים',
      subtitle: 'אישור דירקטוריון להלוואת בעלים',
      description: 'מסמך פרוטוקול משפטי רשמי של חברת מיאליס ריזורט בע״מ לאישור תנאי הלוואת בעלים והעמדת מימון.',
      formatBadge: 'DOCX מסמך',
      tagColor: 'purple',
      url: '/finance/%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%95%D7%AA/%D7%A4%D7%A8%D7%95%D7%98%D7%95%D7%A7%D7%95%D7%9C%20%D7%97%D7%91%D7%A8%D7%94%20-%20%D7%94%D7%9C%D7%95%D7%95%D7%90%D7%AA%20%D7%91%D7%A2%D7%9C%D7%99%D7%9D.docx',
      downloadName: 'פרוטוקול_חברה_הלוואת_בעלים.docx',
      isDocx: true,
      updatedAt: '2026',
      parties: 'דירקטוריון מיאליס ריזורט בע״מ',
      sheetPreviewType: 'contract'
    },

    // =========================================================================
    // 3. רואה חשבון ורווח והפסד
    // =========================================================================
    {
      id: 'cpa-pnl-1-8-2026',
      category: 'finance_cpa',
      title: 'דוח רווח והפסד 1-8.2026 - מיאליס ריזורט',
      subtitle: 'דוח כספי מבוקר רו״ח לתקופה 1-8.2026',
      description: 'דוח רווח והפסד רשמי של מיאליס ריזורט: מחזור הכנסות מאירוח, עלות המכר, הוצאות הנהלה וכלליות, ורווח נקי לתקופה.',
      formatBadge: 'דוח רווח והפסד PDF',
      tagColor: 'emerald',
      url: '/finance/%D7%A8%D7%95%D7%90%D7%94%20%D7%97%D7%A9%D7%91%D7%95%D7%9F/%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%20%D7%A8%D7%95%D7%95%D7%97%20%D7%95%D7%94%D7%A4%D7%A1%D7%93%201-8.2026.pdf',
      downloadName: 'מיאליס_רווח_והפסד_1-8.2026.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'רו״ח · מיאליס ריזורט בע״מ',
      sheetPreviewType: 'table'
    },
    {
      id: 'cpa-revenue-approval',
      category: 'finance_cpa',
      title: 'אישור רו״ח על הכנסות 1-8.2026 - מיאליס ריזורט',
      subtitle: 'אישור הכנסות חתום לידי בנקים וגופים מממנים',
      description: 'אישור רואה חשבון רשמי וחתום המאמת את מחזור ההכנסות של העסק לתקופה שבין ינואר לאוגוסט 2026.',
      formatBadge: 'אישור רו״ח PDF',
      tagColor: 'emerald',
      url: '/finance/%D7%A8%D7%95%D7%90%D7%94%20%D7%97%D7%A9%D7%91%D7%95%D7%9F/%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%A8%D7%95%D7%97%20%D7%94%D7%9B%D7%A0%D7%A0%D7%A1%D7%95%D7%AA%201-8.2026%20-%20%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%20%D7%A8%D7%99%D7%96%D7%95%D7%A8%D7%98.pdf',
      downloadName: 'אישור_רוח_הכנסות_1-8.2026_מיאליס_ריזורט.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'משרד רו״ח',
      sheetPreviewType: 'report'
    },
    {
      id: 'cpa-daniel-approval',
      category: 'finance_cpa',
      title: 'אישור רו״ח - דניאל שוקרון (1-8.2026)',
      subtitle: 'אישור הכנסות בעלים / דיבידנד ומשכורות',
      description: 'אישור מרואה החשבון בדבר משיכות, הכנסות ושכר בעלים של דניאל שוקרון לתקופה 1-8.2026.',
      formatBadge: 'אישור רו״ח PDF',
      tagColor: 'emerald',
      url: '/finance/%D7%A8%D7%95%D7%90%D7%94%20%D7%97%D7%A9%D7%91%D7%95%D7%9F/%D7%90%D7%99%D7%A9%D7%95%D7%A8%20%D7%A8%D7%95%D7%90%D7%94%20%D7%97%D7%A9%D7%91%D7%95%D7%9F%20-%20%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F%201-8.2026.pdf',
      downloadName: 'אישור_רואה_חשבון_דניאל_שוקרון_1-8.2026.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'רו״ח · דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'cpa-mialis-7-8',
      category: 'finance_cpa',
      title: 'דוח כספי תקופתי מיאליס (7-8.2026)',
      subtitle: 'דוח פעילות שיא עונת הקיץ',
      description: 'ריכוז נתונים כספיים ומחזורים עבור חודשי יולי-אוגוסט 2026, כולל ניתוח הכנסות והוצאות עונתיות.',
      formatBadge: 'דוח תקופתי PDF',
      tagColor: 'emerald',
      url: '/finance/%D7%A8%D7%95%D7%90%D7%94%20%D7%97%D7%A9%D7%91%D7%95%D7%9F/%D7%9E%D7%99%D7%90%D7%9C%D7%99%D7%A1%207-8.2026.pdf',
      downloadName: 'מיאליס_דוח_רוח_7-8.2026.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'רו״ח · מיאליס ריזורט',
      sheetPreviewType: 'table'
    },

    // =========================================================================
    // 4. דיווחי מע״מ 2026
    // =========================================================================
    {
      id: 'vat-1-2-2026',
      category: 'finance_vat',
      title: 'דיווח מע״מ ינואר-פברואר 2026',
      subtitle: 'שובר דיווח ותשלום מע״מ תקופתי 1-2.2026',
      description: 'דוח מע״מ רשמי מול רשות המסים עבור חודשים ינואר-פברואר 2026: עסקאות חייבות, מע״מ תשומות וסכום לתשלום.',
      formatBadge: 'מע״מ PDF',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%A2%D7%9E%202026/%D7%9E%D7%A2%D7%9E%201-2.2026.pdf',
      downloadName: 'מעמ_מיאליס_1-2.2026.pdf',
      isPdf: true,
      updatedAt: 'פברואר 2026',
      parties: 'רשות המסים · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'vat-3-4-2026',
      category: 'finance_vat',
      title: 'דיווח מע״מ מרץ-אפריל 2026',
      subtitle: 'שובר דיווח ותשלום מע״מ תקופתי 3-4.2026',
      description: 'דוח מע״מ רשמי מול רשות המסים לחודשים מרץ-אפריל (כולל עונת חג הפסח), מחזור עסקאות ומע״מ תשומות.',
      formatBadge: 'מע״מ PDF',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%A2%D7%9E%202026/%D7%9E%D7%A2%D7%9E%203-4.2026.PDF',
      downloadName: 'מעמ_מיאליס_3-4.2026.pdf',
      isPdf: true,
      updatedAt: 'אפריל 2026',
      parties: 'רשות המסים · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'vat-5-6-2026',
      category: 'finance_vat',
      title: 'דיווח מע״מ מאי-יוני 2026',
      subtitle: 'שובר דיווח ותשלום מע״מ תקופתי 5-6.2026',
      description: 'דוח מע״מ רשמי עבור חודשים מאי-יוני (עונת האביב ופתיחת הקיץ), מחזורי עסקאות ותשומות ציוד ותפעול.',
      formatBadge: 'מע״מ PDF',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%A2%D7%9E%202026/%D7%9E%D7%A2%D7%9E%205-6.2026.pdf',
      downloadName: 'מעמ_מיאליס_5-6.2026.pdf',
      isPdf: true,
      updatedAt: 'יוני 2026',
      parties: 'רשות המסים · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },
    {
      id: 'vat-7-8-2026',
      category: 'finance_vat',
      title: 'דיווח מע״מ יולי-אוגוסט 2026',
      subtitle: 'שובר דיווח ותשלום מע״מ תקופתי 7-8.2026',
      description: 'דוח מע״מ רשמי לחודשי שיא עונת הקיץ יולי-אוגוסט 2026, מחזור עסקאות מקסימלי ותשלום מע״מ כדין.',
      formatBadge: 'מע״מ PDF',
      tagColor: 'amber',
      url: '/finance/%D7%9E%D7%A2%D7%9E%202026/%D7%9E%D7%A2%D7%9E%207-8.2026.pdf',
      downloadName: 'מעמ_מיאליס_7-8.2026.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'רשות המסים · מיאליס ריזורט',
      sheetPreviewType: 'report'
    },

    // =========================================================================
    // 5. תאגיד, בעלים ומשפטי
    // =========================================================================
    {
      id: 'corp-incorporation-cert',
      category: 'finance_corporate',
      title: 'תעודת התאגדות - מיאליס ריזורט בע״מ',
      subtitle: 'רשם החברות · תעודת רישום חברה רשמית',
      description: 'תעודת התאגדות רשמית של מיאליס ריזורט בע״מ ממשרד המשפטים / רשם החברות כולל ח״פ ומספר חברה.',
      formatBadge: 'תעודת חברה PDF',
      tagColor: 'purple',
      url: '/finance/%D7%90%D7%97%D7%A8/%D7%AA%D7%A2%D7%95%D7%93%D7%AA%20%D7%94%D7%AA%D7%90%D7%92%D7%93%D7%95%D7%AA.pdf',
      downloadName: 'תעודת_התאגדות_מיאליס_ריזורט_בעמ.pdf',
      isPdf: true,
      updatedAt: 'רשם החברות',
      parties: 'משרד המשפטים · רשם החברות',
      sheetPreviewType: 'contract'
    },
    {
      id: 'corp-signatory-protocol',
      category: 'finance_corporate',
      title: 'פרוטוקול מורשה חתימה בבנק (מעודכן 06.01.2025)',
      subtitle: 'החלטת דירקטוריון בדבר מורשי חתימה',
      description: 'פרוטוקול דירקטוריון רשמי וחתום המגדיר את מורשי החתימה בחשבונות הבנק, זכויות חתימה ואישור עו״ד.',
      formatBadge: 'פרוטוקול PDF',
      tagColor: 'purple',
      url: '/finance/%D7%90%D7%97%D7%A8/%D7%A4%D7%A8%D7%95%D7%98%D7%95%D7%A7%D7%95%D7%9C%20%D7%9E%D7%95%D7%A8%D7%A9%D7%94%20%D7%97%D7%AA%D7%99%D7%9E%D7%94%20%D7%91%D7%A0%D7%A7%20%D7%9E%D7%A2%D7%95%D7%93%D7%9B%D7%9F%2006.01.2025.pdf',
      downloadName: 'פרוטוקול_מורשה_חתימה_בנק_מעודכן.pdf',
      isPdf: true,
      updatedAt: '06.01.2025',
      parties: 'דירקטוריון החברה',
      sheetPreviewType: 'contract'
    },
    {
      id: 'corp-esna-2026',
      category: 'finance_corporate',
      title: 'אישור ניהול ספרים וניכוי מס במקור (ESNA 2026)',
      subtitle: 'אישור רשות המסים בתוקף',
      description: 'אישור רשמי של רשות המסים בדבר ניהול פנקסי חשבונות ופטור/שיעור ניכוי מס במקור לשנת 2026.',
      formatBadge: 'אישור מס PDF',
      tagColor: 'purple',
      url: '/finance/%D7%90%D7%97%D7%A8/ESNA%202026.pdf',
      downloadName: 'אישור_ניהול_ספרים_וניכוי_מס_2026.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'רשות המסים',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-financial-report',
      category: 'finance_corporate',
      title: 'דוח אישי בדבר מצב פיננסי - דניאל שוקרון',
      subtitle: 'הצהרת עושר ומצב פיננסי אישי',
      description: 'דוח אישי מפורט של דניאל שוקרון המפרט נכסים, התחייבויות, הכנסות ורכוש לצורך אישורי אשראי ובנקים.',
      formatBadge: 'הצהרת הון PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%93%D7%95%D7%97%20%D7%90%D7%99%D7%A9%D7%99%20%D7%91%D7%93%D7%91%D7%A8%20%D7%9E%D7%A6%D7%91%20%D7%A4%D7%99%D7%A0%D7%A0%D7%A1%D7%99.pdf',
      downloadName: 'דוח_אישי_מצב_פיננסי_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-tax-2024',
      category: 'finance_corporate',
      title: 'שומה שנתית 2024 - דניאל שוקרון',
      subtitle: 'דוח שומת מס הכנסה סופית לשנת 2024',
      description: 'הודעת שומה שנתית רשמית מרשות המסים לשנת המס 2024, הכנסה חייבת ומס סופי ששולם.',
      formatBadge: 'שומה PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%A9%D7%95%D7%9E%D7%94%202024.pdf',
      downloadName: 'שומת_מס_2024_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: '2024',
      parties: 'רשות המסים · דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-tax-2023',
      category: 'finance_corporate',
      title: 'שומה שנתית 2023 - דניאל שוקרון',
      subtitle: 'דוח שומת מס הכנסה סופית לשנת 2023',
      description: 'הודעת שומה שנתית רשמית מרשות המסים לשנת המס 2023, הכנסות מעסק ומקורות נוספים.',
      formatBadge: 'שומה PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%A9%D7%95%D7%9E%D7%94%202023.pdf',
      downloadName: 'שומת_מס_2023_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: '2023',
      parties: 'רשות המסים · דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-payslip-sep',
      category: 'finance_corporate',
      title: 'תלוש שכר ספטמבר 2026 - דניאל שוקרון',
      subtitle: 'תלוש שכר רשמי ספטמבר',
      description: 'תלוש שכר חודשי רשמי לחודש ספטמבר 2026, פירוט ברוטו, נטו, ניכויים והפרשות סוציאליות.',
      formatBadge: 'תלוש שכר PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%AA%D7%9C%D7%95%D7%A9%20%D7%A1%D7%A4%D7%98%D7%9E%D7%91%D7%A8.pdf',
      downloadName: 'תלוש_שכר_ספטמבר_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: 'ספטמבר 2026',
      parties: 'דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-payslip-aug',
      category: 'finance_corporate',
      title: 'תלוש שכר אוגוסט 2026 - דניאל שוקרון',
      subtitle: 'תלוש שכר רשמי אוגוסט',
      description: 'תלוש שכר חודשי רשמי לחודש אוגוסט 2026, פירוט ברוטו, נטו והפרשות פנסיה ופיצויים.',
      formatBadge: 'תלוש שכר PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%AA%D7%9C%D7%95%D7%A9%20%D7%90%D7%95%D7%92%D7%95%D7%A1%D7%98.pdf',
      downloadName: 'תלוש_שכר_אוגוסט_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-payslip-jul',
      category: 'finance_corporate',
      title: 'תלוש שכר יולי 2026 - דניאל שוקרון',
      subtitle: 'תלוש שכר רשמי יולי',
      description: 'תלוש שכר חודשי רשמי לחודש יולי 2026, פירוט ברוטו, נטו והפרשות פנסיוניות.',
      formatBadge: 'תלוש שכר PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%AA%D7%9C%D7%95%D7%A9%20%D7%99%D7%95%D7%9C%D7%99.pdf',
      downloadName: 'תלוש_שכר_יולי_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: 'יולי 2026',
      parties: 'דניאל שוקרון',
      sheetPreviewType: 'report'
    },
    {
      id: 'daniel-id-card',
      category: 'finance_corporate',
      title: 'צילום תעודת זהות - דניאל שוקרון',
      subtitle: 'צילום ת״ז רשמי של בעל השליטה / מנהל',
      description: 'צילום תעודת זהות וספח של דניאל שוקרון הנדרש לפתיחת חשבונות, חתימות ואישורים בנקאיים.',
      formatBadge: 'ת״ז PDF',
      tagColor: 'blue',
      url: '/finance/%D7%93%D7%A0%D7%99%D7%90%D7%9C%20%D7%A9%D7%95%D7%A7%D7%A8%D7%95%D7%9F/%D7%AA%D7%96%20%D7%93%D7%A0%D7%99%D7%90%D7%9C.pdf',
      downloadName: 'תעודת_זהות_דניאל_שוקרון.pdf',
      isPdf: true,
      updatedAt: '2026',
      parties: 'דניאל שוקרון',
      sheetPreviewType: 'contract'
    },

    // =========================================================================
    // 6. הסכמים וחוזים אישיים
    // =========================================================================
    {
      id: 'employment-contract',
      category: 'contracts',
      title: 'הסכם העסקה אישי - בועז שכנטוב / אדם דורות',
      subtitle: 'איש מכירות ושיווק שטח · ייבוא מסחרי מסין',
      description: 'הסכם עבודה אישי מפורט. שכר 13,000 ש״ח ברוטו, 3% עמלות מכירה, 600 ש״ח הוצאות רכב, סודיות מורחבת ואי-תחרות מול ספקי סין.',
      formatBadge: 'A4 · 2 עמודים',
      tagColor: 'blue',
      url: '/employment-agreement-adam.html',
      downloadName: 'הסכם_העסקה_אישי_בועז_שכנטוב_אדם_דורות.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'בועז שכנטוב · אדם דורות',
      sheetPreviewType: 'contract'
    },

    // =========================================================================
    // 7. רכש, הזמנות עבודה וספקים
    // =========================================================================
    {
      id: 'procurement-list',
      category: 'procurement',
      title: 'רשימת רכש ומעקב הזמנות מלאי',
      subtitle: 'טבלת רכש שוטף, טקסטיל וציוד',
      description: 'טבלת ניהול הזמנות רכש שוטף לבקתות: טקסטיל, קפסולות, תמרוקים, ציוד ניקיון וכלי תחזוקה כולל כמויות ומחירים.',
      formatBadge: 'A4 מותאם',
      tagColor: 'emerald',
      url: '/procurement_list.html',
      downloadName: 'רשימת_רכש_ומעקב_הזמנות_מלאי.html',
      isHtml: true,
      updatedAt: 'אוגוסט 2026',
      parties: 'מחלקת תפעול ורכש',
      sheetPreviewType: 'table'
    },

    // =========================================================================
    // 8. מדבקות ושלטי QR (מסמכים עצמאיים ללא תפריטים)
    // =========================================================================
    {
      id: 'qr-rooms-5x5',
      category: 'qr',
      title: 'מדבקות QR לחדרים וכספות (5×5 ס״מ)',
      subtitle: 'גיליון מדבקות ריבועיות · 20 מדבקות בדף A4',
      description: 'מדבקות 5×5 ס״מ מוכנות להדפסה ישירה על דפי מדבקות לכספות ולדלתות 40 החדרים (10 שורות מלאות של 4). כולל קוד זיהוי, QR מהיר והנחיות בעברית ובתאילנדית.',
      formatBadge: 'A4 · 20 בדף (2 עמודים)',
      tagColor: 'amber',
      url: '/qr-rooms-5x5.html',
      downloadName: 'מדבקות_QR_חדרים_וכספות_5x5.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: '40 חדרי ויחידות ריזורט',
      sheetPreviewType: 'qr-units'
    },
    {
      id: 'qr-rooms-signs',
      category: 'qr',
      title: 'שלטי ומדבקות מעמד לאורח (4 בדף A4)',
      subtitle: 'מדבקות ושלטי שולחן וכניסה · 88×122 מ״מ',
      description: 'שלטי מעמד וכרטיסי מדבקה גדולים להנחה בתוך הבקתות על השולחן או בכניסה. כולל סיסמת WiFi, קוד כספת, QR והנחיות התחברות מהירות לקלואי.',
      formatBadge: 'A4 · 4 שלטים בדף',
      tagColor: 'amber',
      url: '/qr-rooms-signs.html',
      downloadName: 'שלטי_מדבקות_QR_חדרים_4_בדף.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'שילוט ומעמד לאורחים בחדרים',
      sheetPreviewType: 'qr-units'
    },
    {
      id: 'qr-grounds-stickers',
      category: 'qr',
      title: 'מדבקות QR לחצרות, בריכות ומשרד (5×5 ס״מ)',
      subtitle: 'עיצוב תואם למדבקות החדרים · 29 שטחים, בריכות ומשרד',
      description: 'גיליון מדבקות שטח, בריכות ומשרד ראשי בעיצוב זהה למדבקות החדרים (5×5 ס״מ): תג ירוק לחצר / כחול לבריכה / צהוב למשרד, QR סריקה ממוקד והנחיות דיווח מהיר לקלואי.',
      formatBadge: 'A4 · מדבקות שטח ומשרד תואמות',
      tagColor: 'emerald',
      url: '/grounds-qr.html',
      downloadName: 'מדבקות_QR_חצרות_בריכות_ומשרד.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: '29 חצרות, בריכות ומשרד ראשי',
      sheetPreviewType: 'qr-grounds'
    },
    {
      id: 'qr-rooms-compact',
      category: 'qr',
      title: 'מדבקות QR קומפקטיות לחדרים (דף יחיד)',
      subtitle: 'כל 41 מדבקות החדרים על גבי דף A4 אחד',
      description: 'גיליון קומפקטי מרוכז בגודל 28×34 מ״מ לכל מדבקה, המכיל את כל 41 היחידות בדף מודפס אחד לצורכי חירום וגיבוי מהיר.',
      formatBadge: 'A4 · 41 מדבקות בדף',
      tagColor: 'amber',
      url: '/qr-rooms-compact.html',
      downloadName: 'מדבקות_QR_קומפקטיות_דף_יחיד.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: '41 יחידות ריזורט',
      sheetPreviewType: 'qr-units'
    },
    {
      id: 'qr-safe-table',
      category: 'qr',
      title: 'טבלת קודי כספות ומפתחות מרוכזת (41 יחידות)',
      subtitle: 'דוח מעקב קודי כספות, אותיות חדרים ומתחמים',
      description: 'טבלה מרוכזת מלאה של כל 41 היחידות והבקתות, קוד הכספת (#XXXX), האות באנגלית, ושם המתחם.',
      formatBadge: 'טבלה רשמית A4',
      tagColor: 'blue',
      url: '/qr-safe-table.html',
      downloadName: 'טבלת_קודי_כספות_ומפתחות_41_יחידות.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'כל מתחמי ויחידות הריזורט',
      sheetPreviewType: 'table'
    },

    // =========================================================================
    // 9. תפעול אירוח וחדרים
    // =========================================================================
    {
      id: 'room-sheet-a4',
      category: 'hospitality',
      title: 'דף חדר והנחיות צ׳ק-אין (Room Sheet)',
      subtitle: 'דף הסבר לאורח להנחה בתוך הבקתה',
      description: 'דף מידע מפורט לאורח: הוראות הפעלת ג׳קוזי/מיזוג, זמני ארוחת בוקר, נהלי עזיבה, פינוי אשפה ומספרי חירום.',
      formatBadge: 'A4 · עמוד 1',
      tagColor: 'indigo',
      url: '/room-sheet-a4.html',
      downloadName: 'דף_חדר_הנחיות_צק_אין_A4.html',
      isHtml: true,
      updatedAt: 'ספטמבר 2026',
      parties: 'אורחי המתחם',
      sheetPreviewType: 'room-sheet'
    },
    {
      id: 'price-list-official',
      category: 'hospitality',
      title: 'מחירון שירותים, תוספות ופינוקים',
      subtitle: 'מחירון הדפסה רשמי לאורחים ולמשרד',
      description: 'טבלת מחירי לינה לפי עונות, ארוחות בוקר כפריות, עיסויים וטיפולי ספא, פינוקי יין/שוקולד, שעות כניסה מוקדמת ויציאה מאוחרת.',
      formatBadge: 'A4 · עמוד 1',
      tagColor: 'indigo',
      url: '/price-list.html',
      downloadName: 'מחירון_שירותים_ותוויות_רשמי_A4.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'קבלה, הזמנות ואורחים',
      sheetPreviewType: 'price-list'
    },

    // =========================================================================
    // 10. דוחות תפעול וכספים חיים
    // =========================================================================
    {
      id: 'report-duty-full',
      category: 'reports',
      title: 'דוח תפעול יומי מלא (Daily Duty Report)',
      subtitle: 'דוח יציאות, כניסות, תפוסה וניקיונות להיום',
      description: 'הדפסה חיה ישירות מנתוני ה-Priority: סטטוס כל היחידות, שמות אורחים, שעות הגעה/עזיבה, הערות תפעול ומשימות משק.',
      formatBadge: 'דוח חי להדפסה',
      tagColor: 'purple',
      isAction: true,
      onRun: onPrintDutyReport,
      updatedAt: 'מתעדכן בזמן אמת',
      parties: 'צוות תפעול ומנהל',
      sheetPreviewType: 'report'
    },
    {
      id: 'report-cash-day',
      category: 'reports',
      title: 'דוח קופת מזומנים וגבייה (שבועי)',
      subtitle: 'ברירת המחדל: השבוע הקודם, ראשון עד שבת',
      description: 'הדפסה מרוכזת של תקבולי המזומן מהשבוע הקודם, מול יתרות פתוחות ופירוט תשלומים מול אורחים. אפשר לבחור יום אחר מתוך הדוח.',
      formatBadge: 'דוח חי להדפסה',
      tagColor: 'purple',
      isAction: true,
      onRun: onPrintCashReport,
      updatedAt: 'מתעדכן בזמן אמת',
      parties: 'קופה וכספים',
      sheetPreviewType: 'report'
    },
    {
      id: 'report-morning-duty',
      category: 'reports',
      title: 'דוח פתיחת בוקר ומסירת משמרת',
      subtitle: 'דוח תמציתי למשמרת בוקר',
      description: 'ריכוז עזיבות מוקדמות, תעדוף חדרים לניקיון לפי סבב, הכנת בקתות לאורחי VIP והערות מיוחדות.',
      formatBadge: 'דוח חי להדפסה',
      tagColor: 'purple',
      isAction: true,
      onRun: onPrintMorningReport,
      updatedAt: 'מתעדכן בזמן אמת',
      parties: 'משמרת בוקר ומשק בית',
      sheetPreviewType: 'report'
    },

    // =========================================================================
    // 11. עורך מסמכים חופשי
    // =========================================================================
    {
      id: 'priority-word-editor',
      category: 'word',
      title: 'עורך המסמכים של פריוריטי (Priority Word)',
      subtitle: 'כתיבה, עיצוב והדפסת מסמכים חופשיים בענן',
      description: 'מעבד תמלילים מלא מובנה בפריוריטי עם פונטים בעברית, טבלאות, כותרות, צבעים, הדפסת A4 ושמירה בענן לכל משתמשי המערכת.',
      formatBadge: 'עורך פעיל',
      tagColor: 'blue',
      isAction: true,
      onRun: onOpenWord,
      updatedAt: 'פעיל במערכת',
      parties: 'מסמכים חופשיים',
      sheetPreviewType: 'word-app'
    }
  ], [onOpenWord, onPrintDutyReport, onPrintCashReport, onPrintMorningReport]);

  // הורדת כל הטפסים והמסמכים של הקטגוריה הפעילה או כולם למחשב
  const handleDownloadAll = async () => {
    const downloadableItems = filteredItems.filter((i) => i.url);
    if (!downloadableItems.length) return;
    setDownloadingAll(true);
    setDownloadStatus('מוריד קבצים למחשב…');
    for (let idx = 0; idx < downloadableItems.length; idx++) {
      const it = downloadableItems[idx];
      await triggerFileDownload(it.url, it.downloadName || `${it.id}.pdf`);
      setDownloadStatus(`הורדו ${idx + 1} מתוך ${downloadableItems.length} קבצים…`);
      await new Promise((r) => setTimeout(r, 250));
    }
    setDownloadStatus(`הושלם! ${downloadableItems.length} קבצים נשמרו בתיקיית ההורדות.`);
    setTimeout(() => {
      setDownloadingAll(false);
      setDownloadStatus('');
    }, 3500);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      if (!matchCat) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.parties && item.parties.toLowerCase().includes(q))
      );
    });
  }, [items, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const counts = { all: items.length };
    CATEGORIES.forEach((cat) => {
      if (cat.id !== 'all') {
        counts[cat.id] = items.filter((i) => i.category === cat.id).length;
      }
    });
    return counts;
  }, [items]);

  return (
    <div className="priority-forms-hub">
      {/* סרגל קטגוריות אנכי מימין */}
      <aside className="forms-sidebar-right">
        <div className="forms-sidebar-header">
          <FolderOpen size={18} className="forms-header-icon" />
          <div className="forms-header-text">
            <strong>מרכז מסמכים וטפסים</strong>
            <span>{items.length} קבצים, דוחות ומסמכים</span>
          </div>
        </div>

        {/* חיפוש מהיר */}
        <div className="forms-search-box">
          <Search size={14} className="forms-search-icon" />
          <input
            type="text"
            className="forms-search-input"
            placeholder="חיפוש בנק, מע״מ, ספק, דוח…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button type="button" className="forms-search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          ) : null}
        </div>

        {/* טאבים אנכיים */}
        <nav className="forms-category-list" role="tablist">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            const count = categoryCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`forms-cat-btn${isSelected ? ' is-active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="forms-cat-main">
                  <Icon size={15} className="forms-cat-icon" />
                  <span className="forms-cat-label">{cat.label}</span>
                </span>
                <span className={`forms-cat-badge${isSelected ? ' is-active' : ''}`}>{count}</span>
              </button>
            );
          })}
        </nav>

        {/* פקדי הורדה אוטומטית למחשב */}
        <div className="forms-auto-dl-box">
          <div className="forms-auto-dl-row" onClick={toggleAutoDownload} role="button" tabIndex={0}>
            <div className="forms-auto-dl-text">
              <strong>הורדה אוטומטית למחשב</strong>
              <span>שמירת כל קובץ חדש ב-Downloads</span>
            </div>
            <button type="button" className={`forms-toggle-switch${autoDownload ? ' is-on' : ''}`}>
              {autoDownload ? <ToggleRight size={22} color="#059669" /> : <ToggleLeft size={22} color="#94a3b8" />}
            </button>
          </div>

          <button
            type="button"
            className="forms-dl-all-btn"
            disabled={downloadingAll}
            onClick={handleDownloadAll}
            title="הורדת כל המסמכים המוצגים ישירות לתיקיית Downloads במחשב"
          >
            <Download size={13} /> {downloadingAll ? 'מוריד קבצים…' : `הורד ${filteredItems.filter((i) => i.url).length} קבצים למחשב`}
          </button>
          {downloadStatus ? (
            <div className="forms-dl-status">{downloadStatus}</div>
          ) : null}
        </div>

        {/* טיפ תחתון */}
        <div className="forms-sidebar-footer">
          <Sparkles size={14} />
          <span>כולל תצוגה מקדימה ישירה ל-PDF, הדפסה מהירה והורדה למחשב.</span>
        </div>
      </aside>

      {/* אזור ראשי: רשת כרטיסי תבניות ומסמכים */}
      <main className="forms-main-content">
        <header className="forms-content-header">
          <div>
            <h2 className="forms-content-title">
              {CATEGORIES.find((c) => c.id === activeCategory)?.label}
            </h2>
            <p className="forms-content-sub">
              נמצאו {filteredItems.length} מסמכים {search ? `עבור החיפוש "${search}"` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="forms-dl-all-btn top-btn"
              disabled={downloadingAll}
              onClick={handleDownloadAll}
              title="הורדת כל המסמכים בקטגוריה ישירות לתיקיית Downloads במחשב"
            >
              <Download size={13} /> הורד את כל המסמכים
            </button>
            {onOpenWord ? (
              <button type="button" className="forms-new-doc-btn" onClick={onOpenWord}>
                <FileText size={14} /> פתח מסמך חדש בעורך
              </button>
            ) : null}
          </div>
        </header>

        {filteredItems.length === 0 ? (
          <div className="forms-empty-state">
            <Search size={32} />
            <h3>לא נמצאו מסמכים מתאימים</h3>
            <p>נסה לשנות את מונח החיפוש או לבחור בקטגוריה אחרת.</p>
            <button type="button" className="forms-reset-btn" onClick={() => { setSearch(''); setActiveCategory('all'); }}>
              הצג את כל המסמכים
            </button>
          </div>
        ) : (
          <div className="forms-grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="form-card">
                {/* כותרת עליונה של הכרטיס עם מיניאטורת מסמך */}
                <div className="form-card-preview-wrap">
                  <div className={`form-mini-sheet is-${item.sheetPreviewType || 'default'}`}>
                    <div className="mini-sheet-header">
                      <span className="mini-sheet-dot" />
                      <span className="mini-sheet-title-line" />
                    </div>
                    <div className="mini-sheet-body">
                      <div className="mini-sheet-line full" />
                      <div className="mini-sheet-line short" />
                      <div className="mini-sheet-box">
                        <span className="mini-sheet-line" />
                        <span className="mini-sheet-line" />
                      </div>
                      <div className="mini-sheet-table">
                        <div className="mini-row" />
                        <div className="mini-row" />
                        <div className="mini-row" />
                      </div>
                    </div>
                    <div className="mini-sheet-footer">
                      <span className="mini-sig-line" />
                      <span className="mini-sig-line" />
                    </div>
                  </div>
                  <span className={`form-format-badge is-${item.tagColor || 'blue'}`}>
                    {item.formatBadge}
                  </span>
                </div>

                {/* פרטי הכרטיס */}
                <div className="form-card-info">
                  <h3 className="form-card-title">{item.title}</h3>
                  <div className="form-card-sub">{item.subtitle}</div>
                  <p className="form-card-desc">{item.description}</p>

                  <div className="form-card-meta">
                    <span className="meta-tag">
                      <CheckCircle2 size={12} /> {item.parties}
                    </span>
                    <span className="meta-date">{item.updatedAt}</span>
                  </div>

                  {/* כפתורי פעולה */}
                  <div className="form-card-actions">
                    {item.url ? (
                      <>
                        <button
                          type="button"
                          className="form-btn is-preview"
                          title="תצוגה מקדימה מהירה בתוך פריוריטי"
                          onClick={() => setPreviewItem(item)}
                        >
                          <Maximize2 size={13} /> תצוגה מקדימה
                        </button>
                        <button
                          type="button"
                          className="form-btn is-download"
                          title="הורדת הקובץ ישירות למחשב שלך"
                          onClick={() => triggerFileDownload(item.url, item.downloadName)}
                        >
                          <Download size={13} /> הורד קובץ
                        </button>
                        <button
                          type="button"
                          className="form-btn is-print"
                          title="הדפסה מיידית"
                          onClick={() => {
                            const printUrl = item.url + (item.url.includes('?') ? '&print=1' : '?print=1');
                            window.open(printUrl, '_blank');
                          }}
                        >
                          <Printer size={13} /> הדפסה
                        </button>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="form-btn is-open"
                          title="פתח בחלון מלא"
                        >
                          <ExternalLink size={13} /> פתח מלא
                        </a>
                      </>
                    ) : item.isAction ? (
                      <button
                        type="button"
                        className="form-btn is-primary"
                        onClick={item.onRun}
                      >
                        {item.category === 'reports' ? <Printer size={13} /> : <FileText size={13} />}
                        {item.category === 'reports' ? 'הפק והדפס דוח' : 'פתח עורך מסמכים'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* מודאל תצוגה מקדימה מלאה בתוך Priority בלי לצאת מהמסך */}
      {previewItem ? (
        <div className="forms-modal-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="forms-modal-window" onClick={(e) => e.stopPropagation()}>
            <header className="forms-modal-header">
              <div className="forms-modal-title">
                <FileText size={16} />
                <strong>{previewItem.title}</strong>
                <span className="forms-modal-badge">{previewItem.formatBadge}</span>
              </div>
              <div className="forms-modal-controls">
                <button
                  type="button"
                  className="tb-btn"
                  title="הורד קובץ זה ישירות למחשב"
                  onClick={() => triggerFileDownload(previewItem.url, previewItem.downloadName)}
                >
                  <Download size={14} /> הורד קובץ למחשב
                </button>
                <button
                  type="button"
                  className="tb-btn is-highlight"
                  onClick={() => {
                    const printUrl = previewItem.url + (previewItem.url.includes('?') ? '&print=1' : '?print=1');
                    window.open(printUrl, '_blank');
                  }}
                >
                  <Printer size={14} /> הדפס / PDF
                </button>
                <a
                  href={previewItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tb-btn"
                >
                  <ExternalLink size={14} /> פתח בחלון מלא
                </a>
                <button
                  type="button"
                  className="forms-modal-close"
                  onClick={() => setPreviewItem(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </header>
            <div className="forms-modal-body">
              <iframe
                id="preview-doc-frame"
                src={previewItem.url}
                title={previewItem.title}
                className="forms-modal-iframe"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
