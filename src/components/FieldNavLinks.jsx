import React from 'react';
import { Map, Navigation } from 'lucide-react';

/** Compact Waze + Google Maps chips for Field Ops cards. */
export default function FieldNavLinks({ wazeUrl, mapsUrl, propertyLabel, theme = 'dark' }) {
  if (!wazeUrl && !mapsUrl) return null;
  const isLight = theme === 'light';
  const chip = (bg, color) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    textDecoration: 'none',
    background: bg,
    color,
    fontWeight: 800,
    fontSize: '0.7rem',
    borderRadius: 999,
    padding: '5px 9px',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0
  });

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, width: '100%' }}>
      {wazeUrl ? (
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Waze${propertyLabel ? ` · ${propertyLabel}` : ''}`}
          style={chip(isLight ? '#D7EAF2' : 'rgba(56,189,248,0.16)', isLight ? '#1E3A4C' : '#7DD3FC')}
        >
          <Navigation size={13} />
          Waze
        </a>
      ) : null}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Google Maps${propertyLabel ? ` · ${propertyLabel}` : ''}`}
          style={chip(isLight ? '#E4E0D6' : 'rgba(255,255,255,0.08)', isLight ? '#3F3A33' : '#E2E8F0')}
        >
          <Map size={13} />
          Maps
        </a>
      ) : null}
    </div>
  );
}
