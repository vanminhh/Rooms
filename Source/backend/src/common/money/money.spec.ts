import { describe, expect, it } from 'vitest';
import { contractPeriods } from '../date/period.js';
import type { RatesAt, RateView } from '../rates/rates-at.js';
import { consumption, isAbnormal } from './consumption.js';
import { monthlyInvoiceLines, occupantCount, vehicleCount } from './invoice-calc.js';
import { electricLines } from './tiers.js';

// Phase 4 · P4-1 (BE-P4-02..04). Expected values come from docs/spec (12-pricing seed tiers and examples, 15-meters
// acceptance, 16-billing BIL-09 and BIL-22, D-41 with A-21, Q-P3-18, Q-P3-20), worked by hand, not from the code.

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const SEED_TIERS = [{ tierNo: 1, upTo: 50, unitPrice: 3_000 }, { tierNo: 2, upTo: 100, unitPrice: 3_500 }, { tierNo: 3, upTo: null, unitPrice: 4_000 }];
const plan = (kind: RateView['kind'], unitPrice: number | typeof SEED_TIERS, serviceId: number | null = null): RateView => ({
  ratePlanId: 1, kind, serviceId, effectiveFrom: d('2026-09-01'), reviewedAt: null,
  tiers: typeof unitPrice === 'number' ? [{ tierNo: 1, upTo: null, unitPrice }] : unitPrice,
});
const WIFI = { id: 1, name: 'Wifi', unit: 'ROOM' as const };
const RAC = { id: 2, name: 'Rác', unit: 'PERSON' as const };
const XE = { id: 3, name: 'Gửi xe máy', unit: 'VEHICLE' as const };
const seedRates = (): RatesAt => ({
  electric: plan('ELECTRIC', SEED_TIERS),
  water: plan('WATER', 15_000),
  services: new Map([[1, plan('SERVICE', 100_000, 1)], [2, plan('SERVICE', 30_000, 2)], [3, plan('SERVICE', 100_000, 3)]]),
});

