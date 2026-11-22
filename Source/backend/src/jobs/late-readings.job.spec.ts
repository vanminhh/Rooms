import { describe, expect, it, vi } from 'vitest';
import { LateReadingsJob } from './late-readings.job.js';

// NOTI-10 (D-42). Expected days and text come from 19-notifications NOTI-10 and the lateReadings template.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const building = (id: number, name: string, waterMode: string, manager: { fullName: string; isActive: boolean } | null) =>
  ({ id, name, waterMode, managerId: manager ? id * 10 : null, manager });
const A = building(1, 'Tòa A', 'PER_M3', { fullName: 'Quản lý A', isActive: true });
const B = building(2, 'Tòa B', 'PER_PERSON', { fullName: 'Quản lý cũ', isActive: false });
const draft = (id: number, periodEnd: string, b: typeof A, kinds: string[], room = `P${id}`) => ({
  id, periodNo: 2, periodEnd: d(periodEnd), meterReadings: kinds.map(kind => ({ kind })),
  contract: { room: { code: room }, tenant: { fullName: `Khách ${id}` }, building: b } });

function setup(drafts = [draft(1, '2026-10-31', A, ['ELECTRIC'])], boss: { id: number; email: string | null } = { id: 1, email: 'boss@example.test' }) {
  let stored: string | undefined;
  const prisma = {
    invoice: { findMany: vi.fn(async ({ where }: any) => drafts.filter(r => r.periodEnd < where.periodEnd.lt)) },
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, _job: string, day: string) => (stored === day ? 0 : (stored = day, 1))),
    user: { findFirst: vi.fn(async () => boss) },
    notification: { create: vi.fn() },
    setting: { findUnique: vi.fn(async () => null) },
  } as any;
  prisma.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma));
  const mailer = { send: vi.fn(async () => undefined) };
  return { prisma, mailer, job: new LateReadingsJob(prisma as never, mailer as never) };
}

describe('NOTI-10 late readings mail', () => {
  it('NOTI-10: sends on the 2nd and the 10th; nothing on the 1st or the 11th', async () => {
    for (const [day, outcome] of [['2026-11-02', 'SENT'], ['2026-11-10', 'SENT'], ['2026-11-01', 'OUT_OF_WINDOW'], ['2026-11-11', 'OUT_OF_WINDOW']] as const) {
      const { job, mailer, prisma } = setup();
      expect(await job.run(d(day))).toBe(outcome);
      expect(mailer.send).toHaveBeenCalledTimes(outcome === 'SENT' ? 1 : 0);
      if (outcome !== 'SENT') expect(prisma.$executeRaw).not.toHaveBeenCalled();
    }
  });

  it('NOTI-10, Q-P4-16: two runs the same day (cron + start-up) give one mail and one inbox row', async () => {
    const { job, mailer, prisma } = setup();
    expect(await job.run(d('2026-11-02'))).toBe('SENT');
    expect(await job.run(d('2026-11-02'))).toBe('ALREADY_RAN');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(await job.run(d('2026-11-03'))).toBe('SENT');
  });

  it('NOTI-10: no late draft → no mail, logged, and the day is not claimed', async () => {
    const { job, mailer, prisma } = setup([]);
    expect(await job.run(d('2026-11-02'))).toBe('NOTHING_LATE');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('NOTI-10, D-42: a billing date of today is not late yet; a draft left from an earlier month is', async () => {
    const { job, mailer } = setup([draft(1, '2026-11-01', A, []), draft(2, '2026-09-30', A, [])]);
    await job.run(d('2026-11-02')); // period ending 01/11 is billed 02/11 = today
    const { text } = mailer.send.mock.calls[0][0] as any;
    expect(text).toContain('Phòng P2');
    expect(text).not.toContain('Phòng P1 ');
  });

  it('NOTI-10, MTR-06, SCOPE-04: grouped by building with its manager, says which readings are missing', async () => {
    const { job, mailer, prisma } = setup([draft(1, '2026-10-31', A, ['ELECTRIC']), draft(2, '2026-10-31', A, []), draft(3, '2026-10-31', B, ['WATER'])]);
    await job.run(d('2026-11-02'));
    const mail = mailer.send.mock.calls[0][0] as any;
    expect(mail).toMatchObject({ to: 'boss@example.test', subject: 'Còn 3 hóa đơn tháng chờ chỉ số – Trọ Thông Minh' });
    expect(mail.text).toContain([
      'Tòa Tòa A – quản lý Quản lý A',
      '  Phòng P1 · Khách 1 · kỳ 2 · thiếu: nước',
      '  Phòng P2 · Khách 2 · kỳ 2 · thiếu: điện, nước',
      '',
      'Tòa Tòa B – quản lý Boss (chưa có quản lý)',
      '  Phòng P3 · Khách 3 · kỳ 2 · thiếu: điện',
    ].join('\n'));
    expect(mail.text).toContain('Ngày 02/11/2026');
    expect(mailer.send.mock.calls[0][1]).toMatchObject({ idempotencyKey: 'late-readings-2026-11-02' });
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: { userId: 1, kind: 'ANNOUNCEMENT', title: 'Còn 3 hóa đơn tháng chờ chỉ số', link: '/ql/chi-so' } });
  });

  it('NOTI-10, NOTI-04: Boss without email gets no mail and no error; the inbox row is still written (NOTI-11)', async () => {
    const { job, mailer, prisma } = setup(undefined, { id: 1, email: null });
    expect(await job.run(d('2026-11-02'))).toBe('NO_BOSS_EMAIL');
    expect(mailer.send).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('NOTI-07: a failed send is retried once, then logged without throwing', async () => {
    const { job, mailer } = setup();
    mailer.send.mockRejectedValue(new Error('down'));
    expect(await job.run(d('2026-11-02'))).toBe('MAIL_FAILED');
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it('BE-P3-02: the start-up run does nothing under NODE_ENV=test', async () => {
    const { job, prisma } = setup();
    await job.onApplicationBootstrap();
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});
