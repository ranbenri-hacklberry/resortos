import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from '../lib/lucide-reviews.js';
import { AUTH_ERRORS, searchReviewPlaces } from '../lib/reviewAuth.js';
import { fieldStyle } from '../lib/reviewTheme.js';

export default function PlaceSearch({ theme, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (selected?.placeId || q.length < 2) {
      setRows([]);
      setBusy(false);
      return undefined;
    }
    const id = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchReviewPlaces(q);
        if (seq.current !== id) return;
        setError('');
        setRows(data.suggestions || []);
      } catch (err) {
        if (seq.current !== id) return;
        setRows([]);
        setError(AUTH_ERRORS[err.message] || AUTH_ERRORS.MAPS_UNAVAILABLE);
      } finally {
        if (seq.current === id) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query, selected?.placeId]);

  if (selected?.placeId) {
    return (
      <div
        style={{
          border: `1px solid ${theme.line}`,
          background: theme.well,
          borderRadius: 14,
          padding: '0.85rem 0.95rem'
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ color: theme.accent, marginTop: 2 }}>
            <MapPin size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{selected.name}</div>
            {selected.address ? (
              <div style={{ color: theme.muted, fontSize: '0.8rem', marginTop: 2, lineHeight: 1.45 }}>
                {selected.address}
              </div>
            ) : null}
            <div style={{ color: theme.faint, fontSize: '0.72rem', marginTop: 6 }}>
              מחובר לגוגל מפות · קישור הדירוג נוצר אוטומטית
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery('');
            setRows([]);
            setError('');
          }}
          style={{
            marginTop: 10,
            border: 'none',
            background: 'transparent',
            color: theme.accent,
            fontWeight: 800,
            cursor: 'pointer',
            padding: 0
          }}
        >
          חיפוש כתובת אחרת
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפשו את העסק בגוגל מפות"
          autoComplete="off"
          style={{ ...fieldStyle(theme), paddingInlineStart: '2.4rem' }}
        />
        <span
          style={{
            position: 'absolute',
            insetInlineStart: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.faint,
            display: 'flex'
          }}
        >
          <Search size={15} />
        </span>
      </div>
      {busy ? (
        <div style={{ fontSize: '0.75rem', color: theme.muted, marginTop: 6 }}>מחפש בגוגל מפות…</div>
      ) : null}
      {error ? (
        <div style={{ fontSize: '0.78rem', color: theme.error, fontWeight: 700, marginTop: 6 }}>{error}</div>
      ) : null}
      {rows.length ? (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${theme.line}`,
            borderRadius: 14,
            overflow: 'hidden',
            background: theme.input
          }}
        >
          {rows.map((row) => (
            <button
              key={row.placeId}
              type="button"
              onClick={() => {
                onSelect(row);
                setQuery('');
                setRows([]);
              }}
              style={{
                width: '100%',
                textAlign: 'right',
                border: 'none',
                borderBottom: `1px solid ${theme.line}`,
                background: 'transparent',
                color: theme.ink,
                padding: '0.75rem 0.9rem',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{row.name}</div>
              {row.address ? (
                <div style={{ color: theme.muted, fontSize: '0.75rem', marginTop: 2 }}>{row.address}</div>
              ) : null}
            </button>
          ))}
          <div style={{ padding: '0.5rem 0.8rem', display: 'flex', justifyContent: 'flex-end' }}>
            <img
              alt="powered by Google"
              src={
                theme.page === '#0C0A09'
                  ? 'https://developers.google.com/static/maps/documentation/images/powered_by_google_on_non_white.png'
                  : 'https://developers.google.com/static/maps/documentation/images/powered_by_google_on_white.png'
              }
              style={{ height: 14 }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
