import React, { useEffect, useState } from 'react';
import { fetchKinorotAudit } from '../lib/kinorotAuditApi';
import { displayAuditRow } from '../lib/kinorotAudit';
import { DEFAULT_RESORT_UNITS, unitFullName, visibleInventory } from '../lib/units';

const ACTION_HE = {
  note: 'הערה',
  block: 'חסימה',
  create: 'יצירה',
  shorten: 'קיצור',
  move: 'העברה',
  cancel: 'ביטול',
  status: 'עדכון',
};

function actorLabel(actor) {
  if (actor === 'kinorot_external') return 'כינורות (חיצוני)';
  if (actor === 'natasha') return 'נטשה';
  if (actor === 'system') return 'מערכת';
  return actor || '—';
}

export default function KinorotAuditPanel({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guest, setGuest] = useState('');

  const unitNameById = React.useMemo(() => {
    const map = {};
    for (const unit of visibleInventory(DEFAULT_RESORT_UNITS) || []) {
      map[unit.id] = unitFullName(unit) || unit.name || unit.id;
    }
    return map;
  }, []);

  const load = async (guestFilter = guest) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchKinorotAudit({ limit: 40, guest: guestFilter || undefined });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || 'שגיאה');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-3" dir="rtl">
      <div className="w-full max-w-xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="font-semibold text-slate-900">יומן פעולות כינורות</div>
            <div className="text-xs text-slate-500">קריאה בלבד · מה שעשינו ומה שזוהה מבחוץ</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-sm bg-slate-100">סגור</button>
        </div>
        <form
          className="flex gap-2 px-4 py-3 border-b"
          onSubmit={(e) => { e.preventDefault(); load(guest); }}
        >
          <input
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            placeholder="חיפוש לפי שם אורח"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm">חפש</button>
        </form>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && <div className="text-sm text-slate-500">טוען…</div>}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="text-sm text-slate-500">אין רשומות עדיין (אחרי מיגרציה וכתיבות).</div>
          )}
          {rows.map((row) => {
            const shown = displayAuditRow(row, unitNameById);
            const when = shown.ts
              ? new Date(shown.ts).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
              : '—';
            return (
              <div key={row.id || `${row.ts}-${row.action}-${shown.guest_name}`} className="rounded-xl border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{when}</span>
                  <span>{actorLabel(shown.actor)}</span>
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {ACTION_HE[shown.action] || shown.action} · {shown.guest_name}
                </div>
                <div className="text-xs text-slate-600">
                  {[shown.unit_name, shown.dates].filter(Boolean).join(' · ')}
                </div>
                {!shown.success && shown.error && (
                  <div className="mt-1 text-xs text-red-600">{shown.error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
