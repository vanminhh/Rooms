import { addDays, compareDates, toDateOnly } from './today.js';

export interface ContractPeriod {
  periodNo: number;
  periodStart: Date;
  periodEnd: Date;
  billingDate: Date;
  isPartial: boolean;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function contractEndDate(startDate: Date, termMonths: number): Date {
  if (!Number.isInteger(termMonths) || termMonths < 1) throw new RangeError('termMonths must be positive');
  const start = toDateOnly(startDate);
  const targetMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + termMonths, 1));
  const day = Math.min(start.getUTCDate(), daysInMonth(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth()));
  return addDays(new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), day)), -1);
}

export function contractPeriods(startDate: Date, termMonths: number): ContractPeriod[] {
  const endDate = contractEndDate(startDate, termMonths);
  const periods: ContractPeriod[] = [];
  let periodStart = toDateOnly(startDate);
  while (compareDates(periodStart, endDate) <= 0) {
    const nextMonth = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1));
    const monthEnd = addDays(nextMonth, -1);
    const periodEnd = compareDates(endDate, monthEnd) < 0 ? endDate : monthEnd;
    periods.push({
      periodNo: periods.length + 1,
      periodStart,
      periodEnd,
      billingDate: addDays(periodEnd, 1),
      isPartial: periodStart.getUTCDate() !== 1 || compareDates(periodEnd, monthEnd) !== 0,
    });
    periodStart = addDays(periodEnd, 1);
  }
  return periods;
}

// A-21: one half-up rounding per fixed line, using integer arithmetic throughout.
export function proratedAmount(amount: number, periodStart: Date, periodEnd: Date): number {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('amount must be a nonnegative integer');
  const start = toDateOnly(periodStart);
  const end = toDateOnly(periodEnd);
  if (compareDates(start, end) > 0 || start.getUTCFullYear() !== end.getUTCFullYear() || start.getUTCMonth() !== end.getUTCMonth()) {
    throw new RangeError('period must be within one calendar month');
  }
  const monthDays = BigInt(daysInMonth(start.getUTCFullYear(), start.getUTCMonth()));
  const days = BigInt((end.getTime() - start.getTime()) / 86_400_000 + 1);
  const rounded = (BigInt(amount) * days + monthDays / 2n) / monthDays;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError('prorated amount exceeds safe integer');
  return result;
}

export function dueDateOfBillingMonth(billingMonth: Date): Date {
  const month = toDateOnly(billingMonth);
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 9));
}
