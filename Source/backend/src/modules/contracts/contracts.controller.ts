import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractsService } from './contracts.service.js';
import { ContractIdParamsDto, ContractsQueryDto } from './dto/contracts-query.dto.js';
import { CreateContractDto } from './dto/create-contract.dto.js';

@Controller('contracts')
@Roles('BOSS', 'MANAGER')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

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
}
