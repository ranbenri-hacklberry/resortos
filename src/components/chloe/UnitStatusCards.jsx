import React, { useState } from 'react';
import { 
  Sparkles, CheckCircle2, AlertTriangle, Clock, RefreshCw, 
  Home, UserCheck, ShieldAlert, LogOut, DoorOpen
} from 'lucide-react';

export function UnitStatusCards({ data }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'can_clean' | 'in_house' | 'ready'

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
        אין יחידות להצגה בחתך זה.
      </div>
    );
  }

  const items = data.items;

  // 1. "עכשיו כבר אפשר לנקות": האורח יצא היום (בראש התור!) או יחידות פנויות שצריכות ניקיון
  const canCleanNowItems = items.filter((i) => {
    if (i.status === 'READY') return false;
    return i.can_clean_now !== false && !i.is_still_in_house;
  }).sort((a, b) => {
    // Units where guest checked out appear at the very top of the cleaning queue!
    if (a.is_departed && !b.is_departed) return -1;
    if (!a.is_departed && b.is_departed) return 1;
    if (a.status === 'IN_PROGRESS' && b.status !== 'IN_PROGRESS') return -1;
    if (a.status !== 'IN_PROGRESS' && b.status === 'IN_PROGRESS') return 1;
    return 0;
  });

  // 2. "עוד בשהייה · יוצאים היום": אורחים שעדיין בחדר ויוצאים היום
  const stillInHouseItems = items.filter((i) => i.is_still_in_house);

  // 3. יחידות מוכנות
  const readyItems = items.filter((i) => i.status === 'READY');

  const filteredItems = filter === 'can_clean'
    ? canCleanNowItems
    : filter === 'in_house'
    ? stillInHouseItems
    : filter === 'ready'
    ? readyItems
    : items;

  const isGroupedView = items.length > 1 && filter === 'all' && (canCleanNowItems.length > 0 || stillInHouseItems.length > 0);

  const renderUnitCard = (u) => {
    const isReady = u.status === 'READY';
    const isInProgress = u.status === 'IN_PROGRESS';
    const isMaint = u.status === 'MAINTENANCE_ALERT' || u.status === 'MAINTENANCE';
    const isDeparted = Boolean(u.is_departed);
    const isStillInHouse = Boolean(u.is_still_in_house);
    const checkoutTime = u.checkout_time || '11:00';

    return (
      <div
        key={u.id}
        style={{
          background: '#FFFFFF',
          border: isDeparted 
            ? '1.5px solid #10B981' 
            : isStillInHouse 
            ? '1.5px solid #F59E0B' 
            : '1px solid rgba(197, 160, 89, 0.25)',
          borderRadius: '12px',
          padding: '0.7rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          boxShadow: isDeparted 
            ? '0 3px 12px rgba(16, 185, 129, 0.12)' 
            : '0 2px 6px rgba(38, 19, 15, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: isDeparted ? '#ECFDF5' : isReady ? '#ECFDF5' : '#FAF8F3',
              border: isDeparted 
                ? '1px solid rgba(16, 185, 129, 0.4)' 
                : '1px solid rgba(197, 160, 89, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDeparted ? '#059669' : isReady ? '#059669' : '#8C6B28'
            }}>
              {isDeparted ? <DoorOpen size={15} /> : <Home size={14} />}
            </div>
            <div>
              <div style={{ fontSize: '0.86rem', fontWeight: 900, color: '#26130F' }}>
                {u.name}
              </div>
              {u.assigned_staff && (
                <div style={{ fontSize: '0.68rem', color: '#736055', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <UserCheck size={11} color="#8C6B28" />
                  <span>{u.assigned_staff}</span>
                </div>
              )}
            </div>
          </div>

          {/* Departure & Occupancy Status Badge */}
          {isDeparted ? (
            <div style={{
              background: '#ECFDF5',
              border: '1px solid #10B981',
              color: '#047857',
              fontSize: '0.72rem',
              fontWeight: 900,
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <CheckCircle2 size={12} />
              <span>🚪 האורח יצא · מוכן לניקיון</span>
            </div>
          ) : isStillInHouse ? (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #F59E0B',
              color: '#B45309',
              fontSize: '0.72rem',
              fontWeight: 900,
              padding: '0.2rem 0.55rem',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <Clock size={12} />
              <span>⏳ בשהייה · יציאה ב-{checkoutTime}</span>
            </div>
          ) : (
            <div style={{
              background: isReady ? '#ECFDF5' : isInProgress ? '#FEF3C7' : isMaint ? '#FEF2F2' : '#FFFBEB',
              color: isReady ? '#059669' : isInProgress ? '#B45309' : isMaint ? '#DC2626' : '#D97706',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '0.2rem 0.5rem',
              borderRadius: '999px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              {isReady && <CheckCircle2 size={12} />}
              {isInProgress && <Clock size={12} />}
              {isMaint && <ShieldAlert size={12} />}
              {!isReady && !isInProgress && !isMaint && <RefreshCw size={12} />}
              <span>{isReady ? 'מוכן לקליטה' : isInProgress ? 'בניקיון כרגע' : isMaint ? 'תקלה' : 'ממתין לניקיון'}</span>
            </div>
          )}
        </div>

        {/* Departure Context Info */}
        {u.checkout_guest && (
          <div style={{
            fontSize: '0.72rem',
            color: '#736055',
            background: '#FAF8F3',
            padding: '0.3rem 0.5rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>אורח יוצא: <strong>{u.checkout_guest}</strong></span>
            {isDeparted ? (
              <span style={{ color: '#059669', fontWeight: 800 }}>✓ צ'ק-אאוט בוצע</span>
            ) : (
              <span style={{ color: '#B45309', fontWeight: 800 }}>שעת עזיבה: {checkoutTime}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      marginTop: '0.65rem',
      width: '100%',
      maxWidth: '100%'
    }}>
      {/* Title & Summary */}
      {data.title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          fontWeight: 900,
          color: '#8C6B28',
          paddingInline: '0.2rem'
        }}>
          <span>{data.title}</span>
          <span style={{ fontSize: '0.68rem', color: '#9E897C', fontWeight: 600 }}>
            {readyItems.length} מוכנות מתוך {items.length}
          </span>
        </div>
      )}

      {/* Filter Badges */}
      {items.length > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          overflowX: 'auto',
          paddingBottom: '0.2rem'
        }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={{
              padding: '0.25rem 0.55rem',
              borderRadius: '999px',
              fontSize: '0.68rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: filter === 'all' ? '1px solid #C5A059' : '1px solid rgba(197, 160, 89, 0.25)',
              background: filter === 'all' ? '#C5A059' : '#FFFFFF',
              color: filter === 'all' ? '#FFFFFF' : '#736055'
            }}
          >
            הכל ({items.length})
          </button>

          {canCleanNowItems.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter('can_clean')}
              style={{
                padding: '0.25rem 0.55rem',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: filter === 'can_clean' ? '1px solid #10B981' : '1px solid rgba(16, 185, 129, 0.3)',
                background: filter === 'can_clean' ? '#10B981' : '#ECFDF5',
                color: filter === 'can_clean' ? '#FFFFFF' : '#059669'
              }}
            >
              ✨ אפשר לנקות עכשיו ({canCleanNowItems.length})
            </button>
          )}

          {stillInHouseItems.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter('in_house')}
              style={{
                padding: '0.25rem 0.55rem',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: filter === 'in_house' ? '1px solid #F59E0B' : '1px solid rgba(245, 158, 11, 0.3)',
                background: filter === 'in_house' ? '#F59E0B' : '#FFFBEB',
                color: filter === 'in_house' ? '#FFFFFF' : '#B45309'
              }}
            >
              ⏳ עוד בשהייה ({stillInHouseItems.length})
            </button>
          )}

          {readyItems.length > 0 && (
            <button
              type="button"
              onClick={() => setFilter('ready')}
              style={{
                padding: '0.25rem 0.55rem',
                borderRadius: '999px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: filter === 'ready' ? '1px solid #C5A059' : '1px solid rgba(197, 160, 89, 0.25)',
                background: filter === 'ready' ? '#C5A059' : '#FFFFFF',
                color: filter === 'ready' ? '#FFFFFF' : '#736055'
              }}
            >
              מוכנות ({readyItems.length})
            </button>
          )}
        </div>
      )}

      {/* Cards Display */}
      {isGroupedView ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Section 1: עכשיו כבר אפשר לנקות */}
          {canCleanNowItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingInline: '0.2rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Sparkles size={14} color="#059669" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#059669' }}>
                    עכשיו כבר אפשר לנקות ({canCleanNowItems.length})
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#736055', fontWeight: 600 }}>
                  האורח יצא / יחידה פנויה
                </span>
              </div>
              {canCleanNowItems.map(renderUnitCard)}
            </div>
          )}

          {/* Section 2: עוד בשהייה אבל יוצאים היום */}
          {stillInHouseItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingInline: '0.2rem',
                paddingTop: '0.3rem',
                borderTop: '1px dashed rgba(197, 160, 89, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={14} color="#D97706" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#D97706' }}>
                    עוד בשהייה · יוצאים היום ({stillInHouseItems.length})
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#736055', fontWeight: 600 }}>
                  שעת עזיבה רשומה
                </span>
              </div>
              {stillInHouseItems.map(renderUnitCard)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {filteredItems.map(renderUnitCard)}
        </div>
      )}
    </div>
  );
}
