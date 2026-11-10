import type { Prisma } from '@prisma/client';
import { parseDateOnly, todayHanoi } from '../../common/date/today.js';

export type RoomPriceSyncSummary = {
  scanned: number;
  updated: number;
  unchanged: number;
  withoutApprovedPrice: number;
};

// PRC-06: current price = APPROVED room_prices with the greatest effective_from <= today;
// same date → later reviewed_at wins. Never writes null; locked rooms and rooms of locked buildings are skipped.
// shortcut: rooms are read without a row lock, so a concurrent approval in the same instant can be overwritten
// until the next run; upgrade to FOR UPDATE on the room rows if approvals run during the 01:00 job.
export async function syncRoomPrices(
  tx: Prisma.TransactionClient,
  roomIds?: readonly number[],
  today?: string,
): Promise<RoomPriceSyncSummary> {
  const day = today === undefined ? todayHanoi() : parseDateOnly(today);
  if (!day) throw new Error(`syncRoomPrices: invalid date ${today}`);

  const rooms = await tx.room.findMany({
    where: {
      isActive: true,
      building: { isActive: true },
      ...(roomIds === undefined ? {} : { id: { in: [...roomIds] } }),
    },
    select: { id: true, price: true },
  });
  const approved = rooms.length === 0 ? [] : await tx.roomPrice.findMany({
    where: { roomId: { in: rooms.map((room) => room.id) }, status: 'APPROVED', effectiveFrom: { lte: day } },
    select: { roomId: true, price: true },
    orderBy: [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }],
  });
  const currentPrice = new Map<number, number>();
  for (const row of approved) {
    if (!currentPrice.has(row.roomId)) currentPrice.set(row.roomId, row.price);
  }

  const summary: RoomPriceSyncSummary = { scanned: rooms.length, updated: 0, unchanged: 0, withoutApprovedPrice: 0 };
  for (const room of rooms) {
    const price = currentPrice.get(room.id);
    if (price === undefined) {
      summary.withoutApprovedPrice += 1;
    } else if (price === room.price) {
      summary.unchanged += 1;
    } else {
      await tx.room.update({ where: { id: room.id }, data: { price } });
      summary.updated += 1;
    }
  }
  return summary;
}
