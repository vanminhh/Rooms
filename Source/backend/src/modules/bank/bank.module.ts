import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { BankTransactionsController, WebhookController } from './bank.controller.js';
import { BankTransactionsService } from './bank-transactions.service.js';
import { BankService } from './bank.service.js';
import { configuredBankAdapter } from './sepay-adapter.js';
import { BANK_ADAPTER } from './webhook-adapter.js';

@Module({ imports: [AuditModule, MailerModule], controllers: [WebhookController, BankTransactionsController], providers: [BankService, BankTransactionsService, { provide: BANK_ADAPTER, useFactory: configuredBankAdapter }], exports: [BankTransactionsService] })
export class BankModule {}
