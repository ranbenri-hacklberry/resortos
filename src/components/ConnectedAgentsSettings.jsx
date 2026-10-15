import React, { useEffect, useState } from 'react';
import { getStoredToken } from '../lib/staffAuth';

const PERMISSION_LABEL = {
  read: 'קריאה',
  room_status: 'עדכון סטטוס חדר',
};

const STATUS_LABEL = {
  pending: 'ממתין',
  approved: 'מחובר',
  rejected: 'נדחה',
  expired: 'פג תוקף',
  revoked: 'נותק',
};

async function opsFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'REQUEST_FAILED');
  return data;
}

function when(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

export default function ConnectedAgentsSettings({ isLight }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    try {
      const data = await opsFetch('/api/ops/agent-connections');
      setRows(Array.isArray(data.connections) ? data.connections : []);
      setError('');
    } catch (err) {
      setError(err.message || 'טעינה נכשלה');
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  async function act(id, action) {
    setBusy(id + action);
    setError('');
    try {
      await opsFetch(`/api/ops/agent-connections/${encodeURIComponent(id)}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message || 'הפעולה נכשלה');
    } finally {
      setBusy('');
    }
  }

  const button = (label, onClick, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: '9px',
        padding: '0.35rem 0.6rem',
        fontWeight: 800,
        cursor: disabled ? 'wait' : 'pointer',
        background: isLight ? '#312e81' : '#4f46e5',
        color: '#fff',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.45, color: isLight ? '#44403c' : '#cbd5e1' }}>
        בקשת חיבור מופיעה כאן עם קוד התאמה. השם שהסוכן שלח אינו מזהה אותו.
      </p>
      {error ? <p style={{ margin: 0, color: '#b45309', fontWeight: 800, fontSize: '0.78rem' }}>{error}</p> : null}
      {rows.length === 0 ? <p style={{ margin: 0, fontSize: '0.8rem' }}>אין בקשות חיבור.</p> : null}
      {rows.map((row) => (
        <article
          key={row.id}
          style={{
            borderRadius: '12px',
            padding: '0.7rem 0.75rem',
            background: row.status === 'pending'
              ? (isLight ? '#fffbeb' : 'rgba(120, 53, 15, 0.35)')
              : (isLight ? '#f6f3ec' : '#0f172a'),
          }}
        >
          <strong style={{ display: 'block' }}>
            {row.status === 'pending' ? `${row.client_label} מבקש גישה` : row.client_label}
          </strong>
          {row.match_code ? <div style={{ fontWeight: 900, letterSpacing: '0.12em', marginTop: '0.2rem' }}>קוד {row.match_code}</div> : null}
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {(row.permissions || []).map((item) => PERMISSION_LABEL[item] || item).join(' · ') || '—'}
          </div>
          <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', color: isLight ? '#57534e' : '#94a3b8' }}>
            {STATUS_LABEL[row.status] || row.status}
            {' · '}
            אושר על ידי {row.approved_by_name || '—'}
            {' · '}
            נוצר {when(row.created_at)}
            {' · '}
            שימוש אחרון {when(row.last_used_at)}
          </div>
          {row.status === 'pending' ? (
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem' }}>
              {button('אשר', () => act(row.id, 'approve'), Boolean(busy))}
              {button('דחה', () => act(row.id, 'reject'), Boolean(busy))}
            </div>
          ) : null}
          {row.status === 'approved' ? (
            <div style={{ marginTop: '0.45rem' }}>
              {button('נתק', () => act(row.id, 'revoke'), Boolean(busy))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
