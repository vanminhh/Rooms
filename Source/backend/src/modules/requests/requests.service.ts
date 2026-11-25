import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, type Request, type RequestStatus } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import { DB_ERROR_MAP, isUniqueOn } from '../../common/errors/db-errors.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated, type PaginationQuery } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { BankTransactionsService } from '../bank/bank-transactions.service.js';
import { BillingService } from '../billing/billing.service.js';
import type { Mail } from '../mailer/mailer.service.js';
import { addDays, formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { contractPeriods, proratedAmount } from '../../common/date/period.js';
import { ContractOccupantsService } from '../contracts/contract-occupants.service.js';
import { ContractVehiclesService } from '../contracts/contract-vehicles.service.js';
import type { CreateVehicleDto } from '../contracts/dto/vehicles.dto.js';
import type { CreateOccupantDto } from '../contracts/dto/occupants.dto.js';
import { requestPhotoFolder, verifyImageInFolder } from '../files/files.service.js';
import { notifyBuildingStaff } from '../notifications/notify.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import { type CreateRequestDto, invalid, requestPayload } from './request.dto.js';

const missing = () => new NotFoundException(ErrorCode.NOT_FOUND);
const conflict = () => new ConflictException(ErrorCode.CONFLICT_STATE);
const building = { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } } as const;

const rentFields = { startDate: true, endDate: true, rent: true, termMonths: true } as const;
function moveOutWarning(contract: Prisma.ContractGetPayload<{ select: typeof rentFields }>, date: Date) {
  if (date >= contract.endDate) return {};
  const remainingRent = contractPeriods(contract.startDate, contract.termMonths).filter(p => p.periodStart > date)
    .reduce((sum, p) => sum + (p.isPartial ? proratedAmount(contract.rent, p.periodStart, p.periodEnd) : contract.rent), 0);
  return { endDate: formatDateOnly(contract.endDate), remainingRent };
}

function plannedMoveOut(payload: Prisma.JsonObject) {
  const date = typeof payload.plannedMoveOutDate === 'string' && parseDateOnly(payload.plannedMoveOutDate);
  if (!date) throw invalid('plannedMoveOutDate');
  return date;
}

function view(row: Request, tenantView = false) {
  const { reviewHiddenReason, reviewHiddenById, ...visible } = row;
  const result = {
    ...visible, reviewComment: row.reviewHiddenAt ? null : row.reviewComment,
    ...(tenantView ? {} : { reviewHiddenReason, reviewHiddenById }),
  };
  const payload = row.payload;
  if (row.type !== 'OCCUPANT_CHANGE' || !payload || Array.isArray(payload) || typeof payload !== 'object') return result;
  const add = Array.isArray(payload.add) ? payload.add.map(person => {
    if (!person || typeof person !== 'object' || Array.isArray(person)) return {};
    const { fullName, phone, dateOfBirth, moveInDate, idNumberLast4 } = person;
    return { fullName, phone, dateOfBirth, moveInDate, ...(tenantView ? {} : { idNumberLast4 }) };
  }) : [];
  return { ...result, payload: { add, remove: payload.remove } };
}

const statusText: Record<RequestStatus, [string, string]> = {
  PENDING: ['Chờ xử lý', 'Pending'], IN_PROGRESS: ['Đang xử lý', 'In progress'], RESOLVED: ['Hoàn thành', 'Resolved'],
  CLOSED: ['Đã đóng', 'Closed'], APPROVED: ['Đã duyệt', 'Approved'], REJECTED: ['Từ chối', 'Rejected'],
  CANCELLED: ['Đã rút', 'Cancelled'], ESCALATED: ['Đã chuyển Boss', 'Escalated'],
};

export async function notifyRequestChange(tx: Prisma.TransactionClient, row: Pick<Request, 'id' | 'createdById' | 'title' | 'status'>) {
  const tenant = await tx.user.findUniqueOrThrow({ where: { id: row.createdById }, select: { locale: true } });
  const en = tenant.locale === 'en';
  const prefix = en ? 'Request "' : 'Yêu cầu "';
  const suffix = `": ${statusText[row.status][en ? 1 : 0]}`;
  const title = Array.from(row.title).slice(0, 150 - Array.from(prefix + suffix).length).join('');
  await tx.notification.create({ data: { kind: 'REQUEST_UPDATED', userId: row.createdById,
    title: prefix + title + suffix, body: row.title, link: `/thue/yeu-cau/${row.id}` } });
}

