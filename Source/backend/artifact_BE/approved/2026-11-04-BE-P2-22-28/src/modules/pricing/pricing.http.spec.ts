import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

// CP-7 · BE-P2-28 · full gate, HTTP integration.
// This file closes the HTTP-level gaps the CP-1..6 tester files do not already cover (each is
// still a real HTTP round trip through AppModule: real guards, ValidationPipe, controller,
// service, error filter, response interceptor). Only PrismaService is mocked (the outside edge);
// the unit under test — PricingController/PricingService/DTOs/guards — is never mocked.
// Already covered elsewhere, not repeated here: GET /room-prices & GET /rate-plans pagination,
// sort, scope and PRC-10/12 shape (pricing.list.spec.ts); Idempotency-Key replay/409 on
// POST /room-prices and POST /room-prices/:id/approve (pricing-idempotency.spec.ts,
// pricing.review.spec.ts); locked-service SVC-04 branch alone on POST /rate-plans
// (pricing.rate-proposal.spec.ts); the Boss-self-approve PRC-04 flow (pricing.room-proposal.spec.ts).

describe('CP-7 · BE-P2-28 · pricing.http.spec.ts (full-gate HTTP integration)', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const buildings = new Map<number, any>([[10, { id: 10, managerId: 2, isActive: true }]]);
  const rooms = new Map<number, any>([[101, { id: 101, buildingId: 10, isActive: true, price: 2_000_000 }]]);
  // 201: active, same building as the plans under test; 202: locked, same building (SVC-04);
  // 203: active, but belongs to a *different* building (Q-P5-8 A "thuộc tòa khác").
  const services = new Map<number, any>([
    [201, { id: 201, buildingId: 10, isActive: true }],
    [202, { id: 202, buildingId: 10, isActive: false }],
    [203, { id: 203, buildingId: 20, isActive: true }],
  ]);
  let roomPriceRows: any[] = [];
  let ratePlanRows: any[] = [];
  let nextRoomPriceId = 1;
  let nextRatePlanId = 1;
  const auditCreate = vi.fn(async ({ data }: any) => ({ id: 1, ...data }));
  let idempotencyStore = new Map<string, any>();

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findUnique: vi.fn(async ({ where }: any) => {
        const b = buildings.get(where.id);
        return b ? { id: b.id, isActive: b.isActive } : null;
      }),
      findMany: vi.fn(async ({ where }: any) => [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive)),
    },
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = rooms.get(where.id);
        if (!r) return null;
        return { id: r.id, buildingId: r.buildingId, isActive: r.isActive, building: { isActive: buildings.get(r.buildingId)?.isActive ?? true } };
      }),
      update: vi.fn(async ({ where, data }: any) => { const r = rooms.get(where.id); if (r) Object.assign(r, data); return r; }),
    },
    service: {
      findUnique: vi.fn(async ({ where }: any) => {
        const s = services.get(where.id);
        return s ? { buildingId: s.buildingId, isActive: s.isActive } : null;
      }),
    },
    roomPrice: {
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        const r = rooms.get(row.roomId);
        return { ...row, room: r ? { buildingId: r.buildingId, isActive: r.isActive, building: { isActive: buildings.get(r.buildingId)?.isActive ?? true } } : undefined };
      }),
      findFirst: vi.fn(async () => null), // no prior APPROVED price in these fixtures (PRC-12 comparison lookup)
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.roomId !== undefined && row.roomId !== where.roomId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextRoomPriceId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data };
        roomPriceRows.push(row);
        return row;
      }),
    },
    ratePlan: {
      findUnique: vi.fn(async ({ where }: any) => ratePlanRows.find((r) => r.id === where.id) ?? null),
      findFirst: vi.fn(async () => null), // no prior APPROVED plan in these fixtures (RATE-04 comparison lookup)
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = ratePlanRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.buildingId !== undefined && row.buildingId !== where.buildingId) return false;
          if (where.kind !== undefined && row.kind !== where.kind) return false;
          if (where.serviceId !== undefined && row.serviceId !== where.serviceId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const tiers = (data.tiers?.create ?? []).map((t: any, i: number) => ({ id: i + 1, ...t }));
        const row = { id: nextRatePlanId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data, tiers };
        ratePlanRows.push(row);
        return row;
      }),
    },
    auditLog: { create: auditCreate },
    pricingIdempotencyKey: {
      findUnique: vi.fn(async ({ where }: any) => {
        const k = where.actorId_route_key;
        return idempotencyStore.get(`${k.actorId}|${k.route}|${k.key}`) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => { idempotencyStore.set(`${data.actorId}|${data.route}|${data.key}`, { ...data }); return data; }),
      delete: vi.fn(async ({ where }: any) => { const k = where.actorId_route_key; idempotencyStore.delete(`${k.actorId}|${k.route}|${k.key}`); }),
    },
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: fakePrisma.$queryRaw, room: fakePrisma.room, building: fakePrisma.building, service: fakePrisma.service,
      roomPrice: fakePrisma.roomPrice, ratePlan: fakePrisma.ratePlan, auditLog: fakePrisma.auditLog,
      pricingIdempotencyKey: fakePrisma.pricingIdempotencyKey,
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
    ratePlanRows = [];
    nextRoomPriceId = 1;
    nextRatePlanId = 1;
    idempotencyStore = new Map();
    auditCreate.mockClear();
    services.set(201, { id: 201, buildingId: 10, isActive: true }); // reset after the Q-P5-9 round trip locks it
    rooms.set(101, { id: 101, buildingId: 10, isActive: true, price: 2_000_000 });
  });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }
  const today = () => formatDateOnly(todayHanoi());
  const serviceBody = (serviceId: number) => ({
    buildingId: 10, kind: 'SERVICE', serviceId, effectiveFrom: today(),
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 50_000 }],
  });

  // ---------------------------------------------------------------------------
  // [SVC-04, Q-P5-8 A] all three serviceId failure causes, through the full HTTP stack.
  // ---------------------------------------------------------------------------
  describe('[SVC-04,Q-P5-8 A] POST /rate-plans serviceId failure branches are indistinguishable over HTTP', () => {
    it.each([
      ['does not exist', 999_999],
      ['belongs to a different building', 203],
      ['is locked (is_active=false) in the same building', 202],
    ])('serviceId %s → 400 VALIDATION_FAILED field serviceId, never 404/403', async (_label, serviceId) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS')).send(serviceBody(serviceId as number));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.fields.serviceId).toBeTruthy();
      expect(Object.keys(response.body.error.fields)).toEqual(['serviceId']);
      expect(ratePlanRows).toHaveLength(0);
    });

    it('all three branches return the exact same error field message (no existence leak between them)', async () => {
      const [notExist, otherBuilding, locked] = await Promise.all([
        request(app.getHttpServer()).post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS')).send(serviceBody(999_999)),
        request(app.getHttpServer()).post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS')).send(serviceBody(203)),
        request(app.getHttpServer()).post('/api/v1/rate-plans').set('Authorization', await auth(1, 'BOSS')).send(serviceBody(202)),
      ]);
      expect(notExist.status).toBe(400);
      expect(otherBuilding.status).toBe(400);
      expect(locked.status).toBe(400);
      expect(notExist.body.error.fields.serviceId).toBe(otherBuilding.body.error.fields.serviceId);
      expect(otherBuilding.body.error.fields.serviceId).toBe(locked.body.error.fields.serviceId);
      // API-03/API-04: the standard error envelope shape, never a raw DB/Prisma message.
      expect(notExist.body).toEqual({
        error: { code: 'VALIDATION_FAILED', message: expect.any(String), fields: { serviceId: expect.any(String) } },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [Q-P5-9 A] a service can be locked *between* a manager's propose and the Boss's approve;
  // the approve must still succeed, end to end, over real HTTP.
  // ---------------------------------------------------------------------------
  it('[Q-P5-9 A] manager proposes a SERVICE plan while the service is active; it is then locked; Boss still approves it to 200/201 APPROVED', async () => {
    const proposeResponse = await request(app.getHttpServer())
      .post('/api/v1/rate-plans').set('Authorization', await auth(2, 'MANAGER')).send(serviceBody(201));
    expect(proposeResponse.status).toBe(201);
    expect(proposeResponse.body.data).toMatchObject({ status: 'PENDING', serviceId: 201 });
    const planId = proposeResponse.body.data.id;

    services.set(201, { id: 201, buildingId: 10, isActive: false }); // owner locks the service after the proposal

    const approveResponse = await request(app.getHttpServer())
      .post(`/api/v1/rate-plans/${planId}/approve`).set('Authorization', await auth(1, 'BOSS'));
    expect(approveResponse.status).toBe(201);
    expect(approveResponse.body.data).toMatchObject({ status: 'APPROVED', serviceId: 201, reviewedById: 1 });
    expect(ratePlanRows.find((r) => r.id === planId)?.status).toBe('APPROVED');
  });

  // ---------------------------------------------------------------------------
  // [Q-P5-6 B] Idempotency-Key over HTTP on routes not already covered elsewhere: propose a rate
  // plan, and approve a rate plan — both must replay on an identical payload and 409 on a
  // different one, scoped by (actorId, route, key) so the key alone is not enough.
  // ---------------------------------------------------------------------------
  describe('[Q-P5-6 B] Idempotency-Key over HTTP on POST /rate-plans and POST /rate-plans/:id/approve', () => {
    it('same key + same body on POST /rate-plans replays the first response and creates only one rate_plan row', async () => {
      const boss1 = await auth(1, 'BOSS');
      const body = serviceBody(201);
      const first = await request(app.getHttpServer())
        .post('/api/v1/rate-plans').set('Authorization', boss1).set('Idempotency-Key', 'RATE-PLAN-1').send(body);
      const second = await request(app.getHttpServer())
        .post('/api/v1/rate-plans').set('Authorization', boss1).set('Idempotency-Key', 'RATE-PLAN-1').send(body);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(ratePlanRows).toHaveLength(1);
      // Boss self-approve (PRC-04) writes 2 audit rows (propose + approve) on the first call only;
      // the replayed second call must not write any more.
      expect(auditCreate).toHaveBeenCalledTimes(2);
    });

    it('same key + a different body on POST /rate-plans is 409 CONFLICT_STATE and creates no second row', async () => {
      const boss1 = await auth(1, 'BOSS');
      const first = await request(app.getHttpServer())
        .post('/api/v1/rate-plans').set('Authorization', boss1).set('Idempotency-Key', 'RATE-PLAN-2').send(serviceBody(201));
      expect(first.status).toBe(201);
      const second = await request(app.getHttpServer())
        .post('/api/v1/rate-plans').set('Authorization', boss1).set('Idempotency-Key', 'RATE-PLAN-2')
        .send({ ...serviceBody(201), reason: 'different payload, same key' });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CONFLICT_STATE');
      expect(ratePlanRows).toHaveLength(1);
    });

    it('same key approving two different plan ids is 409 CONFLICT_STATE on the second (request hash includes the path id)', async () => {
      ratePlanRows = [
        { id: 1, buildingId: 10, kind: 'ELECTRIC', serviceId: null, effectiveFrom: todayHanoi(), status: 'PENDING', proposedById: 2, reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [] },
        { id: 2, buildingId: 10, kind: 'WATER', serviceId: null, effectiveFrom: todayHanoi(), status: 'PENDING', proposedById: 2, reason: null, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), tiers: [] },
      ];
      const boss1 = await auth(1, 'BOSS');
      const first = await request(app.getHttpServer())
        .post('/api/v1/rate-plans/1/approve').set('Authorization', boss1).set('Idempotency-Key', 'APPROVE-SAME-KEY');
      expect(first.status).toBe(201);
      expect(first.body.data).toMatchObject({ id: 1, status: 'APPROVED' });
      const second = await request(app.getHttpServer())
        .post('/api/v1/rate-plans/2/approve').set('Authorization', boss1).set('Idempotency-Key', 'APPROVE-SAME-KEY');
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('CONFLICT_STATE');
      expect(ratePlanRows.find((r) => r.id === 2)?.status).toBe('PENDING'); // never approved
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant is forbidden on every one of the module's eight routes (API-07), through real HTTP.
  // ---------------------------------------------------------------------------
  describe('API-07: a tenant is 403 FORBIDDEN on every pricing route over HTTP', () => {
    it.each([
      ['GET', '/api/v1/room-prices', undefined],
      ['GET', '/api/v1/rate-plans', undefined],
      ['POST', '/api/v1/room-prices', { roomId: 101, price: 2_500_000, effectiveFrom: today() }],
      ['POST', '/api/v1/rate-plans', serviceBody(201)],
      ['POST', '/api/v1/room-prices/1/approve', undefined],
      ['POST', '/api/v1/room-prices/1/reject', { reviewNote: 'không hợp lệ' }],
      ['POST', '/api/v1/rate-plans/1/approve', undefined],
      ['POST', '/api/v1/rate-plans/1/reject', { reviewNote: 'không hợp lệ' }],
    ] as const)('%s %s → 403 FORBIDDEN', async (method, path, body) => {
      const req = request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post'](path).set('Authorization', await auth(3, 'TENANT'));
      const response = body === undefined ? await req : await req.send(body);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
