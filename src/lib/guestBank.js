export const GUEST_BANK_ACCOUNT = {
  bankName: 'הבנק הבינלאומי',
  bankCode: '31',
  branch: '92',
  account: '395140',
  payee: 'מיאליס ריזורט בע״מ',
  formatted: '31-92-395140'
};

export function guestBankCopyText(account = GUEST_BANK_ACCOUNT) {
  return [
    `מוטב: ${account.payee}`,
    `בנק: ${account.bankName} (${account.bankCode})`,
    `סניף: ${account.branch}`,
    `חשבון: ${account.account}`
  ].join('\n');
}

export const BALANCE_PREFS = ['CREDIT_CARD', 'BANK_TRANSFER', 'CASH'];

export function normalizeBalancePreference(raw, fallback = 'CREDIT_CARD') {
  const value = String(raw || '').toUpperCase();
  if (value === 'CARD' || value === 'SAVED_CARD') return 'CREDIT_CARD';
  return BALANCE_PREFS.includes(value) ? value : fallback;
}
