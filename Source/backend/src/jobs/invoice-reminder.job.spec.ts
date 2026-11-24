import { describe, expect, it, vi } from 'vitest';
import { InvoiceReminderJob } from './invoice-reminder.job.js';

// NOTI-05 (Q-P4-17, Q-P4-19, Q-P4-22, Q-P4-23), NOTI-11. Building 1: active manager 7; building 2: no manager → Boss 1.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tenant = (id: number, extra: object = {}) => ({ id, fullName: `Khách ${id}`, role: 'TENANT', locale: 'vi',
  email: `t${id}@example.test`, emailVerifiedAt: d('2026-09-01'), ...extra });
const invoice = (id: number, dueDate: string, extra: { status?: string; type?: string; buildingId?: number; tenant?: object } = {}) => ({
  id, type: extra.type ?? 'MONTHLY', status: extra.status ?? 'UNPAID', total: 2_984_000, dueDate: d(dueDate),
  contract: { buildingId: extra.buildingId ?? 1, room: { code: `P${id}` }, tenant: extra.tenant ?? tenant(100 + id) } });
const contract = (id: number, endDate: string, extra: object = {}) => ({
  id, code: `HD${id}`, status: 'ACTIVE', endDate: d(endDate), buildingId: 1, room: { code: `P${id}` }, building: { name: 'Tòa A' },
  tenant: tenant(200 + id), nextContract: null, settlement: null, ...extra });

function setup(data: { invoices?: any[]; contracts?: any[] } = {}) {
  const invoices = data.invoices ?? [];
  const contracts = data.contracts ?? [];
  const claimed = new Set<string>();
  const prisma: any = {
    invoice: { findMany: vi.fn(async ({ where }: any) => invoices.filter(i => i.status === where.status
      && (where.dueDate instanceof Date ? i.dueDate.getTime() === where.dueDate.getTime() : i.dueDate < where.dueDate.lt))) },
    contract: { findMany: vi.fn(async ({ where }: any) => contracts.filter(c => c.status === where.status &&
      (c.nextContract === null || where.OR?.some((clause: any) => clause.nextContract && clause.nextContract.status === c.nextContract.status))
      && c.settlement === null && where.endDate.in.some((e: Date) => e.getTime() === c.endDate.getTime()))) },
    building: { findMany: vi.fn(async () => [{ id: 1, managerId: 7, manager: { isActive: true } }, { id: 2, managerId: null, manager: null }]) },
    user: { findFirst: vi.fn(async () => ({ id: 1 })),
      findMany: vi.fn(async ({ where }: any) => [{ id: 7, email: 'ql@example.test' }, { id: 1, email: 'boss@example.test' }].filter(u => where.id.in.includes(u.id))) },
    notification: { createMany: vi.fn() },
    setting: { findUnique: vi.fn(async () => null) },
    $executeRaw: vi.fn(async (_s: unknown, _job: string, day: string) => (claimed.has(day) ? 0 : (claimed.add(day), 1))),
  };
  prisma.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma));
  const mailer = { send: vi.fn(async () => undefined) };
  const rows = () => prisma.notification.createMany.mock.calls.flatMap(([a]: any) => a.data);
  const sent = () => mailer.send.mock.calls.map(([mail, opts]: any) => ({ to: mail.to, subject: mail.subject, key: opts.idempotencyKey }));
  return { prisma, mailer, rows, sent, job: new InvoiceReminderJob(prisma as never, mailer as never) };
}

