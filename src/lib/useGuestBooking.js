import { useEffect, useState } from 'react';
import { fetchGuestCheckout, fetchUnitCheckout } from './guestCheckoutApi';
import { persistStayToken } from './stayToken';

/** Guest page lookup. Network only — never Dexie, so phones / Brave Shields can still retry. */
export function useGuestBooking(token) {
  const [booking, setBooking] = useState(undefined);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const unit = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('unit') : '';
    if (!token && !unit) {
      setBooking(null);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setBooking(undefined);
    setError(null);
    (async () => {
      try {
        let row = null;
        if (token) {
          row = await fetchGuestCheckout(token, unit);
        } else if (unit) {
          row = await fetchUnitCheckout(unit);
          if (row?.checkout_token) {
            persistStayToken(row.checkout_token);
            try {
              const url = new URL(window.location.href);
              if (!url.searchParams.get('token')) {
                url.searchParams.set('token', row.checkout_token);
                window.history.replaceState({}, '', url);
              }
            } catch (_) {}
          }
        }
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
