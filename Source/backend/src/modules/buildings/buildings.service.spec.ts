import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { BuildingsService } from './buildings.service.js';

// CP-5 regression check: this is an UNMODIFIED copy of the main
// src/modules/buildings/buildings.service.spec.ts (existing before CP-5), run here through the
// preview resolver so it exercises the draft-mirrored BuildingsService. If this file goes red,
// the CP-5 mirror broke existing building-unlock behavior (PLAN "Done when": existing
// rooms/buildings tests must stay green against the mirror).

// Prisma and audit are outside edges. The service itself and its assignment helper run unmocked.
const manager = (id: number, role = 'MANAGER', isActive = true) => ({ id, role, isActive });
const building = (overrides: Record<string, unknown> = {}) => ({
  id: 10, code: 'HN01', name: 'Tòa 1', address: 'Phố A', district: 'Ba Đình', ward: 'Phúc Xá',
  waterMode: 'PER_M3', dueDays: 5, managerId: null, manager: null, amenities: [], description: null,
  isActive: true, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), ...overrides,
});
function harness() {
  const state = { buildings: [building()], users: [manager(2), manager(3)], audits: [] as unknown[], viewingRows: [] as unknown[], contracts: [] as Array<{ buildingId: number; status: string }> };
  const tx: any = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: vi.fn(async ({ where }: any) => state.users.find((u: any) => u.id === where.id) ?? null) },
    building: {
      findMany: vi.fn(async ({ where }: any) => state.buildings.filter((b: any) => where.id?.in ? where.id.in.includes(b.id) : where.id ? b.id === where.id : true).filter((b: any) => where.isActive === undefined || b.isActive === where.isActive)),
      count: vi.fn(async ({ where }: any) => state.buildings.filter((b: any) => b.managerId === where.managerId && (where.id?.not === undefined || b.id !== where.id.not)).length),
      findUnique: vi.fn(async ({ where }: any) => {
        const found = state.buildings.find((b: any) => b.id === where.id);
        return found ? { ...found } : null;
      }),
      create: vi.fn(async ({ data }: any) => { const b = building({ ...data, id: state.buildings.length + 10, manager: state.users.find((u: any) => u.id === data.managerId) ?? null }); state.buildings.push(b); return b; }),
      update: vi.fn(async ({ where, data }: any) => { const b: any = state.buildings.find((x: any) => x.id === where.id); Object.assign(b, data, { manager: state.users.find((u: any) => u.id === (data.managerId ?? b.managerId)) ?? null }); return b; }),
      updateMany: vi.fn(async ({ where, data }: any) => { const b: any = state.buildings.find((x: any) => x.id === where.id && x.isActive === where.isActive); if (!b) return { count: 0 }; Object.assign(b, data, { manager: state.users.find((u: any) => u.id === (data.managerId !== undefined ? data.managerId : b.managerId)) ?? null }); return { count: 1 }; }),
    },
    // CP-5: unlocking a building now calls syncRoomPrices(tx, roomIds), which reads tx.room.findMany
    // and tx.roomPrice.findMany; default to no rooms found so pre-existing tests keep their original
    // price-unaware assertions.
    room: { findMany: vi.fn(async () => []) },
    roomPrice: { findMany: vi.fn(async () => []) },
    contract: { count: vi.fn(async ({ where }: any) => state.contracts.filter((c) => c.buildingId === where.buildingId && where.status.in.includes(c.status)).length) },
    viewing: { findMany: vi.fn(async ({ where }: any) => state.viewingRows.filter((viewing: any) => where.status.in.includes(viewing.status) && where.room.buildingId.in.includes(viewing.room.buildingId))) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return data; }) },
  };
  const prisma: any = { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) };
  const audit: any = { log: vi.fn(async (actorId: number, action: string, entity: string, entityId: number, before: unknown, after: unknown, ip: string, db: any) => db.auditLog.create({ data: { actorId, action, entity, entityId, before, after, ip } })) };
  return { service: new BuildingsService(prisma, audit), state, tx, prisma, audit };
}
const boss = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null } as any;

