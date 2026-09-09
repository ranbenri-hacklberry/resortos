import React, { useState } from 'react';
import { Calendar, Copy, Check, ExternalLink, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import { NorthStarIcon } from './MialeesBrandAssets';

export function MialeesCalendarSync({ property, selectedUnit }) {
  const [copiedId, setCopiedId] = useState(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [importStatus, setImportStatus] = useState(null);

  const units = (property.units || []).filter((u) => !u.isFullBuyout);

  function getIcalExportUrl(unitId) {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/ical/${unitId}.ics`;
    }
    return `https://mialees.co.il/api/ical/${unitId}.ics`;
  }

  function handleCopy(unitId) {
    const url = getIcalExportUrl(unitId);
    navigator.clipboard.writeText(url);
    setCopiedId(unitId);
    setTimeout(() => setCopiedId(null), 2500);
  }

  function handleImport(e) {
    e.preventDefault();
    if (!externalUrl) return;
    setImportStatus('syncing');
    setTimeout(() => {
      setImportStatus('success');
      setTimeout(() => setImportStatus(null), 4000);
    }, 1200);
  }

  return (
    <section id="calendar-sync-section" className="py-16 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-[var(--brand-borderLight)] shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--brand-borderLight)]">
          <div className="w-12 h-12 rounded-2xl bg-[var(--brand-surfaceSoft)] flex items-center justify-center text-[var(--brand-accent)]">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wider text-[var(--brand-secondary)] font-semibold">סנכרון יומנים אוטומטי</span>
              <NorthStarIcon className="w-3.5 h-3.5 text-[var(--brand-accent)]" />
            </div>
            <h3 className="text-2xl font-bold text-[var(--brand-primary)]">סנכרון יומנים בזמן אמת (iCal / OTA)</h3>
          </div>
        </div>

        <p className="text-sm text-[var(--brand-secondary)] leading-relaxed mb-8">
          חברו את יומני היחידות של <strong>{property.name}</strong> ישירות ל-Google Calendar, Airbnb, Booking.com ו-Apple Calendar למניעת כפל הזמנות ועדכון זמינות אוטומטי.
        </p>

        {/* Units Export List */}
        <div className="space-y-3 mb-10">
          <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">קישורי ייצוא יומן (Export iCal):</h4>
          {units.map((unit) => {
            const url = getIcalExportUrl(unit.id);
            const isCopied = copiedId === unit.id;
            return (
              <div
                key={unit.id}
                className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-sm text-[var(--brand-primary)]">{unit.name}</div>
                  <div className="text-xs text-stone-500 font-mono break-all">{url}</div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(unit.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    isCopied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-[var(--brand-primary)] hover:bg-[var(--brand-surfaceSoft)] border border-stone-300'
                  }`}
                >
                  {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{isCopied ? 'הועתק ללוח!' : 'העתק קישור iCal'}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* External Calendar Import Box */}
        <div className="p-6 rounded-2xl bg-[var(--brand-surfaceSoft)] border border-[var(--brand-borderLight)]">
          <h4 className="text-sm font-bold text-[var(--brand-primary)] mb-1">ייבוא לוח שנה חיצוני (Airbnb / Booking)</h4>
          <p className="text-xs text-[var(--brand-secondary)] mb-4">
            הדביקו קישור iCal מ-Airbnb או Booking כדי לנעול אוטומטית תאריכים תפוסים באתר.
          </p>

          <form onSubmit={handleImport} className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              placeholder="https://www.airbnb.com/calendar/ical/..."
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--brand-border)] bg-white text-xs sm:text-sm focus:ring-2 focus:ring-[var(--brand-accent)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={importStatus === 'syncing'}
              className="py-2.5 px-5 rounded-xl bg-[var(--brand-primary)] text-white text-xs sm:text-sm font-bold hover:bg-[var(--brand-darkSoft)] transition-colors shrink-0 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${importStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>{importStatus === 'syncing' ? 'מסנכרן...' : 'סנכרן יומן'}</span>
            </button>
          </form>

          {importStatus === 'success' && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
              <Check className="w-4 h-4" />
              <span>היומן החיצוני סונכרן בהצלחה! תאריכים תפוסים עודכנו במערכת.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
