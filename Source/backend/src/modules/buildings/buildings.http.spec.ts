import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

// Only the Prisma database edge is fake; Nest guards, validation, controller, service,
// error filter, response interceptor, and real JWT signing/verifying remain active.
describe('BE-P2-11 · buildings HTTP', () => {
  let app: INestApplication;
  let tokens: TokenService;
  const records = new Map<number, any>();
  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const auditLog = { create: vi.fn(async ({ data }: any) => data) };
  const contracts: Array<{ buildingId: number; status: string }> = [];
  const viewingRows: Array<{ status: string; room: { buildingId: number } }> = [];
  const matchesBuildingWhere = (building: any, where: any) =>
    (where.managerId === undefined || building.managerId === where.managerId)
    && (where.id?.in === undefined || where.id.in.includes(building.id))
    && (where.isActive === undefined || building.isActive === where.isActive);
  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) => [...records.values()].filter((b) => matchesBuildingWhere(b, where))),
      count: vi.fn(async ({ where }: any) => [...records.values()].filter((b) => matchesBuildingWhere(b, where) && (where.id?.not === undefined || b.id !== where.id.not)).length),
      findUnique: vi.fn(async ({ where }: any) => records.get(where.id) ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: 10 + records.size, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date(), manager: data.managerId ? users.get(data.managerId) : null }; records.set(row.id, row); return row; }),
      update: vi.fn(async ({ where, data }: any) => { const row = records.get(where.id); Object.assign(row, data); return row; }),
      updateMany: vi.fn(async ({ where, data }: any) => { const row = records.get(where.id); if (!row || row.isActive !== where.isActive) return { count: 0 }; Object.assign(row, data, { manager: users.get(data.managerId !== undefined ? data.managerId : row.managerId) ?? null }); return { count: 1 }; }),
    },
    contract: { count: vi.fn(async ({ where }: any) => contracts.filter((c) => c.buildingId === where.buildingId && where.status.in.includes(c.status)).length) },
    viewing: { findMany: vi.fn(async ({ where }: any) => viewingRows.filter((viewing) => where.status.in.includes(viewing.status) && where.room.buildingId.in.includes(viewing.room.buildingId))) },
    auditLog,
    $transaction: vi.fn(async (callback: any) => callback({
      $queryRaw: vi.fn(async () => []), user: fakePrisma.user, building: fakePrisma.building,
      auditLog, contract: fakePrisma.contract, viewing: fakePrisma.viewing,
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
  beforeEach(() => { records.clear(); contracts.length = 0; viewingRows.length = 0; auditLog.create.mockClear(); });
  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('BLD-01, API-01/02: Boss POST returns 201 and one data envelope with uppercased code and defaults', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/buildings').set('Authorization', await auth(1, 'BOSS')).send({ code: 'hn01', name: 'Tòa 1', address: 'Phố A', district: 'Ba Đình', ward: 'Phúc Xá', waterMode: 'PER_M3' }).expect(201);
    expect(response.body.data).toMatchObject({ code: 'HN01', dueDays: 5, managerId: null, pendingViewingCount: 0 });
    expect(response.body.data).not.toHaveProperty('password');
  });
  it('API-02, BLD-07: list response has page metadata and an empty out-of-range page', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/buildings?page=2&limit=1').set('Authorization', await auth(1, 'BOSS')).expect(200);
    expect(response.body).toEqual({ data: [], meta: { page: 2, limit: 1, total: 0 } });
  });
  it('API-02, BLD-07: Boss list returns a building and its nonzero total', async () => {
    records.set(10, { id: 10, code: 'HN01', name: 'Tòa 1', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: null, manager: null, amenities: [], description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() });

    const response = await request(app.getHttpServer()).get('/api/v1/buildings?page=1&limit=1').set('Authorization', await auth(1, 'BOSS')).expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ id: 10, code: 'HN01' });
    expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 1 });
  });
  it('SCOPE-01, API-04: guest is unauthenticated and tenant is forbidden from building list', async () => {
    await request(app.getHttpServer()).get('/api/v1/buildings').expect(401);
    const response = await request(app.getHttpServer()).get('/api/v1/buildings').set('Authorization', await auth(3, 'TENANT')).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
  it('BLD-01/02, API-04: unknown manager body fields fail validation while Boss receives 400', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/buildings').set('Authorization', await auth(1, 'BOSS')).send({ code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', unexpected: true }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(records.size).toBe(0);
  });
  it.each([
    ['buildings_code_key', 'buildings_code_key'],
    ["['code']", ['code']],
  ] as const)('BLD-06, API-04: duplicate building code target %s returns the validation API contract', async (_label, target) => {
    fakePrisma.building.create.mockRejectedValueOnce({
      code: 'P2002',
      meta: { target },
      message: 'duplicate key value violates unique constraint',
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/buildings')
      .set('Authorization', await auth(1, 'BOSS'))
      .send({ code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3' })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: expect.any(String),
        fields: { code: 'Mã tòa đã được sử dụng' },
      },
    });
    expect(records.size).toBe(0);
  });
  it('BLD-02, SCOPE-02: manager sees only assigned active buildings and cannot change address', async () => {
    records.set(10, { id: 10, code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: 2, manager: users.get(2), amenities: [], description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() });
    const denied = await request(app.getHttpServer()).patch('/api/v1/buildings/10').set('Authorization', await auth(2, 'MANAGER')).send({ address: 'B' }).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(records.get(10).address).toBe('A');
  });

  it('BLD-06, VIEW-13: Boss locks through PATCH, response preserves pending viewing count and audit', async () => {
    records.set(10, { id: 10, code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: 2, manager: users.get(2), amenities: [], description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() });
    viewingRows.push({ status: 'NEW', room: { buildingId: 10 } }, { status: 'CONFIRMED', room: { buildingId: 10 } }, { status: 'WON', room: { buildingId: 10 } });
    const response = await request(app.getHttpServer()).patch('/api/v1/buildings/10').set('Authorization', await auth(1, 'BOSS')).send({ isActive: false }).expect(200);
    expect(response.body.data).toMatchObject({ isActive: false, managerId: null, pendingViewingCount: 2 });
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'building.manager_change', before: { managerId: 2 }, after: { managerId: null }, actorId: 1 }) }));
  });

  it('BLD-06: HOLD and ACTIVE contracts reject lock without partial updates or audit', async () => {
    for (const status of ['HOLD', 'ACTIVE']) {
      records.set(10, { id: 10, code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: null, manager: null, amenities: [], description: null, isActive: true, createdAt: new Date(), updatedAt: new Date() });
      contracts.push({ buildingId: 10, status });
      const response = await request(app.getHttpServer()).patch('/api/v1/buildings/10').set('Authorization', await auth(1, 'BOSS')).send({ isActive: false }).expect(409);
      expect(response.body.error.code).toBe('CONFLICT_STATE');
      expect(records.get(10).isActive).toBe(true);
      expect(auditLog.create).not.toHaveBeenCalled();
      contracts.pop();
      records.clear();
    }
  });

  it('BLD-06, D-P23-2: unlock and assign manager in one PATCH; active manager appears in result', async () => {
    records.set(10, { id: 10, code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: null, manager: null, amenities: [], description: null, isActive: false, createdAt: new Date(), updatedAt: new Date() });
    const response = await request(app.getHttpServer()).patch('/api/v1/buildings/10').set('Authorization', await auth(1, 'BOSS')).send({ isActive: true, managerId: 2 }).expect(200);
    expect(response.body.data).toMatchObject({ isActive: true, managerId: 2, manager: { id: 2 } });
    expect(records.get(10)).toMatchObject({ isActive: true, managerId: 2 });
  });

  it('BLD-07, SCOPE-02: Boss can include a locked building while manager scope never lists it', async () => {
    records.set(10, { id: 10, code: 'HN01', name: 'Tòa', address: 'A', district: 'B', ward: 'C', waterMode: 'PER_M3', dueDays: 5, managerId: 2, manager: users.get(2), amenities: [], description: null, isActive: false, createdAt: new Date(), updatedAt: new Date() });
    const bossResponse = await request(app.getHttpServer()).get('/api/v1/buildings?includeInactive=true').set('Authorization', await auth(1, 'BOSS')).expect(200);
    expect(bossResponse.body.data).toHaveLength(1);
    const managerResponse = await request(app.getHttpServer()).get('/api/v1/buildings').set('Authorization', await auth(2, 'MANAGER')).expect(200);
    expect(managerResponse.body.data).toEqual([]);
  });
});
