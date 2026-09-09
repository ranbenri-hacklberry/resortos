import React from 'react';
import { cabinCatalog } from '../lib/cabinCatalog';
import { defaultCabinParty } from '../lib/cabinParty';

function Stepper({ label, value, min, max, onChange }) {
  return (
    <label className="grid gap-0.5 text-[10px] font-bold text-stone-500">
      {label}
      <div className="flex items-center gap-0.5">
        <button type="button" className="h-8 w-8 rounded-lg border border-stone-300 bg-white font-black" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="w-6 text-center text-sm font-black text-slate-900">{value}</span>
        <button type="button" className="h-8 w-8 rounded-lg border border-stone-300 bg-white font-black" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </label>
  );
}

export default function AgentCabinGuests({ cabinIds, parties, onChange, onRemove, bookerName, bookerPhone }) {
  if (!cabinIds?.length) {
    return <p className="mt-3 text-sm font-bold text-amber-800">בחרו בקתה ביומן ואז פרטו כמה אורחים בכל אחת.</p>;
  }
  const multi = cabinIds.length > 1;

  return (
    <section className="mt-3 grid gap-2">
      <p className="text-xs font-black text-slate-800">אורחים בכל בקתה</p>
      <div className={`grid gap-2 ${multi ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 max-w-md'}`}>
        {cabinIds.map((id) => {
          const cabin = cabinCatalog(id);
          const max = cabin.maxOccupancy;
          const party = parties[id] || defaultCabinParty();
          const adults = Number(party.adults) || 2;
          const children = Number(party.children) || 0;
          const remainingKids = Math.max(0, max - adults);
          return (
            <div key={id} className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black text-sm truncate">{cabin.name || id}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <p className="text-[10px] font-bold text-stone-500">עד {max}</p>
                  {onRemove ? (
                    <button type="button" className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] font-black" onClick={() => onRemove(id)}>
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <Stepper
                  label="מבוגרים"
                  value={adults}
                  min={1}
                  max={max}
                  onChange={(nextAdults) => onChange(id, {
                    ...party,
                    adults: nextAdults,
                    children: Math.min(children, Math.max(0, max - nextAdults))
                  })}
                />
                <Stepper
                  label="ילדים"
                  value={Math.min(children, remainingKids)}
                  min={0}
                  max={remainingKids}
                  onChange={(nextKids) => onChange(id, { ...party, adults, children: nextKids })}
                />
                <label className="flex items-center gap-1.5 pb-1 text-[11px] font-bold">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-emerald-700"
                    checked={Boolean(party.crib)}
                    onChange={(e) => onChange(id, { ...party, adults, children, crib: e.target.checked })}
                  />
                  מיטת תינוק
                </label>
              </div>
              {multi ? (
                <div className="mt-2 grid gap-1.5">
                  <input
                    className="rounded-lg bg-white border border-stone-300 px-2 py-1.5 text-xs font-bold"
                    placeholder="טלפון של מי שמתארח כאן"
                    value={party.occupant_phone || ''}
                    onChange={(e) => onChange(id, { ...party, adults, children, occupant_phone: e.target.value })}
                    inputMode="tel"
                    required
                  />
                  {bookerPhone ? (
                    <button
                      type="button"
                      className="justify-self-start text-[10px] font-black text-emerald-800"
                      onClick={() => onChange(id, { ...party, adults, children, occupant_name: bookerName || party.occupant_name, occupant_phone: bookerPhone })}
                    >
                      אותו טלפון כמו המזמין
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
