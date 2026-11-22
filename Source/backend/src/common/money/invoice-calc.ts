import { ConflictException } from '@nestjs/common';
import { type ContractPeriod, proratedAmount } from '../date/period.js';
import { compareDates, toDateOnly } from '../date/today.js';
import { ErrorCode } from '../errors/error-code.js';
import type { RatesAt } from '../rates/rates-at.js';
import { electricLines, type MoneyLine } from './tiers.js';

export interface InvoiceService {
  id: number;
  name: string;
  unit: 'ROOM' | 'PERSON' | 'VEHICLE';
}

export interface MonthlyInvoiceInput {
  period: ContractPeriod;
  rent: number;
  waterMode: 'PER_M3' | 'PER_PERSON';
  rates: RatesAt; // approved plans effective at period_start (RATE-04, D-09)
  // The contract's chosen ROOM/PERSON services, plus the VEHICLE services its vehicles are registered under.
  services: readonly InvoiceService[];
  occupants: readonly { moveInDate: Date; moveOutDate: Date | null }[];
  vehicles: readonly { serviceId: number; registeredAt: Date; removedAt: Date | null }[];
  electricKwh: number; // MTR-05 over the period
  waterM3: number | null; // MTR-05 over the period; ignored when PER_PERSON (MTR-06)
}

const missing = () => new ConflictException(ErrorCode.RATE_PLAN_MISSING);
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// Q-P3-18: a person who moves in during the period counts once (also if they leave in the same month); a person present
// before period_start counts while move_out_date is null or after period_start.
export function occupantCount(period: ContractPeriod, occupants: MonthlyInvoiceInput['occupants']): number {
  return occupants.filter((o) => {
    const inDay = toDateOnly(o.moveInDate);
    if (compareDates(inDay, period.periodEnd) > 0) return false;
    if (compareDates(inDay, period.periodStart) >= 0) return true;
    return o.moveOutDate === null || compareDates(toDateOnly(o.moveOutDate), period.periodStart) > 0;
  }).length;
}

// Q-P3-20: a registration that intersects the month is charged for that month, also if it was stopped before month-end.
export function vehicleCount(period: ContractPeriod, serviceId: number, vehicles: MonthlyInvoiceInput['vehicles']): number {
  return vehicles.filter((v) => v.serviceId === serviceId
    && compareDates(toDateOnly(v.registeredAt), period.periodEnd) <= 0
    && (v.removedAt === null || compareDates(toDateOnly(v.removedAt), period.periodStart) >= 0)).length;
}

// BIL-07, D-41, A-21: every fixed line (rent, ROOM, PERSON, VEHICLE) keeps its quantity and uses the prorated unit price
// in a partial month, rounded once per line; electricity and water follow the readings. total = sum of amounts.
export function monthlyInvoiceLines(input: MonthlyInvoiceInput): { lines: MoneyLine[]; total: number } {
  const { period } = input;
  const fixed = (price: number) => (period.isPartial ? proratedAmount(price, period.periodStart, period.periodEnd) : price);
  const line = (kind: MoneyLine['kind'], label: string, quantity: number, unitPrice: number, meta?: Record<string, unknown>): MoneyLine =>
    ({ kind, label, quantity, unitPrice, amount: quantity * unitPrice, ...(meta ? { meta } : {}) });

  if (!input.rates.electric || !input.rates.water) throw missing();
  const lines: MoneyLine[] = [line('RENT', `Tiền phòng ${ddmm(period.periodStart)}–${ddmm(period.periodEnd)}`, 1, fixed(input.rent))];
  lines.push(...electricLines(input.electricKwh, input.rates.electric.tiers));

  const occupants = occupantCount(period, input.occupants);
  const waterPrice = input.rates.water.tiers[0].unitPrice;
  if (input.waterMode === 'PER_M3') {
    if (input.waterM3 === null || !Number.isSafeInteger(input.waterM3) || input.waterM3 < 0) {
      throw new RangeError('PER_M3 water needs a nonnegative integer period consumption');
    }
    lines.push(line('WATER', `Nước (${input.waterM3} m³)`, input.waterM3, waterPrice));
  } else {
    // D-44 (13): PER_PERSON water is never prorated, also in a partial month.
    lines.push(line('WATER', `Nước (${occupants} người)`, occupants, waterPrice));
  }

  for (const service of input.services) {
    const rate = input.rates.services.get(service.id);
    if (!rate) throw missing();
    const unitPrice = fixed(rate.tiers[0].unitPrice);
    if (service.unit === 'ROOM') lines.push(line('SERVICE', service.name, 1, unitPrice, { serviceId: service.id }));
    else if (service.unit === 'PERSON') lines.push(line('SERVICE', service.name, occupants, unitPrice, { serviceId: service.id }));
    else {
      const count = vehicleCount(period, service.id, input.vehicles);
      if (count > 0) lines.push(line('PARKING', service.name, count, unitPrice, { serviceId: service.id }));
    }
  }
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}
