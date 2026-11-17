import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { lockViewingKey } from '../../common/viewings/viewing-lock.js';
import { canBookViewing, type ViewingHold } from './viewing-capacity.js';
import { VIEWING_FIELDS } from './viewing-validation.js';

export const VIEWING_ROOM_INCLUDE = {
  building: { include: { manager: true } },
} satisfies Prisma.RoomInclude;
export type ReservationRoom = Prisma.RoomGetPayload<{ include: typeof VIEWING_ROOM_INCLUDE }>;

export function assertViewingScope(actor: AuthUser, room: {
  building: { managerId: number | null; isActive: boolean; manager: { isActive: boolean } | null };
}): void {
  if (actor.role === 'BOSS') return;
  if (actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
  if (!room.building.isActive || room.building.managerId !== actor.id || !room.building.manager?.isActive) {
    throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }
}

export async function viewingRoom(tx: Prisma.TransactionClient, id: number, publicOnly: boolean): Promise<ReservationRoom> {
  // Room updates also lock this row; read public eligibility after the lock.
  await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${id} FOR SHARE`;
  const room = await tx.room.findFirst({
    where: { id, ...(publicOnly ? publicRoomWhere(todayHanoi()) : {}) }, include: VIEWING_ROOM_INCLUDE,
  });
  if (!room) {
    if (publicOnly) throw new ConflictException(ErrorCode.ROOM_NOT_AVAILABLE);
    throw new NotFoundException(ErrorCode.NOT_FOUND);
  }
  return room;
}

export function responsibleId(room: ReservationRoom, bossId: number): number {
  return room.building.manager?.isActive ? room.building.manager.id : bossId;
}

export async function viewingBossId(tx: Prisma.TransactionClient): Promise<number> {
  const boss = await tx.user.findFirst({ where: { role: 'BOSS' }, select: { id: true } });
  if (!boss) throw new Error('Boss account is missing');
  return boss.id;
}

export async function viewingHolds(tx: Prisma.TransactionClient, from: Date | undefined, to: Date | undefined, bossId: number): Promise<ViewingHold[]> {
  const rows = await tx.viewing.findMany({
    where: { status: { in: ['NEW', 'CONFIRMED'] }, visitAt: { not: null, gte: from, lte: to } },
    select: { id: true, guestPhone: true, status: true, visitAt: true, room: {
      select: { buildingId: true, building: { select: { district: true, manager: { select: { id: true, isActive: true } } } } },
    } },
  });
  return rows.map(row => ({ id: row.id, guestPhone: row.guestPhone, status: row.status, visitAt: row.visitAt,
    buildingId: row.room.buildingId, district: row.room.building.district,
    responsibleId: row.room.building.manager?.isActive ? row.room.building.manager.id : bossId }));
}

export async function lockViewingOccupancy(tx: Prisma.TransactionClient, room: ReservationRoom, phone: string) {
  const bossId = await viewingBossId(tx);
  const responsible = responsibleId(room, bossId);
  await lockViewingKey(tx, `phone:${phone}`);
  await lockViewingKey(tx, `responsible:${responsible}`);
  await lockViewingKey(tx, `building:${room.buildingId}`);
  return { bossId, responsible };
}

export async function reserveViewingHour(tx: Prisma.TransactionClient, room: ReservationRoom, phone: string, at: Date, excludeId?: number, acceptOverlap = false): Promise<void> {
  const { bossId, responsible } = await lockViewingOccupancy(tx, room, phone);
  const holds = await viewingHolds(tx, at, at, bossId);
  if (!canBookViewing(holds, { buildingId: room.buildingId, responsibleId: responsible, guestPhone: phone, visitAt: at, excludeId })) {
    throw new ConflictException(ErrorCode.VIEWING_TIME_TAKEN);
  }
  const overlaps = holds.filter(row => row.id !== excludeId && row.buildingId !== room.buildingId && row.guestPhone === phone);
  if (overlaps.length && acceptOverlap !== true) {
    const district = room.building.district.trim().toLowerCase();
    const differentDistrict = overlaps.some(row => row.district.trim().toLowerCase() !== district);
    throw new ConflictException({ code: ErrorCode.VIEWING_OVERLAP_WARNING, fields: { visitAt: differentDistrict ? VIEWING_FIELDS.overlapDistrict : VIEWING_FIELDS.overlap } });
  }
}
