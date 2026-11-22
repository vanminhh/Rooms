import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { issueMonthly } from './issue-monthly.js';

const day = (s: string) => new Date(s + 'T00:00:00Z');
function fixture(mode: 'PER_PERSON' | 'PER_M3', withWater = false) {
  const point = (kind: string, id: number, value: number, opening: boolean) => ({
    kind, id, value, isOpening: opening, readOn: day(opening ? '2026-09-01' : '2026-09-30'),
    isMeterReplaced: false, oldMeterFinal: null, photoUrl: null,
  });
  const invoice = { id: 7, type: 'MONTHLY', status: 'DRAFT', periodNo: 1, periodStart: day('2026-09-01'), periodEnd: day('2026-09-30'),
    meterReadings: [point('ELECTRIC', 3, 115, false), ...(withWater ? [point('WATER', 4, 12, false)] : [])],
    contract: { id: 8, tenantId: 9, buildingId: 2, startDate: day('2026-09-01'), termMonths: 6,
      rent: 2000000, building: { waterMode: mode }, tenant: { email: 'test@example.test', emailVerifiedAt: new Date() },
      occupants: [{ moveInDate: day('2026-09-01'), moveOutDate: null }], services: [], vehicles: [] } };
  const db = {
    invoice: { findUniqueOrThrow: vi.fn().mockResolvedValue(invoice), findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(async ({ data }) => ({ id: 7, ...data })) },
    meterReading: { findMany: vi.fn().mockResolvedValue([point('ELECTRIC', 1, 100, true), point('WATER', 2, 10, true)]) },
    ratePlan: { findMany: vi.fn().mockResolvedValue(['ELECTRIC','WATER'].map(kind => ({ kind, tiers: [
      { tierNo: 1, upTo: null, unitPrice: kind === 'ELECTRIC' ? 2000 : 15000 }] }))) },
    setting: { findUnique: vi.fn().mockResolvedValue({ value: { bankBin: '970436', accountNo: '1234', accountName: 'ROOMS' } }) },
    notification: { create: vi.fn() }, invoiceLine: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return { db, tx: db as unknown as Prisma.TransactionClient };
}
describe('BIL-07/08/09 monthly issue', () => {
  afterEach(() => vi.useRealTimers());
  it.each([['PER_PERSON', false, 2045000], ['PER_M3', true, 2060000]] as const)('BIL-07, BIL-08, MTR-06: issues %s with the required readings', async (mode, water, total) => {
    vi.useFakeTimers().setSystemTime(day('2026-10-11'));
    const { db, tx } = fixture(mode, water);
    const result = await issueMonthly(tx, 7);
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'UNPAID', issueDate: day('2026-10-11'), dueDate: day('2026-10-31'), total } });
    expect(result).toMatchObject({ status: 'UNPAID', mail: { to: 'test@example.test', text: expect.stringContaining('TT7') } });
    expect(db.notification.create).toHaveBeenCalledOnce();
    expect(db.invoiceLine.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({
      kind: 'ELECTRIC', amount: 30000, meta: expect.objectContaining({ consumption: 15, opening: expect.objectContaining({ id: 1 }), closing: expect.objectContaining({ id: 3 }) }),
    })]) });
  });
  it('MTR-05, BIL-08: waits for missing metered water and refuses manual issue', async () => {
    const { db, tx } = fixture('PER_M3');
    await expect(issueMonthly(tx, 7)).resolves.toEqual({ status: 'DRAFT', reason: 'MISSING_READINGS' });
    await expect(issueMonthly(tx, 7, true)).rejects.toThrow('CONFLICT_STATE');
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
it.each([false, true])('BIL-08: issues September after its deadline (manual=%s)', async manual => {
  vi.useFakeTimers().setSystemTime(day('2026-11-02'));
  try {
    const { db, tx } = fixture('PER_PERSON');
    expect(await issueMonthly(tx, 7, manual)).toMatchObject({ status: 'UNPAID' });
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({
      issueDate: day('2026-11-02'), dueDate: day('2026-10-31'), status: 'UNPAID',
    }) });
  } finally { vi.useRealTimers(); }
});

describe('MTR-08 (A-04, D-44): abnormal consumption keeps the draft for review', () => {
  const past = (...used: number[]) => used.map((consumption, i) => ({ periodNo: i - used.length + 1, meterReadings: [],
    lines: [{ kind: 'ELECTRIC', meta: { consumption } }] }));

  it('MTR-08: 15 kWh after 5, 5, 5 (more than twice the average) stays DRAFT with the flag; issuing by hand approves it', async () => {
    const { db, tx } = fixture('PER_PERSON');
    db.invoice.findMany.mockResolvedValue(past(5, 5, 5));
    await expect(issueMonthly(tx, 7)).resolves.toEqual({ status: 'DRAFT', reason: 'ABNORMAL_CONSUMPTION' });
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.invoiceLine.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({
      kind: 'ELECTRIC', meta: expect.objectContaining({ reviewRequired: true }) })]) });
    await expect(issueMonthly(tx, 7, true)).resolves.toMatchObject({ status: 'UNPAID' });
  });

  it('MTR-08: exactly twice the average (15 after 7, 8, 7.5 avg) is not abnormal; fewer than 3 periods is never checked', async () => {
    for (const history of [past(7, 8, 7.5), past(1, 1)]) {
      const { db, tx } = fixture('PER_PERSON');
      db.invoice.findMany.mockResolvedValue(history);
      await expect(issueMonthly(tx, 7)).resolves.toMatchObject({ status: 'UNPAID' });
    }
  });
});
