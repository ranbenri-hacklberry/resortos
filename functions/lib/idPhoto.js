export const ID_PHOTO_MAX_BYTES = 4 * 1024 * 1024;

const SECRET_KEYS = [
  'id_photo',
  'id_photo_cipher',
  'id_photo_iv',
  'id_photo_b64',
  'id_photo_bytes',
  'id_photo_ct'
];

export function idPhotoKvKey(token) {
  return `idphoto:v1:${token}`;
}

export function idPhotoKeyBytes(secret) {
  const raw = String(secret || '').trim();
  if (!raw) return null;
  let bytes = null;
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    bytes = new Uint8Array(raw.match(/../g).map((pair) => parseInt(pair, 16)));
  } else {
    try {
      const bin = atob(raw);
      bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    } catch {
      return null;
    }
  }
  return bytes?.length === 32 ? bytes : null;
}

export function sniffIdPhoto(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length < 12 || bytes.length > ID_PHOTO_MAX_BYTES) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (riff && webp) return 'image/webp';
  return null;
}

export function idPhotoTtlSeconds(checkOutDate, now = Date.now()) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(checkOutDate || '')) ? String(checkOutDate) : '';
  const end = day ? Date.parse(`${day}T00:00:00Z`) + 14 * 86400000 : now + 30 * 86400000;
  const seconds = Math.ceil((end - now) / 1000);
  return Math.min(120 * 86400, Math.max(86400, seconds));
}

export function stripIdPhoto(stay) {
  if (!stay || typeof stay !== 'object') return stay;
  const next = { ...stay };
  for (const key of SECRET_KEYS) delete next[key];
  return next;
}

function bytesToB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToBytes(text) {
  const bin = atob(String(text || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sealIdPhoto(bytes, keyBytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, bytes));
  return { iv: bytesToB64(iv), ct: bytesToB64(cipher) };
}

export async function openIdPhoto(packed, keyBytes) {
  const iv = b64ToBytes(packed?.iv);
  const ct = b64ToBytes(packed?.ct);
  if (iv.length !== 12 || ct.length < 16) throw new Error('BAD_SEAL');
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct));
  const mime = sniffIdPhoto(plain);
  if (!mime) throw new Error('BAD_IMAGE');
  return { mime, bytes: plain };
}
