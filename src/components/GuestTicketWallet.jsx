import React, { useEffect, useMemo, useState } from 'react';
import { Ticket, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDynamicText } from '../lib/translator';
import {
  flattenTickets,
  loadGuestOrders,
  redeemGuestTicket,
  subscribeGuestTickets
} from '../lib/guestTickets';

const PASS_THEMES = {
  tix_water: { from: '#0E7490', to: '#155E75', accent: '#67E8F9' },
  tix_cable: { from: '#26130F', to: '#59454A', accent: '#F2D5DD' },
  tix_sail: { from: '#C2410C', to: '#9A3412', accent: '#FDBA74' },
  tix_farm: { from: '#15803D', to: '#14532D', accent: '#86EFAC' },
  tix_choco: { from: '#9F1239', to: '#4C0519', accent: '#FECDD3' }
};

function LiveText({ text }) {
  const translated = useDynamicText(text, null, 'he');
  return <>{translated}</>;
}

function FakeQr({ value, size = 148 }) {
  const cells = 21;
  const pad = 8;
  const inner = size - pad * 2;
  const cell = inner / cells;
  const bits = useMemo(() => {
    let h = 2166136261;
    for (let i = 0; i < String(value).length; i += 1) {
      h = Math.imul(h ^ String(value).charCodeAt(i), 16777619);
    }
    const grid = [];
    for (let y = 0; y < cells; y += 1) {
      const row = [];
      for (let x = 0; x < cells; x += 1) {
        const finder =
          (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
        if (finder) {
          const dx = x < 7 ? x : x - (cells - 7);
          const dy = y < 7 ? y : y - (cells - 7);
          row.push(dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        } else {
          row.push(Boolean(((h + x * 31 + y * 17) >>> (x % 8)) & 1));
        }
      }
      grid.push(row);
    }
    return grid;
  }, [value]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect width={size} height={size} rx="10" fill="#FFF" />
      {bits.flatMap((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={pad + x * cell}
              y={pad + y * cell}
              width={cell}
              height={cell}
              fill="#111"
            />
          ) : null
        )
      )}
    </svg>
  );
}

function formatUsedAt(iso, lang) {
  try {
    return new Date(iso).toLocaleString(lang || 'he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function PassCard({ ticket, punch, t, i18n, pendingCode, onRedeem, onAskRedeem, onCancelRedeem }) {
  const theme = PASS_THEMES[ticket.attractionId] || PASS_THEMES.tix_cable;
  const used = Boolean(ticket.redeemedAt);
  const confirming = pendingCode === ticket.code;

  return (
    <article
      className={`guest-pass${used ? ' is-used' : ''}`}
      style={{
        background: `linear-gradient(165deg, ${theme.from}, ${theme.to})`,
        ['--guest-pass-punch']: punch
      }}
    >
      {used ? (
        <div className="guest-pass-stamp">
          <span>{t('GUEST_TICKET_USED')}</span>
        </div>
      ) : null}

      <div style={{ padding: '1.35rem 1.25rem 1.1rem', flex: '0 0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.8,
            marginBottom: 10
          }}
        >
          <span>{t('GUEST_TICKET_PASS')}</span>
          <span>{ticket.kind === 'child' || ticket.kind === 'ילד' ? t('GUEST_CHILD') : t('GUEST_ADULT')}</span>
        </div>
        <div style={{ fontWeight: 900, fontSize: '1.55rem', lineHeight: 1.25 }}>
          <LiveText text={ticket.title} />
        </div>
        <div style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.82 }}>
          {used
            ? t('GUEST_TICKET_USED_AT', { time: formatUsedAt(ticket.redeemedAt, i18n.language) })
            : t('GUEST_TICKET_VALID')}
        </div>
      </div>

      <div className="guest-pass-perforation" />

      <div
        style={{
          padding: '1.2rem 1.25rem 1.35rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14
        }}
      >
        <div
          style={{
            background: '#FFF',
            borderRadius: 18,
            padding: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
          }}
        >
          <FakeQr value={ticket.code} />
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontWeight: 800,
            letterSpacing: '0.08em',
            fontSize: '0.95rem'
          }}
        >
          {ticket.code}
        </div>

        {used ? (
          <div style={{ fontWeight: 800, opacity: 0.85 }}>{t('GUEST_TICKET_USED')}</div>
        ) : confirming ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
              {t('GUEST_TICKET_REDEEM_CONFIRM')}
            </div>
            <button
              type="button"
              onClick={() => onRedeem(ticket.code)}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 14,
                padding: '0.9rem',
                fontWeight: 900,
                cursor: 'pointer',
                background: '#F8F4EA',
                color: theme.to
              }}
            >
              {t('GUEST_TICKET_REDEEM_YES')}
            </button>
            <button
              type="button"
              onClick={onCancelRedeem}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 14,
                padding: '0.7rem',
                fontWeight: 800,
                cursor: 'pointer',
                background: 'transparent',
                color: '#F8F4EA'
              }}
            >
              {t('GUEST_TICKET_REDEEM_CANCEL')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAskRedeem(ticket.code)}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 14,
              padding: '0.95rem',
              fontWeight: 900,
              fontSize: '1rem',
              cursor: 'pointer',
              background: '#F8F4EA',
              color: theme.to
            }}
          >
            {t('GUEST_TICKET_REDEEM')}
          </button>
        )}
      </div>
    </article>
  );
}

