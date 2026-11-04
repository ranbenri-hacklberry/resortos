import { readFile } from 'node:fs/promises';
import { importPublicKey, verifyBasaltChain } from '../functions/lib/basalt.js';

const file = process.argv[2];
const pub = process.argv[3] || process.env.BASALT_ED25519_PUBLIC_KEY || '';
if (!file || !pub) {
  console.error('usage: node scripts/verify-basalt.mjs chain.json <publicKeyB64>');
  process.exit(2);
}
const parsed = JSON.parse(await readFile(file, 'utf8'));
const rows = Array.isArray(parsed) ? parsed : parsed.rows;
const report = await verifyBasaltChain(rows || [], await importPublicKey(pub));
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
