import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, DoorOpen, Home, ShieldCheck, ShoppingCart, Sparkles } from 'lucide-react';
import { priorityDeskGuests } from '../../lib/priorityStay';
import { lodgingKey, lodgingLabel } from '../../lib/priorityStatus';
import { UNIT_STATUS_BADGES, unitDisplayStatus } from '../../lib/unitStatus';
import { inventoryUnits } from '../../lib/units';
import { usePanelHistory } from '../../lib/panelHistory';
import {
  PHONE_AREA_FILTERS,
  phoneOpsMatchesArea,
  phoneOpsSection,
  phoneOpsUnitLabel
} from '../../lib/phoneOpsGroups';

const GUEST_CHOICES = [
  { key: 'OCCUPIED', label: 'תפוס' },
  { key: 'VACANT', label: 'פנוי' }
];

const HEB_DAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const SECTIONS = [
  { id: 'arriving', title: 'נכנסים היום', sub: 'צ׳ק אין ליום הזה', icon: DoorOpen },
  { id: 'cleaning', title: 'לניקיון בלי כניסה', sub: 'צריך ניקיון, בלי כניסה היום', icon: Sparkles },
  { id: 'occupied', title: 'מאוכלסים', sub: 'אורח בשהייה', icon: Home },
  { id: 'vacant', title: 'פנויים', sub: 'פנוי ומוכן', icon: ShieldCheck }
];

