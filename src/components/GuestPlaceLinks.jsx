import React from 'react';
import { Map, MessageSquare, Navigation, Phone } from 'lucide-react';
import { mapsUrlFromWaze } from '../lib/areaGuide';
import { toDialPhone, toWhatsAppPhone } from '../lib/stayProperty';

function chip(bg, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    textDecoration: 'none',
    background: bg,
    color,
    fontWeight: 800,
    fontSize: '0.78rem',
    borderRadius: 10,
    padding: '0.45rem 0.7rem',
    flex: 1,
    minWidth: 0
  };
}

export default function GuestPlaceLinks({ wazeUrl, mapsUrl, phone, wazeLabel, mapsLabel, callLabel, whatsappLabel, showPhone = true, compact = false }) {
  if (!wazeUrl && !mapsUrl && !phone) return null;
  const mapsHref = mapsUrl || (wazeUrl ? mapsUrlFromWaze(wazeUrl) : '');
  const dial = phone ? toDialPhone(phone) : '';
  const wa = phone ? toWhatsAppPhone(phone) : '';
  const iconChip = (bg, color) => ({
    ...chip(bg, color),
    flex: 1,
    padding: compact ? '0.32rem 0.28rem' : '0.45rem 0.7rem',
    fontSize: compact ? '0.6rem' : '0.78rem',
    gap: compact ? 3 : 6
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 5 : 8, marginTop: 4 }}>
      {wazeUrl ? (
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={wazeLabel}
          aria-label={wazeLabel}
          style={iconChip('#D7EAF2', '#1E3A4C')}
        >
          <Navigation size={compact ? 12 : 14} />
          {wazeLabel}
        </a>
      ) : null}
      {mapsHref ? (
        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          title={mapsLabel}
          aria-label={mapsLabel}
          style={iconChip('#E4E0D6', '#3F3A33')}
        >
          <Map size={compact ? 12 : 14} />
          {compact ? 'Maps' : mapsLabel}
        </a>
      ) : null}
      {showPhone && dial ? (
        <a href={`tel:${dial}`} title={phone || callLabel} aria-label={phone || callLabel} style={iconChip('#EDE8E1', '#3F3A33')}>
          <Phone size={compact ? 12 : 14} />
          {compact ? null : (phone || callLabel)}
        </a>
      ) : null}
      {!compact && showPhone && wa ? (
        <a
          href={`https://api.whatsapp.com/send/?phone=${wa}&type=phone_number&app_absent=0`}
          target="_blank"
          rel="noopener noreferrer"
          style={iconChip('#DCEFE3', '#1B4332')}
        >
          <MessageSquare size={14} />
          {whatsappLabel || 'WhatsApp'}
        </a>
      ) : null}
    </div>
  );
}
