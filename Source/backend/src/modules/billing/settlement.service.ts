import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MeterKind, MeterReading, PaymentMethod, Prisma } from '@prisma/client';
import { contractPeriods } from '../../common/date/period.js';
import { addDays, compareDates, formatDateOnly, formatDateVn, parseDateOnly, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { consumption } from '../../common/money/consumption.js';
import { formatMoney } from '../../common/money/format.js';
import { settlementAmounts, settlementPeriod, type SettlementAmounts } from '../../common/money/settlement-calc.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ratesAt } from '../../common/rates/rates-at.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { depositInvoiceView } from '../contracts/deposit-invoice.js';
import { MailerService, type Mail } from '../mailer/mailer.service.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { notifyBuildingStaff } from '../notifications/notify.js';
import { hashRequest, runIdempotent } from '../pricing/pricing-idempotency.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';
import type { RefundPaidDto, SettlementDto } from './dto/settlement.dto.js';

type Tx = Prisma.TransactionClient;
const MERGED = 'Gộp vào thanh lý'; // BIL-14, exact wording
const SCOPE = { building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } } } as const;
const invalid = (field: string, message: string) => new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: message } });
const conflict = (field: string, message: string) => new ConflictException({ code: ErrorCode.CONFLICT_STATE, fields: { [field]: message } });
const METHOD_VI: Record<PaymentMethod, string> = { CASH: 'tiền mặt', BANK_TRANSFER: 'chuyển khoản', CARD: 'thẻ', OTHER: 'cách khác' };

interface Quote {
  contract: { id: number; code: string; roomId: number; buildingId: number; tenantId: number; endDate: Date; tenant: { email: string | null; emailVerifiedAt: Date | null }; room: { code: string } };
  moveOutDate: Date;
  amounts: SettlementAmounts;
  mergedDrafts: number[];
  settledInvoices: number[];
  utilities: Record<'electric' | 'water', { opening: { id: number; value: number; readOn: string }; closing: number; consumption: number }>;
}

