import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes, Room } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import { pageParams, paginated } from '../../common/pagination.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type {
  AddRoomImageDto,
  CreateRoomDto,
  OrderRoomImagesDto,
  RoomsQueryDto,
  UpdateRoomDto,
} from './dto/rooms.dto.js';
import { destroyRoomImageByAssetId, verifyRoomImage } from '../files/files.service.js';
import { syncRoomPrices } from '../pricing/room-price-sync.js';
import { deriveRoomStatus } from './room-status.js';
import type { RoomGridItem, RoomImageView, RoomStatus, RoomView } from './rooms.types.js';

const ROOM_INCLUDE = {
  images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  contracts: { select: { status: true } },
} satisfies PrismaTypes.RoomInclude;
type RoomRecord = PrismaTypes.RoomGetPayload<{ include: typeof ROOM_INCLUDE }>;
const ROOM_GRID_INCLUDE = {
  contracts: { select: { status: true } },
  prices: {
    where: { status: 'PENDING' },
    select: { id: true, price: true, effectiveFrom: true },
    take: 1,
  },
  _count: { select: { images: true } },
} satisfies PrismaTypes.RoomInclude;
type RoomGridRecord = PrismaTypes.RoomGetPayload<{ include: typeof ROOM_GRID_INCLUDE }>;
const PENDING_VIEWING_STATUSES = ['NEW', 'CONFIRMED'] as const;

function isRoomCodeUniqueError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const dbError = error as { code?: unknown; meta?: { target?: unknown } };
  if (dbError.code !== 'P2002') return false;
  const target = dbError.meta?.target;
  return target === 'rooms_building_id_code_key' || target === 'code'
    || (Array.isArray(target) && (target.includes('buildingId') || target.includes('code')));
}

