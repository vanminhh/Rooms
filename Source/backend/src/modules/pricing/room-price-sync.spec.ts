import { parseDateOnly } from '../../common/date/today.js';
import { syncRoomPrices } from './room-price-sync.js';

// CP-5 · BE-P2-26 · PRC-06, Q-P5-5 A, G-02.
// Unit under test: syncRoomPrices itself (never mocked). The only mocked edge is the Prisma
// transaction client's delegates (tx.room.*, tx.roomPrice.*): a fake in-memory implementation of
// the exact `where`/`select`/`orderBy` the helper sends, modelling what Postgres would return,
// never a stub of syncRoomPrices's own logic.

interface RoomFixture { id: number; buildingId: number; isActive: boolean; buildingActive: boolean; price: number }
interface RoomPriceFixture {
  roomId: number; price: number; effectiveFrom: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  reviewedAt?: string | null;
}

function makeTx(rooms: RoomFixture[], priceRows: RoomPriceFixture[] = []) {
  const roomMap = new Map(rooms.map((r) => [r.id, { ...r }]));
  const rows = priceRows.map((r) => ({
    roomId: r.roomId,
    price: r.price,
    effectiveFrom: parseDateOnly(r.effectiveFrom)!,
    status: r.status,
    reviewedAt: r.reviewedAt === undefined ? null : r.reviewedAt === null ? null : new Date(r.reviewedAt),
  }));

  const tx: any = {
    room: {
      findMany: vi.fn(async ({ where, select }: any) => {
        let list = [...roomMap.values()];
        if (where.isActive !== undefined) list = list.filter((r) => r.isActive === where.isActive);
        if (where.building?.isActive !== undefined) list = list.filter((r) => r.buildingActive === where.building.isActive);
        if (where.id?.in !== undefined) list = list.filter((r) => where.id.in.includes(r.id));
        return list.map((r) => (select?.price ? { id: r.id, price: r.price } : { id: r.id }));
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const r = roomMap.get(where.id);
        if (r) r.price = data.price;
        return r;
      }),
    },
    roomPrice: {
      findMany: vi.fn(async ({ where, orderBy }: any) => {
        let list = rows.filter((r) => where.roomId.in.includes(r.roomId) && r.status === where.status
          && r.effectiveFrom.getTime() <= where.effectiveFrom.lte.getTime());
        for (const clause of [...orderBy].reverse()) {
          const [field, dir] = Object.entries(clause)[0] as [string, 'asc' | 'desc'];
          list = [...list].sort((a: any, b: any) => {
            const av = a[field]?.getTime?.() ?? -Infinity;
            const bv = b[field]?.getTime?.() ?? -Infinity;
            return dir === 'desc' ? bv - av : av - bv;
          });
        }
        return list.map((r) => ({ roomId: r.roomId, price: r.price }));
      }),
    },
  };
  return { tx, roomMap };
}

