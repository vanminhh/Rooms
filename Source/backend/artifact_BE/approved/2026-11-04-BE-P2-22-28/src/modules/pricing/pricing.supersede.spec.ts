import { BadRequestException } from '@nestjs/common';
import { addDays, compareDates, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { AuditService } from '../audit/audit.service.js';
import { PricingService } from './pricing.service.js';

// CP-4 · BE-P2-25 · PRC-04, PRC-08, RATE-01, AUD-01, G-01, Q-P5-5 A, Q-P5-8 A, Q-P5-9 A.
// The unit under test is PricingService itself (never mocked). The only mocked edges are the
// Prisma `$transaction`/tx delegates (fake, in-memory, never the real DB or the service's own code).

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };

// ---------------------------------------------------------------------------
// Room price harness: same shape as pricing.room-proposal.spec.ts's makeHarness, but also
// accepts pre-seeded rows so PRC-08 scenarios can start from an already-APPROVED price.
// ---------------------------------------------------------------------------

interface RoomFixture { id: number; buildingId: number; isActive: boolean; buildingActive: boolean; price: number }
interface RoomPriceRowFixture {
  id: number; roomId: number; price: number; effectiveFrom: Date; status: string;
  proposedById: number; reviewedById?: number | null; reviewedAt?: Date | null;
  reviewNote?: string | null; reason?: string | null; createdAt?: Date;
}

function makeRoomHarness(rooms: RoomFixture[], rowFixtures: RoomPriceRowFixture[] = []) {
  const roomMap = new Map(rooms.map((r) => [r.id, { ...r }]));
  const roomPriceRows: any[] = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...r,
  }));
  let nextId = rowFixtures.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = roomMap.get(where.id);
        if (!r) return null;
        return { id: r.id, buildingId: r.buildingId, isActive: r.isActive, building: { isActive: r.buildingActive } };
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
        return { ...row, room: r ? { buildingId: r.buildingId, isActive: r.isActive, building: { isActive: r.buildingActive } } : undefined };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price besides what's in rowFixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.roomId !== undefined && row.roomId !== where.roomId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data };
        roomPriceRows.push(row);
        return row;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }),
    },
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
  return { service, tx, prisma, roomPriceRows, roomMap, auditRows };
}

// ---------------------------------------------------------------------------
// Rate plan harness: same shape as pricing.rate-proposal.spec.ts's makeHarness, with
// pre-seeded rows for PRC-08 and an optional services table for the Q-P5-8/9 regression check.
// ---------------------------------------------------------------------------

interface BuildingFixture { id: number; isActive: boolean }
interface ServiceFixture { id: number; buildingId: number; isActive: boolean }
interface RatePlanRowFixture {
  id: number; buildingId: number; kind: string; serviceId: number | null; effectiveFrom: Date; status: string;
  proposedById: number; reviewedById?: number | null; reviewedAt?: Date | null; reviewNote?: string | null;
  reason?: string | null; createdAt?: Date; tiers?: Array<{ tierNo: number; upTo: number | null; unitPrice: number }>;
}

function makeRatePlanHarness(buildings: BuildingFixture[], services: ServiceFixture[] = [], rowFixtures: RatePlanRowFixture[] = []) {
  const buildingMap = new Map(buildings.map((b) => [b.id, { ...b }]));
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const ratePlanRows: any[] = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [], ...r,
  }));
  let nextId = rowFixtures.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  let nextTierId = 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    building: {
      findUnique: vi.fn(async ({ where }: any) => {
        const b = buildingMap.get(where.id);
        return b ? { id: b.id, isActive: b.isActive } : null;
      }),
    },
    service: {
      findUnique: vi.fn(async ({ where }: any) => {
        const s = serviceMap.get(where.id);
        return s ? { buildingId: s.buildingId, isActive: s.isActive } : null;
      }),
    },
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = ratePlanRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      // CP-6: toRatePlanView's oldRateTiers comparison lookup; no prior APPROVED plan besides rowFixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const tiers = (data.tiers?.create ?? []).map((t: any) => ({ id: nextTierId++, ...t }));
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data, tiers };
        ratePlanRows.push(row);
        return row;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }),
    },
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
  return { service, tx, prisma, ratePlanRows, auditRows };
}

