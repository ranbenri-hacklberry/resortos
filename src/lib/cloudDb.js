import { db } from './hotelos-db';

const NTFY_TOPIC = 'hotelos_sync_22222222-2222-2222-2222-222222222222';

/**
 * Pushes a booking object (created or updated) to the global cloud channel.
 */
export async function pushBookingToCloud(booking) {
  if (!booking || !booking.id) return;
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(booking)
    });
  } catch (err) {
    console.warn('[NTFY CLOUD PUSH WARN]', err);
  }
}

/**
 * Polls recent cloud booking events from the last 12 hours and syncs them into Dexie.
 */
export async function syncCloudBookingsToDexie(tenantId) {
  if (!tenantId) return;
  try {
    const res = await fetch(`https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=12h`);
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt && evt.message) {
            const bookingData = JSON.parse(evt.message);
            if (bookingData && bookingData.id) {
              const existing = await db.bookings.get(bookingData.id);
              if (!existing || (bookingData.updated_at && bookingData.updated_at >= (existing.updated_at || ''))) {
                await db.bookings.put(bookingData);
              }
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    // Quiet network retry
  }
}

/**
 * Listens in 0ms real-time via Server-Sent Events (SSE) for instant cross-device updates.
 */
export function subscribeToRealtimeCloudBookings(tenantId, onBookingReceived) {
  if (typeof window === 'undefined' || !window.EventSource) return () => {};

  const es = new EventSource(`https://ntfy.sh/${NTFY_TOPIC}/sse`);

  es.onmessage = async (event) => {
    try {
      const evt = JSON.parse(event.data);
      if (evt && evt.message) {
        const bookingData = JSON.parse(evt.message);
        if (bookingData && bookingData.id) {
          await db.bookings.put(bookingData);
          if (onBookingReceived) onBookingReceived(bookingData);
        }
      }
    } catch (_) {}
  };

  return () => {
    es.close();
  };
}
