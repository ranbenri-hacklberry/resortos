import { describe, expect, it } from 'vitest';
import type { RoomEntry } from '../config.js';
import { proposeStatusChange, textHasStatusWord } from './statusConfirm.js';

const rooms = [
  { id: 'k674', name: 'בתי נורית 3', aliases: ['נורית 3', 'בתי נורית 3'] },
  { id: 'k693', name: 'בקתות מאיה 1', aliases: ['מאיה 1'] },
] as RoomEntry[];

describe('status confirmation', () => {
  it('reads a written ready command without treating a bare room name as a status', () => {
    expect(proposeStatusChange('נורית 3 מוכן', rooms)).toEqual({ roomId: 'k674', change: 'ready' });
    expect(proposeStatusChange('נורית 3', rooms)).toBeNull();
    expect(textHasStatusWord('נורית 3')).toBe(false);
  });

  it('uses the room already on screen when the next line only says it is occupied', () => {
    expect(proposeStatusChange('החדר תפוס', rooms, 'k693')).toEqual({ roomId: 'k693', change: 'occupied' });
  });
});
