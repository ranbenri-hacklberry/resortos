import React, { useEffect, useState } from 'react';
import NetworkStatusPill from '../NetworkStatusPill';
import { countsOf } from './model';
import { useCommand } from './commandStore';

function formatClock(date) {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function HeaderBar() {
  const { cabins, turnoverOnly, setTurnoverOnly } = useCommand();
  const counts = countsOf(cabins);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hebrew = now.toLocaleDateString('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });
  const gregorian = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });

  return (
    <header className="noc-header">
      <div className="noc-brand">
        <h1>
          <i className="noc-live-dot" aria-hidden="true" />
          ResortOS | חמ״ל מבצעים (מתחם רמות - 28 יחידות)
        </h1>
      </div>
      <div className="noc-metrics" aria-label="סיכום מצב">
        <span className="noc-metric ready">מוכן <b>{counts.ready}</b></span>
        <span className="noc-metric occupied">מאוכלס <b>{counts.occupied}</b></span>
        <span className="noc-metric cleaning">ניקיון <b>{(counts.dirty || 0) + counts.cleaning}</b></span>
        <span className="noc-metric inspection">לבדיקה <b>{counts.inspection}</b></span>
        <span className={`noc-metric alert${counts.alert > 0 ? ' is-hot' : ''}`}>התראה <b>{counts.alert}</b></span>
      </div>
      <button
        type="button"
        className={`noc-filter${turnoverOnly ? ' is-on' : ''}`}
        onClick={() => setTurnoverOnly((on) => !on)}
      >
        החלפות היום
      </button>
      <NetworkStatusPill />
      <div className="noc-clock">
        <strong>{formatClock(now)}</strong>
        <span>{gregorian}</span>
        <span>{hebrew}</span>
      </div>
    </header>
  );
}
