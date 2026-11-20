import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';

const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 11] };

function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  return Object.fromEntries(Object.entries(select).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

function setup() {
  const buildings = new Map<number, any>([
    [10, { id: 10, code: 'CG01', name: 'Tòa A', isActive: true, managerId: 2, manager: { isActive: true } }],
    [11, { id: 11, code: 'DD01', name: 'Tòa B', isActive: true, managerId: 2, manager: { isActive: true } }],
    [20, { id: 20, code: 'HM01', name: 'Tòa C', isActive: true, managerId: null, manager: null }],
    [30, { id: 30, code: 'TX01', name: 'Tòa D', isActive: true, managerId: 3, manager: { isActive: false } }],
    [40, { id: 40, code: 'BD01', name: 'Tòa E', isActive: true, managerId: 4, manager: { isActive: true } }],
  ]);
  const invoices: any[] = [];
  function add(id: number, buildingId = 10, extra: any = {}) {
    const invoice = {
      id, type: 'DEPOSIT', status: 'UNPAID', total: 2_500_000, dueDate: new Date('2027-01-31'),
      contract: {
        id: id + 100, code: `HD${String(id + 100).padStart(6, '0')}`, buildingId, status: 'HOLD',
        room: { id: 1000 + buildingId, code: `P${buildingId}` }, building: buildings.get(buildingId),
        tenant: { id: 15, fullName: 'Khách thuê', phone: '0912345678', passwordHash: 'private-password-hash' },
        signedScanAssetId: 'private-scan', idNumberEnc: 'private-cccd-ciphertext',
      },
      ...extra,
    };
    invoices.push(invoice);
    return invoice;
  }
  function matchBuilding(row: any, where: any): boolean {
    return Object.entries(where).every(([key, expected]: [string, any]) => {
      if (expected === undefined) return true;
      if (key === 'OR') return expected.some((condition: any) => matchBuilding(row, condition));
      if (key === 'manager') return row.manager !== null && row.manager.isActive === expected.isActive;
      if (['id', 'isActive', 'managerId'].includes(key)) return row[key] === expected;
      throw new Error(`Unsupported building filter ${key}`);
    });
  }
  function matches(row: any, where: any): boolean {
    return Object.entries(where).every(([key, expected]: [string, any]) => {
      if (key === 'type' || key === 'status') return row[key] === expected;
      if (key === 'contract') return Object.entries(expected).every(([field, condition]: [string, any]) => {
        if (field === 'buildingId') return condition.in.includes(row.contract.buildingId);
        if (field === 'building') return matchBuilding(row.contract.building, condition);
        throw new Error(`Unsupported contract filter ${field}`);
      });
      throw new Error(`Unsupported invoice filter ${key}`);
    });
  }
  const prisma: any = {
    user: { findFirst: vi.fn(async () => ({ id: 1 })) },
    viewing: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    roomPrice: { count: vi.fn(async () => 0) }, ratePlan: { count: vi.fn(async () => 0) },
    invoice: {
      count: vi.fn(async ({ where }: any) => invoices.filter(row => matches(row, where)).length),
      findMany: vi.fn(async ({ where, select, take }: any) => invoices.filter(row => matches(row, where))
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id - b.id)
        .slice(0, take).map(row => project(row, select))),
    },
  };
  prisma.$transaction = vi.fn(async (work: (tx: typeof prisma) => Promise<unknown>) => work(prisma));
  return { prisma, add, buildings, service: new DashboardService(prisma) };
}

