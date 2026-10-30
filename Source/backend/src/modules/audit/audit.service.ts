import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // AUD-01. Pass `db` (a transaction client) to write in the same transaction as the change.
  // Never put a password or hash in before/after. actorId null = system (AUD-03).
  async log(
    actorId: number | null,
    action: string,
    entity: string,
    entityId: number,
    before?: Prisma.InputJsonValue,
    after?: Prisma.InputJsonValue,
    ip?: string | null,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        ip: ip ?? null,
        // Omitted when undefined: a JSON column cannot be set to a plain null.
        ...(before !== undefined ? { before } : {}),
        ...(after !== undefined ? { after } : {}),
      },
    });
  }
}
