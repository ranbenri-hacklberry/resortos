import React, { useEffect, useState } from 'react';
import { beaconLine, beaconTone } from '../lib/assetBeacons';

export function useBeaconReport() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const response = await fetch('/api/pilot/assets');
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setReport(null);
      }
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return report;
}

export default function BeaconStatusLines({ report, compact = false }) {
  if (!report) return null;
  const assets = Array.isArray(report.assets) ? report.assets : [];
  if (!assets.length) {
    return (
      <p className={`office-asset${report.online ? '' : ' offline'}`} style={compact ? { ...compactStyle, color: report.online ? '#94A3B8' : '#FDE68A' } : undefined}>
        {report.online ? 'אין ביקונים' : 'ביקון: אין קשר'}
      </p>
    );
  }
  return (
    <div className="office-assets">
      {assets.map((asset) => (
        <p
          key={asset.mac}
          className={`office-asset ${beaconTone(asset, report.online === true)}`}
          style={compact ? { ...compactStyle, color: toneColor(beaconTone(asset, report.online === true)) } : undefined}
        >
          {beaconLine(asset, report.online === true)}
        </p>
      ))}
    </div>
  );
}

const compactStyle = { margin: '0.35rem 0 0', fontSize: '0.78rem', fontWeight: 800 };

function toneColor(tone) {
  if (tone === 'missing') return '#FCA5A5';
  if (tone === 'suspect') return '#FBBF24';
  if (tone === 'offline') return '#FDE68A';
  return '#6EE7B7';
}
