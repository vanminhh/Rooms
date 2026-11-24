import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { SettlementService } from './settlement.service.js';

// BE-P4-30..32 refusals before any write (BIL-13, Q-P4-42, Q-P4-45, Q-P4-50, Q-P4-8). Happy paths: test/settlement.e2e-spec.ts.
const boss: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const body = { moveOutDate: '2026-11-22', finalReadings: { electric: 1_400, water: 110 } };

function setup(contract: Record<string, unknown> = {}, invoices: unknown[] = []) {
  const tx: any = {
    $queryRaw: vi.fn(async () => []),
    contract: {
      findUnique: vi.fn(async () => ({ roomId: 4, building: { managerId: 2, isActive: true, manager: { isActive: true } } })),
      findUniqueOrThrow: vi.fn(async () => ({ id: 9, code: 'HD9', status: 'ACTIVE', settlement: null, startDate: d('2026-09-01'), termMonths: 6,
        endDate: d('2027-02-28'), previousContractId: null, ...contract })),
    },
    invoice: { findMany: vi.fn(async () => invoices) },
    settlement: { create: vi.fn() },
  };
  const prisma: any = { $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)) };
  return { tx, service: new SettlementService(prisma, { log: vi.fn() } as never, { send: vi.fn() } as never) };
}
const monthly = (id: number, periodNo: number, status = 'UNPAID') => ({ id, contractId: 9, type: 'MONTHLY', status, periodNo, total: 1, payment: null });

describe('BIL-13 settlement refusals', () => {
  afterEach(() => vi.useRealTimers());
  const at = () => vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-11-22T05:00:00Z'));

  it.each([true, false])('D-45: signed HOLD renewal blocks settlement dryRun=%s before money writes', async dryRun => {
    const { service, tx } = setup({ nextContract: { status: 'HOLD', signedAt: d('2026-11-20') } });
    await expect(service.settle(boss, 9, body as never, dryRun)).rejects.toMatchObject({
      status: 409, publicMessage: 'Hợp đồng đã có gia hạn, hãy hủy gia hạn trước',
    });
    expect(tx.invoice.findMany).not.toHaveBeenCalled();
    expect(tx.settlement.create).not.toHaveBeenCalled();
  });

  it('BIL-13, Q-P4-42: only an ACTIVE contract without a settlement is settled (HOLD uses CON-12)', async () => {
    at();
    for (const contract of [{ status: 'HOLD' }, { status: 'ENDED' }, { status: 'CANCELLED' }, { settlement: { id: 3 } }]) {
      const { service, tx } = setup(contract);
      await expect(service.settle(boss, 9, body as never, true)).rejects.toMatchObject({ status: 409, message: 'CONFLICT_STATE' });
      expect(tx.settlement.create).not.toHaveBeenCalled();
    }
  });

  it('Q-P4-50: an invoice of a period after the move-out period is refused instead of charging it twice', async () => {
    at();
    const { service } = setup({}, [monthly(1, 1), monthly(2, 2), monthly(4, 4)]);
    await expect(service.settle(boss, 9, body as never, true)).rejects.toMatchObject({ status: 409,
      response: { fields: { moveOutDate: 'Còn hóa đơn của kỳ sau ngày dọn đi, hãy hủy hoặc lập lại hóa đơn đó trước' } } });
  });

  it('Q-P4-45: the kept deposit cannot exceed the deposit received; kept deposit or damages need a note', async () => {
    at();
    const paidDeposit = { id: 5, contractId: 9, type: 'DEPOSIT', status: 'PAID', periodNo: 0, total: 2_500_000, payment: { amount: 2_500_000 } };
    const over = setup({}, [paidDeposit, monthly(1, 1), monthly(2, 2)]);
    await expect(over.service.settle(boss, 9, { ...body, depositForfeit: 2_500_001, note: 'x' } as never, true)).rejects.toMatchObject({ status: 400,
      response: { fields: { depositForfeit: 'Tiền cọc giữ lại không được vượt số tiền cọc đã nhận' } } });
    const noNote = setup({}, [paidDeposit, monthly(1, 1), monthly(2, 2)]);
    await expect(noNote.service.settle(boss, 9, { ...body, depositForfeit: 500_000 } as never, true)).rejects.toMatchObject({ status: 400 });
  });

  it('Q-P4-10: a move-out date after today is refused before reading the invoices', async () => {
    at();
    const { service, tx } = setup();
    await expect(service.settle(boss, 9, { ...body, moveOutDate: '2026-11-23' } as never, true)).rejects.toMatchObject({ status: 400 });
    expect(tx.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe('Q-P4-8 refund-paid refusals', () => {
  function refund(settlement: { net: number; refundPaidAt: Date | null }) {
    const tx: any = {
      settlement: { findFirst: vi.fn(async () => ({ contract: { building: { managerId: 2, isActive: true, manager: { isActive: true } } } })),
        findUniqueOrThrow: vi.fn(async () => ({ ...settlement, note: null })), updateMany: vi.fn() },
      $queryRaw: vi.fn(async () => []),
    };
    const prisma: any = { $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)) };
    return { tx, service: new SettlementService(prisma, { log: vi.fn() } as never, { send: vi.fn() } as never) };
  }

  it('Q-P4-8, CHECK settlements_refund: net ≤ 0 or already recorded → CONFLICT_STATE, nothing written', async () => {
    for (const s of [{ net: 0, refundPaidAt: null }, { net: -5, refundPaidAt: null }, { net: 100, refundPaidAt: new Date() }]) {
      const { service, tx } = refund(s);
      await expect(service.refundPaid(boss, 3, { method: 'CASH' })).rejects.toMatchObject({ status: 409 });
      expect(tx.settlement.updateMany).not.toHaveBeenCalled();
    }
  });
});
