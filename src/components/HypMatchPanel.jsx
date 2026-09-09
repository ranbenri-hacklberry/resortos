import React, { useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { db } from '../lib/resortos-db';
import { pushBookingToCloud } from '../lib/cloudDb';
import { mergeClearingPayments } from '../lib/clearingPayments';
import { paymentFromHypRow, suggestBookingsForHyp, unmatchedHypRows } from '../lib/hypPayments';

function formatIls(amount) {
  return `₪${Number(amount || 0).toLocaleString('he-IL')}`;
}

function formatHe(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL');
}

export default function HypMatchPanel({
  theme = 'dark',
  styles,
  payload,
  bookings,
  units
}) {
  const isLight = theme === 'light';
  const [queryByTxn, setQueryByTxn] = useState({});
  const [busyTxn, setBusyTxn] = useState('');
  const [notice, setNotice] = useState('');

  const unmatchedAll = useMemo(
    () => unmatchedHypRows(payload, bookings)
      .filter((row) => Number(row.amount) > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [payload, bookings]
  );
  const unmatched = unmatchedAll.slice(0, 40);

  if (!payload) return null;
  if (!unmatched.length) {
    return (
      <div style={{
        marginBottom: '1rem',
        padding: '0.85rem 1rem',
        borderRadius: '14px',
        border: `1px solid ${styles.cardBorder}`,
        background: styles.cardBg
      }}>
        <strong>Hyp — כל החיובים שויכו להזמנה</strong>
        <div style={{ marginTop: 4, fontSize: '0.8rem', color: styles.textMuted }}>
          {payload.count} עסקאות מאושרות · {formatHe(payload.from)}–{formatHe(payload.to)}
        </div>
      </div>
    );
  }

  async function assign(row, booking) {
    setBusyTxn(row.txn);
    setNotice('');
    try {
      const next = {
        ...booking,
        clearing_payments: mergeClearingPayments(booking.clearing_payments, paymentFromHypRow(row)),
        updated_at: new Date().toISOString()
      };
      await db.bookings.put(next);
      await pushBookingToCloud(next);
      setNotice(`שויך ${formatIls(row.amount)} · אסמכתה ${row.ref} אל ${booking.guest_name || booking.id}`);
    } catch (err) {
      setNotice('השיוך נכשל. נסו שוב.');
    } finally {
      setBusyTxn('');
    }
  }

  return (
    <div style={{
      marginBottom: '1.1rem',
      padding: '1rem',
      borderRadius: '16px',
      border: `1px solid ${styles.cardBorder}`,
      background: styles.cardBg
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>חיוב Hyp בלי הזמנה — אתם מתאימים</h3>
          <div style={{ marginTop: 4, fontSize: '0.8rem', color: styles.textMuted }}>
            {unmatchedAll.length > unmatched.length
              ? `${unmatched.length} האחרונים מתוך ${unmatchedAll.length} חיובים בלי הזמנה. בחרו הזמנה מהיומן.`
              : `${unmatched.length} חיובים מתוך ${payload.count} לא ידעתי לשייך לבד. בחרו הזמנה מהיומן.`}
          </div>
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FBBF24' }}>
          {formatIls(unmatched.reduce((sum, row) => sum + Number(row.amount || 0), 0))}
        </div>
      </div>

      {notice ? (
        <div style={{
          marginTop: '0.7rem',
          padding: '0.55rem 0.7rem',
          borderRadius: 10,
          background: 'rgba(16,185,129,0.12)',
          color: '#34D399',
          fontWeight: 700,
          fontSize: '0.82rem'
        }}>
          {notice}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.85rem' }}>
        {unmatched.map((row) => {
          const query = queryByTxn[row.txn] || '';
          const suggestions = suggestBookingsForHyp(row, bookings, units, { query, limit: 8 });
          return (
            <div
              key={`${row.terminalId || ''}-${row.txn}`}
              style={{
                padding: '0.75rem 0.85rem',
                borderRadius: 12,
                border: `1px solid ${isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)'}`,
                background: isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{row.name || 'ללא שם'}</div>
                  <div style={{ marginTop: 3, fontSize: '0.78rem', color: styles.textMuted }}>
                    {row.desc || '—'}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.78rem', fontWeight: 800 }}>
                    {formatHe(row.date)} · {formatIls(row.amount)} · מסוף {row.terminalId} · אסמכתה {row.ref}
                  </div>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQueryByTxn((prev) => ({ ...prev, [row.txn]: e.target.value }))}
                  placeholder="חיפוש הזמנה לפי שם / יחידה"
                  style={{
                    minWidth: 220,
                    background: styles.inputBg,
                    color: styles.textPrimary,
                    border: `1px solid ${styles.cardBorder}`,
                    borderRadius: 10,
                    padding: '0.45rem 0.7rem',
                    fontWeight: 600
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
                {suggestions.length === 0 ? (
                  <div style={{ fontSize: '0.78rem', color: styles.textMuted }}>
                    אין הצעה קרובה. חפשו שם אורח מהיומן.
                  </div>
                ) : suggestions.map((item) => (
                  <button
                    key={`${row.txn}-${item.booking.id}`}
                    type="button"
                    disabled={busyTxn === row.txn}
                    onClick={() => assign(row, item.booking)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: 'none',
                      borderRadius: 999,
                      padding: '0.35rem 0.7rem',
                      background: isLight ? '#EEF2FF' : '#312E81',
                      color: isLight ? '#312E81' : '#E0E7FF',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: busyTxn === row.txn ? 'wait' : 'pointer'
                    }}
                  >
                    <Link2 size={13} />
                    {item.booking.guest_name || 'בלי שם'}
                    {' · '}
                    {item.unit}
                    {' · '}
                    {formatHe(item.booking.check_in_date)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
