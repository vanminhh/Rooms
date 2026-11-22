import type { Prisma } from '@prisma/client';
import { contractEndDate, contractPeriods } from '../../src/common/date/period.js';
import { todayHanoi } from '../../src/common/date/today.js';
import { e2eName, e2eServiceName, uniqueBuildingCode } from '../../scripts/e2e/run.js';

// Shared by the Phase 4 e2e specs (BE-P4-13, BE-P4-23): a BIL-09 contract with a period-1 MONTHLY DRAFT.
// Period 1 is the full calendar month two months back, so its billing date has passed (BIL-05) and the
// closing reading on period_end is accepted (MTR-10).
export function pastFullMonth(monthsBack = 2) {
  const t = todayHanoi();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - monthsBack, 1));
}

type Tx = Prisma.TransactionClient;

export async function seedMonthlyFixture(tx: Tx, runId: string, bossId: number, label: string, waterMode: 'PER_M3' | 'PER_PERSON',
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

