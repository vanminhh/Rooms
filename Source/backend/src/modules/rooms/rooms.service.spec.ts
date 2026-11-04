import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

// CP-5 regression check: this is an UNMODIFIED copy of the main
// src/modules/rooms/rooms.service.spec.ts (existing before CP-5), run here through the preview
// resolver so it exercises the draft-mirrored RoomsService. If this file goes red, the CP-5
// mirror broke existing room-unlock behavior (PLAN "Done when": existing rooms/buildings tests
// must stay green against the mirror).

type ContractStatus = 'HOLD' | 'ACTIVE' | 'ENDED';
type ViewingStatus = 'NEW' | 'CONFIRMED' | 'LOST' | 'CANCELLED';

function makeHarness(options: {
  buildingId?: number;
  underMaintenance?: boolean;
  isActive?: boolean;
  contracts?: ContractStatus[];
  viewings?: ViewingStatus[];
  afterFirstUpdate?: (contracts: ContractStatus[]) => void;
} = {}) {
  const state: any = {
    id: 101,
    buildingId: options.buildingId ?? 10,
    code: '203',
    floor: 2,
    areaM2: { toString: () => '24.5' },
    price: 2500000,
    maxOccupants: 2,
    furniture: [],
    description: null,
    underMaintenance: options.underMaintenance ?? false,
    isActive: options.isActive ?? true,
    images: [],
  };
  const contracts = [...(options.contracts ?? [])];
  const viewings = [...(options.viewings ?? [])];
  let lockTail = Promise.resolve();
  let updateCount = 0;

  const tx: any = {
    // The outer transaction mutex models PostgreSQL's row lock. The raw SELECT
    // only records that the service requested the lock; it must not acquire a
    // second mutex from inside the transaction or it would wait on itself.
    $queryRaw: vi.fn(async () => [{ id: state.id }]),
    room: {
      findUnique: vi.fn(async () => ({ ...state, images: [] })),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (state.isActive !== where.isActive || state.underMaintenance !== where.underMaintenance) return { count: 0 };
        Object.assign(state, data);
        updateCount += 1;
        if (updateCount === 1) options.afterFirstUpdate?.(contracts);
        return { count: 1 };
      }),
      // CP-5: unlock branch now calls syncRoomPrices(tx, [id]), which reads tx.room.findMany;
      // default to no rooms found so pre-existing tests keep their original price-unaware assertions.
      findMany: vi.fn(async () => []),
    },
    // CP-5: syncRoomPrices only reads this when tx.room.findMany returned rooms (not the case here).
    roomPrice: {
      findMany: vi.fn(async () => []),
    },
    contract: {
      count: vi.fn(async ({ where }: any) => contracts.filter((status) => where.status.in.includes(status)).length),
    },
    viewing: {
      count: vi.fn(async ({ where }: any) => viewings.filter((status) => where.status.in.includes(status)).length),
    },
  };
  const prisma: any = {
    $transaction: vi.fn(async (callback: (client: any) => unknown) => {
      const previous = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback(tx);
      } finally {
        release();
      }
    }),
    room: { findUnique: vi.fn(async () => ({ ...state, images: [] })) },
  };
  const service = new RoomsService(prisma);
  return { service, prisma, tx, state, contracts, viewings };
}

const boss: any = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: any = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };

describe('BE-P2-18 · RoomsService maintenance and locking', () => {
  it('ROOM-03: enables and disables maintenance on a room with no HOLD or ACTIVE contract', async () => {
    const { service, state } = makeHarness();

    const enabled = await service.update(boss, 101, { underMaintenance: true } as any);
    expect(enabled.underMaintenance).toBe(true);
    expect(enabled.status).toBe('Bảo trì');

    const disabled = await service.update(boss, 101, { underMaintenance: false } as any);
    expect(disabled.underMaintenance).toBe(false);
    expect(state.underMaintenance).toBe(false);
  });

  it.each(['HOLD', 'ACTIVE'] as const)(
    'ROOM-03/04: rejects enabling maintenance and locking while a %s contract exists without changing room state',
    async (contractStatus) => {
      for (const change of [{ underMaintenance: true }, { isActive: false }]) {
        const { service, state, tx } = makeHarness({ contracts: [contractStatus] });
        await expect(service.update(boss, 101, change as any)).rejects.toMatchObject({
          constructor: ConflictException,
          status: 409,
          response: { message: 'CONFLICT_STATE' },
        });
        expect(state).toMatchObject({ underMaintenance: false, isActive: true });
        expect(tx.room.updateMany).not.toHaveBeenCalled();
      }
    },
  );

  it('ROOM-03: rejects disabling maintenance while a HOLD or ACTIVE contract exists', async () => {
    for (const contractStatus of ['HOLD', 'ACTIVE'] as const) {
      const { service, state, tx } = makeHarness({ underMaintenance: true, contracts: [contractStatus] });
      await expect(service.update(boss, 101, { underMaintenance: false } as any)).rejects.toMatchObject({
        constructor: ConflictException,
        status: 409,
        response: { message: 'CONFLICT_STATE' },
      });
      expect(state.underMaintenance).toBe(true);
      expect(tx.room.updateMany).not.toHaveBeenCalled();
    }
  });

  it('ROOM-04, ROOM-09: locks an empty room with NEW and CONFIRMED viewings counted and preserved', async () => {
    const { service, state, tx, viewings } = makeHarness({
      viewings: ['NEW', 'CONFIRMED', 'LOST', 'CANCELLED'],
    });

    const locked = await service.update(manager, 101, { isActive: false } as any);
    expect(locked).toMatchObject({ isActive: false, pendingViewingCount: 2 });
    expect(state.isActive).toBe(false);
    expect(viewings).toEqual(['NEW', 'CONFIRMED', 'LOST', 'CANCELLED']);
    expect(tx.viewing.count).toHaveBeenCalledWith({
      where: { roomId: 101, status: { in: ['NEW', 'CONFIRMED'] } },
    });
    expect(tx).not.toHaveProperty('viewing.updateMany');
    expect(tx).not.toHaveProperty('viewing.deleteMany');
  });

  it('ROOM-04: unlocks a room by setting isActive true without deleting its history', async () => {
    const { service, state, tx } = makeHarness({ isActive: false });

    const result = await service.update(boss, 101, { isActive: true } as any);
    expect(result.isActive).toBe(true);
    expect(state.isActive).toBe(true);
    expect(tx.room.updateMany).toHaveBeenCalledOnce();
  });

  it('SCOPE-02: rejects status changes to another building before updating the room', async () => {
    const { service, tx } = makeHarness({ buildingId: 11 });

    await expect(service.update(manager, 101, { isActive: false } as any)).rejects.toMatchObject({
      constructor: ForbiddenException,
      status: 403,
      response: { message: 'OUT_OF_SCOPE' },
    });
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('ROOM-03/04: serializes concurrent status changes so a newly present contract blocks the second request', async () => {
    const harness = makeHarness({ afterFirstUpdate: (contracts) => contracts.push('ACTIVE') });
    const outcomes = await Promise.allSettled([
      harness.service.update(boss, 101, { underMaintenance: true } as any),
      harness.service.update(boss, 101, { isActive: false } as any),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      constructor: ConflictException,
      status: 409,
      response: { message: 'CONFLICT_STATE' },
    });
    expect(harness.state).toMatchObject({ underMaintenance: true, isActive: true });
    expect(harness.tx.room.updateMany).toHaveBeenCalledOnce();
    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of harness.tx.$queryRaw.mock.calls) {
      expect(query.join('')).toContain('FOR UPDATE');
    }
  });
});
