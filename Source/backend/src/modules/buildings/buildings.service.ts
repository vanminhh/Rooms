import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Building, Prisma as PrismaTypes } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { pageParams, paginated } from '../../common/pagination.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { assertBuildingPatchFields } from './building-write.guard.js';
import { assertAssignableManager } from './manager-assignment.js';
import type { BuildingView } from './buildings.types.js';
import type { BuildingsQueryDto, CreateBuildingDto, UpdateBuildingDto } from './dto/buildings.dto.js';

const BUILDING_INCLUDE = {
  manager: { select: { id: true, fullName: true, isActive: true } },
} satisfies PrismaTypes.BuildingInclude;

type BuildingRecord = PrismaTypes.BuildingGetPayload<{ include: typeof BUILDING_INCLUDE }>;

const PENDING_VIEWING_STATUSES = ['NEW', 'CONFIRMED'] as const;

function isBuildingCodeUniqueError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const dbError = error as { code?: unknown; meta?: { target?: unknown } };
  if (dbError.code !== 'P2002') return false;
  const target = dbError.meta?.target;
  return target === 'buildings_code_key' || target === 'code' ||
    (Array.isArray(target) && (target.includes('buildings_code_key') || target.includes('code')));
}

function throwBuildingCodeConflict(error: unknown): never {
  if (isBuildingCodeUniqueError(error)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      // [ASSUMPTION] Vietnamese wording; the contract fixes the code and field.
      fields: { code: 'Mã tòa đã được sử dụng' },
    });
  }
  throw error;
}

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: BuildingsQueryDto) {
    const { page, limit, skip, take } = pageParams(query);
    const buildingScope = this.listScope(user, query);
    const activeFilter = user.role === 'BOSS' && query.includeInactive === true ? {} : { isActive: true };
    const where: Prisma.BuildingWhereInput = { ...buildingScope, ...activeFilter };
    const orderBy = this.orderBy(query.sort);

    const [rows, total] = await Promise.all([
      this.prisma.building.findMany({
        where,
        include: BUILDING_INCLUDE,
        orderBy,
        skip,
        take,
      }),
      this.prisma.building.count({ where }),
    ]);
    const pendingCounts = await this.pendingViewingCounts(rows.map((row) => row.id));
    return paginated(
      rows.map((row) => this.toView(row, pendingCounts.get(row.id) ?? 0)),
      page,
      limit,
      total,
    );
  }

  async create(user: AuthUser, dto: CreateBuildingDto, ip?: string): Promise<BuildingView> {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const managerId = dto.managerId ?? null;

    let row: BuildingRecord;
    try {
      row = await this.prisma.$transaction(async (tx) => {
      if (managerId !== null) await assertAssignableManager(tx, managerId);
      const building = await tx.building.create({
        data: {
          code: dto.code.toUpperCase(),
          name: dto.name,
          address: dto.address,
          district: dto.district,
          ward: dto.ward,
          waterMode: dto.waterMode,
          dueDays: dto.dueDays ?? 5,
          managerId,
          amenities: (dto.amenities ?? []) as Prisma.InputJsonValue,
          description: dto.description ?? null,
        },
        include: BUILDING_INCLUDE,
      });
      if (managerId !== null) {
        await this.audit.log(
          user.id,
          'building.manager_change',
          'building',
          building.id,
          { managerId: null },
          { managerId },
          ip,
          tx,
        );
      }
        return building;
      });
    } catch (error) {
      throwBuildingCodeConflict(error);
    }

    const count = await this.pendingViewingCounts([row.id]);
    return this.toView(row, count.get(row.id) ?? 0);
  }

  async update(
    user: AuthUser,
    id: number,
    dto: UpdateBuildingDto,
    ip?: string,
  ): Promise<BuildingView> {
    if (user.role === 'MANAGER') assertBuildingPatchFields(user, dto);
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    let row: BuildingRecord;
    try {
      row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM buildings WHERE id = ${id} FOR UPDATE`;
      const current = await tx.building.findUnique({
        where: { id },
        include: BUILDING_INCLUDE,
      });
      if (!current) {
        if (user.role === 'MANAGER') throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      this.assertBuildingScope(user, current);
      const previousManagerId = current.managerId;

      const finalIsActive = dto.isActive ?? current.isActive;
      if (!finalIsActive && dto.managerId !== undefined && dto.managerId !== null) {
        throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }

      if (dto.managerId !== undefined && dto.managerId !== null && dto.managerId !== current.managerId) {
        await assertAssignableManager(tx, dto.managerId, id);
      }

      const statusChanged = finalIsActive !== current.isActive;
      if (statusChanged) {
        const openContractCount = await tx.contract.count({
          where: { buildingId: id, status: { in: ['HOLD', 'ACTIVE'] } },
        });
        if (openContractCount > 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }

      const data: Prisma.BuildingUncheckedUpdateInput = {};
      if (dto.code !== undefined) data.code = dto.code.toUpperCase();
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.address !== undefined) data.address = dto.address;
      if (dto.district !== undefined) data.district = dto.district;
      if (dto.ward !== undefined) data.ward = dto.ward;
      if (dto.waterMode !== undefined) data.waterMode = dto.waterMode;
      if (dto.dueDays !== undefined) data.dueDays = dto.dueDays;
      if (dto.managerId !== undefined) data.managerId = dto.managerId;
      if (dto.amenities !== undefined) data.amenities = dto.amenities as Prisma.InputJsonValue;
      if (dto.description !== undefined) data.description = dto.description;
      if (statusChanged) data.isActive = finalIsActive;
      if (!finalIsActive) data.managerId = null;

      if (Object.keys(data).length === 0) return current;

      let updated: BuildingRecord;
      if (statusChanged) {
        const result = await tx.building.updateMany({
          where: { id, isActive: current.isActive },
          data,
        });
        if (result.count === 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);
        updated = (await tx.building.findUnique({
          where: { id },
          include: BUILDING_INCLUDE,
        }))!;
      } else {
        updated = await tx.building.update({
          where: { id },
          data,
          include: BUILDING_INCLUDE,
        });
      }
      if (updated.managerId !== previousManagerId) {
        await this.audit.log(
          user.id,
          'building.manager_change',
          'building',
          id,
          { managerId: previousManagerId },
          { managerId: updated.managerId },
          ip,
          tx,
        );
      }
        return updated;
      });
    } catch (error) {
      throwBuildingCodeConflict(error);
    }

    const count = await this.pendingViewingCounts([row.id]);
    return this.toView(row, count.get(row.id) ?? 0);
  }

  private listScope(user: AuthUser, query: BuildingsQueryDto): Prisma.BuildingWhereInput {
    if (user.role === 'BOSS') {
      return query.buildingId !== undefined ? { id: query.buildingId } : {};
    }
    if (query.includeInactive === true) throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const allowed = user.buildingIds ?? [];
    if (query.buildingId !== undefined) {
      if (!allowed.includes(query.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      return { id: query.buildingId, managerId: user.id, isActive: true };
    }
    return { id: { in: allowed }, managerId: user.id, isActive: true };
  }

  private assertBuildingScope(user: AuthUser, building: Building): void {
    if (user.role === 'MANAGER' && (building.managerId !== user.id || !building.isActive)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
  }

  private orderBy(sort: BuildingsQueryDto['sort']): Prisma.BuildingOrderByWithRelationInput {
    switch (sort) {
      case '-createdAt':
        return { createdAt: 'desc' };
      case 'createdAt':
        return { createdAt: 'asc' };
      case '-code':
        return { code: 'desc' };
      case 'name':
        return { name: 'asc' };
      case '-name':
        return { name: 'desc' };
      case 'code':
      default:
        return { code: 'asc' };
    }
  }

  private async pendingViewingCounts(buildingIds: number[]): Promise<Map<number, number>> {
    if (buildingIds.length === 0) return new Map();
    const rows = await this.prisma.viewing.findMany({
      where: {
        status: { in: [...PENDING_VIEWING_STATUSES] },
        room: { buildingId: { in: buildingIds } },
      },
      select: { room: { select: { buildingId: true } } },
    });
    const counts = new Map<number, number>();
    for (const row of rows) {
      const buildingId = row.room.buildingId;
      counts.set(buildingId, (counts.get(buildingId) ?? 0) + 1);
    }
    return counts;
  }

  private toView(building: BuildingRecord, pendingViewingCount: number): BuildingView {
    const amenities = Array.isArray(building.amenities)
      ? building.amenities.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      id: building.id,
      code: building.code,
      name: building.name,
      address: building.address,
      district: building.district,
      ward: building.ward,
      waterMode: building.waterMode,
      dueDays: building.dueDays,
      managerId: building.managerId,
      manager: building.manager,
      amenities,
      description: building.description,
      isActive: building.isActive,
      pendingViewingCount,
      createdAt: building.createdAt.toISOString(),
      updatedAt: building.updatedAt.toISOString(),
    };
  }
}
