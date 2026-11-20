import { Controller, Get, Header, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, TenantMeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PaginationQuery } from '../../common/pagination.js';
import { ContractsService } from './contracts.service.js';
import { ContractIdParamsDto } from './dto/contracts-query.dto.js';
import { ContractDocumentsService } from './contract-documents.service.js';
import { ContractOccupantsService } from './contract-occupants.service.js';

@Controller('me/contracts')
@TenantMeRoles()
export class MeContractsController {
  constructor(private readonly contracts: ContractsService, private readonly documents: ContractDocumentsService, private readonly occupants: ContractOccupantsService) {}

  @Post(':id/id-photo-sign')
  @Header('Cache-Control', 'no-store')
  signIdPhoto(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.occupants.signMyIdPhoto(actor, params.id);
  }

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
}
