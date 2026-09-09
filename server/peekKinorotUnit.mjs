#!/usr/bin/env node
import { scrapeKinorotBoards, todayIso } from './syncKinorotCalendar.js';

const today = todayIso();
const { rows } = await scrapeKinorotBoards();
const hits = rows.filter((row) => String(row.place) === '680' || row.unitId === 'k680');
console.log(JSON.stringify({ today, count: hits.length, hits }, null, 2));
