import type { PrismaClient } from '@prisma/client';
import { ratesAt, currentRoomPrice } from './rates-at.js';

// CP-4 (BE-P2-05) · RATE-04, RATE-06, PRC-06, PRC-07, PRC-10, SCOPE-02, PUB-04.
// Outside edge only: a fake Prisma that *interprets* the where/orderBy the functions
// pass (buildingId/roomId, status, effectiveFrom.lte, orderBy triple, tiers orderBy),
// so the test actually exercises the filtering/ordering contract of PLAN 2.5, not just
// the mapping. Nothing from the unit under test is mocked.

interface FakeRatePlanRow {
  id: number; buildingId: number; kind: 'ELECTRIC' | 'WATER' | 'SERVICE'; serviceId: number | null;
  effectiveFrom: Date; status: string; reviewedAt: Date | null;
  tiers: { tierNo: number; upTo: number | null; unitPrice: number }[];
}
interface FakeRoomPriceRow {
  id: number; roomId: number; price: number; effectiveFrom: Date; status: string; reviewedAt: Date | null;
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object') {
      const c = cond as { lte?: Date };
      if ('lte' in c) return (value as Date).getTime() <= (c.lte as Date).getTime();
    }
    return value === cond;
  });
}

function orderRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: Record<string, 'asc' | 'desc'>[] | Record<string, 'asc' | 'desc'>,
): T[] {
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const ob of clauses) {
      const [field, dir] = Object.entries(ob)[0] as [string, 'asc' | 'desc'];
      let av = a[field] as Date | number | null;
      let bv = b[field] as Date | number | null;
      av = av instanceof Date ? av.getTime() : av ?? -Infinity;
      bv = bv instanceof Date ? bv.getTime() : bv ?? -Infinity;
      if (av !== bv) return dir === 'asc' ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
    }
    return 0;
  });
}

function fakeDb(ratePlanRows: FakeRatePlanRow[], roomPriceRows: FakeRoomPriceRow[]): Pick<PrismaClient, 'ratePlan' | 'roomPrice'> {
  return {
    ratePlan: {
      findMany: async (args: { where: Record<string, unknown>; orderBy: Record<string, 'asc' | 'desc'>[]; include?: { tiers?: { orderBy: Record<string, 'asc' | 'desc'> } } }) => {
        const filtered = ratePlanRows.filter((r) => matchesWhere(r as unknown as Record<string, unknown>, args.where));
        const ordered = orderRows(filtered, args.orderBy);
        return ordered.map((r) => ({
          ...r,
          tiers: args.include?.tiers ? orderRows(r.tiers as unknown as Record<string, unknown>[], args.include.tiers.orderBy) : r.tiers,
        }));
      },
    } as unknown as PrismaClient['ratePlan'],
    roomPrice: {
      findFirst: async (args: { where: Record<string, unknown>; orderBy: Record<string, 'asc' | 'desc'>[] }) => {
        const filtered = roomPriceRows.filter((r) => matchesWhere(r as unknown as Record<string, unknown>, args.where));
        const ordered = orderRows(filtered, args.orderBy);
        return ordered[0] ?? null;
      },
    } as unknown as PrismaClient['roomPrice'],
  };
}

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);

