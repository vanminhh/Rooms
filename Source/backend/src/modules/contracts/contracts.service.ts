import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { encryptCccd, last4 } from '../../common/crypto/cccd.js';
import { hashPassword, PENDING_TENANT_PASSWORD_HASH } from '../../common/crypto/password.js';
import { contractEndDate, contractPeriods, contractTermProgress, nextBillingDate } from '../../common/date/period.js';
import { addDays, formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated, type PaginationQuery } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { lockOtpKey } from '../auth/otp.service.js';
import { verifyContractAsset } from '../files/files.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import { resolveContractTenant } from './contract-tenant.js';
import type { ContractsQueryDto } from './dto/contracts-query.dto.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';
import type { SignContractDto } from './dto/sign-contract.dto.js';
import type { RenewContractDto } from './dto/renew-contract.dto.js';
import { DEPOSIT_INVOICE_SELECT, depositInvoiceView } from './deposit-invoice.js';

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
    select: DEPOSIT_INVOICE_SELECT,
  },
  // Q-P4-54: the contract page keeps "Đã trả lại tiền" after a reload (BIL-13..19, CON-12, Q-P3-3).
  settlement: {
    select: { id: true, moveOutDate: true, deposit: true, lastPeriodAmount: true, remainingRent: true, previousDebt: true,
      damages: true, depositForfeit: true, net: true, finalInvoiceId: true, refundPaidAt: true, note: true },
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

  // The form preview and create use the same D-41 calculation and validation.
  private dates(value: string, termMonths: number, today = todayHanoi()) {
    const startDate = parseDateOnly(value);
    if (!startDate || startDate < today) throw fieldError('startDate', 'Ngày vào ở phải từ hôm nay trở đi');
    return this.termDates(startDate, termMonths);
  }

  private termDates(startDate: Date, termMonths: number) {
    if (termMonths < 3) throw new BadRequestException(ErrorCode.CONTRACT_TERM_TOO_SHORT);
    const endDate = contractEndDate(startDate, termMonths);
    if (!Number.isFinite(endDate.getTime()) || endDate.getUTCFullYear() > 9999) {
      throw fieldError('termMonths', 'Ngày kết thúc hợp đồng vượt giới hạn');
    }
    return { startDate, endDate };
  }

  previewDates(actor: AuthUser, dto: { startDate: string; termMonths: number }) {
    assertStaff(actor);
    const { startDate, endDate } = this.dates(dto.startDate, dto.termMonths);
    return { startDate: formatDateOnly(startDate), endDate: formatDateOnly(endDate), termMonths: dto.termMonths };
  }

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
    const direction = query.sort === 'createdAt' ? 'asc' : 'desc';
    return this.listContracts(where, query, direction);
  }

  async listMine(actor: AuthUser, query: PaginationQuery) {
    if (actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    return this.listContracts({ tenantId: actor.id }, query, 'desc');
  }

  private async listContracts(where: Prisma.ContractWhereInput, query: PaginationQuery, direction: 'asc' | 'desc') {
    const { page, limit, skip, take } = pageParams(query);
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
    return this.contractDetail(contract);
  }

  async getMine(actor: AuthUser, id: number) {
    if (actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const contract = await this.prisma.contract.findFirst({ where: { id, tenantId: actor.id }, select: CONTRACT_DETAIL });
    if (!contract) throw new NotFoundException(ErrorCode.NOT_FOUND);
    const detail = await this.contractDetail(contract);
    return { ...detail, occupants: detail.occupants.map(occupant => ({
      ...occupant, idNumberLast4: occupant.isSigner ? occupant.idNumberLast4 : null,
    })) };
  }

  private async contractDetail(contract: Prisma.ContractGetPayload<{ select: typeof CONTRACT_DETAIL }>) {
    const { terms, signedAt, movedInAt, occupants, vehicles, services, invoices: [depositInvoice], settlement, ...summary } = contract;
    const bank = depositInvoice?.status === 'UNPAID'
      ? await this.prisma.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } }) : null;
    return {
      ...toContractSummary(summary),
      progress: contractTermProgress(summary.startDate, summary.endDate, todayHanoi()),
      // Shown on /thue for a contract in force; computed here so the FE never does date math (UI-06).
      nextBillingDate: summary.status === 'ACTIVE' ? dateOnlyOrNull(nextBillingDate(contractPeriods(summary.startDate, summary.termMonths), todayHanoi())) : null,
      terms, signedAt: signedAt?.toISOString() ?? null, movedInAt: movedInAt?.toISOString() ?? null,
      occupants: occupants.map(occupant => ({
        ...occupant, dateOfBirth: dateOnlyOrNull(occupant.dateOfBirth),
        moveInDate: formatDateOnly(occupant.moveInDate), moveOutDate: dateOnlyOrNull(occupant.moveOutDate),
      })),
      vehicles: vehicles.map(vehicle => ({
        ...vehicle, registeredAt: formatDateOnly(vehicle.registeredAt), removedAt: dateOnlyOrNull(vehicle.removedAt),
      })),
      services: services.map(({ service }) => service),
      depositInvoice: depositInvoice ? depositInvoiceView(depositInvoice, bank?.value) : null,
      settlement: settlement && { ...settlement, moveOutDate: formatDateOnly(settlement.moveOutDate), refundPaidAt: settlement.refundPaidAt?.toISOString() ?? null },
    };
  }

  async create(actor: AuthUser, dto: CreateContractDto, ip?: string) {
    assertStaff(actor);
    const today = todayHanoi();
    const { startDate, endDate } = this.dates(dto.startDate, dto.termMonths, today);
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

      // D-45: a waiting renewal reserves the room even after the source contract ends.
      const eligible = await tx.room.findFirst({ where: { id: room.id, ...publicRoomWhere(today) }, select: { id: true } });
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

  async renew(actor: AuthUser, id: number, dto: RenewContractDto, ip?: string) {
    assertStaff(actor);
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx, true);
      const target = await tx.contract.findUnique({ where: { id }, select: { roomId: true, buildingId: true } });
      if (!target) throw new NotFoundException(ErrorCode.NOT_FOUND);
      if (actor.buildingIds && !actor.buildingIds.includes(target.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      let approvedRequest: { id: number; payload: Prisma.JsonValue } | null = null;
      if (dto.requestId != null) {
        await tx.$queryRaw`SELECT id FROM requests WHERE id = ${dto.requestId} FOR UPDATE`;
        approvedRequest = await tx.request.findFirst({ where: { id: dto.requestId, contractId: id, type: 'RENEW', status: 'APPROVED' },
          select: { id: true, payload: true } });
        if (!approvedRequest || (approvedRequest.payload as Prisma.JsonObject)?.contractId) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${target.roomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      const source = await tx.contract.findUniqueOrThrow({
        where: { id },
        select: {
          roomId: true, buildingId: true, tenantId: true, rent: true, deposit: true, terms: true, endDate: true, status: true,
          building: { select: { isActive: true, managerId: true, manager: { select: { isActive: true } } } },
          services: { select: { serviceId: true } }, nextContract: { select: { id: true } },
        },
      });
      assertViewingScope(actor, source);
      if (source.status !== 'ACTIVE' || source.nextContract) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const dates = this.termDates(addDays(source.endDate, 1), dto.termMonths);
      const created = await tx.contract.create({
        data: {
          code: `tmp-${randomBytes(12).toString('base64url')}`, previousContractId: id, status: 'HOLD', ...dates,
          termMonths: dto.termMonths, roomId: source.roomId, buildingId: source.buildingId, tenantId: source.tenantId,
          deposit: source.deposit, rent: source.rent, terms: dto.terms === undefined ? source.terms : dto.terms,
          createdById: actor.id, services: { create: source.services },
        }, select: { id: true },
      });
      const code = `HD${String(created.id).padStart(6, '0')}`;
      const saved = await tx.contract.update({ where: created, data: { code }, select: CONTRACT_SUMMARY });
      if (approvedRequest) await tx.request.update({ where: { id: approvedRequest.id },
        data: { payload: { ...approvedRequest.payload as Prisma.JsonObject, contractId: created.id } } });
      await this.audit.log(actor.id, 'contract.create', 'contract', created.id, undefined, {
        code, previousContractId: id, roomId: source.roomId, buildingId: source.buildingId, tenantId: source.tenantId,
      }, ip, tx);
      return { ...toContractSummary(saved), previousContractId: id };
    });
  }

  async sign(actor: AuthUser, id: number, dto: SignContractDto, ip?: string) {
    assertStaff(actor);
    const existing = await this.prisma.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: { id: true, status: true, signedAt: true, previousContractId: true, roomId: true } });
    if (!existing) {
      if (await this.prisma.contract.findUnique({ where: { id }, select: { id: true } })) {
        throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      }
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    if (existing.status !== 'HOLD' || existing.signedAt !== null) throw new ConflictException(ErrorCode.CONFLICT_STATE);

    // Provider IO precedes the transaction. State and current assignment are rechecked under locks.
    const assetId = await verifyContractAsset(this.prisma, id, 'CONTRACT_SCAN', dto);
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      if (existing.previousContractId !== null) {
        await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${existing.roomId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM contracts WHERE id IN (${id}, ${existing.previousContractId}) ORDER BY id FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      }
      const contract = await tx.contract.findUnique({
        where: { id, ...scopeWhere(actor) }, select: {
          id: true, status: true, signedAt: true, startDate: true, deposit: true, previousContractId: true,
          previousContract: { select: { status: true } }, tenantId: true, tenant: { select: { phone: true } },
          building: { select: { isActive: true, managerId: true, manager: { select: { isActive: true } } } },
        },
      });
      if (!contract) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      assertViewingScope(actor, contract);
      if (contract.status !== 'HOLD' || contract.signedAt !== null) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      if (contract.previousContractId !== null && contract.previousContract?.status !== 'ACTIVE') throw new ConflictException(ErrorCode.CONFLICT_STATE);

      await lockOtpKey(tx, `phone:${contract.tenant.phone}`);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${contract.tenantId} FOR UPDATE`;
      const tenant = await tx.user.findUniqueOrThrow({ where: { id: contract.tenantId } });
      const pending = tenant.passwordHash === PENDING_TENANT_PASSWORD_HASH;
      if (pending && contract.previousContractId !== null) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      if (!tenant.isActive && !pending) throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
      if (tenant.role !== 'TENANT') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      let temporaryPassword: string | undefined;
      if (pending) {
        // A-22: the first signed HOLD activates a pending account, including multiple unsigned HOLDs.
        temporaryPassword = randomBytes(8).toString('base64url').slice(0, 10);
        const passwordHash = await hashPassword(temporaryPassword);
        await tx.user.update({ where: { id: tenant.id }, data: { passwordHash, mustChangePassword: true, isActive: true } });
      }
      const signedAt = new Date();
      const saved = await tx.contract.update({ where: { id }, data: { signedAt, signedScanAssetId: assetId }, select: CONTRACT_SUMMARY });
      let depositInvoice = null;
      if (contract.deposit > 0 && contract.previousContractId === null) {
        const today = todayHanoi();
        const invoice = await tx.invoice.create({ data: {
          contractId: id, type: 'DEPOSIT', periodNo: 0, total: contract.deposit, status: 'UNPAID',
          issueDate: today, dueDate: contract.startDate > today ? contract.startDate : today, createdById: actor.id,
          lines: { create: { kind: 'DEPOSIT', label: 'Tiền cọc', quantity: 1, unitPrice: contract.deposit, amount: contract.deposit } },
        }, select: DEPOSIT_INVOICE_SELECT });
        const bank = await tx.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } });
        depositInvoice = depositInvoiceView(invoice, bank?.value);
      }
      await this.audit.log(actor.id, 'contract.sign', 'contract', id, undefined, {
        signedAt: signedAt.toISOString(), depositInvoiceId: depositInvoice?.id ?? null,
      }, ip, tx);
      return { ...toContractSummary(saved), signedAt: signedAt.toISOString(), depositInvoice,
        ...(temporaryPassword === undefined ? {} : { temporaryPassword }) };
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
