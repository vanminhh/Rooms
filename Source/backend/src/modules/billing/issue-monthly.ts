import { ConflictException } from '@nestjs/common';
import type { MeterKind, MeterReading, Prisma } from '@prisma/client';
import { contractPeriods, dueDateOfPeriod } from '../../common/date/period.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { consumption, isAbnormal } from '../../common/money/consumption.js';
import { formatMoney } from '../../common/money/format.js';
import { monthlyInvoiceLines } from '../../common/money/invoice-calc.js';
import { ratesAt } from '../../common/rates/rates-at.js';
import { depositInvoiceView } from '../contracts/deposit-invoice.js';
import type { Mail } from '../mailer/mailer.service.js';

function snapshot(r: MeterReading) {
  return { id: r.id, readOn: formatDateOnly(r.readOn), value: r.value, photoUrl: r.photoUrl };
}

export function periodUsage(kind: MeterKind, opening: MeterReading | undefined, closing: MeterReading | undefined,
  intermediate: readonly MeterReading[]) {
  if (!opening || !closing) return null;
  if (opening.readOn > closing.readOn || (opening.readOn.getTime() === closing.readOn.getTime() && !opening.isOpening))
    throw new ConflictException(ErrorCode.CONFLICT_STATE);
  const between = intermediate.filter(r => r.kind === kind && r.readOn > opening.readOn && r.readOn < closing.readOn);
  let used: number;
  try { used = consumption([opening, ...between, closing]); }
  catch (error) {
    if (error instanceof RangeError) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    throw error;
  }
  return { opening: snapshot(opening), closing: snapshot(closing), consumption: used };
}

type IssueOutcome =
  | { status: 'DRAFT'; reason: 'MISSING_READINGS' | 'ABNORMAL_CONSUMPTION' }
  | { status: 'UNPAID'; mail: Mail | null };

// Caller holds the invoice lock for the lifetime of this transaction.
export async function issueMonthly(tx: Prisma.TransactionClient, invoiceId: number, manual = false): Promise<IssueOutcome> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: {
    meterReadings: true, contract: { include: { building: { select: { waterMode: true } },
      tenant: { select: { email: true, emailVerifiedAt: true } }, occupants: true,
      services: { include: { service: true } }, vehicles: { include: { service: true } } } },
  } });
  if (invoice.type !== 'MONTHLY' || invoice.status !== 'DRAFT') throw new ConflictException(ErrorCode.CONFLICT_STATE);
  const c = invoice.contract;
  const history = await tx.invoice.findMany({ where: { contractId: c.id, type: 'MONTHLY',
    status: { in: ['UNPAID', 'PAID', 'SETTLED'] }, periodNo: { gte: invoice.periodNo - 3, lt: invoice.periodNo } },
    orderBy: { periodNo: 'asc' }, include: { meterReadings: true, lines: { where: { kind: { in: ['WATER','ELECTRIC'] } } } } });
  const previous = history.find(h => h.periodNo === invoice.periodNo - 1);
  const unlinked = await tx.meterReading.findMany({ where: { contractId: c.id, invoiceId: null },
    orderBy: [{ readOn: 'asc' }, { id: 'asc' }] });
  const openings = invoice.periodNo === 1 ? unlinked.filter(r => r.isOpening) : previous?.meterReadings ?? [];
  const usage = (kind: MeterKind) => periodUsage(kind, openings.find(r => r.kind === kind),
    invoice.meterReadings.find(r => r.kind === kind), unlinked.filter(r => !r.isOpening));
  const electric = usage('ELECTRIC');
  const water = c.building.waterMode === 'PER_M3' ? usage('WATER') : null;
  if (!electric || (c.building.waterMode === 'PER_M3' && !water)) {
    if (manual) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    return { status: 'DRAFT', reason: 'MISSING_READINGS' };
  }
  const abnormal = (kind: MeterKind, used: number) => {
    const past = history.flatMap(h => {
      const meta = h.lines.find(l => l.kind === kind)?.meta;
      return meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.consumption === 'number' ? [meta.consumption] : [];
    });
    return isAbnormal(used, past);
  };
  const needsReview = !manual && (abnormal('ELECTRIC', electric.consumption) || (water && abnormal('WATER', water.consumption)));
  const period = contractPeriods(c.startDate, c.termMonths).find(p => p.periodNo === invoice.periodNo);
  if (!period || invoice.periodStart?.getTime() !== period.periodStart.getTime() ||
    invoice.periodEnd?.getTime() !== period.periodEnd.getTime()) throw new ConflictException(ErrorCode.CONFLICT_STATE);
  const issueDate = todayHanoi();
  const dueDate = dueDateOfPeriod(period);
  const services = new Map([...c.services, ...c.vehicles].map(v => [v.serviceId, v.service]));
  const { lines, total } = monthlyInvoiceLines({ period, rent: c.rent, waterMode: c.building.waterMode,
    rates: await ratesAt(tx, c.buildingId, period.periodStart), services: [...services.values()],
    occupants: c.occupants, vehicles: c.vehicles, electricKwh: electric.consumption, waterM3: water?.consumption ?? null });
  if (!Number.isSafeInteger(total) || total > 2147483647 || lines.some(l => l.quantity > 2147483647 || l.amount > 2147483647))
    throw new ConflictException(ErrorCode.VALIDATION_FAILED);
  await tx.invoiceLine.deleteMany({ where: { invoiceId } });
  await tx.invoiceLine.createMany({ data: lines.map(line => ({ ...line, invoiceId, meta: {
    ...line.meta, ...(needsReview && line.kind === 'ELECTRIC' ? { reviewRequired: true } : {}), ...(line.kind === 'ELECTRIC' ? electric : line.kind === 'WATER' ? water : {}),
  } as Prisma.InputJsonObject })) });
  if (needsReview) return { status: 'DRAFT', reason: 'ABNORMAL_CONSUMPTION' };
  const updated = await tx.invoice.update({ where: { id: invoiceId }, data: {
    status: 'UNPAID', issueDate, dueDate, total } });
  const setting = await tx.setting.findUnique({ where: { key: 'bank_account' } });
  const view = depositInvoiceView(updated, setting?.value);
  const title = `Hóa đơn TT${invoiceId} đã phát hành`;
  const body = `Số tiền ${formatMoney(total)}. Hạn thanh toán ${view.dueDate}.`;
  await tx.notification.create({ data: { kind: 'INVOICE_ISSUED', title, body, userId: c.tenantId, link: `/thue/hoa-don/${invoiceId}` } });
  return { status: 'UNPAID', mail: c.tenant.email && c.tenant.emailVerifiedAt
    ? { to: c.tenant.email, subject: title, text: `${body}\nVietQR: ${view.qrImageUrl}` } : null };
}
