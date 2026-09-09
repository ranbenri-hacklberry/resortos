import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, LogOut, Upload } from 'lucide-react';
import { unitAccessGroup } from '../lib/units';
import { HYP_TERMINAL_A, HYP_TERMINAL_B } from '../lib/hypTerminal';

const TOKEN_KEY = 'resortos_desk_session_v2';
const TERMINAL_KEY = 'resortos_desk_hyp_terminal';

function lastTerminal() {
  try {
    const value = String(localStorage.getItem(TERMINAL_KEY) || '').toUpperCase();
    return value === 'B' ? 'B' : 'A';
  } catch {
    return 'A';
  }
}

function rememberTerminal(terminal) {
  try {
    localStorage.setItem(TERMINAL_KEY, terminal === 'B' ? 'B' : 'A');
  } catch {
    /* ignore */
  }
}

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

function shiftDay(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDay(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

async function deskFetch(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`/api/desk/${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = String(data.message || data.error || 'הבקשה נכשלה');
    const err = new Error(/type error/i.test(raw) ? 'לא הצלחנו לטעון את ההזמנות. רעננו את הדף.' : raw);
    err.code = data.error;
    throw err;
  }
  return data;
}

function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('IMAGE_FAILED'));
      img.onload = () => {
        const max = 1100;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function israelDateTimeValue() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function formatPayAt(raw) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function payBadge(booking) {
  if (booking.is_voucher) return { text: 'שובר', tone: 'paid' };
  if (booking.recorded_paid) return { text: 'שולם', tone: 'paid' };
  if (booking.partial || (Number(booking.paid_ils) > 0)) return { text: `חלקי ₪${booking.paid_ils}`, tone: 'unpaid' };
  if (booking.cash_expected) return { text: 'מזומן', tone: 'unpaid' };
  return { text: 'לא שולם', tone: 'unpaid' };
}

function BookingCard({ booking, busy, onPay }) {
  const locked = busy === booking.id;
  const badge = payBadge(booking);

  return (
    <article className={`desk-card desk-card-${badge.tone}${booking.cash_expected ? ' desk-card-cash' : ''}`}>
      <div className="desk-card-top">
        <div>
          <h3>{booking.guest_name}</h3>
          <p>{booking.unit_name} · {booking.check_in_date} → {booking.check_out_date}</p>
        </div>
        <div className="desk-card-end">
          <span className={`desk-pay desk-pay-${badge.tone}`}>{badge.text}</span>
          <button type="button" disabled={locked} onClick={() => onPay(booking)}>תשלום</button>
        </div>
      </div>
    </article>
  );
}

function PaymentSheet({ booking, busy, hyp, error, payUrl, onClose, onSubmit, onUndo }) {
  const paid = Math.max(0, Number(booking.paid_ils) || 0);
  const [total, setTotal] = useState(() => String(Math.max(0, Number(booking.total_ils) || 0)));
  const [due, setDue] = useState(() => String(Math.max(0, Number(booking.due_ils) || Math.max(0, (Number(booking.total_ils) || 0) - paid))));
  const [received, setReceived] = useState(false);
  const [method, setMethod] = useState(booking.cash_expected ? 'cash' : 'card');
  const [terminal, setTerminal] = useState(lastTerminal);
  const [companyRedeemed, setCompanyRedeemed] = useState(Boolean(booking.voucher_company_redeemed));
  const [photo, setPhoto] = useState(booking.bank_photo || booking.voucher_photo || '');
  const [paidAt, setPaidAt] = useState(israelDateTimeValue);
  const [ref, setRef] = useState('');
  const totalIls = Math.max(0, Number(total) || 0);
  const remainder = Math.max(0, Number(due) || 0);
  const locked = busy === booking.id;
  const payments = booking.payments || [];
  const recordNow = received || method === 'bank';

  function editTotal(value) {
    const next = value.replace(/[^\d.]/g, '');
    setTotal(next);
    const nextTotal = Math.max(0, Number(next) || 0);
    setDue(String(Math.max(0, Math.round((nextTotal - paid) * 100) / 100)));
  }

  function chooseMethod(next) {
    setMethod(next);
    if (next === 'bank') setReceived(true);
  }

  return (
    <div className="desk-modal" role="dialog" aria-modal="true" aria-labelledby="desk-pay-title">
      <button type="button" className="desk-modal-backdrop" aria-label="סגור" onClick={onClose} />
      <div className="desk-modal-card">
        <header>
          <div>
            <h2 id="desk-pay-title">תשלום · {booking.guest_name}</h2>
            <p>{booking.unit_name}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>סגור</button>
        </header>

        <div className="desk-money-row desk-money-row-3">
          <label>
            סה״כ הזמנה
            <input inputMode="decimal" value={total} placeholder="0" onChange={(event) => editTotal(event.target.value)} />
          </label>
          <label>
            יתרה
            <input inputMode="decimal" value={due} placeholder="0" onChange={(event) => setDue(event.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <button
            type="button"
            className={`desk-received${received ? ' on' : ''}`}
            onClick={() => setReceived((value) => !value)}
          >
            היתרה שולמה
          </button>
        </div>
        <p className="desk-muted">שולם ₪{paid} · נשאר ₪{Math.max(0, Math.round((totalIls - paid) * 100) / 100)}</p>

        {payments.length ? (
          <ul className="desk-pay-list">
            {payments.map((item) => (
              <li key={`${item.index}-${item.at}`}>
                <span>
                  {item.label} · ₪{item.amount_ils}
                  {item.at ? ` · ${formatPayAt(item.at)}` : ''}
                  {item.ref ? ` · ${item.ref}` : ''}
                </span>
                <button type="button" className="ghost" disabled={locked} onClick={() => onUndo(item.index)}>ביטול</button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="desk-label">{recordNow ? 'איך שולמה היתרה' : 'איך תשולם היתרה'}</p>
        <div className="desk-filters">
          <button type="button" className={method === 'card' ? 'on' : ''} onClick={() => chooseMethod('card')}>אשראי</button>
          <button type="button" className={method === 'cash' ? 'on' : ''} onClick={() => chooseMethod('cash')}>מזומן</button>
          <button type="button" className={method === 'bank' ? 'on' : ''} onClick={() => chooseMethod('bank')}>העברה בנקאית</button>
          <button type="button" className={method === 'voucher' ? 'on' : ''} onClick={() => chooseMethod('voucher')}>שובר</button>
        </div>

        {method === 'card' && !recordNow ? (
          <div className="desk-filters desk-terminals">
            <button type="button" className={terminal === 'A' ? 'on' : ''} disabled={!hyp.a} onClick={() => setTerminal('A')}>
              A יתרות · {HYP_TERMINAL_A}
            </button>
            <button type="button" className={terminal === 'B' ? 'on' : ''} disabled={!hyp.b} onClick={() => setTerminal('B')}>
              B מקדמות · {HYP_TERMINAL_B}
            </button>
          </div>
        ) : null}

        {recordNow && method !== 'voucher' && method !== 'bank' ? (
          <div className="desk-received-fields">
            <label>
              תאריך ושעה ששולם
              <input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </label>
            {method === 'card' ? (
              <label>
                מספר אישור / אסמכתא
                <input value={ref} placeholder="מספר אישור" onChange={(event) => setRef(event.target.value)} />
              </label>
            ) : null}
            {method === 'card' ? (
              <div className="desk-filters desk-terminals">
                <button type="button" className={terminal === 'A' ? 'on' : ''} disabled={!hyp.a} onClick={() => setTerminal('A')}>
                  A יתרות · {HYP_TERMINAL_A}
                </button>
                <button type="button" className={terminal === 'B' ? 'on' : ''} disabled={!hyp.b} onClick={() => setTerminal('B')}>
                  B מקדמות · {HYP_TERMINAL_B}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {method === 'voucher' || method === 'bank' ? (
          <div className="desk-voucher">
            {photo ? <img src={photo} alt={method === 'bank' ? 'אישור העברה' : 'צילום שובר'} /> : null}
            <label className="desk-file">
              <Upload size={14} />
              {photo ? 'החלפת צילום' : (method === 'bank' ? 'צירוף אישור העברה' : 'צירוף צילום שובר')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={locked}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  setPhoto(await compressPhoto(file));
                }}
              />
            </label>
            {method === 'voucher' ? (
              <label className="desk-check">
                <input
                  type="checkbox"
                  checked={companyRedeemed}
                  disabled={locked}
                  onChange={(event) => setCompanyRedeemed(event.target.checked)}
                />
                נפדה בחברת השוברים
              </label>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="desk-error">{error}</p> : null}

        {payUrl && !recordNow ? (
          <a className="desk-go" href={payUrl} target="_self" rel="noreferrer">
            המשיכו לסליקה
          </a>
        ) : (
          <button
            type="button"
            className="desk-go"
            disabled={locked || (method === 'card' && !recordNow && ((terminal === 'A' && !hyp.a) || (terminal === 'B' && !hyp.b)))}
            onClick={() => onSubmit({
              totalIls,
              remainder,
              method,
              terminal,
              photo,
              companyRedeemed,
              received: recordNow,
              paidAt,
              ref
            })}
          >
            {locked
              ? 'שומר…'
              : recordNow
                ? 'רשום תשלום שהתקבל'
                : method === 'card'
                  ? 'פתח סליקה'
                  : method === 'cash'
                    ? 'שולם מזומן'
                    : 'שמור שובר'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function DeskApp() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [day, setDay] = useState(todayIso);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [syncedAt, setSyncedAt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [boot, setBoot] = useState(Boolean(session?.token));
  const [hyp, setHyp] = useState({ a: true, b: true });
  const [payFilter, setPayFilter] = useState('all');
  const [paying, setPaying] = useState(null);
  const [payUrl, setPayUrl] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (/שיפוץ|סגור/.test(`${row.guest_name || ''} ${row.unit_name || ''}`)) return false;
      if (payFilter === 'paid' && !row.recorded_paid) return false;
      if (payFilter === 'unpaid' && row.recorded_paid) return false;
      if (!needle) return true;
      return [row.guest_name, row.unit_name, row.guest_phone, row.unit_id]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    const map = new Map();
    for (const row of filtered) {
      const title = unitAccessGroup(row.unit_id);
      const list = map.get(title) || [];
      list.push(row);
      map.set(title, list);
    }
    return [...map.entries()];
  }, [rows, query, payFilter]);

  async function loadBookings(token = session?.token, nextDay = day) {
    if (!token) return;
    setBusy('load');
    setError('');
    try {
      const data = await deskFetch(`bookings?day=${nextDay}`, { token });
      setRows(data.bookings || []);
      setSyncedAt(data.syncedAt || '');
      if (data.hyp) setHyp(data.hyp);
    } catch (err) {
      if (err.code === 'UNAUTHORIZED') {
        sessionStorage.removeItem(TOKEN_KEY);
        setSession(null);
      }
      setError(err.message);
    } finally {
      setBusy('');
      setBoot(false);
    }
  }

  useEffect(() => {
    if (session?.token) loadBookings(session.token, day);
    else setBoot(false);
  }, [day, session?.token]);

  async function login(event) {
    event.preventDefault();
    setBusy('login');
    setError('');
    try {
      const data = await deskFetch('login', { method: 'POST', body: { username, password } });
      const next = { token: data.token, name: data.name };
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(next));
      setSession(next);
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function refreshPaying(next) {
    await loadBookings();
    if (next?.id) setPaying(next);
  }

  async function submitPayment(draft) {
    const booking = paying;
    if (!booking) return;
    setBusy(booking.id);
    setError('');
    setPayUrl('');
    try {
      if (Math.abs(draft.totalIls - (Number(booking.total_ils) || 0)) >= 0.5) {
        const updated = await deskFetch('total', {
          token: session.token,
          method: 'POST',
          body: { id: booking.id, checkout_token: booking.checkout_token, total_ils: draft.totalIls }
        });
        if (updated.booking) setPaying(updated.booking);
      }
      if (draft.method === 'card' && !draft.received) {
        const amount = Number(draft.remainder) || 0;
        if (amount <= 0.5) throw new Error('מלאו סכום לחיוב בסליקה.');
        rememberTerminal(draft.terminal);
        const data = await deskFetch('charge', {
          token: session.token,
          method: 'POST',
          body: {
            id: booking.id,
            checkout_token: booking.checkout_token,
            amount_ils: amount,
            terminal: draft.terminal
          }
        });
        const nextUrl = String(data.payUrl || '').trim();
        if (!nextUrl) throw new Error(data.message || 'לא נפתח דף סליקה במסוף');
        setPayUrl(nextUrl);
        window.location.assign(nextUrl);
        return;
      }
      if (draft.method === 'cash' || draft.method === 'bank' || draft.method === 'card') {
        if (draft.method === 'bank' && !(draft.photo || '').startsWith('data:image/')) {
          throw new Error('צרפו צילום אישור העברה.');
        }
        if (draft.remainder <= 0.5) throw new Error('מלאו סכום לתשלום.');
        const data = await deskFetch('mark', {
          token: session.token,
          method: 'POST',
          body: {
            id: booking.id,
            checkout_token: booking.checkout_token,
            amount_ils: draft.remainder,
            method: draft.method === 'cash' ? 'CASH' : draft.method === 'bank' ? 'BANK' : 'CARD',
            photo: draft.method === 'bank' ? (draft.photo || '') : undefined,
            at: draft.method === 'bank' ? '' : (draft.paidAt || ''),
            ref: draft.method === 'bank' ? '' : (draft.ref || '')
          }
        });
        await refreshPaying(data.booking);
        return;
      }
      if (draft.method === 'voucher') {
        await deskFetch('voucher', {
          token: session.token,
          method: 'POST',
          body: {
            id: booking.id,
            checkout_token: booking.checkout_token,
            photo: draft.photo || '',
            company_redeemed: draft.companyRedeemed
          }
        });
      }
      await loadBookings();
      setPaying(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function undoPayment(index) {
    const booking = paying;
    if (!booking) return;
    setBusy(booking.id);
    setError('');
    try {
      const data = await deskFetch('unpay', {
        token: session.token,
        method: 'POST',
        body: {
          id: booking.id,
          checkout_token: booking.checkout_token,
          index,
          voucher: booking.is_voucher && !(booking.payments || []).length
        }
      });
      await refreshPaying(data.booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (boot) {
    return <p className="boot">טוען את הדלפק…</p>;
  }

  if (!session?.token) {
    return (
      <main className="desk-shell desk-login">
        <div className="desk-login-card">
          <Lock size={28} />
          <h1>דלפק חיובים</h1>
          <p>שם משתמש באנגלית מהגדרות עובדים, והסיסמה שם. השם לתצוגה (למשל רני) גם מתקבל.</p>
          <form onSubmit={login}>
            <label>
              שם משתמש
              <input
                autoFocus
                autoComplete="username"
                placeholder="rani"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              סיסמה
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="desk-error">{error}</p> : null}
            <button type="submit" disabled={username.length < 2 || password.length < 6 || busy === 'login'}>כניסה</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="desk-shell">
      <header className="desk-bar">
        <div>
          <h1>שלום {session.name}</h1>
          <p>{syncedAt ? `עודכן ${new Date(syncedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'ממתין לסנכרון מהיומן'}</p>
        </div>
        <button type="button" className="ghost" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setSession(null); }}>
          <LogOut size={16} /> יציאה
        </button>
      </header>

      <nav className="desk-day">
        <button type="button" className="ghost" onClick={() => setDay((value) => shiftDay(value, -1))} aria-label="יום קודם">
          <ChevronRight size={20} />
        </button>
        <div>
          <strong>{formatDay(day)}</strong>
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </div>
        <button type="button" className="ghost" onClick={() => setDay((value) => shiftDay(value, 1))} aria-label="יום הבא">
          <ChevronLeft size={20} />
        </button>
      </nav>

      <input
        className="desk-search"
        placeholder="חיפוש שם, טלפון או בקתה"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="desk-filters">
        <button type="button" className={payFilter === 'all' ? 'on' : ''} onClick={() => setPayFilter('all')}>
          הכל
        </button>
        <button type="button" className={payFilter === 'unpaid' ? 'on' : ''} onClick={() => setPayFilter('unpaid')}>
          לא שולם
        </button>
        <button type="button" className={payFilter === 'paid' ? 'on' : ''} onClick={() => setPayFilter('paid')}>
          שולם
        </button>
      </div>

      {hyp.a && hyp.b ? <p className="desk-muted">מסוף אשראי Hyp מחובר (יתרות + מקדמות).</p> : <p className="desk-error">מסוף האשראי לא מחובר במלואו. חיוב כרטיס עלול להיכשל.</p>}
      {error ? <p className="desk-error">{error}</p> : null}
      {busy === 'load' ? <p className="desk-muted">טוען הזמנות…</p> : null}
      {!busy && !groups.length ? <p className="desk-muted">{payFilter === 'paid' ? 'אין הזמנות ששולמו ביום הזה.' : payFilter === 'unpaid' ? 'אין הזמנות פתוחות לחיוב ביום הזה.' : 'אין הזמנות ליום הזה.'}</p> : null}

      {groups.map(([title, list]) => (
        <section key={title} className="desk-group">
          <h2>{title}</h2>
          {list.map((booking) => (
            <BookingCard
              key={`${booking.id || booking.checkout_token}-${booking.paid_ils}`}
              booking={booking}
              busy={busy}
              onPay={setPaying}
            />
          ))}
        </section>
      ))}

      {paying ? (
        <PaymentSheet
          key={`${paying.id}-${paying.paid_ils}-${(paying.payments || []).length}`}
          booking={paying}
          busy={busy}
          hyp={hyp}
          error={error}
          payUrl={payUrl}
          onClose={() => { setPaying(null); setError(''); setPayUrl(''); }}
          onSubmit={submitPayment}
          onUndo={undoPayment}
        />
      ) : null}
    </main>
  );
}
