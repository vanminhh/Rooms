import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { pageParams, Paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { MyNotificationsQueryDto } from './dto/my-notifications.dto.js';

const SELECT = { id: true, kind: true, title: true, body: true, link: true, readAt: true, createdAt: true } as const;

// NOTI-11 (staff) and NOTI-01 (tenants, page in Phase 5): only the caller's own rows (SCOPE-03). Read rows stay listed.
// In-app only: nothing here touches mail, and mail never marks a row read (Q-P4-18).
@Injectable()
export class MyNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: MyNotificationsQueryDto) {
    const { page, limit, skip, take } = pageParams(query);
    const where = { userId: user.id, ...(query.unread ? { readAt: null } : {}) };
    const [items, total, unreadCount] = await this.prisma.$transaction(tx => Promise.all([
      tx.notification.findMany({ where, select: SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
      tx.notification.count({ where }),
      tx.notification.count({ where: { userId: user.id, readAt: null } }),
    ]), { isolationLevel: 'RepeatableRead' });
    return new Paginated(items, { page, limit, total, unreadCount });
  }

  // Reading twice is harmless: the first readAt is kept. Someone else's row looks missing (SCOPE-03).
  async read(user: AuthUser, id: number) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
    const row = await this.prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true, readAt: true } });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    return row;
  }

  async readAll(user: AuthUser) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  }
}
