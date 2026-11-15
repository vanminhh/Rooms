import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { addDays, formatDateOnly, HANOI_OFFSET_MS, todayHanoi, type TimeSlot } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { sha256Hex } from '../../common/crypto/token.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated, type Paginated, type PaginationQuery } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingKey, lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { BuildingContactService } from '../buildings/building-contact.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { emailTemplate } from '../mailer/email-templates.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { SettingsService } from '../settings/settings.service.js';
import type { BookViewingDto, ConfirmViewingDto, CreateViewingDto, UpdateViewingDto, ViewingsQueryDto, ViewingTimesQueryDto } from './dto/viewings.dto.js';
import { canBookViewing, viewingOverlapIds } from './viewing-capacity.js';
import { assertViewingScope, lockViewingOccupancy, reserveViewingHour, responsibleId, viewingBossId, viewingHolds, viewingRoom, VIEWING_ROOM_INCLUDE } from './viewing-reservations.js';
import { checkVisitAt, viewingStart } from './viewing-time.js';
import { TIME_SLOT_LABELS } from './viewing-slot.js';
import { VIEWING_FIELDS, viewingFieldError, viewingFilterDate } from './viewing-validation.js';
import type { OwnViewingView, ViewingDay, ViewingStatus, ViewingView } from './viewings.types.js';

const STATUS_LABELS: Record<ViewingStatus, string> = {
  NEW: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', DONE: 'Đã xem', WON: 'Đã chốt', LOST: 'Không thành', CANCELLED: 'Đã hủy',
};
const OPEN = ['NEW', 'CONFIRMED'] as const;
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000, isolationLevel: 'ReadCommitted' as const };
const hanoiMidnight = (day: Date) => new Date(day.getTime() - HANOI_OFFSET_MS);
const conflict = () => new ConflictException(ErrorCode.CONFLICT_STATE);

export const VIEWING_INCLUDE = {
  user: { select: { email: true, locale: true } },
  room: { select: { code: true, buildingId: true, isActive: true, underMaintenance: true,
    building: { select: { name: true, address: true, isActive: true, manager: {
      select: { id: true, isActive: true, email: true, contactPhone: true, zaloUrl: true, facebookUrl: true },
    } } },
  } },
} satisfies Prisma.ViewingInclude;
export type ViewingRecord = Prisma.ViewingGetPayload<{ include: typeof VIEWING_INCLUDE }>;

