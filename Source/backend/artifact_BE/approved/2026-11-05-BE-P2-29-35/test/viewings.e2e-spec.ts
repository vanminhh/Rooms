// BE-P2-34 / BE-P2-35 · CP-6: real database coverage for VIEW-13 (maintenance / lock room / lock
// building keep pending viewings) and the real Postgres advisory lock behind VIEW-11.
// vitest.config.ts only collects **/*.spec.ts; this file's name ends in `-spec.ts`, not `.spec.ts`,
// so it is excluded from `npm run test` on purpose (see vitest.config.e2e.ts for the real run).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { cleanupRun, E2eRun, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';

if (existsSync('.env')) process.loadEnvFile('.env');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type DevAccount = { key: string; phone: string; password: string; role: string };
type Session = { token: string; cookie: string };
type ApiResponse = request.Response;

const e2e = new E2eRun();
const today = formatDateOnly(todayHanoi());
const tomorrow = formatDateOnly(addDays(todayHanoi(), 1));

const created = {
  managerId: 0,
  buildingAId: 0,
  buildingBId: 0,
  roomA1: 0, // maintenance + lock + public/404 flow
  roomA2: 0, // stays active, used for the manual-create-after-lock checks
  roomB1: 0, // VIEW-11 advisory-lock flow only, never touched by the building lock
};

function send(
  app: INestApplication,
  method: 'get' | 'post' | 'patch',
  path: string,
  body?: object,
  session?: Session,
) {
  let req = request(app.getHttpServer())[method](`/api/v1${path}`);
  if (session?.token) req = req.set('Authorization', `Bearer ${session.token}`);
  if (session?.cookie) req = req.set('Cookie', `rt=${session.cookie}`);
  return body === undefined ? req : req.send(body);
}

