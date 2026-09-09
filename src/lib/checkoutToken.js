/** Opaque checkout token. No guest PII is encoded in the URL. */
export function createCheckoutToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'tok_' + crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2, 12);
  return 'tok_' + Date.now().toString(36) + '_' + rand;
}
