/**
 * Generates an elegant printable HTML sheet of QR stickers and master lockbox codes table.
 * Supports:
 *  1. 5x5 cm Key Safe Stickers (Recommended for physical lockboxes, 4 columns, 2 pages)
 *  2. All 41 units on a Single A4 Page (Compact, 6x7 grid)
 *  3. Searchable Master Lockbox Codes Table
 * Run: npx tsx services/resortos-agent/scripts/gen-qr-sheet.ts
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadRooms, ROOT } from '../src/config.js';
import { BOT_PHONE } from '../src/whatsapp/qrGenerator.js';

async function main() {
  const rooms = loadRooms();
  console.log(`Generating QR stickers & Lockbox Code Sheet for ${rooms.length} units...`);

  const cards5x5: string[] = [];
  const cardsCompact: string[] = [];
  const rows: string[] = [];

  for (const r of rooms) {
    const code = r.letterCode || r.name || r.id;
    const text = `START_${code.replace(/\s+/g, '_')}`;
    const url = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(text)}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 280,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    // 1. Standard 5x5 cm sticker (perfect for lockbox front door)
    cards5x5.push(`
      <div class="sticker-5x5">
        <div class="s5-top">
          <div class="s5-badge">${r.property || 'ResortOS'}</div>
          <div class="s5-code">${r.letterCode || r.name}</div>
        </div>
        <div class="s5-qr">
          <img src="${qrDataUrl}" alt="${code}" />
        </div>
        <div class="s5-bot">
          <div class="s5-cta">סריקה לפתיחת כספת</div>
          <div class="s5-th">สแกนเปิดตู้เซฟ</div>
        </div>
      </div>
    `);

    // 2. Compact single-page sticker (fits all 41 on 1 single A4 sheet)
    cardsCompact.push(`
      <div class="sticker-compact">
        <div class="sc-code">${r.letterCode || r.name}</div>
        <div class="sc-qr">
          <img src="${qrDataUrl}" alt="${code}" />
        </div>
        <div class="sc-sub">${r.property?.split(' ')[0] || ''}</div>
      </div>
    `);

    // 3. Table row
    rows.push(`
      <tr class="room-row" data-search="${(r.letterCode || '')} ${(r.name || '')} ${(r.property || '')} ${(r.lockbox || '')}">
        <td class="td-code"><span class="badge-code">${r.letterCode || '-'}</span></td>
        <td class="td-name"><strong>${r.name || r.id}</strong></td>
        <td class="td-complex">${r.property || 'כללי'}</td>
        <td class="td-lockbox"><span class="lockbox-pill">🔑 ${r.lockbox || 'לא מוגדר'}</span></td>
        <td class="td-action">
          <a href="${url}" target="_blank" class="test-link">בדוק בוואטסאפ ↗</a>
        </td>
      </tr>
    `);
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>דף קודי כספות ומדבקות QR - ResortOS</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    }
    body {
      background: #f1f5f9;
      padding: 20px;
      color: #0f172a;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    .header-bar {
      background: #ffffff;
      padding: 20px 24px;
      border-radius: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .header-title h1 {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
    }
    .header-title p {
      font-size: 13.5px;
      color: #64748b;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .btn {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn:hover { background: #0369a1; }
    .btn-green { background: #16a34a; }
    .btn-green:hover { background: #15803d; }
    
    .nav-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 10px 18px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      color: #475569;
    }
    .tab-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    /* Master Table View */
    .table-view {
      background: #ffffff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .search-input {
      width: 100%;
      padding: 12px 16px;
      font-size: 15px;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      outline: none;
      margin-bottom: 20px;
    }
    .search-input:focus { border-color: #0284c7; }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
    }
    th {
      background: #f8fafc;
      padding: 12px 14px;
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    tr:hover { background: #f8fafc; }
    .badge-code {
      display: inline-block;
      padding: 4px 8px;
      background: #f1f5f9;
      color: #0f172a;
      border-radius: 6px;
      font-weight: 800;
      font-size: 14px;
      border: 1px solid #cbd5e1;
    }
    .lockbox-pill {
      display: inline-block;
      padding: 4px 12px;
      background: #fef08a;
      color: #854d0e;
      border-radius: 8px;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: 0.5px;
      border: 1px solid #fde047;
    }
    .test-link {
      color: #0284c7;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
    }

    /* ---- 5x5 cm STICKERS VIEW ---- */
    .view-5x5 {
      display: none;
    }
    .grid-5x5 {
      display: grid;
      grid-template-columns: repeat(4, 46mm);
      gap: 4mm 5mm;
      justify-content: center;
    }
    .sticker-5x5 {
      width: 46mm;
      height: 46mm;
      border: 1px dashed #64748b;
      border-radius: 6mm;
      padding: 2.5mm 1.5mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      page-break-inside: avoid;
    }
    .s5-top {
      line-height: 1;
    }
    .s5-badge {
      font-size: 7.5px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 1px;
    }
    .s5-code {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.3px;
    }
    .s5-qr img {
      width: 26mm;
      height: 26mm;
      display: block;
    }
    .s5-bot {
      line-height: 1.05;
    }
    .s5-cta {
      font-size: 7px;
      font-weight: 800;
      color: #0f172a;
    }
    .s5-th {
      font-size: 6px;
      color: #64748b;
    }

    /* ---- SINGLE-PAGE COMPACT VIEW (All 41 on 1 page) ---- */
    .view-compact {
      display: none;
    }
    .grid-compact {
      display: grid;
      grid-template-columns: repeat(6, 31mm);
      gap: 2.5mm 3mm;
      justify-content: center;
    }
    .sticker-compact {
      width: 31mm;
      height: 35mm;
      border: 1px dashed #64748b;
      border-radius: 4mm;
      padding: 1.5mm 1mm;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      page-break-inside: avoid;
    }
    .sc-code {
      font-size: 12px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1;
    }
    .sc-qr img {
      width: 22mm;
      height: 22mm;
      display: block;
    }
    .sc-sub {
      font-size: 6.5px;
      color: #64748b;
      font-weight: 700;
      line-height: 1;
    }

    @media print {
      body {
        background: transparent !important;
        padding: 0 !important;
      }
      .header-bar, .nav-tabs, .search-input, .test-link {
        display: none !important;
      }
      .table-view {
        display: none !important;
      }
      .grid-5x5 {
        gap: 3mm 4mm;
      }
      .sticker-5x5 {
        border: 1px dashed #475569 !important;
      }
      .sticker-compact {
        border: 1px dashed #475569 !important;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div class="header-title">
        <h1>🔑 לוח קודי כספות ומדבקות QR - ריזורט (41 יחידות)</h1>
        <p>מספר הבוט בוואטסאפ: <strong>051-526-2612</strong> · הדפסה על מדבקות או גזירה</p>
      </div>
      <div class="actions">
        <button class="btn btn-green" onclick="showTab('5x5'); window.print();">🖨️ הדפס מדבקות 5×5 ס״מ</button>
        <button class="btn" onclick="showTab('compact'); window.print();">📄 הדפס הכל בדף 1</button>
      </div>
    </div>

    <div class="nav-tabs">
      <button class="tab-btn active" id="btn-tab-table" onclick="showTab('table')">📋 טבלת קודי כספות מרוכזת (41 יחידות)</button>
      <button class="tab-btn" id="btn-tab-5x5" onclick="showTab('5x5')">🔲 מדבקות 5×5 ס״מ לכספת (מומלץ - 2 דפים)</button>
      <button class="tab-btn" id="btn-tab-compact" onclick="showTab('compact')">📄 הכל בדף A4 יחיד (קומפקטי - 41 מדבקות בדף 1)</button>
    </div>

    <!-- Tab 1: Master Code Table -->
    <div class="table-view" id="view-table">
      <input type="text" id="searchInput" class="search-input" placeholder="🔍 חיפוש חופשי לפי אות (B1, A2...), שם חדר (נופים, מול הנוף, משרד...), או קוד כספת..." onkeyup="filterTable()" />
      <table>
        <thead>
          <tr>
            <th style="width: 80px;">אות חדר</th>
            <th>שם היחידה במערכת</th>
            <th>מתחם</th>
            <th style="width: 160px;">קוד כספת מפתח</th>
            <th style="width: 120px;">בדיקה</th>
          </tr>
        </thead>
        <tbody id="roomsTableBody">
          ${rows.join('\n')}
        </tbody>
      </table>
    </div>

    <!-- Tab 2: 5x5 cm Stickers (Ideal for key safe boxes) -->
    <div class="view-5x5" id="view-5x5">
      <div style="background:#fff; padding:12px 18px; border-radius:10px; margin-bottom:14px; font-size:13.5px; color:#475569; display:flex; justify-content:space-between; align-items:center;">
        <span>📏 <strong>גודל מדבקה:</strong> 4.6 ס״מ × 4.6 ס״מ (מותאם בדיוק לדלת של כספת מפתח פיזית). 2 דפי A4 סה״כ.</span>
        <button class="btn btn-green" onclick="window.print()">🖨️ הדפס עכשיו</button>
      </div>
      <div class="grid-5x5">
        ${cards5x5.join('\n')}
      </div>
    </div>

    <!-- Tab 3: Compact Single Page (All 41 on 1 A4 sheet) -->
    <div class="view-compact" id="view-compact">
      <div style="background:#fff; padding:12px 18px; border-radius:10px; margin-bottom:14px; font-size:13.5px; color:#475569; display:flex; justify-content:space-between; align-items:center;">
        <span>📄 <strong>כל 41 המדבקות על דף A4 בודד:</strong> גודל קומפקטי ~3.1 ס״מ × 3.5 ס״מ. חוסך נייר.</span>
        <button class="btn" onclick="window.print()">🖨️ הדפס עכשיו</button>
      </div>
      <div class="grid-compact">
        ${cardsCompact.join('\n')}
      </div>
    </div>
  </div>

  <script>
    function showTab(tab) {
      const vTable = document.getElementById('view-table');
      const v5x5 = document.getElementById('view-5x5');
      const vCompact = document.getElementById('view-compact');

      const bTable = document.getElementById('btn-tab-table');
      const b5x5 = document.getElementById('btn-tab-5x5');
      const bCompact = document.getElementById('btn-tab-compact');

      vTable.style.display = tab === 'table' ? 'block' : 'none';
      v5x5.style.display = tab === '5x5' ? 'block' : 'none';
      vCompact.style.display = tab === 'compact' ? 'block' : 'none';

      bTable.classList.toggle('active', tab === 'table');
      b5x5.classList.toggle('active', tab === '5x5');
      bCompact.classList.toggle('active', tab === 'compact');
    }

    function filterTable() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const rows = document.querySelectorAll('.room-row');
      rows.forEach(r => {
        const text = r.getAttribute('data-search').toLowerCase();
        r.style.display = text.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;

  // 1. Write to data/qr-stickers.html
  const targetData = path.join(ROOT, 'data', 'qr-stickers.html');
  writeFileSync(targetData, html, 'utf8');
  console.log(`Wrote -> ${targetData}`);

  // 2. Also save directly to user's Downloads folder if writable
  const downloadsPath = '/Users/user/Downloads/resortos-lockbox-codes.html';
  try {
    writeFileSync(downloadsPath, html, 'utf8');
    console.log(`Saved to Downloads -> ${downloadsPath}`);
  } catch (err: any) {
    console.log(`Note: could not write to Downloads automatically (${err?.message})`);
  }
}

main().catch(console.error);
