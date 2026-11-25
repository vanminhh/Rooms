import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, Paginated, paginated, type PaginationQuery } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { depositInvoiceView } from '../contracts/deposit-invoice.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { InvoicesQueryDto } from './dto/invoices-query.dto.js';

const SUMMARY = {
  id: true, type: true, status: true, periodNo: true, periodStart: true, periodEnd: true,
  issueDate: true, dueDate: true, total: true, createdAt: true,
  contract: { select: { id: true, code: true, status: true, room: { select: { id: true, code: true } },
    building: { select: { id: true, code: true, name: true } }, tenant: { select: { id: true, fullName: true, phone: true } } } },
} satisfies Prisma.InvoiceSelect;
const DETAIL = {
  ...SUMMARY, cancelReason: true, replacesId: true, replacedBy: { select: { id: true } },
  lines: { select: { kind: true, label: true, quantity: true, unitPrice: true, amount: true, meta: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  meterReadings: { select: { id: true, kind: true, value: true, readOn: true, isMeterReplaced: true, oldMeterFinal: true, photoUrl: true }, orderBy: { kind: 'asc' } },
  payment: { select: { amount: true, method: true, source: true, paidAt: true } },
} satisfies Prisma.InvoiceSelect;
type Summary = Prisma.InvoiceGetPayload<{ select: typeof SUMMARY }>;
type Detail = Prisma.InvoiceGetPayload<{ select: typeof DETAIL }>;
const SCOPE_CHECK = { contract: { select: { building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } } } } } as const;

const date = (d: Date | null) => (d ? formatDateOnly(d) : null);
// "Quá hạn" is derived, never stored (BIL-08, D-40): UNPAID after its due date, Hà Nội today.
const overdueWhere = (today: Date): Prisma.InvoiceWhereInput => ({ status: 'UNPAID', dueDate: { lt: today } });

function summary(row: Summary, today: Date) {
  const { createdAt: _createdAt, ...rest } = row;
  return { ...rest, code: `TT${row.id}`, periodStart: date(row.periodStart), periodEnd: date(row.periodEnd),
    issueDate: date(row.issueDate), dueDate: date(row.dueDate), overdue: row.status === 'UNPAID' && !!row.dueDate && row.dueDate < today };
}

@Injectable()
export class InvoiceQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser, query: InvoicesQueryDto) {
    const { buildingId } = query;
    if (buildingId !== undefined && actor.buildingIds !== null && !actor.buildingIds.includes(buildingId)) {
      throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
    }
    const today = todayHanoi();
    const [y, m] = query.period?.split('-').map(Number) ?? [];
    const where: Prisma.InvoiceWhereInput = {
      // The exact-amount lookup also serves bank reconciliation (Q-P4-59).
      ...(actor.role === 'BOSS' && query.total === undefined ? { archivedAt: null } : {}),
      contract: { ...scopeWhere(actor), ...(buildingId === undefined ? {} : { buildingId }) },
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.total ? { total: query.total } : {}),
      ...(query.period ? { periodStart: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } } : {}),
    };
    const filtered: Prisma.InvoiceWhereInput = query.overdue === undefined ? where
      : { AND: [where, query.overdue ? overdueWhere(today) : { NOT: overdueWhere(today) }] };
    return this.page(filtered, query, today);
  }

  // SCOPE-03 / API-07: a tenant sees own invoices across all own contracts; DRAFT stays hidden.
  async listMine(actor: AuthUser, query: PaginationQuery) {
    if (actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const result = await this.page({ contract: { tenantId: actor.id }, status: { not: 'DRAFT' } }, query, todayHanoi());
    return new Paginated(result.data.map(({ contract: { tenant: _tenant, ...contract }, ...rest }) => ({ ...rest, contract })), result.meta);
  }

  // SCOPE-02: token scope first, then the building's current assignment, like POST /invoices/:id/payment.
  async get(actor: AuthUser, id: number) {
    const scoped = await this.prisma.invoice.findUnique({ where: { id, contract: scopeWhere(actor) }, select: SCOPE_CHECK });
    if (!scoped) {
      if (await this.prisma.invoice.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    assertViewingScope(actor, scoped.contract);
    return this.detail(await this.prisma.invoice.findUniqueOrThrow({ where: { id }, select: DETAIL }));
  }

  async getMine(actor: AuthUser, id: number) {
    if (actor.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const row = await this.prisma.invoice.findFirst({ where: { id, contract: { tenantId: actor.id }, status: { not: 'DRAFT' } }, select: DETAIL });
    if (!row) throw new NotFoundException(ErrorCode.NOT_FOUND);
    const { contract: { tenant: _tenant, ...contract }, ...detail } = await this.detail(row);
    return { ...detail, contract };
  }

  private async page(where: Prisma.InvoiceWhereInput, query: PaginationQuery, today: Date) {
    const { page, limit, skip, take } = pageParams(query);
    const total = await this.prisma.invoice.count({ where });
    const rows = skip >= total ? [] : await this.prisma.invoice.findMany({ where, select: SUMMARY, skip, take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return paginated(rows.map(r => summary(r, today)), page, limit, total);
  }

  // BIL-10: VietQR only while UNPAID.
  private async detail(row: Detail) {
    const bank = row.status === 'UNPAID' ? await this.prisma.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } }) : null;
    const { vietqr, qrImageUrl } = depositInvoiceView(row, bank?.value);
    const { replacedBy, payment, meterReadings, lines, cancelReason, replacesId, ...rest } = row;
    return {
      ...summary(rest, todayHanoi()), cancelReason, replacesId, replacedById: replacedBy?.id ?? null,
      lines, meterReadings: meterReadings.map(r => ({ ...r, readOn: formatDateOnly(r.readOn) })),
      payment: payment && { ...payment, paidAt: payment.paidAt.toISOString() }, vietqr, qrImageUrl,
    };
  }
}