describe('12-pricing: electric tier calculation', () => {
  it('12-pricing: 84 kWh -> 50 x 3.000 + 34 x 3.500 = 269.000 in two lines', () => {
    const lines = electricLines(84, SEED_TIERS);
    expect(lines.map((l) => [l.label, l.quantity, l.unitPrice, l.amount])).toEqual([
      ['Điện bậc 1 (0–50 kWh)', 50, 3_000, 150_000],
      ['Điện bậc 2 (51–100 kWh)', 34, 3_500, 119_000],
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(269_000);
  });

  it('12-pricing: 0 kWh -> exactly one line "Điện (0 kWh)", quantity 0, the tier-1 price, amount 0', () => {
    expect(electricLines(0, SEED_TIERS)).toEqual([{ kind: 'ELECTRIC', label: 'Điện (0 kWh)', quantity: 0, unitPrice: 3_000, amount: 0 }]);
  });

  it('12-pricing: 120 kWh reaches the open last tier; tiers are taken in tier_no order whatever the input order', () => {
    const lines = electricLines(120, [SEED_TIERS[2], SEED_TIERS[0], SEED_TIERS[1]]);
    expect(lines.map((l) => [l.label, l.quantity, l.amount])).toEqual([
      ['Điện bậc 1 (0–50 kWh)', 50, 150_000], ['Điện bậc 2 (51–100 kWh)', 50, 175_000], ['Điện bậc 3 (101+ kWh)', 20, 80_000],
    ]);
  });

  it('12-pricing: exactly on a tier boundary (50, 100 kWh) adds no empty line for the next tier', () => {
    expect(electricLines(50, SEED_TIERS).map((l) => [l.quantity, l.amount])).toEqual([[50, 150_000]]);
    expect(electricLines(100, SEED_TIERS).map((l) => [l.quantity, l.amount])).toEqual([[50, 150_000], [50, 175_000]]);
  });

  it('12-pricing: the last tier must be open (up_to null); usage past a closed last tier is refused', () => {
    expect(() => electricLines(120, SEED_TIERS.slice(0, 2))).toThrow(RangeError);
  });
});

describe('MTR-05: consumption between readings', () => {
  const r = (value: number, isMeterReplaced = false, oldMeterFinal: number | null = null) => ({ value, isMeterReplaced, oldMeterFinal });

  it('BIL-09: electric 1.284 -> 1.368 is 84 kWh', () => {
    expect(consumption([r(1_284), r(1_368)])).toBe(84);
  });

  it('MTR-04/05: replacement on 20/09 (old final 1.300, new start 0), opening 1.284, closing 40 -> 16 + 40 = 56 kWh', () => {
    expect(consumption([r(1_284), r(0, true, 1_300), r(40)])).toBe(56);
  });

  it('MTR-02: the new tenant counts from their own opening 1.290 to 1.350 = 60 kWh; the 6 kWh after 1.284 is nobody\'s', () => {
    expect(consumption([r(1_290), r(1_350)])).toBe(60);
  });

  it('MTR-03: a lower reading without replacement, or fewer than two readings, is refused', () => {
    expect(() => consumption([r(1_284), r(1_250)])).toThrow(RangeError);
    expect(() => consumption([r(1_284)])).toThrow(RangeError);
    expect(() => consumption([r(1_284), r(0, true, null)])).toThrow(RangeError);
  });

  it('MTR-08, D-44: abnormal only above twice the average of the last 3 periods; fewer than 3 periods -> no check', () => {
    expect(isAbnormal(1_000, [10, 10])).toBe(false);
    expect(isAbnormal(120, [60, 60, 60])).toBe(false); // exactly 2x is not above
    expect(isAbnormal(121, [60, 60, 60])).toBe(true);
    expect(isAbnormal(121, [999, 60, 60, 60])).toBe(true); // only the last 3 count
  });
});

describe('BIL-07: monthly invoice lines', () => {
  const bil01 = contractPeriods(d('2026-09-01'), 6);
  const base = {
    rent: 2_500_000, waterMode: 'PER_M3' as const, rates: seedRates(), services: [WIFI, RAC, XE],
    occupants: [{ moveInDate: d('2026-09-01'), moveOutDate: null }, { moveInDate: d('2026-09-01'), moveOutDate: null }],
    vehicles: [{ serviceId: 3, registeredAt: d('2026-09-01'), removedAt: null }],
    electricKwh: 84, waterM3: 6,
  };

  it('BIL-09: the worked example is 3.119.000 đ with exactly the 7 listed lines', () => {
    const { lines, total } = monthlyInvoiceLines({ ...base, period: bil01[0] });
    expect(lines.map((l) => [l.kind, l.label, l.quantity, l.unitPrice, l.amount])).toEqual([
      ['RENT', 'Tiền phòng 01/09–30/09', 1, 2_500_000, 2_500_000],
      ['ELECTRIC', 'Điện bậc 1 (0–50 kWh)', 50, 3_000, 150_000],
      ['ELECTRIC', 'Điện bậc 2 (51–100 kWh)', 34, 3_500, 119_000],
      ['WATER', 'Nước (6 m³)', 6, 15_000, 90_000],
      ['SERVICE', 'Wifi', 1, 100_000, 100_000],
      ['SERVICE', 'Rác', 2, 30_000, 60_000],
      ['PARKING', 'Gửi xe máy', 1, 100_000, 100_000],
    ]);
    expect(total).toBe(3_119_000);
  });

  it('BIL-22, D-41, A-21: move-in 20/03 -> 12/31 of rent and of every fixed service, rounded half up once per line', () => {
    const p1 = contractPeriods(d('2027-03-20'), 6)[0];
    const { lines } = monthlyInvoiceLines({ ...base, period: p1, occupants: [{ moveInDate: d('2027-03-20'), moveOutDate: null }, { moveInDate: d('2027-03-20'), moveOutDate: null }],
      vehicles: [{ serviceId: 3, registeredAt: d('2027-03-20'), removedAt: null }] });
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, [l.quantity, l.unitPrice, l.amount]]));
    expect(byLabel['Tiền phòng 20/03–31/03']).toEqual([1, 967_742, 967_742]); // 2.500.000 × 12 / 31 = 967.741,9
    expect(byLabel['Wifi']).toEqual([1, 38_710, 38_710]); // 100.000 × 12 / 31 = 38.709,7
    expect(byLabel['Rác']).toEqual([2, 11_613, 23_226]); // 30.000 × 12 / 31 = 11.612,9, quantity kept
    expect(byLabel['Gửi xe máy']).toEqual([1, 38_710, 38_710]);
    expect(byLabel['Nước (6 m³)']).toEqual([6, 15_000, 90_000]); // metered: not prorated
  });

  it('BIL-22: the last partial period 01/09–19/09 bills 19/30 of the rent = 1.583.333', () => {
    const last = contractPeriods(d('2027-03-20'), 6).at(-1)!;
    const rent = monthlyInvoiceLines({ ...base, period: last }).lines[0];
    expect([rent.label, rent.amount]).toEqual(['Tiền phòng 01/09–19/09', 1_583_333]);
  });

  it('MTR-06: PER_PERSON water bills occupants, not the m³ reading', () => {
    const water = monthlyInvoiceLines({ ...base, period: bil01[0], waterMode: 'PER_PERSON', waterM3: null }).lines.find((l) => l.kind === 'WATER')!;
    expect([water.label, water.quantity, water.amount]).toEqual(['Nước (2 người)', 2, 30_000]);
  });

  it('D-44 (13), Q-P4-13: PER_PERSON water in a partial month is not prorated: 2 people × 15.000 = 30.000', () => {
    const p1 = contractPeriods(d('2027-03-20'), 6)[0];
    const water = monthlyInvoiceLines({ ...base, period: p1, waterMode: 'PER_PERSON', waterM3: null,
      occupants: [{ moveInDate: d('2027-03-20'), moveOutDate: null }, { moveInDate: d('2027-03-20'), moveOutDate: null }] })
      .lines.find((l) => l.kind === 'WATER')!;
    expect([water.quantity, water.unitPrice, water.amount]).toEqual([2, 15_000, 30_000]);
  });

  it('RATE-04: a missing electric, water or chosen-service rate -> RATE_PLAN_MISSING', () => {
    const rates = seedRates();
    for (const broken of [{ ...rates, electric: null }, { ...rates, water: null }, { ...rates, services: new Map([[1, rates.services.get(1)!]]) }]) {
      expect(() => monthlyInvoiceLines({ ...base, period: bil01[0], rates: broken })).toThrow('RATE_PLAN_MISSING');
    }
  });

  it('MTR-05: PER_M3 water without a valid nonnegative integer consumption is refused', () => {
    for (const waterM3 of [null, -1, 1.5]) {
      expect(() => monthlyInvoiceLines({ ...base, period: bil01[0], waterM3 })).toThrow(RangeError);
    }
  });

  it('Q-P3-20: no vehicle in the month -> no parking line', () => {
    const lines = monthlyInvoiceLines({ ...base, period: bil01[0], vehicles: [] }).lines;
    expect(lines.some((l) => l.kind === 'PARKING')).toBe(false);
  });
});

