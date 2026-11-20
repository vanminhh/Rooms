import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MeterKind, Prisma } from '@prisma/client';
import { formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { assertOccupantCapacity } from '../../common/rooms/occupant-capacity.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { MoveInContractDto } from './dto/move-in-contract.dto.js';

const METER_SELECT = {
  id: true, contractId: true, value: true, readOn: true, isOpening: true, isMeterReplaced: true, oldMeterFinal: true,
} satisfies Prisma.MeterReadingSelect;
type MeterRow = Prisma.MeterReadingGetPayload<{ select: typeof METER_SELECT }>;

const fieldError = (field: string, message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });

@Injectable()
export class ContractMoveInService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async moveIn(actor: AuthUser, id: number, dto: MoveInContractDto, ip?: string) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const readOn = parseDateOnly(dto.readOn);
    if (!readOn) throw fieldError('readOn', 'Ngày đọc chỉ số không hợp lệ');
    const note = dto.note?.trim();

    return this.prisma.$transaction(async tx => {
      // Coordinate with contract and assignment writers. Lock the room before its contract.
      await lockViewingMapping(tx);
      const pointer = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: { roomId: true } });
      if (!pointer) {
        if (await tx.contract.findUnique({ where: { id }, select: { id: true } })) {
          throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        }
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${pointer.roomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      const contract = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: {
        id: true, code: true, roomId: true, status: true, signedAt: true, movedInAt: true,
        startDate: true, deposit: true, previousContractId: true,
        room: { select: { maxOccupants: true } },
        building: { select: { isActive: true, managerId: true, manager: { select: { isActive: true } } } },
      } });
      if (!contract) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      assertViewingScope(actor, contract);
      if (contract.status !== 'HOLD' || contract.signedAt === null || contract.movedInAt !== null || contract.previousContractId !== null) {
        throw new ConflictException(ErrorCode.CONFLICT_STATE);
      }
      if (Math.abs(readOn.getTime() - contract.startDate.getTime()) > 3 * 86400_000 && !note) {
        throw fieldError('note', 'Cần ghi chú khi ngày đọc chỉ số lệch ngày vào ở quá 3 ngày');
      }
      if (contract.deposit > 0) {
        // Payments lock this invoice too. Read its state after the lock, within this transaction.
        await tx.$queryRaw`SELECT id FROM invoices WHERE contract_id = ${id} AND type = 'DEPOSIT' FOR SHARE`;
        const invoice = await tx.invoice.findFirst({
          where: { contractId: id, type: 'DEPOSIT', status: { not: 'CANCELLED' } },
          orderBy: { id: 'desc' }, select: { id: true, status: true, total: true },
        });
        if (!invoice || invoice.status !== 'PAID' || invoice.total !== contract.deposit) {
          throw new ConflictException(ErrorCode.DEPOSIT_NOT_PAID);
        }
      }

      // The same room lock serializes occupant writes and room-limit changes.
      await assertOccupantCapacity(tx, contract.roomId, contract.room.maxOccupants, todayHanoi());
      const electric = await this.opening(tx, actor.id, id, contract.roomId, 'ELECTRIC', dto.electric, readOn, note, dto.electricReplacement?.oldMeterFinal);
      const water = await this.opening(tx, actor.id, id, contract.roomId, 'WATER', dto.water, readOn, note, dto.waterReplacement?.oldMeterFinal);
      const movedInAt = new Date();
      const saved = await tx.contract.updateMany({
        where: { id, status: 'HOLD', signedAt: { not: null }, movedInAt: null, previousContractId: null },
        data: { status: 'ACTIVE', movedInAt },
      });
      if (saved.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      await this.audit.log(actor.id, 'contract.move_in', 'contract', id, { status: 'HOLD' }, {
        status: 'ACTIVE', movedInAt: movedInAt.toISOString(), readOn: dto.readOn,
        electricReadingId: electric.id, waterReadingId: water.id,
      }, ip, tx);
      return { id, code: contract.code, status: 'ACTIVE', movedInAt: movedInAt.toISOString(), readings: { electric, water } };
    });
  }

  private async opening(
    tx: Prisma.TransactionClient, actorId: number, contractId: number, roomId: number, kind: MeterKind,
    value: number, readOn: Date, note: string | undefined, oldMeterFinal: number | undefined,
  ) {
    if (await tx.meterReading.findFirst({ where: { contractId, kind, isOpening: true }, select: { id: true } })) {
      throw new ConflictException(ErrorCode.CONFLICT_STATE);
    }
    const field = kind === 'ELECTRIC' ? 'electric' : 'water';
    // At handover, old contracts' same-day readings precede the new opening. A regular
    // reading on this contract's opening day follows it (e.g. a month-end move-in).
    const beforeWhere: Prisma.MeterReadingWhereInput = { roomId, kind, OR: [
      { readOn: { lt: readOn } },
      { readOn, OR: [{ contractId: null }, { contractId: { not: contractId } }] },
    ] };
    const afterWhere: Prisma.MeterReadingWhereInput = { roomId, kind, OR: [
      { readOn: { gt: readOn } }, { readOn, contractId, isOpening: false },
    ] };
    const previous = await this.boundary(tx, beforeWhere, 'desc');
    const next = await this.boundary(tx, afterWhere, 'asc');
    const previousValue = previous.length ? Math.max(...previous.map(row => row.value)) : null;
    if (previousValue !== null && (oldMeterFinal ?? value) < previousValue) {
      throw new BadRequestException({ code: ErrorCode.METER_VALUE_DECREASED, fields: {
        [oldMeterFinal === undefined ? field : `${field}Replacement.oldMeterFinal`]: 'Chỉ số nhỏ hơn mốc đã ghi trước đó',
      } });
    }
    if (next.some(row => value > (row.isMeterReplaced ? row.oldMeterFinal! : row.value))) {
      throw new BadRequestException({ code: ErrorCode.METER_VALUE_DECREASED, fields: {
        [field]: 'Chỉ số vượt mốc đã ghi sau thời điểm vào ở',
      } });
    }
    const saved = await tx.meterReading.create({ data: {
      roomId, contractId, kind, value, readOn, isOpening: true, readById: actorId,
      isMeterReplaced: oldMeterFinal !== undefined, oldMeterFinal: oldMeterFinal ?? null, note: note || null,
    }, select: { id: true, value: true, readOn: true } });
    return { ...saved, readOn: formatDateOnly(saved.readOn) };
  }

  private async boundary(tx: Prisma.TransactionClient, where: Prisma.MeterReadingWhereInput, direction: 'asc' | 'desc'): Promise<MeterRow[]> {
    const edge = await tx.meterReading.findFirst({ where, orderBy: { readOn: direction }, select: { readOn: true } });
    if (!edge) return [];
    const rows = await tx.meterReading.findMany({ where: { AND: [where, { readOn: edge.readOn }] }, select: METER_SELECT });
    // Dates alone cannot order multiple readings across a meter reset. Never guess from
    // insertion ID/time and silently charge across different physical meters.
    if (rows.some(row => row.isMeterReplaced) && new Set(rows.map(row => row.value)).size > 1) {
      throw new ConflictException({ code: ErrorCode.CONFLICT_STATE, fields: {
        readOn: 'Cần kiểm tra lịch sử thay đồng hồ có nhiều mốc trong cùng ngày',
      } });
    }
    return rows;
  }
}
