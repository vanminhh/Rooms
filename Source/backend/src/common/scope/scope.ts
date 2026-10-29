import { NotFoundException } from '@nestjs/common';
import type { PrismaClient, Role } from '@prisma/client';
import type { AuthUser } from '../guards/auth.decorators.js';

// SCOPE-02: null = BOSS (no filter), [] = nothing visible. Only active buildings count for a manager.
export async function allowedBuildingIds(
  db: Pick<PrismaClient, 'building'>,
  user: { id: number; role: Role },
): Promise<number[] | null> {
  if (user.role === 'BOSS') return null;
  if (user.role === 'TENANT') return [];
  const rows = await db.building.findMany({
    where: { managerId: user.id, isActive: true },
    select: { id: true },
  });
  return rows.map((b) => b.id);
}

// For models with a direct buildingId; nest it for others, e.g. { contract: scopeWhere(user) }.
export function scopeWhere(user: Pick<AuthUser, 'buildingIds'>): { buildingId?: { in: number[] } } {
  return user.buildingIds === null ? {} : { buildingId: { in: user.buildingIds } };
}

// SCOPE-03: someone else's contract looks the same as a missing one (404, never 403).
export async function tenantOwns(
  db: Pick<PrismaClient, 'contract'>,
  user: { id: number },
  contractId: number,
): Promise<void> {
  const contract = await db.contract.findFirst({
    where: { id: contractId, tenantId: user.id },
    select: { id: true },
  });
  if (!contract) throw new NotFoundException();
}
