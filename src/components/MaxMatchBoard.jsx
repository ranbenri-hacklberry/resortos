import React, { useMemo, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import { formatHeDate, formatIls } from '../lib/dailyCollection';
import { formatHeDay, formatIlsMoney, monthKey } from '../lib/maxCredits';
import { confidenceLabel, isFollowOnInstallment } from '../lib/maxCollectionMatch';
import { CLEARING_ACCOUNTS, maxClearingLine } from '../lib/clearingPayments';

const VIEWS = [
  { id: 'matched', label: 'הותאמו' },
  { id: 'collection', label: 'רק בדוח היומי' },
  { id: 'max', label: 'רק במקס' }
];

export default function MaxMatchBoard({ theme = 'dark', match }) {
  const isLight = theme === 'light';
  const [view, setView] = useState('matched');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('');

  const colors = {
    cardBg: isLight ? '#F8FAFC' : '#1E293B',
    cardBorder: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
    text: isLight ? '#0F172A' : '#F8FAFC',
    muted: isLight ? '#64748B' : '#94A3B8',
    inputBg: isLight ? '#FFFFFF' : '#0B1220'
  };

  const totals = match?.totals || {};
  const months = useMemo(() => {
    const keys = new Set();
    for (const row of match?.matches || []) keys.add(monthKey(row.collection.stayDate));
    for (const row of match?.unmatchedCollection || []) keys.add(monthKey(row.stayDate));
    for (const tx of match?.unmatchedMax || []) keys.add(monthKey(tx.depositDate));
    return [...keys].filter(Boolean).sort().reverse();
  }, [match]);

  const q = query.trim().toLowerCase();
  const filteredMatches = useMemo(() => (match?.matches || []).filter((row) => {
    if (month && monthKey(row.collection.stayDate) !== month) return false;
    if (!q) return true;
    const hay = `${row.collection.guestName} ${row.collection.property} ${row.txs.map((tx) => tx.cardLast4).join(' ')}`.toLowerCase();
    return hay.includes(q);
  }), [match, month, q]);
  const filteredCollection = useMemo(() => (match?.unmatchedCollection || []).filter((row) => {
    if (month && monthKey(row.stayDate) !== month) return false;
    if (!q) return true;
    return `${row.guestName} ${row.property} ${row.notes}`.toLowerCase().includes(q);
  }), [match, month, q]);
  const filteredMax = useMemo(() => (match?.unmatchedMax || []).filter((tx) => {
    if (month && monthKey(tx.depositDate) !== month) return false;
    if (!q) return true;
    return `${tx.cardLast4} ${tx.batchId} ${tx.brand}`.includes(q);
  }), [match, month, q]);

  if (!match) return null;

  const cardStyle = {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: '16px',
    padding: '1rem'
  };

  return (
    <div style={{ margin: '1.1rem 0 1.4rem', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>הצלבה: דוח יומי ↔ מקס</h2>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: colors.muted }}>
          אשראי בדוח מול סכום ברוטו במקס, לפי תאריך שהייה מול תאריך הפקדה. תשלומי 2/N ואילך נשארים בצד מקס.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>הותאמו</div>
          <div style={{ marginTop: '0.35rem', fontSize: '1.3rem', fontWeight: 900, color: '#34D399' }}>{totals.matched || 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>רק בדוח היומי</div>
          <div style={{ marginTop: '0.35rem', fontSize: '1.3rem', fontWeight: 900, color: '#FBBF24' }}>{totals.unmatchedCollection || 0}</div>
          <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: colors.muted }}>{formatIls(totals.unmatchedCollectionAmount)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>רק במקס</div>
          <div style={{ marginTop: '0.35rem', fontSize: '1.3rem', fontWeight: 900 }}>{totals.unmatchedMax || 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>ברוטו שהותאם</span>
            <Link2 size={16} color="#818CF8" />
          </div>
          <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 900 }}>{formatIlsMoney(totals.matchedGross)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            style={{
              border: 'none',
              borderRadius: '999px',
              padding: '0.4rem 0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              background: view === item.id ? '#4F46E5' : colors.cardBg,
              color: view === item.id ? '#fff' : colors.text,
              fontSize: '0.8rem'
            }}
          >
            {item.label}
          </button>
        ))}
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{
            background: colors.inputBg,
            color: colors.text,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: '10px',
            padding: '0.4rem 0.65rem',
            fontWeight: 700
          }}
        >
          <option value="">כל החודשים</option>
          {months.map((key) => (
            <option key={key} value={key}>{key}</option>
          ))}
        </select>
        <span style={{ position: 'relative', flex: '1 1 180px' }}>
          <Search size={14} color={colors.muted} style={{ position: 'absolute', right: 10, top: 11 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="שם אורח / סיומת כרטיס"
            style={{
              width: '100%',
              background: colors.inputBg,
              color: colors.text,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '10px',
              padding: '0.45rem 2rem 0.45rem 0.7rem',
              fontWeight: 500
            }}
          />
        </span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '14px', border: `1px solid ${colors.cardBorder}` }}>
        {view === 'matched' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: isLight ? '#F1F5F9' : '#111827', color: colors.muted }}>
                {['אורח', 'מתחם', 'שהייה', 'אשראי בדוח', 'חשבון סליקה / אסמכתה', 'פער ימים', 'ביטחון'].map((label) => (
                  <th key={label} style={{ textAlign: 'right', padding: '0.65rem', fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMatches.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '1rem', color: colors.muted }}>אין התאמות בתצוגה.</td></tr>
              ) : filteredMatches.map((row) => (
                <tr key={row.collectionId} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{row.collection.guestName || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{row.collection.property}</td>
                  <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDate(row.collection.stayDate)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{formatIlsMoney(row.amount)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', color: colors.muted }}>
                    {row.txs.map((tx) => {
                      const line = maxClearingLine(tx);
                      return (
                        <div key={tx.key}>
                          {formatIlsMoney(tx.gross)} · {line.line}
                          {tx.brand ? ` · ${tx.brand} ${tx.cardLast4 || ''}` : ''}
                          {tx.depositDate ? ` · הפקדה ${formatHeDay(tx.depositDate)}` : ''}
                          {row.kind === 'pair' ? ' · פיצול כרטיסים' : ''}
                        </div>
                      );
                    })}
                  </td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{row.dateDelta}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800, color: row.confidence === 'high' ? '#34D399' : (row.confidence === 'medium' ? '#FBBF24' : '#F87171') }}>
                    {confidenceLabel(row.confidence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'collection' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: isLight ? '#F1F5F9' : '#111827', color: colors.muted }}>
                {['אורח', 'מתחם', 'שהייה', 'אשראי משוער', 'אמצעי', 'הערות'].map((label) => (
                  <th key={label} style={{ textAlign: 'right', padding: '0.65rem', fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCollection.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '1rem', color: colors.muted }}>אין שורות עם נתונים חסרים בתצוגה.</td></tr>
              ) : filteredCollection.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{row.guestName || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{row.property}</td>
                  <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDate(row.stayDate)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800, color: '#FBBF24' }}>{formatIlsMoney(row.creditAmount)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', color: colors.muted }}>{(row.methods || []).join(', ')}</td>
                  <td style={{ padding: '0.55rem 0.65rem', color: colors.muted, maxWidth: '280px' }}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'max' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: isLight ? '#F1F5F9' : '#111827', color: colors.muted }}>
                {['הפקדה', 'זיכוי', 'מותג', 'כרטיס', 'חשבון סליקה', 'אסמכתה', 'ברוטו', 'סטטוס'].map((label) => (
                  <th key={label} style={{ textAlign: 'right', padding: '0.65rem', fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMax.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '1rem', color: colors.muted }}>אין עסקאות מקס בלי שורת דוח בתצוגה.</td></tr>
              ) : filteredMax.slice(0, 300).map((tx) => (
                <tr key={tx.key} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                  <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDay(tx.depositDate)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDay(tx.creditDate)}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{tx.brand}</td>
                  <td style={{ padding: '0.55rem 0.65rem' }}>{tx.cardLast4}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700 }}>{CLEARING_ACCOUNTS.MAX.label}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{maxClearingLine(tx).ref || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{formatIlsMoney(tx.gross)}</td>
                  <td style={{ padding: '0.55rem 0.65rem', color: colors.muted }}>
                    {isFollowOnInstallment(tx) ? `תשלום המשך ${tx.installment}` : 'לא נמצא בדוח'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
