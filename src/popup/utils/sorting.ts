// Sorting and ordering utilities

export function applyPinnedOrder<T extends { code: string; pinned?: boolean }>(items: T[], code: string): T[] {
  const target = items.find((item) => item.code === code);
  if (!target) return items;

  if (target.pinned) {
    return items.map((item) => (item.code === code ? { ...item, pinned: false } : { ...item, pinned: false }));
  }

  const currentPinned = items.find((item) => item.pinned && item.code !== code);
  const remaining = items
    .filter((item) => item.code !== code && item.code !== currentPinned?.code)
    .map((item) => ({ ...item, pinned: false }));

  const next: T[] = [{ ...target, pinned: true }];
  if (currentPinned) {
    next.push({ ...currentPinned, pinned: false });
  }
  return [...next, ...remaining];
}

export function insertAfterPinned<T extends { pinned?: boolean }>(items: T[], nextItem: T): T[] {
  const pinnedIndex = items.findIndex((item) => item.pinned);
  if (pinnedIndex === -1) {
    return [nextItem, ...items];
  }
  return [
    ...items.slice(0, pinnedIndex + 1),
    nextItem,
    ...items.slice(pinnedIndex + 1),
  ];
}

export function reorderCodes(codes: string[], draggedCode: string, targetCode: string, lockedCode?: string): string[] {
  if (draggedCode === targetCode) return codes;

  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  const targetIndex = movable.indexOf(targetCode);
  if (fromIndex < 0 || targetIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.splice(targetIndex, 0, dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

export function moveCodeAfterPinned(codes: string[], draggedCode: string, lockedCode?: string): string[] {
  const movable = lockedCode ? codes.filter((code) => code !== lockedCode) : [...codes];
  const fromIndex = movable.indexOf(draggedCode);
  if (fromIndex < 0) return codes;

  const next = [...movable];
  const [dragged] = next.splice(fromIndex, 1);
  next.unshift(dragged);

  return lockedCode ? [lockedCode, ...next] : next;
}

export function sortRowsByCodes<T extends { code: string }>(rows: T[], codes: string[]): T[] {
  const rowMap = new Map(rows.map((row) => [row.code, row]));
  const ordered = codes
    .map((code) => rowMap.get(code))
    .filter((row): row is T => row !== undefined);
  const used = new Set(ordered.map((row) => row.code));
  const rest = rows.filter((row) => !used.has(row.code));
  return [...ordered, ...rest];
}
