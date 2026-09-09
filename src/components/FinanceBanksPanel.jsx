import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, CreditCard, RefreshCw, TrendingUp } from 'lucide-react';
import { israelToday } from '../lib/cabinAccess';
import { fetchFinanceOverview, fetchFinanceTransactions, refreshFinanceConnections, scrapeLiveBanks, fetchBankScrapeStatus, submitBankScrapeOtp, syncHypPayments } from '../lib/openFinanceApi';
import {
  accountNumberLabel,
  addDaysIso,
  buildCashFlowForecast,
  checkingBalance,
  formatMoney,
  providerLabel
} from '../lib/cashFlowForecast';
import { formatHeDay, monthLabel } from '../lib/maxCredits';
import {
  beinleumiCategoryLabel,
  beinleumiMonths,
  filterBeinleumiRows,
  mergeFinanceOverview,
  mergeFinanceTransactions,
  summarizeBeinleumi
} from '../lib/beinleumiStatement';
import { BEINLEUMI_ACCOUNT, CLEARING_ACCOUNTS } from '../lib/clearingPayments';

const STATUS_LABELS = {
  ACTIVE: 'פעיל',
  CONNECTED: 'מחובר',
  FETCHING: 'בסנכרון',
  EXPIRED: 'פג תוקף',
  CREDENTIALS_ERROR: 'שגיאת כניסה'
};

function statusTone(status) {
  if (status === 'ACTIVE' || status === 'CONNECTED' || status === 'COMPLETED') {
    return { color: '#34D399', bg: 'rgba(16,185,129,0.14)' };
  }
  if (status === 'FETCHING' || status === 'INACTIVE') {
    return { color: '#FBBF24', bg: 'rgba(245,158,11,0.14)' };
  }
  return { color: '#F87171', bg: 'rgba(239,68,68,0.14)' };
}

