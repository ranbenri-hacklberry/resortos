// Ran 2026-10-29: a WhatsApp photo of a room QR sticker = a scan. Local decode only (sharp + jsQR), no OCR,
// nothing but the QR payload is read; image text (e.g. lockbox digits) is never extracted or logged.
import sharp from 'sharp';
import jsQRModule from 'jsqr';

const jsQR: (d: Uint8ClampedArray, w: number, h: number, o?: any) => { data: string } | null = (jsQRModule as any).default || jsQRModule;

/** Raw QR payload, or null if no QR could be decoded. */
export async function decodeQrFromImage(buffer: Buffer): Promise<string | null> {
  for (const width of [1200, 800, 1800]) {
    for (const prep of ['plain', 'norm'] as const) {
      try {
        let img = sharp(buffer, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: false });
        if (prep === 'norm') img = img.grayscale().normalise();
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const res = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' });
        if (res?.data) return res.data;
      } catch { /* try next */ }
    }
  }
  return null;
}

/** "START_B1" from a raw payload (plain text or a wa.me/...?text=START_B1 link). */
export function startCommandFromQr(payload: string | null | undefined): string | null {
  if (!payload) return null;
  let s = String(payload);
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { /* keep raw */ }
  const m = s.match(/START[_\s]+([a-zA-Z0-9_\-\u0590-\u05FF]+)/i);
  return m ? `START_${m[1]}` : null;
}
