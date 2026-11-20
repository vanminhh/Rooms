import { Body, Controller, Get, Header, Ip, Param, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractsService } from './contracts.service.js';
import { ContractIdParamsDto, ContractsQueryDto } from './dto/contracts-query.dto.js';
import { CreateContractDto } from './dto/create-contract.dto.js';
import { SignContractDto } from './dto/sign-contract.dto.js';
import { ContractPasswordService } from './contract-password.service.js';
import { ContractDocumentsService } from './contract-documents.service.js';
import { ContractMoveInService } from './contract-move-in.service.js';
import { MoveInContractDto } from './dto/move-in-contract.dto.js';

@Controller('contracts')
@Roles('BOSS', 'MANAGER')
export class ContractsController {
  constructor(private readonly contracts: ContractsService, private readonly passwords: ContractPasswordService, private readonly documents: ContractDocumentsService, private readonly moveIns: ContractMoveInService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: ContractsQueryDto) {
    return this.contracts.list(actor, query);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.contracts.get(actor, params.id);
  }

  @Get(':id/scan')
  @Header('Cache-Control', 'no-store')
  scan(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Ip() ip: string) {
    return this.documents.scan(actor, params.id, ip);
  }

  @Get(':id/print')
  @Header('Cache-Control', 'no-store')
  print(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.documents.print(actor, params.id);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateContractDto, @Ip() ip: string) {
    return this.contracts.create(actor, dto, ip);
  }

  @Post(':id/sign')
  @Header('Cache-Control', 'no-store')
  sign(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: SignContractDto, @Ip() ip: string) {
    return this.contracts.sign(actor, params.id, dto, ip);
  }

  @Post(':id/reset-password')
  @Header('Cache-Control', 'no-store')
  resetPassword(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Ip() ip: string) {
    return this.passwords.resetPassword(actor, params.id, ip);
  }

  @Post(':id/move-in')
  @Header('Cache-Control', 'no-store')
  moveIn(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: MoveInContractDto, @Ip() ip: string) {
    return this.moveIns.moveIn(actor, params.id, dto, ip);
  }
}