function isRoomImageAssetUniqueError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const dbError = error as { code?: unknown; meta?: { target?: unknown } };
  if (dbError.code !== 'P2002') return false;
  const target = dbError.meta?.target;
  return target === 'room_images_asset_id_key' || target === 'asset_id'
    || target === 'assetId' || (Array.isArray(target) && target.some((field) => field === 'assetId' || field === 'asset_id'));
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addImage(user: AuthUser, roomId: number, dto: AddRoomImageDto): Promise<RoomImageView> {
    this.assertStaff(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;
        const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, buildingId: true } });
        if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
        this.assertRoomScope(user, room);

        const verified = await verifyRoomImage(tx, roomId, dto);
        const roomImages = await tx.roomImage.findMany({
          where: { roomId },
          select: { publicId: true, sortOrder: true },
        });
        if (roomImages.some((image) => image.publicId === verified.publicId)) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            fields: { publicId: 'Ảnh đã được thêm vào phòng này' },
          });
        }

        const imageCount = await tx.roomImage.count({ where: { roomId } });
        if (imageCount >= 10) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        const nextSortOrder = roomImages.reduce((latest, image) => Math.max(latest, image.sortOrder), -1) + 1;
        const image = await tx.roomImage.create({
          data: {
            roomId,
            assetId: verified.assetId,
            publicId: verified.publicId,
            url: verified.url,
            sortOrder: nextSortOrder,
          },
        });
        return this.toImageView(image);
      });
    } catch (error) {
      if (isRoomImageAssetUniqueError(error)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          fields: { assetId: 'Ảnh Cloudinary đã được gắn vào phòng' },
        });
      }
      throw error;
    }
  }

  async reorderImages(user: AuthUser, roomId: number, dto: OrderRoomImagesDto): Promise<RoomImageView[]> {
    this.assertStaff(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, buildingId: true } });
      if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
      this.assertRoomScope(user, room);

      const images = await tx.roomImage.findMany({
        where: { roomId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      });
      const requested = dto.imageIds ?? [];
      const unique = new Set(requested);
      if (unique.size !== requested.length || unique.size !== images.length
        || images.some((image) => !unique.has(image.id))) {
        throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED });
      }

      const byId = new Map(images.map((image) => [image.id, image]));
      const ordered: RoomImageView[] = [];
      for (const [sortOrder, id] of requested.entries()) {
        await tx.roomImage.update({ where: { id }, data: { sortOrder } });
        const image = byId.get(id);
        if (image) ordered.push(this.toImageView({ ...image, sortOrder }));
      }
      return ordered;
    });
  }

  async deleteImage(user: AuthUser, roomId: number, imageId: number): Promise<void> {
    this.assertStaff(user);
    const image = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, buildingId: true } });
      if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
      this.assertRoomScope(user, room);
      const image = await tx.roomImage.findFirst({
        where: { id: imageId, roomId },
        select: { assetId: true },
      });
      if (!image) throw new NotFoundException(ErrorCode.NOT_FOUND);
      await tx.roomImage.delete({ where: { id: imageId } });
      return { assetId: image.assetId };
    });
    await this.destroyCloudinaryImage(image.assetId);
  }

  private async destroyCloudinaryImage(assetId: string): Promise<void> {
    try {
      await destroyRoomImageByAssetId(assetId);
    } catch {
      this.logger.error('Cloudinary image deletion failed');
    }
  }

  private toImageView(image: { id: number; roomId: number; publicId: string; url: string; sortOrder: number }): RoomImageView {
    return { id: image.id, roomId: image.roomId, publicId: image.publicId, url: image.url, sortOrder: image.sortOrder };
  }

  async list(user: AuthUser, query: RoomsQueryDto) {
    this.assertStaff(user);
    const { page, limit, skip, take } = pageParams(query);
    if (user.role === 'MANAGER' && query.buildingId !== undefined && !(user.buildingIds ?? []).includes(query.buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    const buildingScope: Prisma.RoomWhereInput = user.role === 'BOSS'
      ? (query.buildingId === undefined ? {} : { buildingId: query.buildingId })
      : { buildingId: query.buildingId ?? { in: user.buildingIds ?? [] } };
    const where: Prisma.RoomWhereInput = {
      ...buildingScope,
      ...(user.role === 'MANAGER' ? { building: { isActive: true } } : {}),
      ...(user.role === 'BOSS' && query.includeInactive !== true ? { building: { isActive: true } } : {}),
      ...(query.includeInactive !== true ? { isActive: true } : {}),
    };
    const orderBy = this.orderBy(query.sort);
    const today = todayHanoi();
    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({ where, include: ROOM_GRID_INCLUDE, orderBy, skip, take }),
      this.prisma.room.count({ where }),
    ]);
    return paginated(rows.map((row) => this.toGridItem(row, today)), page, limit, total);
  }

  async get(user: AuthUser, id: number): Promise<RoomView> {
    this.assertStaff(user);
    const room = await this.prisma.room.findUnique({ where: { id }, include: ROOM_INCLUDE });
    if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
    this.assertRoomScope(user, room);
    const view = this.toView(room);
    view.pendingViewingCount = await this.prisma.viewing.count({
      where: { roomId: id, status: { in: [...PENDING_VIEWING_STATUSES] } },
    });
    return view;
  }

  async create(user: AuthUser, dto: CreateRoomDto): Promise<RoomView> {
    this.assertStaff(user);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM buildings WHERE id = ${dto.buildingId} FOR UPDATE`;
        const building = await tx.building.findUnique({
          where: { id: dto.buildingId },
          select: { id: true, managerId: true, isActive: true },
        });
        if (!building) throw new NotFoundException(ErrorCode.NOT_FOUND);
        if (user.role === 'MANAGER' && (building.managerId !== user.id || !building.isActive)) {
          throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        }
        if (!building.isActive) throw new ConflictException(ErrorCode.CONFLICT_STATE);

        return tx.room.create({
          data: {
            buildingId: dto.buildingId,
            code: dto.code,
            floor: dto.floor,
            areaM2: new Prisma.Decimal(dto.areaM2),
            maxOccupants: dto.maxOccupants ?? 2,
            furniture: (dto.furniture ?? []) as Prisma.InputJsonValue,
            description: dto.description ?? null,
          },
          include: ROOM_INCLUDE,
        });
      });
      return this.toView(row);
    } catch (error) {
      if (isRoomCodeUniqueError(error)) throw this.duplicateCode();
      throw error;
    }
  }

  async update(user: AuthUser, id: number, dto: UpdateRoomDto): Promise<RoomView> {
    this.assertStaff(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${id} FOR UPDATE`;
        const current = await tx.room.findUnique({ where: { id } });
        if (!current) throw new NotFoundException(ErrorCode.NOT_FOUND);
        this.assertRoomScope(user, current);

        const data = this.updateData(dto);
        if (dto.maxOccupants !== undefined && dto.maxOccupants < current.maxOccupants) {
          const today = todayHanoi();
          const occupantCount = await tx.occupant.count({
            where: {
              contract: { roomId: id, status: 'ACTIVE' },
              moveInDate: { lte: today },
              OR: [{ moveOutDate: null }, { moveOutDate: { gte: today } }],
            },
          });
          if (occupantCount > dto.maxOccupants) {
            throw new ConflictException(ErrorCode.CONFLICT_STATE);
          }
        }

        const changingMaintenance = dto.underMaintenance !== undefined
          && dto.underMaintenance !== current.underMaintenance;
        const locking = dto.isActive === false && current.isActive;
        if (changingMaintenance || locking) {
          const contractCount = await tx.contract.count({
            where: { roomId: id, status: { in: ['HOLD', 'ACTIVE'] } },
          });
          if (contractCount > 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }

        let row: RoomRecord;
        if (Object.keys(data).length === 0) {
          const unchanged = await tx.room.findUnique({ where: { id }, include: ROOM_INCLUDE });
          if (!unchanged) throw new NotFoundException(ErrorCode.NOT_FOUND);
          row = unchanged;
        } else {
          const result = await tx.room.updateMany({
            where: {
              id,
              isActive: current.isActive,
              underMaintenance: current.underMaintenance,
            },
            data,
          });
          if (result.count === 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);
          // Q-P5-5 A: unlocking applies the current approved price in this transaction (skipped while the building is locked).
          if (dto.isActive === true && !current.isActive) await syncRoomPrices(tx, [id]);
          const updated = await tx.room.findUnique({ where: { id }, include: ROOM_INCLUDE });
          if (!updated) throw new NotFoundException(ErrorCode.NOT_FOUND);
          row = updated;
        }

        const view = this.toView(row);
        if ((dto.underMaintenance === true && !current.underMaintenance) || locking) {
          view.pendingViewingCount = await tx.viewing.count({
            where: { roomId: id, status: { in: [...PENDING_VIEWING_STATUSES] } },
          });
        }
        return view;
      });
    } catch (error) {
      if (isRoomCodeUniqueError(error)) throw this.duplicateCode();
      throw error;
    }
  }

  private updateData(dto: UpdateRoomDto): Prisma.RoomUpdateInput {
    const data: Prisma.RoomUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.areaM2 !== undefined) data.areaM2 = new Prisma.Decimal(dto.areaM2);
    if (dto.maxOccupants !== undefined) data.maxOccupants = dto.maxOccupants;
    if (dto.furniture !== undefined) data.furniture = dto.furniture as Prisma.InputJsonValue;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.underMaintenance !== undefined) data.underMaintenance = dto.underMaintenance;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return data;
  }

  private assertRoomScope(user: AuthUser, room: Pick<Room, 'buildingId'>): void {
    if (user.role === 'MANAGER' && !(user.buildingIds ?? []).includes(room.buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
  }

  private assertStaff(user: AuthUser): void {
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
  }

  private duplicateCode(): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
    });
  }

  private orderBy(sort: RoomsQueryDto['sort']): Prisma.RoomOrderByWithRelationInput[] {
    const floorDirection = sort === '-floor' ? 'desc' : 'asc';
    const codeDirection = sort === '-code' ? 'desc' : 'asc';
    if (sort === 'code' || sort === '-code') return [{ code: codeDirection }, { id: 'asc' }];
    return [{ floor: floorDirection }, { code: codeDirection }, { id: 'asc' }];
  }

  private toGridItem(row: RoomGridRecord, today: Date): RoomGridItem {
    const contracts = row.contracts ?? [];
    const pending = row.prices[0];
    return {
      id: row.id,
      buildingId: row.buildingId,
      code: row.code,
      floor: row.floor,
      areaM2: Number(row.areaM2),
      price: row.price,
      maxOccupants: row.maxOccupants,
      isActive: row.isActive,
      underMaintenance: row.underMaintenance,
      status: deriveRoomStatus({ underMaintenance: row.underMaintenance, contracts }),
      pendingProposal: pending ? {
        id: pending.id,
        price: pending.price,
        effectiveFrom: formatDateOnly(pending.effectiveFrom),
        expired: formatDateOnly(pending.effectiveFrom) < formatDateOnly(today),
      } : null,
      imageCount: row._count.images,
    };
  }

  private toView(row: RoomRecord): RoomView {
    const furniture = Array.isArray(row.furniture)
      ? row.furniture.filter((item): item is string => typeof item === 'string')
      : [];
    const images = row.images.map((image) => ({
      id: image.id,
      roomId: image.roomId,
      publicId: image.publicId,
      url: image.url,
      sortOrder: image.sortOrder,
    }));
    const status: RoomStatus = deriveRoomStatus({
      underMaintenance: row.underMaintenance,
      contracts: row.contracts ?? [],
    });
    return {
      id: row.id,
      buildingId: row.buildingId,
      code: row.code,
      floor: row.floor,
      areaM2: Number(row.areaM2),
      price: row.price,
      maxOccupants: row.maxOccupants,
      furniture,
      description: row.description,
      underMaintenance: row.underMaintenance,
      isActive: row.isActive,
      status,
      images,
    };
  }
}
