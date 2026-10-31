import React, { useState } from 'react';
import { 
  Sparkles, CheckCircle2, AlertTriangle, Clock, RefreshCw, 
  Home, UserCheck, ShieldAlert 
} from 'lucide-react';

export function UnitStatusCards({ data }) {
  const [filter, setFilter] = useState('all');

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
  const readyItems = items.filter((i) => i.status === 'READY');
  const inProgressItems = items.filter((i) => i.status === 'IN_PROGRESS');
  const dirtyItems = items.filter((i) => i.status === 'DIRTY' || (!i.status && i.status !== 'READY'));
  const maintenanceItems = items.filter((i) => i.status === 'MAINTENANCE_ALERT' || i.status === 'MAINTENANCE');

  const filteredItems = filter === 'ready' 
    ? readyItems 
    : filter === 'in_progress' 
    ? inProgressItems 
    : filter === 'dirty' 
    ? dirtyItems 
    : filter === 'maintenance' 
    ? maintenanceItems 
    : items;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
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
          fontSize: '0.75rem',
          fontWeight: 800,
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        overflowX: 'auto',
        paddingBottom: '0.2rem'
      }}>
        <button
          type="button"
          onClick={() => setFilter('all')}
          style={{
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.7rem',
            fontWeight: 700,
            cursor: 'pointer',
            border: filter === 'all' ? '1px solid #C5A059' : '1px solid rgba(197, 160, 89, 0.25)',
            background: filter === 'all' ? '#C5A059' : '#FFFFFF',
            color: filter === 'all' ? '#FFFFFF' : '#736055'
          }}
        >
          הכל ({items.length})
        </button>

        {dirtyItems.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter('dirty')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: filter === 'dirty' ? '1px solid #D97706' : '1px solid rgba(217, 119, 6, 0.25)',
              background: filter === 'dirty' ? '#FFFBEB' : '#FFFFFF',
              color: '#D97706'
            }}
          >
            🧹 ממתינות ({dirtyItems.length})
          </button>
        )}

        {inProgressItems.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter('in_progress')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: filter === 'in_progress' ? '1px solid #F59E0B' : '1px solid rgba(245, 158, 11, 0.25)',
              background: filter === 'in_progress' ? '#FEF3C7' : '#FFFFFF',
              color: '#B45309'
            }}
          >
            ⏳ בניקיון ({inProgressItems.length})
          </button>
        )}

        {readyItems.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter('ready')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: filter === 'ready' ? '1px solid #10B981' : '1px solid rgba(16, 185, 129, 0.25)',
              background: filter === 'ready' ? '#ECFDF5' : '#FFFFFF',
              color: '#059669'
            }}
          >
            ✨ מוכנות ({readyItems.length})
          </button>
        )}

        {maintenanceItems.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter('maintenance')}
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: filter === 'maintenance' ? '1px solid #EF4444' : '1px solid rgba(239, 68, 68, 0.25)',
              background: filter === 'maintenance' ? '#FEF2F2' : '#FFFFFF',
              color: '#DC2626'
            }}
          >
            ⚠️ תקלות ({maintenanceItems.length})
          </button>
        )}
      </div>

      {/* Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {filteredItems.map((u) => {
          const isReady = u.status === 'READY';
          const isInProgress = u.status === 'IN_PROGRESS';
          const isMaint = u.status === 'MAINTENANCE_ALERT' || u.status === 'MAINTENANCE';

          const badgeBg = isReady ? '#ECFDF5' : isInProgress ? '#FEF3C7' : isMaint ? '#FEF2F2' : '#FFFBEB';
          const badgeColor = isReady ? '#059669' : isInProgress ? '#B45309' : isMaint ? '#DC2626' : '#D97706';
          const badgeText = isReady ? 'מוכן לקליטה' : isInProgress ? 'בניקיון כרגע' : isMaint ? 'תקלה / טיפול' : 'ממתין לניקיון';

          return (
            <div
              key={u.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(197, 160, 89, 0.25)',
                borderRadius: '10px',
                padding: '0.65rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(38, 19, 15, 0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  background: isReady ? '#ECFDF5' : '#FAF8F3',
                  border: isReady ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(197, 160, 89, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isReady ? '#059669' : '#8C6B28'
                }}>
                  <Home size={14} />
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#26130F' }}>
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

              <div style={{
                background: badgeBg,
                color: badgeColor,
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '0.22rem 0.55rem',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                {isReady && <CheckCircle2 size={12} />}
                {isInProgress && <Clock size={12} />}
                {isMaint && <ShieldAlert size={12} />}
                {!isReady && !isInProgress && !isMaint && <RefreshCw size={12} />}
                <span>{badgeText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
