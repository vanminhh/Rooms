import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { contractEndDate, contractPeriods } from '../src/common/date/period.js';
import { addDays } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { BankTransactionsService } from '../src/modules/bank/bank-transactions.service.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { switchRenewal } from '../src/modules/billing/renewal-switch.js';
import { ContractOccupantsService } from '../src/modules/contracts/contract-occupants.service.js';
import { ContractVehiclesService } from '../src/modules/contracts/contract-vehicles.service.js';
import { RequestsService } from '../src/modules/requests/requests.service.js';
import { E2eRun, e2eName, e2eServiceName, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

type Tx = Prisma.TransactionClient;

// Pin both transactions before releasing either participant. A pool serializing them
// must fail the check instead of producing a misleading sequential success.
async function race<T>(db: PrismaService, work: (tx: Tx) => Promise<T>) {
  const pids = new Set<number>();
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  const timer = setTimeout(release, 30_000);
  const participant = () => db.$transaction(async tx => {
    const [session] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    pids.add(session.pid);
    if (pids.size === 2) release();
    await ready;
    expect(pids.size).toBe(2);
    return work(tx);
  }, { isolationLevel: 'ReadCommitted', maxWait: 35_000, timeout: 120_000 });
  try {
    const outcomes = await Promise.allSettled([participant(), participant()]);
    expect(pids.size).toBe(2);
    return outcomes;
  }
  finally { clearTimeout(timer); }
}

async function seed(tx: Tx, run: E2eRun) {
  const user = async (role: 'MANAGER' | 'TENANT') => {
    const phone = await uniquePhone(async p => !!await tx.user.findUnique({ where: { phone: p } }));
    return tx.user.create({ data: { role, phone, fullName: e2eName(run.runId, role), passwordHash: 'fixture', mustChangePassword: false } });
  };
  const manager = await user('MANAGER'), tenant = await user('TENANT');
  const code = await uniqueBuildingCode(async c => !!await tx.building.findUnique({ where: { code: c } }));
  const building = await tx.building.create({ data: { code, name: e2eName(run.runId, 'M9'), address: '[E2E]', district: 'Test',
    ward: 'Test', waterMode: 'PER_M3', managerId: manager.id } });
  const rent = 2500000;
  const room = await tx.room.create({ data: { buildingId: building.id, code: 'R1', floor: 1, areaM2: 25, price: rent } });
  const service = await tx.service.create({ data: { buildingId: building.id, name: e2eServiceName(run.runId), unit: 'VEHICLE' } });
  const start = new Date('2090-01-01');
  const base = { roomId: room.id, buildingId: building.id, tenantId: tenant.id, createdById: manager.id,
    terms: e2eName(run.runId, 'M9'), termMonths: 3, rent, deposit: rent };
  const source = await tx.contract.create({ data: { ...base, code: 'M9S' + room.id, status: 'ACTIVE',
    startDate: start, endDate: contractEndDate(start, 3), signedAt: start, movedInAt: start,
    occupants: { create: { fullName: tenant.fullName, isSigner: true, moveInDate: start } } } });
  const switchDate = addDays(source.endDate, 1);
  const next = await tx.contract.create({ data: { ...base, code: 'M9N' + room.id, status: 'HOLD', previousContractId: source.id,
    signedAt: start, startDate: switchDate, endDate: contractEndDate(switchDate, 3) } });
  const last = contractPeriods(start, 3).at(-1)!;
  const invoice = await tx.invoice.create({ data: { contractId: source.id, type: 'MONTHLY', periodNo: last.periodNo,
    periodStart: last.periodStart, periodEnd: last.periodEnd } });
  for (const kind of ['WATER', 'ELECTRIC'] as const) await tx.meterReading.create({ data: { roomId: room.id,
    contractId: source.id, invoiceId: invoice.id, kind, value: 10, readOn: last.periodEnd, readById: manager.id } });
  const plate = 'E2M' + room.id;
  const request = await tx.request.create({ data: { contractId: source.id, createdById: tenant.id, type: 'VEHICLE_CHANGE',
    title: 'M9 parking', payload: { add: [{ type: 'CAR', plate, serviceId: service.id }] } } });
  run.record('users', manager.id); run.record('users', tenant.id); run.record('buildings', building.id);
  run.recordBuildingCode(code); run.record('rooms', room.id); run.record('services', service.id);
  return { manager, tenant, building, room, service, source, next, switchDate, plate, request, invoice };
}

async function retireFixture(db: PrismaService, run: E2eRun, f: Awaited<ReturnType<typeof seed>>) {
  const terms = e2eName(run.runId, 'M9');
  await db.$transaction(async tx => {
    const ids = [f.source.id, f.next.id];
    await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${f.room.id} FOR UPDATE`;
    expect(await tx.contract.count({ where: { buildingId: f.building.id } })).toBe(2);
    const retired = await tx.contract.updateMany({ where: { id: { in: ids }, roomId: f.room.id, tenantId: f.tenant.id,
      terms }, data: { status: 'ENDED', endedAt: new Date() } });
    expect(retired.count).toBe(2);
    await tx.request.updateMany({ where: { id: f.request.id, contractId: f.source.id, status: 'PENDING' },
      data: { status: 'CANCELLED' } });
    expect(await tx.request.count({ where: { id: f.request.id, status: { notIn: ['APPROVED', 'CANCELLED'] } } })).toBe(0);
    await tx.occupant.updateMany({ where: { contractId: { in: ids }, moveOutDate: null }, data: { moveOutDate: f.switchDate } });
    await tx.vehicle.updateMany({ where: { contractId: { in: ids }, plate: f.plate, isActive: true }, data: { isActive: false, removedAt: f.switchDate } });
    await tx.invoice.update({ where: { id: f.invoice.id }, data: { status: 'CANCELLED', cancelReason: 'M9 fixture cleanup' } });
    await tx.room.update({ where: { id: f.room.id }, data: { isActive: false } });
    await tx.service.update({ where: { id: f.service.id }, data: { isActive: false } });
    await tx.building.update({ where: { id: f.building.id }, data: { isActive: false } });
    await tx.user.updateMany({ where: { id: { in: [f.manager.id, f.tenant.id] } }, data: { isActive: false } });
  }, { timeout: 120_000 });
}

it('QA-P5-04: two connections approve once and switch once, copying one occupant and one vehicle', async () => {
  const { AppModule } = await import('../src/app.module.js');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const db = mod.get(PrismaService);
  let run: E2eRun | undefined;
  let fixture: Awaited<ReturnType<typeof seed>> | undefined;
  try {
    await db.$queryRaw`SELECT 1`;
    const log = new E2eRun(undefined, undefined, 'contracts');
    run = log;
    fixture = await db.$transaction(tx => seed(tx, log), { timeout: 120_000 });
    const f = fixture;
    const approvals = await race(db, tx => {
      const requests = new RequestsService(rollbackPrismaFacade(tx), mod.get(AuditService), mod.get(BankTransactionsService),
        mod.get(BillingService), mod.get(ContractOccupantsService), mod.get(ContractVehiclesService));
      return requests.decide({ id: f.manager.id, role: 'MANAGER', buildingIds: [f.building.id], mustChangePassword: false },
        f.request.id, 'approve', {});
    });
    expect(approvals.filter(r => r.status === 'fulfilled').map(r => r.value.status)).toEqual(['APPROVED']);
    const loser = approvals.find(r => r.status === 'rejected');
    expect(loser?.reason).toBeInstanceOf(ConflictException);
    expect(loser?.reason.getStatus()).toBe(409);
    expect(loser?.reason.message).toBe('CONFLICT_STATE');
    expect(await db.vehicle.count({ where: { contractId: f.source.id, plate: f.plate } })).toBe(1);
    expect(await db.auditLog.count({ where: { entity: 'request', entityId: f.request.id, action: 'request.approve' } })).toBe(1);

    const switches = await race(db, tx => switchRenewal(tx, f.next.id, f.switchDate));
    expect(switches.map(r => r.status === 'fulfilled' ? r.value : r.reason)).toEqual(expect.arrayContaining(['SWITCHED', 'CHANGED']));
    expect(await db.occupant.count({ where: { contractId: f.next.id } })).toBe(1);
    expect(await db.vehicle.count({ where: { contractId: f.next.id, plate: f.plate, isActive: true } })).toBe(1);
    expect(await db.vehicle.count({ where: { contractId: f.source.id, isActive: true } })).toBe(0);
    expect(await db.auditLog.count({ where: { entity: 'contract', entityId: f.next.id, action: 'contract.renew' } })).toBe(1);
  } finally {
    try {
      if (fixture && run) {
        await retireFixture(db, run, fixture).catch(error => {
          run?.finish('FAILED_CLEANUP');
          throw error;
        });
        run.finish('CLEANED');
        console.info(`QA-P5-04 ${run.runId} CLEANED`);
      } else if (run) {
        // A lost commit acknowledgement leaves the fixture state uncertain.
        run.finish('FAILED_CLEANUP');
      }
    } finally { await mod.close(); }
  }
}, 600_000);
