import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { AnnouncementsQueryDto, CreateAnnouncementDto } from './dto/announcements.dto.js';

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, fullName: true } },
  building: { select: { id: true, name: true } },
  room: { select: { id: true, code: true } },
} satisfies Prisma.AnnouncementSelect;

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateAnnouncementDto) {
    const { buildingId, title, body } = dto;
    const roomId = dto.roomId ?? null;
    this.assertStaffScope(user, buildingId ?? undefined);
    if (buildingId === null && user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    if (roomId !== null && buildingId === null) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        fields: { roomId: 'Chọn tòa trước khi chọn phòng' },
      });
    }

    return this.prisma.$transaction(async tx => {
      if (buildingId !== null) {
        if (user.role === 'MANAGER') await lockViewingMapping(tx);
        const building = await tx.building.findUnique({
          where: { id: buildingId },
          select: { managerId: true, isActive: true, manager: { select: { isActive: true } } },
        });
        if (!building) {
          if (user.role === 'MANAGER') throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
          throw new NotFoundException(ErrorCode.NOT_FOUND);
        }
        assertViewingScope(user, { building });

        if (roomId !== null && !await tx.room.findUnique({
          where: { id_buildingId: { id: roomId, buildingId } }, select: { id: true },
        })) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_FAILED,
            fields: { roomId: 'Phòng không thuộc tòa đã chọn' },
          });
        }
      }

      const announcement = await tx.announcement.create({
        data: { buildingId, roomId, title, body, authorId: user.id },
        select: ANNOUNCEMENT_SELECT,
      });
      // NOTI-03: group in the DB so a tenant with several qualifying contracts receives one row.
      const recipients = await tx.contract.groupBy({
        by: ['tenantId'],
        where: {
          status: 'ACTIVE',
          tenant: { role: 'TENANT' },
          ...(buildingId === null ? {} : { buildingId }),
          ...(roomId === null ? {} : { roomId }),
        },
      });
      if (recipients.length === 0) return { ...announcement, readCount: 0, recipientCount: 0 };

      const { count } = await tx.notification.createMany({
        data: recipients.map(({ tenantId }) => ({
          userId: tenantId,
          kind: 'ANNOUNCEMENT',
          title,
          body,
          link: '/thue/thong-bao',
          announcementId: announcement.id,
        })),
      });
      return { ...announcement, readCount: 0, recipientCount: count };
    });
  }

  async list(user: AuthUser, query: AnnouncementsQueryDto) {
    const { buildingId } = query;
    this.assertStaffScope(user, buildingId);
    const { page, limit, skip, take } = pageParams(query);
    const direction = query.sort === 'createdAt' ? 'asc' : 'desc';

    return this.prisma.$transaction(async tx => {
      const where: Prisma.AnnouncementWhereInput = buildingId === undefined ? scopeWhere(user) : { buildingId };
      if (user.role === 'MANAGER') {
        // Keep the guard's scope and recheck current assignment, including when a building was filtered explicitly.
        const assigned = { managerId: user.id, isActive: true, manager: { isActive: true } };
        where.building = assigned;
        if (buildingId !== undefined && !await tx.building.findFirst({
          where: { id: buildingId, ...assigned }, select: { id: true },
        })) {
          throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        }
      }

      const total = await tx.announcement.count({ where });
      if (skip >= total) return paginated([], page, limit, total);

      const rows = await tx.announcement.findMany({
        where, select: ANNOUNCEMENT_SELECT, orderBy: [{ createdAt: direction }, { id: direction }], skip, take,
      });
      const counts = await tx.notification.groupBy({
        by: ['announcementId'],
        where: { announcementId: { in: rows.map(row => row.id) } },
        _count: { readAt: true, _all: true },
      });
      const byId = new Map(counts.map(row => [row.announcementId, row._count]));
      return paginated(rows.map(row => {
        const count = byId.get(row.id);
        return { ...row, readCount: count?.readAt ?? 0, recipientCount: count?._all ?? 0 };
      }), page, limit, total);
    }, { isolationLevel: 'RepeatableRead' });
  }

  private assertStaffScope(user: AuthUser, buildingId: number | undefined): void {
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    if (buildingId !== undefined && user.role === 'MANAGER' && !user.buildingIds?.includes(buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
  }
}
