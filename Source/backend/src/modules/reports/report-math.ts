import type { InvoiceStatus, InvoiceType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { HANOI_OFFSET_MS, todayHanoi } from '../../common/date/today.js';

export function reportRange(from?: string, to?: string, now = new Date()) {
  const invalid = (field: string) => new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { [field]: 'YYYY-MM (1–24 months)' } });
  function index(value: string, field: string) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) throw invalid(field);
    return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
  }
  const end = index(to ?? todayHanoi(now).toISOString().slice(0, 7), 'to');
  const start = from ? index(from, 'from') : end - 11;
  if (start > end || end - start >= 24) throw invalid('from');
  const date = (i: number) => new Date(Date.UTC(Math.floor(i / 12), i % 12, 1));
  const months = Array.from({ length: end - start + 1 }, (_, i) => date(start + i).toISOString().slice(0, 7));
  return { months, gte: new Date(+date(start) - HANOI_OFFSET_MS), lt: new Date(+date(end + 1) - HANOI_OFFSET_MS) };
}

export function collected(type: InvoiceType, amount: number) {
  return type === 'DEPOSIT' ? 0 : amount;
}

export function depositUsed(deposit: number, net: number) {
  return deposit - Math.max(net, 0);
}

export function debt(type: InvoiceType, status: InvoiceStatus, total: number, dueDate: Date | null, today: Date) {
  const outstanding = type !== 'DEPOSIT' && status === 'UNPAID' ? total : 0;
  return { outstanding, overdue: dueDate && dueDate < today ? outstanding : 0 };
}

export function monthResult(revenue: number, costs: number) {
  return { revenue, costs, profit: revenue - costs };
}
