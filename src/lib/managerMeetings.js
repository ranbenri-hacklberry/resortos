import meetingsFile from '../../data/manager-meetings.json';

const WEEKDAYS = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];

function clean(value) {
  return String(value || '').trim();
}

function people(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,،]/);
  return [...new Set(list.map(clean).filter(Boolean))];
}

function slotKey(slot) {
  return `${slot?.date || ''} ${slot?.time || ''}`;
}

export function managerMeetings(source = meetingsFile) {
  const rows = Array.isArray(source) ? source : source?.meetings;
  return Array.isArray(rows) ? rows : [];
}

export const MEETING_HOURS = Array.from({ length: 13 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);

export function meetingsOnHour(meetings, date, hour) {
  const stamp = String(hour || '').slice(0, 2);
  return managerMeetings(meetings).filter((meeting) => (
    meeting?.status === 'confirmed'
    && meeting.date === date
    && String(meeting.time || '').slice(0, 2) === stamp
  ));
}

export function upcomingManagerMeetings(today, source = meetingsFile) {
  const from = String(today || '');
  return managerMeetings(source)
    .filter((meeting) => meeting?.status === 'confirmed' && String(meeting.date || '') >= from)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export function formatManagerMeeting(meeting) {
  const [year, month, day] = String(meeting.date || '').split('-').map(Number);
  const weekday = Number.isFinite(year) ? WEEKDAYS[new Date(year, month - 1, day).getDay()] : '';
  const date = day && month ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}` : meeting.date;
  const names = Array.isArray(meeting.participants) ? meeting.participants.join(', ') : '';
  return [
    weekday,
    date,
    meeting.time,
    meeting.title,
    meeting.place,
    meeting.organizer ? `מארגן ${meeting.organizer}` : '',
    names
  ].filter(Boolean).join(' · ');
}

export function meetingId(input, now = new Date()) {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const title = clean(input.title).replace(/\s+/g, '-').slice(0, 24);
  return `${input.date || 'open'}-${input.time || 'tbd'}-${title || 'meeting'}-${stamp}`;
}

export function createConfirmedMeeting(meetings, input, now = new Date()) {
  const title = clean(input.title);
  const date = clean(input.date);
  const time = clean(input.time);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    const err = new Error('MEETING_FIELDS');
    err.status = 400;
    throw err;
  }
  const participants = people(input.participants);
  const meeting = {
    id: clean(input.id) || meetingId({ title, date, time }, now),
    title,
    date,
    time,
    place: clean(input.place),
    organizer: clean(input.organizer),
    participants,
    required: people(input.required).length ? people(input.required) : participants,
    note: clean(input.note),
    status: 'confirmed',
    slots: [],
    createdAt: now.toISOString()
  };
  return [...managerMeetings(meetings), meeting];
}

export function proposeMeeting(meetings, input, now = new Date()) {
  const title = clean(input.title);
  const slots = (Array.isArray(input.slots) ? input.slots : [])
    .map((slot) => ({ date: clean(slot.date), time: clean(slot.time), votes: {} }))
    .filter((slot) => /^\d{4}-\d{2}-\d{2}$/.test(slot.date) && /^\d{2}:\d{2}$/.test(slot.time));
  const unique = [];
  for (const slot of slots) {
    if (!unique.some((row) => slotKey(row) === slotKey(slot))) unique.push(slot);
  }
  if (!title || !unique.length) {
    const err = new Error('MEETING_SLOTS');
    err.status = 400;
    throw err;
  }
  const participants = people(input.participants);
  const meeting = {
    id: meetingId({ title, date: unique[0].date, time: unique[0].time }, now),
    title,
    date: '',
    time: '',
    place: clean(input.place),
    organizer: clean(input.organizer),
    participants,
    required: people(input.required).length ? people(input.required) : participants,
    note: clean(input.note),
    status: 'proposed',
    slots: unique,
    createdAt: now.toISOString()
  };
  return [...managerMeetings(meetings), meeting];
}

export function voteOnSlot(meetings, { id, person, date, time, vote }) {
  const name = clean(person);
  const choice = vote === 'yes' ? 'yes' : 'no';
  if (!name) {
    const err = new Error('MEETING_VOTE');
    err.status = 400;
    throw err;
  }
  return managerMeetings(meetings).map((meeting) => {
    if (meeting.id !== id || meeting.status === 'cancelled') return meeting;
    const slots = (meeting.slots || []).map((slot) => (
      slot.date === date && slot.time === time
        ? { ...slot, votes: { ...(slot.votes || {}), [name]: choice } }
        : slot
    ));
    return confirmReady({ ...meeting, slots });
  });
}

function confirmReady(meeting) {
  if (meeting.status === 'cancelled' || meeting.status === 'done') return meeting;
  const required = people(meeting.required);
  if (!required.length) return meeting;
  const ready = (meeting.slots || [])
    .filter((slot) => required.every((name) => slot.votes?.[name] === 'yes'))
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  if (!ready.length) return meeting;
  const slot = ready[0];
  return { ...meeting, status: 'confirmed', date: slot.date, time: slot.time };
}

export function setMeetingStatus(meetings, id, status) {
  if (!['confirmed', 'proposed', 'done', 'cancelled'].includes(status)) {
    const err = new Error('MEETING_STATUS');
    err.status = 400;
    throw err;
  }
  return managerMeetings(meetings).map((meeting) => (
    meeting.id === id ? { ...meeting, status } : meeting
  ));
}
