import assert from 'node:assert/strict';
import test from 'node:test';
import {
  idPhotoKeyBytes,
  idPhotoTtlSeconds,
  openIdPhoto,
  sealIdPhoto,
  sniffIdPhoto,
  stripIdPhoto
} from './idPhoto.js';

const KEY = idPhotoKeyBytes('a'.repeat(64));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(1)]);

test('only jpeg png and webp pass the sniff', () => {
  assert.equal(sniffIdPhoto(JPEG), 'image/jpeg');
  const png = new Uint8Array(16);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(sniffIdPhoto(png), 'image/png');
  const webp = new Uint8Array(16);
  webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.equal(sniffIdPhoto(webp), 'image/webp');
  assert.equal(sniffIdPhoto(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(sniffIdPhoto(new Uint8Array(5 * 1024 * 1024)), null);
});

test('a sealed photo opens only with the same key and is not the raw file', async () => {
  const sealed = await sealIdPhoto(JPEG, KEY);
  assert.equal(sealed.ct.includes(Buffer.from(JPEG).toString('base64')), false);
  const opened = await openIdPhoto(sealed, KEY);
  assert.equal(opened.mime, 'image/jpeg');
  assert.deepEqual(opened.bytes, JPEG);
  const other = idPhotoKeyBytes('b'.repeat(64));
  await assert.rejects(() => openIdPhoto(sealed, other));
});

test('the stay flag keeps the time and drops the photo', () => {
  const stay = stripIdPhoto({
    id_photo_received_at: '2026-10-18T10:00:00.000Z',
    id_photo_ct: 'secret',
    id_photo_iv: 'secret',
    folio: []
  });
  assert.equal(stay.id_photo_received_at, '2026-10-18T10:00:00.000Z');
  assert.equal(stay.id_photo_ct, undefined);
  assert.equal(stay.id_photo_iv, undefined);
  assert.deepEqual(stay.folio, []);
});

test('the photo is kept through the stay and 14 days after checkout', () => {
  const ttl = idPhotoTtlSeconds('2026-10-20', Date.parse('2026-10-18T00:00:00Z'));
  assert.equal(ttl, 16 * 86400);
});

test('a short or missing key is refused', () => {
  assert.equal(idPhotoKeyBytes(''), null);
  assert.equal(idPhotoKeyBytes('aaaa'), null);
});
