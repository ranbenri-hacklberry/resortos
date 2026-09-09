import React, { useState } from 'react';
import {
  Bath,
  ChevronDown,
  Clock,
  Cookie,
  Copy,
  Flame,
  KeyRound,
  LogOut,
  MapPin,
  Minus,
  MessageSquare,
  Plus,
  Receipt,
  Shirt,
  ShoppingBag,
  Star,
  Tv,
  Wifi,
  Wine
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDynamicText } from '../lib/translator';
import {
  CABIN_STORE,
  LATE_FREE_DAY,
  LATE_NEXT_GUEST,
  israelToday,
  isVillageGateNight,
  jachnunOpen
} from '../lib/cabinAccess';
import { guidesFromContent } from '../lib/guestProfile';
import { guestCabinStoreEnabled } from '../lib/guestFeatures';
import { stayAction } from '../lib/guestCheckoutApi';
import { googleReviewUrl, guestHostWhatsAppHref } from '../lib/stayProperty';
import GuestAreaGuide from './GuestAreaGuide';

function LiveText({ text }) {
  const translated = useDynamicText(text, null, 'he');
  return <>{translated}</>;
}

function wifiNetworks(stay) {
  if (Array.isArray(stay?.wifi_networks) && stay.wifi_networks.length) return stay.wifi_networks;
  if (stay?.wifi_password) return [{ ssid: stay.wifi_ssid, password: stay.wifi_password }];
  return [];
}

function ils(n) {
  return `₪${Number(n).toLocaleString('he-IL')}`;
}

function displayDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return israelToday(d);
}

function effectiveCheckoutDate(booking, stay) {
  const out = booking?.check_out_date;
  if (!out) return null;
  if (stay?.late_until === '11:00+1' || stay?.late_until === 'next') return addDaysIso(out, 1);
  return out;
}

function isCheckoutDay(booking, stay) {
  const today = israelToday();
  const day = effectiveCheckoutDate(booking, stay);
  return Boolean(day && today >= day);
}

function isLateWindow(booking) {
  const today = israelToday();
  const out = booking?.check_out_date;
  if (!out) return false;
  return today >= addDaysIso(out, -1);
}

function lateSelected(stay, opt) {
  if (opt.until === 'next') return stay?.late_until === '11:00+1' || stay?.late_until === 'next';
  return stay?.late_until === opt.until;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value || ''));
    return true;
  } catch (_) {
    return false;
  }
}

const GUIDE_ICONS = { jacuzzi: Bath, tv: Tv, lock: KeyRound };

const STORE_LOOK = {
  jachnun: { Icon: Cookie, from: '#C2410C', to: '#7C2D12' },
  towel: { Icon: Shirt, from: '#0E7490', to: '#155E75' },
  bbq: { Icon: Flame, from: '#B45309', to: '#431407' },
  wine: { Icon: Wine, from: '#9F1239', to: '#4C0519' }
};

