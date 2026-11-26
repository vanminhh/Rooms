import { HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { paymentReceivedNotice } from '../billing/payment-notice.js';
import type { Mail } from '../mailer/mailer.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { invoiceCodeFrom, matchOutcome } from './match-invoice.js';
import { BANK_ADAPTER, fakeAdapter, type BankWebhookAdapter, type IncomingTx, type WebhookRequest } from './webhook-adapter.js';

export interface WebhookSummary { received: number; matched: number; duplicates: number; skipped: number }
type Outcome = 'DUPLICATE' | 'MATCHED' | 'UNMATCHED';

// BANK-01..04, BANK-07 (Q-P4-28..33).
@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mailer: MailerService,
    @Inject(BANK_ADAPTER) private readonly adapter: BankWebhookAdapter) {}

  async processWebhook(req: WebhookRequest): Promise<WebhookSummary> {
    const secret = process.env.BANK_WEBHOOK_SECRET?.trim();
    if (!secret) throw new HttpException(ErrorCode.WEBHOOK_NOT_CONFIGURED, HttpStatus.SERVICE_UNAVAILABLE); // Q-P4-35
    if (!this.adapter.verify(req, secret)) throw new UnauthorizedException(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
    // Q-P4-29: without a valid receiving account nothing is stored, so the provider retries once it is configured.
    const bank = await this.prisma.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } });
    const accountNo = (bank?.value as { accountNo?: unknown } | null)?.accountNo;
    if (typeof accountNo !== 'string' || !/^[A-Za-z0-9]{1,30}$/.test(accountNo)) {
      throw new HttpException(ErrorCode.WEBHOOK_NOT_CONFIGURED, HttpStatus.SERVICE_UNAVAILABLE);
    }
    const { txs, skipped } = this.adapter.parse(req.body);
    const summary: WebhookSummary = { received: 0, matched: 0, duplicates: 0, skipped };
    for (const tx of txs) {
      const outcome = await this.processSafely(tx, accountNo);
      if (outcome === 'DUPLICATE') summary.duplicates++;
      else if (outcome) { summary.received++; if (outcome === 'MATCHED') summary.matched++; }
    }
    this.logger.log(`bank webhook: received=${summary.received} matched=${summary.matched} duplicates=${summary.duplicates} skipped=${summary.skipped}`);
    return summary;
  }

  // BANK-02: confirm a duplicate from durable storage before acknowledging a failed insert.
  private async processSafely(tx: IncomingTx, accountNo: string): Promise<Outcome | null> {
    try {
      return await this.processOne(tx, accountNo);
    } catch (error) {
      if (await this.exists(tx)) return 'DUPLICATE';
      if (this.adapter !== fakeAdapter) throw error; // SePay must retry a payment whose transaction rolled back.
      this.logger.warn(`bank tx ${tx.providerTxId}: matching failed, storing it unmatched (${error instanceof Error ? error.message : String(error)})`);
      try {
        await this.prisma.bankTransaction.create({ data: { ...this.row(tx), note: 'Lỗi khi khớp tự động, cần gán tay' } });
        return 'UNMATCHED';
      } catch (retry) {
        if (await this.exists(tx)) return 'DUPLICATE';
        this.logger.error(`bank tx ${tx.providerTxId} could not be stored`, retry instanceof Error ? retry.stack : String(retry));
        return null;
      }
    }
  }

  private async processOne(tx: IncomingTx, accountNo: string): Promise<Outcome> {
    let mail: Mail | null = null;
    let invoiceId = 0;
    const outcome = await this.prisma.$transaction(async t => {
      // BANK-02: insert first; the unique (provider, provider_tx_id) rejects a resent webhook.
      const { id } = await t.bankTransaction.create({ data: this.row(tx), select: { id: true } });
      if (tx.accountNumber !== accountNo) { // Q-P4-29: kept for Boss, never matched
        await t.bankTransaction.update({ where: { id }, data: { note: `Tiền vào tài khoản ${tx.accountNumber}, không phải tài khoản nhận hiện tại` } });
        return 'UNMATCHED' as const;
      }
      const code = invoiceCodeFrom(tx.content);
      if (code !== null) await t.$queryRaw`SELECT id FROM invoices WHERE id = ${code} FOR UPDATE`;
      const invoice = code === null ? null : await t.invoice.findUnique({ where: { id: code }, select: { status: true, total: true } });
      const match = matchOutcome(code, invoice, tx.amount);
      if (!match.match) {
        if (match.note) await t.bankTransaction.update({ where: { id }, data: { note: match.note } });
        return 'UNMATCHED' as const;
      }
      invoiceId = code!;
      await t.bankTransaction.update({ where: { id }, data: { status: 'MATCHED', invoiceId } });
      // BANK-03: the trigger checks UNPAID + exact total again and sets PAID.
      const payment = await t.payment.create({ data: { invoiceId, amount: tx.amount, method: 'BANK_TRANSFER', source: 'WEBHOOK',
        bankTransactionId: id, recordedById: null, paidAt: tx.receivedAt }, select: { id: true } });
      await this.audit.log(null, 'payment.record', 'payment', payment.id, undefined, // AUD-03
        { invoiceId, amount: tx.amount, source: 'WEBHOOK', bankTransactionId: id, paidAt: tx.receivedAt.toISOString() }, undefined, t);
      mail = await paymentReceivedNotice(t, invoiceId);
      return 'MATCHED' as const;
    });
    if (mail) {
      try { await sendWithRetry(this.mailer, mail, `payment-received-${invoiceId}`); }
      catch { this.logger.warn(`Invoice TT${invoiceId}: payment email failed after retry`); }
    }
    return outcome;
  }

  // BANK-07: raw is the provider's transaction item only; headers and the secret never reach the DB.
  private row(tx: IncomingTx) {
    return { provider: this.adapter.provider, providerTxId: tx.providerTxId, amount: tx.amount, content: tx.content,
      accountNumber: tx.accountNumber, receivedAt: tx.receivedAt, raw: tx.raw, status: 'UNMATCHED' as const };
  }

  private async exists(tx: IncomingTx) {
    return !!await this.prisma.bankTransaction.findUnique({ where: { provider_providerTxId: { provider: this.adapter.provider, providerTxId: tx.providerTxId } }, select: { id: true } });
  }
}
