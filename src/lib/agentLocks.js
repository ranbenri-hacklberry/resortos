import { useEffect, useState } from 'react';
import { staysOverlap } from './bookingOverlap';

export function liveAgentLocks(locks, now = Date.now()) {
  return (locks || []).filter((row) => Date.parse(row.expires_at) > now);
}

export function findOverlappingAgentLock(locks, cabinId, checkIn, checkOut, now = Date.now()) {
  return liveAgentLocks(locks, now).find((row) => (
    row.cabin_id === cabinId
    && staysOverlap(checkIn, checkOut, row.start_date, row.end_date)
  )) || null;
}

export function agentLockOnNight(locks, cabinId, dateIso, now = Date.now()) {
  const end = new Date(`${dateIso}T12:00:00`);
  end.setDate(end.getDate() + 1);
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, '0');
  const d = String(end.getDate()).padStart(2, '0');
  return findOverlappingAgentLock(locks, cabinId, dateIso, `${y}-${m}-${d}`, now);
}

export function agentLockMinutesLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60000));
}

export function agentLockLabel(lock, now = Date.now()) {
  if (!lock) return '';
  const minutes = agentLockMinutesLeft(lock.expires_at, now);
  const name = lock.agent_name || 'סוכן';
  return `נעול ע״י ${name} · ממתין לתשלום · ${minutes} דק׳`;
}

export function useAgentLocks(pollMs = 8000) {
  const [locks, setLocks] = useState([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const response = await fetch('/api/agent-locks', { signal: AbortSignal.timeout(9000) });
        if (!response.ok) throw new Error('LOCKS_FAILED');
        const data = await response.json();
        if (!stop) {
          setLocks(liveAgentLocks(data.locks));
          setError(false);
        }
      } catch {
        if (!stop) {
          setLocks([]);
          setError(true);
        }
      }
    }
    pull();
    const id = setInterval(pull, pollMs);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pollMs]);
  return { locks, error };
}
