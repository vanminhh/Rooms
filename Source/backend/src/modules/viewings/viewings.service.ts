import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addDays,
  compareDates,
  formatDateOnly,
  HANOI_OFFSET_MS,
  parseDateOnly,
  SLOT_START_MINUTES,
  todayHanoi,
  type TimeSlot,
} from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated, type Paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { CreateViewingDto, PublicViewingDto, UpdateViewingDto, ViewingsQueryDto } from './dto/viewings.dto.js';
import { checkVisitSlot } from './viewing-slot.js';
import type { ViewingStatus, ViewingView } from './viewings.types.js';

// A-03: 5 submissions per hour per IP (in memory, VIEW-02); VIEW-11: 3 WEB viewings per phone per Hanoi day.
const IP_MAX = 5;
const IP_WINDOW_MS = 60 * 60 * 1000;
const PHONE_DAILY_MAX = 3;

// VIEW-12: a saved submission and a honeypot one get this same body (no id).
const RECEIVED = { received: true } as const;

// VIEW-08 and VIEW-10 labels (UI-02).
const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  MORNING: 'Sáng (8:00–11:00)',
  AFTERNOON: 'Chiều (14:00–17:00)',
  EVENING: 'Tối (18:00–20:00)',
};
const STATUS_LABELS: Record<ViewingStatus, string> = {
  NEW: 'Mới',
  CONFIRMED: 'Đã xác nhận',
  WON: 'Đã chốt',
  LOST: 'Không thành',
  CANCELLED: 'Đã hủy',
};

// VIEW-04: the only moves a PATCH may make. WON is set by contract creation (Phase 3), never here.
const NEXT_STATUSES: Partial<Record<ViewingStatus, ViewingStatus[]>> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['LOST', 'CANCELLED'],
};

// Exported for DashboardService (CP-5): one mapping of a viewing to ViewingView.
export const VIEWING_INCLUDE = {
  room: { select: { code: true, buildingId: true, building: { select: { name: true } } } },
} satisfies Prisma.ViewingInclude;
export type ViewingRecord = Prisma.ViewingGetPayload<{ include: typeof VIEWING_INCLUDE }>;

const tooManyRequests = () => new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);

// Hanoi midnight of a business date (dates are stored as UTC midnight of their calendar day).
const hanoiMidnight = (day: Date) => new Date(day.getTime() - HANOI_OFFSET_MS);