function shiftDay(ymd, days) {
  const date = new Date(`${ymd}T12:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(ymd, realToday) {
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return ymd || '';
  const mark = `${HEB_DAY[date.getDay()]}׳ ${date.getDate()}.${date.getMonth() + 1}`;
  return ymd === realToday ? `היום - ${mark}` : mark;
}

function cleanBadge(unit, bookings, day) {
  const ops = unit?.operational_status;
  if (ops && UNIT_STATUS_BADGES[ops] && ops !== 'OCCUPIED') return UNIT_STATUS_BADGES[ops];
  const badge = unitDisplayStatus(unit, bookings, day);
  if (badge && badge.key !== 'OCCUPIED') return badge;
  return null;
}

function guestText(unit, bookings, day) {
  const desk = priorityDeskGuests(bookings, unit.id, day);
  if (desk.roomStatus) return desk.roomStatus;
  return lodgingLabel(lodgingKey(unit));
}

function guestTone(unit, bookings, day) {
  const desk = priorityDeskGuests(bookings, unit.id, day);
  if (desk.roomStatus) return 'stay';
  return lodgingKey(unit) === 'OCCUPIED' ? 'in' : 'out';
}

export default function PhoneOperationsBoard({
  units = [],
  bookings = [],
  today,
  shoppingItems = [],
  onRetrySync,
  onToggleOccupy,
  onAddShopping,
  onToggleShopping,
  onDeleteShopping
}) {
  const [open, setOpen] = useState({});
  const [menu, setMenu] = useState(null);
  const [shopText, setShopText] = useState('');
  const [area, setArea] = useState('all');
  const [day, setDay] = useState(today || '');
  usePanelHistory(Boolean(menu), () => setMenu(null));

  useEffect(() => {
    if (today) setDay((current) => current || today);
  }, [today]);

  useEffect(() => {
    if (!menu) return undefined;
    const onPointer = (event) => {
      const target = event.target;
      if (target?.closest?.('.ops-guest-menu, .ops-guest-status')) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [menu]);

  const viewDay = day || today;

  const sections = useMemo(() => {
    const buckets = { arriving: [], cleaning: [], occupied: [], vacant: [] };
    inventoryUnits(units).filter((unit) => phoneOpsMatchesArea(unit, area)).forEach((unit) => {
      buckets[phoneOpsSection(unit, bookings, viewDay)].push(unit);
    });
    Object.values(buckets).forEach((list) => {
      list.sort((a, b) => phoneOpsUnitLabel(a).localeCompare(phoneOpsUnitLabel(b), 'he'));
    });
    return SECTIONS.map((section) => ({ ...section, units: buckets[section.id] }));
  }, [units, bookings, viewDay, area]);

  const chooseGuest = (key) => {
    if (menu && onToggleOccupy) onToggleOccupy(menu.unitId, key);
    setMenu(null);
  };

  const addShop = (event) => {
    event.preventDefault();
    const text = shopText.trim();
    if (!text || !onAddShopping) return;
    onAddShopping(text);
    setShopText('');
  };

  const openMenu = (event, unit) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      unitId: unit.id,
      stay: lodgingKey(unit),
      top: Math.min(rect.bottom, window.innerHeight - 70),
      right: Math.max(4, window.innerWidth - rect.right)
    });
  };

  return (
    <div className="ops-compounds" dir="rtl">
      <div className="ops-area-pills" role="tablist" aria-label="אזור">
        {PHONE_AREA_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={area === filter.id}
            className={`ops-area-pill${area === filter.id ? ' is-on' : ''}`}
            onClick={() => setArea(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="ops-day-switch">
        <button type="button" aria-label="יום אחורה" onClick={() => setDay((current) => shiftDay(current || today, -1))}>‹</button>
        <span className="ops-day-name">{dayLabel(viewDay, today)}</span>
        <button type="button" aria-label="יום קדימה" onClick={() => setDay((current) => shiftDay(current || today, 1))}>›</button>
        {viewDay !== today ? (
          <button type="button" className="ops-day-today" onClick={() => setDay(today)}>היום</button>
        ) : null}
      </div>
      {sections.map((section) => {
        const expanded = Boolean(open[section.id]);
        const Icon = section.icon;
        const empty = section.units.length === 0;
        return (
          <section className={`ops-compound${expanded ? ' is-open' : ''}${empty ? ' is-empty' : ''}`} key={section.id}>
            <button
              type="button"
              className="ops-compound-head"
              aria-expanded={expanded}
              onClick={() => setOpen((current) => ({ ...current, [section.id]: !current[section.id] }))}
            >
              <span className="ops-compound-mark" aria-hidden="true"><Icon size={15} /></span>
              <span className="ops-compound-copy">
                <span className="ops-compound-title">
                  <span className="ops-compound-name">{section.title}</span>
                  <span className={`ops-compound-chip${empty ? ' is-zero' : section.id === 'cleaning' ? ' is-alert' : ' is-ready'}`}>
                    {section.units.length}
                  </span>
                </span>
                <span className="ops-compound-sub">{section.sub}</span>
              </span>
              <span className="ops-compound-side">
                <span className="ops-compound-count">{section.units.length}</span>
                <span className="ops-compound-chevron" aria-hidden="true">
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </span>
              </span>
            </button>
            {expanded ? (
              <div className="ops-compound-body">
                {empty ? <div className="ops-compound-empty">אין יחידות</div> : (
                  <>
                    <div className="ops-unit-row is-label" aria-hidden="true">
                      <span>יחידה</span>
                      <span>ניקיון</span>
                      <span>אורח</span>
                    </div>
                    {section.units.map((unit) => {
                      const badge = cleanBadge(unit, bookings, viewDay);
                      const tone = guestTone(unit, bookings, viewDay);
                      return (
                        <div className="ops-unit-row" key={unit.id}>
                          <span className="ops-unit-name">{phoneOpsUnitLabel(unit)}</span>
                          <span className="ops-clean-status">
                            {badge ? (
                              <span
                                className="ops-clean-chip"
                                style={{ color: badge.color, background: badge.bg, borderColor: badge.border || badge.color }}
                              >
                                {badge.label}
                              </span>
                            ) : '—'}
                          </span>
                          <button
                            type="button"
                            className={`ops-guest-status is-${tone}`}
                            onClick={(event) => openMenu(event, unit)}
                          >
                            {guestText(unit, bookings, viewDay)}
                          </button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
      <section className={`ops-compound${open.shop ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ops-compound-head"
          aria-expanded={Boolean(open.shop)}
          onClick={() => setOpen((current) => ({ ...current, shop: !current.shop }))}
        >
          <span className="ops-compound-mark" aria-hidden="true"><ShoppingCart size={15} /></span>
          <span className="ops-compound-copy">
            <span className="ops-compound-title">
              <span className="ops-compound-name">רכש</span>
              <span className={`ops-compound-chip ${shoppingItems.some((item) => !item.done) ? 'is-alert' : 'is-ready'}`}>
                {shoppingItems.filter((item) => !item.done).length} חסרים
              </span>
            </span>
            <span className="ops-compound-sub">
              {shoppingItems.some((item) => !item.done) ? 'פריטים שעדיין חסרים' : 'הרשימה הושלמה'}
            </span>
          </span>
          <span className="ops-compound-side">
            <span className="ops-compound-count">{shoppingItems.filter((item) => !item.done).length}</span>
            <span className="ops-compound-chevron" aria-hidden="true">
              {open.shop ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </span>
        </button>
        {open.shop ? (
          <div className="ops-compound-body">
            {shoppingItems.map((item) => (
              <div className="ops-unit-row" key={item.id}>
                <button type="button" className="ops-guest-status" onClick={() => onToggleShopping && onToggleShopping(item.id)}>
                  {item.done ? 'הגיע' : 'חסר'}
                </button>
                <span className="ops-clean-status">{item.text}</span>
                <button type="button" className="ops-guest-status" onClick={() => onDeleteShopping && onDeleteShopping(item.id)} aria-label="מחיקה">×</button>
              </div>
            ))}
            <form className="ops-shop-add" onSubmit={addShop}>
              <input value={shopText} onChange={(event) => setShopText(event.target.value)} placeholder="פריט לרכש" aria-label="פריט לרכש" />
              <button type="submit">הוספה</button>
            </form>
            {onRetrySync ? (
              <button type="button" className="ops-shop-refresh" onClick={onRetrySync}>רענון</button>
            ) : null}
          </div>
        ) : null}
      </section>
      {menu ? (
        <div className="ops-guest-menu" style={{ top: menu.top, right: menu.right }} role="menu" aria-label="סטטוס אורח">
          {GUEST_CHOICES.map((choice) => (
            <button
              key={choice.key}
              type="button"
              role="menuitem"
              className={menu.stay === choice.key ? 'is-on' : ''}
              onClick={() => chooseGuest(choice.key)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
