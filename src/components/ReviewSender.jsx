import React, { useMemo, useState } from 'react';
import { Check, Copy, Link2, LogOut, Phone, Plus, Printer, Send } from '../lib/lucide-reviews.js';
import {
  buildReviewMessage,
  businessLocations,
  formatPhoneForWhatsApp,
  reviewUrlFromPlaceId
} from '../lib/reviewDispatch.js';
import { APP_NAME } from '../lib/reviewBrand.js';
import { fieldStyle, labelStyle } from '../lib/reviewTheme.js';
import ReviewQr, { printReviewQr } from './ReviewQr.jsx';
import ReviewShell from './ReviewShell.jsx';

function compactField(theme) {
  return { ...fieldStyle(theme), padding: '0.62rem 0.85rem', fontSize: '0.9rem' };
}

function selectStyle(theme) {
  return {
    ...compactField(theme),
    fontWeight: 800,
    appearance: 'none',
    backgroundImage: `linear-gradient(45deg, transparent 50%, ${theme.muted} 50%), linear-gradient(135deg, ${theme.muted} 50%, transparent 50%)`,
    backgroundPosition: 'left 14px top 50%, left 9px top 50%',
    backgroundSize: '5px 5px, 5px 5px',
    backgroundRepeat: 'no-repeat',
    paddingLeft: 28
  };
}

function chipStyle(theme, isLight, on) {
  return {
    border: on ? 'none' : `1px solid ${theme.line}`,
    background: on ? theme.accent : theme.chip,
    color: on ? (isLight ? '#FFF7ED' : '#1C1917') : theme.chipInk,
    borderRadius: 999,
    padding: '0.38rem 0.7rem',
    fontWeight: 800,
    fontSize: '0.78rem',
    lineHeight: 1.25,
    cursor: 'pointer'
  };
}

export default function ReviewSender({ businesses, onAddBusiness, onLogout }) {
  const [locationId, setLocationId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState('');

  const business = businesses[0];
  const locations = businessLocations(business);
  const location = locations.find((item) => item.id === locationId) || locations[0];
  const reviewUrl = location?.reviewUrl || reviewUrlFromPlaceId(location?.placeId);
  const manyLocations = locations.length > 1;
  const useLocationSelect = locations.length > 4;
  const heading = business?.name || '';
  const message = useMemo(
    () =>
      buildReviewMessage({
        guestName,
        businessName: location?.label || 'הצימר',
        reviewUrl
      }),
    [guestName, location?.label, reviewUrl]
  );
  const waPhone = formatPhoneForWhatsApp(phoneNumber);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setError('לא הצלחנו להעתיק. העתיקו ידנית מהתצוגה המקדימה.');
    }
  }

  async function handleCopyLink() {
    if (!reviewUrl) return;
    try {
      await navigator.clipboard.writeText(reviewUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (_) {
      setError('לא הצלחנו להעתיק את הקישור.');
    }
  }

  async function handlePrintQr() {
    if (!reviewUrl) return;
    try {
      await printReviewQr(reviewUrl, location?.label || heading || APP_NAME);
    } catch (_) {
      setError('לא הצלחנו לפתוח הדפסה. אפשר להעתיק את הקישור.');
    }
  }

  function handleSend() {
    if (!business || !reviewUrl) {
      setError('חסר עסק עם כתובת מגוגל מפות. הוסיפו כתובת קודם.');
      return;
    }
    if (!waPhone || waPhone.length < 11) {
      setError('נא להזין מספר טלפון ישראלי תקין.');
      return;
    }
    setError('');
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    const nativeOpen = window.Capacitor?.Plugins?.Browser?.open;
    if (nativeOpen) {
      nativeOpen({ url: waUrl });
      return;
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <ReviewShell tight>
      {({ theme, isLight }) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingLeft: 48 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, lineHeight: 1.25 }}>
                {APP_NAME}
              </h1>
              {heading ? (
                <div style={{ marginTop: 2, fontSize: '0.82rem', fontWeight: 700, color: theme.muted }}>
                  {heading}
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
              <button
                type="button"
                onClick={onAddBusiness}
                style={{
                  border: 'none',
                  background: 'none',
                  color: theme.accent,
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <Plus size={14} />
                כתובות
              </button>
              {onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: theme.muted,
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                >
                  <LogOut size={13} />
                  יציאה
                </button>
              ) : null}
            </div>
          </div>

          {manyLocations ? (
            <>
              <label style={labelStyle(theme)}>כתובת לשליחה</label>
              {useLocationSelect ? (
                <select
                  value={location?.id || ''}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    setError('');
                  }}
                  style={{ ...selectStyle(theme), marginBottom: 12 }}
                >
                  {locations.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {locations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setLocationId(item.id);
                        setError('');
                      }}
                      style={chipStyle(theme, isLight, item.id === location?.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {reviewUrl ? (
            <div
              style={{
                background: theme.well,
                border: `1px solid ${theme.line}`,
                borderRadius: 14,
                padding: '0.9rem 0.85rem 1rem',
                marginBottom: 12,
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: theme.muted, marginBottom: 10 }}>
                QR לדירוג ישיר בגוגל
              </div>
              <ReviewQr value={reviewUrl} size={164} />
              {location?.label ? (
                <div style={{ marginTop: 8, fontSize: '0.82rem', fontWeight: 800 }}>{location.label}</div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    border: `1px solid ${theme.line}`,
                    background: theme.chip,
                    color: theme.chipInk,
                    borderRadius: 999,
                    padding: '0.38rem 0.75rem',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  {copiedLink ? <Check size={13} /> : <Link2 size={13} />}
                  {copiedLink ? 'הקישור הועתק' : 'העתק קישור'}
                </button>
                <button
                  type="button"
                  onClick={handlePrintQr}
                  style={{
                    border: `1px solid ${theme.line}`,
                    background: theme.chip,
                    color: theme.chipInk,
                    borderRadius: 999,
                    padding: '0.38rem 0.75rem',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Printer size={13} />
                  הדפסה
                </button>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label style={labelStyle(theme)}>שם האורח</label>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="דני"
                style={compactField(theme)}
              />
            </div>
            <div>
              <label style={labelStyle(theme)}>טלפון</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} color={theme.muted} style={{ position: 'absolute', top: 13, right: 12 }} />
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="050-1234567"
                  style={{ ...compactField(theme), paddingRight: 34 }}
                />
              </div>
            </div>
          </div>

          {error ? (
            <div style={{ color: theme.error, fontSize: '0.8rem', fontWeight: 700, marginBottom: 10 }}>{error}</div>
          ) : null}

          <div
            style={{
              background: theme.well,
              border: `1px solid ${theme.line}`,
              borderRadius: 14,
              padding: '0.75rem 0.85rem',
              marginBottom: 12
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: theme.muted }}>תצוגה מקדימה</span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  border: 'none',
                  background: 'none',
                  color: theme.accent,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.75rem'
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'הועתק' : 'העתק הודעה'}
              </button>
            </div>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.5, color: theme.chipInk }}>
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSend}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 14,
              padding: '0.85rem',
              background: '#25D366',
              color: '#FFF',
              fontWeight: 900,
              fontSize: '0.98rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            <Send size={16} />
            שלח עכשיו ב-WhatsApp
          </button>
        </div>
      )}
    </ReviewShell>
  );
}
