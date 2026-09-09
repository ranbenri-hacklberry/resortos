import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Minus, Plus, Ticket, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TICKET_ATTRACTIONS } from '../lib/areaGuide';
import { useDynamicText } from '../lib/translator';
import { loadGuestOrders, openGuestTicketWallet, saveGuestOrders, subscribeGuestTickets } from '../lib/guestTickets';
import GuestPlaceLinks from './GuestPlaceLinks';

function LiveText({ text }) {
  const translated = useDynamicText(text, null, 'he');
  return <>{translated}</>;
}

function ils(n) {
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

function preferGooglePay() {
  return /Android/i.test(navigator.userAgent || '');
}

function AppleLogo({ color = '#FFF', size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function GoogleG({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 8 3.1l6-6C34.6 5.1 29.6 3 24 3 16.3 3 9.6 7.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.2 0 10-1.7 13.6-4.7l-6.3-5.3C29.3 36.6 26.8 37.5 24 37.5c-5.3 0-9.7-3.6-11.3-8.5l-6.5 5C9.5 40.8 16.2 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.7 7.1l.1.1 6.3 5.3C36.9 41.8 45 36 45 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function Stepper({ label, value, onChange, themeStyles }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: `1px solid ${themeStyles.inputBorder}`,
            background: themeStyles.cardBg,
            color: themeStyles.textPrimary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Minus size={14} />
        </button>
        <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 900 }}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(12, value + 1))}
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: `1px solid ${themeStyles.inputBorder}`,
            background: themeStyles.cardBg,
            color: themeStyles.textPrimary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function ApplePayButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      dir="ltr"
      style={{
        width: '100%',
        height: 50,
        border: 'none',
        borderRadius: 12,
        background: '#000',
        color: '#FFF',
        cursor: disabled ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: disabled ? 0.7 : 1
      }}
    >
      <AppleLogo />
      <span style={{ fontSize: '1.35rem', fontWeight: 500, letterSpacing: '-0.03em', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
        Pay
      </span>
    </button>
  );
}

function GooglePayButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      dir="ltr"
      style={{
        width: '100%',
        height: 50,
        border: '1px solid #DADCE0',
        borderRadius: 24,
        background: '#FFF',
        cursor: disabled ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.7 : 1,
        boxShadow: '0 1px 2px rgba(60,64,67,0.15)'
      }}
    >
      <GoogleG />
      <span style={{ fontSize: '1.15rem', fontWeight: 500, color: '#3C4043', fontFamily: 'Roboto, system-ui, sans-serif' }}>
        Pay
      </span>
    </button>
  );
}

function FaceIdMark() {
  return (
    <div className="guest-faceid">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F5F5F7" strokeWidth="1.7" aria-hidden="true">
        <path d="M8 3H6a2 2 0 0 0-2 2v2" />
        <path d="M16 3h2a2 2 0 0 1 2 2v2" />
        <path d="M8 21H6a2 2 0 0 1-2-2v-2" />
        <path d="M16 21h2a2 2 0 0 0 2-2v-2" />
        <circle cx="9" cy="10" r="0.8" fill="#F5F5F7" />
        <circle cx="15" cy="10" r="0.8" fill="#F5F5F7" />
        <path d="M9.5 15c.8 1 1.7 1.4 2.5 1.4s1.7-.4 2.5-1.4" />
      </svg>
    </div>
  );
}

