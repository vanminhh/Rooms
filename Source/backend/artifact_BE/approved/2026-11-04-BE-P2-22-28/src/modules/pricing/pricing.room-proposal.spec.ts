import { BadRequestException, ForbiddenException, INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { addDays, compareDates, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PricingService } from './pricing.service.js';

// CP-1 · BE-P2-22 · PRC-01/02, AUD-01, SCOPE-02, Q-P5-7.
// The unit under test is PricingService itself (never mocked). The only mocked edges are
// Prisma ($transaction/tx delegates) and, in the HTTP block, the whole PrismaService.

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 12] };
const tenant: AuthUser = { id: 3, role: 'TENANT', mustChangePassword: false, buildingIds: [] };

interface RoomFixture { id: number; buildingId: number; isActive: boolean; buildingActive: boolean }

function makeHarness(rooms: RoomFixture[]) {
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const roomPriceRows: any[] = [];
  let nextId = 1;
  const auditRows: any[] = [];

  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = roomMap.get(where.id);
        if (!r) return null;
        return { id: r.id, buildingId: r.buildingId, isActive: r.isActive, building: { isActive: r.buildingActive } };
      }),
      // CP-4: Boss self-approve (PRC-04) moves rooms.price through this same mock.
      update: vi.fn(async ({ where, data }: any) => {
        const r: any = roomMap.get(where.id);
        if (r) Object.assign(r, data);
        return r;
      }),
    },
    roomPrice: {
      // CP-4: approveRoomPriceInTx re-reads the row (with its room) under the lock.
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const r: any = roomMap.get(row.roomId);
        return { ...row, room: r ? { buildingId: r.buildingId, isActive: r.isActive, building: { isActive: r.buildingActive } } : undefined };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price in these CP-1..4 fixtures.
      findFirst: vi.fn(async () => null),
      // Generic matcher: supports supersede-by-roomId+status (propose), the future-APPROVED
      // supersede (PRC-08, effectiveFrom >= gte) and the final by-id transition to APPROVED.
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

  // Mirrors the row-lock mutex from rooms.service.spec.ts: `$transaction` calls queue behind
  // each other the way Postgres would queue behind the `FOR UPDATE` row lock on the same room.
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
  return { service, tx, prisma, roomPriceRows, roomMap, auditRows };
}