export function toView(row: ViewingRecord): ViewingView {
  const timeSlot = row.timeSlot as TimeSlot;
  return {
    id: row.id,
    roomId: row.roomId,
    roomCode: row.room.code,
    buildingId: row.room.buildingId,
    buildingName: row.room.building.name,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    visitDate: formatDateOnly(row.visitDate),
    timeSlot,
    timeSlotLabel: TIME_SLOT_LABELS[timeSlot],
    note: row.note,
    source: row.source,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status],
    handledById: row.handledById,
    outcomeNote: row.outcomeNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ViewingsService {
  private readonly ipLimiter = new RateLimiter(IP_MAX, IP_WINDOW_MS);

  constructor(private readonly prisma: PrismaService) {}

  // POST /public/viewings (VIEW-01, 02, 08, 11, 12).
  async createPublic(dto: PublicViewingDto, ip: string): Promise<{ received: true }> {
    const now = new Date();
    const visitDate = checkVisitSlot(dto.visitDate, dto.timeSlot, now);

    // Honeypot: nothing is saved, the hit still counts against the IP.
    if (dto.website) {
      this.ipLimiter.record(ip, now.getTime());
      return RECEIVED;
    }
    if (this.ipLimiter.isBlocked(ip, now.getTime())) throw tooManyRequests();
    this.ipLimiter.record(ip, now.getTime());

    const today = todayHanoi(now);
    await this.prisma.$transaction(async (tx) => {
      // VIEW-11: the phone lock makes the count and the insert one step for parallel submissions.
      await tx.$queryRaw<Array<{ lock: string }>>`SELECT pg_advisory_xact_lock(hashtext(${`viewing-phone:${dto.guestPhone}`}))::text AS lock`;
      // ROOM-05 / VIEW-01: a missing room and a non-public one look the same.
      const room = await tx.room.findFirst({
        where: { id: dto.roomId, ...publicRoomWhere(today) },
        select: { id: true },
      });
      if (!room) throw new ConflictException(ErrorCode.ROOM_NOT_AVAILABLE);

      const sentToday = await tx.viewing.count({
        where: {
          guestPhone: dto.guestPhone,
          source: 'WEB',
          createdAt: { gte: hanoiMidnight(today), lt: hanoiMidnight(addDays(today, 1)) },
        },
      });
      if (sentToday >= PHONE_DAILY_MAX) throw tooManyRequests();

      await tx.viewing.create({
        data: {
          roomId: dto.roomId,
          guestName: dto.guestName,
          guestPhone: dto.guestPhone,
          visitDate,
          timeSlot: dto.timeSlot,
          note: dto.note,
          source: 'WEB',
          status: 'NEW',
        },
      });
    });
    return RECEIVED;
  }

  // GET /viewings (API-08): BOSS sees every building, MANAGER only the buildings in scope.
  async list(user: AuthUser, query: ViewingsQueryDto): Promise<Paginated<ViewingView>> {
    const { page, limit, skip, take } = pageParams(query);
    if (query.buildingId !== undefined) this.assertBuildingScope(user, query.buildingId);

    const where: Prisma.ViewingWhereInput = {
      room: query.buildingId !== undefined ? { buildingId: query.buildingId } : scopeWhere(user),
    };
    if (query.status !== undefined) where.status = query.status;
    if (query.from !== undefined || query.to !== undefined) {
      where.visitDate = {
        gte: query.from === undefined ? undefined : this.filterDate(query.from, 'from'),
        lte: query.to === undefined ? undefined : this.filterDate(query.to, 'to'),
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.viewing.findMany({
        where,
        include: VIEWING_INCLUDE,
        orderBy: [{ visitDate: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }], // stable paging; slot order fixed below
        skip,
        take,
      }),
      this.prisma.viewing.count({ where }),
    ]);
    // shortcut: DB sorts time_slot alphabetically, so only this page is re-sorted by slot start; a day split across two pages can be out of slot order at the edge, upgrade to raw ORDER BY CASE if seen.
    rows.sort(
      (a, b) =>
        compareDates(a.visitDate, b.visitDate) ||
        SLOT_START_MINUTES[a.timeSlot as TimeSlot] - SLOT_START_MINUTES[b.timeSlot as TimeSlot] ||
        a.id - b.id,
    );
    return paginated(rows.map(toView), page, limit, total);
  }

  // POST /viewings (VIEW-03): a manual viewing. The room must be active and in scope; it need not be public.
  async create(user: AuthUser, dto: CreateViewingDto): Promise<ViewingView> {
    const visitDate = checkVisitSlot(dto.visitDate, dto.timeSlot);
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      select: { isActive: true, buildingId: true },
    });
    if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
    this.assertBuildingScope(user, room.buildingId);
    if (!room.isActive) throw new ConflictException(ErrorCode.CONFLICT_STATE);

    const row = await this.prisma.viewing.create({
      data: {
        roomId: dto.roomId,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone,
        visitDate,
        timeSlot: dto.timeSlot,
        note: dto.note,
        source: 'MANUAL',
        status: 'NEW',
        handledById: user.id,
      },
      include: VIEWING_INCLUDE,
    });
    return toView(row);
  }

  // PATCH /viewings/:id (VIEW-04, VIEW-09). Every change records handled_by_id.
  async update(user: AuthUser, id: number, dto: UpdateViewingDto): Promise<ViewingView> {
    const current = await this.prisma.viewing.findUnique({ where: { id }, include: VIEWING_INCLUDE });
    if (!current) throw new NotFoundException(ErrorCode.NOT_FOUND);
    this.assertBuildingScope(user, current.room.buildingId);
    const status = current.status;

    if (dto.status !== undefined && !(NEXT_STATUSES[status] ?? []).includes(dto.status)) {
      throw new ConflictException(ErrorCode.CONFLICT_STATE);
    }
    if (dto.status === 'LOST' && !dto.outcomeNote?.trim()) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        fields: { outcomeNote: 'Cần ghi kết quả khi đánh dấu không thành' },
      });
    }

    // VIEW-09: date and slot change only while NEW or CONFIRMED, checked with VIEW-08 on the new values.
    let visitDate: Date | undefined;
    if (dto.visitDate !== undefined || dto.timeSlot !== undefined) {
      if (status !== 'NEW' && status !== 'CONFIRMED') throw new ConflictException(ErrorCode.CONFLICT_STATE);
      visitDate = checkVisitSlot(
        dto.visitDate ?? formatDateOnly(current.visitDate),
        dto.timeSlot ?? (current.timeSlot as TimeSlot),
      );
    }

    const data: Prisma.ViewingUncheckedUpdateManyInput = { handledById: user.id };
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.outcomeNote !== undefined) data.outcomeNote = dto.outcomeNote;
    if (visitDate !== undefined) data.visitDate = visitDate;
    if (dto.timeSlot !== undefined) data.timeSlot = dto.timeSlot;
    if (dto.note !== undefined) data.note = dto.note;

    // VIEW-04: conditional on the status read above; a concurrent change makes this 0 rows.
    const result = await this.prisma.viewing.updateMany({ where: { id, status }, data });
    if (result.count === 0) throw new ConflictException(ErrorCode.CONFLICT_STATE);

    const row = await this.prisma.viewing.findUnique({ where: { id }, include: VIEWING_INCLUDE });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return toView(row);
  }

  // SCOPE-02 / API-08: a manager reaches only buildings in user.buildingIds; Boss (null) reaches all.
  private assertBuildingScope(user: AuthUser, buildingId: number): void {
    if (user.buildingIds !== null && !user.buildingIds.includes(buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
  }

  // The DTO checks the shape; this rejects impossible days such as 2026-02-30.
  private filterDate(value: string, field: 'from' | 'to'): Date {
    const date = parseDateOnly(value);
    if (!date) {
      throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: 'Ngày lọc không hợp lệ' } });
    }
    return date;
  }
}
