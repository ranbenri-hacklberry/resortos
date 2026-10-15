import React, { useCallback, useEffect, useState } from 'react';
import BeaconStatusLines, { useBeaconReport } from './BeaconStatusLines';

async function pilotFetch(path, options) {
  const response = await fetch(path, options);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) throw new Error('השרת לא החזיר תשובה');
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || 'הפעולה נכשלה');
  return data;
}

export default function OfficePilotCard({ operator = 'צוות' }) {
  const beacons = useBeaconReport();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await pilotFetch('/api/pilot/office'));
      setError('');
    } catch (err) {
      setError(err.message || 'הבקר לא זמין');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  async function run(action, extra = {}) {
    if (busy) return;
    setBusy(action);
    setNotice('');
    try {
      const data = await pilotFetch('/api/pilot/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operator, ...extra }),
      });
      setError('');
      setNotice(data.note || '');
      await refresh();
    } catch (err) {
      setError(err.message || 'הפעולה נכשלה');
    } finally {
      setBusy('');
    }
  }

  const unit = status?.unit;
  const online = status?.online === true;
  const target = Number(unit?.targetC) || 24;
  const powerKnown = unit?.power === true || unit?.power === false;

  return (
    <section
      dir="rtl"
      style={{
        margin: '0 0 0.85rem',
        padding: '0.9rem 1rem',
        borderRadius: '16px',
        background: '#0F172A',
        color: '#E2E8F0',
        border: '1px solid rgba(129, 140, 248, 0.45)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.04em', color: '#C4B5FD', fontWeight: 800 }}>פיילוט · משרד</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>בקר ESP32 על הרשת האלחוטית ResortOS</div>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 700 }}>מוצפן על Tailscale</div>
        </div>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: online ? '#6EE7B7' : '#FCA5A5' }}>
          {online ? 'מחובר' : 'לא מחובר'}
        </div>
      </div>
      <BeaconStatusLines report={beacons} compact />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', marginTop: '0.85rem', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>מזגן TCL · קירור</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
            <button type="button" disabled={!online || !!busy || target <= 16} onClick={() => run('ac', { temp: target - 1 })} style={stepStyle}>−</button>
            <strong style={{ fontSize: '1.3rem' }}>{target}°</strong>
            <button type="button" disabled={!online || !!busy || target >= 30} onClick={() => run('ac', { temp: target + 1 })} style={stepStyle}>+</button>
            <button
              type="button"
              disabled={!online || !!busy}
              onClick={() => run(unit?.power ? 'ac_off' : 'ac', unit?.power ? {} : { temp: target })}
              style={{ ...pill, background: unit?.power ? '#F97316' : '#334155' }}
            >
              {powerKnown ? (unit.power ? 'כיבוי' : 'הפעלה') : 'הפעלה'}
            </button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>מנעול</div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
            <button type="button" disabled={!online || !!busy} onClick={() => run('unlock')} style={{ ...pill, background: '#059669' }}>פתיחה</button>
            <button type="button" disabled={!online || !!busy} onClick={() => run('lock')} style={{ ...pill, background: '#1D4ED8' }}>נעילה</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>טלוויזיה</div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
            <button type="button" disabled={!online || !!busy} onClick={() => run('tv_on')} style={{ ...pill, background: '#7C3AED' }}>הדלקה</button>
            <button type="button" disabled={!online || !!busy} onClick={() => run('tv_off')} style={{ ...pill, background: '#4C1D95' }}>כיבוי</button>
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: error ? '#FDE68A' : '#94A3B8' }}>
        {busy ? 'שולח לבקר…' : (error || notice || unit?.note || 'הפקודות יוצאות מהעין ומהמנעול של המשרד.')}
      </div>
    </section>
  );
}

const stepStyle = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#1E293B',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
};

const pill = {
  border: 'none',
  borderRadius: '999px',
  padding: '0.45rem 0.8rem',
  fontWeight: 800,
  color: '#fff',
  cursor: 'pointer',
};
