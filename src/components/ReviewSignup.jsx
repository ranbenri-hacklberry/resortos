import React, { useState } from 'react';
import { Plus, Sparkles, Trash2 } from '../lib/lucide-reviews.js';
import {
  MAX_LOCATIONS,
  businessLocations,
  makeLocation,
  normalizeBusiness
} from '../lib/reviewDispatch.js';
import { APP_NAME } from '../lib/reviewBrand.js';
import { fieldStyle, labelStyle } from '../lib/reviewTheme.js';
import { readDemoPlace } from '../lib/reviewLead.js';
import PlaceSearch from './PlaceSearch.jsx';
import ReviewShell from './ReviewShell.jsx';

function emptyAddress() {
  return { id: '', label: '', placeId: '', name: '', address: '' };
}

function fromBusiness(business) {
  const rows = businessLocations(business).map((loc) => ({
    id: loc.id,
    label: loc.label,
    placeId: loc.placeId,
    name: loc.label,
    address: ''
  }));
  if (rows.length) return rows;
  const demo = readDemoPlace();
  if (demo?.placeId) {
    return [{
      id: '',
      label: demo.label || demo.name || '',
      placeId: demo.placeId,
      name: demo.name || demo.label || '',
      address: demo.address || ''
    }];
  }
  return [emptyAddress()];
}

export default function ReviewSignup({ business = null, onSaved, onOpenSend }) {
  const editing = Boolean(business);
  const demo = !business ? readDemoPlace() : null;
  const [name, setName] = useState(business?.name || demo?.name || '');
  const [addresses, setAddresses] = useState(() => fromBusiness(business));
  const [error, setError] = useState('');
  const filled = addresses.filter((row) => row.placeId).length;

  function setAddress(index, patch) {
    setAddresses((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeAddress(index) {
    setAddresses((rows) => {
      const next = rows.filter((_, i) => i !== index);
      return next.length ? next : [emptyAddress()];
    });
    setError('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('נא למלא את שם העסק כפי שיופיע בהודעה לאורח.');
      return;
    }
    const locations = [];
    for (const row of addresses) {
      if (!row.placeId) {
        if (!row.label.trim() && !row.name.trim()) continue;
        setError('בחרו כתובת מתוצאות גוגל מפות, או מחקו את השורה הריקה.');
        return;
      }
      locations.push(makeLocation({
        id: row.id,
        label: row.label.trim() || row.name || row.address,
        placeId: row.placeId
      }));
    }
    if (!locations.length) {
      setError('נדרשת לפחות כתובת אחת.');
      return;
    }
    const saved = normalizeBusiness({
      id: business?.id,
      name: cleanName,
      locations
    });
    if (!saved) {
      setError('לא הצלחנו לשמור. בחרו שוב מגוגל מפות.');
      return;
    }
    onSaved(saved);
  }

  return (
    <ReviewShell>
      {({ theme, isLight }) => (
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 18,
                margin: '0 auto 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: theme.accentSoft,
                color: theme.accent
              }}
            >
              <Sparkles size={22} />
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: theme.accent, marginBottom: 6 }}>
              {APP_NAME}
            </div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900 }}>
              {editing ? 'עריכת כתובות' : 'הקמת עסק'}
            </h1>
            <p style={{ margin: '6px 0 0', color: theme.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>
              עסק אחד, עד {MAX_LOCATIONS} כתובות. חפשו בגוגל מפות.
            </p>
          </div>

          <label style={labelStyle(theme)}>שם העסק</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: כיפת שמיים"
            style={{ ...fieldStyle(theme), marginBottom: 14 }}
          />

          <div style={{ fontSize: '0.8rem', color: theme.muted, marginBottom: 12 }}>
            {filled} מתוך {MAX_LOCATIONS} כתובות
          </div>

          {addresses.map((row, index) => (
            <div key={row.id || `new-${index}`} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle(theme), marginBottom: 0 }}>כתובת {index + 1}</label>
                {addresses.length > 1 || row.placeId ? (
                  <button
                    type="button"
                    onClick={() => removeAddress(index)}
                    aria-label="מחיקת כתובת"
                    style={{
                      border: 'none',
                      background: 'none',
                      color: theme.error,
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Trash2 size={14} />
                    מחיקה
                  </button>
                ) : null}
              </div>
              <PlaceSearch
                theme={theme}
                selected={row.placeId ? row : null}
                onSelect={(place) => {
                  if (!place) {
                    setAddress(index, emptyAddress());
                    return;
                  }
                  setAddress(index, {
                    id: row.id,
                    placeId: place.placeId,
                    name: place.name,
                    address: place.address,
                    label: row.label.trim() || place.label || place.name
                  });
                  if (!name.trim()) setName(place.name);
                  setError('');
                }}
              />
              {row.placeId ? (
                <>
                  <label style={{ ...labelStyle(theme), marginTop: 10 }}>שם קצר בהודעה לאורח</label>
                  <input
                    value={row.label}
                    onChange={(e) => setAddress(index, { label: e.target.value })}
                    placeholder="למשל: רמות / טבריה"
                    style={fieldStyle(theme)}
                  />
                </>
              ) : null}
            </div>
          ))}

          {addresses.length < MAX_LOCATIONS ? (
            <button
              type="button"
              onClick={() => setAddresses((rows) => [...rows, emptyAddress()])}
              style={{
                width: '100%',
                marginBottom: 14,
                border: `1px dashed ${theme.line}`,
                borderRadius: 12,
                padding: '0.7rem',
                background: 'transparent',
                color: theme.accent,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Plus size={15} />
              הוספת כתובת נוספת
            </button>
          ) : (
            <div style={{ fontSize: '0.78rem', color: theme.muted, marginBottom: 14 }}>
              הגעתם למקסימום {MAX_LOCATIONS} כתובות.
            </div>
          )}

          {error ? (
            <div style={{ color: theme.error, fontSize: '0.8rem', fontWeight: 700, marginBottom: 12 }}>{error}</div>
          ) : null}

          <button
            type="submit"
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 16,
              padding: '0.95rem',
              background: theme.accent,
              color: isLight ? '#FFF7ED' : '#1C1917',
              fontWeight: 900,
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            שמירת כתובות
          </button>

          {editing ? (
            <button
              type="button"
              onClick={onOpenSend}
              style={{
                width: '100%',
                marginTop: 10,
                border: `1px solid ${theme.line}`,
                borderRadius: 16,
                padding: '0.75rem',
                background: 'transparent',
                color: theme.muted,
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              חזרה לשליחה
            </button>
          ) : null}
        </form>
      )}
    </ReviewShell>
  );
}