describe('CP-5 · BE-P2-26 · syncRoomPrices (PRC-06 helper shared by job and unlock)', () => {
  it('PRC-06: picks the APPROVED price with the greatest effectiveFrom <= today and applies it', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [
        { roomId: 1, price: 2300000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 1, price: 2500000, effectiveFrom: '2026-11-10', status: 'APPROVED' },
      ],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2500000);
    expect(summary).toEqual({ scanned: 1, updated: 1, unchanged: 0, withoutApprovedPrice: 0 });
  });

  it('PRC-06: same effectiveFrom date — the row with the later reviewedAt wins', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [
        { roomId: 1, price: 2600000, effectiveFrom: '2026-11-10', status: 'APPROVED', reviewedAt: '2026-11-09T08:00:00Z' },
        { roomId: 1, price: 2700000, effectiveFrom: '2026-11-10', status: 'APPROVED', reviewedAt: '2026-11-09T09:00:00Z' },
      ],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2700000);
    expect(summary.updated).toBe(1);
  });

  it('PRC-06: a future-dated APPROVED price (effectiveFrom > today) is not applied yet', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [{ roomId: 1, price: 9999999, effectiveFrom: '2026-12-01', status: 'APPROVED' }],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2000000);
    expect(summary).toEqual({ scanned: 1, updated: 0, unchanged: 0, withoutApprovedPrice: 1 });
  });

  it('PRC-06: no APPROVED row at all — rooms.price is never written, never set to null', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [{ roomId: 1, price: 2100000, effectiveFrom: '2026-11-01', status: 'REJECTED' }],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(tx.room.update).not.toHaveBeenCalled();
    expect(roomMap.get(1)?.price).toBe(2000000);
    expect(roomMap.get(1)?.price).not.toBeNull();
    expect(summary.withoutApprovedPrice).toBe(1);
  });

  it('PRC-06: the approved price equals the current rooms.price — counted as unchanged, no write', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [{ roomId: 1, price: 2000000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(tx.room.update).not.toHaveBeenCalled();
    expect(roomMap.get(1)?.price).toBe(2000000);
    expect(summary).toEqual({ scanned: 1, updated: 0, unchanged: 1, withoutApprovedPrice: 0 });
  });

  it('roomIds filters the scan to only the targeted rooms; an un-targeted room with its own APPROVED price is left untouched', async () => {
    const { tx, roomMap } = makeTx(
      [
        { id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 },
        { id: 2, buildingId: 10, isActive: true, buildingActive: true, price: 2100000 },
      ],
      [
        { roomId: 1, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 2, price: 2600000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
      ],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2500000);
    expect(roomMap.get(2)?.price).toBe(2100000); // untouched: not in roomIds
    expect(summary.scanned).toBe(1);
    expect(tx.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [1] } }) }));
  });

  it('without roomIds, every active room of an active building is scanned (job run)', async () => {
    const { tx } = makeTx(
      [
        { id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 },
        { id: 2, buildingId: 10, isActive: true, buildingActive: true, price: 2100000 },
      ],
      [],
    );
    const summary = await syncRoomPrices(tx, undefined, '2026-11-15');
    expect(summary.scanned).toBe(2);
  });

  it('Q-P5-5 A: a locked room (isActive=false) is skipped by the helper even if explicitly listed in roomIds', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 }],
      [{ roomId: 1, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2000000);
    expect(summary).toEqual({ scanned: 0, updated: 0, unchanged: 0, withoutApprovedPrice: 0 });
    expect(tx.room.update).not.toHaveBeenCalled();
  });

  it('Q-P5-5 A: a room of a locked building is skipped by the helper even if explicitly listed in roomIds', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 12, isActive: true, buildingActive: false, price: 2000000 }],
      [{ roomId: 1, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const summary = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(roomMap.get(1)?.price).toBe(2000000);
    expect(summary).toEqual({ scanned: 0, updated: 0, unchanged: 0, withoutApprovedPrice: 0 });
  });

  it('running the sync twice in a row is idempotent: the second run reports unchanged, not a second write', async () => {
    const { tx, roomMap } = makeTx(
      [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
      [{ roomId: 1, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const first = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(first).toEqual({ scanned: 1, updated: 1, unchanged: 0, withoutApprovedPrice: 0 });
    expect(roomMap.get(1)?.price).toBe(2500000);

    const second = await syncRoomPrices(tx, [1], '2026-11-15');
    expect(second).toEqual({ scanned: 1, updated: 0, unchanged: 1, withoutApprovedPrice: 0 });
    expect(tx.room.update).toHaveBeenCalledTimes(1); // only the first run wrote
  });

  it('scanned always equals updated + unchanged + withoutApprovedPrice across a mixed batch', async () => {
    const { tx } = makeTx(
      [
        { id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }, // will update
        { id: 2, buildingId: 10, isActive: true, buildingActive: true, price: 2100000 }, // unchanged
        { id: 3, buildingId: 10, isActive: true, buildingActive: true, price: 2200000 }, // no approved price
      ],
      [
        { roomId: 1, price: 2900000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 2, price: 2100000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
      ],
    );
    const summary = await syncRoomPrices(tx, [1, 2, 3], '2026-11-15');
    expect(summary).toEqual({ scanned: 3, updated: 1, unchanged: 1, withoutApprovedPrice: 1 });
    expect(summary.scanned).toBe(summary.updated + summary.unchanged + summary.withoutApprovedPrice);
  });

  it('G-02: without an explicit `today`, the day boundary follows Asia/Ho_Chi_Minh (UTC+7), not UTC midnight', async () => {
    vi.useFakeTimers();
    try {
      // 2026-11-30T16:59:59Z is still 2026-11-30 23:59:59 in Hanoi.
      vi.setSystemTime(new Date('2026-11-30T16:59:59.000Z'));
      const before = makeTx(
        [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
        [{ roomId: 1, price: 2500000, effectiveFrom: '2026-12-01', status: 'APPROVED' }],
      );
      const beforeSummary = await syncRoomPrices(before.tx, [1]);
      expect(before.roomMap.get(1)?.price).toBe(2000000); // 2026-12-01 is still tomorrow in Hanoi
      expect(beforeSummary.withoutApprovedPrice).toBe(1);

      // 2026-11-30T17:00:00Z is 2026-12-01 00:00:00 in Hanoi: the calendar day has turned.
      vi.setSystemTime(new Date('2026-11-30T17:00:00.000Z'));
      const after = makeTx(
        [{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }],
        [{ roomId: 1, price: 2500000, effectiveFrom: '2026-12-01', status: 'APPROVED' }],
      );
      const afterSummary = await syncRoomPrices(after.tx, [1]);
      expect(after.roomMap.get(1)?.price).toBe(2500000);
      expect(afterSummary.updated).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects an invalid explicit `today` string instead of silently scanning with an undefined cutoff', async () => {
    const { tx } = makeTx([{ id: 1, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 }]);
    await expect(syncRoomPrices(tx, [1], '2026-02-30')).rejects.toThrow();
  });
});
