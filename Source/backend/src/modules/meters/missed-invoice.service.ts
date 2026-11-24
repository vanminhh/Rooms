import { billedPeriod } from '../billing/billed-period.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { contractPeriods } from '../../common/date/period.js';
import { compareDates, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { draftData } from '../billing/monthly-drafts.js';

@Injectable()
export class MissedInvoiceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // BIL-21 "Tạo hóa đơn kỳ này": the same DRAFT as BIL-05 (dates of period k), for a period the job did not create.
  async create(actor: AuthUser, contractId: number, periodNo: number, ip?: string, today = todayHanoi()) {
    return this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM contracts WHERE id = ${contractId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException(ErrorCode.NOT_FOUND);
      const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: { id: true, status: true, startDate: true,
        termMonths: true, settlement: { select: { id: true } }, building: { select: { managerId: true, isActive: true } } } });
      if (actor.role !== 'BOSS' && (c.building.managerId !== actor.id || !c.building.isActive)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      const periods = contractPeriods(c.startDate, c.termMonths);
      if (periodNo > periods.length) throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { periodNo: 'Kỳ không hợp lệ' } });
      const period = periods[periodNo - 1];
      const open = c.status === 'ACTIVE' || (c.status === 'ENDED' && !c.settlement);
      const exists = await tx.invoice.count({ where: { contractId, type: 'MONTHLY', periodNo, AND: billedPeriod } });
      if (!open || compareDates(period.billingDate, today) > 0 || exists > 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const invoice = await tx.invoice.create({ data: draftData(contractId, period, actor.id), select: { id: true } });
      const view = { invoiceId: invoice.id, contractId, periodNo, periodStart: formatDateOnly(period.periodStart),
        periodEnd: formatDateOnly(period.periodEnd), status: 'DRAFT' as const };
      await this.audit.log(actor.id, 'invoice.create_missed', 'invoice', invoice.id, undefined, view, ip, tx);
      return view;
    });
  }
}
