import React, { useState } from 'react';
import { MessageSquare, Phone } from 'lucide-react';
import { stayAction } from '../lib/guestCheckoutApi';
import { guestHostWhatsAppHref } from '../lib/stayProperty';

export default function GuestReach({ token, unitId, cabin, guestName, dates, themeStyles, t }) {
  const [callState, setCallState] = useState('');
  const hostWa = guestHostWhatsAppHref(
    t('GUEST_HOST_WHATSAPP', {
      name: guestName || t('GUEST_FALLBACK'),
      cabin: cabin || '',
      dates: dates || ''
    })
  );

  async function askCall() {
    if (!token || callState === 'sending' || callState === 'sent') return;
    setCallState('sending');
    try {
      await stayAction(token, {
        action: 'call_me',
        unit_id: unitId,
        cabin: cabin || ''
      });
      setCallState('sent');
    } catch {
      setCallState('error');
    }
  }

  const button = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    borderRadius: 12,
    fontWeight: 800,
    fontSize: '0.86rem',
    textDecoration: 'none',
    cursor: 'pointer'
  };

  return (
    <div>
      <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted }}>{t('INSTAY_FIELD_REP_HINT')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <a
          href={hostWa || undefined}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...button,
            color: themeStyles.textPrimary,
            background: themeStyles.inputBg,
            border: `1px solid ${themeStyles.inputBorder}`
          }}
        >
          <MessageSquare size={14} /> {t('INSTAY_WHATSAPP_ANY')}
        </a>
        <button
          type="button"
          onClick={askCall}
          disabled={!token || callState === 'sending' || callState === 'sent'}
          style={{
            ...button,
            color: themeStyles.textPrimary,
            background: themeStyles.inputBg,
            border: `1px solid ${themeStyles.inputBorder}`,
            opacity: callState === 'sending' ? 0.7 : 1
          }}
        >
          <Phone size={14} /> {callState === 'sent' ? t('INSTAY_CALL_SENT') : callState === 'error' ? t('INSTAY_CALL_FAIL') : t('INSTAY_CALL_ME')}
        </button>
      </div>
    </div>
  );
}
