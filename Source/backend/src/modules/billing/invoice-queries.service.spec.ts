import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { InvoiceQueriesService } from './invoice-queries.service.js';

// BE-P4-18/19 query rules (BIL-08 derived overdue, API-08, SCOPE-03, API-07). End to end: test/invoices-payments.e2e-spec.ts.
const manager: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };
const tenant: AuthUser = { id: 5, role: 'TENANT', mustChangePassword: false, buildingIds: null };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

function setup(rows: any[] = []) {
  const prisma: any = {
    invoice: { count: vi.fn(async () => rows.length), findMany: vi.fn(async () => rows), findFirst: vi.fn(async () => null) },
    setting: { findUnique: vi.fn() },
  };
  return { prisma, service: new InvoiceQueriesService(prisma) };
}
const row = (status: string, dueDate: string | null) => ({ id: 7, type: 'MONTHLY', status, periodNo: 1, periodStart: d('2026-10-01'), periodEnd: d('2026-10-31'),
  issueDate: d('2026-11-01'), dueDate: dueDate ? d(dueDate) : null, total: 1, createdAt: new Date(),
  contract: { id: 1, code: 'HD1', room: { id: 1, code: 'P1' }, building: { id: 10, code: 'A', name: 'A' }, tenant: { id: 5, fullName: 'K', phone: '09' } } });

describe('BE-P4-18 staff invoice list', () => {
  afterEach(() => vi.useRealTimers());

  it('BIL-08, D-40: overdue=true is UNPAID with due_date before Hà Nội today; overdue=false is the rest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-30T18:00:00Z')); // 01/12 01:00 in Hà Nội
    const { service, prisma } = setup();
    await service.list(manager, { overdue: true });
    await service.list(manager, { overdue: false });
    const [yes, no] = prisma.invoice.count.mock.calls.map(([a]: any) => a.where.AND[1]);
    expect(yes).toEqual({ status: 'UNPAID', dueDate: { lt: d('2026-12-01') } });
    expect(no).toEqual({ NOT: { status: 'UNPAID', dueDate: { lt: d('2026-12-01') } } });
  });

  it('BIL-08: the overdue flag of an item is derived the same way', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-01T05:00:00Z'));
    const items = (await setup([row('UNPAID', '2026-10-31'), row('UNPAID', '2026-11-01'), row('PAID', '2026-10-31')]).service.list(manager, {})).data;
    expect(items.map(i => i.overdue)).toEqual([true, false, false]);
  });

  it('API-08, SCOPE-02: a manager filter on another building → OUT_OF_SCOPE before any query; own scope is always applied', async () => {
    const { service, prisma } = setup();
    await expect(service.list(manager, { buildingId: 20 })).rejects.toMatchObject({ status: 403, message: 'OUT_OF_SCOPE' });
    expect(prisma.invoice.count).not.toHaveBeenCalled();
    await service.list(manager, { period: '2026-10', type: 'MONTHLY' });
    expect(prisma.invoice.count.mock.calls[0][0].where).toEqual({ contract: { buildingId: { in: [10] } }, type: 'MONTHLY',
      periodStart: { gte: d('2026-10-01'), lt: d('2026-11-01') } });
    await service.list(manager, { status: 'UNPAID', total: 2_799_000 }); // Q-P4-59
    expect(prisma.invoice.count.mock.calls[1][0].where).toEqual({ contract: { buildingId: { in: [10] } }, status: 'UNPAID', total: 2_799_000 });
  });
});

describe('BE-P4-19 tenant invoices', () => {
  it('SCOPE-03, API-07: own invoices only, DRAFT hidden, no tenant block in the item; a GUEST is FORBIDDEN', async () => {
    const { service, prisma } = setup([row('UNPAID', '2026-10-31')]);
    const result = await service.listMine(tenant, {});
    expect(prisma.invoice.count.mock.calls[0][0].where).toEqual({ contract: { tenantId: 5 }, status: { not: 'DRAFT' } });
    expect(result.data[0].contract).not.toHaveProperty('tenant');
    expect(result.meta).toMatchObject({ total: 1 });
    await expect(service.listMine({ ...tenant, role: 'GUEST' }, {})).rejects.toMatchObject({ status: 403 });
  });

  it('SCOPE-03: another tenant\'s or a DRAFT invoice is NOT_FOUND', async () => {
    const { service, prisma } = setup();
    await expect(service.getMine(tenant, 7)).rejects.toMatchObject({ status: 404 });
    expect(prisma.invoice.findFirst.mock.calls[0][0].where).toEqual({ id: 7, contract: { tenantId: 5 }, status: { not: 'DRAFT' } });
  });
});
