import { writeFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { groundsCatalog } from '../src/lib/priorityGrounds.js';

const BOT_PHONE = '972515262612';

const cards = [];
for (const asset of groundsCatalog()) {
  const url = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(asset.scan)}`;
  const qr = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 280,
    color: { dark: '#0f172a', light: '#ffffff' }
  });
  const tone = asset.kind === 'pool' ? 'pool' : 'yard';
  cards.push(`<article class="card is-${tone}">
    <div class="kind">${asset.kind === 'pool' ? 'בריכה' : 'חצר'}</div>
    <h2>${asset.label}</h2>
    <img src="${qr}" alt="${asset.scan}" />
    <p>1. סורקים במצלמה</p>
    <p>2. לוחצים <strong>שלח</strong> בווטסאפ</p>
    <p>3. בוחרים סטטוס במספר</p>
  </article>`);
}

const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <title>קודי QR לחצרות ולבריכות</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f1f5f9; color: #0f172a; font-family: "Segoe UI", Arial, sans-serif; }
    header { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 16px 20px; }
    h1 { margin: 0; font-size: 22px; }
    a { color: #0f766e; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 0 16px 20px; }
    .card { background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px; text-align: center; break-inside: avoid; }
    .card.is-pool { border-top: 4px solid #1d4ed8; }
    .card.is-yard { border-top: 4px solid #15803d; }
    .kind { font-size: 12px; font-weight: 800; color: #475569; }
    h2 { margin: 4px 0 8px; font-size: 16px; }
    img { width: 148px; height: 148px; }
    p { margin: 2px 0; font-size: 12px; }
    html.embed header { display: none; }
    html.embed body { background: #fff; }
    html.embed .grid { padding-top: 12px; }
    @media print {
      body { background: #fff; }
      header a, header button { display: none; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <script>if (location.search.indexOf('embed=1') !== -1) document.documentElement.classList.add('embed');</script>
  <header>
    <div>
      <h1>חצרות ובריכות</h1>
      <p>סריקה שולחת לקלואי את הסטטוס. חצר: נקי, לבדיקה, לניקיון. בריכה: תקינה, לבדיקה, לטיפול.</p>
    </div>
    <button onclick="window.print()">הדפסה</button>
  </header>
  <div class="grid">
    ${cards.join('\n')}
  </div>
</body>
</html>
`;

writeFileSync(new URL('../public/grounds-qr.html', import.meta.url), html);
console.log(`wrote ${cards.length} grounds QR cards`);