function PaySheet({ method, step, amount, merchant, cardMask, t }) {
  const apple = method === 'Apple Pay';
  const google = method === 'GPay';
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 430,
          background: apple ? '#1C1C1E' : '#FFF',
          color: apple ? '#F5F5F7' : '#202124',
          borderRadius: '22px 22px 0 0',
          padding: '1.2rem 1.2rem 2rem',
          minHeight: 340
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
          {apple ? <AppleLogo color="#FFF" size={22} /> : <GoogleG size={22} />}
          <span style={{ fontSize: apple ? '1.35rem' : '1.2rem', fontWeight: 600, letterSpacing: apple ? '-0.03em' : 0 }}>
            {apple ? 'Pay' : 'Pay'}
          </span>
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.7, marginBottom: 6 }}>{merchant}</div>
        <div style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 800, marginBottom: 6 }}>{amount}</div>
        <div style={{ textAlign: 'center', fontSize: '0.85rem', opacity: 0.75, marginBottom: 22 }}>{cardMask}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minHeight: 120, justifyContent: 'center' }}>
          {apple && step === 'auth' ? (
            <>
              <FaceIdMark />
              <div style={{ fontWeight: 700 }}>{t('GUEST_PAY_APPLE_AUTH')}</div>
            </>
          ) : null}
          {google && step === 'auth' ? (
            <>
              <div className="guest-pay-spin" />
              <div style={{ fontWeight: 700 }}>{t('GUEST_PAY_GPAY_HOLD')}</div>
            </>
          ) : null}
          {google && step === 'processing' ? (
            <>
              <div className="guest-pay-spin" />
              <div style={{ fontWeight: 700 }}>{t('GUEST_GPAY_CONFIRM')}</div>
            </>
          ) : null}
          {!apple && !google && step !== 'done' ? (
            <>
              <div className="guest-pay-spin" />
              <div style={{ fontWeight: 700 }}>{t('GUEST_CARD_CONFIRM')}</div>
            </>
          ) : null}
          {step === 'done' ? (
            <div className="guest-pay-pop" style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: apple ? '#32D74B' : '#1E8E3E',
                  color: '#FFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px',
                  fontSize: '2rem',
                  fontWeight: 900
                }}
              >
                ✓
              </div>
              <div style={{ fontWeight: 800 }}>
                {apple ? t('GUEST_PAY_APPLE_DONE') : google ? t('GUEST_PAY_GPAY_DONE') : t('GUEST_PAY_GPAY_DONE')}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function makeTickets(attraction, adults, children) {
  const stamp = String(Date.now()).slice(-6);
  const tickets = [];
  for (let i = 0; i < adults; i += 1) {
    tickets.push({ code: `HK-${stamp}-A${i + 1}`, kind: 'adult', redeemedAt: null });
  }
  for (let i = 0; i < children; i += 1) {
    tickets.push({ code: `HK-${stamp}-C${i + 1}`, kind: 'child', redeemedAt: null });
  }
  return tickets;
}

