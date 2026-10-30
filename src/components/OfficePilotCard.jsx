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

  // Channex Channel Manager state
  const [channexStatus, setChannexStatus] = useState(null);
  const [channexBusy, setChannexBusy] = useState(false);
  const [channexNotice, setChannexNotice] = useState('');

  const refreshChannex = useCallback(async () => {
    try {
      const res = await fetch('/api/channex/status');
      if (res.ok) {
        setChannexStatus(await res.json());
      }
    } catch {}
  }, []);

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
    refreshChannex();
    const id = setInterval(() => {
      refresh();
      refreshChannex();
    }, 15000);
    return () => clearInterval(id);
  }, [refresh, refreshChannex]);

  async function syncChannex() {
    if (channexBusy) return;
    setChannexBusy(true);
    setChannexNotice('');
    try {
      const res = await fetch('/api/channex/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || 'הסנכרון נכשל');
      }
      const pulled = data.pull?.upsertedCount ?? 0;
      const pushed = data.push?.daysAhead ?? 45;
      setChannexNotice(`סונכרן בהצלחה: נמשכו ${pulled} הזמנות, עודכנו ${pushed} ימי זמינות`);
      await refreshChannex();
    } catch (err) {
      setChannexNotice(`שגיאת סנכרון: ${err.message || 'לא ניתן לתקשר עם Channex'}`);
    } finally {
      setChannexBusy(false);
    }
  }

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

      {/* Channex Channel Manager Integration Section */}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.04em', color: '#38BDF8', fontWeight: 800 }}>
              ערוצי הפצה · Channex Channel Manager (Staging)
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#F1F5F9', marginTop: '0.1rem' }}>
              סנכרון הזמנות וזמינות עבור יחידת המשרד
            </div>
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: channexStatus?.connectionHealthy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: channexStatus?.connectionHealthy ? '#34D399' : '#FCA5A5',
              border: `1px solid ${channexStatus?.connectionHealthy ? 'rgba(52, 211, 153, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            }}
          >
            {channexStatus?.connectionHealthy ? '● Staging מחובר' : '● לא מחובר'}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.5rem',
            marginTop: '0.65rem',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '0.6rem 0.75rem',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.72rem',
          }}
        >
          <div>
            <span style={{ color: '#94A3B8' }}>נכס Channex: </span>
            <strong style={{ color: '#E2E8F0' }}>{channexStatus?.propertyName || 'ResortOS Sandbox'}</strong>
          </div>
          <div>
            <span style={{ color: '#94A3B8' }}>סוג חדר: </span>
            <strong style={{ color: '#E2E8F0' }}>{channexStatus?.roomName || 'Office Pilot'}</strong>
          </div>
          <div>
            <span style={{ color: '#94A3B8' }}>תוכנית מחיר: </span>
            <strong style={{ color: '#E2E8F0' }}>{channexStatus?.ratePlanName || 'Office Pilot Test Rate'}</strong>
          </div>
          <div>
            <span style={{ color: '#94A3B8' }}>יחידה במערכת: </span>
            <strong style={{ color: '#38BDF8' }}>משרד ({channexStatus?.unitId || 'pilot-office'})</strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={channexBusy}
            onClick={syncChannex}
            style={{
              ...pill,
              background: channexBusy ? '#475569' : '#0284C7',
              fontSize: '0.78rem',
              padding: '0.4rem 0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {channexBusy ? '⟳ מסנכרן מול Channex…' : '🔄 סנכרן עכשיו מול Channex'}
          </button>

          <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
            {channexStatus?.lastSyncAt ? (
              <span>
                סנכרון אחרון: {new Date(channexStatus.lastSyncAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                {channexStatus.pulledBookings !== undefined ? ` · ${channexStatus.pulledBookings} הזמנות` : ''}
              </span>
            ) : (
              'טרם בוצע סנכרון ידני בסשן זה'
            )}
          </div>
        </div>

        {channexNotice && (
          <div
            style={{
              marginTop: '0.5rem',
              fontSize: '0.72rem',
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              background: channexNotice.includes('שגיא') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
              color: channexNotice.includes('שגיא') ? '#FCA5A5' : '#6EE7B7',
              border: `1px solid ${channexNotice.includes('שגיא') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            }}
          >
            {channexNotice}
          </div>
        )}
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
