import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Prisma } from '@prisma/client';
import { HANOI_OFFSET_MS, addDays, parseDateOnly } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { Roles } from '../../common/guards/auth.decorators.js';
import { PaginationQuery, pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

class AuditQuery extends PaginationQuery {
  @IsOptional() @IsString() @MaxLength(50) entity?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) entityId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) actorId?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

function invalid(field: string) {
  return new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: 'Khoảng ngày không hợp lệ' } });
}

function boundary(value: string | undefined, field: 'from' | 'to') {
  if (value === undefined) return undefined;
  const day = parseDateOnly(value);
  if (!day) throw invalid(field);
  return new Date(+addDays(day, field === 'to' ? 1 : 0) - HANOI_OFFSET_MS);
}

// Apply on read as well so historical snapshots follow the current visibility rules.
function safeSnapshot(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map(safeSnapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['idnumberlast4', 'cccdlast4', 'mustchangepassword'].includes(normalized)) return true;
    return !/password|passwd|hash|idnumber|identitynumber|nationalid|cccd|cmnd|citizenid|identitycard/.test(normalized);
  }).map(([key, entry]) => [key, safeSnapshot(entry ?? null)]));
}

@Controller('audit-logs')
@Roles('BOSS')
export class AuditController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Query() q: AuditQuery) {
    const gte = boundary(q.from, 'from'), lt = boundary(q.to, 'to');
    if (gte && lt && gte >= lt) throw invalid('to');
    const where: Prisma.AuditLogWhereInput = { entity: q.entity, entityId: q.entityId, actorId: q.actorId,
      ...(gte || lt ? { createdAt: { gte, lt } } : {}) };
    const { page, limit, skip, take } = pageParams(q);
    const total = await this.db.auditLog.count({ where });
    const rows = skip >= total ? [] : await this.db.auditLog.findMany({ where, skip, take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { id: true, fullName: true, role: true } } } });
    return paginated(rows.map(row => ({ ...row, id: row.id.toString(),
      before: safeSnapshot(row.before), after: safeSnapshot(row.after) })), page, limit, total);
  }
}
