import type { Prisma, PrismaClient } from '@prisma/client';
import { contractPeriods } from '../../common/date/period.js';
import { toDateOnly } from '../../common/date/today.js';

export type RenewalOutcome = 'SWITCHED' | 'WAITING_FINAL_INVOICE' | 'WAITING_HANDOVER_READINGS' | 'CHANGED';
export interface RenewalSummary { candidates: number; switched: number; waiting: number }

// BIL-06, CON-18, CON-19 (A-09, Q-P4-15). One renewal per transaction; both contracts are locked and re-read.
// The old contract stays ACTIVE until its period-N MONTHLY invoice (any status but CANCELLED) and the handover
// readings on it exist: ELECTRIC (kWh) and WATER (m³) in every building; PER_PERSON water is read but not billed (MTR-06).
export async function switchRenewal(tx: Prisma.TransactionClient, renewalId: number, today: Date, now = new Date()): Promise<RenewalOutcome> {
  const renewal = await tx.contract.findUnique({ where: { id: renewalId }, select: { previousContractId: true } });
  if (!renewal?.previousContractId) return 'CHANGED';
  const ids = [renewalId, renewal.previousContractId].sort((a, b) => a - b);
  await tx.$queryRaw`SELECT id FROM contracts WHERE id IN (${ids[0]}, ${ids[1]}) ORDER BY id FOR UPDATE`;
  const next = await tx.contract.findUniqueOrThrow({ where: { id: renewalId } });
  const old = await tx.contract.findUniqueOrThrow({ where: { id: renewal.previousContractId },
    include: { occupants: true, vehicles: { where: { isActive: true } } } });
  if (next.status !== 'HOLD' || !next.signedAt || next.startDate > today || old.status !== 'ACTIVE') return 'CHANGED';

  const lastNo = contractPeriods(old.startDate, old.termMonths).length;
  const final = await tx.invoice.findFirst({ where: { contractId: old.id, type: 'MONTHLY', periodNo: lastNo, status: { not: 'CANCELLED' } },
    include: { meterReadings: true } });
  if (!final) return 'WAITING_FINAL_INVOICE';
  const handover = final.meterReadings.filter(r => !r.isOpening);
  if (!(['ELECTRIC', 'WATER'] as const).every(kind => handover.some(r => r.kind === kind))) return 'WAITING_HANDOVER_READINGS';

  const ended = await tx.contract.updateMany({ where: { id: old.id, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: now } });
  const started = await tx.contract.updateMany({ where: { id: next.id, status: 'HOLD' },
    data: { status: 'ACTIVE', movedInAt: toDateOnly(next.startDate) } });
  if (ended.count !== 1 || started.count !== 1) throw new Error(`Renewal ${next.id} changed during the switch`);

  // CON-18: the old contract's period-end reading is the new contract's opening reading (MTR-02).
  for (const kind of ['ELECTRIC', 'WATER'] as const) {
    const closing = handover.filter(r => r.kind === kind).sort((a, b) => b.readOn.getTime() - a.readOn.getTime() || b.id - a.id)[0];
    if (closing) await tx.meterReading.create({ data: { roomId: closing.roomId, contractId: next.id, kind, value: closing.value,
      readOn: closing.readOn, isOpening: true, readById: closing.readById, note: `Mốc chuyển từ hợp đồng ${old.code}` } });
  }
  // CON-19: people still living there and active vehicles move to the new contract; history stays on the old one.
  const staying = old.occupants.filter(o => o.moveOutDate === null);
  if (staying.length) {
    // occupants_one_signer: keep the renewal's own signer if signing already created one.
    const hasSigner = await tx.occupant.count({ where: { contractId: next.id, isSigner: true } }) > 0;
    await tx.occupant.createMany({ data: staying.map(({ id: _id, contractId: _c, createdAt: _t, ...o }) =>
      ({ ...o, isSigner: o.isSigner && !hasSigner, contractId: next.id })) });
  }
  for (const v of old.vehicles) {
    await tx.vehicle.update({ where: { id: v.id }, data: { isActive: false, removedAt: old.endDate } });
    await tx.vehicle.create({ data: { contractId: next.id, buildingId: v.buildingId, serviceId: v.serviceId, plate: v.plate, type: v.type,
      registeredAt: next.startDate } });
  }
  // AUD-01 contract renew; AUD-03 cron actions have no actor.
  await tx.auditLog.create({ data: { actorId: null, action: 'contract.renew', entity: 'contract', entityId: next.id,
    before: { previousContractId: old.id, previousStatus: 'ACTIVE', status: 'HOLD' },
    after: { previousStatus: 'ENDED', status: 'ACTIVE', occupantsCopied: staying.length, vehiclesMoved: old.vehicles.length } } });
  return 'SWITCHED';
}

export async function switchDueRenewals(db: Pick<PrismaClient, 'contract' | '$transaction'>, today: Date): Promise<RenewalSummary> {
  const due = await db.contract.findMany({ where: { status: 'HOLD', signedAt: { not: null }, startDate: { lte: today },
    previousContract: { status: 'ACTIVE' } }, select: { id: true }, orderBy: { id: 'asc' } });
  const summary: RenewalSummary = { candidates: due.length, switched: 0, waiting: 0 };
  for (const { id } of due) {
    const outcome = await db.$transaction(tx => switchRenewal(tx, id, today));
    if (outcome === 'SWITCHED') summary.switched++;
    else if (outcome !== 'CHANGED') summary.waiting++;
  }
  return summary;
}
