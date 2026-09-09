import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Search } from 'lucide-react';
import {
  availableMonths,
  filterMaxCredits,
  formatHeDay,
  formatIlsMoney,
  loadMaxCredits,
  monthLabel,
  summarizeMaxCredits
} from '../lib/maxCredits';
import { CLEARING_ACCOUNTS, maxClearingLine } from '../lib/clearingPayments';

export default function MaxCreditsBoard({ theme = 'dark' }) {
  const isLight = theme === 'light';
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState('');
  const [brand, setBrand] = useState('');
  const [query, setQuery] = useState('');

  const colors = {
    cardBg: isLight ? '#F8FAFC' : '#1E293B',
    cardBorder: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
    text: isLight ? '#0F172A' : '#F8FAFC',
    muted: isLight ? '#64748B' : '#94A3B8',
    inputBg: isLight ? '#FFFFFF' : '#0B1220'
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadMaxCredits();
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled) setError('לא נמצא דוח זיכויים של מקס.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rows = payload?.rows || [];
  const months = useMemo(() => availableMonths(rows), [rows]);
  const filtered = useMemo(
    () => filterMaxCredits(rows, { month, brand, query }),
    [rows, month, brand, query]
  );
  const summary = useMemo(() => summarizeMaxCredits(filtered), [filtered]);

  const selectStyle = {
    background: colors.inputBg,
    color: colors.text,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: '10px',
    padding: '0.5rem 0.7rem',
    fontWeight: 700,
    fontSize: '0.85rem'
  };
  const cardStyle = {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: '16px',
    padding: '1rem'
  };

  if (error) {
    return (
      <div style={{ margin: '1.1rem 0', color: colors.muted, fontSize: '0.85rem' }}>{error}</div>
    );
  }
  if (!payload) return null;

  return (
    <div style={{ margin: '1.1rem 0 1.4rem', color: colors.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>זיכויי מקס</h2>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: colors.muted }}>
          חשבון סליקה {CLEARING_ACCOUNTS.MAX.label} · {payload.merchantName} · {rows.length.toLocaleString('he-IL')} עסקאות
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>ברוטו בתצוגה</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900 }}>{formatIlsMoney(summary.gross)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>נטו אחרי עמלה</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900, color: '#34D399' }}>{formatIlsMoney(summary.net)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>עמלות</span>
            <CreditCard size={16} color="#818CF8" />
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900 }}>{formatIlsMoney(summary.fee)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>עסקאות</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900 }}>{summary.count.toLocaleString('he-IL')}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
          <option value="">כל חודשי הזיכוי</option>
          {months.map((key) => (
            <option key={key} value={key}>{monthLabel(key)}</option>
          ))}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
          <option value="">ויזה + מאסטרקארד</option>
          <option value="ויזה">ויזה</option>
          <option value="מאסטרקארד">מאסטרקארד</option>
        </select>
        <span style={{ position: 'relative' }}>
          <Search size={14} color={colors.muted} style={{ position: 'absolute', right: 10, top: 12 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="סיומת כרטיס / ריכוז"
            style={{ ...selectStyle, width: '100%', paddingRight: '2rem', fontWeight: 500 }}
          />
        </span>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '14px', border: `1px solid ${colors.cardBorder}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1040px', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: isLight ? '#F1F5F9' : '#111827', color: colors.muted }}>
              {['זיכוי', 'הפקדה', 'מותג', 'כרטיס', 'חשבון סליקה', 'אסמכתה', 'תשלום', 'ברוטו', 'נטו', 'עמלה'].map((label) => (
                <th key={label} style={{ textAlign: 'right', padding: '0.65rem', fontWeight: 800 }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 250).map((row, index) => (
              <tr key={`${row.batchId}-${row.cardLast4}-${row.creditDate}-${row.installment}-${index}`} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDay(row.creditDate)}</td>
                <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{formatHeDay(row.depositDate)}</td>
                <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700 }}>{row.brand}</td>
                <td style={{ padding: '0.55rem 0.65rem' }}>{row.cardLast4}</td>
                <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700 }}>{CLEARING_ACCOUNTS.MAX.label}</td>
                <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{maxClearingLine(row).ref || '—'}</td>
                <td style={{ padding: '0.55rem 0.65rem', color: colors.muted }}>{row.installment || ''}</td>
                <td style={{ padding: '0.55rem 0.65rem' }}>{formatIlsMoney(row.gross)}</td>
                <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800, color: '#34D399' }}>{formatIlsMoney(row.net)}</td>
                <td style={{ padding: '0.55rem 0.65rem', color: colors.muted }}>{formatIlsMoney(row.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 250 && (
        <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: colors.muted }}>
          מוצגות 250 שורות ראשונות מתוך {filtered.length.toLocaleString('he-IL')}. צמצמו לפי חודש כדי לראות הכול.
        </div>
      )}
    </div>
  );
}
