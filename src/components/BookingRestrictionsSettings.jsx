import React, { useEffect, useState } from 'react';
import { PROPERTY_SEED } from '../lib/guestProfileSeed';
import {
  deleteBookingRestriction,
  listBookingRestrictions,
  saveBookingRestriction
} from '../lib/bookingRestrictions';

const EMPTY = {
  id: null,
  name: '',
  start_date: '',
  end_date: '',
  min_nights: 2,
  closed_to_arrival: false,
  closed_to_departure: false,
  price_multiplier: 1,
  property_id: '',
  is_active: true
};

const PROPERTIES = Object.values(PROPERTY_SEED).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

export default function BookingRestrictionsSettings({ tenantId, isLight, t }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    setError('');
    try {
      setRows(await listBookingRestrictions(tenantId));
    } catch {
      setError(t('SETTINGS_RESTRICTIONS_LOAD_ERROR', 'לא ניתן לטעון את ההגבלות. הריצו את המיגרציה בסטודיו.'));
    }
  }

  useEffect(() => {
    reload();
  }, [tenantId]);

  function edit(row) {
    setForm({
      ...EMPTY,
      ...row,
      property_id: row.property_id || '',
      price_multiplier: Number(row.price_multiplier) || 1
    });
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveBookingRestriction(tenantId, form);
      setForm(EMPTY);
      await reload();
    } catch (err) {
      if (err?.message === 'MISSING_NAME') setError(t('SETTINGS_RESTRICTIONS_NEED_NAME', 'חסר שם להגבלה.'));
      else if (err?.message === 'BAD_DATES') setError(t('SETTINGS_RESTRICTIONS_BAD_DATES', 'טווח התאריכים לא תקין.'));
      else setError(t('SETTINGS_RESTRICTIONS_SAVE_ERROR', 'לא ניתן לשמור את ההגבלה.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm(t('SETTINGS_RESTRICTIONS_DELETE_CONFIRM', 'למחוק את ההגבלה?'))) return;
    setBusy(true);
    try {
      await deleteBookingRestriction(id);
      if (form.id === id) setForm(EMPTY);
      await reload();
    } catch {
      setError(t('SETTINGS_RESTRICTIONS_SAVE_ERROR', 'לא ניתן לשמור את ההגבלה.'));
    } finally {
      setBusy(false);
    }
  }

  const input = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '0.5rem 0.7rem',
    borderRadius: 8,
    background: isLight ? '#FAF8F3' : '#111827',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
    color: isLight ? '#1C1917' : '#F8FAFC',
    fontSize: '0.8rem',
    fontWeight: 700
  };

  return (
    <div>
      <p style={{ fontSize: '0.76rem', color: '#94A3B8', lineHeight: 1.45, margin: '0 0 12px' }}>
        {t('SETTINGS_RESTRICTIONS_HELP', 'חגים ומועדים: מינימום לילות, איסור כניסה/יציאה, ומקדם מחיר. ריק במתחם = חל על כולם.')}
      </p>

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <input
          required
          placeholder={t('SETTINGS_RESTRICTIONS_NAME', 'שם (ראש השנה, סופ״ש…)')}
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          style={input}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 800 }}>
            {t('SETTINGS_RESTRICTIONS_FROM', 'מתאריך')}
            <input type="date" required value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} style={{ ...input, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: '0.7rem', fontWeight: 800 }}>
            {t('SETTINGS_RESTRICTIONS_TO', 'עד תאריך')}
            <input type="date" required value={form.end_date} onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))} style={{ ...input, marginTop: 4 }} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 800 }}>
            {t('SETTINGS_RESTRICTIONS_MIN', 'מינ׳ לילות')}
            <input type="number" min="1" value={form.min_nights} onChange={(e) => setForm((prev) => ({ ...prev, min_nights: Number(e.target.value) }))} style={{ ...input, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: '0.7rem', fontWeight: 800 }}>
            {t('SETTINGS_RESTRICTIONS_MULT', 'מקדם מחיר')}
            <input type="number" min="0.01" step="0.05" value={form.price_multiplier} onChange={(e) => setForm((prev) => ({ ...prev, price_multiplier: Number(e.target.value) }))} style={{ ...input, marginTop: 4 }} />
          </label>
        </div>
        <select
          value={form.property_id}
          onChange={(e) => setForm((prev) => ({ ...prev, property_id: e.target.value }))}
          style={input}
        >
          <option value="">{t('SETTINGS_RESTRICTIONS_ALL', 'כל המתחמים')}</option>
          {PROPERTIES.map((property) => (
            <option key={property.id} value={property.id}>{property.name} · {property.village}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700 }}>
          <input type="checkbox" checked={form.closed_to_arrival} onChange={(e) => setForm((prev) => ({ ...prev, closed_to_arrival: e.target.checked }))} />
          {t('SETTINGS_RESTRICTIONS_CTA', 'איסור צ׳ק-אין (CTA)')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700 }}>
          <input type="checkbox" checked={form.closed_to_departure} onChange={(e) => setForm((prev) => ({ ...prev, closed_to_departure: e.target.checked }))} />
          {t('SETTINGS_RESTRICTIONS_CTD', 'איסור צ׳ק-אאוט (CTD)')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
          {t('SETTINGS_RESTRICTIONS_ACTIVE', 'פעיל')}
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="submit" disabled={busy} style={{ flex: 1, border: 'none', borderRadius: 10, padding: '0.65rem', fontWeight: 800, cursor: 'pointer', background: '#6366F1', color: '#FFF' }}>
            {form.id ? t('SETTINGS_STAFF_SAVE', 'שמור פרטים') : t('SETTINGS_RESTRICTIONS_ADD', 'הוספת הגבלה')}
          </button>
          {form.id ? (
            <button type="button" onClick={() => setForm(EMPTY)} style={{ border: 'none', borderRadius: 10, padding: '0.65rem 0.8rem', fontWeight: 800, cursor: 'pointer', background: isLight ? '#EAE5DD' : '#0F172A', color: 'inherit' }}>
              {t('SETTINGS_STAFF_CANCEL', 'ביטול')}
            </button>
          ) : null}
        </div>
        {error ? <p style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700, margin: 0 }}>{error}</p> : null}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              border: `1px solid ${isLight ? '#E7E0D6' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 12,
              padding: '0.7rem 0.8rem',
              opacity: row.is_active ? 1 : 0.55
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{row.name}</div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4, lineHeight: 1.45 }}>
              {row.start_date} → {row.end_date}
              {' · '}
              {row.min_nights} {t('SETTINGS_RESTRICTIONS_NIGHTS', 'לילות')}
              {Number(row.price_multiplier) !== 1 ? ` · ×${row.price_multiplier}` : ''}
              {row.closed_to_arrival ? ` · ${t('SETTINGS_RESTRICTIONS_CTA_SHORT', 'CTA')}` : ''}
              {row.closed_to_departure ? ` · ${t('SETTINGS_RESTRICTIONS_CTD_SHORT', 'CTD')}` : ''}
              <div>{row.property_id ? (PROPERTY_SEED[row.property_id]?.name || row.property_id) : t('SETTINGS_RESTRICTIONS_ALL', 'כל המתחמים')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => edit(row)} style={{ border: 'none', background: 'none', color: '#6366F1', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}>
                {t('SETTINGS_STAFF_EDIT', 'עריכה')}
              </button>
              <button type="button" onClick={() => remove(row.id)} style={{ border: 'none', background: 'none', color: '#F87171', fontWeight: 800, cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}>
                {t('SETTINGS_RESTRICTIONS_DELETE', 'מחיקה')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
