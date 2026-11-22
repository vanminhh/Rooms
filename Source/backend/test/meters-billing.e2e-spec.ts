import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma as PrismaSql, type Prisma, type Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { contractEndDate, contractPeriods, dueDateOfPeriod } from '../src/common/date/period.js';
import { formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { E2eRun, cleanupContractRun, contractFixtureTerms, e2eName, e2eServiceName, newRunId, randomPassword, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// BE-P4-13 · P4-2 on the real dev PostgreSQL. Expected amounts come from 16-billing BIL-09 and 12-pricing seed tiers.
// One outer transaction that is always rolled back: no fixture row is committed. Single connection, so this is
// not the concurrency proof (that is the second describe).

// Period 1 is the full calendar month two months back, so its billing date has passed (BIL-05) and the
// closing reading on period_end is accepted (MTR-10).
function pastFullMonth(monthsBack = 2) {
  const t = todayHanoi();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - monthsBack, 1));
}

type Tx = Prisma.TransactionClient;

async function seedMonthlyFixture(tx: Tx, runId: string, bossId: number, label: string, waterMode: 'PER_M3' | 'PER_PERSON',
  managerId: number, tenantId: number, withServices: boolean, monthsBack = 2, withDraft = true) {
  const start = pastFullMonth(monthsBack);
  const code = await uniqueBuildingCode(async c => !!await tx.building.findUnique({ where: { code: c }, select: { id: true } }));
  const building = await tx.building.create({ data: { code, name: e2eName(runId, label), address: '[E2E] Hanoi', district: 'Cầu Giấy',
    ward: 'Dịch Vọng', waterMode, managerId } });
  const room = await tx.room.create({ data: { buildingId: building.id, code: 'P1', floor: 1, areaM2: 25, price: 2_500_000 } });
  const plan = (kind: 'ELECTRIC' | 'WATER' | 'SERVICE', tiers: { tierNo: number; upTo?: number; unitPrice: number }[], serviceId?: number) =>
    tx.ratePlan.create({ data: { buildingId: building.id, kind, serviceId, effectiveFrom: start, status: 'APPROVED',
      proposedById: bossId, reviewedById: bossId, reviewedAt: new Date(), tiers: { create: tiers } } });
  await plan('ELECTRIC', [{ tierNo: 1, upTo: 50, unitPrice: 3_000 }, { tierNo: 2, upTo: 100, unitPrice: 3_500 }, { tierNo: 3, unitPrice: 4_000 }]);
  await plan('WATER', [{ tierNo: 1, unitPrice: 15_000 }]);
  const contract = await tx.contract.create({ data: {
    code: `E${Date.now().toString(36).toUpperCase()}${label.length}`.slice(0, 20), buildingId: building.id, roomId: room.id, tenantId,
    startDate: start, termMonths: 6, endDate: contractEndDate(start, 6), rent: 2_500_000, deposit: 2_500_000, status: 'ACTIVE',
    terms: e2eName(runId, 'Contract fixture'), signedAt: start, movedInAt: start, createdById: managerId,
  } });
  for (const [i, name] of ['Người ở 1', 'Người ở 2'].entries()) {
    await tx.occupant.create({ data: { contractId: contract.id, fullName: e2eName(runId, name), isSigner: i === 0, moveInDate: start } });
  }
  if (withServices) {
    const service = async (name: string, unit: 'ROOM' | 'PERSON' | 'VEHICLE', price: number) => {
      const s = await tx.service.create({ data: { buildingId: building.id, name: e2eServiceName(`${runId} ${name}`), unit } });
      await plan('SERVICE', [{ tierNo: 1, unitPrice: price }], s.id);
      return s;
    };
    const wifi = await service('Wifi', 'ROOM', 100_000);
    const rac = await service('Rac', 'PERSON', 30_000);
    const xe = await service('Xe', 'VEHICLE', 100_000);
    await tx.contractService.createMany({ data: [wifi, rac].map(s => ({ contractId: contract.id, serviceId: s.id, buildingId: building.id })) });
    await tx.vehicle.create({ data: { contractId: contract.id, buildingId: building.id, serviceId: xe.id, plate: `E2${runId.slice(-4)}${label.length}`,
      type: 'MOTORBIKE', registeredAt: start } });
  }
  // MTR-02: the contract's own move-in baseline (BIL-09: electric 1.284, water 100 → 106 = 6 m³).
  for (const [kind, value] of [['ELECTRIC', 1_284], ['WATER', 100]] as const) {
    await tx.meterReading.create({ data: { roomId: room.id, contractId: contract.id, kind, value, readOn: start, isOpening: true, readById: managerId } });
  }
  const period = contractPeriods(start, 6)[0];
  const invoice = withDraft ? await tx.invoice.create({ data: { contractId: contract.id, type: 'MONTHLY', periodNo: 1,
    periodStart: period.periodStart, periodEnd: period.periodEnd } }) : null;
  return { buildingId: building.id, roomId: room.id, contractId: contract.id, invoiceId: invoice?.id ?? 0, period, start };
}

