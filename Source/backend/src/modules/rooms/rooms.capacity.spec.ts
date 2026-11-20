import { ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

type Occupant = { status: 'ACTIVE' | 'HOLD' | 'ENDED'; moveInDate: Date; moveOutDate: Date | null };
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const boss: any = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const managerElsewhere: any = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [11] };

function harness(occupants: Occupant[] = []) {
  const room: any = {
    id: 203, buildingId: 10, code: '203', floor: 2, areaM2: { toString: () => '24' }, price: 2500000,
    maxOccupants: 2, furniture: [], description: null, underMaintenance: false, isActive: true,
    images: [], contracts: [],
  };
  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: room.id }]),
    room: {
      findUnique: vi.fn(async () => ({ ...room, images: [], contracts: [] })),
      updateMany: vi.fn(async ({ data }: any) => { Object.assign(room, data); return { count: 1 }; }),
    },
    occupant: {
      findMany: vi.fn(async ({ where }: any) => occupants.filter(o => where.contract.status.in.includes(o.status))
        .map(({ moveInDate, moveOutDate }) => ({ moveInDate, moveOutDate }))),
      count: vi.fn(async ({ where }: any) => occupants.filter((o) => {
        const today = where.moveInDate.lte.getTime();
        return o.status === where.contract.status && o.moveInDate.getTime() <= today
          && (o.moveOutDate === null || o.moveOutDate.getTime() >= today);
      }).length),
    },
    contract: { count: vi.fn(async () => 0) },
    viewing: { count: vi.fn(async () => 0) },
  };
  let transactionTail = Promise.resolve();
  const prisma: any = {
    $transaction: vi.fn(async (work: (client: any) => unknown) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try { return await work(tx); } finally { release(); }
    }),
  };
  return { service: new RoomsService(prisma), room, tx, prisma };
}

