import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { BillingService } from './billing.service.js';
import { InvoiceQueriesService } from './invoice-queries.service.js';
import { InvoicesController, MeInvoicesController } from './invoices.controller.js';
import { SettlementController, SettlementsController } from './settlement.controller.js';
import { SettlementService } from './settlement.service.js';

@Module({ imports: [AuditModule, MailerModule],
  controllers: [InvoicesController, MeInvoicesController, SettlementController, SettlementsController],
  providers: [BillingService, InvoiceQueriesService, SettlementService] })
export class BillingModule {}
