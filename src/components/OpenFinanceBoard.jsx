import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CreditCard, RefreshCw } from 'lucide-react';
import { fetchFinanceOverview, fetchFinanceTransactions, refreshFinanceConnections } from '../lib/openFinanceApi';

const PROVIDER_LABELS = {
  mizrahi: 'מזרחי טפחות',
  discount: 'דיסקונט',
  beinleumi: 'הבינלאומי',
  max: 'מקס',
  hapoalim: 'הפועלים',
  leumi: 'לאומי',
  cal: 'כאל'
};

const STATUS_LABELS = {
  ACTIVE: 'פעיל',
  CONNECTED: 'מחובר',
  COMPLETED: 'חד-פעמי',
  FETCHING: 'בסנכרון',
  INACTIVE: 'ממתין',
  EXPIRED: 'פג תוקף',
  REVOKED: 'בוטל',
  CREDENTIALS_ERROR: 'שגיאת כניסה',
  FETCHING_ERROR: 'שגיאת סנכרון',
  ERROR: 'שגיאה'
};

const TYPE_LABELS = {
  CHECKING: 'עו״ש',
  CARD: 'אשראי',
  LOAN: 'הלוואה',
  SAVINGS: 'חיסכון',
  SECURITY: 'ני״ע'
};

function providerLabel(id) {
  return PROVIDER_LABELS[id] || id || 'בנק';
}

function statusTone(status) {
  if (status === 'ACTIVE' || status === 'CONNECTED' || status === 'COMPLETED') {
    return { color: '#34D399', bg: 'rgba(16,185,129,0.14)' };
  }
  if (status === 'FETCHING' || status === 'INACTIVE') {
    return { color: '#FBBF24', bg: 'rgba(245,158,11,0.14)' };
  }
  return { color: '#F87171', bg: 'rgba(239,68,68,0.14)' };
}

function formatMoney(amount, currency = 'ILS') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const n = Number(amount);
  const formatted = n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (currency === 'USD') return `$${formatted}`;
  if (currency === 'EUR') return `€${formatted}`;
  return `₪${formatted}`;
}

