import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { StaffRequestsController, TenantRequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';
import { CloseIncidentsJob } from '../../jobs/close-incidents.job.js';
import { BankModule } from '../bank/bank.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { ContractsModule } from '../contracts/contracts.module.js';

@Module({ imports: [AuditModule, BankModule, BillingModule, ContractsModule], controllers: [StaffRequestsController, TenantRequestsController], providers: [RequestsService, CloseIncidentsJob] })
export class RequestsModule {}