@Injectable()
export class RequestsService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService,
    private readonly bank: BankTransactionsService, private readonly billing: BillingService,
    private readonly occupants: ContractOccupantsService, private readonly vehicles: ContractVehiclesService) {}

  private async staffRequest(tx: Prisma.TransactionClient, actor: AuthUser, id: number) {
    await lockViewingMapping(tx);
    await tx.$queryRaw`SELECT id FROM requests WHERE id = ${id} FOR UPDATE`;
    const row = await tx.request.findFirst({ where: { id, contract: scopeWhere(actor) }, include: { contract: { select: {
      building, roomId: true, startDate: true, endDate: true, termMonths: true, rent: true, status: true,
    } } } });
    if (!row) {
      if (await tx.request.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw missing();
    }
    assertViewingScope(actor, row.contract);
    return row;
  }

  async decide(actor: AuthUser, id: number, action: 'approve' | 'reject' | 'escalate' | 'resolve',
    dto: { decisionNote?: string; bankTransactionId?: number }, ip?: string) {
    let mail: Mail | null = null;
    let invoiceId = 0;
    const result = await this.db.$transaction(async tx => {
      const row = await this.staffRequest(tx, actor, id);
      const payload = row.payload as Prisma.JsonObject;
      if (row.status === 'ESCALATED' && actor.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
      if (row.status !== 'PENDING' && !(action === 'resolve' && row.status === 'ESCALATED')) throw conflict();
      const data: Prisma.RequestUpdateInput = { handledBy: { connect: { id: actor.id } } };
      if (action === 'reject') {
        if (row.type === 'INCIDENT') throw conflict();
        if (!dto.decisionNote?.trim()) throw invalid('decisionNote');
        data.status = 'REJECTED'; data.decisionNote = dto.decisionNote.trim();
      } else if (action === 'escalate') {
        if (row.type !== 'PAYMENT_ISSUE') throw conflict();
        data.status = 'ESCALATED'; data.escalatedAt = new Date();
      } else if (action === 'resolve') {
        if (row.type !== 'PAYMENT_ISSUE') throw conflict();
        invoiceId = Number(payload.invoiceId);
        // BANK-05 and the webhook acquire the bank transaction before its invoice.
        if (row.status === 'ESCALATED' && dto.bankTransactionId) {
          await tx.$queryRaw`SELECT id FROM bank_transactions WHERE id = ${dto.bankTransactionId} FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, contractId: row.contractId },
          select: { status: true, total: true, payment: { select: { id: true, amount: true } } } });
        if (!invoice) throw missing();
        let paymentId: number;
        if (invoice.status === 'PAID' && invoice.payment?.amount === invoice.total) {
          paymentId = invoice.payment.id;
        } else if (row.status === 'ESCALATED') {
          if (!dto.bankTransactionId) throw invalid('bankTransactionId');
          const assigned = await this.bank.assignInTransaction(tx, actor, dto.bankTransactionId, invoiceId, ip);
          paymentId = assigned.result.paymentId; mail = assigned.mail;
        } else {
          if (invoice.status !== 'UNPAID') throw conflict();
          if (payload.amount !== invoice.total) throw new ConflictException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
          const paidAt = typeof payload.transferredAt === 'string' ? new Date(payload.transferredAt) : null;
          if (!paidAt || !Number.isFinite(paidAt.getTime())) throw invalid('transferredAt');
          const written = await this.billing.writePayment(tx, actor, invoiceId, { method: 'BANK_TRANSFER' }, paidAt, ip);
          paymentId = written.result.id; mail = written.mail;
        }
        data.status = 'RESOLVED'; data.resolvedAt = new Date(); data.payload = { ...payload, paymentId };
      } else {
        await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${row.contract.roomId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${row.contractId} FOR UPDATE`;
        const active = await tx.contract.findFirst({ where: { id: row.contractId, status: 'ACTIVE' }, select: { id: true } });
        if (!active) throw conflict();
        if (row.type === 'MOVE_OUT') {
          const date = plannedMoveOut(payload);
          if (date < row.contract.startDate) throw invalid('plannedMoveOutDate');
          const updated = await tx.contract.updateMany({ where: { id: row.contractId, status: 'ACTIVE' },
            data: { moveOutNoticeDate: todayHanoi(row.createdAt), plannedMoveOutDate: date } });
          if (!updated.count) throw conflict();
          data.payload = { ...payload, ...moveOutWarning(row.contract, date) };
        } else if (row.type === 'OCCUPANT_CHANGE') {
          const changes = payload as unknown as { add?: (CreateOccupantDto & { idNumberEnc?: string; idNumberLast4?: string })[];
            remove?: { occupantId: number; moveOutDate: string }[] };
          for (const r of changes.remove ?? []) await this.occupants.update(actor, row.contractId, r.occupantId, { moveOutDate: r.moveOutDate }, ip, tx);
          for (const a of changes.add ?? []) {
            const identity = a.idNumberEnc && a.idNumberLast4 ? { idNumberEnc: a.idNumberEnc, idNumberLast4: a.idNumberLast4 } : undefined;
            await this.occupants.create(actor, row.contractId, a, ip, tx, identity);
          }
        } else if (row.type === 'VEHICLE_CHANGE') {
          const changes = payload as unknown as { add?: CreateVehicleDto[]; remove?: { vehicleId: number; removedAt: string }[] };
          for (const r of changes.remove ?? []) await this.vehicles.update(actor, row.contractId, r.vehicleId, { isActive: false, removedAt: r.removedAt }, ip, tx);
          const plates = (changes.add ?? []).map(v => v.plate);
          if (plates.length && await tx.vehicle.findFirst({ where: { isActive: true, plate: { in: plates } }, select: { id: true } })) {
            throw new BadRequestException(DB_ERROR_MAP.vehicles_plate_active);
          }
          for (const a of changes.add ?? []) await this.vehicles.create(actor, row.contractId, a, ip, tx);
        } else if (row.type !== 'RENEW') throw conflict();
        data.status = 'APPROVED';
      }
      const updated = await tx.request.update({ where: { id }, data });
      await this.audit.log(actor.id, 'request.' + action, 'request', id, { status: row.status }, { status: updated.status }, ip, tx);
      await notifyRequestChange(tx, updated);
      return view(updated);
    });
    if (mail) await this.billing.deliver(mail, `payment-received-${invoiceId}`);
    return result;
  }

  async create(actor: AuthUser, dto: CreateRequestDto) {
    const payload = requestPayload(dto.type, dto.payload);
    const owned = await this.db.contract.findFirst({ where: { id: dto.contractId, tenantId: actor.id }, select: { id: true } });
    if (!owned) throw missing();
    if (dto.type === 'PAYMENT_ISSUE' && !dto.photos?.length) throw invalid('photos');
    const photos = await Promise.all((dto.photos ?? []).map(p => verifyImageInFolder(requestPhotoFolder(actor.id, dto.contractId), p)));
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${dto.contractId} FOR UPDATE`;
      const c = await tx.contract.findFirst({ where: { id: dto.contractId, tenantId: actor.id }, select: { status: true, buildingId: true } });
      if (!c) throw missing();
      const payment = dto.type === 'PAYMENT_ISSUE';
      if (c.status !== 'ACTIVE' && !(payment && c.status === 'HOLD')) throw conflict();
      if ((dto.type === 'RENEW' || dto.type === 'MOVE_OUT') && await tx.request.findFirst({ where: {
        contractId: dto.contractId, status: 'PENDING', type: { in: ['MOVE_OUT', 'RENEW'] },
      }, select: { id: true } })) throw new ConflictException(ErrorCode.PENDING_REQUEST_EXISTS);
      if (payment) {
        const invoice = await tx.invoice.findFirst({ where: { id: payload.invoiceId as number, contractId: dto.contractId }, select: { type: true, status: true } });
        if (!invoice) throw missing();
        if (invoice.status !== 'UNPAID' || c.status === 'HOLD' && invoice.type !== 'DEPOSIT') throw conflict();
      }
      const row = await tx.request.create({ data: { contractId: dto.contractId, type: dto.type, title: dto.title.trim(),
        description: dto.description, createdById: actor.id, payload, photos } }).catch((e: unknown) => {
        if (isUniqueOn(e, 'requests_one_pending_moveout_renew', 'contractId', 'contract_id')) throw new ConflictException(ErrorCode.PENDING_REQUEST_EXISTS);
        throw e;
      });
      await notifyBuildingStaff(tx, c.buildingId, { kind: 'REQUEST_UPDATED', title: 'Yêu cầu mới', body: row.title, link: '/ql/yeu-cau' });
      return view(row, true);
    });
  }

  async list(where: Prisma.RequestWhereInput, query: PaginationQuery, tenantView = false) {
    const { page, limit, skip, take } = pageParams(query);
    const total = await this.db.request.count({ where });
    const rows = skip >= total ? [] : await this.db.request.findMany({ where, include: { contract: { select: rentFields } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take });
    return paginated(rows.map(({ contract, ...row }) => {
      if (row.type === 'MOVE_OUT' && row.status === 'PENDING') {
        const payload = row.payload as Prisma.JsonObject;
        return { ...view(row, tenantView), payload: { ...payload, ...moveOutWarning(contract, plannedMoveOut(payload)) } };
      }
      return view(row, tenantView);
    }), page, limit, total);
  }

  async review(actor: AuthUser, id: number, dto: { rating: number; comment?: string }, version?: string) {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM requests WHERE id = ${id} AND created_by_id = ${actor.id} FOR UPDATE`;
      const row = await tx.request.findFirst({ where: { id, createdById: actor.id, contract: { tenantId: actor.id } } });
      if (!row) throw missing();
      if (row.type !== 'INCIDENT' || row.status !== 'CLOSED') throw conflict();
      const now = new Date();
      const previous = row.reviewUpdatedAt ?? row.reviewAt;
      if (row.reviewAt && todayHanoi(now) >= addDays(todayHanoi(row.reviewAt), 7)) throw conflict();
      if (version !== (previous ? '"' + previous.toISOString() + '"' : undefined)) throw conflict();
      const updated = await tx.request.update({ where: { id }, data: {
        reviewRating: dto.rating, ...(row.reviewHiddenAt ? {} : { reviewComment: dto.comment?.trim() || null }),
        ...(previous ? { reviewUpdatedAt: new Date(Math.max(now.getTime(), previous.getTime() + 1)) } : { reviewAt: now }),
      } });
      return view(updated, true);
    });
  }

  async hideReview(actor: AuthUser, id: number, reason: string, ip?: string) {
    return this.db.$transaction(async tx => {
      const row = await this.staffRequest(tx, actor, id);
      if (row.type !== 'INCIDENT' || row.status !== 'CLOSED' || !row.reviewComment || row.reviewHiddenAt) throw conflict();
      const now = new Date();
      const updated = await tx.request.update({ where: { id }, data: {
        reviewHiddenReason: reason, reviewHiddenAt: now, reviewHiddenById: actor.id,
      } });
      await this.audit.log(actor.id, 'request.review_hide', 'request', id,
        { hidden: false, rating: row.reviewRating, comment: row.reviewComment },
        { hidden: true, reason, hiddenAt: now.toISOString() }, ip, tx);
      return view(updated);
    });
  }

  async tenantChange(actor: AuthUser, id: number, action: 'cancel' | 'confirm' | 'reopen') {
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM requests WHERE id = ${id} AND created_by_id = ${actor.id} FOR UPDATE`;
      const row = await tx.request.findFirst({ where: { id, createdById: actor.id, contract: { tenantId: actor.id } } });
      if (!row) throw missing();
      if (action === 'cancel' ? row.status !== 'PENDING' : row.type !== 'INCIDENT' || row.status !== 'RESOLVED') throw conflict();
      const status = { cancel: 'CANCELLED', reopen: 'IN_PROGRESS', confirm: 'CLOSED' } as const;
      const updated = await tx.request.update({ where: { id }, data: { status: status[action],
        ...(action === 'confirm' ? { closedAt: new Date() } : {}), ...(action === 'reopen' ? { resolvedAt: null } : {}) } });
      await notifyRequestChange(tx, updated);
      return view(updated, true);
    });
  }

  async incident(actor: AuthUser, id: number, status: RequestStatus, cost?: number, ip?: string) {
    return this.db.$transaction(async tx => {
      const row = await this.staffRequest(tx, actor, id);
      if (cost !== undefined && (row.type !== 'INCIDENT' || status !== 'RESOLVED')) throw invalid('cost');
      if (row.type !== 'INCIDENT' || !(status === 'IN_PROGRESS' && row.status === 'PENDING' || status === 'RESOLVED' && row.status === 'IN_PROGRESS')) throw conflict();
      if (status === 'RESOLVED' && cost === undefined) throw invalid('cost');
      const updated = await tx.request.update({ where: { id }, data: { status, handledById: actor.id,
        ...(status === 'RESOLVED' ? { resolvedAt: new Date(), cost } : {}) } });
      await this.audit.log(actor.id, 'request.update', 'request', id, { status: row.status, cost: row.cost }, { status, cost: updated.cost }, ip, tx);
      await notifyRequestChange(tx, updated);
      return view(updated);
    });
  }
}
