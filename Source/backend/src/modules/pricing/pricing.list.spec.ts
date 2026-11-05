import { ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { percentChange } from './price-comparison.js';
import { PricingService } from './pricing.service.js';

// CP-6 · BE-P2-27 · PRC-10/12, API-02/08, PUB-04.
// The unit under test is PricingService itself (never mocked). The only mocked edges are
// Prisma (findMany/count/findFirst/room.findUnique as a plain in-memory DB) and, in the HTTP
// block, the whole PrismaService through real guards/ValidationPipe/controller/service.

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };

// ---------------------------------------------------------------------------
// Generic in-memory "DB": only mocks the outside edge (Postgres filter/sort/skip/take
// semantics), never the service's own scope, pagination-shape or comparison logic.
// ---------------------------------------------------------------------------

const OPERATOR_KEYS = ['in', 'not', 'lte', 'gte', 'gt', 'lt'] as const;
function isOperatorObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !(value instanceof Date) && OPERATOR_KEYS.some((k) => k in (value as any));
}
function toComparable(v: unknown): number {
  return v instanceof Date ? v.getTime() : (v as number);
}
function matchesWhere(obj: any, where: any): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    const value = obj?.[key];
    if (isOperatorObject(cond)) {
      const c = cond as any;
      if ('in' in c && !c.in.includes(value)) return false;
      if ('not' in c && value === c.not) return false;
      if ('lte' in c && toComparable(value) > toComparable(c.lte)) return false;
      if ('gte' in c && toComparable(value) < toComparable(c.gte)) return false;
      if ('gt' in c && toComparable(value) <= toComparable(c.gt)) return false;
      if ('lt' in c && toComparable(value) >= toComparable(c.lt)) return false;
      continue;
    }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if (!matchesWhere(value, cond)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}
