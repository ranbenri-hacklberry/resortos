import React, { useMemo, useState, useEffect } from 'react';
import { Printer, Search, X, Calendar, User, Phone, Home, FileText, CheckCircle2 } from 'lucide-react';
import { printGuestFile } from '../../lib/guestFile';
import { isUnavailableHoldBooking } from '../../lib/unavailableHold';

function displayPhone(phone) {
  if (!phone) return '—';
  const digits = String(phone).replace(/\D+/g, '');
  if (digits.length === 10 && digits.startsWith('05')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function ymd(dateVal) {
  return String(dateVal || '').slice(0, 10);
}

function displayDateHeb(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-');
  if (!y || !m || !d) return dateStr;
  return `${Number(d)}/${Number(m)}`;
}

export default function GuestPrintModal({
  isOpen = true,
  onClose,
  bookings = [],
  units = [],
  today = ''
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('today_in'); // 'today_in' | 'in_house' | 'today_out' | 'all'

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose?.();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const unitMap = useMemo(() => {
    const map = new Map();
    units.forEach((u) => {
      map.set(u.id, u);
    });
    return map;
  }, [units]);

  // Valid, non-canceled bookings
  const validBookings = useMemo(() => {
    return (bookings || []).filter((b) => {
      if (!b || isUnavailableHoldBooking(b) || b.booking_status === 'CANCELED' || b.booking_status === 'DELETED') {
        return false;
      }
      return Boolean(b.guest_name || b.guest_phone);
    });
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();

    return validBookings.filter((b) => {
      const cin = ymd(b.check_in_date);
      const cout = ymd(b.check_out_date);
      const unit = unitMap.get(b.unit_id);
      const unitName = (unit?.name || b.unit_id || '').toLowerCase();
      const guestName = (b.guest_name || '').toLowerCase();
      const phone = (b.guest_phone || '').replace(/\D+/g, '');

      // Tab filter
      if (tab === 'today_in' && cin !== today) return false;
      if (tab === 'today_out' && cout !== today) return false;
      if (tab === 'in_house' && (cin >= today || cout <= today)) return false;

      // Text query
      if (q) {
        const matchName = guestName.includes(q);
        const matchUnit = unitName.includes(q);
        const matchPhone = phone.includes(q.replace(/\D+/g, ''));
        const matchId = String(b.id || '').toLowerCase().includes(q);
        if (!matchName && !matchUnit && !matchPhone && !matchId) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const cinA = ymd(a.check_in_date);
      const cinB = ymd(b.check_in_date);
      if (cinA !== cinB) return cinA.localeCompare(cinB);
      const uA = unitMap.get(a.unit_id)?.name || '';
      const uB = unitMap.get(b.unit_id)?.name || '';
      return uA.localeCompare(uB, 'he');
    });
  }, [validBookings, tab, search, today, unitMap]);

  // Counts for tabs
  const counts = useMemo(() => {
    let todayIn = 0;
    let todayOut = 0;
    let inHouse = 0;
    for (const b of validBookings) {
      const cin = ymd(b.check_in_date);
      const cout = ymd(b.check_out_date);
      if (cin === today) todayIn++;
      if (cout === today) todayOut++;
      if (cin < today && cout > today) inHouse++;
    }
    return { todayIn, todayOut, inHouse, all: validBookings.length };
  }, [validBookings, today]);

  if (!isOpen) return null;

  return (
    <div className="guest-print-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="guest-print-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guest-print-modal-header">
          <div className="guest-print-modal-title">
            <Printer size={18} className="guest-print-icon" />
            <div>
              <h3>הדפסת דף אורח ודף חדר A4</h3>
              <p>בחרו אורח להדפסה ישירה של תיק אורח מלא (כולל תשלום, משימות ופרטי החדר) או דף חדר מעוצב</p>
            </div>
          </div>
          <button type="button" className="guest-print-close-btn" onClick={onClose} title="סגור (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="guest-print-modal-toolbar">
          <div className="guest-print-search-wrap">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="חיפוש לפי שם אורח, טלפון או יחידה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search ? (
              <button type="button" className="clear-search-btn" onClick={() => setSearch('')}>
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="guest-print-tabs" role="tablist">
            <button
              type="button"
              className={`gp-tab${tab === 'today_in' ? ' is-active' : ''}`}
              onClick={() => setTab('today_in')}
            >
              נכנסים היום ({counts.todayIn})
            </button>
            <button
              type="button"
              className={`gp-tab${tab === 'in_house' ? ' is-active' : ''}`}
              onClick={() => setTab('in_house')}
            >
              נוכחים בשהייה ({counts.inHouse})
            </button>
            <button
              type="button"
              className={`gp-tab${tab === 'today_out' ? ' is-active' : ''}`}
              onClick={() => setTab('today_out')}
            >
              יוצאים היום ({counts.todayOut})
            </button>
            <button
              type="button"
              className={`gp-tab${tab === 'all' ? ' is-active' : ''}`}
              onClick={() => setTab('all')}
            >
              כל ההזמנות ({counts.all})
            </button>
          </div>
        </div>

        <div className="guest-print-modal-body">
          {filteredBookings.length === 0 ? (
            <div className="guest-print-empty">
              <span>לא נמצאו הזמנות מתאימות לחיפוש או לסינון הנוכחי.</span>
            </div>
          ) : (
            <div className="guest-print-list">
              {filteredBookings.map((booking) => {
                const unit = unitMap.get(booking.unit_id);
                const cin = ymd(booking.check_in_date);
                const cout = ymd(booking.check_out_date);
                const isArriving = cin === today;
                const isDeparting = cout === today;
                const isInStay = cin < today && cout > today;

                const payStatus = booking.payment_status;
                const payMethod = booking.payment_mode;
                const totalAgorot = Number(booking.total_price_agorot) || 0;
                const totalIls = totalAgorot ? Math.round(totalAgorot / 100) : 0;

                return (
                  <div key={booking.id} className="guest-print-card">
                    <div className="gp-card-info">
                      <div className="gp-card-header">
                        <span className="gp-guest-name">{booking.guest_name || 'אורח ללא שם'}</span>
                        <span className="gp-unit-badge">
                          <Home size={12} /> {unit?.name || booking.unit_id || 'יחידה לא משויכת'}
                        </span>
                        {isArriving ? (
                          <span className="gp-status-tag is-arriving">הגעה היום</span>
                        ) : isDeparting ? (
                          <span className="gp-status-tag is-departing">עזיבה היום</span>
                        ) : isInStay ? (
                          <span className="gp-status-tag is-stay">בשהייה</span>
                        ) : null}
                      </div>

                      <div className="gp-card-details">
                        <span className="gp-detail-item" title="תאריכי שהייה">
                          <Calendar size={13} /> {displayDateHeb(cin)} - {displayDateHeb(cout)}
                        </span>
                        <span className="gp-detail-item" dir="ltr" title="טלפון">
                          <Phone size={13} /> {displayPhone(booking.guest_phone)}
                        </span>
                        {totalIls > 0 ? (
                          <span className="gp-detail-item gp-pay-item">
                            ₪{totalIls.toLocaleString()}
                            {payStatus === 'PAID' ? ' (שולם)' : payStatus === 'DEPOSIT_PAID' ? ' (מקדמה)' : ' (טרם שולם)'}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="gp-card-actions">
                      <button
                        type="button"
                        className="gp-action-btn is-primary"
                        title="הדפסת דף אורח A4 (תיק אורח מלא הכולל פרטי הזמנה, תשלום, משימות ונוהל צ׳ק-אין)"
                        onClick={() => printGuestFile(booking, { units, bookings })}
                      >
                        <Printer size={14} />
                        <span>דף אורח A4</span>
                      </button>
                      <button
                        type="button"
                        className="gp-action-btn is-secondary"
                        title="פתיחת דף חדר A4 להדפסה (קודי שער, כספת, WiFi ונהלים)"
                        onClick={() => {
                          const unitId = booking.unit_id || '';
                          const unitParam = unitId ? `?unit=${encodeURIComponent(unitId)}` : '';
                          window.open(`/room-sheet-a4.html${unitParam}`, '_blank', 'noopener');
                        }}
                      >
                        <FileText size={13} />
                        <span>דף חדר A4</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="guest-print-modal-footer">
          <span className="gp-hint">
            💡 טיפ: הדפסת דף אורח A4 פותחת טופס קליטה רשמי לעמדת הקבלה. דף חדר A4 מיועד להנחה בבקתה עבור האורח.
          </span>
          <button type="button" className="gp-footer-close-btn" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
