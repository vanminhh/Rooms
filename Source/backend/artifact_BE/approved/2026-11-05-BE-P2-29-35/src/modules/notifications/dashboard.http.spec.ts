import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

// CP-5 (BE-P2-33) · full-stack HTTP gate for GET /dashboard.
// Closes what DashboardService's unit tests (dashboard.service.spec.ts) cannot reach:
// JwtAuthGuard/RolesGuard (401/403), the DashboardQueryDto buildingId validation, and one real
// round trip through controller → service → error filter → { data } response interceptor.
// PrismaService is the only mocked edge (DB); nothing in the unit under test (guards, DTO,
// controller, service) is mocked. Modelled on viewings.http.spec.ts.

describe('CP-5 (BE-P2-33) · GET /dashboard HTTP contract (VIEW-07, SCOPE-04, PRC-11, API-08)', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  // Building 10: manager 2, active (in MANAGER(2)'s scope). Building 20: a different manager,
  // out of MANAGER(2)'s scope but still reachable by Boss.
  const buildings = new Map<number, any>([
    [10, { id: 10, managerId: 2, isActive: true }],
    [20, { id: 20, managerId: 99, isActive: true }],
  ]);
  const rooms = new Map<number, any>([
    [101, { id: 101, code: 'P101', buildingId: 10, buildingName: 'Tòa A' }],
    [201, { id: 201, code: 'P201', buildingId: 20, buildingName: 'Tòa B' }],
  ]);
  const viewingRows: any[] = [
    {
      id: 1,
      roomId: 101,
      status: 'NEW',
      visitDate: new Date(`${formatDateOnly(todayHanoi())}T00:00:00.000Z`),
      timeSlot: 'MORNING',
      guestName: 'Khách HTTP',
      guestPhone: '0912340099',
      note: null,
      source: 'WEB',
      handledById: null,
      outcomeNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  function roomInclude(roomId: number) {
    const r = rooms.get(roomId);
    return { code: r.code, buildingId: r.buildingId, building: { name: r.buildingName } };
  }

  function matchRoomWhere(roomWhere: any, roomId: number): boolean {
    const r = rooms.get(roomId);
    if (roomWhere?.buildingId !== undefined) {
      const bf = roomWhere.buildingId;
      if (bf && typeof bf === 'object' && 'in' in bf) {
        if (!bf.in.includes(r.buildingId)) return false;
      } else if (r.buildingId !== bf) return false;
    }
    if (roomWhere?.building !== undefined) {
      const bld = buildings.get(r.buildingId);
      if (!bld) return false;
      if (roomWhere.building.id !== undefined && bld.id !== roomWhere.building.id) return false;
    }
    return true;
  }

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) =>
        [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive),
      ),
    },
    viewing: {
      findMany: vi.fn(async ({ where, select }: any) => {
        const rows = viewingRows.filter(
          (r) => (where.status === undefined || r.status === where.status) && matchRoomWhere(where.room, r.roomId),
        );
        if (select) return rows.map((r) => ({ id: r.id, visitDate: r.visitDate, timeSlot: r.timeSlot }));
        return rows.map((r) => ({ ...r, room: roomInclude(r.roomId) }));
      }),
    },
    roomPrice: { count: vi.fn(async () => 0) },
    ratePlan: { count: vi.fn(async () => 0) },
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
  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('GET /dashboard without a token → 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /dashboard as TENANT → 403 FORBIDDEN', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Authorization', await auth(3, 'TENANT'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('VIEW-07/API-08: MANAGER → 200 { data: { newViewings: { count, items }, pendingPrices: null } }, sees only own building', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Authorization', await auth(2, 'MANAGER'));
    expect(res.status).toBe(200);
    expect(res.body.data.newViewings).toEqual({ count: 1, items: [expect.objectContaining({ id: 1, roomCode: 'P101' })] });
    expect(res.body.data.pendingPrices).toBeNull();
  });

  it('PRC-11: BOSS → 200 { data } with pendingPrices populated (not null) and newViewings present', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard').set('Authorization', await auth(1, 'BOSS'));
    expect(res.status).toBe(200);
    expect(res.body.data.pendingPrices).toEqual({ count: 0, rooms: 0, ratePlans: 0 });
    expect(res.body.data.newViewings).toHaveProperty('count');
    expect(res.body.data.newViewings).toHaveProperty('items');
  });

  it('SCOPE-02/API-08: MANAGER ?buildingId=<outside own scope> → 403 OUT_OF_SCOPE', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard?buildingId=20').set('Authorization', await auth(2, 'MANAGER'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OUT_OF_SCOPE');
  });

  it('MANAGER ?buildingId=<own building> → 200 (allowed)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard?buildingId=10').set('Authorization', await auth(2, 'MANAGER'));
    expect(res.status).toBe(200);
    expect(res.body.data.newViewings.count).toBe(1);
  });

  it('DashboardQueryDto: ?buildingId=abc → 400 VALIDATION_FAILED fields.buildingId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard?buildingId=abc').set('Authorization', await auth(1, 'BOSS'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.buildingId).toBeTruthy();
  });

  it('DashboardQueryDto: ?buildingId=0 → 400 VALIDATION_FAILED fields.buildingId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/dashboard?buildingId=0').set('Authorization', await auth(1, 'BOSS'));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.buildingId).toBeTruthy();
  });
});
