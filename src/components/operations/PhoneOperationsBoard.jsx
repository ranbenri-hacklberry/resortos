import React, { useMemo, useState } from 'react';
import '../priority/priority.css';
import { usePanelHistory } from '../../lib/panelHistory';

const HEB_DAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function shiftDay(ymd, days) {
  const date = new Date(`${ymd}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(ymd, today) {
  const date = new Date(`${ymd}T12:00:00`);
  const mark = `${HEB_DAY[date.getDay()]}׳ ${date.getDate()}.${date.getMonth() + 1}`;
  return ymd === today ? `היום - ${mark}` : mark;
}

function cleanBadge(status) {
  if (status === 'READY') return { text: 'מוכן', tone: 'tone-ok' };
  if (status === 'IN_PROGRESS') return { text: 'בטיפול', tone: 'tone-progress' };
  if (status === 'NEEDS_COMPLETIONS') return { text: 'השלמות', tone: 'tone-inspect' };
  if (status === 'MAINTENANCE_ALERT') return { text: 'תקלה', tone: 'tone-bad' };
  return { text: 'לניקיון', tone: 'tone-dirty' };
}

function Row({ name, badge, pill, text, onOpen }) {
  return (
    <tr>
      <td className="unit-cell">
        <button type="button" className="unit-status" onClick={onOpen}>
          <span className="unit-name">{name}</span>
          {badge ? <em className={`clean-badge ${badge.tone}`}>{badge.text}</em> : null}
        </button>
      </td>
      <td className="week-cell">
        <button type="button" className={`stay-pill ${pill}`} onClick={onOpen}>
          <b>{text}</b>
        </button>
      </td>
    </tr>
  );
}

function Field({ label, value }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="ro" readOnly value={value == null ? '' : String(value)} />
    </label>
  );
}

export default function PhoneOperationsBoard({
  day,
  today,
  onDay,
  arrivingRooms = [],
  cleanNowRooms = [],
  stillInRooms = [],
  occupiedRooms = [],
  heldRooms = [],
  vacantRooms = [],
  maintenanceTickets = [],
  shoppingItems = [],
  onRetrySync,
  onStartTask,
  onFinishTask,
  onMarkDeparted,
  onToggleOccupy,
  onResolveMaintenance,
  onAddShopping,
  onToggleShopping,
  onDeleteShopping,
  waLink
}) {
  const [selected, setSelected] = useState(null);
  const [shopText, setShopText] = useState('');

  const sections = useMemo(() => ([
    {
      id: 'in',
      title: 'נכנסים',
      rows: arrivingRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: cleanBadge(room.isReady ? 'READY' : (room.status || 'DIRTY')),
        pill: 'is-in',
        text: room.guestName || 'כניסה',
        detail: room
      }))
    },
    {
      id: 'clean',
      title: 'לניקיון',
      rows: cleanNowRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: cleanBadge(room.status),
        pill: 'is-out',
        text: room.checkinGuest || room.checkoutGuest || 'ניקיון',
        detail: room
      }))
    },
    {
      id: 'wait',
      title: 'עוד בשהייה',
      rows: stillInRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: cleanBadge(room.status),
        pill: 'is-stay',
        text: room.checkoutGuest || 'אורח בחדר',
        detail: room
      }))
    },
    {
      id: 'occupied',
      title: 'מאוכלסים',
      rows: occupiedRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: cleanBadge(room.status),
        pill: 'is-stay',
        text: room.guestName || 'מאוכלס',
        detail: room
      }))
    },
    {
      id: 'held',
      title: 'חסומים',
      rows: heldRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: { text: 'חסום', tone: 'tone-hold' },
        pill: 'is-hold',
        text: room.label || 'לא זמין',
        detail: room
      }))
    },
    {
      id: 'vacant',
      title: 'פנויים',
      rows: vacantRooms.map((room) => ({
        id: room.id,
        name: room.unitName,
        badge: cleanBadge(room.status || 'READY'),
        pill: 'is-in',
        text: 'פנוי',
        detail: room
      }))
    },
    {
      id: 'fix',
      title: 'תחזוקה',
      rows: maintenanceTickets.map((ticket) => ({
        id: ticket.id,
        name: ticket.title || 'תקלה',
        badge: { text: ticket.urgency === 'CRITICAL' ? 'דחוף' : 'תקלה', tone: 'tone-bad' },
        pill: 'is-out',
        text: ticket.description || 'אחזקה',
        detail: ticket
      }))
    }
  ].filter((section) => section.rows.length)), [
    arrivingRooms,
    cleanNowRooms,
    stillInRooms,
    occupiedRooms,
    heldRooms,
    vacantRooms,
    maintenanceTickets
  ]);

  const panelOpen = Boolean(selected) && sections.some((section) => section.id === selected.kind && section.rows.some((row) => row.id === selected.id));
  usePanelHistory(panelOpen, () => setSelected(null));

  const current = selected
    ? sections.flatMap((section) => section.rows.map((row) => ({ ...row, kind: section.id }))).find((row) => row.kind === selected.kind && row.id === selected.id)
    : null;

  const addShop = (event) => {
    event.preventDefault();
    const text = shopText.trim();
    if (!text || !onAddShopping) return;
    onAddShopping(text);
    setShopText('');
  };

  if (current) {
    const room = current.detail || {};
    const phone = room.phone || '';
    return (
      <div className="priority-root is-phone ops-phone" dir="rtl">
        <div className="priority-body">
          <div className="priority-split-view">
            <button type="button" className="phone-room-back" onClick={() => setSelected(null)} aria-label="חזרה">
              <span aria-hidden="true">›</span>
              חזרה
            </button>
            <div className="split-details-col">
              <div className="master">
                <div className="master-col">
                  <div className="master-col-title">{current.name}</div>
                  <Field label="סטטוס" value={current.badge?.text || ''} />
                  {(room.guestName || room.checkoutGuest || room.checkinGuest) ? (
                    <Field label="אורח" value={room.guestName || room.checkoutGuest || room.checkinGuest} />
                  ) : null}
                  {phone ? <Field label="טלפון" value={phone} /> : null}
                  {room.eta ? <Field label="שעת הגעה" value={room.eta} /> : null}
                  {room.hasCheckoutToday && room.checkoutTime ? <Field label="שעת יציאה" value={room.checkoutTime} /> : null}
                  {room.lockbox ? <Field label="כספת" value={room.lockbox} /> : null}
                  {room.label ? <Field label="חסימה" value={room.label} /> : null}
                  {room.description ? <Field label="תקלה" value={room.description} /> : null}
                  {phone ? (
                    <div className="phone-links">
                      <a href={`tel:${phone}`}>חיוג</a>
                      {waLink ? <a href={waLink(phone)} target="_blank" rel="noreferrer">וואטסאפ</a> : null}
                    </div>
                  ) : null}
                  <div className="ops-phone-actions">
                    {current.kind === 'clean' && room.status !== 'IN_PROGRESS' ? (
                      <button type="button" className="phone-action" onClick={() => onStartTask && onStartTask(room.id)}>התחל ניקיון</button>
                    ) : null}
                    {current.kind === 'clean' || current.kind === 'in' ? (
                      <button type="button" className="phone-action" onClick={() => onFinishTask && onFinishTask(room.id)}>סיימתי ניקיון</button>
                    ) : null}
                    {current.kind === 'wait' ? (
                      <button type="button" className="phone-action" onClick={() => onMarkDeparted && onMarkDeparted(room.id)}>האורח יצא</button>
                    ) : null}
                    {current.kind === 'in' || current.kind === 'vacant' ? (
                      <button type="button" className="phone-action is-ghost" onClick={() => onToggleOccupy && onToggleOccupy(room.id, 'OCCUPIED')}>סמן מאוכלס</button>
                    ) : null}
                    {current.kind === 'occupied' ? (
                      <button type="button" className="phone-action is-ghost" onClick={() => onToggleOccupy && onToggleOccupy(room.id, 'VACANT')}>סמן פנוי</button>
                    ) : null}
                    {current.kind === 'fix' ? (
                      <button type="button" className="phone-action" onClick={() => onResolveMaintenance && onResolveMaintenance(room.id)}>התקלה טופלה</button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="priority-root is-phone ops-phone" dir="rtl">
      <div className="priority-body">
        <div className="grid-wrap">
          <table className="week-table erp-table">
            <thead>
              <tr className="label-row">
                <th className="unit-cell">תפעול</th>
                <th>
                  <div className="phone-day-switch">
                    <button type="button" aria-label="יום אחורה" onClick={() => onDay(shiftDay(day, -1))}>‹</button>
                    <span className="phone-day-name">{dayLabel(day, today)}</span>
                    <button type="button" aria-label="יום קדימה" onClick={() => onDay(shiftDay(day, 1))}>›</button>
                    {day !== today ? (
                      <button type="button" className="phone-today" onClick={() => onDay(today)}>היום</button>
                    ) : null}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <React.Fragment key={section.id}>
                  <tr className="area-break">
                    <td colSpan={2}>{section.title} ({section.rows.length})</td>
                  </tr>
                  {section.rows.map((row) => (
                    <Row
                      key={`${section.id}-${row.id}`}
                      name={row.name}
                      badge={row.badge}
                      pill={row.pill}
                      text={row.text}
                      onOpen={() => setSelected({ kind: section.id, id: row.id })}
                    />
                  ))}
                </React.Fragment>
              ))}
              {!sections.length ? (
                <tr>
                  <td className="empty-row" colSpan={2}>אין יחידות ליום הזה</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="ops-phone-card">
          <div className="master">
            <div className="master-col">
              <div className="master-col-title">רכש ({shoppingItems.filter((item) => !item.done).length})</div>
              {shoppingItems.length ? shoppingItems.map((item) => (
                <div className="ops-shop-row" key={item.id}>
                  <button type="button" className={`stay-pill ${item.done ? 'is-in' : 'is-out'}`} onClick={() => onToggleShopping && onToggleShopping(item.id)}>
                    <b>{item.done ? 'הגיע' : 'חסר'} · {item.text}</b>
                  </button>
                  <button type="button" className="phone-action is-ghost" onClick={() => onDeleteShopping && onDeleteShopping(item.id)} aria-label="מחיקה">×</button>
                </div>
              )) : <div className="empty-row">אין פריטים</div>}
              <form className="ops-shop-add" onSubmit={addShop}>
                <input value={shopText} onChange={(event) => setShopText(event.target.value)} placeholder="פריט לרכש" aria-label="פריט לרכש" />
                <button type="submit" className="phone-action">הוספה</button>
              </form>
              {onRetrySync ? (
                <button type="button" className="phone-action is-ghost" onClick={onRetrySync}>רענון</button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