function cookieOf(res: ApiResponse): string {
  const header = (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((value) => value.startsWith('rt='));
  if (!header) throw new Error('response has no refresh cookie');
  return header.split(';')[0].slice(3);
}

function sessionOf(res: ApiResponse): Session {
  return { token: res.body.data.accessToken as string, cookie: cookieOf(res) };
}

// Boss proposes a room price for effectiveFrom = today: proposeRoomPrice auto-approves for BOSS,
// and an immediate effectiveFrom applies rooms.price in the same transaction (PRC-03/PRC-04).
async function makeRoomPublicPrice(app: INestApplication, boss: Session, roomId: number): Promise<void> {
  const res = await send(app, 'post', '/room-prices', { roomId, price: 3_000_000, effectiveFrom: today }, boss);
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('APPROVED');
}

// Same auto-approve path for a building's ELECTRIC/WATER rate plans (ROOM-05 needs both, PRC-04).
async function makeBuildingRatePlans(app: INestApplication, boss: Session, buildingId: number): Promise<void> {
  for (const kind of ['ELECTRIC', 'WATER'] as const) {
    const res = await send(app, 'post', '/rate-plans', {
      buildingId,
      kind,
      effectiveFrom: today,
      tiers: [{ tierNo: 1, upTo: null, unitPrice: kind === 'ELECTRIC' ? 3_500 : 20_000 }],
    }, boss);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
  }
}

describe('BE-P2-34/35: VIEW-13 (maintenance/lock keep pending viewings) against real Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let boss: Session;
  let bossId: number;
  let managerSession: Session;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const seedUrl = pathToFileURL(resolve(process.cwd(), 'prisma/seed.ts')).href;
    const seed = await import(seedUrl) as { DEV_ACCOUNTS: DevAccount[] };
    const bossAccount = seed.DEV_ACCOUNTS.find((account) => account.key === 'boss');
    if (!bossAccount) throw new Error('seed has no Boss dev account');
    const login = await send(app, 'post', '/auth/login', {
      phone: bossAccount.phone,
      password: bossAccount.password,
    });
    expect(login.status).toBe(200);
    boss = sessionOf(login);
    bossId = login.body.data.user.id as number;
  });

  afterAll(async () => {
    if (!app) return;
    try {
      const skipped = await cleanupRun(prisma, e2e.log);
      expect(skipped, 'E2E-created rows must have no contract or invoice links').toEqual([]);
      e2e.finish('CLEANED');

      // CP-6 closing bullet: no leftover E2E-created viewing is still NEW/CONFIRMED, no room/building is
      // still active, after cleanupRun ran (same facts planCleanup/skippedReport show the owner).
      const leftoverViewings = await prisma.viewing.count({
        where: { id: { in: e2e.log.ids.viewings }, status: { in: ['NEW', 'CONFIRMED'] } },
      });
      const leftoverRooms = await prisma.room.count({ where: { id: { in: e2e.log.ids.rooms }, isActive: true } });
      const leftoverBuildings = await prisma.building.count({
        where: { id: { in: e2e.log.ids.buildings }, isActive: true },
      });
      expect(leftoverViewings).toBe(0);
      expect(leftoverRooms).toBe(0);
      expect(leftoverBuildings).toBe(0);
    } catch (error) {
      e2e.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app.close();
    }
  });

  it('fixtures: one manager, two buildings (its max, SCOPE-02), each with a public room', async () => {
    const managerPhone = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const createdManager = await send(app, 'post', '/managers', {
      phone: managerPhone,
      fullName: `[E2E ${e2e.runId}] Viewings manager`,
    }, boss);
    expect(createdManager.status).toBe(201);
    created.managerId = createdManager.body.data.manager.id as number;
    e2e.record('users', created.managerId);
    const temporaryPassword = createdManager.body.data.temporaryPassword as string;

    const login = await send(app, 'post', '/auth/login', { phone: managerPhone, password: temporaryPassword });
    expect(login.status).toBe(200);
    const tempSession = sessionOf(login);
    const changed = await send(app, 'post', '/auth/change-password', {
      currentPassword: temporaryPassword,
      newPassword: `E2e-${e2e.runId}-pw`,
    }, tempSession);
    expect(changed.status).toBe(200);
    managerSession = tempSession;

    const codeA = await uniqueBuildingCode(
      async (candidate) => (await prisma.building.findUnique({ where: { code: candidate }, select: { id: true } })) !== null,
    );
    const buildingA = await send(app, 'post', '/buildings', {
      code: codeA, name: `[E2E ${e2e.runId}] Viewings building A`,
      address: '1 Đường thử nghiệm', district: 'Cầu Giấy', ward: 'Dịch Vọng',
      waterMode: 'PER_M3', managerId: created.managerId,
    }, boss);
    expect(buildingA.status).toBe(201);
    created.buildingAId = buildingA.body.data.id as number;
    e2e.record('buildings', created.buildingAId);
    e2e.recordBuildingCode(codeA);

    const codeB = await uniqueBuildingCode(
      async (candidate) => (await prisma.building.findUnique({ where: { code: candidate }, select: { id: true } })) !== null,
    );
    const buildingB = await send(app, 'post', '/buildings', {
      code: codeB, name: `[E2E ${e2e.runId}] Viewings building B`,
      address: '2 Đường thử nghiệm', district: 'Cầu Giấy', ward: 'Dịch Vọng',
      waterMode: 'PER_M3', managerId: created.managerId,
    }, boss);
    expect(buildingB.status).toBe(201);
    created.buildingBId = buildingB.body.data.id as number;
    e2e.record('buildings', created.buildingBId);
    e2e.recordBuildingCode(codeB);

    for (const [key, buildingId, code] of [
      ['roomA1', created.buildingAId, 'A1'], ['roomA2', created.buildingAId, 'A2'], ['roomB1', created.buildingBId, 'B1'],
    ] as const) {
      const room = await send(app, 'post', '/rooms', { buildingId, code, floor: 1, areaM2: 20 }, managerSession);
      expect(room.status).toBe(201);
      created[key] = room.body.data.id as number;
      e2e.record('rooms', created[key]);
    }

    await makeRoomPublicPrice(app, boss, created.roomA1);
    await makeRoomPublicPrice(app, boss, created.roomB1);
    await makeBuildingRatePlans(app, boss, created.buildingAId);
    await makeBuildingRatePlans(app, boss, created.buildingBId);

    const publicA1 = await send(app, 'get', `/public/rooms/${created.roomA1}`);
    expect(publicA1.status).toBe(200);
    const publicB1 = await send(app, 'get', `/public/rooms/${created.roomB1}`);
    expect(publicB1.status).toBe(200);
  });

  let viewing1Id: number;
  let viewing2Id: number;

  it('VIEW-01/13, ROOM-09: two guests book the same public room; turning on maintenance keeps both NEW and reports pendingViewingCount = 2', async () => {
    const phone1 = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const phone2 = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );

    const first = await send(app, 'post', '/public/viewings', {
      roomId: created.roomA1, guestName: `[E2E ${e2e.runId}] Khách 1`, guestPhone: phone1,
      visitDate: tomorrow, timeSlot: 'MORNING',
    });
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ received: true });

    const second = await send(app, 'post', '/public/viewings', {
      roomId: created.roomA1, guestName: `[E2E ${e2e.runId}] Khách 2`, guestPhone: phone2,
      visitDate: tomorrow, timeSlot: 'AFTERNOON',
    });
    expect(second.status).toBe(201);

    const createdRows = await prisma.viewing.findMany({
      where: { roomId: created.roomA1, guestPhone: { in: [phone1, phone2] } },
      select: { id: true, guestPhone: true, status: true },
    });
    expect(createdRows).toHaveLength(2);
    for (const row of createdRows) {
      expect(row.status).toBe('NEW');
      e2e.record('viewings', row.id);
    }
    viewing1Id = createdRows.find((r) => r.guestPhone === phone1)!.id;
    viewing2Id = createdRows.find((r) => r.guestPhone === phone2)!.id;

    const maintenance = await send(app, 'patch', `/rooms/${created.roomA1}`, { underMaintenance: true }, managerSession);
    expect(maintenance.status).toBe(200);
    expect(maintenance.body.data.underMaintenance).toBe(true);
    expect(maintenance.body.data.pendingViewingCount).toBe(2);

    const stillNewAfterMaintenance = await prisma.viewing.count({
      where: { id: { in: [viewing1Id, viewing2Id] }, status: 'NEW' },
    });
    expect(stillNewAfterMaintenance).toBe(2);
  });

  it('VIEW-13: locking the room keeps both viewings NEW, repeats pendingViewingCount = 2, and the room 404s from the public side', async () => {
    const lock = await send(app, 'patch', `/rooms/${created.roomA1}`, { isActive: false }, managerSession);
    expect(lock.status).toBe(200);
    expect(lock.body.data.isActive).toBe(false);
    expect(lock.body.data.pendingViewingCount).toBe(2);

    const stillNewAfterLock = await prisma.viewing.count({
      where: { id: { in: [viewing1Id, viewing2Id] }, status: 'NEW' },
    });
    expect(stillNewAfterLock).toBe(2);

    const publicDetail = await send(app, 'get', `/public/rooms/${created.roomA1}`);
    expect(publicDetail.status).toBe(404);
    expect(publicDetail.body.error.code).toBe('NOT_FOUND');
  });

  it('VIEW-13/BLD-06 (Q-P6-1 = B): locking the building unassigns the manager but keeps the two viewings NEW', async () => {
    const lockBuilding = await send(app, 'patch', `/buildings/${created.buildingAId}`, { isActive: false }, boss);
    expect(lockBuilding.status).toBe(200);
    expect(lockBuilding.body.data.isActive).toBe(false);
    expect(lockBuilding.body.data.managerId).toBeNull();

    const stillNewAfterBuildingLock = await prisma.viewing.count({
      where: { id: { in: [viewing1Id, viewing2Id] }, status: 'NEW' },
    });
    expect(stillNewAfterBuildingLock).toBe(2);
  });

  it('VIEW-07/SCOPE-04 (Q-P6-2 = A): Boss dashboard scoped to the locked building sees exactly the 2 NEW viewings, in slot order', async () => {
    const dashboard = await send(app, 'get', `/dashboard?buildingId=${created.buildingAId}`, undefined, boss);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.newViewings.count).toBe(2);
    expect(dashboard.body.data.newViewings.items.map((v: { id: number }) => v.id)).toEqual([viewing1Id, viewing2Id]);
  });

  it('SCOPE-02/API-08: the former manager loses the locked building from scope; Boss still reaches it', async () => {
    const managerAttempt = await send(
      app, 'get', `/viewings?buildingId=${created.buildingAId}`, undefined, managerSession,
    );
    expect(managerAttempt.status).toBe(403);
    expect(managerAttempt.body.error.code).toBe('OUT_OF_SCOPE');

    const bossView = await send(app, 'get', `/viewings?buildingId=${created.buildingAId}`, undefined, boss);
    expect(bossView.status).toBe(200);
    expect(bossView.body.data.map((v: { id: number }) => v.id).sort((a: number, b: number) => a - b))
      .toEqual([viewing1Id, viewing2Id].sort((a, b) => a - b));
  });

  it('VIEW-13/Q-P6-3 = A: Boss cancels a viewing of the locked building without an outcomeNote', async () => {
    const cancel = await send(app, 'patch', `/viewings/${viewing1Id}`, { status: 'CANCELLED' }, boss);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    expect(cancel.body.data.outcomeNote).toBeNull();
    expect(cancel.body.data.handledById).toBe(bossId);
  });

  it('VIEW-03/Q-P6-1 = B: Boss creates a manual viewing for an active room of the locked building; the former manager cannot', async () => {
    const bossPhone = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const bossCreate = await send(app, 'post', '/viewings', {
      roomId: created.roomA2, guestName: `[E2E ${e2e.runId}] Khách thủ công`, guestPhone: bossPhone,
      visitDate: tomorrow, timeSlot: 'EVENING',
    }, boss);
    expect(bossCreate.status).toBe(201);
    expect(bossCreate.body.data.source).toBe('MANUAL');
    expect(bossCreate.body.data.handledById).toBe(bossId);
    e2e.record('viewings', bossCreate.body.data.id as number);

    const managerPhone = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const managerAttempt = await send(app, 'post', '/viewings', {
      roomId: created.roomA2, guestName: `[E2E ${e2e.runId}] Khách bị chặn`, guestPhone: managerPhone,
      visitDate: tomorrow, timeSlot: 'EVENING',
    }, managerSession);
    expect(managerAttempt.status).toBe(403);
    expect(managerAttempt.body.error.code).toBe('OUT_OF_SCOPE');
  });

  it('VIEW-11: pg_advisory_xact_lock lets only one of two parallel bookings through once a phone already has 2 WEB viewings today', async () => {
    const phone3 = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    // Two existing WEB/NEW viewings are seeded directly (bypassing the public HTTP route, which is
    // also IP-rate-limited at 5/hour, A-03): VIEW-11 is about the DB lock, not about reaching it by HTTP.
    const seeded = await prisma.viewing.createMany({
      data: Array.from({ length: 2 }, () => ({
        roomId: created.roomB1,
        guestName: `[E2E ${e2e.runId}] Khách lặp lại`,
        guestPhone: phone3,
        visitDate: new Date(`${tomorrow}T00:00:00.000Z`),
        timeSlot: 'MORNING' as const,
        note: null,
        source: 'WEB' as const,
        status: 'NEW' as const,
      })),
    });
    expect(seeded.count).toBe(2);

    const fire = () => send(app, 'post', '/public/viewings', {
      roomId: created.roomB1, guestName: `[E2E ${e2e.runId}] Khách song song`, guestPhone: phone3,
      visitDate: tomorrow, timeSlot: 'AFTERNOON',
    });
    const [resultA, resultB] = await Promise.all([fire(), fire()]);
    const statuses = [resultA.status, resultB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 429]);
    const blocked = resultA.status === 429 ? resultA : resultB;
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');

    const rows = await prisma.viewing.findMany({
      where: { guestPhone: phone3, source: 'WEB' }, select: { id: true, status: true },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.status === 'NEW')).toBe(true);
    for (const row of rows) e2e.record('viewings', row.id);
  });

  it('BE-P2-09: the run log holds no secrets', () => {
    const serialized = JSON.stringify(e2e.log);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain(boss.token);
    expect(serialized).not.toContain(boss.cookie);
    expect(serialized).not.toContain(managerSession.token);
    expect(serialized).not.toContain(managerSession.cookie);
  });
});
