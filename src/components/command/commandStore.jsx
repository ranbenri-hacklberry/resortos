import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeToOpsEdgeEvents, syncCloudBookingsToDexie, syncUnitOpsToDexie } from '../../lib/cloudDb';
import { useLiveBookings, useLiveUnits } from '../../lib/resortos-db';
import { runCabinStep } from './cabinActions';
import { overlayLiveCabins } from './liveCabins';
import { applyDemoTick, createSeedCabins } from './model';

const CommandContext = createContext(null);

async function pilotFetch(path, options) {
  const response = await fetch(path, options);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) throw new Error('השרת לא החזיר תשובה');
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || 'הפעולה נכשלה');
  return data;
}

export function CommandProvider({ operatorName = 'צוות', tenantId = '', theme = 'dark', children }) {
  const units = useLiveUnits(tenantId);
  const bookings = useLiveBookings(tenantId);
  useEffect(() => {
    if (!tenantId) return undefined;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      syncCloudBookingsToDexie(tenantId, { viaEdge: true }).catch(() => {});
      syncUnitOpsToDexie(tenantId, { viaEdge: true }).catch(() => {});
    };
    pull();
    const unsubscribe = subscribeToOpsEdgeEvents();
    const timer = setInterval(pull, 15000);
    window.addEventListener('focus', pull);
    return () => {
      clearInterval(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('focus', pull);
    };
  }, [tenantId]);
  const liveCabins = useMemo(() => overlayLiveCabins(units, bookings), [units, bookings]);
  const [demoCabins, setDemoCabins] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [isDemoActive, setIsDemoActive] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [turnoverOnly, setTurnoverOnly] = useState(false);
  const [office, setOffice] = useState({
    online: false,
    unit: null,
    busy: '',
    note: '',
  });

  const refreshOffice = useCallback(async () => {
    try {
      const data = await pilotFetch('/api/pilot/office');
      setOffice((prev) => ({
        ...prev,
        online: data.online === true,
        unit: data.unit || null,
        note: prev.busy ? prev.note : '',
      }));
    } catch {
      setOffice((prev) => ({ ...prev, online: false, unit: null }));
    }
  }, []);

  useEffect(() => {
    refreshOffice();
    const id = setInterval(refreshOffice, 15000);
    return () => clearInterval(id);
  }, [refreshOffice]);

  useEffect(() => {
    if (!isDemoActive) return undefined;
    const id = setInterval(() => setDemoCabins((prev) => applyDemoTick(prev || createSeedCabins())), 14000);
    return () => clearInterval(id);
  }, [isDemoActive]);

  const demoArm = useRef(false);

  const toggleDemo = useCallback(() => {
    setIsDemoActive((prev) => {
      const next = !prev;
      if (next && !demoArm.current) {
        demoArm.current = true;
        queueMicrotask(() => {
          demoArm.current = false;
          setDemoCabins((list) => applyDemoTick(list || createSeedCabins()));
        });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      if (event.code !== 'KeyD' && event.key !== 'd' && event.key !== 'D') return;
      event.preventDefault();
      toggleDemo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleDemo]);

  const cabins = isDemoActive ? (demoCabins || createSeedCabins()) : liveCabins;

  const runLive = useCallback(async (work) => {
    if (isDemoActive) return;
    setActionBusy(true);
    setActionError('');
    try {
      await work();
    } catch (err) {
      setActionError(err?.message || 'הפעולה נכשלה');
    } finally {
      setActionBusy(false);
    }
  }, [isDemoActive]);

  const runStep = useCallback((id, action) => {
    const cabin = cabins.find((row) => row.id === id);
    if (!cabin) return;
    if (isDemoActive) {
      if (String(action).startsWith('assign:')) {
        const name = decodeURIComponent(String(action).slice('assign:'.length));
        setDemoCabins((list) => (list || createSeedCabins()).map((row) => (
          row.id === id
            ? { ...row, cleanerName: name, day: { ...(row.day || {}), staff: name } }
            : row
        )));
        return;
      }
      const nextStatus = {
        checkout: 'dirty',
        'start-clean': 'cleaning',
        'finish-clean': 'inspection',
        approve: 'ready',
        checkin: 'occupied',
        'undo-checkout': 'occupied',
        'undo-start': 'dirty',
        'undo-finish': 'dirty',
        'undo-ready': 'inspection',
        'undo-checkin': 'ready',
      }[action];
      if (!nextStatus) return;
      setDemoCabins((list) => (list || createSeedCabins()).map((row) => (
        row.id === id ? { ...row, status: nextStatus } : row
      )));
      return;
    }
    void runLive(() => runCabinStep({ tenantId, cabin, action }));
  }, [cabins, isDemoActive, runLive, tenantId]);

  const runOffice = useCallback(async (action, extra = {}) => {
    setOffice((prev) => ({ ...prev, busy: action, note: '' }));
    try {
      const data = await pilotFetch('/api/pilot/office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, operator: operatorName, ...extra }),
      });
      setOffice((prev) => ({ ...prev, busy: '', note: data.note || 'נשלח לבקר המשרד' }));
      await refreshOffice();
    } catch (err) {
      setOffice((prev) => ({ ...prev, busy: '', note: err.message || 'הפעולה נכשלה' }));
    }
  }, [operatorName, refreshOffice]);

  const value = useMemo(() => ({
    cabins,
    selectedId,
    selected: cabins.find((cabin) => cabin.id === selectedId) || null,
    selectCabin: setSelectedId,
    isDemoActive,
    toggleDemo,
    office,
    runOffice,
    operatorName,
    theme,
    actionBusy,
    actionError,
    runStep,
    turnoverOnly,
    setTurnoverOnly,
  }), [cabins, selectedId, isDemoActive, toggleDemo, office, runOffice, operatorName, theme, actionBusy, actionError, runStep, turnoverOnly]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useCommand() {
  const value = useContext(CommandContext);
  if (!value) throw new Error('useCommand outside provider');
  return value;
}
