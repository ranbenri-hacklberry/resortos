import {
  collectRows,
  defaultReportDate,
  dutyUnitGroup,
  hebrewDateLabel
} from './dailyDutyReport.js';
import { fieldUnitDisplayName } from './fieldUnitCatalog.js';
import { lockboxCodeForUnit } from './guestProfileSeed.js';

/** Printable turnover checklist — one sheet per cabin. */
export const CLEANING_CHECKLIST_SECTIONS = [
  {
    id: 'bedroom',
    title: '1. חלל שינה',
    items: [
      {
        id: 'linens',
        label: 'החלפת מצעים מלאה: סדין, ציפה וציפיות לכריות (נקי, מתוח, ללא כתמים)'
      },
      {
        id: 'bed_towels',
        label: 'סידור מגבות על המיטה:',
        children: [
          { id: 'body_towels', label: 'מגבות גוף גדולות', blank: 'bodyTowels', hint: '2 לזוג + 1 לכל ילד' },
          { id: 'face_towels', label: 'מגבות פנים/ידיים', blank: 'faceTowels', hint: '2 לכל מיטה' }
        ]
      },
      {
        id: 'extra_beds',
        label: 'מיטות נוספות: סידור מיטת ילדים / פתיחת ספה (בהתאם להרכב בלבד)'
      },
      {
        id: 'nightstands',
        label: 'שידות לילה: ניגוב ובדיקת תקינות מנורות קריאה'
      }
    ]
  },
  {
    id: 'bathroom',
    title: '2. חדר רחצה ושירותים',
    items: [
      {
        id: 'bath_clean',
        label: 'חיטוי וניקיון מלא: אסלה (כולל מושב ובסיס), מקלחון, כיור ומראה'
      },
      {
        id: 'drain',
        label: 'בדיקת זרימת מים וניקוז: ללא סתימות או שיערות במקלחון'
      },
      {
        id: 'bath_textile',
        label: 'טקסטיל לאמבט:',
        children: [
          { id: 'sink_towel', label: 'מגבת פנים אחת ליד הכיור' },
          { id: 'bath_mat', label: 'שטיחון רגליים אחד ביציאה מהמקלחון' }
        ]
      },
      {
        id: 'bath_consumables',
        label: 'מתכלים:',
        children: [
          { id: 'toilet_paper', label: 'נייר טואלט: 1 במתקן + 2 גלילים רזרבה' },
          { id: 'toiletries', label: 'שמפו / מרכך / סבון גוף (בקבוקונים מלאים)' },
          { id: 'trash_bag', label: 'שקית פח מוחלפת ונקייה' }
        ]
      }
    ]
  },
  {
    id: 'kitchen',
    title: '3. מטבחון ועמדת קפה',
    items: [
      {
        id: 'fridge',
        label: 'מקרר: ריק מדברים של אורחים קודמים, מדפים נקיים ויבשים'
      },
      {
        id: 'appliances',
        label: 'מכשירי חשמל:',
        children: [
          { id: 'microwave', label: 'מיקרוגל נקי מפירורים ושאריות' },
          { id: 'kettle', label: 'קומקום מרוקן ממים וללא אבנית' },
          { id: 'stovetop', label: 'כיריים חשמליות: בדיקה שקיימות במגירה, נקיות ותקינות' }
        ]
      },
      {
        id: 'dishes',
        label: 'כלים וסכו״ם: בדיקה שכל הכלים בארונות שטופים, יבשים ומסודרים'
      },
      {
        id: 'hot_drinks',
        label: 'עמדת שתייה חמה (השלמת מתכלים):',
        children: [
          { id: 'nescafe', label: 'נס קפה' },
          { id: 'black_coffee', label: 'קפה שחור' },
          { id: 'white_sugar', label: 'סוכר לבן' },
          { id: 'brown_sugar', label: 'סוכר חום' },
          { id: 'tea', label: 'תה (2 סוגים שונים)' },
          { id: 'espresso', label: 'קפסולות אספרסו', blank: 'espressoCapsules', hint: 'יחידות' }
        ]
      },
      {
        id: 'dishwashing',
        label: 'שטיפת כלים: ספוגית חדשה + סמרטוט חדש + נוזל כלים מלא'
      }
    ]
  },
  {
    id: 'jacuzzi',
    title: '4. ג׳קוזי פנימי ומרפסת',
    items: [
      {
        id: 'jacuzzi_block',
        label: 'ג׳קוזי פנימי:',
        children: [
          { id: 'jacuzzi_clean', label: 'חיטוי וניקוי דפנות וקרקעית (ללא שיערות או סימני סבון)' },
          { id: 'jacuzzi_plug', label: 'בדיקת פקק: פקק קיים ותקין במקומו' },
          { id: 'jacuzzi_towel', label: 'מגבת/שטיחון רגליים נקי מקופל על דופן הג׳קוזי' }
        ]
      },
      {
        id: 'balcony_block',
        label: 'מרפסת:',
        children: [
          { id: 'balcony_furniture', label: 'ניגוב שולחן וכיסאות מאבק ולכלוך' },
          { id: 'balcony_floor', label: 'שטיפה קלה במים של רצפת המרפסת / הדק' },
          { id: 'ashtray', label: 'מאפרה נקייה וריקה מבדלים' }
        ]
      }
    ]
  },
  {
    id: 'energy',
    title: '5. בקרת אנרגיה ונעילה (חובה!)',
    items: [
      { id: 'ac_off', label: 'כיבוי מוחלט של כלל המזגנים בבקתה' },
      { id: 'lights_off', label: 'כיבוי כל התאורה (פנים וחוץ)' },
      { id: 'windows_locked', label: 'חלונות ודלתות הזזה נעולים' },
      { id: 'door_locked', label: 'נעילת דלת כניסה ראשית' }
    ]
  }
];

