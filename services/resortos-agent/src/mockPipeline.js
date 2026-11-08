export function formatRoomDisplay(roomId, rooms = []) {
  const r = (rooms || []).find((x) => x.id === roomId);
  if (!r) {
    if (roomId === 'pilot-office') return 'משרד';
    return roomId?.startsWith?.('k') ? `יחידה ${roomId.slice(1)}` : (roomId || '');
  }
  if (r.id === 'k690' || r.name?.includes('מוסיקלית') || r.name?.includes('מוזיקלית')) {
    if (r.id === 'k690' || r.letterCode === 'D1' || r.name?.includes('1')) return 'חצר מוזיקלית 1';
    if (r.id === 'k691' || r.letterCode === 'D2' || r.name?.includes('2')) return 'חצר מוזיקלית 2';
    if (r.id === 'k692' || r.letterCode === 'D3' || r.name?.includes('3')) return 'חצר מוזיקלית 3';
    return 'חצר מוזיקלית';
  }
  return r.name || roomId;
}

export function matchesCleaner() { return false; }
export function lidSenderPn() { return null; }
export function resolveStaffPhone(raw) { return String(raw || ''); }
export function normalizePhoneTail(raw) { return String(raw || ''); }
