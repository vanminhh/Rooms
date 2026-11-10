import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { compareDates, SLOT_START_MINUTES, todayHanoi, type TimeSlot } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toView, VIEWING_INCLUDE } from '../viewings/viewings.service.js';
import type { ViewingView } from '../viewings/viewings.types.js';
import type { DashboardQueryDto } from './dto/dashboard.dto.js';

// "Việc hôm nay" cards of Phase 2 (NOTI-06): new viewings (VIEW-07) and pending prices (PRC-11).
export interface DashboardView {
  newViewings: { count: number; items: ViewingView[] };
  pendingPrices: { count: number; rooms: number; ratePlans: number } | null;
}

const ITEM_LIMIT = 5;

// SCOPE-04: a building whose manager is null or inactive. A locked building has managerId null (BLD-06).
const WITHOUT_ACTIVE_MANAGER: Prisma.BuildingWhereInput = {
  OR: [{ managerId: null }, { manager: { isActive: false } }],
};

// Same order as GET /viewings: visit date, then slot start (time_slot sorts alphabetically in the DB).
function bySlot<T extends { id: number; visitDate: Date; timeSlot: string }>(a: T, b: T): number {
  return (
    compareDates(a.visitDate, b.visitDate) ||
    SLOT_START_MINUTES[a.timeSlot as TimeSlot] - SLOT_START_MINUTES[b.timeSlot as TimeSlot] ||
    a.id - b.id
  );
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser, query: DashboardQueryDto): Promise<DashboardView> {
    if (query.buildingId !== undefined && user.buildingIds !== null && !user.buildingIds.includes(query.buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    return {
      newViewings: await this.newViewings(user, query.buildingId),
      pendingPrices: user.buildingIds === null ? await this.pendingPrices() : null,
    };
  }

  // VIEW-07 (Q-P6-2 = A): every NEW viewing counts, whatever its visit date.
  private async newViewings(user: AuthUser, buildingId: number | undefined): Promise<DashboardView['newViewings']> {
    const room: Prisma.RoomWhereInput =
      user.buildingIds === null
        ? { building: { id: buildingId, ...WITHOUT_ACTIVE_MANAGER } }
        : { buildingId: buildingId ?? { in: user.buildingIds } };

    // shortcut: loads the id, date and slot of every NEW viewing in scope to pick the first 5 by slot start in JS; fine for a few thousand rows, upgrade to raw ORDER BY CASE if slower.
    const rows = await this.prisma.viewing.findMany({
      where: { status: 'NEW', room },
      select: { id: true, visitDate: true, timeSlot: true },
    });
    rows.sort(bySlot);
    const firstIds = rows.slice(0, ITEM_LIMIT).map((row) => row.id);
    const items = await this.prisma.viewing.findMany({ where: { id: { in: firstIds } }, include: VIEWING_INCLUDE });
    items.sort(bySlot);
    return { count: rows.length, items: items.map((row) => toView(row)) };
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