function accountNumberLabel(account) {
  const parsed = account.parsedAccount;
  if (parsed?.bank && parsed?.branch && parsed?.number) {
    return `${parsed.bank}-${parsed.branch}-${parsed.number}`;
  }
  return account.accountNumber || '';
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function OpenFinanceBoard({ theme = 'dark' }) {
  const isLight = theme === 'light';
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const colors = {
    cardBg: isLight ? '#F8FAFC' : '#1E293B',
    cardBorder: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
    text: isLight ? '#0F172A' : '#F8FAFC',
    muted: isLight ? '#64748B' : '#94A3B8',
    inputBg: isLight ? '#FFFFFF' : '#0B1220'
  };

  async function loadAll(selectedAccount = accountId) {
    setError('');
    setLoading(true);
    try {
      let nextOverview = null;
      let txItems = [];
      try {
        nextOverview = await fetchFinanceOverview();
      } catch (err) {
        setError(err.status === 503
          ? 'Open Finance עדיין לא מוגדר בשרת.'
          : (err.body?.error || err.message || 'לא הצלחתי לטעון את חשבונות הבנק.'));
      }
      try {
        const tx = await fetchFinanceTransactions({
          dateFrom: isoDaysAgo(30),
          dateTo: todayIso(),
          accountId: selectedAccount || undefined,
          limit: 40
        });
        txItems = tx.items || [];
      } catch {
        txItems = [];
      }
      setOverview(nextOverview);
      setTransactions(txItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checking = useMemo(
    () => (overview?.accounts || []).filter((row) => row.accountType === 'CHECKING'),
    [overview]
  );
  const cards = useMemo(
    () => (overview?.accounts || []).filter((row) => row.accountType === 'CARD'),
    [overview]
  );
  const loans = useMemo(
    () => (overview?.accounts || []).filter((row) => row.accountType === 'LOAN'),
    [overview]
  );

  async function onRefresh() {
    setRefreshing(true);
    setError('');
    try {
      await refreshFinanceConnections();
      await loadAll(accountId);
    } catch (err) {
      setError(err.body?.error || err.message || 'רענון הבנקים נכשל.');
    } finally {
      setRefreshing(false);
    }
  }

  async function onPickAccount(nextId) {
    setAccountId(nextId);
    setLoading(true);
    setError('');
    try {
      const tx = await fetchFinanceTransactions({
        dateFrom: isoDaysAgo(30),
        dateTo: todayIso(),
        accountId: nextId || undefined,
        limit: 40
      });
      setTransactions(tx.items || []);
    } catch (err) {
      setError(err.body?.error || err.message || 'לא הצלחתי לטעון תנועות.');
    } finally {
      setLoading(false);
    }
  }

  const cardStyle = {
    background: colors.cardBg,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: '16px',
    padding: '1rem'
  };

  return (
    <div style={{
      marginBottom: '1.1rem',
      color: colors.text,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>חשבונות בנק חיים</h2>
          <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: colors.muted }}>
            Open Finance · יתרות ותנועות מחוברות
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            border: 'none',
            borderRadius: '10px',
            padding: '0.55rem 0.85rem',
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            color: '#fff',
            fontWeight: 800,
            cursor: refreshing ? 'wait' : 'pointer',
            fontSize: '0.82rem'
          }}
        >
          <RefreshCw size={15} />
          {refreshing ? 'מרענן…' : 'רענון מהבנקים'}
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: '0.85rem',
          padding: '0.7rem 0.85rem',
          borderRadius: '10px',
          background: 'rgba(239,68,68,0.12)',
          color: '#FCA5A5',
          fontSize: '0.85rem',
          fontWeight: 700,
          display: 'flex',
          gap: '0.45rem',
          alignItems: 'center'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
        {(overview?.connections || []).map((connection) => {
          const tone = statusTone(connection.status);
          return (
            <div key={connection.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <strong>{providerLabel(connection.providerId)}</strong>
                <span style={{
                  background: tone.bg,
                  color: tone.color,
                  borderRadius: '999px',
                  padding: '0.12rem 0.5rem',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  {STATUS_LABELS[connection.status] || connection.status}
                </span>
              </div>
              <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: colors.muted }}>
                {connection.accounts} עו״ש · {connection.cards} כרטיסים
                {connection.customerId ? ` · ח.פ/ת.ז ${connection.customerId}` : ''}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
        {checking.map((account) => (
          <div key={account.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>{providerLabel(account.providerId)} · עו״ש</span>
              <Building2 size={16} color="#34D399" />
            </div>
            <div style={{ marginTop: '0.4rem', fontWeight: 900, fontSize: '1.35rem' }}>
              {formatMoney(account.displayBalance?.amount, account.displayBalance?.currency)}
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: colors.muted }}>
              {accountNumberLabel(account)} · {account.accountName}
            </div>
          </div>
        ))}
        {cards.map((account) => (
          <div key={account.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>{account.accountName || 'כרטיס'}</span>
              <CreditCard size={16} color="#818CF8" />
            </div>
            <div style={{ marginTop: '0.4rem', fontWeight: 900, fontSize: '1.2rem' }}>
              {formatMoney(account.displayBalance?.amount, account.displayBalance?.currency || 'ILS')}
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: colors.muted }}>
              {account.accountNumber} · {account.ownerName}
            </div>
          </div>
        ))}
        {loans.map((account) => (
          <div key={account.id} style={cardStyle}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: colors.muted }}>
              {providerLabel(account.providerId)} · הלוואה
            </div>
            <div style={{ marginTop: '0.4rem', fontWeight: 900, fontSize: '1.2rem' }}>
              {formatMoney(account.displayBalance?.amount, account.displayBalance?.currency)}
            </div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: colors.muted }}>
              {account.accountName}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...cardStyle, padding: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <strong>תנועות אחרונות (30 יום)</strong>
          <select
            value={accountId}
            onChange={(e) => onPickAccount(e.target.value)}
            style={{
              background: colors.inputBg,
              color: colors.text,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: '10px',
              padding: '0.45rem 0.65rem',
              fontWeight: 700
            }}
          >
            <option value="">כל החשבונות</option>
            {(overview?.accounts || []).map((account) => (
              <option key={account.id} value={account.id}>
                {providerLabel(account.providerId)} · {TYPE_LABELS[account.accountType] || account.accountType} · {account.accountName || accountNumberLabel(account)}
              </option>
            ))}
          </select>
        </div>
        {loading && !overview ? (
          <div style={{ color: colors.muted, padding: '0.8rem 0' }}>טוען יתרות מהבנקים…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ color: colors.muted }}>
                  {['תאריך', 'בנק', 'תיאור', 'קטגוריה', 'סכום'].map((label) => (
                    <th key={label} style={{ textAlign: 'right', padding: '0.55rem 0.5rem', fontWeight: 800 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '0.9rem 0.5rem', color: colors.muted }}>
                      אין תנועות בחלון הזה. אם מקס / הבינלאומי עדיין בסנכרון, סיימו את החיבור ב-Financy ואז רעננו.
                    </td>
                  </tr>
                ) : transactions.map((tx) => (
                  <tr key={tx.id || tx.SK} style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                    <td style={{ padding: '0.55rem 0.5rem', whiteSpace: 'nowrap' }}>
                      {tx.transactionDate ? new Date(`${tx.transactionDate}T12:00:00`).toLocaleDateString('he-IL') : '—'}
                    </td>
                    <td style={{ padding: '0.55rem 0.5rem', fontWeight: 700 }}>{providerLabel(tx.providerId)}</td>
                    <td style={{ padding: '0.55rem 0.5rem' }}>{tx.merchantName || tx.description || '—'}</td>
                    <td style={{ padding: '0.55rem 0.5rem', color: colors.muted }}>{tx.subcategory || tx.category || ''}</td>
                    <td style={{
                      padding: '0.55rem 0.5rem',
                      fontWeight: 800,
                      color: Number(tx.amount) < 0 ? '#F87171' : '#34D399',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatMoney(tx.amount, tx.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
