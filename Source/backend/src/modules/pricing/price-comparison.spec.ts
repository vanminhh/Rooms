import { describe, expect, it } from 'vitest';
import { NEW_PRICE_LABEL, electricComparison, percentChange, priceChange, ratePlanComparison } from './price-comparison.js';
import type { RateTierView } from './pricing.types.js';

// CP-6 · BE-P2-27 · PRC-12, Q-P5-2 A.
// The unit under test is the pure price-comparison module itself; nothing is mocked here,
// there is no DB edge to mock (percentChange/priceChange/electricComparison/ratePlanComparison
// are plain functions of their arguments).

describe('PRC-12: percentChange — (new - old) / old * 100, rounded half away from zero to 1 decimal', () => {
  it('PRC-12: a simple 5% increase (1.000.000 -> 1.050.000) is +5.0', () => {
    expect(percentChange(1_000_000, 1_050_000)).toBe(5);
  });

  it('PRC-12: a simple 5% decrease (1.000.000 -> 950.000) is -5.0', () => {
    expect(percentChange(1_000_000, 950_000)).toBe(-5);
  });

  it('PRC-12, Q-P5-2 A: old = 0 returns null (no percent is shown, not Infinity/NaN)', () => {
    expect(percentChange(0, 500_000)).toBeNull();
  });

  it('PRC-12: no change (old === new) is 0, not null and not -0 displayed as negative', () => {
    expect(percentChange(2_000_000, 2_000_000)).toBe(0);
  });

  it('PRC-12: rounding boundary — 16 -> 17 is a true half (6.25%) and must round UP to 6.3, never truncate to 6.2', () => {
    // |17-16|/16*100 = 6.25 exactly; half-away-from-zero rounding to 1 decimal -> 6.3.
    // A naive Math.floor(...*10)/10 would wrongly give 6.2, which this test would catch.
    expect(percentChange(16, 17)).toBe(6.3);
  });

  it('PRC-12: rounding boundary on the decrease side — 16 -> 15 is -6.25%, rounds to -6.3', () => {
    expect(percentChange(16, 15)).toBe(-6.3);
  });

  it('PRC-12: an exact tenth (200.000 -> 203.000, 1.5%) needs no rounding and stays exact', () => {
    expect(percentChange(200_000, 203_000)).toBe(1.5);
  });

  it('PRC-12: result granularity is always a multiple of 0.1 (1 decimal place)', () => {
    const result = percentChange(3_000_000, 3_217_777)!;
    expect(Math.round(result * 10)).toBe(result * 10);
  });
});

describe('PRC-12, Q-P5-2 A: priceChange — room/water/service single-value comparison', () => {
  it('PRC-12: no prior approved value (oldValue null) -> label "Giá mới", no changePercent', () => {
    expect(priceChange(null, 500_000)).toEqual({
      oldValue: null,
      newValue: 500_000,
      changePercent: null,
      label: NEW_PRICE_LABEL,
    });
  });

  it('Q-P5-2 A: old price is 0 -> changePercent null, label null (shown as "0 -> giá mới" using the numeric 0, not the "Giá mới" label)', () => {
    expect(priceChange(0, 500_000)).toEqual({
      oldValue: 0,
      newValue: 500_000,
      changePercent: null,
      label: null,
    });
  });

  it('PRC-12: a normal old -> new change carries oldValue, newValue and changePercent, no label', () => {
    expect(priceChange(1_000_000, 1_050_000)).toEqual({
      oldValue: 1_000_000,
      newValue: 1_050_000,
      changePercent: 5,
      label: null,
    });
  });
});

