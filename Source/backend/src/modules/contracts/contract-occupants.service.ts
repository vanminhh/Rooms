import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { encryptCccd, last4 } from '../../common/crypto/cccd.js';
import { formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { assertOccupantCapacity } from '../../common/rooms/occupant-capacity.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { createContractUploadSignature, signedContractAssetUrl, verifyContractAsset } from '../files/files.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { CreateOccupantDto, UpdateOccupantDto } from './dto/occupants.dto.js';

const OCCUPANT_SELECT = {
  id: true, fullName: true, phone: true, dateOfBirth: true, idNumberLast4: true,
  isSigner: true, moveInDate: true, moveOutDate: true, idFrontAssetId: true, idBackAssetId: true,
} satisfies Prisma.OccupantSelect;
type OccupantRow = Prisma.OccupantGetPayload<{ select: typeof OCCUPANT_SELECT }>;
const CONTRACT_SELECT = {
  id: true, roomId: true, status: true, tenantId: true, room: { select: { maxOccupants: true } },
  building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
} satisfies Prisma.ContractSelect;

function staff(actor: AuthUser) {
  if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
}

const fieldError = (field: string, message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });

function writable(status: string) {
  // A-25: implementation choice presented at the BE-P3-23 checkpoint, Q-P3-16.
  if (status !== 'HOLD' && status !== 'ACTIVE') throw new ConflictException(ErrorCode.CONFLICT_STATE);
}

function view(row: OccupantRow, tenant = false) {
  const { idFrontAssetId, idBackAssetId, ...safe } = row;
  return { ...safe, idNumberLast4: tenant && !row.isSigner ? null : row.idNumberLast4,
    dateOfBirth: row.dateOfBirth ? formatDateOnly(row.dateOfBirth) : null,
    moveInDate: formatDateOnly(row.moveInDate), moveOutDate: row.moveOutDate ? formatDateOnly(row.moveOutDate) : null,
    hasIdFront: idFrontAssetId !== null, hasIdBack: idBackAssetId !== null };
}

function businessDates(dto: CreateOccupantDto | UpdateOccupantDto, current?: OccupantRow) {
  const moveInDate = dto.moveInDate === undefined ? current!.moveInDate : parseDateOnly(dto.moveInDate);
  const moveOutDate = dto.moveOutDate === undefined ? current?.moveOutDate ?? null
    : dto.moveOutDate === null ? null : parseDateOnly(dto.moveOutDate);
  if (!moveInDate) throw fieldError('moveInDate', 'Ngày vào ở không hợp lệ');
  if ((dto.moveOutDate !== undefined && dto.moveOutDate !== null && !moveOutDate) ||
    (moveOutDate && moveOutDate < moveInDate)) {
    throw fieldError('moveOutDate', 'Ngày ra không được trước ngày vào ở');
  }
  const dateOfBirth = dto.dateOfBirth ? parseDateOnly(dto.dateOfBirth) : null;
  if (dto.dateOfBirth !== undefined && dto.dateOfBirth !== null && (!dateOfBirth || dateOfBirth > todayHanoi())) {
    throw fieldError('dateOfBirth', 'Ngày sinh không hợp lệ');
  }
  return { moveInDate, moveOutDate, dateOfBirth };
}

