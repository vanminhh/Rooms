import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import { CreateViewingDto, UpdateViewingDto, ViewingIdParamsDto, ViewingsQueryDto } from './dto/viewings.dto.js';
import { ViewingsService } from './viewings.service.js';
import type { ViewingView } from './viewings.types.js';

// Staff side of the viewings (VIEW-03, VIEW-04, API-08). The guest route lives in public-viewings.controller.ts.
@Controller('viewings')
export class ViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Roles('BOSS', 'MANAGER')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ViewingsQueryDto): Promise<Paginated<ViewingView>> {
    return this.viewings.list(user, query);
  }

  @Roles('BOSS', 'MANAGER')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateViewingDto): Promise<ViewingView> {
    return this.viewings.create(user, dto);
  }

  @Roles('BOSS', 'MANAGER')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: ViewingIdParamsDto,
    @Body() dto: UpdateViewingDto,
  ): Promise<ViewingView> {
    return this.viewings.update(user, params.id, dto);
  }
}
