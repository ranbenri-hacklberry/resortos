import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { Building2, CalendarDays } from 'lucide-react';
import { useLiveBookings, useLiveUnits } from '../lib/resortos-db';
import { loadDailyCollection, seedDailyCollectionIfEmpty } from '../lib/dailyCollection';
import { syncCloudBookingsToDexie } from '../lib/cloudDb';
import { loadMaxCredits } from '../lib/maxCredits';
import { loadBeinleumiStatement } from '../lib/beinleumiStatement';
import { incomingBankRows, matchBankToCollection } from '../lib/bankCollectionMatch';
import { mergeKinorotArrivals } from '../lib/bookingFinance';
import { loadHypPayments } from '../lib/hypPayments';
import { fetchAllFinanceTransactions, fetchFinanceOverview } from '../lib/openFinanceApi';
import { addDaysIso } from '../lib/cashFlowForecast';
import { israelToday } from '../lib/cabinAccess';
import FinanceBanksPanel from './FinanceBanksPanel';
import FinanceBookingsPanel from './FinanceBookingsPanel';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

export default function FinancialSummary({ tenantId = DEMO_TENANT_ID, theme = 'dark' }) {
  const bookings = useLiveBookings(tenantId);
  const units = useLiveUnits(tenantId);
  const isLight = theme === 'light';
  const [part, setPart] = useState('bookings');
  const [seen, setSeen] = useState({ banks: false, bookings: true });
  const [, startTab] = useTransition();
  const [store, setStore] = useState(() => loadDailyCollection());
  const [maxPayload, setMaxPayload] = useState(null);
  const [beinleumiPayload, setBeinleumiPayload] = useState(null);
  const [hypPayload, setHypPayload] = useState(null);
  const [bankTxs, setBankTxs] = useState([]);
  const [overview, setOverview] = useState(null);

  const styles = {
    wrapperBg: isLight ? '#FFFFFF' : '#0F172A',
    cardBg: isLight ? '#F8FAFC' : '#1E293B',
    cardBorder: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
    textPrimary: isLight ? '#0F172A' : '#F8FAFC',
    textMuted: isLight ? '#64748B' : '#94A3B8',
    inputBg: isLight ? '#FFFFFF' : '#0B1220',
    shadow: isLight ? '0 10px 30px rgba(0,0,0,0.06)' : '0 20px 40px rgba(0,0,0,0.3)'
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await seedDailyCollectionIfEmpty();
      if (!cancelled) setStore(next);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!tenantId) return undefined;
    syncCloudBookingsToDexie(tenantId);
    const timer = setInterval(() => syncCloudBookingsToDexie(tenantId), 15000);
    return () => clearInterval(timer);
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadMaxCredits();
        if (!cancelled) setMaxPayload(data);
      } catch {
        if (!cancelled) setMaxPayload(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadBeinleumiStatement();
        if (!cancelled) setBeinleumiPayload(data);
      } catch {
        if (!cancelled) setBeinleumiPayload(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadHypPayments();
        if (!cancelled) setHypPayload(data);
      } catch {
        if (!cancelled) setHypPayload(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = israelToday();
      let nextOverview = null;
      let txItems = [];
      try {
        nextOverview = await fetchFinanceOverview();
      } catch {
        nextOverview = null;
      }
      try {
        const tx = await fetchAllFinanceTransactions({
          dateFrom: addDaysIso(today, -150),
          dateTo: today,
          limit: 100
        });
        txItems = tx.items || [];
      } catch {
        txItems = [];
      }
      if (cancelled) return;
      setOverview(nextOverview);
      setBankTxs(txItems);
    })();
    return () => { cancelled = true; };
  }, []);

  function showPart(next) {
    startTab(() => {
      setSeen((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
      setPart(next);
    });
  }

  const allRows = useMemo(
    () => mergeKinorotArrivals(store?.rows || [], bookings, units),
    [store, bookings, units]
  );
  const bankRows = useMemo(
    () => incomingBankRows(beinleumiPayload, bankTxs),
    [beinleumiPayload, bankTxs]
  );
  const bankMatch = useMemo(
    () => matchBankToCollection(allRows, bankRows),
    [allRows, bankRows]
  );

  return (
    <div style={{
      background: styles.wrapperBg,
      color: styles.textPrimary,
      padding: '0.85rem',
      marginTop: '0.75rem',
      borderRadius: '16px',
      boxShadow: styles.shadow,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.55rem',
        marginBottom: '1rem'
      }}>
        <button
          type="button"
          onClick={() => showPart('bookings')}
          style={{
            border: part === 'bookings' ? 'none' : `1px solid ${styles.cardBorder}`,
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            background: part === 'bookings' ? 'linear-gradient(135deg, #D97706, #B45309)' : styles.cardBg,
            color: part === 'bookings' ? '#fff' : styles.textPrimary,
            cursor: 'pointer',
            textAlign: 'right'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '1.05rem' }}>
            <CalendarDays size={18} /> הזמנות וגבייה
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
            סכום הזמנה מול מה ששולם בפועל באשראי, מזומן והעברה
          </div>
        </button>
        <button
          type="button"
          onClick={() => showPart('banks')}
          style={{
            border: part === 'banks' ? 'none' : `1px solid ${styles.cardBorder}`,
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            background: part === 'banks' ? 'linear-gradient(135deg, #4F46E5, #3730A3)' : styles.cardBg,
            color: part === 'banks' ? '#fff' : styles.textPrimary,
            cursor: 'pointer',
            textAlign: 'right'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '1.05rem' }}>
            <Building2 size={18} /> בנקים ותזרים
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
            יתרות, תנועות אחרונות, ותחזית יתרה לפי יום
          </div>
        </button>
      </div>

      {seen.banks ? (
        <div style={{ display: part === 'banks' ? 'block' : 'none' }}>
          <FinanceBanksPanel
            theme={theme}
            styles={styles}
            maxCredits={maxPayload?.rows || []}
            collectionRows={allRows}
            beinleumiStatement={beinleumiPayload}
            overview={overview}
            transactions={bankTxs}
            onStatementSynced={async () => {
              try {
                setBeinleumiPayload(await loadBeinleumiStatement());
              } catch {
                /* keep previous statement if scrape did not write a file */
              }
            }}
            onHypSynced={async () => {
              try {
                setHypPayload(await loadHypPayments());
              } catch {
                /* keep previous hyp file if sync did not write */
              }
            }}
          />
        </div>
      ) : null}
      {seen.bookings ? (
        <div style={{ display: part === 'bookings' ? 'block' : 'none' }}>
          <FinanceBookingsPanel
            theme={theme}
            styles={styles}
            store={store}
            setStore={setStore}
            allRows={allRows}
            bookings={bookings}
            units={units}
            bankMatch={bankMatch}
            hypPayload={hypPayload}
            beinleumiStatement={beinleumiPayload}
            bankRows={bankRows}
            onHypSynced={async () => {
              try {
                setHypPayload(await loadHypPayments());
              } catch {
                /* keep previous hyp file if sync did not write */
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
