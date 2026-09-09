import React, { useEffect, useRef } from 'react';
import { unitCalendarLines } from '../lib/units';
import { dateStrip, isCabinDateBlocked } from '../lib/agentAvailability';

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

export default function AgentOccupancyGrid({
  units,
  blocked,
  selectedIds,
  checkIn,
  checkOut,
  fromIso,
  today,
  days = 90,
  onToggleCabin,
  onPickDate
}) {
  const cols = dateStrip(fromIso, days);
  const scroller = useRef(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollLeft = 0;
  }, [fromIso, units.length]);

  return (
    <div dir="rtl" className="flex max-h-[32rem] overflow-y-auto overflow-x-hidden rounded-xl border border-stone-300 bg-white">
      <div className="z-30 w-[6.75rem] shrink-0 border-l border-stone-300 bg-white">
        <div className="sticky top-0 z-40 grid h-12 place-items-center bg-stone-100 text-[11px] font-black text-stone-500 border-b border-stone-300">
          יחידות
        </div>
        {units.map((unit) => {
          const picked = selectedIds.includes(unit.cabin_id);
          const lines = unitCalendarLines(unit.cabin_name);
          return (
            <button
              key={unit.cabin_id}
              type="button"
              onClick={() => onToggleCabin(unit.cabin_id)}
              title={picked ? 'לחצו שוב כדי לבטל בחירה' : unit.cabin_name}
              className={`grid h-12 w-full place-items-center px-1 text-center border-b border-stone-200 ${
                picked ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900'
              }`}
            >
              {lines.primary ? <div className="text-[10px] font-extrabold leading-none truncate w-full">{lines.primary}</div> : null}
              <div className="text-[12px] font-black leading-tight truncate w-full">{lines.secondary || unit.cabin_name || unit.cabin_id}</div>
              {picked ? <div className="text-[9px] font-black leading-none">✕ בטל</div> : null}
            </button>
          );
        })}
      </div>

      <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
        <div className="min-w-max">
          <div className="sticky top-0 z-20 flex">
            {cols.map((col) => {
              const inStay = Boolean(checkIn && checkOut && col.iso >= checkIn && col.iso < checkOut);
              const isOut = col.iso === checkOut;
              const monthStart = col.day === 1;
              return (
                <button
                  key={col.iso}
                  id={`agent-col-${col.iso}`}
                  type="button"
                  onClick={() => onPickDate(col.iso)}
                  className={`h-12 w-12 shrink-0 px-0.5 text-center border-b border-l border-stone-300 ${
                    col.iso === today ? 'bg-amber-100' : inStay || isOut ? 'bg-emerald-100' : monthStart ? 'bg-stone-200' : 'bg-stone-50'
                  }`}
                >
                  {monthStart ? <div className="text-[9px] font-black text-amber-800">{MONTHS[col.month - 1]}</div> : <div className="text-[10px] text-stone-500">{col.weekday}</div>}
                  <div className="text-xs font-black text-slate-900">{col.day}</div>
                </button>
              );
            })}
          </div>
          {units.map((unit) => {
            const picked = selectedIds.includes(unit.cabin_id);
            return (
              <div key={unit.cabin_id} className="flex">
                {cols.map((col) => {
                  const taken = isCabinDateBlocked(blocked, unit.cabin_id, col.iso);
                  const past = col.iso < today;
                  const inStay = Boolean(picked && checkIn && checkOut && col.iso >= checkIn && col.iso < checkOut);
                  const tone = inStay
                    ? 'agent-cell-stay'
                    : past && taken
                      ? 'agent-cell-past-taken'
                      : past
                        ? 'agent-cell-past-free'
                        : taken
                          ? 'agent-cell-taken'
                          : 'agent-cell-free';
                  return (
                    <button
                      key={`${unit.cabin_id}-${col.iso}`}
                      type="button"
                      disabled={past}
                      onClick={() => {
                        if (!picked) onToggleCabin(unit.cabin_id);
                        onPickDate(col.iso);
                      }}
                      className={`h-12 w-12 shrink-0 border-b border-l border-white/50 text-[11px] font-black leading-none ${tone}`}
                      title={taken ? 'תפוס' : 'פנוי'}
                    >
                      {inStay ? '✓' : taken ? 'ת' : past ? '' : 'פ'}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
