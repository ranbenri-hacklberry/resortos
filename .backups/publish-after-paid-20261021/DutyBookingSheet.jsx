import React, { useEffect, useMemo, useState } from 'react';
import { Phone, MessageSquare, X, Banknote, CreditCard, Landmark, Ticket, Upload } from 'lucide-react';
import { getStoredToken } from '../lib/staffAuth';
import { ensureGuestStayPublished, pushBookingToCloud } from '../lib/cloudDb';
import {
  awaitingCashCollection,
  dueAgorotOf,
  isFullyPaid,
  kinorotSettlementKind,
  paidIlsOfBooking,
  paymentStatusAfterPaid,
  recordedPaidAgorot
} from '../lib/bookingPaid';
import { mergeClearingPayments, normalizeClearingPayment } from '../lib/clearingPayments';
import { guestStayUrl } from '../lib/guestStayUrl';
import { formatStayHourLabel, stayHoursFromBooking } from '../lib/kinorotStayHours';

const PAY_METHODS = [
  { id: 'CASH', label: 'מזומן', Icon: Banknote },
  { id: 'CARD', label: 'אשראי', Icon: CreditCard },
  { id: 'BANK_TRANSFER', label: 'העברה', Icon: Landmark },
  { id: 'VOUCHER', label: 'שובר', Icon: Ticket }
];