describe('PRC-12: electricComparison — per-tier table, tierChanges only when tier counts match', () => {
  const oldTiers: RateTierView[] = [
    { tierNo: 1, upTo: 100, unitPrice: 1_800 },
    { tierNo: 2, upTo: null, unitPrice: 2_500 },
  ];
  const newTiersSameCount: RateTierView[] = [
    { tierNo: 1, upTo: 100, unitPrice: 2_000 },
    { tierNo: 2, upTo: null, unitPrice: 2_750 },
  ];
  const newTiersDifferentCount: RateTierView[] = [
    { tierNo: 1, upTo: 50, unitPrice: 1_900 },
    { tierNo: 2, upTo: 150, unitPrice: 2_400 },
    { tierNo: 3, upTo: null, unitPrice: 3_000 },
  ];

  it('PRC-12: same tier count -> tierChanges has one entry per tier with its own changePercent', () => {
    const result = electricComparison(oldTiers, newTiersSameCount);
    expect(result.label).toBeNull();
    expect(result.tierChanges).toEqual([
      { tierNo: 1, oldValue: 1_800, newValue: 2_000, changePercent: percentChange(1_800, 2_000) },
      { tierNo: 2, oldValue: 2_500, newValue: 2_750, changePercent: percentChange(2_500, 2_750) },
    ]);
  });

  it('PRC-12: different tier count -> both tables are returned but tierChanges is null (no per-tier % across a reshaped plan)', () => {
    const result = electricComparison(oldTiers, newTiersDifferentCount);
    expect(result.tierChanges).toBeNull();
    expect(result.oldTiers).toEqual(oldTiers);
    expect(result.newTiers).toEqual(newTiersDifferentCount);
    expect(result.label).toBeNull();
  });

  it('PRC-12: no old tiers (null) -> label "Giá mới", tierChanges null', () => {
    const result = electricComparison(null, newTiersSameCount);
    expect(result).toEqual({ oldTiers: null, newTiers: newTiersSameCount, tierChanges: null, label: NEW_PRICE_LABEL });
  });
});

describe('PRC-12: ratePlanComparison — dispatches by kind, never crashes on empty tiers', () => {
  it('CP-6 ghi chú coder: newTiers rỗng (ELECTRIC) -> comparison null, no crash', () => {
    expect(ratePlanComparison('ELECTRIC', null, [])).toBeNull();
  });

  it('CP-6 ghi chú coder: newTiers rỗng (WATER) -> comparison null, no crash', () => {
    expect(ratePlanComparison('WATER', [{ tierNo: 1, upTo: null, unitPrice: 20_000 }], [])).toBeNull();
  });

  it('CP-6 ghi chú coder: newTiers rỗng (SERVICE) -> comparison null, no crash', () => {
    expect(ratePlanComparison('SERVICE', [], [])).toBeNull();
  });

  it('PRC-12: ELECTRIC with matching tier counts returns a TierComparison with tierChanges', () => {
    const result = ratePlanComparison(
      'ELECTRIC',
      [{ tierNo: 1, upTo: 100, unitPrice: 1_800 }],
      [{ tierNo: 1, upTo: 100, unitPrice: 1_980 }],
    );
    expect(result).toMatchObject({ tierChanges: [{ tierNo: 1, oldValue: 1_800, newValue: 1_980, changePercent: 10 }] });
  });

  it('PRC-12: WATER uses the single tier unitPrice as a PriceChange, not a TierComparison', () => {
    const result = ratePlanComparison(
      'WATER',
      [{ tierNo: 1, upTo: null, unitPrice: 20_000 }],
      [{ tierNo: 1, upTo: null, unitPrice: 22_000 }],
    );
    expect(result).toEqual({ oldValue: 20_000, newValue: 22_000, changePercent: 10, label: null });
  });

  it('PRC-12: SERVICE uses the single tier unitPrice as a PriceChange', () => {
    const result = ratePlanComparison(
      'SERVICE',
      [{ tierNo: 1, upTo: null, unitPrice: 50_000 }],
      [{ tierNo: 1, upTo: null, unitPrice: 45_000 }],
    );
    expect(result).toEqual({ oldValue: 50_000, newValue: 45_000, changePercent: -10, label: null });
  });

  it('PRC-12: an empty old tiers array (not null) counts as no old value -> label "Giá mới", same as null', () => {
    const result = ratePlanComparison('WATER', [], [{ tierNo: 1, upTo: null, unitPrice: 20_000 }]);
    expect(result).toEqual({ oldValue: null, newValue: 20_000, changePercent: null, label: NEW_PRICE_LABEL });
  });
});
