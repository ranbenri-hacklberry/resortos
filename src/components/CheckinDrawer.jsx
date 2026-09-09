import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Banknote, Building2, CreditCard, MessageSquare, Upload, X } from 'lucide-react';
import { GUEST_BRAND } from '../lib/guestTheme';
import BankDetailsCard from './BankDetailsCard';
import HypPayFrame from './HypPayFrame';
import { openPaymentUrl } from '../lib/guestPayBrowser';

const TABS = [
  { id: 'card', Icon: CreditCard, labelKey: 'INSTAY_TAB_CARD' },
  { id: 'bank', Icon: Building2, labelKey: 'INSTAY_TAB_BANK' },
  { id: 'cash', Icon: Banknote, labelKey: 'INSTAY_TAB_CASH' }
];

function tabFromPreference(pref, hasSavedCard) {
  if (pref === 'BANK_TRANSFER') return 'bank';
  if (pref === 'CASH') return 'cash';
  return hasSavedCard ? 'saved' : 'card';
}

export { tabFromPreference };

export default function CheckinDrawer({
  open,
  iframeUrl,
  themeStyles,
  t,
  amountLabel,
  savedLast4,
  hasSavedCard,
  quote,
  busy,
  error,
  tab,
  onTab,
  onClose,
  onChargeSaved,
  onNewCard,
  onCompletePay,
  bankProof,
  bankPreview,
  onPickBank,
  onUploadBank,
  cashPin,
  onCashPin,
  onVerifyCash,
  hostWhatsAppHref
}) {
  const paying = Boolean(busy);
  const cardTab = tab === 'saved' || tab === 'card';
  const showPay = tab === 'pay' || Boolean(iframeUrl);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 80,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: '0.75rem'
        }}
        onClick={() => {
          if (!paying) onClose();
        }}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 560,
            background: themeStyles.cardBg || themeStyles.inputBg,
            color: themeStyles.textPrimary,
            borderRadius: '18px 18px 14px 14px',
            padding: '1.05rem',
            maxHeight: '92vh',
            overflow: 'auto',
            marginBottom: 'env(safe-area-inset-bottom, 0px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
              {showPay ? t('INSTAY_CHECKIN_IFRAME_TITLE') : t('INSTAY_CHECKIN_TITLE')}
            </div>
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', color: themeStyles.textMuted, cursor: 'pointer' }}>
                <X size={20} />
              </button>
          </div>

          {!showPay ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, background: themeStyles.inputBg, borderRadius: 12, padding: 4 }}>
              {TABS.map((item) => {
                const active = item.id === 'card' ? cardTab : tab === item.id;
                const labelKey = item.id === 'card' && hasSavedCard ? 'INSTAY_TAB_SAVED' : item.labelKey;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={paying}
                    onClick={() => onTab(item.id === 'card' ? (hasSavedCard ? 'saved' : 'card') : item.id)}
                    style={{
                      flex: 1,
                      border: 'none',
                      borderRadius: 10,
                      padding: '0.45rem 0.2rem',
                      background: active ? '#111827' : 'transparent',
                      color: active ? '#FFF' : themeStyles.textMuted,
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      cursor: 'pointer'
                    }}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          ) : null}

          {error ? (
            <p style={{ margin: '0 0 0.85rem', color: '#F87171', fontWeight: 700, fontSize: '0.82rem' }}>{error}</p>
          ) : null}

          {cardTab && !iframeUrl ? (
            <>
              {hasSavedCard ? (
                <>
                  <p style={{ margin: '0 0 0.85rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.9rem' }}>
                    {quote?.needsCharge
                      ? t('INSTAY_CHECKIN_SAVED_BODY', { amount: amountLabel || '—', last4: savedLast4 || '••••' })
                      : t('INSTAY_CHECKIN_BODY_FREE')}
                  </p>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={onChargeSaved}
                    style={primaryBtn(GUEST_BRAND.wine)}
                  >
                    {paying ? t('INSTAY_CHECKIN_PAYING') : t('INSTAY_CHECKIN_PAY_DOOR', { amount: amountLabel || '—' })}
                  </button>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={onNewCard}
                    style={ghostBtn(themeStyles)}
                  >
                    {t('INSTAY_CHECKIN_OPT_NEW_CARD')}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 0.85rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.9rem' }}>
                    {quote?.needsCharge
                      ? t('INSTAY_CHECKIN_BODY_CHARGE_NO_MASK', { amount: amountLabel || '—' })
                      : t('INSTAY_CHECKIN_BODY_FREE')}
                  </p>
                  <button type="button" disabled={paying} onClick={onNewCard} style={primaryBtn(GUEST_BRAND.wine)}>
                    {paying ? t('INSTAY_CHECKIN_PAYING') : (quote?.needsCharge ? t('INSTAY_CHECKIN_CONFIRM') : t('INSTAY_CHECKIN_CONFIRM_FREE'))}
                  </button>
                </>
              )}
            </>
          ) : null}

          {tab === 'bank' && !iframeUrl ? (
            <>
              <p style={{ margin: '0 0 0.5rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
                {t('INSTAY_CHECKIN_BANK_BODY')}
              </p>
              <BankDetailsCard themeStyles={themeStyles} t={t} compact />
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  border: `1px dashed ${themeStyles.inputBorder}`,
                  borderRadius: 14,
                  padding: '1rem',
                  margin: '12px 0 10px',
                  cursor: 'pointer'
                }}
              >
                <Upload size={22} color="#F59E0B" />
                <span style={{ fontWeight: 800 }}>{t('INSTAY_CHECKIN_UPLOAD')}</span>
                <input type="file" accept="image/*" capture="environment" onChange={onPickBank} style={{ display: 'none' }} />
              </label>
              {bankPreview ? (
                <img src={bankPreview} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 12, marginBottom: 10 }} />
              ) : null}
              <button
                type="button"
                disabled={paying || !bankProof}
                onClick={onUploadBank}
                style={{ ...primaryBtn('#F59E0B'), opacity: bankProof ? 1 : 0.55 }}
              >
                {t('INSTAY_CHECKIN_BANK_CONFIRM')}
              </button>
            </>
          ) : null}

          {tab === 'cash' && !iframeUrl ? (
            <>
              <p style={{ margin: '0 0 0.75rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.9rem' }}>
                {t('INSTAY_CHECKIN_CASH_PIN_BODY', { amount: amountLabel || '—' })}
              </p>
              {hostWhatsAppHref ? (
                <a href={hostWhatsAppHref} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn(GUEST_BRAND.candy), display: 'flex', textDecoration: 'none', color: GUEST_BRAND.wine, marginBottom: 10 }}>
                  <MessageSquare size={18} />
                  {t('GUEST_WHATSAPP_HOST')}
                </a>
              ) : null}
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: themeStyles.textMuted }}>{t('INSTAY_CHECKIN_PIN_LABEL')}</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={cashPin}
                onChange={(e) => onCashPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                style={{
                  width: '100%',
                  margin: '6px 0 10px',
                  padding: '0.75rem',
                  borderRadius: 12,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  background: themeStyles.inputBg,
                  color: themeStyles.textPrimary,
                  fontWeight: 900,
                  letterSpacing: 8,
                  textAlign: 'center',
                  fontSize: '1.2rem'
                }}
              />
              <button
                type="button"
                disabled={paying || String(cashPin || '').length !== 4}
                onClick={onVerifyCash}
                style={primaryBtn(GUEST_BRAND.wine)}
              >
                {t('INSTAY_CHECKIN_PIN_CONFIRM')}
              </button>
            </>
          ) : null}

          {showPay ? (
            <>
              {iframeUrl ? (
                <HypPayFrame
                  url={iframeUrl}
                  t={t}
                  themeStyles={themeStyles}
                  amountLabel={amountLabel}
                  onOpenFull={openPaymentUrl}
                />
              ) : (
                <p style={{ margin: '0 0 0.85rem', color: themeStyles.textMuted, fontSize: '0.88rem' }}>
                  {t('INSTAY_CHECKIN_IFRAME_TITLE')}
                </p>
              )}
              <button type="button" disabled={paying} onClick={onCompletePay} style={primaryBtn(GUEST_BRAND.wine)}>
                {t('INSTAY_CHECKIN_DONE')}
              </button>
            </>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function primaryBtn(bg) {
  return {
    width: '100%',
    border: 'none',
    borderRadius: 12,
    padding: '0.85rem',
    fontWeight: 900,
    background: bg,
    color: '#FFF',
    cursor: 'pointer',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  };
}

function ghostBtn(themeStyles) {
  return {
    width: '100%',
    border: `1px solid ${themeStyles.inputBorder}`,
    borderRadius: 12,
    padding: '0.75rem',
    fontWeight: 800,
    background: 'transparent',
    color: themeStyles.textPrimary,
    cursor: 'pointer',
    marginBottom: 8
  };
}
