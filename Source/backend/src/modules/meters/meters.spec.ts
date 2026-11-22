import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { MetersService } from './meters.service.js';

const actor = { id: 7, role: 'MANAGER' as const, mustChangePassword: false, buildingIds: [2] };
const date = (s: string) => new Date(s + 'T00:00:00Z');

describe('MTR-09 / BE-P4-06', () => {
  it('rejects an explicit building outside manager scope before reading invoices', async () => {
    const findMany = vi.fn();
    const service = new MetersService({ invoice: { findMany } } as unknown as PrismaService);
    await expect(service.due(actor, 3)).rejects.toThrow('OUT_OF_SCOPE');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('lists scoped monthly drafts oldest first and uses the preceding period closing for period two', async () => {
    const contract = { building: { id: 2 }, tenant: { id: 10 }, room: { id: 15 },
      meterReadings: [{ kind: 'ELECTRIC', id: 50, value: 100, readOn: date('2026-08-01') }] };
    const draft = { id: 5, contractId: 3, contract, periodNo: 1, periodStart: date('2026-08-01'), periodEnd: date('2026-08-31') };
    const closing = { id: 68, value: 135, readOn: '2026-08-31' };
    const findMany = vi.fn().mockResolvedValueOnce([draft, { ...draft, contractId: 4, periodNo: 2, periodStart: date('2026-09-01'), periodEnd: date('2026-09-30') }])
      .mockResolvedValueOnce([{ contractId: 4, periodNo: 1, lines: [{ kind: 'ELECTRIC', meta: { closing } }] }]);
    const service = new MetersService({ invoice: { findMany } } as unknown as PrismaService);
    const rows = await service.due(actor);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { type: 'MONTHLY', status: 'DRAFT', contract: { buildingId: { in: [2] } } },
      orderBy: [{ periodEnd: 'asc' }, { id: 'asc' }] });
    expect(rows[0]).toMatchObject({ billingDate: '2026-09-01', previousReadings: { ELECTRIC: { id: 50, value: 100 }, WATER: null } });
    expect(rows[1]).toMatchObject({ billingDate: '2026-10-01', previousReadings: { ELECTRIC: closing, WATER: null } });
  });
});
