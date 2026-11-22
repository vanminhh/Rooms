import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { formatDateOnly } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { e2eName, newRunId, randomPassword, uniquePhone } from '../scripts/e2e/run.js';
import { seedMonthlyFixture } from './fixtures/monthly-fixture.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// BE-P4-28 · P4-5 on the real dev PostgreSQL. Expected results: 17-bank BANK-01..05 and its acceptance cases,
// Q-P4-28..35. Invoice A = BIL-09 (3.119.000), invoice B = PER_PERSON 2.799.000. One outer transaction, always rolled back.
const SECRET = 'e2e-only-webhook-secret';

describe('BE-P4-24..27 bank webhook on real PostgreSQL with outer rollback', () => {
  it('BANK-01..05: verify, insert-first dedup, TT matching, Boss assign and refund', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('BANK_WEBHOOK_SECRET', SECRET);
    const runId = newRunId();
    const rollback = new Error('BE-P4-28 expected outer rollback');
    const log = () => {};
    const logger: LoggerService = { log, error: log, warn: log, debug: log, verbose: log };
    const mailer = { send: vi.fn(async () => {}) };
    const prisma = new PrismaService();
    const owned = { users: [] as number[], txIds: [] as string[] };
    let finished = false;
    try {
      await prisma.$transaction(async tx => {
        const { AppModule } = await import('../src/app.module.js');
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(PrismaService).useValue(rollbackPrismaFacade(tx))
          .overrideProvider(MailerService).useValue(mailer).compile();
        const app: INestApplication = moduleRef.createNestApplication();
        app.useLogger(logger);
        configureApp(app);
        await app.init();
        try {
          const server = app.getHttpServer();
          const tokens = app.get(TokenService);
          const api = (method: 'get' | 'post', path: string, token: string) =>
            request(server)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
          const bossUser = await tx.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true } });
          const bossToken = await tokens.signAccessToken(bossUser);
          const hash = await hashPassword(randomPassword());
          const user = async (role: Role, label: string) => {
            const phone = await uniquePhone(async p => !!await tx.user.findUnique({ where: { phone: p }, select: { id: true } }));
            const u = await tx.user.create({ data: { role, phone, fullName: e2eName(runId, label), passwordHash: hash, mustChangePassword: false,
              email: `${phone}.${runId}@example.test`, emailVerifiedAt: new Date() } });
            owned.users.push(u.id);
            return { ...u, token: await tokens.signAccessToken(u) };
          };
          const manager = await user('MANAGER', 'Bank manager');
          const tenant = await user('TENANT', 'Bank tenant');
          const a = await seedMonthlyFixture(tx, runId, bossUser.id, 'Bank A', 'PER_M3', manager.id, tenant.id, true);
          const b = await seedMonthlyFixture(tx, runId, bossUser.id, 'Bank B', 'PER_PERSON', manager.id, tenant.id, false);
          const readOn = formatDateOnly(a.period.periodEnd);
          await api('post', '/meter-readings', manager.token).send([
            { roomId: a.roomId, kind: 'ELECTRIC', value: 1_368, readOn }, { roomId: a.roomId, kind: 'WATER', value: 106, readOn },
            { roomId: b.roomId, kind: 'ELECTRIC', value: 1_368, readOn }]).expect(201);
          expect(await tx.invoice.findMany({ where: { id: { in: [a.invoiceId, b.invoiceId] } }, select: { id: true, status: true, total: true }, orderBy: { id: 'asc' } }))
            .toEqual([{ id: a.invoiceId, status: 'UNPAID', total: 3_119_000 }, { id: b.invoiceId, status: 'UNPAID', total: 2_799_000 }]);

          const bank = await tx.setting.findUniqueOrThrow({ where: { key: 'bank_account' } });
          const account = (bank.value as { accountNo: string }).accountNo;
          const txId = (n: number) => { const id = `${runId}-${n}`; owned.txIds.push(id); return id; };
          const item = (id: string, amount: number, content: string, accountNumber = account) =>
            ({ id, amount, content, accountNumber, receivedAt: '2026-11-22 10:05:00' });
          const hook = (body: unknown, secret: string | null = SECRET) => {
            const call = request(server).post('/api/v1/webhooks/bank');
            if (secret !== null) call.set('X-Webhook-Secret', secret);
            return call.send(body);
          };
          const rows = () => tx.bankTransaction.findMany({ where: { providerTxId: { startsWith: runId } }, orderBy: { id: 'asc' } });

          // BANK-01 / 17-bank acceptance: a wrong signature → 401 and no row.
          const t1 = txId(1), t2 = txId(2), t3 = txId(3), t4 = txId(4);
          const payload = { transactions: [
            item(t1, 3_119_000, `TT${a.invoiceId} P203`),          // acceptance 1: exact total → MATCHED, PAID
            item(t2, 2_798_999, `TT${b.invoiceId}`),               // acceptance 3: 1 đ short → UNMATCHED, still UNPAID
            item(t3, 2_799_000, `TT${b.invoiceId}`, '9999999999'), // Q-P4-29: another account → kept UNMATCHED
            item(t4, 500_000, 'Chuyen tien phong'),                // no code → UNMATCHED
            item(txId(5), -100_000, 'Debit'),                      // debit → skipped
          ] };
          expect((await hook(payload, 'wrong').expect(401)).body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
          expect((await hook(payload, null).expect(401)).body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
          expect(await rows()).toEqual([]);

          // BANK-01..04: always 200 once verified; each transaction on its own.
          const first = await hook(payload).expect(200);
          expect(first.body.data).toEqual({ received: 4, matched: 1, duplicates: 0, skipped: 1 });
          const stored = await rows();
          expect(stored.map(r => [r.providerTxId, r.status, r.invoiceId, r.note])).toEqual([
            [t1, 'MATCHED', a.invoiceId, null],
            [t2, 'UNMATCHED', null, 'Nội dung TT' + b.invoiceId + ' nhưng số tiền lệch (hóa đơn 2.799.000 đ)'],
            [t3, 'UNMATCHED', null, 'Tiền vào tài khoản 9999999999, không phải tài khoản nhận hiện tại'],
            [t4, 'UNMATCHED', null, null],
          ]);
          expect(stored[0]).toMatchObject({ provider: 'SEPAY', receivedAt: new Date('2026-11-22T03:05:00.000Z'), raw: payload.transactions[0] }); // Q-P4-28, Q-P4-33, BANK-07
          expect(JSON.stringify(stored.map(r => r.raw))).not.toContain(SECRET);
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId }, select: { status: true } })).toEqual({ status: 'PAID' });
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: b.invoiceId }, select: { status: true } })).toEqual({ status: 'UNPAID' });
          expect(await tx.payment.findUniqueOrThrow({ where: { invoiceId: a.invoiceId } })).toMatchObject({
            amount: 3_119_000, source: 'WEBHOOK', method: 'BANK_TRANSFER', bankTransactionId: stored[0].id, recordedById: null });
          // BANK-03, Q-P4-31: tenant row + mail, staff row; AUD-03 actor null.
          expect(await tx.notification.count({ where: { userId: { in: [tenant.id, manager.id] }, kind: 'PAYMENT_RECEIVED', link: { endsWith: `/hoa-don/${a.invoiceId}` } } })).toBe(2);
          expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: tenant.email }), expect.objectContaining({ idempotencyKey: `payment-received-${a.invoiceId}` }));
          expect(await tx.auditLog.count({ where: { action: 'payment.record', actorId: null, after: { path: ['invoiceId'], equals: a.invoiceId } } })).toBe(1);

          // BANK-02: the same webhook again → no new row, still one payment.
          expect((await hook(payload).expect(200)).body.data).toEqual({ received: 0, matched: 0, duplicates: 4, skipped: 1 });
          expect(await rows()).toHaveLength(4);
          expect(await tx.payment.count({ where: { invoiceId: a.invoiceId } })).toBe(1);
          // Acceptance 4: a second transfer for the PAID invoice → UNMATCHED.
          const t6 = txId(6);
          await hook({ transactions: [item(t6, 3_119_000, `TT${a.invoiceId}`)] }).expect(200);
          expect((await rows()).at(-1)).toMatchObject({ providerTxId: t6, status: 'UNMATCHED', note: `Hóa đơn TT${a.invoiceId} đã thanh toán` });

          // Q-P4-35: an empty secret → 503 and the app keeps serving.
          vi.stubEnv('BANK_WEBHOOK_SECRET', '');
          expect((await hook(payload).expect(503)).body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
          vi.stubEnv('BANK_WEBHOOK_SECRET', SECRET);

          // BANK-05 (Boss only): list, assign, refund.
          expect((await api('get', '/bank-transactions?status=UNMATCHED', manager.token).expect(403)).body.error.code).toBe('FORBIDDEN');
          const list = await api('get', '/bank-transactions?status=UNMATCHED&from=2026-11-22&to=2026-11-22', bossToken).expect(200);
          expect(list.headers['cache-control']).toBe('no-store');
          const listed = (list.body.data as { providerTxId: string; raw?: unknown }[]).filter(r => r.providerTxId.startsWith(runId));
          expect(listed.map(r => r.providerTxId).sort()).toEqual([t2, t3, t4, t6].sort());
          expect(listed.every(r => !('raw' in r))).toBe(true);
          const id = (p: string) => stored.find(r => r.providerTxId === p)?.id;
          expect((await api('post', `/bank-transactions/${id(t2)}/assign`, bossToken).send({ invoiceId: b.invoiceId }).expect(409)).body.error.code).toBe('PAYMENT_AMOUNT_MISMATCH');
          const assigned = await api('post', `/bank-transactions/${id(t3)}/assign`, bossToken).send({ invoiceId: b.invoiceId }).expect(201);
          expect(assigned.body.data).toMatchObject({ invoiceId: b.invoiceId, status: 'ASSIGNED' });
          expect(await tx.payment.findUniqueOrThrow({ where: { invoiceId: b.invoiceId } })).toMatchObject({ source: 'ASSIGNED', recordedById: bossUser.id, amount: 2_799_000 });
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: b.invoiceId }, select: { status: true } })).toEqual({ status: 'PAID' });
          expect((await api('post', `/bank-transactions/${id(t3)}/assign`, bossToken).send({ invoiceId: b.invoiceId }).expect(409)).body.error.code).toBe('CONFLICT_STATE');
          expect(await tx.auditLog.count({ where: { action: 'payment.assign', actorId: bossUser.id, after: { path: ['bankTransactionId'], equals: id(t3) } } })).toBe(1);

          expect((await api('post', `/bank-transactions/${id(t2)}/mark-refunded`, bossToken).send({ note: '  ' }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
          const refund = () => api('post', `/bank-transactions/${id(t2)}/mark-refunded`, bossToken).set('Idempotency-Key', `${runId}-refund`).send({ note: 'Đã hoàn qua chuyển khoản' });
          const refunded = await refund().expect(201);
          expect(refunded.body.data).toMatchObject({ status: 'REFUNDED', note: 'Đã hoàn qua chuyển khoản' });
          expect((await refund().expect(201)).body.data).toEqual(refunded.body.data); // API-05: same key replays the first result
          await api('post', `/bank-transactions/${id(t2)}/mark-refunded`, bossToken).send({ note: 'lần hai' }).expect(409);
          await api('post', `/bank-transactions/${id(t1)}/mark-refunded`, bossToken).send({ note: 'đã khớp' }).expect(409); // Q-P4-34
          expect(await tx.auditLog.count({ where: { action: 'payment.refund', entityId: id(t2) } })).toBe(1);
          finished = true;
        } finally {
          await app.close();
        }
        throw rollback;
      }, { maxWait: 10_000, timeout: 540_000 });
      throw new Error('Outer transaction unexpectedly committed');
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      try {
        expect(finished, 'All assertions ran before the rollback').toBe(true);
        const left = await Promise.all([
          prisma.user.count({ where: { id: { in: owned.users } } }),
          prisma.bankTransaction.count({ where: { providerTxId: { in: owned.txIds } } }),
        ]);
        expect(left).toEqual([0, 0]);
        console.log(`BE-P4-28 ${runId}: outer rollback verified; no fixture rows retained`);
      } finally {
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    }
  });
});
