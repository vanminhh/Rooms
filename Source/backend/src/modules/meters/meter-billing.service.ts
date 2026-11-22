import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MailerService, type Mail } from '../mailer/mailer.service.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { issueMonthly } from '../billing/issue-monthly.js';
import { recordBatch } from './record-batch.js';

@Injectable()
export class MeterBillingService {
  private readonly logger = new Logger(MeterBillingService.name);
  constructor(private readonly db: PrismaService, private readonly mailer: MailerService, private readonly audit: AuditService) {}

  private async deliver(invoiceId: number, mail: Mail) {
    try { await sendWithRetry(this.mailer, mail, `invoice-issued-${invoiceId}`); }
    catch { this.logger.warn(`Invoice TT${invoiceId}: email delivery failed after retry`); }
  }

  async record(actor: AuthUser, items: unknown, ip?: string) {
    const mail = new Map<number, Mail>();
    return recordBatch(this.db, actor, items, async (tx, reading) => {
      if (reading.status !== 'DRAFT' || reading.invoiceId == null) return reading;
      const outcome = await issueMonthly(tx, reading.invoiceId);
      if (outcome.status === 'UNPAID') {
        // AUD-01: an invoice issued by the reading that completed it is audited like the manual issue.
        await this.audit.log(actor.id, 'invoice.issue', 'invoice', reading.invoiceId, { status: 'DRAFT' }, { status: 'UNPAID', readingId: reading.readingId }, ip, tx);
        if (outcome.mail) mail.set(reading.readingId, outcome.mail);
      }
      return { ...reading, status: outcome.status, ...(outcome.status === 'DRAFT' ? { reason: outcome.reason } : {}) };
    }, async reading => {
      const message = mail.get(reading.readingId);
      if (message && reading.invoiceId != null) await this.deliver(reading.invoiceId, message);
    });
  }

  async issue(actor: AuthUser, id: number, ip: string) {
    const result = await this.db.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException(ErrorCode.NOT_FOUND);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: { contract: { select: { building: { select: { managerId: true, isActive: true } } } } } });
      const b = invoice.contract.building;
      if (actor.role !== 'BOSS' && (b.managerId !== actor.id || !b.isActive)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      const outcome = await issueMonthly(tx, id, true);
      await this.audit.log(actor.id, 'invoice.issue', 'invoice', id, { status: 'DRAFT' }, { status: outcome.status }, ip, tx);
      return outcome;
    });
    if (result.status === 'UNPAID' && result.mail) await this.deliver(id, result.mail);
    return { invoiceId: id, status: result.status };
  }
}
