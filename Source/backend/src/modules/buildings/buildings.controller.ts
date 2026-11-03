import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
  Roles,
} from '../../common/guards/auth.decorators.js';
import { BuildingWriteGuard } from './building-write.guard.js';
import {
  BuildingIdParamsDto,
  BuildingsQueryDto,
  CreateBuildingDto,
  UpdateBuildingDto,
} from './dto/buildings.dto.js';
import { BuildingsService } from './buildings.service.js';
import type { BuildingView } from './buildings.types.js';
import type { Paginated } from '../../common/pagination.js';

@Controller('buildings')
export class BuildingsController {
  constructor(private readonly buildings: BuildingsService) {}

  @Roles('BOSS', 'MANAGER')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: BuildingsQueryDto,
  ): Promise<Paginated<BuildingView>> {
    return this.buildings.list(user, query);
  }

  @Roles('BOSS')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBuildingDto,
    @Ip() ip: string,
  ): Promise<BuildingView> {
    return this.buildings.create(user, dto, ip);
  }

  @Roles('BOSS', 'MANAGER')
  @UseGuards(BuildingWriteGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: BuildingIdParamsDto,
    @Body() dto: UpdateBuildingDto,
    @Ip() ip: string,
  ): Promise<BuildingView> {
    return this.buildings.update(user, params.id, dto, ip);
  }
}
