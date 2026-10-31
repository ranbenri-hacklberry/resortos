import React from 'react';
import { ShieldCheck, Check, X, AlertTriangle, Send } from 'lucide-react';

export function ConfirmationCard({ data, onConfirm, onCancel, isExecuting }) {
  if (!data) return null;

  return (
    <div style={{
      marginTop: '0.65rem',
      background: '#FFFDF9',
      border: '1.5px solid rgba(197, 160, 89, 0.45)',
      borderRadius: '12px',
      padding: '0.85rem',
      boxShadow: '0 4px 16px rgba(197, 160, 89, 0.12)',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Title + Action Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 900, color: '#26130F', fontSize: '0.85rem' }}>
          <ShieldCheck size={16} color="#C5A059" />
          <span>{data.title || 'אישור פעולה'}</span>
        </div>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 800,
          background: 'rgba(197, 160, 89, 0.15)',
          color: '#8C6B28',
          padding: '0.15rem 0.45rem',
          borderRadius: '999px'
        }}>
          דרוש אישור מנהל
        </span>
      </div>

      {/* Recipient / Target */}
      {data.recipient && (
        <div style={{ fontSize: '0.76rem', color: '#736055' }}>
          <strong style={{ color: '#26130F' }}>נמען: </strong>
          <span>{data.recipient}</span>
        </div>
      )}

      {/* Preview Box */}
      {data.previewText && (
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(197, 160, 89, 0.25)',
          borderRadius: '8px',
          padding: '0.6rem 0.75rem',
          fontSize: '0.78rem',
          color: '#26130F',
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap'
        }}>
          {data.previewText}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '0.45rem',
        marginTop: '0.2rem'
      }}>
        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onConfirm && onConfirm(data)}
          style={{
            background: 'linear-gradient(135deg, #C5A059, #9E7D3B)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            padding: '0.55rem',
            fontSize: '0.78rem',
            fontWeight: 800,
            cursor: isExecuting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
            boxShadow: '0 2px 8px rgba(197, 160, 89, 0.25)'
          }}
        >
          {isExecuting ? (
            <span>מבצע...</span>
          ) : (
            <>
              <Check size={14} />
              <span>אשר ובצע פעולה</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isExecuting}
          onClick={() => onCancel && onCancel()}
          style={{
            background: '#FAF8F3',
            color: '#736055',
            border: '1px solid rgba(197, 160, 89, 0.3)',
            borderRadius: '8px',
            padding: '0.55rem',
            fontSize: '0.78rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem'
          }}
        >
          <X size={14} />
          <span>בטל</span>
        </button>
      </div>
    </div>
  );
}