function sortRows<T extends Record<string, any>>(rows: T[], orderBy: Array<Record<string, 'asc' | 'desc'>> = []): T[] {
  return [...rows].sort((a, b) => {
    for (const ord of orderBy) {
      const [key, dir] = Object.entries(ord)[0] as [string, 'asc' | 'desc'];
      const av = toComparable(a[key]);
      const bv = toComparable(b[key]);
      if (av === bv) continue;
      const cmp = av < bv ? -1 : 1;
      return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function makeListHarness(options: {
  roomPriceRows?: any[];
  ratePlanRows?: any[];
  roomsById?: Map<number, { buildingId: number }>;
}) {
  const roomPriceRows = options.roomPriceRows ?? [];
  const ratePlanRows = options.ratePlanRows ?? [];
  const roomsById = options.roomsById ?? new Map();
  const prisma: any = {
    roomPrice: {
      findMany: vi.fn(async ({ where, orderBy, skip = 0, take }: any) => {
        const filtered = sortRows(roomPriceRows.filter((r) => matchesWhere(r, where)), orderBy);
        return take !== undefined ? filtered.slice(skip, skip + take) : filtered.slice(skip);
      }),
      count: vi.fn(async ({ where }: any) => roomPriceRows.filter((r) => matchesWhere(r, where)).length),
      findFirst: vi.fn(async ({ where, orderBy }: any) =>
        sortRows(roomPriceRows.filter((r) => matchesWhere(r, where)), orderBy)[0] ?? null),
    },
    ratePlan: {
      findMany: vi.fn(async ({ where, orderBy, skip = 0, take }: any) => {
        const filtered = sortRows(ratePlanRows.filter((r) => matchesWhere(r, where)), orderBy);
        return take !== undefined ? filtered.slice(skip, skip + take) : filtered.slice(skip);
      }),
      count: vi.fn(async ({ where }: any) => ratePlanRows.filter((r) => matchesWhere(r, where)).length),
      findFirst: vi.fn(async ({ where, orderBy }: any) =>
        sortRows(ratePlanRows.filter((r) => matchesWhere(r, where)), orderBy)[0] ?? null),
    },
    room: { findUnique: vi.fn(async ({ where }: any) => roomsById.get(where.id) ?? null) },
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, prisma, roomPriceRows, ratePlanRows };
}

const today = () => todayHanoi();
const t = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));

// ===========================================================================
// listRoomPrices — PRC-10, PRC-07 (expired), API-02/08
// ===========================================================================

describe('CP-6 · BE-P2-27 · listRoomPrices: PRC-10 status/expired, API-02 pagination/sort, API-08 scope/filter', () => {
  function fixture() {
    const rows = [
      {
        id: 1, roomId: 101, room: { buildingId: 10, code: '203', isActive: true, building: { isActive: true, name: 'Chùa Gà' } },
        price: 2_500_000, effectiveFrom: addDays(today(), -1), status: 'PENDING',
        reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(1),
      },
      {
        id: 2, roomId: 101, room: { buildingId: 10, code: '203', isActive: true, building: { isActive: true, name: 'Chùa Gà' } },
        price: 2_600_000, effectiveFrom: addDays(today(), 1), status: 'PENDING',
        reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(2),
      },
      {
        id: 3, roomId: 101, room: { buildingId: 10, code: '203', isActive: true, building: { isActive: true, name: 'Chùa Gà' } },
        price: 2_400_000, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
        reason: null, proposedById: 2, reviewedById: 1, reviewedAt: t(3), reviewNote: null, createdAt: t(3),
      },
      {
        id: 4, roomId: 105, room: { buildingId: 11, code: '101', isActive: true, building: { isActive: true, name: 'Trúc Bạch' } },
        price: 3_000_000, effectiveFrom: today(), status: 'REJECTED',
        reason: null, proposedById: 5, reviewedById: 1, reviewedAt: t(4), reviewNote: 'Không hợp lý', createdAt: t(4),
      },
      {
        id: 5, roomId: 106, room: { buildingId: 10, code: '204', isActive: false, building: { isActive: true, name: 'Chùa Gà' } },
        price: 2_550_000, effectiveFrom: addDays(today(), -5), status: 'SUPERSEDED',
        reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(5),
      },
    ];
    const roomsById = new Map([
      [101, { buildingId: 10 }],
      [105, { buildingId: 11 }],
      [106, { buildingId: 10 }],
    ]);
    return makeListHarness({ roomPriceRows: rows, roomsById });
  }

  it('PRC-10: Boss sees all four statuses (PENDING/APPROVED/REJECTED/SUPERSEDED)', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, {} as any);
    expect(result.meta.total).toBe(5);
    expect(new Set(result.data.map((r) => r.status))).toEqual(new Set(['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED']));
  });

  it('PRC-07: expired is derived — PENDING past effectiveFrom is expired, PENDING future is not, APPROVED past is never expired', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, {} as any);
    const byId = new Map(result.data.map((r) => [r.id, r]));
    expect(byId.get(1)?.expired).toBe(true); // PENDING, yesterday
    expect(byId.get(2)?.expired).toBe(false); // PENDING, tomorrow
    expect(byId.get(3)?.expired).toBe(false); // APPROVED, 10 days ago — not PENDING, never expired
  });

  it('PRC-07, Q-FE8B-2: a PENDING proposal with effectiveFrom = yesterday (Asia/Ho_Chi_Minh) is expired, and still carries the correct roomCode/buildingName', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, {} as any);
    const row = result.data.find((r) => r.id === 1)!;
    expect(row.expired).toBe(true);
    expect(row).toMatchObject({ roomCode: '203', buildingName: 'Chùa Gà' });
  });

  it('API-02: default sort is -createdAt (newest first)', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, {} as any);
    expect(result.data.map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('API-02: sort=createdAt reverses to oldest first', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { sort: 'createdAt' } as any);
    expect(result.data.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('API-02: page/limit = 1 returns exactly one row per page, with correct meta', async () => {
    const { service } = fixture();
    const page1 = await service.listRoomPrices(boss, { page: 1, limit: 1 } as any);
    expect(page1.data.map((r) => r.id)).toEqual([5]);
    expect(page1.meta).toEqual({ page: 1, limit: 1, total: 5 });
    const page2 = await service.listRoomPrices(boss, { page: 2, limit: 1 } as any);
    expect(page2.data.map((r) => r.id)).toEqual([4]);
  });

  it('API-08: filter by status=PENDING', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { status: 'PENDING' } as any);
    expect(result.data.map((r) => r.id).sort()).toEqual([1, 2]);
    expect(result.meta.total).toBe(2);
  });

  it('API-08: filter by buildingId + status narrows to a single row', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { buildingId: 10, status: 'APPROVED' } as any);
    expect(result.data.map((r) => r.id)).toEqual([3]);
  });

  it('API-08, SCOPE-02: manager without a buildingId filter sees only rows of buildings they manage', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(manager, {} as any);
    expect(result.data.map((r) => r.id).sort()).toEqual([1, 2, 3, 5]); // excludes id 4 (building 11)
    expect(result.meta.total).toBe(4);
  });

  it('API-08, SCOPE-02: manager querying a buildingId outside their scope gets 403 OUT_OF_SCOPE, never the rows', async () => {
    const { service } = fixture();
    await expect(service.listRoomPrices(manager, { buildingId: 11 } as any)).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' },
    });
  });

  // PLAN §CP-2 scenario 9 (SCOPE-02, API-08): the thrown exception carries only the error code,
  // never the out-of-scope building's name ("Trúc Bạch") or id — full-body equality, not a subset match.
  it('SCOPE-02, API-08: the OUT_OF_SCOPE response body for an out-of-scope buildingId never leaks the building name', async () => {
    const { service } = fixture();
    const error: any = await service.listRoomPrices(manager, { buildingId: 11 } as any).catch((e) => e);
    expect(error).toMatchObject({ status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(Object.keys(error.response).sort()).toEqual(['error', 'message', 'statusCode']);
    expect(JSON.stringify(error.response)).not.toContain('Trúc Bạch');
  });

  it('API-08: a non-existent buildingId for Boss returns an empty list, not an error', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { buildingId: 999 } as any);
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('a non-existent roomId is 404 NOT_FOUND regardless of role', async () => {
    const { service } = fixture();
    await expect(service.listRoomPrices(boss, { roomId: 999_999 } as any)).rejects.toMatchObject({
      constructor: NotFoundException, status: 404,
    });
  });

  it('SCOPE-02: a roomId that exists but is outside the manager\'s scope is 403 OUT_OF_SCOPE (not 404, the room really exists)', async () => {
    const { service } = fixture();
    await expect(service.listRoomPrices(manager, { roomId: 105 } as any)).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' },
    });
  });

  it('a roomId within the manager\'s scope narrows the list to just that room\'s rows', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(manager, { roomId: 106 } as any);
    expect(result.data.map((r) => r.id)).toEqual([5]);
  });

  // -------------------------------------------------------------------------
  // Q-FE8B-2 (BE-P2-PRICE-NAMES-2): new roomCode/buildingName fields.
  // -------------------------------------------------------------------------

  it('Q-FE8B-2, PRC-10, PRC-12: every row carries roomCode and buildingName, and the pre-existing fields are untouched', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { roomId: 101 } as any);
    const row = result.data.find((r) => r.id === 3)!;
    expect(row).toMatchObject({
      id: 3, roomId: 101, buildingId: 10, price: 2_400_000, status: 'APPROVED',
      roomCode: '203', buildingName: 'Chùa Gà',
    });
  });

  it('Q-P5-5, Q-FE8B-2: a row of a locked room (isActive:false) still carries roomCode/buildingName, and never leaks an isActive key', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, {} as any);
    const lockedRow = result.data.find((r) => r.id === 5)!;
    expect(lockedRow).toMatchObject({ roomCode: '204', buildingName: 'Chùa Gà' });
    expect(lockedRow).not.toHaveProperty('isActive');
  });

  it('API-08: an empty list (buildingId with no rows) has no roomCode/buildingName crash, just an empty array', async () => {
    const { service } = fixture();
    const result = await service.listRoomPrices(boss, { buildingId: 999 } as any);
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 0 });
  });

  it('API-02: listRoomPrices issues exactly one findMany + one count + one findFirst-per-row (no N+1 from the new fields)', async () => {
    const { service, prisma } = fixture();
    await service.listRoomPrices(boss, {} as any); // 5 rows
    expect(prisma.roomPrice.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.roomPrice.count).toHaveBeenCalledTimes(1);
    expect(prisma.roomPrice.findFirst).toHaveBeenCalledTimes(5); // one comparison lookup per row, pre-existing shortcut
    expect(prisma.room.findUnique).not.toHaveBeenCalled(); // no extra room/building query: it rides the findMany include
  });

  // PLAN §CP-2 scenario 7 (API-02): roomCode/buildingName ride the one findMany via its `include`,
  // not a separate query — assert the include shape itself, not just the call count.
  it('API-02, Q-FE8B-2: listRoomPrices\' findMany include selects room.code and room.building.name', async () => {
    const { service, prisma } = fixture();
    await service.listRoomPrices(boss, {} as any);
    expect(prisma.roomPrice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          room: expect.objectContaining({
            select: expect.objectContaining({
              code: true,
              building: expect.objectContaining({ select: expect.objectContaining({ name: true }) }),
            }),
          }),
        }),
      }),
    );
  });
});

