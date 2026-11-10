import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicBuildingWhere, publicRoomWhere } from '../../common/rooms/public-room.js';
import {
  loadPublicRates, PUBLIC_BUILDING_INCLUDE, PUBLIC_ROOM_LIST_INCLUDE, toPublicBuildingDetail,
  toPublicRoomListItem,
} from '../../common/rooms/public-view.js';
import { BuildingContactService } from './building-contact.service.js';
import type { PublicBuildingDetail } from '../rooms/public.types.js';

export interface PublicLocation {
  district: string;
  roomCount: number;
  wards: { ward: string; roomCount: number }[];
}

const byName = (a: string, b: string): number => a.localeCompare(b, 'vi');

@Injectable()
export class PublicBuildingsService {
  constructor(private readonly prisma: PrismaService, private readonly contacts: BuildingContactService) {}

  // PUB-02: a missing building and a building without public rooms give the same 404.
  async detail(id: number): Promise<PublicBuildingDetail> {
    const today = todayHanoi();
    const building = await this.prisma.building.findFirst({
      where: { id, ...publicBuildingWhere(today) },
      include: PUBLIC_BUILDING_INCLUDE,
    });
    if (!building) throw new NotFoundException(ErrorCode.NOT_FOUND);
    const [rates, rooms, contact] = await Promise.all([
      loadPublicRates(this.prisma, id, today),
      this.prisma.room.findMany({
        where: { AND: [{ buildingId: id }, publicRoomWhere(today)] },
        include: PUBLIC_ROOM_LIST_INCLUDE,
        orderBy: [{ price: 'asc' }, { id: 'asc' }],
      }),
      this.contacts.buildingContact(building),
    ]);
    return toPublicBuildingDetail(building, rates, contact, rooms.map(toPublicRoomListItem));
  }

  // BLD-05: only districts and wards with at least one public room, counted by public rooms.
  async locations(): Promise<PublicLocation[]> {
    const today = todayHanoi();
    const buildings = await this.prisma.building.findMany({
      where: publicBuildingWhere(today),
      select: { district: true, ward: true, _count: { select: { rooms: { where: publicRoomWhere(today) } } } },
    });
    const wardCounts = new Map<string, Map<string, number>>();
    for (const building of buildings) {
      const wards = wardCounts.get(building.district) ?? new Map<string, number>();
      wards.set(building.ward, (wards.get(building.ward) ?? 0) + building._count.rooms);
      wardCounts.set(building.district, wards);
    }
    return [...wardCounts]
      .sort(([a], [b]) => byName(a, b))
      .map(([district, wards]) => ({
        district,
        roomCount: [...wards.values()].reduce((sum, count) => sum + count, 0),
        wards: [...wards]
          .sort(([a], [b]) => byName(a, b))
          .map(([ward, roomCount]) => ({ ward, roomCount })),
      }));
  }
}
