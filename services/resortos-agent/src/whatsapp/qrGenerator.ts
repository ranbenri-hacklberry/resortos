// @ts-ignore
import QRCode from 'qrcode';
import type { RoomEntry } from '../config.js';

export const BOT_PHONE = '972515262612';

/** Generate high-resolution PNG buffer of the WhatsApp deep-link QR code for a room. */
export async function generateRoomQrPng(room: RoomEntry): Promise<Buffer> {
  const code = room.letterCode || room.name || room.id;
  const text = `START_${code.replace(/\s+/g, '_')}`;
  const url = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(text)}`;

  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'H',
    type: 'png',
    margin: 2,
    width: 600,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/** Generate a clean SVG string (for print sheets or HTML embedding). */
export async function generateRoomQrSvg(room: RoomEntry): Promise<string> {
  const code = room.letterCode || room.name || room.id;
  const text = `START_${code.replace(/\s+/g, '_')}`;
  const url = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(text)}`;

  return QRCode.toString(url, {
    errorCorrectionLevel: 'H',
    type: 'svg',
    margin: 1,
  });
}
