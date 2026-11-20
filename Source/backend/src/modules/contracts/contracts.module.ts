import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { MeContractsController } from './me-contracts.controller.js';
import { ContractPasswordService } from './contract-password.service.js';
import { ContractDocumentsService } from './contract-documents.service.js';
import { ContractMoveInService } from './contract-move-in.service.js';
import { ContractCancelService } from './contract-cancel.service.js';
import { ContractOccupantsController, MeContractOccupantsController } from './contract-occupants.controller.js';
import { ContractOccupantsService } from './contract-occupants.service.js';
import { ContractVehiclesController, VehiclesController } from './contract-vehicles.controller.js';
import { ContractVehiclesService } from './contract-vehicles.service.js';

@Module({ imports: [AuditModule], controllers: [ContractsController, MeContractsController, ContractOccupantsController, MeContractOccupantsController, ContractVehiclesController, VehiclesController], providers: [ContractsService, ContractPasswordService, ContractDocumentsService, ContractMoveInService, ContractCancelService, ContractOccupantsService, ContractVehiclesService] })
export class ContractsModule {}
