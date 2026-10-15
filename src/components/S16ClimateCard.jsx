import React, { useCallback, useEffect, useState } from 'react';

const MODE_LABELS = {
  cold: 'קירור',
  warm: 'חימום',
  auto: 'אוטומטי',
  air: 'אוורור',
  dehumidify: 'ייבוש',
};

const FAN_LABELS = {
  auto: 'אוטומטי',
  low: 'נמוך',
  middle: 'בינוני',
  high: 'גבוה',
};

async function climateFetch(path, options) {
  const targets = [path];
  if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    targets.push(`http://127.0.0.1:4038${path}`);
  }
  let lastError = null;
  for (const url of targets) {
    try {
      const response = await fetch(url, options);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) continue;
      return response;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('climate api unavailable');
}

async function readStatus() {
  const response = await climateFetch('/api/climate/status');
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'status failed');
  return data.unit;
}

async function sendCommand(body) {
  const response = await climateFetch('/api/climate/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'command failed');
  return data.unit;
}

export default function S16ClimateCard() {
  const [unit, setUnit] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUnit(await readStatus());
      setError('');
    } catch (err) {
      setError(err.message || 'לא זמין');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  async function command(patch) {
    if (!unit || busy) return;
    setBusy(true);
    try {
      setUnit(await sendCommand({ id: unit.id, ...patch }));
      setError('');
    } catch (err) {
      setError(err.message || 'הפקודה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  const target = Number(unit?.targetC) || 16;

  return (
    <section
      dir="rtl"
      style={{
        margin: '0 0 1rem',
        padding: '0.9rem 1rem',
        borderRadius: '16px',
        background: '#0F172A',
        color: '#E2E8F0',
        border: '1px solid rgba(56, 189, 248, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.04em', color: '#7DD3FC', fontWeight: 800 }}>מזגן מקומי</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>{unit?.name || 'S16 Pro'} · {unit?.room || 'Demo AC'}</div>
        </div>
        <button
          type="button"
          disabled={!unit || busy}
          onClick={() => command({ power: !unit.power })}
          style={{
            border: 'none',
            borderRadius: '999px',
            padding: '0.55rem 0.9rem',
            fontWeight: 800,
            cursor: unit && !busy ? 'pointer' : 'default',
            background: unit?.power ? '#F97316' : '#334155',
            color: '#fff',
          }}
        >
          {unit?.power ? 'כיבוי' : 'הפעלה'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem', flexWrap: 'wrap', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>עכשיו</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, lineHeight: 1 }}>
            {unit?.currentC == null ? '—' : `${unit.currentC.toFixed(1)}°`}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>לחות {unit?.humidity ?? '—'}%</div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>יעד</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button type="button" disabled={!unit || busy || target <= (unit?.tempMin || 16)} onClick={() => command({ target: target - 1 })} style={stepStyle}>−</button>
            <strong style={{ fontSize: '1.3rem' }}>{unit?.targetC ?? '—'}°</strong>
            <button type="button" disabled={!unit || busy || target >= (unit?.tempMax || 30)} onClick={() => command({ target: target + 1 })} style={stepStyle}>+</button>
          </div>
        </div>
        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
          מצב
          <select
            value={unit?.mode || 'cold'}
            disabled={!unit || busy}
            onChange={(event) => command({ mode: event.target.value })}
            style={selectStyle}
          >
            {(unit?.modes || Object.keys(MODE_LABELS)).map((mode) => (
              <option key={mode} value={mode}>{MODE_LABELS[mode] || mode}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
          מאוורר
          <select
            value={unit?.fan || 'auto'}
            disabled={!unit || busy}
            onChange={(event) => command({ fan: event.target.value })}
            style={selectStyle}
          >
            {(unit?.fans || Object.keys(FAN_LABELS)).map((fan) => (
              <option key={fan} value={fan}>{FAN_LABELS[fan] || fan}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: error ? '#FCA5A5' : '#94A3B8' }}>
        {error || unit?.note || `${unit?.power ? 'פועל' : 'כבוי'} · ${unit?.host || 'LAN'}`}
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

const selectStyle = {
  display: 'block',
  marginTop: '0.25rem',
  background: '#1E293B',
  color: '#fff',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '0.35rem 0.5rem',
  fontWeight: 700,
};