describe('BE-P4-07..09 on real PostgreSQL with outer rollback', () => {
  it('MTR-11, BIL-07..09, MTR-03: batch readings issue PER_PERSON at once, PER_M3 after water, totals as BIL-09', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    const runId = newRunId();
    const rollback = new Error('BE-P4-13 expected outer rollback');
    const logs: unknown[][] = [];
    const log = (...args: unknown[]) => { logs.push(args); };
    const logger: LoggerService = { log, error: log, warn: log, debug: log, verbose: log };
    const mailer = { send: vi.fn(async () => {}) };
    const prisma = new PrismaService();
    const owned = { users: [] as number[], invoices: [] as number[], contracts: [] as number[] };
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
            return u;
          };
          const manager = await user('MANAGER', 'Meter manager');
          const foreign = await user('MANAGER', 'Other manager');
          const tenantA = await user('TENANT', 'Tenant PER_M3');
          const tenantB = await user('TENANT', 'Tenant PER_PERSON');
          const managerToken = await tokens.signAccessToken(manager);
          const foreignToken = await tokens.signAccessToken(foreign);

          const m3 = await seedMonthlyFixture(tx, runId, boss.id, 'Meters PER_M3', 'PER_M3', manager.id, tenantA.id, true);
          const pp = await seedMonthlyFixture(tx, runId, boss.id, 'Meters PER_PERSON', 'PER_PERSON', manager.id, tenantB.id, false);
          owned.invoices.push(m3.invoiceId, pp.invoiceId);
          owned.contracts.push(m3.contractId, pp.contractId);
          const readOn = formatDateOnly(m3.period.periodEnd);

          // MTR-09: both drafts are due for this manager, with the contract's own opening readings.
          const due = await api('get', '/meter-readings/due', managerToken).expect(200);
          const dueIds = (due.body.data as { invoiceId: number }[]).map(d => d.invoiceId);
          expect(dueIds).toEqual(expect.arrayContaining([m3.invoiceId, pp.invoiceId]));
          await api('get', `/meter-readings/due?buildingId=${m3.buildingId}`, foreignToken).expect(403);

          // MTR-11: each item is checked on its own; MTR-03: a lower water reading is refused, the others are saved.
          const batch = await api('post', '/meter-readings', managerToken).send([
            { roomId: m3.roomId, kind: 'ELECTRIC', value: 1_368, readOn },
            { roomId: pp.roomId, kind: 'ELECTRIC', value: 1_368, readOn },
            { roomId: m3.roomId, kind: 'WATER', value: 90, readOn },
          ]);
          expect(batch.status).toBeLessThan(300);
          const [a, b, c] = batch.body.data as { ok: boolean; data?: { status: string; reason?: string }; error?: string }[];
          expect(a).toMatchObject({ ok: true, data: { status: 'DRAFT', reason: 'MISSING_READINGS' } }); // PER_M3 waits for water
          expect(b).toMatchObject({ ok: true, data: { status: 'UNPAID' } }); // PER_PERSON issues on electric alone
          expect(c).toMatchObject({ ok: false, error: 'METER_VALUE_DECREASED' });

          // BIL-08/09: a DRAFT without its water reading cannot be issued by hand; another building's manager is out of scope.
          expect((await api('post', `/invoices/${m3.invoiceId}/issue`, managerToken).expect(409)).body.error.code).toBe('CONFLICT_STATE');
          expect((await api('post', `/invoices/${m3.invoiceId}/issue`, foreignToken).expect(403)).body.error.code).toBe('OUT_OF_SCOPE');
          const foreignBatch = await api('post', '/meter-readings', foreignToken).send([{ roomId: m3.roomId, kind: 'WATER', value: 106, readOn }]);
          expect(foreignBatch.body.data[0]).toMatchObject({ ok: false, error: 'OUT_OF_SCOPE' });

          const water = await api('post', '/meter-readings', managerToken).send([{ roomId: m3.roomId, kind: 'WATER', value: 106, readOn }]);
          expect(water.body.data[0]).toMatchObject({ ok: true, data: { status: 'UNPAID' } });

          // A second identical reading for the same room/day is refused, not a second row.
          const again = await api('post', '/meter-readings', managerToken).send([{ roomId: pp.roomId, kind: 'ELECTRIC', value: 1_368, readOn }]);
          expect(again.body.data[0]).toMatchObject({ ok: false });
          expect(await tx.meterReading.count({ where: { contractId: pp.contractId, kind: 'ELECTRIC', isOpening: false } })).toBe(1);

          const issued = await tx.invoice.findUniqueOrThrow({ where: { id: m3.invoiceId }, include: { lines: { orderBy: { id: 'asc' } } } });
          expect(issued).toMatchObject({ status: 'UNPAID', total: 3_119_000 });
          expect(formatDateOnly(issued.issueDate!)).toBe(formatDateOnly(todayHanoi()));
          expect(formatDateOnly(issued.dueDate!)).toBe(formatDateOnly(dueDateOfPeriod(m3.period))); // last day of the billing month
          expect(issued.lines.map(l => [l.kind, l.quantity, l.unitPrice, l.amount])).toEqual([
            ['RENT', 1, 2_500_000, 2_500_000], ['ELECTRIC', 50, 3_000, 150_000], ['ELECTRIC', 34, 3_500, 119_000],
            ['WATER', 6, 15_000, 90_000], ['SERVICE', 1, 100_000, 100_000], ['SERVICE', 2, 30_000, 60_000], ['PARKING', 1, 100_000, 100_000],
          ]);
          expect(issued.lines.reduce((s, l) => s + l.amount, 0)).toBe(issued.total); // DB-B4

          const perPerson = await tx.invoice.findUniqueOrThrow({ where: { id: pp.invoiceId } });
          expect(perPerson).toMatchObject({ status: 'UNPAID', total: 2_500_000 + 269_000 + 2 * 15_000 }); // MTR-06
          expect(await tx.meterReading.count({ where: { invoiceId: { in: owned.invoices }, isOpening: false } })).toBe(3);

          // Q-P4-1: a notification row for each tenant, and one mail each (verified emails).
          expect(await tx.notification.count({ where: { userId: { in: [tenantA.id, tenantB.id] }, kind: 'INVOICE_ISSUED' } })).toBe(2);
          expect(mailer.send).toHaveBeenCalledTimes(2);

          // BIL-09: an UNPAID invoice cannot be issued again.
          expect((await api('post', `/invoices/${m3.invoiceId}/issue`, managerToken).expect(409)).body.error.code).toBe('CONFLICT_STATE');
          // AUD-01: the water reading that completed the invoice wrote one invoice.issue; the refused manual calls wrote none.
          expect(await tx.auditLog.count({ where: { action: 'invoice.issue', entityId: { in: owned.invoices } } })).toBe(2);
          expect(await tx.auditLog.count({ where: { action: 'invoice.issue', entityId: m3.invoiceId, actorId: manager.id } })).toBe(1);
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
          prisma.invoice.count({ where: { id: { in: owned.invoices } } }),
        ]);
        expect(left).toEqual([0, 0, 0]);
        console.log(`BE-P4-13 ${runId}: outer rollback verified; no fixture rows retained`);
      } finally {
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    }
  });
});

