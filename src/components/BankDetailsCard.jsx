import React, { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';
import { GUEST_BANK_ACCOUNT, guestBankCopyText } from '../lib/guestBank';

export default function BankDetailsCard({ themeStyles, t, compact = false }) {
  const [copied, setCopied] = useState(false);
  const account = GUEST_BANK_ACCOUNT;
  const rows = [
    [t('GUEST_BANK_PAYEE'), account.payee],
    [t('GUEST_BANK_NAME'), `${account.bankName} (${account.bankCode})`],
    [t('GUEST_BANK_BRANCH'), account.branch],
    [t('GUEST_BANK_ACCOUNT'), account.account]
  ];

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(guestBankCopyText(account));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (_) {}
  }

  return (
    <div
      style={{
        border: `1px solid ${themeStyles.inputBorder}`,
        borderRadius: compact ? 8 : 12,
        padding: compact ? '0.4rem 0.5rem' : '0.85rem',
        background: themeStyles.inputBg,
        marginTop: compact ? 4 : 8
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: compact ? 2 : 6, fontSize: compact ? '0.7rem' : '0.82rem' }}>
          <span style={{ color: themeStyles.textMuted, fontWeight: 700 }}>{label}</span>
          <span style={{ fontWeight: 900, textAlign: 'left', direction: 'ltr' }}>{value}</span>
        </div>
      ))}
      <button
        type="button"
        onClick={copyAll}
        style={{
          width: '100%',
          marginTop: compact ? 2 : 4,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: compact ? 8 : 10,
          padding: compact ? '0.35rem' : '0.55rem',
          fontSize: compact ? '0.72rem' : undefined,
          background: copied ? 'rgba(16,185,129,0.15)' : 'transparent',
          color: themeStyles.textPrimary,
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        {copied ? <CheckCircle2 size={16} color="#736055" /> : <Copy size={16} />}
        {copied ? t('GUEST_BANK_COPIED') : t('GUEST_BANK_COPY')}
      </button>
    </div>
  );
}
