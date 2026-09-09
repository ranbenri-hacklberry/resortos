import React from 'react';
import { useTranslation } from 'react-i18next';
import { unitFullName } from '../lib/units';

function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${Number(d)}.${Number(m)}`;
}

function stayLine(row) {
  return `${formatDay(row.check_in_date)}–${formatDay(row.check_out_date)}`;
}

function fieldLabel(t, field) {
  if (field === 'check_in') return t('KINOROT_FIELD_IN');
  if (field === 'check_out') return t('KINOROT_FIELD_OUT');
  if (field === 'unit') return t('KINOROT_FIELD_UNIT');
  if (field === 'guest') return t('KINOROT_FIELD_GUEST');
  return field;
}

function formatFieldValue(field, value) {
  if (field === 'unit') return unitFullName(value, value);
  if (field === 'check_in' || field === 'check_out') return formatDay(value);
  return value || '—';
}

function ChangeList({ title, rows, tone, childrenFor }) {
  if (!rows?.length) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <div style={{
        fontWeight: 900,
        fontSize: '0.82rem',
        color: tone,
        marginBottom: 8
      }}>
        {title} · {rows.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto' }}>
        {rows.slice(0, 40).map((row) => (
          <div
            key={row.id}
            style={{
              border: '1px solid currentColor',
              borderColor: 'rgba(148,163,184,0.25)',
              borderRadius: 12,
              padding: '10px 12px'
            }}
          >
            <div style={{ fontWeight: 800 }}>{row.guest_name || 'אורח'}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, opacity: 0.75, marginTop: 2 }}>
              {unitFullName(row.unit_id, row.unit_id)} · {stayLine(row)}
            </div>
            {childrenFor?.(row)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function KinorotSyncChangesModal({ theme = 'dark', changes, onClose }) {
  const { t } = useTranslation();
  const isLight = theme === 'light';
  const created = changes?.created || [];
  const updated = changes?.updated || [];
  const removed = changes?.removed || [];

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        role="dialog"
        aria-label={t('KINOROT_CHANGES_TITLE')}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '86dvh',
          overflow: 'auto',
          background: isLight ? '#FAF8F3' : '#141416',
          color: isLight ? '#1C1917' : '#F8FAFC',
          borderRadius: 20,
          padding: '1.2rem 1.15rem 1.15rem',
          border: isLight ? '1px solid rgba(28,25,23,0.08)' : '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('KINOROT_CHANGES_TITLE')}</h2>
        <p style={{ margin: '8px 0 0', color: isLight ? '#57534E' : '#94A3B8', fontWeight: 700, fontSize: '0.86rem' }}>
          {t('KINOROT_CHANGES_HINT')}
        </p>

        <ChangeList title={t('KINOROT_CHANGES_NEW')} rows={created} tone="#10B981" />
        <ChangeList
          title={t('KINOROT_CHANGES_UPDATED')}
          rows={updated}
          tone="#F59E0B"
          childrenFor={(row) => (
            <div style={{ marginTop: 6, fontSize: '0.78rem', fontWeight: 700 }}>
              {(row.fields || []).map((item) => (
                <div key={`${row.id}-${item.field}`}>
                  {fieldLabel(t, item.field)}: {formatFieldValue(item.field, item.from)} → {formatFieldValue(item.field, item.to)}
                </div>
              ))}
            </div>
          )}
        />
        <ChangeList title={t('KINOROT_CHANGES_REMOVED')} rows={removed} tone="#EF4444" />

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            minHeight: 48,
            marginTop: 18,
            border: 'none',
            borderRadius: 12,
            background: '#6366F1',
            color: '#FFF',
            fontWeight: 900,
            cursor: 'pointer'
          }}
        >
          {t('KINOROT_CHANGES_ACK')}
        </button>
      </div>
    </div>
  );
}
