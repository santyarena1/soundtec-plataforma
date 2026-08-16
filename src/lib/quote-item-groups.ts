export type QuoteGroupRecord = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type QuoteZoned<T> = {
  id: string | null;
  title: string;
  body: string;
  items: T[];
};

export function buildQuoteZones<T extends { groupId?: string | null }>(
  items: T[],
  groups: QuoteGroupRecord[]
): QuoteZoned<T>[] {
  const sorted = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted.length === 0) {
    return [{ id: null, title: "Planilla de equipamiento y servicios", body: "", items }];
  }
  const zones: QuoteZoned<T>[] = [];
  const ungrouped = items.filter((item) => !item.groupId);
  if (ungrouped.length > 0) {
    zones.push({ id: null, title: "Equipamiento general", body: "", items: ungrouped });
  }
  for (const group of sorted) {
    zones.push({
      id: group.id,
      title: group.title,
      body: group.body,
      items: items.filter((item) => item.groupId === group.id),
    });
  }
  return zones;
}

export function quoteHasMultipleTables(groups: QuoteGroupRecord[]) {
  return groups.length > 0;
}
