import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import { PublicIdParamsDto, PublicRoomsQueryDto } from './dto/public-rooms.dto.js';
import { PublicRoomsService } from './public-rooms.service.js';
import type { PublicRoomDetail, PublicRoomListItem } from './public.types.js';

// Public room pages (PUB-01..04): no auth; the service applies ROOM-05 to every query.
@Controller('public')
export class PublicRoomsController {
  constructor(private readonly rooms: PublicRoomsService) {}

  @Public()
  @Get('rooms')
  list(@Query() query: PublicRoomsQueryDto): Promise<Paginated<PublicRoomListItem>> {
    return this.rooms.list(query);
  }

  @Public()
  @Get('featured-rooms')
  featured(): Promise<PublicRoomListItem[]> {
    return this.rooms.featured();
  }

  @Public()
  @Get('rooms/:id')
  detail(@Param() params: PublicIdParamsDto): Promise<PublicRoomDetail> {
    return this.rooms.detail(params.id);
  }
}
