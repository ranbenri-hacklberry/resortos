/** Guest-app feature holds. Keep the code; flip these when ready to ship. */
export const GUEST_HOLD = {
  cabinStore: true,
  ticketPurchase: true
};

export function guestCabinStoreEnabled() {
  return !GUEST_HOLD.cabinStore;
}

export function guestTicketPurchaseEnabled() {
  return !GUEST_HOLD.ticketPurchase;
}
