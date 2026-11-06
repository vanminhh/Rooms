import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { RoomsService } from './rooms.service.js';

// CP-3 (CP-2 checkpoint): GET /rooms/:id. Prisma is the only mocked edge (DB); the
// room/viewing delegates emulate a real WHERE filter so the test proves the service's
// query shape, not just that a stub returns a canned value. Business logic (assertStaff,
// assertRoomScope, toView, deriveRoomStatus) runs for real from the draft service.

type ContractStatus = 'HOLD' | 'ACTIVE' | 'ENDED';
type ViewingStatus = 'NEW' | 'CONFIRMED' | 'DONE' | 'CANCELLED';

function makeRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    buildingId: 10,
    code: '203',
    floor: 2,
    areaM2: { toString: () => '24.5' },
    price: 2500000,
    maxOccupants: 2,
    furniture: ['Giường'],
    description: 'Phòng góc',
    underMaintenance: false,
    isActive: true,
    images: [] as Array<Record<string, unknown>>,
    contracts: [] as Array<{ status: ContractStatus }>,
    ...overrides,
  };
}

function makeHarness(room: ReturnType<typeof makeRoom> | null, viewings: ViewingStatus[] = []) {
  const roomFindUnique = vi.fn(async (_args: any) => room);
  const viewingCount = vi.fn(async ({ where }: any) =>
    viewings.filter((status) => where.status.in.includes(status)).length);
  const prisma: any = {
    room: { findUnique: roomFindUnique },
    viewing: { count: viewingCount },
  };
  const service = new RoomsService(prisma);
  return { service, roomFindUnique, viewingCount };
}

const boss: any = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager10: any = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };
const tenant: any = { id: 3, role: 'TENANT', mustChangePassword: false, buildingIds: [] };

