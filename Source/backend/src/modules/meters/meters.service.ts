import { ForbiddenException, Injectable } from '@nestjs/common';
import type { MeterKind, Prisma } from '@prisma/client';
import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';

type Point = { id: number; value: number; readOn: string };

// BIL-07 stores the closing snapshot on the previous period's utility lines.
function closingPoint(meta: Prisma.JsonValue): Point | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const point = meta.closing;
  if (!point || typeof point !== 'object' || Array.isArray(point)) return null;
  const { id, value, readOn } = point;
  return typeof id === 'number' && typeof value === 'number' && typeof readOn === 'string'
    ? { id, value, readOn } : null;
}

@Injectable()
export class MetersService {
  constructor(private readonly prisma: PrismaService) {}

  async due(actor: AuthUser, buildingId?: number) {
    if (buildingId !== undefined && actor.buildingIds !== null && !actor.buildingIds.includes(buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    const contract = buildingId === undefined ? scopeWhere(actor) : { buildingId };
    const drafts = await this.prisma.invoice.findMany({
      where: { type: 'MONTHLY', status: 'DRAFT', contract },
      orderBy: [{ periodEnd: 'asc' }, { id: 'asc' }],
      select: { lines: { where: { kind: 'ELECTRIC', meta: { path: ['reviewRequired'], equals: true } }, take: 1, select: { id: true } }, id: true, contractId: true, periodNo: true, periodStart: true, periodEnd: true,
        contract: { select: { room: { select: { id: true, code: true } }, tenant: { select: { id: true, fullName: true } },
          building: { select: { id: true, name: true, waterMode: true } },
          meterReadings: { where: { isOpening: true }, select: { kind: true, id: true, value: true, readOn: true } } } } },
    });
    const predecessors = drafts.filter(d => d.periodNo > 1).map(d => ({ contractId: d.contractId, periodNo: d.periodNo - 1 }));
    const previous = predecessors.length ? await this.prisma.invoice.findMany({
      where: { type: 'MONTHLY', status: { not: 'CANCELLED' }, contract, OR: predecessors },
      select: { contractId: true, periodNo: true, meterReadings: { select: { id: true, kind: true, readOn: true, value: true } }, lines: { where: { kind: { in: ['ELECTRIC', 'WATER'] } }, select: { kind: true, meta: true } } },
    }) : [];
    const byPeriod = new Map(previous.map(p => [p.contractId + '/' + p.periodNo, p]));
    const today = todayHanoi();
    return drafts.map(d => {
      const readings: Record<MeterKind, Point | null> = { ELECTRIC: null, WATER: null };
      if (d.periodNo === 1) {
        for (const r of d.contract.meterReadings) readings[r.kind] = { id: r.id, value: r.value, readOn: formatDateOnly(r.readOn) };
      } else {
        const prior = byPeriod.get(d.contractId + '/' + (d.periodNo - 1));
        for (const r of prior?.meterReadings ?? []) readings[r.kind] = { id: r.id, value: r.value, readOn: formatDateOnly(r.readOn) };
        for (const line of prior?.lines ?? []) {
          if (line.kind === 'ELECTRIC' || line.kind === 'WATER') readings[line.kind] ??= closingPoint(line.meta);
        }
      }
      const billingDate = addDays(d.periodEnd!, 1);
      return { reviewRequired: !!d.lines?.length, invoiceId: d.id, contractId: d.contractId, periodNo: d.periodNo,
        periodStart: formatDateOnly(d.periodStart!), periodEnd: formatDateOnly(d.periodEnd!), billingDate: formatDateOnly(billingDate),
        overdue: today > billingDate, room: d.contract.room, tenant: d.contract.tenant, building: d.contract.building, previousReadings: readings };
    });
  }
}
