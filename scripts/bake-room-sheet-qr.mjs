import { readFileSync, writeFileSync } from 'node:fs';
import QRCode from 'qrcode';

const filePath = new URL('../public/room-sheet-a4.html', import.meta.url).pathname;
let content = readFileSync(filePath, 'utf8');

// Match UNITS array
const unitsMatch = content.match(/const UNITS = (\[[\s\S]*?\]);/);
if (!unitsMatch) {
  console.error('UNITS array not found');
  process.exit(1);
}

const rawUnits = eval(unitsMatch[1]);
console.log(`Found ${rawUnits.length} units.`);

for (const unit of rawUnits) {
  const guestUrl = `https://resortos.app/guest?unit=${encodeURIComponent(unit.id)}`;
  unit.qr = await QRCode.toDataURL(guestUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#1c1917', light: '#ffffff' }
  });
}

// Generate new formatted JS array
const formattedUnits = JSON.stringify(rawUnits, null, 2);
content = content.replace(unitsMatch[0], `const UNITS = ${formattedUnits};`);

// Also update renderUnit and printAllUnits to use unit.qr directly
content = content.replace(
  /document\.getElementById\('hub-qr-img'\)\.src = `https:\/\/api\.qrserver\.com[^`]+`;/,
  `const qrImg = document.getElementById('hub-qr-img');\n      qrImg.src = unit.qr;\n      qrImg.setAttribute('src', unit.qr);`
);

content = content.replace(
  /sheet\.querySelector\('#hub-qr-img'\)\.src = `https:\/\/api\.qrserver\.com[^`]+`;/,
  `const qrImg = sheet.querySelector('#hub-qr-img');\n        qrImg.src = unit.qr;\n        qrImg.setAttribute('src', unit.qr);`
);

writeFileSync(filePath, content, 'utf8');
console.log('Successfully baked high-res offline QR codes into room-sheet-a4.html!');