describe('BE-P2-GET-ROOM · RoomsService.get', () => {
  it('ROOM-09, VIEW-13: counts only NEW/CONFIRMED viewings, not DONE/CANCELLED', async () => {
    const room = makeRoom();
    const { service, viewingCount } = makeHarness(room, ['NEW', 'CONFIRMED', 'NEW', 'DONE', 'CANCELLED']);

    const view = await service.get(boss, 101);

    expect(view.pendingViewingCount).toBe(3);
    expect(viewingCount).toHaveBeenCalledWith({
      where: { roomId: 101, status: { in: ['NEW', 'CONFIRMED'] } },
    });
  });

  it('ROOM-09: pendingViewingCount is 0 (present, not undefined) when there is no pending viewing', async () => {
    const room = makeRoom();
    const { service } = makeHarness(room, []);

    const view = await service.get(boss, 101);

    expect(view.pendingViewingCount).toBe(0);
    expect('pendingViewingCount' in view).toBe(true);
  });

  it('ROOM-07: images are ordered sortOrder asc, id asc, and expose exactly 5 fields', async () => {
    // Prisma (mocked) applies the orderBy clause itself; the room record below is handed back
    // already sorted the way a real `include.images.orderBy` query would, as `rooms.service.spec.ts`
    // does for its own fixtures. The query shape is asserted separately below.
    const room = makeRoom({
      images: [
        { id: 2, roomId: 101, publicId: 'p2', url: 'https://img/2', sortOrder: 0, assetId: 'a2', version: 1, format: 'png' },
        { id: 9, roomId: 101, publicId: 'p9', url: 'https://img/9', sortOrder: 1, assetId: 'a9', version: 3, format: 'jpg' },
      ],
    });
    const { service, roomFindUnique } = makeHarness(room, []);

    const view = await service.get(boss, 101);

    expect(view.images.map((image) => image.id)).toEqual([2, 9]);
    for (const image of view.images) {
      expect(Object.keys(image).sort()).toEqual(['id', 'publicId', 'roomId', 'sortOrder', 'url'].sort());
    }
    expect(roomFindUnique).toHaveBeenCalledWith({
      where: { id: 101 },
      include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, contracts: { select: { status: true } } },
    });
  });

  it('ROOM-07: a room with no images returns images: []', async () => {
    const room = makeRoom({ images: [] });
    const { service } = makeHarness(room, []);

    const view = await service.get(boss, 101);

    expect(view.images).toEqual([]);
  });

  it('Room status (11-buildings-rooms): ACTIVE contract wins over maintenance and empty', async () => {
    const { service } = makeHarness(makeRoom({ contracts: [{ status: 'ACTIVE' }], underMaintenance: true }), []);
    expect((await service.get(boss, 101)).status).toBe('Đang thuê');
  });

  it('Room status: maintenance with no contract', async () => {
    const { service } = makeHarness(makeRoom({ contracts: [], underMaintenance: true }), []);
    expect((await service.get(boss, 101)).status).toBe('Bảo trì');
  });

  it('Room status: no contract, no maintenance is "Trống"', async () => {
    const { service } = makeHarness(makeRoom({ contracts: [], underMaintenance: false }), []);
    expect((await service.get(boss, 101)).status).toBe('Trống');
  });

  it('SCOPE-02: manager outside the room building gets 403 OUT_OF_SCOPE and viewing.count is never called', async () => {
    const room = makeRoom({ buildingId: 11 });
    const { service, viewingCount } = makeHarness(room, ['NEW']);

    await expect(service.get(manager10, 101)).rejects.toMatchObject({
      constructor: ForbiddenException,
      status: 403,
      response: { message: 'OUT_OF_SCOPE' },
    });
    expect(viewingCount).not.toHaveBeenCalled();
  });

  it('SCOPE-02: manager inside the room building gets 200', async () => {
    const room = makeRoom({ buildingId: 10 });
    const { service } = makeHarness(room, []);

    await expect(service.get(manager10, 101)).resolves.toMatchObject({ id: 101, buildingId: 10 });
  });

  it('Role: TENANT gets 403 FORBIDDEN before any DB read', async () => {
    const room = makeRoom();
    const { service, roomFindUnique } = makeHarness(room, []);

    await expect(service.get(tenant, 101)).rejects.toMatchObject({
      constructor: ForbiddenException,
      status: 403,
      response: { message: 'FORBIDDEN' },
    });
    expect(roomFindUnique).not.toHaveBeenCalled();
  });

  it('Not found: no such room id gets 404 NOT_FOUND and viewing.count is never called', async () => {
    const { service, viewingCount } = makeHarness(null, ['NEW']);

    await expect(service.get(boss, 999)).rejects.toMatchObject({
      constructor: NotFoundException,
      status: 404,
      response: { message: 'NOT_FOUND' },
    });
    expect(viewingCount).not.toHaveBeenCalled();
  });

  it('[ASSUMPTION] locked room (isActive=false) is still readable by staff in scope', async () => {
    const room = makeRoom({ isActive: false });
    const { service } = makeHarness(room, []);

    const view = await service.get(boss, 101);
    expect(view.isActive).toBe(false);
  });
});

// Routing: real guards, ValidationPipe, controller, error filter and response interceptor
// run through an HTTP server. Prisma is the only mocked edge.
describe('BE-P2-GET-ROOM · GET /rooms/:id routing', () => {
  let app: INestApplication;
  let tokens: TokenService;
  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
  ]);
  const roomFindUnique = vi.fn();
  const db: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: { findMany: vi.fn(async () => []) },
    room: { findUnique: roomFindUnique },
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
  beforeEach(() => { roomFindUnique.mockReset(); });
  async function auth(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }

  it('ROOM-07, ROOM-09: GET /rooms/:id is a detail object, not the list @Get() shape', async () => {
    roomFindUnique.mockResolvedValue({
      id: 7, buildingId: 10, code: '101', floor: 1, areaM2: { toString: () => '20' }, price: null,
      maxOccupants: 2, furniture: [], description: null, underMaintenance: false, isActive: true,
      images: [], contracts: [],
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/rooms/7').set('Authorization', await auth(1, 'BOSS')).expect(200);
    expect(response.body.data).toMatchObject({ id: 7, pendingViewingCount: 0 });
    expect(response.body.data).not.toHaveProperty('items');
    expect(response.body.data).not.toHaveProperty('meta');
  });

  it('API-04: GET /rooms/:id with a non-numeric id is 400 VALIDATION_FAILED, not 404 and no DB read', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/rooms/abc').set('Authorization', await auth(1, 'BOSS')).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(roomFindUnique).not.toHaveBeenCalled();
  });
});
