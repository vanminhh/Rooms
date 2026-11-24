import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { ReportsService } from '../src/modules/reports/reports.service.js';
import { reportRange } from '../src/modules/reports/report-math.js';

it('RPT-01..06 reads a Hanoi month and reconciles the Boss comparison with chain totals', async () => {
  const db = new PrismaService();
  try {
    const reports = new ReportsService(db);
    const range = reportRange();
    const month = range.months[range.months.length - 1];
    const result = await reports.revenue(null, true, reportRange(month, month));
    const buildings = result.comparison!;
    expect(result.months).toHaveLength(1);
    expect(result.months[0].revenue).toBe(buildings.reduce((n, b) => n + b.months[0].revenue, 0));
    expect(result.months[0].costs).toBe(buildings.reduce((n, b) => n + b.months[0].costs, 0));
    expect(result.overdue).toBe(buildings.reduce((n, b) => n + b.overdue, 0));
    const occupancy = await reports.occupancy(null, true);
    expect(occupancy.occupied).toBe(occupancy.comparison!.reduce((n, b) => n + b.occupied, 0));
    const empty = await reports.revenue([], false, reportRange(month, month));
    expect(empty).not.toHaveProperty('comparison');
    expect(empty).toMatchObject({ outstanding: 0, months: [{ month, revenue: 0, costs: 0, profit: 0 }] });
  } finally {
    await db.$disconnect();
  }
}, 60000);