// ===========================================================================
// listRatePlans — PRC-10, PRC-07 (expired), API-02/08, CP-6 empty-tiers guard
// ===========================================================================

describe('CP-6 · BE-P2-27 · listRatePlans: PRC-10/12, API-02/08, empty-tiers guard', () => {
  function fixture() {
    const rows = [
      {
        id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, status: 'PENDING',
        effectiveFrom: addDays(today(), 1), reason: null, proposedById: 2,
        reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(1),
        tiers: [{ tierNo: 1, upTo: null, unitPrice: 1_800 }], building: { name: 'Chùa Gà' },
      },
      {
        id: 2, buildingId: 10, kind: 'WATER', serviceId: null, status: 'APPROVED',
        effectiveFrom: addDays(today(), -10), reason: null, proposedById: 2,
        reviewedById: 1, reviewedAt: t(2), reviewNote: null, createdAt: t(2),
        tiers: [{ tierNo: 1, upTo: null, unitPrice: 20_000 }], building: { name: 'Chùa Gà' },
      },
      {
        id: 3, buildingId: 11, kind: 'SERVICE', serviceId: 301, status: 'REJECTED',
        effectiveFrom: today(), reason: null, proposedById: 5,
        reviewedById: 1, reviewedAt: t(3), reviewNote: 'Không hợp lý', createdAt: t(3),
        tiers: [{ tierNo: 1, upTo: null, unitPrice: 50_000 }], building: { name: 'Trúc Bạch' },
      },
      {
        id: 4, buildingId: 10, kind: 'ELECTRIC', serviceId: null, status: 'PENDING',
        effectiveFrom: addDays(today(), -1), reason: null, proposedById: 2,
        reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(4),
        tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1_700 }, { tierNo: 2, upTo: null, unitPrice: 2_600 }], building: { name: 'Chùa Gà' },
      },
      {
        // CP-6 ghi chú coder: a plan row with no tiers at all (should never happen per RATE-02,
        // but the fixture exists to prove the comparison mapper never crashes on it).
        id: 5, buildingId: 10, kind: 'SERVICE', serviceId: 302, status: 'PENDING',
        effectiveFrom: today(), reason: null, proposedById: 2,
        reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(5),
        tiers: [], building: { name: 'Chùa Gà' },
      },
    ];
    return makeListHarness({ ratePlanRows: rows });
  }

  it('PRC-10, API-08: kind filter returns only matching rows', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, { kind: 'ELECTRIC' } as any);
    expect(result.data.map((r) => r.id)).toEqual([4, 1]); // -createdAt default
  });

  it('PRC-07: expired is derived the same way for rate plans', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, {} as any);
    const byId = new Map(result.data.map((r) => [r.id, r]));
    expect(byId.get(4)?.expired).toBe(true); // PENDING, yesterday
    expect(byId.get(1)?.expired).toBe(false); // PENDING, tomorrow
  });

  it('API-08: buildingId + status filter narrows to one row', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, { buildingId: 11 } as any);
    expect(result.data.map((r) => r.id)).toEqual([3]);
  });

  it('API-08, SCOPE-02: manager without filter sees only their own building\'s plans', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(manager, {} as any);
    expect(result.data.map((r) => r.id).sort()).toEqual([1, 2, 4, 5]); // excludes id 3 (building 11)
  });

  it('API-08, SCOPE-02: manager querying a buildingId outside scope is 403 OUT_OF_SCOPE', async () => {
    const { service } = fixture();
    await expect(service.listRatePlans(manager, { buildingId: 11 } as any)).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' },
    });
  });

  it('a non-existent buildingId for Boss returns an empty list, not an error', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, { buildingId: 999 } as any);
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('API-02: pagination slices correctly across 3 pages of 2', async () => {
    const { service } = fixture();
    const page1 = await service.listRatePlans(boss, { page: 1, limit: 2 } as any);
    const page2 = await service.listRatePlans(boss, { page: 2, limit: 2 } as any);
    const page3 = await service.listRatePlans(boss, { page: 3, limit: 2 } as any);
    expect(page1.data.map((r) => r.id)).toEqual([5, 4]);
    expect(page2.data.map((r) => r.id)).toEqual([3, 2]);
    expect(page3.data.map((r) => r.id)).toEqual([1]);
    expect(page1.meta.total).toBe(5);
  });

  it('CP-6 ghi chú coder: a plan with an empty tiers array never crashes the list and reports comparison: null', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, { buildingId: 10, kind: 'SERVICE' } as any);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].tiers).toEqual([]);
    expect(result.data[0].comparison).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Q-FE8B-2 (BE-P2-PRICE-NAMES-2): buildingName, never roomCode, on rate plan rows.
  // -------------------------------------------------------------------------

  it('Q-FE8B-2, RATE-01: every rate plan row carries buildingName and never a roomCode key', async () => {
    const { service } = fixture();
    const result = await service.listRatePlans(boss, {} as any);
    expect(result.data).toHaveLength(5);
    for (const row of result.data) {
      expect(typeof row.buildingName).toBe('string');
      expect(row).not.toHaveProperty('roomCode');
    }
    expect(result.data.find((r) => r.id === 3)?.buildingName).toBe('Trúc Bạch');
    expect(result.data.find((r) => r.id === 1)?.buildingName).toBe('Chùa Gà');
  });

  it('API-02: listRatePlans issues exactly one findMany + one count + one findFirst-per-row (no N+1 from buildingName)', async () => {
    const { service, prisma } = fixture();
    await service.listRatePlans(boss, {} as any); // 5 rows
    expect(prisma.ratePlan.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.ratePlan.count).toHaveBeenCalledTimes(1);
    expect(prisma.ratePlan.findFirst).toHaveBeenCalledTimes(5);
  });

  // PLAN §CP-2 scenario 7 (API-02): buildingName rides the one findMany via its `include`.
  it('API-02, Q-FE8B-2: listRatePlans\' findMany include selects building.name', async () => {
    const { service, prisma } = fixture();
    await service.listRatePlans(boss, {} as any);
    expect(prisma.ratePlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ building: expect.objectContaining({ select: expect.objectContaining({ name: true }) }) }),
      }),
    );
  });
});

