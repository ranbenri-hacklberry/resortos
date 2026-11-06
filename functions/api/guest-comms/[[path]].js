import { handleGuestComms } from '../../lib/guestCommsEdge.js';

/**
 * Dashboard (resortos.app) is Cloudflare Pages. /api/guest-comms had no Function,
 * so Pages returned the marketing HTML with HTTP 200 and the desk thread looked empty.
 * Desk SMS is stored in Studio guest_communications. This route reads and writes that table.
 */
export async function onRequest(context) {
  return handleGuestComms(context);
}