const today = () => formatDateOnly(todayHanoi());

// ===========================================================================
// PRC-04 · Boss self-approve (room price)
// ===========================================================================

describe('CP-4 · BE-P2-25 · PRC-04: Boss room-price proposal is APPROVED immediately (self-review)', () => {
  it('PRC-04: a Boss proposal becomes APPROVED with reviewedById = proposedById, reviewedAt set, room price moved today, 2 audit rows in 1 transaction', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, roomMap, auditRows, prisma } = makeRoomHarness([room]);
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 3200000, effectiveFrom: today() } as any, '9.9.9.9');
    expect(result.status).toBe('APPROVED');
    expect(result.proposedById).toBe(1);
    expect(result.reviewedById).toBe(1);
    expect(result.reviewedAt).not.toBeNull();
    expect(roomPriceRows).toHaveLength(1);
    expect(roomPriceRows[0]).toMatchObject({ status: 'APPROVED', proposedById: 1, reviewedById: 1 });
    expect(roomMap.get(101)?.price).toBe(3200000); // rooms.price moved: effectiveFrom <= today
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // propose+approve, one transaction
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0]).toMatchObject({ actorId: 1, action: 'price.propose', entity: 'room_price', ip: '9.9.9.9' });
    expect(auditRows[1]).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'room_price', ip: '9.9.9.9' });
  });

  it('PRC-04: a prior PENDING proposal by a manager is SUPERSEDED when Boss proposes a new one for the same room', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows } = makeRoomHarness([room]);
    const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
    const first = await service.proposeRoomPrice(manager, { roomId: 101, price: 2500000, effectiveFrom: tomorrow } as any);
    expect(first.status).toBe('PENDING');
    const second = await service.proposeRoomPrice(boss, { roomId: 101, price: 2700000, effectiveFrom: tomorrow } as any);
    expect(second.status).toBe('APPROVED');
    expect(roomPriceRows.find((r) => r.id === first.id)?.status).toBe('SUPERSEDED');
  });

  it('G-01: the Boss self-approved price is stored as the exact integer at the Int32 boundary, never a float', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomHarness([room]);
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 2147483647, effectiveFrom: today() } as any);
    expect(result.price).toBe(2147483647);
    expect(Number.isInteger(result.price)).toBe(true);
  });

  it('AUD-01: a failing price.approve audit write (the second one) rejects the whole self-approve transaction; the row never commits', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, tx, prisma, roomPriceRows } = makeRoomHarness([room]);
    tx.auditLog.create
      .mockImplementationOnce(async ({ data }: any) => ({ id: 1, ...data })) // price.propose succeeds
      .mockRejectedValueOnce(new Error('simulated db edge failure')); // price.approve fails
    await expect(
      service.proposeRoomPrice(boss, { roomId: 101, price: 2200000, effectiveFrom: today() } as any),
    ).rejects.toThrow('simulated db edge failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    // Only ever exists in this failed mocked tx's in-memory row; real Postgres never commits it.
    expect(roomPriceRows).toHaveLength(1);
  });
});

describe('CP-4 · BE-P2-25 · Q-P5-5 A: Boss self-approve on a locked target leaves rooms.price untouched', () => {
  it('a locked room: APPROVED immediately, rooms.price stays the old value', async () => {
    const lockedRoom: RoomFixture = { id: 102, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 };
    const { service, roomMap, tx } = makeRoomHarness([lockedRoom]);
    const result = await service.proposeRoomPrice(boss, { roomId: 102, price: 3000000, effectiveFrom: today() } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomMap.get(102)?.price).toBe(2000000);
    expect(tx.room.update).not.toHaveBeenCalled();
  });

  it('a room in a locked building: APPROVED immediately, rooms.price stays the old value', async () => {
    const roomInLockedBuilding: RoomFixture = { id: 103, buildingId: 12, isActive: true, buildingActive: false, price: 2000000 };
    const { service, roomMap } = makeRoomHarness([roomInLockedBuilding]);
    const result = await service.proposeRoomPrice(boss, { roomId: 103, price: 3100000, effectiveFrom: today() } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomMap.get(103)?.price).toBe(2000000);
  });

  it('regression guard: a manager proposal for the same active room still comes out PENDING (only Boss self-approves)', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomHarness([room]);
    const result = await service.proposeRoomPrice(manager, { roomId: 101, price: 2200000, effectiveFrom: today() } as any);
    expect(result.status).toBe('PENDING');
    expect(result.reviewedById).toBeNull();
  });
});

