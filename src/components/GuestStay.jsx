import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Clock, CreditCard, Map, MessageSquare, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  googleMapsUrl,
  guestHostWhatsAppHref,
  wazeUrl
} from '../lib/stayProperty';
import { useDynamicText } from '../lib/translator';
import { areaGuideSource, guideClusterForUnit } from '../lib/areaGuide';
import { israelToday } from '../lib/cabinAccess';
import { guestCheckinAt, isInHouse, isPaidForGuestCheckin, shouldAutoGuestCheckin, stayPhase } from '../lib/stayAccess';
import { fetchGuestCheckout, stayAction } from '../lib/guestCheckoutApi';
import { localizedUnitName } from '../lib/units';
import GuestAreaGuide from './GuestAreaGuide';
import GuestInStay from './GuestInStay';
import CheckinDrawer, { tabFromPreference } from './CheckinDrawer';
import { listenHypParentBreakout, openPaymentUrl, shouldEmbedHypPayment } from '../lib/guestPayBrowser';

function displayDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function LiveText({ text }) {
  const translated = useDynamicText(text, null, 'he');
  return <>{translated}</>;
}

function ActionBtn({ href, onClick, bg, color = '#FFF', children }) {
  const style = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    textDecoration: 'none',
    border: '1px solid rgba(38, 19, 15, 0.08)',
    cursor: 'pointer',
    background: bg,
    color,
    borderRadius: 12,
    padding: '0.7rem 0.4rem',
    fontWeight: 800,
    fontSize: '0.78rem',
    width: '100%'
  };
  if (href) {
    return (
      <a href={href} target={href.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer" style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {children}
    </button>
  );
}

export default function GuestStay({ booking, unitName, themeStyles, justConfirmed = false }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  const [stay, setStay] = useState(booking.stay || {});
  const [payment, setPayment] = useState(booking.payment || null);
  const [liveStatus, setLiveStatus] = useState(booking.booking_status);
  const autoCheckinSent = useRef(false);

  useEffect(() => {
    setStay(booking.stay || {});
    setPayment(booking.payment || null);
    setLiveStatus(booking.booking_status);
  }, [
    booking.id,
    booking.booking_status,
    booking.check_in_date,
    booking.check_out_date,
    booking.stay,
    booking.payment
  ]);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinStep, setCheckinStep] = useState('card');
  const [checkinBusy, setCheckinBusy] = useState('');
  const [checkinError, setCheckinError] = useState('');
  const [bankProof, setBankProof] = useState('');
  const [bankPreview, setBankPreview] = useState('');
  const [cashPin, setCashPin] = useState('');
  const phase = stayPhase({ ...booking, stay }, now);
  const cabin = localizedUnitName(booking.unit_id, t, unitName || t('GUEST_CABIN_FALLBACK'));
  const untilCheckIn = useMemo(
    () => (guestCheckinAt({ ...booking, stay })?.getTime() || 0) - now.getTime(),
    [booking, stay, now]
  );

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => listenHypParentBreakout((href) => {
    window.location.replace(href);
  }), []);

  useEffect(() => {
    let stop = false;
    async function pull() {
      if (!booking?.checkout_token) return;
      try {
        const row = await fetchGuestCheckout(booking.checkout_token, booking.unit_id);
        if (stop) return;
        if (row?.stay) setStay(row.stay);
        if (row?.payment) setPayment(row.payment);
        if (row?.booking_status) setLiveStatus(row.booking_status);
      } catch (_) {}
    }
    const done = Boolean(stay?.guest_checked_in_at) || booking.booking_status === 'CHECKED_OUT';
    if (!done) pull();
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (stay?.guest_checked_in_at || booking.booking_status === 'CHECKED_OUT') return;
      pull();
    }, 60000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [booking?.checkout_token, stay?.guest_checked_in_at, booking.booking_status]);

  const countdown = useMemo(() => {
    if (untilCheckIn <= 0) return null;
    const totalMin = Math.floor(untilCheckIn / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const minutes = totalMin % 60;
    if (days > 0) return t('GUEST_DAYS_HOURS', { days, hours });
    if (hours > 0) return t('GUEST_HOURS_MINUTES', { hours, minutes });
    return t('GUEST_MINUTES', { minutes });
  }, [untilCheckIn, t]);

  const datesLabel = `${displayDate(booking.check_in_date)}–${displayDate(booking.check_out_date)}`;
  const hostWhatsAppText = t('GUEST_HOST_WHATSAPP', {
    name: booking.guest_name || t('GUEST_FALLBACK'),
    cabin,
    dates: datesLabel
  });

  function messageHost() {
    const href = guestHostWhatsAppHref(hostWhatsAppText);
    if (!href) return;
    window.location.href = href;
  }

  const cabinReady = Boolean(stay?.cabin_ready) && liveStatus === 'CHECKED_IN';
  const guestCheckedIn = Boolean(stay?.guest_checked_in_at);
  const today = israelToday(now);
  const onStayDates = Boolean(
    booking.check_in_date &&
    booking.check_out_date &&
    today >= booking.check_in_date &&
    today <= booking.check_out_date
  );
  const mergedStay = { ...booking, stay, booking_status: liveStatus };
  const paidForCheckin = isPaidForGuestCheckin(mergedStay);
  const bankWaiting = Boolean(stay?.payment_proof)
    && (stay?.payment_choice === 'BANK_TRANSFER' || booking.payment_status === 'PENDING_BANK')
    && !guestCheckedIn;
  const showCheckin = onStayDates
    && phase !== 'pre'
    && !guestCheckedIn
    && !bankWaiting
    && stay?.self_checked_out_at == null
    && !paidForCheckin;
  const showInStay = cabinReady && guestCheckedIn && stay?.self_checked_out_at == null;
  const showWaiting = !guestCheckedIn ? (phase !== 'pre' && !cabinReady && !showCheckin && !bankWaiting) : (!cabinReady);

  useEffect(() => {
    if (!booking?.checkout_token || autoCheckinSent.current) return;
    const merged = { ...booking, stay, booking_status: liveStatus };
    if (!shouldAutoGuestCheckin(merged, now)) return;
    autoCheckinSent.current = true;
    stayAction(booking.checkout_token, { action: 'guest_auto_checkin', unit_id: booking.unit_id })
      .then((row) => {
        if (row?.stay) setStay(row.stay);
        if (row?.payment) setPayment(row.payment);
        if (row?.booking_status) setLiveStatus(row.booking_status);
      })
      .catch(() => {
        autoCheckinSent.current = false;
      });
  }, [booking, stay, liveStatus, now]);

  useEffect(() => {
    if (!showCheckin || !booking?.checkout_token || stay?.checkin_quote) return undefined;
    let stop = false;
    stayAction(booking.checkout_token, { action: 'checkin_quote', unit_id: booking.unit_id })
      .then((row) => {
        if (stop) return;
        if (row?.stay) setStay(row.stay);
        if (row?.payment) setPayment(row.payment);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [showCheckin, booking?.checkout_token, stay?.checkin_quote]);

  useEffect(() => {
    if (!booking?.checkout_token || typeof window === 'undefined') return undefined;
    const url = new URL(window.location.href);
    const hyp = url.searchParams.get('hyp');
    const ccode = url.searchParams.get('CCode');
    if (!hyp && ccode == null) return undefined;
    let stop = false;
    (async () => {
      try {
        if (hyp === 'fail' || hyp === 'error') {
          setCheckinOpen(true);
          setCheckinStep(tabFromPreference(booking.balance_payment_preference, hasSavedCard));
          setCheckinError(t('INSTAY_CHECKIN_FAILED'));
        } else if (hyp === 'ok') {
          const intent = booking.stay?.hyp_intent || stay?.hyp_intent || {};
          const checkinReturn = intent.stage === 'checkin';
          const row = checkinReturn
            ? await stayAction(booking.checkout_token, { action: 'guest_checkin_complete', unit_id: booking.unit_id }).catch(() => fetchGuestCheckout(booking.checkout_token, booking.unit_id))
            : await fetchGuestCheckout(booking.checkout_token, booking.unit_id);
          if (stop) return;
          if (row?.stay) setStay(row.stay);
          if (row?.payment) setPayment(row.payment);
        } else if (ccode != null) {
          const row = await stayAction(booking.checkout_token, {
            action: 'hyp_verify',
            unit_id: booking.unit_id,
            query: window.location.search
          });
          if (stop) return;
          if (row?.stay) setStay(row.stay);
          if (row?.payment) setPayment(row.payment);
        }
      } catch (err) {
        if (stop) return;
        if (err?.status === 409) setCheckinError(t('INSTAY_CHECKIN_PENDING'));
        else if (hyp === 'ok') setCheckinError('');
        else setCheckinError(t('INSTAY_CHECKIN_FAILED'));
      } finally {
        url.searchParams.delete('hyp');
        url.searchParams.delete('ccode');
        url.searchParams.delete('CCode');
        url.searchParams.delete('Id');
        url.searchParams.delete('ACode');
        url.searchParams.delete('Sign');
        window.history.replaceState({}, '', url);
      }
    })();
    return () => {
      stop = true;
    };
  }, [booking?.checkout_token, t]);

  const quote = stay?.checkin_quote || payment?.quote || {};
  const purpose = payment?.purpose || stay?.hyp_intent?.purpose || '';
  const stage = stay?.hyp_intent?.stage || '';
  const checkinCharge = stage === 'checkin' || purpose === 'balance' || purpose === 'extra';
  const payUrl = checkinCharge ? (payment?.pay_url || payment?.iframe_url || '') : '';
  const iframeUrl = payUrl;
  const amountLabel = Number(quote.amount || 0).toLocaleString('he-IL');
  const savedLast4 = String(quote.last4 || stay?.hyp_card?.last_4 || '').slice(-4);
  const hasSavedCard = Boolean(quote.hasCard || stay?.hyp_card?.has_token);

  async function runCheckin(action, payload = {}) {
    if (!booking?.checkout_token || checkinBusy) return;
    setCheckinBusy(action);
    setCheckinError('');
    try {
      const next = await stayAction(booking.checkout_token, {
        action,
        unit_id: booking.unit_id,
        ...payload
      });
      if (next?.stay) setStay(next.stay);
      if (next?.payment) setPayment(next.payment);
      if (next?.booking_status) setLiveStatus(next.booking_status);
      if (action === 'guest_checkin' && (next?.payment?.pay_url || next?.payment?.iframe_url)) {
        const url = next.payment.pay_url || next.payment.iframe_url;
        if (shouldEmbedHypPayment(next.payment)) {
          setCheckinOpen(true);
          return;
        }
        openPaymentUrl(url);
        return;
      }
      if (action === 'guest_checkin' && !next?.payment?.iframe_url && !next?.payment?.pay_url) {
        setCheckinOpen(false);
      }
      if (action === 'guest_checkin_cash' || action === 'guest_checkin_bank' || action === 'guest_checkin_cash_pin') {
        setCheckinOpen(false);
        setBankProof('');
        setBankPreview('');
        setCashPin('');
      }
      if (action === 'guest_checkin_complete') {
        setCheckinOpen(false);
        setPayment((prev) => ({ ...(prev || {}), iframe_url: null }));
      }
    } catch (err) {
      if (err?.status === 409 && err.payload?.error === 'PAYMENT_REQUIRED') {
        setCheckinError(err.payload?.message || t('INSTAY_CHECKIN_NEED_FULL'));
      } else if (err?.status === 409 && err.payload?.error === 'PAYMENT_PENDING') {
        if (err.payload?.stay) setStay(err.payload.stay);
        if (err.payload?.payment) setPayment(err.payload.payment);
        setCheckinError(t('INSTAY_CHECKIN_PENDING'));
      } else if (err?.status === 401 || err?.payload?.error === 'INVALID_PIN') {
        setCheckinError(t('INSTAY_CHECKIN_PIN_BAD'));
      } else if (err?.payload?.error === 'NO_SAVED_CARD' || err?.payload?.error === 'HYP_NO_TOKEN' || String(err?.payload?.error || '').includes('TOKEN')) {
        setCheckinError(t('INSTAY_CHECKIN_SAVED_FAILED'));
        setCheckinStep(hasSavedCard ? 'saved' : 'card');
      } else if (err?.message === 'INVALID_PROOF' || err?.payload?.error === 'INVALID_PROOF') {
        setCheckinError(t('INSTAY_CHECKIN_PROOF_BAD'));
      } else {
        setCheckinError(err?.payload?.message || t('INSTAY_CHECKIN_FAILED'));
      }
    } finally {
      setCheckinBusy('');
    }
  }

  function compressProof(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('READ_FAILED'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('IMAGE_FAILED'));
        img.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  async function onBankFile(file) {
    if (!file) return;
    try {
      const dataUrl = await compressProof(file);
      setBankProof(dataUrl);
      setBankPreview(dataUrl);
      setCheckinError('');
    } catch (_) {
      setCheckinError(t('INSTAY_CHECKIN_PROOF_BAD'));
    }
  }

  if (showInStay || stay?.self_checked_out_at) {
    return (
      <GuestInStay
        booking={booking}
        unitName={cabin}
        stay={stay}
        themeStyles={themeStyles}
        onStayUpdate={(row) => {
          if (row?.stay) setStay(row.stay);
          if (row?.payment) setPayment(row.payment);
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {justConfirmed ? (
        <div
          style={{
            background: themeStyles.accentSoft,
            border: `1px solid ${themeStyles.accent}`,
            color: themeStyles.accent,
            borderRadius: 12,
            padding: '0.7rem 0.9rem',
            fontWeight: 800,
            fontSize: '0.88rem'
          }}
        >
          {t('GUEST_STAY_CONFIRMED')}
        </div>
      ) : null}

      {bankWaiting ? (
        <div
          style={{
            background: themeStyles.accentSoft,
            border: `1px solid ${themeStyles.accent}`,
            borderRadius: 14,
            padding: '0.95rem 1rem'
          }}
        >
          <div style={{ fontWeight: 900, color: themeStyles.accent, marginBottom: 6 }}>{t('INSTAY_BANK_REVIEW_TITLE')}</div>
          <p style={{ margin: 0, color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
            {t('INSTAY_BANK_REVIEW_BODY')}
          </p>
        </div>
      ) : null}

      {guestCheckedIn && !cabinReady ? (
        <div
          style={{
            background: themeStyles.accentSoft,
            border: `1px solid ${themeStyles.accent}`,
            borderRadius: 14,
            padding: '0.95rem 1rem'
          }}
        >
          <div style={{ fontWeight: 900, color: themeStyles.accent, marginBottom: 6 }}>{t('INSTAY_CHECKIN_TITLE')}</div>
          <p style={{ margin: 0, color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
            {t('INSTAY_CHECKED_IN_WAIT')}
          </p>
        </div>
      ) : null}

      {showCheckin ? (
        <div
          style={{
            background: themeStyles.inputBg,
            border: `1px solid ${themeStyles.inputBorder}`,
            borderRadius: 14,
            padding: '0.95rem 1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, marginBottom: 8 }}>
            <CreditCard size={18} color={themeStyles.accent} />
            {t('INSTAY_CHECKIN_TITLE')}
          </div>
          <p style={{ margin: '0 0 0.85rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
            {t('INSTAY_CHECKIN_CHOOSE_HINT')}
          </p>
          {checkinError ? (
            <p style={{ margin: '0 0 0.75rem', color: '#F87171', fontWeight: 700, fontSize: '0.82rem' }}>{checkinError}</p>
          ) : null}
          <button
            type="button"
            disabled={Boolean(checkinBusy)}
            onClick={() => {
              setCheckinError('');
              setCashPin('');
              setCheckinStep(tabFromPreference(
                booking.balance_payment_preference || stay?.balance_payment_preference,
                Boolean(stay?.hyp_card?.has_token || stay?.checkin_quote?.hasCard)
              ));
              setCheckinOpen(true);
            }}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 12,
              padding: '0.85rem',
              fontWeight: 900,
              background: themeStyles.cta,
              color: themeStyles.ctaText,
              cursor: 'pointer'
            }}
          >
            {checkinBusy ? t('INSTAY_CHECKIN_PAYING') : t('INSTAY_CHECKIN_CTA')}
          </button>
        </div>
      ) : null}

      {showWaiting ? (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.14)',
            border: '1px solid #F59E0B',
            borderRadius: 14,
            padding: '0.95rem 1rem'
          }}
        >
          <div style={{ fontWeight: 900, color: '#F59E0B', marginBottom: 6 }}>{t('INSTAY_WAIT_TITLE')}</div>
          <p style={{ margin: 0, color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
            {t('INSTAY_WAIT_BODY')}
          </p>
        </div>
      ) : null}

      <div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: themeStyles.textMuted, marginBottom: 4 }}>
          {t('GUEST_HELLO', { name: booking.guest_name || t('GUEST_FALLBACK') })}
        </div>
        <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, lineHeight: 1.3 }}>
          {t(isInHouse(booking) || booking.booking_status === 'CHECKED_IN' ? 'GUEST_IN_UNIT' : 'GUEST_WAITING', { cabin })}
        </h2>
      </div>

      <div
        style={{
          background: themeStyles.inputBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: 14,
          padding: '0.9rem 1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 700 }}>
          <Calendar size={16} color={themeStyles.accent} />
          {displayDate(booking.check_in_date)} {t('GUEST_UNTIL')} {displayDate(booking.check_out_date)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.85rem', color: themeStyles.textMuted }}>
          <Clock size={15} color={themeStyles.accent} />
          {t('GUEST_CHECKIN_FROM')}
        </div>
        {phase === 'pre' && countdown ? (
          <div style={{ marginTop: 10, fontWeight: 800, color: themeStyles.accent }}>
            {t('GUEST_COUNTDOWN', { time: countdown })}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
          <ActionBtn href={wazeUrl(booking.unit_id)} bg="#D7EAF2" color="#1E3A4C">
            <Navigation size={15} />
            {t('GUEST_WAZE')}
          </ActionBtn>
          <ActionBtn href={googleMapsUrl(booking.unit_id)} bg="#E4E0D6" color="#3F3A33">
            <Map size={15} />
            {t('GUEST_MAPS')}
          </ActionBtn>
          <div style={{ gridColumn: '1 / -1' }}>
            <ActionBtn onClick={messageHost} bg="#DCEFE3" color="#1B4332">
              <MessageSquare size={15} />
              {t('GUEST_WHATSAPP_HOST')}
            </ActionBtn>
          </div>
        </div>
      </div>

      {phase === 'pre' ? (
        <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, lineHeight: 1.5 }}>
          {t('GUEST_PRE_HINT')}
        </div>
      ) : showWaiting ? null : (
        <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, lineHeight: 1.5 }}>
          {t('GUEST_IN_CABIN_LATER')}
        </div>
      )}


      <div>
        <div style={{ fontSize: '1.08rem', fontWeight: 900, lineHeight: 1.25, marginBottom: 4 }}>
          {t('GUEST_AREA_GUIDE')}
        </div>
        <div style={{ marginBottom: 10, fontSize: '0.74rem', fontWeight: 700, color: themeStyles.textMuted, lineHeight: 1.4 }}>
          <LiveText text={areaGuideSource(guideClusterForUnit(booking.unit_id))} />
        </div>
        <GuestAreaGuide themeStyles={themeStyles} unitId={booking.unit_id} />
      </div>

      <CheckinDrawer
        open={checkinOpen}
        iframeUrl={iframeUrl}
        themeStyles={themeStyles}
        t={t}
        amountLabel={amountLabel}
        savedLast4={savedLast4}
        hasSavedCard={hasSavedCard}
        quote={quote}
        busy={checkinBusy}
        error={checkinError}
        tab={checkinStep}
        onTab={setCheckinStep}
        onClose={() => {
          setCheckinOpen(false);
          setCheckinError('');
          setPayment((prev) => (prev ? { ...prev, pay_url: null, iframe_url: null } : prev));
        }}
        onChargeSaved={() => runCheckin('guest_checkin', { use_saved_card: true })}
        onNewCard={() => runCheckin('guest_checkin')}
        onCompletePay={() => runCheckin('guest_checkin_complete')}
        bankProof={bankProof}
        bankPreview={bankPreview}
        onPickBank={(e) => onBankFile(e.target.files?.[0])}
        onUploadBank={() => runCheckin('guest_checkin_bank', { payment_proof: bankProof })}
        cashPin={cashPin}
        onCashPin={setCashPin}
        onVerifyCash={() => runCheckin('guest_checkin_cash_pin', { pin: cashPin })}
        hostWhatsAppHref={guestHostWhatsAppHref(hostWhatsAppText)}
      />
    </div>
  );
}
