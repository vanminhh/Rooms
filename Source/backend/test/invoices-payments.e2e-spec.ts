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

// BE-P4-23 · P4-4 on the real dev PostgreSQL: issue → staff/tenant reads → remind → reissue → manual payment → PAID.
// Expected amounts: 16-billing BIL-09 (3.119.000) and the seed tiers of the fixture (50 × 3.000, then 3.500 per kWh).
// One outer transaction that is always rolled back: no fixture row is committed.
describe('BE-P4-18..22 on real PostgreSQL with outer rollback', () => {
  it('BIL-08..12, Q-P4-7, SCOPE-02/03: list, detail, /me, remind, reissue and manual payment', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    const runId = newRunId();
    const rollback = new Error('BE-P4-23 expected outer rollback');
    const log = () => {};
    const logger: LoggerService = { log, error: log, warn: log, debug: log, verbose: log };
    const mailer = { send: vi.fn(async () => {}) };
    const prisma = new PrismaService();
    const owned = { users: [] as number[], contracts: [] as number[] };
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
          const tokens = app.get(TokenService);
          const api = (method: 'get' | 'post', path: string, token: string) =>
            request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
          const boss = await tx.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true }, select: { id: true } });
          const hash = await hashPassword(randomPassword());
          const user = async (role: Role, label: string) => {
            const phone = await uniquePhone(async p => !!await tx.user.findUnique({ where: { phone: p }, select: { id: true } }));
            const u = await tx.user.create({ data: { role, phone, fullName: e2eName(runId, label), passwordHash: hash, mustChangePassword: false,
              email: `${phone}.${runId}@example.test`, emailVerifiedAt: new Date() } });
            owned.users.push(u.id);
            return { ...u, token: await tokens.signAccessToken(u) };
          };
          const manager = await user('MANAGER', 'Invoice manager');
          const foreign = await user('MANAGER', 'Other manager');
          const tenant = await user('TENANT', 'Invoice tenant');
          const other = await user('TENANT', 'Other tenant');
          const guest = await user('GUEST', 'Guest');

          const a = await seedMonthlyFixture(tx, runId, boss.id, 'Invoices A', 'PER_M3', manager.id, tenant.id, true);
          const b = await seedMonthlyFixture(tx, runId, boss.id, 'Invoices B', 'PER_M3', manager.id, tenant.id, false);
          owned.contracts.push(a.contractId, b.contractId);
          const readOn = formatDateOnly(a.period.periodEnd);
          const read = (roomId: number, kind: string, value: number) =>
            api('post', '/meter-readings', manager.token).send([{ roomId, kind, value, readOn }]).expect(201);
          await read(a.roomId, 'ELECTRIC', 1_368);
          await read(a.roomId, 'WATER', 106);
          await read(b.roomId, 'ELECTRIC', 1_300); // b stays DRAFT until its water reading

          // BE-P4-18: staff list and detail in scope; "Quá hạn" is derived (due = last day of last month < today).
          const list = await api('get', `/invoices?buildingId=${a.buildingId}&type=MONTHLY`, manager.token).expect(200);
          expect(list.body.meta).toMatchObject({ page: 1, total: 1 });
          expect(list.body.data[0]).toMatchObject({ id: a.invoiceId, code: `TT${a.invoiceId}`, status: 'UNPAID', total: 3_119_000, overdue: true });
          expect((await api('get', `/invoices?buildingId=${a.buildingId}&overdue=true`, manager.token).expect(200)).body.meta.total).toBe(1);
          expect((await api('get', `/invoices?buildingId=${a.buildingId}&overdue=false`, manager.token).expect(200)).body.meta.total).toBe(0);
          expect((await api('get', `/invoices?buildingId=${a.buildingId}`, foreign.token).expect(403)).body.error.code).toBe('OUT_OF_SCOPE');
          expect((await api('get', `/invoices/${a.invoiceId}`, foreign.token).expect(403)).body.error.code).toBe('OUT_OF_SCOPE');
          const detail = (await api('get', `/invoices/${a.invoiceId}`, manager.token).expect(200)).body.data;
          expect(detail.lines).toHaveLength(7);
          expect(detail.meterReadings.map((r: { kind: string; value: number }) => [r.kind, r.value])).toEqual([['ELECTRIC', 1_368], ['WATER', 106]]);
          expect(detail.vietqr).toMatchObject({ amount: 3_119_000, content: `TT${a.invoiceId}` });
          expect(detail.qrImageUrl).toContain(`amount=3119000&addInfo=TT${a.invoiceId}`);

          // BE-P4-19: the tenant sees own invoices across contracts, never a DRAFT; others get 404, guests 403.
          const mine = async () => (await api('get', '/me/invoices', tenant.token).expect(200)).body.data.map((i: { id: number }) => i.id);
          expect(await mine()).toEqual([a.invoiceId]);
          expect((await api('get', `/me/invoices/${b.invoiceId}`, tenant.token).expect(404)).body.error.code).toBe('NOT_FOUND');
          await read(b.roomId, 'WATER', 103);
          expect(new Set(await mine())).toEqual(new Set([a.invoiceId, b.invoiceId]));
          const myDetail = await api('get', `/me/invoices/${a.invoiceId}`, tenant.token).expect(200);
          expect(myDetail.headers['cache-control']).toBe('no-store');
          expect(myDetail.body.data.contract.tenant).toBeUndefined();
          expect(myDetail.body.data.vietqr.content).toBe(`TT${a.invoiceId}`);
          await api('get', `/me/invoices/${a.invoiceId}`, other.token).expect(404);
          expect((await api('get', '/me/invoices', guest.token).expect(403)).body.error.code).toBe('FORBIDDEN');

          // BE-P4-22 (Q-P4-7, Q-P4-26): one manual reminder per invoice per day.
          await api('post', `/invoices/${a.invoiceId}/remind`, manager.token).expect(201);
          expect((await api('post', `/invoices/${a.invoiceId}/remind`, manager.token).expect(429)).body.error.code).toBe('TOO_MANY_REQUESTS');
          expect(await tx.notification.count({ where: { userId: tenant.id, kind: 'INVOICE_OVERDUE', link: `/thue/hoa-don/${a.invoiceId}` } })).toBe(1);

          // BE-P4-21 (BIL-12, Q-P4-24): correct the electric reading 1.368 → 1.378 (94 kWh: 150.000 + 44 × 3.500).
          const reissued = await api('post', `/invoices/${a.invoiceId}/reissue`, manager.token)
            .send({ reason: 'Nhập nhầm số điện', corrections: [{ kind: 'ELECTRIC', value: 1_378 }] }).expect(201);
          const newId = reissued.body.data.invoiceId as number;
          expect(reissued.body.data).toMatchObject({ replacesId: a.invoiceId, status: 'UNPAID', total: 3_154_000 });
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } })).toMatchObject({ status: 'CANCELLED', cancelReason: 'Nhập nhầm số điện', total: 3_119_000 });
          expect(await tx.invoice.count({ where: { contractId: a.contractId, type: 'MONTHLY', periodNo: 1, status: { not: 'CANCELLED' } } })).toBe(1);
          expect(await tx.meterReading.count({ where: { invoiceId: newId } })).toBe(2);
          const audit = await tx.auditLog.findFirstOrThrow({ where: { action: 'invoice.reissue', entityId: newId } });
          expect(audit).toMatchObject({ actorId: manager.id, before: { readings: [expect.objectContaining({ kind: 'ELECTRIC', value: 1_368 })] },
            after: { readings: [expect.objectContaining({ kind: 'ELECTRIC', value: 1_378 })] } });
          await api('post', `/invoices/${a.invoiceId}/reissue`, manager.token).send({ reason: 'Lần hai', corrections: [] }).expect(409);

          // BE-P4-20 (BIL-11): the replacement MONTHLY is paid at its total; a second payment is refused.
          const paid = await api('post', `/invoices/${newId}/payment`, manager.token).send({ method: 'CASH' }).expect(201);
          expect(paid.body.data).toMatchObject({ invoiceId: newId, amount: 3_154_000, source: 'MANUAL', method: 'CASH' });
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: newId }, select: { status: true } })).toEqual({ status: 'PAID' });
          expect((await api('post', `/invoices/${newId}/payment`, manager.token).send({ method: 'CASH' }).expect(409)).body.error.code).toBe('INVOICE_NOT_UNPAID');
          expect(await tx.payment.count({ where: { invoiceId: newId } })).toBe(1);
          expect(await tx.notification.count({ where: { userId: { in: [tenant.id, manager.id] }, kind: 'PAYMENT_RECEIVED', title: { contains: `TT${newId}` } } })).toBe(2);
          await api('post', `/invoices/${newId}/remind`, manager.token).expect(409);
          await api('post', `/invoices/${newId}/reissue`, manager.token).send({ reason: 'x', corrections: [] }).expect(409);
          const paidDetail = (await api('get', `/invoices/${newId}`, manager.token).expect(200)).body.data;
          expect(paidDetail).toMatchObject({ status: 'PAID', replacesId: a.invoiceId, vietqr: null, qrImageUrl: null, payment: { amount: 3_154_000 } });
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
          prisma.contract.count({ where: { id: { in: owned.contracts } } }),
        ]);
        expect(left).toEqual([0, 0]);
        console.log(`BE-P4-23 ${runId}: outer rollback verified; no fixture rows retained`);
      } finally {
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    }
  });
});
