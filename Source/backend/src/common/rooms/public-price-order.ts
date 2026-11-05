import type { Prisma, PrismaClient } from '@prisma/client';

// PUB-01 "Mới nhất" and /public/featured-rooms order public rooms by their current price (PRC-06).
// shortcut: sorts in memory, fine up to a few thousand public rooms; move to SQL + index beyond that.

export interface PriceStamp {
  id: number;
  roomId: number;
  effectiveFrom: Date;
  reviewedAt: Date | null;
}

const time = (date: Date | null): number => date?.getTime() ?? 0;

// PRC-06: the current price has the greatest effective_from, then the later reviewed_at, then the greater id.
function isNewerPrice(a: PriceStamp, b: PriceStamp): boolean {
  return (time(a.effectiveFrom) - time(b.effectiveFrom) || time(a.reviewedAt) - time(b.reviewedAt) || a.id - b.id) > 0;
}

// Pure: `prices` are APPROVED rows already in effect; the order of the input does not matter.
export function orderRoomIdsNewest(roomIds: readonly number[], prices: readonly PriceStamp[]): number[] {
  const current = new Map<number, PriceStamp>();
  for (const price of prices) {
    const best = current.get(price.roomId);
    if (!best || isNewerPrice(price, best)) current.set(price.roomId, price);
  }
  // PUB-01: later reviewed_at first, then later effective_from, then greater room id; rooms without a current price go last.
  return [...roomIds].sort((x, y) => {
    const a = current.get(x);
    const b = current.get(y);
    if (!a || !b) return Number(!a) - Number(!b) || y - x;
    return time(b.reviewedAt) - time(a.reviewedAt) || time(b.effectiveFrom) - time(a.effectiveFrom) || y - x;
  });
}

// `where` must be the public filter (publicRoomWhere) so that only public rooms are ordered.
export async function newestRoomIds(
  db: Pick<PrismaClient, 'room' | 'roomPrice'>,
  where: Prisma.RoomWhereInput,
  today: Date,
): Promise<number[]> {
  const rooms = await db.room.findMany({ where, select: { id: true } });
  const roomIds = rooms.map((room) => room.id);
  if (roomIds.length === 0) return [];
  const prices = await db.roomPrice.findMany({
    where: { roomId: { in: roomIds }, status: 'APPROVED', effectiveFrom: { lte: today } },
    select: { id: true, roomId: true, effectiveFrom: true, reviewedAt: true },
  });
  return orderRoomIdsNewest(roomIds, prices);
}