describe('Q-P3-18 / Q-P3-20: who and what is counted in a month', () => {
  const november = contractPeriods(d('2026-11-01'), 3)[0]; // 01/11–30/11

  it('Q-P3-18: a person moving in on 16/11 or 29/11, or moving in and out within November, counts once', () => {
    expect(occupantCount(november, [{ moveInDate: d('2026-11-16'), moveOutDate: null }])).toBe(1);
    expect(occupantCount(november, [{ moveInDate: d('2026-11-29'), moveOutDate: null }])).toBe(1);
    expect(occupantCount(november, [{ moveInDate: d('2026-11-05'), moveOutDate: d('2026-11-20') }])).toBe(1);
  });

  it('Q-P3-18: a person present before 01/11 counts while move_out_date is null or after 01/11; later move-ins do not count', () => {
    expect(occupantCount(november, [{ moveInDate: d('2026-10-01'), moveOutDate: d('2026-11-01') }])).toBe(0);
    expect(occupantCount(november, [{ moveInDate: d('2026-10-01'), moveOutDate: d('2026-11-02') }])).toBe(1);
    expect(occupantCount(november, [{ moveInDate: d('2026-12-01'), moveOutDate: null }])).toBe(0);
  });

  it('Q-P3-20: stopped on 15/11 still pays November; stopped by 31/10 does not; registered in December does not', () => {
    const v = (registeredAt: string, removedAt: string | null) => ({ serviceId: 3, registeredAt: d(registeredAt), removedAt: removedAt ? d(removedAt) : null });
    expect(vehicleCount(november, 3, [v('2026-10-01', '2026-11-15')])).toBe(1);
    expect(vehicleCount(november, 3, [v('2026-10-01', '2026-10-31')])).toBe(0);
    expect(vehicleCount(november, 3, [v('2026-12-01', null)])).toBe(0);
    expect(vehicleCount(november, 4, [v('2026-10-01', null)])).toBe(0); // another service's vehicle
  });
});
