// BE-P2-28 / P2-5: real database coverage for room-price proposal/approval/sync.
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
import { RoomPriceSyncJob } from '../src/jobs/room-price-sync.job.js';
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
const yesterday = formatDateOnly(addDays(todayHanoi(), -1));

const created = {
  managerId: 0,
  buildingId: 0,
  code: '',
  roomA: 0,
  roomB: 0,
  roomC: 0,
  latestRoomAProposal: 0,
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

// CP-2 only: the shared `send` helper has no header hook, and these tests are the only ones in this
// file that need a custom header (Idempotency-Key), so this is a thin addition, not a modification.
function sendWithKey(app: INestApplication, path: string, body: object, session: Session, key: string) {
  return request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .set('Authorization', `Bearer ${session.token}`)
    .set('Cookie', `rt=${session.cookie}`)
    .set('Idempotency-Key', key)
    .send(body);
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

describe('BE-P2-28: Room price proposal, approval and sync against real Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let boss: Session;
  let bossId: number;
  let managerSession: Session;
  let roomPriceCId: number;
  let pendingRoomAProposalId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Load the canonical dev credentials from the seed without resetting any account or data.
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
    } catch (error) {
      e2e.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app.close();
    }
  });

  it('fixtures: manager, building and rooms A/B/C start with rooms.price null', async () => {
    const managerPhone = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const createdManager = await send(app, 'post', '/managers', {
      phone: managerPhone,
      fullName: `[E2E ${e2e.runId}] Pricing manager`,
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
    // change-password returns no new token (BE-LOGIN-17); the already-issued access token keeps working.
    managerSession = tempSession;

    const code = await uniqueBuildingCode(
      async (candidate) => (await prisma.building.findUnique({ where: { code: candidate }, select: { id: true } })) !== null,
    );
    const building = await send(app, 'post', '/buildings', {
      code,
      name: `[E2E ${e2e.runId}] Pricing building`,
      address: '12 Đường thử nghiệm',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      waterMode: 'PER_M3',
      managerId: created.managerId,
    }, boss);
    expect(building.status).toBe(201);
    created.buildingId = building.body.data.id as number;
    created.code = code;
    e2e.record('buildings', created.buildingId);
    e2e.recordBuildingCode(code);

    const roomIds: number[] = [];
    for (const letter of ['A', 'B', 'C']) {
      const room = await send(app, 'post', '/rooms', {
        buildingId: created.buildingId,
        code: letter,
        floor: 1,
        areaM2: 20,
      }, managerSession);
      expect(room.status).toBe(201);
      expect(room.body.data.price).toBeNull();
      roomIds.push(room.body.data.id as number);
      e2e.record('rooms', room.body.data.id as number);
    }
    [created.roomA, created.roomB, created.roomC] = roomIds;

    const list = await send(app, 'get', `/rooms?buildingId=${created.buildingId}`, undefined, managerSession);
    expect(list.status).toBe(200);
    for (const row of list.body.data as Array<{ id: number; price: number | null }>) {
      expect(row.price).toBeNull();
    }
  });

  it('PRC-01, PRC-02: manager proposes a room price; the public price (rooms.price) does not change yet', async () => {
    const first = await send(app, 'post', '/room-prices', {
      roomId: created.roomA,
      price: 3_000_000,
      effectiveFrom: today,
    }, managerSession);
    expect(first.status).toBe(201);
    e2e.record('room_prices', first.body.data.id as number);
    expect(first.body.data).toMatchObject({
      roomId: created.roomA,
      price: 3_000_000,
      effectiveFrom: today,
      status: 'PENDING',
      expired: false,
      comparison: { oldValue: null, newValue: 3_000_000, changePercent: null, label: 'Giá mới' },
    });

    const roomAfterFirst = await prisma.room.findUnique({ where: { id: created.roomA }, select: { price: true } });
    expect(roomAfterFirst?.price).toBeNull();
    const listAfterFirst = await send(app, 'get', `/rooms?buildingId=${created.buildingId}`, undefined, managerSession);
    expect(listAfterFirst.body.data.find((row: { id: number }) => row.id === created.roomA).price).toBeNull();

    // PRC-02: a second proposal for the same room supersedes the pending one in the same transaction.
    const second = await send(app, 'post', '/room-prices', {
      roomId: created.roomA,
      price: 3_200_000,
      effectiveFrom: today,
    }, managerSession);
    expect(second.status).toBe(201);
    e2e.record('room_prices', second.body.data.id as number);
    expect(second.body.data.status).toBe('PENDING');

    const pendingList = await send(app, 'get', `/room-prices?roomId=${created.roomA}&status=PENDING`, undefined, managerSession);
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.meta.total).toBe(1);
    expect(pendingList.body.data[0].id).toBe(second.body.data.id);

    const supersededList = await send(app, 'get', `/room-prices?roomId=${created.roomA}&status=SUPERSEDED`, undefined, managerSession);
    expect(supersededList.body.data.map((row: { id: number }) => row.id)).toContain(first.body.data.id);

    created.latestRoomAProposal = second.body.data.id as number;
  });

  it('PRC-03, G-06: Boss approves a room price effective today; rooms.price changes in the same transaction', async () => {
    const approve = await send(app, 'post', `/room-prices/${created.latestRoomAProposal}/approve`, undefined, boss);
    expect(approve.status).toBe(201);
    expect(approve.body.data.status).toBe('APPROVED');
    expect(approve.body.data.reviewedById).toBe(bossId);

    const roomAfterApprove = await prisma.room.findUnique({ where: { id: created.roomA }, select: { price: true } });
    expect(roomAfterApprove?.price).toBe(3_200_000);

    // PRC-06: running the job right after an already-effective approval changes nothing.
    const job = app.get(RoomPriceSyncJob);
    const syncResult = await job.sync([created.roomA]);
    expect(syncResult.updated).toBe(0);
    expect(syncResult.unchanged).toBe(1);
    const roomAfterSync = await prisma.room.findUnique({ where: { id: created.roomA }, select: { price: true } });
    expect(roomAfterSync?.price).toBe(3_200_000);
  });

  it('PRC-06: a future-effective price is written only by the sync job, and a second run changes nothing', async () => {
    const job = app.get(RoomPriceSyncJob);

    // Boss proposes and it is approved immediately (PRC-04), but effectiveFrom is tomorrow: rooms.price stays null.
    const proposeB = await send(app, 'post', '/room-prices', {
      roomId: created.roomB,
      price: 4_000_000,
      effectiveFrom: tomorrow,
    }, boss);
    expect(proposeB.status).toBe(201);
    const roomPriceBId = proposeB.body.data.id as number;
    e2e.record('room_prices', roomPriceBId);
    expect(proposeB.body.data.status).toBe('APPROVED');

    const roomBBeforeSync = await prisma.room.findUnique({ where: { id: created.roomB }, select: { price: true } });
    expect(roomBBeforeSync?.price).toBeNull();

    const syncBeforeDue = await job.sync([created.roomB]);
    expect(syncBeforeDue.updated).toBe(0);
    expect(syncBeforeDue.withoutApprovedPrice).toBe(1);
    const roomBStillNull = await prisma.room.findUnique({ where: { id: created.roomB }, select: { price: true } });
    expect(roomBStillNull?.price).toBeNull();

    // A2: simulate the effective date arriving (no time travel in e2e) by moving effective_from to today.
    await prisma.roomPrice.update({ where: { id: roomPriceBId }, data: { effectiveFrom: new Date(`${today}T00:00:00.000Z`) } });

    const syncOnDue = await job.sync([created.roomB]);
    expect(syncOnDue.updated).toBe(1);
    const roomBAfterSync = await prisma.room.findUnique({ where: { id: created.roomB }, select: { price: true } });
    expect(roomBAfterSync?.price).toBe(4_000_000);

    const syncAgain = await job.sync([created.roomB]);
    expect(syncAgain.updated).toBe(0);
    expect(syncAgain.unchanged).toBe(1);
    const roomBUnchanged = await prisma.room.findUnique({ where: { id: created.roomB }, select: { price: true } });
    expect(roomBUnchanged?.price).toBe(4_000_000);

    // A5: boundary of the job itself — an empty filter scans nothing, and a room with no APPROVED price
    // is reported through withoutApprovedPrice rather than updated. [ASSUMPTION A5], see final report.
    const syncEmpty = await job.sync([]);
    expect(syncEmpty.scanned).toBe(0);
    expect(syncEmpty.updated).toBe(0);

    const syncRoomC = await job.sync([created.roomC]);
    expect(syncRoomC.updated).toBe(0);
    expect(syncRoomC.withoutApprovedPrice).toBe(1);
    const roomCStillNull = await prisma.room.findUnique({ where: { id: created.roomC }, select: { price: true } });
    expect(roomCStillNull?.price).toBeNull();
  });

  it('API-05, Q-P5-6: Idempotency-Key replay on POST /room-prices replays the same response; a different payload conflicts', async () => {
    const key = `e2e-${e2e.runId}-1`;
    const payload = { roomId: created.roomC, price: 2_500_000, effectiveFrom: today };

    const first = await sendWithKey(app, '/room-prices', payload, managerSession, key);
    expect(first.status).toBe(201);
    roomPriceCId = first.body.data.id as number;
    e2e.record('room_prices', roomPriceCId);
    expect(first.body.data.status).toBe('PENDING');

    // Same key, same payload: the stored response is replayed verbatim (same id, same createdAt), no second row.
    const replay = await sendWithKey(app, '/room-prices', payload, managerSession, key);
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(first.body.data);

    // Same key, different payload: 409 instead of silently creating or replaying the wrong thing.
    const conflicting = await sendWithKey(
      app, '/room-prices', { ...payload, price: 2_600_000 }, managerSession, key,
    );
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe('CONFLICT_STATE');

    const list = await send(app, 'get', `/room-prices?roomId=${created.roomC}`, undefined, managerSession);
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].id).toBe(roomPriceCId);
  });

  it('PRC-09: approving the same room price twice returns 409 CONFLICT_STATE and leaves rooms.price unchanged', async () => {
    const approve = await send(app, 'post', `/room-prices/${roomPriceCId}/approve`, undefined, boss);
    expect(approve.status).toBe(201);
    expect(approve.body.data.status).toBe('APPROVED');

    const roomCAfterApprove = await prisma.room.findUnique({ where: { id: created.roomC }, select: { price: true } });
    expect(roomCAfterApprove?.price).toBe(2_500_000);

    const approveAgain = await send(app, 'post', `/room-prices/${roomPriceCId}/approve`, undefined, boss);
    expect(approveAgain.status).toBe(409);
    expect(approveAgain.body.error.code).toBe('CONFLICT_STATE');

    const roomCAfterSecondApprove = await prisma.room.findUnique({ where: { id: created.roomC }, select: { price: true } });
    expect(roomCAfterSecondApprove?.price).toBe(2_500_000);
  });

  it('API-07: a manager cannot approve or reject a room price proposal', async () => {
    const propose = await send(app, 'post', '/room-prices', {
      roomId: created.roomA,
      price: 3_300_000,
      effectiveFrom: today,
    }, managerSession);
    expect(propose.status).toBe(201);
    pendingRoomAProposalId = propose.body.data.id as number;
    e2e.record('room_prices', pendingRoomAProposalId);
    expect(propose.body.data.status).toBe('PENDING');

    const approveAttempt = await send(
      app, 'post', `/room-prices/${pendingRoomAProposalId}/approve`, undefined, managerSession,
    );
    expect(approveAttempt.status).toBe(403);
    expect(approveAttempt.body.error.code).toBe('FORBIDDEN');

    const rejectAttempt = await send(app, 'post', `/room-prices/${pendingRoomAProposalId}/reject`, {
      reviewNote: '[E2E] manager must not be able to reject',
    }, managerSession);
    expect(rejectAttempt.status).toBe(403);
    expect(rejectAttempt.body.error.code).toBe('FORBIDDEN');

    const stillPending = await prisma.roomPrice.findUnique({
      where: { id: pendingRoomAProposalId }, select: { status: true },
    });
    expect(stillPending?.status).toBe('PENDING');
  });

  it('Q-P5-7, SCOPE-02: a manager cannot propose a price for a room that has been locked', async () => {
    const lock = await send(app, 'patch', `/rooms/${created.roomA}`, { isActive: false }, boss);
    expect(lock.status).toBe(200);
    expect(lock.body.data.isActive).toBe(false);

    const countBefore = await prisma.roomPrice.count({ where: { roomId: created.roomA } });

    const proposeOnLocked = await send(app, 'post', '/room-prices', {
      roomId: created.roomA,
      price: 3_400_000,
      effectiveFrom: today,
    }, managerSession);
    expect(proposeOnLocked.status).toBe(403);
    expect(proposeOnLocked.body.error.code).toBe('OUT_OF_SCOPE');

    const countAfter = await prisma.roomPrice.count({ where: { roomId: created.roomA } });
    expect(countAfter).toBe(countBefore);
  });

  it('PRC-01: a zero price or a past effectiveFrom is rejected with VALIDATION_FAILED and a Vietnamese field message', async () => {
    const zeroPrice = await send(app, 'post', '/room-prices', {
      roomId: created.roomC,
      price: 0,
      effectiveFrom: today,
    }, managerSession);
    expect(zeroPrice.status).toBe(400);
    expect(zeroPrice.body.error.code).toBe('VALIDATION_FAILED');
    expect(typeof zeroPrice.body.error.fields.price).toBe('string');
    expect(zeroPrice.body.error.fields.price.length).toBeGreaterThan(0);

    const pastDate = await send(app, 'post', '/room-prices', {
      roomId: created.roomC,
      price: 2_000_000,
      effectiveFrom: yesterday,
    }, managerSession);
    expect(pastDate.status).toBe(400);
    expect(pastDate.body.error.code).toBe('VALIDATION_FAILED');
    expect(typeof pastDate.body.error.fields.effectiveFrom).toBe('string');
    expect(pastDate.body.error.fields.effectiveFrom.length).toBeGreaterThan(0);

    // Neither invalid attempt left a new PENDING row for C (both roll back before the create).
    const countForC = await prisma.roomPrice.count({ where: { roomId: created.roomC, status: 'PENDING' } });
    expect(countForC).toBe(0);
  });

  it('BE-P2-09: the run log holds no secrets and lists every room price created during this run', () => {
    const serialized = JSON.stringify(e2e.log);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain(boss.token);
    expect(serialized).not.toContain(boss.cookie);
    expect(serialized).not.toContain(managerSession.token);
    expect(serialized).not.toContain(managerSession.cookie);

    expect(e2e.log.ids.room_prices).toEqual(
      expect.arrayContaining([roomPriceCId, pendingRoomAProposalId]),
    );
  });
});
