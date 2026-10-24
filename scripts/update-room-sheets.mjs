import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

// Approximate candle lighting time for Golan Heights / North Israel
function getShabbatEntryTime(date = new Date()) {
  const m = date.getMonth();
  const times = ['16:35', '17:00', '17:25', '18:45', '19:10', '19:25', '19:25', '19:00', '18:25', '17:35', '16:25', '16:15'];
  return times[m] || '17:35';
}

const shabbatTime = getShabbatEntryTime();

// 41 Units categorized strictly according to requirements
const RAW_UNITS = [
  // 1. בתי נורית (מושב רמות)
  { id: 'k671', property: 'בתי נורית', cabin: 'בתי נורית 1', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2310', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k673', property: 'בתי נורית', cabin: 'בתי נורית 2', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2320', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k674', property: 'בתי נורית', cabin: 'בתי נורית 3', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2330', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k675', property: 'בתי נורית', cabin: 'בתי נורית 4', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2340', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k676', property: 'בתי נורית', cabin: 'בתי נורית 5', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2350', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k677', property: 'בתי נורית', cabin: 'בתי נורית 6', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2360', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k678', property: 'בתי נורית', cabin: 'בתי נורית 7', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2370', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },
  { id: 'k679', property: 'בתי נורית', cabin: 'בתי נורית 8', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2380', ssid: 'MIALEES RESORT', pass: 'MIAL2026' },

  // 2. בקתות טוסקנה (מושב רמות)
  { id: 'k687', property: 'בקתות טוסקנה', cabin: 'טוסקנה · 1', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2710', ssid: 'Toscana', pass: '12345678' },
  { id: 'k688', property: 'בקתות טוסקנה', cabin: 'טוסקנה · 2', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2720', ssid: 'Toscana', pass: '12345678' },
  { id: 'k689', property: 'בקתות טוסקנה', cabin: 'טוסקנה · שאטו', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2730', ssid: 'Toscana', pass: '12345678' },

  // 3. טאג' מאהל (מושב רמות) — תווית מתחם: E/25
  { id: 'k808', property: "טאג' מאהל", complexTag: 'E/25', cabin: "טאג' מאהל · בקתה 1 (E/25)", loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2510', ssid: 'LUTUS', pass: '12345678' },
  { id: 'k809', property: "טאג' מאהל", complexTag: 'E/25', cabin: "טאג' מאהל · בקתה 2 (E/25)", loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2520', ssid: 'LUTUS', pass: '12345678' },
  { id: 'k810', property: "טאג' מאהל", complexTag: 'E/25', cabin: "טאג' מאהל · בקתה 3 (E/25)", loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2530', ssid: 'LUTUS', pass: '12345678' },
  { id: 'k811', property: "טאג' מאהל", complexTag: 'E/25', cabin: "טאג' מאהל · בקתה 4 (E/25)", loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2540', ssid: 'LUTUS', pass: '12345678' },

  // 4. מול הנוף (מושב רמות)
  { id: 'k680', property: 'מול הנוף', cabin: 'מול הנוף · בקתה 1', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2910', ssid: 'Mol_hanof', pass: '12345678' },
  { id: 'k681', property: 'מול הנוף', cabin: 'מול הנוף · בקתה 2', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2920', ssid: 'Mol_hanof', pass: '12345678' },
  { id: 'k682', property: 'מול הנוף', cabin: 'מול הנוף · בקתה 3', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2930', ssid: 'Mol_hanof', pass: '12345678' },
  { id: 'k683', property: 'מול הנוף', cabin: 'מול הנוף · בקתה 4', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2940', ssid: 'Mol_hanof', pass: '12345678' },
  { id: 'k684', property: 'מול הנוף', cabin: 'מול הנוף · בקתה 5', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2950', ssid: 'Mol_hanof', pass: '12345678' },

  // 5. נופים בלבן (מושב רמות)
  { id: 'k685', property: 'נופים בלבן', cabin: 'נופים בלבן · בקתה 1', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2810', ssid: 'TP-LINK_FA30', pass: '15107312' },
  { id: 'k686', property: 'נופים בלבן', cabin: 'נופים בלבן · בקתה 2', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2820', ssid: 'TP-LINK_FA30', pass: '15107312' },

  // 6. החצר המוסיקלית (מושב רמות)
  { id: 'k690', property: 'החצר המוסיקלית', cabin: 'חצר מוסיקלית · בקתה 1 (חליל)', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2610', ssid: 'Music yard', pass: '12345678' },
  { id: 'k691', property: 'החצר המוסיקלית', cabin: 'חצר מוסיקלית · בקתה 2 (מיתר)', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2620', ssid: 'Music yard', pass: '12345678' },
  { id: 'k692', property: 'החצר המוסיקלית', cabin: 'חצר מוסיקלית · בקתה 3 (פעמון)', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2630', ssid: 'Music yard', pass: '12345678' },

  // 7. בקתות מאיה (מושב רמות)
  { id: 'k693', property: 'בקתות מאיה', cabin: 'בקתות מאיה · בקתה 1', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2410', ssid: 'maya', pass: '12345678' },
  { id: 'k694', property: 'בקתות מאיה', cabin: 'בקתות מאיה · בקתה 2', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2420', ssid: 'maya', pass: '12345678' },
  { id: 'k695', property: 'בקתות מאיה', cabin: 'בקתות מאיה · בקתה 3', loc: 'מושב רמות, רמת הגולן', zone: 'ramot', lockbox: '2430', ssid: 'maya', pass: '12345678' },

  // 8. מיאליס ריזורט (מושב נאות גולן)
  { id: 'mialis-villa', property: 'מיאליס ריזורט', cabin: 'וילה מיאליס ריזורט', loc: 'מושב נאות גולן, דרום רמת הגולן', zone: 'neot-golan', lockbox: '3050', ssid: 'CASAMIA', pass: 'CASAMIA10' },
  { id: 'suite-1', property: 'מיאליס ריזורט', cabin: 'סוויטה 1 (הירוקה)', loc: 'מושב נאות גולן, דרום רמת הגולן', zone: 'neot-golan', lockbox: 'הקוד יימסר בהודעה', ssid: 'CASAMIA', pass: 'CASAMIA10' },
  { id: 'suite-2', property: 'מיאליס ריזורט', cabin: 'סוויטה 2 (הורודה)', loc: 'מושב נאות גולן, דרום רמת הגולן', zone: 'neot-golan', lockbox: 'הקוד יימסר בהודעה', ssid: 'CASAMIA', pass: 'CASAMIA10' },

  // 9. כיפת שמיים (מושב גבעת יואב)
  { id: 'dome-blue', property: 'כיפת שמיים', cabin: 'כיפת שמיים כחול', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: 'הקוד יימסר בהודעה', ssid: 'Kipat_Shamayim', pass: '12345678' },
  { id: 'dome-green', property: 'כיפת שמיים', cabin: 'כיפת שמיים ירוק', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: 'הקוד יימסר בהודעה', ssid: 'Kipat_Shamayim', pass: '12345678' },
  { id: 'dome-red', property: 'כיפת שמיים', cabin: 'כיפת שמיים אדום', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: 'הקוד יימסר בהודעה', ssid: 'Kipat_Shamayim', pass: '12345678' },

  // 10. צימר בגבעה (מושב גבעת יואב)
  { id: 'hill-1', property: 'צימר בגבעה', cabin: 'צימר בגבעה 1', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: '3041', ssid: 'Zimer_Giva', pass: '12345678' },
  { id: 'hill-2', property: 'צימר בגבעה', cabin: 'צימר בגבעה 2', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: '3042', ssid: 'Zimer_Giva', pass: '12345678' },
  { id: 'hill-3', property: 'צימר בגבעה', cabin: 'צימר בגבעה 3', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: '3043', ssid: 'Zimer_Giva', pass: '12345678' },
  { id: 'hill-4', property: 'צימר בגבעה', cabin: 'צימר בגבעה 4', loc: 'מושב גבעת יואב, דרום רמת הגולן', zone: 'givat-yoav', lockbox: '3044', ssid: 'Zimer_Giva', pass: '12345678' },

  // 11. קאסה נובה (מושב נוב)
  { id: 'k826', property: 'קאסה נובה', cabin: 'קאסה נובה · Aura', loc: 'מושב נוב, דרום רמת הגולן', zone: 'casa-nova', lockbox: 'הקוד יימסר בהודעה', ssid: 'MIALEES', pass: 'AD654321' },
  { id: 'k827', property: 'קאסה נובה', cabin: 'קאסה נובה · Bloom', loc: 'מושב נוב, דרום רמת הגולן', zone: 'casa-nova', lockbox: 'הקוד יימסר בהודעה', ssid: 'MIALEES', pass: 'AD654321' }
];

console.log(`Generating high-res QR codes for ${RAW_UNITS.length} units...`);
for (const unit of RAW_UNITS) {
  const guestUrl = `https://resortos.app/guest?unit=${encodeURIComponent(unit.id)}`;
  unit.qr = await QRCode.toDataURL(guestUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#1c1917', light: '#ffffff' }
  });
}

function buildHtml(units) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>דפי חדר A4 — מיאליס ריזורט</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800;900&family=David+Libre:wght@500;700&family=Frank+Ruhl+Libre:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-sheet: #FDFBF7;
      --ink-primary: #1C1917;
      --ink-secondary: #44403C;
      --ink-muted: #78716C;
      --gold-primary: #C5A059;
      --gold-deep: #9E7D3B;
      --gold-light: #F7F1E5;
      --gold-subtle: rgba(197, 160, 89, 0.12);
      --border-fine: #E7DFCE;
      --border-dark: #292524;
      --alert-bg: #FEF2F2;
      --alert-border: #FCA5A5;
      --alert-text: #991B1B;
      --shabbat-bg: #FFF7ED;
      --shabbat-border: #EA580C;
      --shabbat-text: #7C2D12;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      background: #EAE3D2;
      color: var(--ink-primary);
      font-family: 'Assistant', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      direction: rtl;
    }

    /* ---- TOOLBAR (SCREEN ONLY) ---- */
    .toolbar {
      max-width: 210mm;
      margin: 16px auto;
      padding: 12px 18px;
      background: #FFFFFF;
      border: 1px solid #D6CEBE;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .toolbar label {
      font-size: 14px;
      font-weight: 700;
      color: var(--ink-secondary);
    }
    .toolbar select {
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      padding: 7px 12px;
      border: 1.5px solid #C5A059;
      background: #FFFDF9;
      color: var(--ink-primary);
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    }
    .toolbar .btn {
      font: inherit;
      font-size: 13.5px;
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .btn-primary {
      background: var(--ink-primary);
      color: #FFFDF9;
    }
    .btn-primary:hover { background: #292524; }
    .btn-gold {
      background: var(--gold-primary);
      color: #1C1917;
    }
    .btn-gold:hover { background: var(--gold-deep); color: #FFF; }
    .toolbar-hint {
      width: 100%;
      font-size: 12px;
      color: var(--ink-muted);
      border-top: 1px dashed #E2DAC8;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
    }

    /* ---- A4 SHEET PAGE ---- */
    .sheet-wrapper {
      margin: 0 auto 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      background: var(--bg-sheet);
      color: var(--ink-primary);
      padding: 8mm 9mm 6mm;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Inner Frame & Double Border */
    .sheet-inner {
      height: 100%;
      border: 2px solid var(--ink-primary);
      padding: 6mm 7.5mm 4.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .sheet-inner::before {
      content: "";
      position: absolute;
      top: 2.2mm;
      left: 2.2mm;
      right: 2.2mm;
      bottom: 2.2mm;
      border: 0.8px solid var(--gold-primary);
      pointer-events: none;
    }

    /* Corner Luxury Accents */
    .corner-ornament {
      position: absolute;
      width: 12mm;
      height: 12mm;
      pointer-events: none;
      border-color: var(--gold-primary);
    }
    .corner-tl { top: 3.5mm; right: 3.5mm; border-top: 2px solid var(--gold-primary); border-right: 2px solid var(--gold-primary); }
    .corner-tr { top: 3.5mm; left: 3.5mm; border-top: 2px solid var(--gold-primary); border-left: 2px solid var(--gold-primary); }
    .corner-bl { bottom: 3.5mm; right: 3.5mm; border-bottom: 2px solid var(--gold-primary); border-right: 2px solid var(--gold-primary); }
    .corner-br { bottom: 3.5mm; left: 3.5mm; border-bottom: 2px solid var(--gold-primary); border-left: 2px solid var(--gold-primary); }

    /* ---- SHABBAT BANNER (CASA NOVA FRIDAY) ---- */
    .shabbat-alert-banner {
      background: var(--shabbat-bg);
      border: 1.5px solid var(--shabbat-border);
      border-radius: 8px;
      padding: 6px 12px;
      margin-bottom: 2.5mm;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--shabbat-text);
      font-size: 11.5px;
      line-height: 1.35;
      box-shadow: 0 1px 4px rgba(234, 88, 12, 0.12);
    }
    .shabbat-alert-banner strong {
      color: #7C2D12;
      font-size: 12.5px;
      display: inline;
    }
    .shabbat-alert-icon {
      font-size: 22px;
      flex-shrink: 0;
    }

    /* ---- HEADER ---- */
    .header {
      text-align: center;
      padding-bottom: 2.5mm;
      border-bottom: 1.5px solid var(--ink-primary);
      position: relative;
    }
    .brand-crown {
      font-size: 11px;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--gold-deep);
      font-weight: 800;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .brand-crown::before, .brand-crown::after {
      content: "—";
      color: var(--gold-primary);
      letter-spacing: 0;
    }
    .welcome-title {
      font-family: 'Frank Ruhl Libre', 'David Libre', serif;
      font-size: 32px;
      font-weight: 900;
      color: var(--ink-primary);
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin: 1px 0;
    }
    .unit-hero-name {
      font-size: 20px;
      font-weight: 800;
      color: var(--gold-deep);
      margin-top: 1px;
      display: inline-block;
      padding: 2px 14px;
      background: var(--gold-subtle);
      border-radius: 20px;
      border: 1px solid rgba(197, 160, 89, 0.4);
    }
    .prop-location {
      font-size: 12px;
      color: var(--ink-muted);
      margin-top: 2px;
      font-weight: 600;
    }

    /* ---- TIMES ROW ---- */
    .times-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 3mm;
      margin: 2.5mm 0;
      text-align: center;
    }
    .time-card {
      background: #FFFFFF;
      border: 1px solid var(--border-fine);
      border-radius: 6px;
      padding: 2.5mm 2mm;
      box-shadow: 0 1px 4px rgba(0,0,0,0.02);
    }
    .time-label {
      font-size: 10.5px;
      font-weight: 700;
      color: var(--ink-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 1px;
    }
    .time-val {
      font-size: 20px;
      font-weight: 900;
      color: var(--ink-primary);
      line-height: 1.1;
      font-family: 'Assistant', sans-serif;
    }
    .time-val.saturday {
      font-size: 17px;
      color: var(--gold-deep);
    }

    /* ---- ACCESS & CODES GRID ---- */
    .access-grid {
      display: grid;
      grid-template-columns: 1fr 1.15fr 1.25fr;
      gap: 3mm;
      margin-bottom: 2.5mm;
    }
    .access-card {
      background: #FFFFFF;
      border: 1px solid var(--border-fine);
      border-top: 3px solid var(--gold-primary);
      border-radius: 6px;
      padding: 2.5mm 3mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 28mm;
    }
    .access-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--ink-secondary);
      margin-bottom: 2px;
    }
    .access-icon {
      font-size: 12.5px;
    }
    .access-value {
      font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 22px;
      font-weight: 900;
      color: var(--ink-primary);
      direction: ltr;
      text-align: center;
      letter-spacing: 0.08em;
      line-height: 1.15;
      padding: 1px 0;
    }
    .access-value.is-text {
      font-family: 'Assistant', sans-serif;
      font-size: 12px;
      font-weight: 700;
      direction: rtl;
      letter-spacing: normal;
      line-height: 1.35;
      color: var(--ink-primary);
      text-align: center;
      padding: 0;
    }
    .access-sub {
      font-size: 9.5px;
      color: var(--ink-muted);
      text-align: center;
      line-height: 1.25;
      margin-top: 1px;
    }
    .wifi-details {
      display: flex;
      flex-direction: column;
      gap: 2.5px;
      direction: ltr;
      text-align: left;
    }
    .wifi-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
      border-bottom: 1px dotted #EAE2D2;
      padding-bottom: 1px;
    }
    .wifi-row .w-label {
      font-size: 9.5px;
      color: var(--ink-muted);
      direction: rtl;
    }
    .wifi-row .w-val {
      font-family: ui-monospace, Menlo, monospace;
      font-weight: 800;
      color: var(--ink-primary);
      font-size: 12px;
    }

    /* ---- HOUSE RULES & REGULATIONS BOX ---- */
    .rules-section {
      background: #FFFDF9;
      border: 1.5px solid var(--gold-primary);
      border-radius: 8px;
      padding: 3mm 4.5mm 2.5mm;
      box-shadow: 0 2px 8px rgba(197, 160, 89, 0.08);
      margin-bottom: 2.5mm;
    }
    .rules-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(197, 160, 89, 0.35);
      padding-bottom: 2mm;
      margin-bottom: 2.5mm;
    }
    .rules-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 900;
      color: var(--ink-primary);
    }
    .rules-badge {
      font-size: 9.5px;
      font-weight: 800;
      padding: 1.5px 7px;
      border-radius: 4px;
      background: var(--alert-bg);
      border: 1px solid var(--alert-border);
      color: var(--alert-text);
      letter-spacing: 0.04em;
    }

    .rules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2mm 5mm;
    }
    .rule-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 10.2px;
      line-height: 1.35;
      color: var(--ink-secondary);
    }
    .rule-icon {
      font-size: 13px;
      line-height: 1.1;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .rule-item strong {
      color: var(--ink-primary);
      font-weight: 800;
    }

    /* ---- DIGITAL GUEST HUB & QR ---- */
    .digital-hub {
      background: var(--gold-light);
      border: 1.5px solid var(--gold-primary);
      border-radius: 8px;
      padding: 3mm 4.5mm;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 4.5mm;
      margin-bottom: 2.5mm;
    }
    .hub-content h3 {
      font-size: 13.5px;
      font-weight: 900;
      color: var(--ink-primary);
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hub-content p {
      font-size: 10.2px;
      line-height: 1.35;
      color: var(--ink-secondary);
      margin-bottom: 3px;
    }
    .hub-highlights {
      display: flex;
      flex-wrap: wrap;
      gap: 3px 8px;
      font-size: 9.8px;
      font-weight: 700;
      color: var(--gold-deep);
    }
    .hub-highlights span {
      background: rgba(197, 160, 89, 0.16);
      padding: 1px 6px;
      border-radius: 3px;
    }
    .hub-qr-wrap {
      text-align: center;
      background: #FFFFFF;
      padding: 2.5mm;
      border: 1px solid var(--gold-primary);
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.06);
    }
    .hub-qr {
      width: 25mm;
      height: 25mm;
      display: block;
      image-rendering: pixelated;
    }
    .qr-caption {
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: var(--ink-primary);
      margin-top: 2px;
      text-transform: uppercase;
    }

    /* ---- FOOTER & SERVICE CONTACT ---- */
    .footer {
      border-top: 1.5px solid var(--ink-primary);
      padding-top: 2.2mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 3.5mm;
    }
    .service-box {
      background: #FFFFFF;
      border: 1.5px solid var(--gold-primary);
      border-radius: 7px;
      padding: 2.2mm 3.8mm;
      display: flex;
      flex-direction: column;
      gap: 1.5px;
      box-shadow: 0 1px 4px rgba(197, 160, 89, 0.15);
      flex: 1.15;
    }
    .s-label {
      font-size: 10px;
      font-weight: 800;
      color: var(--ink-secondary);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .s-phone {
      font-size: 18px;
      font-weight: 900;
      color: var(--gold-deep);
      direction: ltr;
      text-align: right;
      letter-spacing: 0.05em;
      line-height: 1.15;
    }
    .s-hours {
      font-size: 8.8px;
      color: var(--ink-muted);
      line-height: 1.3;
      margin-top: 1.5px;
    }
    .checkout-instructions {
      font-size: 9.6px;
      color: var(--ink-muted);
      line-height: 1.35;
      text-align: right;
      direction: rtl;
      flex: 1;
    }
    .checkout-instructions strong {
      color: var(--ink-primary);
    }

    /* ---- PRINT RULES (SINGLE A4 PER PAGE STRICT) ---- */
    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        background: #FFFFFF !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .toolbar {
        display: none !important;
      }
      .sheet-wrapper {
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
      }
      .sheet {
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        box-shadow: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }
      .sheet:last-of-type {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  </style>
</head>
<body>

  <!-- TOP TOOLBAR -->
  <div class="toolbar" id="toolbar">
    <div class="toolbar-group">
      <label for="unit-select">בחר יחידה לתצוגה:</label>
      <select id="unit-select"></select>
      <label style="margin-right: 14px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 700; color: #9A3412;">
        <input type="checkbox" id="friday-toggle" style="cursor: pointer; width: 16px; height: 16px;">
        <span>🕯️ תצוגת יום שישי (הודעת שבת לקאסה נובה)</span>
      </label>
    </div>
    <div class="toolbar-group">
      <button type="button" class="btn btn-gold" onclick="window.print()">🖨️ הדפס דף זה (A4)</button>
      <button type="button" class="btn btn-primary" onclick="printAllUnits()">📚 הפק להדפסה את כל 41 היחידות</button>
    </div>
    <div class="toolbar-hint">
      <span>💡 מוגדר בדיוק למידות A4 בעמוד אחד. בחלון ההדפסה יש לסמן <strong>Background graphics</strong> ולבטל <strong>Headers and footers</strong>.</span>
      <span id="unit-counter">יחידה 1 מתוך 41</span>
    </div>
  </div>

  <!-- A4 PRINTABLE SHEET -->
  <div class="sheet-wrapper" id="sheet-wrapper">
    <article class="sheet" id="sheet">
      <div class="sheet-inner">
        <!-- Corner Accents -->
        <div class="corner-ornament corner-tl"></div>
        <div class="corner-ornament corner-tr"></div>
        <div class="corner-ornament corner-bl"></div>
        <div class="corner-ornament corner-br"></div>

        <!-- SHABBAT BANNER (FOR CASA NOVA ON FRIDAYS) -->
        <div class="shabbat-alert-banner" id="shabbat-alert-banner" style="display: none;">
          <span class="shabbat-alert-icon">🕯️</span>
          <div class="shabbat-alert-content">
            <strong>הודעת שבת חשובה — קאסה נובה (מושב דתי):</strong>
            השער נסגר אוטומטית בכניסת שבת (<span id="shabbat-time-val">${shabbatTime}</span>). בימי שישי חובה להגיע לפני שעה זו! אחרי השעה הזו לא ניתן להיכנס עם רכב למושב עד צאת שבת.
          </div>
        </div>

        <!-- HEADER -->
        <header class="header">
          <div class="brand-crown">MIALEES RESORT COLLECTION · קולקציית האירוח מיאליס</div>
          <h1 class="welcome-title">ברוכים הבאים</h1>
          <div>
            <span class="unit-hero-name" id="hero-unit-name">טוסקנה · 1</span>
          </div>
          <div class="prop-location" id="prop-location">מושב רמות, רמת הגולן</div>
        </header>

        <!-- CHECK-IN / CHECK-OUT TIMES -->
        <div class="times-row">
          <div class="time-card">
            <div class="time-label">שעת כניסה (צ׳ק-אין)</div>
            <div class="time-val">15:00</div>
          </div>
          <div class="time-card">
            <div class="time-label">שעת יציאה (צ׳ק-אאוט)</div>
            <div class="time-val">11:00</div>
          </div>
          <div class="time-card">
            <div class="time-label">יציאה בשבת</div>
            <div class="time-val saturday" id="saturday-val">15:00</div>
          </div>
        </div>

        <!-- ACCESS & CONNECTIVITY -->
        <div class="access-grid">
          <!-- Key Safe / Lockbox -->
          <div class="access-card" id="lockbox-card">
            <div class="access-header">
              <span class="access-icon">🔑</span>
              <span>כספת מפתח</span>
            </div>
            <div class="access-value" id="lockbox-val">2710</div>
            <div class="access-sub" id="lockbox-sub">קוד פתיחה ונעילת מפתח היחידה</div>
          </div>

          <!-- Village Gate Code -->
          <div class="access-card" id="gate-card">
            <div class="access-header">
              <span class="access-icon">🚪</span>
              <span id="gate-header-text">שער כניסה</span>
            </div>
            <div class="access-value" id="gate-val">#2464</div>
            <div class="access-sub" id="gate-sub">קוד שער מושב רמות</div>
          </div>

          <!-- Wi-Fi -->
          <div class="access-card" id="wifi-card">
            <div class="access-header">
              <span class="access-icon">📶</span>
              <span>אינטרנט אלחוטי (Wi-Fi)</span>
            </div>
            <div class="wifi-details">
              <div class="wifi-row">
                <span class="w-label">רשת:</span>
                <span class="w-val" id="wifi-ssid">Toscana</span>
              </div>
              <div class="wifi-row">
                <span class="w-label">סיסמה:</span>
                <span class="w-val" id="wifi-pass">12345678</span>
              </div>
            </div>
            <div class="access-sub">חיבור חופשי לאורחי המתחם</div>
          </div>
        </div>

        <!-- HOUSE RULES & PROHIBITIONS -->
        <section class="rules-section">
          <div class="rules-header">
            <div class="rules-title">
              <span>📋</span>
              <span>כללי האירוח והשהייה במתחם — לתשומת לבכם ולמען חופשה נעימה</span>
            </div>
            <span class="rules-badge">תקנון המתחם</span>
          </div>

          <div class="rules-grid">
            <div class="rule-item">
              <span class="rule-icon">🚭</span>
              <div>
                <strong>איסור עישון מוחלט בחדר:</strong> העישון (כולל סיגריות, נרגילה ואידוי / Vape) מותר אך ורק במרפסות ובחצר הפתוחה. עישון בתוך היחידה אסור בהחלט ויגרור חיוב דמי ניקוי מיוחד ע״ס ₪500.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🔇</span>
              <div>
                <strong>שקט, שלווה ואיסור מסיבות:</strong> חל איסור על הכנסת מערכות הגברה, רמקולים ניידים (בוקסות), קריוקי ומסיבות. יש לשמור על שקט מוחלט בין 23:00 ל-07:00 ובין 14:00 ל-16:00.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🥩</span>
              <div>
                <strong>הדלקת אש ומנגל (BBQ):</strong> מותרת אך ורק בעמדות המנגל המוסדרות בחצר, ולעולם לא על גבי דק העץ או בתוך המבנה. אין להבעיר אש בשבת.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">👥</span>
              <div>
                <strong>אורחים ומבקרים:</strong> השהייה מיועדת אך ורק למספר האורחים הנקוב בהזמנה המאושרת. חל איסור על הכנסת אורחים נוספים או לינה ללא תיאום ואישור מראש.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🛁</span>
              <div>
                <strong>בטיחות בג׳קוזי ובריכה:</strong> חובה לוודא שגובה המים מכסה את כל פתחי הסילונים (הג׳טים) לפני הפעלת המתג למניעת שריפת מנוע. חל איסור על כלי זכוכית, שמנים או סבונים במים.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🐾</span>
              <div>
                <strong>בעלי חיים וחיות מחמד:</strong> כניסת חיות מחמד אסורה בהחלט, אלא אם תואמה ואושרה מראש ובכתב מול הנהלת הריזורט טרם ההגעה.
              </div>
            </div>
          </div>
        </section>

        <!-- DIGITAL GUEST HUB & QR -->
        <div class="digital-hub">
          <div class="hub-content">
            <h3><span>📱</span><span>דף האורח הדיגיטלי והמדריך המלא שלכם</span></h3>
            <p>
              סרקו את הקוד עם מצלמת הטלפון לפתיחת פורטל השהייה: ניווט מדויק, המלצות על מסעדות מקומיות וקצביות, מעיינות נסתרים, מדריכי הפעלה ליחידה, וצ׳ק-אאוט דיגיטלי בקליק.
            </p>
            <div class="hub-highlights">
              <span>🍽️ מסעדות מומלצות</span>
              <span>🌿 מעיינות ואטרקציות</span>
              <span>📺 מדריך ג׳קוזי ו-TV</span>
              <span>💬 וואטסאפ שירות מהיר</span>
            </div>
          </div>
          <div class="hub-qr-wrap">
            <img id="hub-qr-img" class="hub-qr" alt="QR Code" src="" />
            <div class="qr-caption">סריקה במצלמה</div>
          </div>
        </div>

        <!-- FOOTER & SERVICE CONTACT -->
        <footer class="footer">
          <div class="service-box">
            <div class="s-label">📞 שירות בשטח וסיוע לאורחים</div>
            <div class="s-phone" id="service-phone">050-950-6222</div>
            <div class="s-hours">השירות פעיל עד השעה 21:00 בערב · ניתן להשאיר הודעות אחרי 21:00 ונתייחס אליהן על הבוקר</div>
          </div>

          <div class="checkout-instructions">
            <div><strong>הנחיות עזיבה (עד 11:00):</strong> ביציאה מחזירים את המפתח לכספת ונועלים אותה. צ׳ק-אאוט עצמי בלחיצה אחת דרך הקישור בטלפון החל מ-08:00 בבוקר.</div>
          </div>
        </footer>
      </div>
    </article>
  </div>

  <script>
    const SHABBAT_ENTRY_TIME = '${shabbatTime}';
    const UNITS = ${JSON.stringify(units, null, 2)};

    const select = document.getElementById('unit-select');
    const counter = document.getElementById('unit-counter');
    const fridayToggle = document.getElementById('friday-toggle');

    // Auto-detect Friday
    if (new Date().getDay() === 5) {
      fridayToggle.checked = true;
    }

    // Populate dropdown with pure Hebrew names — NO Kinorot internal codes (k687 etc.)
    UNITS.forEach((unit) => {
      const option = document.createElement('option');
      option.value = unit.id;
      option.textContent = unit.property + ' — ' + unit.cabin;
      select.appendChild(option);
    });

    function applyUnitToSheet(sheetElement, unit, isFriday) {
      // Unit title and location
      sheetElement.querySelector('#hero-unit-name').textContent = unit.cabin;
      sheetElement.querySelector('#prop-location').textContent = unit.loc;

      // Shabbat exit time
      sheetElement.querySelector('#saturday-val').textContent = (unit.zone === 'casa-nova') ? 'צאת השבת' : '15:00';

      // Field service phone is 050-950-6222
      sheetElement.querySelector('#service-phone').textContent = '050-950-6222';

      // Lockbox logic (Rule 1):
      // Exact code from room sheet, never copied, if no code write 'הקוד יימסר בהודעה', no 0000.
      const lockboxValEl = sheetElement.querySelector('#lockbox-val');
      const lockboxSubEl = sheetElement.querySelector('#lockbox-sub');
      const lockbox = String(unit.lockbox || '').trim();
      const isPlainCode = /^\\d{4}$/.test(lockbox);

      if (isPlainCode) {
        lockboxValEl.className = 'access-value';
        lockboxValEl.textContent = lockbox;
        lockboxSubEl.textContent = 'קוד פתיחה ונעילת מפתח היחידה';
      } else {
        lockboxValEl.className = 'access-value is-text';
        lockboxValEl.textContent = 'הקוד יימסר בהודעה';
        lockboxSubEl.textContent = 'קוד כספת המפתח יישלח ביום ההגעה';
      }

      // Gate logic (Rule 3):
      const gateValEl = sheetElement.querySelector('#gate-val');
      const gateSubEl = sheetElement.querySelector('#gate-sub');
      const gateHeaderEl = sheetElement.querySelector('#gate-header-text');

      if (unit.zone === 'neot-golan' || unit.zone === 'givat-yoav') {
        gateHeaderEl.textContent = 'שער כניסה';
        gateValEl.className = 'access-value is-text';
        gateValEl.innerHTML = 'השער נפתח רק למספרים שמורים.<br>בהגעה התקשרו לאדם: <strong style="direction:ltr; display:inline-block; font-size:15px; color:#1C1917; font-weight:900;">054-338-7383</strong>';
        gateSubEl.textContent = 'פתיחת שער המושב עם ההגעה';
      } else if (unit.zone === 'casa-nova') {
        gateHeaderEl.textContent = 'שער כניסה (מושב דתי)';
        gateValEl.className = 'access-value is-text';
        gateValEl.innerHTML = 'השער נסגר אוטומטית בכניסת שבת (' + SHABBAT_ENTRY_TIME + '). בימי שישי הגיעו לפני שעה זו. אין כניסת רכב עד צאת שבת.';
        gateSubEl.textContent = 'קאסה נובה במושב דתי שומר שבת';
      } else {
        // Ramot
        gateHeaderEl.textContent = 'שער כניסה';
        gateValEl.className = 'access-value';
        gateValEl.textContent = '#2464';
        gateSubEl.textContent = 'קוד שער מושב רמות';
      }

      // Wi-Fi (Rule 2)
      sheetElement.querySelector('#wifi-ssid').textContent = unit.ssid || 'רשת זמינה במקום';
      sheetElement.querySelector('#wifi-pass').textContent = unit.pass || 'ללא סיסמה';

      // QR Code
      const qrImg = sheetElement.querySelector('#hub-qr-img');
      qrImg.setAttribute('src', unit.qr);
      qrImg.src = unit.qr;

      // Casa Nova Shabbat Notice on Fridays (Rule 4)
      const shabbatBanner = sheetElement.querySelector('#shabbat-alert-banner');
      if (shabbatBanner) {
        if (unit.zone === 'casa-nova' && isFriday) {
          shabbatBanner.style.display = 'flex';
          const timeEl = shabbatBanner.querySelector('#shabbat-time-val');
          if (timeEl) timeEl.textContent = SHABBAT_ENTRY_TIME;
        } else {
          shabbatBanner.style.display = 'none';
        }
      }
    }

    function renderUnit(unit) {
      if (!unit) return;
      const sheet = document.getElementById('sheet');
      applyUnitToSheet(sheet, unit, fridayToggle.checked);

      const currIdx = UNITS.findIndex(u => u.id === unit.id);
      counter.textContent = 'יחידה ' + (currIdx + 1) + ' מתוך ' + UNITS.length;
    }

    select.addEventListener('change', () => {
      const selected = UNITS.find(u => u.id === select.value);
      renderUnit(selected);
    });

    fridayToggle.addEventListener('change', () => {
      const selected = UNITS.find(u => u.id === select.value);
      renderUnit(selected);
    });

    // Initial render
    renderUnit(UNITS[0]);

    // Batch Print Function (All 41 Units, strictly single page per unit)
    function printAllUnits() {
      const wrapper = document.getElementById('sheet-wrapper');
      const originalContent = wrapper.innerHTML;
      const baseSheetTemplate = document.getElementById('sheet').outerHTML;
      const isFriday = fridayToggle.checked;

      let allSheetsHtml = '';
      UNITS.forEach((unit) => {
        const div = document.createElement('div');
        div.innerHTML = baseSheetTemplate;
        const sheet = div.firstElementChild;
        applyUnitToSheet(sheet, unit, isFriday);
        allSheetsHtml += sheet.outerHTML;
      });

      wrapper.innerHTML = allSheetsHtml;
      window.print();

      // Restore single sheet view
      setTimeout(() => {
        wrapper.innerHTML = originalContent;
        renderUnit(UNITS.find(u => u.id === select.value));
      }, 1000);
    }
  </script>
</body>
</html>
`;
}

// Generate the master room sheet HTML
const masterHtml = buildHtml(RAW_UNITS);
const outputPath = new URL('../public/room-sheet-a4.html', import.meta.url).pathname;
writeFileSync(outputPath, masterHtml, 'utf8');
console.log(`Saved master template to ${outputPath}`);

// Generate Samples HTML with 11 fictional guests (one per complex)
const SAMPLES_COMPLEXES = [
  { name: 'בתי נורית', unitId: 'k671', guest: 'משפחת ישראלי (דוד ושרה)', cin: '2026-11-12', cout: '2026-11-14', guests: 'זוג + 2 ילדים' },
  { name: 'בקתות טוסקנה', unitId: 'k687', guest: 'רועי ושיר כהן', cin: '2026-11-13', cout: '2026-11-15', guests: 'זוג' },
  { name: "טאג' מאהל", unitId: 'k808', guest: 'יונתן ומיכל לוי', cin: '2026-11-20', cout: '2026-11-22', guests: 'זוג' },
  { name: 'מול הנוף', unitId: 'k680', guest: 'עומר ונועה פרידמן', cin: '2026-11-19', cout: '2026-11-21', guests: 'זוג + 3 ילדים' },
  { name: 'נופים בלבן', unitId: 'k685', guest: 'איתי ומורן ברקוביץ׳', cin: '2026-11-26', cout: '2026-11-28', guests: 'זוג' },
  { name: 'החצר המוסיקלית', unitId: 'k690', guest: 'דניאל וטליה שרון', cin: '2026-11-27', cout: '2026-11-29', guests: 'זוג' },
  { name: 'בקתות מאיה', unitId: 'k693', guest: 'גיא ומאיה אברהם', cin: '2026-12-03', cout: '2026-12-05', guests: 'זוג + תינוק' },
  { name: 'מיאליס ריזורט', unitId: 'suite-1', guest: 'מתן ושני אלון', cin: '2026-12-04', cout: '2026-12-06', guests: 'זוג + ילד' },
  { name: 'כיפת שמיים', unitId: 'dome-blue', guest: 'עידו ועמית רז', cin: '2026-12-10', cout: '2026-12-12', guests: 'זוג' },
  { name: 'צימר בגבעה', unitId: 'hill-1', guest: 'אסף ודנה גולן', cin: '2026-12-11', cout: '2026-12-13', guests: 'זוג + 2 ילדים' },
  { name: 'קאסה נובה', unitId: 'k826', guest: 'בנימין ורבקה שוורץ', cin: '2026-12-18', cout: '2026-12-20', guests: 'זוג שומרי שבת' }
];

function buildSamplesHtml(complexes, units) {
  let sheetsHtml = '';
  for (const comp of complexes) {
    const unit = units.find(u => u.id === comp.unitId);
    if (!unit) continue;

    const isFriday = comp.name === 'קאסה נובה'; // showcase Friday banner on Casa Nova sample!
    const isCasaNova = unit.zone === 'casa-nova';

    // Lockbox text
    const isPlainCode = /^\\d{4}$/.test(unit.lockbox);
    const lockboxValClass = isPlainCode ? 'access-value' : 'access-value is-text';
    const lockboxVal = isPlainCode ? unit.lockbox : 'הקוד יימסר בהודעה';
    const lockboxSub = isPlainCode ? 'קוד פתיחה ונעילת מפתח היחידה' : 'קוד כספת המפתח יישלח ביום ההגעה';

    // Gate text
    let gateHeader = 'שער כניסה';
    let gateValClass = 'access-value';
    let gateValHtml = '#2464';
    let gateSub = 'קוד שער מושב רמות';

    if (unit.zone === 'neot-golan' || unit.zone === 'givat-yoav') {
      gateValClass = 'access-value is-text';
      gateValHtml = 'השער נפתח רק למספרים שמורים.<br>בהגעה התקשרו לאדם: <strong style="direction:ltr; display:inline-block; font-size:15px; color:#1C1917; font-weight:900;">054-338-7383</strong>';
      gateSub = 'פתיחת שער המושב עם ההגעה';
    } else if (unit.zone === 'casa-nova') {
      gateHeader = 'שער כניסה (מושב דתי)';
      gateValClass = 'access-value is-text';
      gateValHtml = 'השער נסגר אוטומטית בכניסת שבת (' + shabbatTime + '). בימי שישי הגיעו לפני שעה זו. אין כניסת רכב עד צאת שבת.';
      gateSub = 'קאסה נובה במושב דתי שומר שבת';
    }

    const saturdayVal = (unit.zone === 'casa-nova') ? 'צאת השבת' : '15:00';

    sheetsHtml += `
    <article class="sheet">
      <div class="sheet-inner">
        <div class="corner-ornament corner-tl"></div>
        <div class="corner-ornament corner-tr"></div>
        <div class="corner-ornament corner-bl"></div>
        <div class="corner-ornament corner-br"></div>

        ${isCasaNova ? `
        <div class="shabbat-alert-banner">
          <span class="shabbat-alert-icon">🕯️</span>
          <div class="shabbat-alert-content">
            <strong>הודעת שבת חשובה — קאסה נובה (מושב דתי):</strong>
            השער נסגר אוטומטית בכניסת שבת (<span>${shabbatTime}</span>). בימי שישי חובה להגיע לפני שעה זו! אחרי השעה הזו לא ניתן להיכנס עם רכב למושב עד צאת שבת.
          </div>
        </div>
        ` : ''}

        <header class="header">
          <div class="brand-crown">MIALEES RESORT COLLECTION · קולקציית האירוח מיאליס</div>
          <h1 class="welcome-title">ברוכים הבאים</h1>
          <div>
            <span class="unit-hero-name">${unit.cabin}</span>
          </div>
          <div class="prop-location">${unit.loc}</div>
          <div style="font-size: 11px; color: #9E7D3B; font-weight: 700; margin-top: 3px;">
            אירוח לדוגמה: ${comp.guest} · ${comp.guests} (תאריכים לדוגמה: ${comp.cin} עד ${comp.cout})
          </div>
        </header>

        <div class="times-row">
          <div class="time-card">
            <div class="time-label">שעת כניסה (צ׳ק-אין)</div>
            <div class="time-val">15:00</div>
          </div>
          <div class="time-card">
            <div class="time-label">שעת יציאה (צ׳ק-אאוט)</div>
            <div class="time-val">11:00</div>
          </div>
          <div class="time-card">
            <div class="time-label">יציאה בשבת</div>
            <div class="time-val saturday">${saturdayVal}</div>
          </div>
        </div>

        <div class="access-grid">
          <div class="access-card">
            <div class="access-header">
              <span class="access-icon">🔑</span>
              <span>כספת מפתח</span>
            </div>
            <div class="${lockboxValClass}">${lockboxVal}</div>
            <div class="access-sub">${lockboxSub}</div>
          </div>

          <div class="access-card">
            <div class="access-header">
              <span class="access-icon">🚪</span>
              <span>${gateHeader}</span>
            </div>
            <div class="${gateValClass}">${gateValHtml}</div>
            <div class="access-sub">${gateSub}</div>
          </div>

          <div class="access-card">
            <div class="access-header">
              <span class="access-icon">📶</span>
              <span>אינטרנט אלחוטי (Wi-Fi)</span>
            </div>
            <div class="wifi-details">
              <div class="wifi-row">
                <span class="w-label">רשת:</span>
                <span class="w-val">${unit.ssid}</span>
              </div>
              <div class="wifi-row">
                <span class="w-label">סיסמה:</span>
                <span class="w-val">${unit.pass}</span>
              </div>
            </div>
            <div class="access-sub">חיבור חופשי לאורחי המתחם</div>
          </div>
        </div>

        <section class="rules-section">
          <div class="rules-header">
            <div class="rules-title">
              <span>📋</span>
              <span>כללי האירוח והשהייה במתחם — לתשומת לבכם ולמען חופשה נעימה</span>
            </div>
            <span class="rules-badge">תקנון המתחם</span>
          </div>

          <div class="rules-grid">
            <div class="rule-item">
              <span class="rule-icon">🚭</span>
              <div>
                <strong>איסור עישון מוחלט בחדר:</strong> העישון (כולל סיגריות, נרגילה ואידוי / Vape) מותר אך ורק במרפסות ובחצר הפתוחה. עישון בתוך היחידה אסור בהחלט ויגרור חיוב דמי ניקוי מיוחד ע״ס ₪500.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🔇</span>
              <div>
                <strong>שקט, שלווה ואיסור מסיבות:</strong> חל איסור על הכנסת מערכות הגברה, רמקולים ניידים (בוקסות), קריוקי ומסיבות. יש לשמור על שקט מוחלט בין 23:00 ל-07:00 ובין 14:00 ל-16:00.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🥩</span>
              <div>
                <strong>הדלקת אש ומנגל (BBQ):</strong> מותרת אך ורק בעמדות המנגל המוסדרות בחצר, ולעולם לא על גבי דק העץ או בתוך המבנה. אין להבעיר אש בשבת.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">👥</span>
              <div>
                <strong>אורחים ומבקרים:</strong> השהייה מיועדת אך ורק למספר האורחים הנקוב בהזמנה המאושרת. חל איסור על הכנסת אורחים נוספים או לינה ללא תיאום ואישור מראש.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🛁</span>
              <div>
                <strong>בטיחות בג׳קוזי ובריכה:</strong> חובה לוודא שגובה המים מכסה את כל פתחי הסילונים (הג׳טים) לפני הפעלת המתג למניעת שריפת מנוע. חל איסור על כלי זכוכית, שמנים או סבונים במים.
              </div>
            </div>

            <div class="rule-item">
              <span class="rule-icon">🐾</span>
              <div>
                <strong>בעלי חיים וחיות מחמד:</strong> כניסת חיות מחמד אסורה בהחלט, אלא אם תואמה ואושרה מראש ובכתב מול הנהלת הריזורט טרם ההגעה.
              </div>
            </div>
          </div>
        </section>

        <div class="digital-hub">
          <div class="hub-content">
            <h3><span>📱</span><span>דף האורח הדיגיטלי והמדריך המלא שלכם</span></h3>
            <p>
              סרקו את הקוד עם מצלמת הטלפון לפתיחת פורטל השהייה: ניווט מדויק, המלצות על מסעדות מקומיות וקצביות, מעיינות נסתרים, מדריכי הפעלה ליחידה, וצ׳ק-אאוט דיגיטלי בקליק.
            </p>
            <div class="hub-highlights">
              <span>🍽️ מסעדות מומלצות</span>
              <span>🌿 מעיינות ואטרקציות</span>
              <span>📺 מדריך ג׳קוזי ו-TV</span>
              <span>💬 וואטסאפ שירות מהיר</span>
            </div>
          </div>
          <div class="hub-qr-wrap">
            <img class="hub-qr" alt="QR Code" src="${unit.qr}" />
            <div class="qr-caption">סריקה במצלמה</div>
          </div>
        </div>

        <footer class="footer">
          <div class="service-box">
            <div class="s-label">📞 שירות בשטח וסיוע לאורחים</div>
            <div class="s-phone">050-950-6222</div>
            <div class="s-hours">השירות פעיל עד השעה 21:00 בערב · ניתן להשאיר הודעות אחרי 21:00 ונתייחס אליהן על הבוקר</div>
          </div>

          <div class="checkout-instructions">
            <div><strong>הנחיות עזיבה (עד 11:00):</strong> ביציאה מחזירים את המפתח לכספת ונועלים אותה. צ׳ק-אאוט עצמי בלחיצה אחת דרך הקישור בטלפון החל מ-08:00 בבוקר.</div>
          </div>
        </footer>
      </div>
    </article>
    `;
  }

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>דפי דוגמה ל-11 המתחמים — ResortOS A4</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800;900&family=David+Libre:wght@500;700&family=Frank+Ruhl+Libre:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-sheet: #FDFBF7;
      --ink-primary: #1C1917;
      --ink-secondary: #44403C;
      --ink-muted: #78716C;
      --gold-primary: #C5A059;
      --gold-deep: #9E7D3B;
      --gold-light: #F7F1E5;
      --gold-subtle: rgba(197, 160, 89, 0.12);
      --border-fine: #E7DFCE;
      --border-dark: #292524;
      --alert-bg: #FEF2F2;
      --alert-border: #FCA5A5;
      --alert-text: #991B1B;
      --shabbat-bg: #FFF7ED;
      --shabbat-border: #EA580C;
      --shabbat-text: #7C2D12;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      background: #EAE3D2;
      color: var(--ink-primary);
      font-family: 'Assistant', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      -webkit-font-smoothing: antialiased;
      direction: rtl;
    }

    .nav-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #FFFFFF;
      padding: 12px 20px;
      border-bottom: 1.5px solid #D6CEBE;
      box-shadow: 0 4px 14px rgba(0,0,0,0.06);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .nav-bar h2 { font-size: 16px; margin: 0; }
    .nav-bar button {
      background: #1C1917; color: #FFF; font-weight: 700; font-size: 13px;
      padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
    }

    .sheet-wrapper {
      padding: 20px 0 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 30px;
    }

    .sheet {
      position: relative;
      width: 210mm;
      height: 297mm;
      max-height: 297mm;
      background: var(--bg-sheet);
      color: var(--ink-primary);
      padding: 8mm 9mm 6mm;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .sheet-inner {
      height: 100%;
      border: 2px solid var(--ink-primary);
      padding: 6mm 7.5mm 4.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }
    .sheet-inner::before {
      content: "";
      position: absolute;
      top: 2.2mm; left: 2.2mm; right: 2.2mm; bottom: 2.2mm;
      border: 0.8px solid var(--gold-primary);
      pointer-events: none;
    }

    .corner-ornament {
      position: absolute;
      width: 12mm; height: 12mm;
      pointer-events: none;
      border-color: var(--gold-primary);
    }
    .corner-tl { top: 3.5mm; right: 3.5mm; border-top: 2px solid var(--gold-primary); border-right: 2px solid var(--gold-primary); }
    .corner-tr { top: 3.5mm; left: 3.5mm; border-top: 2px solid var(--gold-primary); border-left: 2px solid var(--gold-primary); }
    .corner-bl { bottom: 3.5mm; right: 3.5mm; border-bottom: 2px solid var(--gold-primary); border-right: 2px solid var(--gold-primary); }
    .corner-br { bottom: 3.5mm; left: 3.5mm; border-bottom: 2px solid var(--gold-primary); border-left: 2px solid var(--gold-primary); }

    .shabbat-alert-banner {
      background: var(--shabbat-bg);
      border: 1.5px solid var(--shabbat-border);
      border-radius: 8px;
      padding: 6px 12px;
      margin-bottom: 2.5mm;
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--shabbat-text);
      font-size: 11.5px;
      line-height: 1.35;
      box-shadow: 0 1px 4px rgba(234, 88, 12, 0.12);
    }
    .shabbat-alert-banner strong { color: #7C2D12; font-size: 12.5px; display: inline; }
    .shabbat-alert-icon { font-size: 22px; flex-shrink: 0; }

    .header { text-align: center; padding-bottom: 2.5mm; border-bottom: 1.5px solid var(--ink-primary); position: relative; }
    .brand-crown {
      font-size: 11px; letter-spacing: 0.28em; text-transform: uppercase;
      color: var(--gold-deep); font-weight: 800; margin-bottom: 2px;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .brand-crown::before, .brand-crown::after { content: "—"; color: var(--gold-primary); }
    .welcome-title {
      font-family: 'Frank Ruhl Libre', 'David Libre', serif;
      font-size: 32px; font-weight: 900; color: var(--ink-primary);
      letter-spacing: -0.02em; line-height: 1.1; margin: 1px 0;
    }
    .unit-hero-name {
      font-size: 20px; font-weight: 800; color: var(--gold-deep);
      margin-top: 1px; display: inline-block; padding: 2px 14px;
      background: var(--gold-subtle); border-radius: 20px;
      border: 1px solid rgba(197, 160, 89, 0.4);
    }
    .prop-location { font-size: 12px; color: var(--ink-muted); margin-top: 2px; font-weight: 600; }

    .times-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin: 2.5mm 0; text-align: center; }
    .time-card { background: #FFFFFF; border: 1px solid var(--border-fine); border-radius: 6px; padding: 2.5mm 2mm; }
    .time-label { font-size: 10.5px; font-weight: 700; color: var(--ink-muted); text-transform: uppercase; margin-bottom: 1px; }
    .time-val { font-size: 20px; font-weight: 900; color: var(--ink-primary); line-height: 1.1; }
    .time-val.saturday { font-size: 17px; color: var(--gold-deep); }

    .access-grid { display: grid; grid-template-columns: 1fr 1.15fr 1.25fr; gap: 3mm; margin-bottom: 2.5mm; }
    .access-card {
      background: #FFFFFF; border: 1px solid var(--border-fine); border-top: 3px solid var(--gold-primary);
      border-radius: 6px; padding: 2.5mm 3mm; display: flex; flex-direction: column; justify-content: space-between; min-height: 28mm;
    }
    .access-header { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: var(--ink-secondary); margin-bottom: 2px; }
    .access-icon { font-size: 12.5px; }
    .access-value {
      font-family: ui-monospace, Menlo, monospace; font-size: 22px; font-weight: 900;
      color: var(--ink-primary); direction: ltr; text-align: center; letter-spacing: 0.08em; line-height: 1.15; padding: 1px 0;
    }
    .access-value.is-text {
      font-family: 'Assistant', sans-serif; font-size: 12px; font-weight: 700;
      direction: rtl; letter-spacing: normal; line-height: 1.35; color: var(--ink-primary); text-align: center;
    }
    .access-sub { font-size: 9.5px; color: var(--ink-muted); text-align: center; line-height: 1.25; margin-top: 1px; }

    .wifi-details { display: flex; flex-direction: column; gap: 2.5px; direction: ltr; text-align: left; }
    .wifi-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; border-bottom: 1px dotted #EAE2D2; padding-bottom: 1px; }
    .wifi-row .w-label { font-size: 9.5px; color: var(--ink-muted); direction: rtl; }
    .wifi-row .w-val { font-family: ui-monospace, Menlo, monospace; font-weight: 800; color: var(--ink-primary); font-size: 12px; }

    .rules-section {
      background: #FFFDF9; border: 1.5px solid var(--gold-primary); border-radius: 8px;
      padding: 3mm 4.5mm 2.5mm; box-shadow: 0 2px 8px rgba(197, 160, 89, 0.08); margin-bottom: 2.5mm;
    }
    .rules-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(197, 160, 89, 0.35); padding-bottom: 2mm; margin-bottom: 2.5mm; }
    .rules-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 900; color: var(--ink-primary); }
    .rules-badge { font-size: 9.5px; font-weight: 800; padding: 1.5px 7px; border-radius: 4px; background: var(--alert-bg); border: 1px solid var(--alert-border); color: var(--alert-text); }
    .rules-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 5mm; }
    .rule-item { display: flex; align-items: flex-start; gap: 6px; font-size: 10.2px; line-height: 1.35; color: var(--ink-secondary); }
    .rule-icon { font-size: 13px; line-height: 1.1; flex-shrink: 0; margin-top: 1px; }
    .rule-item strong { color: var(--ink-primary); font-weight: 800; }

    .digital-hub {
      background: var(--gold-light); border: 1.5px solid var(--gold-primary); border-radius: 8px;
      padding: 3mm 4.5mm; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4.5mm; margin-bottom: 2.5mm;
    }
    .hub-content h3 { font-size: 13.5px; font-weight: 900; color: var(--ink-primary); margin-bottom: 2px; display: flex; align-items: center; gap: 6px; }
    .hub-content p { font-size: 10.2px; line-height: 1.35; color: var(--ink-secondary); margin-bottom: 3px; }
    .hub-highlights { display: flex; flex-wrap: wrap; gap: 3px 8px; font-size: 9.8px; font-weight: 700; color: var(--gold-deep); }
    .hub-highlights span { background: rgba(197, 160, 89, 0.16); padding: 1px 6px; border-radius: 3px; }
    .hub-qr-wrap { text-align: center; background: #FFFFFF; padding: 2.5mm; border: 1px solid var(--gold-primary); border-radius: 6px; }
    .hub-qr { width: 25mm; height: 25mm; display: block; image-rendering: pixelated; }
    .qr-caption { font-size: 8.5px; font-weight: 800; letter-spacing: 0.05em; color: var(--ink-primary); margin-top: 2px; }

    .footer { border-top: 1.5px solid var(--ink-primary); padding-top: 2.2mm; display: flex; justify-content: space-between; align-items: center; gap: 3.5mm; }
    .service-box { background: #FFFFFF; border: 1.5px solid var(--gold-primary); border-radius: 7px; padding: 2.2mm 3.8mm; display: flex; flex-direction: column; gap: 1.5px; box-shadow: 0 1px 4px rgba(197, 160, 89, 0.15); flex: 1.15; }
    .s-label { font-size: 10px; font-weight: 800; color: var(--ink-secondary); display: flex; align-items: center; gap: 4px; }
    .s-phone { font-size: 18px; font-weight: 900; color: var(--gold-deep); direction: ltr; text-align: right; letter-spacing: 0.05em; line-height: 1.15; }
    .s-hours { font-size: 8.8px; color: var(--ink-muted); line-height: 1.3; margin-top: 1.5px; }
    .checkout-instructions { font-size: 9.6px; color: var(--ink-muted); line-height: 1.35; text-align: right; direction: rtl; flex: 1; }
    .checkout-instructions strong { color: var(--ink-primary); }

    @media print {
      @page { size: A4 portrait; margin: 0; }
      html, body { background: #FFF !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .nav-bar { display: none !important; }
      .sheet-wrapper { padding: 0 !important; gap: 0 !important; }
      .sheet { box-shadow: none !important; page-break-after: always !important; break-after: page !important; }
      .sheet:last-of-type { page-break-after: auto !important; break-after: auto !important; }
    }
  </style>
</head>
<body>
  <div class="nav-bar">
    <h2>📋 דפי חדר לדוגמה — 11 מתחמי הנופש (נתונים פיקטיביים)</h2>
    <button onclick="window.print()">🖨️ הדפסת 11 הדפים (A4)</button>
  </div>
  <div class="sheet-wrapper">
    ${sheetsHtml}
  </div>
</body>
</html>`;
}

const samplesHtml = buildSamplesHtml(SAMPLES_COMPLEXES, RAW_UNITS);
const samplesOutputPath = new URL('../public/room-sheet-samples.html', import.meta.url).pathname;
writeFileSync(samplesOutputPath, samplesHtml, 'utf8');
console.log(`Saved 11 complex sample sheets to ${samplesOutputPath}`);
