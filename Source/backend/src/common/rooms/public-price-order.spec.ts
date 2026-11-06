import { newestRoomIds, orderRoomIdsNewest, type PriceStamp } from './public-price-order.js';

// CP-1 (BE-P2-29) · PUB-01 "Mới nhất": order by current price's reviewedAt desc,
// then effectiveFrom desc, then id desc; rooms without a current price go last.
// orderRoomIdsNewest and newestRoomIds are pure/DB-edge-only, so no mocking of the unit under test.

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);

function stamp(overrides: Partial<PriceStamp>): PriceStamp {
  return { id: 1, roomId: 1, effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-01'), ...overrides };
}

describe('PUB-01 (BE-P2-29): orderRoomIdsNewest', () => {
  it('PUB-01: sorts rooms by reviewedAt of their current price, latest first', () => {
    const prices: PriceStamp[] = [
      stamp({ id: 1, roomId: 101, reviewedAt: d('2026-10-01') }),
      stamp({ id: 2, roomId: 102, reviewedAt: d('2026-10-15') }),
      stamp({ id: 3, roomId: 103, reviewedAt: d('2026-10-10') }),
    ];
    expect(orderRoomIdsNewest([101, 102, 103], prices)).toEqual([102, 103, 101]);
  });

  it('PUB-01: same effectiveFrom, later reviewedAt wins (PRC-06 current-price pick feeds the sort)', () => {
    // Two APPROVED prices for the same room, same effectiveFrom: the one reviewed later is "current".
    const prices: PriceStamp[] = [
      stamp({ id: 1, roomId: 201, effectiveFrom: d('2026-09-01'), reviewedAt: d('2026-09-02') }),
      stamp({ id: 2, roomId: 201, effectiveFrom: d('2026-09-01'), reviewedAt: d('2026-09-05') }),
      stamp({ id: 3, roomId: 202, effectiveFrom: d('2026-09-01'), reviewedAt: d('2026-09-03') }),
    ];
    // room 201's current price is id 2 (reviewedAt 09-05) > room 202's id 3 (reviewedAt 09-03)
    expect(orderRoomIdsNewest([201, 202], prices)).toEqual([201, 202]);
  });

  it('PUB-01: tie on reviewedAt falls back to effectiveFrom desc, then id desc', () => {
    const prices: PriceStamp[] = [
      stamp({ id: 10, roomId: 301, effectiveFrom: d('2026-08-01'), reviewedAt: d('2026-09-01') }),
      stamp({ id: 11, roomId: 302, effectiveFrom: d('2026-08-15'), reviewedAt: d('2026-09-01') }),
      stamp({ id: 12, roomId: 303, effectiveFrom: d('2026-08-15'), reviewedAt: d('2026-09-01') }),
    ];
    // 302 and 303 tie on reviewedAt and effectiveFrom -> greater room id (303) first (orderRoomIdsNewest compares y - x on ids)
    expect(orderRoomIdsNewest([301, 302, 303], prices)).toEqual([303, 302, 301]);
  });

  it('PUB-01: rooms without any current price are sorted after rooms that have one', () => {
    // Among rooms that both lack a current price, the tie-break falls back to greater room id first.
    const prices: PriceStamp[] = [stamp({ id: 1, roomId: 401, reviewedAt: d('2026-01-01') })];
    expect(orderRoomIdsNewest([402, 401, 403], prices)).toEqual([401, 403, 402]);
  });

  it('PUB-01: empty input list returns an empty order', () => {
    expect(orderRoomIdsNewest([], [])).toEqual([]);
  });

  it('PUB-01: current price per room is picked by effectiveFrom first (PRC-06), then that pick drives the final order', () => {
    // Room 501 has two APPROVED rows (e.g. a reproposed price): the one with the later effectiveFrom (id 2,
    // reviewedAt null) is picked as "current" even though the other row (id 1) was reviewed later in time.
    // Room 502's only price has an actual reviewedAt. A null reviewedAt sorts as the oldest possible value,
    // so 501 (current price reviewedAt = null) ends up *after* 502 in the final "newest first" order.
    const prices: PriceStamp[] = [
      stamp({ id: 1, roomId: 501, effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-06-01') }),
      stamp({ id: 2, roomId: 501, effectiveFrom: d('2026-05-01'), reviewedAt: null }),
      stamp({ id: 3, roomId: 502, effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-03-01') }),
    ];
    expect(orderRoomIdsNewest([501, 502], prices)).toEqual([502, 501]);
  });
});

describe('PUB-01 (BE-P2-29): newestRoomIds (Prisma is the mocked outside edge)', () => {
  it('PUB-01: filters public rooms via `where`, loads only APPROVED prices effective by today, and orders them', async () => {
    const roomFindMany = vi.fn(async () => [{ id: 1 }, { id: 2 }]);
    const roomPriceFindMany = vi.fn(async () => [
      { id: 1, roomId: 1, effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-10') },
      { id: 2, roomId: 2, effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-20') },
    ]);
    const db = { room: { findMany: roomFindMany }, roomPrice: { findMany: roomPriceFindMany } } as any;
    const where = { isActive: true };
    const today = d('2026-11-01');

    const ids = await newestRoomIds(db, where, today);

    expect(ids).toEqual([2, 1]);
    expect(roomFindMany).toHaveBeenCalledWith({ where, select: { id: true } });
    expect(roomPriceFindMany).toHaveBeenCalledWith({
      where: { roomId: { in: [1, 2] }, status: 'APPROVED', effectiveFrom: { lte: today } },
      select: { id: true, roomId: true, effectiveFrom: true, reviewedAt: true },
    });
  });

  it('PUB-01: no public rooms at all short-circuits without querying room_prices', async () => {
    const roomPriceFindMany = vi.fn();
    const db = { room: { findMany: vi.fn(async () => []) }, roomPrice: { findMany: roomPriceFindMany } } as any;

    const ids = await newestRoomIds(db, {} as any, d('2026-11-01'));

    expect(ids).toEqual([]);
    expect(roomPriceFindMany).not.toHaveBeenCalled();
  });
});
