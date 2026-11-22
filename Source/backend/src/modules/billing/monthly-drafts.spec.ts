import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDueMonthlyDrafts, monthlyDraftPlan } from './monthly-drafts.js';

// BIL-05 acceptance (16-billing) on the BIL-01 contract: start 01/09/2026, 6 months, period 1 = 01/09–30/09, p(1) = 01/10.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const BIL01 = { startDate: d('2026-09-01'), termMonths: 6 };
const plan = (today: string, existing: number[] = []) => {
  const p = monthlyDraftPlan(BIL01, existing, d(today));
  return { create: p.create.map(x => x.periodNo), missedOld: p.missedOld.map(x => x.periodNo) };
};

describe('BIL-05 monthly draft plan', () => {
  it('BIL-05: off from 23:50 30/09 to 01:00 01/10 → the start-up run on 01/10 creates period 1 (01/09–30/09)', () => {
    expect(plan('2026-09-30')).toEqual({ create: [], missedOld: [] });
    const p = monthlyDraftPlan(BIL01, [], d('2026-10-01')).create;
    expect(p.map(x => [x.periodNo, x.periodStart, x.periodEnd])).toEqual([[1, d('2026-09-01'), d('2026-09-30')]]);
  });

  it('BIL-05: no run on 01/10 and 02/10 → the 03/10 run creates it once; with the draft present nothing is created', () => {
    expect(plan('2026-10-03')).toEqual({ create: [1], missedOld: [] });
    expect(plan('2026-10-03', [1])).toEqual({ create: [], missedOld: [] });
  });

  it('BIL-05 limit: 7 days after p(k) is still created; 8 days after is only counted (BIL-21)', () => {
    expect(plan('2026-10-08')).toEqual({ create: [1], missedOld: [] });
    expect(plan('2026-10-09')).toEqual({ create: [], missedOld: [1] });
    expect(plan('2026-10-11')).toEqual({ create: [], missedOld: [1] }); // BIL-21: off 30/09 → 11/10
  });

  it('BIL-05, D-13: never a period beyond N; the last one is billed on end_date + 1', () => {
    expect(plan('2027-03-01', [1, 2, 3, 4, 5])).toEqual({ create: [6], missedOld: [] });
    expect(plan('2027-06-01', [1, 2, 3, 4, 5, 6])).toEqual({ create: [], missedOld: [] });
  });
});

describe('BIL-05 job write', () => {
  it('BIL-05: one insert with skipDuplicates; rows a parallel run already made count as "already created"', async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const db = {
      contract: { findMany: vi.fn(async () => [
        { id: 1, ...BIL01, invoices: [] },
        { id: 2, ...BIL01, invoices: [] },
        { id: 3, startDate: d('2026-08-01'), termMonths: 3, invoices: [{ periodNo: 1 }] }, // p(2) = 01/10 → create; nothing missed
      ]) },
      invoice: { createMany },
    } as unknown as Pick<PrismaClient, 'contract' | 'invoice'>;
    expect(await createDueMonthlyDrafts(db, d('2026-10-01'))).toEqual({ contracts: 3, created: 1, alreadyExisting: 2, missedOld: 0 });
    expect(createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: [
      { contractId: 1, type: 'MONTHLY', periodNo: 1, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'), createdById: null },
      { contractId: 2, type: 'MONTHLY', periodNo: 1, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'), createdById: null },
      { contractId: 3, type: 'MONTHLY', periodNo: 2, periodStart: d('2026-09-01'), periodEnd: d('2026-09-30'), createdById: null },
    ] });
    expect((db.contract.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({ status: 'ACTIVE' });
  });

  it('BIL-05: nothing due → no insert at all', async () => {
    const createMany = vi.fn();
    const db = { contract: { findMany: vi.fn(async () => [{ id: 1, ...BIL01, invoices: [] }]) }, invoice: { createMany } } as unknown as Pick<PrismaClient, 'contract' | 'invoice'>;
    expect(await createDueMonthlyDrafts(db, d('2026-09-15'))).toEqual({ contracts: 1, created: 0, alreadyExisting: 0, missedOld: 0 });
    expect(createMany).not.toHaveBeenCalled();
  });
});