describe('BE-P2-17 · room occupant capacity', () => {
  afterEach(() => vi.useRealTimers());

  it('DB-B6/CON-13/ROOM-01: allows reducing capacity to one when no occupants are active', async () => {
    const { service, tx, room } = harness();
    const result = await service.update(boss, 203, { maxOccupants: 1 } as any);
    expect(result.maxOccupants).toBe(1);
    expect(room.maxOccupants).toBe(1);
    expect(tx.occupant.count).toHaveBeenCalledOnce();
  });

  it('DB-B6/CON-13/ROOM-01: one current occupant allows capacity one', async () => {
    const { service, room, tx } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: null },
    ]);
    const result = await service.update(boss, 203, { maxOccupants: 1 } as any);
    expect(result.maxOccupants).toBe(1);
    expect(room.maxOccupants).toBe(1);
    expect(tx.room.updateMany).toHaveBeenCalledOnce();
  });

  it.each([2, 3])('DB-B6/CON-13/ROOM-01: two current occupants allow capacity %i', async (maxOccupants) => {
    const { service, tx, room } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: null },
    ]);
    const result = await service.update(boss, 203, { maxOccupants } as any);
    expect(result.maxOccupants).toBe(maxOccupants);
    expect(room.maxOccupants).toBe(maxOccupants);
    expect(tx.occupant.count).not.toHaveBeenCalled();
  });

  it('DB-B6/CON-13/ROOM-01: rejects reducing CG01/203 from two seeded occupants to one without writing', async () => {
    const { service, tx, room } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-09-15'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-09-15'), moveOutDate: null },
    ]);
    await expect(service.update(boss, 203, { maxOccupants: 1 } as any)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' },
    });
    expect(room.maxOccupants).toBe(2);
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('DB-B6/CON-13: counts move-in today and move-out today, excludes yesterday/tomorrow, HOLD and ENDED', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00.000Z'));
    const { service, tx } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-03-01'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: day('2026-03-01') },
      { status: 'ACTIVE', moveInDate: day('2026-02-28'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-03-02'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: day('2026-02-28') },
      { status: 'HOLD', moveInDate: day('2026-02-01'), moveOutDate: null },
      { status: 'ENDED', moveInDate: day('2026-02-01'), moveOutDate: null },
    ]);
    await expect(service.update(boss, 203, { maxOccupants: 1 } as any)).rejects.toMatchObject({ status: 409 });
    expect(tx.occupant.count).toHaveBeenCalledWith({
      where: {
        contract: { roomId: 203, status: 'ACTIVE' }, moveInDate: { lte: day('2026-03-01') },
        OR: [{ moveOutDate: null }, { moveOutDate: { gte: day('2026-03-01') } }],
      },
    });
  });

  it('DB-B6/CON-13/G-02: uses Hanoi date after UTC has crossed February month end', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-02-28T17:00:00.000Z'));
    const { service, tx } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-03-01'), moveOutDate: day('2026-03-01') },
      { status: 'ACTIVE', moveInDate: day('2026-02-01'), moveOutDate: null },
    ]);
    await expect(service.update(boss, 203, { maxOccupants: 1 } as any)).rejects.toMatchObject({ status: 409 });
    expect(tx.occupant.count.mock.calls[0][0].where.moveInDate.lte).toEqual(day('2026-03-01'));
  });

  it('DB-B6/CON-13/SCOPE-02: checks room scope before counting occupants or writing', async () => {
    const { service, tx, room } = harness();
    await expect(service.update(managerElsewhere, 203, { maxOccupants: 1 } as any)).rejects.toMatchObject({ status: 403 });
    expect(tx.occupant.count).not.toHaveBeenCalled();
    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(room.maxOccupants).toBe(2);
  });

  it('DB-B6/CON-13: obtains the room row lock before counting and updates in the same transaction', async () => {
    const { service, prisma, tx } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-01-01'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-01-01'), moveOutDate: null },
    ]);
    await expect(service.update(boss, 203, { maxOccupants: 1, isActive: true } as any)).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.occupant.count.mock.invocationCallOrder[0]);
    expect(tx.room.updateMany).not.toHaveBeenCalled();
  });

  it('DB-B6/CON-13: serializes simultaneous capacity patches around the locked room row', async () => {
    const { service, room, tx } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-01-01'), moveOutDate: null },
      { status: 'ACTIVE', moveInDate: day('2026-01-01'), moveOutDate: null },
    ]);
    const outcomes = await Promise.allSettled([
      service.update(boss, 203, { maxOccupants: 1 } as any),
      service.update(boss, 203, { maxOccupants: 3 } as any),
    ]);
    expect(outcomes[0].status).toBe('rejected');
    expect(outcomes[1].status).toBe('fulfilled');
    expect(room.maxOccupants).toBe(3);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.room.updateMany).toHaveBeenCalledOnce();
  });

  it('BE-P3-23/CON-13: refuses a lower limit that would overbook a future HOLD even when today is empty', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
    const { service, room, tx } = harness([
      { status: 'HOLD', moveInDate: day('2026-12-01'), moveOutDate: null },
      { status: 'HOLD', moveInDate: day('2026-12-10'), moveOutDate: null },
    ]);
    await expect(service.update(boss, 203, { maxOccupants: 1 } as any)).rejects.toMatchObject({
      status: 409, response: { code: 'CONFLICT_STATE' },
    });
    expect(tx.occupant.count.mock.results).toHaveLength(1);
    expect(await tx.occupant.count.mock.results[0].value).toBe(0);
    expect(tx.occupant.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { contract: { roomId: 203, status: { in: ['HOLD', 'ACTIVE'] } } },
      select: { moveInDate: true, moveOutDate: true },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.occupant.findMany.mock.invocationCallOrder[0]);
    expect(tx.room.updateMany).not.toHaveBeenCalled();
    expect(room.maxOccupants).toBe(2);
  });

  it('BE-P3-23/CON-13: an exact future limit permits separated planned stays without rewriting their history', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
    const occupants: Occupant[] = [
      { status: 'HOLD', moveInDate: day('2026-12-01'), moveOutDate: day('2026-12-10') },
      { status: 'HOLD', moveInDate: day('2026-12-11'), moveOutDate: null },
    ];
    const before = structuredClone(occupants);
    const { service, room, tx } = harness(occupants);
    expect((await service.update(boss, 203, { maxOccupants: 1 } as any)).maxOccupants).toBe(1);
    expect(room.maxOccupants).toBe(1);
    expect(tx.room.updateMany).toHaveBeenCalledOnce();
    expect(occupants).toEqual(before);
  });

  it('BE-P3-23/CON-13: historical peaks before today and ENDED stays do not block a lower future limit', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
    const { service } = harness([
      { status: 'ACTIVE', moveInDate: day('2026-11-01'), moveOutDate: day('2026-11-19') },
      { status: 'ACTIVE', moveInDate: day('2026-11-01'), moveOutDate: day('2026-11-19') },
      { status: 'HOLD', moveInDate: day('2026-12-01'), moveOutDate: null },
      { status: 'ENDED', moveInDate: day('2026-12-01'), moveOutDate: null },
    ]);
    expect((await service.update(boss, 203, { maxOccupants: 1 } as any)).maxOccupants).toBe(1);
  });
});
