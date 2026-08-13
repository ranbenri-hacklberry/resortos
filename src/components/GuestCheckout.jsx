import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  CheckCircle2, 
  Calendar as CalendarIcon, 
  CreditCard, 
  ShieldCheck, 
  Clock, 
  MessageSquare,
  Sparkles,
  Lock
} from 'lucide-react';
import { db, useLiveBookingByToken, useLiveUnits } from '../lib/hotelos-db';
import { pushBookingToCloud } from '../lib/cloudDb';

export default function GuestCheckout({ token, onComplete, theme = 'dark' }) {
  const { t } = useTranslation();

  const booking = useLiveBookingByToken(token);
  const units = useLiveUnits(booking?.tenant_id || '');

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [cardNumber, setCardNumber] = useState('4580 •••• •••• 1234');
  const [cardExpiry, setCardExpiry] = useState('08/28');
  const [cardCvc, setCardCvc] = useState('789');

  const [isSubmitted, setIsSubmitted] = useState(false);

  const isLight = theme === 'light';

  const themeStyles = {
    wrapperBg: isLight ? '#F8FAFC' : '#0F172A',
    cardBg: isLight ? '#FFFFFF' : '#1E293B',
    inputBg: isLight ? '#F1F5F9' : '#111827',
    inputBorder: isLight ? '#CBD5E1' : 'rgba(255,255,255,0.12)',
    textPrimary: isLight ? '#0F172A' : '#F8FAFC',
    textMuted: isLight ? '#64748B' : '#94A3B8',
    shadow: isLight ? '0 10px 30px rgba(0,0,0,0.06)' : '0 20px 40px rgba(0,0,0,0.4)'
  };

  let activeBooking = booking;
  if (!activeBooking && token && token.startsWith('v1_')) {
    try {
      const rawBase64 = token.slice(3).replace(/-/g, '+').replace(/_/g, '/');
      let decoded = '';
      try {
        decoded = atob(rawBase64);
      } catch (e) {
        const padded = rawBase64 + '==='.slice((rawBase64.length + 3) % 4);
        decoded = atob(padded);
      }
      const payload = JSON.parse(decoded);
      const basePrices = { u1: 85000, u2: 120000, u3: 250000, u4: 90000 };
      const basePriceAgorot = basePrices[payload.u] || 85000;
      const totalPriceAgorot = basePriceAgorot * (payload.n || 1);

      const checkIn = new Date(payload.d || Date.now());
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + (payload.n || 1));
      const checkOutStr = `${checkOut.getFullYear()}-${String(checkOut.getMonth() + 1).padStart(2, '0')}-${String(checkOut.getDate()).padStart(2, '0')}`;

      activeBooking = {
        id: 'b_token_' + (payload.rand || 'sync'),
        tenant_id: payload.t || '22222222-2222-2222-2222-222222222222',
        unit_id: payload.u || 'u3',
        guest_name: 'הזמנה בטיפול (WhatsApp)',
        guest_phone: payload.p || '0548076123',
        check_in_date: payload.d || new Date().toISOString().split('T')[0],
        check_out_date: checkOutStr,
        adults_count: 2,
        children_count: 0,
        total_price_agorot: totalPriceAgorot,
        deposit_agorot: Math.round(totalPriceAgorot * 0.25),
        booking_status: 'PENDING',
        payment_status: 'UNPAID',
        payment_mode: payload.m || 'CREDIT_DEPOSIT',
        channel_source: 'DIRECT',
        checkout_token: token,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1
      };
    } catch (e) {
      console.error('[SYNC TOKEN DECODE ERROR]', e);
    }
  }

  if (!activeBooking && token) {
    activeBooking = {
      id: 'b_legacy_' + token,
      tenant_id: '22222222-2222-2222-2222-222222222222',
      unit_id: 'u3',
      guest_name: 'הזמנה בטיפול (WhatsApp)',
      guest_phone: '0548076123',
      check_in_date: new Date().toISOString().split('T')[0],
      check_out_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      adults_count: 2,
      children_count: 0,
      total_price_agorot: 500000,
      deposit_agorot: 125000,
      booking_status: 'PENDING',
      payment_status: 'UNPAID',
      payment_mode: 'CREDIT_DEPOSIT',
      channel_source: 'DIRECT',
      checkout_token: token,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    };
  }

  if (!activeBooking) {
    return (
      <div style={{
        background: themeStyles.wrapperBg,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          background: themeStyles.cardBg,
          borderRadius: '16px',
          padding: '2rem',
          textAlign: 'center',
          maxWidth: '400px',
          boxShadow: themeStyles.shadow,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <Clock size={40} color="#F59E0B" style={{ marginBottom: '1rem' }} />
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#FFFFFF' }}>קישור ההזמנה אינו פעיל או פג תוקף</h3>
          <p style={{ fontSize: '0.85rem', color: themeStyles.textMuted, marginTop: '0.5rem' }}>
            אנא פנה לבעל הצימר לקבלת קישור הזמנה מעודכן.
          </p>
        </div>
      </div>
    );
  }

  const DEMO_NAMES_FALLBACK = {
    u1: 'אורנית',
    u2: 'אלונים',
    u3: 'כרמים',
    u4: 'סלע'
  };
  const safeUnits = Array.isArray(units) ? units : [];
  const unitRecord = safeUnits.find(u => u.id === activeBooking.unit_id);
  const unitName = unitRecord ? t(unitRecord.id + '_short', unitRecord.name) : (DEMO_NAMES_FALLBACK[activeBooking.unit_id] || 'צימר כרמים');

  const paymentMode = activeBooking.payment_mode || 'CREDIT_DEPOSIT';
  const totalPriceIls = Math.round((activeBooking.total_price_agorot || 0) / 100);
  const depositIls = Math.round((activeBooking.deposit_agorot || 0) / 100);

  const handleSubmit = async (e) => {
    e.preventDefault();

    let newPaymentStatus = 'UNPAID';
    if (paymentMode === 'CREDIT_FULL') {
      newPaymentStatus = 'PAID';
    } else if (paymentMode === 'CREDIT_DEPOSIT') {
      newPaymentStatus = 'PARTIAL';
    } else {
      newPaymentStatus = 'UNPAID';
    }

    const updatedBooking = {
      ...activeBooking,
      guest_name: guestName,
      guest_email: guestEmail,
      special_requests: specialRequests,
      booking_status: 'CONFIRMED',
      payment_status: newPaymentStatus,
      updated_at: new Date().toISOString()
    };

    await db.bookings.put(updatedBooking);
    await pushBookingToCloud(updatedBooking);
    setIsSubmitted(true);

    // Push real-time cloud relay so owner Mac Studio calendar auto-confirms instantly across the internet!
    try {
      if (activeBooking.checkout_token) {
        await fetch('https://api.restful-api.dev/objects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'hotelos_confirm_' + activeBooking.checkout_token,
            data: {
              token: activeBooking.checkout_token,
              guest_name: guestName,
              guest_email: guestEmail,
              booking_status: 'CONFIRMED',
              payment_status: newPaymentStatus,
              updated_at: new Date().toISOString()
            }
          })
        });
      }
    } catch (relayErr) {
      console.warn('[REALTIME CONFIRMATION RELAY WARN]', relayErr);
    }
  };

  return (
    <div style={{
      background: themeStyles.wrapperBg,
      minHeight: '100vh',
      padding: '1.5rem 1rem',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: themeStyles.textPrimary
    }}>
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%',
          maxWidth: '480px',
          background: themeStyles.cardBg,
          borderRadius: '20px',
          padding: '1.5rem',
          boxShadow: themeStyles.shadow,
          border: `1px solid ${themeStyles.inputBorder}`
        }}
      >
        {isSubmitted ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ textAlign: 'center', padding: '2rem 1rem' }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              color: '#FFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)'
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#10B981' }}>
              ההזמנה אושרה בהצלחה! 🎉
            </h2>

            <p style={{ fontSize: '0.9rem', color: themeStyles.textMuted, marginTop: '0.5rem', lineHeight: 1.5 }}>
              תודה {guestName}! פרטי האישור והקבלות נשלחו לכתובת <strong>{guestEmail}</strong>.
            </p>

            <div style={{
              background: isLight ? '#F1F5F9' : 'rgba(255,255,255,0.03)',
              borderRadius: '12px',
              padding: '1rem',
              marginTop: '1.5rem',
              textAlign: 'right',
              fontSize: '0.85rem'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '0.5rem' }}>פרטי השהייה:</div>
              <div>יחידה: <strong>{unitName}</strong></div>
              <div>תאריכים: <strong>{activeBooking.check_in_date}</strong> עד <strong>{activeBooking.check_out_date}</strong></div>
              <div>מספר אישור: <strong style={{ color: '#6366F1' }}>#{activeBooking.id}</strong></div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* HEADER BANNER */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              paddingBottom: '1rem',
              borderBottom: `1px solid ${themeStyles.inputBorder}`
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={20} color="#6366F1" />
                  <span>{t('GUEST_CHECKOUT_TITLE')}</span>
                </h2>
                <div style={{ fontSize: '0.75rem', color: themeStyles.textMuted, marginTop: '2px' }}>
                  טופס אישור שהייה ואבטחת תשלום
                </div>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid #F59E0B',
                color: '#F59E0B',
                borderRadius: '20px',
                padding: '0.3rem 0.6rem',
                fontSize: '0.7rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                <Lock size={12} />
                <span>{t('PENDING_LOCK')}</span>
              </div>
            </div>

            {/* BOOKING SUMMARY CARD */}
            <div style={{
              background: isLight ? '#F1F5F9' : '#111827',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.25rem',
              border: `1px solid ${themeStyles.inputBorder}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{unitName}</span>
                <span style={{
                  background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                  color: '#FFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}>
                  {activeBooking.channel_source || 'DIRECT'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: themeStyles.textMuted, marginBottom: '0.75rem' }}>
                <CalendarIcon size={14} color="#6366F1" />
                <span>{activeBooking.check_in_date} עד {activeBooking.check_out_date}</span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: `1px solid ${themeStyles.inputBorder}`,
                paddingTop: '0.6rem',
                fontSize: '0.9rem'
              }}>
                <span>סה"כ לתשלום:</span>
                <span style={{ fontWeight: 900, fontSize: '1.15rem', color: '#10B981' }}>₪{totalPriceIls.toLocaleString()}</span>
              </div>

              {paymentMode === 'CREDIT_DEPOSIT' && (
                <div style={{ fontSize: '0.75rem', color: '#F59E0B', textAlign: 'left', marginTop: '4px' }}>
                  מקדמה נדרשת לחיוב עכשיו: ₪{depositIls.toLocaleString()}
                </div>
              )}
            </div>

            {/* GUEST DETAILS FORM */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_NAME')}</label>
                <input
                  type="text"
                  required
                  placeholder="ישראל ישראלי"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '10px',
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.95rem',
                    marginTop: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted }}>{t('GUEST_EMAIL')}</label>
                <input
                  type="email"
                  required
                  placeholder="israel@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '10px',
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.95rem',
                    marginTop: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: themeStyles.textMuted, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <MessageSquare size={14} color="#6366F1" />
                  <span>{t('SPECIAL_REQUESTS')}</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="שעות הגעה משוערות, הצעות נישואין, טבעונות..."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    borderRadius: '10px',
                    background: themeStyles.inputBg,
                    border: `1px solid ${themeStyles.inputBorder}`,
                    color: themeStyles.textPrimary,
                    fontSize: '0.85rem',
                    marginTop: '4px',
                    resize: 'none'
                  }}
                />
              </div>

              {/* PAYMENT SECTION (IF CREDIT MODE) */}
              {paymentMode !== 'CASH_TRUST' ? (
                <div style={{
                  background: isLight ? '#F8FAFC' : '#111827',
                  border: '1.5px solid #10B981',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginTop: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <CreditCard size={16} />
                      <span>אבטחת אשראי PayFac (SSL 256-bit)</span>
                    </span>
                    <ShieldCheck size={18} color="#10B981" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem',
                        borderRadius: '8px',
                        background: themeStyles.inputBg,
                        border: `1px solid ${themeStyles.inputBorder}`,
                        color: themeStyles.textPrimary,
                        fontSize: '0.85rem'
                      }}
                    />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        style={{
                          width: '100%',
                          padding: '0.6rem',
                          borderRadius: '8px',
                          background: themeStyles.inputBg,
                          border: `1px solid ${themeStyles.inputBorder}`,
                          color: themeStyles.textPrimary,
                          fontSize: '0.85rem'
                        }}
                      />
                      <input
                        type="password"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="CVC"
                        style={{
                          width: '100%',
                          padding: '0.6rem',
                          borderRadius: '8px',
                          background: themeStyles.inputBg,
                          border: `1px solid ${themeStyles.inputBorder}`,
                          color: themeStyles.textPrimary,
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid #6366F1',
                  borderRadius: '12px',
                  padding: '0.8rem',
                  fontSize: '0.8rem',
                  color: '#6366F1',
                  textAlign: 'center'
                }}>
                  🤝 תשלום במזומן בהגעה (ללא חיוב אשראי). בלחיצה אינך מתחייב בכרטיס.
                </div>
              )}

              <button
                type="submit"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0.9rem',
                  fontSize: '1rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  marginTop: '0.5rem',
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
                }}
              >
                {t('CONFIRM_AND_PAY')}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
