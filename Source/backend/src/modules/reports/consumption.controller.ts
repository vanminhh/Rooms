import { Controller, Get, Header, NotFoundException, Query } from '@nestjs/common';
import type { MeterKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ErrorCode } from '../../common/errors/error-code.js';
import { CurrentUser, TenantMeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatDateOnly } from '../../common/date/today.js';
import { issuedPeriod } from '../billing/billed-period.js';
import { periodUsage } from '../billing/issue-monthly.js';

class ConsumptionQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) periods?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) contractId?: number;
}

@Controller('me/consumption')
@TenantMeRoles()
export class ConsumptionController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentUser() actor: AuthUser, @Query() query: ConsumptionQuery) {
    const contract = await this.db.contract.findFirst({ where: { tenantId: actor.id,
      ...(query.contractId ? { id: query.contractId } : { status: 'ACTIVE' }) },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }], select: { id: true } });
    if (!contract) {
      if (query.contractId) throw new NotFoundException(ErrorCode.NOT_FOUND);
      return [];
    }
    const limit = query.periods ?? 6;
    const invoices = await this.db.invoice.findMany({ where: { contractId: contract.id, type: 'MONTHLY', ...issuedPeriod },
      orderBy: { periodNo: 'desc' }, take: limit + 1, select: {
        periodNo: true, periodStart: true, periodEnd: true, meterReadings: true,
        lines: { where: { kind: { in: ['ELECTRIC', 'WATER'] } }, select: { kind: true, meta: true } },
      } });
    if (!invoices.length) return [];
    const intermediate = await this.db.meterReading.findMany({ where: { contractId: contract.id, invoiceId: null },
      orderBy: [{ readOn: 'asc' }, { id: 'asc' }] });
    return invoices.slice(0, limit).map((bill, i) => {
      const used = (kind: MeterKind) => {
        const meta = bill.lines.find(l => l.kind === kind)?.meta;
        if (meta && typeof meta === 'object' && !Array.isArray(meta) && typeof meta.consumption === 'number') return meta.consumption;
        const previous = invoices[i + 1];
        const opening = bill.periodNo === 1 ? intermediate.find(r => r.kind === kind && r.isOpening)
          : previous?.periodNo === bill.periodNo - 1 ? previous.meterReadings.find(r => r.kind === kind) : undefined;
        return periodUsage(kind, opening, bill.meterReadings.find(r => r.kind === kind), intermediate)?.consumption ?? null;
      };
      return { contractId: contract.id, periodNo: bill.periodNo, periodStart: bill.periodStart && formatDateOnly(bill.periodStart),
        periodEnd: bill.periodEnd && formatDateOnly(bill.periodEnd), electricKwh: used('ELECTRIC'), waterM3: used('WATER') };
    }).reverse();
  }
}
