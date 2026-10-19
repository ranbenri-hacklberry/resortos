import React, { useEffect, useState } from 'react';
import { getStoredToken } from '../../lib/staffAuth';
import {
  MEETING_HOURS,
  formatManagerMeeting,
  managerMeetings,
  meetingsOnHour
} from '../../lib/managerMeetings';

function horizonLabel(ymd, today) {
  const HEB_DAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const date = new Date(`${ymd}T12:00:00`);
  const mark = `${HEB_DAY[date.getDay()]}׳ ${date.getDate()}.${date.getMonth() + 1}`;
  return ymd === today ? `היום - ${mark}` : mark;
}

export default function PriorityCalendar({ horizon, today, onSelect }) {
  const [meetings, setMeetings] = useState(() => managerMeetings());

  useEffect(() => {
    let cancelled = false;
    const headers = { Accept: 'application/json' };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch('/api/priority/meetings', { headers })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((body) => {
        if (!cancelled && Array.isArray(body?.meetings)) setMeetings(body.meetings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid-wrap">
      <table className="erp-table week-table">
        <thead>
          <tr className="label-row">
            <th className="unit-cell">שעה</th>
            {horizon.map((day) => (
              <th key={day} className={day === today ? 'is-today' : ''}>{horizonLabel(day, today)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEETING_HOURS.map((hour) => (
            <tr key={hour}>
              <td className="unit-cell">
                <span className="unit-name">{hour}</span>
              </td>
              {horizon.map((day) => {
                const rows = meetingsOnHour(meetings, day, hour);
                return (
                  <td key={day} className={`week-cell${day === today ? ' is-today' : ''}`}>
                    {rows.length ? rows.map((meeting) => (
                      <button
                        key={meeting.id}
                        type="button"
                        className="stay-pill is-meet"
                        title={formatManagerMeeting(meeting)}
                        onClick={() => onSelect?.(meeting)}
                      >
                        <b>{meeting.title}</b>
                      </button>
                    )) : <span className="week-empty"> </span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
