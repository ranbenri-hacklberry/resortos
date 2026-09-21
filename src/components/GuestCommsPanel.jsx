import React, { useEffect, useState } from 'react';
import { MessageSquare, Send, RefreshCw, X } from 'lucide-react';
import { getStoredToken } from '../lib/staffAuth';
import { GUEST_SMS_TEMPLATES, guestPresenceBadge, templateById } from '../lib/guestComms';
import { guestStayUrl } from '../lib/guestStayUrl';
import { unitFullName } from '../lib/units';

async function commsFetch(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/guest-comms${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || 'COMMS_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}

function statusLabel(status) {
  if (status === 'sent' || status === 'delivered') return 'נשלח';
  if (status === 'failed') return 'נכשל';
  if (status === 'scheduled') return 'מתוזמן';
  return status || '';
}

function kindLabel(meta) {
  const kind = meta?.kind || meta?.template || '';
  if (kind === 'checkout_reminder') return 'תזכורת 09:45';
  if (kind === 'farewell') return 'סמס פרידה';
  if (kind === 'gate') return 'קוד שער';
  if (kind === 'checkin' || kind === 'stay_link') return 'קישור צ׳ק-אין';
  if (kind === 'manual') return 'ידני';
  return kind || 'הודעה';
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

function buildTemplateText(templateId, booking) {
  const tpl = templateById(templateId);
  if (!tpl) return '';
  const unitName = unitFullName(booking?.unit_id, booking?.unit_id);
  return tpl.build({
    unitName,
    gateCode: booking?.stay?.gate_code || '',
    checkoutUrl: booking?.checkout_token ? guestStayUrl(booking.checkout_token) : ''
  });
}

export function PresenceDot({ booking, compact = false }) {
  const badge = guestPresenceBadge(booking);
  return (
    <span
      title={badge.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: compact ? '0.68rem' : '0.75rem',
        fontWeight: 800,
        color: badge.color
      }}
    >
      <span
        style={{
          width: compact ? 8 : 9,
          height: compact ? 8 : 9,
          borderRadius: 999,
          background: badge.color,
          boxShadow: `0 0 0 3px ${badge.color}33`
        }}
      />
      {!compact ? badge.label : null}
    </span>
  );
}

export default function GuestCommsPanel({ booking, themeStyles, isLight }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  const bookingId = booking?.id;
  const draftReady = Boolean(String(draft || '').trim());

  async function reload() {
    if (!bookingId) return;
    setLoading(true);
    setError('');
    try {
      const data = await commsFetch(`?booking_id=${encodeURIComponent(bookingId)}`);
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(
        err.status === 401
          ? 'צריך להתחבר מחדש'
          : err.message === 'COMMS_LIST_FAILED' || err.message === 'COMMS_FAILED'
            ? 'לא ניתן לטעון הודעות (בדקו חיבור לשרת)'
            : (err.message || 'שגיאה')
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [bookingId]);

  function applyTemplate(templateId) {
    const text = buildTemplateText(templateId, booking);
    setSelectedTemplateId(templateId);
    setDraft(text);
    setConfirmOpen(false);
    setError('');
  }

  function requestSend() {
    if (!draftReady || sending) return;
    setConfirmOpen(true);
    setError('');
  }

  async function confirmSend() {
    const text = String(draft || '').trim();
    if (!bookingId || !text || sending) return;
    setSending(true);
    setError('');
    try {
      await commsFetch('/send', {
        method: 'POST',
        body: JSON.stringify({
          booking_id: bookingId,
          message: text,
          kind: selectedTemplateId || 'manual',
          template_id: selectedTemplateId || undefined
        })
      });
      setDraft('');
      setSelectedTemplateId(null);
      setConfirmOpen(false);
      await reload();
    } catch (err) {
      setError(err.message || 'שליחה נכשלה');
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  const card = {
    background: isLight ? 'rgba(15, 23, 42, 0.03)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${themeStyles.inputBorder}`,
    borderRadius: 14,
    padding: '0.85rem'
  };

  return (
    <div dir="rtl" style={{ ...card, display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900 }}>
          <MessageSquare size={16} color="#38BDF8" />
          הודעות אורח
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PresenceDot booking={booking} />
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            style={{
              border: 'none',
              background: 'transparent',
              color: themeStyles.textMuted,
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 4
            }}
            title="רענון"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted }}>
        בחרו תבנית ← בדקו את הטקסט ← רק אז שליחה
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {GUEST_SMS_TEMPLATES.filter((row) => row.id !== 'farewell' && row.id !== 'checkout_reminder').map((tpl) => {
          const active = selectedTemplateId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              disabled={sending}
              onClick={() => applyTemplate(tpl.id)}
              style={{
                border: active ? '1px solid #0EA5E9' : `1px solid ${themeStyles.inputBorder}`,
                background: active
                  ? (isLight ? 'rgba(14,165,233,0.12)' : 'rgba(14,165,233,0.22)')
                  : (isLight ? '#FFF' : '#1E293B'),
                color: themeStyles.textPrimary,
                borderRadius: 999,
                padding: '0.35rem 0.7rem',
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              {tpl.label}
            </button>
          );
        })}
      </div>

      <div style={{
        maxHeight: 180,
        overflowY: 'auto',
        display: 'grid',
        gap: 8,
        padding: '0.2rem 0'
      }}>
        {loading && !rows.length ? (
          <div style={{ color: themeStyles.textMuted, fontSize: '0.8rem' }}>טוען…</div>
        ) : null}
        {!loading && !rows.length ? (
          <div style={{ color: themeStyles.textMuted, fontSize: '0.8rem' }}>
            עדיין אין הודעות מתועדות להזמנה זו.
          </div>
        ) : null}
        {rows.slice().reverse().map((row) => (
          <div
            key={row.id}
            style={{
              borderRadius: 12,
              padding: '0.55rem 0.65rem',
              background: isLight ? '#FFF' : 'rgba(15,23,42,0.55)',
              border: `1px solid ${themeStyles.inputBorder}`
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: '0.68rem',
              fontWeight: 800,
              color: themeStyles.textMuted,
              marginBottom: 4
            }}>
              <span>{kindLabel(row.metadata)} · {statusLabel(row.status)}</span>
              <span>{formatWhen(row.sent_at || row.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.45 }}>
              {row.content}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setConfirmOpen(false);
          }}
          rows={4}
          placeholder="בחרו תבנית או כתבו הודעה — שום דבר לא נשלח עד אישור"
          style={{
            width: '100%',
            resize: 'vertical',
            borderRadius: 10,
            border: `1px solid ${themeStyles.inputBorder}`,
            background: themeStyles.inputBg,
            color: themeStyles.textPrimary,
            padding: '0.55rem 0.65rem',
            fontWeight: 600,
            fontSize: '0.82rem',
            lineHeight: 1.45
          }}
        />

        {!confirmOpen ? (
          <button
            type="button"
            disabled={sending || !draftReady}
            onClick={requestSend}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '0.75rem 0.85rem',
              background: 'linear-gradient(135deg, #0EA5E9, #0369A1)',
              color: '#FFF',
              fontWeight: 900,
              cursor: sending || !draftReady ? 'not-allowed' : 'pointer',
              opacity: sending || !draftReady ? 0.55 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <Send size={15} />
            המשך לאישור שליחה
          </button>
        ) : (
          <div style={{
            borderRadius: 12,
            border: '1px solid rgba(14,165,233,0.45)',
            background: isLight ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.16)',
            padding: '0.75rem',
            display: 'grid',
            gap: 10
          }}>
            <div style={{ fontWeight: 900, fontSize: '0.88rem' }}>לאשר שליחת SMS?</div>
            <div style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.82rem',
              lineHeight: 1.5,
              fontWeight: 600,
              padding: '0.55rem 0.65rem',
              borderRadius: 10,
              background: isLight ? '#FFF' : 'rgba(15,23,42,0.55)',
              border: `1px solid ${themeStyles.inputBorder}`
            }}>
              {draft}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                disabled={sending}
                onClick={confirmSend}
                style={{
                  border: 'none',
                  borderRadius: 12,
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #22C55E, #15803D)',
                  color: '#FFF',
                  fontWeight: 900,
                  cursor: sending ? 'wait' : 'pointer'
                }}
              >
                {sending ? 'שולח…' : 'כן, לשלוח עכשיו'}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                style={{
                  border: `1px solid ${themeStyles.inputBorder}`,
                  borderRadius: 12,
                  padding: '0.75rem',
                  background: isLight ? '#FFF' : '#1E293B',
                  color: themeStyles.textPrimary,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <X size={14} />
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div style={{ color: '#F87171', fontSize: '0.78rem', fontWeight: 700 }}>{error}</div>
      ) : null}
    </div>
  );
}
