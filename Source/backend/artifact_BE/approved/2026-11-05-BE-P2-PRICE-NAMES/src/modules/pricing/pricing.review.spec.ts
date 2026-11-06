import { ConflictException, ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { addDays, compareDates, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PricingService } from './pricing.service.js';

// CP-3 · BE-P2-24 · PRC-03/07/09, RATE-05, AUD-01, API-07, Q-P5-1, Q-P5-5, Q-P5-6, Q-P5-9, G-02, D-08.
// The unit under test is PricingService itself (never mocked). The only mocked edges are
// Prisma ($transaction/tx delegates) and, in the HTTP block, the whole PrismaService.

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 12] };
const tenant: AuthUser = { id: 3, role: 'TENANT', mustChangePassword: false, buildingIds: [] };

const today = () => todayHanoi();
const tomorrow = () => addDays(todayHanoi(), 1);
const yesterday = () => addDays(todayHanoi(), -1);

// ---------------------------------------------------------------------------
// Room price approve/reject — unit harness (fake Prisma tx, same lock-queue
// pattern as CP-1/CP-2 to mirror Postgres FOR UPDATE serialization).
// ---------------------------------------------------------------------------

interface RoomFixture { id: number; buildingId: number; isActive: boolean; buildingActive: boolean; price: number; code?: string; buildingName?: string }
interface RoomPriceRowFixture {
  id: number; roomId: number; price: number; effectiveFrom: Date; status: string;
  reason?: string | null; proposedById: number; reviewedById?: number | null;
  reviewedAt?: Date | null; reviewNote?: string | null; createdAt?: Date;
}

function makeRoomReviewHarness(rooms: RoomFixture[], rowFixtures: RoomPriceRowFixture[]) {
  const roomMap = new Map(rooms.map((r) => [r.id, { ...r }]));
  const roomPriceRows = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...r,
  }));
  const auditRows: any[] = [];
  // Snapshot of each row's reviewedById/reviewedAt at the moment the audit write happens,
  // so AUD-01 can be checked without racing the in-memory mutation.
  const auditSnapshots: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    roomPrice: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const room = roomMap.get(row.roomId);
        return {
          ...row,
          room: room
            ? {
                buildingId: room.buildingId, code: room.code ?? '101', isActive: room.isActive,
                building: { isActive: room.buildingActive, name: room.buildingName ?? 'Chùa Gà' },
              }
            : undefined,
        };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price in these CP-3 fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.roomId !== undefined && row.roomId !== where.roomId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          // CP-4/PRC-08: the service now supersedes with `effectiveFrom: { gte: Date }`, a range,
          // not an exact-match Date (same-day Q-P5-1 A is the gte === case).
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
    },
    room: {
      update: vi.fn(async ({ where, data }: any) => {
        const room = roomMap.get(where.id);
        if (!room) throw new Error(`fixture room ${where.id} not found`);
        Object.assign(room, data);
        return room;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const row = roomPriceRows.find((r) => r.id === data.entityId);
        auditSnapshots.push({ action: data.action, reviewedById: row?.reviewedById, reviewedAt: row?.reviewedAt });
        auditRows.push(data);
        return { id: auditRows.length, ...data };
      }),
    },
  };

  let lockTail = Promise.resolve();
  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, tx, prisma, roomPriceRows, roomMap, auditRows, auditSnapshots };
}

