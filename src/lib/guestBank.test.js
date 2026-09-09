import { describe, expect, it } from 'vitest';
import { guestBankCopyText, GUEST_BANK_ACCOUNT, normalizeBalancePreference } from './guestBank';

describe('guestBank', () => {
  it('exposes the Beinleumi business checking details', () => {
    expect(GUEST_BANK_ACCOUNT.branch).toBe('92');
    expect(GUEST_BANK_ACCOUNT.account).toBe('395140');
    expect(guestBankCopyText()).toContain('מיאליס ריזורט');
  });

  it('normalizes balance preference aliases', () => {
    expect(normalizeBalancePreference('bank_transfer')).toBe('BANK_TRANSFER');
    expect(normalizeBalancePreference('saved_card')).toBe('CREDIT_CARD');
    expect(normalizeBalancePreference('nope')).toBe('CREDIT_CARD');
  });
});
