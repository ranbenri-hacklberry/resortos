import React from 'react';
import { cabinCatalog } from '../lib/cabinCatalog';

export default function AgentCabinFacts({ cabinIds, fallbackId }) {
  const firstId = (cabinIds && cabinIds[0]) || fallbackId;
  const shared = cabinCatalog(firstId)?.propertyAmenities || [];
  if (!shared.length) return null;

  return (
    <section className="mt-3">
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <p className="text-[11px] font-black text-emerald-700">במתחם</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shared.map((item) => (
            <span key={item} className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-bold text-slate-800">{item}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
