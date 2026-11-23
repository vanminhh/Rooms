import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma as PrismaSql, type Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { claimDailyRun, type DailyJob } from '../src/jobs/job-state.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { E2eRun, cleanupContractRun, e2eName, randomPassword, uniquePhone } from '../scripts/e2e/run.js';
import { seedMonthlyFixture } from './fixtures/monthly-fixture.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// QA-P4-03 (owner Q-P4-62): two real connections race on the dev DB, so the fixture is committed and soft-cleaned afterwards.
// The test settles its own contract (ENDED), so cleanupContractRun retires room, building and accounts; the fixture's
// invoices, payments and bank transaction stay as [E2E] history. Expected outcomes: BIL-11, BANK-02, BIL-19, Q-P4-16.
const SECRET = 'e2e-only-webhook-secret';

describe('QA-P4-03: money races on two connections (committed fixture, soft cleanup)', () => {
  let app: INestApplication, prisma: PrismaService, run: E2eRun | undefined;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('BANK_WEBHOOK_SECRET', SECRET);
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue({ send: vi.fn(async () => {}) }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    run = new E2eRun(undefined, undefined, 'contracts');
  });

  afterAll(async () => {
    try {
      if (!run) return;
      const { log } = run;
      const skipped = await prisma.$transaction(async tx => {
        if (log.ids.rooms.length) await tx.$queryRaw`SELECT id FROM rooms WHERE id IN (${PrismaSql.join(log.ids.rooms)}) ORDER BY id FOR UPDATE`;
        return cleanupContractRun(tx, log, todayHanoi());
      });
      expect(skipped).toEqual([]);
      const [rooms, buildings, users] = await Promise.all([
        prisma.room.count({ where: { id: { in: log.ids.rooms }, isActive: true } }),
        prisma.building.count({ where: { id: { in: log.ids.buildings }, isActive: true } }),
        prisma.user.count({ where: { id: { in: log.ids.users }, isActive: true } }),
      ]);
      expect([rooms, buildings, users]).toEqual([0, 0, 0]);
      run.finish('CLEANED');
    } catch (error) {
      run?.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app?.close();
      vi.unstubAllEnvs();
    }
  });

  it('BIL-11, BANK-02, Q-P4-16, BIL-19: each race has exactly one winner and the loser a spec error, never a 500', async () => {
    const r = run!;
    const server = app.getHttpServer();
    const tokens = app.get(TokenService);
    const hash = await hashPassword(randomPassword());
    const user = async (role: Role, label: string) => {
      const phone = await uniquePhone(async p => !!await prisma.user.findUnique({ where: { phone: p }, select: { id: true } }));
      const u = await prisma.user.create({ data: { role, phone, fullName: e2eName(r.runId, label), passwordHash: hash, mustChangePassword: false,
        email: `${phone}.${r.runId}@example.test`, emailVerifiedAt: new Date() } });
      r.record('users', u.id);
      return { ...u, token: await tokens.signAccessToken(u) };
    };
    const manager = await user('MANAGER', 'Race manager');
    const tenant = await user('TENANT', 'Race tenant');
    const bossUser = await prisma.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true } });
    const boss = { token: await tokens.signAccessToken(bossUser) };
    const f = await seedMonthlyFixture(prisma, r.runId, bossUser.id, 'Money races', 'PER_M3', manager.id, tenant.id, false);
    const building = await prisma.building.findUniqueOrThrow({ where: { id: f.buildingId }, select: { code: true } });
    r.record('buildings', f.buildingId); r.recordBuildingCode(building.code); r.record('rooms', f.roomId);
    for (const plan of await prisma.ratePlan.findMany({ where: { buildingId: f.buildingId }, select: { id: true } })) r.record('rate_plans', plan.id);
    const api = (method: 'post' | 'get', path: string, token: string) => request(server)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
    const read = (readOn: string, electric: number, water: number) => api('post', '/meter-readings', manager.token).send([
      { roomId: f.roomId, kind: 'ELECTRIC', value: electric, readOn }, { roomId: f.roomId, kind: 'WATER', value: water, readOn }]).expect(201);

    // Race 1 · BIL-11: two staff record a manual payment for the same invoice at once.
    await read(formatDateOnly(f.period.periodEnd), 1_368, 106);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: f.invoiceId }, select: { status: true } })).toEqual({ status: 'UNPAID' });
    const pays = await Promise.all([manager.token, boss.token].map(token => api('post', `/invoices/${f.invoiceId}/payment`, token).send({ method: 'CASH' })));
    expect(pays.map(p => p.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(pays.find(p => p.status === 409)!.body.error.code).toBe('INVOICE_NOT_UNPAID');
    expect(await prisma.payment.count({ where: { invoiceId: f.invoiceId } })).toBe(1);

    // Race 2 · BANK-02: the same webhook arrives twice at once → one stored transaction, one payment.
    const second = await api('post', `/contracts/${f.contractId}/monthly-invoices`, manager.token).send({ periodNo: 2 }).expect(201);
    const invoice2 = second.body.data.invoiceId as number;
    const period2End = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice2 }, select: { periodEnd: true } });
    await read(formatDateOnly(period2End.periodEnd!), 1_400, 110);
    const { total } = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice2 }, select: { total: true, status: true } });
    const account = ((await prisma.setting.findUniqueOrThrow({ where: { key: 'bank_account' } })).value as { accountNo: string }).accountNo;
    const payload = { transactions: [{ id: `${r.runId}-race`, amount: total, content: `TT${invoice2}`, accountNumber: account, receivedAt: '2026-11-23 10:00:00' }] };
    const hooks = await Promise.all([0, 1].map(() => request(server).post('/api/v1/webhooks/bank').set('X-Webhook-Secret', SECRET).send(payload)));
    expect(hooks.map(h => h.status)).toEqual([200, 200]);
    expect(hooks.map(h => [h.body.data.received, h.body.data.duplicates])).toEqual(expect.arrayContaining([[0, 1], [1, 0]]));
    expect(await prisma.bankTransaction.count({ where: { providerTxId: `${r.runId}-race` } })).toBe(1);
    expect(await prisma.payment.count({ where: { invoiceId: invoice2 } })).toBe(1);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: invoice2 }, select: { status: true } })).toEqual({ status: 'PAID' });

    // Race 3 · Q-P4-16: the 08:00 cron and the start-up run claim the same day → exactly one wins. A run-only job key, removed after.
    const job = `e2e_race_${r.runId}` as DailyJob;
    try {
      const claims = await Promise.all([0, 1].map(() => claimDailyRun(prisma, job, todayHanoi())));
      expect(claims.filter(Boolean)).toHaveLength(1);
    } finally {
      await prisma.$executeRaw`UPDATE settings SET value = value - ${job}::text WHERE key = 'job_state'`;
    }

    // Race 4 · BIL-19: two settlements of the same contract at once → one settlement row, the other CONFLICT_STATE.
    const body = { moveOutDate: formatDateOnly(todayHanoi()), finalReadings: { electric: 1_420, water: 112 } };
    const settles = await Promise.all([manager.token, boss.token].map(token => api('post', `/contracts/${f.contractId}/settlement?dryRun=false`, token).send(body)));
    expect(settles.map(s => s.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(settles.find(s => s.status === 409)!.body.error.code).toBe('CONFLICT_STATE');
    expect(await prisma.settlement.count({ where: { contractId: f.contractId } })).toBe(1);
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: f.contractId }, select: { status: true } })).toEqual({ status: 'ENDED' });
    // Close the FINAL invoice so no reminder ever goes to the fixture tenant.
    const finalInvoice = settles.find(s => s.status === 201)!.body.data.finalInvoice as { id: number } | null;
    if (finalInvoice) await api('post', `/invoices/${finalInvoice.id}/payment`, manager.token).send({ method: 'CASH' }).expect(201);
  });
});
