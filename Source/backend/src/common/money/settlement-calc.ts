import { ConflictException } from '@nestjs/common';
import type { LineKind } from '@prisma/client';
import { type ContractPeriod, periodContaining, proratedAmount } from '../date/period.js';
import { compareDates } from '../date/today.js';
import { ErrorCode } from '../errors/error-code.js';
import type { RatesAt } from '../rates/rates-at.js';
import { monthlyInvoiceLines, type MonthlyInvoiceInput } from './invoice-calc.js';
import { electricLines } from './tiers.js';

export interface SettlementLine { kind: LineKind; label: string; quantity: number; unitPrice: number; amount: number; meta?: Record<string, unknown> }

export interface SettlementInput {
  periods: readonly ContractPeriod[];
  endDate: Date;
  moveOutDate: Date;
  rent: number;
  deposit: number; // BIL-17, Q-P4-40: deposit actually paid on the renewal chain
  unbilledPeriodNos: readonly number[]; // periods ≤ j with no issued MONTHLY invoice (Q-P4-36)
  waterMode: 'PER_M3' | 'PER_PERSON';
  rates: RatesAt; // effective at period j's start (Q-P4-39)
  services: MonthlyInvoiceInput['services'];
  occupants: MonthlyInvoiceInput['occupants'];
  vehicles: MonthlyInvoiceInput['vehicles'];
  electricKwh: number; // from the last issued closing reading to the final reading
  waterM3: number; // same span; ignored for PER_PERSON (MTR-06)
  previousDebt: readonly { invoiceId: number; total: number }[]; // BIL-16 / Q-P4-41, never DEPOSIT
  damages: number;
  depositForfeit: number;
}

export interface SettlementAmounts {
  periodNo: number;
  lastPeriodAmount: number;
  remainingRent: number;
  previousDebt: number;
  deposit: number;
  damages: number;
  depositForfeit: number;
  net: number;
  // Every charge in BIL-18 order; DEPOSIT_OFFSET last. They become the FINAL invoice when net < 0 (sum = −net).
  lines: SettlementLine[];
}

const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const line = (kind: LineKind, label: string, quantity: number, unitPrice: number, meta?: Record<string, unknown>): SettlementLine =>
  ({ kind, label, quantity, unitPrice, amount: quantity * unitPrice, ...(meta ? { meta } : {}) });
const sum = (lines: readonly SettlementLine[]) => lines.reduce((s, l) => s + l.amount, 0);

// BIL-13: j = the period containing moveOutDate; N when moving out on or after end_date.
export function settlementPeriod(periods: readonly ContractPeriod[], endDate: Date, moveOutDate: Date): ContractPeriod | null {
  return compareDates(moveOutDate, endDate) >= 0 ? periods[periods.length - 1] ?? null : periodContaining(periods, moveOutDate);
}

// BIL-13..18 (Q-P4-36..39, Q-P4-45). Pure: no I/O, no clock.
export function settlementAmounts(input: SettlementInput): SettlementAmounts {
  const { periods } = input;
  const j = settlementPeriod(periods, input.endDate, input.moveOutDate);
  if (!j) throw new RangeError('moveOutDate is before the contract start');

  // BIL-14: rent, services and parking of every unissued period ≤ j in full (A-01, Q-P4-38), PER_PERSON water per period
  // (D-44 (13)); electricity and PER_M3 water once over the whole unbilled span (Q-P4-39).
  const fixed: SettlementLine[] = [];
  for (const periodNo of [...input.unbilledPeriodNos].sort((a, b) => a - b)) {
    const period = periods.find(p => p.periodNo === periodNo);
    if (!period || period.periodNo > j.periodNo) throw new RangeError(`period ${periodNo} is not an unbilled period ≤ j`);
    const { lines } = monthlyInvoiceLines({ period, rent: input.rent, waterMode: input.waterMode, rates: input.rates,
      services: input.services, occupants: input.occupants, vehicles: input.vehicles, electricKwh: 0, waterM3: 0 });
    fixed.push(...lines.filter(l => l.kind !== 'ELECTRIC' && !(l.kind === 'WATER' && input.waterMode === 'PER_M3'))
      .map(l => ({ ...l, meta: { ...l.meta, periodNo } })));
  }
  if (!input.rates.electric || !input.rates.water) throw new ConflictException(ErrorCode.RATE_PLAN_MISSING); // RATE-04
  const utilities: SettlementLine[] = electricLines(input.electricKwh, input.rates.electric.tiers);
  if (input.waterMode === 'PER_M3') {
    if (!Number.isSafeInteger(input.waterM3) || input.waterM3 < 0) throw new RangeError('waterM3 must be a nonnegative integer');
    utilities.push(line('WATER', `Nước (${input.waterM3} m³)`, input.waterM3, input.rates.water.tiers[0].unitPrice));
  }
  const lastPeriodLines = [...fixed, ...utilities];

  // BIL-15 / Q-P4-37: rent of every period after j, a partial one prorated once.
  const remaining = compareDates(input.moveOutDate, input.endDate) < 0 ? periods.filter(p => p.periodNo > j.periodNo) : [];
  const remainingLines = remaining.map(p => line('REMAINING_RENT', `Tiền phòng còn lại ${ddmm(p.periodStart)}–${ddmm(p.periodEnd)}`, 1,
    p.isPartial ? proratedAmount(input.rent, p.periodStart, p.periodEnd) : input.rent, { periodNo: p.periodNo }));
  const debtLines = input.previousDebt.map(d => line('PREVIOUS_DEBT', `Nợ hóa đơn TT${d.invoiceId}`, 1, d.total, { invoiceId: d.invoiceId }));
  const extra = [
    ...(input.damages > 0 ? [line('DAMAGE', 'Hư hỏng, mất mát', 1, input.damages)] : []),
    ...(input.depositForfeit > 0 ? [line('DEPOSIT_FORFEIT', 'Cọc giữ lại', 1, input.depositForfeit)] : []),
    ...(input.deposit > 0 ? [line('DEPOSIT_OFFSET', 'Trừ tiền cọc', 1, -input.deposit)] : []),
  ];

  const lastPeriodAmount = sum(lastPeriodLines);
  const remainingRent = sum(remainingLines);
  const previousDebt = sum(debtLines);
  // BIL-17, exactly as CHECK settlements_net.
  const net = input.deposit - lastPeriodAmount - remainingRent - previousDebt - input.damages - input.depositForfeit;
  const lines = [...lastPeriodLines, ...remainingLines, ...debtLines, ...extra];
  if (sum(lines) !== -net) throw new RangeError('settlement lines do not add up to −net'); // never write a wrong FINAL
  return { periodNo: j.periodNo, lastPeriodAmount, remainingRent, previousDebt, deposit: input.deposit,
    damages: input.damages, depositForfeit: input.depositForfeit, net, lines };
}
