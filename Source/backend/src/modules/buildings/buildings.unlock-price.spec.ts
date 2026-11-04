import { ForbiddenException } from '@nestjs/common';
import { parseDateOnly } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { BuildingsService } from './buildings.service.js';

// CP-5 · BE-P2-26 · PRC-06, Q-P5-5 A, AUD-01, SCOPE-02.
// Unit under test: BuildingsService.update (never mocked), exercising its real call into the
// shared, unmocked syncRoomPrices helper. The only mocked edges are the Prisma `$transaction`/tx
// delegates (fake, in-memory, atomic only across one transaction) and the AuditService dependency
// (a fake `.log` that still writes through to the fake tx.auditLog, same shape as the real one).

interface BuildingFixture { id: number; isActive: boolean; managerId?: number | null }
interface RoomFixture { id: number; buildingId: number; isActive: boolean; price: number }
interface RoomPriceFixture { roomId: number; price: number; effectiveFrom: string; status: string; reviewedAt?: string | null }

function building(overrides: BuildingFixture) {
  return {
    id: overrides.id, code: `B${overrides.id}`, name: `Tòa ${overrides.id}`, address: 'X', district: 'Y', ward: 'Z',
    waterMode: 'PER_M3', dueDays: 5, managerId: overrides.managerId ?? null, manager: null, amenities: [], description: null,
    isActive: overrides.isActive, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeHarness(buildings: BuildingFixture[], rooms: RoomFixture[], priceRows: RoomPriceFixture[] = []) {
  let committedBuildings = new Map(buildings.map((b) => [b.id, building(b)]));
  let committedRooms = new Map(rooms.map((r) => [r.id, { ...r }]));
  const priceRowsFixture = priceRows.map((r) => ({
    roomId: r.roomId, price: r.price, status: r.status,
    effectiveFrom: parseDateOnly(r.effectiveFrom)!,
    reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
  }));
  const auditRows: unknown[] = [];
  const contracts: Array<{ buildingId: number; status: string }> = [];
  const viewingRows: unknown[] = [];
  // Flipped by the rollback test to make the price write inside syncRoomPrices fail once,
  // simulating a DB error mid-transaction without touching the service under test.
  const failNextRoomUpdate = { current: false };

  function buildTx(buildingsDraft: Map<number, any>, roomsDraft: Map<number, any>) {
    return {
      $queryRaw: vi.fn(async () => []),
      building: {
        findUnique: vi.fn(async ({ where }: any) => {
          const b = buildingsDraft.get(where.id);
          return b ? { ...b } : null;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          const b = buildingsDraft.get(where.id);
          if (!b || b.isActive !== where.isActive) return { count: 0 };
          Object.assign(b, data);
          return { count: 1 };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const b = buildingsDraft.get(where.id);
          if (b) Object.assign(b, data);
          return b ? { ...b } : null;
        }),
      },
      room: {
        findMany: vi.fn(async ({ where, select }: any) => {
          let list = [...roomsDraft.values()];
          if (where.buildingId !== undefined) list = list.filter((r) => r.buildingId === where.buildingId);
          if (where.isActive !== undefined) list = list.filter((r) => r.isActive === where.isActive);
          if (where.building?.isActive !== undefined) {
            list = list.filter((r) => buildingsDraft.get(r.buildingId)?.isActive === where.building.isActive);
          }
          if (where.id?.in !== undefined) list = list.filter((r) => where.id.in.includes(r.id));
          return list.map((r) => (select?.price ? { id: r.id, price: r.price } : { id: r.id }));
        }),
        update: vi.fn(async ({ where, data }: any) => {
          if (failNextRoomUpdate.current) {
            failNextRoomUpdate.current = false;
            throw new Error('simulated db edge failure');
          }
          const r = roomsDraft.get(where.id);
          if (r) r.price = data.price;
          return r;
        }),
      },
      roomPrice: {
        findMany: vi.fn(async ({ where, orderBy }: any) => {
          let list = priceRowsFixture.filter((r) => where.roomId.in.includes(r.roomId) && r.status === where.status
            && r.effectiveFrom.getTime() <= where.effectiveFrom.lte.getTime());
          for (const clause of [...orderBy].reverse()) {
            const [field, dir] = Object.entries(clause)[0] as [string, 'asc' | 'desc'];
            list = [...list].sort((a: any, b: any) => {
              const av = a[field]?.getTime?.() ?? -Infinity;
              const bv = b[field]?.getTime?.() ?? -Infinity;
              return dir === 'desc' ? bv - av : av - bv;
            });
          }
          return list.map((r) => ({ roomId: r.roomId, price: r.price }));
        }),
      },
      contract: {
        count: vi.fn(async ({ where }: any) => contracts.filter((c) => c.buildingId === where.buildingId && where.status.in.includes(c.status)).length),
      },
      viewing: { findMany: vi.fn(async () => []) },
      auditLog: { create: vi.fn(async ({ data }: any) => { auditRows.push(data); return { id: auditRows.length, ...data }; }) },
    };
  }

  const prisma: any = {
    viewing: { findMany: vi.fn(async () => viewingRows) },
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const buildingsDraft = new Map([...committedBuildings.entries()].map(([id, b]) => [id, { ...b }]));
      const roomsDraft = new Map([...committedRooms.entries()].map(([id, r]) => [id, { ...r }]));
      const tx = buildTx(buildingsDraft, roomsDraft);
      // Only commit the draft maps back into the "database" if the whole callback succeeds,
      // modelling Postgres transaction atomicity for the rollback test below.
      const result = await callback(tx);
      committedBuildings = buildingsDraft;
      committedRooms = roomsDraft;
      return result;
    }),
  };

  const audit: any = {
    log: vi.fn(async (actorId: number, action: string, entity: string, entityId: number, before: unknown, after: unknown, ip: string, db: any) =>
      db.auditLog.create({ data: { actorId, action, entity, entityId, before, after, ip } })),
  };
  const service = new BuildingsService(prisma, audit);
  return {
    service,
    getBuilding: (id: number) => committedBuildings.get(id),
    getRoom: (id: number) => committedRooms.get(id),
    auditRows,
    prisma,
    failNextRoomUpdate,
  };
}

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };

