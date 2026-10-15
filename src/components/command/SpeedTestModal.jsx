import React, { useEffect, useState } from 'react';

const RING = 2 * Math.PI * 52;

function shownMbps(speed, testing) {
  if (testing) return null;
  if (speed?.downMbps == null) return null;
  return speed.downMbps;
}

export default function SpeedTestModal({ net, speed, testing, error, onClose, onRun }) {
  const [sweep, setSweep] = useState(0);
  const target = shownMbps(speed, testing);
  const [display, setDisplay] = useState(target || 0);

  useEffect(() => {
    if (!testing) return undefined;
    const started = performance.now();
    let frame = 0;
    const tick = (now) => {
      setSweep(((now - started) / 1400) % 1);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [testing]);

  useEffect(() => {
    if (testing || target == null) return undefined;
    const from = 0;
    const started = performance.now();
    let frame = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / 700);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, testing]);

  const fill = testing ? 0.18 + sweep * 0.55 : Math.max(0.08, Math.min(1, (display || 0) / 100));
  const dash = RING * (1 - fill);
  const phase = testing ? (sweep < 0.33 ? 'פינג' : sweep < 0.7 ? 'הורדה' : 'העלאה') : 'הורדה';

  return (
    <div className="speed-modal" role="presentation" onClick={onClose}>
      <div className="speed-card" role="dialog" aria-label="בדיקת מהירות" dir="rtl" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p>ראוטר המשרד</p>
            <h2>בדיקת מהירות</h2>
          </div>
          <button type="button" className="speed-close" onClick={onClose} aria-label="סגור">×</button>
        </header>
        <div className="speed-gauge" data-testing={testing ? 'yes' : 'no'}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle className="speed-track" cx="60" cy="60" r="52" />
            <circle
              className="speed-arc"
              cx="60"
              cy="60"
              r="52"
              strokeDasharray={RING}
              strokeDashoffset={dash}
            />
          </svg>
          <div className="speed-readout">
            <span>{phase}</span>
            <strong>{testing ? '…' : (target == null ? '—' : display.toFixed(1))}</strong>
            <em>Mbps</em>
          </div>
        </div>
        <div className="speed-stats">
          <div>
            <span>פינג</span>
            <b>{speed?.pingMs != null && !testing ? `${Math.round(speed.pingMs)}` : '—'}</b>
            <em>מ״ש</em>
          </div>
          <div className="is-main">
            <span>הורדה</span>
            <b>{speed?.downMbps != null && !testing ? speed.downMbps.toFixed(1) : '—'}</b>
            <em>מגה</em>
          </div>
          <div>
            <span>העלאה</span>
            <b>{speed?.upMbps != null && !testing ? speed.upMbps.toFixed(1) : '—'}</b>
            <em>מגה</em>
          </div>
        </div>
        <p className="speed-meta">
          {[net?.wwanIp ? `יציאה ${net.wwanIp}` : '', Number.isFinite(Number(net?.clients)) ? `${Number(net.clients)} מחוברים` : ''].filter(Boolean).join(' · ') || 'מהראוטר במשרד'}
        </p>
        {error ? <p className="speed-error">{error}</p> : null}
        <button type="button" className="speed-go" disabled={testing || net?.routerReachable === false} onClick={onRun}>
          {testing ? 'מודד…' : 'התחל בדיקה'}
        </button>
      </div>
    </div>
  );
}