export default function GuestAttractionTickets({ booking, themeStyles }) {
  const { t } = useTranslation();
  const bookingId = booking?.id;
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payHint, setPayHint] = useState('');
  const [paySheet, setPaySheet] = useState(null);
  const [orders, setOrders] = useState(() => loadGuestOrders(bookingId));
  const payTimers = useRef([]);

  useEffect(() => {
    setOrders(loadGuestOrders(bookingId));
    return subscribeGuestTickets((id, extra) => {
      if (id !== bookingId && id !== (bookingId || 'guest')) return;
      setOrders(extra?.orders || loadGuestOrders(bookingId));
    });
  }, [bookingId]);

  const googleFirst = preferGooglePay();
  const attraction = TICKET_ATTRACTIONS.find((item) => item.id === selectedId) || null;
  const ticketsCount = adults + children;

  const totals = useMemo(() => {
    if (!attraction) return { gate: 0, site: 0, save: 0 };
    const gate = adults * attraction.adultGate + children * attraction.childGate;
    const site = adults * attraction.adultSite + children * attraction.childSite;
    return { gate, site, save: gate - site };
  }, [attraction, adults, children]);

  function openPay(item) {
    setSelectedId(item.id);
    setAdults(Math.max(1, Number(booking?.adults_count) || 2));
    setChildren(Math.max(0, Number(booking?.children_count) || 0));
    setPayOpen(true);
    setPaying(false);
    setPayHint('');
    setPaySheet(null);
  }

  function clearPayTimers() {
    payTimers.current.forEach((id) => window.clearTimeout(id));
    payTimers.current = [];
  }

  useEffect(() => () => clearPayTimers(), []);

  function finishOrder(method) {
    const order = {
      id: 'ord_' + Date.now(),
      attractionId: attraction.id,
      title: attraction.title,
      adults,
      children,
      total: totals.site,
      method,
      at: new Date().toISOString(),
      tickets: makeTickets(attraction, adults, children)
    };
    saveGuestOrders(bookingId, [order, ...orders]);
    clearPayTimers();
    setPaySheet(null);
    setPaying(false);
    setPayHint('');
    setPayOpen(false);
    openGuestTicketWallet(bookingId);
  }

  function completePay(method) {
    if (!attraction || ticketsCount < 1 || paying) return;
    setPaying(true);
    setPaySheet({ method, step: 'auth' });
    clearPayTimers();
    if (method === 'Apple Pay') {
      payTimers.current.push(window.setTimeout(() => setPaySheet({ method, step: 'done' }), 1700));
      payTimers.current.push(window.setTimeout(() => finishOrder(method), 2900));
    } else if (method === 'GPay') {
      payTimers.current.push(window.setTimeout(() => setPaySheet({ method, step: 'processing' }), 850));
      payTimers.current.push(window.setTimeout(() => setPaySheet({ method, step: 'done' }), 1900));
      payTimers.current.push(window.setTimeout(() => finishOrder(method), 3000));
    } else {
      setPayHint(t('GUEST_CARD_CONFIRM'));
      payTimers.current.push(window.setTimeout(() => setPaySheet({ method, step: 'done' }), 900));
      payTimers.current.push(window.setTimeout(() => finishOrder(method), 1900));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: '0.8rem', color: themeStyles.textMuted, lineHeight: 1.5 }}>
        {t('GUEST_TICKETS_HINT')}
      </div>

      {TICKET_ATTRACTIONS.map((item) => {
        const bought = orders.filter((o) => o.attractionId === item.id);
        const adultSave = item.adultGate - item.adultSite;
        return (
          <div
            key={item.id}
            style={{
              background: themeStyles.inputBg,
              border: `1px solid ${themeStyles.inputBorder}`,
              borderRadius: 14,
              padding: '0.95rem 1rem'
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1rem' }}><LiveText text={item.title} /></div>
            <div style={{ fontSize: '0.78rem', color: themeStyles.textMuted, margin: '4px 0 8px' }}>
              <LiveText text={`${item.type} · ${item.dist} · ${item.phone}`} />
            </div>
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.85rem', lineHeight: 1.5, color: themeStyles.textMuted }}>
              <LiveText text={item.desc} />
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10, fontSize: '0.82rem' }}>
              <div>
                <div style={{ color: themeStyles.textMuted }}>{t('GUEST_ADULT')}</div>
                <div style={{ textDecoration: 'line-through', opacity: 0.65 }}>{ils(item.adultGate)}</div>
                <div style={{ fontWeight: 900, color: themeStyles.success }}>{t('GUEST_ON_SITE', { price: ils(item.adultSite) })}</div>
              </div>
              <div>
                <div style={{ color: themeStyles.textMuted }}>{t('GUEST_CHILD')}</div>
                <div style={{ textDecoration: 'line-through', opacity: 0.65 }}>{ils(item.childGate)}</div>
                <div style={{ fontWeight: 900, color: themeStyles.success }}>{t('GUEST_ON_SITE', { price: ils(item.childSite) })}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: themeStyles.success, fontWeight: 700, marginBottom: 10 }}>
              {t('GUEST_SAVE_ADULT', { amount: ils(adultSave) })}
            </div>
            <div style={{ marginBottom: 10 }}>
              <GuestPlaceLinks
                wazeUrl={item.wazeUrl}
                phone={item.phone}
                showPhone
                wazeLabel={t('GUEST_WAZE')}
                mapsLabel={t('GUEST_MAPS')}
                callLabel={t('GUEST_CALL_HOST')}
              />
            </div>
            <button
              type="button"
              onClick={() => openPay(item)}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 10,
                padding: '0.7rem',
                fontWeight: 800,
                cursor: 'pointer',
                background: themeStyles.cta,
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Ticket size={16} />
              {t('GUEST_BUY_TICKETS')}
            </button>
            {bought.length ? (
              <div style={{ marginTop: 8, fontSize: '0.78rem', color: themeStyles.success, fontWeight: 700 }}>
                {t('GUEST_TICKETS_BOUGHT', { count: bought.reduce((sum, o) => sum + o.tickets.length, 0) })}
              </div>
            ) : null}
          </div>
        );
      })}

      {payOpen && attraction ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0.75rem'
          }}
          onClick={() => !paying && setPayOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              background: themeStyles.cardBg,
              color: themeStyles.textPrimary,
              borderRadius: '20px 20px 16px 16px',
              padding: '1.1rem 1.1rem 1.3rem',
              border: `1px solid ${themeStyles.inputBorder}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{attraction.title}</div>
              <button
                type="button"
                onClick={() => !paying && setPayOpen(false)}
                style={{ border: 'none', background: 'none', color: themeStyles.textMuted, cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
              <Stepper label={t('GUEST_ADULTS')} value={adults} onChange={setAdults} themeStyles={themeStyles} />
              <Stepper label={t('GUEST_CHILDREN')} value={children} onChange={setChildren} themeStyles={themeStyles} />
            </div>

            <div
              style={{
                background: themeStyles.inputBg,
                borderRadius: 12,
                padding: '0.75rem 0.9rem',
                marginBottom: 14,
                fontSize: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: themeStyles.textMuted }}>
                <span>{t('GUEST_GATE_TOTAL')}</span>
                <span style={{ textDecoration: 'line-through' }}>{ils(totals.gate)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontWeight: 900, fontSize: '1.05rem' }}>
                <span>{t('GUEST_SITE_TOTAL')}</span>
                <span style={{ color: themeStyles.success }}>{ils(totals.site)}</span>
              </div>
              {totals.save > 0 ? (
                <div style={{ marginTop: 6, color: themeStyles.success, fontWeight: 700 }}>
                  {t('GUEST_GROUP_SAVE', { amount: ils(totals.save) })}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {googleFirst ? (
                <>
                  <GooglePayButton disabled={paying || ticketsCount < 1} onClick={() => completePay('GPay')} />
                  <ApplePayButton disabled={paying || ticketsCount < 1} onClick={() => completePay('Apple Pay')} />
                </>
              ) : (
                <>
                  <ApplePayButton disabled={paying || ticketsCount < 1} onClick={() => completePay('Apple Pay')} />
                  <GooglePayButton disabled={paying || ticketsCount < 1} onClick={() => completePay('GPay')} />
                </>
              )}
              <button
                type="button"
                disabled={paying || ticketsCount < 1}
                onClick={() => completePay(t('GUEST_CARD'))}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  background: 'transparent',
                  color: themeStyles.textPrimary,
                  fontWeight: 800,
                  cursor: paying ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <CreditCard size={16} />
                {t('GUEST_CARD')}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: '0.78rem', color: paying ? '#818CF8' : themeStyles.textMuted, textAlign: 'center', fontWeight: paying ? 800 : 400 }}>
              {paying ? payHint : t('GUEST_PAY_DEMO')}
            </div>
          </div>
        </div>
      ) : null}
      {paySheet && attraction ? (
        <PaySheet
          method={paySheet.method}
          step={paySheet.step}
          amount={ils(totals.site)}
          merchant={t('GUEST_PAY_MERCHANT')}
          cardMask={t('GUEST_PAY_CARD_MASK')}
          t={t}
        />
      ) : null}
    </div>
  );
}
