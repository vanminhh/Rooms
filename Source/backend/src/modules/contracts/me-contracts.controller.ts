import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CurrentUser, TenantMeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PaginationQuery } from '../../common/pagination.js';
import { ContractsService } from './contracts.service.js';
import { ContractIdParamsDto } from './dto/contracts-query.dto.js';

@Controller('me/contracts')
@TenantMeRoles()
export class MeContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Query() query: PaginationQuery) {
    return this.contracts.listMine(actor, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.contracts.getMine(actor, params.id);
  }
}