// ===========================================================================
// PRC-08 · future-APPROVED supersede (room price)
// ===========================================================================

describe('CP-4 · BE-P2-25 · PRC-08: approving a new price supersedes future APPROVED prices of the same room', () => {
  it('an APPROVED price 15 ngày is SUPERSEDED when a new price with an EARLIER effectiveFrom (10 ngày) is approved', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const aDate = addDays(todayHanoi(), 15);
    const { service, roomPriceRows } = makeRoomHarness([room], [
      { id: 1, roomId: 101, price: 2600000, effectiveFrom: aDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
    ]);
    const bDate = formatDateOnly(addDays(todayHanoi(), 10));
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 2800000, effectiveFrom: bDate } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows.find((r) => r.id === 1)?.status).toBe('SUPERSEDED');
    expect(roomPriceRows.find((r) => r.id === result.id)?.status).toBe('APPROVED');
  });

  it('an APPROVED price 15 ngày stays APPROVED when a new price with a LATER effectiveFrom (20 ngày) is approved — both end up APPROVED', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const aDate = addDays(todayHanoi(), 15);
    const { service, roomPriceRows } = makeRoomHarness([room], [
      { id: 1, roomId: 101, price: 2600000, effectiveFrom: aDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
    ]);
    const bDate = formatDateOnly(addDays(todayHanoi(), 20));
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 2900000, effectiveFrom: bDate } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows.find((r) => r.id === 1)?.status).toBe('APPROVED'); // untouched: its date is earlier
    expect(roomPriceRows.find((r) => r.id === result.id)?.status).toBe('APPROVED');
    expect(roomPriceRows).toHaveLength(2);
  });

  it('the supersede is scoped to the same room: an APPROVED future price of a different room is never touched', async () => {
    const room101: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const room104: RoomFixture = { id: 104, buildingId: 10, isActive: true, buildingActive: true, price: 2100000 };
    const aDate = addDays(todayHanoi(), 15);
    const { service, roomPriceRows } = makeRoomHarness([room101, room104], [
      { id: 1, roomId: 104, price: 2600000, effectiveFrom: aDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
    ]);
    const bDate = formatDateOnly(addDays(todayHanoi(), 10));
    await service.proposeRoomPrice(boss, { roomId: 101, price: 2800000, effectiveFrom: bDate } as any);
    expect(roomPriceRows.find((r) => r.id === 1)?.status).toBe('APPROVED'); // different room, untouched
  });
});

// ===========================================================================
// PRC-04 · Boss self-approve (rate plan)
// ===========================================================================

describe('CP-4 · BE-P2-25 · PRC-04: Boss rate-plan proposal is APPROVED immediately (self-review)', () => {
  it('a Boss ELECTRIC proposal becomes APPROVED with reviewedById = proposedById, 2 audit rows in 1 transaction', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const { service, ratePlanRows, auditRows, prisma } = makeRatePlanHarness([building]);
    const dto = {
      buildingId: 10, kind: 'ELECTRIC', effectiveFrom: today(),
      tiers: [{ tierNo: 1, upTo: 100, unitPrice: 1800 }, { tierNo: 2, upTo: null, unitPrice: 2500 }],
    };
    const result = await service.proposeRatePlan(boss, dto as any, '7.7.7.7');
    expect(result.status).toBe('APPROVED');
    expect(result.proposedById).toBe(1);
    expect(result.reviewedById).toBe(1);
    expect(result.reviewedAt).not.toBeNull();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditRows).toHaveLength(2);
    expect(auditRows[0]).toMatchObject({ actorId: 1, action: 'price.propose', entity: 'rate_plan' });
    expect(auditRows[1]).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'rate_plan' });
    expect(ratePlanRows[0]).toMatchObject({ status: 'APPROVED' });
  });

  it('Q-P5-8 A, SVC-04: Boss self-proposing a SERVICE plan for an already-locked service is still 400 VALIDATION_FAILED at propose, never reaches self-approve', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const lockedService: ServiceFixture = { id: 201, buildingId: 10, isActive: false };
    const { service, ratePlanRows } = makeRatePlanHarness([building], [lockedService]);
    await expect(
      service.proposeRatePlan(boss, {
        buildingId: 10, kind: 'SERVICE', serviceId: 201, effectiveFrom: today(),
        tiers: [{ tierNo: 1, upTo: null, unitPrice: 50000 }],
      } as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { serviceId: expect.any(String) } },
    });
    expect(ratePlanRows).toHaveLength(0);
  });

  it('Q-P5-9 A regression: a PENDING SERVICE plan created before the service was locked is still approved normally by Boss (approveRatePlan, not self-propose)', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const lockedService: ServiceFixture = { id: 201, buildingId: 10, isActive: false };
    const { service, ratePlanRows } = makeRatePlanHarness([building], [lockedService], [
      { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 201, effectiveFrom: todayHanoi(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRatePlan(boss, 1);
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows[0].status).toBe('APPROVED');
  });
});

