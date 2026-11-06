import { ForbiddenException } from '@nestjs/common';
import { parseDateOnly } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { RoomsService } from './rooms.service.js';

// CP-5 · BE-P2-26 · PRC-06, Q-P5-5 A, SCOPE-02.
// Unit under test: RoomsService.update (never mocked), exercising its real call into the shared,
// unmocked syncRoomPrices helper. The only mocked edge is the Prisma `$transaction`/tx delegate
// (fake, in-memory, atomic only across one transaction — modelling Postgres rollback).

interface RoomFixture {
  id: number; buildingId: number; isActive: boolean; buildingActive: boolean; price: number;
  underMaintenance?: boolean;
}
interface RoomPriceFixture { price: number; effectiveFrom: string; status: string; reviewedAt?: string | null }

function makeHarness(room: RoomFixture, priceRows: RoomPriceFixture[] = []) {
  let committed: any = {
    id: room.id, buildingId: room.buildingId, code: '101', floor: 1, areaM2: { toString: () => '20' },
    price: room.price, maxOccupants: 2, furniture: [], description: null,
    underMaintenance: room.underMaintenance ?? false, isActive: room.isActive,
  };
  const buildingActive = room.buildingActive;
  const priceRowsFixture = priceRows.map((r) => ({
    roomId: room.id, price: r.price, status: r.status,
    effectiveFrom: parseDateOnly(r.effectiveFrom)!,
    reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : null,
  }));
  const failNextRoomUpdate = { current: false };

  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => {
      const draft = { ...committed };
      const tx: any = {
        $queryRaw: vi.fn(async () => [{ id: draft.id }]),
        room: {
          findUnique: vi.fn(async () => ({ ...draft, images: [] })),
          updateMany: vi.fn(async ({ where, data }: any) => {
            if (draft.isActive !== where.isActive || draft.underMaintenance !== where.underMaintenance) return { count: 0 };
            Object.assign(draft, data);
            return { count: 1 };
          }),
          // Reached only through syncRoomPrices(tx, [id]) inside the unlock branch.
          findMany: vi.fn(async ({ where, select }: any) => {
            let list = [draft];
            if (where.isActive !== undefined) list = list.filter((r) => r.isActive === where.isActive);
            if (where.building?.isActive !== undefined) list = list.filter(() => buildingActive === where.building.isActive);
            if (where.id?.in !== undefined) list = list.filter((r) => where.id.in.includes(r.id));
            return list.map((r) => (select?.price ? { id: r.id, price: r.price } : { id: r.id }));
          }),
          update: vi.fn(async ({ data }: any) => {
            if (failNextRoomUpdate.current) {
              failNextRoomUpdate.current = false;
              throw new Error('simulated db edge failure');
            }
            Object.assign(draft, { price: data.price });
            return draft;
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
        contract: { count: vi.fn(async () => 0) },
        viewing: { count: vi.fn(async () => 0) },
      };
      const result = await callback(tx);
      committed = draft; // commit only after the whole callback resolved, like a real Postgres COMMIT
      return result;
    }),
    room: { findUnique: vi.fn(async () => ({ ...committed, images: [] })) },
  };
  const service = new RoomsService(prisma);
  return { service, getRoom: () => committed, failNextRoomUpdate };
}

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };

describe('CP-5 · BE-P2-26 · RoomsService.update unlock branch (Q-P5-5 A)', () => {
  it('PRC-06, Q-P5-5 A: unlocking a room with one APPROVED price in effect applies it to rooms.price in the same transaction', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const result = await h.service.update(boss, 101, { isActive: true } as any);
    expect(result.isActive).toBe(true);
    expect(h.getRoom().price).toBe(2500000);
  });

  it('unlocking a room with no APPROVED price at all keeps the old rooms.price, never null', async () => {
    const h = makeHarness({ id: 101, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 }, []);
    const result = await h.service.update(boss, 101, { isActive: true } as any);
    expect(result.isActive).toBe(true);
    expect(h.getRoom().price).toBe(2000000);
    expect(h.getRoom().price).not.toBeNull();
  });

  it('unlocking a room with a future-dated APPROVED price does not apply it yet', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 },
      [{ price: 9999999, effectiveFrom: '2099-01-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 101, { isActive: true } as any);
    expect(h.getRoom().price).toBe(2000000);
  });

  it("Q-P5-5 A: unlocking a room whose building is still locked does not apply the price yet (waits for the building's own unlock)", async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: false, buildingActive: false, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const result = await h.service.update(boss, 101, { isActive: true } as any);
    expect(result.isActive).toBe(true); // the room row itself still unlocks
    expect(h.getRoom().price).toBe(2000000); // but the price sync is a no-op while the building is locked
  });

  it('locking a room (isActive:false) does not call syncRoomPrices: rooms.price stays put even with a pending APPROVED price', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 101, { isActive: false } as any);
    expect(h.getRoom().isActive).toBe(false);
    expect(h.getRoom().price).toBe(2000000);
  });

  it('a no-op status update (only description changes) does not call syncRoomPrices', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: true, buildingActive: true, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    await h.service.update(boss, 101, { description: 'Mô tả mới' } as any);
    expect(h.getRoom().price).toBe(2000000);
  });

  it('rollback: a failure inside the unlock transaction leaves both isActive and rooms.price unchanged', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    h.failNextRoomUpdate.current = true;
    await expect(h.service.update(boss, 101, { isActive: true } as any)).rejects.toThrow('simulated db edge failure');
    expect(h.getRoom().isActive).toBe(false); // never committed
    expect(h.getRoom().price).toBe(2000000); // never committed
  });

  it('SCOPE-02: a manager outside the room\'s building is rejected with OUT_OF_SCOPE before the room is ever scanned for sync', async () => {
    const h = makeHarness(
      { id: 101, buildingId: 10, isActive: false, buildingActive: true, price: 2000000 },
      [{ price: 2500000, effectiveFrom: '2026-11-01', status: 'APPROVED' }],
    );
    const outsider: AuthUser = { id: 9, role: 'MANAGER', mustChangePassword: false, buildingIds: [99] };
    await expect(h.service.update(outsider, 101, { isActive: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.getRoom().isActive).toBe(false);
    expect(h.getRoom().price).toBe(2000000);
  });
});