describe('RATE-04 / RATE-06 / BE-P2-05: ratesAt', () => {
  it('RATE-04 / BE-P2-05 #1: electric APPROVED from 2026-09-01, called with 2026-11-01, returns it with tiers ascending', async () => {
    const db = fakeDb(
      [
        {
          id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'),
          status: 'APPROVED', reviewedAt: null,
          tiers: [{ tierNo: 2, upTo: null, unitPrice: 3500 }, { tierNo: 1, upTo: 50, unitPrice: 2000 }],
        },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.electric?.ratePlanId).toBe(1);
    expect(out.electric?.tiers.map((t) => t.tierNo)).toEqual([1, 2]);
    expect(out.water).toBeNull();
  });

  it('RATE-04 / BE-P2-05 #2 (acceptance spec 12): plan APPROVED effective 2026-10-20 does NOT apply to a date before it', async () => {
    const db = fakeDb(
      [
        { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-20'), status: 'APPROVED', reviewedAt: null, tiers: [] },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-10-15'));
    expect(out.electric).toBeNull();
  });

  it('RATE-04 / BE-P2-05 #3: same data, called with 2026-11-15 returns the 2026-10-20 plan', async () => {
    const db = fakeDb(
      [
        { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-20'), status: 'APPROVED', reviewedAt: null, tiers: [] },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-15'));
    expect(out.electric?.ratePlanId).toBe(1);
  });

  it('PRC-07 / BE-P2-05 #4: a PENDING plan effective yesterday never counts, only the APPROVED one from last month', async () => {
    const db = fakeDb(
      [
        { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
        { id: 2, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-31'), status: 'PENDING', reviewedAt: null, tiers: [] },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.electric?.ratePlanId).toBe(1);
  });

  it('PRC-10 / BE-P2-05 #5: REJECTED and SUPERSEDED plans with newer effective dates are ignored', async () => {
    const db = fakeDb(
      [
        { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
        { id: 2, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-01'), status: 'REJECTED', reviewedAt: null, tiers: [] },
        { id: 3, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-10-15'), status: 'SUPERSEDED', reviewedAt: null, tiers: [] },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.electric?.ratePlanId).toBe(1);
  });

  it('RATE-04 / BE-P2-05 #6: building has no WATER rate plan at all -> water = null, no throw', async () => {
    const db = fakeDb(
      [{ id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] }],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.water).toBeNull();
  });

  it('RATE-01 / BE-P2-05 #7: two services, each with one plan, land under their own serviceId, not mixed into electric/water', async () => {
    const db = fakeDb(
      [
        { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 100, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
        { id: 2, buildingId: 10, kind: 'SERVICE', serviceId: 200, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
      ],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.services.size).toBe(2);
    expect(out.services.get(100)?.ratePlanId).toBe(1);
    expect(out.services.get(200)?.ratePlanId).toBe(2);
    expect(out.electric).toBeNull();
    expect(out.water).toBeNull();
  });

  it('SCOPE-02 / BE-P2-05 #8: a rate plan of a different building with the same kind never leaks in', async () => {
    const db = fakeDb(
      [{ id: 1, buildingId: 999, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] }],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    expect(out.electric).toBeNull();
  });

  it('PUB-04 / BE-P2-05 #9: the returned view never carries reviewNote, proposedById or reviewedById', async () => {
    const db = fakeDb(
      [{ id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: d('2026-09-01'), tiers: [] }],
      [],
    );
    const out = await ratesAt(db, 10, d('2026-11-01'));
    const keys = Object.keys(out.electric as object);
    expect(keys).not.toContain('reviewNote');
    expect(keys).not.toContain('proposedById');
    expect(keys).not.toContain('reviewedById');
    expect(keys).not.toContain('reason');
  });
});

describe('PRC-06 / BE-P2-05: currentRoomPrice', () => {
  it('PRC-06 / BE-P2-05 #10: 3 APPROVED prices (09-01, 10-01, 12-01), date = 2026-11-01 returns the 10-01 one', async () => {
    const db = fakeDb([], [
      { id: 1, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null },
      { id: 2, roomId: 1, price: 2_200_000, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: null },
      { id: 3, roomId: 1, price: 2_500_000, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: null },
    ]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out?.id).toBe(2);
    expect(out?.price).toBe(2_200_000);
  });

  it('PRC-06 / BE-P2-05 #11: same effective_from, later reviewed_at (15:00) wins over earlier (09:00)', async () => {
    const db = fakeDb([], [
      { id: 1, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: new Date('2026-09-25T09:00:00Z') },
      { id: 2, roomId: 1, price: 2_100_000, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: new Date('2026-09-25T15:00:00Z') },
    ]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out?.id).toBe(2);
    expect(out?.price).toBe(2_100_000);
  });

  it('A2-4 / BE-P2-05 #12: same effective_from AND same reviewed_at -> larger id wins', async () => {
    const tie = new Date('2026-09-25T09:00:00Z');
    const db = fakeDb([], [
      { id: 5, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: tie },
      { id: 7, roomId: 1, price: 2_050_000, effectiveFrom: d('2026-10-01'), status: 'APPROVED', reviewedAt: tie },
    ]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out?.id).toBe(7);
  });

  it('ROOM-02 / BE-P2-05 #13: room with no APPROVED price at all (CG01/301) -> null', async () => {
    const db = fakeDb([], [{ id: 1, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-09-01'), status: 'PENDING', reviewedAt: null }]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out).toBeNull();
  });

  it('PRC-06 / BE-P2-05 #14: only a future APPROVED price (2026-12-01), date = 2026-11-01 -> null', async () => {
    const db = fakeDb([], [{ id: 1, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: null }]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out).toBeNull();
  });

  it('PRC-06 / BE-P2-05 #15: a price of a different room in the same building never leaks in', async () => {
    const db = fakeDb([], [
      { id: 1, roomId: 1, price: 2_000_000, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null },
      { id: 2, roomId: 2, price: 9_999_999, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null },
    ]);
    const out = await currentRoomPrice(db, 1, d('2026-11-01'));
    expect(out?.id).toBe(1);
    expect(out?.price).toBe(2_000_000);
  });
});
