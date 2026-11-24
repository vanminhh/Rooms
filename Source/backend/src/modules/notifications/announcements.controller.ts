import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementsQueryDto, CreateAnnouncementDto } from './dto/announcements.dto.js';

@Controller('announcements')
@Roles('BOSS', 'MANAGER')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser, @Query() query: AnnouncementsQueryDto) {
    return this.announcements.list(user, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.announcements.create(user, dto);
  }
}
