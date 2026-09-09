import React from 'react';
import { Check, CircleAlert, QrCode, Star, X } from '../lib/lucide-reviews.js';

function scoreColor(score) {
  if (score >= 80) return '#15803d';
  if (score >= 60) return '#C2410C';
  return '#B91C1C';
}

function ScoreRing({ score }) {
  const size = 92;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = scoreColor(score);
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(28,25,23,0.10)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[20px] font-black leading-none" style={{ color }}>{score}</div>
        <div className="mt-0.5 text-[10px] font-bold text-ws-muted">/100</div>
      </div>
    </div>
  );
}

function StatusMark({ status }) {
  if (status === 'ok') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#15803d]/12 text-[#15803d]">
        <Check size={14} strokeWidth={2.6} />
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ws-gold/12 text-ws-gold">
        <CircleAlert size={14} strokeWidth={2.4} />
      </span>
    );
  }
  if (status === 'unknown') {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ws-ink/8 text-ws-muted text-[11px] font-black">
        —
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-700/10 text-red-700">
      <X size={14} strokeWidth={2.6} />
    </span>
  );
}

export default function ReviewAuditCard({ audit, onStart, onReset, ctaLabel }) {
  if (!audit) return null;
  const color = scoreColor(audit.score);

  return (
    <div id="create" className="overflow-hidden rounded-[28px] border border-ws-line bg-ws-card shadow-[0_18px_40px_rgba(87,64,40,0.10)]">
      <div className="relative h-[168px] bg-ws-well">
        {audit.photoUrl ? (
          <img src={audit.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-ws-muted">
            <Star size={28} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute right-4 bottom-3 left-4 text-white">
          <div className="truncate text-[18px] font-extrabold drop-shadow">{audit.name}</div>
          {audit.address ? <div className="mt-0.5 truncate text-[12px] font-bold text-white/80">{audit.address}</div> : null}
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-ws-line px-5 py-4">
        <ScoreRing score={audit.score} />
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wide text-ws-muted">ציון בריאות הכרטיס</div>
          <div className="mt-0.5 text-[18px] font-extrabold" style={{ color }}>{audit.scoreLabel}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-bold text-ws-muted">
            {audit.rating ? <span>{Number(audit.rating).toFixed(1)} כוכבים</span> : <span>אין ציון עדיין</span>}
            <span>{audit.reviewCount || 0} ביקורות</span>
            {audit.lastReviewLabel ? <span>אחרונה {audit.lastReviewLabel}</span> : null}
          </div>
        </div>
      </div>

      <div className="divide-y divide-ws-line">
        {(audit.checks || []).map((item) => (
          <div key={item.id} className="flex gap-3 px-5 py-3.5">
            <StatusMark status={item.status} />
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-ws-ink">{item.title}</div>
              <p className="mt-0.5 text-[12px] leading-5 text-ws-muted">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-ws-line bg-ws-well/60 px-5 py-5">
        <p className="text-[15px] font-extrabold leading-6 text-ws-ink">
          רוצים לשפר את הציון ולבקש ביקורות בלי שהאורח ילך לאיבוד במפות?
        </p>
        <p className="mt-1 text-[12px] leading-5 text-ws-muted">
          הקישור הישיר וה-QR סוגרים את הפער הגדול ביותר בכרטיס — ואפשר להפיק אותם בחינם אחרי הרשמה.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-[#15803d] bg-[#25d366] px-5 py-3 text-[14px] font-extrabold text-[#052e16] hover:bg-[#2be36f]"
        >
          <QrCode size={16} />
          {ctaLabel || 'הפיקו קישור וואטסאפ ושלט QR בחינם'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full text-center text-[13px] font-bold text-ws-muted hover:text-ws-ink"
        >
          בדקו עסק אחר
        </button>
      </div>
    </div>
  );
}
