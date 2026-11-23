import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { e2eName, newRunId, randomPassword, uniquePhone } from '../scripts/e2e/run.js';
import { seedMonthlyFixture } from './fixtures/monthly-fixture.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// BE-P4-33 · P4-6 on the real dev PostgreSQL. The fixture contract starts on the 1st two months back (6 full months, rent
// 2.500.000), so today is in period 3 and periods 4..6 remain. Expected amounts follow 16-billing BIL-13..18 and
// Q-P4-36..50 with the fixture prices (electric 50 × 3.000, water 15.000/m³, Wifi 100.000, Rác 30.000 × 2, motorbike 100.000).
// One outer transaction, always rolled back.
describe('BE-P4-29..32 settlement on real PostgreSQL with outer rollback', () => {
  it('BIL-13..19, A-10, Q-P3-3: dry run, real write with a FINAL invoice and its payment; refund of a positive net', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    const runId = newRunId();
    const rollback = new Error('BE-P4-33 expected outer rollback');
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
          const manager = await user('MANAGER', 'Settle manager');
          const foreign = await user('MANAGER', 'Other manager');
          const tenantA = await user('TENANT', 'Settle tenant A');
          const tenantB = await user('TENANT', 'Settle tenant B');
          const a = await seedMonthlyFixture(tx, runId, boss.id, 'Settle A', 'PER_M3', manager.id, tenantA.id, true);
          const b = await seedMonthlyFixture(tx, runId, boss.id, 'Settle B', 'PER_PERSON', manager.id, tenantB.id, false);
          owned.contracts.push(a.contractId, b.contractId);
          const readOn = formatDateOnly(a.period.periodEnd);
          await api('post', '/meter-readings', manager.token).send([
            { roomId: a.roomId, kind: 'ELECTRIC', value: 1_368, readOn }, { roomId: a.roomId, kind: 'WATER', value: 106, readOn },
            { roomId: b.roomId, kind: 'ELECTRIC', value: 1_368, readOn }, { roomId: b.roomId, kind: 'WATER', value: 106, readOn }]).expect(201);
          const today = formatDateOnly(todayHanoi());
          const body = { moveOutDate: today, finalReadings: { electric: 1_400, water: 110 } };
          const settle = (id: number, token: string, dryRun: boolean, payload: object = body) =>
            api('post', `/contracts/${id}/settlement?dryRun=${dryRun}`, token).send(payload);

          // A-10: period 2 was billed on the 1st of this month and has no invoice yet.
          const a10 = await settle(a.contractId, manager.token, true).expect(409);
          expect(a10.body.error).toMatchObject({ code: 'CONFLICT_STATE', fields: { moveOutDate: 'Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước' } });
          for (const c of [a, b]) await api('post', `/contracts/${c.contractId}/monthly-invoices`, manager.token).send({ periodNo: 2 }).expect(201);

          // Scope, roles and the move-out range (Q-P4-10).
          expect((await settle(a.contractId, foreign.token, true).expect(403)).body.error.code).toBe('OUT_OF_SCOPE');
          expect((await settle(a.contractId, tenantA.token, true).expect(403)).body.error.code).toBe('FORBIDDEN');
          for (const moveOutDate of [formatDateOnly(addDays(todayHanoi(), 1)), formatDateOnly(addDays(a.start, -1)), '2026-02-31']) {
            expect((await settle(a.contractId, manager.token, true, { ...body, moveOutDate }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
          }
          expect((await settle(a.contractId, manager.token, true, { ...body, finalReadings: { electric: 1_300, water: 110 } }).expect(400)).body.error.code)
            .toBe('METER_VALUE_DECREASED'); // Q-P4-44
          expect((await settle(a.contractId, manager.token, true, { ...body, damages: 100_000 }).expect(400)).body.error.fields).toHaveProperty('note'); // Q-P4-45

          // BIL-13..18 dry run: nothing written. j = 3; periods 2 (DRAFT) and 3 charged in full; 32 kWh × 3.000 + 4 m³ × 15.000;
          // remaining 3 × 2.500.000; previous debt = period 1 (3.119.000); no deposit invoice → deposit 0.
          const count = () => Promise.all([tx.settlement.count({ where: { contractId: a.contractId } }),
            tx.invoice.count({ where: { contractId: a.contractId } }), tx.meterReading.count({ where: { contractId: a.contractId } })]);
          const before = await count();
          const dry = await settle(a.contractId, manager.token, true).expect(201);
          expect(dry.headers['cache-control']).toBe('no-store');
          const fixedPeriod = 2_500_000 + 100_000 + 2 * 30_000 + 100_000;
          expect(dry.body.data).toMatchObject({ dryRun: true, periodNo: 3, lastPeriodAmount: 2 * fixedPeriod + 96_000 + 60_000,
            remainingRent: 7_500_000, previousDebt: 3_119_000, deposit: 0, net: -(2 * fixedPeriod + 156_000 + 7_500_000 + 3_119_000),
            refund: 0, settlementId: null, finalInvoice: null });
          expect(await count()).toEqual(before);

          // BIL-19: the real write returns the same numbers.
          const real = await settle(a.contractId, manager.token, false).expect(201);
          const { dryRun: _d, settlementId, finalInvoice, ...numbers } = real.body.data;
          const { dryRun: _d2, settlementId: _s, finalInvoice: _f, ...dryNumbers } = dry.body.data;
          expect(numbers).toEqual(dryNumbers);
          expect(finalInvoice).toMatchObject({ total: 16_295_000, dueDate: formatDateOnly(addDays(todayHanoi(), 7)) }); // Q-P4-12
          const draft2 = await tx.invoice.findFirstOrThrow({ where: { contractId: a.contractId, periodNo: 2 } });
          expect(draft2).toMatchObject({ status: 'CANCELLED', cancelReason: 'Gộp vào thanh lý' });
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } })).toMatchObject({ status: 'SETTLED', settlementId });
          expect(await tx.settlement.findUniqueOrThrow({ where: { id: settlementId } })).toMatchObject({ net: -16_295_000, finalInvoiceId: finalInvoice.id });
          expect(await tx.contract.findUniqueOrThrow({ where: { id: a.contractId } })).toMatchObject({ status: 'ENDED' });
          expect(await tx.occupant.count({ where: { contractId: a.contractId, moveOutDate: null } })).toBe(0);
          expect(await tx.vehicle.count({ where: { contractId: a.contractId, isActive: true } })).toBe(0);
          expect(await tx.meterReading.count({ where: { contractId: a.contractId, readOn: todayHanoi(), invoiceId: null } })).toBe(2);
          expect(await tx.user.findUniqueOrThrow({ where: { id: tenantA.id }, select: { isActive: true } })).toEqual({ isActive: true }); // Q-P4-48
          expect(await tx.auditLog.count({ where: { action: 'contract.settle', entityId: a.contractId } })).toBe(1);
          expect(await tx.notification.count({ where: { userId: { in: [tenantA.id, manager.id] }, title: { contains: `TT${finalInvoice.id}` } } })).toBe(2);
          expect((await settle(a.contractId, manager.token, false).expect(409)).body.error.code).toBe('CONFLICT_STATE');

          // The FINAL invoice goes through the existing invoice routes (BIL-10, BIL-11).
          const staffView = (await api('get', `/invoices/${finalInvoice.id}`, manager.token).expect(200)).body.data;
          expect(staffView).toMatchObject({ type: 'FINAL', status: 'UNPAID', total: 16_295_000, vietqr: { content: `TT${finalInvoice.id}` } });
          expect(staffView.lines.at(-1)).toMatchObject({ kind: 'PREVIOUS_DEBT', label: `Nợ hóa đơn TT${a.invoiceId}`, amount: 3_119_000 });
          await api('get', `/me/invoices/${finalInvoice.id}`, tenantA.token).expect(200);
          await api('post', `/invoices/${finalInvoice.id}/payment`, manager.token).send({ method: 'CASH' }).expect(201);
          expect(await tx.invoice.findUniqueOrThrow({ where: { id: finalInvoice.id }, select: { status: true } })).toEqual({ status: 'PAID' });

          // Q-P3-3, Q-P4-8: contract B paid a 20.000.000 deposit and period 1, so the net is positive and refunded once.
          const deposit = await tx.invoice.create({ data: { contractId: b.contractId, type: 'DEPOSIT', periodNo: 0, status: 'UNPAID',
            issueDate: b.start, dueDate: b.start, total: 20_000_000 } });
          await api('post', `/invoices/${deposit.id}/payment`, manager.token).send({ method: 'CASH' }).expect(201);
          await api('post', `/invoices/${b.invoiceId}/payment`, manager.token).send({ method: 'CASH' }).expect(201);
          const refundCase = await settle(b.contractId, manager.token, false).expect(201);
          // PER_PERSON (Q-P4-38): each of periods 2 and 3 = rent + 2 people × 15.000; electric 96.000; water not billed.
          expect(refundCase.body.data).toMatchObject({ deposit: 20_000_000, previousDebt: 0, lastPeriodAmount: 2 * 2_530_000 + 96_000,
            net: 20_000_000 - (2 * 2_530_000 + 96_000) - 7_500_000, finalInvoice: null });
          const sid = refundCase.body.data.settlementId;
          expect(await tx.notification.count({ where: { userId: tenantB.id, kind: 'ANNOUNCEMENT', link: `/thue/hop-dong/${b.contractId}` } })).toBe(1);
          await api('post', `/settlements/${sid}/refund-paid`, manager.token).send({}).expect(400);
          const paid = await api('post', `/settlements/${sid}/refund-paid`, manager.token).send({ method: 'CASH', note: 'Khách nhận tại quầy' }).expect(201);
          expect(paid.body.data).toMatchObject({ settlementId: sid, net: 7_344_000, method: 'CASH' });
          expect((await tx.settlement.findUniqueOrThrow({ where: { id: sid } })).note).toContain('Đã trả lại 7.344.000 đ bằng tiền mặt ngày'); // Q-P4-49
          await api('post', `/settlements/${sid}/refund-paid`, manager.token).send({ method: 'CASH' }).expect(409);
          // Q-P4-54: the contract page reads the settlement after a reload.
          const detailB = (await api('get', `/contracts/${b.contractId}`, manager.token).expect(200)).body.data;
          expect(detailB.settlement).toMatchObject({ id: sid, net: 7_344_000, finalInvoiceId: null, refundPaidAt: expect.any(String) });
          await api('post', `/settlements/${settlementId}/refund-paid`, manager.token).send({ method: 'CASH' }).expect(409); // net < 0
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
        console.log(`BE-P4-33 ${runId}: outer rollback verified; no fixture rows retained`);
      } finally {
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    }
  });
});
