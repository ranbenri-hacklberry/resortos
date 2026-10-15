import React, { useEffect, useState } from 'react';

export default function AssetBeaconAlert({ theme = 'dark' }) {
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(false);
  const isLight = theme === 'light';

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch('/api/pilot/assets');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      } catch {
        /* the next poll retries */
      }
    }
    pull();
    const id = setInterval(pull, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!alerts.length) return null;

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    const ids = alerts.map((row) => row.id);
    try {
      const response = await fetch('/api/pilot/assets/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await response.json().catch(() => ({}));
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
    } catch {
      setAlerts([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        padding: '1rem',
      }}
    >
      <section
        role="alertdialog"
        aria-labelledby="beacon-alert-title"
        dir="rtl"
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 18,
          padding: '1.1rem 1.15rem 1rem',
          background: isLight ? '#fffaf3' : '#1c1917',
          color: isLight ? '#1c1917' : '#fafaf9',
          border: isLight ? '1px solid rgba(127,29,29,0.35)' : '1px solid rgba(252,165,165,0.45)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
      >
        <h2 id="beacon-alert-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>
          ביקון לא נקלט
        </h2>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((row) => (
            <p key={row.id} style={{ margin: 0, fontWeight: 800, lineHeight: 1.45 }}>
              {row.recovered
                ? `${row.name} במשרד חזר לשדר.`
                : `${row.name} במשרד (פיילוט) לא משדר.`}
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          style={{
            marginTop: 16,
            width: '100%',
            border: 'none',
            borderRadius: 12,
            padding: '0.7rem 1rem',
            fontWeight: 900,
            cursor: busy ? 'wait' : 'pointer',
            background: '#b91c1c',
            color: '#fff',
          }}
        >
          הבנתי
        </button>
      </section>
    </div>
  );
}