describe('BE-P3-18 / NOTI-06: unpaid deposit tasks', () => {
  it('NOTI-06/SCOPE-02: a manager sees all own UNPAID deposits, including future due dates, and no other invoice types or states', async () => {
    const { service, add } = setup();
    add(70); add(71, 11, { dueDate: new Date('2099-01-01') }); add(72, 40);
    for (const [index, type] of ['MONTHLY', 'FINAL'].entries()) add(80 + index, 10, { type });
    for (const [index, status] of ['PAID', 'CANCELLED', 'DRAFT', 'SETTLED'].entries()) add(90 + index, 10, { status });
    const { unpaidDeposits } = await service.get(manager, {});
    expect(unpaidDeposits.count).toBe(2);
    expect(unpaidDeposits.items.map(item => item.id)).toEqual([70, 71]);
    expect(unpaidDeposits.items[1].dueDate).toBe('2099-01-01');
  });

  it('NOTI-06/SCOPE-04: Boss gets unmanaged and inactive-manager buildings; buildingId only narrows this responsibility', async () => {
    const { service, add } = setup();
    add(70, 10); add(71, 20); add(72, 30); add(73, 40);
    const all = (await service.get(boss, {})).unpaidDeposits;
    expect(all.count).toBe(2);
    expect(all.items.map(item => item.id)).toEqual([71, 72]);
    expect((await service.get(boss, { buildingId: 30 })).unpaidDeposits.items.map(item => item.id)).toEqual([72]);
    expect((await service.get(boss, { buildingId: 10 })).unpaidDeposits).toEqual({ count: 0, items: [] });
    expect((await service.get(boss, { buildingId: 999 })).unpaidDeposits).toEqual({ count: 0, items: [] });
  });

  it('SCOPE-02: the current assignment is applied even when the request carries stale building IDs', async () => {
    const { service, add, buildings } = setup();
    add(70);
    buildings.get(10).managerId = 4;
    expect((await service.get(manager, {})).unpaidDeposits).toEqual({ count: 0, items: [] });
    const current = { ...manager, id: 4, buildingIds: [10, 40] };
    expect((await service.get(current, {})).unpaidDeposits.items.map(item => item.id)).toEqual([70]);
  });

  it('SCOPE-04: deactivating a manager transfers unpaid deposits to Boss without relying on cached scope', async () => {
    const { service, add, buildings } = setup();
    add(70);
    buildings.get(10).manager.isActive = false;
    expect((await service.get(manager, {})).unpaidDeposits.count).toBe(0);
    expect((await service.get(boss, {})).unpaidDeposits.items.map(item => item.id)).toEqual([70]);
  });

  it('SCOPE-02/04: a locked building cannot remain with a stale manager and falls back to Boss when unassigned', async () => {
    const { service, add, buildings } = setup();
    add(70);
    Object.assign(buildings.get(10), { isActive: false, managerId: null, manager: null });
    expect((await service.get(manager, {})).unpaidDeposits.count).toBe(0);
    expect((await service.get(boss, {})).unpaidDeposits.items.map(item => item.id)).toEqual([70]);
  });

  it('API-08: a manager building filter narrows both count and items; an out-of-scope filter performs no invoice query', async () => {
    const { service, add, prisma } = setup();
    add(70); add(71, 11);
    expect((await service.get(manager, { buildingId: 11 })).unpaidDeposits.items.map(item => item.id)).toEqual([71]);
    prisma.invoice.count.mockClear(); prisma.invoice.findMany.mockClear();
    await expect(service.get(manager, { buildingId: 40 })).rejects.toMatchObject({ status: 403 });
    expect(prisma.invoice.count).not.toHaveBeenCalled();
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('NOTI-06: count includes more than five deposits and items use due date then invoice id ordering', async () => {
    const { service, add, prisma } = setup();
    for (const id of [8, 7, 6, 5, 4, 3]) add(id);
    add(9, 10, { dueDate: new Date('2026-01-01') });
    const { unpaidDeposits } = await service.get(manager, {});
    expect(unpaidDeposits.count).toBe(7);
    expect(unpaidDeposits.items.map(item => item.id)).toEqual([9, 3, 4, 5, 6]);
    const findArgs = prisma.invoice.findMany.mock.calls[0][0];
    expect(findArgs.orderBy).toEqual([{ dueDate: 'asc' }, { id: 'asc' }]);
    expect(findArgs.take).toBe(5);
    expect(findArgs.where).toEqual(prisma.invoice.count.mock.calls[0][0].where);
    expect(prisma.$transaction.mock.calls.at(-1)[1]).toEqual({ isolationLevel: 'RepeatableRead' });
  });

  it('NOTI-06/G-09: returns only the invoice and contract display fields, with a derived TT code and business date', async () => {
    const { service, add } = setup(); add(70);
    const result = (await service.get(manager, {})).unpaidDeposits.items[0];
    expect(result).toEqual({
      id: 70, code: 'TT70', total: 2_500_000, dueDate: '2027-01-31',
      contract: {
        id: 170, code: 'HD000170', room: { id: 1010, code: 'P10' },
        building: { id: 10, code: 'CG01', name: 'Tòa A' },
        tenant: { id: 15, fullName: 'Khách thuê', phone: '0912345678' },
      },
    });
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('BIL-11/NOTI-06: receiving the deposit removes its task on the next dashboard query', async () => {
    const { service, add } = setup(); const invoice = add(70);
    expect((await service.get(manager, {})).unpaidDeposits.count).toBe(1);
    invoice.status = 'PAID';
    expect((await service.get(manager, {})).unpaidDeposits).toEqual({ count: 0, items: [] });
  });

  it('NOTI-06: no matching invoice skips item reads and returns the empty group', async () => {
    const { service, prisma } = setup();
    expect((await service.get(manager, {})).unpaidDeposits).toEqual({ count: 0, items: [] });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it.each(['TENANT', 'GUEST'] as const)('API-07: %s cannot read deposit tasks', async role => {
    const { service, prisma } = setup();
    await expect(service.get({ ...manager, role }, {})).rejects.toMatchObject({ status: 403 });
    expect(prisma.invoice.count).not.toHaveBeenCalled();
  });
});
