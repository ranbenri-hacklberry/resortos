import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { Building2, CalendarDays, ShieldAlert } from 'lucide-react';
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
import FinancialCommandCenter from './finance/FinancialCommandCenter';
import { GUEST_BRAND } from '../lib/guestTheme';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

export default function FinancialSummary({
  tenantId = DEMO_TENANT_ID,
  theme = 'dark',
  setTheme = null,
  session = null,
  financeOnly = false
}) {
  const bookings = useLiveBookings(tenantId);
  const units = useLiveUnits(tenantId);
  const isLight = theme === 'light';
  const [part, setPart] = useState('command-center');
  const [seen, setSeen] = useState({ 'command-center': true, banks: false, bookings: false });
  const [, startTab] = useTransition();
  const [store, setStore] = useState(() => loadDailyCollection());
  const [maxPayload, setMaxPayload] = useState(null);
  const [beinleumiPayload, setBeinleumiPayload] = useState(null);
  const [hypPayload, setHypPayload] = useState(null);
  const [bankTxs, setBankTxs] = useState([]);
  const [overview, setOverview] = useState(null);

  const styles = {
    wrapperBg: isLight ? GUEST_BRAND.cream : GUEST_BRAND.wine,
    cardBg: isLight ? '#FFFFFF' : '#1A0C09',
    cardBorder: isLight ? 'rgba(191, 179, 168, 0.4)' : 'rgba(242, 228, 233, 0.12)',
    textPrimary: isLight ? GUEST_BRAND.wine : GUEST_BRAND.cream,
    textMuted: isLight ? GUEST_BRAND.mocha : GUEST_BRAND.cloudy,
    inputBg: isLight ? '#FFFFFF' : '#3A221C',
    shadow: isLight ? '0 10px 30px rgba(38, 19, 15, 0.05)' : '0 20px 40px rgba(0, 0, 0, 0.4)'
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

  if (financeOnly) {
    return (
      <div style={{
        background: styles.wrapperBg,
        minHeight: '100vh',
        color: styles.textPrimary,
        fontFamily: GUEST_BRAND.fontBody,
        padding: '0.5rem'
      }}>
        <FinancialCommandCenter
          theme={theme}
          setTheme={setTheme}
          session={session}
          financeOnly={true}
          styles={styles}
          overview={overview}
          beinleumiStatement={beinleumiPayload}
          maxCredits={maxPayload?.rows || []}
          hypPayments={hypPayload?.rows || []}
          collectionRows={allRows}
          bookings={bookings}
        />
      </div>
    );
  }

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
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0.55rem',
        marginBottom: '1rem'
      }}>
        <button
          type="button"
          onClick={() => showPart('command-center')}
          style={{
            border: part === 'command-center' ? 'none' : `1px solid ${styles.cardBorder}`,
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            background: part === 'command-center' ? 'linear-gradient(135deg, #4F46E5, #06B6D4)' : styles.cardBg,
            color: part === 'command-center' ? '#fff' : styles.textPrimary,
            cursor: 'pointer',
            textAlign: 'right',
            boxShadow: part === 'command-center' ? '0 4px 15px rgba(79, 70, 229, 0.35)' : 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '1.05rem' }}>
            <ShieldAlert size={18} /> חמ״ל פיננסי 120 יום
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
            ניצול מסגרות 50%/60%, כריות ביטחון, פער מימון ו-Chloe
          </div>
        </button>
        <button
          type="button"
          onClick={() => showPart('banks')}
          style={{
            border: part === 'banks' ? 'none' : `1px solid ${styles.cardBorder}`,
            borderRadius: '14px',
            padding: '0.85rem 1rem',
            background: part === 'banks' ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)' : styles.cardBg,
            color: part === 'banks' ? '#fff' : styles.textPrimary,
            cursor: 'pointer',
            textAlign: 'right'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '1.05rem' }}>
            <Building2 size={18} /> בנקים וכרטיסים
          </div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.78rem', opacity: 0.85, fontWeight: 600 }}>
            יתרות נוכחיות, תנועות עו״ש, סליקה ושיוך חשבונות
          </div>
        </button>
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
      </div>

      {seen['command-center'] ? (
        <div style={{ display: part === 'command-center' ? 'block' : 'none' }}>
          <FinancialCommandCenter
            theme={theme}
            styles={styles}
            overview={overview}
            beinleumiStatement={beinleumiPayload}
            maxCredits={maxPayload?.rows || []}
            hypPayments={hypPayload?.rows || []}
            collectionRows={allRows}
            bookings={bookings}
          />
        </div>
      ) : null}

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
