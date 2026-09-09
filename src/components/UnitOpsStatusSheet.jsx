import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { UNIT_OPS_CHOICES, UNIT_STATUS_BADGES, isEffectivelyOccupied, unitDisplayStatus } from '../lib/unitStatus';

export default function UnitOpsStatusSheet({
  unit,
  bookings,
  unitName,
  isLight,
  themeStyles,
  onClose,
  onPick,
  onOccupancy
}) {
  if (!unit || typeof document === 'undefined') return null;
  const occupied = isEffectivelyOccupied(unit, bookings);
  const shown = unitDisplayStatus(unit, bookings);
  const current = unit.operational_status || 'READY';

  const sheet = (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0.75rem'
      }}
    >
      <div
        role="dialog"
        aria-label={`סטטוס ${unitName}`}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: themeStyles.wrapperBg,
          border: `1px solid ${themeStyles.inputBorder}`,
          borderRadius: 20,
          padding: '1rem 1rem 1.15rem',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.28)',
          color: themeStyles.textPrimary
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: themeStyles.textMuted }}>סטטוס בקתה</div>
            <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.2rem' }}>{unitName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{ background: 'none', border: 'none', color: themeStyles.textMuted, cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: shown.color,
            background: shown.bg,
            borderRadius: 999,
            padding: '3px 9px'
          }}>
            {shown.label}
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 12
        }}>
          {[{
            key: 'VACANT',
            label: 'פנוי',
            hint: 'אפשר כניסה / מכירה',
            color: '#10B981',
            bg: 'rgba(16, 185, 129, 0.16)',
            selected: !occupied
          }, {
            key: 'OCCUPIED',
            label: 'תפוס',
            hint: 'יש אורח בחדר',
            color: '#8B5CF6',
            bg: 'rgba(139, 92, 246, 0.16)',
            selected: occupied
          }].map((choice) => (
            <button
              key={choice.key}
              type="button"
              onClick={() => onOccupancy(choice.key)}
              style={{
                minHeight: 64,
                textAlign: 'right',
                borderRadius: 14,
                border: choice.selected ? `2px solid ${choice.color}` : `1px solid ${themeStyles.inputBorder}`,
                background: choice.selected ? choice.bg : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                color: themeStyles.textPrimary,
                cursor: 'pointer',
                padding: '0.65rem 0.8rem',
                fontWeight: 800
              }}
            >
              <div style={{ fontSize: '1.05rem', color: choice.color }}>{choice.label}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted, marginTop: 3 }}>
                {choice.hint}
              </div>
            </button>
          ))}
        </div>

        <div style={{
          marginTop: 14,
          marginBottom: 6,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: themeStyles.textMuted
        }}>
          ניקיון ותקלות
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8
        }}>
          {UNIT_OPS_CHOICES.map((choice) => {
            const badge = UNIT_STATUS_BADGES[choice.key];
            const selected = current === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                onClick={() => onPick(choice.key)}
                style={{
                  minHeight: 72,
                  textAlign: 'right',
                  borderRadius: 14,
                  border: selected ? `2px solid ${badge.color}` : `1px solid ${themeStyles.inputBorder}`,
                  background: selected
                    ? badge.bg
                    : (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)'),
                  color: themeStyles.textPrimary,
                  cursor: 'pointer',
                  padding: '0.7rem 0.8rem',
                  fontWeight: 800
                }}
              >
                <div style={{ fontSize: '1rem', color: badge.color }}>{badge.label}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: themeStyles.textMuted, marginTop: 3 }}>
                  {choice.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