// BIL-13..20 (Q-P4-36..50). Dry-run and the real write share one path, so they always return the same numbers.
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mailer: MailerService) {}

  async settle(actor: AuthUser, contractId: number, dto: SettlementDto, dryRun: boolean, ip?: string, idempotencyKey?: string) {
    const moveOutDate = parseDateOnly(dto.moveOutDate);
    if (!moveOutDate) throw invalid('moveOutDate', 'Ngày dọn đi không hợp lệ');
    let mail: Mail | null = null;
    let finalId = 0;
    const result = await this.prisma.$transaction(async tx => {
      const roomId = await this.assertScope(tx, actor, contractId);
      // Same lock order as move-in and cancel: room, then contract (no deadlock).
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${roomId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId} FOR UPDATE`;
      if (dryRun) return this.view(await this.quote(tx, contractId, moveOutDate, dto), true, null, null);
      const requestHash = hashRequest({ contractId, moveOutDate: dto.moveOutDate, finalReadings: dto.finalReadings,
        damages: dto.damages ?? 0, depositForfeit: dto.depositForfeit ?? 0, note: dto.note ?? null });
      return runIdempotent(tx, { actorId: actor.id, route: 'POST /contracts/:id/settlement', key: idempotencyKey, statusCode: 201 }, requestHash, async () => {
        const q = await this.quote(tx, contractId, moveOutDate, dto);
        const written = await this.write(tx, actor, q, dto, ip);
        mail = written.mail;
        finalId = written.finalInvoice?.id ?? 0;
        return this.view(q, false, written.settlementId, written.finalInvoice);
      });
    });
    if (mail) {
      try { await sendWithRetry(this.mailer, mail, `settlement-${contractId}`); }
      catch { this.logger.warn(`Settlement of contract ${contractId} (FINAL TT${finalId}): email failed after retry`); }
    }
    return result;
  }

  // SCOPE-02: token scope, then the building's current assignment (under the mapping lock).
  private async assertScope(tx: Tx, actor: AuthUser, contractId: number) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    await lockViewingMapping(tx);
    const scoped = await tx.contract.findUnique({ where: { id: contractId, ...scopeWhere(actor) }, select: { roomId: true, ...SCOPE } });
    if (!scoped) {
      if (await tx.contract.findUnique({ where: { id: contractId }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    assertViewingScope(actor, scoped);
    return scoped.roomId;
  }

  private async quote(tx: Tx, contractId: number, moveOutDate: Date, dto: SettlementDto): Promise<Quote> {
    const today = todayHanoi();
    const c = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, include: {
      building: { select: { waterMode: true } }, room: { select: { code: true } }, settlement: { select: { id: true } },
      tenant: { select: { email: true, emailVerifiedAt: true } }, occupants: true,
      services: { include: { service: true } }, vehicles: { include: { service: true } } } });
    // BIL-13, Q-P4-42: only ACTIVE (HOLD goes through CON-12); a settlement exists only once.
    if (c.status !== 'ACTIVE' || c.settlement) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    // Q-P4-10: from the contract start to today, both included.
    if (compareDates(moveOutDate, c.startDate) < 0 || compareDates(moveOutDate, today) > 0) {
      throw invalid('moveOutDate', 'Ngày dọn đi phải từ ngày bắt đầu hợp đồng đến hôm nay');
    }
    const periods = contractPeriods(c.startDate, c.termMonths);
    const j = settlementPeriod(periods, c.endDate, moveOutDate)!;

    // BIL-17, Q-P4-40/41: the renewal chain carries the deposit and its unpaid invoices.
    const chain = [c.id];
    for (let prev = c.previousContractId; prev !== null && !chain.includes(prev);) {
      chain.push(prev);
      prev = (await tx.contract.findUniqueOrThrow({ where: { id: prev }, select: { previousContractId: true } })).previousContractId;
    }
    await tx.$queryRaw`SELECT id FROM invoices WHERE contract_id = ANY(${chain}::int[]) ORDER BY id FOR UPDATE`;
    const invoices = await tx.invoice.findMany({ where: { contractId: { in: chain }, status: { not: 'CANCELLED' } },
      select: { id: true, contractId: true, type: true, status: true, periodNo: true, total: true, payment: { select: { amount: true } } } });
    const monthly = new Map(invoices.filter(i => i.contractId === c.id && i.type === 'MONTHLY').map(i => [i.periodNo, i]));
    // A-10: every period ≤ j whose billing date has come needs an invoice first (BIL-21 creates it).
    if (periods.some(p => p.periodNo <= j.periodNo && compareDates(addDays(p.periodEnd, 1), today) <= 0 && !monthly.has(p.periodNo))) {
      throw conflict('moveOutDate', 'Còn kỳ chưa có hóa đơn, hãy tạo hóa đơn kỳ đó trước');
    }
    // Q-P4-50: an invoice of a period after j would be charged twice (remaining rent).
    if ([...monthly.keys()].some(no => no > j.periodNo)) {
      throw conflict('moveOutDate', 'Còn hóa đơn của kỳ sau ngày dọn đi, hãy hủy hoặc lập lại hóa đơn đó trước');
    }
    const drafts = [...monthly.values()].filter(i => i.status === 'DRAFT');
    const unbilledPeriodNos = periods.filter(p => p.periodNo <= j.periodNo && (monthly.get(p.periodNo)?.status ?? 'DRAFT') === 'DRAFT').map(p => p.periodNo);
    const deposit = invoices.filter(i => i.type === 'DEPOSIT' && i.status === 'PAID').reduce((s, i) => s + (i.payment?.amount ?? 0), 0);
    const debts = invoices.filter(i => i.type !== 'DEPOSIT' && i.status === 'UNPAID').sort((a, b) => a.id - b.id);
    const damages = dto.damages ?? 0;
    const depositForfeit = dto.depositForfeit ?? 0;
    // Q-P4-45: the kept deposit is capped by the deposit received (CON-12 wording); BIL-20 needs a note.
    if (depositForfeit > deposit) throw invalid('depositForfeit', 'Tiền cọc giữ lại không được vượt số tiền cọc đã nhận');
    if ((damages > 0 || depositForfeit > 0) && !dto.note?.trim()) throw invalid('note', 'Hãy ghi chú lý do hư hỏng hoặc giữ cọc');

    // BIL-14: utilities from the last issued closing reading (or the move-in reading) to the final reading.
    const issued = [...monthly.values()].filter(i => i.status !== 'DRAFT').sort((a, b) => b.periodNo - a.periodNo)[0];
    const readings = await tx.meterReading.findMany({ where: { contractId: c.id }, orderBy: [{ readOn: 'asc' }, { id: 'asc' }] });
    const span = (kind: MeterKind, value: number) => {
      const opening = issued ? readings.find(r => r.kind === kind && r.invoiceId === issued.id) : readings.find(r => r.kind === kind && r.isOpening);
      if (!opening) throw conflict('finalReadings', 'Chưa có chỉ số mốc để tính điện nước');
      const after: MeterReading[] = readings.filter(r => r.kind === kind && r.id !== opening.id && !r.isOpening && r.readOn >= opening.readOn);
      const latest = after.at(-1) ?? opening;
      if (compareDates(latest.readOn, moveOutDate) >= 0 && latest.id !== opening.id) throw conflict('finalReadings', 'Đã có chỉ số từ ngày dọn đi trở về sau');
      if (value < latest.value) throw new BadRequestException(ErrorCode.METER_VALUE_DECREASED); // Q-P4-44
      const used = consumption([opening, ...after, { value, isMeterReplaced: false, oldMeterFinal: null }]);
      return { opening: { id: opening.id, value: opening.value, readOn: formatDateOnly(opening.readOn) }, closing: value, consumption: used };
    };
    const utilities = { electric: span('ELECTRIC', dto.finalReadings.electric), water: span('WATER', dto.finalReadings.water) };

    const services = new Map([...c.services, ...c.vehicles].map(v => [v.serviceId, v.service]));
    const amounts = settlementAmounts({
      periods, endDate: c.endDate, moveOutDate, rent: c.rent, deposit, unbilledPeriodNos, waterMode: c.building.waterMode,
      rates: await ratesAt(tx, c.buildingId, j.periodStart), services: [...services.values()],
      occupants: c.occupants, vehicles: c.vehicles, electricKwh: utilities.electric.consumption, waterM3: utilities.water.consumption,
      previousDebt: debts.map(d => ({ invoiceId: d.id, total: d.total })), damages, depositForfeit,
    });
    return { contract: { id: c.id, code: c.code, roomId: c.roomId, buildingId: c.buildingId, tenantId: c.tenantId, endDate: c.endDate, tenant: c.tenant, room: c.room },
      moveOutDate, amounts, mergedDrafts: drafts.map(d => d.id), settledInvoices: debts.map(d => d.id), utilities };
  }

  // BIL-19: one transaction; every business check already passed in quote().
  private async write(tx: Tx, actor: AuthUser, q: Quote, dto: SettlementDto, ip?: string) {
    const { contract: c, amounts: a } = q;
    const today = todayHanoi();
    const readingIds: number[] = [];
    for (const [kind, value, photoUrl] of [['ELECTRIC', dto.finalReadings.electric, dto.finalReadings.electricPhotoUrl], ['WATER', dto.finalReadings.water, dto.finalReadings.waterPhotoUrl]] as const) {
      // Q-P4-43: read on the move-out date, not linked to an invoice; a same-day reading → CONFLICT_STATE (DB_ERROR_MAP).
      const r = await tx.meterReading.create({ data: { roomId: c.roomId, contractId: c.id, kind, value, readOn: q.moveOutDate,
        photoUrl: photoUrl ?? null, readById: actor.id, note: 'Chỉ số trả phòng' }, select: { id: true } });
      readingIds.push(r.id);
    }
    // BIL-18, Q-P4-12: net < 0 → FINAL invoice, UNPAID, due today + 7.
    const finalInvoice = a.net < 0 ? await tx.invoice.create({ data: { contractId: c.id, type: 'FINAL', periodNo: 0, status: 'UNPAID',
      issueDate: today, dueDate: addDays(today, 7), total: -a.net, createdById: actor.id,
      lines: { create: a.lines.map((l, i) => ({ kind: l.kind, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, sortOrder: i,
        meta: { ...l.meta, ...(l.kind === 'ELECTRIC' ? q.utilities.electric : l.kind === 'WATER' && !l.meta?.periodNo ? q.utilities.water : {}) } as Prisma.InputJsonObject })) } },
      select: { id: true, total: true, dueDate: true, status: true, issueDate: true } }) : null;
    const settlement = await tx.settlement.create({ data: { contractId: c.id, moveOutDate: q.moveOutDate, deposit: a.deposit,
      lastPeriodAmount: a.lastPeriodAmount, remainingRent: a.remainingRent, previousDebt: a.previousDebt, damages: a.damages,
      depositForfeit: a.depositForfeit, net: a.net, finalInvoiceId: finalInvoice?.id ?? null, note: dto.note?.trim() || null, settledById: actor.id },
    select: { id: true } });
    const changed = async (n: Promise<{ count: number }>, expected: number) => { if ((await n).count !== expected) throw new ConflictException(ErrorCode.CONFLICT_STATE); };
    await changed(tx.invoice.updateMany({ where: { id: { in: q.mergedDrafts }, status: 'DRAFT' }, data: { status: 'CANCELLED', cancelReason: MERGED } }), q.mergedDrafts.length);
    await changed(tx.invoice.updateMany({ where: { id: { in: q.settledInvoices }, status: 'UNPAID' }, data: { status: 'SETTLED', settlementId: settlement.id } }), q.settledInvoices.length);
    await changed(tx.contract.updateMany({ where: { id: c.id, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } }), 1);
    // Q-P4-47: only rows still open; never before the row's own start (CHECK occupants_dates). The room turns "Trống" by derivation.
    const later = (x: Date, y: Date) => (compareDates(x, y) >= 0 ? x : y);
    for (const o of await tx.occupant.findMany({ where: { contractId: c.id, moveOutDate: null }, select: { id: true, moveInDate: true } })) {
      await tx.occupant.update({ where: { id: o.id }, data: { moveOutDate: later(q.moveOutDate, o.moveInDate) } });
    }
    for (const v of await tx.vehicle.findMany({ where: { contractId: c.id, isActive: true }, select: { id: true, registeredAt: true } })) {
      await tx.vehicle.update({ where: { id: v.id }, data: { isActive: false, removedAt: later(q.moveOutDate, v.registeredAt) } });
    }
    // Q-P4-48: the tenant account stays active (D-26, A-16).
    await this.audit.log(actor.id, 'contract.settle', 'contract', c.id, { status: 'ACTIVE' }, {
      status: 'ENDED', settlementId: settlement.id, moveOutDate: formatDateOnly(q.moveOutDate), net: a.net, deposit: a.deposit,
      lastPeriodAmount: a.lastPeriodAmount, remainingRent: a.remainingRent, previousDebt: a.previousDebt, damages: a.damages,
      depositForfeit: a.depositForfeit, finalInvoiceId: finalInvoice?.id ?? null, mergedDrafts: q.mergedDrafts, settledInvoices: q.settledInvoices, readingIds,
    }, ip, tx);
    const mail = await this.notice(tx, q, finalInvoice);
    return { settlementId: settlement.id, finalInvoice, mail };
  }

  // Q-P4-46: tenant row + mail (verified address, NOTI-04) and the building staff row (NOTI-11).
  private async notice(tx: Tx, q: Quote, finalInvoice: { id: number; total: number; dueDate: Date | null; status: string; issueDate: Date | null } | null): Promise<Mail | null> {
    const { contract: c, amounts: a } = q;
    let tenant: { kind: 'INVOICE_ISSUED' | 'ANNOUNCEMENT'; title: string; body: string; link: string };
    let extra = '';
    if (finalInvoice) {
      const due = formatDateVn(finalInvoice.dueDate!);
      tenant = { kind: 'INVOICE_ISSUED', title: `Hóa đơn quyết toán TT${finalInvoice.id} đã phát hành`,
        body: `Số tiền ${formatMoney(finalInvoice.total)}. Hạn thanh toán ${due}.`, link: `/thue/hoa-don/${finalInvoice.id}` };
      const bank = await tx.setting.findUnique({ where: { key: 'bank_account' }, select: { value: true } });
      extra = `\nVietQR: ${depositInvoiceView({ ...finalInvoice, status: 'UNPAID' }, bank?.value).qrImageUrl}`;
    } else {
      tenant = { kind: 'ANNOUNCEMENT', title: `Đã quyết toán hợp đồng ${c.code}`, body: `Hoàn lại ${formatMoney(a.net)}.`, link: `/thue/hop-dong/${c.id}` };
    }
    await tx.notification.create({ data: { userId: c.tenantId, ...tenant } });
    await notifyBuildingStaff(tx, c.buildingId, { kind: tenant.kind, title: `${tenant.title} · phòng ${c.room.code}`, body: tenant.body, link: `/ql/hop-dong/${c.id}` });
    const to = c.tenant.email && c.tenant.emailVerifiedAt ? c.tenant.email : null;
    return to ? { to, subject: tenant.title, text: `${tenant.body}${extra}` } : null;
  }

  private view(q: Quote, dryRun: boolean, settlementId: number | null, finalInvoice: { id: number; total: number; dueDate: Date | null } | null) {
    const a = q.amounts;
    return {
      dryRun, contract: { id: q.contract.id, code: q.contract.code, endDate: formatDateOnly(q.contract.endDate) },
      moveOutDate: formatDateOnly(q.moveOutDate), periodNo: a.periodNo, lastPeriodAmount: a.lastPeriodAmount, remainingRent: a.remainingRent,
      previousDebt: a.previousDebt, deposit: a.deposit, damages: a.damages, depositForfeit: a.depositForfeit, net: a.net, refund: Math.max(a.net, 0),
      lines: a.lines.map(({ kind, label, quantity, unitPrice, amount }) => ({ kind, label, quantity, unitPrice, amount })),
      mergedDrafts: q.mergedDrafts, settledInvoices: q.settledInvoices, utilities: q.utilities, settlementId,
      finalInvoice: finalInvoice && { id: finalInvoice.id, code: `TT${finalInvoice.id}`, total: finalInvoice.total, dueDate: formatDateOnly(finalInvoice.dueDate!) },
    };
  }

  // Q-P3-3, Q-P4-8, Q-P4-49: once, no undo, only when money is owed back (net > 0).
  async refundPaid(actor: AuthUser, id: number, dto: RefundPaidDto, ip?: string, idempotencyKey?: string) {
    const paidAt = dto.paidAt === undefined ? new Date() : new Date(dto.paidAt);
    if (!Number.isFinite(paidAt.getTime())) throw invalid('paidAt', 'Thời điểm trả lại phải có múi giờ hợp lệ');
    return this.prisma.$transaction(async tx => {
      if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
      await lockViewingMapping(tx);
      const scoped = await tx.settlement.findFirst({ where: { id, contract: scopeWhere(actor) }, select: { contract: { select: SCOPE } } });
      if (!scoped) {
        if (await tx.settlement.findUnique({ where: { id }, select: { id: true } })) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
        throw new NotFoundException(ErrorCode.NOT_FOUND);
      }
      assertViewingScope(actor, scoped.contract);
      return runIdempotent(tx, { actorId: actor.id, route: 'POST /settlements/:id/refund-paid', key: idempotencyKey, statusCode: 201 },
        hashRequest({ id, method: dto.method, paidAt: dto.paidAt ?? null, note: dto.note ?? null }), async () => {
          await tx.$queryRaw`SELECT id FROM settlements WHERE id = ${id} FOR UPDATE`;
          const s = await tx.settlement.findUniqueOrThrow({ where: { id }, select: { net: true, refundPaidAt: true, note: true } });
          if (s.net <= 0 || s.refundPaidAt) throw new ConflictException(ErrorCode.CONFLICT_STATE);
          const line = `Đã trả lại ${formatMoney(s.net)} bằng ${METHOD_VI[dto.method]} ngày ${formatDateVn(todayHanoi(paidAt))}${dto.note?.trim() ? `: ${dto.note.trim()}` : ''}`;
          const updated = await tx.settlement.updateMany({ where: { id, refundPaidAt: null }, data: { refundPaidAt: paidAt, note: s.note ? `${s.note}\n${line}` : line } });
          if (updated.count !== 1) throw new ConflictException(ErrorCode.CONFLICT_STATE);
          await this.audit.log(actor.id, 'settlement.refund_paid', 'settlement', id, { refundPaidAt: null },
            { refundPaidAt: paidAt.toISOString(), method: dto.method, note: dto.note?.trim() || null, net: s.net }, ip, tx);
          return { settlementId: id, net: s.net, refundPaidAt: paidAt.toISOString(), method: dto.method };
        });
    });
  }
}
