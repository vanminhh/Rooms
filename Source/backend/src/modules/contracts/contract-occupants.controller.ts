import { Body, Controller, Get, Header, Ip, Param, Patch, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractOccupantsService } from './contract-occupants.service.js';
import { ContractIdParamsDto } from './dto/contracts-query.dto.js';
import { CreateOccupantDto, OccupantIdParamsDto, UpdateOccupantDto } from './dto/occupants.dto.js';

@Controller('contracts/:id/occupants')
@Roles('BOSS', 'MANAGER')
export class ContractOccupantsController {
  constructor(private readonly occupants: ContractOccupantsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.occupants.list(actor, params.id);
  }

  @Get(':oid/id-photos')
  @Header('Cache-Control', 'no-store')
  idPhotos(@CurrentUser() actor: AuthUser, @Param() params: OccupantIdParamsDto, @Ip() ip: string) {
    return this.occupants.idPhotos(actor, params.id, params.oid, ip);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: CreateOccupantDto, @Ip() ip: string) {
    return this.occupants.create(actor, params.id, dto, ip);
  }

  @Patch(':oid')
  @Header('Cache-Control', 'no-store')
  update(@CurrentUser() actor: AuthUser, @Param() params: OccupantIdParamsDto, @Body() dto: UpdateOccupantDto, @Ip() ip: string) {
    return this.occupants.update(actor, params.id, params.oid, dto, ip);
  }
}

@Controller('me/contracts/:id/occupants')
@Roles('TENANT')
export class MeContractOccupantsController {
  constructor(private readonly occupants: ContractOccupantsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: CreateOccupantDto, @Ip() ip: string) {
    return this.occupants.create(actor, params.id, dto, ip);
  }
}
