import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar as CalendarIcon,
  Clock,
  CreditCard,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Banknote,
  Building2,
  UploadCloud,
  X,
  AlertCircle
} from 'lucide-react';
import { confirmGuestCheckout, fetchGuestCheckout } from '../lib/guestCheckoutApi';
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
import HypPayFrame from './HypPayFrame';
import GuestChrome from './GuestChrome';
import GuestReach from './GuestReach';
import '../guest.css';

function idPhotoBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('IMAGE_FAILED'));
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) reject(new Error('IMAGE_FAILED'));
          else resolve(blob);
        }, 'image/jpeg', 0.72);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

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

  const [step, setStep] = useState(1); // 1: details & terms, 2: id upload, 3: payment choice
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [idPhoto, setIdPhoto] = useState(null);
  const [idSaved, setIdSaved] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [balancePref, setBalancePref] = useState('CREDIT_CARD'); // credit card first
  const [agreed, setAgreed] = useState(false);
  const [freshBooking, setFreshBooking] = useState(null);
  const [payFrame, setPayFrame] = useState('');
  const paidReturn = hypPaidReturn();
  const hypStatus = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('hyp') || '';

  const themeStyles = guestThemeStyles(theme);
  const activeBooking = freshBooking || booking;

  // Once submitted or paid, or returning guest already completed ID + payment preference
  const stayReady =
    isSubmitted ||
    paidReturn ||
    (Boolean(activeBooking?.stay?.id_photo_received_at || activeBooking?.stay?.id_scan) && Boolean(activeBooking?.balance_payment_preference || activeBooking?.payment_mode === 'CASH_TRUST'));

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
      if (sessionStorage.getItem(`guest-terms:${token}`) === '1') {
        setAgreed(true);
        setTermsChecked(true);
      }
    } catch (_) {}
  }, [token, previewBooking]);

  useEffect(() => {
    applyGuestTheme(theme);
    persistGuestTheme(theme);
  }, [theme]);

  useEffect(() => {
    const rawName = activeBooking?.unit_id ? localizedUnitName(activeBooking.unit_id, t, '') : '';
    const cleanName = cleanGuestCabinName(rawName);
    document.title = cleanName ? `${t('GUEST_PAGE_TITLE')} | ${cleanName}` : (stayReady ? t('GUEST_STAY_DOC_TITLE') : t('GUEST_CHECKOUT_TITLE'));
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
    } else if (activeBooking.payment_mode === 'CASH_TRUST') {
      setBalancePref('CASH');
    }
    if (activeBooking.stay?.id_photo_received_at) setIdSaved(true);
  }, [activeBooking?.checkout_token, activeBooking?.guest_name, activeBooking?.guest_email, activeBooking?.special_requests, activeBooking?.stay?.id_photo_received_at, activeBooking?.balance_payment_preference, activeBooking?.payment_mode]);

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
  const isPrepaid = activeBooking.payment_status === 'PAID'
    || activeBooking.payment_mode === 'BOOKING'
    || activeBooking.payment_mode === 'VOUCHER'
    || activeBooking.stay?.hyp?.paid
    || activeBooking.stay?.hyp_intent?.status === 'paid'
    || (totalPriceIls > 0 && balanceIls <= 0.5);
  const nights = Math.max(
    1,
    Number(activeBooking.nights_count) || nightsBetween(activeBooking.check_in_date, activeBooking.check_out_date)
  );
  const dateLocale = (i18n.language || 'he').startsWith('en') ? 'en-GB' : i18n.language === 'ar' ? 'ar' : i18n.language === 'th' ? 'th' : 'he-IL';

  async function chooseIdPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      window.alert(t('GUEST_ID_PHOTO_BAD'));
      return;
    }
    try {
      const blob = await idPhotoBlob(file);
      setIdPhoto((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch {
      window.alert(t('GUEST_ID_PHOTO_BAD'));
    }
  }

  // Step 1: Accept terms and advance to ID step
  const handleStep1Continue = () => {
    if (!termsChecked) return;
    try {
      if (token) sessionStorage.setItem(`guest-terms:${token}`, '1');
    } catch (_) {}
    setAgreed(true);
    setStep(2);
  };

  // Step 2: Upload and check ID photo, advance to payment choice
  const handleStep2Continue = async () => {
    if (paying) return;
    if (token && !idPhoto?.blob && !idSaved) {
      window.alert(t('GUEST_ID_PHOTO_NEED'));
      return;
    }
    if (token && idPhoto?.blob) {
      setPaying(true);
      try {
        const body = new FormData();
        body.append('file', idPhoto.blob, 'id.jpg');
        const uploaded = await fetch(`/api/checkout/${encodeURIComponent(token)}/id-photo`, {
          method: 'POST',
          body
        });
        if (!uploaded.ok) {
          window.alert(t(uploaded.status === 400 ? 'GUEST_ID_PHOTO_BAD' : 'GUEST_ID_PHOTO_FAIL'));
          setPaying(false);
          return;
        }
        setIdSaved(true);
      } catch {
        window.alert(t('GUEST_ID_PHOTO_FAIL'));
        setPaying(false);
        return;
      } finally {
        setPaying(false);
      }
    }
    setStep(3);
  };

  // Step 3: Select payment preference and finalize
  const handleFinalSubmit = async (e) => {
    if (e) e.preventDefault();
    if (paying) return;
    setPaying(true);
    try {
      const next = await confirmGuestCheckout(token, {
        guest_name: guestName || usableGuestName(activeBooking?.guest_name) || 'נטשה',
        guest_email: guestEmail,
        special_requests: specialRequests,
        pay: false,
        balance_payment_preference: balancePref,
        payment_mode: balancePref === 'CASH' ? 'CASH_TRUST' : 'CREDIT_DEPOSIT'
      });
      if (next) setFreshBooking(next);
      setIsSubmitted(true);
    } catch (_) {
      window.alert(t('GUEST_CONFIRM_FAILED'));
    } finally {
      setPaying(false);
    }
  };

  async function finishPayment() {
    if (!token) return;
    setPaying(true);
    try {
      const next = await fetchGuestCheckout(token, activeBooking?.unit_id);
      if (next) setFreshBooking(next);
      const paid = next?.payment_status === 'PAID'
        || next?.payment_status === 'DEPOSIT_PAID'
        || next?.payment_status === 'PARTIAL'
        || next?.stay?.hyp_deposit?.paid
        || next?.stay?.hyp?.paid;
      if (paid) {
        setPayFrame('');
        setIsSubmitted(true);
      }
    } catch (_) {}
    setPaying(false);
  }

  // ----------------------------------------------------
  // Terms Popup Modal
  // ----------------------------------------------------
  const renderTermsModal = () => {
    if (!showTermsModal) return null;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          boxSizing: 'border-box'
        }}
      >
        <div
          style={{
            background: themeStyles.cardBg || (theme === 'dark' ? '#18181B' : '#FFFFFF'),
            border: `1px solid ${themeStyles.inputBorder}`,
            borderRadius: 16,
            width: '100%',
            maxWidth: 520,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            color: themeStyles.textPrimary
          }}
        >
          <div
            style={{
              padding: '1rem 1.25rem',
              borderBottom: `1px solid ${themeStyles.inputBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: themeStyles.inputBg
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, fontSize: '1.05rem' }}>
              <FileText size={18} color={themeStyles.accent} />
              <span>{t('GUEST_TERMS_TITLE')}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTermsModal(false)}
              style={{
                background: 'none',
                border: 0,
                cursor: 'pointer',
                color: themeStyles.textMuted,
                padding: 4,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              padding: '1.1rem 1.25rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              fontSize: '0.86rem',
              lineHeight: 1.55
            }}
          >
            <p style={{ margin: 0, fontWeight: 800, color: themeStyles.accent }}>
              {t('GUEST_TERMS_LEAD')}
            </p>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                style={{
                  background: themeStyles.inputBg,
                  padding: '0.65rem 0.85rem',
                  borderRadius: 10,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  fontSize: '0.84rem'
                }}
              >
                {t(`GUEST_TERMS_${n}`)}
              </div>
            ))}
          </div>

          <div
            style={{
              padding: '0.9rem 1.25rem',
              borderTop: `1px solid ${themeStyles.inputBorder}`,
              background: themeStyles.inputBg
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTermsChecked(true);
                setShowTermsModal(false);
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 10,
                border: 0,
                background: themeStyles.cta,
                color: themeStyles.ctaText,
                fontWeight: 900,
                fontSize: '0.94rem',
                cursor: 'pointer'
              }}
            >
              {t('GUEST_TERMS_POPUP_CLOSE')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // Step Progress Bar (1: פרטי הזמנה | 2: תעודה מזהה | 3: אופן תשלום)
  // ----------------------------------------------------
  const renderStepIndicator = () => {
    const steps = [
      { num: 1, name: t('GUEST_STEP_1_NAME') },
      { num: 2, name: t('GUEST_STEP_2_NAME') },
      { num: 3, name: t('GUEST_STEP_3_NAME') }
    ];

    return (
      <div style={{ marginBottom: '1.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.5rem' }}>
          {steps.map((s, idx) => {
            const isCurrent = step === s.num;
            const isPassed = step > s.num;
            return (
              <React.Fragment key={s.num}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '0.88rem',
                      background: isCurrent ? themeStyles.cta : isPassed ? '#10B981' : themeStyles.inputBg,
                      color: isCurrent ? themeStyles.ctaText : isPassed ? '#FFFFFF' : themeStyles.textMuted,
                      border: `2px solid ${isCurrent ? themeStyles.cta : isPassed ? '#10B981' : themeStyles.inputBorder}`,
                      boxShadow: isCurrent ? `0 0 0 3px ${themeStyles.cta}33` : 'none',
                      transition: 'all 0.25s ease'
                    }}
                  >
                    {isPassed ? '✓' : s.num}
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: isCurrent ? 900 : 700,
                      color: isCurrent ? themeStyles.textPrimary : themeStyles.textMuted
                    }}
                  >
                    {s.name}
                  </span>
                </div>
                {idx < 2 && (
                  <div
                    style={{
                      flex: 1,
                      height: 2,
                      margin: '0 8px 18px',
                      background: step > idx + 1 ? '#10B981' : themeStyles.inputBorder,
                      transition: 'all 0.25s ease'
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div
          style={{
            fontSize: '0.74rem',
            color: themeStyles.accent,
            fontWeight: 800,
            textAlign: 'center',
            marginTop: 6
          }}
        >
          {t('GUEST_STEP_INDICATOR', {
            current: step,
            total: 3,
            title: step === 1 ? t('GUEST_STEP_1_NAME') : step === 2 ? t('GUEST_STEP_2_NAME') : t('GUEST_STEP_3_NAME')
          })}
        </div>
      </div>
    );
  };

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
          {renderTermsModal()}
          {renderStepIndicator()}

          {/* ------------------------------------------------ */}
          {/* STEP 1: פרטי הזמנה והסכם לתקנון                   */}
          {/* ------------------------------------------------ */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div
                className="guest-stay-summary"
                style={{
                  background: themeStyles.inputBg,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  color: themeStyles.textPrimary,
                  borderRadius: 14,
                  padding: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{unitName}</div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: themeStyles.accent }}>
                    {nights} {t('GUEST_NIGHTS_COUNT', { count: nights })}
                  </span>
                </div>

                <div className="guest-stay-split" style={{ borderTop: `1px solid ${themeStyles.inputBorder}`, paddingTop: 10 }}>
                  <div className="guest-stay-dates" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 8, rowGap: 4, fontSize: '0.82rem', alignItems: 'baseline' }}>
                    <span style={{ color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.7rem' }}>{t('GUEST_DATE_IN')}</span>
                    <span style={{ fontWeight: 800 }}>{formatStayDate(activeBooking.check_in_date, dateLocale)} (15:00)</span>
                    <span style={{ color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.7rem' }}>{t('GUEST_DATE_OUT')}</span>
                    <span style={{ fontWeight: 800 }}>{formatStayDate(activeBooking.check_out_date, dateLocale)} (11:00)</span>
                  </div>
                  <div className="guest-stay-pax" style={{ color: themeStyles.textPrimary }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>
                      {t('GUEST_PAX_ADULTS', { count: Math.max(1, Number(activeBooking.adults_count) || 2) })}
                    </div>
                    {Number(activeBooking.children_count) > 0 ? (
                      <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>
                        {t('GUEST_PAX_CHILDREN', { count: Number(activeBooking.children_count) })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="guest-stay-bottom" style={{ borderTop: `1px solid ${themeStyles.inputBorder}`, marginTop: 10, paddingTop: 10 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
                    {t('GUEST_NAME')}: <strong style={{ color: themeStyles.textPrimary }}>{guestName || 'נטשה'}</strong>
                  </span>
                  <span style={{ fontWeight: 900, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
                    {t('GUEST_STAY_TOTAL_LABEL')}: ₪{totalPriceIls.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Guest name edit field if needed */}
              <div
                style={{
                  background: themeStyles.inputBg,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  borderRadius: 14,
                  padding: '0.9rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_NAME')}</label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="נטשה"
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 9,
                      background: themeStyles.cardBg || '#FFFFFF',
                      border: `1px solid ${themeStyles.inputBorder}`,
                      color: themeStyles.textPrimary,
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      marginTop: 3,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_EMAIL')}</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="email@example.com"
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 9,
                      background: themeStyles.cardBg || '#FFFFFF',
                      border: `1px solid ${themeStyles.inputBorder}`,
                      color: themeStyles.textPrimary,
                      fontSize: '0.9rem',
                      marginTop: 3,
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Terms Agreement Box */}
              <div
                style={{
                  background: themeStyles.accentSoft,
                  border: `1px solid ${themeStyles.accent}`,
                  borderRadius: 14,
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 900, fontSize: '0.95rem', color: themeStyles.accent }}>
                    {t('GUEST_TERMS_TITLE')}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    style={{
                      background: 'none',
                      border: 0,
                      color: themeStyles.accent,
                      fontSize: '0.82rem',
                      fontWeight: 900,
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {t('GUEST_TERMS_POPUP_LINK')}
                  </button>
                </div>

                <label
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={termsChecked}
                    onChange={(e) => setTermsChecked(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: themeStyles.cta, cursor: 'pointer' }}
                  />
                  <span>{t('GUEST_TERMS_CHECK')}</span>
                </label>
              </div>

              <button
                type="button"
                disabled={!termsChecked}
                onClick={handleStep1Continue}
                style={{
                  width: '100%',
                  background: themeStyles.cta,
                  color: themeStyles.ctaText,
                  border: 'none',
                  borderRadius: 12,
                  padding: '0.85rem',
                  fontSize: '0.96rem',
                  fontWeight: 900,
                  cursor: !termsChecked ? 'not-allowed' : 'pointer',
                  opacity: !termsChecked ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 4,
                  transition: 'opacity 0.2s ease'
                }}
              >
                <span>{t('GUEST_STEP_1_CTA')}</span>
              </button>
            </div>
          )}

          {/* ------------------------------------------------ */}
          {/* STEP 2: העלאת תעודת זהות גדולה וברורה על כל הדף  */}
          {/* ------------------------------------------------ */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>
                  {t('GUEST_ID_PHOTO_HERO_TITLE')}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: themeStyles.textMuted, lineHeight: 1.5 }}>
                  {t('GUEST_ID_PHOTO_HERO_SUBTITLE')}
                </p>
              </div>

              {/* Large prominent hero dropzone */}
              <div
                style={{
                  background: themeStyles.inputBg,
                  border: `2px dashed ${idPhoto?.url || idSaved ? '#10B981' : themeStyles.inputBorder}`,
                  borderRadius: 16,
                  padding: idPhoto?.url ? '1rem' : '2.5rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  gap: 12,
                  position: 'relative'
                }}
              >
                {idPhoto?.url ? (
                  <>
                    <img
                      src={idPhoto.url}
                      alt="ID Preview"
                      style={{
                        width: '100%',
                        maxHeight: 260,
                        objectFit: 'contain',
                        borderRadius: 12,
                        background: '#00000022'
                      }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontWeight: 900, fontSize: '0.9rem' }}>
                      <CheckCircle2 size={18} />
                      <span>{t('GUEST_ID_PHOTO_READY')}</span>
                    </div>
                  </>
                ) : idSaved ? (
                  <div style={{ padding: '2rem 1rem' }}>
                    <CheckCircle2 size={48} color="#10B981" style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: '1rem', fontWeight: 900, color: '#10B981' }}>{t('GUEST_ID_PHOTO_READY')}</div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        background: themeStyles.accentSoft,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: themeStyles.accent
                      }}
                    >
                      <Camera size={32} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.96rem' }}>צילום תעודת זהות של {guestName || 'נטשה'}</div>
                      <div style={{ fontSize: '0.78rem', color: themeStyles.textMuted, marginTop: 4 }}>
                        ניתן לצלם ישירות מהמצלמה או לבחור קובץ קיים
                      </div>
                    </div>
                  </>
                )}

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 12,
                    padding: '0.7rem 1.4rem',
                    border: `1px solid ${themeStyles.cta}`,
                    background: idPhoto?.url || idSaved ? themeStyles.inputBg : themeStyles.cta,
                    color: idPhoto?.url || idSaved ? themeStyles.textPrimary : themeStyles.ctaText,
                    fontWeight: 900,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                >
                  <Camera size={16} />
                  <span>{idPhoto?.url || idSaved ? t('GUEST_ID_PHOTO_CHANGE_BIG') : t('GUEST_ID_PHOTO_PICK_BIG')}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={chooseIdPhoto}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {/* Navigation buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    padding: '0.8rem',
                    borderRadius: 12,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    background: themeStyles.inputBg,
                    color: themeStyles.textPrimary,
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  {t('GUEST_STEP_BACK')}
                </button>
                <button
                  type="button"
                  disabled={paying || (!idPhoto?.blob && !idSaved)}
                  onClick={handleStep2Continue}
                  style={{
                    padding: '0.8rem',
                    borderRadius: 12,
                    border: 'none',
                    background: themeStyles.cta,
                    color: themeStyles.ctaText,
                    fontWeight: 900,
                    fontSize: '0.95rem',
                    cursor: paying || (!idPhoto?.blob && !idSaved) ? 'not-allowed' : 'pointer',
                    opacity: paying || (!idPhoto?.blob && !idSaved) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  {paying ? t('GUEST_ID_SCANNING') : t('GUEST_STEP_2_CTA')}
                </button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------ */}
          {/* STEP 3: איך הוא רוצה לשלם (בחירת אופן תשלום)      */}
          {/* ------------------------------------------------ */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Receipt acknowledgement badge */}
              <div
                style={{
                  background: '#10B98118',
                  border: '1px solid #10B98166',
                  borderRadius: 14,
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  color: '#10B981',
                  fontWeight: 800,
                  fontSize: '0.88rem'
                }}
              >
                <CheckCircle2 size={20} />
                <span>תעודת הזהות נקלטה בהצלחה!</span>
              </div>

              {isPrepaid ? (
                <div
                  style={{
                    background: '#10B98115',
                    border: '1px solid #10B98144',
                    borderRadius: 14,
                    padding: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                  }}
                >
                  <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '1rem', color: themeStyles.textPrimary }}>
                      ההזמנה שולמה מראש במלואה
                    </div>
                    <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, marginTop: 3 }}>
                      {activeBooking.payment_mode === 'BOOKING'
                        ? 'ההזמנה שולמה דרך Booking.com. אין יתרה לתשלום.'
                        : activeBooking.payment_mode === 'VOUCHER'
                          ? 'ההזמנה מוסדרת באמצעות שובר. אין יתרה לתשלום.'
                          : 'התשלום עבור ההזמנה הוסדר מראש במלואו.'}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>
                      {t('GUEST_PAY_CHOICE_TITLE')}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: themeStyles.textMuted, lineHeight: 1.5 }}>
                      {t('GUEST_PAY_CHOICE_SUBTITLE')}
                    </p>
                  </div>

                  {/* Payment Mode Option Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* 1. Credit Card (First) */}
                <div
                  onClick={() => setBalancePref('CREDIT_CARD')}
                  style={{
                    background: balancePref === 'CREDIT_CARD' ? themeStyles.accentSoft : themeStyles.inputBg,
                    border: `2px solid ${balancePref === 'CREDIT_CARD' ? themeStyles.accent : themeStyles.inputBorder}`,
                    borderRadius: 14,
                    padding: '1rem 1.1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ color: themeStyles.accent, marginTop: 2 }}>
                    <CreditCard size={26} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: '0.96rem', color: themeStyles.textPrimary }}>
                        {t('GUEST_PAY_CARD_TITLE')}
                      </span>
                      <CreditCard size={15} color={themeStyles.accent} />
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: themeStyles.textMuted, lineHeight: 1.4 }}>
                      {t('GUEST_PAY_CARD_DESC')}
                    </p>
                  </div>
                </div>

                {/* 2. Cash on arrival (Second - representative collects) */}
                <div
                  onClick={() => setBalancePref('CASH')}
                  style={{
                    background: balancePref === 'CASH' ? themeStyles.accentSoft : themeStyles.inputBg,
                    border: `2px solid ${balancePref === 'CASH' ? themeStyles.accent : themeStyles.inputBorder}`,
                    borderRadius: 14,
                    padding: '1rem 1.1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.6rem', lineHeight: 1, marginTop: 2 }}>💵</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 900, fontSize: '0.96rem', color: themeStyles.textPrimary }}>
                        {t('GUEST_PAY_CASH_TITLE')}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: themeStyles.textMuted, lineHeight: 1.45 }}>
                      {t('GUEST_PAY_CASH_DESC')}
                    </p>
                  </div>
                </div>

                {/* 3. Bank Transfer */}
                <div
                  onClick={() => setBalancePref('BANK_TRANSFER')}
                  style={{
                    background: balancePref === 'BANK_TRANSFER' ? themeStyles.accentSoft : themeStyles.inputBg,
                    border: `2px solid ${balancePref === 'BANK_TRANSFER' ? themeStyles.accent : themeStyles.inputBorder}`,
                    borderRadius: 14,
                    padding: '1rem 1.1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ color: themeStyles.accent, marginTop: 2 }}>
                    <Building2 size={26} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: '0.96rem', color: themeStyles.textPrimary }}>
                      {t('GUEST_PAY_BANK_TITLE')}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: themeStyles.textMuted, lineHeight: 1.4 }}>
                      {t('GUEST_PAY_BANK_DESC')}
                    </p>
                  </div>
                </div>
              </div>
              </>
              )}

              {/* Special Requests (Optional) */}
              <div style={{ marginTop: 2 }}>
                {showRequests ? (
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted }}>
                      {t('SPECIAL_REQUESTS')}
                    </label>
                    <textarea
                      rows={2}
                      placeholder={t('GUEST_REQUESTS_PLACEHOLDER')}
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 10,
                        background: themeStyles.inputBg,
                        border: `1px solid ${themeStyles.inputBorder}`,
                        color: themeStyles.textPrimary,
                        fontSize: '0.84rem',
                        resize: 'none',
                        boxSizing: 'border-box',
                        marginTop: 4
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRequests(true)}
                    style={{
                      background: 'none',
                      border: 0,
                      color: themeStyles.accent,
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    + {t('GUEST_REQUESTS_ADD')}
                  </button>
                )}
              </div>

              {/* Navigation buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    padding: '0.85rem',
                    borderRadius: 12,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    background: themeStyles.inputBg,
                    color: themeStyles.textPrimary,
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  {t('GUEST_STEP_BACK')}
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={handleFinalSubmit}
                  style={{
                    padding: '0.85rem',
                    borderRadius: 12,
                    border: 'none',
                    background: themeStyles.cta,
                    color: themeStyles.ctaText,
                    fontWeight: 900,
                    fontSize: '0.98rem',
                    cursor: paying ? 'wait' : 'pointer',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                  }}
                >
                  {paying ? t('GUEST_LOADING') : t('GUEST_STEP_3_CTA')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
