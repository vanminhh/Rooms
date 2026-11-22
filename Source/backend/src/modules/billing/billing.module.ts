import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { BillingService } from './billing.service.js';
import { InvoiceQueriesService } from './invoice-queries.service.js';
import { InvoicesController, MeInvoicesController } from './invoices.controller.js';

@Module({ imports: [AuditModule, MailerModule], controllers: [InvoicesController, MeInvoicesController], providers: [BillingService, InvoiceQueriesService] })
export class BillingModule {}
