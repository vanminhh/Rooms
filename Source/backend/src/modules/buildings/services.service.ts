import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Service } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import { pageParams, paginated } from '../../common/pagination.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { todayHanoi } from '../../common/date/today.js';
import { ratesAt } from '../../common/rates/rates-at.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ServiceView } from './buildings.types.js';
import type { CreateServiceDto, ServicesQueryDto, UpdateServiceDto } from './dto/services.dto.js';

function isServiceNameUniqueError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const dbError = error as { code?: unknown; meta?: { target?: unknown } };
  if (dbError.code !== 'P2002') return false;
  const target = dbError.meta?.target;
  return target === 'services_building_id_name_key' ||
    (Array.isArray(target) &&
      (target.includes('services_building_id_name_key') ||
        (target.length === 2 && target.includes('buildingId') && target.includes('name'))));
}

function throwServiceNameConflict(error: unknown): never {
  if (isServiceNameUniqueError(error)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      // [ASSUMPTION] Vietnamese wording; the contract fixes the code and field.
      fields: { name: 'Tên dịch vụ đã được sử dụng trong tòa' },
    });
  }
  throw error;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: ServicesQueryDto) {
    const { page, limit, skip, take } = pageParams(query);
    const where = this.listWhere(user, query);
    const orderBy = this.orderBy(query.sort);
    const [services, total] = await Promise.all([
      this.prisma.service.findMany({ where, orderBy, skip, take }),
      this.prisma.service.count({ where }),
    ]);
    const serviceRates = await this.currentServiceRates(
      [...new Set(services.map((service) => service.buildingId))],
    );
    return paginated(
      services.map((service) =>
        this.toView(service, serviceRates.get(service.id) ?? false),
      ),
      page,
      limit,
      total,
    );
  }

  async create(user: AuthUser, dto: CreateServiceDto): Promise<ServiceView> {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const building = await this.prisma.building.findUnique({
      where: { id: dto.buildingId },
      select: { id: true },
    });
    if (!building) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        fields: { buildingId: 'Tòa không tồn tại' },
      });
    }

    try {
      const service = await this.prisma.service.create({
        data: { buildingId: dto.buildingId, name: dto.name, unit: dto.unit },
      });
      return this.toView(service, false);
    } catch (error) {
      throwServiceNameConflict(error);
    }
  }

  async update(user: AuthUser, id: number, dto: UpdateServiceDto): Promise<ServiceView> {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    if (Object.hasOwn(dto, 'unit') || Object.hasOwn(dto, 'buildingId')) {
      const fields: Record<string, string> = {};
      if (Object.hasOwn(dto, 'unit')) fields.unit = 'Đơn vị dịch vụ không được phép thay đổi';
      if (Object.hasOwn(dto, 'buildingId')) fields.buildingId = 'Tòa của dịch vụ không được phép thay đổi';
      throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields });
    }

    const current = await this.prisma.service.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(ErrorCode.NOT_FOUND);

    const data: Prisma.ServiceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (Object.keys(data).length === 0) return this.viewWithCurrentRate(current);

    try {
      const updated = await this.prisma.service.update({ where: { id }, data });
      return this.viewWithCurrentRate(updated);
    } catch (error) {
      throwServiceNameConflict(error);
    }
  }

  private listWhere(user: AuthUser, query: ServicesQueryDto): Prisma.ServiceWhereInput {
    if (user.role === 'BOSS') {
      return query.buildingId !== undefined ? { buildingId: query.buildingId } : {};
    }
    const allowed = user.buildingIds ?? [];
    if (query.buildingId !== undefined) {
      if (!allowed.includes(query.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      return { buildingId: query.buildingId };
    }
    return { buildingId: { in: allowed } };
  }

  private orderBy(sort: ServicesQueryDto['sort']): Prisma.ServiceOrderByWithRelationInput {
    switch (sort) {
      case '-id':
        return { id: 'desc' };
      case 'name':
        return { name: 'asc' };
      case '-name':
        return { name: 'desc' };
      case 'id':
      default:
        return { id: 'asc' };
    }
  }

  private async currentServiceRates(buildingIds: number[]): Promise<Map<number, boolean>> {
    const result = new Map<number, boolean>();
    if (buildingIds.length === 0) return result;
    const date = todayHanoi();
    const rates = await Promise.all(
      buildingIds.map(async (buildingId) => [buildingId, await ratesAt(this.prisma, buildingId, date)] as const),
    );
    for (const [, currentRates] of rates) {
      for (const serviceId of currentRates.services.keys()) {
        result.set(serviceId, true);
      }
    }
    return result;
  }

  private async viewWithCurrentRate(service: Service): Promise<ServiceView> {
    const rates = await ratesAt(this.prisma, service.buildingId, todayHanoi());
    return this.toView(service, rates.services.has(service.id));
  }

  private toView(service: Service, hasCurrentRate: boolean): ServiceView {
    return {
      id: service.id,
      buildingId: service.buildingId,
      name: service.name,
      unit: service.unit,
      isActive: service.isActive,
      hasCurrentRate,
    };
  }
}
