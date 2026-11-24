import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { ReportsService } from './reports.service.js';
import { reportRange } from './report-math.js';

it('groups receipts, used deposits and repairs by building and Hanoi month', async () => {
  const january = new Date('2026-12-31T17:00:00Z');
  const december = new Date('2026-12-31T16:59:59Z');
  const a = { buildingId: 1 }, b = { buildingId: 2 };
  const tx = {
    building: { findMany: async () => [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    payment: { findMany: async () => [{ amount: 80000000, paidAt: december, invoice: { type: 'MONTHLY', contract: a } }] },
    settlement: { findMany: async () => [{ createdAt: january, deposit: 3000000, net: 1000000, contract: b }] },
    request: { findMany: async () => [{ resolvedAt: january, cost: 100000, contract: a }] },
    invoice: { findMany: vi.fn().mockResolvedValueOnce([{ contract: a, status: 'UNPAID', type: 'MONTHLY',
      total: 5000000, dueDate: new Date('2020-01-01') }]) },
    $queryRaw: vi.fn().mockResolvedValue([{ buildingId: 2, total: 6000000 }]),
  };
  const db = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) } as unknown as PrismaService;
  const result = await new ReportsService(db).revenue(null, true, reportRange('2026-12', '2027-01'));
  expect(result).toMatchObject({ outstanding: 5000000, overdue: 5000000, depositsHeld: 6000000,
    months: [{ revenue: 80000000, costs: 0 }, { revenue: 2000000, costs: 100000, profit: 1900000 }] });
  expect(result.comparison?.[0].months[1].profit).toBe(-100000);
  expect(result.comparison?.[1].months[1].profit).toBe(2000000);
});

it('computes chain occupancy from room counts, including an empty building', async () => {
  const occupied = { underMaintenance: false, contracts: [{ status: 'ACTIVE' }, { status: 'HOLD' }] };
  const vacant = { underMaintenance: false, contracts: [] };
  const findMany = vi.fn().mockResolvedValue([{ id: 1, name: 'A', rooms: [occupied, vacant, vacant] },
    { id: 2, name: 'B', rooms: [] }]);
  const reports = new ReportsService({ building: { findMany } } as unknown as PrismaService);
  expect(await reports.occupancy(null, true)).toMatchObject({ occupied: 1, rooms: 3, percent: 33.33,
    comparison: [{ occupied: 1 }, { percent: 0 }] });
  expect(await reports.occupancy([1], false)).not.toHaveProperty('comparison');
  expect(findMany.mock.lastCall?.[0].where).toEqual({ id: { in: [1] } });
});