// BE-P4-07 / MTR-11: the race needs two real connections, so its fixture is committed (owner 22/11/2026: commit, then
// soft cleanup). Afterwards the fixture's MONTHLY draft and HOLD contract are cancelled with CLEANUP_NOTE and the
// building, room and accounts are deactivated by cleanupContractRun; the readings stay as history.
describe('BE-P4-07: two staff save the same room/day reading at once (committed fixture, soft cleanup)', () => {
  let app: INestApplication, prisma: PrismaService, run: E2eRun | undefined;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
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
      await prisma.$transaction(async tx => {
        if (log.ids.rooms.length) await tx.$queryRaw`SELECT id FROM rooms WHERE id IN (${PrismaSql.join(log.ids.rooms)}) ORDER BY id FOR UPDATE`;
        expect(await cleanupContractRun(tx, log, todayHanoi())).toEqual([]);
      });
      const [open, drafts, rooms, users] = await Promise.all([
        prisma.contract.count({ where: { roomId: { in: log.ids.rooms }, status: { in: ['HOLD', 'ACTIVE'] } } }),
        prisma.invoice.count({ where: { contract: { roomId: { in: log.ids.rooms } }, status: { not: 'CANCELLED' } } }),
        prisma.room.count({ where: { id: { in: log.ids.rooms }, isActive: true } }),
        prisma.user.count({ where: { id: { in: log.ids.users }, isActive: true } }),
      ]);
      expect([open, drafts, rooms, users]).toEqual([0, 0, 0, 0]);
      run.finish('CLEANED');
    } catch (error) {
      run?.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app?.close();
      vi.unstubAllEnvs();
    }
  });

  it('MTR-11: exactly one of two parallel readings is saved; the other gets an item error, never a 500', async () => {
    const r = run!;
    const tokens = app.get(TokenService);
    const hash = await hashPassword(randomPassword());
    const user = async (role: Role, label: string) => {
      const phone = await uniquePhone(async p => !!await prisma.user.findUnique({ where: { phone: p }, select: { id: true } }));
      const u = await prisma.user.create({ data: { role, phone, fullName: e2eName(r.runId, label), passwordHash: hash, mustChangePassword: false,
        email: `${phone}.${r.runId}@example.test`, emailVerifiedAt: new Date() } });
      r.record('users', u.id);
      return u;
    };
    const manager = await user('MANAGER', 'Race manager');
    const tenant = await user('TENANT', 'Race tenant');
    const boss = await prisma.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true } });
    const code = await uniqueBuildingCode(async c => !!await prisma.building.findUnique({ where: { code: c }, select: { id: true } }));
    const building = await prisma.building.create({ data: { code, name: e2eName(r.runId, 'Race PER_M3'), address: '[E2E] Hanoi',
      district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', managerId: manager.id } });
    r.record('buildings', building.id);
    r.recordBuildingCode(code);
    const room = await prisma.room.create({ data: { buildingId: building.id, code: 'P1', floor: 1, areaM2: 25, price: 2_500_000 } });
    r.record('rooms', room.id);
    const start = pastFullMonth();
    // A HOLD fixture (never signed or moved in) so the shared contract cleanup can retire it.
    const contract = await prisma.contract.create({ data: {
      code: `R${Date.now().toString(36).toUpperCase()}`, buildingId: building.id, roomId: room.id, tenantId: tenant.id,
      startDate: start, termMonths: 6, endDate: contractEndDate(start, 6), rent: 2_500_000, deposit: 2_500_000,
      terms: contractFixtureTerms(r.runId), createdById: manager.id,
    } });
    await prisma.meterReading.create({ data: { roomId: room.id, contractId: contract.id, kind: 'ELECTRIC', value: 1_284, readOn: start,
      isOpening: true, readById: manager.id } });
    const period = contractPeriods(start, 6)[0];
    await prisma.invoice.create({ data: { contractId: contract.id, type: 'MONTHLY', periodNo: 1, periodStart: period.periodStart, periodEnd: period.periodEnd } });

    const readOn = formatDateOnly(period.periodEnd);
    const post = async (token: string, value: number) => request(app.getHttpServer()).post('/api/v1/meter-readings')
      .set('Authorization', `Bearer ${token}`).send([{ roomId: room.id, kind: 'ELECTRIC', value, readOn }]);
    const [a, b] = await Promise.all([post(await tokens.signAccessToken(manager), 1_368), post(await tokens.signAccessToken(boss), 1_370)]);
    expect([a.status, b.status].every(s => s < 300)).toBe(true);
    const items = [a.body.data[0], b.body.data[0]] as { ok: boolean; error?: string }[];
    expect(items.filter(i => i.ok)).toHaveLength(1);
    expect(items.find(i => !i.ok)?.error).toBeTruthy();
    expect(await prisma.meterReading.count({ where: { contractId: contract.id, kind: 'ELECTRIC', isOpening: false } })).toBe(1);
  });
});

