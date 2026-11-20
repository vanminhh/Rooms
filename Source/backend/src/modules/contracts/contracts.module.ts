import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { MeContractsController } from './me-contracts.controller.js';
import { ContractPasswordService } from './contract-password.service.js';
import { ContractDocumentsService } from './contract-documents.service.js';

@Module({ imports: [AuditModule], controllers: [ContractsController, MeContractsController], providers: [ContractsService, ContractPasswordService, ContractDocumentsService] })
export class ContractsModule {}
