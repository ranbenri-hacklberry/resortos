/**
 * One-off script to send a room QR code image directly to a phone on WhatsApp.
 * Usage: npx tsx scripts/send-qr.ts [room_code] [phone]
 * Example: npx tsx scripts/send-qr.ts B1 972506983399
 */
import { WhatsAppClient } from '../src/whatsapp/client.js';
import { loadRooms } from '../src/config.js';
import { resolveRoomByAlias } from '../src/llm/client.js';
import { generateRoomQrPng } from '../src/whatsapp/qrGenerator.js';

async function main() {
  const roomArg = process.argv[2] || 'B1';
  const phoneArg = (process.argv[3] || '972506983399').replace(/\D/g, '');

  const rooms = loadRooms();
  const resolvedId = resolveRoomByAlias(roomArg, rooms);
  if (!resolvedId) {
    console.error(`Room "${roomArg}" not found in catalog.`);
    process.exit(1);
  }

  const room = rooms.find((r) => r.id === resolvedId)!;
  console.log(`Generating QR for: ${room.letterCode || room.name} (ID: ${room.id}, Lockbox: ${room.lockbox})...`);
  const png = await generateRoomQrPng(room);

  const wa = new WhatsAppClient();
  console.log('Connecting to WhatsApp...');
  await wa.start();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WhatsApp connection timed out')), 25000);
    wa.on('authenticated', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  const jid = `${phoneArg}@s.whatsapp.net`;
  const caption = `🔲 קוד QR לסריקה עבור: ${room.letterCode || room.name}\n` +
    `📍 מתחם: ${room.property || ''}\n` +
    `🔑 קוד כספת מפתח: ${room.lockbox || 'ללא'}\n\n` +
    `סריקת הקוד במצלמה פותחת שיחה ⬅️ מפעילה את שעון הניקיון ב-ResortOS ⬅️ מחזירה את קוד הכספת מיידית.`;

  console.log(`Sending QR image to ${jid}...`);
  await wa.sendImage(jid, png, caption);
  console.log('Sent successfully!');

  await wa.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
