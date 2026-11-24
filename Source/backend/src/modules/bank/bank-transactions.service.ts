import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { HANOI_OFFSET_MS, parseDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { paymentReceivedNotice } from '../billing/payment-notice.js';
import { MailerService, type Mail } from '../mailer/mailer.service.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { hashRequest, runIdempotent } from '../pricing/pricing-idempotency.js';
import type { BankTransactionsQueryDto } from './dto/bank-transactions.dto.js';

const ROW = {
  id: true, provider: true, providerTxId: true, amount: true, content: true, accountNumber: true, receivedAt: true,
  status: true, note: true, handledAt: true,
  invoice: { select: { id: true, total: true, status: true, contract: { select: { room: { select: { code: true } }, tenant: { select: { fullName: true } } } } } },
} satisfies Prisma.BankTransactionSelect;
type Row = Prisma.BankTransactionGetPayload<{ select: typeof ROW }>;
// A Hà Nội calendar day as a UTC instant (G-02).
const hanoiDayStart = (day: string) => new Date(parseDateOnly(day)!.getTime() - HANOI_OFFSET_MS);

function view({ invoice, receivedAt, handledAt, ...rest }: Row) {
  return { ...rest, receivedAt: receivedAt.toISOString(), handledAt: handledAt?.toISOString() ?? null,
    invoice: invoice && { id: invoice.id, code: `TT${invoice.id}`, total: invoice.total, status: invoice.status,
      roomCode: invoice.contract.room.code, tenantName: invoice.contract.tenant.fullName } };
}

// BANK-05, API-07: Boss only (the controller's @Roles). `raw` never leaves the DB.
@Injectable()
export class BankTransactionsService {
  private readonly logger = new Logger(BankTransactionsService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mailer: MailerService) {}

  async list(query: BankTransactionsQueryDto) {
    const { page, limit, skip, take } = pageParams(query);
    const where: Prisma.BankTransactionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { receivedAt: {
        ...(query.from ? { gte: hanoiDayStart(query.from) } : {}),
        ...(query.to ? { lt: new Date(hanoiDayStart(query.to).getTime() + 86_400_000) } : {}),
      } } : {}),
    };
    const total = await this.prisma.bankTransaction.count({ where });
    const rows = skip >= total ? [] : await this.prisma.bankTransaction.findMany({ where, select: ROW, skip, take,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }] });
    return paginated(rows.map(view), page, limit, total);
  }

  async assign(actor: AuthUser, id: number, invoiceId: number, ip?: string, idempotencyKey?: string) {
    let mail: Mail | null = null;
    const result = await this.prisma.$transaction(async tx => runIdempotent(tx,
      { actorId: actor.id, route: 'POST /bank-transactions/:id/assign', key: idempotencyKey, statusCode: 201 },
      hashRequest({ id, invoiceId }), async () => {
        const assigned = await this.assignInTransaction(tx, actor, id, invoiceId, ip);
        mail = assigned.mail;
        return assigned.result;
      }));
    if (mail) {
      try { await sendWithRetry(this.mailer, mail, `payment-received-${invoiceId}`); }
      catch { this.logger.warn(`Invoice TT${invoiceId}: payment email failed after retry`); }
    }
    return result;
  }

  async assignInTransaction(tx: Prisma.TransactionClient, actor: AuthUser, id: number, invoiceId: number, ip?: string) {
    const bankTx = await this.locked(tx, id);
    if (bankTx.status !== 'UNMATCHED') throw new ConflictException(ErrorCode.CONFLICT_STATE);
    await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, total: true } });
    if (!invoice) throw new NotFoundException(ErrorCode.NOT_FOUND);
    if (invoice.status !== 'UNPAID') throw new ConflictException(ErrorCode.INVOICE_NOT_UNPAID);
    if (invoice.total !== bankTx.amount) throw new ConflictException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
    const now = new Date();
    const updated = await tx.bankTransaction.updateMany({ where: { id, status: 'UNMATCHED' },
      data: { status: 'ASSIGNED', invoiceId, handledById: actor.id, handledAt: now } });
    if (updated.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    const payment = await tx.payment.create({ data: { invoiceId, amount: bankTx.amount, method: 'BANK_TRANSFER', source: 'ASSIGNED',
      bankTransactionId: id, recordedById: actor.id, paidAt: bankTx.receivedAt }, select: { id: true } });
    await this.audit.log(actor.id, 'payment.assign', 'payment', payment.id, { bankTransactionId: id, status: 'UNMATCHED' },
      { bankTransactionId: id, status: 'ASSIGNED', invoiceId, amount: bankTx.amount }, ip, tx);
    const mail = await paymentReceivedNotice(tx, invoiceId);
    return { result: { bankTransactionId: id, invoiceId, paymentId: payment.id, status: 'ASSIGNED' as const }, mail };
  }

  // Q-P4-34: only UNMATCHED money (never linked to an invoice) can be marked refunded; nothing is sent.
  async markRefunded(actor: AuthUser, id: number, note: string, ip?: string, idempotencyKey?: string) {
    return this.prisma.$transaction(async tx => runIdempotent(tx,
      { actorId: actor.id, route: 'POST /bank-transactions/:id/mark-refunded', key: idempotencyKey, statusCode: 201 },
      hashRequest({ id, note: note.trim() }), async () => {
      const bankTx = await this.locked(tx, id);
      if (bankTx.status !== 'UNMATCHED') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const handledAt = new Date();
      await tx.bankTransaction.update({ where: { id }, data: { status: 'REFUNDED', note: note.trim(), handledById: actor.id, handledAt } });
      await this.audit.log(actor.id, 'payment.refund', 'bank_transaction', id, { status: 'UNMATCHED', note: bankTx.note },
        { status: 'REFUNDED', note: note.trim() }, ip, tx);
      return { bankTransactionId: id, status: 'REFUNDED' as const, note: note.trim(), handledAt: handledAt.toISOString() };
    }));
  }

  private async locked(tx: Prisma.TransactionClient, id: number) {
    await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${id} FOR UPDATE`;
    const row = await tx.bankTransaction.findUnique({ where: { id }, select: { status: true, amount: true, receivedAt: true, note: true } });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return row;
  }
}

