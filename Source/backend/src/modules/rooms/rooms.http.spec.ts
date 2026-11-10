import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { RoomsModule } from './rooms.module.js';

// Prisma is the external database edge; the real guards, ValidationPipe, room controller,
// room service, error filter, and response interceptor run through an HTTP server.
describe('BE-P2-17 · rooms HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;
  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const roomCreate = vi.fn();
  const roomLookup = vi.fn();
  const db: any = {
    // Prisma is the database edge. The callback transaction runs the real
    // service work against the same isolated delegates and simulates only the
    // building row lock; no controller/service behavior is mocked.
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => [{ id: values[0] }]),
      building: db.building,
      room: db.room,
      occupant: db.occupant,
      contract: db.contract,
      viewing: db.viewing,
    })),
    $queryRaw: vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => [{ id: values[0] }]),
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) => where.managerId === 2 && where.isActive ? [{ id: 10 }, { id: 12 }] : []),
      findUnique: vi.fn(async ({ where }: any) => where.id === 10
        ? { id: 10, managerId: 2, isActive: true }
        : where.id === 11 ? { id: 11, managerId: 4, isActive: true } : null),
    },
    room: {
      create: roomCreate,
      findUnique: roomLookup,
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    occupant: { count: vi.fn(async () => 0) },
    contract: { count: vi.fn(async () => 0) },
    viewing: { count: vi.fn(async () => 0) },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const testingModule = Test.createTestingModule({
      imports: [JwtModule.register({}), RoomsModule],
      providers: [
        TokenService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: MustChangePasswordGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    });
    testingModule.overrideProvider(PrismaService).useValue(db);
    const moduleRef = await testingModule.compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => {
    roomCreate.mockReset();
    roomLookup.mockReset();
    db.room.update.mockReset();
    db.room.updateMany.mockReset();
    db.room.updateMany.mockResolvedValue({ count: 1 });
    db.occupant.count.mockReset();
    db.occupant.count.mockResolvedValue(0);
  });
  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('SCOPE-01/02, API-04: tenant cannot use staff room routes; missing token is 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/rooms').expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(3, 'TENANT'))
      .send({ buildingId: 10, code: '101', floor: 1, areaM2: 20 }).expect(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
  });

  it('ROOM-01, ROOM-02, G-01: valid room creation returns null price and never writes a price', async () => {
    roomCreate.mockImplementation(async ({ data }: any) => ({
      id: 101, ...data, areaM2: { toString: () => String(data.areaM2) }, price: null,
      maxOccupants: data.maxOccupants, underMaintenance: false, isActive: true, images: [],
    }));
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(2, 'MANAGER'))
      .send({ buildingId: 10, code: '101', floor: 1, areaM2: 24.5, furniture: [] }).expect(201);
    expect(response.body.data).toMatchObject({ id: 101, code: '101', price: null, areaM2: 24.5, status: 'Trống' });
    expect((roomCreate as any).mock.calls[0][0].data).not.toHaveProperty('price');
  });

  it.each([1, 2147483647])('ROOM-01, API-04: POST accepts floor at int32 boundary %i', async (floor) => {
    roomCreate.mockImplementationOnce(async ({ data }: any) => ({
      id: 102, ...data, areaM2: { toString: () => String(data.areaM2) }, price: null,
      maxOccupants: data.maxOccupants, underMaintenance: false, isActive: true, images: [],
    }));
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(1, 'BOSS'))
      .send({ buildingId: 10, code: 'F123456789', floor, areaM2: 20 }).expect(201);
    expect(response.body.data.floor).toBe(floor);
    expect(roomCreate.mock.calls[0][0].data.floor).toBe(floor);
  });

  it('ROOM-01, API-04: POST rejects floor above Prisma Int as VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(1, 'BOSS'))
      .send({ buildingId: 10, code: 'OVERFLOW', floor: 2147483648, areaM2: 20 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.floor).toBe('Tầng phải là số nguyên từ 1 đến 2147483647');
    expect(roomCreate).not.toHaveBeenCalled();
  });

  it.each([1, 2147483647])('ROOM-01, API-04: PATCH accepts floor at int32 boundary %i', async (floor) => {
    const current = {
      id: 101, buildingId: 10, code: '101', floor: 1, areaM2: { toString: () => '20' }, price: null,
      maxOccupants: 2, furniture: [], description: null, underMaintenance: false, isActive: true,
      images: [], contracts: [],
    };
    roomLookup.mockImplementation(async () => current);
    (db.room.updateMany as any).mockImplementationOnce(async ({ data }: any) => {
      Object.assign(current, data);
      return { count: 1 };
    });
    const response = await request(app.getHttpServer())
      .patch('/api/v1/rooms/101').set('Authorization', await auth(1, 'BOSS'))
      .send({ floor }).expect(200);
    expect(response.body.data.floor).toBe(floor);
    expect((db.room.updateMany as any).mock.calls[0][0].data.floor).toBe(floor);
  });

  it('ROOM-01, API-04: PATCH rejects floor above Prisma Int as VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/rooms/101').set('Authorization', await auth(1, 'BOSS'))
      .send({ floor: 2147483648 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields.floor).toBe('Tầng phải là số nguyên từ 1 đến 2147483647');
    expect(roomLookup).not.toHaveBeenCalled();
    expect(db.room.update).not.toHaveBeenCalled();
  });

  it('DB-B6/CON-13/ROOM-01, API-04: PATCH for seeded CG01/203 occupancy returns HTTP 409 and leaves capacity unchanged', async () => {
    const current = {
      id: 203, buildingId: 10, code: '203', floor: 2, areaM2: { toString: () => '24' }, price: 2500000,
      maxOccupants: 2, furniture: [], description: null, underMaintenance: false, isActive: true,
      images: [], contracts: [],
    };
    roomLookup.mockResolvedValue(current);
    db.occupant.count.mockResolvedValue(2);
    const response = await request(app.getHttpServer())
      .patch('/api/v1/rooms/203').set('Authorization', await auth(1, 'BOSS'))
      .send({ maxOccupants: 1 }).expect(409);
    expect(response.body).toEqual({ error: { code: 'CONFLICT_STATE', message: expect.any(String) } });
    expect(db.occupant.count).toHaveBeenCalledWith({
      where: {
        contract: { roomId: 203, status: 'ACTIVE' },
        moveInDate: { lte: expect.any(Date) },
        OR: [{ moveOutDate: null }, { moveOutDate: { gte: expect.any(Date) } }],
      },
    });
    expect(db.room.updateMany).not.toHaveBeenCalled();
  });

  it('SCOPE-02, API-04: Manager create in another building returns exact 403 OUT_OF_SCOPE body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(2, 'MANAGER'))
      .send({ buildingId: 11, code: '101', floor: 1, areaM2: 20 }).expect(403);
    expect(response.body).toEqual({
      error: { code: 'OUT_OF_SCOPE', message: 'Dữ liệu này nằm ngoài phạm vi của bạn' },
    });
    expect(roomCreate).not.toHaveBeenCalled();
  });

  it('API-08, SCOPE-02: manager with two buildings filters by buildingId and sees both when omitted', async () => {
    // Prisma is the database boundary; filter these rows using the actual where clause from RoomsService.
    const rows = [
      { id: 101, buildingId: 10, code: '101', floor: 1, areaM2: { toString: () => '20' }, price: null,
        maxOccupants: 2, isActive: true, underMaintenance: false, contracts: [], prices: [], _count: { images: 0 } },
      { id: 201, buildingId: 12, code: '201', floor: 1, areaM2: { toString: () => '22' }, price: null,
        maxOccupants: 2, isActive: true, underMaintenance: false, contracts: [], prices: [], _count: { images: 0 } },
    ];
    db.room.findMany.mockImplementation(async ({ where }: any) => {
      const scope = where.buildingId;
      return rows.filter((row) => typeof scope === 'number'
        ? row.buildingId === scope
        : scope?.in ? scope.in.includes(row.buildingId) : true);
    });
    db.room.count.mockImplementation(async ({ where }: any) => {
      const scope = where.buildingId;
      return rows.filter((row) => typeof scope === 'number'
        ? row.buildingId === scope
        : scope?.in ? scope.in.includes(row.buildingId) : true).length;
    });

    const selected = await request(app.getHttpServer())
      .get('/api/v1/rooms?buildingId=10').set('Authorization', await auth(2, 'MANAGER')).expect(200);
    expect(selected.body.data.map((room: any) => room.buildingId)).toEqual([10]);
    expect(selected.body.meta.total).toBe(1);

    const allAllowed = await request(app.getHttpServer())
      .get('/api/v1/rooms').set('Authorization', await auth(2, 'MANAGER')).expect(200);
    expect(allAllowed.body.data.map((room: any) => room.buildingId)).toEqual([10, 12]);
    expect(allAllowed.body.meta.total).toBe(2);
  });

  it('ROOM-02, API-04: POST price is rejected as VALIDATION_FAILED before DB write', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(1, 'BOSS'))
      .send({ buildingId: 10, code: '101', floor: 1, areaM2: 20, price: 2300000 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields).toMatchObject({ price: 'Trường này không được phép gửi lên' });
    expect(roomCreate).not.toHaveBeenCalled();
  });

  it('ROOM-02, API-04: PATCH price is rejected before room lookup or database update', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/rooms/101').set('Authorization', await auth(1, 'BOSS'))
      .send({ price: 2300000 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.fields).toMatchObject({ price: 'Trường này không được phép gửi lên' });
    expect(roomLookup).not.toHaveBeenCalled();
    expect(db.room.update).not.toHaveBeenCalled();
  });

  it('ROOM-06, API-04: duplicate code returns 400 and exact code field message', async () => {
    roomCreate.mockRejectedValueOnce({ code: 'P2002', meta: { target: 'rooms_building_id_code_key' } });
    const response = await request(app.getHttpServer())
      .post('/api/v1/rooms').set('Authorization', await auth(1, 'BOSS'))
      .send({ buildingId: 10, code: '101', floor: 1, areaM2: 20 }).expect(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: expect.any(String),
        fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
      },
    });
  });
});