@Injectable()
export class ContractOccupantsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async signMyIdPhoto(actor: AuthUser, id: number) {
    if (actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} AND tenant_id = ${actor.id} FOR SHARE`;
      const contract = await tx.contract.findFirst({ where: { id, tenantId: actor.id }, select: { id: true, buildingId: true, status: true } });
      if (!contract) throw new NotFoundException(ErrorCode.NOT_FOUND);
      writable(contract.status);
      return createContractUploadSignature(contract, 'ID_PHOTO');
    });
  }

  private async contract(db: Pick<Prisma.TransactionClient, 'contract'>, actor: AuthUser, id: number) {
    const tenant = actor.role === 'TENANT';
    if (!tenant) staff(actor);
    const row = await db.contract.findUnique({
      where: { id, ...(tenant ? { tenantId: actor.id } : scopeWhere(actor)) }, select: CONTRACT_SELECT,
    });
    if (!row) {
      if (!tenant && await db.contract.findUnique({ where: { id }, select: { id: true } })) {
        throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      }
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    if (!tenant) assertViewingScope(actor, row);
    return row;
  }

  async list(actor: AuthUser, id: number) {
    staff(actor);
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      await this.contract(tx, actor, id);
      const rows = await tx.occupant.findMany({ where: { contractId: id }, select: OCCUPANT_SELECT,
        orderBy: [{ isSigner: 'desc' }, { id: 'asc' }] });
      return rows.map(row => view(row));
    });
  }

  async idPhotos(actor: AuthUser, id: number, oid: number, ip?: string) {
    staff(actor);
    try {
      return await this.prisma.$transaction(async tx => {
        await lockViewingMapping(tx);
        // Coordinate with photo updates and contract transitions before reading assets.
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR SHARE`;
        await this.contract(tx, actor, id);
        const row = await tx.occupant.findFirst({ where: { id: oid, contractId: id },
          select: { idFrontAssetId: true, idBackAssetId: true } });
        if (!row || (!row.idFrontAssetId && !row.idBackAssetId)) throw new NotFoundException(ErrorCode.NOT_FOUND);
        const now = new Date();
        const photos = {
          front: row.idFrontAssetId ? signedContractAssetUrl(row.idFrontAssetId, process.env, now) : null,
          back: row.idBackAssetId ? signedContractAssetUrl(row.idBackAssetId, process.env, now) : null,
        };
        await this.audit.log(actor.id, 'occupant.view_id', 'occupant', oid, undefined, undefined, ip, tx);
        return photos;
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // A failed audit/read must not log private asset IDs or return unlogged links.
      throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
    }
  }

  async create(actor: AuthUser, id: number, dto: CreateOccupantDto, ip?: string) {
    const initial = await this.contract(this.prisma, actor, id);
    writable(initial.status);
    const dates = businessDates(dto);
    const assets = await this.assets(id, dto);
    return this.mutate(actor, id, async (tx, contract) => {
      const row = await tx.occupant.create({ data: {
        contractId: id, fullName: dto.fullName, phone: dto.phone ?? null,
        dateOfBirth: dates.dateOfBirth, moveInDate: dates.moveInDate, moveOutDate: dates.moveOutDate,
        isSigner: false, idNumberEnc: dto.idNumber ? encryptCccd(dto.idNumber) : null,
        idNumberLast4: dto.idNumber ? last4(dto.idNumber) : null,
        idFrontAssetId: assets.idFrontAssetId ?? null, idBackAssetId: assets.idBackAssetId ?? null,
      }, select: OCCUPANT_SELECT });
      await assertOccupantCapacity(tx, contract.roomId, contract.room.maxOccupants, row.moveInDate, row.moveOutDate);
      await this.audit.log(actor.id, 'occupant.create', 'occupant', row.id, undefined,
        { contractId: id, moveInDate: formatDateOnly(row.moveInDate), moveOutDate: row.moveOutDate ? formatDateOnly(row.moveOutDate) : null }, ip, tx);
      return view(row, actor.role === 'TENANT');
    });
  }

  async update(actor: AuthUser, id: number, oid: number, dto: UpdateOccupantDto, ip?: string) {
    staff(actor);
    const initial = await this.contract(this.prisma, actor, id);
    writable(initial.status);
    if (!await this.prisma.occupant.findFirst({ where: { id: oid, contractId: id }, select: { id: true } })) {
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    const assets = await this.assets(id, dto);
    return this.mutate(actor, id, async (tx, contract) => {
      const current = await tx.occupant.findFirst({ where: { id: oid, contractId: id }, select: OCCUPANT_SELECT });
      if (!current) throw new NotFoundException(ErrorCode.NOT_FOUND);
      const dates = businessDates(dto, current);
      const data: Prisma.OccupantUpdateInput = { ...assets };
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.phone !== undefined) data.phone = dto.phone;
      if (dto.dateOfBirth !== undefined) data.dateOfBirth = dates.dateOfBirth;
      if (dto.moveInDate !== undefined) data.moveInDate = dates.moveInDate;
      if (dto.moveOutDate !== undefined) data.moveOutDate = dates.moveOutDate;
      if (dto.idNumber !== undefined) {
        data.idNumberEnc = dto.idNumber === null ? null : encryptCccd(dto.idNumber);
        data.idNumberLast4 = dto.idNumber === null ? null : last4(dto.idNumber);
      }
      if (!Object.keys(data).length) return view(current);
      const row = await tx.occupant.update({ where: { id: oid, contractId: id }, data, select: OCCUPANT_SELECT });
      if (dto.moveInDate !== undefined || dto.moveOutDate !== undefined) {
        await assertOccupantCapacity(tx, contract.roomId, contract.room.maxOccupants, row.moveInDate, row.moveOutDate);
      }
      await this.audit.log(actor.id, dto.moveOutDate ? 'occupant.move_out' : 'occupant.update', 'occupant', row.id,
        { moveInDate: formatDateOnly(current.moveInDate), moveOutDate: current.moveOutDate ? formatDateOnly(current.moveOutDate) : null },
        { contractId: id, fields: Object.entries(dto).filter(([, value]) => value !== undefined).map(([key]) => key), moveInDate: formatDateOnly(row.moveInDate),
          moveOutDate: row.moveOutDate ? formatDateOnly(row.moveOutDate) : null }, ip, tx);
      return view(row);
    });
  }

  private async assets(id: number, dto: CreateOccupantDto | UpdateOccupantDto) {
    const data: { idFrontAssetId?: string | null; idBackAssetId?: string | null } = {};
    for (const [field, target] of [['idFront', 'idFrontAssetId'], ['idBack', 'idBackAssetId']] as const) {
      if (dto[field] !== undefined) data[target] = dto[field] === null ? null
        : await verifyContractAsset(this.prisma, id, 'ID_PHOTO', dto[field]);
    }
    return data;
  }

  private async mutate<T>(actor: AuthUser, id: number,
    action: (tx: Prisma.TransactionClient, contract: Prisma.ContractGetPayload<{ select: typeof CONTRACT_SELECT }>) => Promise<T>) {
    try {
      return await this.prisma.$transaction(async tx => {
        await lockViewingMapping(tx);
        const pointer = await this.contract(tx, actor, id);
        await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${pointer.roomId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
        const contract = await this.contract(tx, actor, id);
        writable(contract.status);
        if (await tx.occupant.count({ where: { contractId: id, isSigner: true } }) !== 1) {
          throw new ConflictException(ErrorCode.CONFLICT_STATE);
        }
        return action(tx, contract);
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (isUniqueOn(error, 'occupants_one_signer', 'contractId', 'contract_id')) {
        throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      // Prisma validation/driver/audit failures may include encrypted fields or provider
      // metadata. Keep raw arguments out of the global exception logger (CON-16).
      throw new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
    }
  }
}