export default function GuestInStay({ booking, unitName, stay, themeStyles, onStayUpdate }) {
  const { t } = useTranslation();
  const [guideOpen, setGuideOpen] = useState('jacuzzi');
  const [folioOpen, setFolioOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  const [towelAdults, setTowelAdults] = useState(1);
  const [towelKids, setTowelKids] = useState(0);

  const storeOpen = guestCabinStoreEnabled();
  const folio = stay?.folio || [];
  const folioTotal = folio.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const nextGuest = Boolean(stay?.has_next_guest_today);
  const lateOptions = nextGuest ? LATE_NEXT_GUEST : LATE_FREE_DAY;
  const done = Boolean(stay?.self_checked_out_at);
  const checkoutDay = isCheckoutDay(booking, stay);
  const lateOpen = isLateWindow(booking);
  const networks = wifiNetworks(stay);
  const guides = Array.isArray(stay?.guides) && stay.guides.length ? stay.guides : guidesFromContent({});
  const nightCallGate = Boolean(stay?.gate_night_call) && isVillageGateNight();
  const hasGate = stay?.gate_mode === 'code' || stay?.gate_mode === 'dial' || (stay?.gate_mode === 'call' && nightCallGate) || nightCallGate;
  const hostWa = guestHostWhatsAppHref(
    t('GUEST_HOST_WHATSAPP', {
      name: booking.guest_name || t('GUEST_FALLBACK'),
      cabin: booking.unit_id || '',
      dates: `${booking.check_in_date || ''}–${booking.check_out_date || ''}`
    })
  );

  async function copy(key, value) {
    const ok = await copyText(value);
    if (ok) {
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    }
  }

  async function run(action, payload) {
    if (busy) return;
    if (!booking?.checkout_token) {
      const nextStay = applyLocalStayAction(stay, action, payload);
      onStayUpdate?.({ stay: nextStay });
      if (action === 'self_checkout') setCheckoutOpen(false);
      return nextStay;
    }
    setBusy(action);
    try {
      const next = await stayAction(booking.checkout_token, { action, unit_id: booking.unit_id, ...payload });
      onStayUpdate?.(next);
      if (action === 'self_checkout') setCheckoutOpen(false);
      return next;
    } catch (_) {
      window.alert(t('INSTAY_ACTION_FAILED'));
      return null;
    } finally {
      setBusy('');
    }
  }

  function addStore(item) {
    const qty = item.kind === 'qty' ? Math.max(1, towelAdults + towelKids) : 1;
    if (item.kind === 'jachnun' && !jachnunOpen()) return;
    run('folio_add', {
      item: {
        id: item.id + '_' + Date.now(),
        title: item.title,
        qty,
        total: item.price * qty
      }
    });
  }

  const card = {
    background: themeStyles.inputBg,
    border: `1px solid ${themeStyles.inputBorder}`,
    borderRadius: 18,
    padding: '1rem'
  };

  if (done) {
    return (
      <GuestFeedback
        booking={booking}
        stay={stay}
        themeStyles={themeStyles}
        card={card}
        busy={busy}
        onSubmit={(payload) => run('guest_feedback', payload)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: '#F59E0B', marginBottom: 6 }}>
          {t('INSTAY_ACTIVE')}
        </div>
        <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, lineHeight: 1.25 }}>
          {t('INSTAY_WELCOME', { name: booking.guest_name || t('GUEST_FALLBACK') })}
        </h2>
        <div style={{ marginTop: 6, fontWeight: 800, color: themeStyles.textMuted }}>
          {t('INSTAY_CABIN', { cabin: unitName })}
        </div>
      </div>

      {stay?.door_pin ? (
      <div
        style={{
          ...card,
          background: 'linear-gradient(165deg, #1C1917, #292524)',
          color: '#F8F4EA',
          border: 'none'
        }}
      >
        <div style={{ fontSize: '0.75rem', fontWeight: 800, opacity: 0.7 }}>{t('INSTAY_DOOR_PIN')}</div>
        <div style={{ fontSize: '2.35rem', fontWeight: 900, letterSpacing: '0.28em', margin: '8px 0 10px', fontVariantNumeric: 'tabular-nums' }}>
          {stay.door_pin}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', opacity: 0.7 }}>{t('INSTAY_PIN_UNTIL')}</span>
          <button type="button" onClick={() => copy('pin', stay.door_pin)} style={ghostBtn('#F8F4EA', 'rgba(255,255,255,0.16)')}>
            <Copy size={14} /> {copied === 'pin' ? t('INSTAY_COPIED') : t('INSTAY_COPY_PIN')}
          </button>
        </div>
      </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: hasGate ? '1fr 1fr' : '1fr', gap: 10 }}>
        {hasGate ? (
        <div style={card}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: themeStyles.textMuted }}>
            {stay?.gate_mode === 'code' ? t('INSTAY_GATE_CODE') : t('INSTAY_GATE')}
          </div>
          {stay?.gate_code ? (
            <div dir="ltr" style={{ fontSize: '1.45rem', fontWeight: 900, margin: '8px 0 10px', lineHeight: 1.3, unicodeBidi: 'isolate' }}>
              {stay.gate_code}
            </div>
          ) : nightCallGate ? (
            <div style={{ fontSize: '0.92rem', fontWeight: 800, margin: '8px 0 10px', lineHeight: 1.4 }}>
              {t('INSTAY_GATE_NIGHT')}
            </div>
          ) : (
            <div dir="ltr" style={{ fontSize: '1.05rem', fontWeight: 900, margin: '8px 0 10px', lineHeight: 1.3, unicodeBidi: 'isolate' }}>
              {stay?.gate_mode === 'code' ? t('INSTAY_GATE_SOON') : '••••'}
            </div>
          )}
          {stay?.gate_code && nightCallGate ? (
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, margin: '-4px 0 10px', lineHeight: 1.45 }}>
              {t('INSTAY_GATE_NIGHT')}
            </div>
          ) : null}
          {stay?.gate_mode === 'code' && stay?.gate_code ? (
            <button type="button" onClick={() => copy('gate', stay.gate_code)} style={ghostBtn(themeStyles.textPrimary, 'transparent', themeStyles.inputBorder)}>
              <Copy size={14} /> {copied === 'gate' ? t('INSTAY_COPIED') : t('INSTAY_COPY_PIN')}
            </button>
          ) : null}
        </div>
        ) : null}
        <div style={card}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: themeStyles.textMuted, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Wifi size={14} /> {t('INSTAY_WIFI')}
          </div>
          {networks.length ? networks.map((net, i) => (
            <div key={`${net.ssid || 'wifi'}-${i}`} style={{ marginTop: i ? 12 : 8 }}>
              {i > 0 ? (
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeStyles.textMuted, marginBottom: 4 }}>{t('INSTAY_WIFI_OR')}</div>
              ) : null}
              <div style={{ fontWeight: 800 }}>{net.ssid || t('INSTAY_WIFI_SSID_ON_SITE')}</div>
              <div style={{ fontFamily: 'ui-monospace, monospace', margin: '4px 0 10px' }}>{net.password}</div>
              <button type="button" onClick={() => copy(`wifi${i}`, net.password)} style={ghostBtn(themeStyles.textPrimary, 'transparent', themeStyles.inputBorder)}>
                <Copy size={14} /> {copied === `wifi${i}` ? t('INSTAY_COPIED') : t('INSTAY_COPY_WIFI')}
              </button>
            </div>
          )) : (
            <div style={{ marginTop: 8, fontWeight: 700, color: themeStyles.textMuted, lineHeight: 1.45 }}>{t('INSTAY_WIFI_NONE')}</div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: themeStyles.textMuted, display: 'flex', gap: 6, alignItems: 'center' }}>
          <MessageSquare size={14} /> {t('GUEST_WHATSAPP_HOST')}
        </div>
        <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, marginTop: 4 }}>{t('INSTAY_FIELD_REP_HINT')}</div>
        <a href={hostWa} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn(themeStyles.textPrimary, themeStyles.inputBg), textDecoration: 'none', border: `1px solid ${themeStyles.inputBorder}`, marginTop: 10 }}>
          <MessageSquare size={14} /> {t('GUEST_WHATSAPP_HOST')}
        </a>
      </div>

      <section>
        <div style={{ fontWeight: 900, fontSize: '1.05rem', marginBottom: 8 }}>{t('INSTAY_GUIDES')}</div>
        {guides.map((guide) => {
          const Icon = GUIDE_ICONS[guide.id] || KeyRound;
          const open = guideOpen === guide.id;
          return (
            <div key={guide.id} style={{ ...card, marginBottom: 8, padding: '0.85rem 1rem' }}>
              <button
                type="button"
                onClick={() => setGuideOpen(open ? '' : guide.id)}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'none',
                  color: themeStyles.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={16} color="#F59E0B" />
                  <LiveText text={guide.title} />
                </span>
                <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
              </button>
              {open ? (
                <ol style={{ margin: '10px 0 0', paddingInlineStart: 18, color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.88rem' }}>
                  {guide.steps.map((step) => (
                    <li key={step} style={{ marginBottom: 6 }}><LiveText text={step} /></li>
                  ))}
                </ol>
              ) : null}
            </div>
          );
        })}
      </section>

      {storeOpen ? (
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShoppingBag size={18} color="#F59E0B" />
          <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{t('INSTAY_STORE')}</div>
        </div>
        <div style={{ fontSize: '0.8rem', color: themeStyles.textMuted, marginBottom: 12 }}>{t('INSTAY_STORE_HINT')}</div>
        <div className="guest-store-grid">
          {CABIN_STORE.map((item) => {
            const look = STORE_LOOK[item.id] || STORE_LOOK.bbq;
            const Icon = look.Icon;
            const closed = item.kind === 'jachnun' && !jachnunOpen();
            const qty = item.kind === 'qty' ? Math.max(1, towelAdults + towelKids) : 1;
            return (
              <article
                key={item.id}
                className={`guest-store-card${closed ? ' is-closed' : ''}`}
                style={{ background: `linear-gradient(160deg, ${look.from}, ${look.to})` }}
              >
                <div className="guest-store-icon"><Icon size={22} /></div>
                <div style={{ fontWeight: 900, fontSize: '1.12rem', lineHeight: 1.3 }}>
                  <LiveText text={item.title} />
                </div>
                <p style={{ margin: '8px 0 14px', fontSize: '0.84rem', lineHeight: 1.5, opacity: 0.88 }}>
                  <LiveText text={item.desc} />
                </p>
                {item.kind === 'qty' ? (
                  <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <QtyChip label={t('GUEST_ADULTS')} value={towelAdults} onChange={setTowelAdults} />
                    <QtyChip label={t('GUEST_CHILDREN')} value={towelKids} onChange={setTowelKids} />
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 900, fontSize: '1.15rem' }}>{ils(item.price * qty)}</span>
                  <button
                    type="button"
                    disabled={closed || Boolean(busy)}
                    onClick={() => addStore(item)}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      padding: '0.65rem 0.95rem',
                      fontWeight: 900,
                      cursor: closed ? 'not-allowed' : 'pointer',
                      background: closed ? 'rgba(255,255,255,0.2)' : '#F8F4EA',
                      color: closed ? 'rgba(248,244,234,0.8)' : look.to
                    }}
                  >
                    {closed ? t('INSTAY_JACHNUN_CLOSED') : t('INSTAY_ADD_ROOM')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      ) : null}

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MapPin size={18} color="#F59E0B" />
          <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>{t('INSTAY_GUIDE_TITLE')}</div>
        </div>
        <div style={{ fontSize: '0.8rem', color: themeStyles.textMuted, marginBottom: 12 }}>{t('INSTAY_GUIDE_HINT')}</div>
        <GuestAreaGuide themeStyles={themeStyles} unitId={booking.unit_id} />
      </section>

      {lateOpen ? (
        <section style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Clock size={18} color="#F59E0B" />
            <div style={{ fontWeight: 900 }}>{t('INSTAY_LATE_TITLE')}</div>
          </div>
          <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
            {t('INSTAY_LATE_HINT')}
            {' '}
            {nextGuest ? t('INSTAY_LATE_NEXT') : t('INSTAY_LATE_FREE')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {lateOptions.map((opt) => {
              const on = lateSelected(stay, opt);
              return (
                <button
                  key={opt.until + opt.price}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => run('late_checkout', { until: opt.until === 'next' ? '11:00+1' : opt.until, price: opt.price, title: t('INSTAY_LATE_ITEM') })}
                  className="guest-late-opt"
                  style={{
                    border: on ? 'none' : `1px solid ${themeStyles.inputBorder}`,
                    background: on ? 'linear-gradient(135deg, #FBBF24, #F59E0B)' : themeStyles.wrapperBg,
                    color: on ? '#1C1917' : themeStyles.textPrimary
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 4 }}>
                    {opt.until === 'next' ? t('INSTAY_EXTRA_NIGHT') : t('INSTAY_LATE_UNTIL', { time: opt.until })}
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, opacity: 0.8 }}>{ils(opt.price)}</div>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setFolioOpen(true)}
        style={{
          ...card,
          width: '100%',
          textAlign: 'start',
          cursor: 'pointer',
          color: themeStyles.textPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900 }}>
            <Receipt size={16} color="#F59E0B" /> {t('INSTAY_FOLIO')}
          </span>
          <span style={{ display: 'block', fontSize: '0.75rem', color: themeStyles.textMuted, marginTop: 4 }}>{t('INSTAY_FOLIO_HINT')}</span>
        </span>
        <span style={{ color: '#F59E0B', fontWeight: 900, fontSize: '1.05rem' }}>{ils(folioTotal)}</span>
      </button>

      {checkoutDay ? (
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 16,
            padding: '0.95rem',
            fontWeight: 900,
            cursor: 'pointer',
            background: 'linear-gradient(135deg, #FBBF24, #D97706)',
            color: '#1C1917',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <LogOut size={18} />
          {t('INSTAY_SELF_CHECKOUT')}
        </button>
      ) : (
        <div style={{ ...card, color: themeStyles.textMuted, fontWeight: 700, fontSize: '0.85rem', textAlign: 'center' }}>
          {t('INSTAY_CHECKOUT_OPENS', { date: displayDate(effectiveCheckoutDate(booking, stay)) })}
        </div>
      )}

      {folioOpen ? (
        <Modal themeStyles={themeStyles} onClose={() => setFolioOpen(false)} title={t('INSTAY_FOLIO')}>
          {folio.length ? folio.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: `1px dashed ${themeStyles.inputBorder}` }}>
              <span>{item.title}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
              <span style={{ fontWeight: 800 }}>{ils(item.total)}</span>
            </div>
          )) : <div style={{ color: themeStyles.textMuted }}>{t('INSTAY_FOLIO_EMPTY')}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontWeight: 900 }}>
            <span>{t('GUEST_TOTAL_DUE')}</span>
            <span>{ils(folioTotal)}</span>
          </div>
        </Modal>
      ) : null}

      {checkoutOpen ? (
        <Modal themeStyles={themeStyles} onClose={() => setCheckoutOpen(false)} title={t('INSTAY_CHECKOUT_CONFIRM_TITLE')}>
          <p style={{ margin: '0 0 1.1rem', color: themeStyles.textMuted, lineHeight: 1.55, fontSize: '0.9rem' }}>
            {t('INSTAY_CHECKOUT_CONFIRM_BODY')}
          </p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => run('self_checkout')}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 12,
              padding: '0.85rem',
              fontWeight: 900,
              background: '#F59E0B',
              color: '#1C1917',
              cursor: 'pointer',
              marginBottom: 8
            }}
          >
            {t('INSTAY_CHECKOUT_YES')}
          </button>
          <button
            type="button"
            onClick={() => setCheckoutOpen(false)}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 12,
              padding: '0.75rem',
              fontWeight: 800,
              background: 'transparent',
              color: themeStyles.textMuted,
              cursor: 'pointer'
            }}
          >
            {t('INSTAY_CHECKOUT_NO')}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}

