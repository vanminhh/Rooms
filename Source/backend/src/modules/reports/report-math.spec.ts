import { collected, debt, depositUsed, monthResult, reportRange } from './report-math.js';
import { ReportsController } from './reports.controller.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import type { ReportsService } from './reports.service.js';

describe('RPT-01..06', () => {
  it('keeps archived debt separate from receipts and removes cancelled debt', () => {
    const due = new Date('2026-11-09'), today = new Date('2026-11-10');
    expect(collected('MONTHLY', 80000000)).toBe(80000000);
    expect(debt('MONTHLY', 'UNPAID', 5000000, due, today)).toEqual({ outstanding: 5000000, overdue: 5000000 });
    expect(debt('MONTHLY', 'CANCELLED', 5000000, due, today)).toEqual({ outstanding: 0, overdue: 0 });
    expect(debt('FINAL', 'UNPAID', 5000000, due, due).overdue).toBe(0);
  });
  it('counts used deposits only at settlement, and subtracts repair costs', () => {
    expect(collected('DEPOSIT', 5000000)).toBe(0);
    expect(depositUsed(5000000, -100000)).toBe(5000000);
    expect(monthResult(depositUsed(5000000, 4000000), 100000)).toEqual({ revenue: 1000000, costs: 100000, profit: 900000 });
  });
  it('accepts 24 Hanoi months and defaults to 12 including the current month', () => {
    const now = new Date('2026-11-30T17:00:00Z');
    const range = reportRange(undefined, undefined, now);
    expect(range.months).toHaveLength(12);
    expect(range.months.at(-1)).toBe('2026-12');
    expect(range.gte.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    expect(reportRange('2025-01', '2026-12').months).toHaveLength(24);
    expect(() => reportRange('2024-12', '2026-12')).toThrow();
    expect(() => reportRange('2026-12', '2026-11')).toThrow();
  });
  it('rejects out-of-scope buildings before querying either report', () => {
    const controller = new ReportsController({} as ReportsService);
    const manager = { role: 'MANAGER', buildingIds: [1] } as AuthUser;
    expect(() => controller.revenue(manager, { buildingId: 2 })).toThrow();
    expect(() => controller.occupancy(manager, { buildingId: 2 })).toThrow();
  });
});
