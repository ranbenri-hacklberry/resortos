import React, { useState } from 'react';
import { 
  Sparkles, CheckCircle2, AlertTriangle, Clock, RefreshCw, 
  Home, UserCheck, ShieldAlert, LogOut, DoorOpen, ChevronDown, ChevronUp, Check, Wrench
} from 'lucide-react';

function safeString(val, fallback = '') {
  if (val == null) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val
      .map((x) => (typeof x === 'object' ? (x?.text || x?.note || x?.label || JSON.stringify(x)) : String(x)))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof val === 'object') {
    return val.text || val.note || val.label || val.message || JSON.stringify(val);
  }
  return String(val);
}

export function UnitStatusCards({ data }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'can_clean' | 'in_house' | 'ready'
  const [items, setItems] = useState(() => (Array.isArray(data?.items) ? data.items : []));
  const [expandedUnitId, setExpandedUnitId] = useState(null);
  const [updatingUnitId, setUpdatingUnitId] = useState(null);
  const [statusFeedback, setStatusFeedback] = useState({}); // unitId -> string

  // Keep local items in sync if prop changes significantly
  React.useEffect(() => {
    if (Array.isArray(data?.items)) {
      setItems(data.items);
    }
  }, [data]);

  if (!items || items.length === 0) {
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

  // Handle changing room status from within the card
  const handleUpdateUnitStatus = async (unitId, targetStatus) => {
    setUpdatingUnitId(unitId);
    
    // Optimistic UI Update
    setItems((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      return {
        ...u,
        status: targetStatus,
        can_clean_now: targetStatus === 'DIRTY' || targetStatus === 'IN_PROGRESS',
        updated_at: new Date().toISOString()
      };
    }));

    const statusHebrewMap = {
      READY: 'מוכן ונקי לקליטה ✓',
      IN_PROGRESS: 'בניקיון כרגע 🧹',
      DIRTY: 'ממתין לניקיון ⏳',
      MAINTENANCE_ALERT: 'תקלת אחזקה ⚠️'
    };

    setStatusFeedback((prev) => ({
      ...prev,
      [unitId]: `עודכן: ${statusHebrewMap[targetStatus] || targetStatus}`
    }));

    setTimeout(() => {
      setStatusFeedback((prev) => {
        const next = { ...prev };
        delete next[unitId];
        return next;
      });
    }, 4000);

    // Persist to Backend API
    try {
      const token = localStorage.getItem('resortos_dashboard_token_v1') || 'dev-local-token';
      await fetch(`/api/ops/units/${encodeURIComponent(unitId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          operational_status: targetStatus,
          updated_at: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn('[UnitStatus Update Warning]', err);
    } finally {
      setUpdatingUnitId(null);
    }
  };

  // Handle Mark Guest Departed (Check-out) directly from the card
  const handleMarkDeparted = async (unitId) => {
    setUpdatingUnitId(unitId);

    // Optimistic UI Update: marked as departed, no longer in house, moves to top of cleaning!
    setItems((prev) => prev.map((u) => {
      if (u.id !== unitId) return u;
      return {
        ...u,
        is_departed: true,
        is_still_in_house: false,
        status: u.status === 'READY' ? 'READY' : 'DIRTY',
        can_clean_now: true,
        updated_at: new Date().toISOString()
      };
    }));

    setStatusFeedback((prev) => ({
      ...prev,
      [unitId]: 'האורח יצא! היחידה עלתה לראש תור הניקיון 🚪✓'
    }));

    setTimeout(() => {
      setStatusFeedback((prev) => {
        const next = { ...prev };
        delete next[unitId];
        return next;
      });
    }, 4500);

    // Persist to Backend API
    try {
      const token = localStorage.getItem('resortos_dashboard_token_v1') || 'dev-local-token';
      await fetch(`/api/ops/units/${encodeURIComponent(unitId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          staff_occupancy: 'VACANT',
          operational_status: 'DIRTY',
          updated_at: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn('[UnitCheckout Update Warning]', err);
    } finally {
      setUpdatingUnitId(null);
    }
  };

  const renderUnitCard = (u) => {
    const isReady = u.status === 'READY';
    const isInProgress = u.status === 'IN_PROGRESS';
    const isMaint = u.status === 'MAINTENANCE_ALERT' || u.status === 'MAINTENANCE';
    const isDeparted = Boolean(u.is_departed);
    const isStillInHouse = Boolean(u.is_still_in_house);
    const checkoutTime = safeString(u.checkout_time, '11:00');
    const isExpanded = expandedUnitId === u.id;
    const feedback = statusFeedback[u.id];

    return (
      <div
        key={u.id}
        style={{
          background: '#FFFFFF',
          border: isDeparted 
            ? '1.5px solid #10B981' 
            : isStillInHouse 
            ? '1.5px solid #F59E0B' 
            : isExpanded
            ? '1.5px solid #C5A059'
            : '1px solid rgba(197, 160, 89, 0.25)',
          borderRadius: '12px',
          padding: '0.75rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.45rem',
          boxShadow: isDeparted 
            ? '0 3px 12px rgba(16, 185, 129, 0.12)' 
            : '0 2px 6px rgba(38, 19, 15, 0.04)',
          transition: 'all 0.2s ease',
          cursor: 'pointer'
        }}
        onClick={() => setExpandedUnitId((prev) => (prev === u.id ? null : u.id))}
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
                {safeString(u.name)}
              </div>
              {u.assigned_staff && (
                <div style={{ fontSize: '0.68rem', color: '#736055', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <UserCheck size={11} color="#8C6B28" />
                  <span>{safeString(u.assigned_staff)}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
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
                <span>🚪 יצא · לניקיון</span>
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
                <span>⏳ בשהייה ({checkoutTime})</span>
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

            {/* Expand / Collapse Chevron */}
            <div style={{ color: isExpanded ? '#C5A059' : '#9E897C', display: 'flex', alignItems: 'center' }}>
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
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
            <span>אורח יוצא: <strong>{safeString(u.checkout_guest)}</strong></span>
            {isDeparted ? (
              <span style={{ color: '#059669', fontWeight: 800 }}>✓ צ'ק-אאוט בוצע</span>
            ) : (
              <span style={{ color: '#B45309', fontWeight: 800 }}>שעת עזיבה: {checkoutTime}</span>
            )}
          </div>
        )}

        {/* Status Change Feedback Toast */}
        {feedback && (
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#059669',
            background: '#ECFDF5',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '6px',
            padding: '0.3rem 0.5rem',
            textAlign: 'center'
          }}>
            {feedback}
          </div>
        )}

        {/* INTERACTIVE STATUS ACTIONS INSIDE THE CARD */}
        <div 
          style={{
            marginTop: '0.35rem',
            paddingTop: '0.5rem',
            borderTop: '1px dashed rgba(197, 160, 89, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem'
          }}
          onClick={(e) => e.stopPropagation()} // Don't collapse card when clicking buttons
        >
          {/* If guest still in house, give 1-click Check-out action! */}
          {isStillInHouse && (
            <button
              type="button"
              disabled={updatingUnitId === u.id}
              onClick={() => handleMarkDeparted(u.id)}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '0.45rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
              }}
            >
              <DoorOpen size={14} />
              <span>סמן שהאורח יצא (צ'ק-אאוט) ➔ העבר לראש הניקיון</span>
            </button>
          )}

          {/* Quick 1-Click Operational Status Switcher Pills */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: '0.3rem'
          }}>
            {/* READY */}
            <button
              type="button"
              disabled={updatingUnitId === u.id}
              onClick={() => handleUpdateUnitStatus(u.id, 'READY')}
              style={{
                padding: '0.35rem 0.2rem',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: isReady ? '1.5px solid #10B981' : '1px solid rgba(16, 185, 129, 0.25)',
                background: isReady ? '#10B981' : '#F0FDF4',
                color: isReady ? '#FFFFFF' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem'
              }}
              title="סמן כנקי ומוכן לקליטה"
            >
              <Check size={11} />
              <span>מוכן</span>
            </button>

            {/* IN_PROGRESS */}
            <button
              type="button"
              disabled={updatingUnitId === u.id}
              onClick={() => handleUpdateUnitStatus(u.id, 'IN_PROGRESS')}
              style={{
                padding: '0.35rem 0.2rem',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: isInProgress ? '1.5px solid #F59E0B' : '1px solid rgba(245, 158, 11, 0.25)',
                background: isInProgress ? '#F59E0B' : '#FFFBEB',
                color: isInProgress ? '#FFFFFF' : '#B45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem'
              }}
              title="סמן שבניקיון כרגע"
            >
              <Clock size={11} />
              <span>בניקיון</span>
            </button>

            {/* DIRTY */}
            <button
              type="button"
              disabled={updatingUnitId === u.id}
              onClick={() => handleUpdateUnitStatus(u.id, 'DIRTY')}
              style={{
                padding: '0.35rem 0.2rem',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: (!isReady && !isInProgress && !isMaint) ? '1.5px solid #D97706' : '1px solid rgba(217, 119, 6, 0.25)',
                background: (!isReady && !isInProgress && !isMaint) ? '#D97706' : '#FFFDF5',
                color: (!isReady && !isInProgress && !isMaint) ? '#FFFFFF' : '#B45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem'
              }}
              title="סמן כממתין לניקיון"
            >
              <RefreshCw size={11} />
              <span>לניקוי</span>
            </button>

            {/* MAINTENANCE_ALERT */}
            <button
              type="button"
              disabled={updatingUnitId === u.id}
              onClick={() => handleUpdateUnitStatus(u.id, 'MAINTENANCE_ALERT')}
              style={{
                padding: '0.35rem 0.2rem',
                borderRadius: '6px',
                fontSize: '0.68rem',
                fontWeight: 800,
                cursor: 'pointer',
                border: isMaint ? '1.5px solid #EF4444' : '1px solid rgba(239, 68, 68, 0.25)',
                background: isMaint ? '#EF4444' : '#FEF2F2',
                color: isMaint ? '#FFFFFF' : '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem'
              }}
              title="דווח על תקלת אחזקה"
            >
              <Wrench size={11} />
              <span>תקלה</span>
            </button>
          </div>
        </div>
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
      {data?.title && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          fontWeight: 900,
          color: '#8C6B28',
          paddingInline: '0.2rem'
        }}>
          <span>{safeString(data.title)}</span>
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
              🧹 אפשר לנקות עכשיו ({canCleanNowItems.length})
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
              ⏳ בשהייה · יוצאים היום ({stillInHouseItems.length})
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
                border: filter === 'ready' ? '1px solid #10B981' : '1px solid rgba(16, 185, 129, 0.25)',
                background: filter === 'ready' ? '#10B981' : '#FFFFFF',
                color: filter === 'ready' ? '#FFFFFF' : '#059669'
              }}
            >
              ✓ מוכנות ({readyItems.length})
            </button>
          )}
        </div>
      )}

      {/* Render Unit Cards */}
      {isGroupedView ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {/* Section 1: עכשיו כבר אפשר לנקות */}
          {canCleanNowItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{
                fontSize: '0.76rem',
                fontWeight: 900,
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                paddingInline: '0.2rem'
              }}>
                <Sparkles size={13} color="#059669" />
                <span>עכשיו כבר אפשר לנקות ({canCleanNowItems.length})</span>
                <span style={{ fontSize: '0.65rem', color: '#6EE7B7', fontWeight: 700 }}>
                  · אורחים שיצאו בראש התור!
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {canCleanNowItems.map(renderUnitCard)}
              </div>
            </div>
          )}

          {/* Section 2: עוד בשהייה · יוצאים היום */}
          {stillInHouseItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{
                fontSize: '0.76rem',
                fontWeight: 900,
                color: '#B45309',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                paddingInline: '0.2rem'
              }}>
                <Clock size={13} color="#B45309" />
                <span>עוד בשהייה · יוצאים היום ({stillInHouseItems.length})</span>
                <span style={{ fontSize: '0.65rem', color: '#FCD34D', fontWeight: 700 }}>
                  · ממתינים לפינוי
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {stillInHouseItems.map(renderUnitCard)}
              </div>
            </div>
          )}

          {/* Other units (already ready, etc.) */}
          {filteredItems.filter((i) => !canCleanNowItems.includes(i) && !stillInHouseItems.includes(i)).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{
                fontSize: '0.76rem',
                fontWeight: 900,
                color: '#8C6B28',
                paddingInline: '0.2rem'
              }}>
                שאר היחידות ({filteredItems.filter((i) => !canCleanNowItems.includes(i) && !stillInHouseItems.includes(i)).length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {filteredItems.filter((i) => !canCleanNowItems.includes(i) && !stillInHouseItems.includes(i)).map(renderUnitCard)}
              </div>
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
