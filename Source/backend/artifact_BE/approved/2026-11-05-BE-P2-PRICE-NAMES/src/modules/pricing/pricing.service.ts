import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, RatePlan, RateTier, RoomPrice } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { compareDates, formatDateOnly, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { pageParams, paginated, type Paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import {
  type CreateRatePlanDto,
  type CreateRoomPriceDto,
  type RatePlanListQueryDto,
  type RejectPricingDto,
  type RoomPriceListQueryDto,
  ratePlanFieldErrors,
} from './dto/pricing.dto.js';
import { hashRequest, runIdempotent } from './pricing-idempotency.js';
import { priceChange, ratePlanComparison } from './price-comparison.js';
import type { RatePlanView, RateTierView, RoomPriceView } from './pricing.types.js';

const PROPOSE_ROUTE = 'POST /room-prices';
const PROPOSE_RATE_ROUTE = 'POST /rate-plans';
const APPROVE_ROUTE = 'POST /room-prices/:id/approve';
const REJECT_ROUTE = 'POST /room-prices/:id/reject';
const APPROVE_RATE_ROUTE = 'POST /rate-plans/:id/approve';
const REJECT_RATE_ROUTE = 'POST /rate-plans/:id/reject';
const HTTP_CREATED = 201;

// Shape read for review: the room (for scope, lock state and the view's names) comes with the price row.
const ROOM_PRICE_INCLUDE = {
  room: {
    select: {
      buildingId: true,
      code: true,
      isActive: true,
      building: { select: { isActive: true, name: true } },
    },
  },
} as const;
type LockedRoomPrice = RoomPrice & {
  room: { buildingId: number; code: string; isActive: boolean; building: { isActive: boolean; name: string } };
};

// Tiers and the building name come with the plan in the same query (Q-FE8B-2).
const RATE_PLAN_INCLUDE = {
  tiers: { orderBy: { tierNo: 'asc' } },
  building: { select: { name: true } },
} as const;
type RatePlanRow = RatePlan & { tiers: RateTier[]; building: { name: string } };

// PRC-07: a PENDING proposal whose effective_from is before today is expired (derived, not stored).
function isExpired(status: string, effectiveFrom: Date): boolean {
  return status === 'PENDING' && compareDates(effectiveFrom, todayHanoi()) < 0;
}

function dateError(message: string): BadRequestException {
  return new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { effectiveFrom: message } });
}