// ===========================================================================
// PRC-12 old-value lookup: closest APPROVED effectiveFrom <= proposal's own date,
// excludes itself, ties broken by reviewedAt desc — exercised through the real
// list path (toView/toRatePlanView -> oldRoomPrice/oldRateTiers -> findFirst).
// ===========================================================================

describe('CP-6 · BE-P2-27 · PRC-12: comparison old-value selection rule', () => {
  it('picks the APPROVED row with the greatest effectiveFrom <= the proposal\'s date; on a tie, the later reviewedAt wins', async () => {
    const sameOldDate = addDays(today(), -10);
    const rowA = {
      id: 10, roomId: 201, room: { buildingId: 10, isActive: true, building: { isActive: true } },
      price: 2_000_000, effectiveFrom: sameOldDate, status: 'APPROVED',
      reason: null, proposedById: 1, reviewedById: 1, reviewedAt: t(1), reviewNote: null, createdAt: t(1),
    };
    const rowB = {
      id: 11, roomId: 201, room: { buildingId: 10, isActive: true, building: { isActive: true } },
      price: 2_100_000, effectiveFrom: sameOldDate, status: 'APPROVED', // same date as A, later reviewedAt
      reason: null, proposedById: 1, reviewedById: 1, reviewedAt: t(2), reviewNote: null, createdAt: t(2),
    };
    const rowC = {
      id: 12, roomId: 201, room: { buildingId: 10, isActive: true, building: { isActive: true } },
      price: 2_300_000, effectiveFrom: today(), status: 'PENDING',
      reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: t(3),
    };
    const { service } = makeListHarness({ roomPriceRows: [rowA, rowB, rowC], roomsById: new Map([[201, { buildingId: 10 }]]) });
    const result = await service.listRoomPrices(boss, { roomId: 201 } as any);
    const proposal = result.data.find((r) => r.id === 12);
    expect(proposal?.comparison).toEqual({
      oldValue: 2_100_000, // B, not A: same effectiveFrom, but B's reviewedAt is later
      newValue: 2_300_000,
      changePercent: percentChange(2_100_000, 2_300_000),
      label: null,
    });
  });

  it('excludes the row itself from the old-value lookup, even though it is APPROVED with effectiveFrom <= its own date', async () => {
    const standalone = {
      id: 13, roomId: 202, room: { buildingId: 10, isActive: true, building: { isActive: true } },
      price: 5_000_000, effectiveFrom: today(), status: 'APPROVED',
      reason: null, proposedById: 1, reviewedById: 1, reviewedAt: t(1), reviewNote: null, createdAt: t(1),
    };
    const { service } = makeListHarness({ roomPriceRows: [standalone], roomsById: new Map([[202, { buildingId: 10 }]]) });
    const result = await service.listRoomPrices(boss, { roomId: 202 } as any);
    expect(result.data[0].comparison).toEqual({ oldValue: null, newValue: 5_000_000, changePercent: null, label: 'Giá mới' });
  });
});

