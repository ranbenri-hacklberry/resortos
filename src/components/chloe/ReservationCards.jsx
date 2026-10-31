import React, { useState } from 'react';
import { 
  ChevronDown, ChevronUp, User, Home, Calendar, Phone, 
  MessageCircle, CheckCircle2, AlertCircle, Clock, Sparkles 
} from 'lucide-react';

export function ReservationCards({ data, onActionRequest }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    return (
      <div style={{
        padding: '0.8rem',
        borderRadius: '12px',
        background: 'rgba(197, 160, 89, 0.08)',
        border: '1px dashed rgba(197, 160, 89, 0.3)',
        fontSize: '0.8rem',
        color: '#736055',
        textAlign: 'center',
        marginTop: '0.5rem'
      }}>
        אין הזמנות להצגה בחתך זה.
      </div>
    );
  }

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const cleanPhone = (phone) => String(phone || '').replace(/\D/g, '');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
      marginTop: '0.65rem',
      width: '100%',
      maxWidth: '100%'
    }}>
      {/* Optional Widget Header */}
      {data.title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.75rem',
          fontWeight: 800,
          color: '#8C6B28',
          paddingInline: '0.2rem',
          marginBottom: '0.1rem'
        }}>
          <span>{data.title}</span>
          <span style={{ fontSize: '0.68rem', color: '#9E897C', fontWeight: 600 }}>לחץ לפירוט מלא ▾</span>
        </div>
      )}

      {/* Cards List */}
      {data.items.map((item) => {
        const isExpanded = expandedId === item.id;
        const readiness = item.readiness || { label: 'מוכן', isReady: true, color: '#10B981' };
        const payment = item.payment || { label: 'טרם אומת', color: '#6B7280', bg: '#F3F4F6' };

        return (
          <div
            key={item.id}
            style={{
              background: '#FFFFFF',
              border: isExpanded ? '1.5px solid #C5A059' : '1px solid rgba(197, 160, 89, 0.28)',
              borderRadius: '12px',
              padding: '0.75rem 0.85rem',
              boxShadow: isExpanded 
                ? '0 6px 18px rgba(197, 160, 89, 0.18)' 
                : '0 2px 8px rgba(38, 19, 15, 0.05)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onClick={() => toggleExpand(item.id)}
          >
            {/* Header: Guest Name + Unit Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.4rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #FAF8F3, #F2EFE9)',
                  border: '1px solid rgba(197, 160, 89, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#8C6B28',
                  fontWeight: 900,
                  fontSize: '0.8rem'
                }}>
                  {item.guest_name ? item.guest_name[0] : '👤'}
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#26130F', lineHeight: 1.2 }}>
                    {item.guest_name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#8C6B28', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Home size={12} />
                    <span>{item.unit_name}</span>
                  </div>
                </div>
              </div>

              {/* Expand Chevron */}
              <div style={{
                color: isExpanded ? '#C5A059' : '#9E897C',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center'
              }}>
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {/* Badges Row: Readiness + Payment */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
              marginTop: '0.35rem'
            }}>
              {/* Readiness Pill */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '0.2rem 0.5rem',
                borderRadius: '999px',
                background: readiness.isReady ? '#ECFDF5' : '#FFFBEB',
                color: readiness.color,
                border: `1px solid ${readiness.isReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
              }}>
                {readiness.isReady ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                <span>{readiness.label}</span>
              </span>

              {/* Payment Pill */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '0.2rem 0.5rem',
                borderRadius: '999px',
                background: payment.bg,
                color: payment.color,
                border: `1px solid ${payment.color}33`
              }}>
                <span>{payment.label}</span>
              </span>
            </div>

            {/* INLINE EXPANDED DETAILS (In-place Generative UI) */}
            {isExpanded && (
              <div 
                style={{
                  marginTop: '0.75rem',
                  paddingTop: '0.7rem',
                  borderTop: '1px dashed rgba(197, 160, 89, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  fontSize: '0.78rem'
                }}
                onClick={(e) => e.stopPropagation()} // Keep click on buttons from closing card
              >
                {/* Stay Dates & Guests */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#FAF8F3',
                  padding: '0.45rem 0.65rem',
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#5A4A42' }}>
                    <Calendar size={13} color="#C5A059" />
                    <span style={{ fontWeight: 700 }}>
                      {item.check_in_date} ⟵ {item.check_out_date}
                    </span>
                  </div>
                  <div style={{ color: '#8C6B28', fontWeight: 800 }}>
                    {item.adults} מבוגרים{item.children > 0 ? ` + ${item.children} ילדים` : ''}
                  </div>
                </div>

                {/* Special Requests */}
                {item.special_requests && (
                  <div style={{
                    background: '#FFFDF9',
                    border: '1px solid rgba(197, 160, 89, 0.25)',
                    borderRadius: '8px',
                    padding: '0.45rem 0.65rem',
                    fontSize: '0.74rem',
                    color: '#5A4A42'
                  }}>
                    <span style={{ fontWeight: 800, color: '#8C6B28' }}>בקשות מיוחדות: </span>
                    <span>{item.special_requests}</span>
                  </div>
                )}

                {/* Quick Interactive Actions inside the Card */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.4rem',
                  marginTop: '0.2rem'
                }}>
                  {item.guest_phone && (
                    <a
                      href={`https://wa.me/972${cleanPhone(item.guest_phone).replace(/^0/, '')}?text=${encodeURIComponent(`שלום ${item.guest_name}, שמחים שבחרת להתארח ב-ResortOS! 🌿`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        background: '#F0FDF4',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        color: '#059669',
                        borderRadius: '7px',
                        padding: '0.45rem',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        textDecoration: 'none'
                      }}
                    >
                      <MessageCircle size={13} />
                      <span>פתח ווטסאפ</span>
                    </a>
                  )}

                  {item.guest_phone && (
                    <a
                      href={`tel:${cleanPhone(item.guest_phone)}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        background: '#FAF8F3',
                        border: '1px solid rgba(197, 160, 89, 0.35)',
                        color: '#8C6B28',
                        borderRadius: '7px',
                        padding: '0.45rem',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        textDecoration: 'none'
                      }}
                    >
                      <Phone size={13} />
                      <span>חייג לאורח</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
