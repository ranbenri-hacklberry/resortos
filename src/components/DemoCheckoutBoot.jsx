import React, { useEffect, useState } from 'react';
import GuestCheckout from './GuestCheckout.jsx';
import { fetchGuestCheckout, startDemoCheckout } from '../lib/guestCheckoutApi';
import { demoGuestBooking } from '../lib/guestDemoStay';
import { persistDemoFormToken, readDemoFormToken } from '../lib/stayToken';

export default function DemoCheckoutBoot({ theme }) {
  const [token, setToken] = useState('');
  const [fallback, setFallback] = useState(null);

  useEffect(() => {
    let stop = false;

    function useRow(row) {
      if (stop || !row?.checkout_token) return false;
      persistDemoFormToken(row.checkout_token);
      setToken(row.checkout_token);
      return true;
    }

    function startNew() {
      startDemoCheckout('form')
        .then((row) => {
          if (!useRow(row)) return;
        })
        .catch(() => {
          if (stop) return;
          const sentAt = new Date().toISOString();
          setFallback({
            ...demoGuestBooking('pre'),
            booking_status: 'PENDING',
            payment_status: 'UNPAID',
            created_at: sentAt,
            link_sent_at: sentAt,
            guest_email: '',
            stay: {
              cabin_ready: false,
              folio: [],
              checkout_time: '11:00',
              baby_cot_required: true,
              link_sent_at: sentAt
            }
          });
        });
    }

    const saved = readDemoFormToken();
    if (saved) {
      fetchGuestCheckout(saved)
        .then((row) => {
          if (useRow(row)) return;
          startNew();
        })
        .catch(startNew);
      return () => {
        stop = true;
      };
    }

    startNew();
    return () => {
      stop = true;
    };
  }, []);

  if (token) return <GuestCheckout token={token} theme={theme} />;
  if (fallback) return <GuestCheckout token="" theme={theme} previewBooking={fallback} />;
  return null;
}