async function fetchComms(bookingId) {
  const headers = { Accept: 'application/json' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api/guest-comms?booking_id=${encodeURIComponent(bookingId)}`, {
    headers,
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'COMMS_FAILED');
  return Array.isArray(data.rows) ? data.rows : [];
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('IMAGE_FAILED'));
      img.onload = () => {
        const max = 1100;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function kindLabel(meta) {
  const kind = meta?.kind || meta?.template || '';
  if (kind === 'checkout_reminder') return 'תזכורת צ׳ק-אאוט 09:45';
  if (kind === 'farewell') return 'סמס פרידה';
  if (kind === 'gate') return 'קוד שער';
  if (kind === 'checkin' || kind === 'stay_link') return 'קישור צ׳ק-אין';
  if (kind === 'manual') return 'ידני';
  return kind || 'הודעה';
}

function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
  return `tel:${local}`;
}

function waHref(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
}

export function cashDueIls(booking) {
  if (!awaitingCashCollection(booking) && String(booking?.payment_mode || '') !== 'CASH') return 0;
  const due = dueAgorotOf(booking);
  if (due > 0) return Math.round(due / 100);
  const total = Math.round((Number(booking?.total_price_agorot) || 0) / 100);
  const paid = paidIlsOfBooking(booking, total, Math.round((Number(booking?.deposit_agorot) || 0) / 100));
  return Math.max(0, total - paid);
}

export default function DutyBookingSheet({
  booking,
  unitName = '',
  isLight = false,
  onClose,
  onBookingSaved
}) {
  const colors = {
    bg: isLight ? '#FFFFFF' : '#141416',
    text: isLight ? '#1C1917' : '#F8FAFC',
    muted: isLight ? '#57534E' : '#94A3B8',
    line: isLight ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)',
    subtle: isLight ? '#F6F3EC' : '#1E1E24'
  };

  const [comms, setComms] = useState([]);
  const [commsError, setCommsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stayBusy, setStayBusy] = useState(false);
  const [error, setError] = useState('');
  const [amountIls, setAmountIls] = useState(() => {
    const due = Math.round(dueAgorotOf(booking) / 100);
    if (due > 0) return String(due);
    const total = Math.round((Number(booking?.total_price_agorot) || 0) / 100);
    return total ? String(total) : '';
  });
  const [method, setMethod] = useState(() => {
    const mode = String(booking?.payment_mode || '');
    if (PAY_METHODS.some((row) => row.id === mode)) return mode;
    if (awaitingCashCollection(booking)) return 'CASH';
    return 'CASH';
  });
  const [ref, setRef] = useState('');
  const [photo, setPhoto] = useState(() => (
    booking?.stay?.payment_proof || booking?.stay?.voucher_photo || ''
  ));
  const [companyRedeemed, setCompanyRedeemed] = useState(
    Boolean(booking?.stay?.voucher_company_redeemed)
  );

  useEffect(() => {
    if (!booking?.id) return undefined;
    let stop = false;
    setCommsError('');
    fetchComms(booking.id)
      .then((rows) => { if (!stop) setComms(rows); })
      .catch((err) => { if (!stop) setCommsError(err.message || 'COMMS_FAILED'); });
    return () => { stop = true; };
  }, [booking?.id]);

  useEffect(() => {
    if (!booking?.checkout_token) return;
    ensureGuestStayPublished(booking).catch(() => {});
  }, [booking?.id, booking?.checkout_token]);

  const paidIls = useMemo(
    () => paidIlsOfBooking(
      booking,
      Math.round((Number(booking?.total_price_agorot) || 0) / 100),
      Math.round((Number(booking?.deposit_agorot) || 0) / 100)
    ),
    [booking]
  );
  const totalIls = Math.round((Number(booking?.total_price_agorot) || 0) / 100);
  const cash = cashDueIls(booking);
  const stayLink = booking?.checkout_token ? guestStayUrl(booking.checkout_token) : '';
  const fullyPaid = isFullyPaid(booking) || (totalIls > 0 && paidIls + 0.5 >= totalIls);

  const openGuestStay = async (event) => {
    event.preventDefault();
    if (!stayLink || stayBusy) return;
    setStayBusy(true);
    setError('');
    try {
      await ensureGuestStayPublished(booking);
    } catch (_) {
      setError('');
    }
    window.open(stayLink, '_blank', 'noopener,noreferrer');
    setStayBusy(false);
  };

  const savePayment = async () => {
    if (!booking?.id || busy || fullyPaid) return;
    setError('');
    const ils = Number(amountIls);
    if (method !== 'VOUCHER' && (!Number.isFinite(ils) || ils <= 0)) {
      setError('מלאו סכום לתשלום.');
      return;
    }
    if (method === 'BANK_TRANSFER') {
      const hasPhoto = String(photo || '').startsWith('data:image/');
      const hasRef = Boolean(String(ref || '').trim());
      if (!hasPhoto && !hasRef) {
        setError('צרפו אסמכתא או צילום אישור העברה.');
        return;
      }
    }
    setBusy(true);
    try {
      const nowIso = new Date().toISOString();
      if (method === 'VOUCHER') {
        const next = {
          ...booking,
          payment_mode: 'VOUCHER',
          payment_status: 'PAID',
          stay: {
            ...(booking.stay || {}),
            voucher_photo: photo || booking.stay?.voucher_photo || '',
            voucher_company_redeemed: companyRedeemed,
            voucher_updated_at: nowIso
          },
          updated_at: nowIso
        };
        await pushBookingToCloud(next, { allowOverlap: true });
        onBookingSaved?.(next);
        return;
      }

      const amountAgorot = Math.round(ils * 100);
      const clearing = mergeClearingPayments(booking.clearing_payments, normalizeClearingPayment({
        source: method === 'CASH' ? 'CASH' : (method === 'BANK_TRANSFER' ? 'BANK' : 'HYP'),
        accountKey: method === 'CASH' ? 'CASH' : (method === 'BANK_TRANSFER' ? 'BANK' : 'CARD'),
        amount_agorot: amountAgorot,
        paid_at: nowIso,
        at: nowIso,
        date: nowIso.slice(0, 10),
        note: `field:${method}`,
        ref: String(ref || '').trim() || `field-${Date.now()}`
      }));
      const paidTotal = clearing.reduce((sum, row) => sum + (Number(row.amount_agorot) || 0), 0);
      const nextStatus = paymentStatusAfterPaid(booking.total_price_agorot, paidTotal);
      const next = {
        ...booking,
        payment_mode: method,
        payment_status: nextStatus,
        clearing_payments: clearing,
        stay: {
          ...(booking.stay || {}),
          ...(method === 'CASH' && nextStatus === 'PAID'
            ? { cash_collected_at: nowIso, cash_expected: false }
            : {}),
          ...(method === 'CASH' && nextStatus !== 'PAID'
            ? { cash_expected: true }
            : {}),
          ...(method === 'BANK_TRANSFER' && String(photo || '').startsWith('data:image/')
            ? { payment_proof: photo, payment_proof_at: nowIso }
            : {})
        },
        updated_at: nowIso
      };
      await pushBookingToCloud(next, { allowOverlap: true });
      onBookingSaved?.(next);
    } catch (err) {
      setError(err?.message || 'שמירת התשלום נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
    >
      <div
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '88dvh',
          overflowY: 'auto',
          background: colors.bg,
          color: colors.text,
          borderRadius: 20,
          border: `1px solid ${colors.line}`,
          padding: '1rem 1.05rem 1.25rem',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.muted }}>פרטי הזמנה</div>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 900 }}>{unitName || booking.unit_id}</h2>
            <div style={{ marginTop: 4, fontWeight: 800 }}>{booking.guest_name || 'אורח'}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: `1px solid ${colors.line}`,
              background: colors.subtle,
              color: colors.muted,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: '0.82rem', color: colors.muted, fontWeight: 700, lineHeight: 1.5 }}>
          {booking.check_in_date} → {booking.check_out_date}
          {totalIls ? ` · ₪${totalIls}` : ''}
          {fullyPaid || kinorotSettlementKind(booking) === 'booking' ? ' · שולם במלואה' : paidIls ? ` · שולם ₪${paidIls}` : ''}
          {kinorotSettlementKind(booking) === 'booking' ? ' · Booking.com' : ''}
        </div>
        {(() => {
          const hours = stayHoursFromBooking(booking);
          const inn = formatStayHourLabel(hours.checkin);
          const out = formatStayHourLabel(hours.checkout);
          if (!inn && !out) return null;
          return (
            <div style={{ marginTop: 8, fontSize: '0.84rem', fontWeight: 800, color: colors.text }}>
              {inn ? `כניסה ${inn}` : ''}
              {inn && out ? ' · ' : ''}
              {out ? `יציאה ${out}` : ''}
            </div>
          );
        })()}

        {cash > 0 && !fullyPaid ? (
          <div style={{
            marginTop: 12,
            padding: '0.75rem 0.85rem',
            borderRadius: 14,
            background: 'rgba(16,185,129,0.14)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#34D399',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Banknote size={18} />
            לגבייה במזומן · ₪{cash}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {booking.guest_phone ? (
            <>
              <a href={telHref(booking.guest_phone)} style={actionBtn(colors, '#10B981')}>
                <Phone size={15} /> חייג
              </a>
              <a
                href={waHref(booking.guest_phone)}
                target="_blank"
                rel="noreferrer"
                style={actionBtn(colors, '#25D366')}
              >
                <MessageSquare size={15} /> WhatsApp
              </a>
            </>
          ) : (
            <div style={{ color: colors.muted, fontWeight: 700, fontSize: '0.82rem' }}>אין טלפון בהזמנה</div>
          )}
        </div>
        {booking.guest_phone ? (
          <div dir="ltr" style={{ marginTop: 6, fontSize: '0.85rem', fontWeight: 800, unicodeBidi: 'isolate' }}>
            {booking.guest_phone}
          </div>
        ) : null}

        {stayLink ? (
          <a
            href={stayLink}
            target="_blank"
            rel="noreferrer"
            onClick={openGuestStay}
            style={{
              display: 'block',
              marginTop: 12,
              fontSize: '0.78rem',
              fontWeight: 800,
              color: stayBusy ? colors.muted : '#818CF8',
              wordBreak: 'break-all'
            }}
          >
            {stayBusy ? 'מעלה את דף האורח…' : 'דף אורח'}
          </a>
        ) : null}
        {error ? (
          <div style={{ marginTop: 8, color: '#F87171', fontSize: '0.78rem', fontWeight: 800 }}>{error}</div>
        ) : null}

        <section style={{ marginTop: 18 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 900, marginBottom: 8 }}>
            {fullyPaid ? 'תשלום' : 'תשלום שנרשם'}
          </div>
          {fullyPaid ? (
            <div style={{
              padding: '0.85rem 0.9rem',
              borderRadius: 14,
              background: 'rgba(16,185,129,0.12)',
              border: '1px solid rgba(16,185,129,0.35)',
              color: '#34D399',
              fontWeight: 900,
              fontSize: '0.9rem'
            }}>
              ההזמנה שולמה במלואה · ₪{Math.max(paidIls, totalIls) || 0}
              {recordedPaidAgorot(booking) ? ` · ${Math.round(recordedPaidAgorot(booking) / 100)} רשום` : ''}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {PAY_METHODS.map((row) => {
                  const active = method === row.id;
                  const Icon = row.Icon;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setMethod(row.id)}
                      style={{
                        flex: '1 1 22%',
                        minHeight: 40,
                        borderRadius: 12,
                        border: active ? '1px solid rgba(16,185,129,0.5)' : `1px solid ${colors.line}`,
                        background: active ? 'rgba(16,185,129,0.14)' : colors.subtle,
                        color: active ? '#10B981' : colors.muted,
                        fontWeight: 800,
                        fontSize: '0.74rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5
                      }}
                    >
                      <Icon size={14} />
                      {row.label}
                    </button>
                  );
                })}
              </div>

              {method !== 'VOUCHER' ? (
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={amountIls}
                  onChange={(e) => setAmountIls(e.target.value)}
                  placeholder="סכום ₪"
                  style={fieldStyle(colors)}
                />
              ) : null}

              {method === 'CARD' ? (
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="מספר אישור / אסמכתא"
                  style={{ ...fieldStyle(colors), marginTop: 8 }}
                />
              ) : null}

              {method === 'BANK_TRANSFER' ? (
                <div style={{ marginTop: 8 }}>
                  <input
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    placeholder="מספר אסמכתא (או צילום)"
                    style={fieldStyle(colors)}
                  />
                  <div style={{ marginTop: 6, fontSize: '0.72rem', color: colors.muted, fontWeight: 700 }}>
                    אסמכתא או צילום מסך של ההעברה
                  </div>
                  {photo ? (
                    <img
                      src={photo}
                      alt="אישור העברה"
                      style={{ marginTop: 8, width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover' }}
                    />
                  ) : null}
                  <label style={{ ...fileLabel(colors), marginTop: 8 }}>
                    <Upload size={14} />
                    {photo ? 'החלפת צילום' : 'צירוף צילום מסך'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={busy}
                      style={{ display: 'none' }}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        try {
                          setPhoto(await compressPhoto(file));
                          setError('');
                        } catch {
                          setError('לא הצלחנו לקרוא את הצילום');
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {method === 'VOUCHER' ? (
                <div style={{ marginTop: 8 }}>
                  {photo ? (
                    <img
                      src={photo}
                      alt="צילום שובר"
                      style={{ width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover' }}
                    />
                  ) : null}
                  <label style={{ ...fileLabel(colors), marginTop: photo ? 8 : 0 }}>
                    <Upload size={14} />
                    {photo ? 'החלפת צילום' : 'צירוף צילום שובר'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={busy}
                      style={{ display: 'none' }}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;
                        try {
                          setPhoto(await compressPhoto(file));
                          setError('');
                        } catch {
                          setError('לא הצלחנו לקרוא את הצילום');
                        }
                      }}
                    />
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: colors.text,
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={companyRedeemed}
                      disabled={busy}
                      onChange={(e) => setCompanyRedeemed(e.target.checked)}
                    />
                    נפדה בחברת השוברים
                  </label>
                </div>
              ) : null}

              {error ? (
                <div style={{ marginTop: 8, color: '#F87171', fontSize: '0.78rem', fontWeight: 800 }}>{error}</div>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={savePayment}
                style={{
                  marginTop: 10,
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 12,
                  border: 'none',
                  background: '#10B981',
                  color: '#052e1c',
                  fontWeight: 900,
                  cursor: busy ? 'wait' : 'pointer'
                }}
              >
                {busy ? 'שומר…' : method === 'VOUCHER' ? 'שמור שובר' : 'רשום תשלום'}
              </button>
              <div style={{ marginTop: 6, fontSize: '0.72rem', color: colors.muted, fontWeight: 700 }}>
                שולם עד כה: ₪{paidIls || 0}
                {recordedPaidAgorot(booking) ? ` · ${Math.round(recordedPaidAgorot(booking) / 100)} רשום` : ''}
              </div>
            </>
          )}
        </section>

        <section style={{ marginTop: 18 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 900, marginBottom: 8 }}>הודעות שנשלחו</div>
          {commsError ? (
            <div style={{ color: '#F87171', fontSize: '0.78rem', fontWeight: 700 }}>{commsError}</div>
          ) : null}
          {!commsError && !comms.length ? (
            <div style={{ color: colors.muted, fontSize: '0.8rem', fontWeight: 700 }}>עדיין לא נשלחה הודעה</div>
          ) : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {comms.map((row) => (
              <div
                key={row.id || `${row.sent_at}-${row.content}`}
                style={{
                  border: `1px solid ${colors.line}`,
                  borderRadius: 12,
                  padding: '0.7rem 0.75rem',
                  background: colors.subtle
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.72rem', fontWeight: 800, color: colors.muted }}>
                  <span>{kindLabel(row.metadata)} · {row.channel || 'sms'}</span>
                  <span>{formatWhen(row.sent_at || row.scheduled_at || row.created_at)}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                  {row.content || '—'}
                </div>
                <div style={{ marginTop: 4, fontSize: '0.7rem', color: colors.muted, fontWeight: 700 }}>
                  {row.status === 'sent' || row.status === 'delivered' ? 'נשלח' : (row.status || '')}
                  {row.recipient_phone ? ` · ${row.recipient_phone}` : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function fieldStyle(colors) {
  return {
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    border: `1px solid ${colors.line}`,
    background: colors.subtle,
    color: colors.text,
    padding: '0 12px',
    fontWeight: 800,
    fontSize: '0.9rem',
    boxSizing: 'border-box'
  };
}

function fileLabel(colors) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 42,
    borderRadius: 12,
    border: `1px dashed ${colors.line}`,
    background: colors.subtle,
    color: colors.muted,
    fontWeight: 800,
    fontSize: '0.8rem',
    cursor: 'pointer'
  };
}

function actionBtn(colors, accent) {
  return {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    border: `1px solid ${accent}55`,
    background: `${accent}22`,
    color: accent,
    fontWeight: 900,
    fontSize: '0.82rem',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  };
}
