import type { ViewingStatus } from './viewings.types.js';

export interface ViewingHold {
  id: number;
  buildingId: number;
  district: string;
  responsibleId: number;
  guestPhone: string;
  visitAt: Date | null;
  status: ViewingStatus;
}

export interface ViewingCandidate {
  buildingId: number;
  responsibleId: number;
  guestPhone?: string;
  visitAt: Date;
  excludeId?: number;
}

export function canBookViewing(holds: ViewingHold[], candidate: ViewingCandidate): boolean {
  const guests = new Set<string>();
  for (const row of holds) {
    if (row.id === candidate.excludeId || (row.status !== 'NEW' && row.status !== 'CONFIRMED') ||
        row.visitAt?.getTime() !== candidate.visitAt.getTime()) continue;
    if (row.buildingId !== candidate.buildingId) {
      if (row.responsibleId === candidate.responsibleId) return false;
    } else guests.add(row.guestPhone);
  }
  if (candidate.guestPhone === undefined) return guests.size < 3;
  guests.add(candidate.guestPhone);
  return guests.size <= 3;
}

// VIEW-22: inspect the complete open set before applying staff scope or page limits.
export function viewingOverlapIds(holds: ViewingHold[]): Set<number> {
  const open = holds.filter(row => row.visitAt && (row.status === 'NEW' || row.status === 'CONFIRMED'));
  const phonesByBuilding = new Map<string, Set<string>>();
  const buildingsByPerson = new Map<string, Set<number>>();
  const key = (row: ViewingHold, value: number | string) => `${row.visitAt!.getTime()}:${value}`;
  function add<T>(map: Map<string, Set<T>>, group: string, value: T) {
    if (!map.has(group)) map.set(group, new Set());
    map.get(group)!.add(value);
  }
  for (const row of open) {
    add(phonesByBuilding, key(row, row.buildingId), row.guestPhone);
    add(buildingsByPerson, key(row, row.responsibleId), row.buildingId);
  }
  return new Set(open.filter(row => phonesByBuilding.get(key(row, row.buildingId))!.size > 3 ||
    buildingsByPerson.get(key(row, row.responsibleId))!.size > 1).map(row => row.id));
}
