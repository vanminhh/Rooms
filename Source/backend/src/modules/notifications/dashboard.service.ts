import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { monthlyDraftPlan } from '../billing/monthly-drafts.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { toView, VIEWING_INCLUDE } from '../viewings/viewings.service.js';
import type { ViewingView } from '../viewings/viewings.types.js';
import { viewingStart } from '../viewings/viewing-time.js';
import { viewingOverlapIds } from '../viewings/viewing-capacity.js';
import { viewingBossId, viewingHolds } from '../viewings/viewing-reservations.js';
import type { DashboardQueryDto } from './dto/dashboard.dto.js';

// "Việc hôm nay" (NOTI-06).
export interface DashboardView {
  newViewings: { count: number; items: ViewingView[] };
  overlappingViewings: { count: number; items: ViewingView[] };
  depositCancelledViewings: { count: number; items: ViewingView[] };
  unpaidDeposits: { count: number; items: UnpaidDepositItem[] };
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null;
  // Phase 4 money groups (NOTI-06, BIL-05, BIL-06, BIL-21, D-42, CON-20, CON-21).
  awaitingReadings: { count: number; late: number; items: PeriodItem[] };
  missedPeriods: { count: number; items: PeriodItem[] };
  overdueInvoices: { count: number; items: UnpaidDepositItem[] };
  expiringContracts: { count: number; items: ContractItem[] };
  expiredContracts: { count: number; items: ContractItem[] };
  renewalsWaiting: { count: number; items: ContractItem[] };
}

type ContractRef = UnpaidDepositItem['contract'];
export interface ContractItem extends ContractRef { endDate: string }
export interface PeriodItem {
  invoiceId: number | null; code: string | null; periodNo: number; periodStart: string; periodEnd: string;
  billingDate: string; late: boolean; contract: ContractRef;
}

export interface UnpaidDepositItem {
  id: number;
  code: string;
  total: number;
  dueDate: string | null;
  contract: {
    id: number;
    code: string;
    room: { id: number; code: string };
    building: { id: number; code: string; name: string };
    tenant: { id: number; fullName: string; phone: string };
  };
}

