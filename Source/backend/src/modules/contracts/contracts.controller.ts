import { Body, Controller, Get, Header, Ip, Param, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractsService } from './contracts.service.js';
import { ContractIdParamsDto, ContractsQueryDto } from './dto/contracts-query.dto.js';
import { CreateContractDto } from './dto/create-contract.dto.js';
import { SignContractDto } from './dto/sign-contract.dto.js';
import { ContractPasswordService } from './contract-password.service.js';

@Controller('contracts')
@Roles('BOSS', 'MANAGER')
export class ContractsController {
  constructor(private readonly contracts: ContractsService, private readonly passwords: ContractPasswordService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser, @Query() query: ContractsQueryDto) {
    return this.contracts.list(actor, query);
  }

  @Get(':id')
  get(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.contracts.get(actor, params.id);
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
}