describe('CP-1 · PricingService.proposeRoomPrice (unit, fake Prisma)', () => {
  const activeRoom: RoomFixture = { id: 101, buildingId: 10, isActive: true, buildingActive: true };

  it('PRC-01: effectiveFrom = hôm nay (Hà Nội) is accepted and stored as PENDING', async () => {
    const { service, roomPriceRows, auditRows } = makeHarness([activeRoom]);
    const today = formatDateOnly(todayHanoi());
    const result = await service.proposeRoomPrice(manager, { roomId: 101, price: 2500000, effectiveFrom: today } as any, '1.2.3.4');
    expect(result).toMatchObject({
      roomId: 101, buildingId: 10, price: 2500000, effectiveFrom: today, status: 'PENDING',
      proposedById: 2, reviewedById: null, reviewedAt: null,
    });
    expect(roomPriceRows).toHaveLength(1);
    expect(roomPriceRows[0].status).toBe('PENDING');
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ actorId: 2, action: 'price.propose', entity: 'room_price', ip: '1.2.3.4' });
    expect(auditRows[0].before).toBeUndefined();
    expect(auditRows[0].after).toMatchObject({ roomId: 101, price: 2500000, status: 'PENDING' });
  });

  it('PRC-01, PRC-04: effectiveFrom = ngày mai is accepted; Boss proposal is APPROVED immediately (self-review)', async () => {
    const { service } = makeHarness([activeRoom]);
    const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: tomorrow } as any);
    expect(result.status).toBe('APPROVED');
    expect(result.effectiveFrom).toBe(tomorrow);
  });

  it('PRC-01: effectiveFrom = hôm qua is rejected as VALIDATION_FAILED after the target/scope checks pass', async () => {
    const { service, roomPriceRows } = makeHarness([activeRoom]);
    const yesterday = formatDateOnly(addDays(todayHanoi(), -1));
    await expect(
      service.proposeRoomPrice(manager, { roomId: 101, price: 2500000, effectiveFrom: yesterday } as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { effectiveFrom: 'Ngày hiệu lực không được trước hôm nay' } },
    });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('API-04: effectiveFrom = 2026-13-01 (regex-shaped but impossible month) is rejected at service level as VALIDATION_FAILED', async () => {
    const { service, roomPriceRows } = makeHarness([activeRoom]);
    await expect(
      service.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: '2026-13-01' } as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { effectiveFrom: 'Ngày hiệu lực không hợp lệ' } },
    });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('PRC-01: effectiveFrom = 2026-02-29 (not a leap year) is rejected as VALIDATION_FAILED, not silently rounded', async () => {
    const { service, roomPriceRows } = makeHarness([activeRoom]);
    await expect(
      service.proposeRoomPrice(boss, { roomId: 101, price: 2500000, effectiveFrom: '2026-02-29' } as any),
    ).rejects.toMatchObject({
      constructor: BadRequestException, status: 400,
      response: { code: 'VALIDATION_FAILED', fields: { effectiveFrom: 'Ngày hiệu lực không hợp lệ' } },
    });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('G-02, PRC-04: todayHanoi 23:59:59 Hà Nội still treats the current calendar day as today, not the next one; Boss proposal is APPROVED', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-01T16:59:59Z')); // 23:59:59 Hanoi on 2026-11-01
      const { service: svc1 } = makeHarness([activeRoom]);
      const today = await svc1.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: '2026-11-01' } as any);
      expect(today.status).toBe('APPROVED');
      const { service: svc2 } = makeHarness([activeRoom]);
      await expect(
        svc2.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: '2026-10-31' } as any),
      ).rejects.toMatchObject({ response: { fields: { effectiveFrom: 'Ngày hiệu lực không được trước hôm nay' } } });
    } finally {
      vi.useRealTimers();
    }
  });

  it('G-02, PRC-04: todayHanoi 00:00:00 Hà Nội (17:00 UTC) rolls the calendar day over to the next day; Boss proposal is APPROVED', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-01T17:00:00Z')); // 00:00:00 Hanoi on 2026-11-02
      const { service: svc1 } = makeHarness([activeRoom]);
      // Yesterday's Hanoi date is now in the past.
      await expect(
        svc1.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: '2026-11-01' } as any),
      ).rejects.toMatchObject({ response: { fields: { effectiveFrom: 'Ngày hiệu lực không được trước hôm nay' } } });
      const { service: svc2 } = makeHarness([activeRoom]);
      const result = await svc2.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: '2026-11-02' } as any);
      expect(result.status).toBe('APPROVED');
    } finally {
      vi.useRealTimers();
    }
  });

  it('G-02, PRC-04: cuối tháng — effectiveFrom = last day of a future month is accepted; Boss proposal is APPROVED immediately', async () => {
    const { service } = makeHarness([activeRoom]);
    const base = todayHanoi();
    const lastDayOfMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 3, 0));
    const effectiveFrom = formatDateOnly(lastDayOfMonth);
    const result = await service.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom } as any);
    expect(result.status).toBe('APPROVED');
    expect(result.effectiveFrom).toBe(effectiveFrom);
  });

  it('G-01: price is stored as the exact integer given, at the Int32 boundaries, never a float', async () => {
    const { service: svc1 } = makeHarness([activeRoom]);
    const low = await svc1.proposeRoomPrice(boss, { roomId: 101, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any);
    expect(low.price).toBe(1);
    const { service: svc2 } = makeHarness([activeRoom]);
    const high = await svc2.proposeRoomPrice(boss, { roomId: 101, price: 2147483647, effectiveFrom: formatDateOnly(todayHanoi()) } as any);
    expect(high.price).toBe(2147483647);
    expect(Number.isInteger(high.price)).toBe(true);
  });

  it('PRC-02, PRC-04: a second proposal for the same room supersedes the first (sequential); Boss proposal lands APPROVED', async () => {
    const { service, roomPriceRows } = makeHarness([activeRoom]);
    const today = formatDateOnly(todayHanoi());
    const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
    const first = await service.proposeRoomPrice(manager, { roomId: 101, price: 2500000, effectiveFrom: today } as any);
    const second = await service.proposeRoomPrice(boss, { roomId: 101, price: 2600000, effectiveFrom: tomorrow } as any);
    expect(roomPriceRows).toHaveLength(2);
    const firstRow = roomPriceRows.find((r) => r.id === first.id);
    const secondRow = roomPriceRows.find((r) => r.id === second.id);
    expect(firstRow.status).toBe('SUPERSEDED');
    expect(secondRow.status).toBe('APPROVED');
  });

  it('PRC-02, PRC-04: two concurrent proposals for the same room still leave exactly one SUPERSEDED, the Boss one APPROVED', async () => {
    const { service, roomPriceRows, tx } = makeHarness([activeRoom]);
    const today = formatDateOnly(todayHanoi());
    const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
    const outcomes = await Promise.allSettled([
      service.proposeRoomPrice(manager, { roomId: 101, price: 2500000, effectiveFrom: today } as any),
      service.proposeRoomPrice(boss, { roomId: 101, price: 2600000, effectiveFrom: tomorrow } as any),
    ]);
    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
    expect(roomPriceRows).toHaveLength(2);
    const statuses = roomPriceRows.map((r) => r.status).sort((a, b) => a.localeCompare(b));
    expect(statuses).toEqual(['APPROVED', 'SUPERSEDED']);
    // 2 proposals take the room FOR UPDATE lock once each; the Boss one takes a second lock
    // inside its self-approve (lockRoomPrice), for 3 total.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('AUD-01: a failing audit write rejects the single surrounding $transaction call (so Postgres would roll the row back too)', async () => {
    const { service, tx, prisma, roomPriceRows } = makeHarness([activeRoom]);
    tx.auditLog.create.mockRejectedValueOnce(new Error('simulated db edge failure'));
    await expect(
      service.proposeRoomPrice(boss, { roomId: 101, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toThrow('simulated db edge failure');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.roomPrice.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    // The row only ever exists in this one mocked tx's in-memory array; a real Postgres
    // transaction that throws after this point never commits it, so it is never visible.
    expect(roomPriceRows).toHaveLength(1);
  });

  it('API-07: a tenant is rejected with FORBIDDEN by the service itself (defense in depth under the RolesGuard)', async () => {
    const { service, roomPriceRows } = makeHarness([activeRoom]);
    await expect(
      service.proposeRoomPrice(tenant, { roomId: 101, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'FORBIDDEN' } });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('API-04: proposing for a room id that does not exist is NOT_FOUND', async () => {
    const { service } = makeHarness([activeRoom]);
    await expect(
      service.proposeRoomPrice(manager, { roomId: 999999, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toMatchObject({ constructor: NotFoundException, status: 404, response: { message: 'NOT_FOUND' } });
  });

  it('SCOPE-02: a manager outside the room building is OUT_OF_SCOPE', async () => {
    const { service, roomPriceRows } = makeHarness([{ id: 104, buildingId: 11, isActive: true, buildingActive: true }]);
    await expect(
      service.proposeRoomPrice(manager, { roomId: 104, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-7: a manager cannot propose for a locked room even inside an assigned, active building', async () => {
    const lockedRoom: RoomFixture = { id: 102, buildingId: 10, isActive: false, buildingActive: true };
    const { service, roomPriceRows } = makeHarness([lockedRoom]);
    await expect(
      service.proposeRoomPrice(manager, { roomId: 102, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-7: a manager cannot propose for a room whose building is locked', async () => {
    const roomInLockedBuilding: RoomFixture = { id: 103, buildingId: 12, isActive: true, buildingActive: false };
    const { service, roomPriceRows } = makeHarness([roomInLockedBuilding]);
    await expect(
      service.proposeRoomPrice(manager, { roomId: 103, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any),
    ).rejects.toMatchObject({ constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' } });
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-7, Q-P5-5 A, PRC-04: Boss can still save a proposal for a locked room; it is APPROVED immediately but rooms.price never moves', async () => {
    const lockedRoom: RoomFixture = { id: 102, buildingId: 10, isActive: false, buildingActive: true };
    const { service, roomPriceRows, tx } = makeHarness([lockedRoom]);
    const result = await service.proposeRoomPrice(boss, { roomId: 102, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows).toHaveLength(1);
    expect(tx.room.update).not.toHaveBeenCalled(); // locked room: rooms.price stays put
  });

  it('Q-P5-7, Q-P5-5 A, PRC-04: Boss can still save a proposal for a room in a locked building; APPROVED, rooms.price unchanged', async () => {
    const roomInLockedBuilding: RoomFixture = { id: 103, buildingId: 12, isActive: true, buildingActive: false };
    const { service, roomPriceRows, tx } = makeHarness([roomInLockedBuilding]);
    const result = await service.proposeRoomPrice(boss, { roomId: 103, price: 1, effectiveFrom: formatDateOnly(todayHanoi()) } as any);
    expect(result.status).toBe('APPROVED');
    expect(roomPriceRows).toHaveLength(1);
    expect(tx.room.update).not.toHaveBeenCalled(); // locked building: rooms.price stays put
  });
});

// HTTP-level: only PrismaService is mocked. Real guards, ValidationPipe, controller, service,
// error filter and response interceptor run through the actual AppModule wiring.
describe('CP-1 · BE-P2-22 · pricing HTTP contract and error order', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  // building 10: manager2's active building; 11: another manager's building (out of scope for manager2);
  // 12: manager2's own building, but locked (Q-P5-7).
  const buildings = new Map<number, any>([
    [10, { id: 10, managerId: 2, isActive: true }],
    [11, { id: 11, managerId: 5, isActive: true }],
    [12, { id: 12, managerId: 2, isActive: false }],
  ]);
  const rooms = new Map<number, any>([
    [101, { id: 101, buildingId: 10, isActive: true }],
    [102, { id: 102, buildingId: 10, isActive: false }], // locked room, active building
    [103, { id: 103, buildingId: 12, isActive: true }], // active room, locked building
    [104, { id: 104, buildingId: 11, isActive: true }], // outside manager2's scope
  ]);
  let roomPriceRows: any[] = [];
  let nextId = 1;
  const auditCreate = vi.fn(async ({ data }: any) => ({ id: 1, ...data }));
  const roomFindUnique = vi.fn(async ({ where }: any) => {
    const r = rooms.get(where.id);
    if (!r) return null;
    return { id: r.id, buildingId: r.buildingId, isActive: r.isActive, building: { isActive: buildings.get(r.buildingId).isActive } };
  });

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) => [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive)),
    },
    room: {
      findUnique: roomFindUnique,
      // CP-4: Boss self-approve (PRC-04) moves rooms.price through this same mock.
      update: vi.fn(async ({ where, data }: any) => {
        const r = rooms.get(where.id);
        if (r) Object.assign(r, data);
        return r;
      }),
    },
    roomPrice: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const r = rooms.get(row.roomId);
        return { ...row, room: r ? { buildingId: r.buildingId, isActive: r.isActive, building: { isActive: buildings.get(r.buildingId).isActive } } : undefined };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price in these CP-1..4 fixtures.
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
    auditLog: { create: auditCreate },
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: fakePrisma.$queryRaw, room: fakePrisma.room, roomPrice: fakePrisma.roomPrice, auditLog: fakePrisma.auditLog,
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
    roomPriceRows = [];
    nextId = 1;
    auditCreate.mockClear();
    roomFindUnique.mockClear();
  });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }
  const validBody = () => ({ roomId: 101, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });

  it('API-07: missing auth token is 401 UNAUTHENTICATED', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/room-prices').send(validBody());
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('API-07, SCOPE-02: a tenant with a malformed body still gets 403 FORBIDDEN (RolesGuard runs before ValidationPipe)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(3, 'TENANT'))
      .send({ roomId: 'not-a-number', price: -1 });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
    expect(roomFindUnique).not.toHaveBeenCalled();
  });

  it('thứ tự lỗi: wrong-typed price + a non-existent roomId is 400 VALIDATION_FAILED, the pipe never lets the service run', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send({ roomId: 999999, price: 'abc', effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.price).toBe('Giá phòng phải là số nguyên đồng lớn hơn 0');
    expect(roomFindUnique).not.toHaveBeenCalled();
  });

  it('thứ tự lỗi: a past effectiveFrom combined with an out-of-scope room is 403 OUT_OF_SCOPE, not the date error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send({ roomId: 104, price: 2500000, effectiveFrom: formatDateOnly(addDays(todayHanoi(), -1)) });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
  });

  it('API-04: a well-formed body for a room id that does not exist is 404 NOT_FOUND', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 999999, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('SCOPE-02, API-08: a manager outside the room building gets exact 403 OUT_OF_SCOPE body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send({ roomId: 104, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.body).toEqual({ error: { code: 'OUT_OF_SCOPE', message: 'Dữ liệu này nằm ngoài phạm vi của bạn' } });
    expect(response.status).toBe(403);
  });

  it('Q-P5-7: manager proposing for a locked room gets 403 OUT_OF_SCOPE and no room_price row is created', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send({ roomId: 102, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-7: manager proposing for a room in a locked building gets 403 OUT_OF_SCOPE and no room_price row is created', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send({ roomId: 103, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-7, Q-P5-5 A, PRC-04: Boss proposing for a locked room gets 201 APPROVED, rooms.price unchanged', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 102, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ roomId: 102, status: 'APPROVED', reviewedById: 1 });
  });

  it('Q-P5-7, Q-P5-5 A, PRC-04: Boss proposing for a room in a locked building gets 201 APPROVED, rooms.price unchanged', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 103, price: 2500000, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ roomId: 103, status: 'APPROVED', reviewedById: 1 });
  });

  it('PRC-01: a manager with a normal active room/building gets 201 PENDING', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(2, 'MANAGER'))
      .send(validBody());
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ roomId: 101, buildingId: 10, status: 'PENDING', proposedById: 2, reviewedById: null });
  });

  it.each([0, -1, 2500000.5, 2147483648])('API-04: price %s is rejected as VALIDATION_FAILED', async (price) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 101, price, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.price).toBe('Giá phòng phải là số nguyên đồng lớn hơn 0');
  });

  it('G-01: price at the exact Int32 max boundary is accepted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 101, price: 2147483647, effectiveFrom: formatDateOnly(todayHanoi()) });
    expect(response.status).toBe(201);
    expect(response.body.data.price).toBe(2147483647);
  });

  it.each(['2026/11/01', 'not-a-date'])('API-04: malformed effectiveFrom %s is rejected as VALIDATION_FAILED', async (effectiveFrom) => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ roomId: 101, price: 1, effectiveFrom });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.effectiveFrom).toBe('Ngày hiệu lực phải có dạng YYYY-MM-DD');
  });

  it('API-04: an unknown extra field is rejected as VALIDATION_FAILED (forbidNonWhitelisted)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send({ ...validBody(), status: 'APPROVED' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.status).toBe('Trường này không được phép gửi lên');
  });

  it('AUD-01, PRC-04: a successful Boss proposal writes price.propose AND price.approve audit logs, both with the request ip, in the same transaction', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS'))
      .send(validBody());
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('APPROVED');
    expect(auditCreate).toHaveBeenCalledTimes(2);
    const proposeData = auditCreate.mock.calls[0][0].data;
    expect(proposeData).toMatchObject({ actorId: 1, action: 'price.propose', entity: 'room_price' });
    expect(typeof proposeData.ip).toBe('string');
    expect(proposeData.ip.length).toBeGreaterThan(0);
    const approveData = auditCreate.mock.calls[1][0].data;
    expect(approveData).toMatchObject({ actorId: 1, action: 'price.approve', entity: 'room_price' });
    expect(typeof approveData.ip).toBe('string');
    expect(approveData.ip.length).toBeGreaterThan(0);
  });
});
