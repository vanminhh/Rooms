import { issuedPeriod } from './billed-period.js';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { BillingService } from './billing.service.js';

// BE-P4-21/22 refusals that end before any write (BIL-12, Q-P4-24/25, Q-P4-7/26). The happy paths run on the dev DB
// in test/invoices-payments.e2e-spec.ts.
const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const reading = (kind: string) => ({ id: kind === 'ELECTRIC' ? 1 : 2, kind, value: 100, isOpening: false, isMeterReplaced: false, oldMeterFinal: null });

function setup(invoice: Record<string, unknown>, extra: { nextIssued?: boolean; remindedToday?: number } = {}) {
  const tx: any = {
    $queryRaw: vi.fn(async () => []),
    invoice: {
      findUnique: vi.fn(async () => ({ contract: { building: { managerId: 2, isActive: true, manager: { isActive: true } } } })),
      findUniqueOrThrow: vi.fn(async () => ({ id: 9, contractId: 3, periodNo: 2, total: 1, dueDate: new Date('2026-10-31'),
        meterReadings: [reading('ELECTRIC'), reading('WATER')], contract: { buildingId: 1, tenantId: 5, room: { code: 'P1' }, tenant: {} }, ...invoice })),
      findFirst: vi.fn(async () => (extra.nextIssued ? { id: 10 } : null)),
      updateMany: vi.fn(),
    },
    auditLog: { count: vi.fn(async () => extra.remindedToday ?? 0) },
    notification: { create: vi.fn() },
  };
  const prisma: any = { $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)) };
  return { tx, service: new BillingService(prisma, { log: vi.fn() } as never, { send: vi.fn() } as never) };
}
const reissue = (service: BillingService, corrections: object[] = []) => service.reissue(boss, 9, { reason: 'Sai số', corrections } as never);

describe('BIL-12 reissue refusals', () => {
  it('Q-P4-25: DEPOSIT and FINAL invoices cannot be reissued (CONFLICT_STATE); PAID MONTHLY neither', async () => {
    for (const invoice of [{ type: 'DEPOSIT', status: 'UNPAID' }, { type: 'FINAL', status: 'UNPAID' }, { type: 'MONTHLY', status: 'PAID' }, { type: 'MONTHLY', status: 'CANCELLED' }]) {
      const { service, tx } = setup(invoice);
      await expect(reissue(service)).rejects.toMatchObject({ status: 409, message: 'CONFLICT_STATE' });
      expect(tx.invoice.updateMany).not.toHaveBeenCalled();
    }
  });

  it('Q-P4-24: a correction for the same meter twice, or for a reading the invoice lacks, is VALIDATION_FAILED', async () => {
    const twice = setup({ type: 'MONTHLY', status: 'UNPAID' });
    await expect(reissue(twice.service, [{ kind: 'ELECTRIC', value: 1 }, { kind: 'ELECTRIC', value: 2 }])).rejects.toMatchObject({ status: 400 });
    const missing = setup({ type: 'MONTHLY', status: 'DRAFT', meterReadings: [reading('ELECTRIC')] });
    await expect(reissue(missing.service, [{ kind: 'WATER', value: 5 }])).rejects.toMatchObject({ status: 400 });
    expect(missing.tx.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('[ASSUMPTION] BIL-12: once the next period is issued, its opening (this closing) reading cannot be corrected', async () => {
    const { service, tx } = setup({ type: 'MONTHLY', status: 'UNPAID' }, { nextIssued: true });
    await expect(reissue(service, [{ kind: 'ELECTRIC', value: 120 }])).rejects.toMatchObject({ status: 409 });
    expect(tx.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ periodNo: 3, ...issuedPeriod }) }));
    expect(tx.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe('Q-P4-7 remind refusals', () => {
  it('Q-P4-7: an invoice that is not UNPAID → CONFLICT_STATE', async () => {
    for (const status of ['DRAFT', 'PAID', 'CANCELLED', 'SETTLED']) {
      const { service, tx } = setup({ status });
      await expect(service.remind(boss, 9)).rejects.toMatchObject({ status: 409 });
      expect(tx.notification.create).not.toHaveBeenCalled();
    }
  });

  it('Q-P4-26: a manual reminder already today (audit invoice.remind since Hà Nội midnight) → TOO_MANY_REQUESTS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-22T20:00:00Z')); // 03:00 on 23/11 in Hà Nội
    try {
      const { service, tx } = setup({ status: 'UNPAID' }, { remindedToday: 1 });
      await expect(service.remind(boss, 9)).rejects.toMatchObject({ status: 429 });
      expect(tx.auditLog.count).toHaveBeenCalledWith({ where: { action: 'invoice.remind', entity: 'invoice', entityId: 9,
        createdAt: { gte: new Date('2026-11-22T17:00:00Z') } } });
      expect(tx.notification.create).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
