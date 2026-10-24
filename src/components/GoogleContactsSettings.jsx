import React, { useEffect, useState } from 'react';
import { getStoredToken } from '../lib/staffAuth';

const ACTION_LABEL = {
  create: 'ייווצר',
  update: 'יעודכן',
  remove: 'יוסר',
  conflict: 'התנגשות'
};

async function api(path, options = {}) {
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
  return date.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function GoogleContactsSettings({ isLight }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const color = isLight ? '#1C1917' : '#F8FAFC';
  const muted = isLight ? '#57534E' : '#CBD5E1';

  async function load() {
    setStatus(await api('/api/google-contacts/status'));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function run(name, path, body) {
    setBusy(name);
    setError('');
    try {
      const data = await api(path, { method: 'POST', body: JSON.stringify(body || {}) });
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const dry = status?.last_dry_run;
  const counts = dry?.counts || {};

  return (
    <div style={{ color, display: 'grid', gap: '0.8rem' }}>
      <p style={{ margin: 0, color: muted, fontSize: '0.92rem' }}>
        סנכרון חד־כיווני מ־ResortOS לחשבון Google ייעודי. כתיבה לגוגל כבויה עד אישור אחרי הדמיה.
        אורח שעזב לפני יותר משלושה ימים לא נכנס לרשימה בשלב הזה.
      </p>
      <div style={{ fontSize: '0.92rem', lineHeight: 1.6 }}>
        <div>חיבור: {status?.connected ? (status.account || 'מחובר') : 'לא מחובר'}</div>
        <div>אפליקציית גוגל: {status?.configured ? 'מוגדרת' : 'חסרים מזהה וסוד בשרת'}</div>
        <div>כתיבה: {status?.live_enabled ? 'מאושרת' : 'כבויה'}</div>
        <div>סנכרון אחרון: {when(status?.last_success_at)}</div>
        <div>מנוהלים {status?.managed_count || 0} · ממתינים {status?.pending_count || 0} · התנגשויות {status?.failed_count || 0}</div>
        {status?.last_error ? <div>שגיאה: {status.last_error}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={Boolean(busy)} onClick={() => run('connect', '/api/google-contacts/connect')}>חיבור Google</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => run('sync', '/api/google-contacts/sync', {})}>הדמיה</button>
        <button type="button" disabled={Boolean(busy) || !status?.connected} onClick={() => run('off', '/api/google-contacts/disconnect')}>ניתוק</button>
      </div>
      {dry ? (
        <div style={{ fontSize: '0.9rem' }}>
          <div>
            ייווצרו {counts.create || 0} · יעודכנו {counts.update || 0} · ללא שינוי {counts.unchanged || 0} · יוסרו {counts.remove || 0} · התנגשויות {counts.conflict || 0} · דולגו {counts.skip || 0}
          </div>
          <div style={{ color: muted }}>
            {dry.scan_complete ? 'הסריקה מלאה.' : 'הסריקה חלקית, ולכן אין מחיקה.'}
            {dry.google_read ? ' אנשי הקשר בגוגל נבדקו.' : ' בלי קריאה מגוגל אי אפשר לדעת אם מספר כבר קיים.'}
          </div>
          <ul style={{ paddingInlineStart: '1.1rem', margin: '0.4rem 0' }}>
            {(dry.actions || []).map((row) => (
              <li key={`${row.action}-${row.booking_id}-${row.phone_masked}`}>
                {ACTION_LABEL[row.action] || row.action}: {row.display_name || row.existing_name || row.phone_masked}
                {row.action === 'conflict' && row.existing_name ? ` · קיים: ${row.existing_name}` : ''}
              </li>
            ))}
          </ul>
          {dry.counts?.conflict ? <div>התנגשות לא נדרסת. צריך טיפול מנהל.</div> : null}
        </div>
      ) : null}
      <button
        type="button"
        disabled={Boolean(busy) || !dry?.scan_complete || status?.live_enabled}
        onClick={() => run('live', '/api/google-contacts/live', { enabled: true })}
      >
        אשר כתיבה לגוגל אחרי בדיקת ההדמיה
      </button>
      {status?.live_enabled ? (
        <button type="button" disabled={Boolean(busy)} onClick={() => run('write', '/api/google-contacts/sync', { live: true })}>
          סנכרון כתיבה
        </button>
      ) : null}
      {error ? <div style={{ color: '#B91C1C' }}>{error}</div> : null}
    </div>
  );
}
