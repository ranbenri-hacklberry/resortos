import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { normalizeIntent, resolveLetterCode, resolveRoomByAlias } from './client.js';
import { inboundSystemPrompt } from './prompts.js';
import { UNIT_TO_PROPERTY } from '../guest/guestKnowledge.js';

const rooms = JSON.parse(fs.readFileSync(new URL('../../data/rooms.json', import.meta.url), 'utf8'));
const G = { G1: 'k671', G2: 'k673', G3: 'k674', G4: 'k675', G5: 'k676', G6: 'k677', G7: 'k678', G8: 'k679' };
const E = { E1: 'k808', E2: 'k809', E3: 'k810', E4: 'k811' };

describe('G/E letter codes map to their own cabin (Ran 2026-10-22)', () => {
  it('mapping matches the real unit table (rooms.json letterCode + UNIT_TO_PROPERTY)', () => {
    for (const [code, id] of Object.entries({ ...G, ...E })) {
      const r = rooms.find((x: any) => x.id === id);
      expect(r?.letterCode).toBe(code);
      expect(UNIT_TO_PROPERTY[id]).toBe(code[0] === 'G' ? 'nurit' : 'taj');
      expect(resolveLetterCode(code)).toBe(id);
      expect(resolveRoomByAlias(code, rooms)).toBe(id);
    }
  });
  it('Thai phonetic codes', () => {
    expect(resolveLetterCode('ห้อง จี 3')).toBe('k674');
    expect(resolveLetterCode('จี7')).toBe('k678');
    expect(resolveLetterCode('อี4')).toBe('k811');
    expect(resolveLetterCode('เอฟ3')).toBe('k695');
  });
  it('letter code in room_raw overrides a shifted LLM room_id', () => {
    const cases: [string, string, string][] = [['G7', 'k675', 'k678'], ['G5', 'k675', 'k676'], ['ห้อง จี 3', 'k675', 'k674'], ['อี4', 'k808', 'k811'], ['E4', 'k809', 'k811']];
    for (const [raw, llm, want] of cases) {
      const i = normalizeIntent({ action: 'ROOM_READY', room_raw: raw, room_id: llm, issue_description_hebrew: null, acknowledgement_reply_cleaner_language: '' }, rooms);
      expect(i.room_id).toBe(want);
    }
  });
  it('no letter code: LLM room_id kept; bare numbers and names stay untouched', () => {
    expect(normalizeIntent({ action: 'ROOM_READY', room_raw: 'נורית 3', room_id: 'k674' }, rooms).room_id).toBe('k674');
    expect(resolveLetterCode('בקתה 1')).toBeNull();
    expect(resolveLetterCode('suite 1')).toBeNull();
    expect(resolveLetterCode('casa 2')).toBeNull();
    expect(resolveLetterCode('Hill 1')).toBeNull();
  });
  it('prompt lists explicit G/E pairs', () => {
    const p = inboundSystemPrompt('th', rooms);
    for (const [code, id] of Object.entries({ ...G, ...E })) expect(p).toContain(`${code}=${id}`);
  });
});
