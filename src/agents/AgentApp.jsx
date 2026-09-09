import React, { useEffect, useMemo, useState } from 'react';
import { nightsCount, pricedStay } from '../lib/bookingPrice';
import { splitRemainders } from '../lib/paySplit';
import { unitAccessGroup } from '../lib/units';
import {
  addDays,
  cabinIdsBlocked,
  commissionIls,
  nextStayRange
} from '../lib/agentAvailability';
import AgentOccupancyGrid from './AgentOccupancyGrid';
import AgentCabinFacts from './AgentCabinFacts';
import AgentCabinGuests from './AgentCabinGuests';
import {
  cabinPartyError,
  cabinPartySummaryHe,
  cabinPartyTotals,
  defaultCabinParty,
  normalizeCabinParties
} from '../lib/cabinParty';
import { listenHypParentBreakout } from '../lib/guestPayBrowser';
import {
  agentAvailability,
  agentLogin,
  agentLogout,
  agentMe,
  agentReserve,
  agentVerify,
  readAgentToken,
  writeAgentToken
} from './agentApi';

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function shortPropertyLabel(title) {
  return String(title || '')
    .replace('גבעת יואב / מיאליס', 'מיאליס')
    .replace('בתי נורית', 'נורית')
    .replace('בקתות טוסקנה', 'טוסקנה')
    .replace('החצר המוסיקלית', 'חצר מוסיקלית')
    .replace('בקתות מאיה', 'מאיה')
    .replace(/\s·\s(רמות|נוב)$/, '');
}