describe('CP-3 · PricingService.approveRoomPrice / rejectRoomPrice (unit, fake Prisma)', () => {
  it('PRC-03: approving a PENDING proposal due today sets rooms.price in the same transaction', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, roomMap, auditRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRoomPrice(boss, 1, '1.2.3.4');
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows[0]).toMatchObject({ status: 'APPROVED', reviewedById: 1 });
    expect(roomPriceRows[0].reviewedAt).toBeInstanceOf(Date);
    expect(roomMap.get(101)?.price).toBe(3000000); // rooms.price moved
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'room_price', ip: '1.2.3.4' });
    expect(auditRows[0].before).toMatchObject({ status: 'PENDING' });
    expect(auditRows[0].after).toMatchObject({ status: 'APPROVED', roomId: 101, price: 3000000 });
  });

  it('PRC-03, D-08: approving a PENDING proposal with a future effectiveFrom leaves rooms.price (and any existing contract rent) untouched', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, roomMap } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: tomorrow(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRoomPrice(boss, 1);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows[0].status).toBe('APPROVED');
    expect(roomMap.get(101)?.price).toBe(2000000); // not yet in effect: job (PRC-06) applies it later, not approve
  });

  it('PRC-03: rejecting a PENDING proposal stores the review note and leaves rooms.price untouched', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, roomMap, auditRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.rejectRoomPrice(boss, 1, { reviewNote: 'Giá quá cao' });
    expect(result.status).toBe('REJECTED');
    expect(roomPriceRows[0]).toMatchObject({ status: 'REJECTED', reviewNote: 'Giá quá cao', reviewedById: 1 });
    expect(roomMap.get(101)?.price).toBe(2000000);
    expect(auditRows[0]).toMatchObject({ action: 'price.reject', entity: 'room_price' });
    expect(auditRows[0].after).toMatchObject({ status: 'REJECTED', reviewNote: 'Giá quá cao' });
  });

  it('PRC-07, RATE-05: approving a proposal whose effectiveFrom slipped into the past is 409 PRICE_PROPOSAL_EXPIRED, status stays PENDING', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: yesterday(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRoomPrice(boss, 1)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'PRICE_PROPOSAL_EXPIRED' },
    });
    expect(roomPriceRows[0].status).toBe('PENDING'); // not mutated by the failed approve
  });

  it('PRC-07: an expired proposal can still be rejected', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: yesterday(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.rejectRoomPrice(boss, 1, { reviewNote: 'Quá hạn, đề xuất lại' });
    expect(result.status).toBe('REJECTED');
    expect(roomPriceRows[0].status).toBe('REJECTED');
  });

  it('PRC-09: approving an already-APPROVED proposal is 409 CONFLICT_STATE (two clicks)', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.approveRoomPrice(boss, 1);
    await expect(service.approveRoomPrice(boss, 1)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' },
    });
  });

  it('PRC-09: rejecting an already-APPROVED proposal is 409 CONFLICT_STATE', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.approveRoomPrice(boss, 1);
    await expect(service.rejectRoomPrice(boss, 1, { reviewNote: 'Đổi ý' })).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' },
    });
  });

  it('PRC-09: approving an already-REJECTED proposal is 409 CONFLICT_STATE', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.rejectRoomPrice(boss, 1, { reviewNote: 'Không hợp lý' });
    await expect(service.approveRoomPrice(boss, 1)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' },
    });
  });

  it('PRC-09: two concurrent approve calls on the same PENDING proposal (2 tabs) leave it APPROVED exactly once; the loser is 409 CONFLICT_STATE', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, tx } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const outcomes = await Promise.allSettled([service.approveRoomPrice(boss, 1), service.approveRoomPrice(boss, 1)]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, response: { message: 'CONFLICT_STATE' } });
    expect(roomPriceRows[0].status).toBe('APPROVED');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // both took the row lock before resolving
  });

  it('API-07: a manager cannot approve a room price (defense in depth under RolesGuard)', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRoomPrice(manager, 1)).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'FORBIDDEN' },
    });
    expect(roomPriceRows[0].status).toBe('PENDING');
  });

  it('API-07: a tenant cannot approve or reject a room price', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRoomPrice(tenant, 1)).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
    await expect(service.rejectRoomPrice(tenant, 1, { reviewNote: 'x' })).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
  });

  it('API-07: a manager cannot reject a room price either', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.rejectRoomPrice(manager, 1, { reviewNote: 'Không đồng ý' })).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'FORBIDDEN' },
    });
    expect(roomPriceRows[0].status).toBe('PENDING');
  });

  it('a non-existent proposal id is 404 NOT_FOUND', async () => {
    const { service } = makeRoomReviewHarness([], []);
    await expect(service.approveRoomPrice(boss, 999999)).rejects.toMatchObject({ constructor: NotFoundException, status: 404 });
  });

  it('Q-P5-5, G-06: approving a price for a locked room keeps it APPROVED but leaves rooms.price unchanged until unlock', async () => {
    const lockedRoom: RoomFixture = { id: 102, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 };
    const { service, roomPriceRows, roomMap, auditRows } = makeRoomReviewHarness([lockedRoom], [
      { id: 1, roomId: 102, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRoomPrice(boss, 1);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows[0].status).toBe('APPROVED');
    expect(roomMap.get(102)?.price).toBe(2000000); // public price unchanged while the room is locked
    expect(auditRows).toHaveLength(1); // audit still written normally
  });

  it('Q-P5-5, G-06: approving a price for a room whose building is locked also leaves rooms.price unchanged', async () => {
    const roomInLockedBuilding: RoomFixture = { id: 103, buildingId: 12, isActive: true, buildingActive: false, price: 2000000 };
    const { service, roomMap } = makeRoomReviewHarness([roomInLockedBuilding], [
      { id: 1, roomId: 103, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRoomPrice(boss, 1);
    expect(result.status).toBe('APPROVED');
    expect(roomMap.get(103)?.price).toBe(2000000);
  });

  it('Q-P5-1 A: approving a proposal with the same effectiveFrom as an existing APPROVED price supersedes the old one', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const sameDay = today();
    const { service, roomPriceRows, roomMap } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 2500000, effectiveFrom: sameDay, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
      { id: 2, roomId: 101, price: 3000000, effectiveFrom: sameDay, status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRoomPrice(boss, 2);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows.find((r) => r.id === 1)?.status).toBe('SUPERSEDED');
    expect(roomPriceRows.find((r) => r.id === 2)?.status).toBe('APPROVED');
    expect(roomMap.get(101)?.price).toBe(3000000); // the new approved price wins
  });

  it('AUD-01: approve writes the audit log in the same transaction, after reviewedById/reviewedAt are already set on the row', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, auditSnapshots } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.approveRoomPrice(boss, 1);
    expect(auditSnapshots).toHaveLength(1);
    expect(auditSnapshots[0]).toMatchObject({ action: 'price.approve', reviewedById: 1 });
    expect(auditSnapshots[0].reviewedAt).toBeInstanceOf(Date);
  });

  it('AUD-01: a failing audit write rejects the single surrounding $transaction call for approve (so Postgres would roll back rooms.price too)', async () => {
    const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
    const { service, tx, prisma } = makeRoomReviewHarness([room], [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    tx.auditLog.create.mockRejectedValueOnce(new Error('simulated db edge failure'));
    await expect(service.approveRoomPrice(boss, 1)).rejects.toThrow('simulated db edge failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.room.update).toHaveBeenCalledTimes(1);
    // The mocked tx mutates its in-memory row synchronously before the throw; a real Postgres
    // transaction that throws here never commits, so rooms.price would never actually move.
  });

  it('G-02: cuối tháng — approving a price due on the last day of the current Hanoi month updates rooms.price that day', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-30T16:30:00Z')); // 23:30 Hanoi, still 2026-11-30
      const room: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 };
      const { service, roomMap } = makeRoomReviewHarness([room], [
        { id: 1, roomId: 101, price: 3500000, effectiveFrom: new Date('2026-11-30T00:00:00Z'), status: 'PENDING', proposedById: 2 },
      ]);
      const result = await service.approveRoomPrice(boss, 1);
      expect(result.status).toBe('APPROVED');
      expect(roomMap.get(101)?.price).toBe(3500000);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Rate plan approve/reject — unit harness. Deliberately has NO `tx.service` key:
// if approveRatePlan/rejectRatePlan ever queried services (a Q-P5-9 A regression),
// this harness would throw "Cannot read properties of undefined" and fail the test.
// ---------------------------------------------------------------------------

interface BuildingFixture { id: number; isActive: boolean; name?: string }
interface RatePlanRowFixture {
  id: number; buildingId: number; kind: string; serviceId: number | null; effectiveFrom: Date; status: string;
  reason?: string | null; proposedById: number; reviewedById?: number | null;
  reviewedAt?: Date | null; reviewNote?: string | null; createdAt?: Date;
  tiers?: Array<{ tierNo: number; upTo: number | null; unitPrice: number }>;
}

function makeRatePlanReviewHarness(buildings: BuildingFixture[], rowFixtures: RatePlanRowFixture[]) {
  // Q-FE8B-2: toRatePlanView reads row.building.name, so every pre-seeded row carries it,
  // looked up from the buildings fixture by buildingId (same as the real building include).
  const buildingMap = new Map(buildings.map((b) => [b.id, b]));
  const ratePlanRows = rowFixtures.map((r) => ({
    reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [],
    building: { name: buildingMap.get(r.buildingId)?.name ?? 'Chùa Gà' },
    ...r,
  }));
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = ratePlanRows.find((r) => r.id === where.id);
        return row ? { ...row } : null;
      }),
      // CP-6: toRatePlanView's oldRateTiers comparison lookup; no prior APPROVED plan in these CP-3 fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          // CP-4/PRC-08: the service now supersedes with `effectiveFrom: { gte: Date }`, a range,
          // not an exact-match Date (same-day Q-P5-1 A is the gte === case).
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
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
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
  };
  const audit = new AuditService(prisma);
  const service = new PricingService(prisma, audit);
  return { service, tx, prisma, ratePlanRows, auditRows };
}

describe('CP-3 · PricingService.approveRatePlan / rejectRatePlan (unit, fake Prisma)', () => {
  const buildingA: BuildingFixture = { id: 10, isActive: true, name: 'Chùa Gà' };

  it('RATE-05: approving a PENDING ELECTRIC plan due today is APPROVED, audited', async () => {
    const { service, ratePlanRows, auditRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRatePlan(boss, 1, '9.9.9.9');
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows[0]).toMatchObject({ status: 'APPROVED', reviewedById: 1 });
    expect(auditRows[0]).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'rate_plan', ip: '9.9.9.9' });
  });

  it('RATE-05: approving a plan whose effectiveFrom slipped into the past is 409 PRICE_PROPOSAL_EXPIRED, status stays PENDING', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: yesterday(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRatePlan(boss, 1)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'PRICE_PROPOSAL_EXPIRED' },
    });
    expect(ratePlanRows[0].status).toBe('PENDING');
  });

  it('RATE-05: an expired plan can still be rejected', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: yesterday(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.rejectRatePlan(boss, 1, { reviewNote: 'Quá hạn' });
    expect(result.status).toBe('REJECTED');
    expect(ratePlanRows[0].status).toBe('REJECTED');
  });

  it('PRC-09: approving an already-APPROVED rate plan is 409 CONFLICT_STATE', async () => {
    const { service } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.approveRatePlan(boss, 1);
    await expect(service.approveRatePlan(boss, 1)).rejects.toMatchObject({ constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' } });
  });

  it('PRC-09: rejecting an already-approved-then-rejected rate plan is 409 CONFLICT_STATE', async () => {
    const { service } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await service.rejectRatePlan(boss, 1, { reviewNote: 'Không hợp lý' });
    await expect(service.approveRatePlan(boss, 1)).rejects.toMatchObject({ constructor: ConflictException, status: 409 });
  });

  it('Q-P5-1 A (rate_plans_one_per_day): approving a plan with the same effectiveFrom as an existing APPROVED plan of the same (building, kind, service) supersedes the old one', async () => {
    const sameDay = today();
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: sameDay, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
      { id: 2, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: sameDay, status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRatePlan(boss, 2);
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows.find((r) => r.id === 1)?.status).toBe('SUPERSEDED');
    expect(ratePlanRows.find((r) => r.id === 2)?.status).toBe('APPROVED');
  });

  it('a WATER plan of the same day does not supersede an unrelated ELECTRIC APPROVED plan of the same building', async () => {
    const sameDay = today();
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: sameDay, status: 'APPROVED', proposedById: 1, reviewedById: 1, reviewedAt: new Date() },
      { id: 2, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: sameDay, status: 'PENDING', proposedById: 2 },
    ]);
    await service.approveRatePlan(boss, 2);
    expect(ratePlanRows.find((r) => r.id === 1)?.status).toBe('APPROVED'); // untouched
  });

  it('API-07: a manager cannot approve or reject a rate plan', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRatePlan(manager, 1)).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
    await expect(service.rejectRatePlan(manager, 1, { reviewNote: 'x' })).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
    expect(ratePlanRows[0].status).toBe('PENDING');
  });

  it('API-07: a tenant cannot approve or reject a rate plan', async () => {
    const { service } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRatePlan(tenant, 1)).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
    await expect(service.rejectRatePlan(tenant, 1, { reviewNote: 'x' })).rejects.toMatchObject({ constructor: ForbiddenException, status: 403 });
  });

  // --- Q-P5-9 A: the headline CP-3 scenario ---------------------------------------------
  it('[Q-P5-9 A] approving a PENDING SERVICE plan whose service is already locked succeeds as APPROVED, no error, no service lookup at all', async () => {
    const { service, ratePlanRows, auditRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 201, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    // No `tx.service` exists in this harness at all, so a real services.is_active lookup would
    // throw synchronously; reaching APPROVED here proves the approve path never queries it.
    const result = await service.approveRatePlan(boss, 1, '1.1.1.1');
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows[0].status).toBe('APPROVED');
    expect(ratePlanRows[0].reviewedById).toBe(1);
    expect(ratePlanRows[0].reviewedAt).toBeInstanceOf(Date);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'price.approve', entity: 'rate_plan' });
  });

  it('[Q-P5-9 A] approving the same kind of PENDING SERVICE plan when the service is still active also succeeds as APPROVED (control case, same outcome either way)', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 201, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.approveRatePlan(boss, 1);
    expect(result.status).toBe('APPROVED');
    expect(ratePlanRows[0].status).toBe('APPROVED');
  });

  it('[Q-P5-9 A] approving a PENDING SERVICE plan for a locked service never produces 400 or 409, and the status never auto-flips to REJECTED or SUPERSEDED', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 202, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    await expect(service.approveRatePlan(boss, 1)).resolves.toMatchObject({ status: 'APPROVED' });
    expect(['APPROVED']).toContain(ratePlanRows[0].status);
    expect(ratePlanRows[0].status).not.toBe('REJECTED');
    expect(ratePlanRows[0].status).not.toBe('SUPERSEDED');
  });

  it('[Q-P5-9 A] rejecting a PENDING SERVICE plan still works normally regardless of the service lock state', async () => {
    const { service, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 202, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    const result = await service.rejectRatePlan(boss, 1, { reviewNote: 'Dịch vụ đã khóa, không cần giá mới' });
    expect(result.status).toBe('REJECTED');
    expect(ratePlanRows[0]).toMatchObject({ status: 'REJECTED', reviewNote: 'Dịch vụ đã khóa, không cần giá mới' });
  });

  it('AUD-01: a failing audit write rejects the single surrounding $transaction call for rate plan approve', async () => {
    const { service, tx, prisma, ratePlanRows } = makeRatePlanReviewHarness([buildingA], [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: today(), status: 'PENDING', proposedById: 2 },
    ]);
    tx.auditLog.create.mockRejectedValueOnce(new Error('simulated db edge failure'));
    await expect(service.approveRatePlan(boss, 1)).rejects.toThrow('simulated db edge failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(ratePlanRows).toHaveLength(1); // only ever existed in this failed mocked tx
  });
});

