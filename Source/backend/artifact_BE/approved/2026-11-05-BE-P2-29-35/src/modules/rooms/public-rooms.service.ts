import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import { todayHanoi } from '../../common/date/today.js';
import { newestRoomIds } from '../../common/rooms/public-price-order.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import {
  loadPublicRates, PUBLIC_ROOM_DETAIL_INCLUDE, PUBLIC_ROOM_LIST_INCLUDE, toPublicRoomDetail, toPublicRoomListItem,
} from '../../common/rooms/public-view.js';
import { pageParams, paginated, type Paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { BuildingContactService } from '../buildings/building-contact.service.js';
import type { PublicRoomsQueryDto } from './dto/public-rooms.dto.js';
import type { PublicRoomDetail, PublicRoomListItem } from './public.types.js';

const FEATURED_LIMIT = 6;

// Every query starts from publicRoomWhere(today) (ROOM-05, PUB-01).
function publicWhere(query: PublicRoomsQueryDto, today: Date): Prisma.RoomWhereInput {
  const conditions: Prisma.RoomWhereInput[] = [publicRoomWhere(today)];
  if (query.buildingId !== undefined) conditions.push({ buildingId: query.buildingId });
  if (query.district !== undefined) conditions.push({ building: { district: query.district } });
  if (query.ward !== undefined) conditions.push({ building: { ward: query.ward } });
  if (query.minPrice !== undefined) conditions.push({ price: { gte: query.minPrice } });
  if (query.maxPrice !== undefined) conditions.push({ price: { lte: query.maxPrice } });
  return { AND: conditions };
}

function priceOrder(sort: 'price' | '-price'): Prisma.RoomOrderByWithRelationInput[] {
  return [{ price: sort === '-price' ? 'desc' : 'asc' }, { id: 'asc' }];
}

@Injectable()
export class PublicRoomsService {
  constructor(private readonly prisma: PrismaService, private readonly contacts: BuildingContactService) {}

  // PUB-02: a missing room and a non-public room give the same 404 (no hint that it exists).
  async detail(id: number): Promise<PublicRoomDetail> {
    const today = todayHanoi();
    const room = await this.prisma.room.findFirst({
      where: { id, ...publicRoomWhere(today) },
      include: PUBLIC_ROOM_DETAIL_INCLUDE,
    });
    if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
    const [rates, contact] = await Promise.all([
      loadPublicRates(this.prisma, room.buildingId, today),
      this.contacts.buildingContact(room.building),
    ]);
    return toPublicRoomDetail(room, rates, contact);
  }

  async list(query: PublicRoomsQueryDto): Promise<Paginated<PublicRoomListItem>> {
    const today = todayHanoi();
    const { page, limit, skip, take } = pageParams(query);
    const where = publicWhere(query, today);
    const sort = query.sort ?? 'price';
    if (sort === 'newest') {
      const ids = await newestRoomIds(this.prisma, where, today);
      const rows = await this.findInOrder(where, ids.slice(skip, skip + take));
      return paginated(rows, page, limit, ids.length);
    }
    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({ where, include: PUBLIC_ROOM_LIST_INCLUDE, orderBy: priceOrder(sort), skip, take }),
      this.prisma.room.count({ where }),
    ]);
    return paginated(rows.map(toPublicRoomListItem), page, limit, total);
  }

  async featured(): Promise<PublicRoomListItem[]> {
    const today = todayHanoi();
    const where = publicRoomWhere(today);
    const ids = await newestRoomIds(this.prisma, where, today);
    return this.findInOrder(where, ids.slice(0, FEATURED_LIMIT));
  }

  // The page read repeats the public filter, so a room that stopped being public since the id read is dropped.
  private async findInOrder(where: Prisma.RoomWhereInput, ids: number[]): Promise<PublicRoomListItem[]> {
    const rows = await this.prisma.room.findMany({
      where: { AND: [where, { id: { in: ids } }] },
      include: PUBLIC_ROOM_LIST_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toPublicRoomListItem(row)] : [];
    });
  }
}