export default function AgentApp() {
  const [agent, setAgent] = useState(null);
  const [boot, setBoot] = useState(true);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [units, setUnits] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [property, setProperty] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [parties, setParties] = useState({});
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [pickingOut, setPickingOut] = useState(false);
  const [fromIso, setFromIso] = useState(todayIso);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [lock, setLock] = useState(null);
  const [payUrl, setPayUrl] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [paySplit, setPaySplit] = useState('');

  const properties = useMemo(() => {
    const groups = new Map();
    for (const unit of units) {
      const title = unitAccessGroup(unit.cabin_id);
      const list = groups.get(title) || [];
      list.push(unit);
      groups.set(title, list);
    }
    return [...groups.entries()];
  }, [units]);

  const propertyUnits = properties.find(([title]) => title === property)?.[1] || properties[0]?.[1] || [];
  const selectedUnits = propertyUnits.filter((unit) => selectedIds.includes(unit.cabin_id));
  const packedParties = normalizeCabinParties(selectedIds, parties);
  const partyTotals = cabinPartyTotals(packedParties);
  const partyError = cabinPartyError(packedParties);
  const partyLine = cabinPartySummaryHe(packedParties);
  const nights = nightsCount(checkIn, checkOut);
  const cabinQuotes = selectedUnits.map((unit) => {
    const stay = pricedStay(Number(unit.base_price || 850), nights, 1);
    return {
      cabin_id: unit.cabin_id,
      name: unit.cabin_name,
      total_agorot: Math.round(stay.totalIls * 100),
      deposit_agorot: Math.round(stay.depositIls * 100)
    };
  });
  const quote = cabinQuotes.reduce((sum, row) => ({
    totalIls: sum.totalIls + row.total_agorot / 100,
    depositIls: sum.depositIls + row.deposit_agorot / 100
  }), { totalIls: 0, depositIls: 0 });
  const remainders = splitRemainders(
    cabinQuotes,
    'per_cabin',
    selectedIds[0],
    Math.round(quote.depositIls * 100)
  );
  const bookerRemainderIls = (remainders[0]?.remainder_agorot || 0) / 100;
  const commission = commissionIls(quote.totalIls, agent?.commission_rate || 0.1);
  const conflictIds = checkIn && checkOut
    ? cabinIdsBlocked(blocked, selectedIds, checkIn, checkOut)
    : [];
  const needsPaySplit = selectedIds.length > 1 && !paySplit;
  const blockedStay = !checkIn || !checkOut || checkOut <= checkIn || !selectedIds.length || conflictIds.length > 0 || Boolean(partyError) || needsPaySplit;

  useEffect(() => {
    let stop = false;
    (async () => {
      if (!readAgentToken()) {
        setBoot(false);
        return;
      }
      try {
        const data = await agentMe();
        if (!stop) setAgent(data.agent);
      } catch {
        writeAgentToken('');
      } finally {
        if (!stop) setBoot(false);
      }
    })();
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    if (!agent) return undefined;
    let stop = false;
    (async () => {
      try {
        const from = todayIso();
        const to = addDays(from, 180);
        const data = await agentAvailability(from, to);
        if (stop) return;
        setUnits(data.units || []);
        setBlocked(data.blocked || []);
        const firstGroup = unitAccessGroup(data.units?.[0]?.cabin_id);
        setProperty((prev) => prev || firstGroup || '');
      } catch (err) {
        if (!stop) setError(err.message);
      }
    })();
    return () => { stop = true; };
  }, [agent]);

  useEffect(() => listenHypParentBreakout(() => {
    if (lock) finishPay();
  }), [lock]);

  useEffect(() => {
    if (selectedIds.length < 2) setPaySplit('');
  }, [selectedIds.length]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy('login');
    setError('');
    try {
      const data = await agentLogin(phone, pin);
      writeAgentToken(data.token);
      setAgent(data.agent);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function applyStay(next) {
    if (next.error === 'DATES_OVERLAP') {
      setError('הטווח חופף לתאריך תפוס — בחרו יציאה אחרת');
      return;
    }
    if (next.error === 'NIGHT_TAKEN' || next.error === 'PAST') return;
    setError('');
    setCheckIn(next.checkIn);
    setCheckOut(next.checkOut);
    setPickingOut(Boolean(next.pickingOut));
  }

  function pickDate(iso) {
    applyStay(nextStayRange(
      { checkIn, checkOut, pickingOut },
      iso,
      { today: todayIso(), blocked }
    ));
  }

  function toggleCabin(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    setParties((prev) => (prev[id] ? prev : { ...prev, [id]: defaultCabinParty() }));
  }

  function setCabinParty(id, next) {
    setParties((prev) => ({ ...prev, [id]: next }));
  }

  function selectWholeProperty() {
    const free = propertyUnits.filter((unit) => (
      !checkIn || !checkOut || !cabinIdsBlocked(blocked, [unit.cabin_id], checkIn, checkOut).length
    ));
    const ids = free.map((unit) => unit.cabin_id);
    setSelectedIds(ids);
    setParties((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (!next[id]) next[id] = defaultCabinParty();
      }
      return next;
    });
  }

  async function startPay(event) {
    event.preventDefault();
    if (!selectedIds.length || blockedStay) return;
    setBusy('lock');
    setError('');
    try {
      const reserved = await agentReserve({
        cabin_id: selectedIds[0],
        cabin_ids: selectedIds,
        start_date: checkIn,
        end_date: checkOut,
        guest_name: guestName,
        guest_phone: guestPhone,
        notes: [notes, partyLine].filter(Boolean).join('\n'),
        adults: partyTotals.adults,
        children: partyTotals.children,
        baby_cot_required: partyTotals.cribs > 0,
        cabin_parties: packedParties,
        total_price_agorot: Math.round(quote.totalIls * 100),
        deposit_agorot: Math.round(quote.depositIls * 100),
        pay_split: selectedIds.length > 1 ? paySplit : 'together',
        booker_cabin_id: selectedIds[0],
        cabin_quotes: cabinQuotes
      });
      setLock(reserved.lock);
      setPayUrl(reserved.hypPaymentUrl || reserved.iframe_url || reserved.pay_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function finishPay() {
    if (!lock) return;
    setBusy('verify');
    setError('');
    try {
      const next = await agentVerify({
        booking_id: lock.booking_id,
        checkout_token: lock.checkout_token,
        cabin_id: selectedIds[0],
        cabin_ids: selectedIds,
        cabin_names: selectedUnits.map((unit) => unit.cabin_name).join(' · '),
        start_date: checkIn,
        end_date: checkOut,
        guest_name: guestName,
        deposit_agorot: lock.deposit_agorot,
        cabin_parties: packedParties,
        guests: partyLine,
        baby_cot_required: partyTotals.cribs > 0,
        pay_split: selectedIds.length > 1 ? paySplit : 'together'
      });
      if (!next.paid) {
        setError('עדיין ממתינים לאישור הסליקה. אם שולם — לחצו שוב בעוד רגע.');
        return;
      }
      setVoucher(next);
      setPayUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (boot) {
    return <div className="min-h-dvh grid place-items-center bg-[#F4F1EA] text-slate-800 font-extrabold">טוען פורטל סוכנים…</div>;
  }

  if (!agent) {
    return (
      <main className="min-h-dvh mx-auto max-w-md px-5 py-10 bg-[#F4F1EA] text-slate-900">
        <p className="text-xs font-extrabold tracking-widest text-emerald-700">RESORTOS AGENTS</p>
        <h1 className="mt-2 text-3xl font-black">כניסת סוכן</h1>
        <p className="mt-2 text-sm text-stone-600">טלפון + קוד בן 4 ספרות. בלי גישה ליומן הצוות ובלי פרטי אורחים אחרים.</p>
        <form onSubmit={handleLogin} className="mt-8 grid gap-3">
          <label className="grid gap-1 text-sm font-bold">
            טלפון
            <input className="rounded-xl bg-white border border-stone-300 px-3 py-3" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            קוד
            <input className="rounded-xl bg-white border border-stone-300 px-3 py-3 tracking-[0.4em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" required />
          </label>
          {error ? <p className="text-rose-600 text-sm font-bold">{error}</p> : null}
          <button disabled={busy === 'login'} className="rounded-xl bg-emerald-500 text-slate-950 font-black py-3">
            {busy === 'login' ? 'נכנס…' : 'כניסה'}
          </button>
        </form>
      </main>
    );
  }

  if (voucher) {
    const v = voucher.voucher || {};
    return (
      <main className="min-h-dvh mx-auto max-w-lg px-5 py-10 bg-[#F4F1EA] text-slate-900">
        <p className="text-emerald-700 font-black">המקדמה שולמה</p>
        <h1 className="text-3xl font-black mt-2">שובר הזמנה</h1>
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 grid gap-2 text-sm">
          <div><span className="text-stone-500">סוכן</span> · {v.agent}</div>
          <div><span className="text-stone-500">יחידות</span> · {v.cabin}</div>
          <div><span className="text-stone-500">תאריכים</span> · {v.dates}</div>
          <div><span className="text-stone-500">אורח</span> · {v.guest}</div>
          {v.guests ? <div><span className="text-stone-500">אורחים</span> · {v.guests}</div> : null}
          <div className="font-black text-lg">מקדמה ₪{Number(v.deposit_ils || 0).toLocaleString()}</div>
          {v.pay_split === 'per_cabin' ? (
            <div className="text-stone-600">כל בקתה משלמת את היתרה שלה בנפרד. המקדמה נזקפה לבקתה של המזמין.</div>
          ) : null}
        </div>
        {Array.isArray(voucher.stay_links) && voucher.stay_links.length > 1 ? (
          <div className="mt-4 grid gap-2">
            {voucher.stay_links.map((link) => (
              <a
                key={link.cabin_id}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
                href={`https://wa.me/${link.occupant_phone ? `972${link.occupant_phone.replace(/^0/, '')}` : ''}?text=${encodeURIComponent(`לינק לשהייה ב${link.name}: ${link.url}`)}`}
              >
                וואטסאפ ל{link.name}{link.occupant_name ? ` · ${link.occupant_name}` : ''}
              </a>
            ))}
          </div>
        ) : null}
        {voucher.ops_whatsapp ? (
          <a href={voucher.ops_whatsapp} className="mt-5 block text-center rounded-xl bg-emerald-500 text-slate-950 font-black py-3">שלח התראה לניהול</a>
        ) : null}
        <button
          type="button"
          className="mt-3 w-full rounded-xl border border-stone-300 bg-white py-3 font-bold"
          onClick={() => {
            const text = `שובר ResortOS · ${v.cabin} · ${v.dates} · מקדמה ₪${v.deposit_ils}`;
            if (navigator.share) navigator.share({ title: 'שובר הזמנה', text }).catch(() => {});
            else navigator.clipboard?.writeText(text);
          }}
        >
          שתף / הורד שובר
        </button>
        <button type="button" className="mt-3 w-full rounded-xl border border-slate-700 py-3 font-bold" onClick={() => { setVoucher(null); setLock(null); setGuestName(''); setNotes(''); setPaySplit(''); }}>
          הזמנה נוספת
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-dvh mx-auto max-w-6xl px-3 py-5 bg-[#F4F1EA] text-slate-900">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold text-emerald-700">פורטל סוכנים</p>
          <h1 className="text-xl font-black">{agent.name}</h1>
        </div>
        <button type="button" className="text-sm text-stone-500" onClick={() => { agentLogout().catch(() => {}); writeAgentToken(''); setAgent(null); }}>יציאה</button>
      </header>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
          {properties.map(([title, list]) => (
            <button
              key={title}
              type="button"
              className={`rounded-lg px-1.5 py-1.5 text-[11px] font-black leading-tight ${
                title === (property || properties[0]?.[0]) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-slate-800'
              }`}
              onClick={() => {
                setProperty(title);
                setSelectedIds([]);
              }}
            >
              {shortPropertyLabel(title)} · {list.length}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setFromIso((iso) => addDays(iso, -30))}>‹ חודש</button>
          <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setFromIso((iso) => addDays(iso, -7))}>‹ שבוע</button>
          <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setFromIso(todayIso())}>היום</button>
          <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setFromIso((iso) => addDays(iso, 7))}>שבוע ›</button>
          <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold" onClick={() => setFromIso((iso) => addDays(iso, 30))}>חודש ›</button>
          <button type="button" className="rounded-lg bg-emerald-100 text-emerald-900 px-3 py-1.5 text-xs font-black" onClick={selectWholeProperty}>
            כל המתחם הפנוי
          </button>
          {selectedIds.length ? (
            <button type="button" className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-black" onClick={() => setSelectedIds([])}>
              נקה בחירה
            </button>
          ) : null}
          <span className="text-xs text-stone-500">נבחרו {selectedIds.length} יחידות · לחצו שוב על שם הבקתה כדי לבטל</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-bold text-stone-500">
            כניסה
            <input
              type="date"
              dir="ltr"
              className="rounded-xl bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-slate-900 font-extrabold"
              min={todayIso()}
              value={checkIn}
              onChange={(e) => applyStay(nextStayRange({}, e.target.value, { today: todayIso(), blocked }))}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-stone-500">
            יציאה
            <input
              type="date"
              dir="ltr"
              className="rounded-xl bg-stone-50 border border-stone-300 px-3 py-2 text-sm text-slate-900 font-extrabold"
              min={checkIn ? addDays(checkIn, 1) : todayIso()}
              value={checkOut}
              onChange={(e) => applyStay(nextStayRange({ checkIn, checkOut, pickingOut: true }, e.target.value, { today: todayIso(), blocked }))}
            />
          </label>
        </div>

        <div className="mt-3">
          <AgentOccupancyGrid
            units={propertyUnits}
            blocked={blocked}
            selectedIds={selectedIds}
            checkIn={checkIn}
            checkOut={checkOut}
            fromIso={fromIso}
            today={todayIso()}
            onToggleCabin={toggleCabin}
            onPickDate={pickDate}
            days={90}
          />
        </div>
        <p className="mt-3 text-xs text-stone-500">
          היום מימין, הימים הבאים שמאלה. ירוק + פ = פנוי · סגול + ת = תפוס. לחיצה נוספת על שם הבקתה מבטלת בחירה.
        </p>
        <AgentCabinFacts cabinIds={selectedIds} fallbackId={propertyUnits[0]?.cabin_id} />
        <AgentCabinGuests
          cabinIds={selectedIds}
          parties={parties}
          onChange={setCabinParty}
          onRemove={toggleCabin}
          bookerName={guestName}
          bookerPhone={guestPhone}
        />
      </section>

      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 grid gap-2">
        <div className="flex justify-between text-sm"><span>יחידות</span><strong>{selectedIds.length || '—'}</strong></div>
        <div className="flex justify-between text-sm"><span>אורחים</span><strong>{selectedIds.length ? `${partyTotals.adults} מבוגרים · ${partyTotals.children} ילדים${partyTotals.cribs ? ` · ${partyTotals.cribs} מיטת תינוק` : ''}` : '—'}</strong></div>
        <div className="flex justify-between text-sm"><span>לילות</span><strong>{checkIn ? nights : '—'}</strong></div>
        <div className="flex justify-between text-sm"><span>סה״כ שהייה</span><strong>₪{quote.totalIls.toLocaleString()}</strong></div>
        <div className="flex justify-between text-sm"><span>מקדמה 20%</span><strong>₪{quote.depositIls.toLocaleString()}</strong></div>
        {selectedIds.length > 1 ? (
          <fieldset className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3 grid gap-2">
            <legend className="px-1 text-sm font-black">איך משלמים את היתרה?</legend>
            <label className={`flex gap-2 items-start rounded-xl border px-3 py-2 ${paySplit === 'together' ? 'border-emerald-500 bg-white' : 'border-stone-200 bg-white'}`}>
              <input type="radio" name="pay_split" className="mt-1" checked={paySplit === 'together'} onChange={() => setPaySplit('together')} required />
              <span>
                <strong>1 · המזמין משלם על כל ההזמנה</strong>
                <span className="block text-xs text-stone-500 font-normal">מקדמה ₪{quote.depositIls.toLocaleString()} עכשיו, יתרה ₪{(quote.totalIls - quote.depositIls).toLocaleString()} בכניסה על כל הבקתות יחד.</span>
              </span>
            </label>
            <label className={`flex gap-2 items-start rounded-xl border px-3 py-2 ${paySplit === 'per_cabin' ? 'border-emerald-500 bg-white' : 'border-stone-200 bg-white'}`}>
              <input type="radio" name="pay_split" className="mt-1" checked={paySplit === 'per_cabin'} onChange={() => setPaySplit('per_cabin')} required />
              <span>
                <strong>2 · כל בקתה משלמת לעצמה</strong>
                <span className="block text-xs text-stone-500 font-normal">המקדמה ששולמה עכשיו נזקפת רק לבקתה של המזמין. יישאר לו ₪{bookerRemainderIls.toLocaleString()} בכניסה, ושאר הבקתות ישלמו את מלוא המחיר שלהן.</span>
              </span>
            </label>
            {paySplit === 'per_cabin' ? (
              <ul className="text-xs text-stone-600 grid gap-1 pr-1">
                {remainders.map((row, index) => (
                  <li key={row.cabin_id}>
                    {row.name || row.cabin_id}: יתרה ₪{(row.remainder_agorot / 100).toLocaleString()}
                    {index === 0 ? ' (אחרי מקדמה)' : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {!paySplit ? <p className="text-rose-700 text-sm font-bold">חובה לסמן אפשרות 1 או 2 לפני נעילה</p> : null}
          </fieldset>
        ) : null}
        <div className="flex justify-between items-center text-sm">
          <span>עמלה שלך</span>
          <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-1 font-black">10% · ₪{commission.toLocaleString()}</span>
        </div>
        {!checkIn || !checkOut ? (
          <p className="text-amber-800 text-sm font-bold">בחרו כניסה ואז יציאה בלוח או בשדות למעלה</p>
        ) : partyError ? (
          <p className="text-rose-700 text-sm font-bold">{partyError}</p>
        ) : blockedStay ? (
          <p className="text-rose-700 text-sm font-bold">הטווח חופף לתאריך תפוס</p>
        ) : null}
      </section>

      {payUrl ? (
        <section className="mt-4 rounded-2xl border border-slate-800 overflow-hidden bg-white">
          <iframe title="תשלום מאובטח" src={payUrl} allow="payment" className="w-full h-[480px] rounded-2xl border-none shadow-md" />
          <div className="p-3 grid gap-2 bg-stone-100">
            <a className="text-center rounded-xl border border-stone-300 bg-white py-3 font-bold" href={`https://wa.me/?text=${encodeURIComponent(`לינק לתשלום מקדמה: ${lock?.checkout_token ? `https://resortos.app/checkout/${lock.checkout_token}` : payUrl}`)}`}>שלח קישור לתשלום ישיר לאורח בוואטסאפ</a>
            <button type="button" className="rounded-xl bg-emerald-500 text-slate-950 font-black py-3" onClick={finishPay} disabled={busy === 'verify'}>
              {busy === 'verify' ? 'בודקים…' : 'סיימתי את התשלום'}
            </button>
          </div>
        </section>
      ) : (
        <form onSubmit={startPay} className="mt-4 grid gap-3">
          <input className="rounded-xl bg-white border border-stone-300 px-3 py-3" placeholder="שם מלא של האורח" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
          <input className="rounded-xl bg-white border border-stone-300 px-3 py-3" placeholder="טלפון אורח" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} inputMode="tel" required />
          <textarea className="rounded-xl bg-white border border-stone-300 px-3 py-3" placeholder="הערות (לא חובה)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          {error ? <p className="text-rose-700 text-sm font-bold">{error}</p> : null}
          <button disabled={busy || blockedStay} className="rounded-xl bg-emerald-500 text-slate-950 font-black py-3">
            {busy ? 'נועל תאריכים…' : `נעל 15 דק׳ וגבה מקדמה ₪${quote.depositIls.toLocaleString()}`}
          </button>
        </form>
      )}
    </main>
  );
}
