import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Layers,
  Maximize2,
  Printer,
  QrCode,
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
  { id: 'all', label: 'כל הטפסים והתבניות', icon: FolderOpen },
  { id: 'contracts', label: 'הסכמים וחוזים משפטיים', icon: ShieldCheck },
  { id: 'procurement', label: 'רכש, הזמנות עבודה וספקים', icon: Wrench },
  { id: 'qr', label: 'מדבקות ושלטי QR', icon: QrCode },
  { id: 'hospitality', label: 'תפעול אירוח וחדרים', icon: Building2 },
  { id: 'reports', label: 'דוחות תפעול וכספים', icon: FileSpreadsheet },
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
    a.download = filename || url.split('/').pop() || 'document.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (err) {
    // Fallback: ניסיון ניווט ישיר להורדה
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document.html';
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
    {
      id: 'work-order-blank',
      category: 'procurement',
      title: 'הזמנת עבודה מספק (טופס ריק להדפסה)',
      subtitle: 'טופס רשמי מלא A4 · בועז שכנטוב / קינורות',
      description: 'טופס הזמנת עבודה ריק להדפסה ומילוי ידני או דיגיטלי. כולל פרטי ספק, טבלת פריטים/עבודות, שדות מע״מ, תנאי תשלום וחתימות.',
      formatBadge: 'A4 · 100% דף בודד',
      tagColor: 'emerald',
      url: '/work-order.html',
      downloadName: 'טופס_הזמנת_עבודה_מספק_A4_ריק.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'הזמנה ריקה / ספקים כלליים',
      sheetPreviewType: 'work-order'
    },
    {
      id: 'work-order-10065',
      category: 'procurement',
      title: 'הזמנת עבודה לספק מס׳ 10065',
      subtitle: 'הזמנת עבודה מפורטת שהונפקה לספק',
      description: 'טופס הזמנת עבודה מותאם עם פירוט תכולת העבודה שנקבעה, כתובת המתחם ברמות, אישורים וסעיפי התקשרות.',
      formatBadge: 'A4 · עמוד 1',
      tagColor: 'emerald',
      url: '/qr-stickers.html#work-order',
      downloadName: 'הזמנת_עבודה_ספק_10065.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'ספק 10065',
      sheetPreviewType: 'work-order'
    },
    {
      id: 'qr-stickers-units',
      category: 'qr',
      title: 'דף מדבקות QR ליחידות אירוח',
      subtitle: 'גיליון 12 מדבקות QR בגודל A4',
      description: 'גיליון מוכן להדפסה על דפי מדבקות סטנדרטיים A4. כל מדבקה כוללת QR סריקה אישי ליחידה, סיסמת WiFi, קוד כניסה וטלפונים חשובים.',
      formatBadge: 'A4 · 12 מדבקות',
      tagColor: 'amber',
      url: '/qr-stickers.html',
      downloadName: 'דף_מדבקות_QR_יחידות_נופש_A4.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'יחידות הנופש והבקתות',
      sheetPreviewType: 'qr-units'
    },
    {
      id: 'qr-grounds-signs',
      category: 'qr',
      title: 'שלטי ומדבקות QR לשטחים ציבוריים',
      subtitle: 'בריכה, מתחם ספא, משרד קבלה, שער',
      description: 'דף שלטים ומדבקות ייעודיות לסריקת QR בשטחים המשותפים של הריזורט להזמנת שירותים, נהלי שימוש ופתיחת קריאות שירות.',
      formatBadge: 'A4 · שלטי שטח',
      tagColor: 'amber',
      url: '/grounds-qr.html',
      downloadName: 'שלטי_מדבקות_QR_שטחים_ציבוריים.html',
      isHtml: true,
      updatedAt: 'אוקטובר 2026',
      parties: 'שטחים ציבוריים ותפעול',
      sheetPreviewType: 'qr-grounds'
    },
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
      title: 'דוח קופת מזומנים וגבייה (Cash Flow Day)',
      subtitle: 'דוח מעקב גביית מזומנים לפי יחידות',
      description: 'הדפסה מרוכזת של כל תקבולי המזומן שנגבו היום מול יתרות פתוחות ופירוט תשלומים מול אורחים.',
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

  // הורדת כל הטפסים בבת אחת למחשב
  const handleDownloadAll = async () => {
    const htmlItems = items.filter((i) => i.isHtml && i.url);
    if (!htmlItems.length) return;
    setDownloadingAll(true);
    setDownloadStatus('מוריד קבצים למחשב…');
    for (let idx = 0; idx < htmlItems.length; idx++) {
      const it = htmlItems[idx];
      await triggerFileDownload(it.url, it.downloadName || `${it.id}.html`);
      setDownloadStatus(`הורדו ${idx + 1} מתוך ${htmlItems.length} קבצים…`);
      await new Promise((r) => setTimeout(r, 300));
    }
    setDownloadStatus(`הושלם! כל ${htmlItems.length} הטפסים נשמרו בתיקיית ההורדות.`);
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
            <strong>קטגוריות טפסים</strong>
            <span>{items.length} תבניות וטפסים פעילים</span>
          </div>
        </div>

        {/* חיפוש מהיר */}
        <div className="forms-search-box">
          <Search size={14} className="forms-search-icon" />
          <input
            type="text"
            className="forms-search-input"
            placeholder="חיפוש טופס, ספק, הסכם…"
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
                  <Icon size={16} className="forms-cat-icon" />
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
          >
            <Download size={13} /> {downloadingAll ? 'מוריד חבילה…' : 'הורד את כל הטפסים למחשב'}
          </button>
          {downloadStatus ? (
            <div className="forms-dl-status">{downloadStatus}</div>
          ) : null}
        </div>

        {/* טיפ תחתון */}
        <div className="forms-sidebar-footer">
          <Sparkles size={14} />
          <span>כל הטפסים מותאמים להדפסה נקייה ישירות ל-A4 ללא גלישה.</span>
        </div>
      </aside>

      {/* אזור ראשי: רשת כרטיסי תבניות */}
      <main className="forms-main-content">
        <header className="forms-content-header">
          <div>
            <h2 className="forms-content-title">
              {CATEGORIES.find((c) => c.id === activeCategory)?.label}
            </h2>
            <p className="forms-content-sub">
              נמצאו {filteredItems.length} טפסים {search ? `עבור החיפוש "${search}"` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="forms-dl-all-btn top-btn"
              disabled={downloadingAll}
              onClick={handleDownloadAll}
              title="הורדת כל קבצי הטפסים ישירות לתיקיית Downloads במחשב שלך"
            >
              <Download size={13} /> הורד את כל הטפסים
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
            <h3>לא נמצאו טפסים מתאימים</h3>
            <p>נסה לשנות את מונח החיפוש או לבחור בקטגוריה אחרת.</p>
            <button type="button" className="forms-reset-btn" onClick={() => { setSearch(''); setActiveCategory('all'); }}>
              הצג את כל הטפסים
            </button>
          </div>
        ) : (
          <div className="forms-grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="form-card">
                {/* כותרת עליונה של הכרטיס עם מיניאטורת A4 */}
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
                    {item.isHtml ? (
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
                          title="הדפסה מיידית / שמירה כ-PDF"
                          onClick={() => {
                            const win = window.open(item.url, '_blank', 'noopener');
                            if (win) {
                              win.addEventListener('load', () => {
                                setTimeout(() => { win.print(); }, 400);
                              });
                            }
                          }}
                        >
                          <Printer size={13} /> הדפסה
                        </button>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="form-btn is-open"
                          title="פתח בכרטיסייה חדשה לעריכה מלאה"
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
                    const iframe = document.getElementById('preview-doc-frame');
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.print();
                    }
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
