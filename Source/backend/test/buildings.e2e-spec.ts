// D2-14 / BE-P2-09: real database coverage. Run only after approval and apply;
// vitest.config.e2e.ts intentionally excludes pending drafts.
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
import { cleanupRun, E2eRun, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';

if (existsSync('.env')) process.loadEnvFile('.env');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type DevAccount = { key: string; phone: string; password: string; role: string };
type Session = { token: string; cookie: string };
type ApiResponse = request.Response;

const e2e = new E2eRun();
const created = {
  managerId: 0,
  buildingIds: [] as number[],
  serviceIds: [] as number[],
  codes: [] as string[],
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

describe('D2-14, BE-P2-09: Buildings and manager API against real Prisma', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let boss: Session;
  let managerSession: Session | undefined;
  let managerPhone = '';
  let managerTemporaryPassword = '';
  let buildingCodes: string[] = [];

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
  });

  afterAll(async () => {
    if (!app) return;
    try {
      const skipped = await cleanupRun(prisma, e2e.log);
      expect(skipped, 'E2E-created rows must have no contract or invoice links').toEqual([]);
      e2e.finish('CLEANED');

      const remaining = await prisma.user.findMany({
        where: { id: { in: e2e.log.ids.users }, isActive: true },
        select: { id: true },
      });
      expect(remaining, 'cleanup must deactivate every logged E2E user').toEqual([]);
      const sessions = await prisma.session.findMany({
        where: { userId: { in: e2e.log.ids.users }, revokedAt: null },
        select: { id: true },
      });
      expect(sessions, 'cleanup must revoke sessions for every logged E2E user').toEqual([]);
    } catch (error) {
      e2e.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app.close();
    }
  });

  it('AUTH-08: Boss creates a one-time temporary password and forces the manager to change it', async () => {
    managerPhone = await uniquePhone(
      async (phone) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null,
    );
    const createdManager = await send(app, 'post', '/managers', {
      phone: managerPhone,
      fullName: `[E2E ${e2e.runId}] Manager`,
    }, boss);
    expect(createdManager.status).toBe(201);

    // Record a successful create before further assertions so afterAll can clean it on failure.
    created.managerId = createdManager.body.data.manager.id as number;
    e2e.record('users', created.managerId);
    managerTemporaryPassword = createdManager.body.data.temporaryPassword as string;
    expect(createdManager.body.data.manager).toMatchObject({
      id: created.managerId,
      phone: managerPhone,
      isActive: true,
      mustChangePassword: true,
    });
    expect(managerTemporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(createdManager.body.data.manager)).not.toContain('password');

    const login = await send(app, 'post', '/auth/login', {
      phone: managerPhone,
      password: managerTemporaryPassword,
    });
    expect(login.status).toBe(200);
    managerSession = sessionOf(login);
    const blocked = await send(app, 'get', '/buildings', undefined, managerSession);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await send(app, 'post', '/auth/change-password', {
      currentPassword: managerTemporaryPassword,
      newPassword: `E2e-${e2e.runId}-pw`,
    }, managerSession);
    expect(changed.status).toBe(200);
    managerTemporaryPassword = '';
  });

  it('BLD-01, BLD-03, API-01: creates isolated buildings and enforces the two-building assignment limit', async () => {
    const codes: string[] = [];
    for (let index = 0; index < 3; index++) {
      const code = await uniqueBuildingCode(
        async (candidate) => (await prisma.building.findUnique({ where: { code: candidate }, select: { id: true } })) !== null,
      );
      const body = {
        code,
        name: `[E2E ${e2e.runId}] Building ${index + 1}`,
        address: `${100 + index} Đường thử nghiệm`,
        district: 'Cầu Giấy',
        ward: 'Dịch Vọng',
        waterMode: 'PER_M3',
        ...(index < 2 ? { managerId: created.managerId } : {}),
      };
      const response = await send(app, 'post', '/buildings', body, boss);
      expect(response.status).toBe(201);

      const id = response.body.data.id as number;
      e2e.record('buildings', id);
      e2e.recordBuildingCode(code);
      created.buildingIds.push(id);
      codes.push(code);
      expect(response.body.data).toMatchObject({ code, managerId: index < 2 ? created.managerId : null, dueDays: 5 });
      expect(response.body.data).not.toHaveProperty('passwordHash');
    }
    buildingCodes = codes;

    const assignment = await send(app, 'patch', `/buildings/${created.buildingIds[2]}`, {
      managerId: created.managerId,
    }, boss);
    expect(assignment.status).toBe(409);
    expect(assignment.body.error.code).toBe('MANAGER_MAX_2_BUILDINGS');
    const persisted = await prisma.building.findUnique({ where: { id: created.buildingIds[2] } });
    expect(persisted?.managerId).toBeNull();
  });

  it('BLD-02, SCOPE-02, BLD-07: manager edits allowed fields only and sees only assigned active buildings', async () => {
    if (!managerSession) throw new Error('manager session was not created');
    const list = await send(app, 'get', '/buildings', undefined, managerSession);
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: { id: number }) => row.id).sort((left: number, right: number) => left - right))
      .toEqual(created.buildingIds.slice(0, 2).sort((left, right) => left - right));

    const allowed = await send(app, 'patch', `/buildings/${created.buildingIds[0]}`, {
      amenities: ['Thang máy', 'Camera'],
      description: 'Tòa E2E do quản lý cập nhật',
    }, managerSession);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.amenities).toEqual(['Thang máy', 'Camera']);
    expect(allowed.body.data.description).toBe('Tòa E2E do quản lý cập nhật');

    const forbidden = await send(app, 'patch', `/buildings/${created.buildingIds[0]}`, {
      address: 'Địa chỉ không được đổi',
    }, managerSession);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    const outOfScope = await send(app, 'patch', `/buildings/${created.buildingIds[2]}`, {
      amenities: ['Không được phép'],
    }, managerSession);
    expect(outOfScope.status).toBe(403);
    expect(outOfScope.body.error.code).toBe('OUT_OF_SCOPE');

    const serviceName = `[E2E ${e2e.runId}] Wifi`;
    const service = await send(app, 'post', '/services', {
      buildingId: created.buildingIds[0],
      name: serviceName,
      unit: 'ROOM',
    }, boss);
    expect(service.status).toBe(201);
    const serviceId = service.body.data.id as number;
    created.serviceIds.push(serviceId);
    e2e.record('services', serviceId);
    const serviceList = await send(app, 'get', `/services?buildingId=${created.buildingIds[0]}`, undefined, managerSession);
    expect(serviceList.status).toBe(200);
    expect(serviceList.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: serviceId, buildingId: created.buildingIds[0], name: serviceName, unit: 'ROOM' }),
    ]));
  });

  it('BLD-06, BLD-03: locking unassigns a building; unlocking and assigning can be one request', async () => {
    const locked = await send(app, 'patch', `/buildings/${created.buildingIds[0]}`, { isActive: false }, boss);
    expect(locked.status).toBe(200);
    expect(locked.body.data).toMatchObject({ isActive: false, managerId: null, pendingViewingCount: 0 });

    const reassign = await send(app, 'patch', `/buildings/${created.buildingIds[2]}`, {
      managerId: created.managerId,
    }, boss);
    expect(reassign.status).toBe(200);
    expect(reassign.body.data.managerId).toBe(created.managerId);

    const releaseCapacity = await send(app, 'patch', `/buildings/${created.buildingIds[1]}`, {
      isActive: false,
    }, boss);
    expect(releaseCapacity.status).toBe(200);
    expect(releaseCapacity.body.data.managerId).toBeNull();

    const unlockedAndAssigned = await send(app, 'patch', `/buildings/${created.buildingIds[0]}`, {
      isActive: true,
      managerId: created.managerId,
    }, boss);
    expect(unlockedAndAssigned.status).toBe(200);
    expect(unlockedAndAssigned.body.data).toMatchObject({ isActive: true, managerId: created.managerId });
    const lockedList = await send(app, 'get', '/buildings?includeInactive=true', undefined, boss);
    expect(lockedList.status).toBe(200);
    expect(lockedList.body.data.some((row: { id: number }) => row.id === created.buildingIds[0])).toBe(true);
  });

  it('AUTH-08, AUTH-T3: deactivation revokes refresh sessions and keeps building assignments', async () => {
    if (!managerSession) throw new Error('manager session was not created');
    const result = await send(app, 'patch', `/managers/${created.managerId}`, { isActive: false }, boss);
    expect(result.status).toBe(200);
    expect(result.body.data.isActive).toBe(false);
    expect(result.body.data.buildings.map((building: { id: number }) => building.id)
      .sort((left: number, right: number) => left - right))
      .toEqual([created.buildingIds[0], created.buildingIds[2]].sort((left, right) => left - right));

    const refresh = await send(app, 'post', '/auth/refresh', undefined, managerSession);
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('UNAUTHENTICATED');
    const persisted = await prisma.user.findUnique({ where: { id: created.managerId }, select: { isActive: true } });
    expect(persisted?.isActive).toBe(false);
    managerSession = undefined;
  });

  it('BE-P2-09: runner logs only created ids and never records credentials or tokens', () => {
    expect(e2e.log.status).toBe('RUNNING');
    expect(e2e.log.ids.users).toContain(created.managerId);
    expect(e2e.log.ids.buildings).toEqual(created.buildingIds);
    expect(e2e.log.ids.services).toEqual(created.serviceIds);
    expect(e2e.log.buildingCodes).toEqual(buildingCodes);
    const serialized = JSON.stringify(e2e.log);
    expect(serialized).not.toContain(managerPhone);
    expect(serialized).not.toContain(managerTemporaryPassword);
    expect(serialized).not.toContain(boss.token);
    expect(serialized).not.toContain(boss.cookie);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('cookie');
  });
});
