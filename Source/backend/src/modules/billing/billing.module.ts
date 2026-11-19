import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { BillingService } from './billing.service.js';
import { InvoicesController } from './invoices.controller.js';

@Module({ imports: [AuditModule], controllers: [InvoicesController], providers: [BillingService] })
export class BillingModule {}
