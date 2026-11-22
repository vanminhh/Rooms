import type { NotificationKind, Prisma } from '@prisma/client';
import { viewingBossId } from '../viewings/viewing-reservations.js';

export interface NotifyInput { kind: NotificationKind; title: string; body?: string; link?: string }

// SCOPE-04: the building's manager while that account is active, otherwise Boss. Same rule as "Việc hôm nay".
export async function responsibleStaffIds(tx: Prisma.TransactionClient, buildingIds: number[]): Promise<Map<number, number>> {
  const buildings = await tx.building.findMany({ where: { id: { in: [...new Set(buildingIds)] } },
    select: { id: true, managerId: true, manager: { select: { isActive: true } } } });
  const bossId = buildings.some(b => !b.managerId || !b.manager?.isActive) ? await viewingBossId(tx) : 0;
  return new Map(buildings.map(b => [b.id, b.managerId && b.manager?.isActive ? b.managerId : bossId]));
}

// NOTI-11: one in-app row for whoever is responsible for the building (also used by P4-4/P4-5 for PAYMENT_RECEIVED).
// Mail is the caller's job, after commit (NOTI-07); the two channels never touch.
export async function notifyBuildingStaff(tx: Prisma.TransactionClient, buildingId: number, input: NotifyInput): Promise<number> {
  const userId = (await responsibleStaffIds(tx, [buildingId])).get(buildingId);
  if (userId === undefined) throw new Error(`Building ${buildingId} not found`);
  await tx.notification.create({ data: { ...input, userId } });
  return userId;
}
