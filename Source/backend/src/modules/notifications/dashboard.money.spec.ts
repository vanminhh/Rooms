import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';

// BE-P4-12 · NOTI-06 money groups. Dates and expected periods come from 16-billing (BIL-05, BIL-21), D-42, CON-20, CON-21.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };
const ref = (id: number) => ({ id, code: `HD${id}`, room: { id: 100 + id, code: 'P1' }, building: { id: 10, code: 'CG01', name: 'Tòa A' },
  tenant: { id: 50 + id, fullName: 'Khách', phone: '0912345678' } });

function setup(rows: { drafts?: unknown[]; open?: unknown[]; contracts?: unknown[] } = {}) {
  const prisma: any = {
    request: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    user: { findFirst: vi.fn(async () => ({ id: 1 })) },
    viewing: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    roomPrice: { count: vi.fn(async () => 0) }, ratePlan: { count: vi.fn(async () => 0) },
    invoice: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async ({ where }: any) => (where.status === 'DRAFT' ? rows.drafts ?? [] : [])),
    },
    contract: {
      count: vi.fn(async () => (rows.contracts ?? []).length),
      findMany: vi.fn(async ({ select }: any) => (select.termMonths ? rows.open ?? [] : rows.contracts ?? [])),
    },
  };
  prisma.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma));
  return { prisma, service: new DashboardService(prisma) };
}
const at = (iso: string) => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date(iso));

describe('NOTI-06 money groups', () => {
  afterEach(() => vi.useRealTimers());

  it('D-42: a draft billed on 01/11 is not late on 01/11 and is red from 02/11; earlier months are red too', async () => {
    const drafts = [
      { id: 7, periodNo: 1, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'), contract: ref(1) },
      { id: 8, periodNo: 2, periodStart: d('2026-10-01'), periodEnd: d('2026-10-31'), contract: ref(1) },
    ];
    at('2026-11-01T05:00:00Z');
    let groups = await setup({ drafts }).service.get(boss, {});
    expect(groups.awaitingReadings).toMatchObject({ count: 2, late: 1 });
    expect(groups.awaitingReadings.items.map(i => [i.code, i.billingDate, i.late])).toEqual([['TT7', '2026-10-01', true], ['TT8', '2026-11-01', false]]);
    at('2026-11-02T05:00:00Z');
    groups = await setup({ drafts }).service.get(boss, {});
    expect(groups.awaitingReadings.late).toBe(2);
  });

  it('BIL-05/BIL-21: an ACTIVE contract lists periods over 7 days old with no invoice; an ENDED one without settlement lists every due one', async () => {
    at('2026-11-03T05:00:00Z');
    const open = [
      // ACTIVE from 01/07 (6 months), invoices for 1 and 2: p(3) = 01/10 is missed; p(4) = 01/11 is still the job's (≤ 7 days).
      { ...ref(1), status: 'ACTIVE', startDate: d('2026-07-01'), termMonths: 6, invoices: [{ periodNo: 1 }, { periodNo: 2 }] },
      // ENDED by a renewal switch, no settlement: p(3) = 01/11 has no invoice and the job no longer looks at ENDED contracts.
      { ...ref(2), status: 'ENDED', startDate: d('2026-08-01'), termMonths: 3, invoices: [{ periodNo: 1 }, { periodNo: 2 }] },
    ];
    const { service, prisma } = setup({ open });
    const { missedPeriods } = await service.get(boss, {});
    expect(missedPeriods.items.map(i => [i.contract.id, i.periodNo, i.periodStart, i.periodEnd, i.invoiceId])).toEqual([
      [1, 3, '2026-09-01', '2026-09-30', null], [2, 3, '2026-10-01', '2026-10-31', null]]);
    const openWhere = prisma.contract.findMany.mock.calls.find(([a]: any) => a.select.termMonths)[0].where;
    expect(openWhere.AND[1]).toEqual({ OR: [{ status: 'ACTIVE' }, { status: 'ENDED', settlement: null }] });
  });

  it('NOTI-06, CON-20, CON-21, BIL-06: overdue invoices and contract groups use the specified filters within the manager\'s buildings', async () => {
    at('2026-11-22T05:00:00Z');
    const { service, prisma } = setup({ contracts: [{ ...ref(3), endDate: d('2026-12-10') }] });
    const groups = await service.get(manager, {});
    const scope = { buildingId: { in: [10] }, building: { id: undefined, isActive: true, managerId: 2, manager: { isActive: true } } };
    expect(prisma.invoice.count).toHaveBeenCalledWith({ where: { type: { not: 'DEPOSIT' }, status: 'UNPAID', dueDate: { lt: d('2026-11-22') }, contract: scope } });
    const groupWheres = prisma.contract.count.mock.calls.map(([a]: any) => a.where.AND);
    expect(groupWheres).toEqual([
      [scope, { status: 'ACTIVE', endDate: { gte: d('2026-11-22'), lte: d('2026-12-22') }, OR: [{ nextContract: null }, { nextContract: { status: 'CANCELLED' } }], settlement: null }],
      [scope, { status: 'ACTIVE', endDate: { lt: d('2026-11-22') }, OR: [{ nextContract: null }, { nextContract: { status: 'CANCELLED' } }], settlement: null }],
      [scope, { status: 'ACTIVE', nextContract: { status: 'HOLD', signedAt: { not: null }, startDate: { lte: d('2026-11-22') } } }],
    ]);
    expect(groups.expiringContracts.items).toEqual([{ ...ref(3), endDate: '2026-12-10' }]);
  });
});
