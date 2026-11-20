import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { hashRequest, runIdempotent } from '../pricing/pricing-idempotency.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { CancelContractDto } from './dto/cancel-contract.dto.js';

@Injectable()
export class ContractCancelService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async cancel(actor: AuthUser, id: number, dto: CancelContractDto, ip?: string, idempotencyKey?: string) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const reason = dto.reason.trim();
    const depositKept = dto.depositKept ?? 0;
    const requestHash = hashRequest({ contractId: id, reason, depositKept });
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      const scoped = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: {
        roomId: true, building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
      } });
      if (!scoped) {
        if (await tx.contract.findUnique({ where: { id }, select: { id: true } })) {
          throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        }
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      // API-05: current scope is required even when replaying a completed cancellation.
      assertViewingScope(actor, scoped);
      return runIdempotent(tx, { actorId: actor.id, route: 'POST /contracts/:id/cancel', key: idempotencyKey, statusCode: 201 }, requestHash, async () => {
        // Same order as move-in; sign takes contract only and payment takes invoice only.
        await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${scoped.roomId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
        const contract = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: {
          id: true, code: true, status: true,
          building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
        } });
        if (!contract) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        assertViewingScope(actor, contract);
        if (contract.status !== 'HOLD') throw new ConflictException(ErrorCode.CONFLICT_STATE);
        if (await tx.settlement.findUnique({ where: { contractId: id }, select: { id: true } })) {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }

        // Serialize the payment trigger and cancellation. PAID invoices/payments are history,
        // while UNPAID can become CANCELLED only after acquiring this same invoice lock.
        await tx.$queryRaw`SELECT id FROM invoices WHERE contract_id = ${id} AND type = 'DEPOSIT' ORDER BY id FOR UPDATE`;
        const invoices = await tx.invoice.findMany({ where: { contractId: id, type: 'DEPOSIT' }, orderBy: { id: 'asc' }, select: {
          id: true, status: true, total: true, payment: { select: { amount: true } },
        } });
        const active = invoices.filter(invoice => invoice.status !== 'CANCELLED');
        if (active.length > 1 || invoices.some(invoice => invoice.status === 'CANCELLED' && invoice.payment !== null)) {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        const invoice = active[0] ?? null;
        if (invoice && invoice.status !== 'UNPAID' && invoice.status !== 'PAID') {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        if (invoice && ((invoice.status === 'PAID' && (!invoice.payment || invoice.payment.amount !== invoice.total)) ||
            (invoice.status === 'UNPAID' && invoice.payment !== null))) {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        const deposit = invoice?.status === 'PAID' ? invoice.payment!.amount : 0;
        if (depositKept > deposit) {
          throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: {
            depositKept: 'Tiền cọc giữ lại không được vượt số tiền cọc đã nhận',
          } });
        }

        let settlement = null;
        if (invoice?.status === 'PAID') {
          const saved = await tx.settlement.create({ data: {
            contractId: id, moveOutDate: todayHanoi(), deposit, depositForfeit: depositKept,
            lastPeriodAmount: 0, remainingRent: 0, previousDebt: 0, damages: 0, net: deposit - depositKept,
            finalInvoiceId: null, refundPaidAt: null, note: reason, settledById: actor.id,
          }, select: { id: true, deposit: true, depositForfeit: true, net: true, refundPaidAt: true, moveOutDate: true } }).catch((error: unknown) => {
            if (isUniqueOn(error, 'settlements_contract_id_key', 'contractId', 'contract_id')) {
              throw new ConflictException(ErrorCode.CONFLICT_STATE);
            }
            throw error;
          });
          settlement = { ...saved, moveOutDate: formatDateOnly(saved.moveOutDate), refundPaidAt: saved.refundPaidAt?.toISOString() ?? null };
        } else if (invoice?.status === 'UNPAID') {
          const saved = await tx.invoice.updateMany({ where: { id: invoice.id, status: 'UNPAID' }, data: { status: 'CANCELLED', cancelReason: reason } });
          if (saved.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        const saved = await tx.contract.updateMany({ where: { id, status: 'HOLD' }, data: { status: 'CANCELLED', cancelReason: reason } });
        if (saved.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);

        // CON-12/D-26: pending accounts are already inactive. Leave users and sessions
        // untouched so a reused account or activation from another HOLD is preserved.
        const response = { id, code: contract.code, status: 'CANCELLED', cancelReason: reason,
          depositInvoice: invoice ? { id: invoice.id, status: invoice.status === 'UNPAID' ? 'CANCELLED' : invoice.status } : null,
          settlement };
        await this.audit.log(actor.id, 'contract.cancel', 'contract', id, { status: 'HOLD' }, {
          status: 'CANCELLED', cancelReason: reason, depositInvoiceId: invoice?.id ?? null,
          settlementId: settlement?.id ?? null, deposit, depositForfeit: depositKept, refund: settlement?.net ?? 0,
        }, ip, tx);
        return response;
      });
    });
  }
}
