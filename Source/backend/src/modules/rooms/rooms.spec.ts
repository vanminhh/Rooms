import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

// Prisma is the database edge; the RoomsService under test remains real.
function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 101, buildingId: 10, code: '101', floor: 1, areaM2: { toString: () => '24.5' }, price: null,
    maxOccupants: 2, furniture: [], description: null, underMaintenance: false, isActive: true,
    images: [], ...overrides,
  };
}

type RoomsDbFixture = {
  $queryRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
  building: { findUnique: ReturnType<typeof vi.fn> };
  room: Record<string, ReturnType<typeof vi.fn>>;
};

function harness() {
  const db: RoomsDbFixture = {
    // Prisma is the database edge: treat a row-lock query as acquiring the
    // existing row and return its id, then let the real service continue.
    $queryRaw: vi.fn(async (_query: TemplateStringsArray, ...values: unknown[]) => [{ id: values[0] }]),
    building: { findUnique: vi.fn(async ({ where }: any) => where.id === 10
      ? { id: 10, managerId: 2, isActive: true }
      : where.id === 11 ? { id: 11, managerId: 4, isActive: true } : null) },
    room: {
      findUnique: vi.fn(async ({ where }: any) => where.id === 101 ? room({ buildingId: 20 }) : null),
      create: vi.fn(async ({ data }: any) => room({ ...data, id: 102, areaM2: { toString: () => String(data.areaM2) } })),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    // Preserve Prisma's callback transaction API and use the same isolated
    // delegates that the real service receives inside a transaction.
    $transaction: vi.fn(async (work: (tx: RoomsDbFixture) => unknown) => work(db)),
  };
  return { db, service: new RoomsService(db as any) };
}

const boss = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null } as any;
const manager = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] } as any;

describe('BE-P2-17 · RoomsService CRUD and scope', () => {
  it('ROOM-01, ROOM-02, G-01: creates a room with price null and never writes price', async () => {
    const { db, service } = harness();
    const result = await service.create(boss, {
      buildingId: 10, code: '101', floor: 1, areaM2: 24.5, furniture: [],
    } as any);

    expect(result).toMatchObject({ id: 102, buildingId: 10, code: '101', floor: 1, areaM2: 24.5, price: null, furniture: [], status: 'Trống' });
    expect((db.room.create as any).mock.calls[0][0].data).not.toHaveProperty('price');
  });

  it('SCOPE-02, API-04: Manager cannot create in a building outside their scope', async () => {
    const { service } = harness();
    await expect(service.create(manager, { buildingId: 11, code: '101', floor: 1, areaM2: 24 } as any))
      .rejects.toMatchObject({
        constructor: ForbiddenException,
        status: 403,
        response: { statusCode: 403, error: 'Forbidden', message: 'OUT_OF_SCOPE' },
      });
  });

  it('SCOPE-02, API-04: Manager cannot update a room in another building', async () => {
    const { service } = harness();
    await expect(service.update(manager, 101, { code: '102' } as any))
      .rejects.toMatchObject({
        constructor: ForbiddenException,
        status: 403,
        response: { statusCode: 403, error: 'Forbidden', message: 'OUT_OF_SCOPE' },
      });
  });

  it('ROOM-06, API-04: duplicate code in a building maps to 400 and the locked-room wording', async () => {
    const { db, service } = harness();
    db.room.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: 'rooms_building_id_code_key' } });

    try {
      await service.create(boss, { buildingId: 10, code: '101', floor: 1, areaM2: 24 } as any);
      throw new Error('expected duplicate code rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
      });
    }
  });

  it('ROOM-06: refuses creation in a locked building with 409 CONFLICT_STATE', async () => {
    const { db, service } = harness();
    db.building.findUnique.mockResolvedValueOnce({ id: 10, managerId: null, isActive: false } as any);
    try {
      await service.create(boss, { buildingId: 10, code: '101', floor: 1, areaM2: 24 } as any);
      throw new Error('expected locked building rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: 'CONFLICT_STATE',
      });
    }
  });
});
