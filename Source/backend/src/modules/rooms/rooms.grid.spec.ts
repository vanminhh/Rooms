import { ForbiddenException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

// Prisma is the database edge; this exercises the real room-listing service.
function room(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    buildingId: 10,
    code: '203',
    floor: 2,
    areaM2: { toString: () => '24.5' },
    price: 2500000,
    maxOccupants: 2,
    isActive: true,
    underMaintenance: false,
    contracts: [],
    prices: [],
    _count: { images: 3 },
    ...overrides,
  };
}

function harness(rows: unknown[] = [], total = rows.length) {
  const prisma = {
    room: {
      findMany: vi.fn(async () => rows),
      count: vi.fn(async () => total),
    },
  };
  return { prisma, service: new RoomsService(prisma as any) };
}

const boss = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null } as any;
const manager = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 12] } as any;

describe('BE-P2-20 · rooms floor grid', () => {
  it('API-02: returns an empty page with exact pagination metadata and one query per operation', async () => {
    const { service, prisma } = harness([], 0);
    const result = await service.list(boss, { page: 1, limit: 20 });

    expect(result).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    expect(prisma.room.findMany).toHaveBeenCalledOnce();
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(prisma.room.count).toHaveBeenCalledOnce();
  });

  it('API-02, ROOM-01, G-01: maps the complete grid item with integer-or-null price and stable floor ordering', async () => {
    // Freeze at the proposal's Hanoi calendar date so PRC-07 stays non-expired.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T17:00:00.000Z'));
    try {
      const { service, prisma } = harness([room({
        prices: [{ id: 7, effectiveFrom: new Date('2026-11-03T00:00:00.000Z') }],
      })], 1);
      const result = await service.list(boss, { page: 1, limit: 1 });

      expect(result.meta).toEqual({ page: 1, limit: 1, total: 1 });
      expect(result.data[0]).toMatchObject({
        id: 101, buildingId: 10, code: '203', floor: 2, areaM2: 24.5,
        price: 2500000, maxOccupants: 2, isActive: true, underMaintenance: false,
        status: 'Trống', pendingProposal: { id: 7, effectiveFrom: '2026-11-03', expired: false }, imageCount: 3,
      });
      expect(Number.isInteger(result.data[0].price)).toBe(true);
      expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: [{ floor: 'asc' }, { code: 'asc' }, { id: 'asc' }], skip: 0, take: 1,
      }));
      expect(prisma.room.findMany).toHaveBeenCalledOnce();
      expect(prisma.room.count).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('API-02: uses requested page and maximum limit without changing result metadata', async () => {
    const { service, prisma } = harness([room({ price: null })], 101);
    const result = await service.list(boss, { page: 2, limit: 100, sort: '-floor' });

    expect(result.meta).toEqual({ page: 2, limit: 100, total: 101 });
    expect(result.data[0]?.price).toBeNull();
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 100, orderBy: [{ floor: 'desc' }, { code: 'asc' }, { id: 'asc' }],
    }));
  });

  it('BLD-07: defaults to hiding locked buildings and locked rooms', async () => {
    const { service, prisma } = harness();
    await service.list(boss, {});
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { building: { isActive: true }, isActive: true },
    }));
  });

  it('BLD-07, SCOPE-02: Boss can include locked buildings and rooms, while a manager can include only locked rooms in active buildings', async () => {
    const bossHarness = harness();
    await bossHarness.service.list(boss, { includeInactive: true });
    expect(bossHarness.prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));

    const managerHarness = harness();
    await managerHarness.service.list(manager, { includeInactive: true });
    expect(managerHarness.prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { buildingId: { in: [10, 12] }, building: { isActive: true } },
    }));
  });

  it('API-08, SCOPE-02: manager list without buildingId is limited to assigned buildings and explicit foreign building returns 403', async () => {
    const { service, prisma } = harness();
    await service.list(manager, {});
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { buildingId: { in: [10, 12] }, building: { isActive: true }, isActive: true },
    }));

    await expect(service.list(manager, { buildingId: 99 })).rejects.toMatchObject({
      constructor: ForbiddenException, status: 403, response: { message: 'OUT_OF_SCOPE' },
    });
    expect(prisma.room.findMany).toHaveBeenCalledOnce();
    expect(prisma.room.count).toHaveBeenCalledOnce();
  });

  it('PRC-07, G-02: compares date-only proposals at the Asia/Ho_Chi_Minh month boundary and excludes approved proposals', async () => {
    // 17:30 UTC on Oct 31 is already Nov 1 in Hanoi (UTC+7).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T17:30:00.000Z'));
    try {
      const previous = new Date('2026-10-31T00:00:00.000Z');
      const today = new Date('2026-11-01T00:00:00.000Z');
      const { service, prisma } = harness([
        room({ id: 1, code: '201', prices: [{ id: 11, effectiveFrom: previous }] }),
        room({ id: 2, code: '202', prices: [{ id: 12, effectiveFrom: today }] }),
        room({ id: 3, code: '203', prices: [] }),
      ]);

      const result = await service.list(boss, { page: 1, limit: 20 });
      expect(result.data.map((item) => item.pendingProposal)).toEqual([
        { id: 11, effectiveFrom: '2026-10-31', expired: true },
        { id: 12, effectiveFrom: '2026-11-01', expired: false },
        null,
      ]);
      expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({ prices: expect.objectContaining({ where: { status: 'PENDING' } }) }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('API-02: performs exactly one findMany and one count regardless of page row count', async () => {
    const { service, prisma } = harness(Array.from({ length: 30 }, (_, index) => room({ id: index + 1 })), 30);
    const result = await service.list(boss, { page: 1, limit: 100 });

    expect(result.data).toHaveLength(30);
    expect(prisma.room.findMany).toHaveBeenCalledOnce();
    expect(prisma.room.count).toHaveBeenCalledOnce();
  });
});