// ===========================================================================
// comparison in the POST propose/approve/reject responses (PLAN §2) — transaction harness.
// ===========================================================================

interface RoomFixture { id: number; buildingId: number; isActive: boolean; buildingActive: boolean; price: number; code?: string; buildingName?: string }
interface RoomPriceRowFixture {
  id: number; roomId: number; price: number; effectiveFrom: Date; status: string;
  proposedById: number; reviewedById?: number | null; reviewedAt?: Date | null;
  reviewNote?: string | null; reason?: string | null; createdAt?: Date;
}

function makeTxRoomHarness(rooms: RoomFixture[], rowFixtures: RoomPriceRowFixture[] = []) {
  const roomMap = new Map(rooms.map((r) => [r.id, { ...r }]));
  const roomPriceRows: any[] = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...r,
  }));
  let nextId = roomPriceRows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = roomMap.get(where.id);
        return r
          ? {
              id: r.id, buildingId: r.buildingId, code: r.code ?? '101', isActive: r.isActive,
              building: { isActive: r.buildingActive, name: r.buildingName ?? 'Chùa Gà' },
            }
          : null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const r: any = roomMap.get(where.id);
        if (r) Object.assign(r, data);
        return r;
      }),
    },
    roomPrice: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const r: any = roomMap.get(row.roomId);
        return {
          ...row,
          room: r
            ? {
                buildingId: r.buildingId, code: r.code ?? '101', isActive: r.isActive,
                building: { isActive: r.buildingActive, name: r.buildingName ?? 'Chùa Gà' },
              }
            : undefined,
        };
      }),
      // CP-6: a real (non-stub) findFirst so the comparison built inside propose/approve/reject is genuine.
      findFirst: vi.fn(async ({ where, orderBy }: any) =>
        sortRows(roomPriceRows.filter((r) => matchesWhere(r, where)), orderBy)[0] ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => matchesWhere(row, where));
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data };
        roomPriceRows.push(row);
        return row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }) },
  };
  let lockTail = Promise.resolve();
  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await callback(tx); } finally { release(); }
    }),
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, tx, prisma, roomPriceRows };
}

