import { useEffect, useState } from 'react';
import { fetchGuestCheckout } from './guestCheckoutApi';

/** Guest page lookup. Network only — never Dexie, so phones / Brave Shields can still retry. */
export function useGuestBooking(token) {
  const [booking, setBooking] = useState(undefined);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setBooking(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setBooking(undefined);
    setError(null);
    (async () => {
      try {
        const unit = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('unit') : '';
        const row = await fetchGuestCheckout(token, unit);
        if (cancelled) return;
        setBooking(row && !row.deleted_at ? row : null);
        if (!row || row.deleted_at) setError('NOT_FOUND');
      } catch (err) {
        if (!cancelled) {
          setBooking(null);
          setError(err?.code === 'NOT_FOUND' || err?.code === 'EXPIRED' ? err.code : 'NETWORK');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  return {
    booking,
    error,
    retry: () => setAttempt((n) => n + 1)
  };
}
