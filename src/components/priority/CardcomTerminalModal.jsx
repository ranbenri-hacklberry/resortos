import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Search,
  X,
  AlertCircle,
  Home,
  Calendar,
  Phone,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { getCandidateUnpaidBookings } from '../../lib/cardcomMatchCandidates.js';

export const ACK_CARDCOM_DEALS_KEY = 'resortos_ack_cardcom_deals';

export function getAcknowledgedDealIds() {
  try {
    const raw = localStorage.getItem(ACK_CARDCOM_DEALS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveAcknowledgedDealId(dealId) {
  if (!dealId) return;
  try {
    const current = getAcknowledgedDealIds();
    current.add(String(dealId));
    localStorage.setItem(ACK_CARDCOM_DEALS_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

export function saveAcknowledgedDealIds(dealIds = []) {
  try {
    const current = getAcknowledgedDealIds();
    dealIds.forEach((id) => {
      if (id) current.add(String(id));
    });
    localStorage.setItem(ACK_CARDCOM_DEALS_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

/**
 * Mobile & Desktop popup when a payment was automatically updated in the system.
 * Shows payment details and an "אישור" (Acknowledge) button.
 */
export function CardcomAutoApprovedModal({
  isOpen = false,
  deals = [],
  onAcknowledge,
  onAcknowledgeAll,
  onClose
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!isOpen || !deals || deals.length === 0) return null;

  const currentDeal = deals[Math.min(currentIndex, deals.length - 1)] || deals[0];
  const totalCount = deals.length;
  const isMultiple = totalCount > 1;

  const handleAckCurrent = () => {
    const dealId = currentDeal?.deal_id;
    if (dealId && onAcknowledge) {
      onAcknowledge(dealId);
    }
    if (currentIndex < totalCount - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose?.();
    }
  };

  const handleAckAll = () => {
    const allIds = deals.map((d) => d.deal_id).filter(Boolean);
    if (onAcknowledgeAll) {
      onAcknowledgeAll(allIds);
    }
    onClose?.();
  };

  const amountStr = Number(currentDeal?.amount || 0).toLocaleString('he-IL');
  const timeStr = currentDeal?.approved_at || currentDeal?.deal_time
    ? new Date(currentDeal.approved_at || currentDeal.deal_time).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jerusalem'
      })
    : '';

  return (
    <div className="guest-print-modal-backdrop" role="dialog" aria-modal="true" dir="rtl">
      <div
        className="guest-print-modal"
        style={{
          maxWidth: '460px',
          border: '2px solid #22c55e',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(22, 163, 74, 0.25)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
            color: '#ffffff',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CheckCircle2 size={24} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                תשלום עודכן במערכת בהצלחה ✅
              </h3>
              {isMultiple ? (
                <span style={{ fontSize: '12px', opacity: 0.9 }}>
                  עדכון {currentIndex + 1} מתוך {totalCount}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAckCurrent}
            aria-label="סגירה"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 20px', backgroundColor: '#f8fafc' }}>
          {/* Main Amount Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '18px',
              textAlign: 'center',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e2e8f0',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
              סכום שהתקבל בסליקה
            </div>
            <div style={{ fontSize: '34px', fontWeight: 900, color: '#16a34a', letterSpacing: '-0.5px' }}>
              ₪{amountStr}
            </div>
            {timeStr ? (
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                התקבל בשעה {timeStr}
              </div>
            ) : null}
          </div>

          {/* Details List */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '14px 16px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>שם אורח:</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {currentDeal?.guest_name || currentDeal?.payer_name || 'אורח'}
              </span>
            </div>

            {currentDeal?.unit_name ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>יחידה:</span>
                <span style={{ fontWeight: 700, color: '#0369a1' }}>
                  {currentDeal.unit_name}
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#64748b' }}>פרטי סליקה:</span>
              <span style={{ fontWeight: 600, color: '#334155', fontSize: '13px' }}>
                4 ספרות: {currentDeal?.last4 || '****'} · אישור: {currentDeal?.approval || 'אין'}
              </span>
            </div>

            {currentDeal?.invoice_number ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>חשבונית מס קבלה:</span>
                <span style={{ fontWeight: 700, color: '#16a34a' }}>
                  מס׳ {currentDeal.invoice_number}
                  {currentDeal?.invoice_url ? (
                    <a
                      href={currentDeal.invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginRight: '6px', color: '#2563eb', verticalAlign: 'middle' }}
                      title="פתיחת חשבונית"
                    >
                      <ExternalLink size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    </a>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <button
            type="button"
            onClick={handleAckCurrent}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)'
            }}
          >
            <Check size={20} />
            {isMultiple ? `אישור (${currentIndex + 1} מתוך ${totalCount})` : 'אישור'}
          </button>

          {isMultiple ? (
            <button
              type="button"
              onClick={handleAckAll}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: 'transparent',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              אישור לכל {totalCount} העדכונים
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile-first modal for unlinked / incomplete match Cardcom terminal charges.
 * Prominently presents the payment and lets staff choose from unpaid bookings
 * where the amount covers full balance, deposit, or partial balance.
 */
export default function CardcomTerminalModal({
  isOpen = false,
  onClose,
  pendingCharges = [],
  bookings = [],
  units = [],
  onLinkDeal,
  onIgnoreDeal,
  linkingDealId = null
}) {
  const [selectedDealIndex, setSelectedDealIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  const currentDeal = pendingCharges[Math.min(selectedDealIndex, pendingCharges.length - 1)] || pendingCharges[0];

  // Candidates for the current deal
  const candidateBookings = useMemo(() => {
    if (!currentDeal?.amount) return [];
    return getCandidateUnpaidBookings(currentDeal.amount, bookings, searchQuery);
  }, [currentDeal?.amount, bookings, searchQuery]);

  if (!isOpen || !pendingCharges || pendingCharges.length === 0) return null;

  const dealId = currentDeal?.deal_id;
  const isBusy = linkingDealId === dealId;
  const amountFormatted = Number(currentDeal?.amount || 0).toLocaleString('he-IL');

  return (
    <div className="guest-print-modal-backdrop" role="dialog" aria-modal="true" dir="rtl">
      <div
        className="guest-print-modal"
        style={{
          maxWidth: '680px',
          maxHeight: '90vh',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
                סליקה ממסוף ידני – בחירת הזמנה לשיוך
              </h3>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {pendingCharges.length === 1
                  ? 'סליקה 1 ממתינה לשיוך'
                  : `${pendingCharges.length} סליקות ממתינות לשיוך`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Multi-deal tabs if more than one pending */}
        {pendingCharges.length > 1 ? (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: '#1e293b',
              overflowX: 'auto'
            }}
          >
            {pendingCharges.map((ch, idx) => {
              const active = idx === selectedDealIndex;
              return (
                <button
                  key={ch.deal_id || idx}
                  type="button"
                  onClick={() => setSelectedDealIndex(idx)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: active ? '#f59e0b' : '#334155',
                    color: active ? '#0f172a' : '#cbd5e1',
                    whiteSpace: 'nowrap'
                  }}
                >
                  עסקה {idx + 1}: ₪{Number(ch.amount || 0).toLocaleString('he-IL')}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Current Deal Info Banner */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#fef3c7',
            borderBottom: '1px solid #fde68a',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 600 }}>סכום ששולם:</span>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#92400e' }}>
                ₪{amountFormatted}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
              עסקה {dealId}
              {currentDeal?.deal_time ? ` · ${new Date(currentDeal.deal_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: '#78350f' }}>
            <span style={{ backgroundColor: '#fef9c3', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fef08a' }}>
              💳 4 ספרות: <b>{currentDeal?.last4 || '????'}</b>
            </span>
            <span style={{ backgroundColor: '#fef9c3', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fef08a' }}>
              אישור: <b>{currentDeal?.approval || 'אין'}</b>
            </span>
            {currentDeal?.payer_name ? (
              <span style={{ backgroundColor: '#fef9c3', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fef08a' }}>
                בעל כרטיס: <b>{currentDeal.payer_name}</b>
              </span>
            ) : null}
          </div>
        </div>

        {/* Search Input */}
        <div style={{ padding: '12px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 12px'
            }}
          >
            <Search size={16} color="#64748b" />
            <input
              type="text"
              placeholder="חיפוש הזמנה לפי שם אורח, יחידה, טלפון או תאריך…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                width: '100%',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {/* Candidates List Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {candidateBookings.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1'
              }}
            >
              <AlertCircle size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                לא נמצאו הזמנות שלא שולמו המתאימות לסכום זה
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px' }}>
                נסה לנקות את מונח החיפוש או לבדוק אם ההזמנה כבר סומנה כשולמה.
              </div>
            </div>
          ) : (
            candidateBookings.map((candidate) => {
              const isRecommended = candidate.priority === 1;

              return (
                <div
                  key={candidate.bookingId}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: isRecommended ? '2px solid #22c55e' : '1px solid #e2e8f0',
                    padding: '14px 16px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  {/* Candidate Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                          {candidate.guestName}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: '#e0f2fe',
                            color: '#0369a1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Home size={12} /> {candidate.unitName}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        📅 תאריכים: {candidate.checkIn} עד {candidate.checkOut}
                        {candidate.guestPhone ? ` · 📞 ${candidate.guestPhone}` : ''}
                      </div>
                    </div>

                    {/* Classification Tag Badge */}
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        backgroundColor: candidate.badgeBg || '#e2e8f0',
                        color: candidate.tagColor || '#1e293b',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {candidate.tag}
                    </div>
                  </div>

                  {/* Financial calculation description */}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <span style={{ color: '#475569' }}>יתרה נוכחית: </span>
                      <b style={{ color: '#0f172a' }}>₪{candidate.dueIls.toLocaleString('he-IL')}</b>
                      <span style={{ color: '#94a3b8', fontSize: '12px', marginRight: '6px' }}>
                        (מתוך סה״כ ₪{candidate.totalIls.toLocaleString('he-IL')})
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: candidate.tagColor }}>
                      {candidate.description}
                    </div>
                  </div>

                  {/* Link Button */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setPendingAction({
                      type: 'link',
                      dealId,
                      bookingId: candidate.bookingId,
                      guestName: candidate.guestName,
                      amount: amountFormatted
                    })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: isRecommended ? '#16a34a' : '#2563eb',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isBusy ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      opacity: isBusy ? 0.7 : 1
                    }}
                  >
                    <Check size={16} />
                    {isBusy
                      ? 'משייך תשלום ומפיק חשבונית מס קבלה…'
                      : candidate.type === 'partial_payment'
                      ? `שייך כתשלום חלקי להזמנה זו (יסגור ₪${amountFormatted})`
                      : 'שייך סליקה זו להזמנה'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <button
            type="button"
            onClick={() => setPendingAction({
              type: 'test',
              dealId,
              amount: amountFormatted
            })}
            style={{
              padding: '8px 16px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <AlertCircle size={15} />
            סמן כבדיקה (דורש אישור)
          </button>

          <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            כל שינוי סטטוס דורש אישור מפורש
          </div>
        </div>

        {/* Status Change Confirmation Overlay */}
        {pendingAction ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
              backdropFilter: 'blur(3px)'
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                padding: '24px',
                maxWidth: '440px',
                width: '100%',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                textAlign: 'center'
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: pendingAction.type === 'test' ? '#fef3c7' : '#dcfce7',
                  color: pendingAction.type === 'test' ? '#d97706' : '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto'
                }}
              >
                {pendingAction.type === 'test' ? <AlertCircle size={26} /> : <CheckCircle2 size={26} />}
              </div>

              <div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  {pendingAction.type === 'test' ? 'אישור סימון כבדיקה' : 'אישור שיוך סליקה'}
                </h4>
                <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
                  {pendingAction.type === 'test' ? (
                    `האם לסמן את העסקה על סך ₪${pendingAction.amount} כבדיקה? העסקה תועבר לסטטוס בדיקה ולא תשויך להזמנה.`
                  ) : (
                    `האם לשייך את הסליקה על סך ₪${pendingAction.amount} להזמנה של ${pendingAction.guestName}? הפעולה תרשום תשלום ותפיק חשבונית מס קבלה אחת.`
                  )}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={async () => {
                    const action = pendingAction;
                    setPendingAction(null);
                    if (action.type === 'test') {
                      onIgnoreDeal?.(action.dealId, 'test');
                    } else if (action.type === 'link') {
                      onLinkDeal?.(action.dealId, action.bookingId);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: pendingAction.type === 'test' ? '#d97706' : '#16a34a',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '15px',
                    cursor: 'pointer'
                  }}
                >
                  אישור
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Mobile floating pill banner shown when pending unlinked charges exist.
 */
export function CardcomMobilePill({ pendingCount = 0, totalAmount = 0, onClick }) {
  if (!pendingCount || pendingCount <= 0) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        padding: '8px 12px',
        backgroundColor: '#f59e0b',
        color: '#78350f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 700
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CreditCard size={18} />
        <span>
          {pendingCount === 1
            ? `סליקה חדשה לא משויכת${totalAmount ? ` (₪${Number(totalAmount).toLocaleString('he-IL')})` : ''}`
            : `${pendingCount} סליקות חדשות לא משויכות${totalAmount ? ` (₪${Number(totalAmount).toLocaleString('he-IL')})` : ''}`}
        </span>
      </div>
      <div
        style={{
          backgroundColor: '#78350f',
          color: '#ffffff',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: 800
        }}
      >
        לחץ לשיוך ›
      </div>
    </div>
  );
}
