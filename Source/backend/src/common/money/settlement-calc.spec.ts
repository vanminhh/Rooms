import { describe, expect, it } from 'vitest';
import { contractEndDate, contractPeriods } from '../date/period.js';
import type { RatesAt } from '../rates/rates-at.js';
import { settlementAmounts, type SettlementInput } from './settlement-calc.js';

// BIL-13..18 with the 16-billing examples. Prices: the BIL-09 seed (electric 50 × 3.000, 51–100 × 3.500, 101+ × 4.000;
// water 15.000/m³; Wifi ROOM 100.000, Rác PERSON 30.000, motorbike 100.000), rent 2.500.000, deposit 2.500.000.
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tier = (tierNo: number, unitPrice: number, upTo: number | null = null) => ({ tierNo, upTo, unitPrice });
const rate = (tiers: ReturnType<typeof tier>[]) => ({ id: 1, effectiveFrom: d('2026-01-01'), tiers });
const rates: RatesAt = {
  electric: rate([tier(1, 3_000, 50), tier(2, 3_500, 100), tier(3, 4_000)]),
  water: rate([tier(1, 15_000)]),
  services: new Map([[1, rate([tier(1, 100_000)])], [2, rate([tier(1, 30_000)])], [3, rate([tier(1, 100_000)])]]),
};
const services = [{ id: 1, name: 'Wifi', unit: 'ROOM' as const }, { id: 2, name: 'Rác', unit: 'PERSON' as const }, { id: 3, name: 'Xe máy', unit: 'VEHICLE' as const }];

function input(start: string, extra: Partial<SettlementInput>): SettlementInput {
  const startDate = d(start);
  return {
    periods: contractPeriods(startDate, 6), endDate: contractEndDate(startDate, 6), moveOutDate: startDate, rent: 2_500_000, deposit: 2_500_000,
    unbilledPeriodNos: [], waterMode: 'PER_M3', rates, services,
    occupants: [{ moveInDate: startDate, moveOutDate: null }, { moveInDate: startDate, moveOutDate: null }],
    vehicles: [{ serviceId: 3, registeredAt: startDate, removedAt: null }],
    electricKwh: 0, waterM3: 0, previousDebt: [], damages: 0, depositForfeit: 0, ...extra,
  };
}

