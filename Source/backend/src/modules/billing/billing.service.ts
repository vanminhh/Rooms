import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MeterReading, Prisma } from '@prisma/client';
import { formatDateOnly, formatDateVn, HANOI_OFFSET_MS, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { mailLocale } from '../../common/i18n/locale.js';
import { formatMoney } from '../../common/money/format.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { daysBetween } from '../../jobs/reminder-rules.js';
import { AuditService } from '../audit/audit.service.js';
import { depositInvoiceView } from '../contracts/deposit-invoice.js';
import { emailTemplate } from '../mailer/email-templates.js';
import { MailerService, type Mail } from '../mailer/mailer.service.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { hashRequest, runIdempotent } from '../pricing/pricing-idempotency.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { RecordPaymentDto, ReissueInvoiceDto } from './dto/record-payment.dto.js';
import { issueMonthly } from './issue-monthly.js';
import { paymentReceivedNotice } from './payment-notice.js';

const PAYMENT_SELECT = {
  id: true, invoiceId: true, amount: true, method: true, source: true,
  paidAt: true, note: true, recordedById: true,
} satisfies Prisma.PaymentSelect;
const NOTICE_SELECT = { id: true, status: true, total: true, issueDate: true, dueDate: true, contract: { select: {
  buildingId: true, tenantId: true, room: { select: { code: true } },
  tenant: { select: { role: true, locale: true, email: true, emailVerifiedAt: true } } } } } satisfies Prisma.InvoiceSelect;
// Same rule as the invoice-issued mail: tenants get mail only at a verified address (NOTI-04).
const verifiedEmail = (t: { email: string | null; emailVerifiedAt: Date | null }) => (t.email && t.emailVerifiedAt ? t.email : null);
const readingSnapshot = (r: Pick<MeterReading, 'id' | 'kind' | 'value' | 'isMeterReplaced' | 'oldMeterFinal'>) =>
  ({ id: r.id, kind: r.kind, value: r.value, isMeterReplaced: r.isMeterReplaced, oldMeterFinal: r.oldMeterFinal });

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mailer: MailerService) {}

  // SCOPE-02: token scope, then the building's current assignment. Assignment writers take the mapping lock.
  private async assertInvoiceScope(tx: Prisma.TransactionClient, actor: AuthUser, id: number) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    await lockViewingMapping(tx);
    const scoped = await tx.invoice.findUnique({ where: { id, contract: scopeWhere(actor) }, select: {
      contract: { select: { building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } } } } } });
    if (!scoped) {
      if (await tx.invoice.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    assertViewingScope(actor, scoped.contract);
  }

  // NOTI-07: after commit; a failed mail never undoes the action.
  private async deliver(mail: Mail | null, key: string) {
    if (!mail) return;
    try { await sendWithRetry(this.mailer, mail, key); }
    catch { this.logger.warn(`${key}: email delivery failed after retry`); }
  }

  // BIL-11: every invoice type (Phase 4). Tenant row + mail (Q-P4-1), staff row always (Q-P4-27, NOTI-11).
  async recordPayment(actor: AuthUser, id: number, dto: RecordPaymentDto, ip?: string, idempotencyKey?: string) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const paidAt = dto.paidAt === undefined ? null : new Date(dto.paidAt);
    if (paidAt !== null && !Number.isFinite(paidAt.getTime())) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { paidAt: 'Thời điểm thanh toán phải có múi giờ hợp lệ' } });
    }
    // API-05: an omitted paidAt stays null in the hash; now is chosen only on the first write.
    const requestHash = hashRequest({ invoiceId: id, method: dto.method, paidAt: paidAt?.toISOString() ?? null, note: dto.note ?? null });
    let mail: Mail | null = null;
    const receipt = await this.prisma.$transaction(async tx => {
      await this.assertInvoiceScope(tx, actor, id);
      return runIdempotent(tx, {
        actorId: actor.id, route: 'POST /invoices/:id/payment', key: idempotencyKey, statusCode: 201,
      }, requestHash, async () => {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: NOTICE_SELECT });
        if (invoice.status !== 'UNPAID') throw new ConflictException(ErrorCode.INVOICE_NOT_UNPAID);
        // BIL-11: the DB trigger checks exact total and changes UNPAID to PAID on INSERT.
        const payment = await tx.payment.create({ data: {
          invoiceId: id, amount: invoice.total, method: dto.method, source: 'MANUAL',
          bankTransactionId: null, recordedById: actor.id, paidAt: paidAt ?? new Date(), note: dto.note ?? null,
        }, select: PAYMENT_SELECT });
        const result = { ...payment, paidAt: payment.paidAt.toISOString() };
        await this.audit.log(actor.id, 'payment.record', 'payment', payment.id, undefined, result, ip, tx);
        mail = await paymentReceivedNotice(tx, id);
        return result;
      });
    });
    await this.deliver(mail, `payment-received-${id}`); // set only on the first write, never on an idempotent replay
    return receipt;
  }

  // BIL-12 (Q-P4-6, Q-P4-24, Q-P4-25): MONTHLY DRAFT/UNPAID only. Corrections are applied in place on this invoice's
  // closing readings (before/after in the audit), which then move to the replacement invoice; the old one keeps its lines.
  async reissue(actor: AuthUser, id: number, dto: ReissueInvoiceDto, ip?: string, idempotencyKey?: string) {
    const kinds = dto.corrections.map(c => c.kind);
    if (new Set(kinds).size !== kinds.length) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { corrections: 'Mỗi loại đồng hồ chỉ sửa một lần' } });
    }
    const requestHash = hashRequest({ invoiceId: id, reason: dto.reason, corrections: dto.corrections });
    let mail: Mail | null = null;
    let newId = 0;
    const result = await this.prisma.$transaction(async tx => {
      await this.assertInvoiceScope(tx, actor, id);
      return runIdempotent(tx, { actorId: actor.id, route: 'POST /invoices/:id/reissue', key: idempotencyKey, statusCode: 201 }, requestHash, async () => {
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
        const old = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { meterReadings: true } });
        if (old.type !== 'MONTHLY' || (old.status !== 'DRAFT' && old.status !== 'UNPAID')) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        const changes = dto.corrections.map(c => {
          const reading = old.meterReadings.find(r => r.kind === c.kind && !r.isOpening);
          if (!reading) throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { corrections: 'Hóa đơn này chưa có chỉ số cần sửa' } });
          return { reading, data: { value: c.value, isMeterReplaced: c.isMeterReplaced ?? reading.isMeterReplaced,
            oldMeterFinal: (c.isMeterReplaced ?? reading.isMeterReplaced) ? c.oldMeterFinal ?? reading.oldMeterFinal : null } };
        });
        // [ASSUMPTION] The closing reading is the next period's opening: once that period is issued, correcting it
        // would silently change an invoice the tenant already has, so reissue the later period first.
        if (changes.length && await tx.invoice.findFirst({ where: { contractId: old.contractId, type: 'MONTHLY',
          periodNo: old.periodNo + 1, status: { in: ['UNPAID', 'PAID', 'SETTLED'] } }, select: { id: true } })) {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        const cancelled = await tx.invoice.updateMany({ where: { id, status: old.status }, data: { status: 'CANCELLED', cancelReason: dto.reason.trim() } });
        if (cancelled.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        const created = await tx.invoice.create({ data: { contractId: old.contractId, type: 'MONTHLY', periodNo: old.periodNo,
          periodStart: old.periodStart, periodEnd: old.periodEnd, replacesId: id, createdById: actor.id }, select: { id: true } });
        newId = created.id;
        for (const { reading, data } of changes) await tx.meterReading.update({ where: { id: reading.id }, data });
        await tx.meterReading.updateMany({ where: { invoiceId: id }, data: { invoiceId: created.id } });
        // Staff reissue = manual issue: approves an abnormal consumption; missing readings → CONFLICT_STATE (MTR-08, BIL-09).
        const outcome = await issueMonthly(tx, created.id, true);
        if (outcome.status === 'UNPAID') mail = outcome.mail;
        const issued = await tx.invoice.findUniqueOrThrow({ where: { id: created.id }, select: { status: true, total: true } });
        await this.audit.log(actor.id, 'invoice.reissue', 'invoice', created.id,
          { invoiceId: id, status: old.status, total: old.total, readings: changes.map(({ reading }) => readingSnapshot(reading)) },
          { invoiceId: created.id, status: issued.status, total: issued.total, reason: dto.reason.trim(),
            readings: changes.map(({ reading, data }) => readingSnapshot({ ...reading, ...data })) }, ip, tx);
        return { invoiceId: created.id, replacesId: id, status: issued.status, total: issued.total };
      });
    });
    await this.deliver(mail, `invoice-issued-${newId}`);
    return result;
  }

  // Q-P4-7, Q-P4-26: mail + in-app again for an UNPAID invoice, at most once per invoice per Hà Nội day (manual only).
  async remind(actor: AuthUser, id: number, ip?: string) {
    let mail: Mail | null = null;
    const result = await this.prisma.$transaction(async tx => {
      await this.assertInvoiceScope(tx, actor, id);
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id} FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: NOTICE_SELECT });
      if (invoice.status !== 'UNPAID') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const today = todayHanoi();
      const since = new Date(today.getTime() - HANOI_OFFSET_MS);
      if (await tx.auditLog.count({ where: { action: 'invoice.remind', entity: 'invoice', entityId: id, createdAt: { gte: since } } })) {
        throw new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
      }
      const { contract: c } = invoice;
      const days = invoice.dueDate ? daysBetween(invoice.dueDate, today) : 0;
      const total = formatMoney(invoice.total);
      const dueDate = invoice.dueDate ? formatDateVn(invoice.dueDate) : '';
      await tx.notification.create({ data: days > 0
        ? { userId: c.tenantId, kind: 'INVOICE_OVERDUE', title: `Hóa đơn TT${id} đã quá hạn ${days} ngày`, body: `Số tiền ${total}. Hạn thanh toán ${dueDate}.`, link: `/thue/hoa-don/${id}` }
        : { userId: c.tenantId, kind: 'INVOICE_ISSUED', title: `Nhắc thanh toán hóa đơn TT${id}`, body: `Số tiền ${total}. Hạn thanh toán ${dueDate}.`, link: `/thue/hoa-don/${id}` } });
      const to = verifiedEmail(c.tenant);
      if (to) {
        const bank = await tx.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } });
        const { qrImageUrl } = depositInvoiceView(invoice, bank?.value);
        mail = { to, ...await emailTemplate(tx, 'invoiceReminder', mailLocale(c.tenant), { code: `TT${id}`, total, dueDate, room: c.room.code, qr: qrImageUrl ?? '' }) };
      }
      const remindedAt = new Date();
      await this.audit.log(actor.id, 'invoice.remind', 'invoice', id, undefined, { email: to !== null, remindedAt: remindedAt.toISOString() }, ip, tx);
      return { invoiceId: id, remindedAt: remindedAt.toISOString(), email: to !== null };
    });
    await this.deliver(mail, `invoice-remind-${id}-${formatDateOnly(todayHanoi())}`);
    return result;
  }
}
