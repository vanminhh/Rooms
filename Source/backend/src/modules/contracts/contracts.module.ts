import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';

@Module({ imports: [AuditModule], controllers: [ContractsController], providers: [ContractsService] })
export class ContractsModule {}
