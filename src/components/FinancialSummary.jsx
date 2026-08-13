import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  TrendingUp, 
  DollarSign, 
  CreditCard, 
  Calendar as CalendarIcon, 
  Receipt, 
  CheckCircle2, 
  ShieldCheck 
} from 'lucide-react';
import { useLiveBookings, useLiveUnits } from '../lib/hotelos-db';

const DEMO_TENANT_ID = '22222222-2222-2222-2222-222222222222';

export default function FinancialSummary({ tenantId = DEMO_TENANT_ID, theme = 'dark' }) {
  const { t } = useTranslation();

  const bookings = useLiveBookings(tenantId);
  const units = useLiveUnits(tenantId);

  const isLight = theme === 'light';

  const themeStyles = {
    wrapperBg: isLight ? '#FFFFFF' : '#0F172A',
    cardBg: isLight ? '#F8FAFC' : '#1E293B',
    cardBorder: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.08)',
    textPrimary: isLight ? '#0F172A' : '#F8FAFC',
    textMuted: isLight ? '#64748B' : '#94A3B8',
    cellBorder: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
    shadow: isLight ? '0 10px 30px rgba(0,0,0,0.06)' : '0 20px 40px rgba(0,0,0,0.3)'
  };

  // Payment Status Badge Helper
  const getPaymentBadge = (status) => {
    switch (status) {
      case 'PAID':
        return { label: t('PAID'), bg: 'rgba(16, 185, 129, 0.18)', color: '#10B981', border: '#10B981' };
      case 'PARTIAL':
        return { label: t('PARTIAL'), bg: 'rgba(245, 158, 11, 0.18)', color: '#F59E0B', border: '#F59E0B' };
      default:
        return { label: t('UNPAID'), bg: 'rgba(239, 68, 68, 0.18)', color: '#EF4444', border: '#EF4444' };
    }
  };

  // Financial Ledger Calculations (Current Month) - 1.5% System & Processing Fee
  const financialData = useMemo(() => {
    const activeBookings = bookings.filter(b => !b.deleted_at && b.booking_status !== 'CANCELED');

    let totalGrossAgorot = 0;
    let totalFeeAgorot = 0;

    const transactionList = activeBookings.map(b => {
      const grossAgorot = b.total_price_agorot || 0;
      // 1.5% System & Processing Fee
      const feeAgorot = Math.round(grossAgorot * 0.015);
      const netAgorot = grossAgorot - feeAgorot;

      totalGrossAgorot += grossAgorot;
      totalFeeAgorot += feeAgorot;

      const unitRecord = units.find(u => u.id === b.unit_id);
      const unitName = unitRecord ? t(unitRecord.id + '_short', unitRecord.name) : t('UNIT');

      return {
        id: b.id,
        guest_name: t(b.id + '_guest', b.guest_name || 'אורח'),
        unit_name: unitName,
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        payment_status: b.payment_status || 'UNPAID',
        channel_source: b.channel_source || 'DIRECT',
        gross_ils: Math.round(grossAgorot / 100),
        fee_ils: Math.round(feeAgorot / 100),
        net_ils: Math.round(netAgorot / 100)
      };
    });

    const totalNetAgorot = totalGrossAgorot - totalFeeAgorot;

    // Calculate next month's 10th date
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 10);
    const scheduledPayoutDate = `${String(nextMonth.getDate()).padStart(2, '0')}/${String(nextMonth.getMonth() + 1).padStart(2, '0')}/${nextMonth.getFullYear()}`;

    return {
      closedBookingsCount: activeBookings.length,
      grossRevenueIls: Math.round(totalGrossAgorot / 100),
      totalFeesIls: Math.round(totalFeeAgorot / 100),
      netPayoutIls: Math.round(totalNetAgorot / 100),
      scheduledPayoutDate,
      transactions: transactionList
    };
  }, [bookings, units, t]);

  const cardStyle = {
    background: themeStyles.cardBg,
    border: `1px solid ${themeStyles.cardBorder}`,
    borderRadius: '16px',
    padding: '1.25rem',
    boxShadow: themeStyles.shadow,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: '0.75rem'
  };

  return (
    <div style={{
      background: themeStyles.wrapperBg,
      color: themeStyles.textPrimary,
      padding: '0.75rem',
      marginTop: '0.75rem',
      borderRadius: '16px',
      boxShadow: themeStyles.shadow,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* SUMMARY CARDS GRID - STARTS IMMEDIATELY UNDER TOP NAVBAR */}

      {/* SUMMARY CARDS GRID */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* 1. Closed Bookings Count */}
        <motion.div whileHover={{ y: -2 }} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
              {t('TOTAL_CLOSED_BOOKINGS')}
            </span>
            <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: '0.4rem', borderRadius: '10px', color: '#6366F1' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: themeStyles.textPrimary }}>
            {financialData.closedBookingsCount} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: themeStyles.textMuted }}>{t('BOOKINGS_LABEL', 'הזמנות')}</span>
          </div>
        </motion.div>

        {/* 2. Gross Revenue */}
        <motion.div whileHover={{ y: -2 }} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
              {t('GROSS_REVENUE')}
            </span>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '0.4rem', borderRadius: '10px', color: '#10B981' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10B981' }}>
            ₪{financialData.grossRevenueIls.toLocaleString()}
          </div>
        </motion.div>

        {/* 3. System & Processing Fees (1.5%) */}
        <motion.div whileHover={{ y: -2 }} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
              {t('SYSTEM_FEES')}
            </span>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '0.4rem', borderRadius: '10px', color: '#EF4444' }}>
              <CreditCard size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#EF4444' }}>
            ₪{financialData.totalFeesIls.toLocaleString()}
          </div>
        </motion.div>

        {/* 4. Net Payout Credit */}
        <motion.div whileHover={{ y: -2 }} style={{
          ...cardStyle,
          background: isLight 
            ? 'linear-gradient(135deg, #ECFDF5, #D1FAE5)' 
            : 'linear-gradient(135deg, #064E3B, #065F46)',
          border: '1.5px solid #10B981'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: isLight ? '#065F46' : '#A7F3D0' }}>
              {t('NET_PAYOUT_CREDIT')}
            </span>
            <div style={{ background: '#10B981', padding: '0.4rem', borderRadius: '10px', color: '#FFF' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: isLight ? '#047857' : '#FFFFFF' }}>
            ₪{financialData.netPayoutIls.toLocaleString()}
          </div>
        </motion.div>

        {/* 5. Scheduled Payout Date */}
        <motion.div whileHover={{ y: -2 }} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>
              {t('SCHEDULED_PAYOUT_DATE')}
            </span>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '0.4rem', borderRadius: '10px', color: '#F59E0B' }}>
              <CalendarIcon size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#F59E0B' }}>
            {financialData.scheduledPayoutDate}
          </div>
        </motion.div>
      </div>

      {/* DETAILED TRANSACTIONS BREAKDOWN - MAIN SCREEN CARDS STYLE */}
      <div>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '1rem', color: themeStyles.textPrimary }}>
          {t('TRANSACTIONS_LEDGER')} ({financialData.transactions.length})
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem'
        }}>
          {financialData.transactions.map((tx) => {
            const badge = getPaymentBadge(tx.payment_status);

            return (
              <motion.div
                key={tx.id}
                whileHover={{ scale: 1.01 }}
                style={{
                  background: isLight ? '#FFFFFF' : 'linear-gradient(135deg, #1E293B, #0F172A)',
                  border: `1.5px solid ${badge.border}`,
                  borderRadius: '12px',
                  padding: '1rem',
                  boxShadow: isLight ? '0 4px 12px rgba(0,0,0,0.06)' : '0 4px 16px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                {/* Header Row: Guest Name & Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: isLight ? '#0F172A' : '#FFFFFF' }}>
                      {tx.guest_name}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: themeStyles.textMuted, marginRight: '0.5rem' }}>
                      • {tx.unit_name}
                    </span>
                  </div>
                  <span style={{
                    background: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    {badge.label}
                  </span>
                </div>

                {/* Dates Row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8rem',
                  color: themeStyles.textMuted,
                  background: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.03)',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '8px'
                }}>
                  <CalendarIcon size={14} color="#6366F1" />
                  <span>{t('STAY_DATES', 'תאריכי שהייה:')} <strong>{tx.check_in_date}</strong> - <strong>{tx.check_out_date}</strong></span>
                </div>

                {/* Financial Details Row: Gross, Fee, Net */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.5rem',
                  textAlign: 'center',
                  borderTop: `1px solid ${themeStyles.cellBorder}`,
                  paddingTop: '0.6rem',
                  fontSize: '0.75rem'
                }}>
                  <div>
                    <div style={{ color: themeStyles.textMuted }}>{t('GROSS_SHORT', 'ברוטו')}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: themeStyles.textPrimary }}>
                      ₪{tx.gross_ils.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: themeStyles.textMuted }}>{t('FEE_SHORT', 'עמלה (1.5%)')}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#EF4444' }}>
                      -₪{tx.fee_ils.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ color: '#10B981', fontWeight: 700 }}>{t('NET_PAYOUT_LABEL', 'נטו למשיכה')}</div>
                    <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#10B981' }}>
                      ₪{tx.net_ils.toLocaleString()}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
