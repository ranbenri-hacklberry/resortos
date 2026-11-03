import React, { useEffect, useMemo, useState } from 'react';
import { fieldUnitDisplayName } from '../../lib/fieldUnitCatalog';
import { dutyUnitGroup } from '../../lib/dailyDutyReport';
import { priorityDeskGuests } from '../../lib/priorityStay';
import { lodgingKey, lodgingLabel } from '../../lib/priorityStatus';
import { UNIT_STATUS_BADGES, unitDisplayStatus } from '../../lib/unitStatus';
import { inventoryUnits, unitAccessGroup } from '../../lib/units';
import { usePanelHistory } from '../../lib/panelHistory';

const GUEST_CHOICES = [
  { key: 'OCCUPIED', label: 'תפוס' },
  { key: 'VACANT', label: 'פנוי' }
];

function compoundTitle(unit) {
  const byId = unitAccessGroup(unit.id);
  if (byId !== 'יחידות נוספות') return byId;
  const byName = dutyUnitGroup(unit.id, unit.name || '');
  return byName && byName !== 'יחידות נוספות' ? byName : byId;
}

function cleanText(unit, bookings, today) {
  const ops = unit?.operational_status;
  if (ops && UNIT_STATUS_BADGES[ops] && ops !== 'OCCUPIED') return UNIT_STATUS_BADGES[ops].label;
  const badge = unitDisplayStatus(unit, bookings, today);
  if (badge && badge.key !== 'OCCUPIED') return badge.label;
  return '—';
}

function guestText(unit, bookings, today) {
  const desk = priorityDeskGuests(bookings, unit.id, today);
  if (desk.roomStatus) return desk.roomStatus;
  return lodgingLabel(lodgingKey(unit));
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
  usePanelHistory(Boolean(menu), () => setMenu(null));

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

  const groups = useMemo(() => {
    const order = [];
    const map = new Map();
    inventoryUnits(units).forEach((unit) => {
      const title = compoundTitle(unit);
      if (!map.has(title)) {
        const group = { title, units: [] };
        map.set(title, group);
        order.push(group);
      }
      map.get(title).units.push(unit);
    });
    order.forEach((group) => {
      group.units.sort((a, b) => fieldUnitDisplayName(a).localeCompare(fieldUnitDisplayName(b), 'he'));
    });
    return order;
  }, [units]);

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

  return (
    <div className="ops-compounds" dir="rtl">
      {groups.map((group) => {
        const expanded = Boolean(open[group.title]);
        return (
          <section className={`ops-compound${expanded ? ' is-open' : ''}`} key={group.title}>
            <button
              type="button"
              className="ops-compound-head"
              aria-expanded={expanded}
              onClick={() => setOpen((current) => ({ ...current, [group.title]: !current[group.title] }))}
            >
              <span>{group.title}</span>
              <span className="ops-compound-count">{group.units.length}</span>
            </button>
            {expanded ? (
              <div className="ops-compound-body">
                <div className="ops-unit-row is-label" aria-hidden="true">
                  <span>יחידה</span>
                  <span>ניקיון</span>
                  <span>אורח</span>
                </div>
                {group.units.map((unit) => {
                  const stay = lodgingKey(unit);
                  return (
                    <div className="ops-unit-row" key={unit.id}>
                      <span className="ops-unit-name">{fieldUnitDisplayName(unit)}</span>
                      <span className="ops-clean-status">{cleanText(unit, bookings, today)}</span>
                      <button
                        type="button"
                        className={`ops-guest-status${stay === 'OCCUPIED' ? ' is-in' : ''}`}
                        onClick={(event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setMenu({
                            unitId: unit.id,
                            stay,
                            top: Math.min(rect.bottom, window.innerHeight - 70),
                            right: Math.max(4, window.innerWidth - rect.right)
                          });
                        }}
                      >
                        {guestText(unit, bookings, today)}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
      {!groups.length ? <div className="ops-compound-empty">אין יחידות</div> : null}
      <section className={`ops-compound${open.shop ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ops-compound-head"
          aria-expanded={Boolean(open.shop)}
          onClick={() => setOpen((current) => ({ ...current, shop: !current.shop }))}
        >
          <span>רכש</span>
          <span className="ops-compound-count">{shoppingItems.filter((item) => !item.done).length}</span>
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
