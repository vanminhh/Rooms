import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

// CP-4 (BE-P2-32) · full-stack HTTP gate for /viewings, /viewings/:id.
// Closes what the service-level unit tests (viewings.service.cp4.spec.ts) cannot reach:
// JwtAuthGuard/RolesGuard (401/403), ValidationPipe on ViewingIdParamsDto and UpdateViewingDto's
// MaxLength(500), and one real round trip through controller → service → error filter →
// response interceptor. PrismaService is the only mocked edge (DB); nothing in the unit under
// test (guards, DTOs, controller, service) is mocked.

describe('CP-4 (BE-P2-32) · /viewings HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;

  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const buildings = new Map<number, any>([
    [10, { id: 10, managerId: 2, isActive: true }],
    [20, { id: 20, managerId: 99, isActive: true }], // a different manager, out of MANAGER(2)'s scope
  ]);
  const rooms = new Map<number, any>([
    [101, { id: 101, code: 'P101', buildingId: 10, isActive: true, buildingName: 'Tòa A' }],
    [103, { id: 103, code: 'P103', buildingId: 20, isActive: true, buildingName: 'Tòa B' }],
  ]);
  let viewingRows: any[] = [];
  let nextId = 1;

  function roomInclude(roomId: number) {
    const r = rooms.get(roomId);
    return { code: r.code, buildingId: r.buildingId, building: { name: r.buildingName } };
  }

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) =>
        [...buildings.values()].filter((b) => b.managerId === where.managerId && b.isActive === where.isActive),
      ),
    },
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = rooms.get(where.id);
        return r ? { isActive: r.isActive, buildingId: r.buildingId } : null;
      }),
    },
    viewing: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextId++, note: null, outcomeNote: null, handledById: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        viewingRows.push(row);
        return { ...row, room: roomInclude(row.roomId) };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = viewingRows.find((r) => r.id === where.id);
        return row ? { ...row, room: roomInclude(row.roomId) } : null;
      }),
      findMany: vi.fn(async ({ where, skip, take }: any) => {
        let rows = viewingRows.filter((r) => matchWhere(r, where));
        if (skip !== undefined) rows = rows.slice(skip);
        if (take !== undefined) rows = rows.slice(0, take);
        return rows.map((row) => ({ ...row, room: roomInclude(row.roomId) }));
      }),
      count: vi.fn(async ({ where }: any) => viewingRows.filter((r) => matchWhere(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = viewingRows.filter((r) => r.id === where.id && r.status === where.status);
        matches.forEach((r) => Object.assign(r, data));
        return { count: matches.length };
      }),
    },
  };

  function matchWhere(row: any, where: any): boolean {
    if (where.room?.buildingId !== undefined) {
      const bf = where.room.buildingId;
      const rbId = rooms.get(row.roomId).buildingId;
      if (bf && typeof bf === 'object' && 'in' in bf) {
        if (!bf.in.includes(rbId)) return false;
      } else if (rbId !== bf) return false;
    }
    if (where.status !== undefined && row.status !== where.status) return false;
    return true;
  }

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
  beforeEach(() => {
    viewingRows = [];
    nextId = 1;
  });

  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }
  const TOMORROW = formatDateOnly(addDays(todayHanoi(), 1));

  describe('Quyền: no token → 401; TENANT → 403 FORBIDDEN on every route', () => {
    it.each([
      ['GET', '/api/v1/viewings', undefined],
      ['POST', '/api/v1/viewings', { roomId: 101, guestName: 'A', guestPhone: '0912340001', visitDate: TOMORROW, timeSlot: 'MORNING' }],
      ['PATCH', '/api/v1/viewings/1', { status: 'CONFIRMED' }],
    ] as const)('%s %s without a token → 401 UNAUTHENTICATED', async (method, path, body) => {
      const req = request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post' | 'patch'](path);
      const res = body === undefined ? await req : await req.send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it.each([
      ['GET', '/api/v1/viewings', undefined],
      ['POST', '/api/v1/viewings', { roomId: 101, guestName: 'A', guestPhone: '0912340002', visitDate: TOMORROW, timeSlot: 'MORNING' }],
      ['PATCH', '/api/v1/viewings/1', { status: 'CONFIRMED' }],
    ] as const)('%s %s as TENANT → 403 FORBIDDEN', async (method, path, body) => {
      const req = request(app.getHttpServer())[method.toLowerCase() as 'get' | 'post' | 'patch'](path).set('Authorization', await auth(3, 'TENANT'));
      const res = body === undefined ? await req : await req.send(body);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('[ASSUMPTION 13] ViewingIdParamsDto boundary on PATCH /viewings/:id', () => {
    it.each([
      ['abc', 'non-numeric id'],
      ['0', 'id below the minimum'],
      ['2147483648', 'id above int32 max'],
    ])('PATCH /viewings/%s → 400 VALIDATION_FAILED fields.id', async (id) => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/viewings/${id}`).set('Authorization', await auth(1, 'BOSS')).send({ note: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.fields.id).toBeTruthy();
    });
  });

  describe('[ASSUMPTION 11] outcomeNote length boundary', () => {
    it('outcomeNote of 501 chars → 400 VALIDATION_FAILED fields.outcomeNote; 500 chars → 200', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/v1/viewings').set('Authorization', await auth(2, 'MANAGER'))
        .send({ roomId: 101, guestName: 'AA', guestPhone: '0912340003', visitDate: TOMORROW, timeSlot: 'MORNING' });
      expect(create.status).toBe(201);
      const id = create.body.data.id;
      await request(app.getHttpServer())
        .patch(`/api/v1/viewings/${id}`).set('Authorization', await auth(2, 'MANAGER')).send({ status: 'CONFIRMED' }).expect(200);

      const tooLong = await request(app.getHttpServer())
        .patch(`/api/v1/viewings/${id}`).set('Authorization', await auth(2, 'MANAGER'))
        .send({ status: 'LOST', outcomeNote: 'a'.repeat(501) });
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.error.fields.outcomeNote).toBeTruthy();

      const exact = await request(app.getHttpServer())
        .patch(`/api/v1/viewings/${id}`).set('Authorization', await auth(2, 'MANAGER'))
        .send({ status: 'LOST', outcomeNote: 'a'.repeat(500) });
      expect(exact.status).toBe(200);
      expect(exact.body.data.outcomeNote).toHaveLength(500);
    });
  });

  describe('SCOPE-02/API-08: scope at the HTTP level', () => {
    it('GET /viewings?buildingId=<outside manager scope> → 403 OUT_OF_SCOPE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/viewings?buildingId=20').set('Authorization', await auth(2, 'MANAGER'));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUT_OF_SCOPE');
    });

    it('end to end: MANAGER creates for their own room (201), sees it in GET /viewings, PATCH confirms it (200)', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/v1/viewings').set('Authorization', await auth(2, 'MANAGER'))
        .send({ roomId: 101, guestName: 'Khách HTTP', guestPhone: '0912340009', visitDate: TOMORROW, timeSlot: 'AFTERNOON' });
      expect(create.status).toBe(201);
      expect(create.body.data).toMatchObject({ source: 'MANUAL', status: 'NEW', handledById: 2 });
      const id = create.body.data.id;

      const list = await request(app.getHttpServer()).get('/api/v1/viewings').set('Authorization', await auth(2, 'MANAGER'));
      expect(list.status).toBe(200);
      expect(list.body.data.some((v: any) => v.id === id)).toBe(true);

      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/viewings/${id}`).set('Authorization', await auth(2, 'MANAGER')).send({ status: 'CONFIRMED' });
      expect(patch.status).toBe(200);
      expect(patch.body.data.status).toBe('CONFIRMED');
    });

    it('MANAGER cannot create for a room of a building outside their scope → 403 OUT_OF_SCOPE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/viewings').set('Authorization', await auth(2, 'MANAGER'))
        .send({ roomId: 103, guestName: 'AA', guestPhone: '0912340010', visitDate: TOMORROW, timeSlot: 'MORNING' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('OUT_OF_SCOPE');
    });
  });
});
