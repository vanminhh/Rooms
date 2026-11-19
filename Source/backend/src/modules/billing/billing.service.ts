import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { hashRequest, runIdempotent } from '../pricing/pricing-idempotency.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { RecordPaymentDto } from './dto/record-payment.dto.js';

const PAYMENT_SELECT = {
  id: true, invoiceId: true, amount: true, method: true, source: true,
  paidAt: true, note: true, recordedById: true,
} satisfies Prisma.PaymentSelect;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async recordPayment(actor: AuthUser, id: number, dto: RecordPaymentDto, ip?: string, idempotencyKey?: string) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const paidAt = dto.paidAt === undefined ? null : new Date(dto.paidAt);
    if (paidAt !== null && !Number.isFinite(paidAt.getTime())) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { paidAt: 'Thời điểm thanh toán phải có múi giờ hợp lệ' } });
    }
    // API-05: an omitted paidAt stays null in the hash; now is chosen only on the first write.
    const requestHash = hashRequest({ invoiceId: id, method: dto.method, paidAt: paidAt?.toISOString() ?? null, note: dto.note ?? null });
    return this.prisma.$transaction(async tx => {
      // Assignment writers take the exclusive mapping lock. Check current scope even for replay.
      await lockViewingMapping(tx);
      const scoped = await tx.invoice.findUnique({ where: { id, contract: scopeWhere(actor) }, select: {
        id: true, contract: { select: { building: { select: {
          managerId: true, isActive: true, manager: { select: { isActive: true } },
        } } } },
      } });
      if (!scoped) {
        if (await tx.invoice.findUnique({ where: { id }, select: { id: true } })) {
          throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        }
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      assertViewingScope(actor, scoped.contract);
      return runIdempotent(tx, {
        actorId: actor.id, route: 'POST /invoices/:id/payment', key: idempotencyKey, statusCode: 201,
      }, requestHash, async () => {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: { id: true, type: true, status: true, total: true } });
        if (invoice.type !== 'DEPOSIT') throw new ConflictException(ErrorCode.CONFLICT_STATE);
        if (invoice.status !== 'UNPAID') throw new ConflictException(ErrorCode.INVOICE_NOT_UNPAID);
        // BIL-11: the DB trigger checks exact total and changes UNPAID to PAID on INSERT.
        const payment = await tx.payment.create({ data: {
          invoiceId: id, amount: invoice.total, method: dto.method, source: 'MANUAL',
          bankTransactionId: null, recordedById: actor.id, paidAt: paidAt ?? new Date(), note: dto.note ?? null,
        }, select: PAYMENT_SELECT });
        const receipt = { ...payment, paidAt: payment.paidAt.toISOString() };
        await this.audit.log(actor.id, 'payment.record', 'payment', payment.id, undefined, receipt, ip, tx);
        return receipt;
      });
    });
  }
}
