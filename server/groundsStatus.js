import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeGrounds, withGroundStatus } from '../src/lib/priorityGrounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function groundsFilePath() {
  return process.env.HOTELOS_GROUNDS_PATH
    || path.resolve(__dirname, '..', 'data', 'grounds-status.json');
}

export function readGrounds() {
  const file = groundsFilePath();
  if (!fs.existsSync(file)) return normalizeGrounds({});
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return normalizeGrounds(data);
}

function writeGrounds(assets) {
  const file = groundsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify({ assets }, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  return assets;
}

export function setGroundStatus({ id, status, by, note, at = new Date().toISOString() }) {
  return writeGrounds(withGroundStatus(readGrounds(), { id, status, by, note, at }));
}