function esc(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

/** Suggested linen counts from the arriving / leaving party. */
export function suggestedChecklistCounts(people = {}) {
  const adults = Math.max(0, Number(people.adults) || 0);
  const children = Math.max(0, Number(people.children) || 0);
  const beds = Math.max(1, Math.ceil(Math.max(adults, 1) / 2));
  const bodyTowels = Math.max(2, adults > 0 ? 2 : 0) + children;
  return {
    bodyTowels: bodyTowels || 2,
    faceTowels: beds * 2,
    espressoCapsules: ''
  };
}

export function listCheckoutChecklistRooms({ bookings, units, dateStr, area = 'all' } = {}) {
  const day = dateStr || defaultReportDate();
  const unitsById = new Map((units || []).map((unit) => [unit.id, unit]));
  return collectRows(bookings, units, day, 'check_out_date', area).map((row) => {
    const unit = unitsById.get(row.unitId) || { id: row.unitId, name: row.unitName };
    const displayName = fieldUnitDisplayName(unit) || row.unitName;
    const group = dutyUnitGroup(row.unitId, row.unitName);
    const counts = suggestedChecklistCounts(row.people);
    return {
      ...row,
      displayName,
      group,
      lockbox: lockboxCodeForUnit(unit),
      counts
    };
  });
}

export function groupChecklistRoomsByComplex(rooms) {
  const buckets = new Map();
  for (const room of rooms || []) {
    const title = room.group || 'יחידות נוספות';
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title).push(room);
  }
  return [...buckets.entries()].map(([title, rows]) => ({ title, rows }));
}

function blankHtml(value) {
  const text = value === 0 || value ? String(value) : '';
  return `<span class="blank">${esc(text)}</span>`;
}

function renderItem(item, counts) {
  const kids = Array.isArray(item.children) ? item.children : [];
  if (!kids.length && !item.blank) {
    return `<li class="item"><span class="box"></span><span class="label">${esc(item.label)}</span></li>`;
  }
  if (!kids.length && item.blank) {
    const val = counts?.[item.blank];
    return `<li class="item"><span class="box"></span><span class="label">${esc(item.label)}: ${blankHtml(val)}</span></li>`;
  }
  const childHtml = kids.map((child) => {
    if (child.blank) {
      const val = counts?.[child.blank];
      const hint = child.hint ? ` <span class="hint">(${esc(child.hint)})</span>` : '';
      return `<li class="item sub"><span class="box"></span><span class="label">${esc(child.label)}: ${blankHtml(val)}${hint}</span></li>`;
    }
    return `<li class="item sub"><span class="box"></span><span class="label">${esc(child.label)}</span></li>`;
  }).join('');
  return `<li class="item parent"><span class="box"></span><span class="label">${esc(item.label)}</span><ul class="sublist">${childHtml}</ul></li>`;
}