interface BuildingFixture { id: number; isActive: boolean; name?: string }
interface RatePlanRowFixture {
  id: number; buildingId: number; kind: string; serviceId: number | null; effectiveFrom: Date; status: string;
  proposedById: number; reviewedById?: number | null; reviewedAt?: Date | null; reviewNote?: string | null;
  reason?: string | null; createdAt?: Date; tiers?: Array<{ tierNo: number; upTo: number | null; unitPrice: number }>;
}

function makeTxRatePlanHarness(buildings: BuildingFixture[], rowFixtures: RatePlanRowFixture[] = []) {
  const buildingMap = new Map(buildings.map((b) => [b.id, { ...b }]));
  const ratePlanRows: any[] = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [],
    building: { name: buildingMap.get(r.buildingId)?.name ?? 'Chùa Gà' },
    ...r,
  }));
  let nextId = ratePlanRows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  let nextTierId = 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    building: { findUnique: vi.fn(async ({ where }: any) => { const b = buildingMap.get(where.id); return b ? { id: b.id, isActive: b.isActive } : null; }) },
    service: { findUnique: vi.fn(async () => null) },
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = ratePlanRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      findFirst: vi.fn(async ({ where, orderBy }: any) =>
        sortRows(ratePlanRows.filter((r) => matchesWhere(r, where)), orderBy)[0] ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => matchesWhere(row, where));
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const tiers = (data.tiers?.create ?? []).map((tier: any) => ({ id: nextTierId++, ...tier }));
        const building = { name: buildingMap.get(data.buildingId)?.name ?? 'Chùa Gà' };
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data, tiers, building };
        ratePlanRows.push(row);
        return row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }) },
  };
  let lockTail = Promise.resolve();
  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await callback(tx); } finally { release(); }
    }),
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, tx, prisma, ratePlanRows };
}