describe('BIL-13..18 settlement amounts', () => {
  it('BIL-18 early move-out: BIL-01 contract out on 25/11/2026 → j = 3, remaining rent 3 × 2.500.000, FINAL = −net', () => {
    const r = settlementAmounts(input('2026-09-01', { moveOutDate: d('2026-11-25'), unbilledPeriodNos: [3], electricKwh: 40, waterM3: 4 }));
    expect(r.periodNo).toBe(3);
    // BIL-14 / A-01: period 3 rent + services + parking in full, utilities 40 kWh × 3.000 and 4 m³ × 15.000.
    expect(r.lastPeriodAmount).toBe(2_500_000 + 100_000 + 2 * 30_000 + 100_000 + 120_000 + 60_000);
    expect(r.remainingRent).toBe(7_500_000);
    expect(r.net).toBe(2_500_000 - 2_940_000 - 7_500_000);
    expect(r.lines.map(l => [l.kind, l.label, l.amount])).toEqual([
      ['RENT', 'Tiền phòng 01/11–30/11', 2_500_000], ['SERVICE', 'Wifi', 100_000], ['SERVICE', 'Rác', 60_000], ['PARKING', 'Xe máy', 100_000],
      ['ELECTRIC', 'Điện bậc 1 (0–50 kWh)', 120_000], ['WATER', 'Nước (4 m³)', 60_000],
      ['REMAINING_RENT', 'Tiền phòng còn lại 01/12–31/12', 2_500_000], ['REMAINING_RENT', 'Tiền phòng còn lại 01/01–31/01', 2_500_000],
      ['REMAINING_RENT', 'Tiền phòng còn lại 01/02–28/02', 2_500_000], ['DEPOSIT_OFFSET', 'Trừ tiền cọc', -2_500_000],
    ]);
    expect(r.lines.reduce((s, l) => s + l.amount, 0)).toBe(-r.net);
  });

  it('BIL-14 after end_date: period N already issued, settled 10 days later → only the utilities of those days, refund', () => {
    const r = settlementAmounts(input('2026-09-01', { moveOutDate: d('2027-03-10'), electricKwh: 30, waterM3: 2 }));
    expect(r).toMatchObject({ periodNo: 6, lastPeriodAmount: 90_000 + 30_000, remainingRent: 0, net: 2_500_000 - 120_000 });
    expect(r.lines.map(l => l.kind)).toEqual(['ELECTRIC', 'WATER', 'DEPOSIT_OFFSET']);
  });

  it('BIL-15, BIL-22, Q-P4-37: a partial last period is prorated once (01/09–19/09 of 2.500.000 = 1.583.333)', () => {
    const r = settlementAmounts(input('2027-03-20', { moveOutDate: d('2027-04-10'), unbilledPeriodNos: [2] }));
    expect(r.periodNo).toBe(2);
    expect(r.lines.filter(l => l.kind === 'REMAINING_RENT').map(l => l.amount)).toEqual([2_500_000, 2_500_000, 2_500_000, 2_500_000, 1_583_333]);
    expect(r.remainingRent).toBe(11_583_333);
  });

  it('BIL-22, D-41: an unbilled partial first period keeps the prorated rent (20/03–31/03 = 967.742)', () => {
    const r = settlementAmounts(input('2027-03-20', { moveOutDate: d('2027-03-25'), unbilledPeriodNos: [1] }));
    expect(r.lines.find(l => l.kind === 'RENT')?.amount).toBe(967_742);
  });

  it('Q-P4-36: every unissued period ≤ j is charged (a DRAFT left for period 2 and period 3)', () => {
    const r = settlementAmounts(input('2026-09-01', { moveOutDate: d('2026-11-25'), unbilledPeriodNos: [3, 2] }));
    expect(r.lines.filter(l => l.kind === 'RENT').map(l => l.label)).toEqual(['Tiền phòng 01/10–31/10', 'Tiền phòng 01/11–30/11']);
  });

  it('Q-P4-38, D-44 (13): PER_PERSON water is people × the full price per unbilled period, no m³ line', () => {
    const r = settlementAmounts(input('2026-09-01', { moveOutDate: d('2026-11-25'), unbilledPeriodNos: [3], waterMode: 'PER_PERSON', waterM3: 99 }));
    expect(r.lines.filter(l => l.kind === 'WATER').map(l => [l.label, l.amount])).toEqual([['Nước (2 người)', 30_000]]);
  });

  it('BIL-16, BIL-18, Q-P4-45: previous debt, damages and the kept deposit are their own lines', () => {
    const r = settlementAmounts(input('2026-09-01', { moveOutDate: d('2027-03-10'), previousDebt: [{ invoiceId: 7, total: 3_119_000 }], damages: 200_000, depositForfeit: 500_000 }));
    expect(r.lines.slice(2).map(l => [l.kind, l.label, l.amount])).toEqual([
      ['PREVIOUS_DEBT', 'Nợ hóa đơn TT7', 3_119_000], ['DAMAGE', 'Hư hỏng, mất mát', 200_000], ['DEPOSIT_FORFEIT', 'Cọc giữ lại', 500_000],
      ['DEPOSIT_OFFSET', 'Trừ tiền cọc', -2_500_000]]);
    expect(r).toMatchObject({ previousDebt: 3_119_000, net: 2_500_000 - 0 - 3_119_000 - 200_000 - 500_000 });
  });

  it('BIL-17: no deposit paid → no DEPOSIT_OFFSET line', () => {
    expect(settlementAmounts(input('2026-09-01', { moveOutDate: d('2027-03-10'), deposit: 0 })).lines.map(l => l.kind)).toEqual(['ELECTRIC', 'WATER']);
  });
});