function pageHtml(room, dateLabel) {
  const counts = room.counts || suggestedChecklistCounts(room.people);
  const people = room.peopleLabel || room.people?.label || '';
  const metaBits = [
    room.group,
    people,
    room.checkoutHour ? `יציאה ${room.checkoutHour}` : '',
    room.lockbox ? `כספת ${room.lockbox}` : ''
  ].filter(Boolean);

  const sections = CLEANING_CHECKLIST_SECTIONS.map((section) => `
    <section class="sec">
      <h2>${esc(section.title)}</h2>
      <ul class="list">
        ${(section.items || []).map((item) => renderItem(item, counts)).join('')}
      </ul>
    </section>
  `).join('');

  return `<article class="page">
    <header>
      <div>
        <div class="kicker">צ׳קליסט ניקיון · ${esc(dateLabel)}</div>
        <h1>${esc(room.displayName || room.unitName)}</h1>
        <div class="sub">${esc(metaBits.join(' · '))}</div>
      </div>
      <div class="cleaner">
        <div class="cleaner-label">מנקה אחראי/ת</div>
        <div class="cleaner-name">${esc(room.cleanerName || '______________')}</div>
      </div>
    </header>
    ${sections}
    <section class="sec notes">
      <h2>דיווח על תקלות / חוסרים הדורשים אחזקה</h2>
      <div class="lines"></div>
    </section>
    <footer>
      <div>חתימת עובד/ת הניקיון: ______________</div>
      <div class="brand">ResortOS</div>
    </footer>
  </article>`;
}

function checklistCss() {
  return `
    :root { font-family: "Helvetica Neue", Arial, sans-serif; color: #1c1917; }
    body { margin: 0; background: #fff; }
    .actions { padding: 16px 24px; }
    button { font: inherit; font-weight: 700; padding: 8px 14px; border: 1px solid #1c1917; background: #1c1917; color: #fff; border-radius: 8px; cursor: pointer; }
    .page {
      box-sizing: border-box;
      padding: 14mm 12mm;
      min-height: 100vh;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child { page-break-after: auto; break-after: auto; }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      border-bottom: 2px solid #1c1917;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .kicker { font-size: 11px; font-weight: 700; color: #57534e; letter-spacing: .02em; }
    h1 { margin: 4px 0 0; font-size: 22px; line-height: 1.2; }
    .sub { margin-top: 4px; font-size: 12px; color: #44403c; }
    .cleaner {
      min-width: 150px;
      text-align: left;
      border: 1.5px solid #1c1917;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .cleaner-label { font-size: 10px; font-weight: 700; color: #78716c; }
    .cleaner-name { margin-top: 4px; font-size: 15px; font-weight: 800; min-height: 1.2em; }
    .sec { margin-top: 10px; }
    .sec h2 {
      margin: 0 0 4px;
      font-size: 13px;
      font-weight: 800;
      background: #f5f5f4;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .list, .sublist { list-style: none; margin: 0; padding: 0; }
    .sublist { margin: 2px 0 2px 22px; }
    .item {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;
      padding: 3px 2px;
      font-size: 12px;
      line-height: 1.35;
    }
    .item.parent { display: block; }
    .item.parent > .box,
    .item.parent > .label { display: inline; vertical-align: top; }
    .item.parent > .box { margin-left: 8px; }
    .item.sub { font-size: 11.5px; }
    .box {
      flex: 0 0 auto;
      width: 13px;
      height: 13px;
      border: 1.5px solid #1c1917;
      border-radius: 2px;
      margin-top: 1px;
      display: inline-block;
    }
    .label { flex: 1 1 0; }
    .blank {
      display: inline-block;
      min-width: 36px;
      border-bottom: 1px solid #1c1917;
      text-align: center;
      font-weight: 800;
      padding: 0 4px;
    }
    .hint { color: #78716c; font-size: 10.5px; font-weight: 600; }
    .notes .lines {
      margin-top: 6px;
      height: 48px;
      border: 1px solid #d6d3d1;
      border-radius: 6px;
      background:
        repeating-linear-gradient(
          to bottom,
          transparent 0,
          transparent 15px,
          #e7e5e4 15px,
          #e7e5e4 16px
        );
    }
    footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #d6d3d1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 700;
    }
    .brand { font-size: 11px; color: #78716c; font-weight: 600; }
    @media print {
      .actions { display: none; }
      .page { padding: 8mm 8mm; min-height: auto; }
      .sec { break-inside: avoid; }
    }
  `;
}

export function buildCleaningChecklistHtml({ rooms, dateStr } = {}) {
  const list = Array.isArray(rooms) ? rooms : [];
  const dateLabel = hebrewDateLabel(dateStr || defaultReportDate());
  const title = `צ׳קליסט ניקיון · ${dateLabel}`;
  if (!list.length) {
    return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${esc(title)}</title></head>
      <body><p>אין חדרים נבחרים להדפסה.</p></body></html>`;
  }
  const pages = list.map((room) => pageHtml(room, dateLabel)).join('\n');
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${checklistCss()}</style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">הדפסה</button></div>
  ${pages}
</body>
</html>`;
}

export function printCleaningChecklists(options) {
  const html = buildCleaningChecklistHtml(options);
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) {
    window.alert('צריך לאשר חלון קופץ כדי להדפיס את הצ׳קליסט.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
  popup.focus();
  window.setTimeout(() => {
    try { popup.print(); } catch (_) {}
  }, 250);
}
