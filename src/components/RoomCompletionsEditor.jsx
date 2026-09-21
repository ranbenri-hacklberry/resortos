import React, { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { SHORTAGE_CHIPS } from '../lib/fieldStaff';
import { addCompletion, removeCompletion, toggleCompletion } from '../lib/roomCompletions';

export default function RoomCompletionsEditor({
  items = [],
  chips = SHORTAGE_CHIPS,
  isLight = true,
  textColor,
  mutedColor,
  lineColor,
  onChange
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const list = Array.isArray(items) ? items : [];
  const muted = mutedColor || (isLight ? '#64748B' : '#94A3B8');
  const text = textColor || (isLight ? '#1C1917' : '#F8FAFC');
  const line = lineColor || (isLight ? 'rgba(28,25,23,0.12)' : 'rgba(255,255,255,0.12)');

  const commit = (value) => {
    const next = addCompletion(list, value);
    if (next === list || next.length === list.length) return;
    onChange?.(next);
    setDraft('');
    setAdding(false);
  };

  return (
    <div onClick={(event) => event.stopPropagation()} style={{ marginTop: 4 }}>
      {list.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 40
              }}
            >
              <button
                type="button"
                onClick={() => onChange?.(toggleCompletion(list, row.id))}
                aria-label={row.done ? `בוצע: ${row.text}` : `סמן בוצע: ${row.text}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: row.done ? 'none' : `1.5px solid ${line}`,
                  background: row.done ? '#10B981' : 'transparent',
                  color: '#FFF',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 28px'
                }}
              >
                {row.done ? <Check size={14} strokeWidth={3} /> : null}
              </button>
              <span style={{
                flex: 1,
                fontSize: '0.92rem',
                fontWeight: 800,
                color: text,
                textDecoration: row.done ? 'line-through' : 'none',
                opacity: row.done ? 0.55 : 1
              }}>
                {row.text}
              </span>
              <button
                type="button"
                onClick={() => onChange?.(removeCompletion(list, row.id))}
                aria-label={`הסר ${row.text}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: muted,
                  cursor: 'pointer',
                  padding: 4,
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: muted, marginBottom: 8 }}>
          אין השלמות ברשימה עדיין
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map((chip) => (
              <button
                key={chip.key || chip.value}
                type="button"
                onClick={() => commit(chip.value)}
                style={{
                  border: `1px solid ${line}`,
                  background: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)',
                  color: text,
                  borderRadius: 999,
                  padding: '6px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {chip.value}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commit(draft);
            }}
            style={{ display: 'flex', gap: 6, marginTop: 8 }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="פריט נוסף…"
              autoFocus
              style={{
                flex: 1,
                minHeight: 42,
                borderRadius: 10,
                border: `1px solid ${line}`,
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                color: text,
                fontWeight: 700,
                fontSize: '0.84rem',
                padding: '0 10px',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="submit"
              aria-label="הוסף"
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                border: 'none',
                background: '#10B981',
                color: '#FFF',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Plus size={18} strokeWidth={3} />
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setDraft('');
            }}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              color: muted,
              fontWeight: 800,
              fontSize: '0.78rem',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ביטול
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            marginTop: 10,
            width: '100%',
            minHeight: 44,
            borderRadius: 12,
            border: `1.5px dashed ${line}`,
            background: isLight ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)',
            color: '#0F766E',
            fontWeight: 800,
            fontSize: '0.88rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <Plus size={16} strokeWidth={3} />
          הוספת השלמה
        </button>
      )}
    </div>
  );
}
