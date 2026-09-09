export function canOpenDesk(role) {
  return role === 'RECEPTION' || role === 'MANAGER';
}

export function publicDeskStaff(row, passHash) {
  return {
    id: row.id,
    username: String(row.username || '').trim().toLowerCase(),
    display_name: row.name || row.display_name || row.username || 'פקידות',
    role: row.role,
    pass: passHash
  };
}

export function deskLoginNames(row) {
  return [...new Set(
    [row?.username, row?.display_name, row?.name]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}
