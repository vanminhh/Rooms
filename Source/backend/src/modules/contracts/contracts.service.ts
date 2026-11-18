import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { encryptCccd, last4 } from '../../common/crypto/cccd.js';
import { contractEndDate } from '../../common/date/period.js';
import { formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import { resolveContractTenant } from './contract-tenant.js';
import type { ContractsQueryDto } from './dto/contracts-query.dto.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';

const CONTRACT_SUMMARY = {
  id: true, code: true, status: true, startDate: true, endDate: true, termMonths: true, rent: true, deposit: true,
  createdAt: true, room: { select: { id: true, code: true } }, building: { select: { id: true, code: true, name: true } },
  tenant: { select: { id: true, fullName: true, phone: true, email: true } },
} satisfies Prisma.ContractSelect;

// CON-16: read only the fields that can be returned by the staff detail endpoint.
const CONTRACT_DETAIL = {
  ...CONTRACT_SUMMARY,
  terms: true, signedAt: true, movedInAt: true,
  occupants: {
    orderBy: [{ isSigner: 'desc' }, { id: 'asc' }],
    select: {
      id: true, fullName: true, phone: true, dateOfBirth: true,
      isSigner: true, idNumberLast4: true, moveInDate: true, moveOutDate: true,
    },
  },
  vehicles: {
    orderBy: { id: 'asc' },
    select: { id: true, plate: true, type: true, serviceId: true, isActive: true, registeredAt: true, removedAt: true },
  },
  services: {
    orderBy: { serviceId: 'asc' },
    select: { service: { select: { id: true, name: true, unit: true } } },
  },
  invoices: {
    where: { type: 'DEPOSIT' }, orderBy: { id: 'desc' }, take: 1,
    select: { id: true, status: true, total: true, issueDate: true, dueDate: true },
  },
} satisfies Prisma.ContractSelect;

function toContractSummary(contract: Prisma.ContractGetPayload<{ select: typeof CONTRACT_SUMMARY }>) {
  return {
    ...contract,
    startDate: formatDateOnly(contract.startDate),
    endDate: formatDateOnly(contract.endDate),
    createdAt: contract.createdAt.toISOString(),
  };
}

const dateOnlyOrNull = (date: Date | null) => date === null ? null : formatDateOnly(date);

const fieldError = (field: string, message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });

function assertStaff(actor: AuthUser): void {
  if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(actor: AuthUser, query: ContractsQueryDto) {
    assertStaff(actor);
    const { buildingId, status } = query;
    if (buildingId !== undefined && actor.buildingIds !== null && !actor.buildingIds.includes(buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    // Prisma uses LIKE for contains. Search for the user's literal text.
    const keyword = query.q?.trim().replace(/[\\%_]/g, '\\$&');
    const where: Prisma.ContractWhereInput = {
      ...scopeWhere(actor),
      ...(buildingId === undefined ? {} : { buildingId }),
      ...(status === undefined ? {} : { status }),
      ...(keyword ? { OR: [
        { tenant: { fullName: { contains: keyword, mode: 'insensitive' } } },
        { tenant: { phone: { contains: keyword } } },
        { room: { code: { contains: keyword, mode: 'insensitive' } } },
      ] } : {}),
    };
    const { page, limit, skip, take } = pageParams(query);
    const direction = query.sort === 'createdAt' ? 'asc' : 'desc';
    const total = await this.prisma.contract.count({ where });
    const rows = skip >= total ? [] : await this.prisma.contract.findMany({
      where, select: CONTRACT_SUMMARY, skip, take, orderBy: [{ createdAt: direction }, { id: direction }],
    });
    return paginated(rows.map(toContractSummary), page, limit, total);
  }

  async get(actor: AuthUser, id: number) {
    assertStaff(actor);
    const contract = await this.prisma.contract.findUnique({
      where: { id, ...scopeWhere(actor) },
      select: CONTRACT_DETAIL,
    });
    if (!contract) {
      const exists = actor.buildingIds !== null &&
        await this.prisma.contract.findUnique({ where: { id }, select: { id: true } });
      if (exists) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    const { terms, signedAt, movedInAt, occupants, vehicles, services, invoices: [depositInvoice], ...summary } = contract;
    return {
      ...toContractSummary(summary),
      terms, signedAt: signedAt?.toISOString() ?? null, movedInAt: movedInAt?.toISOString() ?? null,
      occupants: occupants.map(occupant => ({
        ...occupant, dateOfBirth: dateOnlyOrNull(occupant.dateOfBirth),
        moveInDate: formatDateOnly(occupant.moveInDate), moveOutDate: dateOnlyOrNull(occupant.moveOutDate),
      })),
      vehicles: vehicles.map(vehicle => ({
        ...vehicle, registeredAt: formatDateOnly(vehicle.registeredAt), removedAt: dateOnlyOrNull(vehicle.removedAt),
      })),
      services: services.map(({ service }) => service),
      depositInvoice: depositInvoice ? {
        ...depositInvoice, issueDate: dateOnlyOrNull(depositInvoice.issueDate), dueDate: dateOnlyOrNull(depositInvoice.dueDate),
      } : null,
    };
  }

  async create(actor: AuthUser, dto: CreateContractDto, ip?: string) {
    assertStaff(actor);
    const today = todayHanoi();
    const startDate = parseDateOnly(dto.startDate);
    if (!startDate || startDate < today) throw fieldError('startDate', 'Ngày vào ở phải từ hôm nay trở đi');
    if (dto.termMonths < 3) throw new BadRequestException(ErrorCode.CONTRACT_TERM_TOO_SHORT);
    const endDate = contractEndDate(startDate, dto.termMonths);
    if (!Number.isFinite(endDate.getTime()) || endDate.getUTCFullYear() > 9999) {
      throw fieldError('termMonths', 'Ngày kết thúc hợp đồng vượt giới hạn');
    }
    const dateOfBirth = dto.signer.dateOfBirth ? parseDateOnly(dto.signer.dateOfBirth) : null;
    if (dto.signer.dateOfBirth && (!dateOfBirth || dateOfBirth > today)) {
      throw fieldError('signer.dateOfBirth', 'Ngày sinh không hợp lệ');
    }

    return this.prisma.$transaction(async tx => {
      // VIEW-16 writers take the shared mapping lock before any room or viewing locks.
      await lockViewingMapping(tx, true);
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${dto.roomId} FOR UPDATE`;
      const room = await tx.room.findUnique({
        where: { id: dto.roomId, ...scopeWhere(actor) },
        select: { id: true, buildingId: true, price: true, building: {
          select: { isActive: true, managerId: true, manager: { select: { isActive: true } } },
        } },
      });
      if (!room) {
        const exists = await tx.room.findUnique({ where: { id: dto.roomId }, select: { id: true } });
        if (exists) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      assertViewingScope(actor, room);
      const rent = room.price;
      if (rent === null) throw new ConflictException(ErrorCode.PRICE_NOT_APPROVED);

      // CON-02: the DB's partial unique index enforces the excluded open-contract rule.
      const { contracts: _openContracts, ...publicEligibility } = publicRoomWhere(today);
      const eligible = await tx.room.findFirst({ where: { id: room.id, ...publicEligibility }, select: { id: true } });
      if (!eligible) throw new ConflictException(ErrorCode.ROOM_NOT_AVAILABLE);
      if (dto.serviceIds.length) {
        const services = await tx.service.findMany({
          where: {
            id: { in: dto.serviceIds }, buildingId: room.buildingId, unit: { in: ['ROOM', 'PERSON'] }, isActive: true,
            ratePlans: { some: { kind: 'SERVICE', status: 'APPROVED', effectiveFrom: { lte: startDate } } },
          },
          select: { id: true },
        });
        if (services.length !== dto.serviceIds.length) {
          throw fieldError('serviceIds', 'Dịch vụ phải đang hoạt động, cùng tòa và có giá tại ngày vào ở');
        }
      }

      const source = await this.sourceViewing(tx, dto);
      const tenantId = await resolveContractTenant(tx, dto, this.audit, actor.id, ip);
      const { fullName, phone, idNumber } = dto.signer;
      const { id } = await tx.contract.create({
        data: {
          code: `tmp-${randomBytes(12).toString('base64url')}`,
          buildingId: room.buildingId, roomId: room.id, tenantId, startDate, endDate, termMonths: dto.termMonths,
          rent, deposit: dto.deposit ?? rent, status: 'HOLD', terms: dto.terms, createdById: actor.id,
          services: { create: dto.serviceIds.map(serviceId => ({ serviceId })) },
          occupants: { create: {
            fullName, phone, dateOfBirth, isSigner: true, moveInDate: startDate,
            idNumberEnc: idNumber ? encryptCccd(idNumber) : null, idNumberLast4: idNumber ? last4(idNumber) : null,
          } },
        },
        select: { id: true },
      }).catch((error: unknown) => {
        if (isUniqueOn(error, 'contracts_one_open_per_room', 'room_id', 'roomId')) {
          throw new ConflictException(ErrorCode.ROOM_NOT_AVAILABLE);
        }
        throw error;
      });
      const code = `HD${String(id).padStart(6, '0')}`;
      const contract = await tx.contract.update({ where: { id }, data: { code }, select: CONTRACT_SUMMARY });

      if (source) {
        const { count } = await tx.viewing.updateMany({
          where: { id: source.id, roomId: room.id, status: source.status },
          data: { status: 'WON', contractId: id, handledById: actor.id },
        });
        if (count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      const cancelled = await tx.viewing.updateManyAndReturn({
        where: { roomId: room.id, status: { in: ['NEW', 'CONFIRMED'] } },
        data: {
          status: 'CANCELLED', note: 'Phòng đã có người đặt cọc', handledById: actor.id,
          depositCancelledByContractId: id,
        },
        select: { id: true },
      });
      await this.audit.log(actor.id, 'contract.create', 'contract', id, undefined, {
        code, roomId: room.id, buildingId: room.buildingId, tenantId, viewingId: source?.id ?? null,
        cancelledViewingIds: cancelled.map(viewing => viewing.id),
      }, ip, tx);

      return toContractSummary(contract);
    });
  }

  private async sourceViewing(tx: Prisma.TransactionClient, dto: CreateContractDto) {
    if (dto.viewingId === undefined) return null;
    const viewing = await tx.viewing.findFirst({
      where: { id: dto.viewingId, roomId: dto.roomId },
      select: { id: true, status: true, source: true, user: { select: { phone: true } } },
    });
    if (!viewing || (viewing.status !== 'CONFIRMED' && viewing.status !== 'DONE')) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT_STATE, fields: { viewingId: 'Lịch xem phải cùng phòng và đã xác nhận hoặc đã xem' },
      });
    }
    if (viewing.source === 'WEB' && viewing.user && viewing.user.phone !== dto.signer.phone &&
        dto.confirmDifferentViewingOwner !== true) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT_STATE,
        fields: { confirmDifferentViewingOwner: 'Vui lòng xác nhận người ký khác chủ tài khoản đặt lịch xem' },
      });
    }
    return viewing;
  }
}