describe('BE-P2-11/12 · BuildingsService', () => {
  it('BLD-01, BLD-06, API-01/02: Boss creates building with default due day and uppercase code; audits assigned manager', async () => {
    const h = harness();
    const result = await h.service.create(boss, { code: 'hn02', name: 'Tòa 2', address: 'Phố B', district: 'Ba Đình', ward: 'Phúc Xá', waterMode: 'PER_M3', managerId: 2 } as any, '127.0.0.1');
    expect(result.code).toBe('HN02');
    expect(result.dueDays).toBe(5);
    expect(result.managerId).toBe(2);
    expect(h.state.audits).toEqual([expect.objectContaining({ action: 'building.manager_change', before: { managerId: null }, after: { managerId: 2 }, actorId: 1, ip: '127.0.0.1' })]);
  });

  it('BLD-03: assigning a manager with two existing buildings conflicts, including inactive buildings', async () => {
    const h = harness();
    h.state.buildings.push(building({ id: 11, managerId: 2, isActive: false }), building({ id: 12, managerId: 2 }));
    await expect(h.service.create(boss, { code: 'HN03', name: 'Tòa 3', address: 'X', district: 'Y', ward: 'Z', waterMode: 'PER_M3', managerId: 2 } as any)).rejects.toThrow('MANAGER_MAX_2_BUILDINGS');
    expect(h.tx.building.create).not.toHaveBeenCalled();
  });

  it('BLD-03: inactive, non-manager and missing targets fail validation with managerId field', async () => {
    for (const candidate of [manager(2, 'MANAGER', false), manager(2, 'BOSS'), null]) {
      const h = harness();
      h.state.users = candidate ? [candidate] : [];
      try { await h.service.create(boss, { code: 'HN02', name: 'Tòa', address: 'X', district: 'Y', ward: 'Z', waterMode: 'PER_M3', managerId: 2 } as any); throw new Error('expected rejection'); }
      catch (error) { expect(error).toBeInstanceOf(BadRequestException); expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { managerId: expect.any(String) } }); }
      expect(h.tx.building.create).not.toHaveBeenCalled();
    }
  });

  it('BLD-02, SCOPE-02: manager updates own amenities and description but cannot touch another building', async () => {
    const h = harness();
    h.state.buildings[0] = building({ managerId: 2 });
    const user = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] } as any;
    await expect(h.service.update(user, 10, { amenities: ['Wifi'], description: 'Mô tả' } as any)).resolves.toMatchObject({ amenities: ['Wifi'], description: 'Mô tả' });
    await expect(h.service.update(user, 10, { address: 'Mới' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.update(user, 11, { description: 'Khác' } as any)).rejects.toMatchObject({ response: { message: 'OUT_OF_SCOPE' } });
  });

  it('BLD-03: unassigning audits the before and after manager ids, same assignment does not re-run the limit check', async () => {
    const h = harness();
    h.state.buildings[0] = building({ managerId: 2, manager: manager(2) });
    await h.service.update(boss, 10, { managerId: null } as any, '10.0.0.1');
    expect(h.state.audits).toEqual([expect.objectContaining({ action: 'building.manager_change', before: { managerId: 2 }, after: { managerId: null }, actorId: 1 })]);
    expect(h.tx.building.count).not.toHaveBeenCalled();
  });

  it('BLD-03/06, D-P23-2: assigning a manager to a locked building conflicts without mutation or audit', async () => {
    const h = harness();
    h.state.buildings[0] = building({ isActive: false });
    await expect(h.service.update(boss, 10, { managerId: 2 } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(h.tx.building.update).not.toHaveBeenCalled();
    expect(h.state.audits).toHaveLength(0);
  });

  it('BLD-06, AUD-01: Boss locks an eligible building, unassigns manager and records exact change audit', async () => {
    const h = harness();
    h.state.buildings[0] = building({ managerId: 2, manager: manager(2) });
    const result = await h.service.update(boss, 10, { isActive: false } as any, '10.0.0.1');
    expect(result).toMatchObject({ isActive: false, managerId: null, pendingViewingCount: 0 });
    expect(h.state.audits).toEqual([expect.objectContaining({ action: 'building.manager_change', before: { managerId: 2 }, after: { managerId: null }, actorId: 1, ip: '10.0.0.1' })]);
    expect(h.tx.building.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 10, isActive: true }, data: expect.objectContaining({ isActive: false, managerId: null }) }));
  });

  it('BLD-06: HOLD or ACTIVE contract blocks lock even when the room is inactive; ENDED and CANCELLED do not', async () => {
    for (const status of ['HOLD', 'ACTIVE']) {
      const h = harness();
      h.state.contracts = [{ buildingId: 10, status }];
      await expect(h.service.update(boss, 10, { isActive: false } as any)).rejects.toBeInstanceOf(ConflictException);
      expect(h.state.buildings[0].isActive).toBe(true);
      expect(h.state.audits).toHaveLength(0);
    }
    for (const status of ['ENDED', 'CANCELLED']) {
      const h = harness();
      h.state.contracts = [{ buildingId: 10, status }];
      await expect(h.service.update(boss, 10, { isActive: false } as any)).resolves.toMatchObject({ isActive: false });
    }
  });

  it('VIEW-13, G-02: pending count includes old and future NEW/CONFIRMED viewings across month and Hanoi midnight; other statuses remain unchanged', async () => {
    const h = harness();
    const dates = ['2026-10-31T16:59:59.000Z', '2026-10-31T17:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z'];
    const statuses = ['NEW', 'CONFIRMED', 'WON', 'LOST', 'CANCELLED'];
    h.state.viewingRows = statuses.map((status, index) => ({ status, visitAt: new Date(dates[index]), note: `unchanged-${index}`, handledById: 99, room: { buildingId: 10 } }));
    const before = structuredClone(h.state.viewingRows);
    const result = await h.service.update(boss, 10, { isActive: false } as any);
    expect(result.pendingViewingCount).toBe(2);
    expect(h.state.viewingRows).toEqual(before);
    expect(h.tx.viewing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ['NEW', 'CONFIRMED'] }, room: { buildingId: { in: [10] } } } }));
  });

  it('BLD-06, SCOPE-02: manager and tenant cannot lock; guest is forbidden', async () => {
    const h = harness();
    const managerUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] } as any;
    const tenant = { id: 3, role: 'TENANT', mustChangePassword: false } as any;
    await expect(h.service.update(managerUser, 10, { isActive: false } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.update(tenant, 10, { isActive: false } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.update({ id: 4, role: 'GUEST' } as any, 10, { isActive: false } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.state.buildings[0].isActive).toBe(true);
    expect(h.state.audits).toHaveLength(0);
  });

  it('BLD-06, BLD-03, D-P23-2: unlock with manager is atomic; invalid target does not unlock', async () => {
    const h = harness();
    h.state.buildings[0] = building({ isActive: false, managerId: null });
    await expect(h.service.update(boss, 10, { isActive: true, managerId: 3 } as any)).resolves.toMatchObject({ isActive: true, managerId: 3 });
    expect(h.state.audits).toEqual([expect.objectContaining({ before: { managerId: null }, after: { managerId: 3 } })]);
    const rejected = harness();
    rejected.state.buildings[0] = building({ isActive: false, managerId: null });
    rejected.state.users = [];
    await expect(rejected.service.update(boss, 10, { isActive: true, managerId: 99 } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(rejected.state.buildings[0].isActive).toBe(false);
    expect(rejected.state.audits).toHaveLength(0);
  });

  it('BLD-06, API-04, D-P23-2: lock plus non-null manager conflicts; same-state update has no fake assignment audit', async () => {
    const h = harness();
    await expect(h.service.update(boss, 10, { isActive: false, managerId: 2 } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(h.state.buildings[0].isActive).toBe(true);
    expect(h.state.audits).toHaveLength(0);
    await h.service.update(boss, 10, { isActive: true } as any);
    expect(h.state.audits).toHaveLength(0);
  });
});