// ---------------------------------------------------------------------------
// HTTP-level: real guards, ValidationPipe, controller, service, error filter and
// response interceptor. Only PrismaService is mocked.
// ---------------------------------------------------------------------------

describe('CP-3 · BE-P2-24 · room-prices/rate-plans review HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  let roomPriceRows: any[] = [];
  let ratePlanRows: any[] = [];
  const roomMap = new Map<number, any>([[101, { id: 101, buildingId: 10, isActive: true, price: 2000000 }]]);
  const auditCreate = vi.fn(async ({ data }: any) => ({ id: 1, ...data }));

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: { findMany: vi.fn(async () => []) }, // SCOPE-02: manager buildingIds, irrelevant to Boss-only review routes
    roomPrice: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const room = roomMap.get(row.roomId);
        return { ...row, room: { buildingId: room.buildingId, code: '203', isActive: room.isActive, building: { isActive: true, name: 'Chùa Gà' } } };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price in these CP-3 HTTP fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.roomId !== undefined && row.roomId !== where.roomId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          // CP-4/PRC-08: the service now supersedes with `effectiveFrom: { gte: Date }`, a range,
          // not an exact-match Date (same-day Q-P5-1 A is the gte === case).
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
    },
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => ratePlanRows.find((r) => r.id === where.id) ?? null),
      // CP-6: toRatePlanView's oldRateTiers comparison lookup; no prior APPROVED plan in these CP-3 HTTP fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          // CP-4/PRC-08: the service now supersedes with `effectiveFrom: { gte: Date }`, a range,
          // not an exact-match Date (same-day Q-P5-1 A is the gte === case).
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
    },
    room: { update: vi.fn(async ({ where, data }: any) => { Object.assign(roomMap.get(where.id), data); return roomMap.get(where.id); }) },
    auditLog: { create: auditCreate },
    pricingIdempotencyKey: (() => {
      let store = new Map<string, any>();
      return {
        findUnique: vi.fn(async ({ where }: any) => {
          const k = where.actorId_route_key;
          return store.get(`${k.actorId}|${k.route}|${k.key}`) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => { store.set(`${data.actorId}|${data.route}|${data.key}`, { ...data }); return data; }),
        delete: vi.fn(async ({ where }: any) => { const k = where.actorId_route_key; store.delete(`${k.actorId}|${k.route}|${k.key}`); }),
        __reset: () => { store = new Map(); },
      };
    })(),
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: fakePrisma.$queryRaw, roomPrice: fakePrisma.roomPrice, ratePlan: fakePrisma.ratePlan,
      room: fakePrisma.room, auditLog: fakePrisma.auditLog, pricingIdempotencyKey: fakePrisma.pricingIdempotencyKey,
    })),
    $disconnect: vi.fn(async () => undefined),
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
  beforeEach(() => {
    roomPriceRows = [
      { id: 1, roomId: 101, price: 3000000, effectiveFrom: todayHanoi(), status: 'PENDING', reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date() },
    ];
    ratePlanRows = [
      { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: todayHanoi(), status: 'PENDING', reason: null, proposedById: 2, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [], building: { name: 'Chùa Gà' } },
    ];
    roomMap.set(101, { id: 101, buildingId: 10, isActive: true, price: 2000000 });
    auditCreate.mockClear();
    fakePrisma.pricingIdempotencyKey.__reset();
  });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('API-07: a manager gets 403 FORBIDDEN approving a room price over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', await auth(2, 'MANAGER'));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('API-07: a tenant gets 403 FORBIDDEN rejecting a room price over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/reject').set('Authorization', await auth(3, 'TENANT')).send({ reviewNote: 'x' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('PRC-03: Boss approves a room price over HTTP, 200 and rooms.price moves', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ id: 1, status: 'APPROVED' });
    expect(roomMap.get(101)?.price).toBe(3000000);
  });

  it('PRC-03: Boss rejecting a room price without reviewNote is 400 VALIDATION_FAILED, status stays PENDING', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/reject').set('Authorization', await auth(1, 'BOSS')).send({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(roomPriceRows[0].status).toBe('PENDING');
  });

  it('PRC-03: Boss rejecting a room price with a whitespace-only reviewNote is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/reject').set('Authorization', await auth(1, 'BOSS')).send({ reviewNote: '   ' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('PRC-09: double approve over HTTP — second call is 409 CONFLICT_STATE', async () => {
    const boss1 = await auth(1, 'BOSS');
    const first = await request(app.getHttpServer()).post('/api/v1/room-prices/1/approve').set('Authorization', boss1);
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer()).post('/api/v1/room-prices/1/approve').set('Authorization', boss1);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT_STATE');
  });

  it('id = 0 is 400 VALIDATION_FAILED (DTO boundary), not 404', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/0/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('a well-formed but non-existent proposal id is 404 NOT_FOUND over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/999999/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('PRC-07: approving an overdue room price proposal over HTTP is 409 PRICE_PROPOSAL_EXPIRED', async () => {
    roomPriceRows[0].effectiveFrom = yesterday();
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PRICE_PROPOSAL_EXPIRED');
  });

  it('[Q-P5-9 A] a Boss approving a PENDING SERVICE rate plan over HTTP gets 200/201 APPROVED, never 400/409, even without any service table wired in the fake Prisma', async () => {
    ratePlanRows[0] = { ...ratePlanRows[0], kind: 'SERVICE', serviceId: 202 };
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'APPROVED', kind: 'SERVICE', serviceId: 202 });
  });

  it('[Q-P5-9 A] rejecting that SERVICE plan over HTTP still works normally', async () => {
    ratePlanRows[0] = { ...ratePlanRows[0], kind: 'SERVICE', serviceId: 202 };
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans/1/reject').set('Authorization', await auth(1, 'BOSS')).send({ reviewNote: 'Dịch vụ đã khóa' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'REJECTED' });
  });

  it('API-07: a manager gets 403 approving a rate plan over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans/1/approve').set('Authorization', await auth(2, 'MANAGER'));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('AUD-01: approving a room price over HTTP writes exactly one audit log with the request ip', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(201);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const data = auditCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'room_price' });
    expect(typeof data.ip).toBe('string');
  });

  it('Q-P5-6: the same Idempotency-Key replayed on approve does not approve a second time nor write a second audit log', async () => {
    const boss1 = await auth(1, 'BOSS');
    const first = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', boss1).set('Idempotency-Key', 'APPROVE-1');
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', boss1).set('Idempotency-Key', 'APPROVE-1');
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(auditCreate).toHaveBeenCalledTimes(1); // replayed, not re-executed
  });

  // -----------------------------------------------------------------------
  // Q-FE8B-2 (BE-P2-PRICE-NAMES-2): the two new fields in the approve/reject response.
  // -----------------------------------------------------------------------
  it('Q-FE8B-2: approving a room price over HTTP returns roomCode and buildingName for the room that was priced', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ roomCode: '203', buildingName: 'Chùa Gà' });
  });

  it('Q-FE8B-2: rejecting a room price over HTTP also returns roomCode and buildingName', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices/1/reject').set('Authorization', await auth(1, 'BOSS')).send({ reviewNote: 'Không hợp lý' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ roomCode: '203', buildingName: 'Chùa Gà' });
  });

  it('Q-FE8B-2: approving a rate plan over HTTP returns buildingName and never a roomCode key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans/1/approve').set('Authorization', await auth(1, 'BOSS'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ buildingName: 'Chùa Gà' });
    expect(response.body.data).not.toHaveProperty('roomCode');
  });

  // PLAN §CP-2 scenario 5 (RATE-01, RATE-05): the third leg (propose, approve already covered above) — reject.
  it('Q-FE8B-2, RATE-05: rejecting a rate plan over HTTP also returns buildingName, status REJECTED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rate-plans/1/reject').set('Authorization', await auth(1, 'BOSS')).send({ reviewNote: 'Không hợp lý' });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'REJECTED', buildingName: 'Chùa Gà' });
    expect(response.body.data).not.toHaveProperty('roomCode');
  });
});
