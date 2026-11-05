import type { PrismaClient } from '@prisma/client';
import { ratesAfter } from './rates-at.js';

// CP-2 (BE-P2-30) · PUB-03: ratesAfter is new in this checkpoint (ratesAt/currentRoomPrice already
// covered by the main suite's src/common/rates/rates-at.spec.ts, which the draft-first overlay runs
// unchanged against this same file). Outside edge only: a fake Prisma that interprets where/orderBy,
// same style as the main spec. Nothing in the unit under test is mocked.

interface FakeRatePlanRow {
  id: number; buildingId: number; kind: 'ELECTRIC' | 'WATER' | 'SERVICE'; serviceId: number | null;
  effectiveFrom: Date; status: string; reviewedAt: Date | null;
  tiers: { tierNo: number; upTo: number | null; unitPrice: number }[];
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond !== null && typeof cond === 'object') {
      const c = cond as { gt?: Date };
      if ('gt' in c) return (value as Date).getTime() > (c.gt as Date).getTime();
    }
    return value === cond;
  });
}

function orderRows<T extends Record<string, unknown>>(rows: T[], orderBy: Record<string, 'asc' | 'desc'>[]): T[] {
  return [...rows].sort((a, b) => {
    for (const ob of orderBy) {
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

function fakeDb(rows: FakeRatePlanRow[]): Pick<PrismaClient, 'ratePlan'> {
  return {
    ratePlan: {
      findMany: async (args: {
        where: Record<string, unknown>; orderBy: Record<string, 'asc' | 'desc'>[];
        include?: { tiers?: { orderBy: Record<string, 'asc' | 'desc'> } };
      }) => {
        const filtered = rows.filter((r) => matchesWhere(r as unknown as Record<string, unknown>, args.where));
        const ordered = orderRows(filtered, args.orderBy);
        return ordered.map((r) => ({
          ...r,
          tiers: args.include?.tiers ? orderRows(r.tiers as unknown as Record<string, unknown>[], [args.include.tiers.orderBy]) : r.tiers,
        }));
      },
    } as unknown as PrismaClient['ratePlan'],
  };
}

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);

describe('CP-2 (BE-P2-30) · ratesAfter (PUB-03)', () => {
  it('PUB-03: returns only plans whose effective_from is strictly after the given date', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-09-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
      { id: 2, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    expect(out.map((r) => r.ratePlanId)).toEqual([2]);
    expect(out[0].effectiveFrom).toEqual(d('2026-12-01'));
  });

  it('PUB-03: a plan effective exactly on the given date is excluded (boundary: today is "current", not "upcoming")', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-11-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    expect(out).toEqual([]);
  });

  it('PUB-03: multiple future plans are ordered earliest effective_from first', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: d('2027-03-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
      { id: 2, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    expect(out.map((r) => r.ratePlanId)).toEqual([2, 1]);
  });

  it('PRC-10: a PENDING or REJECTED plan in the future is never returned, only APPROVED ones', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-12-01'), status: 'PENDING', reviewedAt: null, tiers: [] },
      { id: 2, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-12-15'), status: 'REJECTED', reviewedAt: null, tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    expect(out).toEqual([]);
  });

  it('SCOPE-02: a future plan belonging to a different building never leaks in', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 999, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: null, tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    expect(out).toEqual([]);
  });

  it('PUB-04: the returned view never carries reviewNote, proposedById or reviewedById', async () => {
    const db = fakeDb([
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: d('2026-12-01'), status: 'APPROVED', reviewedAt: d('2026-10-01'), tiers: [] },
    ]);
    const out = await ratesAfter(db, 10, d('2026-11-01'));
    const keys = Object.keys(out[0]);
    expect(keys).not.toContain('reviewNote');
    expect(keys).not.toContain('proposedById');
    expect(keys).not.toContain('reviewedById');
  });

  it('Biên: no future plan at all -> empty array, not null', async () => {
    const out = await ratesAfter(fakeDb([]), 10, d('2026-11-01'));
    expect(out).toEqual([]);
  });
});
