import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { DB_ERROR_MAP, isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import { normalizePlate, type CreateVehicleDto, type UpdateVehicleDto, type VehiclesQueryDto } from './dto/vehicles.dto.js';

const VEHICLE_SELECT = { id: true, plate: true, type: true, serviceId: true, isActive: true,
  registeredAt: true, removedAt: true } satisfies Prisma.VehicleSelect;
const CONTRACT_SELECT = { id: true, buildingId: true, status: true,
  building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
} satisfies Prisma.ContractSelect;
const LOOKUP_SELECT = { ...VEHICLE_SELECT, contract: { select: {
  id: true, code: true, status: true, room: { select: { id: true, code: true } },
  building: { select: { id: true, code: true, name: true } },
  tenant: { select: { id: true, fullName: true, phone: true } },
} } } satisfies Prisma.VehicleSelect;

function staff(actor: AuthUser) {
  if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
}
const fieldError = (field: string, message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });
function view<T extends { registeredAt: Date; removedAt: Date | null }>(row: T) {
  return { ...row, registeredAt: formatDateOnly(row.registeredAt), removedAt: row.removedAt ? formatDateOnly(row.removedAt) : null };
}

// A-27: actual dates default to today; the monthly charge is not day-prorated here.
function actualDate(value: string | undefined, field: string, today: Date) {
  const date = value === undefined ? today : parseDateOnly(value);
  if (!date || date > today) throw fieldError(field, 'Ngày phải hợp lệ và không được sau hôm nay');
  return date;
}

@Injectable()
export class ContractVehiclesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async contract(tx: Prisma.TransactionClient, actor: AuthUser, id: number) {
    const row = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: CONTRACT_SELECT });
    if (!row) {
      if (await tx.contract.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    assertViewingScope(actor, row);
    return row;
  }

  async list(actor: AuthUser, id: number) {
    staff(actor);
    return this.transaction(async tx => {
      await this.contract(tx, actor, id);
      const rows = await tx.vehicle.findMany({ where: { contractId: id }, select: VEHICLE_SELECT,
        orderBy: [{ isActive: 'desc' }, { id: 'asc' }] });
      return rows.map(row => view(row));
    });
  }

  async lookup(actor: AuthUser, query: VehiclesQueryDto) {
    staff(actor);
    const { page, limit, skip, take } = pageParams(query);
    const plate = query.plate === undefined ? undefined : normalizePlate(query.plate).replace(/[\\%_]/g, '\\$&');
    return this.transaction(async tx => {
      const where: Prisma.VehicleWhereInput = { ...scopeWhere(actor), isActive: query.isActive ?? true,
        ...(plate ? { plate: { contains: plate } } : {}),
        ...(actor.role === 'MANAGER' ? { contract: { building: {
          managerId: actor.id, isActive: true, manager: { isActive: true },
        } } } : {}),
      };
      const total = await tx.vehicle.count({ where });
      const rows = skip >= total ? [] : await tx.vehicle.findMany({ where, select: LOOKUP_SELECT,
        orderBy: { id: 'asc' }, skip, take });
      return paginated(rows.map(row => view(row)), page, limit, total);
    });
  }

  async create(actor: AuthUser, id: number, dto: CreateVehicleDto, ip?: string) {
    staff(actor);
    return this.mutate(actor, id, async (tx, contract) => {
      const registeredAt = actualDate(dto.registeredAt, 'registeredAt', todayHanoi());
      await this.service(tx, contract.buildingId, dto.serviceId);
      const row = await tx.vehicle.create({ data: { contractId: id, buildingId: contract.buildingId,
        plate: normalizePlate(dto.plate), type: dto.type, serviceId: dto.serviceId, registeredAt,
        isActive: true, removedAt: null }, select: VEHICLE_SELECT });
      const response = view(row);
      await this.audit.log(actor.id, 'vehicle.create', 'vehicle', row.id, undefined, { contractId: id, ...response }, ip, tx);
      return response;
    });
  }

  async update(actor: AuthUser, id: number, vid: number, dto: UpdateVehicleDto, ip?: string) {
    staff(actor);
    return this.mutate(actor, id, async (tx, contract) => {
      const current = await tx.vehicle.findFirst({ where: { id: vid, contractId: id }, select: VEHICLE_SELECT });
      if (!current) throw new NotFoundException(ErrorCode.NOT_FOUND);
      if (!current.isActive) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      if (dto.removedAt !== undefined && dto.isActive !== false) {
        throw fieldError('removedAt', 'Chỉ nhập ngày ngừng gửi khi ngừng đăng ký xe');
      }
      const today = todayHanoi();
      const data: Prisma.VehicleUpdateInput = {};
      if (dto.plate !== undefined) data.plate = normalizePlate(dto.plate);
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.registeredAt !== undefined) data.registeredAt = actualDate(dto.registeredAt, 'registeredAt', today);
      if (dto.serviceId !== undefined) {
        await this.service(tx, contract.buildingId, dto.serviceId);
        data.service = { connect: { id: dto.serviceId } };
      }
      if (dto.isActive === false) {
        data.isActive = false;
        data.removedAt = actualDate(dto.removedAt, 'removedAt', today);
      }
      const registeredAt = data.registeredAt instanceof Date ? data.registeredAt : current.registeredAt;
      const removedAt = data.removedAt instanceof Date ? data.removedAt : current.removedAt;
      if (removedAt && removedAt < registeredAt) throw fieldError('removedAt', 'Ngày ngừng gửi không được trước ngày đăng ký');
      if (!Object.keys(data).length) return view(current);
      const row = await tx.vehicle.update({ where: { id: vid, contractId: id }, data, select: VEHICLE_SELECT });
      const response = view(row);
      await this.audit.log(actor.id, dto.isActive === false ? 'vehicle.remove' : 'vehicle.update', 'vehicle', vid,
        view(current), { contractId: id, ...response }, ip, tx);
      return response;
    });
  }

  private async service(tx: Prisma.TransactionClient, buildingId: number, id: number) {
    await tx.$queryRaw`SELECT id FROM services WHERE id = ${id} FOR SHARE`;
    if (!await tx.service.findFirst({ where: { id, buildingId, unit: 'VEHICLE', isActive: true }, select: { id: true } })) {
      throw fieldError('serviceId', 'Chọn dịch vụ gửi xe đang hoạt động của tòa');
    }
  }

  private async mutate<T>(actor: AuthUser, id: number,
    action: (tx: Prisma.TransactionClient, contract: Prisma.ContractGetPayload<{ select: typeof CONTRACT_SELECT }>) => Promise<T>) {
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      const contract = await this.contract(tx, actor, id);
      if (contract.status !== 'HOLD' && contract.status !== 'ACTIVE') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      return action(tx, contract);
    });
  }

  private async transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => { await lockViewingMapping(tx); return action(tx); });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueOn(error, 'vehicles_plate_active', 'plate')) throw new BadRequestException(DB_ERROR_MAP.vehicles_plate_active);
      throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
    }
  }
}