function applyLocalStayAction(stay, action, payload = {}) {
  if (action === 'self_checkout') {
    return { ...stay, self_checked_out_at: new Date().toISOString() };
  }
  if (action === 'guest_feedback') {
    return {
      ...stay,
      feedback_stars: payload.stars ?? stay.feedback_stars ?? null,
      feedback_text: payload.text != null ? payload.text : stay.feedback_text,
      feedback_google: payload.google != null ? payload.google : stay.feedback_google,
      feedback_done: payload.done ? true : Boolean(stay.feedback_done)
    };
  }
  if (action === 'folio_add' && payload.item) {
    return { ...stay, folio: [payload.item, ...(stay.folio || [])] };
  }
  if (action === 'late_checkout' && payload.until) {
    return {
      ...stay,
      late_until: payload.until,
      checkout_time: String(payload.until).replace('+1', '')
    };
  }
  return stay;
}

function feedbackStepFromStay(stay) {
  if (stay?.feedback_done) return 'done';
  const stars = Number(stay?.feedback_stars) || 0;
  if (stars >= 4) return 'google';
  if (stars >= 1) return 'internal';
  return 'rate';
}

function GuestFeedback({ booking, stay, themeStyles, card, busy, onSubmit }) {
  const { t } = useTranslation();
  const [stars, setStars] = useState(Number(stay?.feedback_stars) || 0);
  const [note, setNote] = useState(stay?.feedback_text || '');
  const [step, setStep] = useState(() => feedbackStepFromStay(stay));

  async function pickStars(n) {
    setStars(n);
    const next = await onSubmit({ stars: n });
    if (!next) return;
    setStep(n >= 4 ? 'google' : 'internal');
  }

  async function openGoogle() {
    const url = googleReviewUrl(booking.unit_id);
    const next = await onSubmit({ stars, google: true, done: true });
    if (!next) return;
    setStep('done');
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function skipGoogle() {
    const next = await onSubmit({ stars, google: false, done: true });
    if (!next) return;
    setStep('done');
  }

  async function sendInternal(doneOnly) {
    const next = await onSubmit({
      stars,
      text: doneOnly ? (note || '') : note,
      google: false,
      done: true
    });
    if (!next) return;
    setStep('done');
  }

  const btn = (bg, color, extra = {}) => ({
    width: '100%',
    border: 'none',
    borderRadius: 12,
    padding: '0.85rem',
    fontWeight: 900,
    background: bg,
    color,
    cursor: busy ? 'wait' : 'pointer',
    ...extra
  });

  return (
    <div style={{ ...card, textAlign: 'center', padding: '1.6rem 1.1rem' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 900, marginBottom: 8 }}>{t('INSTAY_THANKS_TITLE')}</div>
      <p style={{ color: themeStyles.textMuted, lineHeight: 1.55, margin: '0 0 1.15rem' }}>{t('INSTAY_THANKS_BODY')}</p>

      {step === 'rate' ? (
        <>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{t('INSTAY_RATE_STAY')}</div>
          <div style={{ fontSize: '0.82rem', color: themeStyles.textMuted, marginBottom: 12 }}>{t('INSTAY_RATE_HINT')}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}`}
                disabled={Boolean(busy)}
                onClick={() => pickStars(n)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}
              >
                <Star size={34} color="#F59E0B" fill={n <= stars ? '#F59E0B' : 'none'} />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {step === 'google' ? (
        <>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={22} color="#F59E0B" fill={n <= stars ? '#F59E0B' : 'none'} />
            ))}
          </div>
          <p style={{ margin: '0 0 1rem', fontWeight: 800, lineHeight: 1.5 }}>
            {stars >= 5 ? t('INSTAY_GOOGLE_ASK_5') : t('INSTAY_GOOGLE_ASK_4')}
          </p>
          <button type="button" disabled={Boolean(busy)} onClick={openGoogle} style={btn('#E4E0D6', '#3F3A33')}>
            {t('INSTAY_GOOGLE_YES')}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={skipGoogle}
            style={btn('transparent', themeStyles.textMuted, { marginTop: 8 })}
          >
            {t('INSTAY_GOOGLE_NO')}
          </button>
        </>
      ) : null}

      {step === 'internal' ? (
        <>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={22} color="#F59E0B" fill={n <= stars ? '#F59E0B' : 'none'} />
            ))}
          </div>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{t('INSTAY_INTERNAL_TITLE')}</div>
          <p style={{ margin: '0 0 12px', color: themeStyles.textMuted, lineHeight: 1.5, fontSize: '0.88rem' }}>
            {t('INSTAY_INTERNAL_BODY')}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder={t('INSTAY_INTERNAL_PLACEHOLDER')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 12,
              border: `1px solid ${themeStyles.inputBorder}`,
              background: themeStyles.wrapperBg || themeStyles.inputBg,
              color: themeStyles.textPrimary,
              padding: '0.75rem',
              font: 'inherit',
              resize: 'vertical',
              marginBottom: 10
            }}
          />
          <button type="button" disabled={Boolean(busy)} onClick={() => sendInternal(false)} style={btn('#F59E0B', '#1C1917')}>
            {t('INSTAY_INTERNAL_SEND')}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => sendInternal(true)}
            style={btn('transparent', themeStyles.textMuted, { marginTop: 8 })}
          >
            {t('INSTAY_INTERNAL_SKIP')}
          </button>
        </>
      ) : null}

      {step === 'done' ? (
        <p style={{ margin: 0, fontWeight: 800, color: themeStyles.success, lineHeight: 1.55 }}>{t('INSTAY_FEEDBACK_DONE')}</p>
      ) : null}
    </div>
  );
}

function QtyChip({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.8, marginBottom: 4 }}>{label}</div>
      <div className="guest-qty">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} style={qtyBtn}>
          <Minus size={12} />
        </button>
        <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 900 }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(8, value + 1))} style={qtyBtn}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

const qtyBtn = {
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.2)',
  color: '#FFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer'
};

function ghostBtn(color, background, border) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: border ? `1px solid ${border}` : 'none',
    background: background || 'transparent',
    color,
    borderRadius: 10,
    padding: '0.4rem 0.65rem',
    fontWeight: 800,
    fontSize: '0.75rem',
    cursor: 'pointer'
  };
}

function Modal({ title, children, onClose, themeStyles }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: themeStyles.wrapperBg, color: themeStyles.textPrimary, borderRadius: 20, padding: '1.15rem 1.15rem 1.3rem', border: `1px solid ${themeStyles.inputBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, marginBottom: 12 }}>
          <span>{title}</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', color: themeStyles.textMuted, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