export function toView(row: ViewingRecord, overlap = false): ViewingView {
  const timeSlot = row.timeSlot as TimeSlot | null;
  return {
    id: row.id, roomId: row.roomId, roomCode: row.room.code, buildingId: row.room.buildingId,
    buildingName: row.room.building.name, guestName: row.guestName, guestPhone: row.guestPhone,
    guestEmail: row.user?.email ?? null, visitAt: row.visitAt?.toISOString() ?? null,
    visitDate: row.visitDate ? formatDateOnly(row.visitDate) : null, timeSlot,
    timeSlotLabel: timeSlot === null ? null : TIME_SLOT_LABELS[timeSlot], note: row.note,
    source: row.source, status: row.status, statusLabel: STATUS_LABELS[row.status],
    handledById: row.handledById, outcomeNote: row.outcomeNote,
    overdue: row.status === 'NEW' && viewingStart(row).getTime() < Date.now(), overlap,
    roomLocked: row.room.isActive === false || row.room.underMaintenance === true || row.room.building.isActive === false,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export function byViewingStart(a: ViewingRecord, b: ViewingRecord): number {
  return viewingStart(a).getTime() - viewingStart(b).getTime() || a.id - b.id;
}

@Injectable()
export class ViewingsService {
  private readonly logger = new Logger(ViewingsService.name);

  constructor(private readonly prisma: PrismaService, private readonly contacts: BuildingContactService,
    private readonly settings: SettingsService, private readonly mailer: MailerService) {}

  async book(actor: AuthUser, dto: BookViewingDto): Promise<OwnViewingView> {
    checkVisitAt(dto.visitAt);
    const row = await this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      await lockViewingKey(tx, `account:${actor.id}`);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`;
      const account = await this.account(tx, actor);
      if (account.role === 'GUEST' && (!account.email || !account.emailVerifiedAt)) throw new ForbiddenException(ErrorCode.EMAIL_NOT_VERIFIED);
      if (account.role === 'TENANT' && !account.email) viewingFieldError('email', VIEWING_FIELDS.tenantEmail);
      const room = await viewingRoom(tx, dto.roomId, true);
      if (await tx.viewing.findFirst({ where: { userId: actor.id, roomId: dto.roomId, status: { in: [...OPEN] } }, select: { id: true } })) throw conflict();
      await reserveViewingHour(tx, room, account.phone, new Date(dto.visitAt));
      // Use the same instant for the quota window and createdAt, even if lock waits cross Hanoi midnight.
      const createdAt = new Date();
      const today = todayHanoi(createdAt);
      const count = await tx.viewing.count({ where: { userId: actor.id, source: 'WEB',
        createdAt: { gte: hanoiMidnight(today), lt: hanoiMidnight(addDays(today, 1)) } } });
      if (count >= 3) throw new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
      // A lock wait must not turn a future booking into an already-started appointment.
      const visitAt = checkVisitAt(dto.visitAt);
      return tx.viewing.create({ data: { roomId: dto.roomId, userId: actor.id, guestName: account.fullName,
        guestPhone: account.phone, visitAt, visitDate: null, timeSlot: null, note: dto.note,
        source: 'WEB', status: 'NEW', createdAt }, include: VIEWING_INCLUDE });
    }, TX_OPTIONS);
    await this.notifyNew(row);
    return this.ownView(row);
  }

  async create(actor: AuthUser, dto: CreateViewingDto): Promise<ViewingView> {
    checkVisitAt(dto.visitAt);
    const row = await this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      const room = await viewingRoom(tx, dto.roomId, false);
      assertViewingScope(actor, room);
      if (!room.isActive) throw conflict();
      await reserveViewingHour(tx, room, dto.guestPhone, new Date(dto.visitAt));
      return tx.viewing.create({ data: { roomId: dto.roomId, userId: null, guestName: dto.guestName,
        guestPhone: dto.guestPhone, visitAt: checkVisitAt(dto.visitAt), visitDate: null, timeSlot: null,
        note: dto.note, source: 'MANUAL', status: 'NEW', handledById: actor.id }, include: VIEWING_INCLUDE });
    }, TX_OPTIONS);
    return toView(row);
  }

  async list(actor: AuthUser, query: ViewingsQueryDto): Promise<Paginated<ViewingView>> {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const { page, limit, skip } = pageParams(query);
    if (query.buildingId !== undefined && actor.buildingIds !== null && !actor.buildingIds.includes(query.buildingId)) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    const where: Prisma.ViewingWhereInput = {
      room: { ...scopeWhere(actor), ...(query.buildingId === undefined ? {} : { buildingId: query.buildingId }) },
      status: query.status,
    };
    if (query.from !== undefined || query.to !== undefined) {
      const from = query.from === undefined ? undefined : viewingFilterDate(query.from, 'from');
      const to = query.to === undefined ? undefined : viewingFilterDate(query.to, 'to');
      where.OR = [
        { visitAt: { gte: from && hanoiMidnight(from), lt: to && hanoiMidnight(addDays(to, 1)) } },
        { visitAt: null, visitDate: { gte: from, lte: to } },
      ];
    }
    // Sort the mixed exact/legacy set before pagination; a page boundary must not change time order.
    const rows = await this.prisma.viewing.findMany({ where, include: VIEWING_INCLUDE });
    rows.sort(byViewingStart);
    const overlaps = viewingOverlapIds(await viewingHolds(this.prisma, undefined, undefined, await viewingBossId(this.prisma)));
    return paginated(rows.slice(skip, skip + limit).map(row => toView(row, overlaps.has(row.id))), page, limit, rows.length);
  }

  async update(actor: AuthUser, id: number, dto: UpdateViewingDto): Promise<ViewingView> {
    const row = await this.prisma.$transaction(async tx => {
      const current = await this.lockedViewing(tx, id);
      const room = await viewingRoom(tx, current.roomId, false);
      assertViewingScope(actor, room);
      const open = current.status === 'NEW' || current.status === 'CONFIRMED';
      const at = dto.visitAt === undefined ? viewingStart(current) : checkVisitAt(dto.visitAt);
      if (dto.visitAt !== undefined && !open) throw conflict();
      if (dto.status !== undefined) {
        const allowed = (open && (dto.status === 'DONE' || dto.status === 'CANCELLED')) || (current.status === 'DONE' && dto.status === 'LOST');
        if (!allowed || (dto.status === 'DONE' && at.getTime() >= Date.now())) throw conflict();
        if (dto.status === 'CANCELLED' && !dto.note?.trim()) viewingFieldError('note', VIEWING_FIELDS.cancellation);
        if (dto.status === 'LOST' && !dto.outcomeNote?.trim()) viewingFieldError('outcomeNote', VIEWING_FIELDS.outcome);
      }
      if (dto.visitAt !== undefined) await reserveViewingHour(tx, room, current.guestPhone, at, id);
      else await lockViewingOccupancy(tx, room, current.guestPhone);
      const data: Prisma.ViewingUncheckedUpdateManyInput = { handledById: actor.id };
      if (dto.visitAt !== undefined) Object.assign(data, { visitAt: checkVisitAt(dto.visitAt), visitDate: null, timeSlot: null });
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.outcomeNote !== undefined) data.outcomeNote = dto.outcomeNote;
      return this.change(tx, current, data);
    }, TX_OPTIONS);
    return toView(row);
  }

  async confirm(actor: AuthUser, id: number, dto: ConfirmViewingDto): Promise<ViewingView> {
    let emailSent = false;
    try {
    const row = await this.prisma.$transaction(async tx => {
      const current = await this.lockedViewing(tx, id);
      const room = await viewingRoom(tx, current.roomId, false);
      assertViewingScope(actor, room);
      if (current.status !== 'NEW') throw conflict();
      if (dto.via === 'EMAIL') {
        if (!current.user?.email) throw conflict();
        const contact = await this.contacts.buildingContact(room.building);
        const lang = current.user.locale === 'en' ? 'en' : 'vi';
        const mail = { to: current.user.email, ...await emailTemplate(tx, 'viewingConfirmed', lang, {
          room: current.room.code, building: current.room.building.name, address: current.room.building.address,
          time: this.timeText(current, lang), contact: [contact?.phone, contact?.zaloUrl, contact?.facebookUrl].filter(Boolean).join('\n'),
        }) };
        await sendWithRetry(this.mailer, mail, `viewing-confirmed/${id}/${sha256Hex(JSON.stringify(mail))}`);
        emailSent = true;
      }
      // NEW and CONFIRMED both hold a place; confirmation never changes occupancy or visitAt.
      return this.change(tx, current, { status: 'CONFIRMED', handledById: actor.id });
    }, TX_OPTIONS);
    return toView(row);
    } catch (error) {
      // A provider send cannot be rolled back if the database commit subsequently fails.
      if (emailSent) this.logger.error(`VIEW-15: email sent but confirmation commit failed for viewing ${id}`);
      throw error;
    }
  }

  async listMine(actor: AuthUser, query: PaginationQuery): Promise<Paginated<OwnViewingView>> {
    await this.account(this.prisma, actor);
    const { page, limit, skip } = pageParams(query);
    const now = new Date();
    const groups: Prisma.ViewingWhereInput[] = [
      { userId: actor.id, status: 'NEW', visitAt: { gt: now } },
      { userId: actor.id, status: 'CONFIRMED', visitAt: { gt: now } },
      { userId: actor.id, OR: [{ status: { not: { in: [...OPEN] } } }, { visitAt: { lte: now } }, { visitAt: null }] },
    ];
    // Keep counts and all groups in one snapshot: a concurrent NEW -> CONFIRMED cannot duplicate a row.
    const { rows, total } = await this.prisma.$transaction(async tx => {
      const counts = await Promise.all(groups.map(where => tx.viewing.count({ where })));
      let remainingSkip = skip;
      const rows: ViewingRecord[] = [];
      for (let i = 0; i < groups.length && rows.length < limit; i++) {
        if (remainingSkip >= counts[i]) { remainingSkip -= counts[i]; continue; }
        rows.push(...await tx.viewing.findMany({ where: groups[i], include: VIEWING_INCLUDE,
          orderBy: i < 2 ? [{ visitAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: remainingSkip, take: limit - rows.length }));
        remainingSkip = 0;
      }
      return { rows, total: counts.reduce((sum, count) => sum + count, 0) };
    }, { ...TX_OPTIONS, isolationLevel: 'RepeatableRead' });
    return paginated(await Promise.all(rows.map(row => this.ownView(row))), page, limit, total);
  }

  async getMine(actor: AuthUser, id: number): Promise<OwnViewingView> {
    await this.account(this.prisma, actor);
    const row = await this.prisma.viewing.findFirst({ where: { id, userId: actor.id }, include: VIEWING_INCLUDE });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return this.ownView(row);
  }

  async cancelMine(actor: AuthUser, id: number): Promise<OwnViewingView> {
    const row = await this.prisma.$transaction(async tx => {
      const current = await this.lockedViewing(tx, id, actor.id);
      await this.account(tx, actor);
      const room = await viewingRoom(tx, current.roomId, false);
      await lockViewingOccupancy(tx, room, current.guestPhone);
      if ((current.status !== 'NEW' && current.status !== 'CONFIRMED') || viewingStart(current).getTime() <= Date.now()) throw conflict();
      return this.change(tx, current, { status: 'CANCELLED', handledById: null });
    }, TX_OPTIONS);
    return this.ownView(row);
  }

  async times(roomId: number, query: ViewingTimesQueryDto, actor?: AuthUser): Promise<ViewingDay[]> {
    const from = viewingFilterDate(query.from, 'from'), to = viewingFilterDate(query.to, 'to');
    if (to < from || to.getTime() > addDays(from, 30).getTime()) viewingFieldError('to', VIEWING_FIELDS.range);
    const account = actor ? await this.account(this.prisma, actor) : undefined;
    const room = await this.prisma.room.findFirst({ where: { id: roomId, ...publicRoomWhere(todayHanoi()) }, include: VIEWING_ROOM_INCLUDE });
    if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);
    const bossId = await viewingBossId(this.prisma);
    const holds = await viewingHolds(this.prisma, hanoiMidnight(from), hanoiMidnight(addDays(to, 1)), bossId);
    const responsible = responsibleId(room, bossId);
    const now = new Date(), horizon = addDays(todayHanoi(now), 30);
    const days: ViewingDay[] = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const hours: string[] = [];
      if (date <= horizon) for (let hour = 8; hour <= 19; hour++) {
        const at = new Date(hanoiMidnight(date).getTime() + hour * 3600_000);
        if (at > now && canBookViewing(holds, { buildingId: room.buildingId, responsibleId: responsible, guestPhone: account?.phone, visitAt: at })) hours.push(at.toISOString());
      }
      days.push({ date: formatDateOnly(date), hours });
    }
    return days;
  }

  private async account(tx: Prisma.TransactionClient, actor: AuthUser) {
    if (actor.role !== 'GUEST' && actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const account = await tx.user.findUnique({ where: { id: actor.id } });
    if (!account?.isActive || (account.role !== 'GUEST' && account.role !== 'TENANT')) throw new ForbiddenException(ErrorCode.FORBIDDEN);
    return account;
  }

  private async lockedViewing(tx: Prisma.TransactionClient, id: number, userId?: number): Promise<ViewingRecord> {
    await lockViewingMapping(tx);
    await lockViewingKey(tx, `viewing:${id}`);
    await tx.$queryRaw`SELECT id FROM viewings WHERE id = ${id} FOR UPDATE`;
    const row = await tx.viewing.findFirst({ where: { id, userId }, include: VIEWING_INCLUDE });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return row;
  }

  private async change(tx: Prisma.TransactionClient, current: ViewingRecord, data: Prisma.ViewingUncheckedUpdateManyInput): Promise<ViewingRecord> {
    const changed = await tx.viewing.updateMany({ where: { id: current.id, status: current.status, updatedAt: current.updatedAt }, data });
    if (changed.count !== 1) throw conflict();
    return (await tx.viewing.findUnique({ where: { id: current.id }, include: VIEWING_INCLUDE }))!;
  }

  private async ownView(row: ViewingRecord): Promise<OwnViewingView> {
    const manager = row.room.building.manager;
    const [contact, bossContact] = await Promise.all([
      manager?.isActive && manager.contactPhone ? this.contacts.buildingContact(row.room.building) : null,
      this.settings.getDefaultContact(),
    ]);
    return { id: row.id, roomId: row.roomId, roomCode: row.room.code, buildingName: row.room.building.name,
      buildingAddress: row.room.building.address, visitAt: row.visitAt?.toISOString() ?? null,
      visitDate: row.visitDate ? formatDateOnly(row.visitDate) : null, timeSlot: row.timeSlot as TimeSlot | null,
      note: row.note, status: row.status, contact, bossContact, createdAt: row.createdAt.toISOString() };
  }

  private timeText(row: ViewingRecord, locale: 'vi' | 'en'): string {
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
      ...(row.visitAt ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
    }).format(viewingStart(row));
    const legacy = row.timeSlot ? (locale === 'en'
      ? ({ MORNING: 'Morning (08:00–11:00)', AFTERNOON: 'Afternoon (14:00–17:00)', EVENING: 'Evening (18:00–20:00)' }[row.timeSlot] ?? '')
      : TIME_SLOT_LABELS[row.timeSlot as TimeSlot]) : '';
    return `${date}${legacy ? ` ${legacy}` : ''} (Asia/Ho_Chi_Minh)`;
  }

  private async notifyNew(row: ViewingRecord): Promise<void> {
    try {
      const manager = row.room.building.manager;
      const email = manager?.isActive && manager.email ? manager.email
        : (await this.prisma.user.findFirst({ where: { role: 'BOSS' }, select: { email: true } }))?.email;
      if (!email) throw new Error('No responsible email');
      await sendWithRetry(this.mailer, { to: email, ...await emailTemplate(this.prisma, 'viewingNew', 'vi', {
        guestName: row.guestName, guestPhone: row.guestPhone, guestEmail: row.user?.email ?? '',
        room: row.room.code, building: row.room.building.name, address: row.room.building.address,
        time: this.timeText(row, 'vi'), note: row.note ?? '',
      }) }, `viewing-new/${row.id}`);
    } catch { this.logger.warn(`VIEW-19: notification failed for viewing ${row.id}; booking retained`); }
  }

}
