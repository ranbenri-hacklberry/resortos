import React from 'react';
import { formatIlsFromAgorot, listClearingPayments, paymentClearingLine } from '../lib/clearingPayments';

export default function ClearingPaymentsList({
  booking,
  payments,
  isLight,
  muted,
  compact = false
}) {
  const rows = (payments || listClearingPayments(booking)).filter(Boolean);
  if (!rows.length) return null;

  return (
    <div style={{
      display: 'grid',
      gap: compact ? '0.28rem' : '0.4rem',
      marginTop: compact ? 0 : '0.55rem'
    }}>
      {rows.map((payment, index) => {
        const line = paymentClearingLine(payment);
        const key = payment.txn || `${payment.ref}-${payment.amount_agorot}-${index}`;
        return (
          <div
            key={key}
            style={{
              padding: compact ? '0.4rem 0.55rem' : '0.55rem 0.7rem',
              borderRadius: 10,
              background: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)'}`
            }}
          >
            <div style={{ fontSize: compact ? '0.78rem' : '0.82rem', fontWeight: 800 }}>
              {payment.amount_agorot ? formatIlsFromAgorot(payment.amount_agorot) : 'תשלום'}
              {payment.date ? ` · ${payment.date.split('-').reverse().join('.')}` : ''}
            </div>
            <div style={{ marginTop: 2, fontSize: '0.74rem', fontWeight: 700, color: muted }}>
              חשבון סליקה: {line.account}
            </div>
            <div style={{ marginTop: 1, fontSize: '0.74rem', fontWeight: 800 }}>
              אסמכתה: {line.ref || '—'}
              {payment.invoice ? ` · חשבונית ${payment.invoice}` : ''}
            </div>
            {payment.collector ? (
              <div style={{ marginTop: 1, fontSize: '0.74rem', fontWeight: 700, color: muted }}>
                גבה: {payment.collector}
                {payment.collected_at ? ` · ${String(payment.collected_at).replace('T', ' ').slice(0, 16)}` : ''}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
