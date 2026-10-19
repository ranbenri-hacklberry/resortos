import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createConfirmedMeeting,
  managerMeetings,
  proposeMeeting,
  setMeetingStatus,
  voteOnSlot
} from '../src/lib/managerMeetings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function meetingsFilePath() {
  return process.env.HOTELOS_MEETINGS_PATH
    || path.resolve(__dirname, '..', 'data', 'manager-meetings.json');
}

export function readManagerMeetings() {
  const file = meetingsFilePath();
  if (!fs.existsSync(file)) return [];
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return managerMeetings(data);
}

export function writeManagerMeetings(meetings) {
  const file = meetingsFilePath();
  const body = `${JSON.stringify({ meetings }, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  return meetings;
}

export function getManagerCalendar() {
  return { meetings: readManagerMeetings() };
}

export function addConfirmedMeeting(input) {
  return writeManagerMeetings(createConfirmedMeeting(readManagerMeetings(), input));
}

export function addProposedMeeting(input) {
  return writeManagerMeetings(proposeMeeting(readManagerMeetings(), input));
}

export function castMeetingVote(input) {
  return writeManagerMeetings(voteOnSlot(readManagerMeetings(), input));
}

export function updateMeetingStatus(id, status) {
  return writeManagerMeetings(setMeetingStatus(readManagerMeetings(), id, status));
}
