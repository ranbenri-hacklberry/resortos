export function normalizeBalancePreference(raw, fallback = 'CREDIT_CARD') {
  const value = String(raw || '').toUpperCase();
  if (value === 'CARD' || value === 'SAVED_CARD' || value === 'CREDIT') return 'CREDIT_CARD';
  if (value === 'BANK' || value === 'TRANSFER') return 'BANK_TRANSFER';
  if (['CREDIT_CARD', 'BANK_TRANSFER', 'CASH'].includes(value)) return value;
  return fallback;
}
