import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import {
  AddRoomImageDto,
  CreateRoomDto,
  OrderRoomImagesDto,
  RoomIdParamsDto,
  RoomImageIdParamsDto,
  RoomsQueryDto,
  UpdateRoomDto,
} from './dto/rooms.dto.js';
import { RoomsService } from './rooms.service.js';
import type { RoomGridItem, RoomImageView, RoomView } from './rooms.types.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Roles('BOSS', 'MANAGER')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: RoomsQueryDto): Promise<Paginated<RoomGridItem>> {
    return this.rooms.list(user, query);
  }

  @Roles('BOSS', 'MANAGER')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param() params: RoomIdParamsDto): Promise<RoomView> {
    return this.rooms.get(user, params.id);
  }

  @Roles('BOSS', 'MANAGER')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoomDto): Promise<RoomView> {
    return this.rooms.create(user, dto);
  }

  @Roles('BOSS', 'MANAGER')
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param() params: RoomIdParamsDto, @Body() dto: UpdateRoomDto): Promise<RoomView> {
    return this.rooms.update(user, params.id, dto);
  }

  @Roles('BOSS', 'MANAGER')
  @Post(':id/images')
  addImage(
    @CurrentUser() user: AuthUser,
    @Param() params: RoomIdParamsDto,
    @Body() dto: AddRoomImageDto,
  ): Promise<RoomImageView> {
    return this.rooms.addImage(user, params.id, dto);
  }

  @Roles('BOSS', 'MANAGER')
  @Patch(':id/images/order')
  reorderImages(
    @CurrentUser() user: AuthUser,
    @Param() params: RoomIdParamsDto,
    @Body() dto: OrderRoomImagesDto,
  ): Promise<RoomImageView[]> {
    return this.rooms.reorderImages(user, params.id, dto);
  }

  @Roles('BOSS', 'MANAGER')
  @Delete(':id/images/:imageId')
  async deleteImage(@CurrentUser() user: AuthUser, @Param() params: RoomImageIdParamsDto): Promise<null> {
    await this.rooms.deleteImage(user, params.id, params.imageId);
    return null;
  }
}
