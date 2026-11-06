import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import {
  CreateServiceDto,
  ServiceIdParamsDto,
  ServicesQueryDto,
  UpdateServiceDto,
} from './dto/services.dto.js';
import { ServicesService } from './services.service.js';
import type { ServiceView } from './buildings.types.js';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Roles('BOSS', 'MANAGER')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ServicesQueryDto,
  ): Promise<Paginated<ServiceView>> {
    return this.services.list(user, query);
  }

  @Roles('BOSS')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateServiceDto,
  ): Promise<ServiceView> {
    return this.services.create(user, dto);
  }

  @Roles('BOSS')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: ServiceIdParamsDto,
    @Body() dto: UpdateServiceDto,
  ): Promise<ServiceView> {
    return this.services.update(user, params.id, dto);
  }
}
