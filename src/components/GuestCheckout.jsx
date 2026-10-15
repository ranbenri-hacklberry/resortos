import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react';
import { confirmGuestCheckout } from '../lib/guestCheckoutApi';
import { useGuestBooking } from '../lib/useGuestBooking';
import { persistStayToken } from '../lib/stayToken';
import { isAndroidInAppBrowser, listenHypParentBreakout } from '../lib/guestPayBrowser';
import {
  applyGuestTheme,
  guestThemeStyles,
  persistGuestTheme,
  readGuestTheme,
  usableGuestName,
  guestShouldSeeStayPortal
} from '../lib/guestTheme';
import { cleanGuestCabinName, localizedUnitName } from '../lib/units';
import { applyStayCabin } from '../lib/cabinParty';
import { applyPaySplitView } from '../lib/paySplit';
import GuestStay from './GuestStay';
import GuestChrome from './GuestChrome';
import GuestTicketWallet from './GuestTicketWallet';
import BankDetailsCard from './BankDetailsCard';

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${checkOut}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function formatStayDate(iso, locale) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale || 'he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
  }).format(date);
}

function hypPaidReturn() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('hyp') === 'ok';
}

export default function GuestCheckout({ token, onComplete, theme: themeProp = 'light', previewBooking = null }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => readGuestTheme(themeProp));

  const fetched = useGuestBooking(previewBooking ? '' : token);
  const booking = previewBooking || fetched.booking;
  const error = previewBooking ? null : fetched.error;
  const retry = fetched.retry;

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [showRequests, setShowRequests] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [balancePref, setBalancePref] = useState('CREDIT_CARD');
  const [agreed, setAgreed] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [freshBooking, setFreshBooking] = useState(null);
  const paidReturn = hypPaidReturn();
  const hypStatus = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('hyp') || '';

  const themeStyles = guestThemeStyles(theme);

  const activeBooking = freshBooking || booking;

  const stayReady =
    isSubmitted ||
    paidReturn ||
    guestShouldSeeStayPortal(activeBooking);

  useEffect(() => {
    if (previewBooking || !token || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('hyp')) return;
    const ccode = params.get('CCode');
    if (ccode == null || ccode === '') return;
    if (!(params.get('Id') || params.get('Order'))) return;
    window.location.replace(`/api/checkout/${encodeURIComponent(token)}/hyp${window.location.search}`);
  }, [token, previewBooking]);

  useEffect(() => listenHypParentBreakout((href) => {
    window.location.replace(href);
  }), []);

  useEffect(() => {
    if (!token || previewBooking) return;
    try {
      if (sessionStorage.getItem(`guest-terms:${token}`) === '1') setAgreed(true);
    } catch (_) {}
  }, [token, previewBooking]);

  useEffect(() => {
    applyGuestTheme(theme);
    persistGuestTheme(theme);
  }, [theme]);

  useEffect(() => {
    const rawName = activeBooking?.unit_id ? localizedUnitName(activeBooking.unit_id, t, '') : '';
    const cleanName = cleanGuestCabinName(rawName);
    document.title = cleanName ? `ברוכים הבאים ל${cleanName}` : (stayReady ? t('GUEST_STAY_DOC_TITLE') : t('GUEST_CHECKOUT_TITLE'));
  }, [stayReady, activeBooking?.unit_id, t]);

  useEffect(() => {
    if (activeBooking?.checkout_token) persistStayToken(activeBooking.checkout_token);
    if (!activeBooking) return;
    setGuestName((current) => current || usableGuestName(activeBooking.guest_name));
    setGuestEmail((current) => current || activeBooking.guest_email || '');
    setSpecialRequests((current) => current || activeBooking.special_requests || '');
    if (activeBooking.special_requests) setShowRequests(true);
    if (activeBooking.balance_payment_preference) {
      setBalancePref(activeBooking.balance_payment_preference);
    }
  }, [activeBooking?.checkout_token, activeBooking?.guest_name, activeBooking?.guest_email, activeBooking?.special_requests]);

  const shell = (children, center = null) => (
    <div
      style={{
        background: themeStyles.wrapperBg,
        minHeight: '100dvh',
        padding: '0.45rem 0.75rem 0.7rem',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: themeStyles.font,
        color: themeStyles.textPrimary
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <GuestChrome
          theme={theme}
          onThemeChange={setTheme}
          themeStyles={themeStyles}
          center={center}
        />
        {children}
      </div>
    </div>
  );

  if (booking === undefined) {
    return shell(
      <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <Clock size={40} color={themeStyles.accent} style={{ marginBottom: '1rem' }} />
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{t('GUEST_LOADING')}</h3>
      </div>
    );
  }

  if (!activeBooking) {
    const network = error === 'NETWORK';
    const missing = error === 'NOT_FOUND' || !error;
    return shell(
      <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
        <Clock size={40} color="#F59E0B" style={{ marginBottom: '1rem' }} />
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
          {network ? t('GUEST_NETWORK_TITLE') : !token ? t('GUEST_LINK_MISSING_TITLE') : missing ? t('GUEST_NOT_FOUND_TITLE') : t('GUEST_EXPIRED_TITLE')}
        </h3>
        <p style={{ fontSize: '0.85rem', color: themeStyles.textMuted, marginTop: '0.5rem' }}>
          {network ? t('GUEST_NETWORK_BODY') : !token ? t('GUEST_LINK_MISSING_BODY') : missing ? t('GUEST_NOT_FOUND_BODY') : t('GUEST_EXPIRED_BODY')}
        </p>
        {network ? (
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: '1.25rem',
              border: 0,
              borderRadius: 12,
              padding: '0.75rem 1.2rem',
              background: themeStyles.cta,
              color: themeStyles.ctaText,
              fontWeight: 800,
              fontSize: '0.95rem'
            }}
          >
            {t('GUEST_RETRY')}
          </button>
        ) : null}
      </div>
    );
  }

  const unitParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('unit') : '';
  const viewedBooking = stayReady
    ? applyPaySplitView(applyStayCabin(activeBooking, unitParam), unitParam || activeBooking.stay?.booker_cabin_id || activeBooking.unit_id)
    : activeBooking;
  const unitName = localizedUnitName(viewedBooking.unit_id, t, t('GUEST_CABIN_FALLBACK'));

  const paymentMode = activeBooking.payment_mode || 'CREDIT_DEPOSIT';
  const totalPriceIls = Math.round((activeBooking.total_price_agorot || 0) / 100);
  const depositIls = Math.round((activeBooking.deposit_agorot || 0) / 100);
  const payNowIls = paymentMode === 'CASH_TRUST' ? 0 : paymentMode === 'CREDIT_FULL' ? totalPriceIls : depositIls;
  const balanceIls = Math.max(0, totalPriceIls - payNowIls);
  const nights = Math.max(
    1,
    Number(activeBooking.nights_count) || nightsBetween(activeBooking.check_in_date, activeBooking.check_out_date)
  );
  const dateLocale = (i18n.language || 'he').startsWith('en') ? 'en-GB' : i18n.language === 'ar' ? 'ar' : i18n.language === 'th' ? 'th' : 'he-IL';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (paying) return;
    setPaying(true);
    try {
      const next = await confirmGuestCheckout(token, {
        guest_name: guestName || usableGuestName(activeBooking?.guest_name) || 'אורח',
        guest_email: guestEmail,
        special_requests: specialRequests,
        pay: false,
        balance_payment_preference: balancePref
      });
      if (next) setFreshBooking(next);
      setIsSubmitted(true);
    } catch (_) {
      window.alert(t(paymentMode === 'CASH_TRUST' ? 'GUEST_CONFIRM_FAILED' : 'GUEST_PAY_FAILED'));
    } finally {
      setPaying(false);
    }
  };

  async function acceptTerms() {
    if (!termsChecked || paying) return;
    try {
      if (token) sessionStorage.setItem(`guest-terms:${token}`, '1');
    } catch (_) {}
    await handleSubmit({ preventDefault() {} });
  }

  return shell(
    <div>
      {stayReady ? (
          <GuestStay
          booking={{ ...viewedBooking, guest_name: guestName || usableGuestName(viewedBooking.guest_name) }}
          unitName={unitName}
          themeStyles={themeStyles}
          justConfirmed={isSubmitted || paidReturn}
        />
      ) : (
        <>
          <div style={{ marginBottom: '0.35rem' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, lineHeight: 1.2 }}>
              {t('GUEST_CHECKOUT_TITLE')}
            </h2>
            <div style={{ fontSize: '0.68rem', color: themeStyles.textMuted, marginTop: 1 }}>
              {t('GUEST_FORM_SUBTITLE')}
              {String(token || activeBooking?.checkout_token || '').startsWith('tok_demo') ? (
                <div style={{ marginTop: 4, fontWeight: 800 }}>{t('GUEST_DEMO_CHARGE_HINT')}</div>
              ) : null}
            </div>
          </div>

          <div
            className="guest-stay-summary"
            style={{
              background: themeStyles.inputBg,
              border: `1px solid ${themeStyles.inputBorder}`,
              color: themeStyles.textPrimary
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{unitName}</div>
            <div className="guest-stay-split">
              <div className="guest-stay-dates" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 4, fontSize: '0.8rem', alignItems: 'baseline' }}>
                <span style={{ color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.68rem' }}>{t('GUEST_DATE_IN')}</span>
                <span style={{ fontWeight: 800 }}>{formatStayDate(activeBooking.check_in_date, dateLocale)}</span>
                <span style={{ color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.68rem' }}>{t('GUEST_DATE_OUT')}</span>
                <span style={{ fontWeight: 800 }}>{formatStayDate(activeBooking.check_out_date, dateLocale)}</span>
              </div>
              <div className="guest-stay-pax" style={{ color: themeStyles.textPrimary }}>
                <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>
                  {t('GUEST_PAX_ADULTS', { count: Math.max(1, Number(activeBooking.adults_count) || 2) })}
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.8rem' }}>
                  {t('GUEST_PAX_CHILDREN', { count: Math.max(0, Number(activeBooking.children_count) || 0) })}
                </div>
                {activeBooking.baby_cot_required || activeBooking.stay?.baby_cot_required ? (
                  <div style={{ fontWeight: 700, fontSize: '0.72rem', color: themeStyles.textMuted }}>
                    {t('GUEST_BABY_COT')}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="guest-stay-bottom">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 800, color: themeStyles.textMuted }}>
                <CalendarIcon size={13} color={themeStyles.accent} />
                {t('GUEST_NIGHTS_COUNT', { count: nights })}
              </span>
              <span style={{ fontWeight: 900, fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>
                {t('GUEST_STAY_TOTAL_LABEL')} ₪{totalPriceIls.toLocaleString()}
              </span>
            </div>
          </div>

          {hypStatus === 'fail' ? (
            <p style={{ margin: '0 0 0.6rem', color: '#B91C1C', fontWeight: 700, fontSize: '0.85rem' }}>
              {t('GUEST_PAY_FAILED')}
            </p>
          ) : null}

          {!agreed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.7rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>{t('GUEST_TERMS_TITLE')}</h3>
              <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.45, fontWeight: 700 }}>{t('GUEST_TERMS_LEAD')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.84rem', lineHeight: 1.45 }}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <p key={n} style={{ margin: 0 }}>{t(`GUEST_TERMS_${n}`)}</p>
                ))}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontWeight: 800, fontSize: '0.86rem' }}>
                <input
                  type="checkbox"
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>{t('GUEST_TERMS_CHECK')}</span>
              </label>
              <button
                type="button"
                disabled={!termsChecked || paying}
                onClick={acceptTerms}
                style={{
                  width: '100%',
                  background: themeStyles.cta,
                  color: themeStyles.ctaText,
                  border: 'none',
                  borderRadius: 10,
                  padding: '0.75rem',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  cursor: !termsChecked || paying ? 'not-allowed' : 'pointer',
                  opacity: !termsChecked || paying ? 0.55 : 1
                }}
              >
                {paying ? t('GUEST_LOADING') : t('GUEST_TERMS_CONTINUE')}
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div className="guest-checkout-fields">
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_NAME')}</label>
                <input
                  type="text"
                  required
                  placeholder=""
                  autoComplete="name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 9,
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.875rem',
                    marginTop: 2
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_EMAIL')}</label>
                <input
                  type="email"
                  placeholder=""
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    borderRadius: 9,
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.875rem',
                    marginTop: 2
                  }}
                />
                <div className="guest-email-hint" style={{ fontSize: '0.62rem', color: themeStyles.textMuted, marginTop: 2, lineHeight: 1.25 }}>
                  {t('GUEST_EMAIL_HINT')}
                </div>
              </div>
            </div>
            {showRequests ? (
              <div>
                <textarea
                  rows={2}
                  placeholder={t('GUEST_REQUESTS_PLACEHOLDER')}
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.6rem',
                    borderRadius: 9,
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.8rem',
                    resize: 'none'
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowRequests(true)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 0,
                  padding: 0,
                  color: themeStyles.accent,
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer'
                }}
              >
                {t('GUEST_REQUESTS_ADD')}
              </button>
            )}
            {paymentMode === 'CREDIT_DEPOSIT' && totalPriceIls > depositIls + 0.5 ? (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: themeStyles.textMuted, marginBottom: 5 }}>
                  {t('GUEST_BALANCE_ASK')}
                </div>
                <div className="guest-seg" style={{ '--guest-seg-border': themeStyles.inputBorder, background: themeStyles.inputBg }}>
                  {[
                    { id: 'CREDIT_CARD', label: t('GUEST_BALANCE_SEG_CARD') },
                    { id: 'BANK_TRANSFER', label: t('GUEST_BALANCE_SEG_BANK') },
                    { id: 'CASH', label: t('GUEST_BALANCE_SEG_CASH') }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={balancePref === opt.id ? 'is-on' : ''}
                      onClick={() => setBalancePref(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {balancePref === 'CREDIT_CARD' ? (
                  <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: themeStyles.textMuted, fontWeight: 700, lineHeight: 1.35 }}>
                    {t('GUEST_BALANCE_CARD_NOTICE')}
                  </p>
                ) : null}
                {balancePref === 'BANK_TRANSFER' ? (
                  <>
                    <BankDetailsCard themeStyles={themeStyles} t={t} compact />
                    <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: '#D97706', fontWeight: 700, lineHeight: 1.35 }}>
                      {t('GUEST_BALANCE_BANK_NOTICE')}
                    </p>
                  </>
                ) : null}
                {balancePref === 'CASH' ? (
                  <p style={{ margin: '4px 0 0', fontSize: '0.66rem', color: '#D97706', fontWeight: 700, lineHeight: 1.35 }}>
                    {t('GUEST_BALANCE_CASH_NOTICE')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={paying}
              style={{
                width: '100%',
                background: themeStyles.cta,
                color: themeStyles.ctaText,
                border: 'none',
                borderRadius: 10,
                padding: '0.7rem',
                fontSize: '0.92rem',
                fontWeight: 900,
                cursor: paying ? 'wait' : 'pointer',
                boxShadow: 'none',
                opacity: paying ? 0.75 : 1,
                lineHeight: 1.25
              }}
            >
              {paying ? (
                t('GUEST_PAY_REDIRECT')
              ) : paymentMode === 'CASH_TRUST' ? (
                t('CONFIRM_AND_PAY')
              ) : paymentMode === 'CREDIT_FULL' ? (
                t('CONFIRM_AND_PAY_FULL', { amount: totalPriceIls.toLocaleString() })
              ) : (
                <>
                  <div>{t('CONFIRM_AND_PAY_DEPOSIT', { amount: depositIls.toLocaleString() })}</div>
                  {balanceIls > 0.5 ? (
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.88, marginTop: 3 }}>
                      {t('GUEST_PAY_BALANCE_LINE', {
                        amount: balanceIls.toLocaleString(),
                        method:
                          balancePref === 'BANK_TRANSFER'
                            ? t('GUEST_PAY_METHOD_BANK')
                            : balancePref === 'CASH'
                              ? t('GUEST_PAY_METHOD_CASH')
                              : t('GUEST_PAY_METHOD_CARD')
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </button>
            <p
              style={{
                margin: 0,
                textAlign: 'center',
                fontSize: '0.64rem',
                lineHeight: 1.35,
                color: themeStyles.textMuted,
                fontWeight: 600
              }}
            >
              {paymentMode === 'CASH_TRUST'
                ? t('GUEST_PAY_CASH')
                : paymentMode === 'CREDIT_FULL'
                  ? t('GUEST_PAY_CARD_FULL')
                  : t('GUEST_PAY_CAPTION')}
              {paymentMode !== 'CASH_TRUST' && isAndroidInAppBrowser() ? ` · ${t('GUEST_GPAY_OPEN_CHROME')}` : ''}
            </p>
          </form>
          )}
        </>
      )}
    </div>,
    stayReady ? <GuestTicketWallet booking={activeBooking} themeStyles={themeStyles} /> : null
  );
}
