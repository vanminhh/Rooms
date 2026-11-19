import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { MeContractsController } from './me-contracts.controller.js';

@Module({ imports: [AuditModule], controllers: [ContractsController, MeContractsController], providers: [ContractsService] })
export class ContractsModule {}