describe('CP-6 · BE-P2-27 · comparison is present in the propose/approve/reject responses (PLAN §2)', () => {
  it('PRC-12: proposeRoomPrice returns a comparison against the currently APPROVED price', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2_000_000 };
    const seed: RoomPriceRowFixture = {
      id: 1, roomId: 101, price: 2_000_000, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1),
    };
    const { service } = makeTxRoomHarness([room], [seed]);
    const result = await service.proposeRoomPrice(manager, { roomId: 101, price: 2_200_000, effectiveFrom: formatDateOnly(addDays(today(), 1)) } as any);
    expect(result.status).toBe('PENDING');
    expect(result.comparison).toEqual({ oldValue: 2_000_000, newValue: 2_200_000, changePercent: 10, label: null });
  });

  it('PRC-12: approveRoomPrice\'s response carries the same comparison as the proposal it approves', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2_000_000 };
    const seed: RoomPriceRowFixture = {
      id: 1, roomId: 101, price: 2_000_000, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1),
    };
    const { service } = makeTxRoomHarness([room], [seed]);
    const proposed = await service.proposeRoomPrice(manager, { roomId: 101, price: 2_200_000, effectiveFrom: formatDateOnly(today()) } as any);
    const approved = await service.approveRoomPrice(boss, proposed.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.comparison).toEqual({ oldValue: 2_000_000, newValue: 2_200_000, changePercent: 10, label: null });
  });

  it('PRC-12: rejectRoomPrice\'s response still carries a well-formed comparison field, never undefined', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2_000_000 };
    const seed: RoomPriceRowFixture = {
      id: 1, roomId: 101, price: 2_000_000, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1),
    };
    const { service } = makeTxRoomHarness([room], [seed]);
    const proposed = await service.proposeRoomPrice(manager, { roomId: 101, price: 1_900_000, effectiveFrom: formatDateOnly(today()) } as any);
    const rejected = await service.rejectRoomPrice(boss, proposed.id, { reviewNote: 'Giá quá thấp' });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.comparison).toEqual({ oldValue: 2_000_000, newValue: 1_900_000, changePercent: -5, label: null });
  });

  it('PRC-12: proposeRatePlan (WATER) returns a comparison against the currently APPROVED plan', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const seed: RatePlanRowFixture = {
      id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1), tiers: [{ tierNo: 1, upTo: null, unitPrice: 20_000 }],
    };
    const { service } = makeTxRatePlanHarness([building], [seed]);
    const result = await service.proposeRatePlan(manager, {
      buildingId: 10, kind: 'WATER', effectiveFrom: formatDateOnly(addDays(today(), 1)), tiers: [{ tierNo: 1, upTo: null, unitPrice: 22_000 }],
    } as any);
    expect(result.comparison).toEqual({ oldValue: 20_000, newValue: 22_000, changePercent: 10, label: null });
  });

  it('PRC-12: proposeRatePlan (ELECTRIC) with matching tier counts returns per-tier tierChanges', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const seed: RatePlanRowFixture = {
      id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1),
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1_800 }, { tierNo: 2, upTo: null, unitPrice: 2_500 }],
    };
    const { service } = makeTxRatePlanHarness([building], [seed]);
    const result = await service.proposeRatePlan(manager, {
      buildingId: 10, kind: 'ELECTRIC', effectiveFrom: formatDateOnly(addDays(today(), 1)),
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 2_000 }, { tierNo: 2, upTo: null, unitPrice: 2_750 }],
    } as any);
    expect(result.comparison).toMatchObject({
      tierChanges: [
        { tierNo: 1, oldValue: 1_800, newValue: 2_000, changePercent: percentChange(1_800, 2_000) },
        { tierNo: 2, oldValue: 2_500, newValue: 2_750, changePercent: percentChange(2_500, 2_750) },
      ],
    });
  });

  it('PRC-12: proposeRatePlan (ELECTRIC) with a different tier count returns both tables with tierChanges null', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const seed: RatePlanRowFixture = {
      id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: addDays(today(), -10), status: 'APPROVED',
      proposedById: 1, reviewedById: 1, reviewedAt: t(1),
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1_800 }, { tierNo: 2, upTo: null, unitPrice: 2_500 }],
    };
    const { service } = makeTxRatePlanHarness([building], [seed]);
    const result = await service.proposeRatePlan(manager, {
      buildingId: 10, kind: 'ELECTRIC', effectiveFrom: formatDateOnly(addDays(today(), 1)),
      tiers: [
        { tierNo: 1, upTo: 50, unitPrice: 1_900 },
        { tierNo: 2, upTo: 150, unitPrice: 2_400 },
        { tierNo: 3, upTo: null, unitPrice: 3_000 },
      ],
    } as any);
    expect(result.comparison).toMatchObject({ tierChanges: null });
    expect((result.comparison as any).oldTiers).toHaveLength(2);
    expect((result.comparison as any).newTiers).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Q-FE8B-2 (BE-P2-PRICE-NAMES-2): new fields on propose/approve/reject responses.
  // -------------------------------------------------------------------------

  it('Q-FE8B-2, PRC-01, PRC-12: proposeRoomPrice over the tx path returns the proposed room\'s roomCode and buildingName', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2_000_000, code: '305', buildingName: 'Láng Hạ' };
    const { service } = makeTxRoomHarness([room], []);
    const result = await service.proposeRoomPrice(manager, { roomId: 101, price: 2_200_000, effectiveFrom: formatDateOnly(addDays(today(), 1)) } as any);
    expect(result).toMatchObject({ roomCode: '305', buildingName: 'Láng Hạ' });
  });

  it('Q-FE8B-2, PRC-04: a Boss self-approve (propose -> approve in one transaction) response still carries roomCode/buildingName', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2_000_000, code: '305', buildingName: 'Láng Hạ' };
    const { service } = makeTxRoomHarness([room], []);
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 2_200_000, effectiveFrom: formatDateOnly(today()) } as any);
    expect(result.status).toBe('APPROVED');
    expect(result).toMatchObject({ roomCode: '305', buildingName: 'Láng Hạ' });
  });

  it('Q-FE8B-2: proposeRatePlan over the tx path returns buildingName of the target building', async () => {
    const building: BuildingFixture = { id: 10, isActive: true, name: 'Láng Hạ' };
    const { service } = makeTxRatePlanHarness([building], []);
    const result = await service.proposeRatePlan(manager, {
      buildingId: 10, kind: 'WATER', effectiveFrom: formatDateOnly(addDays(today(), 1)), tiers: [{ tierNo: 1, upTo: null, unitPrice: 22_000 }],
    } as any);
    expect(result.buildingName).toBe('Láng Hạ');
  });
});

