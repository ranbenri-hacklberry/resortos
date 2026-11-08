import type { RoomEntry } from './config.js';

export function formatRoomDisplay(roomId: string, rooms: RoomEntry[] = []): string {
  const r = (rooms || []).find((x) => x.id === roomId);
  if (!r) {
    if (roomId === 'pilot-office') return 'משרד';
    return roomId.startsWith('k') ? `יחידה ${roomId.slice(1)}` : roomId;
  }
  // Musical Courtyard rule: 1, 2, 3 instead of instrument names
  if (r.id === 'k690' || r.name?.includes('מוסיקלית') || r.name?.includes('מוזיקלית')) {
    if (r.id === 'k690' || r.letterCode === 'D1' || r.name?.includes('1')) return 'חצר מוזיקלית 1';
    if (r.id === 'k691' || r.letterCode === 'D2' || r.name?.includes('2')) return 'חצר מוזיקלית 2';
    if (r.id === 'k692' || r.letterCode === 'D3' || r.name?.includes('3')) return 'חצר מוזיקלית 3';
    return 'חצר מוזיקלית';
  }
  if (r.name) {
    let clean = r.name
      .replace(/\s*·\s*בקתה\s*/g, ' ')
      .replace(/\s*·\s*/g, ' ')
      .trim();
    clean = clean.replace(/מוסיקלית/g, 'מוזיקלית');
    return clean;
  }
  return r.letterCode || (roomId.startsWith('k') ? `יחידה ${roomId.slice(1)}` : roomId);
}
