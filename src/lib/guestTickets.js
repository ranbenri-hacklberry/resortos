const listeners = new Set();

const TICKET_RESETS = {
  b_1786777203793: '2026-08-15-sharon-clear'
};

export function ticketsStorageKey(bookingId) {
  return `hotelos-demo-tickets:${bookingId || 'guest'}`;
}

function applyTicketReset(bookingId) {
  const stamp = TICKET_RESETS[bookingId];
  if (!stamp) return;
  const flag = `hotelos-tickets-reset:${bookingId}:${stamp}`;
  try {
    if (localStorage.getItem(flag)) return;
    localStorage.removeItem(ticketsStorageKey(bookingId));
    localStorage.setItem(flag, '1');
  } catch (_) {}
}

export function loadGuestOrders(bookingId) {
  applyTicketReset(bookingId);
  try {
    const raw = JSON.parse(localStorage.getItem(ticketsStorageKey(bookingId)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function clearGuestOrders(bookingId) {
  try {
    localStorage.removeItem(ticketsStorageKey(bookingId));
  } catch (_) {}
  notify(bookingId, { orders: [] });
}

function notify(bookingId, extra = {}) {
  listeners.forEach((fn) => fn(bookingId, extra));
}

export function saveGuestOrders(bookingId, orders) {
  localStorage.setItem(ticketsStorageKey(bookingId), JSON.stringify(orders));
  notify(bookingId, { orders });
}

export function subscribeGuestTickets(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openGuestTicketWallet(bookingId) {
  notify(bookingId, { open: true, orders: loadGuestOrders(bookingId) });
}

export function flattenTickets(orders) {
  return (orders || []).flatMap((order) =>
    (order.tickets || []).map((ticket) => ({
      ...ticket,
      orderId: order.id,
      title: order.title,
      attractionId: order.attractionId,
      method: order.method,
      purchasedAt: order.at
    }))
  );
}

export function redeemGuestTicket(bookingId, code) {
  const orders = loadGuestOrders(bookingId).map((order) => ({
    ...order,
    tickets: (order.tickets || []).map((ticket) =>
      ticket.code === code && !ticket.redeemedAt
        ? { ...ticket, redeemedAt: new Date().toISOString() }
        : ticket
    )
  }));
  saveGuestOrders(bookingId, orders);
  return orders;
}
