import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommand } from './commandStore';
import SpeedTestModal from './SpeedTestModal';
import BeaconStatusLines, { useBeaconReport } from '../BeaconStatusLines';

function formatDuration(sec) {
  const n = Number(sec) || 0;
  if (n < 60) return '';
  const hours = Math.floor(n / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  if (hours > 0) return `${hours} שע׳ ${minutes} דק׳`;
  return `${minutes} דק׳`;
}

function netLabel(net) {
  if (!net || net.stale || net.internet == null) {
    return net?.routerReachable === false ? 'ראוטר לא עונה' : 'אין חיווי רשת';
  }
  if (!net.internet) return 'אין אינטרנט';
  const clients = Number(net.clients);
  return Number.isFinite(clients) ? `אינטרנט · ${clients} מחוברים` : 'אינטרנט';
}

function netTone(net) {
  if (!net || net.stale || net.internet == null) return 'warn';
  return net.internet ? 'up' : 'down';
}

export default function OfficeNode() {
  const { office, runOffice } = useCommand();
  const online = office.online === true;
  const powerOn = office.unit?.power === true;
  const target = Number(office.unit?.targetC) || 24;
  const disabled = !online || Boolean(office.busy);
  const beacons = useBeaconReport();
  const [net, setNet] = useState(null);
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [speed, setSpeed] = useState(null);
  const [speedError, setSpeedError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch('/api/network/status');
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setNet(data);
        if (data.speed?.checkedAt) setSpeed(data.speed);
      } catch {
        if (!cancelled) setNet(null);
      }
    }
    pull();
    const id = setInterval(pull, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function runSpeed() {
    setTesting(true);
    setSpeedError('');
    setOpen(true);
    try {
      const response = await fetch('/api/network/speedtest', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error('failed');
      setSpeed(data);
    } catch {
      setSpeedError('בדיקת המהירות נכשלה');
    } finally {
      setTesting(false);
    }
  }

  const uptime = formatDuration(net?.uptimeSec);

  return (
    <section className="office-card" aria-label="משרד פיילוט">
      <p className="office-kicker">פיילוט · על נוף כנרת</p>
      <h2>משרד · פיילוט</h2>
      <div className={`office-badge${online ? ' online' : ''}`}>
        {online ? 'בקר משרד: מחובר' : 'בקר משרד: לא מחובר (אין מתח)'}
      </div>
      <button type="button" className={`office-net ${netTone(net)}`} onClick={() => setOpen(true)}>
        <i />
        <span>{netLabel(net)}</span>
      </button>
      <BeaconStatusLines report={beacons} />
      {uptime ? <p className="office-note">פעיל {uptime}</p> : null}
      {open ? createPortal(
        <SpeedTestModal
          net={net}
          speed={speed}
          testing={testing}
          error={speedError}
          onClose={() => setOpen(false)}
          onRun={runSpeed}
        />,
        document.body,
      ) : null}
      <div className="office-actions">
        <button type="button" disabled={disabled} onClick={() => runOffice(powerOn ? 'ac_off' : 'ac', powerOn ? {} : { temp: target })}>
          מזגן
        </button>
        <button type="button" disabled={disabled} onClick={() => runOffice('lock')}>
          מנעול
        </button>
        <button type="button" disabled={disabled} onClick={() => runOffice('tv_off')}>
          מסך
        </button>
      </div>
      {office.note ? <p className="office-note">{office.note}</p> : null}
    </section>
  );
}