const ITEM_LIMIT = 5;
const CONTRACT_REF = {
  id: true, code: true,
  room: { select: { id: true, code: true } },
  building: { select: { id: true, code: true, name: true } },
  tenant: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.ContractSelect;
const UNPAID_DEPOSIT_SELECT = {
  id: true, total: true, dueDate: true,
  contract: { select: {
    id: true, code: true,
    room: { select: { id: true, code: true } },
    building: { select: { id: true, code: true, name: true } },
    tenant: { select: { id: true, fullName: true, phone: true } },
  } },
} satisfies Prisma.InvoiceSelect;

// SCOPE-04: a building whose manager is null or inactive. A locked building has managerId null (BLD-06).
const WITHOUT_ACTIVE_MANAGER: Prisma.BuildingWhereInput = {
  OR: [{ managerId: null }, { manager: { isActive: false } }],
};

// Same order as GET /viewings: visit date, then slot start (time_slot sorts alphabetically in the DB).
function bySlot<T extends { id: number; visitAt?: Date | null; visitDate: Date | null; timeSlot: string | null }>(a: T, b: T): number {
  return (
    viewingStart(a).getTime() - viewingStart(b).getTime() ||
    a.id - b.id
  );
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser, query: DashboardQueryDto): Promise<DashboardView> {
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    if (query.buildingId !== undefined && user.buildingIds !== null && !user.buildingIds.includes(query.buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    const overlaps = viewingOverlapIds(await viewingHolds(this.prisma, undefined, undefined, await viewingBossId(this.prisma)));
    return {
      newViewings: await this.newViewings(user, query.buildingId, overlaps),
      overlappingViewings: await this.overlappingViewings(user, query.buildingId, overlaps),
      depositCancelledViewings: await this.depositCancelledViewings(user, query.buildingId),
      unpaidDeposits: await this.unpaidDeposits(user, query.buildingId),
      pendingPrices: user.buildingIds === null ? await this.pendingPrices() : null,
      ...await this.moneyGroups(this.responsible(user, query.buildingId)),
    };
  }

  // Same responsibility as unpaid deposits: the building's current active manager, Boss for buildings without one (SCOPE-04).
  private responsible(user: AuthUser, buildingId: number | undefined): Prisma.ContractWhereInput {
    return user.role === 'BOSS'
      ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
      : { ...scopeWhere(user), building: { id: buildingId, isActive: true, managerId: user.id, manager: { isActive: true } } };
  }

  private async moneyGroups(contract: Prisma.ContractWhereInput, today = todayHanoi()) {
    const date = (d: Date) => formatDateOnly(d);
    return this.prisma.$transaction(async tx => {
      // D-42: a draft is late (red) from the day after its billing date, i.e. from the 2nd of the month.
      const drafts = await tx.invoice.findMany({ where: { type: 'MONTHLY', status: 'DRAFT', contract },
        select: { id: true, periodNo: true, periodStart: true, periodEnd: true, contract: { select: CONTRACT_REF } },
        orderBy: [{ periodEnd: 'asc' }, { id: 'asc' }] });
      const draftItems = drafts.map((d): PeriodItem => {
        const billingDate = addDays(d.periodEnd!, 1);
        return { invoiceId: d.id, code: `TT${d.id}`, periodNo: d.periodNo, periodStart: date(d.periodStart!), periodEnd: date(d.periodEnd!),
          billingDate: date(billingDate), late: today > billingDate, contract: d.contract };
      });
      // BIL-05/BIL-21: due periods the job no longer creates (over 7 days for ACTIVE; any for ENDED without settlement).
      const open = await tx.contract.findMany({ where: { AND: [contract, { OR: [{ status: 'ACTIVE' }, { status: 'ENDED', settlement: null }] }] },
        select: { ...CONTRACT_REF, status: true, startDate: true, termMonths: true,
          invoices: { where: { type: 'MONTHLY', status: { not: 'CANCELLED' } }, select: { periodNo: true } } } });
      const missed = open.flatMap(({ status, startDate, termMonths, invoices, ...ref }) => {
        const plan = monthlyDraftPlan({ startDate, termMonths }, invoices.map(i => i.periodNo), today);
        return (status === 'ACTIVE' ? plan.missedOld : [...plan.missedOld, ...plan.create]).map((p): PeriodItem => ({
          invoiceId: null, code: null, periodNo: p.periodNo, periodStart: date(p.periodStart), periodEnd: date(p.periodEnd),
          billingDate: date(p.billingDate), late: true, contract: ref,
        }));
      }).sort((a, b) => a.billingDate.localeCompare(b.billingDate) || a.contract.id - b.contract.id);
      const overdueWhere: Prisma.InvoiceWhereInput = { type: { not: 'DEPOSIT' }, status: 'UNPAID', dueDate: { lt: today }, contract };
      const overdueCount = await tx.invoice.count({ where: overdueWhere });
      const overdue = overdueCount === 0 ? [] : await tx.invoice.findMany({ where: overdueWhere, select: UNPAID_DEPOSIT_SELECT,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: ITEM_LIMIT });
      const contracts = async (where: Prisma.ContractWhereInput) => {
        const full: Prisma.ContractWhereInput = { AND: [contract, where] };
        const count = await tx.contract.count({ where: full });
        const rows = count === 0 ? [] : await tx.contract.findMany({ where: full, select: { ...CONTRACT_REF, endDate: true },
          orderBy: [{ endDate: 'asc' }, { id: 'asc' }], take: ITEM_LIMIT });
        return { count, items: rows.map(({ endDate, ...c }): ContractItem => ({ ...c, endDate: date(endDate) })) };
      };
      return {
        awaitingReadings: { count: draftItems.length, late: draftItems.filter(d => d.late).length, items: draftItems.slice(0, ITEM_LIMIT) },
        // shortcut: every missed period is returned (the red card lists each one, 30-frontend); paginate if it ever grows large.
        missedPeriods: { count: missed.length, items: missed },
        overdueInvoices: { count: overdueCount, items: overdue.map(row => ({ ...row, code: `TT${row.id}`, dueDate: row.dueDate ? date(row.dueDate) : null })) },
        // CON-20: ACTIVE, end_date within 30 days, no renewal and no settlement.
        expiringContracts: await contracts({ status: 'ACTIVE', endDate: { gte: today, lte: addDays(today, 30) }, nextContract: null, settlement: null }),
        // CON-21 (D-13): past end_date without renewal or settlement, red.
        expiredContracts: await contracts({ status: 'ACTIVE', endDate: { lt: today }, nextContract: null, settlement: null }),
        // BIL-06 (Q-P4-15): a signed renewal has started but the old contract still waits for its final invoice or handover readings.
        renewalsWaiting: await contracts({ status: 'ACTIVE', nextContract: { status: 'HOLD', signedAt: { not: null }, startDate: { lte: today } } }),
      };
    }, { isolationLevel: 'RepeatableRead' });
  }

  // VIEW-07 (Q-P6-2 = A): every NEW viewing counts, whatever its visit date.
  private async newViewings(user: AuthUser, buildingId: number | undefined, overlaps: Set<number>): Promise<DashboardView['newViewings']> {
    const room: Prisma.RoomWhereInput =
      user.buildingIds === null
        ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
        : { buildingId: buildingId ?? { in: user.buildingIds } };

    // shortcut: loads the id, date and slot of every NEW viewing in scope to pick the first 5 by slot start in JS; fine for a few thousand rows, upgrade to raw ORDER BY CASE if slower.
    const rows = await this.prisma.viewing.findMany({
      where: { status: 'NEW', room },
      select: { id: true, visitAt: true, visitDate: true, timeSlot: true },
    });
    rows.sort(bySlot);
    const firstIds = rows.slice(0, ITEM_LIMIT).map((row) => row.id);
    const items = await this.prisma.viewing.findMany({ where: { id: { in: firstIds } }, include: VIEWING_INCLUDE });
    items.sort(bySlot);
    return { count: rows.length, items: items.map((row) => toView(row, overlaps.has(row.id))) };
  }

  private async overlappingViewings(user: AuthUser, buildingId: number | undefined, overlaps: Set<number>): Promise<DashboardView['overlappingViewings']> {
    if (overlaps.size === 0) return { count: 0, items: [] };
    const room: Prisma.RoomWhereInput = user.buildingIds === null
      ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
      : { buildingId: buildingId ?? { in: user.buildingIds } };
    const rows = await this.prisma.viewing.findMany({ where: { id: { in: [...overlaps] }, room }, include: VIEWING_INCLUDE });
    rows.sort(bySlot);
    return { count: rows.length, items: rows.slice(0, ITEM_LIMIT).map(row => toView(row, true)) };
  }

  // VIEW-06 / D-39: keep the task with the current responsible person until the call is recorded.
  private async depositCancelledViewings(user: AuthUser, buildingId: number | undefined): Promise<DashboardView['depositCancelledViewings']> {
    const room: Prisma.RoomWhereInput = user.role === 'BOSS'
      ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
      : { ...scopeWhere(user), building: { id: buildingId, isActive: true, managerId: user.id, manager: { isActive: true } } };
    const where: Prisma.ViewingWhereInput = {
      status: 'CANCELLED', depositCancelledByContractId: { not: null }, calledAt: null, room,
    };
    return this.prisma.$transaction(async tx => {
      const count = await tx.viewing.count({ where });
      const rows = count === 0 ? [] : await tx.viewing.findMany({
        where, include: VIEWING_INCLUDE, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: ITEM_LIMIT,
      });
      return { count, items: rows.map(row => toView(row)) };
    }, { isolationLevel: 'RepeatableRead' });
  }

  // NOTI-06: one current responsible person owns each unpaid deposit task, irrespective of due date.
  private async unpaidDeposits(user: AuthUser, buildingId: number | undefined): Promise<DashboardView['unpaidDeposits']> {
    const contract: Prisma.ContractWhereInput = user.role === 'BOSS'
      ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
      : { ...scopeWhere(user), building: { id: buildingId, isActive: true, managerId: user.id, manager: { isActive: true } } };
    const where: Prisma.InvoiceWhereInput = { type: 'DEPOSIT', status: 'UNPAID', contract };
    return this.prisma.$transaction(async tx => {
      const count = await tx.invoice.count({ where });
      const rows = count === 0 ? [] : await tx.invoice.findMany({
        where, select: UNPAID_DEPOSIT_SELECT, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: ITEM_LIMIT,
      });
      return { count, items: rows.map(row => ({
        ...row, code: `TT${row.id}`, dueDate: row.dueDate ? formatDateOnly(row.dueDate) : null,
      })) };
    }, { isolationLevel: 'RepeatableRead' });
  }

  // PRC-11: Boss only; PENDING proposals that are not expired (effective_from today or later).
  private async pendingPrices(): Promise<NonNullable<DashboardView['pendingPrices']>> {
    const today = todayHanoi();
    const [rooms, ratePlans] = await Promise.all([
      this.prisma.roomPrice.count({ where: { status: 'PENDING', effectiveFrom: { gte: today } } }),
      this.prisma.ratePlan.count({ where: { status: 'PENDING', effectiveFrom: { gte: today } } }),
    ]);
    return { count: rooms + ratePlans, rooms, ratePlans };
  }
}
