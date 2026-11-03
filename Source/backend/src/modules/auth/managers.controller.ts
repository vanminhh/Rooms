import { Body, Controller, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import {
  CreateManagerDto,
  ManagerIdParamsDto,
  ManagersQueryDto,
  UpdateManagerDto,
} from './dto/managers.dto.js';
import { ManagersService } from './managers.service.js';
import type { CreatedManager, ManagerView } from './managers.service.js';

@Controller('managers')
export class ManagersController {
  constructor(private readonly managers: ManagersService) {}

  @Roles('BOSS')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ManagersQueryDto,
  ): Promise<Paginated<ManagerView>> {
    return this.managers.list(user, query);
  }

  @Roles('BOSS')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManagerDto,
    @Ip() ip: string,
  ): Promise<CreatedManager> {
    return this.managers.create(user, dto, ip);
  }

  @Roles('BOSS')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: ManagerIdParamsDto,
    @Body() dto: UpdateManagerDto,
    @Ip() ip: string,
  ): Promise<ManagerView> {
    return this.managers.update(user, params.id, dto, ip);
  }
}
