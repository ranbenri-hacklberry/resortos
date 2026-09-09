import React, { useEffect, useRef } from 'react';
import { openPaymentUrl } from '../lib/guestPayBrowser';

export default function HypPayFrame({
  url,
  t,
  themeStyles,
  amountLabel,
  height = 'min(68dvh, 620px)',
  onOpenFull,
  onDone,
  doneBusy = false
}) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!url) return undefined;
    const id = window.setInterval(() => {
      try {
        const href = iframeRef.current?.contentWindow?.location?.href || '';
        if (!href || href === 'about:blank') return;
        if (/\/api\/payments\/hyp\/success|\/api\/checkout\/.+\/hyp|\/stay\//.test(href)) {
          window.location.replace(href);
        }
      } catch (_) {}
    }, 700);
    return () => window.clearInterval(id);
  }, [url]);

  if (!url) return null;
  return (
    <div>
      <p style={{ margin: '0 0 0.65rem', color: themeStyles?.textMuted, fontSize: '0.82rem', lineHeight: 1.45, fontWeight: 700 }}>
        {t('GUEST_PAY_IN_PAGE')}
      </p>
      <div
        style={{
          border: `1px solid ${themeStyles?.inputBorder || '#E5E7EB'}`,
          borderRadius: 12,
          overflow: 'hidden',
          background: themeStyles?.inputBg || '#FFF'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.65rem 0.75rem',
            borderBottom: `1px solid ${themeStyles?.inputBorder || '#E5E7EB'}`
          }}
        >
          <div style={{ fontWeight: 900, fontSize: '0.88rem', color: themeStyles?.textPrimary }}>
            {t('INSTAY_CHECKIN_IFRAME_TITLE')}
          </div>
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              padding: '0.2rem 0.45rem',
              borderRadius: 999,
              border: `1px solid ${themeStyles?.inputBorder || '#E5E7EB'}`,
              color: themeStyles?.textMuted
            }}
          >
            Hyp
          </span>
        </div>
        {amountLabel ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.45rem 0.75rem',
              borderBottom: `1px solid ${themeStyles?.inputBorder || '#E5E7EB'}`,
              fontSize: '0.82rem'
            }}
          >
            <span style={{ color: themeStyles?.textMuted, fontWeight: 700 }}>{t('GUEST_PAY_TO_CLEAR')}</span>
            <span style={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>₪{amountLabel}</span>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          title={t('INSTAY_CHECKIN_IFRAME_TITLE')}
          src={url}
          allow="payment"
          referrerPolicy="origin"
          style={{
            width: '100%',
            height,
            border: 'none',
            display: 'block',
            background: '#FFF'
          }}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (onOpenFull) onOpenFull(url);
          else openPaymentUrl(url);
        }}
        style={{
          width: '100%',
          marginTop: 10,
          border: `1px solid ${themeStyles?.inputBorder || '#E5E7EB'}`,
          borderRadius: 12,
          padding: '0.75rem',
          fontWeight: 800,
          background: 'transparent',
          color: themeStyles?.textPrimary || '#111',
          cursor: 'pointer'
        }}
      >
        {t('GUEST_PAY_OPEN_FULL')}
      </button>
      {onDone ? (
        <button
          type="button"
          disabled={doneBusy}
          onClick={onDone}
          style={{
            width: '100%',
            marginTop: 8,
            border: 'none',
            borderRadius: 12,
            padding: '0.85rem',
            fontWeight: 900,
            background: themeStyles?.cta || '#111',
            color: themeStyles?.ctaText || '#FFF',
            cursor: 'pointer'
          }}
        >
          {doneBusy ? t('GUEST_LOADING') : t('GUEST_PAY_DONE')}
        </button>
      ) : null}
    </div>
  );
}
