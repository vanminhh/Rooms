import { Module } from '@nestjs/common';
import { MetersController, MissedInvoiceController, MonthlyIssueController } from './meters.controller.js';
import { MissedInvoiceService } from './missed-invoice.service.js';
import { MonthlyInvoiceJob } from '../../jobs/monthly-invoice.job.js';
import { MetersService } from './meters.service.js';

import { AuditModule } from '../audit/audit.module.js';
import { MailerModule } from '../mailer/mailer.module.js';
import { MeterBillingService } from './meter-billing.service.js';

@Module({ imports: [AuditModule, MailerModule], controllers: [MetersController, MonthlyIssueController, MissedInvoiceController],
  providers: [MetersService, MeterBillingService, MissedInvoiceService, MonthlyInvoiceJob] })
export class MetersModule {}
