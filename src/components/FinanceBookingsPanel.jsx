import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Download, RefreshCw, Search, Upload } from 'lucide-react';
import {
  availableMonths,
  defaultMonthKey,
  resolveFinanceMonth,
  exportDailyCollectionCsv,
  filterCollectionRows,
  formatHeDate,
  formatIls,
  linkCollectionToBookings,
  monthLabel,
  parseDailyCollectionCsv,
  PROPERTY_ORDER,
  saveDailyCollection,
  sortCollectionRows
} from '../lib/dailyCollection';
import {
  buildCollectionLedger,
  buildStayIndex,
  cabinUnitLabel,
  collectionDisplayRows,
  bookingForFinanceRow,
  financeMismatchTotals,
  rowPaymentBreakdown,
  rowStayFacts,
  scaleBreakdown
} from '../lib/bookingFinance';
import { formatHypRefreshedAt } from '../lib/hypPayments';
import { syncHypPayments } from '../lib/openFinanceApi';
import { israelToday } from '../lib/cabinAccess';

const METHOD_TABS = [
  { id: 'credit', label: 'אשראי' },
  { id: 'cash', label: 'מזומן' },
  { id: 'transfer', label: 'העברה' },
  { id: 'check', label: 'צ׳ק' }
];

function selectedMonthRange(monthKey) {
  const key = monthKey || defaultMonthKey();
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return {};
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`
  };
}

function movementAccount(move) {
  if (move.merchantId) return `${move.accountLabel || 'סולק'} · מספר סולק ${move.merchantId}`;
  if (move.terminalId) return `${move.accountLabel || 'סולק'} · מסוף ${move.terminalId}`;
  return move.accountLabel || move.accountDetail || '—';
}

function PaymentTabs({
  breakdown,
  active,
  styles,
  onTab,
  onOpenLedger
}) {
  const view = breakdown[active] || { amount: 0, movements: [] };
  const amount = Number(view.amount) || 0;
  const movements = view.movements || [];
  const single = movements.length === 1 ? movements[0] : null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {METHOD_TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTab(tab.id)}
              style={{
                border: selected ? 'none' : `1px solid ${styles.cardBorder}`,
                borderRadius: '999px',
                padding: '0.18rem 0.5rem',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                background: selected ? '#4F46E5' : 'transparent',
                color: selected ? '#fff' : styles.textMuted
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontWeight: 900, fontSize: '0.95rem' }}>
        {amount ? formatIls(amount) : '—'}
      </div>
      {movements.length ? (
        <button
          type="button"
          onClick={onOpenLedger}
          style={{
            marginTop: 3,
            border: 'none',
            background: 'transparent',
            color: '#818CF8',
            fontWeight: 800,
            fontSize: '0.7rem',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'right'
          }}
        >
          {movements.map((move) => (
            move.ref
              ? `אסמכתה ${move.ref}`
              : move.last4
                ? `כינורות ••••${move.last4}${move.date ? ` · ${move.date}` : ''}`
                : null
          )).filter(Boolean).join(' · ') || (movements.length ? `${movements.length} תנועות` : 'פרטי תנועה')}
        </button>
      ) : null}
    </div>
  );
}

export default function FinanceBookingsPanel({
  theme = 'dark',
  styles,
  setStore,
  allRows = [],
  bookings,
  units,
  bankMatch,
  hypPayload,
  bankRows,
  beinleumiStatement,
  onHypSynced
}) {
  const isLight = theme === 'light';
  const fileRef = useRef(null);
  const [month, setMonth] = useState(() => defaultMonthKey());
  const [monthTouched, setMonthTouched] = useState(false);
  const [property, setProperty] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [hypRefreshing, setHypRefreshing] = useState(false);
  const [tabByRow, setTabByRow] = useState({});
  const [ledger, setLedger] = useState(null);
  const [, startRowTab] = useTransition();

  const months = useMemo(() => {
    const fromHyp = [...new Set((hypPayload?.rows || []).map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))];
    return [...new Set([...availableMonths(allRows), ...fromHyp])].sort((a, b) => b.localeCompare(a));
  }, [allRows, hypPayload]);

  useEffect(() => {
    if (monthTouched) return;
    const next = resolveFinanceMonth(allRows, { todayKey: defaultMonthKey() });
    if (next && next !== month) setMonth(next);
  }, [allRows, months, month, monthTouched]);
  const properties = useMemo(() => {
    const seen = new Set(allRows.map((row) => row.property).filter(Boolean));
    return PROPERTY_ORDER.filter((name) => seen.has(name)).concat(
      [...seen].filter((name) => !PROPERTY_ORDER.includes(name)).sort((a, b) => a.localeCompare(b, 'he'))
    );
  }, [allRows]);

  const filtered = useMemo(
    () => sortCollectionRows(filterCollectionRows(allRows, { month, property, status, query })),
    [allRows, month, property, status, query]
  );
  const stayIndex = useMemo(() => buildStayIndex(bookings, units), [bookings, units]);
  const linked = useMemo(
    () => linkCollectionToBookings(filtered, bookings, units),
    [filtered, bookings, units]
  );
  const monthRows = useMemo(
    () => filterCollectionRows(allRows, { month, property }),
    [allRows, month, property]
  );
  const methodLedger = useMemo(
    () => buildCollectionLedger(monthRows, hypPayload, bankRows, { month, bankMatch }),
    [monthRows, hypPayload, bankRows, month, bankMatch]
  );
  const mismatches = useMemo(
    () => financeMismatchTotals(monthRows, bookings, units, bankMatch, hypPayload, {
      month,
      throughDate: israelToday()
    }),
    [monthRows, bookings, units, bankMatch, hypPayload, month]
  );
  const extras = useMemo(
    () => ({ bookings, units, stayIndex }),
    [bookings, units, stayIndex]
  );
  const displayRows = useMemo(
    () => collectionDisplayRows(filtered, linked, extras).map((item) => ({
      ...item,
      booking: item.booking || bookingForFinanceRow(item.row, linked, extras)
    })),
    [filtered, linked, extras]
  );
  const breakdowns = useMemo(() => {
    const map = {};
    for (const row of filtered) {
      map[row.id] = rowPaymentBreakdown(
        row,
        bookingForFinanceRow(row, linked, extras),
        bankMatch?.byCollectionId?.[row.id],
        extras
      );
    }
    return map;
  }, [filtered, linked, bankMatch, extras]);

  const selectStyle = {
    background: styles.inputBg,
    color: styles.textPrimary,
    border: `1px solid ${styles.cardBorder}`,
    borderRadius: '10px',
    padding: '0.5rem 0.7rem',
    fontSize: '0.85rem',
    fontWeight: 600
  };

  function applyImport(text, sourceName) {
    const parsed = parseDailyCollectionCsv(text, sourceName);
    if (!parsed.rows.length) {
      setNotice('לא נמצאו שורות בדוח. בדקו שהקובץ בפורמט של הדוח היומי.');
      return;
    }
    setStore(saveDailyCollection(parsed));
    setNotice(`יובאו ${parsed.rows.length} שורות מתוך ${sourceName}`);
  }

  async function onPickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    applyImport(await file.text(), file.name);
  }

  function downloadCsv() {
    const blob = new Blob([exportDailyCollectionCsv(allRows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daily-collection.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onRefreshHyp() {
    setHypRefreshing(true);
    setNotice('');
    try {
      const result = await syncHypPayments(selectedMonthRange(month));
      if (typeof onHypSynced === 'function') await onHypSynced();
      setNotice(`עודכנו ${result.count || 0} עסקאות Hyp משני המסופים · ₪${Number(result.sum || 0).toLocaleString('he-IL')}`);
    } catch (err) {
      setNotice(err.status === 503
        ? 'חסרים מפתחות Hyp בשרת. בדקו HYP_A_* ו-HYP_B_* ב-.env'
        : (err.body?.error || err.message || 'משיכת Hyp נכשלה.'));
    } finally {
      setHypRefreshing(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>הזמנות וגבייה</h2>
          <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: styles.textMuted }}>
            המספר הגדול הוא כסף שנכנס בפועל מ-Hyp ומהבנק. הטבלה נבנית מהדוח היומי ומהיומן — לא מסיסמאות המסוף לבד.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={onRefreshHyp} disabled={hypRefreshing} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            border: 'none', borderRadius: '10px', padding: '0.55rem 0.85rem',
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)', color: '#fff',
            fontWeight: 800, cursor: hypRefreshing ? 'wait' : 'pointer', fontSize: '0.82rem'
          }}>
            <RefreshCw size={15} /> {hypRefreshing ? 'מושך מ-Hyp…' : 'רענון Hyp לחודש הנבחר'}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            border: 'none', borderRadius: '10px', padding: '0.55rem 0.85rem',
            background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#fff',
            fontWeight: 800, cursor: 'pointer', fontSize: '0.82rem'
          }}>
            <Upload size={15} /> ייבוא CSV
          </button>
          <button type="button" onClick={downloadCsv} disabled={!allRows.length} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            border: `1px solid ${styles.cardBorder}`, borderRadius: '10px', padding: '0.55rem 0.85rem',
            background: styles.cardBg, color: styles.textPrimary,
            fontWeight: 700, cursor: allRows.length ? 'pointer' : 'not-allowed', fontSize: '0.82rem'
          }}>
            <Download size={15} /> ייצוא
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPickFile} />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.65rem',
        marginBottom: '0.9rem'
      }}>
        <div style={{
          background: isLight ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${isLight ? 'rgba(217, 119, 6, 0.28)' : 'rgba(251, 191, 36, 0.28)'}`,
          borderRadius: '16px',
          padding: '0.95rem 1.05rem'
        }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#D97706' }}>מחזור הזמנות</div>
          <div style={{ marginTop: 8, fontSize: '1.55rem', fontWeight: 900 }}>{formatIls(mismatches.booked)}</div>
          <div style={{ marginTop: 4, fontSize: '0.74rem', fontWeight: 700, color: styles.textMuted }}>
            {mismatches.stayCount} שהיות עד היום · בלי כפילות יחידות
            {mismatches.futureCount ? ` · יתר החודש ${mismatches.futureCount} · ${formatIls(mismatches.futureBooked)}` : ''}
          </div>
        </div>
        <div style={{
          background: isLight ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.14)',
          border: `1px solid ${isLight ? 'rgba(79, 70, 229, 0.22)' : 'rgba(165, 180, 252, 0.28)'}`,
          borderRadius: '16px',
          padding: '0.95rem 1.05rem'
        }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 900, color: '#6366F1' }}>נגבה על ההזמנות</div>
          <div style={{ marginTop: 8, fontSize: '1.55rem', fontWeight: 900 }}>{formatIls(mismatches.collected)}</div>
          <div style={{ marginTop: 4, fontSize: '0.74rem', fontWeight: 700, color: styles.textMuted }}>
            אשראי {formatIls(mismatches.credit)} · פתוח {formatIls(mismatches.bookingAmount)} · Hyp בלי הזמנה {formatIls(mismatches.paymentAmount)}
          </div>
        </div>
      </div>

      {notice && (
        <div style={{
          marginBottom: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: '10px',
          background: /נכשל|חסרים/.test(notice) ? 'rgba(239,68,68,0.12)' : 'rgba(16, 185, 129, 0.12)',
          color: /נכשל|חסרים/.test(notice) ? '#FCA5A5' : '#34D399',
          fontWeight: 700
        }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.55rem', marginBottom: '0.75rem' }}>
        <select value={month} onChange={(e) => { setMonthTouched(true); setMonth(e.target.value); }} style={selectStyle}>
          <option value="">כל החודשים</option>
          {months.map((key) => (
            <option key={key} value={key}>{monthLabel(key)}</option>
          ))}
        </select>
        <select value={property} onChange={(e) => setProperty(e.target.value)} style={selectStyle}>
          <option value="">כל המתחמים</option>
          {properties.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">כל הסטטוסים</option>
          <option value="open">פתוח / לבדיקה</option>
          <option value="paid">שולם</option>
          <option value="unpaid">לא שולם</option>
          <option value="voucher_hold">קיזוז נופש ברמה</option>
          <option value="kinorot">קיזוז כינורות</option>
        </select>
        <span style={{ position: 'relative' }}>
          <Search size={14} color={styles.textMuted} style={{ position: 'absolute', right: 10, top: 12 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש אורח / הערה"
            style={{ ...selectStyle, width: '100%', paddingRight: '2rem', fontWeight: 500 }}
          />
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '0.65rem',
        marginBottom: '0.85rem'
      }}>
        {[{
          title: 'סך הכל שהתקבל',
          tone: '#818CF8',
          actual: mismatches.collected,
          source: 'אשראי + מזומן + העברה על הזמנות החודש',
          reported: mismatches.booked
        }, {
          title: 'אשראי',
          tone: '#A78BFA',
          actual: mismatches.credit,
          source: 'חיובים על הזמנות החודש, כולל מקדמה לפני הכניסה',
          refreshed: `רוענן ${formatHypRefreshedAt(hypPayload)}`,
          reported: mismatches.credit
        }, {
          title: 'העברות',
          tone: '#60A5FA',
          actual: methodLedger.transfer.actual,
          source: `${methodLedger.transfer.count} שורות שנמצאו בבנק`,
          refreshed: beinleumiStatement?.importedAt ? `רוענן ${formatHypRefreshedAt(beinleumiStatement)}` : '',
          reported: methodLedger.transfer.reported
        }, {
          title: 'מזומן',
          tone: '#F59E0B',
          actual: mismatches.cash,
          source: mismatches.cash ? 'מזומן שסומן על הזמנות עד היום' : 'אין מזומן על הזמנות עד היום',
          reported: mismatches.cash
        }, {
          title: 'צ׳קים',
          tone: '#34D399',
          actual: methodLedger.check.actual,
          source: methodLedger.check.count ? `${methodLedger.check.count} הפקדות בבנק` : 'אין הפקדת צ׳קים',
          refreshed: beinleumiStatement?.importedAt ? `רוענן ${formatHypRefreshedAt(beinleumiStatement)}` : '',
          reported: methodLedger.check.reported
        }].map((card) => (
          <div
            key={card.title}
            style={{
              background: styles.cardBg,
              border: `1px solid ${styles.cardBorder}`,
              borderRadius: '16px',
              padding: '0.9rem 1rem',
              boxShadow: styles.shadow
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 900, color: card.tone }}>{card.title}</div>
            <div style={{ marginTop: 8, fontSize: '1.45rem', fontWeight: 900 }}>{formatIls(card.actual)}</div>
            <div style={{ marginTop: 4, fontSize: '0.72rem', fontWeight: 700, color: styles.textMuted }}>
              {card.source}
            </div>
            {card.refreshed ? (
              <div style={{ marginTop: 4, fontSize: '0.72rem', fontWeight: 800, color: card.tone }}>
                {card.refreshed}
              </div>
            ) : null}
            <div style={{ marginTop: 10, fontSize: '0.7rem', fontWeight: 600, color: styles.textMuted }}>
              {card.title === 'סך הכל שהתקבל' ? `מחזור הזמנות ${formatIls(card.reported)}` : `על ההזמנות ${formatIls(card.reported)}`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: '14px', border: `1px solid ${styles.cardBorder}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: isLight ? '#F1F5F9' : '#111827', color: styles.textMuted }}>
              {['תאריך כניסה', 'מתחם', 'אורח', 'לילות', 'אורחים', 'סך הכל', 'שולם בפועל'].map((label) => (
                <th key={label} style={{ textAlign: 'right', padding: '0.65rem', fontWeight: 800 }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '1rem', color: styles.textMuted }}>
                  אין שורות לחודש הזה בדוח היומי. בחרו חודש קודם, או רעננו Hyp כדי לראות אשראי בכרטיסים למעלה.
                </td>
              </tr>
            ) : displayRows.map((item) => {
              const row = item.row;
              const breakdown = scaleBreakdown(breakdowns[row.id], item.share, item.cabinIndex) || {
                due: 0, paid: 0, credit: { amount: 0, movements: [] }, cash: { amount: 0, movements: [] }, transfer: { amount: 0, movements: [] }, check: { amount: 0, movements: [] }
              };
              const defaultTab = breakdown.credit.amount ? 'credit'
                : breakdown.transfer.amount ? 'transfer'
                  : breakdown.cash.amount ? 'cash'
                    : breakdown.check?.amount ? 'check'
                      : 'credit';
              const active = tabByRow[item.key] || defaultTab;
              const tabLabel = METHOD_TABS.find((tab) => tab.id === active)?.label || 'אשראי';
              const due = breakdown.due || 0;
              const paid = breakdown.paid || 0;
              const leftover = Math.max(0, Math.round((due - paid) * 100) / 100);
              const stay = rowStayFacts(row, item.booking);
              const unitName = cabinUnitLabel(item.booking, units);
              return (
                <tr key={item.key} style={{ borderTop: `1px solid ${styles.cardBorder}` }}>
                  <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap' }}>{stay.checkIn ? formatHeDate(stay.checkIn) : '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700 }}>{unitName || row.property}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800 }}>{row.guestName || '—'}</td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {stay.nights ? stay.nights : '—'}
                  </td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {stay.guests ? stay.guests : '—'}
                  </td>
                  <td style={{ padding: '0.55rem 0.65rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                    {due ? formatIls(due) : '—'}
                    {item.share > 1 ? (
                      <div style={{ marginTop: 2, fontSize: '0.68rem', fontWeight: 700, color: styles.textMuted }}>
                        בקתה {item.cabinIndex + 1} מתוך {item.share}
                      </div>
                    ) : null}
                    {leftover > 1 ? (
                      <div style={{ marginTop: 2, fontSize: '0.7rem', fontWeight: 700, color: '#FBBF24' }}>
                        יתרה {formatIls(leftover)}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: '0.55rem 0.65rem', minWidth: '280px' }}>
                    <PaymentTabs
                      breakdown={breakdown}
                      active={active}
                      styles={styles}
                      onTab={(id) => startRowTab(() => setTabByRow((prev) => ({ ...prev, [item.key]: id })))}
                      onOpenLedger={() => setLedger({
                        title: `${tabLabel} · ${row.guestName || 'בלי שם'}${unitName ? ` · ${unitName}` : ''}`,
                        movements: breakdown[active]?.movements || []
                      })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ledger ? (
        <div
          role="presentation"
          onClick={() => setLedger(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(520px, 94vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: styles.cardBg,
              color: styles.textPrimary,
              border: `1px solid ${styles.cardBorder}`,
              borderRadius: '16px',
              boxShadow: styles.shadow,
              padding: '1rem 1.1rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
              <strong style={{ fontSize: '1rem' }}>{ledger.title}</strong>
              <button
                type="button"
                onClick={() => setLedger(null)}
                style={{
                  border: `1px solid ${styles.cardBorder}`,
                  background: 'transparent',
                  color: styles.textPrimary,
                  borderRadius: '8px',
                  padding: '0.3rem 0.6rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                סגור
              </button>
            </div>
            <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.65rem' }}>
              {ledger.movements.map((move) => (
                <div
                  key={move.id}
                  style={{
                    padding: '0.7rem 0.8rem',
                    borderRadius: '12px',
                    border: `1px solid ${styles.cardBorder}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <strong>{move.amount ? formatIls(move.amount) : '—'}</strong>
                    <span style={{ color: styles.textMuted, fontSize: '0.78rem' }}>
                      {move.date ? formatHeDate(move.date) : 'בלי תאריך'}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.8rem', fontWeight: 700 }}>
                    {move.ref ? `אסמכתה ${move.ref}` : 'בלי אסמכתה'}
                  </div>
                  <div style={{ marginTop: 3, fontSize: '0.75rem', color: styles.textMuted }}>
                    {movementAccount(move)}
                  </div>
                  {move.accountDetail && move.accountDetail !== move.accountLabel ? (
                    <div style={{ marginTop: 2, fontSize: '0.72rem', color: styles.textMuted }}>
                      {move.accountDetail}
                    </div>
                  ) : null}
                  {move.last4 ? (
                    <div style={{ marginTop: 2, fontSize: '0.72rem', color: styles.textMuted }}>
                      כרטיס •••• {move.last4}{move.brand ? ` · ${move.brand}` : ''}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