// BE-P4-10/12 on real PostgreSQL, outer rollback (no row committed). The contract starts four months back, so
// p(1)..p(3) have passed and p(3) is always more than 7 days ago; p(5) is in the future.
describe('BE-P4-10/12: monthly job catch-up and "Tạo hóa đơn kỳ này" (outer rollback)', () => {
  it('BIL-05, BIL-21: the job creates p(1) once, staff create p(2), refusals as specified', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    const runId = newRunId();
    const rollback = new Error('BE-P4-13 expected outer rollback');
    const prisma = new PrismaService();
    let finished = false;
    let contractId = 0;
    try {
      await prisma.$transaction(async tx => {
        const { AppModule } = await import('../src/app.module.js');
        const { MonthlyInvoiceJob } = await import('../src/jobs/monthly-invoice.job.js');
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(PrismaService).useValue(rollbackPrismaFacade(tx))
          .overrideProvider(MailerService).useValue({ send: vi.fn(async () => {}) }).compile();
        const app: INestApplication = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();
        try {
          const tokens = app.get(TokenService);
          const api = (path: string, token: string) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
          const boss = await tx.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true }, select: { id: true } });
          const hash = await hashPassword(randomPassword());
          const user = async (role: Role, label: string) => {
            const phone = await uniquePhone(async p => !!await tx.user.findUnique({ where: { phone: p }, select: { id: true } }));
            return tx.user.create({ data: { role, phone, fullName: e2eName(runId, label), passwordHash: hash, mustChangePassword: false } });
          };
          const manager = await user('MANAGER', 'Job manager');
          const foreign = await user('MANAGER', 'Other manager');
          const tenant = await user('TENANT', 'Job tenant');
          const f = await seedMonthlyFixture(tx, runId, boss.id, 'Monthly job', 'PER_PERSON', manager.id, tenant.id, false, 4, false);
          contractId = f.contractId;
          const periods = contractPeriods(f.start, 6);
          const drafts = () => tx.invoice.findMany({ where: { contractId, type: 'MONTHLY', status: { not: 'CANCELLED' } },
            orderBy: { periodNo: 'asc' }, select: { periodNo: true, periodStart: true, periodEnd: true, createdById: true } });

          // BIL-05 catch-up: a run two days after p(1) creates period 1 with its own dates; a second run creates nothing more.
          const job = app.get(MonthlyInvoiceJob);
          const catchUpDay = new Date(periods[0].billingDate.getTime() + 2 * 86_400_000);
          await job.run(catchUpDay);
          await job.run(catchUpDay);
          expect(await drafts()).toEqual([{ periodNo: 1, periodStart: periods[0].periodStart, periodEnd: periods[0].periodEnd, createdById: null }]);

          const managerToken = await tokens.signAccessToken(manager);
          const foreignToken = await tokens.signAccessToken(foreign);
          const path = `/contracts/${contractId}/monthly-invoices`;
          // BIL-21 refusals: another building's manager, a future billing date, a period outside 1..N.
          expect((await api(path, foreignToken).send({ periodNo: 2 }).expect(403)).body.error.code).toBe('OUT_OF_SCOPE');
          expect((await api(path, managerToken).send({ periodNo: 5 }).expect(409)).body.error.code).toBe('CONFLICT_STATE');
          expect((await api(path, managerToken).send({ periodNo: 7 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
          expect((await api(path, managerToken).send({ periodNo: 0 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');

          const created = await api(path, managerToken).send({ periodNo: 2 });
          expect(created.status).toBeLessThan(300);
          expect(created.body.data).toMatchObject({ periodNo: 2, periodStart: formatDateOnly(periods[1].periodStart),
            periodEnd: formatDateOnly(periods[1].periodEnd), status: 'DRAFT' });
          expect((await api(path, managerToken).send({ periodNo: 2 }).expect(409)).body.error.code).toBe('CONFLICT_STATE');
          expect((await drafts()).map(x => [x.periodNo, x.createdById])).toEqual([[1, null], [2, manager.id]]);
          expect(await tx.auditLog.count({ where: { action: 'invoice.create_missed', actorId: manager.id } })).toBe(1);

          // NOTI-06 money groups are unit-tested (dashboard.money.spec.ts): the dashboard reads in RepeatableRead,
          // which the rollback facade cannot emulate.
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
        expect(await prisma.contract.count({ where: { id: contractId } })).toBe(0);
      } finally {
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    }
  });
});
