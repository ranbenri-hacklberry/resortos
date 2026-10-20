import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizePriorityDocs } from '../src/lib/priorityDocs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function priorityDocsFilePath() {
  return process.env.HOTELOS_DOCS_PATH
    || path.resolve(__dirname, '..', 'data', 'priority-docs.json');
}

export function readPriorityDocs() {
  const file = priorityDocsFilePath();
  if (!fs.existsSync(file)) return normalizePriorityDocs({});
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return normalizePriorityDocs(data);
}

export function writePriorityDocs(raw) {
  const docs = normalizePriorityDocs({ docs: raw });
  const file = priorityDocsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify({ docs }, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
  return docs;
}