// PRC-01 / RATE: checked after scope and target (plan §2 error order): 400 only for a valid target.
function effectiveFromOrThrow(raw: string): Date {
  const effectiveFrom = parseDateOnly(raw);
  if (!effectiveFrom) throw dateError('Ngày hiệu lực không hợp lệ');
  if (compareDates(effectiveFrom, todayHanoi()) < 0) throw dateError('Ngày hiệu lực không được trước hôm nay');
  return effectiveFrom;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // PRC-01/02: the new proposal supersedes the room's PENDING one in the same transaction.
  // PRC-04: a Boss proposal is written PENDING and approved in the same transaction (audit propose + approve).
  async proposeRoomPrice(
    user: AuthUser,
    dto: CreateRoomPriceDto,
    ip?: string,
    idempotencyKey?: string,
  ): Promise<RoomPriceView> {
    this.assertStaff(user);
    const reason = dto.reason ?? null;
    const payload = { roomId: dto.roomId, price: dto.price, effectiveFrom: dto.effectiveFrom, reason };
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: PROPOSE_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest(payload),
        async () => {
          await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${dto.roomId} FOR UPDATE`;
          const room = await tx.room.findUnique({
            where: { id: dto.roomId },
            select: {
              id: true,
              buildingId: true,
              code: true,
              isActive: true,
              building: { select: { isActive: true, name: true } },
            },
          });
          if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
          this.assertRoomScope(user, room);
          const effectiveFrom = effectiveFromOrThrow(dto.effectiveFrom);

          await tx.roomPrice.updateMany({
            where: { roomId: room.id, status: 'PENDING' },
            data: { status: 'SUPERSEDED' },
          });
          const row = await tx.roomPrice.create({
            data: {
              roomId: room.id,
              price: dto.price,
              effectiveFrom,
              status: 'PENDING',
              reason,
              proposedById: user.id,
            },
          });
          await this.audit.log(
            user.id,
            'price.propose',
            'room_price',
            row.id,
            undefined,
            { roomId: room.id, price: row.price, effectiveFrom: dto.effectiveFrom, status: row.status, reason },
            ip ?? null,
            tx,
          );
          if (user.role === 'BOSS') return this.approveRoomPriceInTx(tx, user, row.id, ip);
          return this.toView(tx, row, room);
        },
      ),
    );
  }

  // RATE-01/PRC-02: the new plan supersedes the PENDING plan of the same (building, kind, service).
  // PRC-04: a Boss plan is written PENDING and approved in the same transaction.
  async proposeRatePlan(
    user: AuthUser,
    dto: CreateRatePlanDto,
    ip?: string,
    idempotencyKey?: string,
  ): Promise<RatePlanView> {
    this.assertStaff(user);
    // Form rules first (plan §2 error order): 400 before any 403/404.
    const fieldErrors = ratePlanFieldErrors(dto);
    if (fieldErrors) throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: fieldErrors });
    const serviceId = dto.serviceId ?? null;
    const reason = dto.reason ?? null;
    const tiers = dto.tiers.map((tier) => ({ tierNo: tier.tierNo, upTo: tier.upTo, unitPrice: tier.unitPrice }));
    const payload = { buildingId: dto.buildingId, kind: dto.kind, serviceId, effectiveFrom: dto.effectiveFrom, reason, tiers };
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: PROPOSE_RATE_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest(payload),
        async () => {
          await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM buildings WHERE id = ${dto.buildingId} FOR UPDATE`;
          const building = await tx.building.findUnique({
            where: { id: dto.buildingId },
            select: { id: true, isActive: true },
          });
          if (!building) throw new NotFoundException(ErrorCode.NOT_FOUND);
          this.assertBuildingScope(user, building);
          // SVC-04 / Q-P5-8 A: missing, other-building or locked service -> the same 400 (no 404/403 leak).
          if (serviceId !== null) {
            const service = await tx.service.findUnique({
              where: { id: serviceId },
              select: { buildingId: true, isActive: true },
            });
            if (!service || service.buildingId !== building.id || !service.isActive) {
              throw new BadRequestException({
                code: ErrorCode.VALIDATION_FAILED,
                fields: { serviceId: 'Dịch vụ không hợp lệ hoặc đang khóa' },
              });
            }
          }
          const effectiveFrom = effectiveFromOrThrow(dto.effectiveFrom);

          await tx.ratePlan.updateMany({
            where: { buildingId: building.id, kind: dto.kind, serviceId, status: 'PENDING' },
            data: { status: 'SUPERSEDED' },
          });
          const row = await tx.ratePlan.create({
            data: {
              buildingId: building.id,
              kind: dto.kind,
              serviceId,
              effectiveFrom,
              status: 'PENDING',
              reason,
              proposedById: user.id,
              tiers: { create: tiers },
            },
            include: RATE_PLAN_INCLUDE,
          });
          await this.audit.log(
            user.id,
            'price.propose',
            'rate_plan',
            row.id,
            undefined,
            { buildingId: building.id, kind: dto.kind, serviceId, effectiveFrom: dto.effectiveFrom, status: row.status, reason, tiers },
            ip ?? null,
            tx,
          );
          if (user.role === 'BOSS') return this.approveRatePlanInTx(tx, user, row.id, ip);
          return this.toRatePlanView(tx, row);
        },
      ),
    );
  }

  // PRC-03/07/09: Boss only (API-07). Approving a locked room or building is allowed (Q-P5-5 A), but
  // rooms.price moves only when the price is in effect and the room and building are active (G-06).
  async approveRoomPrice(user: AuthUser, id: number, ip?: string, idempotencyKey?: string): Promise<RoomPriceView> {
    this.assertBoss(user);
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: APPROVE_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest({ id }),
        () => this.approveRoomPriceInTx(tx, user, id, ip),
      ),
    );
  }

  // PRC-03/08 and Q-P5-1 A, inside the caller's transaction (also used by a Boss proposal, PRC-04).
  private async approveRoomPriceInTx(tx: Prisma.TransactionClient, user: AuthUser, id: number, ip?: string): Promise<RoomPriceView> {
    const row = await this.lockRoomPrice(tx, id);
    if (row.status !== 'PENDING') throw new ConflictException(ErrorCode.CONFLICT_STATE);
    if (compareDates(row.effectiveFrom, todayHanoi()) < 0) {
      throw new ConflictException(ErrorCode.PRICE_PROPOSAL_EXPIRED);
    }
    // PRC-08 + Q-P5-1 A: this price (>= today) supersedes every APPROVED price of the room from its date on.
    // The same-day price is included, so no separate same-day step is needed.
    await tx.roomPrice.updateMany({
      where: { roomId: row.roomId, status: 'APPROVED', effectiveFrom: { gte: row.effectiveFrom } },
      data: { status: 'SUPERSEDED' },
    });
    const reviewedAt = new Date();
    const { count } = await tx.roomPrice.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt },
    });
    if (count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    if (compareDates(row.effectiveFrom, todayHanoi()) <= 0 && row.room.isActive && row.room.building.isActive) {
      await tx.room.update({ where: { id: row.roomId }, data: { price: row.price } });
    }
    await this.audit.log(
      user.id,
      'price.approve',
      'room_price',
      id,
      { status: 'PENDING' },
      { status: 'APPROVED', roomId: row.roomId, price: row.price, effectiveFrom: formatDateOnly(row.effectiveFrom) },
      ip ?? null,
      tx,
    );
    return this.toView(tx, { ...row, status: 'APPROVED', reviewedById: user.id, reviewedAt }, row.room);
  }

  // PRC-07/09: an expired proposal can still be rejected; review_note is required (PRC-03).
  async rejectRoomPrice(
    user: AuthUser,
    id: number,
    dto: RejectPricingDto,
    ip?: string,
    idempotencyKey?: string,
  ): Promise<RoomPriceView> {
    this.assertBoss(user);
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: REJECT_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest({ id, reviewNote: dto.reviewNote }),
        async () => {
          const row = await this.lockRoomPrice(tx, id);
          if (row.status !== 'PENDING') throw new ConflictException(ErrorCode.CONFLICT_STATE);
          const reviewedAt = new Date();
          const { count } = await tx.roomPrice.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'REJECTED', reviewedById: user.id, reviewedAt, reviewNote: dto.reviewNote },
          });
          if (count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
          await this.audit.log(
            user.id,
            'price.reject',
            'room_price',
            id,
            { status: 'PENDING' },
            { status: 'REJECTED', reviewNote: dto.reviewNote },
            ip ?? null,
            tx,
          );
          return this.toView(
            tx,
            { ...row, status: 'REJECTED', reviewedById: user.id, reviewedAt, reviewNote: dto.reviewNote },
            row.room,
          );
        },
      ),
    );
  }

  // RATE-05/PRC-09: same rules as room prices, no rooms.price change.
  async approveRatePlan(user: AuthUser, id: number, ip?: string, idempotencyKey?: string): Promise<RatePlanView> {
    this.assertBoss(user);
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: APPROVE_RATE_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest({ id }),
        () => this.approveRatePlanInTx(tx, user, id, ip),
      ),
    );
  }

  // RATE-01 with PRC-08 and Q-P5-1 A, inside the caller's transaction (also used by a Boss proposal, PRC-04).
  private async approveRatePlanInTx(tx: Prisma.TransactionClient, user: AuthUser, id: number, ip?: string): Promise<RatePlanView> {
    const row = await this.lockRatePlan(tx, id);
    if (row.status !== 'PENDING') throw new ConflictException(ErrorCode.CONFLICT_STATE);
    if (compareDates(row.effectiveFrom, todayHanoi()) < 0) {
      throw new ConflictException(ErrorCode.PRICE_PROPOSAL_EXPIRED);
    }
    // PRC-08 + Q-P5-1 A: this plan (>= today) supersedes the APPROVED plans of the same (building, kind, service)
    // from its date on, including the same day, so rate_plans_one_per_day is not hit.
    await tx.ratePlan.updateMany({
      where: {
        buildingId: row.buildingId,
        kind: row.kind,
        serviceId: row.serviceId,
        status: 'APPROVED',
        effectiveFrom: { gte: row.effectiveFrom },
      },
      data: { status: 'SUPERSEDED' },
    });
    const reviewedAt = new Date();
    const { count } = await tx.ratePlan.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt },
    });
    if (count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    await this.audit.log(
      user.id,
      'price.approve',
      'rate_plan',
      id,
      { status: 'PENDING' },
      {
        status: 'APPROVED',
        buildingId: row.buildingId,
        kind: row.kind,
        serviceId: row.serviceId,
        effectiveFrom: formatDateOnly(row.effectiveFrom),
      },
      ip ?? null,
      tx,
    );
    return this.toRatePlanView(tx, { ...row, status: 'APPROVED', reviewedById: user.id, reviewedAt });
  }

  async rejectRatePlan(
    user: AuthUser,
    id: number,
    dto: RejectPricingDto,
    ip?: string,
    idempotencyKey?: string,
  ): Promise<RatePlanView> {
    this.assertBoss(user);
    return this.prisma.$transaction((tx) =>
      runIdempotent(
        tx,
        { actorId: user.id, route: REJECT_RATE_ROUTE, key: idempotencyKey, statusCode: HTTP_CREATED },
        hashRequest({ id, reviewNote: dto.reviewNote }),
        async () => {
          const row = await this.lockRatePlan(tx, id);
          if (row.status !== 'PENDING') throw new ConflictException(ErrorCode.CONFLICT_STATE);
          const reviewedAt = new Date();
          const { count } = await tx.ratePlan.updateMany({
            where: { id, status: 'PENDING' },
            data: { status: 'REJECTED', reviewedById: user.id, reviewedAt, reviewNote: dto.reviewNote },
          });
          if (count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
          await this.audit.log(
            user.id,
            'price.reject',
            'rate_plan',
            id,
            { status: 'PENDING' },
            { status: 'REJECTED', reviewNote: dto.reviewNote },
            ip ?? null,
            tx,
          );
          return this.toRatePlanView(tx, { ...row, status: 'REJECTED', reviewedById: user.id, reviewedAt, reviewNote: dto.reviewNote });
        },
      ),
    );
  }

  // PRC-10/12, API-02/08: the "Duyệt giá" list. Manager sees only buildings in scope; no lock rule for reads.
  async listRoomPrices(user: AuthUser, query: RoomPriceListQueryDto): Promise<Paginated<RoomPriceView>> {
    this.assertStaff(user);
    const { page, limit, skip, take } = pageParams(query);
    await this.assertListScope(user, query);
    const where: Prisma.RoomPriceWhereInput = {
      room: query.buildingId === undefined ? scopeWhere(user) : { buildingId: query.buildingId },
      ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.roomPrice.findMany({ where, include: ROOM_PRICE_INCLUDE, orderBy: listOrder(query.sort), skip, take }),
      this.prisma.roomPrice.count({ where }),
    ]);
    const data = await Promise.all(rows.map((row) => this.toView(this.prisma, row, row.room)));
    return paginated(data, page, limit, total);
  }

  async listRatePlans(user: AuthUser, query: RatePlanListQueryDto): Promise<Paginated<RatePlanView>> {
    this.assertStaff(user);
    const { page, limit, skip, take } = pageParams(query);
    await this.assertListScope(user, query);
    const where: Prisma.RatePlanWhereInput = {
      ...(query.buildingId === undefined ? scopeWhere(user) : { buildingId: query.buildingId }),
      ...(query.kind === undefined ? {} : { kind: query.kind }),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.ratePlan.findMany({
        where,
        include: RATE_PLAN_INCLUDE,
        orderBy: listOrder(query.sort),
        skip,
        take,
      }),
      this.prisma.ratePlan.count({ where }),
    ]);
    const data = await Promise.all(rows.map((row) => this.toRatePlanView(this.prisma, row)));
    return paginated(data, page, limit, total);
  }

  // Filter targets follow the proposal rule: unknown room 404; a building or room the manager does not manage 403.
  private async assertListScope(user: AuthUser, query: { buildingId?: number; roomId?: number }): Promise<void> {
    const inScope = user.buildingIds ?? [];
    if (user.role === 'MANAGER' && query.buildingId !== undefined && !inScope.includes(query.buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    if (query.roomId === undefined) return;
    const room = await this.prisma.room.findUnique({ where: { id: query.roomId }, select: { buildingId: true } });
    if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
    if (user.role === 'MANAGER' && !inScope.includes(room.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }

  // SCOPE-02 first; then Q-P5-7: a manager cannot propose for a locked room or building (Boss can).
  private assertRoomScope(
    user: AuthUser,
    room: { buildingId: number; isActive: boolean; building: { isActive: boolean } },
  ): void {
    if (user.role !== 'MANAGER') return;
    if (!(user.buildingIds ?? []).includes(room.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    if (!room.isActive || !room.building.isActive) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }

  // SCOPE-02 first; then Q-P5-7: a manager cannot propose a rate plan for a locked building (Boss can).
  private assertBuildingScope(user: AuthUser, building: { id: number; isActive: boolean }): void {
    if (user.role !== 'MANAGER') return;
    if (!(user.buildingIds ?? []).includes(building.id)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    if (!building.isActive) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }

  private assertStaff(user: AuthUser): void {
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
  }

  private assertBoss(user: AuthUser): void {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
  }

  // Locks the room, then re-reads the price under that lock (same order as proposals: rooms before price rows).
  private async lockRoomPrice(tx: Prisma.TransactionClient, id: number): Promise<LockedRoomPrice> {
    const target = await tx.roomPrice.findUnique({ where: { id }, select: { roomId: true } });
    if (!target) throw new NotFoundException(ErrorCode.NOT_FOUND);
    await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM rooms WHERE id = ${target.roomId} FOR UPDATE`;
    const row = await tx.roomPrice.findUnique({ where: { id }, include: ROOM_PRICE_INCLUDE });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return row;
  }

  // Locks the building, then re-reads the plan under that lock (same order as proposals).
  private async lockRatePlan(tx: Prisma.TransactionClient, id: number): Promise<RatePlanRow> {
    const target = await tx.ratePlan.findUnique({ where: { id }, select: { buildingId: true } });
    if (!target) throw new NotFoundException(ErrorCode.NOT_FOUND);
    await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM buildings WHERE id = ${target.buildingId} FOR UPDATE`;
    const row = await tx.ratePlan.findUnique({ where: { id }, include: RATE_PLAN_INCLUDE });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return row;
  }

  private async toView(
    db: Prisma.TransactionClient,
    row: RoomPrice,
    room: { buildingId: number; code: string; building: { name: string } },
  ): Promise<RoomPriceView> {
    const oldPrice = await this.oldRoomPrice(db, row);
    return {
      id: row.id,
      roomId: row.roomId,
      buildingId: room.buildingId,
      price: row.price,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
      status: row.status,
      reason: row.reason,
      proposedById: row.proposedById,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      expired: isExpired(row.status, row.effectiveFrom),
      comparison: priceChange(oldPrice, row.price),
      roomCode: room.code,
      buildingName: room.building.name,
    };
  }

  private async toRatePlanView(db: Prisma.TransactionClient, row: RatePlanRow): Promise<RatePlanView> {
    const tiers = row.tiers.map(toTierView);
    const oldTiers = await this.oldRateTiers(db, row);
    return {
      id: row.id,
      buildingId: row.buildingId,
      kind: row.kind,
      serviceId: row.serviceId,
      effectiveFrom: formatDateOnly(row.effectiveFrom),
      status: row.status,
      reason: row.reason,
      proposedById: row.proposedById,
      reviewedById: row.reviewedById,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNote: row.reviewNote,
      createdAt: row.createdAt.toISOString(),
      expired: isExpired(row.status, row.effectiveFrom),
      tiers,
      comparison: ratePlanComparison(row.kind, oldTiers, tiers),
      buildingName: row.building.name,
    };
  }

  // PRC-12: the old value is the APPROVED price in effect on the proposal's effective_from (PRC-06 rule), never the row itself.
  // shortcut: one query per row, so a list costs up to 100 extra reads; upgrade to one batched query if the page is slow.
  private async oldRoomPrice(db: Prisma.TransactionClient, row: RoomPrice): Promise<number | null> {
    const old = await db.roomPrice.findFirst({
      where: { roomId: row.roomId, status: 'APPROVED', effectiveFrom: { lte: row.effectiveFrom }, id: { not: row.id } },
      orderBy: [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }],
      select: { price: true },
    });
    return old?.price ?? null;
  }

  // Same rule as oldRoomPrice, for the plan's (building, kind, service) key (RATE-04).
  private async oldRateTiers(db: Prisma.TransactionClient, row: RatePlan): Promise<RateTierView[] | null> {
    const old = await db.ratePlan.findFirst({
      where: {
        buildingId: row.buildingId,
        kind: row.kind,
        serviceId: row.serviceId,
        status: 'APPROVED',
        effectiveFrom: { lte: row.effectiveFrom },
        id: { not: row.id },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { reviewedAt: 'desc' }],
      include: { tiers: { orderBy: { tierNo: 'asc' } } },
    });
    return old ? old.tiers.map(toTierView) : null;
  }
}

function toTierView(tier: RateTier): RateTierView {
  return { tierNo: tier.tierNo, upTo: tier.upTo, unitPrice: tier.unitPrice };
}

// API-02: sort=-createdAt by default; id breaks ties so pages are stable.
function listOrder(sort?: 'createdAt' | '-createdAt'): Array<{ createdAt: Prisma.SortOrder } | { id: Prisma.SortOrder }> {
  const direction: Prisma.SortOrder = sort === 'createdAt' ? 'asc' : 'desc';
  return [{ createdAt: direction }, { id: direction }];
}
