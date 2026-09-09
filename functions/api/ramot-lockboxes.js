import { errorJson, json } from './_db.js';
import { isRamotPin, ramotPublicList, ramotSecrets } from '../lib/ramotDirectory.js';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return json({ ok: true });

  if (request.method === 'GET' || request.method === 'HEAD') {
    const body = json({ complexes: ramotPublicList() }, 200, {
      'Cache-Control': 'public, max-age=300'
    });
    if (request.method === 'HEAD') return new Response(null, { status: body.status, headers: body.headers });
    return body;
  }

  if (request.method !== 'POST') {
    return errorJson('Method not allowed', 405, 'METHOD_NOT_ALLOWED');
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!isRamotPin(body.pin)) {
    return errorJson('קוד שגוי', 401, 'BAD_PIN');
  }
  return json(ramotSecrets(body.propertyId), 200, {
    'Cache-Control': 'no-store'
  });
}
