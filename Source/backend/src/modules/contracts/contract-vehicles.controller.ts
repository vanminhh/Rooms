import { Body, Controller, Get, Header, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { ContractVehiclesService } from './contract-vehicles.service.js';
import { ContractIdParamsDto } from './dto/contracts-query.dto.js';
import { CreateVehicleDto, UpdateVehicleDto, VehicleIdParamsDto, VehiclesQueryDto } from './dto/vehicles.dto.js';

@Controller('contracts/:id/vehicles')
@Roles('BOSS', 'MANAGER')
export class ContractVehiclesController {
  constructor(private readonly vehicles: ContractVehiclesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto) {
    return this.vehicles.list(actor, params.id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: CreateVehicleDto, @Ip() ip: string) {
    return this.vehicles.create(actor, params.id, dto, ip);
  }

  @Patch(':vid')
  @Header('Cache-Control', 'no-store')
  update(@CurrentUser() actor: AuthUser, @Param() params: VehicleIdParamsDto, @Body() dto: UpdateVehicleDto, @Ip() ip: string) {
    return this.vehicles.update(actor, params.id, params.vid, dto, ip);
  }
}

@Controller('vehicles')
@Roles('BOSS', 'MANAGER')
export class VehiclesController {
  constructor(private readonly vehicles: ContractVehiclesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  lookup(@CurrentUser() actor: AuthUser, @Query() query: VehiclesQueryDto) {
    return this.vehicles.lookup(actor, query);
  }
}
