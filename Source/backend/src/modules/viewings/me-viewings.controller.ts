import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, MeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PaginationQuery } from '../../common/pagination.js';
import { BookViewingDto, ViewingIdParamsDto, ViewingTimesQueryDto } from './dto/viewings.dto.js';
import { ViewingsService } from './viewings.service.js';

@Controller('me')
@MeRoles()
export class MeViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Get('viewings')
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQuery) {
    return this.viewings.listMine(user, query);
  }

  @Post('viewings')
  @Header('Cache-Control', 'no-store')
  book(@CurrentUser() user: AuthUser, @Body() dto: BookViewingDto) {
    return this.viewings.book(user, dto);
  }

  @Get('viewings/:id')
  @Header('Cache-Control', 'no-store')
  detail(@CurrentUser() user: AuthUser, @Param() params: ViewingIdParamsDto) {
    return this.viewings.getMine(user, params.id);
  }

  @Post('viewings/:id/cancel')
  @Header('Cache-Control', 'no-store')
  cancel(@CurrentUser() user: AuthUser, @Param() params: ViewingIdParamsDto) {
    return this.viewings.cancelMine(user, params.id);
  }

  @Get('rooms/:id/viewing-times')
  @Header('Cache-Control', 'no-store')
  times(@CurrentUser() user: AuthUser, @Param() params: ViewingIdParamsDto, @Query() query: ViewingTimesQueryDto) {
    return this.viewings.times(params.id, query, user);
  }
}