export default function FinanceBanksPanel({
  theme = 'dark',
  styles,
  maxCredits = [],
  collectionRows = [],
  beinleumiStatement = null,
  overview: overviewProp = null,
  transactions: transactionsProp = null,
  onStatementSynced,
  onHypSynced
}) {
  const isLight = theme === 'light';
  const today = israelToday();
  const [overviewLocal, setOverviewLocal] = useState(null);
  const [transactionsLocal, setTransactionsLocal] = useState([]);
  const [targetDate, setTargetDate] = useState(() => addDaysIso(today, 14));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [month, setMonth] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  const overview = overviewLocal || overviewProp;
  const transactions = useMemo(() => {
    const source = transactionsLocal.length ? transactionsLocal : (transactionsProp || []);
    const from = addDaysIso(today, -21);
    return source
      .filter((tx) => String(tx.transactionDate || tx.bookingDate || '').slice(0, 10) >= from)
      .slice(0, 40);
  }, [transactionsProp, transactionsLocal, today]);

  async function load({ force = false } = {}) {
    if (!force && overviewProp && Array.isArray(transactionsProp) && transactionsProp.length) {
      setLoading(false);
      return;
    }
    setError('');
    setLoading(true);
    try {
      let nextOverview = null;
      let txItems = [];
      try {
        nextOverview = await fetchFinanceOverview();
      } catch (err) {
        setError(err.status === 401
          ? 'צריך להתחבר כמנהל כדי לראות את הבנקים.'
          : (err.body?.error || err.message || 'לא הצלחתי לטעון את הבנקים.'));
      }
      try {
        const tx = await fetchFinanceTransactions({ dateFrom: addDaysIso(today, -21), dateTo: today, limit: 40 });
        txItems = tx.items || [];
      } catch {
        txItems = [];
      }
      setOverviewLocal(nextOverview);
      setTransactionsLocal(txItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (overviewProp && Array.isArray(transactionsProp) && transactionsProp.length) {
      setLoading(false);
      return undefined;
    }
    load();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewProp, transactionsProp]);

  const mergedOverview = useMemo(
    () => mergeFinanceOverview(overview, beinleumiStatement),
    [overview, beinleumiStatement]
  );
  const mergedTransactions = useMemo(
    () => mergeFinanceTransactions(transactions, beinleumiStatement, {
      dateFrom: addDaysIso(today, -21),
      dateTo: today,
      limit: 40
    }),
    [transactions, beinleumiStatement, today]
  );

  const forecast = useMemo(
    () => buildCashFlowForecast({
      today,
      targetDate: targetDate < today ? today : targetDate,
      accounts: mergedOverview?.accounts || [],
      maxCredits,
      collectionRows
    }),
    [today, targetDate, mergedOverview, maxCredits, collectionRows]
  );

  const beinleumiRows = beinleumiStatement?.rows || [];
  const beinleumiFiltered = useMemo(
    () => filterBeinleumiRows(beinleumiRows, { month, category, query }),
    [beinleumiRows, month, category, query]
  );
  const beinleumiSummary = useMemo(() => summarizeBeinleumi(beinleumiFiltered), [beinleumiFiltered]);
  const months = useMemo(() => beinleumiMonths(beinleumiRows), [beinleumiRows]);

  const selected = forecast.days.find((day) => day.date === targetDate) || forecast.selected;
  const checking = forecast.checking;
  const cards = (mergedOverview?.accounts || []).filter((account) => account.accountType === 'CARD');
  const liveConnections = (mergedOverview?.connections || []).filter((row) => (
    row.source !== 'manual-pdf' && (row.status === 'ACTIVE' || row.status === 'CONNECTED')
  ));
  const liveDataBlocked = Boolean(overview?.accountsError)
    || (liveConnections.length > 0 && !(overview?.accounts || []).some((account) => account.source !== 'manual-pdf'));

  const cardStyle = {
    background: styles.cardBg,
    border: `1px solid ${styles.cardBorder}`,
    borderRadius: '16px',
    padding: '1rem',
    boxShadow: styles.shadow
  };

  async function onRefresh() {
    setRefreshing(true);
    setOtpNeeded(false);
    setOtpCode('');
    setError('');
    const poll = setInterval(async () => {
      try {
        const status = await fetchBankScrapeStatus();
        if (status.pendingOtp) setOtpNeeded(true);
      } catch {
        /* status is optional while Open Finance-only refresh runs */
      }
    }, 2000);
    try {
      try {
        await refreshFinanceConnections();
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw err;
      }
      try {
        await syncHypPayments();
        if (typeof onHypSynced === 'function') await onHypSynced();
      } catch (err) {
        if (err.status === 401 || err.status === 403) throw err;
        setError(err.body?.error || err.message || 'משיכת Hyp נכשלה.');
      }
      await scrapeLiveBanks();
      if (typeof onStatementSynced === 'function') await onStatementSynced();
      await load({ force: true });
    } catch (err) {
      const code = err.body?.error || err.message || '';
      if (code === 'BANK_SCRAPER_NOT_CONFIGURED') {
        setError('רענון Open Finance הסתיים, אבל כניסה חיה לבנק עדיין לא מוגדרת בשרת (.env).');
      } else if (code === 'OTP_TIMEOUT') {
        setError('הבנק חיכה לקוד SMS ולא קיבלתי אותו בזמן. נסו שוב והזינו את הקוד כאן.');
      } else {
        setError(err.body?.error || err.message || 'רענון הבנקים נכשל.');
      }
    } finally {
      clearInterval(poll);
      setRefreshing(false);
      setOtpNeeded(false);
    }
  }

  async function onSubmitOtp(event) {
    event.preventDefault();
    if (!otpCode.trim()) return;
    await submitBankScrapeOtp(otpCode.trim());
    setOtpCode('');
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>בנקים ותזרים</h2>
          <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: styles.textMuted }}>
            יתרות חיות, תנועות אחרונות, ותחזית יתרה ליום שנבחר לפי זיכויים, חיובים והעברות
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            border: 'none', borderRadius: '10px', padding: '0.55rem 0.85rem',
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)', color: '#fff',
            fontWeight: 800, cursor: refreshing ? 'wait' : 'pointer', fontSize: '0.82rem'
          }}
        >
          <RefreshCw size={15} /> {refreshing ? 'מתחבר לבנק…' : 'רענון מהבנקים'}
        </button>
      </div>

      {otpNeeded && (
        <form onSubmit={onSubmitOtp} style={{
          marginBottom: '0.85rem', padding: '0.75rem 0.85rem', borderRadius: '10px',
          background: 'rgba(99,102,241,0.12)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap'
        }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem' }}>
            קוד SMS {refreshing ? 'מהבנק/מקס' : ''} — בקשו מהבעלים ושלחו כאן
          </div>
          <input
            value={otpCode}
            onChange={(event) => setOtpCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 ספרות"
            style={{
              border: `1px solid ${styles.cardBorder}`, borderRadius: '8px', padding: '0.4rem 0.6rem',
              background: styles.inputBg || 'transparent', color: 'inherit', width: '8rem'
            }}
          />
          <button type="submit" style={{
            border: 'none', borderRadius: '8px', padding: '0.4rem 0.7rem',
            background: '#4F46E5', color: '#fff', fontWeight: 800, cursor: 'pointer'
          }}>
            שליחה
          </button>
        </form>
      )}

      {error && (
        <div style={{
          marginBottom: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: '10px',
          background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', fontWeight: 700,
          display: 'flex', gap: '0.45rem', alignItems: 'center'
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {liveDataBlocked ? (
        <div style={{
          marginBottom: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: '10px',
          background: 'rgba(245,158,11,0.12)', color: '#FBBF24', fontWeight: 700, fontSize: '0.85rem'
        }}>
          {liveConnections.map((row) => providerLabel(row.providerId)).join(' · ') || 'הבנקים'}
          {' מחוברים ב-Open Finance ולא נמחקו. '}
          המכסה לחשבונות עסקיים חוסמת יתרות ותנועות של כולם — כולל מזרחי ודיסקונט.
          {' הבינלאומי מוצג בינתיים מהדוח הידני.'}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>יתרת עו״ש עכשיו</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.45rem', fontWeight: 900, color: '#34D399' }}>{formatMoney(forecast.opening)}</div>
        </div>
        <div style={{ ...cardStyle, border: '1.5px solid #818CF8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#C4B5FD' }}>תחזית ליום שנבחר</span>
            <TrendingUp size={16} color="#818CF8" />
          </div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.45rem', fontWeight: 900 }}>{formatMoney(selected?.balance)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>זיכויי מקס בדרך</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900, color: '#34D399' }}>+{formatMoney(forecast.totals.credits)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>חיוב כרטיסים</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900, color: '#F87171' }}>{formatMoney(forecast.totals.charges)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>העברות צפויות</div>
          <div style={{ marginTop: '0.4rem', fontSize: '1.25rem', fontWeight: 900 }}>{formatMoney(forecast.totals.transfers)}</div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 800, color: styles.textMuted }}>
            בחר יום לתחזית
            <input
              type="date"
              min={today}
              max={addDaysIso(today, 90)}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value || addDaysIso(today, 14))}
              style={{
                background: styles.inputBg, color: styles.textPrimary,
                border: `1px solid ${styles.cardBorder}`, borderRadius: '10px',
                padding: '0.55rem 0.7rem', fontWeight: 800
              }}
            />
          </label>
          <div style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>
            ב־<strong>{formatHeDay(targetDate)}</strong> היתרה החזויה היא{' '}
            <strong style={{ color: (selected?.balance || 0) >= 0 ? '#34D399' : '#F87171' }}>{formatMoney(selected?.balance)}</strong>
            {' '}מול {formatMoney(forecast.opening)} היום.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginTop: '0.85rem' }}>
          <div>זיכויים עד אז: <strong style={{ color: '#34D399' }}>+{formatMoney(forecast.totals.credits)}</strong></div>
          <div>חיובים עד אז: <strong style={{ color: '#F87171' }}>{formatMoney(forecast.totals.charges)}</strong></div>
          <div>העברות עד אז: <strong>{formatMoney(forecast.totals.transfers)}</strong></div>
        </div>
        <div style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: styles.textMuted }}>
                {['תאריך', 'סוג', 'פירוט', 'סכום', 'יתרה אחרי'].map((label) => (
                  <th key={label} style={{ textAlign: 'right', padding: '0.45rem', fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecast.events.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '0.8rem 0.45rem', color: styles.textMuted }}>אין זיכויים, חיובים או העברות צפויים עד היום הזה.</td></tr>
              ) : forecast.days.filter((day) => day.events.length).map((day) => (
                day.events.map((event, index) => (
                  <tr key={event.id} style={{ borderTop: `1px solid ${styles.cardBorder}`, background: day.date === targetDate ? 'rgba(99,102,241,0.08)' : 'transparent' }}>
                    <td style={{ padding: '0.5rem 0.45rem', whiteSpace: 'nowrap' }}>{index === 0 ? formatHeDay(day.date) : ''}</td>
                    <td style={{ padding: '0.5rem 0.45rem', fontWeight: 800 }}>
                      {event.type === 'credit' ? 'זיכוי' : event.type === 'charge' ? 'חיוב' : 'העברה'}
                    </td>
                    <td style={{ padding: '0.5rem 0.45rem' }}>{event.label}</td>
                    <td style={{ padding: '0.5rem 0.45rem', fontWeight: 800, color: event.amount >= 0 ? '#34D399' : '#F87171' }}>
                      {formatMoney(event.amount)}
                    </td>
                    <td style={{ padding: '0.5rem 0.45rem', fontWeight: 800 }}>{index === day.events.length - 1 ? formatMoney(day.balance) : ''}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {checking.map((account) => (
          <div key={account.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>{providerLabel(account.providerId)} · עו״ש</span>
              <Building2 size={16} color="#34D399" />
            </div>
            <div style={{ marginTop: '0.4rem', fontWeight: 900, fontSize: '1.3rem' }}>{formatMoney(checkingBalance(account), account.displayBalance?.currency)}</div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: styles.textMuted }}>{accountNumberLabel(account)}</div>
            {account.source === 'manual-pdf' ? (
              <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: styles.textMuted }}>דוח ידני עד {formatHeDay(account.displayBalance?.referenceDate)}</div>
            ) : null}
          </div>
        ))}
        {cards.map((account) => (
          <div key={account.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: styles.textMuted }}>{account.accountName || 'כרטיס'}</span>
              <CreditCard size={16} color="#818CF8" />
            </div>
            <div style={{ marginTop: '0.4rem', fontWeight: 900, fontSize: '1.15rem' }}>{formatMoney(account.displayBalance?.amount, 'ILS')}</div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: styles.textMuted }}>
              {account.accountNumber}{account.ownerName ? ` · ${account.ownerName}` : ''}
            </div>
            {account.displayBalance?.referenceDate ? (
              <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: styles.textMuted }}>
                חיוב קרוב {formatHeDay(account.displayBalance.referenceDate)}
              </div>
            ) : null}
          </div>
        ))}
        {(mergedOverview?.connections || [])
          .slice()
          .sort((a, b) => {
            const order = { mizrahi: 0, discount: 1, beinleumi: 2 };
            return (order[a.providerId] ?? 9) - (order[b.providerId] ?? 9);
          })
          .map((connection) => {
          const tone = statusTone(connection.status);
          return (
            <div key={connection.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{providerLabel(connection.providerId)}</strong>
                <span style={{ background: tone.bg, color: tone.color, borderRadius: '999px', padding: '0.12rem 0.5rem', fontSize: '0.72rem', fontWeight: 800 }}>
                  {connection.source === 'manual-pdf' ? 'דוח ידני' : (STATUS_LABELS[connection.status] || connection.status)}
                </span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: styles.textMuted }}>
                {connection.accounts} עו״ש · {connection.cards} כרטיסים
                {connection.lastFetchedDataDate ? ` · עדכון ${formatHeDay(connection.lastFetchedDataDate)}` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {beinleumiStatement?.cardsSummary && (
        <div style={{ ...cardStyle, marginBottom: '1rem' }}>
          <strong>כרטיסים בחשבון הבינלאומי 31-92-{beinleumiStatement.accountNumber}</strong>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: styles.textMuted }}>
            {(beinleumiStatement.cardsSummary.cards || []).map((card) => `${card.label} ${card.last4}`).join(' · ')}
            {' · '}דוח ידני {formatHeDay(beinleumiStatement.cardsSummary.asOf)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: styles.textMuted }}>חיוב קרוב {formatHeDay(beinleumiStatement.cardsSummary.nextDebitDate)}</div>
              <div style={{ marginTop: '0.25rem', fontWeight: 900, fontSize: '1.1rem', color: '#F87171' }}>{formatMoney(beinleumiStatement.cardsSummary.upcomingCharges)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: styles.textMuted }}>התחייבויות עתידיות</div>
              <div style={{ marginTop: '0.25rem', fontWeight: 900, fontSize: '1.1rem' }}>{formatMoney(beinleumiStatement.cardsSummary.futureCommitments)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: styles.textMuted }}>חיוב קודם (כבר ירד ב־16/8)</div>
              <div style={{ marginTop: '0.25rem', fontWeight: 900, fontSize: '1.1rem' }}>{formatMoney(beinleumiStatement.cardsSummary.previousCharges)}</div>
            </div>
          </div>
        </div>
      )}

      <div style={cardStyle}>
        <strong>תנועות אחרונות בחשבונות</strong>
        <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '680px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: styles.textMuted }}>
                {['תאריך', 'חשבון', 'תיאור', 'אסמכתה', 'סכום'].map((label) => (
                  <th key={label} style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 800 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !overview && !beinleumiStatement ? (
                <tr><td colSpan={5} style={{ padding: '0.9rem', color: styles.textMuted }}>טוען תנועות…</td></tr>
              ) : mergedTransactions.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '0.9rem', color: styles.textMuted }}>אין תנועות ב־21 הימים האחרונים.</td></tr>
              ) : mergedTransactions.map((tx) => (
                <tr key={tx.id || tx.SK} style={{ borderTop: `1px solid ${styles.cardBorder}` }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{tx.transactionDate ? formatHeDay(tx.transactionDate) : '—'}</td>
                  <td style={{ padding: '0.5rem', fontWeight: 700 }}>
                    {tx.providerId === 'beinleumi' ? CLEARING_ACCOUNTS.BEINLEUMI.label : providerLabel(tx.providerId)}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{tx.merchantName || tx.description || '—'}</td>
                  <td style={{ padding: '0.5rem', fontWeight: 800 }}>{tx.reference || '—'}</td>
                  <td style={{ padding: '0.5rem', fontWeight: 800, color: Number(tx.amount) < 0 ? '#F87171' : '#34D399', whiteSpace: 'nowrap' }}>
                    {formatMoney(tx.amount, tx.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {beinleumiStatement ? (
        <div style={{ ...cardStyle, marginTop: '1rem' }}>
          <strong>תנועות בינלאומי · חח״ד 31-92-{beinleumiStatement.accountNumber}</strong>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: styles.textMuted }}>
            דוח ידני {formatHeDay(beinleumiStatement.from)}–{formatHeDay(beinleumiStatement.to)} · {beinleumiStatement.count} תנועות · יתרה {formatMoney(beinleumiStatement.closingBalance)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.55rem', marginTop: '0.75rem' }}>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={{
              background: styles.inputBg, color: styles.textPrimary, border: `1px solid ${styles.cardBorder}`,
              borderRadius: '10px', padding: '0.5rem 0.7rem', fontWeight: 700, fontSize: '0.85rem'
            }}>
              <option value="">כל החודשים</option>
              {months.map((key) => (
                <option key={key} value={key}>{monthLabel(key)}</option>
              ))}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{
              background: styles.inputBg, color: styles.textPrimary, border: `1px solid ${styles.cardBorder}`,
              borderRadius: '10px', padding: '0.5rem 0.7rem', fontWeight: 700, fontSize: '0.85rem'
            }}>
              <option value="">כל הסוגים</option>
              {['credit', 'debit', 'fee', 'loan', 'card', 'payroll', 'transfer', 'masav', 'rent'].map((id) => (
                <option key={id} value={id}>{beinleumiCategoryLabel(id)}</option>
              ))}
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש תיאור / אסמכתא"
              style={{
                background: styles.inputBg, color: styles.textPrimary, border: `1px solid ${styles.cardBorder}`,
                borderRadius: '10px', padding: '0.5rem 0.7rem', fontWeight: 500, fontSize: '0.85rem'
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.55rem', marginTop: '0.75rem', fontSize: '0.82rem' }}>
            <div>{beinleumiSummary.count} שורות</div>
            <div>כניסות <strong style={{ color: '#34D399' }}>{formatMoney(beinleumiSummary.in)}</strong></div>
            <div>יציאות <strong style={{ color: '#F87171' }}>{formatMoney(beinleumiSummary.out)}</strong></div>
            <div>נטו <strong>{formatMoney(beinleumiSummary.net)}</strong></div>
          </div>
          <div style={{ overflowX: 'auto', marginTop: '0.7rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ color: styles.textMuted }}>
                  {['תאריך', 'סוג', 'חשבון', 'אסמכתה', 'תיאור', 'סכום', 'יתרה'].map((label) => (
                    <th key={label} style={{ textAlign: 'right', padding: '0.5rem', fontWeight: 800 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {beinleumiFiltered.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: '0.9rem', color: styles.textMuted }}>אין תנועות בסינון הזה.</td></tr>
                ) : beinleumiFiltered.slice().reverse().map((row) => (
                  <tr key={row.id} style={{ borderTop: `1px solid ${styles.cardBorder}` }}>
                    <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatHeDay(row.date)}</td>
                    <td style={{ padding: '0.5rem' }}>{beinleumiCategoryLabel(row.category)}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 700 }}>{`בינלאומי ${BEINLEUMI_ACCOUNT}`}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 800 }}>{row.reference || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>{row.description}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 800, color: row.amount < 0 ? '#F87171' : '#34D399', whiteSpace: 'nowrap' }}>
                      {formatMoney(row.amount)}
                    </td>
                    <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