describe('CP-5 · BE-P2-26 · BuildingsService.update unlock branch (Q-P5-5 A)', () => {
  it('PRC-06, Q-P5-5 A: unlocking a building applies the current APPROVED price to every active room of it, in the same transaction', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }],
      [
        { id: 101, buildingId: 10, isActive: true, price: 2000000 }, // has a newer APPROVED price
        { id: 102, buildingId: 10, isActive: true, price: 2100000 }, // APPROVED price equals current (unchanged)
        { id: 103, buildingId: 10, isActive: false, price: 2200000 }, // room itself still locked: must not be touched
      ],
      [
        { roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 102, price: 2100000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 103, price: 9999999, effectiveFrom: '2026-11-01', status: 'APPROVED' },
      ],
    );
    const result = await h.service.update(boss, 10, { isActive: true } as any);
    expect(result.isActive).toBe(true);
    expect(h.getRoom(101)?.price).toBe(2500000);
    expect(h.getRoom(102)?.price).toBe(2100000);
    expect(h.getRoom(103)?.price).toBe(2200000); // still-locked room skipped by the helper
  });

  it("Q-P5-5 A: unlocking building A's rooms never touches building B's rooms", async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }, { id: 20, isActive: true }],
      [
        { id: 101, buildingId: 10, isActive: true, price: 2000000 },
        { id: 201, buildingId: 20, isActive: true, price: 3000000 },
      ],
      [
        { roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
        { roomId: 201, price: 3500000, effectiveFrom: '2026-11-01', status: 'APPROVED' },
      ],
    );
    await h.service.update(boss, 10, { isActive: true } as any);
    expect(h.getRoom(101)?.price).toBe(2500000);
    expect(h.getRoom(201)?.price).toBe(3000000); // building 20 untouched
  });

  it('a room with no APPROVED price keeps its old rooms.price (never null) after the building unlocks', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [],
    );
    await h.service.update(boss, 10, { isActive: true } as any);
    expect(h.getRoom(101)?.price).toBe(2000000);
    expect(h.getRoom(101)?.price).not.toBeNull();
  });

  it('a future-dated APPROVED price is not applied yet when the building unlocks today', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 9999999, effectiveFrom: '2099-01-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 10, { isActive: true } as any);
    expect(h.getRoom(101)?.price).toBe(2000000);
  });

  it('rollback: a failure inside the unlock transaction leaves both building.isActive and rooms.price unchanged', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    h.failNextRoomUpdate.current = true; // the price write inside syncRoomPrices fails this once
    await expect(h.service.update(boss, 10, { isActive: true } as any)).rejects.toThrow('simulated db edge failure');
    expect(h.getBuilding(10)?.isActive).toBe(false); // never committed
    expect(h.getRoom(101)?.price).toBe(2000000); // never committed
  });

  it('AUD-01: unlocking without a manager change writes no audit row at all; the price sync adds no new audit action', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false, managerId: null }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 10, { isActive: true } as any);
    expect(h.getRoom(101)?.price).toBe(2500000);
    expect(h.auditRows).toHaveLength(0);
  });

  it('SCOPE-02: a manager outside the building is rejected with OUT_OF_SCOPE before any room is scanned or synced', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: false }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const outsider: AuthUser = { id: 9, role: 'MANAGER', mustChangePassword: false, buildingIds: [99] };
    await expect(h.service.update(outsider, 10, { isActive: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.getBuilding(10)?.isActive).toBe(false);
    expect(h.getRoom(101)?.price).toBe(2000000);
  });

  it('locking a building (isActive:false) does not call syncRoomPrices: rooms.price is untouched even with a pending APPROVED price', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: true }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 10, { isActive: false } as any);
    expect(h.getBuilding(10)?.isActive).toBe(false);
    expect(h.getRoom(101)?.price).toBe(2000000);
  });

  it('a no-op update (same isActive, only description changes) does not call syncRoomPrices', async () => {
    const h = makeHarness(
      [{ id: 10, isActive: true }],
      [{ id: 101, buildingId: 10, isActive: true, price: 2000000 }],
      [{ roomId: 101, price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 10, { description: 'Mô tả mới' } as any);
    expect(h.getRoom(101)?.price).toBe(2000000); // untouched: statusChanged was false, sync never runs
  });
});
