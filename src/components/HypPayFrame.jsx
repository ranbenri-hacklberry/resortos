import React, { useEffect, useRef } from 'react';

export default function HypPayFrame({
  url,
  t,
  themeStyles,
  amountLabel,
  height = 'min(68dvh, 620px)',
  onDone,
  doneBusy = false
}) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!url) return undefined;
    try {
      const back = new URL(window.location.href);
      back.searchParams.set('hyp', 'ok');
      sessionStorage.setItem('guest-pay-return', back.toString());
    } catch (_) {}
    const id = window.setInterval(() => {
      try {
        const href = iframeRef.current?.contentWindow?.location?.href || '';
        if (!href || href === 'about:blank') return;
        if (/\/api\/payments\/hyp\/receipt/.test(href)) {
          const landed = new URL(href);
          const token = landed.searchParams.get('Order') || landed.searchParams.get('ReturnValue') || '';
          if (/^tok_[A-Za-z0-9_-]+$/.test(token)) {
            window.location.replace(`/stay/${encodeURIComponent(token)}?hyp=ok`);
            return;
          }
          onDone?.();
          return;
        }
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
            Cardcom
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
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
          style={{
            width: '100%',
            height,
            border: 'none',
            display: 'block',
            background: '#FFF'
          }}
        />
      </div>
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
