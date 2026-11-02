import type { Prisma } from '@prisma/client';

// ROOM-05 + R2-1: the one definition of a "public" room. Every public query uses it.
export function publicRoomWhere(today: Date): Prisma.RoomWhereInput {
  return {
    isActive: true,
    underMaintenance: false,
    price: { not: null },
    contracts: { none: { status: { in: ['HOLD', 'ACTIVE'] } } },
    building: {
      isActive: true,
      AND: [
        { ratePlans: { some: { kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: { lte: today } } } },
        { ratePlans: { some: { kind: 'WATER', status: 'APPROVED', effectiveFrom: { lte: today } } } },
      ],
    },
  };
}

// BLD-05: a building is public iff it has at least one public room.
export function publicBuildingWhere(today: Date): Prisma.BuildingWhereInput {
  return { isActive: true, rooms: { some: publicRoomWhere(today) } };
}
