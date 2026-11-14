import type { Lang } from '../../common/i18n/locale.js';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AMENITIES, ROOM_TYPES } from '../../common/catalog/catalog.js';
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
import type { PublicFiltersView, PublicRoomDetail, PublicRoomListItem } from './public.types.js';

const FEATURED_LIMIT = 6;

// Every query starts from publicRoomWhere(today) (ROOM-05, PUB-01).
function publicWhere(query: PublicRoomsQueryDto, today: Date): Prisma.RoomWhereInput {
  const conditions: Prisma.RoomWhereInput[] = [publicRoomWhere(today)];
  if (query.buildingId !== undefined) conditions.push({ buildingId: query.buildingId });
  if (query.district !== undefined) conditions.push({ building: { district: query.district } });
  if (query.ward !== undefined) conditions.push({ building: { ward: query.ward } });
  if (query.minPrice !== undefined) conditions.push({ price: { gte: query.minPrice } });
  if (query.maxPrice !== undefined) conditions.push({ price: { lte: query.maxPrice } });
  // PUB-06: every extra filter goes into the same AND list, so it runs before paging. A "chưa nhập" (null) value never matches.
  if (query.minArea !== undefined) conditions.push({ areaM2: { gte: new Prisma.Decimal(query.minArea) } });
  if (query.maxArea !== undefined) conditions.push({ areaM2: { lte: new Prisma.Decimal(query.maxArea) } });
  if (query.minOccupants !== undefined) conditions.push({ maxOccupants: { gte: query.minOccupants } });
  if (query.floor !== undefined) conditions.push({ floor: query.floor });
  if (query.balcony === 'true') conditions.push({ hasBalcony: true });
  if (query.window === 'true') conditions.push({ hasWindow: true });
  if (query.pets === 'true') conditions.push({ petsAllowed: true });
  if (query.roomType !== undefined) conditions.push({ roomType: query.roomType });
  // One condition per code: the building must have every listed code. Old free text never equals a code (BLD-08).
  for (const code of query.amenities ?? []) conditions.push({ building: { amenities: { array_contains: [code] } } });
  return { AND: conditions };
}

function priceOrder(sort: 'price' | '-price'): Prisma.RoomOrderByWithRelationInput[] {
  return [{ price: sort === '-price' ? 'desc' : 'asc' }, { id: 'asc' }];
}

@Injectable()
export class PublicRoomsService {
  constructor(private readonly prisma: PrismaService, private readonly contacts: BuildingContactService) {}

  // PUB-02: a missing room and a non-public room give the same 404 (no hint that it exists).
  async detail(id: number, lang: Lang = 'vi'): Promise<PublicRoomDetail> {
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
    return toPublicRoomDetail(room, rates, contact, lang);
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

  // PUB-06: constant lists, no database read and no building or room data.
  filters(): PublicFiltersView {
    return { amenities: [...AMENITIES], roomTypes: [...ROOM_TYPES] };
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
