import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { COMPOUNDS } from './model';
import { displayPhone } from './liveCabins';
import { bedInventoryFor, bedPrepLine, resolveBedPrep } from './bedInventory';
import { DRAWER_STATUS, cleaningStatusLine, primaryAction, showPrepWorkflow, undoAction, usefulPrepNote } from './roomWorkflow';
import { useCommand } from './commandStore';
import { israelToday } from '../../lib/cabinAccess';
import { listAssignableStaff } from '../../lib/staffAuth';

function isHousekeepingStaff(row) {
  const role = String(row?.role || '').toUpperCase();
  return !role || role === 'HOUSEKEEPING' || role === 'MANAGER' || role === 'OPS_MANAGER';
}

function StayGlance({ kind, stay, whenLabel, whenValue, extra }) {
  return (
    <div className="stay-glance">
      <span className="stay-kind">{kind}</span>
      <strong>{stay.name}</strong>
      <span>{whenLabel}: {whenValue || 'לא צוינה'}</span>
      {extra ? <span>{extra}</span> : null}
      {stay.phone ? <span className="drawer-phone" dir="ltr">{displayPhone(stay.phone)}</span> : <span>אין טלפון</span>}
    </div>
  );
}

function StepButton({ className, disabled, onClick, children }) {
  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function CleanerField({ staff, cleaners, busy, onAssign }) {
  const known = cleaners.some((row) => row.name === staff);
  if (!cleaners.length) {
    return (
      <form
        className="cleaner-field"
        key={staff || 'empty'}
        onSubmit={(event) => {
          event.preventDefault();
          onAssign(String(new FormData(event.currentTarget).get('name') || '').trim());
        }}
      >
        <span>מנקה</span>
        <input name="name" defaultValue={staff} placeholder="שם המנקה" disabled={busy} />
        <button type="submit" disabled={busy}>שייך</button>
      </form>
    );
  }
  return (
    <label className="cleaner-field">
      <span>מנקה</span>
      <select
        aria-label="שיבוץ מנקה"
        value={staff}
        disabled={busy}
        onChange={(event) => onAssign(event.target.value)}
      >
        <option value="">לא שויך</option>
        {staff && !known ? <option value={staff}>{staff}</option> : null}
        {cleaners.map((person) => (
          <option key={person.id} value={person.name}>{person.name}</option>
        ))}
      </select>
    </label>
  );
}

export default function DetailDrawer() {
  const { selected, selectCabin, theme, actionBusy, actionError, runStep } = useCommand();
  const light = theme === 'light';
  const today = israelToday();
  const [cleaners, setCleaners] = useState([]);
  const primary = selected ? primaryAction(selected) : null;
  const undo = selected ? undoAction(selected, today) : null;
  const day = selected?.day;
  const stage = selected?.holdLabel || DRAWER_STATUS[selected?.status] || '';
  const prepOpen = selected ? showPrepWorkflow(selected) : false;
  const staff = String(day?.staff || selected?.cleanerName || '').trim();
  const note = usefulPrepNote(day?.notes);
  const requests = day?.arriving?.requests || [];
  const bed = day?.arriving
    ? resolveBedPrep({
      inventory: bedInventoryFor(selected.id),
      request: day.arriving.bedRequest,
      chosen: day.arriving.bedChosen,
      done: day.arriving.bedPrepDone,
    })
    : null;
  const cleanPhase = selected?.status === 'ready'
    ? 'ready'
    : selected?.status === 'inspection'
      ? 'confirmed'
      : staff
        ? 'assigned'
        : 'unassigned';

  useEffect(() => {
    if (!selected?.id) return undefined;
    let cancelled = false;
    listAssignableStaff()
      .then((rows) => {
        if (cancelled) return;
        const list = (Array.isArray(rows) ? rows : [])
          .filter((row) => row?.is_active !== false && isHousekeepingStaff(row))
          .map((row) => ({
            id: row.id,
            name: String(row.display_name || row.username || '').trim(),
          }))
          .filter((row) => row.name);
        setCleaners(list);
      })
      .catch(() => {
        if (!cancelled) setCleaners([]);
      });
    return () => { cancelled = true; };
  }, [selected?.id]);

  const assignCleaner = (name) => {
    if (!selected) return;
    runStep(selected.id, `assign:${encodeURIComponent(name)}`);
  };

  return (
    <AnimatePresence>
      {selected ? (
        <motion.aside
          key={selected.id}
          className={`drawer-panel${light ? ' is-light' : ''}`}
          initial={{ x: 440 }}
          animate={{ x: 0 }}
          exit={{ x: 440 }}
          transition={{ type: 'tween', duration: 0.22 }}
        >
          <header className="drawer-sticky">
            <div className="drawer-title-row">
              <div>
                <p className="kicker">{COMPOUNDS[selected.compoundId]?.name}</p>
                <h2>{selected.displayName}</h2>
              </div>
              <button type="button" className="drawer-close" onClick={() => selectCabin(null)} aria-label="סגירה">
                <X size={18} />
              </button>
            </div>
            <span className="status-tag" data-status={selected.holdLabel ? 'hold' : selected.status}>{stage}</span>
            {day?.departing || day?.arriving ? (
              <div className="guest-overview">
                {day?.departing ? (
                  <StayGlance
                    kind="יוצא"
                    stay={day.departing}
                    whenLabel={day.departing.actualCheckOut ? 'יצא' : 'יציאה'}
                    whenValue={day.departing.actualCheckOut || day.departing.plannedCheckOut}
                  />
                ) : null}
                {day?.arriving ? (
                  <StayGlance
                    kind="מגיע"
                    stay={day.arriving}
                    whenLabel="הגעה"
                    whenValue={day.arriving.plannedCheckIn}
                    extra={day.arriving.party || ''}
                  />
                ) : null}
              </div>
            ) : null}
            {prepOpen ? (
              <p className="clean-state" data-cleaning={cleanPhase}>
                {cleaningStatusLine({ status: selected.status, staff })}
              </p>
            ) : null}
            {prepOpen && (selected.status === 'occupied' || selected.status === 'dirty' || selected.status === 'cleaning') ? (
              <CleanerField staff={staff} cleaners={cleaners} busy={actionBusy} onAssign={assignCleaner} />
            ) : null}
            {primary ? (
              <div className="drawer-actions">
                <StepButton className="stay" disabled={actionBusy} onClick={() => runStep(selected.id, primary.id)}>
                  {primary.label}
                </StepButton>
              </div>
            ) : null}
            {actionError ? <p className="drawer-note">{actionError}</p> : null}
          </header>

          <div className="drawer-scroll">
            {prepOpen ? (
              <section className="guest-section is-prep">
                <h3>{day?.arriving ? 'הכנה לאורח הבא' : 'הכנת החדר'}</h3>
                {bed ? (
                  <div className={`bed-prep is-${bed.status}`}>
                    <p>{bedPrepLine(bed)}</p>
                    {bed.status === 'pending' || bed.status === 'review' ? (
                      <div className="bed-choices">
                        {bed.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            disabled={actionBusy}
                            onClick={() => runStep(selected.id, `bed-setup:${option.id}`)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {bed.status === 'confirmed' || bed.status === 'only' ? (
                      <StepButton className="ready" disabled={actionBusy} onClick={() => runStep(selected.id, 'bed-done')}>
                        סידור המיטות הושלם
                      </StepButton>
                    ) : null}
                  </div>
                ) : null}
                {requests.length ? <p>בקשות: {requests.join(' · ')}</p> : null}
                {note ? <p>הערות: {note}</p> : null}
                {undo ? (
                  <div className="drawer-actions">
                    <StepButton className="undo" disabled={actionBusy} onClick={() => runStep(selected.id, undo.id)}>
                      {undo.label}
                    </StepButton>
                  </div>
                ) : null}
              </section>
            ) : undo ? (
              <div className="drawer-actions">
                <StepButton className="undo" disabled={actionBusy} onClick={() => runStep(selected.id, undo.id)}>
                  {undo.label}
                </StepButton>
              </div>
            ) : null}

            {!day?.departing && !day?.arriving && selected.guest ? (
              <section className="guest-section">
                <h3>אורח בחדר</h3>
                <StayGlance
                  kind="בחדר"
                  stay={selected.guest}
                  whenLabel="יציאה"
                  whenValue={selected.guest.checkOut}
                />
              </section>
            ) : null}
            {!day && !selected.guest && !selected.holdLabel ? <p className="drawer-muted">אין אורח בחדר היום</p> : null}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
