import React, { useEffect, useState } from 'react';

function formatDuration(sec) {
  const n = Number(sec) || 0;
  if (n < 60) return '';
  const hours = Math.floor(n / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  if (hours > 0) return `${hours} שע׳ ${minutes} דק׳`;
  return `${minutes} דק׳`;
}

function label(status) {
  if (!status || status.stale || status.internet == null) {
    return status?.routerReachable === false ? 'ראוטר המשרד לא עונה' : 'אין חיווי רשת';
  }
  if (!status.internet) return 'אין אינטרנט במשרד';
  const bits = ['משרד מחובר'];
  if (status.wwanIp) bits.push(status.wwanIp);
  const clients = Number(status.clients);
  if (Number.isFinite(clients)) bits.push(`${clients} מחוברים`);
  return bits.join(' · ');
}

function tone(status) {
  if (!status || status.stale || status.internet == null) return '#F59E0B';
  return status.internet ? '#10B981' : '#EF4444';
}

export default function NetworkStatusPill({ isLight = false }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch('/api/network/status');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }
    pull();
    const id = setInterval(pull, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const color = tone(status);
  const uptime = formatDuration(status?.uptimeSec);
  const title = [
    status?.hostname ? `ראוטר ${status.hostname}` : 'ראוטר המשרד',
    status?.wwanIp ? `יציאה ${status.wwanIp}` : '',
    Number.isFinite(Number(status?.clients)) ? `${Number(status.clients)} מחוברים עכשיו` : '',
    uptime ? `פעיל ${uptime}` : '',
    status?.checkedAt ? `עודכן ${status.checkedAt.slice(11, 16)}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <span
      title={title || 'מצב הרשת מהראוטר'}
      style={{
        border: `1px solid ${color}55`,
        background: isLight ? `${color}18` : `${color}22`,
        color,
        borderRadius: '999px',
        padding: '0.35rem 0.7rem',
        fontSize: '0.7rem',
        fontWeight: 800,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block' }} />
      {label(status)}
    </span>
  );
}