export default function GuestTicketWallet({ booking, themeStyles }) {
  const { t, i18n } = useTranslation();
  const bookingId = booking?.id;
  const punch = themeStyles?.wrapperBg || '#0A0A0C';
  const [orders, setOrders] = useState(() => loadGuestOrders(bookingId));
  const [open, setOpen] = useState(false);
  const [showUsed, setShowUsed] = useState(false);
  const [pendingCode, setPendingCode] = useState(null);

  function openWallet(opts = {}) {
    const ticketsNow = flattenTickets(loadGuestOrders(bookingId));
    const hasUnused = ticketsNow.some((ticket) => !ticket.redeemedAt);
    setShowUsed(Boolean(opts.showUsed) || !hasUnused);
    setPendingCode(null);
    setOpen(true);
  }

  function closeWallet() {
    setOpen(false);
    setShowUsed(false);
    setPendingCode(null);
  }

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setOrders(loadGuestOrders(bookingId));
    return subscribeGuestTickets((id, extra) => {
      if (id !== bookingId && id !== (bookingId || 'guest')) return;
      if (extra?.orders) setOrders(extra.orders);
      else setOrders(loadGuestOrders(bookingId));
      if (extra?.open) openWallet();
    });
  }, [bookingId]);

  const tickets = flattenTickets(orders);
  const unusedTickets = tickets.filter((ticket) => !ticket.redeemedAt);
  const usedTickets = tickets.filter((ticket) => ticket.redeemedAt);
  const unused = unusedTickets.length;
  if (!tickets.length) return null;

  function redeem(code) {
    const ticket = tickets.find((item) => item.code === code);
    if (!ticket || ticket.redeemedAt) return;
    setOrders(redeemGuestTicket(bookingId, code));
    setPendingCode(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openWallet()}
        aria-label={t('GUEST_YOUR_TICKETS')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          border: unused ? 'none' : `1px solid ${themeStyles.inputBorder}`,
          cursor: 'pointer',
          borderRadius: 999,
          padding: '0.38rem 0.72rem',
          fontWeight: 800,
          fontSize: '0.78rem',
          whiteSpace: 'nowrap',
          color: unused ? '#1C1917' : themeStyles.textPrimary,
          background: unused
            ? 'linear-gradient(135deg, #FBBF24, #F59E0B)'
            : themeStyles.inputBg,
          boxShadow: unused ? '0 6px 16px rgba(245, 158, 11, 0.28)' : 'none'
        }}
      >
        <Ticket size={15} />
        <span>{t('GUEST_TICKETS_BAR')}</span>
        <span
          style={{
            background: unused ? '#1C1917' : themeStyles.inputBorder,
            color: unused ? '#FBBF24' : themeStyles.textMuted,
            borderRadius: 999,
            minWidth: 18,
            padding: '0.08rem 0.42rem',
            fontSize: '0.7rem',
            fontWeight: 900
          }}
        >
          {unused || usedTickets.length}
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: punch,
            color: themeStyles.textPrimary,
            overflowY: 'auto',
            padding: '1rem 1rem 2rem'
          }}
        >
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
                paddingBottom: 10,
                background: punch
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>{t('GUEST_YOUR_TICKETS')}</div>
                <div style={{ fontSize: '0.78rem', color: themeStyles.textMuted, marginTop: 2 }}>
                  {t('GUEST_TICKETS_WALLET_HINT')}
                </div>
              </div>
              <button
                type="button"
                onClick={closeWallet}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  border: `1px solid ${themeStyles.inputBorder}`,
                  background: themeStyles.inputBg,
                  color: themeStyles.textPrimary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {(unusedTickets.length ? unusedTickets : usedTickets).map((ticket) => (
                <PassCard
                  key={ticket.code}
                  ticket={ticket}
                  punch={punch}
                  t={t}
                  i18n={i18n}
                  pendingCode={pendingCode}
                  onRedeem={redeem}
                  onAskRedeem={setPendingCode}
                  onCancelRedeem={() => setPendingCode(null)}
                />
              ))}

              {unusedTickets.length && usedTickets.length ? (
                <div style={{ textAlign: 'center', padding: '0.4rem 0 0.2rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowUsed((value) => !value)}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: themeStyles.textMuted,
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      textDecoration: 'underline',
                      textUnderlineOffset: 3
                    }}
                  >
                    {showUsed
                      ? t('GUEST_TICKETS_HIDE_USED')
                      : t('GUEST_TICKETS_SHOW_USED', { count: usedTickets.length })}
                  </button>
                </div>
              ) : null}

              {showUsed && unusedTickets.length
                ? usedTickets.map((ticket) => (
                    <PassCard
                      key={ticket.code}
                      ticket={ticket}
                      punch={punch}
                      t={t}
                      i18n={i18n}
                      pendingCode={pendingCode}
                      onRedeem={redeem}
                      onAskRedeem={setPendingCode}
                      onCancelRedeem={() => setPendingCode(null)}
                    />
                  ))
                : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