describe('NOTI-05 invoice and contract reminders', () => {
  it('CON-21: cancelling the renewal restores expiry reminders for the source', async () => {
    const { job, rows } = setup({ contracts: [contract(1, '2026-12-22', { nextContract: { status: 'CANCELLED' } })] });
    await job.run(d('2026-11-22'));
    expect(rows().length).toBeGreaterThan(0);
  });
  it('NOTI-05, Q-P4-17: an invoice due 31/10 is reminded on 30/10 by mail only, not on 29/10 or 31/10', async () => {
    for (const [today, count] of [['2026-10-30', 1], ['2026-10-29', 0], ['2026-10-31', 0]] as const) {
      const { job, sent, rows } = setup({ invoices: [invoice(9, '2026-10-31')] });
      await job.run(d(today));
      expect(sent().filter(m => m.subject === 'Hóa đơn TT9 đến hạn ngày mai – Trọ Thông Minh')).toHaveLength(count);
      expect(rows()).toEqual([]);
    }
  });

  it('NOTI-05: overdue reminders on day 1, 4, 7 with a tenant row, a staff row and a mail; none on day 2 or 3', async () => {
    for (const [today, n] of [['2026-11-01', 1], ['2026-11-04', 4], ['2026-11-07', 7], ['2026-11-02', 0], ['2026-11-03', 0]] as const) {
      const { job, sent, rows } = setup({ invoices: [invoice(9, '2026-10-31')] });
      await job.run(d(today));
      if (!n) { expect(sent()).toEqual([]); expect(rows()).toEqual([]); continue; }
      expect(rows()).toEqual([
        { userId: 109, kind: 'INVOICE_OVERDUE', title: `Hóa đơn TT9 đã quá hạn ${n} ngày`, body: 'Số tiền 2.984.000 đ. Hạn thanh toán 31/10/2026.', link: '/thue/hoa-don/9' },
        { userId: 7, kind: 'INVOICE_OVERDUE', title: `Hóa đơn TT9 phòng P9 đã quá hạn ${n} ngày`, body: 'Số tiền 2.984.000 đ. Hạn thanh toán 31/10/2026.', link: '/ql/hoa-don/9' },
      ]);
      expect(sent()).toEqual([{ to: 't109@example.test', subject: `Hóa đơn TT9 đã quá hạn ${n} ngày – Trọ Thông Minh`, key: `invoice-overdue-9-${today}` }]);
    }
  });

  it('Q-P4-23: a DEPOSIT invoice is reminded too; PAID, CANCELLED, SETTLED and DRAFT are not (only UNPAID is queried)', async () => {
    const { job, sent, prisma } = setup({ invoices: [invoice(9, '2026-10-31', { type: 'DEPOSIT' }), invoice(10, '2026-10-31', { status: 'PAID' })] });
    await job.run(d('2026-11-01'));
    expect(sent().map(m => m.key)).toEqual(['invoice-overdue-9-2026-11-01']);
    expect(prisma.invoice.findMany.mock.calls.every(([a]: any) => a.where.status === 'UNPAID' && !('type' in a.where))).toBe(true);
  });

  it('NOTI-05, Q-P4-22: contracts ending in 30 and 7 days → tenant row + mail, staff row, one digest mail per staff member', async () => {
    const { job, sent, rows } = setup({ contracts: [contract(1, '2026-12-22'), contract(2, '2026-11-29'), contract(3, '2026-12-21'), contract(4, '2026-11-29', { buildingId: 2 })] });
    await job.run(d('2026-11-22'));
    expect(rows().filter((r: any) => r.userId === 201)).toEqual([
      { userId: 201, kind: 'CONTRACT_EXPIRING', title: 'Hợp đồng HD1 hết hạn ngày 22/12/2026', link: '/thue/hop-dong/1' }]);
    expect(rows().filter((r: any) => r.userId === 7).map((r: any) => r.title)).toEqual([
      'Hợp đồng HD1 phòng P1 hết hạn ngày 22/12/2026', 'Hợp đồng HD2 phòng P2 hết hạn ngày 29/11/2026']);
    expect(rows().filter((r: any) => r.userId === 1).map((r: any) => r.link)).toEqual(['/ql/hop-dong/4']); // SCOPE-04: no manager → Boss
    const keys = sent().map(m => m.key);
    expect(keys.filter(k => k.startsWith('contract-expiring-staff'))).toEqual(['contract-expiring-staff-7-2026-11-22', 'contract-expiring-staff-1-2026-11-22']);
    expect(keys).toContain('contract-expiring-1-30-2026-11-22');
    expect(keys).toContain('contract-expiring-2-7-2026-11-22');
    expect(keys.some(k => k.startsWith('contract-expiring-3-'))).toBe(false);
  });

  it('Q-P4-19: a contract with a renewal or a settlement, or not ACTIVE, is not reminded', async () => {
    const { job, sent, rows } = setup({ contracts: [contract(1, '2026-12-22', { nextContract: { id: 9 } }), contract(2, '2026-12-22', { settlement: { id: 3 } }),
      contract(3, '2026-12-22', { status: 'ENDED' })] });
    await job.run(d('2026-11-22'));
    expect(sent()).toEqual([]);
    expect(rows()).toEqual([]);
  });

  it('NOTI-04, LOC-06: no tenant mail without a verified address (row still written); English tenant, Vietnamese staff', async () => {
    const { job, sent, rows } = setup({ invoices: [invoice(9, '2026-10-31', { tenant: tenant(109, { email: null }) }), invoice(10, '2026-10-31', { tenant: tenant(110, { locale: 'en' }) })],
      contracts: [contract(1, '2026-12-22', { tenant: tenant(201, { locale: 'en' }) })] });
    await job.run(d('2026-11-01'));
    expect(rows().filter((r: any) => r.userId === 109)).toHaveLength(1);
    expect(sent().map(m => m.subject)).toEqual(['Invoice TT10: 1 day(s) overdue – Trọ Thông Minh']);
    const second = setup({ contracts: [contract(1, '2026-12-22', { tenant: tenant(201, { locale: 'en' }) })] });
    await second.job.run(d('2026-11-22'));
    expect(second.sent().map(m => m.subject)).toEqual(['Contract HD1 ends on 22/12/2026 – Trọ Thông Minh', 'Có 1 hợp đồng sắp hết hạn – Trọ Thông Minh']);
  });

  it('Q-P4-16, Q-P4-4: two runs the same day remind once; nothing due → the day is not claimed', async () => {
    const { job, sent, rows } = setup({ invoices: [invoice(9, '2026-10-31')] });
    expect((await job.run(d('2026-11-01'))).status).toBe('DONE');
    expect((await job.run(d('2026-11-01'))).status).toBe('ALREADY_RAN');
    expect(sent()).toHaveLength(1);
    expect(rows()).toHaveLength(2);
    const empty = setup();
    expect((await empty.job.run(d('2026-11-01'))).status).toBe('NOTHING_DUE');
    expect(empty.prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('NOTI-07: one failing mail is retried once and logged; the other mails still go out', async () => {
    const { job, mailer } = setup({ invoices: [invoice(9, '2026-10-31'), invoice(10, '2026-10-31'), invoice(11, '2026-10-31')] });
    mailer.send.mockImplementation((async (mail: any) => { if (mail.to === 't110@example.test') throw new Error('down'); }) as never);
    const summary = await job.run(d('2026-11-01'));
    expect(summary).toMatchObject({ mails: 2, mailFailures: 1 });
    expect(mailer.send).toHaveBeenCalledTimes(4);
  });

  it('BE-P3-02: the start-up run does nothing under NODE_ENV=test', async () => {
    const { job, prisma } = setup();
    await job.onApplicationBootstrap();
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
