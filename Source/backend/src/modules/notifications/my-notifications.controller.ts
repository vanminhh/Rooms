import { Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import { MyNotificationsQueryDto, NotificationIdParamsDto } from './dto/my-notifications.dto.js';
import { MyNotificationsService } from './my-notifications.service.js';

// NOTI-11 staff inbox (bell) and NOTI-01 tenant inbox. Guests have no inbox (D-34).
@Controller('me/notifications')
@Roles('BOSS', 'MANAGER', 'TENANT')
export class MyNotificationsController {
  constructor(private readonly notifications: MyNotificationsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser, @Query() query: MyNotificationsQueryDto) {
    return this.notifications.list(user, query);
  }

  // Declared before ':id/read' so "read-all" is never parsed as an id.
  @Post('read-all')
  @Header('Cache-Control', 'no-store')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.readAll(user);
  }

  @Post(':id/read')
  @Header('Cache-Control', 'no-store')
  read(@CurrentUser() user: AuthUser, @Param() params: NotificationIdParamsDto) {
    return this.notifications.read(user, params.id);
  }
}