// ===========================================================================
// PRC-08 · future-APPROVED supersede (rate plan)
// ===========================================================================

describe('CP-4 · BE-P2-25 · PRC-08: approving a new plan supersedes future APPROVED plans of the same (building, kind, service), rate_plans_one_per_day untouched', () => {
  it('an APPROVED WATER plan 15 ngày is SUPERSEDED when a new plan with an EARLIER effectiveFrom (10 ngày) is approved', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const aDate = addDays(todayHanoi(), 15);
    const { service, ratePlanRows } = makeRatePlanHarness([building], [], [
      { id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: aDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 20000 }] },
    ]);
    const bDate = formatDateOnly(addDays(todayHanoi(), 10));
    const result = await service.proposeRatePlan(boss, {
      buildingId: 10, kind: 'WATER', effectiveFrom: bDate, tiers: [{ tierNo: 1, upTo: null, unitPrice: 22000 }],
    } as any);
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows.find((r) => r.id === 1)?.status).toBe('SUPERSEDED');
    expect(ratePlanRows.find((r) => r.id === result.id)?.status).toBe('APPROVED');
  });

  it('an APPROVED WATER plan 15 ngày stays APPROVED when a new plan with a LATER effectiveFrom (20 ngày) is approved — both end up APPROVED, no rate_plans_one_per_day conflict', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const aDate = addDays(todayHanoi(), 15);
    const { service, ratePlanRows } = makeRatePlanHarness([building], [], [
      { id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: aDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 20000 }] },
    ]);
    const bDate = formatDateOnly(addDays(todayHanoi(), 20));
    const result = await service.proposeRatePlan(boss, {
      buildingId: 10, kind: 'WATER', effectiveFrom: bDate, tiers: [{ tierNo: 1, upTo: null, unitPrice: 25000 }],
    } as any);
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows.find((r) => r.id === 1)?.status).toBe('APPROVED'); // untouched: its date is earlier
    expect(ratePlanRows.find((r) => r.id === result.id)?.status).toBe('APPROVED');
    expect(ratePlanRows).toHaveLength(2);
  });

  it('the supersede is scoped to (building, kind, serviceId): an APPROVED ELECTRIC plan is never superseded by a WATER approval of the same building', async () => {
    const building: BuildingFixture = { id: 10, isActive: true };
    const sameFutureDate = addDays(todayHanoi(), 15);
    const { service, ratePlanRows } = makeRatePlanHarness([building], [], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: sameFutureDate, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date(), tiers: [{ tierNo: 1, upTo: null, unitPrice: 1800 }] },
    ]);
    await service.proposeRatePlan(boss, {
      buildingId: 10, kind: 'WATER', effectiveFrom: formatDateOnly(addDays(todayHanoi(), 10)), tiers: [{ tierNo: 1, upTo: null, unitPrice: 22000 }],
    } as any);
    expect(ratePlanRows.find((r) => r.id === 1)?.status).toBe('APPROVED'); // different kind, untouched
  });
});
