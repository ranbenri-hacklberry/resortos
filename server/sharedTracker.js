import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const dataFile = path.join(dataDir, 'shared-tracker.json');

export function emptySharedTracker() {
  return {
    errands: [],
    shopping: [],
    extraPeople: [],
    updatedAt: 0
  };
}

export function readSharedTracker() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      errands: Array.isArray(parsed.errands) ? parsed.errands : [],
      shopping: Array.isArray(parsed.shopping) ? parsed.shopping : [],
      extraPeople: Array.isArray(parsed.extraPeople)
        ? parsed.extraPeople
        : (Array.isArray(parsed.people) ? parsed.people.filter((p) => p && !p.fromStaff) : []),
      updatedAt: Number(parsed.updatedAt) || 0
    };
  } catch {
    return emptySharedTracker();
  }
}

export function writeSharedTracker(payload = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const extraPeople = Array.isArray(payload.extraPeople)
    ? payload.extraPeople
    : (Array.isArray(payload.people) ? payload.people.filter((p) => p && !p.fromStaff) : []);
  const next = {
    errands: Array.isArray(payload.errands) ? payload.errands : [],
    shopping: Array.isArray(payload.shopping) ? payload.shopping : [],
    extraPeople,
    updatedAt: Date.now()
  };
  fs.writeFileSync(dataFile, JSON.stringify(next, null, 2));
  return next;
}
