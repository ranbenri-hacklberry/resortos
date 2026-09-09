import { serveGuestPortal } from './lib/serveGuestPortal.js';

export async function onRequest(context) {
  return serveGuestPortal(context);
}