// ===========================================================================
// HTTP-level: real guards, ValidationPipe, controller, service, error filter and
// response interceptor through the actual AppModule wiring. Only PrismaService is mocked.
// ===========================================================================

describe('CP-6 · BE-P2-27 · GET /room-prices, GET /rate-plans HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const buildings = new Map<number, any>([[10, { id: 10, managerId: 2, isActive: true }]]);
  const roomPriceRows = [
    {
      id: 1, roomId: 101, room: { buildingId: 10, code: '203', isActive: true, building: { isActive: true, name: 'Chùa Gà' } },
      price: 2_500_000, effectiveFrom: todayHanoi(), status: 'APPROVED',
      reason: null, proposedById: 1, reviewedById: 1, reviewedAt: new Date(), reviewNote: null, createdAt: new Date(),
    },
  ];

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) => [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive)),
    },
    roomPrice: {
      findMany: vi.fn(async ({ where, orderBy, skip = 0, take }: any) => {
        const filtered = sortRows(roomPriceRows.filter((r) => matchesWhere(r, where)), orderBy);
        return take !== undefined ? filtered.slice(skip, skip + take) : filtered.slice(skip);
      }),
      count: vi.fn(async ({ where }: any) => roomPriceRows.filter((r) => matchesWhere(r, where)).length),
      findFirst: vi.fn(async () => null),
    },
    ratePlan: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
    },
    room: { findUnique: vi.fn(async () => null) },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('API-07: no auth token is 401 UNAUTHENTICATED', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/room-prices');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('API-07, PUB-04: a tenant gets 403 FORBIDDEN before any pricing row is ever queried', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices').set('Authorization', await auth(3, 'TENANT'));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(fakePrisma.roomPrice.findMany).not.toHaveBeenCalled();
  });

  it('API-02: limit=0 is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?limit=0').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-02: limit=101 (over MAX_LIMIT) is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?limit=101').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-02: page=0 is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?page=0').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-08: a non-numeric buildingId query param is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?buildingId=abc').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PRC-10: an unknown status value is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?status=BOGUS').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('an unknown kind value on /rate-plans is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rate-plans?kind=BOGUS').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PRC-10/12: Boss gets {data,meta} with a comparison object per row through the full HTTP stack', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: 1, status: 'APPROVED' });
    expect(response.body.data[0].comparison).toEqual({ oldValue: null, newValue: 2_500_000, changePercent: null, label: 'Giá mới' });
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
  });

  it('API-08, SCOPE-02: a manager querying a buildingId outside their scope gets 403 OUT_OF_SCOPE over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices?buildingId=11').set('Authorization', await auth(2, 'MANAGER'));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
  });

  // Q-FE8B-2 (BE-P2-PRICE-NAMES-2): the new fields over the full HTTP stack.
  it('Q-FE8B-2: GET /room-prices over HTTP returns roomCode and buildingName per row', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ roomCode: '203', buildingName: 'Chùa Gà' });
  });

  it('Q-FE8B-2: GET /rate-plans over HTTP returns an empty list cleanly (no crash) when there are no plans', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });
});
