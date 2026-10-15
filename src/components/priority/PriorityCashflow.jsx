import React, { useEffect, useState } from 'react';
import { getStoredToken } from '../../lib/staffAuth';

const MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function monthLabel(ym) {
  const [year, month] = String(ym || '').split('-');
  const name = MONTHS_HE[Number(month) - 1] || month;
  return `${name} ${String(year || '').slice(2)}`;
}

function shekel(amount) {
  const value = Math.round(Number(amount) || 0);
  if (!value) return '';
  return value.toLocaleString('he-IL');
}

function annualAverage(total, monthCount) {
  const months = Number(monthCount) || 0;
  if (!months) return 0;
  return Math.round((Number(total) || 0) * 12 / months);
}

function CashflowTable({ title, nameHeader, rows, months, totals, grand, detail = false }) {
  return (
    <table className={`cashflow-table${detail ? ' is-detail' : ''}`}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th className="cashflow-name">{nameHeader}</th>
          {months.map((month) => <th key={month}>{monthLabel(month)}</th>)}
          <th className="cashflow-total">ממוצע שנתי</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th className="cashflow-name">{row.label}</th>
            {months.map((month) => <td key={month}>{shekel(row.months[month])}</td>)}
            <td className="cashflow-total">{shekel(annualAverage(row.total, months.length))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th className="cashflow-name">סה״כ</th>
          {months.map((month) => <th key={month}>{shekel(totals[month])}</th>)}
          <th className="cashflow-total">{shekel(annualAverage(grand, months.length))}</th>
        </tr>
      </tfoot>
    </table>
  );
}

export default function PriorityCashflow() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch('/api/priority/cashflow', { headers })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const err = new Error(body.error || 'CASHFLOW_FAILED');
          err.status = response.status;
          throw err;
        }
        return body;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.status === 401
          ? 'צריך להתחבר כמנהל כדי לראות את ההוצאות החודשיות.'
          : 'לא הצלחתי לטעון את ההוצאות החודשיות.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="cashflow-status">{error}</div>;
  if (!data) return <div className="cashflow-status">טוען הוצאות חודשיות…</div>;

  return (
    <div className="cashflow-screen">
      <p className="cashflow-range">הוצאות מאוקטובר 2026 עד דצמבר 2027. העמודה השמאלית היא ממוצע שנתי, לא סכום כל התקופה.</p>
      <div className="cashflow-scroll">
        <CashflowTable
          title="לפי תחום"
          nameHeader="תחום"
          rows={data.domains}
          months={data.months}
          totals={data.totals}
          grand={data.grand}
        />
        <CashflowTable
          title="לפי הוצאה"
          nameHeader="הוצאה"
          detail
          rows={data.expenses}
          months={data.months}
          totals={data.totals}
          grand={data.grand}
        />
      </div>
    </div>
  );
}
